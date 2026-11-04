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
  return`<div class="box"><div class="box-h"><div><h2>Equipos</h2><p>Catálogo compartido por todas las competencias. La plantilla alimenta la captura de goles y tarjetas.</p></div><button class="btn pri" data-act="team-new">+ Nuevo equipo</button></div>
  <div class="teams-g">${S.teams.map(t=>`<div class="tcard">${crest(t.id)}<div><b>${esc(t.name)}</b><small>${t.players.length} jugadores · ${S.leagues.filter(L=>L.teams.includes(t.id)).length} competencias</small></div><button class="btn sm" data-act="team-edit" data-id="${t.id}">Editar</button></div>`).join('')}</div></div>`;
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
  const tray=L.rounds.length?`<div class="tray"><div class="tray-h">Armando <b>${ar>=0?rname(L,ar):'—'}</b>${picked?` · elegiste <b>${esc(tname(picked))}</b>, ahora su rival`:' · arrastra o toca dos equipos'}. Los bloqueados no se pueden elegir.</div>
    <div class="chips">${L.teams.map(id=>{const sel=id===B.h||id===B.a;return tchip(id,{act:'pick',sel,lock:sel?null:lockReason(L,B.round,id,picked)})}).join('')}</div></div>`:'';
  const rounds=L.rounds.map((r,i)=>{
    const done=r.matches.length&&r.matches.every(m=>m.status==='final');const lv=r.matches.some(m=>m.status==='vivo');
    const isA=r.id===B.round;const open=OPEN.has(r.id)||isA;
    const rows=r.matches.map(m=>{const[h,a]=sc(m);return`<div class="mrow"><span class="tm">${fmtT(m.date)}</span><div class="t h"><span>${esc(tname(m.h))}</span>${crest(m.h,'xs')}</div><span class="s">${m.status==='programado'?'vs':h+'–'+a}</span><div class="t">${crest(m.a,'xs')}<span>${esc(tname(m.a))}</span></div><div class="ac">${statusPill(m)}<button class="btn sm" data-act="edit-m" data-m="${m.id}">Capturar</button><button class="btn sm ghost danger" data-act="del-m" data-m="${m.id}" data-confirm="1" aria-label="Eliminar partido">✕</button></div></div>`}).join('');
    const slot=side=>{const id=isA?B[side]:null;return`<button class="slot ${id?'full':''}" data-drop="slot" data-act="slot" data-r="${r.id}" data-side="${side}">${id?crest(id,'xs')+esc(tname(id)):side==='h'?'Local':'Visitante'}</button>`};
    return`<details class="rnd ${isA?'act':''}" data-rid="${r.id}" ${open?'open':''}><summary><h3>${rname(L,i)}</h3>${lv?'<span class="pill live"><span class="dot"></span>En vivo</span>':done?'<span class="pill fin">Completa</span>':`<span class="pill">${r.matches.length} partidos</span>`}
      <span class="sp"><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${rname(L,i)}"></span></summary>
      <div class="rnd-b">${rows}<div class="build">${slot('h')}<span class="vs">VS</span>${slot('a')}</div>
      <div style="display:flex;justify-content:flex-end"><button class="btn sm ghost danger" data-act="del-round" data-r="${r.id}" data-confirm="1">Eliminar jornada</button></div></div></details>`}).join('');
  return`<div class="box"><div class="box-h"><div><h3>Calendario</h3><p>Genera todos contra todos en un clic (respeta los bloqueos) o arma cada jornada a mano. Captura goles y tarjetas en cada partido; la tabla y las estadísticas se calculan solas.</p></div></div>
    <div class="toolbar"><label class="fld" for="g-start">Inicio<input type="date" id="g-start" value="${L.rounds[0]?.date||isoD(new Date())}"></label>
    <label class="fld" for="g-vu">Vueltas<select id="g-vu"><option value="1" ${L.vueltas!=2?'selected':''}>Una vuelta</option><option value="2" ${L.vueltas==2?'selected':''}>Ida y vuelta</option></select></label>
    <button class="btn pri" data-act="gen-cal" ${L.rounds.length?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>${L.rounds.length?'Regenerar calendario':'Generar calendario'}</button>
    <button class="btn" data-act="add-round">+ Jornada vacía</button></div></div>
    ${tray}<div>${rounds||'<div class="empty">Sin jornadas. Genera el calendario o agrega una jornada vacía.</div>'}</div>`;
}
function admBracket(L){
  const rounds=L.rounds.map(r=>`<details class="rnd" open><summary><h3>${esc(r.name)}</h3><span class="pill">${r.matches.filter(m=>!m.bye).length} partidos</span>
    <span class="sp"><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${esc(r.name)}"></span></summary>
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
      <label class="fld" for="mf-stream">Liga de transmisión en vivo<input id="mf-stream" type="url" placeholder="https://…" value="${esc(m.stream)}" data-chg="m-f" data-k="stream"></label>
      <label class="fld" for="mf-vod">Liga de la grabación<input id="mf-vod" type="url" placeholder="https://…" value="${esc(m.vod)}" data-chg="m-f" data-k="vod"></label>
    </div>
    <div><div class="box-h" style="margin-bottom:8px"><h3>Incidencias</h3><button class="btn sm" data-act="ev-add">+ Tarjeta u otro evento</button></div>
    <div style="display:flex;flex-direction:column;gap:8px">${evRows||'<span class="note">Usa “+ Gol” para sumar al marcador; luego elige al anotador y el minuto.</span>'}</div></div>
    <p class="note" style="margin:0">El marcador se calcula con los goles capturados. Los cambios se guardan al instante.</p></div>`;
}
function touchMatch(){const L=LG(MM.lid);propagate(L);save();drawMatch()}

/* --- modal de equipo --- */
let TE=null;
function openTeam(id){
  TE=id;const t=id?T(id):{name:'',short:'',color:'#2F6FB0',players:[]};
  $('#dlg').innerHTML=`<form class="dlg" id="teamF"><div class="dlg-h"><h3>${id?'Editar equipo':'Nuevo equipo'}</h3><button type="button" class="btn sm ghost" data-act="dlg-close">Cerrar</button></div>
    <div class="formg"><label class="fld full" for="tf-name">Nombre<input id="tf-name" required value="${esc(t.name)}"></label>
    <label class="fld" for="tf-short">Abreviatura<input id="tf-short" required maxlength="4" value="${esc(t.short)}" style="text-transform:uppercase"></label>
    <label class="fld" for="tf-color">Color<input id="tf-color" type="color" value="${t.color}" style="height:42px;padding:4px"></label>
    <label class="fld full" for="tf-pl">Plantilla (un jugador por línea: número y nombre)<textarea id="tf-pl" placeholder="10 Juan Pérez">${esc(t.players.map(p=>p.n+' '+p.name).join('\n'))}</textarea></label></div>
    <div style="display:flex;gap:8px;justify-content:space-between">${id?'<button type="button" class="btn danger" data-act="team-del" data-confirm="1">Eliminar equipo</button>':'<span></span>'}<button class="btn pri" type="submit">Guardar equipo</button></div></form>`;
  const d=$('#dlg');if(!d.open)d.showModal();
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
  'adm-sel'(el){AV={view:'league',id:el.dataset.id};B={round:null,h:null,a:null};OPEN.clear();render()},
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
  'team-edit'(el){openTeam(el.dataset.id)},
  'team-del'(){if(S.leagues.some(L=>L.teams.includes(TE))){toast('Primero da de baja el equipo de sus competencias','warn');return}S.teams=S.teams.filter(t=>t.id!==TE);save();$('#dlg').close()},
};
document.addEventListener('click',e=>{if(e.target.closest('summary input'))e.preventDefault()},true);
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||!el.dataset.act||el.disabled)return;
  if(el.dataset.confirm&&!el.dataset.armed){e.preventDefault();el.dataset.armed='1';el.dataset.label=el.textContent;el.textContent='¿Seguro? Toca otra vez';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent=el.dataset.label}},3500);return}
  ACT[el.dataset.act]?.(el,e);
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.tchip[data-act]')){e.preventDefault();e.target.click()}});
document.addEventListener('change',e=>{
  const el=e.target,k=el.dataset.chg;if(!k)return;
  if(k==='r-date'){const L=curL();const r=L.rounds.find(x=>x.id===el.dataset.r);r.date=el.value;r.matches.forEach(m=>m.date=el.value+m.date.slice(10));save();render()}
  if(k==='m-f'){const L=LG(MM.lid);const{m}=findM(L,MM.mid);m[el.dataset.k]=el.value||(el.dataset.k==='pen'?null:'');touchMatch()}
  if(k==='ev'){const L=LG(MM.lid);const{m}=findM(L,MM.mid);const ev=m.ev[+el.dataset.i];const kk=el.dataset.k;ev[kk]=kk==='m'?(+el.value||''):el.value;if(kk==='side')ev.p='';if(kk==='m')m.ev.sort((a,b)=>(a.m||999)-(b.m||999));touchMatch()}
});
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
  if(f.id==='teamF'){const name=$('#tf-name').value.trim(),short=$('#tf-short').value.trim().toUpperCase();if(!name||!short)return;
    const players=$('#tf-pl').value.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const m=l.match(/^(\d+)\s+(.+)$/);return m?{n:+m[1],name:m[2]}:{n:'',name:l}});
    if(TE){Object.assign(T(TE),{name,short,color:$('#tf-color').value,players})}else S.teams.push({id:uid('t'),name,short,color:$('#tf-color').value,players});
    save();$('#dlg').close();toast('Equipo guardado')}
});
$('#dlg').addEventListener('close',()=>{MM=null;render()});
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('[data-drag]');if(!c)return;e.dataTransfer.setData('text/plain',c.dataset.drag);e.dataTransfer.effectAllowed='move';c.classList.add('dragging')});
document.addEventListener('dragend',()=>document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over')));
document.addEventListener('dragover',e=>{const z=e.target.closest?.('[data-drop]');if(!z)return;e.preventDefault();document.querySelectorAll('.over').forEach(x=>x!==z&&x.classList.remove('over'));z.classList.add('over')});
document.addEventListener('drop',e=>{const z=e.target.closest?.('[data-drop]');if(!z)return;e.preventDefault();z.classList.remove('over');const id=e.dataTransfer.getData('text/plain');if(!id)return;
  if(z.dataset.drop==='pool')enroll(id,false);else if(z.dataset.drop==='enrolled')enroll(id,true);else if(z.dataset.drop==='slot')place(z.dataset.r,z.dataset.side,id)});
(async()=>{S=await loadData();render()})();
