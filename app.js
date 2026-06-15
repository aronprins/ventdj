(function(){
  "use strict";
  var POSTS=[], BYID={}, FILTERED=[], TOTAL="0";
  var tab="discover";
  var galleryItems=[], galleryShown=0, GAL_PAGE=120;
  var listStale=true, galleryStale=true, renderedPostId=null, selectedId=null;

  // Desktop/iPad shows the Reader tab as a master–detail split (list + post side
  // by side). On phones (≤768px) this is always false, so behavior is unchanged.
  var splitMq=window.matchMedia("(min-width:769px)");
  function isSplit(){return splitMq.matches}

  var $=function(s){return document.querySelector(s)};
  var listEl=$("#list"), viewerEl=$("#viewer"), gridEl=$("#grid"),
      searchEl=$("#search"), yearEl=$("#year"), sortEl=$("#sort"),
      sentinelEl=$("#sentinel"),
      backBtn=$("#backBtn"), appTitle=$("#appTitle"),
      searchBtn=$("#searchBtn"), filterBtn=$("#filterBtn"), searchbar=$("#searchbar"),
      filterSheet=$("#filterSheet"), sheetBackdrop=$("#sheetBackdrop"),
      chipsEl=$("#chips"), aboutEl=$("#about"), galleryScreen=$("#screenGallery");

  // The reader is mode-aware: one list/detail/chips machinery drives the full
  // archive and three derived "readers" (faq, how-to, people), each with its
  // own chip set and post subset. `mode` selects which; each remembers its chip.
  var mode="archive";
  var catByMode={archive:"",faq:"","how-to":"",people:""};
  function curCat(){return catByMode[mode]}
  var FAQPOSTS=[];                 // POSTS.filter(faq), filled on load
  var TIDX=null;                   // {materials,people} -> {chips,idset,base} from topics.json
  var appEl=document.querySelector(".app");
  function setReading(on){appEl.classList.toggle("reading",!!on)}

  // archive category chips (slug -> label); "" = All
  var CATS=[["","All"],["figures","Figures"],["forsale","For Sale"],["making","Making"],
            ["lessons","Lessons"],["qa","Q&A"],["people","People"],["events","Events"],["other","Other"]];

  // A mode descriptor: which tab owns it, its base route, its post set, its chip
  // list, and how a post matches a selected chip. (FAQCATS/TIDX resolve later.)
  function modeDef(m){
    m=m||mode;
    if(m==="faq") return {tab:"discover",route:"#/faq",base:function(){return FAQPOSTS},
      chips:function(){return FAQCATS},match:function(p,c){return p.fcat===c}};
    if(m==="how-to"||m==="people"||m==="authors"){ var x=TIDX&&TIDX[m];
      return {tab:"discover",route:"#/"+m,base:function(){return x?x.base:[]},
        chips:function(){return x?x.chips:[["","All"]]},
        match:function(p,c){return !!(x&&x.idset[c]&&x.idset[c][p.id])}}; }
    return {tab:"reader",route:"#/reader",base:function(){return POSTS},
      chips:function(){return CATS},match:function(p,c){return p.cat===c}};
  }
  function slugify(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
  function postHash(m,id){return (m==="archive"?"#/post/":"#/"+m+"/post/")+id}
  function postRoute(id){return postHash(mode,id)}
  function photoRoute(id,f){return postHash(mode,id)+"/photo/"+encodeURIComponent(f)}
  // Build the how-to/people indexes (chips + id sets + union base) once. The
  // "how-to" reader is backed by the topics.json "materials" array.
  function buildTIDX(t){
    if(TIDX||!t) return;
    TIDX={};
    [["how-to","materials"],["people","people"],["authors","authors"]].forEach(function(pair){
      var mkey=pair[0], arr=t[pair[1]]||[], chips=[["","All"]], idset={}, union={};
      arr.forEach(function(it){ chips.push([it.slug,it.label]); var s={};
        it.ids.forEach(function(id){s[id]=1;union[id]=1}); idset[it.slug]=s; });
      var base=Object.keys(union).map(function(id){return BYID[+id]}).filter(Boolean)
                .sort(function(a,b){return a.id-b.id});
      TIDX[mkey]={chips:chips,idset:idset,base:base};
    });
  }
  // how-to/people need topics.json before they can render; others are ready.
  function ensureMode(m,cb){
    if((m==="how-to"||m==="people"||m==="authors")&&!TIDX) loadTopics(function(t){buildTIDX(t);cb()});
    else cb();
  }

  // Bump VERSION on each deploy to bust mobile caches (must match ?v= in index.html).
  var VERSION="97e4aff3";

  // ---------- load ----------
  listSkeleton();                 // show loaders until data arrives
  fetch("data/posts.json?v="+VERSION).then(function(r){return r.json()}).then(function(data){
    POSTS=data; TOTAL=POSTS.length.toLocaleString();
    POSTS.forEach(function(p){BYID[p.id]=p});
    FAQPOSTS=POSTS.filter(function(p){return p.faq});
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
  // #/                       -> discover (home)
  // #/reader                 -> the full archive list
  // #/gallery                -> gallery
  // #/post/<id>              -> post (archive)
  // #/photo/<file>           -> lightbox (gallery context)
  // #/post/<id>/photo/<file> -> lightbox (in-post context)
  // Derived readers carry a mode prefix (faq/how-to/people) and an optional
  // category slug, e.g. #/how-to/basswood or #/faq/post/50/photo/x.
  function parseHash(){
    var parts=location.hash.replace(/^#\/?/,"").split("/").filter(Boolean).map(decodeURIComponent);
    if(!parts.length) return {view:"discover"};          // home
    if(parts[0]==="about") return {view:"about"};
    if(parts[0]==="discover") return {view:"discover"};
    if(parts[0]==="gallery") return {view:"gallery"};
    if(parts[0]==="photo") return {view:"lightbox",ctx:"gallery",mode:"archive",f:parts[1]};
    var mode="archive";
    if(parts[0]==="reader") parts=parts.slice(1);        // explicit archive list
    else if(parts[0]==="faq"||parts[0]==="how-to"||parts[0]==="people"||parts[0]==="authors"){ mode=parts[0]; parts=parts.slice(1); }
    if(parts[0]==="post"){
      var id=parseInt(parts[1],10);
      if(parts[2]==="photo") return {view:"lightbox",ctx:"post",mode:mode,id:id,f:parts[3]};
      return {view:"post",mode:mode,id:id};
    }
    return {view:"list",mode:mode,scat:parts[0]||""};
  }
  function navigate(h){ if(location.hash===h) render(parseHash()); else location.hash=h; }
  function replaceNav(h){ history.replaceState(null,"",h); render(parseHash()); }
  window.addEventListener("hashchange",function(){render(parseHash())});
  // Crossing the phone/tablet breakpoint flips the split view on or off, so
  // re-render the current route to refresh the chrome (back button, chips) and layout.
  splitMq.addEventListener("change",function(){render(parseHash())});

  function render(state){
    state=state||{view:"discover"};
    if(state.view!=="lightbox") hideLb();
    if(state.view==="gallery")       { setReading(false); showGallery(); }
    else if(state.view==="about")    { setReading(false); showAbout(); }
    else if(state.view==="discover") { setReading(false); showDiscover(); }
    else if(state.view==="post")     showPost(state);
    else if(state.view==="lightbox") showLightboxState(state);
    else                             showList(state);
  }

  // ---------- screens ----------
  function showScreen(id){
    ["screenList","screenPost","screenGallery","screenDiscover","screenAbout"].forEach(function(s){
      document.getElementById(s).classList.toggle("active", s===id);
    });
    var post=(id==="screenPost");
    // screens with no search / filter / chips
    var bare=(post || id==="screenAbout" || id==="screenDiscover");
    // Derived readers (faq/how-to/people) live under Discover, so their list and
    // post screens carry a back button up to the Discover hub.
    var derived=((id==="screenList"||id==="screenPost") && mode!=="archive");
    // In split view the list never leaves, so the post pane keeps the list's
    // chrome (search / filter / chips). Archive needs no back button there.
    if(isSplit() && (id==="screenList" || id==="screenPost")){
      backBtn.hidden=!derived;
      searchBtn.hidden=filterBtn.hidden=false;
      chipsEl.hidden=false;
      return;
    }
    backBtn.hidden=!(post || derived);
    searchBtn.hidden=filterBtn.hidden=bare;
    chipsEl.hidden=bare;
    if(bare) closeSearch();
  }
  var BRAND="Mr. D's Ventriloquist Journal";
  // Per-mode masthead: lead label + noun for the count.
  var MODEHEAD={archive:[BRAND,"posts"],faq:["FAQ","questions"],
    "how-to":["How-to &amp; Materials","posts"],people:["People &amp; Figures","posts"],
    authors:["Contributors","columns"]};
  function setHomeTitle(){
    if(tab==="gallery"){
      appTitle.innerHTML=BRAND+' <small>'+galleryFiltered().length.toLocaleString()+' images</small>';
      return;
    }
    var h=MODEHEAD[mode], total=modeDef().base().length, n=FILTERED.length;
    appTitle.innerHTML = (n===total)
      ? h[0]+' <small>'+total.toLocaleString()+' '+h[1]+'</small>'
      : h[0]+' <small>'+n.toLocaleString()+' of '+total.toLocaleString()+' '+h[1]+'</small>';
  }
  function setTabUI(t){
    tab=t;
    $("#tabReader").classList.toggle("active",t==="reader");
    $("#tabGallery").classList.toggle("active",t==="gallery");
    $("#tabDiscover").classList.toggle("active",t==="discover");
    $("#tabAbout").classList.toggle("active",t==="about");
  }
  function showList(state){
    var m=(state&&state.mode)||"archive", scat=state?state.scat:undefined;
    ensureMode(m,function(){
      switchMode(m, scat);                 // sets mode + chips + category + FILTERED
      setReading(true);
      setTabUI(modeDef().tab);
      if(listStale){renderList();listStale=false}
      showScreen("screenList"); setHomeTitle(); updateCount();
      // split view: if no post is open yet, invite a choice in the detail pane
      if(isSplit() && renderedPostId===null)
        viewerEl.innerHTML='<div class="empty">'+
          (m==="faq"?"Select a question to start reading.":"Select a post from the list to start reading.")+'</div>';
    });
  }
  // Enter a mode (optionally with a preselected category) and recompute the list.
  function switchMode(m, scat){
    var changed=(m!==mode);
    mode=m;
    if(scat!==undefined) catByMode[mode]=scat;       // category came from the route
    if(changed){ selectedId=null; searchEl.value=""; }
    renderChips();
    apply();
  }
  function showGallery(){
    setTabUI("gallery");
    if(galleryStale){renderGallery(true);galleryStale=false}
    showScreen("screenGallery"); setHomeTitle(); updateCount();
  }
  function showAbout(){
    setTabUI("about");
    loadAbout();
    showScreen("screenAbout");
    appTitle.innerHTML='About <small>'+BRAND+'</small>';
  }

  // ---------- about (rendered from README.md, up to "What's in here") ----------
  var aboutLoaded=false;
  function loadAbout(){
    if(aboutLoaded) return;
    aboutLoaded=true;
    aboutEl.innerHTML='<div class="empty">Loading…</div>';
    fetch("README.md?v="+VERSION).then(function(r){return r.text()}).then(function(md){
      aboutEl.innerHTML=renderAbout(md)+
        '<p class="about-orig"><a href="http://ventdj.blogspot.com/" target="_blank" rel="noopener">'+
        'Visit the original blog <i class="fa-solid fa-arrow-up-right-from-square"></i></a></p>';
    }).catch(function(){ aboutLoaded=false; aboutEl.innerHTML='<div class="empty">Could not load README.md</div>'; });
  }
  function aboutInline(s){
    return s.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
            .replace(/\*(.+?)\*/g,"<em>$1</em>")
            // the original site opens in a new tab
            .replace(/ventdj\.blogspot\.com/g,
              '<a href="http://ventdj.blogspot.com/" target="_blank" rel="noopener">ventdj.blogspot.com</a>');
  }
  function renderAbout(md){
    var cut=md.indexOf("### What's in here");
    if(cut>=0) md=md.slice(0,cut);
    md=md.trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return md.split(/\n{2,}/).map(function(b){
      b=b.trim(); if(!b) return "";
      if(/^### /.test(b)) return "<h3>"+aboutInline(b.slice(4))+"</h3>";
      if(/^## /.test(b))  return "<h2>"+aboutInline(b.slice(3))+"</h2>";
      if(/^# /.test(b))   return "<h1>"+aboutInline(b.slice(2))+"</h1>";
      return "<p>"+aboutInline(b.replace(/\n/g," "))+"</p>";
    }).join("");
  }

  // ---------- discover (FAQ · materials · people · on this day) ----------
  var discoverEl=$("#discover");
  var TOPICS=null;
  function loadTopics(cb){
    if(TOPICS) return cb(TOPICS);
    fetch("data/topics.json?v="+VERSION).then(function(r){return r.json()}).then(function(t){
      TOPICS=t; buildTIDX(t); cb(t);
    }).catch(function(){ cb(null); });
  }
  // month/day match of posts from Mr. D's lifetime (strictly before the
  // 1/23/2013 passing announcement, so posthumous notices never resurface).
  var OTD_CUTOFF=new Date(2013,0,23);
  var MONTHS=["January","February","March","April","May","June","July","August",
              "September","October","November","December"];
  function parseDate(d){var m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d||"");return m?new Date(+m[3],+m[1]-1,+m[2]):null}
  function onThisDay(){
    var now=new Date(), mo=now.getMonth(), da=now.getDate();
    var exact=[], month=[];
    POSTS.forEach(function(p){
      if(p.guest) return;                 // On this day = Mr. D's own writing, not guest columns
      var dt=parseDate(p.date);
      if(!dt || dt>=OTD_CUTOFF || dt.getMonth()!==mo) return;
      month.push(p); if(dt.getDate()===da) exact.push(p);
    });
    var hit=exact.length?exact:month;
    hit.sort(function(a,b){return (parseDate(b.date)-parseDate(a.date))});
    return {posts:hit.slice(0,10), exact:exact.length>0, mo:mo, da:da};
  }

  function showDiscover(){
    setTabUI("discover");
    showScreen("screenDiscover");
    appTitle.innerHTML=BRAND+' <small>Highlights &amp; topics</small>';
    if(discoverEl.dataset.ready) return;        // built once; static derived data
    loadTopics(function(t){ renderDiscover(t); discoverEl.dataset.ready="1"; });
  }

  function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
  function postRow(p,subtitle,hash){
    var d=el("button","drow");
    d.innerHTML='<span class="drow-b"><span class="drow-t"></span>'+
      (subtitle?'<span class="drow-s"></span>':'<span class="drow-d"></span>')+
      '</span><i class="fa-solid fa-chevron-right"></i>';
    d.querySelector(".drow-t").textContent=p.title;
    d.querySelector(subtitle?".drow-s":".drow-d").textContent=subtitle||p.date;
    d.addEventListener("click",function(){navigate(hash||("#/post/"+p.id))});
    return d;
  }
  function chip(label,n,hash){
    var b=el("a","tchip",escapeHtml(label)+'<span class="tn">'+n+'</span>');
    b.href=hash;
    return b;
  }

  function renderDiscover(t){
    discoverEl.innerHTML="";
    var faqs=POSTS.filter(function(p){return p.faq});

    // On this day
    var otd=onThisDay();
    if(otd.posts.length){
      var sec=el("section","dsec");
      sec.appendChild(el("h2","dsec-h",'<i class="fa-solid fa-calendar-day"></i> '+
        (otd.exact?"On this day · "+MONTHS[otd.mo]+" "+otd.da:"This month · "+MONTHS[otd.mo])));
      sec.appendChild(el("p","dsec-sub",otd.exact
        ? "What Mr. D wrote on this date in years past."
        : "From the archive this month, in Mr. D's own words."));
      var rail=el("div","drail");
      otd.posts.forEach(function(p){
        var c=el("button","dcard");
        c.innerHTML='<span class="dcard-y"></span><span class="dcard-t"></span>';
        c.querySelector(".dcard-y").textContent=p.date;
        c.querySelector(".dcard-t").textContent=p.title;
        c.addEventListener("click",function(){navigate("#/post/"+p.id)});
        rail.appendChild(c);
      });
      sec.appendChild(rail);
      discoverEl.appendChild(sec);
    }

    // FAQ
    if(faqs.length){
      var f=el("section","dsec");
      f.appendChild(el("h2","dsec-h",'<i class="fa-solid fa-circle-question"></i> Frequently asked'));
      f.appendChild(el("p","dsec-sub","Real reader questions, answered by Mr. D."));
      // a few representative samples (with a question, spread across the run)
      var sample=faqs.filter(function(p){return p.q}), step=Math.max(1,Math.floor(sample.length/4)), picks=[];
      for(var i=0;i<sample.length && picks.length<4;i+=step) picks.push(sample[i]);
      var rows=el("div","drows");
      picks.forEach(function(p){ rows.appendChild(postRow(p,p.q,"#/faq/post/"+p.id)); });
      f.appendChild(rows);
      var more=el("a","dmore",'Browse all '+faqs.length+' questions <i class="fa-solid fa-arrow-right"></i>');
      more.href="#/faq"; f.appendChild(more);
      discoverEl.appendChild(f);
    }

    // How-to & People clouds — each chip opens that mode's reader, prefiltered.
    // spec: [route mode, topics.json key, heading, subtitle]
    if(t){
      [["how-to","materials",'<i class="fa-solid fa-screwdriver-wrench"></i> How-to & materials',
        "Browse posts by what they're made of and how."],
       ["authors","authors",'<i class="fa-solid fa-feather-pointed"></i> Contributors',
        "Guest columns by other ventriloquists, alongside Mr. D."],
       ["people","people",'<i class="fa-solid fa-users"></i> People & figures',
        "The people and classic characters Mr. D wrote about."]].forEach(function(spec){
        var arr=t[spec[1]]||[]; if(!arr.length) return;
        var s=el("section","dsec");
        s.appendChild(el("h2","dsec-h",spec[2]));
        s.appendChild(el("p","dsec-sub",spec[3]));
        var cloud=el("div","tcloud");
        arr.forEach(function(it){ cloud.appendChild(chip(it.label,it.n,"#/"+spec[0]+"/"+it.slug)); });
        s.appendChild(cloud);
        discoverEl.appendChild(s);
      });
    }
  }

  // FAQ category chips — keep slugs/labels in sync with FAQ_CATS in build_index.py.
  var FAQCATS=[["","All"],["building","Building"],["repair","Repair & care"],
    ["mechanics","Eyes & mechanics"],["voice","Voice & technique"],
    ["performing","Performing"],["identify","ID & value"],
    ["products","Course & store"],["other","Other"]];

  // bottom tabs
  $("#tabDiscover").addEventListener("click",function(){navigate("#/")});
  $("#tabGallery").addEventListener("click",function(){navigate("#/gallery")});
  $("#tabReader").addEventListener("click",function(){navigate("#/reader")});
  $("#tabAbout").addEventListener("click",function(){navigate("#/about")});
  // topbar back steps up one level: a phone post -> its list, a derived reader's
  // list (or its split view) -> the Discover hub. (Archive list shows no back.)
  backBtn.addEventListener("click",function(){
    var st=parseHash(), derived=(st.mode && st.mode!=="archive");
    if(st.view==="post" && !isSplit()){
      if(derived) navigate(modeDef(st.mode).route);   // faq/how-to/people post -> its list
      else history.back();                            // archive post -> wherever reading began
      return;
    }
    if(derived){ navigate("#/"); return; }            // derived list / split -> Discover (home)
    history.back();
  });

  // ---------- filtering ----------
  function norm(s){return (s||"").toLowerCase()}
  function apply(){
    var q=norm(searchEl.value.trim()), y=yearEl.value, sort=sortEl.value;
    var def=modeDef(), c=curCat();
    FILTERED=def.base().filter(function(p){
      if(c && !def.match(p,c)) return false;
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
    // re-render the list live unless it's off-screen (phone reading a post).
    // In split view the list rail is always visible, so refresh it too.
    else if(v!=="post" || isSplit()){renderList();listStale=false}
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

  // ---------- category chips (mode-aware) ----------
  function renderChips(){
    var defs=modeDef().chips(), active=curCat(), frag=document.createDocumentFragment();
    defs.forEach(function(c){
      var b=document.createElement("button");
      b.className="chip"+(c[0]===active?" active":"");
      b.textContent=c[1];
      b.addEventListener("click",function(){
        if(curCat()===c[0]) return;
        catByMode[mode]=c[0];
        Array.prototype.forEach.call(chipsEl.children,function(el,i){
          el.classList.toggle("active",defs[i][0]===c[0]);
        });
        // derived readers reflect the selection in the URL (silent — no reload)
        if(mode!=="archive") history.replaceState(null,"",c[0]?modeDef().route+"/"+c[0]:modeDef().route);
        apply();
      });
      frag.appendChild(b);
    });
    chipsEl.innerHTML=""; chipsEl.appendChild(frag);
  }
  renderChips();

  // ---------- list ----------
  function listSkeleton(){
    var h="";
    for(var i=0;i<12;i++) h+='<div class="skel-row"><div class="b"><div class="skel l1"></div><div class="skel l2"></div></div></div>';
    listEl.innerHTML=h;
  }
  function renderList(){
    if(!FILTERED.length){
      listEl.innerHTML='<div class="empty">'+(mode==="faq"?"No questions match.":"No posts match your search.")+'</div>';
      return;
    }
    var faq=(mode==="faq");
    var frag=document.createDocumentFragment();
    FILTERED.forEach(function(p){
      var d=document.createElement("div");
      d.className="item"+(p.id===selectedId?" selected":"");
      d.dataset.id=p.id;
      d.innerHTML='<div class="body"><div class="t"></div>'+
        (faq?'<div class="q"></div>':'')+
        '<div class="dt"><span class="d"></span></div></div><span class="chev"><i class="fa-solid fa-chevron-right"></i></span>';
      d.querySelector(".t").textContent=p.title;
      if(faq && p.q) d.querySelector(".q").textContent=p.q;
      d.querySelector(".dt .d").textContent=p.date;
      if(p.images.length){
        var badge=document.createElement("span");
        badge.className="imgs";
        badge.innerHTML='<i class="fa-solid fa-image"></i>'+p.images.length;
        d.querySelector(".dt").appendChild(badge);
      }
      d.addEventListener("click",function(){navigate(postRoute(p.id))});
      frag.appendChild(d);
    });
    listEl.innerHTML=""; listEl.appendChild(frag);
  }

  // Highlight the open post in the list pane (split view) and keep it in sight.
  function markSelected(id){
    selectedId=id;
    var items=listEl.querySelectorAll(".item"), hit=null;
    Array.prototype.forEach.call(items,function(it){
      var on=(parseInt(it.dataset.id,10)===id);
      it.classList.toggle("selected",on);
      if(on) hit=it;
    });
    if(hit && hit.scrollIntoView) hit.scrollIntoView({block:"nearest"});
  }

  function showPost(state){
    var id=state.id, m=state.mode||"archive";
    ensureMode(m,function(){ renderPost(id,m); });
  }
  function renderPost(id,m){
    if(m!==mode) switchMode(m);                // deep-linked straight into a mode
    setReading(true);
    var p=BYID[id]; if(!p){navigate(modeDef().route);return}
    if(isSplit()){
      // detail-beside-list: keep the mode's tab/title and mark the chosen row
      setTabUI(modeDef().tab);
      if(listStale){renderList();listStale=false}
      setHomeTitle();
      markSelected(id);
    } else {
      setTabUI(modeDef().tab);
      appTitle.innerHTML='Reading <small>#'+String(p.id).padStart(4,"0")+' · '+p.date+'</small>';
    }
    showScreen("screenPost");
    if(renderedPostId===id) return;            // already rendered (e.g. closing lightbox)
    renderedPostId=id;
    viewerEl.innerHTML='<div class="empty">Loading…</div>';
    viewerEl.scrollTop=0;
    fetch("posts/"+p.slug+"?v="+VERSION).then(function(r){return r.text()}).then(function(htmlText){
      if(renderedPostId!==id) return;          // navigated away while loading
      var doc=new DOMParser().parseFromString(htmlText,"text/html");
      var content=doc.querySelector(".content");
      var body=(content?content.innerHTML:"<p>(no content)</p>").replace(/(["'])\.\.\//g,"$1");
      var idx=FILTERED.indexOf(p);
      var prev=idx>0?FILTERED[idx-1]:null, next=idx>=0&&idx<FILTERED.length-1?FILTERED[idx+1]:null;
      viewerEl.innerHTML='<article class="post"><h1></h1><p class="date"></p>'+
        '<div class="content">'+body+'</div></article><div class="related"></div><div class="navbtns"></div>';
      viewerEl.querySelector("h1").textContent=p.title;
      viewerEl.querySelector(".date").textContent="#"+String(p.id).padStart(4,"0")+" · "+p.date;
      if(p.by){
        var bl=document.createElement("p");
        bl.className="byline";
        bl.innerHTML='<i class="fa-solid fa-feather-pointed"></i> Guest column by <a></a>';
        var a=bl.querySelector("a"); a.textContent=p.by; a.href="#/authors/"+slugify(p.by);
        viewerEl.querySelector(".post .date").after(bl);
      }
      renderRelated(p);
      var nb=viewerEl.querySelector(".navbtns");
      nb.appendChild(prev?mkBtn('<i class="fa-solid fa-chevron-left"></i> Prev',prev.id):spacer());
      nb.appendChild(next?mkBtn('Next <i class="fa-solid fa-chevron-right"></i>',next.id):spacer());
      viewerEl.querySelectorAll(".content img").forEach(function(im){
        im.addEventListener("click",function(e){
          e.preventDefault();
          navigate(photoRoute(id,im.getAttribute("src").replace(/^images\//,"")));
        });
      });
      viewerEl.querySelectorAll(".content a").forEach(function(a){
        if(a.querySelector("img")) a.addEventListener("click",function(e){e.preventDefault()});
      });
      viewerEl.scrollTop=0;
    });
  }
  // Related posts (precomputed TF-IDF neighbours) under the post body.
  function renderRelated(p){
    var box=viewerEl.querySelector(".related"); if(!box) return;
    var rel=(p.rel||[]).map(function(id){return BYID[id]}).filter(Boolean);
    if(!rel.length){ box.remove(); return; }
    box.innerHTML='<div class="related-h">Related posts</div>';
    var base=modeDef().base();
    rel.forEach(function(r){
      var a=document.createElement("button");
      a.className="related-i";
      a.innerHTML='<span class="related-t"></span><span class="related-d"></span>';
      a.querySelector(".related-t").textContent=r.title;
      a.querySelector(".related-d").textContent=r.date;
      // stay in the current reader if the related post belongs to it, else open in the archive
      var rt=(base.indexOf(r)>=0)?postRoute(r.id):"#/post/"+r.id;
      a.addEventListener("click",function(){replaceNav(rt)});
      box.appendChild(a);
    });
  }

  // Prev/Next replaces the current history entry so "back" still leaves reading.
  function mkBtn(label,id){var b=document.createElement("button");b.className="btn";
    b.innerHTML=label;b.addEventListener("click",function(){replaceNav(postRoute(id))});return b}
  function spacer(){var s=document.createElement("span");s.className="btn";s.style.visibility="hidden";return s}

  // ---------- gallery ----------
  function galleryFiltered(){
    var q=norm(searchEl.value.trim()), y=yearEl.value, gcat=catByMode.archive;
    if(!q && !y && !gcat) return galleryItems;
    return galleryItems.filter(function(it){
      if(gcat && it.post.cat!==gcat) return false;
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

  // ---------- fullscreen image viewer ----------
  // A horizontally-paged deck of 3 recycled slides (prev / current / next).
  // Mobile gestures: drag follows the finger and snaps to the next image;
  // pinch or double-tap zooms; drag-down dismisses; tap toggles the chrome.
  var lb=$("#lightbox"), lbTrack=$("#lbTrack"), lbCap=$("#lbCap"), lbCount=$("#lbCount"),
      lbSlides=Array.prototype.slice.call(lb.querySelectorAll(".lb-slide")),
      lbImgs=lbSlides.map(function(s){return s.querySelector("img")}),
      lbList=null, lbIndex=0, lbCtx="gallery", lbMode="archive", lbPostId=null, lbBusy=false;
  function activeImg(){return lbImgs[1]}
  function vw(){return window.innerWidth}
  // Some archived full-size images are dead stubs (saved as tiny HTML error
  // pages). When the full image fails to decode, fall back to the thumbnail so
  // the slide isn't blank. The src===thumb guard stops an infinite retry loop.
  lbImgs.forEach(function(img){
    img.addEventListener("error",function(){
      var thumb=img.getAttribute("data-thumb");
      if(thumb && img.getAttribute("src")!==thumb) img.src=thumb;
    });
  });
  function escapeHtml(s){return s.replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function indexOfFull(list,f){for(var i=0;i<list.length;i++){if(list[i].f===f)return i}return -1}
  function photoHash(it){
    return lbCtx==="post"
      ? postHash(lbMode,it.post.id)+"/photo/"+encodeURIComponent(it.f)
      : "#/photo/"+encodeURIComponent(it.f);
  }

  function showLightboxState(state){
    lbCtx=state.ctx; lbMode=state.mode||"archive";
    if(state.ctx==="post"){
      showPost(state);
      var p=BYID[state.id]; if(!p){history.back();return}
      var imgs=(p.images&&p.images.length)?p.images:[{f:state.f}];
      lbList=imgs.map(function(im){return {f:im.f,t:im.t,post:p}});
      lbIndex=Math.max(0,indexOfFull(lbList,state.f));
    } else {
      showGallery();
      lbList=galleryFiltered();
      lbIndex=Math.max(0,indexOfFull(lbList,state.f));
    }
    if(!lbList.length){history.back();return}
    lb.style.background=""; lb.classList.remove("chrome-off");
    lb.classList.add("open"); lb.setAttribute("aria-hidden","false");
    resetZoom(); layoutWindow();
  }
  // Fill the 3 slides around lbIndex and recenter the track.
  function layoutWindow(){
    for(var k=-1;k<=1;k++){
      var img=lbImgs[k+1], it=lbList[lbIndex+k];
      if(it){ var full="images/"+it.f, thumb=it.t?"images/"+it.t:"";
              img.setAttribute("data-thumb",thumb);
              // skip reload if already showing this image (full or thumb fallback)
              if(img.getAttribute("src")!==full && img.getAttribute("src")!==thumb) img.src=full;
              img.parentNode.style.visibility="visible"; }
      else  { img.removeAttribute("src"); img.parentNode.style.visibility="hidden"; }
    }
    setTrack(0,false);
    lb.classList.toggle("solo",lbList.length<2);
    lb.classList.toggle("at-start",lbIndex===0);
    lb.classList.toggle("at-end",lbIndex===lbList.length-1);
    paintCap();
  }
  function paintCap(){
    var it=lbList[lbIndex]; lbPostId=it.post.id;
    lbCount.textContent=(lbIndex+1)+" / "+lbList.length;
    lbCap.innerHTML='<a class="open" href="#">'+escapeHtml(it.post.title)+'</a>'+
      '<span class="meta"> · #'+String(it.post.id).padStart(4,"0")+' · '+it.post.date+'</span>';
    lbCap.querySelector(".open").addEventListener("click",function(e){
      e.preventDefault(); navigate(postHash(lbMode,it.post.id));
    });
  }
  function setTrack(dx,animate){
    lbTrack.style.transition=animate?"transform .26s cubic-bezier(.2,.8,.2,1)":"none";
    lbTrack.style.transform="translateX("+(-vw()+dx)+"px)";
  }
  // Page by dir (-1 prev, +1 next, 0 snap back); animate, then recycle + sync URL.
  function settle(dir){
    if(dir===0 || lbIndex+dir<0 || lbIndex+dir>=lbList.length){ setTrack(0,true); return; }
    lbBusy=true; setTrack(-dir*vw(),true);
    setTimeout(function(){
      lbIndex+=dir; resetZoom(); layoutWindow();
      history.replaceState(null,"",photoHash(lbList[lbIndex]));   // silent — no re-render
      lbBusy=false;
    },270);
  }
  function go(dir){ if(!lbBusy) settle(dir); }
  function hideLb(){
    lb.classList.remove("open"); lb.setAttribute("aria-hidden","true"); lb.style.background="";
    lbImgs.forEach(function(im){im.removeAttribute("src")}); lbList=null; resetZoom();
  }
  function toggleChrome(){ lb.classList.toggle("chrome-off"); }

  // ---- pinch-zoom / pan on the active slide ----
  var zScale=1, zX=0, zY=0, ZMAX=4, DTAP=2.5;
  function applyZoom(animate){
    var im=activeImg();
    im.style.transition=animate?"transform .2s ease":"none";
    im.style.transform="translate("+zX+"px,"+zY+"px) scale("+zScale+")";
    lb.classList.toggle("zoomed", zScale>1.01);
  }
  function resetZoom(){
    zScale=1; zX=0; zY=0;
    lbImgs.forEach(function(im){im.style.transition="none"; im.style.transform=""});
    lb.classList.remove("zoomed");
  }
  function clampPan(){
    var im=activeImg();
    var mx=Math.max(0,(im.clientWidth*zScale-vw())/2);
    var my=Math.max(0,(im.clientHeight*zScale-window.innerHeight)/2);
    zX=Math.max(-mx,Math.min(mx,zX)); zY=Math.max(-my,Math.min(my,zY));
  }
  function zoomAt(px,py,s,animate){
    s=Math.max(1,Math.min(ZMAX,s));
    var r=activeImg().getBoundingClientRect();
    var cx=(r.left+r.right)/2, cy=(r.top+r.bottom)/2;
    zX+=(px-cx)*(1-s/zScale); zY+=(py-cy)*(1-s/zScale);
    zScale=s; if(zScale<=1.01){zScale=1;zX=0;zY=0;}
    clampPan(); applyZoom(animate);
  }

  // ---- unified gesture handling ----
  var ptrs=new Map(), gotPinch=false, pinchDist=0, pinchMid=null,
      panFrom=null, axis=null, gestureMoved=false, lastTap=0, tapTimer=null, downTarget=null;
  function pts(){return Array.from(ptrs.values())}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function mid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}

  lb.addEventListener("pointerdown",function(e){
    if(e.target.closest(".lb-btn,.lb-arrow,.lb-cap a")) return;   // let controls handle their click
    if(lbBusy) return;
    downTarget=e.target;                  // capture retargets later events to lb; remember the real one
    lb.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    gestureMoved=false; axis=null;
    if(ptrs.size===2){gotPinch=true;var p=pts();pinchDist=dist(p[0],p[1]);pinchMid=mid(p[0],p[1])}
    else panFrom={x:e.clientX,y:e.clientY,zX:zX,zY:zY,sx:e.clientX,sy:e.clientY,t:e.timeStamp};
  });
  lb.addEventListener("pointermove",function(e){
    if(!ptrs.has(e.pointerId))return;
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    var p=pts();
    if(p.length>=2){                                   // pinch
      var d=dist(p[0],p[1]), m=mid(p[0],p[1]);
      if(pinchMid){zX+=m.x-pinchMid.x;zY+=m.y-pinchMid.y}
      zoomAt(m.x,m.y,zScale*(d/pinchDist),false);
      pinchDist=d; pinchMid=m; gestureMoved=true; return;
    }
    if(!panFrom)return;
    var dx=e.clientX-panFrom.sx, dy=e.clientY-panFrom.sy;
    if(!axis && (Math.abs(dx)>8||Math.abs(dy)>8)){ axis=Math.abs(dx)>Math.abs(dy)?"x":"y"; gestureMoved=true; }
    if(!axis)return;
    if(zScale>1){                                      // pan the zoomed image
      zX=panFrom.zX+dx; zY=panFrom.zY+dy; clampPan(); applyZoom(false);
    } else if(axis==="x"){                             // page — track follows the finger (resist at ends)
      var t=dx;
      if((lbIndex===0&&dx>0)||(lbIndex===lbList.length-1&&dx<0)) t=dx*0.35;
      setTrack(t,false);
    } else {                                           // drag down to dismiss
      var prog=Math.min(1,Math.abs(dy)/320);
      lbTrack.style.transition="none";
      lbTrack.style.transform="translateX("+(-vw())+"px) translateY("+dy+"px)";
      lb.style.background="rgba(8,11,18,"+(0.985*(1-prog*0.7))+")";
    }
  });
  function endPointer(e){
    if(!ptrs.has(e.pointerId))return;
    ptrs.delete(e.pointerId);
    if(ptrs.size===1){                                 // pinch released down to one finger — rebase pan
      var o=pts()[0]; panFrom={x:o.x,y:o.y,zX:zX,zY:zY,sx:o.x,sy:o.y,t:e.timeStamp}; pinchMid=null; axis=null;
      if(zScale<=1.01) resetZoom();
      return;
    }
    if(ptrs.size>0) return;
    var touch=e.pointerType!=="mouse";
    if(!gotPinch && !gestureMoved){                    // a tap / click (no movement)
      if(touch){
        if(e.timeStamp-lastTap<300){ lastTap=0; clearTimeout(tapTimer); zoomAt(e.clientX,e.clientY,zScale>1?1:DTAP,true); }
        else { lastTap=e.timeStamp; tapTimer=setTimeout(toggleChrome,300); }   // tap = toggle chrome (wait out a 2nd tap)
      } else if(downTarget && downTarget.tagName==="IMG"){ toggleChrome(); }   // click image = toggle chrome
      else { history.back(); }                                                 // click dark area = close
      gotPinch=false; panFrom=null; return;
    }
    if(panFrom && !gotPinch && zScale<=1){
      var dx=e.clientX-panFrom.sx, dy=e.clientY-panFrom.sy, dt=(e.timeStamp-panFrom.t)||1;
      if(axis==="x"){
        if(dx<=-vw()*0.18 || dx/dt<-0.5) settle(1);
        else if(dx>=vw()*0.18 || dx/dt>0.5) settle(-1);
        else settle(0);
      } else if(axis==="y"){
        if(dy>110 || dy/dt>0.6){ lbTrack.style.transition="transform .2s ease"; history.back(); }
        else { lb.style.background=""; setTrack(0,true); }
      }
    }
    gotPinch=false; panFrom=null; axis=null; pinchMid=null;
  }
  lb.addEventListener("pointerup",endPointer);
  lb.addEventListener("pointercancel",endPointer);
  lb.addEventListener("dblclick",function(e){
    if(e.target.closest(".lb-btn,.lb-arrow"))return;
    e.preventDefault(); zoomAt(e.clientX,e.clientY,zScale>1?1:DTAP,true);
  });
  lb.addEventListener("wheel",function(e){
    e.preventDefault(); zoomAt(e.clientX,e.clientY,zScale*(e.deltaY<0?1.15:0.87),false);
  },{passive:false});

  $("#lbClose").addEventListener("click",function(){history.back()});
  $("#lbPrev").addEventListener("click",function(){go(-1)});
  $("#lbNext").addEventListener("click",function(){go(1)});
  $("#lbOpen").addEventListener("click",function(){ if(lbPostId!=null) navigate(postHash(lbMode,lbPostId)); });
  document.addEventListener("keydown",function(e){
    if(!lb.classList.contains("open"))return;
    if(e.key==="Escape")history.back();
    else if(e.key==="ArrowLeft")go(-1);
    else if(e.key==="ArrowRight")go(1);
  });
  window.addEventListener("resize",function(){
    if(!lb.classList.contains("open"))return;
    if(zScale>1){clampPan();applyZoom(false)} else setTrack(0,false);
  });

  // ---------- inputs ----------
  var deb;
  searchEl.addEventListener("input",function(){clearTimeout(deb);deb=setTimeout(apply,180)});
  yearEl.addEventListener("change",apply);
  sortEl.addEventListener("change",apply);
})();
