(function(){
  "use strict";
  var POSTS=[], BYID={}, FILTERED=[], TOTAL="0";
  var tab="reader";
  var galleryItems=[], galleryShown=0, GAL_PAGE=120;
  var listStale=true, galleryStale=true, renderedPostId=null;

  var $=function(s){return document.querySelector(s)};
  var listEl=$("#list"), viewerEl=$("#viewer"), gridEl=$("#grid"),
      searchEl=$("#search"), yearEl=$("#year"), sortEl=$("#sort"),
      countEl=$("#count"), sentinelEl=$("#sentinel"),
      backBtn=$("#backBtn"), appTitle=$("#appTitle"), searchwrap=$("#searchwrap"),
      galleryScreen=$("#screenGallery");

  // ---------- load ----------
  fetch("data/posts.json").then(function(r){return r.json()}).then(function(data){
    POSTS=data; TOTAL=POSTS.length.toLocaleString();
    POSTS.forEach(function(p){BYID[p.id]=p});
    Array.from(new Set(POSTS.map(function(p){return p.year}).filter(Boolean))).sort()
      .forEach(function(y){var o=document.createElement("option");o.value=y;o.textContent=y;yearEl.appendChild(o)});
    POSTS.forEach(function(p){p.images.forEach(function(im){galleryItems.push({f:im.f,t:im.t,post:p})})});
    apply();
    history.replaceState({view:"list"},"");
    render({view:"list"});
  }).catch(function(){
    viewerEl.innerHTML='<div class="empty">Could not load <code>data/posts.json</code>.<br>'+
      'Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>).</div>';
    showScreen("screenPost");
  });

  // ---------- history-driven navigation ----------
  function viewName(){return (history.state&&history.state.view)||"list"}
  function push(state){history.pushState(state,"");render(state)}
  function replace(state){history.replaceState(state,"");render(state)}
  window.addEventListener("popstate",function(e){render(e.state)});

  function render(state){
    state=state||{view:"list"};
    if(state.view!=="lightbox") hideLb();
    if(state.view==="gallery")       showGallery();
    else if(state.view==="post")     showPost(state.id);
    else if(state.view==="lightbox") showLightboxState(state);
    else                             showList();
  }

  // ---------- screens ----------
  function showScreen(id){
    ["screenList","screenPost","screenGallery"].forEach(function(s){
      document.getElementById(s).classList.toggle("active", s===id);
    });
    var post=(id==="screenPost");
    backBtn.hidden=!post;
    searchwrap.style.display=post?"none":"block";
  }
  function setHomeTitle(){
    if(tab==="reader"){
      appTitle.innerHTML = FILTERED.length===POSTS.length
        ? 'ventdj <small>offline archive · '+TOTAL+' posts</small>'
        : 'ventdj <small>'+FILTERED.length.toLocaleString()+' of '+TOTAL+' posts</small>';
    } else {
      appTitle.innerHTML='ventdj <small>'+galleryFiltered().length.toLocaleString()+' images</small>';
    }
  }
  function setTabUI(t){
    tab=t;
    $("#tabReader").classList.toggle("active",t==="reader");
    $("#tabGallery").classList.toggle("active",t==="gallery");
  }
  function showList(){
    setTabUI("reader");
    if(listStale){renderList();listStale=false}
    showScreen("screenList"); setHomeTitle(); updateCount();
  }
  function showGallery(){
    setTabUI("gallery");
    if(galleryStale){renderGallery(true);galleryStale=false}
    showScreen("screenGallery"); setHomeTitle(); updateCount();
  }

  // bottom tabs
  $("#tabReader").addEventListener("click",function(){if(viewName()!=="list")push({view:"list"});else showList()});
  $("#tabGallery").addEventListener("click",function(){if(viewName()!=="gallery")push({view:"gallery"});else showGallery()});
  // topbar back = browser back
  backBtn.addEventListener("click",function(){history.back()});

  // ---------- filtering ----------
  function norm(s){return (s||"").toLowerCase()}
  function apply(){
    var q=norm(searchEl.value.trim()), y=yearEl.value, sort=sortEl.value;
    FILTERED=POSTS.filter(function(p){
      if(y && p.year!==y) return false;
      if(!q) return true;
      return norm(p.title).indexOf(q)>=0 || norm(p.text).indexOf(q)>=0;
    });
    if(sort==="old") FILTERED.sort(function(a,b){return a.id-b.id});
    else if(sort==="new") FILTERED.sort(function(a,b){return b.id-a.id});
    else if(sort==="az") FILTERED.sort(function(a,b){return a.title.localeCompare(b.title)});
    listStale=galleryStale=true; renderedPostId=null;
    var v=viewName();
    if(v==="gallery"){renderGallery(true);galleryStale=false}
    else if(v!=="post"){renderList();listStale=false}
    setHomeTitle(); updateCount();
  }
  function updateCount(){
    countEl.textContent = tab==="reader"
      ? FILTERED.length.toLocaleString()+" posts"
      : galleryFiltered().length.toLocaleString()+" images";
  }

  // ---------- list ----------
  function renderList(){
    if(!FILTERED.length){
      listEl.innerHTML='<div class="empty">No posts match your search.</div>'; return;
    }
    var frag=document.createDocumentFragment();
    FILTERED.forEach(function(p){
      var d=document.createElement("div");
      d.className="item";
      d.innerHTML='<div class="body"><div class="t"></div>'+
        '<div class="dt"></div></div><span class="chev"><i class="fa-solid fa-chevron-right"></i></span>';
      d.querySelector(".t").textContent=p.title;
      d.querySelector(".dt").textContent=p.date+(p.images.length?(" · "+p.images.length+" img"):"");
      d.addEventListener("click",function(){push({view:"post",id:p.id})});
      frag.appendChild(d);
    });
    listEl.innerHTML=""; listEl.appendChild(frag);
  }

  function showPost(id){
    var p=BYID[id]; if(!p){showList();return}
    appTitle.innerHTML='Reading <small>#'+String(p.id).padStart(4,"0")+' · '+p.date+'</small>';
    showScreen("screenPost");
    if(renderedPostId===id) return;            // already rendered (e.g. closing lightbox)
    renderedPostId=id;
    viewerEl.innerHTML='<div class="empty">Loading…</div>';
    viewerEl.scrollTop=0;
    fetch("posts/"+p.slug).then(function(r){return r.text()}).then(function(htmlText){
      if(renderedPostId!==id) return;          // navigated away while loading
      var doc=new DOMParser().parseFromString(htmlText,"text/html");
      var content=doc.querySelector(".content");
      var body=(content?content.innerHTML:"<p>(no content)</p>").replace(/(["'])\.\.\//g,"$1");
      var idx=FILTERED.indexOf(p);
      var prev=idx>0?FILTERED[idx-1]:null, next=idx>=0&&idx<FILTERED.length-1?FILTERED[idx+1]:null;
      viewerEl.innerHTML='<article class="post"><h1></h1><p class="date"></p>'+
        '<div class="content">'+body+'</div></article><div class="navbtns"></div>';
      viewerEl.querySelector("h1").textContent=p.title;
      viewerEl.querySelector(".date").textContent="#"+String(p.id).padStart(4,"0")+" · "+p.date;
      var nb=viewerEl.querySelector(".navbtns");
      nb.appendChild(prev?mkBtn('<i class="fa-solid fa-chevron-left"></i> Prev',prev.id):spacer());
      nb.appendChild(next?mkBtn('Next <i class="fa-solid fa-chevron-right"></i>',next.id):spacer());
      viewerEl.querySelectorAll(".content img").forEach(function(im){
        im.addEventListener("click",function(e){
          e.preventDefault();
          push({view:"lightbox",ctx:"post",id:id,f:im.getAttribute("src").replace(/^images\//,"")});
        });
      });
      viewerEl.querySelectorAll(".content a").forEach(function(a){
        if(a.querySelector("img")) a.addEventListener("click",function(e){e.preventDefault()});
      });
      viewerEl.scrollTop=0;
    });
  }
  // Prev/Next replaces the current post in history so "back" still leaves reading.
  function mkBtn(label,id){var b=document.createElement("button");b.className="btn";
    b.innerHTML=label;b.addEventListener("click",function(){replace({view:"post",id:id})});return b}
  function spacer(){var s=document.createElement("span");s.className="btn";s.style.visibility="hidden";return s}

  // ---------- gallery ----------
  function galleryFiltered(){
    var q=norm(searchEl.value.trim()), y=yearEl.value;
    if(!q && !y) return galleryItems;
    return galleryItems.filter(function(it){
      if(y && it.post.year!==y) return false;
      if(!q) return true;
      return norm(it.post.title).indexOf(q)>=0 || norm(it.post.text).indexOf(q)>=0;
    });
  }
  function renderGallery(reset){
    var items=galleryFiltered();
    if(reset){gridEl.innerHTML="";galleryShown=0;galleryScreen.scrollTop=0}
    if(!items.length){gridEl.innerHTML='<div class="empty">No images match your search.</div>';sentinelEl.textContent="";return}
    var end=Math.min(galleryShown+GAL_PAGE,items.length);
    var frag=document.createDocumentFragment();
    for(var i=galleryShown;i<end;i++){
      (function(it,i){
        var fig=document.createElement("figure");
        var im=document.createElement("img");
        im.loading="lazy";im.src="images/"+it.t;im.alt=it.post.title;
        im.addEventListener("error",function(){im.src="images/"+it.f});  // fall back to full size
        fig.appendChild(im);
        fig.addEventListener("click",function(){push({view:"lightbox",ctx:"gallery",index:i})});
        frag.appendChild(fig);
      })(items[i],i);
    }
    gridEl.appendChild(frag);
    galleryShown=end;
    sentinelEl.textContent = galleryShown<items.length
      ? "Scroll for more — "+galleryShown.toLocaleString()+" / "+items.length.toLocaleString()
      : items.length.toLocaleString()+" images";
  }
  galleryScreen.addEventListener("scroll",function(){
    if(tab!=="gallery")return;
    if(galleryScreen.scrollTop+galleryScreen.clientHeight > galleryScreen.scrollHeight-700) renderGallery(false);
  });

  // ---------- lightbox ----------
  var lb=$("#lightbox"), lbImg=$("#lbImg"), lbCap=$("#lbCap"), lbList=null, lbIndex=0, lbCtx=null;
  function showLightboxState(state){
    if(state.ctx==="post"){
      showPost(state.id);
      var p=BYID[state.id];
      lbList=[{f:state.f,post:p}]; lbIndex=0; lbCtx="post";
    } else {
      showGallery();
      lbList=galleryFiltered(); lbCtx="gallery";
      lbIndex=Math.min(state.index||0, Math.max(0,lbList.length-1));
    }
    if(!lbList.length){history.back();return}
    paintLb();
  }
  function paintLb(){
    var it=lbList[lbIndex];
    lbImg.src="images/"+it.f;
    lbCap.innerHTML='<a class="open" href="#">'+escapeHtml(it.post.title)+'</a> · #'+
      String(it.post.id).padStart(4,"0")+' · '+it.post.date;
    lbCap.querySelector(".open").addEventListener("click",function(e){
      e.preventDefault(); push({view:"post",id:it.post.id});
    });
    $("#lbPrev").style.visibility=$("#lbNext").style.visibility = lbList.length>1?"visible":"hidden";
    lb.classList.add("open");
  }
  function hideLb(){lb.classList.remove("open");lbImg.src="";lbList=null}
  function step(d){
    if(!lbList||lbList.length<2)return;
    lbIndex=(lbIndex+d+lbList.length)%lbList.length;
    replace({view:"lightbox",ctx:"gallery",index:lbIndex}); // ctx=gallery only when multi
  }
  function escapeHtml(s){return s.replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}

  $("#lbClose").addEventListener("click",function(){history.back()});
  $("#lbPrev").addEventListener("click",function(e){e.stopPropagation();step(-1)});
  $("#lbNext").addEventListener("click",function(e){e.stopPropagation();step(1)});
  lb.addEventListener("click",function(e){if(e.target===lb)history.back()});
  document.addEventListener("keydown",function(e){
    if(!lb.classList.contains("open"))return;
    if(e.key==="Escape")history.back();
    else if(e.key==="ArrowLeft")step(-1);
    else if(e.key==="ArrowRight")step(1);
  });

  // swipe gestures in the lightbox
  var tx=0,ty=0;
  lb.addEventListener("touchstart",function(e){var t=e.changedTouches[0];tx=t.clientX;ty=t.clientY},{passive:true});
  lb.addEventListener("touchend",function(e){
    var t=e.changedTouches[0], dx=t.clientX-tx, dy=t.clientY-ty;
    if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) step(dx<0?1:-1);
    else if(dy>80 && Math.abs(dy)>Math.abs(dx)) history.back();  // swipe down to close
  },{passive:true});

  // ---------- inputs ----------
  var deb;
  searchEl.addEventListener("input",function(){clearTimeout(deb);deb=setTimeout(apply,180)});
  yearEl.addEventListener("change",apply);
  sortEl.addEventListener("change",apply);
})();
