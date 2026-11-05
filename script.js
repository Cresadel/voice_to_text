(function(){
  var $=function(id){return document.getElementById(id)};
  var text=$('text'),title=$('title'),interim=$('interim'),statusEl=$('status'),mic=$('micBtn'),app=$('app'),move=$('move'),langSel=$('lang');
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  var rec=null,listening=false,wantStop=false,startedAt=0,elapsed=0,tick=null,lastFinal=0;

  /* ---------- environment ---------- */
  var FILE_MODE=location.protocol==='file:';
  function fileWarning(){
    warn('Voice recognition needs a local server. In VS Code install “Live Server”, right-click index.html and choose “Open with Live Server”, then use the localhost link. Opening the file directly (file://) blocks the microphone.');
  }

  /* ---------- languages ---------- */
  var LANGS=[['en-US','English'],['fil-PH','Filipino (Tagalog)'],['ceb','Bisaya (best effort)']];
  var ENGINE={'en-US':'en-PH','fil-PH':'fil-PH','ceb':'fil-PH'};
  LANGS.forEach(function(l){var o=document.createElement('option');o.value=l[0];o.textContent=l[1];langSel.appendChild(o)});
  var dlg=$('langDlg'),grid=$('langGrid'),langChosen=false;
  function closeLangDlg(){try{if(dlg.open)dlg.close()}catch(e){}dlg.removeAttribute('open')}
  function openLangDlg(){
    if(!dlg)return;
    if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}
    else dlg.setAttribute('open','');
  }
  LANGS.forEach(function(l){
    var b=document.createElement('button');b.type='button';b.textContent=l[1];
    b.onclick=function(){setLang(l[0]);closeLangDlg();start()};
    grid.appendChild(b);
  });
  function setLang(v){langSel.value=v;langChosen=true;try{localStorage.setItem('ln_lang',v)}catch(e){}renderLang()}
  function renderLang(){
    var box=$('langOpts');
    if(!box.children.length){LANGS.forEach(function(l){
      var b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.dataset.v=l[0];b.textContent=l[1];
      b.onclick=function(){var was=listening;setLang(l[0]);if(was){stop();setTimeout(start,300)}};
      box.appendChild(b);
    })}
    Array.prototype.forEach.call(box.children,function(b){var on=b.dataset.v===langSel.value;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
    
  }
  langSel.onchange=function(){setLang(this.value);if(listening){stop();setTimeout(start,300)}};

  /* ---------- data ---------- */
  var S=null;
  try{S=JSON.parse(localStorage.getItem('ln_data'))}catch(e){}
  if(!S||!S.folders||!S.folders.length)S={folders:[{id:'f1',name:'General'}],notes:[],fid:'f1',nid:null};
  function persist(){try{localStorage.setItem('ln_data',JSON.stringify(S))}catch(e){}}
  function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
  function cur(){for(var i=0;i<S.notes.length;i++)if(S.notes[i].id===S.nid)return S.notes[i];return null}
  function inFolder(id){return S.notes.filter(function(n){return n.fid===id}).sort(function(a,b){return b.t-a.t})}
  function ensure(){
    var n=cur();
    if(!n){n={id:uid(),fid:S.fid,title:title.value||'Untitled lecture',text:text.value,t:Date.now()};S.notes.push(n);S.nid=n.id;renderAll()}
    return n;
  }
  function toast(m){var t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('show')},1800)}
  function warn(m){var w=$('warn');w.textContent=m;w.style.display='block'}
  function fmt(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

  /* ---------- rendering ---------- */
  function mk(html,cls){var li=document.createElement('li');if(cls)li.className=cls;li.innerHTML=html;return li}
  function renderFolders(){
    var ul=$('folders');ul.innerHTML='';
    S.folders.forEach(function(f){
      var li=mk('<button class="it"><svg class="i"><use href="#folder"/></svg><span></span><em></em></button><button class="x dl" aria-label="Download folder"><svg class="i"><use href="#down"/></svg></button><button class="x del" aria-label="Delete folder"><svg class="i"><use href="#trash"/></svg></button>',f.id===S.fid?'on':'');
      li.querySelector('span').textContent=f.name;
      li.querySelector('em').textContent=inFolder(f.id).length;
      li.querySelector('.it').onclick=function(){switchTo(f.id,null)};
      li.querySelector('.del').onclick=function(){delFolder(f)};li.querySelector('.dl').onclick=function(){downloadFolder(f)};
      ul.appendChild(li);
    });
    move.innerHTML='';
    S.folders.forEach(function(f){var o=document.createElement('option');o.value=f.id;o.textContent=f.name;move.appendChild(o)});
    move.value=S.fid;
  }
  function renderNotes(){
    var ul=$('notes'),list=inFolder(S.fid),f=S.folders.filter(function(x){return x.id===S.fid})[0];
    $('fname').textContent='Notes in '+(f?f.name:'');
    ul.innerHTML='';
    if(!list.length){ul.appendChild(mk('Empty. Press the microphone to make your first note here.','empty'));return}
    list.forEach(function(n){
      var li=mk('<button class="it"><svg class="i"><use href="#file"/></svg><span></span><em></em></button><button class="x dl" aria-label="Download note"><svg class="i"><use href="#down"/></svg></button>',n.id===S.nid?'on':'');
      li.querySelector('span').textContent=n.title;
      li.querySelector('em').textContent=new Date(n.t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
      li.querySelector('.it').onclick=function(){switchTo(S.fid,n.id)};li.querySelector('.dl').onclick=function(){downloadNote(n)};
      ul.appendChild(li);
    });
  }
  function updFoot(){var f=S.folders.filter(function(x){return x.id===S.fid})[0];$('saved').textContent='Saved in the “'+(f?f.name:'')+'” folder'}
  function renderAll(){updFoot();renderFolders();renderNotes();persist()}
  function count(){var s=text.value.trim(),n=s?s.split(/\s+/).length:0;$('count').textContent=n+(n===1?' word':' words')}
  function openNote(){var n=cur();text.value=n?(n.text||''):'';title.value=n?(n.title||''):'';count()}
  function switchTo(fid,nid){
    if(listening)stop();
    S.fid=fid;
    S.nid=nid;elapsed=0;$('timer').textContent='00:00';statusEl.textContent='Ready to listen';
    renderAll();openNote();
  }
  function delFolder(f){
    if(S.folders.length<2)return toast('You need at least one folder');
    var n=inFolder(f.id).length;
    if(!confirm('Delete folder "'+f.name+'"'+(n?' and its '+n+' note(s)?':'?')))return;
    S.notes=S.notes.filter(function(x){return x.fid!==f.id});
    S.folders=S.folders.filter(function(x){return x.id!==f.id});
    switchTo(S.folders[0].id,null);
  }

  /* ---------- editing ---------- */
  function sync(){
    if(!cur()&&!text.value.trim()){count();return}
    var n=ensure();n.text=text.value;persist();count();
  }
  text.oninput=sync;
  title.oninput=function(){var n=cur();if(n){n.title=title.value||'Untitled lecture';renderNotes();persist()}};
  $('addF').onclick=function(){
    var name=(prompt('Folder name (example: Math, History)')||'').trim();
    if(!name)return;
    var f={id:uid(),name:name.slice(0,40)};S.folders.push(f);switchTo(f.id,null);toast('Folder created');
  };
  $('addN').onclick=function(){
    if(listening)stop();
    S.nid=null;text.value='';title.value='';elapsed=0;$('timer').textContent='00:00';
    var n=ensure();n.text='';persist();renderAll();text.focus();
  };
  move.onchange=function(){
    var n=cur();S.fid=move.value;
    if(n){n.fid=move.value;toast('Moved to folder')}
    renderAll();
  };
  $('del').onclick=function(){
    var n=cur();
    if(!n){text.value='';count();return}
    if(!confirm('Delete this note?'))return;
    S.notes=S.notes.filter(function(x){return x.id!==n.id});
    switchTo(S.fid,null);
  };
  $('copyBtn').onclick=function(){
    var out=title.value+'\n\n'+text.value;
    function fallback(){text.select();try{document.execCommand('copy')}catch(e){}toast('Notes copied')}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out).then(function(){toast('Notes copied')}).catch(fallback)}
    else fallback();
  };
  $('bullets').onclick=function(){
    var t=text.value.replace(/^•\s*/gm,'').replace(/\s+/g,' ').trim();
    if(!t)return toast('Nothing to format yet');
    text.value=t.split(/(?<=[.!?。])\s+/).map(function(p){return '• '+p}).join('\n');sync();toast('Converted to bullet points');
  };

  /* ---------- download + drawer ---------- */
  function saveFile(name,content){
    var a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
    a.href=url;
    a.download=((name||'').replace(/[^\w\- ]+/g,'').trim()||'lecture-notes')+'.txt';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){try{URL.revokeObjectURL(url)}catch(e){}},1000);
    toast('Downloaded '+a.download);
  }
  function noteTxt(n){return (n.title||'Untitled lecture')+'\n'+new Date(n.t).toLocaleString()+'\n\n'+(n.text||'')}
  function downloadNote(n){if(!n||!(n.text||'').trim())return toast('Nothing to download yet');saveFile(n.title,noteTxt(n))}
  function downloadFolder(f){
    var l=inFolder(f.id).filter(function(n){return (n.text||'').trim()});
    if(!l.length)return toast('This folder has no notes yet');
    saveFile(f.name,l.map(noteTxt).join('\n\n----------------------------------------\n\n'));
  }
  $('dl').onclick=function(){downloadNote(cur())};
  function drawer(o){document.body.classList.toggle('dopen',o)}
  $('openDrawer').onclick=function(){drawer(true)};
  $('closeDrawer').onclick=$('scrim').onclick=function(){drawer(false)};
  $('notes').addEventListener('click',function(e){if(e.target.closest('.it'))drawer(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')drawer(false)});

  /* ---------- voice ---------- */
  function appendFinal(raw){
    var s=raw.trim();if(!s)return;
    s=s.charAt(0).toUpperCase()+s.slice(1);
    if(!/[.!?…。！？]$/.test(s))s+='.';
    var now=Date.now(),c=text.value.replace(/\s+$/,''),para=c&&(now-lastFinal>8000);
    text.value=c?c+(para?'\n':' ')+s:s;
    lastFinal=now;text.scrollTop=text.scrollHeight;sync();
  }
  function setIcon(id){$('micIcon').innerHTML='<use href="#'+id+'"/>';$('micLbl').textContent=id==='stop'?'Stop recording':'Start recording'}
  if(!SR){warn('Voice recognition is not supported in this browser. Use Chrome or Edge, and open the page with Live Server (localhost).');mic.disabled=true;mic.style.opacity=.5}

  /* ---------- mic level meter (shows if your mic really hears you) ---------- */
  var actx=null,mstream=null,raf=0,meterBusy=false;
  function stopMeter(){
    cancelAnimationFrame(raf);
    if(mstream){mstream.getTracks().forEach(function(t){t.stop()});mstream=null}
    if(actx){try{actx.close()}catch(e){}actx=null}
    $('level').style.width='0';
  }
  function startMeter(){
    if(meterBusy||mstream)return;
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return;
    meterBusy=true;
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(st){
      meterBusy=false;
      if(!listening){st.getTracks().forEach(function(t){t.stop()});return}
      mstream=st;actx=new (window.AudioContext||window.webkitAudioContext)();
      var an=actx.createAnalyser();an.fftSize=512;actx.createMediaStreamSource(st).connect(an);
      var buf=new Uint8Array(an.fftSize),t0=Date.now(),best=0,told=false;
      (function loop(){
        if(!actx)return;
        an.getByteTimeDomainData(buf);
        var p=0;for(var i=0;i<buf.length;i++){var v=Math.abs(buf[i]-128)/128;if(v>p)p=v}
        if(p>best)best=p;
        $('level').style.width=Math.min(100,p*180)+'%';
        if(!told&&Date.now()-t0>6000&&best<0.05){told=true;warn('Your microphone is very quiet. Move closer, and in Windows Settings > Sound > Input choose the right microphone and raise its volume.')}
        raf=requestAnimationFrame(loop);
      })();
    }).catch(function(){meterBusy=false});
  }

  var LANGCANDS={'en-US':['en-PH','en-US'],'fil-PH':['fil-PH','tl-PH'],'ceb':['fil-PH','tl-PH']},cands=[],curLang='',gotStart=false;
  function failFast(){            /* the session ended right away: try another engine code, then explain */
    if(cands.length){
      curLang=cands.shift();toast('Trying '+curLang+'…');
      try{rec.abort()}catch(e){}
      build();gotStart=false;statusEl.textContent='Starting…';
      try{rec.start()}catch(e){stop(true)}
      return;
    }
    wantStop=true;
    warn('Voice recognition stopped right away. Click Allow for the microphone (lock icon in the address bar), check your internet, and try Google Chrome. This browser may not support the chosen language.');
    stop(true);
  }
  function build(){
    var r=new SR();rec=r;var t0=Date.now();
    r.onstart=function(){gotStart=true;t0=Date.now();if(listening){statusEl.textContent='Listening…';startMeter()}};
    r.continuous=true;r.interimResults=true;r.lang=curLang||ENGINE[langSel.value]||'en-US';
    r.onresult=function(e){
      var live='';
      for(var i=e.resultIndex;i<e.results.length;i++){
        var x=e.results[i];
        if(x.isFinal)appendFinal(x[0].transcript);else live+=x[0].transcript;
      }
      interim.textContent=listening?live:'';
    };
    r.onerror=function(e){
      if(e.error==='not-allowed'||e.error==='service-not-allowed'){
        wantStop=true;
        warn('Microphone is blocked. Click the lock icon in the address bar, allow the microphone, and open the page through Live Server (localhost).');
      }else if(e.error==='language-not-supported'){
        wantStop=true;warn('This browser can’t recognize that language. Choose another one from the language menu.');
      }else if(e.error==='network'){warn('The speech service could not be reached. Check your internet connection. Chrome usually works better than Edge for voice recognition.')}else if(e.error==='no-speech'){statusEl.textContent='Listening… no speech heard yet'}
      else if(e.error!=='aborted'){statusEl.textContent='Error: '+e.error}
    };
    r.onend=function(){
      if(r!==rec)return;
      interim.textContent='';
      if(listening&&!wantStop){
        if(!gotStart){failFast();return}
        gotStart=false;t0=Date.now();
        try{r.start()}catch(err){stop(true)}
      }
      else if(listening){stop(true)}
      else{rec=null}
    };
  }
  var pending=null,starting=false;
  function start(){
    if(!SR||starting)return;
    if(pending){                                  /* an old session is still closing: close it first */
      var p=pending;pending=null;p.onresult=null;try{p.abort()}catch(e){}
      starting=true;setTimeout(function(){starting=false;begin()},300);return;
    }
    begin();
  }
  function begin(retry){
    $('warn').style.display='none';
    if(FILE_MODE){fileWarning();return}
    ensure();
    if(rec){try{rec.abort()}catch(e){}rec=null}
    cands=(LANGCANDS[langSel.value]||[ENGINE[langSel.value]||'en-US']).slice();curLang=cands.shift();gotStart=false;statusEl.textContent='Starting…';
    build();wantStop=false;
    try{rec.start()}catch(e){
      rec=null;
      if(!retry){starting=true;setTimeout(function(){starting=false;begin(true)},300)}
      else statusEl.textContent='Could not start. Please click again.';
      return;
    }
    listening=true;startedAt=Date.now()-elapsed*1000;lastFinal=0;
    app.classList.add('live');mic.setAttribute('aria-label','Stop recording');setIcon('stop');
    setTimeout(function(){if(listening&&!gotStart)statusEl.textContent='Waiting for the microphone… click Allow in the address bar.'},3500);
    clearInterval(tick);
    tick=setInterval(function(){elapsed=Math.floor((Date.now()-startedAt)/1000);$('timer').textContent=fmt(elapsed)},500);
  }
  function stop(fromEnd){
    listening=false;wantStop=true;
    clearInterval(tick);                       /* UI stops right away */
    stopMeter();
    app.classList.remove('live');mic.setAttribute('aria-label','Start recording');setIcon('mic');
    statusEl.textContent=elapsed?'Stopped · '+fmt(elapsed)+' recorded':'Ready to listen';
    interim.textContent='';
    var r=rec;rec=null;
    if(r&&!fromEnd){
      pending=r;r.onerror=null;
      r.onend=function(){if(pending===r)pending=null};
      try{r.stop()}catch(e){}                  /* lets the last sentence finish */
      setTimeout(function(){if(pending===r){pending=null;try{r.abort()}catch(e){}}r.onresult=null},1500);
    }
  }
  function requestStart(){
    if(!SR)return;
    if(FILE_MODE){fileWarning();return}
    if(!langChosen){openLangDlg();return}
    start();
  }
  function toggle(){try{listening?stop():requestStart()}catch(err){warn('Error: '+err.message)}}
  mic.addEventListener('click',toggle);
  
  window.addEventListener('error',function(e){warn('Script error: '+e.message)});
  window.addEventListener('unhandledrejection',function(e){var m=e.reason&&e.reason.message?e.reason.message:String(e.reason||'Unknown error');warn('Error: '+m)});
  $('theme').onclick=function(){
    var r=document.documentElement,d=(r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark';
    var nx=d?'light':'dark';r.setAttribute('data-theme',nx);try{localStorage.setItem('ln_theme',nx)}catch(e){}
  };

  /* ---------- start ---------- */
  try{
    var l=localStorage.getItem('ln_lang');
    if(l&&ENGINE[l]){langSel.value=l;langChosen=true}else{langSel.value=''}
    var t=localStorage.getItem('ln_theme');if(t)document.documentElement.setAttribute('data-theme',t);
  }catch(e){langSel.value=''}
  S.nid=null;   /* always open on a blank page */
  renderAll();openNote();renderLang();
  if(FILE_MODE)fileWarning();
  
})();
