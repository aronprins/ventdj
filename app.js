(function(){
  "use strict";
  var POSTS=[], BYID={}, FILTERED=[], TOTAL="0";
  var tab="reader";
  var galleryItems=[], galleryShown=0, GAL_PAGE=120;
  var listStale=true, galleryStale=true, renderedPostId=null;

  var $=function(s){return document.querySelector(s)};
  var listEl=$("#list"), viewerEl=$("#viewer"), gridEl=$("#grid"),
      searchEl=$("#search"), yearEl=$("#year"), sortEl=$("#sort"),
      sentinelEl=$("#sentinel"),
      backBtn=$("#backBtn"), appTitle=$("#appTitle"),
      searchBtn=$("#searchBtn"), filterBtn=$("#filterBtn"), searchbar=$("#searchbar"),
      filterSheet=$("#filterSheet"), sheetBackdrop=$("#sheetBackdrop"),
      galleryScreen=$("#screenGallery");

  // ---------- load ----------
  listSkeleton();                 // show loaders until data arrives
  fetch("data/posts.json").then(function(r){return r.json()}).then(function(data){
    POSTS=data; TOTAL=POSTS.length.toLocaleString();
    POSTS.forEach(function(p){BYID[p.id]=p});
    Array.from(new Set(POSTS.map(function(p){return p.year}).filter(Boolean))).sort()
      .forEach(function(y){var o=document.createElement("option");o.value=y;o.textContent=y;yearEl.appendChild(o)});
    POSTS.forEach(function(p){p.images.forEach(function(im){galleryItems.push({f:im.f,t:im.t,post:p})})});
    apply();
    render(parseHash());          // honor a deep-linked hash on first load
  }).catch(function(){
    viewerEl.innerHTML='<div class="empty">Could not load <code>data/posts.json</code>.<br>'+
      'Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>).</div>';
    showScreen("screenPost");
  });

  // ---------- hash routing (GitHub Pages friendly) ----------
  // #/                       -> list
  // #/gallery                -> gallery
  // #/post/<id>              -> post
  // #/photo/<file>           -> lightbox (gallery context)
  // #/post/<id>/photo/<file> -> lightbox (in-post context)
  function parseHash(){
    var parts=location.hash.replace(/^#\/?/,"").split("/").filter(Boolean).map(decodeURIComponent);
    if(parts[0]==="gallery") return {view:"gallery"};
    if(parts[0]==="post"){
      var id=parseInt(parts[1],10);
      if(parts[2]==="photo") return {view:"lightbox",ctx:"post",id:id,f:parts[3]};
      return {view:"post",id:id};
    }
    if(parts[0]==="photo") return {view:"lightbox",ctx:"gallery",f:parts[1]};
    return {view:"list"};
  }
  function navigate(h){ if(location.hash===h) render(parseHash()); else location.hash=h; }
  function replaceNav(h){ history.replaceState(null,"",h); render(parseHash()); }
  window.addEventListener("hashchange",function(){render(parseHash())});

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
    searchBtn.hidden=filterBtn.hidden=post;     // hide search/filter while reading a post
    if(post) closeSearch();
  }
  function setHomeTitle(){
    if(tab==="reader"){
      appTitle.innerHTML = FILTERED.length===POSTS.length
        ? 'ventdj <small>'+TOTAL+' posts</small>'
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
  $("#tabReader").addEventListener("click",function(){navigate("#/")});
  $("#tabGallery").addEventListener("click",function(){navigate("#/gallery")});
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
    var v=parseHash().view;
    if(v==="gallery"){renderGallery(true);galleryStale=false}
    else if(v!=="post"){renderList();listStale=false}
    setHomeTitle(); updateCount();
  }
  function updateCount(){
    filterBtn.classList.toggle("dot", !!(yearEl.value || sortEl.value!=="old"));
    searchBtn.classList.toggle("dot", !!searchEl.value.trim());
  }

  // ---------- search & filter UI ----------
  function openSearch(){searchbar.classList.add("open");searchEl.focus()}
  function closeSearch(){searchbar.classList.remove("open")}
  searchBtn.addEventListener("click",openSearch);
  $("#searchClose").addEventListener("click",function(){
    if(searchEl.value){searchEl.value="";apply()}
    closeSearch();
  });
  searchEl.addEventListener("keydown",function(e){if(e.key==="Escape"){searchEl.value="";apply();closeSearch()}});

  function openSheet(){sheetBackdrop.classList.add("open");filterSheet.classList.add("open");filterSheet.setAttribute("aria-hidden","false")}
  function closeSheet(){sheetBackdrop.classList.remove("open");filterSheet.classList.remove("open");filterSheet.setAttribute("aria-hidden","true")}
  filterBtn.addEventListener("click",openSheet);
  sheetBackdrop.addEventListener("click",closeSheet);
  $("#filterDone").addEventListener("click",closeSheet);
  $("#filterReset").addEventListener("click",function(){yearEl.value="";sortEl.value="old";apply()});

  // ---------- list ----------
  function listSkeleton(){
    var h="";
    for(var i=0;i<12;i++) h+='<div class="skel-row"><div class="b"><div class="skel l1"></div><div class="skel l2"></div></div></div>';
    listEl.innerHTML=h;
  }
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
      d.addEventListener("click",function(){navigate("#/post/"+p.id)});
      frag.appendChild(d);
    });
    listEl.innerHTML=""; listEl.appendChild(frag);
  }

  function showPost(id){
    var p=BYID[id]; if(!p){navigate("#/");return}
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
          navigate("#/post/"+id+"/photo/"+encodeURIComponent(im.getAttribute("src").replace(/^images\//,"")));
        });
      });
      viewerEl.querySelectorAll(".content a").forEach(function(a){
        if(a.querySelector("img")) a.addEventListener("click",function(e){e.preventDefault()});
      });
      viewerEl.scrollTop=0;
    });
  }
  // Prev/Next replaces the current history entry so "back" still leaves reading.
  function mkBtn(label,id){var b=document.createElement("button");b.className="btn";
    b.innerHTML=label;b.addEventListener("click",function(){replaceNav("#/post/"+id)});return b}
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
      (function(it){
        var fig=document.createElement("figure");
        fig.className="loading";
        var im=document.createElement("img");
        var triedFull=false;
        im.loading="lazy";im.alt=it.post.title;
        im.addEventListener("load",function(){fig.classList.remove("loading");im.classList.add("loaded")});
        im.addEventListener("error",function(){
          if(!triedFull){triedFull=true;im.src="images/"+it.f}    // fall back to full size
          else{fig.classList.remove("loading")}
        });
        im.src="images/"+it.t;
        fig.appendChild(im);
        fig.addEventListener("click",function(){navigate("#/photo/"+encodeURIComponent(it.f))});
        frag.appendChild(fig);
      })(items[i]);
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
  var lb=$("#lightbox"), lbImg=$("#lbImg"), lbCap=$("#lbCap"), lbList=null, lbIndex=0;
  function showLightboxState(state){
    if(state.ctx==="post"){
      showPost(state.id);
      var p=BYID[state.id];
      if(!p){history.back();return}
      lbList=[{f:state.f,post:p}]; lbIndex=0;
    } else {
      showGallery();
      lbList=galleryFiltered();
      lbIndex=Math.max(0, indexOfFull(lbList,state.f));
    }
    if(!lbList.length){history.back();return}
    paintLb();
  }
  function indexOfFull(list,f){for(var i=0;i<list.length;i++){if(list[i].f===f)return i}return -1}
  function paintLb(){
    var it=lbList[lbIndex];
    lbImg.src="images/"+it.f;
    lbCap.innerHTML='<a class="open" href="#">'+escapeHtml(it.post.title)+'</a> · #'+
      String(it.post.id).padStart(4,"0")+' · '+it.post.date;
    lbCap.querySelector(".open").addEventListener("click",function(e){
      e.preventDefault(); navigate("#/post/"+it.post.id);
    });
    $("#lbPrev").style.visibility=$("#lbNext").style.visibility = lbList.length>1?"visible":"hidden";
    lb.classList.add("open");
  }
  function hideLb(){lb.classList.remove("open");lbImg.src="";lbList=null}
  function step(d){
    if(!lbList||lbList.length<2)return;
    var i=(lbIndex+d+lbList.length)%lbList.length;
    replaceNav("#/photo/"+encodeURIComponent(lbList[i].f));   // gallery context only (multi)
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
