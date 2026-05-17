
// ══ AUTH ═══════════════════════════════════════
const ADMIN_USER_KEY='picale_admin_user', ADMIN_PASS_KEY='picale_admin_pass', ADMIN_SESSION='picale_admin_session';
function hashStr(s){let h=0;for(let i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;}return h.toString(16);}
function getAdminCreds(){return{user:localStorage.getItem(ADMIN_USER_KEY)||'admin',passhash:localStorage.getItem(ADMIN_PASS_KEY)||hashStr('picale2024')};}
function isAdminLoggedIn(){return sessionStorage.getItem(ADMIN_SESSION)==='1';}
function attemptLogin(){
  const user=document.getElementById('loginUser').value.trim();
  const pass=document.getElementById('loginPass').value;
  const creds=getAdminCreds();
  const err=document.getElementById('loginError');
  if(user===creds.user&&hashStr(pass)===creds.passhash){
    sessionStorage.setItem(ADMIN_SESSION,'1');err.classList.remove('show');
    closeLoginModal();if(pendingAdminAction){pendingAdminAction();pendingAdminAction=null;}
    toast('✅ Sesión iniciada');
  }else{err.classList.add('show');document.getElementById('loginPass').value='';document.getElementById('loginPass').focus();}
}
function adminLogout(){sessionStorage.removeItem(ADMIN_SESSION);showPage('page-home');toast('👋 Sesión cerrada');}
let pendingAdminAction=null;
function requireAdmin(fn){if(isAdminLoggedIn()){fn();return;}pendingAdminAction=fn;document.getElementById('loginUser').value='';document.getElementById('loginPass').value='';document.getElementById('loginError').classList.remove('show');document.getElementById('loginModal').classList.add('open');setTimeout(()=>document.getElementById('loginUser').focus(),100);}
function closeLoginModal(){document.getElementById('loginModal').classList.remove('open');}
document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')attemptLogin();});
document.getElementById('loginUser').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPass').focus();});
function changePassword(){
  const oldP=document.getElementById('settOldPass').value;
  const newP=document.getElementById('settNewPass').value;
  const confP=document.getElementById('settConfPass').value;
  const creds=getAdminCreds();
  if(hashStr(oldP)!==creds.passhash){toast('⚠️ Contraseña actual incorrecta','warn');return;}
  if(newP.length<6){toast('⚠️ Mínimo 6 caracteres','warn');return;}
  if(newP!==confP){toast('⚠️ Las contraseñas no coinciden','warn');return;}
  localStorage.setItem(ADMIN_PASS_KEY,hashStr(newP));
  ['settOldPass','settNewPass','settConfPass'].forEach(id=>document.getElementById(id).value='');
  toast('✅ Contraseña actualizada');
}

// ══ CONFIG ═════════════════════════════════════
const STORE_KEY='picale_config_v2';
function loadConfig(){try{const r=localStorage.getItem(STORE_KEY);if(r)return JSON.parse(r);}catch(e){}return getDefaultConfig();}
function saveConfig(c){localStorage.setItem(STORE_KEY,JSON.stringify(c));}
function migrateConfig(cfg){
  // Si alguna camara no tiene api, tomarla del default
  var def = getDefaultConfig();
  cfg.cameras.forEach(function(cam){
    if(!cam.api){
      var defCam = def.cameras.find(function(c){ return c.id===cam.id || c.name===cam.name; });
      if(defCam) cam.api = defCam.api;
      else cam.api = API_BASE;
    }
  });
  return cfg;
}
function getDefaultConfig(){return{clubs:[{id:'demo',name:'Cancha Demo Local',city:'Localhost',state:'',courts:['Cancha Demo'],isDemo:true},{id:'duo',name:'Duo Padel Park Obregón',city:'Ciudad Obregón',state:'Sonora',courts:['Cancha 1','Cancha 2','Cancha 3','Cancha 4','Cancha 5'],isDemo:false}],cameras:[{id:'cam-demo',name:'Demo Camera',clubId:'demo',court:'Cancha Demo',rtsp:'rtsp://admin:Padel2026!@192.168.100.64:554/Streaming/Channels/102',api:API_BASE,status:'online'}],trainingDurationMin:60};}
let config=migrateConfig(loadConfig());

// ══ STATE ══════════════════════════════════════
let state={clubId:null,clubName:null,courtName:null,courtApi:null,replaySeconds:20,clipsOpen:true,activeCamId:null,statusInterval:null,clipsInterval:null,clockInterval:null,editingClubId:null,editingCamId:null,trainingActive:false,trainingStartTs:null,trainingDurationMs:null,trainingInterval:null,streamReady:false};

// ══ CLOCK ══════════════════════════════════════
function startClock(){clearInterval(state.clockInterval);tickClock();state.clockInterval=setInterval(tickClock,1000);}
function tickClock(){const n=new Date();const el=document.getElementById('hudClock');if(el)el.textContent=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;}

// ══ NAV ════════════════════════════════════════
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
  if(id==='page-home')renderHome();
  if(id==='page-admin'){if(!isAdminLoggedIn()){requireAdmin(()=>showPage('page-admin'));return;}renderAdminDashboard();}
  if(id==='page-court')startClock();
}
function goHome(){stopPolling();showPage('page-home');}
function goClub(){stopPolling();selectClub(state.clubId);}

// ══ HOME ═══════════════════════════════════════
function renderHome(){
  document.getElementById('clubsGrid').innerHTML=config.clubs.map(club=>`
    <div class="club-card ${club.isDemo?'club-card-demo':''}" onclick="selectClub('${club.id}')">
      <div class="club-card-icon">${club.isDemo?`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#A7B0A4" stroke-width="1.4"><rect x="1" y="3" width="11" height="8" rx="1.2"/><path d="M12 7l5-2v8l-5-2"/></svg>`:`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#A7B0A4" stroke-width="1.4"><rect x="1" y="4" width="16" height="11" rx="1.5"/><line x1="9" y1="4" x2="9" y2="15"/><line x1="1" y1="9.5" x2="17" y2="9.5"/></svg>`}</div>
      <div class="club-card-name">${club.name}</div>
      <div class="club-card-loc">${club.city}${club.state?', '+club.state:''}</div>
      <svg class="club-card-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h8M8 4l3 3-3 3"/></svg>
    </div>`).join('');
}

// ══ CLUB ═══════════════════════════════════════
function selectClub(clubId){
  const club=config.clubs.find(c=>c.id===clubId);if(!club)return;
  state.clubId=clubId;state.clubName=club.name;
  document.getElementById('clubHeroName').textContent=club.name;
  document.getElementById('clubHeroSub').textContent=`${club.city}${club.state?', '+club.state:''} · ${club.courts.length} canchas`;
  const cams=config.cameras.filter(c=>c.clubId===clubId);
  document.getElementById('courtsGrid').innerHTML=club.courts.map(court=>{
    const cam=cams.find(c=>c.court===court);
    // Thumbnail: si hay cámara, intentamos cargar un snapshot como preview
    const thumbInner = cam
      ? `<img class="court-thumb-snap" id="thumb-${cam.id}"
             src="${cam.api}/snapshot?_=${Date.now()}"
             alt="preview"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
             onload="this.nextElementSibling.style.display='none';">
         <div class="court-thumb-fallback">
           <div class="court-thumb-icon"><svg width="70" height="48" viewBox="0 0 70 48" fill="none" stroke="rgba(167,176,164,.7)" stroke-width=".8"><rect x="2" y="2" width="66" height="44" rx="1"/><line x1="35" y1="2" x2="35" y2="46"/><line x1="2" y1="24" x2="68" y2="24"/><rect x="13" y="10" width="44" height="28"/></svg></div>
         </div>`
      : `<div class="court-thumb-fallback" style="display:flex">
           <div class="court-thumb-icon"><svg width="70" height="48" viewBox="0 0 70 48" fill="none" stroke="rgba(167,176,164,.7)" stroke-width=".8"><rect x="2" y="2" width="66" height="44" rx="1"/><line x1="35" y1="2" x2="35" y2="46"/><line x1="2" y1="24" x2="68" y2="24"/><rect x="13" y="10" width="44" height="28"/></svg></div>
         </div>`;
    return `<div class="court-card">
      <div class="court-thumb-area">
        <div class="court-thumb-lines"></div>
        ${thumbInner}
        <div class="court-live-pill"><div class="live-dot" style="${cam?'':'background:rgba(255,255,255,.2);animation:none'}"></div>${cam?'En vivo':'Sin cámara'}</div>
      </div>
      <div class="court-card-body"><div class="court-card-name">${court}</div><div class="court-card-status">${cam?'Cámara activa · '+cam.api:'Sin cámara — agrega una en Admin'}</div>
      <div class="court-card-btns">
        <button class="cc-btn cc-btn-dark" onclick="enterCourt('${court}','${club.name}','${clubId}','${cam?cam.api:''}','${cam?cam.id:''}',false)"><svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M5.5 1C3.01 1 1 3.01 1 5.5S3.01 10 5.5 10 10 7.99 10 5.5 7.99 1 5.5 1zm-1 7V3l4 2-4 2z"/></svg>Ver en vivo</button>
        <button class="cc-btn cc-btn-outline" onclick="enterCourt('${court}','${club.name}','${clubId}','${cam?cam.api:''}','${cam?cam.id:''}',true)">Clips</button>
      </div></div></div>`;
  }).join('');
  showPage('page-club');
}

// ══ ENTER COURT ════════════════════════════════
function enterCourt(courtName,clubName,clubId,apiUrl,camId,scrollToClips){
  // Si apiUrl llega vacío (config viejo en localStorage), buscarlo del config actual
  var resolvedApi = apiUrl || '';
  if(!resolvedApi && camId){
    var cam = config.cameras.find(function(c){ return c.id === camId; });
    if(cam) resolvedApi = cam.api || '';
  }
  if(!resolvedApi){
    // Buscar cualquier cámara de este club/cancha
    var cam2 = config.cameras.find(function(c){ return c.clubId===clubId && c.court===courtName; });
    if(cam2) resolvedApi = cam2.api || '';
  }
  state.courtName=courtName;state.clubName=clubName;state.clubId=clubId;state.courtApi=resolvedApi;state.activeCamId=camId||null;
  document.getElementById('bcClub').textContent=clubName;document.getElementById('bcCourt').textContent=courtName;
  document.getElementById('courtTitleBig').textContent=courtName;document.getElementById('courtSubText').textContent=clubName;
  buildCamDD(clubId,courtName,camId);showPage('page-court');startPolling();initStream();
  if(scrollToClips&&document.getElementById('clipsPanel').classList.contains('collapsed'))toggleClipsPanel();
}

// ══ STREAM ═════════════════════════════════════
function initStream(){
  var noSig  = document.getElementById('noSignal');
  var img    = document.getElementById('liveImg');
  var canvas = document.getElementById('liveCanvas');

  // Limpiar timers anteriores
  if(img._keepalive){    clearInterval(img._keepalive);    img._keepalive=null; }
  if(img._snapInterval){ clearInterval(img._snapInterval); img._snapInterval=null; }

  state.streamReady = false;

  if(!state.courtApi){
    noSig.style.display = 'flex';
    document.getElementById('noSignalText').innerHTML = 'Sin camara configurada.<br>Agrega una en el panel de Admin.';
    return;
  }

  noSig.style.display = 'none';
  state.streamReady = true;

  var ctx = canvas.getContext('2d');
  var snapshotUrl = state.courtApi + '/snapshot';
  var pending = false;

  function drawFrame(){
    if(pending) return;
    pending = true;
    var tmp = new Image();
    tmp.onload = function(){
      canvas.width  = tmp.naturalWidth  || canvas.offsetWidth;
      canvas.height = tmp.naturalHeight || canvas.offsetHeight;
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
      pending = false;
    };
    tmp.onerror = function(){ pending = false; };
    tmp.src = snapshotUrl + '?_=' + Date.now();
  }

  drawFrame();
  img._snapInterval = setInterval(drawFrame, 80); // ~12fps
}

// Llamado desde fetchStatus — tambien oculta el overlay por si el timeout no alcanzo
function hideNoSignal(){
  if(state.streamReady) return;
  state.streamReady = true;
  document.getElementById('noSignal').style.display = 'none';
}

// ══ CAM DROPDOWN ═══════════════════════════════
function buildCamDD(clubId,currentCourt,activeCamId){
  const cams=config.cameras.filter(c=>c.clubId===clubId);
  const activeCam=cams.find(c=>c.id===activeCamId)||cams.find(c=>c.court===currentCourt);
  document.getElementById('camLabel').textContent=activeCam?activeCam.name:(currentCourt||'Cámara');
  document.getElementById('camDot').style.background=activeCam?'var(--accent)':'rgba(255,255,255,.2)';
  const dd=document.getElementById('camDD');
  dd.innerHTML=`<div class="cam-dd-hdr">Cámaras disponibles</div>`+
    (cams.length?cams.map(cam=>`<div class="cam-option ${cam.id===(activeCam&&activeCam.id)?'active':''}" onclick="switchCamera('${cam.id}')"><div class="cam-opt-dot"></div><div style="flex:1"><div class="cam-opt-name">${cam.name}</div><div class="cam-opt-sub">${cam.court} · ${cam.api}</div></div></div>`).join('')
      :`<div class="cam-option" style="color:rgba(244,241,235,.4)"><div class="cam-opt-dot"></div><span>Sin cámaras en este club</span></div>`)+
    `<div style="border-top:1px solid rgba(255,255,255,.07);margin:4px 0;"></div>
    <div class="cam-option" onclick="requireAdmin(()=>{showPage('page-admin');showAdminSection('cameras');closeAllDropdowns();})"><div class="cam-opt-dot"></div><span class="cam-opt-name" style="color:rgba(244,241,235,.4)">Gestionar cámaras</span></div>`;
}
function toggleCamDD(){document.getElementById('camDD').classList.toggle('open');}
function closeAllDropdowns(){document.getElementById('camDD').classList.remove('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.cam-select-wrap'))closeAllDropdowns();});
function switchCamera(camId){
  const cam=config.cameras.find(c=>c.id===camId);if(!cam)return;
  state.activeCamId=camId;state.courtApi=cam.api;state.courtName=cam.court;
  closeAllDropdowns();document.getElementById('camLabel').textContent=cam.name;document.getElementById('camDot').style.background='var(--accent)';
  document.getElementById('courtTitleBig').textContent=cam.court;initStream();stopPolling();startPolling();toast('📡 Cámara: '+cam.name);
}

// ══ CLIPS PANEL ════════════════════════════════
function toggleClipsPanel(){const p=document.getElementById('clipsPanel');state.clipsOpen=!state.clipsOpen;p.classList.toggle('collapsed',!state.clipsOpen);document.getElementById('clipsToggleLbl').textContent=state.clipsOpen?'Ocultar clips':'Clips';}

// ══ POLLING ════════════════════════════════════
function startPolling(){stopPolling();fetchStatus();loadClips();state.statusInterval=setInterval(fetchStatus,3000);state.clipsInterval=setInterval(loadClips,8000);}
function stopPolling(){
  clearInterval(state.statusInterval);clearInterval(state.clipsInterval);
  var img=document.getElementById('liveImg');
  if(img._snapInterval){clearInterval(img._snapInterval);img._snapInterval=null;}
  if(img._keepalive){clearInterval(img._keepalive);img._keepalive=null;}
}
async function fetchStatus(){
  const dot=document.getElementById('liveDot'),txt=document.getElementById('liveStatusTxt'),fps=document.getElementById('liveFps'),btn=document.getElementById('replayBtn');
  if(!state.courtApi){dot.style.background='rgba(255,255,255,.12)';dot.style.animation='none';txt.textContent='Sin API';fps.textContent='';btn.disabled=true;return;}
  btn.disabled=false;
  try{const r=await fetch(`${state.courtApi}/status`,{signal:AbortSignal.timeout(3000)});const d=await r.json();
    if(d.camera_connected){
      dot.style.background='var(--accent)';dot.style.animation='blink 2s infinite';
      txt.textContent='EN VIVO';fps.textContent=`${d.fps} FPS · ${d.buffer_seconds}s`;
      hideNoSignal(); // <-- ocultar overlay cuando camara esta conectada
    }else{
      dot.style.background='rgba(255,255,255,.25)';dot.style.animation='none';
      txt.textContent='Reconectando';fps.textContent='';
    }
  }catch{dot.style.background='rgba(255,255,255,.12)';dot.style.animation='none';txt.textContent='Sin conexion';fps.textContent='';}
}

// ══ REPLAY ═════════════════════════════════════
function setDur(s,el){state.replaySeconds=s;document.querySelectorAll('.dur-pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');}
async function triggerReplay(){
  if(!state.courtApi){toast('⚠️ Sin API configurada','warn');return;}
  const btn=document.getElementById('replayBtn');btn.classList.add('loading');btn.disabled=true;btn.innerHTML=`<span class="spin">↻</span> Generando…`;
  try{const r=await fetch(`${state.courtApi}/replay?seconds=${state.replaySeconds}`,{method:'POST'});const d=await r.json();
    if(d.success){toast(`⚡ Replay ${state.replaySeconds}s iniciado`);setTimeout(loadClips,4500);setTimeout(loadClips,9000);}
    else toast(`⚠️ ${d.message}`,'warn');
  }catch{toast('⚠️ Sin conexión al servidor','warn');}
  finally{btn.classList.remove('loading');btn.disabled=false;btn.innerHTML=`<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1C3.69 1 1 3.69 1 7s2.69 6 6 6 6-2.69 6-6S10.31 1 7 1zm-1.5 8.5V4.5l4 2-4 2z"/></svg> Generar Replay`;}
}

// ══ TRAINING ═══════════════════════════════════
function onTrainingClick(){if(state.trainingActive){stopTraining();}else{const dur=config.trainingDurationMin||60;document.getElementById('trainingModalSub').textContent=`Se grabará video continuo durante ${dur} minutos. Puedes generar replays en cualquier momento durante la sesión.`;document.getElementById('trainingModal').classList.add('open');}}
async function startTraining(){
  closeAllModals();if(!state.courtApi){toast('⚠️ Sin API','warn');return;}
  const durMin=config.trainingDurationMin||60;const durSec=durMin*60;
  state.trainingActive=true;state.trainingStartTs=Date.now();state.trainingDurationMs=durSec*1000;
  try{const r=await fetch(`${state.courtApi}/replay?seconds=${durSec}`,{method:'POST'});const d=await r.json();if(!d.success)toast(`⚠️ ${d.message}`,'warn');}
  catch{toast('⚠️ Sin conexión','warn');}
  document.getElementById('trainingBtn').classList.add('recording');document.getElementById('trainingBtnLbl').textContent='Detener Entrenamiento';
  document.getElementById('trainingBanner').classList.add('visible');
  state.trainingInterval=setInterval(updateTrainingTimer,1000);updateTrainingTimer();
  toast('🔴 Entrenamiento iniciado — '+durMin+' min');
}
function updateTrainingTimer(){
  if(!state.trainingActive)return;
  const elapsed=Date.now()-state.trainingStartTs;const remaining=state.trainingDurationMs-elapsed;
  if(remaining<=0){stopTraining();return;}
  const es=Math.floor(elapsed/1000);const rs=Math.ceil(remaining/1000);
  document.getElementById('trainingTimer').textContent=`${String(Math.floor(es/3600)).padStart(2,'0')}:${String(Math.floor((es%3600)/60)).padStart(2,'0')}:${String(es%60).padStart(2,'0')}`;
  const rh=Math.floor(rs/3600),rm=Math.floor((rs%3600)/60),rsc=rs%60;
  document.getElementById('trainingLeft').textContent=rh>0?`${rh}:${String(rm).padStart(2,'0')}:${String(rsc).padStart(2,'0')} restante`:`${rm}:${String(rsc).padStart(2,'0')} restante`;
}
function stopTraining(){
  state.trainingActive=false;clearInterval(state.trainingInterval);
  document.getElementById('trainingBtn').classList.remove('recording');document.getElementById('trainingBtnLbl').textContent='Iniciar Entrenamiento';
  document.getElementById('trainingBanner').classList.remove('visible');
  toast('✅ Entrenamiento finalizado — clip guardado');setTimeout(loadClips,3000);
}
function saveTrainingDuration(){const v=parseInt(document.getElementById('settTrainingDur').value);if(isNaN(v)||v<10||v>240){toast('⚠️ Entre 10 y 240 minutos','warn');return;}config.trainingDurationMin=v;saveConfig(config);toast('✅ Duración guardada: '+v+' min');}

// ══ CLIPS ══════════════════════════════════════
async function loadClips(){if(!state.courtApi){renderClips([]);return;}try{const r=await fetch(`${state.courtApi}/clips`,{signal:AbortSignal.timeout(5000)});const d=await r.json();renderClips(d.clips||[]);}catch{renderClips([]);}}
function renderClips(clips){
  document.getElementById('clipsCount').textContent=clips.length;
  const scroll=document.getElementById('clipsScroll');
  if(!clips.length){scroll.innerHTML=`<div class="clips-empty"><div style="font-size:28px;opacity:.2">🎬</div><div class="clips-empty-text">Genera tu primer replay<br>con el botón de abajo</div></div>`;return;}
  scroll.innerHTML=clips.map(clip=>{
    const date=new Date(clip.created_at*1000);const label=clip.name.replace('replay_','').replace('.mp4','');
    const url=`${state.courtApi}/clip/${clip.name}`;
    return `<div class="clip-item" onclick="playClip('${url}')">
      <div class="clip-thumb"><div class="clip-play-icon"><svg width="8" height="8" viewBox="0 0 8 8" fill="white"><polygon points="1.5,1 7,4 1.5,7"/></svg></div></div>
      <div class="clip-info"><div class="clip-name">${label}</div><div class="clip-meta">${formatDate(date)} · ${clip.size_mb} MB</div>
      <div class="clip-actions"><button class="clip-btn clip-btn-p" onclick="event.stopPropagation();playClip('${url}')">▶ Ver</button><button class="clip-btn clip-btn-dl" onclick="event.stopPropagation();downloadClip('${url}','${clip.name}')">↓</button></div></div></div>`;
  }).join('');
}
function formatDate(d){const n=new Date();const isT=d.toDateString()===n.toDateString();const t=d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});return isT?`Hoy ${t}`:d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})+' '+t;}

// ══ VIDEO PLAYER ═══════════════════════════════
function playClip(url){const vid=document.getElementById('modalVideo');vid.src=url;document.getElementById('videoModal').classList.add('open');vid.play();}
function closeVideoModal(){const vid=document.getElementById('modalVideo');vid.pause();vid.src='';document.getElementById('videoModal').classList.remove('open');}
function downloadClip(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.click();toast('⬇️ Descargando…');}
document.getElementById('videoModal').addEventListener('click',e=>{if(e.target===document.getElementById('videoModal'))closeVideoModal();});

// ══ ADMIN ══════════════════════════════════════
function showAdminSection(sec){
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n=>n.classList.remove('active'));
  const se=document.getElementById('section-'+sec);if(se)se.classList.add('active');
  const ne=document.getElementById('nav-'+sec);if(ne)ne.classList.add('active');
  if(sec==='dashboard')renderAdminDashboard();
  if(sec==='clubs')renderClubsTable();
  if(sec==='cameras')renderCamerasTable();
  if(sec==='clips-admin')renderClipsAdmin();
  if(sec==='settings')document.getElementById('settTrainingDur').value=config.trainingDurationMin||60;
}
function renderAdminDashboard(){
  document.getElementById('stat-clubs').textContent=config.clubs.length;
  document.getElementById('stat-cameras').textContent=config.cameras.length;
  const api=config.cameras[0]?.api||'';
  if(api){fetch(`${api}/clips`,{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).then(d=>{document.getElementById('stat-clips').textContent=d.clips?.length??0;document.getElementById('stat-status').textContent='🟢 Online';document.getElementById('recentActivity').innerHTML=(d.clips||[]).slice(0,5).map(c=>`<div style="padding:8px 0;border-bottom:1px solid rgba(31,31,31,.05);display:flex;justify-content:space-between;"><span>${c.name.replace('replay_','').replace('.mp4','')}</span><span style="color:var(--sage-dk)">${formatDate(new Date(c.created_at*1000))} · ${c.size_mb} MB</span></div>`).join('')||'<div style="color:var(--sage-dk)">Sin clips aún.</div>';}).catch(()=>{document.getElementById('stat-clips').textContent='—';document.getElementById('stat-status').textContent='🔴 Offline';document.getElementById('recentActivity').textContent='No se pudo conectar.';})}
  else{document.getElementById('stat-clips').textContent='—';document.getElementById('stat-status').textContent='—';document.getElementById('recentActivity').textContent='Sin cámaras configuradas.';}
}
function renderClubsTable(){
  document.getElementById('clubs-count-label').textContent=`${config.clubs.length} clubs registrados`;
  document.getElementById('clubsTableBody').innerHTML=config.clubs.map(c=>`<tr><td class="td-name">${c.name}</td><td>${c.city}${c.state?', '+c.state:''}</td><td>${c.courts.length}</td><td><span class="status-pill ${c.isDemo?'status-demo':'status-online'}">${c.isDemo?'Demo':'Activo'}</span></td><td><div class="tbl-actions"><button class="tbl-btn tbl-btn-view" onclick="selectClub('${c.id}');showPage('page-club')">Ver</button><button class="tbl-btn tbl-btn-edit" onclick="openEditClubModal('${c.id}')">Editar</button>${!c.isDemo?`<button class="tbl-btn tbl-btn-del" onclick="deleteClub('${c.id}')">Eliminar</button>`:''}</div></td></tr>`).join('');
}
function renderCamerasTable(){
  document.getElementById('cams-count-label').textContent=`${config.cameras.length} cámaras registradas`;
  document.getElementById('camerasTableBody').innerHTML=config.cameras.map(cam=>{const club=config.clubs.find(c=>c.id===cam.clubId);return`<tr><td class="td-name">${cam.name}</td><td>${club?club.name:'—'} · ${cam.court}</td><td class="td-mono">${cam.api}</td><td><span class="status-pill status-online">Activa</span></td><td><div class="tbl-actions"><button class="tbl-btn tbl-btn-edit" onclick="openEditCameraModal('${cam.id}')">Editar</button><button class="tbl-btn tbl-btn-del" onclick="deleteCamera('${cam.id}')">Eliminar</button></div></td></tr>`;}).join('');
}
async function renderClipsAdmin(){
  const api=config.cameras[0]?.api||'';const tbody=document.getElementById('clipsAdminBody');
  if(!api){document.getElementById('clips-admin-label').textContent='Sin cámaras';tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--sage-dk)">Sin cámaras configuradas</td></tr>';return;}
  try{const r=await fetch(`${api}/clips`,{signal:AbortSignal.timeout(5000)});const d=await r.json();const clips=d.clips||[];
    document.getElementById('clips-admin-label').textContent=`${clips.length} clips guardados`;
    tbody.innerHTML=clips.map(c=>`<tr><td class="td-name td-mono">${c.name}</td><td>${c.size_mb} MB</td><td>${formatDate(new Date(c.created_at*1000))}</td><td><div class="tbl-actions"><button class="tbl-btn tbl-btn-view" onclick="playClip('${api}/clip/${c.name}')">▶ Ver</button><button class="tbl-btn tbl-btn-edit" onclick="downloadClip('${api}/clip/${c.name}','${c.name}')">↓ Descargar</button></div></td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--sage-dk)">Sin clips aún.</td></tr>';
  }catch{tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--sage-dk)">No se pudo conectar.</td></tr>';}
}

// ══ CLUB CRUD ══════════════════════════════════
function openAddClubModal(){state.editingClubId=null;document.getElementById('clubModalTitle').textContent='Agregar club';['clubFormName','clubFormCity','clubFormState','clubFormCourts'].forEach(id=>document.getElementById(id).value='');document.getElementById('addClubModal').classList.add('open');}
function openEditClubModal(id){const c=config.clubs.find(x=>x.id===id);if(!c)return;state.editingClubId=id;document.getElementById('clubModalTitle').textContent='Editar club';document.getElementById('clubFormName').value=c.name;document.getElementById('clubFormCity').value=c.city;document.getElementById('clubFormState').value=c.state||'';document.getElementById('clubFormCourts').value=c.courts.join(', ');document.getElementById('addClubModal').classList.add('open');}
function saveClub(){const name=document.getElementById('clubFormName').value.trim();const city=document.getElementById('clubFormCity').value.trim();const st=document.getElementById('clubFormState').value.trim();const courts=document.getElementById('clubFormCourts').value.split(',').map(s=>s.trim()).filter(Boolean);if(!name){toast('⚠️ El nombre es obligatorio','warn');return;}if(state.editingClubId){const c=config.clubs.find(x=>x.id===state.editingClubId);if(c){c.name=name;c.city=city;c.state=st;if(courts.length)c.courts=courts;}}else{config.clubs.push({id:'club_'+Date.now(),name,city,state:st,courts:courts.length?courts:['Cancha 1'],isDemo:false});}saveConfig(config);closeAllModals();renderClubsTable();renderHome();toast('✅ Club guardado');}
function deleteClub(id){if(!confirm('¿Eliminar este club?'))return;config.clubs=config.clubs.filter(c=>c.id!==id);config.cameras=config.cameras.filter(c=>c.clubId!==id);saveConfig(config);renderClubsTable();renderHome();toast('🗑️ Club eliminado');}

// ══ CAMERA CRUD ════════════════════════════════
function openAddCameraModal(){state.editingCamId=null;document.getElementById('camModalTitle').textContent='Agregar cámara';['camFormName','camFormCourt','camFormRtsp'].forEach(id=>document.getElementById(id).value='');document.getElementById('camFormApi').value=API_BASE;populateClubSelect('');document.getElementById('addCameraModal').classList.add('open');}
function openEditCameraModal(id){const c=config.cameras.find(x=>x.id===id);if(!c)return;state.editingCamId=id;document.getElementById('camModalTitle').textContent='Editar cámara';document.getElementById('camFormName').value=c.name;document.getElementById('camFormCourt').value=c.court;document.getElementById('camFormRtsp').value=c.rtsp;document.getElementById('camFormApi').value=c.api;populateClubSelect(c.clubId);document.getElementById('addCameraModal').classList.add('open');}
function populateClubSelect(sel){document.getElementById('camFormClub').innerHTML=config.clubs.map(c=>`<option value="${c.id}" ${c.id===sel?'selected':''}>${c.name}</option>`).join('');}
function saveCamera(){const name=document.getElementById('camFormName').value.trim();const clubId=document.getElementById('camFormClub').value;const court=document.getElementById('camFormCourt').value.trim();const rtsp=document.getElementById('camFormRtsp').value.trim();const api=document.getElementById('camFormApi').value.trim();if(!name||!api){toast('⚠️ Nombre y API son obligatorios','warn');return;}if(state.editingCamId){const c=config.cameras.find(x=>x.id===state.editingCamId);if(c){c.name=name;c.clubId=clubId;c.court=court;c.rtsp=rtsp;c.api=api;}}else{config.cameras.push({id:'cam_'+Date.now(),name,clubId,court,rtsp,api,status:'online'});}saveConfig(config);closeAllModals();renderCamerasTable();renderHome();toast('✅ Cámara guardada');}
function deleteCamera(id){if(!confirm('¿Eliminar esta cámara?'))return;config.cameras=config.cameras.filter(c=>c.id!==id);saveConfig(config);renderCamerasTable();renderHome();toast('🗑️ Cámara eliminada');}

// ══ MODALS & TOAST ═════════════════════════════
function closeAllModals(){document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));}
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)closeAllModals();});});
let toastTimer;
function toast(msg,type='info'){clearTimeout(toastTimer);document.getElementById('toastMsg').textContent=msg;document.getElementById('toastDot').style.background=type==='warn'?'var(--warn)':type==='error'?'var(--danger)':'var(--accent)';const el=document.getElementById('toast');el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),3600);}

// ══ INIT ═══════════════════════════════════════
showPage('page-home');renderHome();
