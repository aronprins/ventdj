(function(){
  "use strict";
  var POSTS=[], FILTERED=[], current=null;
  var tab="reader";               // active bottom tab: "reader" | "gallery"
  var backTarget="list";          // where the post-view back button returns to
  var galleryItems=[], galleryShown=0, GAL_PAGE=120;

  var $=function(s){return document.querySelector(s)};
  var listEl=$("#list"), viewerEl=$("#viewer"), gridEl=$("#grid"),
      searchEl=$("#search"), yearEl=$("#year"), sortEl=$("#sort"),
      countEl=$("#count"), sentinelEl=$("#sentinel"),
      backBtn=$("#backBtn"), appTitle=$("#appTitle"), searchwrap=$("#searchwrap"),
      galleryScreen=$("#screenGallery");

  var DEF_TITLE='ventdj <small>offline archive · 2,405 posts</small>';

  // ---------- load ----------
  fetch("data/posts.json").then(function(r){return r.json()}).then(function(data){
    POSTS=data;
    Array.from(new Set(POSTS.map(function(p){return p.year}).filter(Boolean))).sort()
      .forEach(function(y){var o=document.createElement("option");o.value=y;o.textContent=y;yearEl.appendChild(o)});
    POSTS.forEach(function(p){p.images.forEach(function(im){galleryItems.push({f:im.f,t:im.t,post:p})})});
    apply();
  }).catch(function(){
    viewerEl.innerHTML='<div class="empty">Could not load <code>data/posts.json</code>.<br>'+
      'Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>).</div>';
    showScreen("screenPost");
  });

  // ---------- screen management ----------
  function showScreen(id){
    ["screenList","screenPost","screenGallery"].forEach(function(s){
      document.getElementById(s).classList.toggle("active", s===id);
    });
    var post = (id==="screenPost");
    backBtn.hidden = !post;
    searchwrap.style.display = post ? "none" : "block";
  }
  function setTab(t){
    tab=t;
    $("#tabReader").classList.toggle("active",t==="reader");
    $("#tabGallery").classList.toggle("active",t==="gallery");
    appTitle.innerHTML=DEF_TITLE;
    if(t==="reader"){ showScreen("screenList"); }
    else { showScreen("screenGallery"); renderGallery(true); }
    updateCount();
  }
  $("#tabReader").addEventListener("click",function(){setTab("reader")});
  $("#tabGallery").addEventListener("click",function(){setTab("gallery")});
  backBtn.addEventListener("click",function(){
    appTitle.innerHTML=DEF_TITLE;
    if(backTarget==="gallery"){
      tab="gallery";
      $("#tabReader").classList.remove("active");
      $("#tabGallery").classList.add("active");
      showScreen("screenGallery");        // keep existing grid + scroll position
      if(!gridEl.children.length) renderGallery(true);
      updateCount();
    } else {
      setTab("reader");                    // back to the post list
    }
  });

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
    if(tab==="reader") renderList(); else renderGallery(true);
    updateCount();
  }
  function updateCount(){
    countEl.textContent = tab==="reader"
      ? FILTERED.length.toLocaleString()+" posts"
      : galleryFiltered().length.toLocaleString()+" images";
  }

  // ---------- list ----------
  function renderList(){
    var frag=document.createDocumentFragment();
    FILTERED.forEach(function(p){
      var d=document.createElement("div");
      d.className="item";
      d.innerHTML='<div class="body"><div class="t"></div>'+
        '<div class="dt"></div></div><span class="chev"><i class="fa-solid fa-chevron-right"></i></span>';
      d.querySelector(".t").textContent=p.title;
      d.querySelector(".dt").textContent=p.date+(p.images.length?(" · "+p.images.length+" img"):"");
      d.addEventListener("click",function(){openPost(p,"list")});
      frag.appendChild(d);
    });
    listEl.innerHTML=""; listEl.appendChild(frag);
  }

  function openPost(p,origin){
    if(origin) backTarget=origin;
    current=p;
    appTitle.innerHTML='Reading <small>#'+String(p.id).padStart(4,"0")+' · '+p.date+'</small>';
    viewerEl.innerHTML='<div class="empty">Loading…</div>';
    showScreen("screenPost");
    viewerEl.scrollTop=0;
    fetch("posts/"+p.slug).then(function(r){return r.text()}).then(function(htmlText){
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
      nb.appendChild(prev?mkBtn('<i class="fa-solid fa-chevron-left"></i> Prev',prev):spacer());
      nb.appendChild(next?mkBtn('Next <i class="fa-solid fa-chevron-right"></i>',next):spacer());
      viewerEl.querySelectorAll(".content img").forEach(function(im){
        im.addEventListener("click",function(e){e.preventDefault();openLightboxSrc(im.getAttribute("src"),p)});
      });
      viewerEl.querySelectorAll(".content a").forEach(function(a){
        if(a.querySelector("img")) a.addEventListener("click",function(e){e.preventDefault()});
      });
      viewerEl.scrollTop=0;
    });
  }
  function mkBtn(label,p){var b=document.createElement("button");b.className="btn";
    b.innerHTML=label;b.addEventListener("click",function(){openPost(p)});return b}
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
    var end=Math.min(galleryShown+GAL_PAGE,items.length);
    var frag=document.createDocumentFragment();
    for(var i=galleryShown;i<end;i++){
      (function(it,i){
        var fig=document.createElement("figure");
        var im=document.createElement("img");
        im.loading="lazy";im.src="images/"+it.t;im.alt=it.post.title;
        fig.appendChild(im);
        fig.addEventListener("click",function(){openLightbox(items,i)});
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
  var lb=$("#lightbox"), lbImg=$("#lbImg"), lbCap=$("#lbCap"), lbList=null, lbIndex=0;
  function openLightbox(items,i){lbList=items;lbIndex=i;showLb()}
  function openLightboxSrc(src,post){lbList=[{f:src.replace(/^images\//,""),post:post}];lbIndex=0;showLb()}
  function showLb(){
    var it=lbList[lbIndex];
    lbImg.src = "images/"+it.f;
    lbCap.innerHTML='<a class="open" href="#">'+it.post.title+'</a> · #'+
      String(it.post.id).padStart(4,"0")+' · '+it.post.date;
    lbCap.querySelector(".open").addEventListener("click",function(e){
      e.preventDefault();closeLb();
      openPost(it.post, tab==="gallery" ? "gallery" : "list");
    });
    lb.classList.add("open");
  }
  function closeLb(){lb.classList.remove("open");lbImg.src=""}
  function step(d){if(!lbList)return;lbIndex=(lbIndex+d+lbList.length)%lbList.length;showLb()}
  $("#lbClose").addEventListener("click",closeLb);
  $("#lbPrev").addEventListener("click",function(e){e.stopPropagation();step(-1)});
  $("#lbNext").addEventListener("click",function(e){e.stopPropagation();step(1)});
  lb.addEventListener("click",function(e){if(e.target===lb)closeLb()});
  document.addEventListener("keydown",function(e){
    if(!lb.classList.contains("open"))return;
    if(e.key==="Escape")closeLb();else if(e.key==="ArrowLeft")step(-1);else if(e.key==="ArrowRight")step(1);
  });

  // ---------- inputs ----------
  var deb;
  searchEl.addEventListener("input",function(){clearTimeout(deb);deb=setTimeout(apply,180)});
  yearEl.addEventListener("change",apply);
  sortEl.addEventListener("change",apply);
})();
