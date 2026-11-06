(function(){
  var $=function(id){return document.getElementById(id)};
  var text=$('text'),title=$('title'),interim=$('interim'),statusEl=$('status'),mic=$('micBtn'),app=$('app'),move=$('move'),readBtn=$('readBtn'),readLbl=$('readLbl');
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  var rec=null,listening=false,wantStop=false,startedAt=0,elapsed=0,tick=null,lastFinal=0;

  /* ---------- environment ---------- */
  var FILE_MODE=location.protocol==='file:';
  function fileWarning(){
    warn('Voice recognition needs a local server. In VS Code install “Live Server”, right-click index.html and choose “Open with Live Server”, then use the localhost link. Opening the file directly (file://) blocks the microphone.');
  }

  /* ---------- automatic language detection ---------- */
  var ENGINES={fil:['fil-PH','tl-PH'],en:['en-PH','en-US']};
  var LANG_LABEL={en:'English',tl:'Tagalog',ceb:'Bisaya',mix:'Mixed'};
  var activeGroup='fil';
  var detectBuf=[],lastSwitchAt=0,switchCount=0;
  var lastLang='',lastLangConf=0,statusBase='Ready to listen',sessionStart=0,sessionCleaned=false;

  function setStatus(t){
    statusBase=t;
    var show=lastLang&&(t.indexOf('Listening')===0||t.indexOf('Stopped')===0);
    statusEl.textContent=show?t+' · '+LANG_LABEL[lastLang]:t;
  }

  function wordSet(list,weight){var o={};list.forEach(function(w){o[w]=weight});return o}
  var SHARED='ang sa ay at si ni kay ako ikaw siya kami tayo kayo sila ito iyon iyan mga na lang ba mag gusto ayaw salamat wala pwede puwede pero din rin'.split(' ');
  var TAGALOG='ng hindi po opo naman kasi kaya daw raw lamang mayroon magandang mabuti ngayon bukas kahapon ano sino saan bakit paano kailan ilan magkano ko mo yan yung kumain'.split(' ');
  var BISAYA='nga ug dili naa adunay nako nimo niya namo ninyo nila akoa imoha iyaha kini kana kadtong unsa kinsa asa kanus-a ngano giunsa pila tagpila mao kon ganahan maayo nindot karon kakaroon ugma gahapon palihug kaayo sad pud sab lagi diay bitaw ambot ari adto dinhi didto unsaon buhat lakaw kaon inom tulog mata eskwela trabaho kuan tawo balay adlaw buntag gabii pagkaon eskwelahan'.split(' ');
  var ENGLISH='the is are was were and of to in that this with for on you we they he she have has had not no what how why can could will would should because about from at as be been being do does did so if but or my your our their there here when where who which then than also into more most some any only just very hi hello hey good morning afternoon evening night today tomorrow yesterday now going gonna want need know think see say said tell talk discuss class lecture lesson example question answer okay ok yes yeah right well really actually maybe probably please thank thanks welcome everyone people student students teacher professor subject topic chapter page number first second third next last time day week year before after while during through between under over again still even much many lot little big small new old same different important remember understand follow start finish continue write read speak listen open close look find help work study learn teach school university college dog cat book pen food water house friend family dont cant wont im ive ill id youre theyre weve isnt arent didnt doesnt couldnt wouldnt shouldnt thats whats lets hes shes its'.split(' ');
  var W_SHARED=wordSet(SHARED,1),W_TAGALOG=wordSet(TAGALOG,2),W_BISAYA=wordSet(BISAYA,2),W_ENGLISH=wordSet(ENGLISH,1);

  function words(s){return (s.toLowerCase().replace(/['\u2019]/g,'').match(/[a-z\u00e0-\u00ff\u00f1]+/g)||[])}
  function wordScore(list,set){var n=0;for(var i=0;i<list.length;i++)n+=(set[list[i]]||0);return n}
  function altScore(s){
    var w=words(s);
    if(lastLang==='ceb')return wordScore(w,W_BISAYA)*2+wordScore(w,W_SHARED);
    if(lastLang==='tl')return wordScore(w,W_TAGALOG)*2+wordScore(w,W_SHARED);
    if(lastLang==='mix')return wordScore(w,W_ENGLISH)+Math.max(wordScore(w,W_TAGALOG),wordScore(w,W_BISAYA))*2+wordScore(w,W_SHARED);
    if(lastLang==='en'||activeGroup==='en')return wordScore(w,W_ENGLISH);
    return 0;
  }
  function detectLanguage(s){
    var w=words(s);
    if(w.length<6)return null;
    var shared=wordScore(w,W_SHARED);
    var en=wordScore(w,W_ENGLISH);
    var tl=wordScore(w,W_TAGALOG)+shared;
    var ceb=wordScore(w,W_BISAYA)+shared;
    var fil=Math.max(tl,ceb);
    var markers=en+fil;
    if(!markers)return {group:activeGroup,lang:activeGroup==='en'?'en':'tl',conf:0,langConf:0,markers:0,total:w.length,en:en,tl:tl,ceb:ceb};
    var low=Math.min(en,fil),high=Math.max(en,fil);
    var mixed=low>=3&&high>0&&low/high>=0.6;
    var group=mixed?'fil':(en>=fil?'en':'fil');
    var conf=high/markers;
    var lang=mixed?'mix':(group==='en'?'en':(ceb>=tl&&ceb>0?'ceb':'tl'));
    var langConf=mixed?low/high:lang==='ceb'?ceb/(ceb+tl+1):lang==='tl'?tl/(ceb+tl+1):conf;
    return {group:group,lang:lang,conf:conf,langConf:langConf,mixed:mixed,markers:markers,total:w.length,en:en,tl:tl,ceb:ceb};
  }

  var BISAYA_PHRASES=[
    [/\bkakaroon\b/gi,'karon'],
    [/\bkumain ka na\b/gi,'kaon ka na'],
    [/\bkain ka na\b/gi,'kaon ka na'],
    [/\byung mga\b/gi,'ang mga'],
    [/\bor no pa\b/gi,'o wala pa'],
    [/\bo no pa\b/gi,'o wala pa'],
    [/\bmagandang umaga\b/gi,'maayong buntag'],
    [/\bmagandang hapon\b/gi,'maayong hapon'],
    [/\bmagandang gabi\b/gi,'maayong gabii'],
    [/\btechlin\b/gi,'ta']
  ];
  var BISAYA_WORDS=[
    [/\bkumain\b/gi,'kaon'],
    [/\bkain\b/gi,'kaon'],
    [/\bhindi\b/gi,'dili'],
    [/\bbakit\b/gi,'ngano'],
    [/\bsaan\b/gi,'asa'],
    [/\bsino\b/gi,'kinsa'],
    [/\bano\b/gi,'unsa'],
    [/\bpaano\b/gi,'unsaon'],
    [/\bkailan\b/gi,'kanus-a'],
    [/\bilan\b/gi,'pila'],
    [/\bmagkano\b/gi,'tagpila'],
    [/\bngayon\b/gi,'karon'],
    [/\btao\b/gi,'tawo'],
    [/\bmaganda\b/gi,'nindot'],
    [/\bmabuti\b/gi,'maayo'],
    [/\bbahay\b/gi,'balay'],
    [/\baraw\b/gi,'adlaw'],
    [/\bumaga\b/gi,'buntag'],
    [/\bgabi\b/gi,'gabii'],
    [/\bpaaralan\b/gi,'eskwelahan'],
    [/\bpagkain\b/gi,'pagkaon']
  ];
  function bisayaCleanup(s){
    var w=words(s),ceb=wordScore(w,W_BISAYA),tl=wordScore(w,W_TAGALOG);
    var ok=lastLang==='ceb'?lastLangConf>=0.45:lastLang==='mix'?lastLangConf>=0.5&&ceb>0&&ceb>=tl:false;
    if(!ok)return s;
    var out=s;
    BISAYA_PHRASES.forEach(function(p){out=out.replace(p[0],p[1])});
    BISAYA_WORDS.forEach(function(p){out=out.replace(p[0],p[1])});
    return out;
  }
  function cleanSession(){
    if(text.value.length<=sessionStart)return;
    var head=text.value.slice(0,sessionStart),tail=text.value.slice(sessionStart),out=bisayaCleanup(tail);
    if(out!==tail){text.value=head+out;sync()}
  }

  function autoDetect(raw){
    detectBuf.push(raw);
    var all=words(detectBuf.join(' '));
    if(all.length>45){all=all.slice(-45);detectBuf=[all.join(' ')]}
    var d=detectLanguage(all.join(' '));
    var cd=detectLanguage(raw);
    if(!d)return;
    var sd=(cd&&cd.markers>=3)?cd:d;
    if(sd.markers>=3){
      if(sd.lang!==lastLang){lastLang=sd.lang;lastLangConf=sd.langConf;if(listening)setStatus(statusBase)}
      else if(sd.langConf>lastLangConf)lastLangConf=sd.langConf;
      var canClean=lastLang==='ceb'?lastLangConf>=0.45:lastLang==='mix'?lastLangConf>=0.5:false;
      if(!canClean)sessionCleaned=false;
      if(canClean&&!sessionCleaned){sessionCleaned=true;cleanSession()}
    }
    var now=Date.now();
    var mixMode=d.lang==='mix'||sd.lang==='mix';
    if(mixMode){
      if(activeGroup!=='fil'&&switchCount<3&&now-lastSwitchAt>=14000){
        activeGroup='fil';detectBuf=[];lastSwitchAt=now;switchCount++;
        if(listening){begin(true);lastFinal=Date.now()}
      }
      return;
    }
    var sw=(sd.markers>=5)?sd:d;
    if(sw.group===activeGroup)return;
    if(switchCount>=3)return;
    if(now-lastSwitchAt<14000)return;
    if(sw.markers<5||sw.conf<0.6)return;
    activeGroup=sw.group;
    detectBuf=[];lastSwitchAt=now;switchCount++;
    if(listening){begin(true);lastFinal=Date.now()}
  }

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
    stopSpeaking();
    if(listening)stop();
    S.fid=fid;
    S.nid=nid;elapsed=0;lastLang='';lastLangConf=0;$('timer').textContent='00:00';setStatus('Ready to listen');
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
    S.nid=null;text.value='';title.value='';elapsed=0;lastLang='';lastLangConf=0;$('timer').textContent='00:00';
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
    var rawText=s;
    var now=Date.now(),c=text.value.replace(/\s+$/,'');
    var para=c&&(now-lastFinal>8000);
    var sentence=c&&(now-lastFinal>3500);
    var startsNew=!c||para||sentence||/[.!?…。！？]$/.test(c);
    if(startsNew)s=s.charAt(0).toUpperCase()+s.slice(1);
    if(!/[.!?…。！？,;:]$/.test(s)){
      var wc=s.split(/\s+/).length;
      if(para||sentence||wc>=10)s+='.';
    }
    var out=bisayaCleanup(s);
    text.value=c?c+(para?'\n':' ')+out:out;
    lastFinal=now;text.scrollTop=text.scrollHeight;sync();autoDetect(rawText);
  }
  function setIcon(id){$('micIcon').innerHTML='<use href="#'+id+'"/>';$('micLbl').textContent=id==='stop'?'Stop recording':'Start recording'}

  /* ---------- read aloud ---------- */
  var speaking=false,currentSpeak=null;
  function pickVoice(g){
    if(!window.speechSynthesis)return null;
    var voices=window.speechSynthesis.getVoices()||[],i,n;
    for(i=0;i<voices.length;i++){
      n=(voices[i].name||'').toLowerCase();
      if(n.indexOf('natasha')!==-1&&(voices[i].lang||'').toLowerCase().indexOf('en-au')===0)return voices[i];
    }
    for(i=0;i<voices.length;i++)if((voices[i].name||'').toLowerCase().indexOf('natasha')!==-1)return voices[i];
    var prefs=g==='en'?['en-PH','en-US','en-GB','en-AU','en']:['fil-PH','tl-PH','fil','tl','en-PH','en-US'];
    for(var p=0;p<prefs.length;p++)for(i=0;i<voices.length;i++){
      var vl=(voices[i].lang||'').toLowerCase(),pl=prefs[p].toLowerCase();
      if(vl.indexOf(pl)===0)return voices[i];
    }
    return null;
  }
  function stopSpeaking(){
    var old=currentSpeak;currentSpeak=null;
    if(old){old.onend=null;old.onerror=null}
    speaking=false;
    if(window.speechSynthesis){try{window.speechSynthesis.cancel()}catch(e){}}
    if(readBtn){readBtn.classList.remove('on');readBtn.setAttribute('aria-pressed','false');readBtn.setAttribute('aria-label','Read aloud')}
    if(readLbl)readLbl.textContent='Read';
  }
  function readAloud(){
    if(!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=='function')return toast('This browser cannot read text aloud');
    if(speaking){stopSpeaking();return}
    var body=(text.value||'').trim();
    if(!body)return toast('Nothing to read yet');
    var lang=lastLang;
    if(!lang){
      var d=detectLanguage(body);
      if(d&&d.markers)lang=d.lang;
      else lang=wordScore(words(body),W_ENGLISH)>0?'en':'tl';
    }
    var isEn=lang==='en';
    var u=new window.SpeechSynthesisUtterance((title.value?title.value+'. ':'')+body);
    var v=pickVoice(isEn?'en':'fil');
    u.lang=v&&v.lang?v.lang:(isEn?'en-PH':'fil-PH');
    if(v)u.voice=v;
    u.rate=1;u.pitch=1;u.volume=1;
    u.onend=u.onerror=function(){if(currentSpeak===u)stopSpeaking()};
    try{window.speechSynthesis.cancel()}catch(e){}
    currentSpeak=u;speaking=true;
    if(readBtn){readBtn.classList.add('on');readBtn.setAttribute('aria-pressed','true');readBtn.setAttribute('aria-label','Stop reading')}
    if(readLbl)readLbl.textContent='Stop';
    try{window.speechSynthesis.speak(u)}catch(e){stopSpeaking();warn('Could not read the text aloud: '+e.message)}
  }
  readBtn.onclick=readAloud;

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

  var cands=[],curLang='',gotStart=false;
  function failFast(){            /* the session ended right away: try another engine code, then explain */
    if(cands.length){
      curLang=cands.shift();toast('Trying '+curLang+'…');
      var old=rec;rec=null;if(old){try{old.abort()}catch(e){}}
      build();gotStart=false;setStatus('Starting…');
      try{rec.start()}catch(e){stop(true)}
      return;
    }
    wantStop=true;
    warn('Voice recognition stopped right away. Click Allow for the microphone (lock icon in the address bar), check your internet, and try Google Chrome. This browser may not support the detected language.');
    stop(true);
  }
  function build(){
    var r=new SR();rec=r;var t0=Date.now();
    r.onstart=function(){gotStart=true;t0=Date.now();if(listening){setStatus('Listening…');startMeter()}};
    r.continuous=true;r.interimResults=true;r.maxAlternatives=3;r.lang=curLang||ENGINES[activeGroup][0]||'fil-PH';
    r.onresult=function(e){
      var live='';
      for(var i=e.resultIndex;i<e.results.length;i++){
        var x=e.results[i];
        if(x.isFinal){
          var best=x[0].transcript,bestScore=altScore(best);
          for(var j=1;j<x.length;j++){var sc=altScore(x[j].transcript);if(sc>bestScore){bestScore=sc;best=x[j].transcript}}
          appendFinal(best);
        }else live+=x[0].transcript;
      }
      interim.textContent=listening?live:'';
    };
    r.onerror=function(e){
      if(e.error==='not-allowed'||e.error==='service-not-allowed'){
        wantStop=true;
        warn('Microphone is blocked. Click the lock icon in the address bar, allow the microphone, and open the page through Live Server (localhost).');
      }else if(e.error==='language-not-supported'){
        wantStop=true;
        warn('This browser could not use the automatic language engine. Try again, or use Google Chrome.');
      }else if(e.error==='network'){warn('The speech service could not be reached. Check your internet connection. Chrome usually works better than Edge for voice recognition.')}else if(e.error==='no-speech'){setStatus('Listening… no speech heard yet')}
      else if(e.error!=='aborted'){setStatus('Error: '+e.error)}
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
    stopSpeaking();
    activeGroup='fil';switchCount=0;lastSwitchAt=0;detectBuf=[];lastLang='';lastLangConf=0;sessionCleaned=false;sessionStart=text.value.length;
    var pre=detectLanguage(text.value||'');
    if(pre&&pre.markers>=5&&pre.conf>=0.6){activeGroup=pre.group;lastLang=pre.lang;lastLangConf=pre.langConf}
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
    var old=rec;rec=null;if(old){try{old.abort()}catch(e){}}
    cands=(ENGINES[activeGroup]||ENGINES.fil).slice();curLang=cands.shift();gotStart=false;setStatus('Starting…');
    build();wantStop=false;
    try{rec.start()}catch(e){
      rec=null;
      if(!retry){starting=true;setTimeout(function(){starting=false;begin(true)},300)}
      else setStatus('Could not start. Please click again.');
      return;
    }
    listening=true;startedAt=Date.now()-elapsed*1000;lastFinal=0;
    app.classList.add('live');mic.setAttribute('aria-label','Stop recording');setIcon('stop');
    setTimeout(function(){if(listening&&!gotStart)setStatus('Waiting for the microphone… click Allow in the address bar.')},3500);
    clearInterval(tick);
    tick=setInterval(function(){elapsed=Math.floor((Date.now()-startedAt)/1000);$('timer').textContent=fmt(elapsed)},500);
  }
  function stop(fromEnd){
    listening=false;wantStop=true;
    clearInterval(tick);                       /* UI stops right away */
    stopMeter();
    app.classList.remove('live');mic.setAttribute('aria-label','Start recording');setIcon('mic');
    setStatus(elapsed?'Stopped · '+fmt(elapsed)+' recorded':'Ready to listen');
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
    localStorage.removeItem('ln_lang');localStorage.removeItem('ln_voice');
    var t=localStorage.getItem('ln_theme');if(t)document.documentElement.setAttribute('data-theme',t);
  }catch(e){}
  S.nid=null;   /* always open on a blank page */
  renderAll();openNote();
  if(FILE_MODE)fileWarning();
  
})();
