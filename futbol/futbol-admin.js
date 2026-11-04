/* ===================== Administración ===================== */
let AV={view:'league',id:null};
let B={round:null,h:null,a:null};
const OPEN=new Set();
let MM=null; // match en edición {lid,mid}
const authed=()=>!!getPin();
const curL=()=>LG(AV.id);
function findM(L,mid){for(const r of L.rounds)for(const m of r.matches)if(m.id===mid)return{m,r};return{}}

function viewAdmin(){
  if(!authed())return`<div class="wrap"><form class="gate box" id="gate"><div class="eyebrow">Acceso de administrador</div><h2>Gestiona tus competencias</h2>
    <p>Crea ligas y torneos, inscribe equipos, arma jornadas y captura resultados en vivo.</p>
    <label class="fld" for="pin">PIN<input id="pin" class="inp" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN de 4 dígitos"></label>
    <button class="btn pri" type="submit">Entrar</button>${MODE==='server'?'<p class="note">Usa el PIN que configuraste en el servidor.</p>':'<p class="note">Modo demo local · PIN: 2026</p>'}</form></div>`;
  if(AV.view==='league'&&!curL())AV={view:'league',id:S.leagues[0]?.id||null};
  if(AV.view==='league'&&!AV.id)AV.view='new';
  const side=`<aside class="adm-side"><div class="side-h">Competencias</div>
    ${S.leagues.map(L=>`<button class="side-b ${AV.view==='league'&&AV.id===L.id?'on':''}" data-act="adm-sel" data-id="${L.id}">${esc(L.name)}<small>${L.kind}</small></button>`).join('')}
    <button class="side-b ${AV.view==='new'?'on':''}" data-act="adm-new">+ Nueva competencia</button>
    <div class="side-h">Catálogo</div>
    <button class="side-b ${AV.view==='teams'?'on':''}" data-act="adm-teams">Equipos y plantillas<small>${S.teams.length}</small></button>
    <button class="side-b" data-act="reset" data-confirm="1">Restaurar datos de ejemplo</button>
    <button class="side-b" data-act="logout">Salir</button></aside>`;
  let main='';
  if(AV.view==='new')main=admNew();else if(AV.view==='teams')main=admTeams();else main=admLeague(curL());
  return`<div class="wrap adm">${side}<main class="adm-main">${main}</main></div>`;
}
function admNew(){
  return`<form class="box" id="newL"><div class="box-h"><div><h2>Nueva competencia</h2><p>Después de crearla, inscribe equipos arrastrándolos y genera el calendario o el cuadro.</p></div></div>
  <div class="formg">
    <label class="fld full" for="nl-name">Nombre<input id="nl-name" required placeholder="Ej. Liga Nocturna Clausura 2027"></label>
    <label class="fld" for="nl-kind">Formato<select id="nl-kind"><option value="liga">Liga · todos contra todos</option><option value="torneo">Torneo · eliminación directa</option></select></label>
    <label class="fld" for="nl-vu">Vueltas (liga)<select id="nl-vu"><option value="1">Una vuelta</option><option value="2">Ida y vuelta</option></select></label>
    <label class="fld" for="nl-season">Temporada<input id="nl-season" placeholder="Clausura 2027"></label>
    <label class="fld" for="nl-venue">Sede principal<input id="nl-venue" placeholder="Complejo deportivo"></label>
  </div><div style="margin-top:16px"><button class="btn pri" type="submit">Crear competencia</button></div></form>`;
}
function admTeams(){
  return`<div class="box"><div class="box-h"><div><h2>Equipos</h2><p>Catálogo compartido por todas las competencias. Cada equipo tiene su logo generado y su plantilla, que alimenta la captura de goles, tarjetas y la página del equipo.</p></div><button class="btn pri" data-act="team-new">+ Nuevo equipo</button></div>
  <div class="teams-g">${S.teams.map(t=>`<div class="tcard">${crest(t.id)}<div><b>${esc(t.name)}</b><small>${t.players.length} jugadores · ${S.leagues.filter(L=>L.teams.includes(t.id)).length} competencias</small></div><button class="btn sm" data-act="team-edit" data-id="${t.id}">Editar y jugadores</button></div>`).join('')}</div></div>`;
}
function tchip(id,opts={}){
  const t=T(id);const lock=opts.lock;
  return`<span class="tchip ${opts.sel?'sel':''} ${lock?'lock':''}" ${lock?'aria-disabled="true"':`draggable="true" data-drag="${id}"`} data-act="${opts.act||''}" data-team="${id}" title="${esc(lock||t.name)}" role="button" tabindex="0">${crest(id,'xs')}${esc(t.name)}${lock?` <span class="lk">${esc(lock)}</span>`:''}</span>`;
}
function lockReason(L,rid,tid,other){
  const r=L.rounds.find(x=>x.id===rid);
  if(r&&r.matches.some(m=>m.h===tid||m.a===tid))return'Ya juega esta jornada';
  if(other){if(isBlocked(L,tid,other))return'Cruce bloqueado';if(meetings(L,tid,other)>=(+L.vueltas||1))return'Ya se enfrentaron'}
  return null;
}
function admLeague(L){
  const avail=S.teams.filter(t=>!L.teams.includes(t.id));
  const head=`<div class="box"><div class="box-h"><div><div class="eyebrow">${L.kind==='liga'?`Liga · ${L.vueltas==2?'ida y vuelta':'una vuelta'}`:'Torneo eliminatorio'} · ${esc(L.season)}</div><h2 style="margin-top:6px">${esc(L.name)}</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn pri" href="/futbol?liga=${L.id}" target="_blank" rel="noopener">Ver página pública</a><button class="btn" data-act="copy-link" data-id="${L.id}">Copiar liga</button><button class="btn danger" data-act="del-league" data-confirm="1">Eliminar</button></div></div>
    <div class="note">Página pública: <span class="num">${esc(pubURL(L.id))}</span> · ${L.teams.length} equipos · ${L.rounds.length} ${L.kind==='liga'?'jornadas':'rondas'} · ${all(L).filter(m=>m.status==='final').length} partidos jugados</div></div>`;
  const enr=`<div class="box"><div class="box-h"><div><h3>Equipos inscritos</h3><p>Arrastra equipos entre columnas, o tócalos para moverlos.</p></div></div>
    <div class="enr"><div class="zone" data-drop="pool"><div class="zone-h"><span>Disponibles</span><span>${avail.length}</span></div><div class="chips">${avail.map(t=>tchip(t.id,{act:'enroll'})).join('')||'<span class="note">Todos los equipos están inscritos.</span>'}</div></div>
    <div class="zone" data-drop="enrolled"><div class="zone-h"><span>En la competencia</span><span>${L.teams.length}</span></div><div class="chips">${L.teams.map(id=>tchip(id,{act:'unenroll'})).join('')||'<span class="note">Suelta aquí los equipos.</span>'}</div></div></div></div>`;
  const blk=L.kind==='liga'?`<div class="box"><div class="box-h"><div><h3>Bloqueos de cruce</h3><p>Los equipos que ya se enfrentaron se bloquean solos según las vueltas. Agrega aquí cruces que nunca deben programarse (por ejemplo, dos equipos del mismo club).</p></div></div>
    <div class="toolbar"><label class="fld" for="b1" style="flex:1">Equipo A<select id="b1">${L.teams.map(id=>`<option value="${id}">${esc(tname(id))}</option>`).join('')}</select></label>
    <label class="fld" for="b2" style="flex:1">Equipo B<select id="b2">${L.teams.map((id,i)=>`<option value="${id}" ${i===1?'selected':''}>${esc(tname(id))}</option>`).join('')}</select></label>
    <button class="btn" data-act="blk-add">Bloquear cruce</button></div>
    <div class="blk" style="margin-top:12px">${(L.blocks||[]).map(([x,y],i)=>`<div class="blk-r">${crest(x,'xs')}${esc(tname(x))} <span class="vs">VS</span> ${crest(y,'xs')}${esc(tname(y))}<button class="btn sm ghost" data-act="blk-del" data-i="${i}">Quitar</button></div>`).join('')||'<span class="note">Sin bloqueos manuales.</span>'}</div></div>`:'';
  return head+enr+blk+(L.kind==='liga'?admCalendar(L):admBracket(L));
}
function admCalendar(L){
  if(!B.round||!L.rounds.find(r=>r.id===B.round))B={round:L.rounds[curRound(L)]?.id||null,h:null,a:null};
  const picked=B.h||B.a;
  const ar=L.rounds.findIndex(r=>r.id===B.round);
  const tray=L.rounds.length?`<div class="tray"><div class="tray-h">Armando <b>${ar>=0?rname(L,ar):'—'}</b>${picked?` · elegiste <b>${esc(tname(picked))}</b>, ahora su rival`:' · arrastra o toca dos equipos'}. Los bloqueados no se pueden elegir. También puedes arrastrar un equipo de aquí sobre un partido para cambiarlo.</div>
    <div class="chips">${L.teams.map(id=>{const sel=id===B.h||id===B.a;return tchip(id,{act:'pick',sel,lock:sel?null:lockReason(L,B.round,id,picked)})}).join('')}</div></div>`:'';
  const rounds=L.rounds.map((r,i)=>{
    const done=r.matches.length&&r.matches.every(m=>m.status==='final');const lv=r.matches.some(m=>m.status==='vivo');
    const isA=r.id===B.round;const open=OPEN.has(r.id)||isA;
    const rows=r.matches.map(m=>calRow(L,r,m)).join('');
    const slot=side=>{const id=isA?B[side]:null;return`<button class="slot ${id?'full':''}" data-drop="slot" data-act="slot" data-r="${r.id}" data-side="${side}">${id?crest(id,'xs')+esc(tname(id)):side==='h'?'Local':'Visitante'}</button>`};
    return`<details class="rnd ${isA?'act':''}" data-rid="${r.id}" data-drop="round" ${open?'open':''}><summary>${r.matches.some(m=>m.status!=='programado')?`<span class="rgrip off" title="Jornada con partidos jugados: queda fija">${LOCK}</span>`:`<span class="rgrip" draggable="true" data-drag="r:${r.id}" title="Arrastra sobre otra jornada para intercambiarlas">⠿</span>`}<h3>${rname(L,i)}</h3>${lv?'<span class="pill live"><span class="dot"></span>En vivo</span>':done?'<span class="pill fin">Completa</span>':`<span class="pill">${r.matches.length} partidos</span>`}
      <span class="sp"><button class="btn sm" data-act="img" data-r="${r.id}" ${r.matches.length?'':'disabled'}>Imagen del rol</button><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${rname(L,i)}"></span></summary>
      <div class="rnd-b">${rows}<div class="build">${slot('h')}<span class="vs">VS</span>${slot('a')}</div>
      <div class="rnd-f">${r.matches.some(m=>m.status!=='programado')||L.rounds.length<2?'':`<select class="inp mv" data-chg="rswap" data-r="${r.id}" aria-label="Intercambiar con otra jornada"><option value="">Intercambiar con…</option>${L.rounds.map((R,k)=>R===r?'':`<option value="${R.id}" ${roundSwapWhy(L,r.id,R.id)?'disabled':''}>${rname(L,k)}${roundSwapWhy(L,r.id,R.id)?' · jugada':''}</option>`).join('')}</select>`}<button class="btn sm ghost danger" data-act="del-round" data-r="${r.id}" data-confirm="1">Eliminar jornada</button></div></div></details>`}).join('');
  return`<div class="box"><div class="box-h"><div><h3>Calendario</h3><p>Genera todos contra todos en un clic o arma cada jornada a mano. Para reprogramar: <b>arrastra una jornada</b> (⠿) sobre otra para intercambiar sus partidos, <b>arrastra un partido</b> a otra jornada, o <b>arrastra un equipo</b> sobre otro para intercambiarlos. En celular usa los selectores o toca los equipos. Verde = se puede, rojo = ya se enfrentaron o hay choque. Los partidos jugados quedan fijos.</p></div></div>
    <div class="toolbar"><label class="fld" for="g-start">Inicio<input type="date" id="g-start" value="${L.rounds[0]?.date||isoD(new Date())}"></label>
    <label class="fld" for="g-vu">Vueltas<select id="g-vu"><option value="1" ${L.vueltas!=2?'selected':''}>Una vuelta</option><option value="2" ${L.vueltas==2?'selected':''}>Ida y vuelta</option></select></label>
    <button class="btn pri" data-act="gen-cal" ${L.rounds.length?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>${L.rounds.length?'Regenerar calendario':'Generar calendario'}</button>
    <button class="btn" data-act="add-round">+ Jornada vacía</button></div></div>
    ${tray}<div>${rounds||'<div class="empty">Sin jornadas. Genera el calendario o agrega una jornada vacía.</div>'}</div>`;
}
function admBracket(L){
  const rounds=L.rounds.map(r=>`<details class="rnd" open><summary><h3>${esc(r.name)}</h3><span class="pill">${r.matches.filter(m=>!m.bye).length} partidos</span>
    <span class="sp"><button class="btn sm" data-act="img" data-r="${r.id}">Imagen del rol</button><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${esc(r.name)}"></span></summary>
    <div class="rnd-b">${r.matches.map(m=>{if(m.bye)return`<div class="mrow"><span class="tm">Pase</span><div class="t h"><span>${esc(tname(m.h||m.a))}</span>${crest(m.h||m.a,'xs')}</div><span class="s">→</span><div class="t"><span class="note">Avanza directo</span></div><div class="ac"></div></div>`;const[h,a]=sc(m);return`<div class="mrow"><span class="tm">${fmtT(m.date)}</span><div class="t h"><span>${esc(tname(m.h))}</span>${crest(m.h,'xs')}</div><span class="s">${m.status==='programado'?'vs':h+'–'+a}</span><div class="t">${crest(m.a,'xs')}<span>${esc(tname(m.a))}</span></div><div class="ac">${statusPill(m)}<button class="btn sm" data-act="edit-m" data-m="${m.id}" ${!m.h||!m.a?'disabled':''}>Capturar</button></div></div>`}).join('')}</div></details>`).join('');
  return`<div class="box"><div class="box-h"><div><h3>Cuadro eliminatorio</h3><p>Se sortea en el orden de inscripción (1 vs último). Los ganadores avanzan solos; en empate eliges quién pasa por penales.</p></div></div>
    <div class="toolbar"><label class="fld" for="g-start">Primera ronda<input type="date" id="g-start" value="${L.rounds[0]?.date||isoD(new Date())}"></label>
    <button class="btn pri" data-act="gen-bracket" ${L.rounds.length?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>${L.rounds.length?'Volver a sortear':'Generar cuadro'}</button></div></div>
    <div>${rounds||'<div class="empty">Inscribe equipos y genera el cuadro.</div>'}</div>`;
}

/* --- modal de partido --- */
function openMatch(lid,mid){MM={lid,mid};drawMatch();const d=$('#dlg');if(!d.open)d.showModal()}
function drawMatch(){
  const L=LG(MM.lid);const{m}=findM(L,MM.mid);if(!m)return;const[h,a]=sc(m);
  const roster=id=>(T(id)?.players||[]);
  const evRows=m.ev.map((e,i)=>{const tid=e.side==='h'?m.h:m.a;const names=roster(tid).map(p=>p.name);
    return`<div class="evr"><select class="inp" data-chg="ev" data-i="${i}" data-k="t" aria-label="Tipo"><option value="g" ${e.t==='g'?'selected':''}>Gol</option><option value="y" ${e.t==='y'?'selected':''}>Amarilla</option><option value="r" ${e.t==='r'?'selected':''}>Roja</option></select>
    <select class="inp" data-chg="ev" data-i="${i}" data-k="side" aria-label="Equipo"><option value="h" ${e.side==='h'?'selected':''}>${esc(T(m.h)?.short)}</option><option value="a" ${e.side==='a'?'selected':''}>${esc(T(m.a)?.short)}</option></select>
    <select class="inp" data-chg="ev" data-i="${i}" data-k="p" aria-label="Jugador"><option value="">Sin asignar</option>${roster(tid).map(p=>`<option ${p.name===e.p?'selected':''} value="${esc(p.name)}">${p.n} · ${esc(p.name)}</option>`).join('')}${e.p&&!names.includes(e.p)?`<option selected value="${esc(e.p)}">${esc(e.p)}</option>`:''}</select>
    <input class="inp num" type="number" min="1" max="130" placeholder="Min" value="${e.m||''}" data-chg="ev" data-i="${i}" data-k="m" aria-label="Minuto">
    <button class="btn sm ghost danger" data-act="ev-del" data-i="${i}" aria-label="Quitar evento">✕</button></div>`}).join('');
  $('#dlg').innerHTML=`<div class="dlg"><div class="dlg-h"><div><div class="eyebrow">${esc(L.name)}</div><h3 style="margin-top:4px">Captura del partido</h3></div><button class="btn sm" data-act="dlg-close">Listo</button></div>
    <div class="msc"><div class="tm">${crest(m.h,'lg')}${esc(tname(m.h))}<button class="btn sm" data-act="goal" data-side="h">+ Gol</button></div><div class="big">${h}–${a}</div><div class="tm">${crest(m.a,'lg')}${esc(tname(m.a))}<button class="btn sm" data-act="goal" data-side="a">+ Gol</button></div></div>
    <div class="formg">
      <label class="fld" for="mf-status">Estado<select id="mf-status" data-chg="m-f" data-k="status"><option value="programado" ${m.status==='programado'?'selected':''}>Programado</option><option value="vivo" ${m.status==='vivo'?'selected':''}>En vivo</option><option value="final" ${m.status==='final'?'selected':''}>Final</option></select></label>
      <label class="fld" for="mf-date">Fecha y hora<input id="mf-date" type="datetime-local" value="${m.date}" data-chg="m-f" data-k="date"></label>
      <label class="fld" for="mf-venue">Cancha / sede<input id="mf-venue" value="${esc(m.venue)}" data-chg="m-f" data-k="venue"></label>
      ${L.kind==='torneo'?`<label class="fld" for="mf-pen">Si empatan, avanza por penales<select id="mf-pen" data-chg="m-f" data-k="pen"><option value="">—</option><option value="h" ${m.pen==='h'?'selected':''}>${esc(tname(m.h))}</option><option value="a" ${m.pen==='a'?'selected':''}>${esc(tname(m.a))}</option></select></label>`:'<span></span>'}
      <label class="fld" for="mf-stream">Liga de transmisión en vivo (.m3u8 se reproduce dentro de la página)<input id="mf-stream" type="url" placeholder="https://…" value="${esc(m.stream)}" data-chg="m-f" data-k="stream"></label>
      <label class="fld" for="mf-vod">Liga de la grabación (.mp4 se reproduce dentro de la página)<input id="mf-vod" type="url" placeholder="https://…" value="${esc(m.vod)}" data-chg="m-f" data-k="vod"></label>
    </div>
    <div><div class="box-h" style="margin-bottom:8px"><h3>Incidencias</h3><button class="btn sm" data-act="ev-add">+ Tarjeta u otro evento</button></div>
    <div style="display:flex;flex-direction:column;gap:8px">${evRows||'<span class="note">Usa “+ Gol” para sumar al marcador; luego elige al anotador y el minuto.</span>'}</div></div>
    <p class="note" style="margin:0">El marcador se calcula con los goles capturados. Los cambios se guardan al instante.</p></div>`;
}
function touchMatch(){const L=LG(MM.lid);propagate(L);save();drawMatch()}

/* --- Reprogramar: mover partidos entre jornadas e intercambiar equipos --- */
let SW=null; // equipo elegido para intercambiar (modo tocar) {m,side}
const opp=s=>s==='h'?'a':'h';
const rIdx=(L,r)=>L.rounds.indexOf(r);
const shortN=id=>T(id)?.short||'?';
const LOCK='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z" fill="currentColor"/></svg>';
function inRound(r,tid,excl=[]){return r.matches.some(m=>!excl.includes(m.id)&&(m.h===tid||m.a===tid))}
function pairWhy(L,a,b,excl=[]){
  if(!a||!b)return null;if(a===b)return'Un equipo no puede jugar contra sí mismo';
  if(isBlocked(L,a,b))return`${shortN(a)} vs ${shortN(b)}: cruce bloqueado`;
  let c=0;L.rounds.forEach(r=>r.matches.forEach(m=>{if(excl.includes(m.id))return;if((m.h===a&&m.a===b)||(m.h===b&&m.a===a))c++}));
  return c>=(+L.vueltas||1)?`${shortN(a)} y ${shortN(b)} ya se enfrentaron`:null;
}
function moveWhy(L,mid,rid){
  const{m,r}=findM(L,mid);const R=L.rounds.find(x=>x.id===rid);if(!m||!R)return'No disponible';
  if(r===R)return'Ya está en esta jornada';if(m.status!=='programado')return'Este partido ya se jugó';
  for(const t of[m.h,m.a])if(inRound(R,t))return`${shortN(t)} ya juega en ${rname(L,rIdx(L,R))}`;
  return null;
}
function swapWhy(L,m1,s1,m2,s2){
  const A=findM(L,m1),Z=findM(L,m2);if(!A.m||!Z.m)return'No disponible';
  if(A.m.status!=='programado'||Z.m.status!=='programado')return'Ese partido ya se jugó';
  if(m1===m2)return s1===s2?'Es el mismo equipo':null;
  const t1=A.m[s1],t2=Z.m[s2],o1=A.m[opp(s1)],o2=Z.m[opp(s2)];if(t1===t2)return'Es el mismo equipo';
  const ex=[m1,m2];
  if(A.r!==Z.r){if(inRound(A.r,t2,ex))return`${shortN(t2)} ya juega en ${rname(L,rIdx(L,A.r))}`;if(inRound(Z.r,t1,ex))return`${shortN(t1)} ya juega en ${rname(L,rIdx(L,Z.r))}`}
  return pairWhy(L,t2,o1,ex)||pairWhy(L,t1,o2,ex);
}
function replaceWhy(L,mid,side,tid){
  const{m,r}=findM(L,mid);if(!m)return'No disponible';if(m.status!=='programado')return'Ese partido ya se jugó';
  if(m[side]===tid)return'Ya está en este partido';if(inRound(r,tid,[mid]))return`${shortN(tid)} ya juega en ${rname(L,rIdx(L,r))}`;
  return pairWhy(L,tid,m[opp(side)],[mid]);
}
function roundSwapWhy(L,a,b){
  const r1=L.rounds.find(r=>r.id===a),r2=L.rounds.find(r=>r.id===b);if(!r1||!r2)return'No disponible';if(r1===r2)return'Es la misma jornada';
  const played=r=>r.matches.some(m=>m.status!=='programado');if(played(r1))return`${rname(L,rIdx(L,r1))} ya tiene partidos jugados`;if(played(r2))return`${rname(L,rIdx(L,r2))} ya tiene partidos jugados`;
  return null;
}
function doSwapRounds(a,b){
  const L=curL();const w=roundSwapWhy(L,a,b);if(w){toast(w,'warn');render();return}
  const r1=L.rounds.find(r=>r.id===a),r2=L.rounds.find(r=>r.id===b);
  [r1.matches,r2.matches]=[r2.matches,r1.matches];
  r1.matches.forEach(m=>m.date=r1.date+m.date.slice(10));r2.matches.forEach(m=>m.date=r2.date+m.date.slice(10));
  OPEN.add(a);OPEN.add(b);save();toast(`Se intercambiaron los partidos de ${rname(L,rIdx(L,r1))} y ${rname(L,rIdx(L,r2))}`);render();
}
function doMove(mid,rid){
  const L=curL();const w=moveWhy(L,mid,rid);if(w){toast(w,'warn');render();return}
  const{m,r}=findM(L,mid);const R=L.rounds.find(x=>x.id===rid);
  r.matches=r.matches.filter(x=>x!==m);m.date=R.date+m.date.slice(10);R.matches.push(m);R.matches.sort((a,b)=>a.date.localeCompare(b.date));
  OPEN.add(rid);SW=null;save();toast(`Partido movido a ${rname(L,rIdx(L,R))}`);render();
}
function doSwap(m1,s1,m2,s2){
  const L=curL();const w=swapWhy(L,m1,s1,m2,s2);if(w){toast(w,'warn');return}
  const A=findM(L,m1).m,Z=findM(L,m2).m;
  if(m1===m2){[A.h,A.a]=[A.a,A.h];toast('Localía invertida')}else{const t=A[s1];A[s1]=Z[s2];Z[s2]=t;toast(`Intercambiados: ${shortN(A[s1])} ⇄ ${shortN(Z[s2])}`)}
  SW=null;save();render();
}
function doReplace(mid,side,tid){
  const L=curL();const w=replaceWhy(L,mid,side,tid);if(w){toast(w,'warn');return}
  findM(L,mid).m[side]=tid;SW=null;save();toast(`${shortN(tid)} entra al partido`);render();
}
function teamCell(L,m,side){
  const id=m[side];const prog=m.status==='programado'&&id;let cls='',ttl='Arrastra sobre otro equipo para intercambiarlos, o tócalo';
  if(prog&&SW){if(SW.m===m.id&&SW.side===side){cls='sel';ttl='Elegido: toca otro equipo para intercambiar'}else{const w=swapWhy(L,SW.m,SW.side,m.id,side);cls=w?'cant':'can';ttl=w||'Toca para intercambiar'}}
  const inner=side==='h'?`<span>${esc(tname(id))}</span>${crest(id,'xs')}`:`${crest(id,'xs')}<span>${esc(tname(id))}</span>`;
  return prog?`<div class="t ${side==='h'?'h':''} mteam ${cls}" draggable="true" data-drag="t:${m.id}:${side}" data-drop="mteam" data-m="${m.id}" data-side="${side}" data-act="tsel" title="${esc(ttl)}">${inner}</div>`:`<div class="t ${side==='h'?'h':''}">${inner}</div>`;
}
function calRow(L,r,m){
  const[h,a]=sc(m);const prog=m.status==='programado';
  const mv=prog&&L.rounds.length>1?`<select class="inp mv" data-chg="mv" data-m="${m.id}" aria-label="Mover a otra jornada">${L.rounds.map((R,i)=>{if(R===r)return`<option value="" selected>Mover a…</option>`;const w=moveWhy(L,m.id,R.id);return`<option value="${R.id}" ${w?'disabled':''}>${rname(L,i)}${w?' · choque':''}</option>`}).join('')}</select>`:'';
  return`<div class="mrow ${prog?'':'locked'}" ${prog?`draggable="true" data-drag="m:${m.id}" title="Arrastra el partido a otra jornada"`:'title="Partido jugado: ya no se puede mover"'}>
    <span class="grip">${prog?'⠿':LOCK}</span><span class="tm">${fmtT(m.date)}</span>${teamCell(L,m,'h')}<span class="s">${prog?'vs':h+'–'+a}</span>${teamCell(L,m,'a')}
    <div class="ac">${statusPill(m)}${mv}<button class="btn sm" data-act="edit-m" data-m="${m.id}">Capturar</button><button class="btn sm ghost danger" data-act="del-m" data-m="${m.id}" data-confirm="1" aria-label="Eliminar partido">✕</button></div></div>`;
}
let DRAG=null;
function markTargets(pl){
  const L=curL();if(!L)return;
  if(pl.startsWith('m:')){const mid=pl.slice(2);const own=findM(L,mid).r;document.querySelectorAll('details.rnd[data-rid]').forEach(d=>{if(own&&d.dataset.rid===own.id)return;const w=moveWhy(L,mid,d.dataset.rid);d.classList.add(w?'cant':'can');d.dataset.why=w||''})}
  else if(pl.startsWith('r:')){const rid=pl.slice(2);document.querySelectorAll('details.rnd[data-rid]').forEach(d=>{if(d.dataset.rid===rid)return;const w=roundSwapWhy(L,rid,d.dataset.rid);d.classList.add(w?'cant':'can');d.title=w||'Suelta para intercambiar las jornadas'})}
  else if(pl.startsWith('t:')){const[,mid,side]=pl.split(':');document.querySelectorAll('.mteam').forEach(c=>{if(c.dataset.m===mid&&c.dataset.side===side)return;const w=swapWhy(L,mid,side,c.dataset.m,c.dataset.side);c.classList.add(w?'cant':'can');c.title=w||'Suelta para intercambiar'})}
  else if(L.teams.includes(pl)){document.querySelectorAll('.mteam').forEach(c=>{const w=replaceWhy(L,c.dataset.m,c.dataset.side,pl);c.classList.add(w?'cant':'can');c.title=w||'Suelta para poner este equipo'})}
}
function clearMarks(){document.querySelectorAll('.can,.cant').forEach(x=>x.classList.remove('can','cant'))}
function handleDrop(z,pl){
  if(pl.startsWith('r:')){const rid=z.dataset.rid||z.closest('[data-rid]')?.dataset.rid;if(rid&&rid!==pl.slice(2))doSwapRounds(pl.slice(2),rid);return}
  if(pl.startsWith('m:')){const rid=z.dataset.rid||z.closest('[data-rid]')?.dataset.rid;if(rid)doMove(pl.slice(2),rid);return}
  if(pl.startsWith('t:')){const[,mid,side]=pl.split(':');if(z.dataset.drop==='mteam')doSwap(mid,side,z.dataset.m,z.dataset.side);else toast('Suelta el equipo sobre otro equipo para intercambiarlos','warn');return}
  const d=z.dataset.drop;
  if(d==='pool')enroll(pl,false);else if(d==='enrolled')enroll(pl,true);else if(d==='slot')place(z.dataset.r,z.dataset.side,pl);else if(d==='mteam')doReplace(z.dataset.m,z.dataset.side,pl);
}

/* --- Imagen del rol por jornada --- */
let IMG=null;
const slug=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const longDate=d=>{const s=new Date(d+'T12:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});return s.charAt(0).toUpperCase()+s.slice(1)};
function rr(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath()}
function spaced(x,t,X,Y,s){if('letterSpacing'in x){x.letterSpacing=s+'px';x.fillText(t,X,Y);x.letterSpacing='0px'}else x.fillText(t,X,Y)}
function fit(x,t,X,Y,maxW,weight,size,fam,min=18){let s=size;do{x.font=`${weight} ${s}px ${fam}`;if(x.measureText(t).width<=maxW)break;s-=2}while(s>min);
  let out=t;while(x.measureText(out).width>maxW&&out.length>3)out=out.slice(0,-2)+'…';x.fillText(out,X,Y)}
async function loadLogos(ids){const map={};await Promise.all([...new Set(ids)].filter(Boolean).map(id=>new Promise(res=>{const im=new Image();im.onload=()=>{map[id]=im;res()};im.onerror=res;im.src=logoURL(T(id))})));return map}
async function roundCanvas(L,i,mode){
  const r=L.rounds[i];const ms=r.matches.filter(m=>!m.bye&&m.h&&m.a).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  try{await Promise.all(['900 150px "Big Shoulders Display"','800 30px Manrope','700 30px Manrope','600 30px Manrope','600 26px "IBM Plex Mono"'].map(f=>document.fonts.load(f)))}catch(e){}
  const D='"Big Shoulders Display", Impact, sans-serif',Bf='Manrope, Arial, sans-serif',Mf='"IBM Plex Mono", monospace';
  let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#14231D');g.addColorStop(1,'#070C0A');x.fillStyle=g;x.fillRect(0,0,W,H);
  const rg=x.createRadialGradient(W*.88,40,0,W*.88,40,720);rg.addColorStop(0,'rgba(233,196,106,.20)');rg.addColorStop(1,'rgba(233,196,106,0)');x.fillStyle=rg;x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(255,255,255,.05)';x.lineWidth=3;x.strokeRect(40,40,W-80,H-80);x.beginPath();x.arc(W/2,H/2,150,0,Math.PI*2);x.stroke();x.beginPath();x.moveTo(40,H/2);x.lineTo(W-40,H/2);x.stroke();
  x.textAlign='left';x.fillStyle='#E9C46A';x.font=`800 26px ${Bf}`;spaced(x,'PÍCALE FÚTBOL',80,116,6);
  x.fillStyle='rgba(236,240,234,.86)';fit(x,L.name,80,164,W-160,700,32,Bf);
  const res=mode==='res';
  x.fillStyle='#E9C46A';x.font=`800 28px ${Bf}`;spaced(x,res?'RESULTADOS':'ROL DE JUEGOS',80,248,6);
  x.fillStyle='#ECF0EA';fit(x,rname(L,i).toUpperCase(),74,392,W-150,900,150,D,60);
  x.fillStyle='#8DA198';x.font=`600 34px ${Bf}`;x.fillText(longDate(r.date),80,446);
  const top=496,bottom=H-150,n=Math.max(ms.length,1),gap=14,rh=Math.min(158,(bottom-top-gap*(n-1))/n);
  const logos=await loadLogos(ms.flatMap(m=>[m.h,m.a]));
  ms.forEach((m,k)=>{
    const y=top+k*(rh+gap),cy=y+rh/2,ls=Math.min(100,rh*.66),cw=Math.min(230,rh*1.5);
    rr(x,60,y,W-120,rh,22);x.fillStyle='rgba(255,255,255,.055)';x.fill();
    if(logos[m.h])x.drawImage(logos[m.h],86,cy-ls/2,ls,ls);if(logos[m.a])x.drawImage(logos[m.a],W-86-ls,cy-ls/2,ls,ls);
    const live=m.status==='vivo',played=m.status!=='programado';
    rr(x,W/2-cw/2,y+12,cw,rh-24,16);x.fillStyle=live?'rgba(255,90,82,.22)':'rgba(233,196,106,.14)';x.fill();
    const[h,a]=sc(m);const big=res&&played?`${h} - ${a}`:fmtT(m.date);const fs=Math.min(68,rh*.44);
    x.textAlign='center';x.fillStyle=live?'#FF8A84':'#F3DFA6';x.font=`900 ${fs}px ${D}`;x.fillText(big,W/2,cy+fs*.32-(rh>90?10:0));
    if(rh>90){x.fillStyle='#8DA198';x.font=`700 19px ${Bf}`;const sub=res?(live?'EN VIVO':played?'FINAL':'POR JUGAR'):(m.venue||'').toUpperCase();fit(x,sub,W/2,y+rh-24,cw-24,700,19,Bf,12)}
    const nx=86+ls+22,nw=W/2-cw/2-24-nx;x.fillStyle='#ECF0EA';
    x.textAlign='left';fit(x,tname(m.h),nx,cy+11,nw,800,30,Bf);x.textAlign='right';fit(x,tname(m.a),W-nx,cy+11,nw,800,30,Bf);
  });
  if(!ms.length){x.textAlign='center';x.fillStyle='#8DA198';x.font=`600 34px ${Bf}`;x.fillText('Partidos por definir',W/2,top+120)}
  x.textAlign='left';x.fillStyle='#8DA198';x.font=`600 24px ${Bf}`;x.fillText('Partidos en vivo, resultados y tabla en',80,H-94);
  x.fillStyle='#E9C46A';x.font=`600 26px ${Mf}`;x.fillText(location.host+'/futbol',80,H-58);
  return c;
}
function roundText(L,i,mode){
  const r=L.rounds[i];const ms=r.matches.filter(m=>!m.bye&&m.h&&m.a).slice().sort((a,b)=>a.date.localeCompare(b.date));const res=mode==='res';
  return`${L.name}\n${rname(L,i)} · ${longDate(r.date)}\n${res?'RESULTADOS':'ROL DE JUEGOS'}\n\n`+ms.map(m=>{const[h,a]=sc(m);return res&&m.status!=='programado'?`${tname(m.h)} ${h}-${a} ${tname(m.a)}${m.status==='vivo'?' (en vivo)':''}`:`${fmtT(m.date)}  ${tname(m.h)} vs ${tname(m.a)}${m.venue?' · '+m.venue:''}`}).join('\n')+`\n\nEn vivo, resultados y tabla: ${pubURL(L.id)}`;
}
async function openImage(rid,mode){
  const L=curL();const i=L.rounds.findIndex(r=>r.id===rid);const r=L.rounds[i];
  const anyPlayed=r.matches.some(m=>m.status!=='programado');mode=mode||(r.matches.length&&r.matches.every(m=>m.status==='final'||m.bye)?'res':'rol');
  $('#dlg').innerHTML=`<div class="dlg"><div class="dlg-h"><div><div class="eyebrow">${esc(L.name)}</div><h3 style="margin-top:4px">Imagen del rol · ${esc(rname(L,i))}</h3></div><button class="btn sm" data-act="dlg-close">Cerrar</button></div>
    ${anyPlayed?`<div class="seg"><button class="${mode==='rol'?'on':''}" data-act="img-mode" data-r="${rid}" data-mode="rol">Rol de juegos</button><button class="${mode==='res'?'on':''}" data-act="img-mode" data-r="${rid}" data-mode="res">Resultados</button></div>`:''}
    <div class="imgprev"><div class="empty">Generando imagen…</div></div><div class="img-act"></div></div>`;
  const d=$('#dlg');if(!d.open)d.showModal();
  const c=await roundCanvas(L,i,mode);const url=c.toDataURL('image/png');const blob=await new Promise(res=>c.toBlob(res,'image/png'));
  const fname=`${slug(L.name)}-${slug(rname(L,i))}${mode==='res'?'-resultados':''}.png`;
  IMG={blob,fname,txt:roundText(L,i,mode),title:`${L.name} · ${rname(L,i)}`};
  const canShare=!!(navigator.canShare&&blob&&navigator.canShare({files:[new File([blob],fname,{type:'image/png'})]}));
  $('#dlg .imgprev').innerHTML=`<img src="${url}" alt="Rol de ${esc(rname(L,i))}">`;
  $('#dlg .img-act').innerHTML=`<a class="btn pri" href="${url}" download="${fname}">Descargar imagen</a>${canShare?'<button class="btn" data-act="img-share">Compartir a WhatsApp</button>':''}<button class="btn" data-act="img-text">Copiar texto del rol</button><p class="note" style="margin:0;flex-basis:100%">Formato 4:5 (1080 × 1350), se ve completo en WhatsApp e Instagram.</p>`;
}

/* --- Modal de equipo: logo generado y jugadores --- */
let TE=null,TW=null,LOGOB=0;
function autoShort(n){const w=(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').split(/\s+/).filter(x=>x&&!['DE','DEL','LA','LAS','LOS','EL','Y','FC','CLUB'].includes(x));
  return w.length>=3?w.slice(0,3).map(x=>x[0]).join(''):w.length===2?(w[0][0]+w[1].slice(0,2)):(w[0]||'EQU').slice(0,3)}
function openTeam(id){
  TE=id;const t=id?T(id):null;
  TW=t?{name:t.name,short:t.short,color:t.color,logoV:t.logoV||0,players:(t.players||[]).map(p=>({n:p.n,name:p.name,pos:posOf(p),_old:p.name}))}:{name:'',short:'',color:'#2F6FB0',logoV:0,players:[]};
  LOGOB=Math.floor((TW.logoV||0)/6)*6;drawTeam();const d=$('#dlg');if(!d.open)d.showModal();
}
const twPrev=()=>({...TW,short:(TW.short||autoShort(TW.name)).toUpperCase(),name:TW.name||'Equipo'});
function logoOpts(){const p=twPrev();return[0,1,2,3,4,5].map(k=>LOGOB+k).map(v=>`<button type="button" class="lo ${v===(TW.logoV||0)?'on':''}" data-act="logo-pick" data-v="${v}" aria-label="Logo opción ${v+1}">${logoSVG({...p,logoV:v})}</button>`).join('')}
function refreshLogos(){const a=$('#dlg .te-logo'),b=$('#dlg .logo-opts');if(a)a.innerHTML=logoSVG(twPrev());if(b)b.innerHTML=logoOpts();const s=$('#tf-short');if(s)s.placeholder=autoShort(TW.name)}
function drawTeam(){
  $('#dlg').innerHTML=`<form class="dlg" id="teamF"><div class="dlg-h"><h3>${TE?'Editar equipo':'Nuevo equipo'}</h3><button type="button" class="btn sm ghost" data-act="dlg-close">Cerrar</button></div>
    <div class="te-top"><div class="te-logo">${logoSVG(twPrev())}</div><div class="formg">
      <label class="fld full" for="tf-name">Nombre<input id="tf-name" required value="${esc(TW.name)}" data-tw="name" placeholder="Ej. Halcones de Cumbres" autocomplete="off"></label>
      <label class="fld" for="tf-short">Abreviatura<input id="tf-short" maxlength="4" value="${esc(TW.short)}" data-tw="short" placeholder="${esc(autoShort(TW.name))}" style="text-transform:uppercase" autocomplete="off"></label>
      <label class="fld" for="tf-color">Color principal<input id="tf-color" type="color" value="${TW.color}" data-tw="color" style="height:42px;padding:4px"></label></div></div>
    <div><div class="box-h" style="margin-bottom:8px"><div><h3>Logo</h3><p>Se genera con el nombre y el color del equipo. Elige el que más te guste.</p></div><button type="button" class="btn sm" data-act="logo-more">Más opciones</button></div>
      <div class="logo-opts">${logoOpts()}</div></div>
    <div><div class="box-h" style="margin-bottom:8px"><div><h3>Jugadores <span class="note">${TW.players.length} registrados</span></h3></div><button type="button" class="btn sm" data-act="pl-add">+ Agregar jugador</button></div>
      <div class="pl-list">${TW.players.map((p,i)=>`<div class="plr"><input class="inp num" type="number" min="0" max="99" value="${esc(p.n)}" placeholder="#" data-pl="${i}" data-k="n" aria-label="Número del jugador ${i+1}"><input class="inp" value="${esc(p.name)}" placeholder="Nombre y apellido" data-pl="${i}" data-k="name" aria-label="Nombre del jugador ${i+1}" autocomplete="off"><select class="inp" data-pl="${i}" data-k="pos" aria-label="Posición del jugador ${i+1}">${POS.map(x=>`<option value="${x}" ${p.pos===x?'selected':''}>${POSN[x]}</option>`).join('')}</select><button type="button" class="btn sm ghost danger" data-act="pl-del" data-i="${i}" aria-label="Quitar jugador ${i+1}">✕</button></div>`).join('')||'<span class="note">Sin jugadores. Agrégalos uno por uno o pega una lista.</span>'}</div>
      <details class="paste"><summary>Pegar una lista de jugadores</summary><textarea id="tf-paste" class="inp" placeholder="10 Juan Pérez&#10;1 Luis Garza POR&#10;9 Mario Leal DEL"></textarea><button type="button" class="btn sm" data-act="pl-import">Agregar a la plantilla</button></details></div>
    <div style="display:flex;gap:8px;justify-content:space-between">${TE?'<button type="button" class="btn danger" data-act="team-del" data-confirm="1">Eliminar equipo</button>':'<span></span>'}<button class="btn pri" type="submit">Guardar equipo</button></div></form>`;
}
function saveTeam(){
  const name=TW.name.trim();if(!name){toast('Escribe el nombre del equipo','warn');$('#tf-name')?.focus();return}
  const short=(TW.short||autoShort(name)).trim().toUpperCase().slice(0,4);
  const players=TW.players.filter(p=>p.name.trim()).map(p=>({n:p.n===''?'':+p.n,name:p.name.trim(),pos:p.pos}));
  if(TE){
    // Si renombraste a un jugador, sus goles y tarjetas lo siguen.
    TW.players.forEach(p=>{const nn=p.name.trim();if(p._old&&nn&&p._old!==nn)S.leagues.forEach(L=>L.rounds.forEach(r=>r.matches.forEach(m=>{const side=m.h===TE?'h':m.a===TE?'a':null;if(side)m.ev.forEach(e=>{if(e.side===side&&e.p===p._old)e.p=nn})})))});
    Object.assign(T(TE),{name,short,color:TW.color,logoV:TW.logoV||0,players});
  }else S.teams.push({id:uid('t'),name,short,color:TW.color,logoV:TW.logoV||0,players});
  save();$('#dlg').close();toast('Equipo guardado');
}

/* ===================== Arranque (administración) ===================== */
const pubURL=id=>location.origin+'/futbol?liga='+encodeURIComponent(id);
function render(){
  $('#mode').innerHTML=MODE==='server'?'<span class="mode srv">● Publicando en servidor</span>':'<span class="mode">Modo demo · solo este navegador</span>';
  $('#app').innerHTML=viewAdmin();
}
function place(rid,side,tid){
  const L=curL();if(B.round!==rid)B={round:rid,h:null,a:null};
  const other=side==='h'?B.a:B.h;const why=lockReason(L,rid,tid,other);
  if(why){toast(`${tname(tid)}: ${why.toLowerCase()}`,'warn');return}
  B[side]=tid;
  if(B.h&&B.a){const r=L.rounds.find(x=>x.id===rid);const hh=Math.min(19+r.matches.length,23);
    r.matches.push({id:uid('m'),h:B.h,a:B.a,date:`${r.date}T${p2(hh)}:00`,venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''});
    toast(`Partido agregado: ${T(B.h).short} vs ${T(B.a).short}`);B={round:rid,h:null,a:null};save()}
  render();
}
function enroll(id,on){
  const L=curL();
  if(on){if(!L.teams.includes(id))L.teams.push(id)}
  else{if(L.rounds.some(r=>r.matches.some(m=>m.h===id||m.a===id))){toast('Ese equipo ya tiene partidos; elimínalos antes de darlo de baja','warn');return}L.teams=L.teams.filter(x=>x!==id);L.blocks=(L.blocks||[]).filter(b=>!b.includes(id))}
  save();render();
}
const ACT={
  'adm-new'(){AV={view:'new'};render()},
  'adm-teams'(){AV={view:'teams'};render()},
  reset(){S=seed();save();AV={view:'league',id:null};B={round:null,h:null,a:null};toast('Datos de ejemplo restaurados');render()},
  logout(){try{sessionStorage.removeItem('picale-futbol-pin')}catch(e){}getPin._='';render()},
  'copy-link'(el){const u=pubURL(el.dataset.id);navigator.clipboard?.writeText(u).then(()=>toast('Liga copiada')).catch(()=>toast(u))},
  enroll(el){enroll(el.dataset.team,true)},
  unenroll(el){enroll(el.dataset.team,false)},
  pick(el){const L=curL();if(!B.round)B.round=L.rounds[curRound(L)]?.id;if(!B.round){toast('Agrega una jornada primero','warn');return}
    const id=el.dataset.team;if(B.h===id){B.h=null;render();return}if(B.a===id){B.a=null;render();return}place(B.round,B.h?'a':'h',id)},
  slot(el){const rid=el.dataset.r,side=el.dataset.side;if(B.round!==rid)B={round:rid,h:null,a:null};else if(B[side])B[side]=null;render()},
  'gen-cal'(){const L=curL();const vu=+$('#g-vu').value;const st=$('#g-start').value||isoD(new Date());L.vueltas=vu;
    const base=new Date(st+'T12:00');
    L.rounds=roundRobin(L.teams,vu).map((pairs,i)=>{const d=isoD(new Date(base.getTime()+i*7*864e5));let k=0;
      return{id:uid('r'),date:d,matches:pairs.filter(([h,a])=>!isBlocked(L,h,a)).map(([h,a])=>({id:uid('m'),h,a,date:`${d}T${p2(Math.min(19+k++,23))}:00`,venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''}))}});
    B={round:null,h:null,a:null};OPEN.clear();save();toast(`${L.rounds.length} jornadas generadas`);render()},
  'add-round'(){const L=curL();const last=L.rounds.at(-1);const d=last?isoD(new Date(new Date(last.date+'T12:00').getTime()+7*864e5)):isoD(new Date());
    const r={id:uid('r'),date:d,matches:[]};L.rounds.push(r);B={round:r.id,h:null,a:null};save();render()},
  'del-round'(el){const L=curL();L.rounds=L.rounds.filter(r=>r.id!==el.dataset.r);B={round:null,h:null,a:null};save();render()},
  'del-m'(el){const L=curL();L.rounds.forEach(r=>r.matches=r.matches.filter(m=>m.id!==el.dataset.m));save();render()},
  'edit-m'(el){openMatch(AV.id,el.dataset.m)},
  goal(el){const L=LG(MM.lid);const{m}=findM(L,MM.mid);m.ev.push({t:'g',side:el.dataset.side,p:'',m:''});if(m.status==='programado')m.status='vivo';touchMatch()},
  'ev-add'(){const L=LG(MM.lid);const{m}=findM(L,MM.mid);m.ev.push({t:'y',side:'h',p:'',m:''});touchMatch()},
  'ev-del'(el){const L=LG(MM.lid);const{m}=findM(L,MM.mid);m.ev.splice(+el.dataset.i,1);touchMatch()},
  'dlg-close'(){$('#dlg').close()},
  'blk-add'(){const L=curL();const a=$('#b1').value,b=$('#b2').value;if(a===b){toast('Elige dos equipos distintos','warn');return}if(isBlocked(L,a,b)){toast('Ese cruce ya está bloqueado','warn');return}(L.blocks=L.blocks||[]).push([a,b]);save();render()},
  'blk-del'(el){curL().blocks.splice(+el.dataset.i,1);save();render()},
  'gen-bracket'(){const L=curL();genBracket(L,[$('#g-start').value]);propagate(L);save();toast('Cuadro generado');render()},
  'del-league'(){S.leagues=S.leagues.filter(l=>l.id!==AV.id);AV={view:'league',id:null};save();render()},
  'team-new'(){openTeam(null)},
  tsel(el){const m=el.dataset.m,side=el.dataset.side;if(!SW){SW={m,side};render();toast('Ahora toca el equipo con el que lo quieres intercambiar');return}if(SW.m===m&&SW.side===side){SW=null;render();return}doSwap(SW.m,SW.side,m,side)},
  img(el){openImage(el.dataset.r)},
  'img-mode'(el){openImage(el.dataset.r,el.dataset.mode)},
  async 'img-share'(){try{await navigator.share({files:[new File([IMG.blob],IMG.fname,{type:'image/png'})],title:IMG.title,text:IMG.title})}catch(e){}},
  'img-text'(){navigator.clipboard?.writeText(IMG.txt).then(()=>toast('Texto copiado: pégalo en el grupo')).catch(()=>toast('No se pudo copiar','warn'))},
  'logo-more'(){LOGOB+=6;refreshLogos()},
  'logo-pick'(el){TW.logoV=+el.dataset.v;refreshLogos()},
  'pl-add'(){TW.players.push({n:'',name:'',pos:'DEL'});drawTeam();const ins=document.querySelectorAll('#dlg [data-k="name"]');ins[ins.length-1]?.focus()},
  'pl-del'(el){TW.players.splice(+el.dataset.i,1);drawTeam()},
  'pl-import'(){const t=$('#tf-paste').value;t.split('\n').map(l=>l.trim()).filter(Boolean).forEach(l=>{const m=l.match(/^(\d+)?[\s.-]*(.+?)(?:\s+(POR|DEF|MED|DEL))?$/i);if(!m)return;TW.players.push({n:m[1]?+m[1]:'',name:m[2].trim(),pos:(m[3]||'').toUpperCase()||posOf({n:m[1]})})});drawTeam();toast('Jugadores agregados')},
  'team-edit'(el){openTeam(el.dataset.id)},
  'team-del'(){if(S.leagues.some(L=>L.teams.includes(TE))){toast('Primero da de baja el equipo de sus competencias','warn');return}S.teams=S.teams.filter(t=>t.id!==TE);save();$('#dlg').close()},
  'adm-sel'(el){AV={view:'league',id:el.dataset.id};B={round:null,h:null,a:null};SW=null;OPEN.clear();render()},
};
document.addEventListener('click',e=>{if(e.target.closest('summary input'))e.preventDefault()},true);
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||!el.dataset.act||el.disabled)return;
  if(el.closest('summary')&&el.tagName!=='SUMMARY')e.preventDefault();
  if(el.dataset.confirm&&!el.dataset.armed){e.preventDefault();el.dataset.armed='1';el.dataset.label=el.textContent;el.textContent='¿Seguro? Toca otra vez';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent=el.dataset.label}},3500);return}
  ACT[el.dataset.act]?.(el,e);
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.tchip[data-act]')){e.preventDefault();e.target.click()}});
document.addEventListener('change',e=>{
  const el=e.target,k=el.dataset.chg;if(!k)return;
  if(k==='r-date'){const L=curL();const r=L.rounds.find(x=>x.id===el.dataset.r);r.date=el.value;r.matches.forEach(m=>m.date=el.value+m.date.slice(10));save();render()}
  if(k==='rswap'){if(el.value)doSwapRounds(el.dataset.r,el.value);return}
  if(k==='mv'){if(el.value)doMove(el.dataset.m,el.value);return}
  if(k==='m-f'){const L=LG(MM.lid);const{m}=findM(L,MM.mid);m[el.dataset.k]=el.value||(el.dataset.k==='pen'?null:'');touchMatch()}
  if(k==='ev'){const L=LG(MM.lid);const{m}=findM(L,MM.mid);const ev=m.ev[+el.dataset.i];const kk=el.dataset.k;ev[kk]=kk==='m'?(+el.value||''):el.value;if(kk==='side')ev.p='';if(kk==='m')m.ev.sort((a,b)=>(a.m||999)-(b.m||999));touchMatch()}
});
document.addEventListener('input',e=>{
  const el=e.target;if(!TW)return;
  if(el.dataset.tw){TW[el.dataset.tw]=el.dataset.tw==='short'?el.value.toUpperCase():el.value;refreshLogos()}
  if(el.dataset.pl!=null){const p=TW.players[+el.dataset.pl];if(p)p[el.dataset.k]=el.dataset.k==='n'?(el.value===''?'':+el.value):el.value}
});
document.addEventListener('change',e=>{const el=e.target;if(TW&&el.dataset.pl!=null&&el.dataset.k==='pos'){TW.players[+el.dataset.pl].pos=el.value}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&SW&&!$('#dlg').open){SW=null;render()}});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset?.rid){d.open?OPEN.add(d.dataset.rid):OPEN.delete(d.dataset.rid)}},true);
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;
  if(f.id==='gate'){const pin=$('#pin').value.trim();let ok=false;
    if(MODE==='server'){try{const r=await fetch(FUTBOL_API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});ok=r.ok}catch(err){toast('No hay conexión con el servidor','warn');return}}
    else ok=pin===DEMO_PIN;
    if(!ok){toast('PIN incorrecto','warn');return}
    try{sessionStorage.setItem('picale-futbol-pin',pin)}catch(err){getPin._=pin}
    // Primera vez en servidor vacío: publica los datos de ejemplo para que la página pública tenga contenido.
    if(MODE==='server'){try{const j=await fetchServer();if(!j)save()}catch(err){}}
    render()}
  if(f.id==='newL'){const name=$('#nl-name').value.trim();if(!name)return;
    let id=name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||uid('l');
    while(LG(id))id+='-'+Math.random().toString(36).slice(2,4);
    S.leagues.push({id,name,kind:$('#nl-kind').value,vueltas:+$('#nl-vu').value,season:$('#nl-season').value.trim()||'Temporada',venue:$('#nl-venue').value.trim(),teams:[],blocks:[],rounds:[]});
    AV={view:'league',id};save();toast('Competencia creada');render()}
  if(f.id==='teamF')saveTeam();
});
$('#dlg').addEventListener('close',()=>{MM=null;TW=null;IMG=null;render()});
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('[data-drag]');if(!c)return;DRAG=c.dataset.drag;e.dataTransfer.setData('text/plain',DRAG);e.dataTransfer.effectAllowed='move';c.classList.add('dragging');requestAnimationFrame(()=>markTargets(DRAG))});
document.addEventListener('dragend',()=>{DRAG=null;clearMarks();document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over'))});
document.addEventListener('dragover',e=>{const z=e.target.closest?.('[data-drop]');if(!z)return;
  // Los destinos en rojo no aceptan el equipo o el partido.
  if(z.classList.contains('cant')){e.dataTransfer.dropEffect='none';return}
  e.preventDefault();document.querySelectorAll('.over').forEach(x=>x!==z&&x.classList.remove('over'));z.classList.add('over')});
document.addEventListener('drop',e=>{const z=e.target.closest?.('[data-drop]');if(!z)return;e.preventDefault();z.classList.remove('over');const pl=e.dataTransfer.getData('text/plain')||DRAG;clearMarks();if(pl)handleDrop(z,pl)});
(async()=>{S=await loadData();render()})();
