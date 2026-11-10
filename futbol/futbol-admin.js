/* ===================== Administración ===================== */
let AV={view:'league',id:null};
let B={round:null,h:null,a:null};
const OPEN=new Set();
let MM=null; // match en edición {lid,mid}
const authed=()=>!!ME;
const curL=()=>LG(AV.id);
function findM(L,mid){for(const r of L.rounds)for(const m of r.matches)if(m.id===mid)return{m,r};return{}}

/* ===================== Cuenta del dueño de liga ===================== */
let GATE='login',PREPLAN=null,OWN=null,CFG=null,NEWOWN=false;
async function loadCfg(){if(CFG||MODE!=='server')return;try{CFG=await api('/config')}catch(e){CFG={}}}
function contactBtns(msg){
  const wa=CFG?.wa,em=CFG?.email,t=encodeURIComponent(msg);
  return`${wa?`<a class="btn pri" href="https://wa.me/${wa}?text=${t}" target="_blank" rel="noopener">Escribir a PÍCALE por WhatsApp</a>`:''}${em?`<a class="btn ${wa?'ghost':'pri'}" href="mailto:${esc(em)}?subject=${encodeURIComponent('Acceso a PÍCALE Fútbol')}&body=${t}">Escribir por correo</a>`:''}`;
}
const myLeagues=()=>ME?.role==='admin'?S.leagues:S.leagues.filter(L=>L.owner===ME?.id);
const isOwner=()=>ME?.role==='owner';
const subActive=()=>!isOwner()||ME.status==='activo';
const myCams=()=>isOwner()?(ME.cams||[]):[{id:'demo',code:'DEMO',name:'Cámara demo PÍCALE',cancha:''}];
function planCards(cta){
  return`<div class="plans">${PLANS.map(p=>{const cur=isOwner()&&ME.plan===p.id&&ME.status==='activo';
    return`<div class="plan ${p.best?'best':''} ${PREPLAN===p.id?'pre':''}"><div class="plan-h"><span class="eyebrow">${esc(p.tag)}</span><h3>${esc(p.name)}</h3>
      <div class="price"><b class="num">${money(p.price)}</b><span>al mes</span></div>
      <div class="cams-n">${p.cams?`<span class="cam-ic"></span>${p.cams} cámara${p.cams>1?'s':''} All-in-One incluida${p.cams>1?'s':''}`:'Sin cámara · solo software'}</div></div>
      <ul>${p.feats.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${cur?'<span class="btn ghost" aria-disabled="true">Tu plan actual</span>':cta(p)}</div>`}).join('')}</div>`;
}
function viewGate(){
  const local=MODE!=='server';if(local)GATE='pin';
  const tab=(k,t)=>`<button type="button" class="${GATE===k?'on':''}" data-act="gate-tab" data-k="${k}">${t}</button>`;
  const f={
    login:`<label class="fld" for="g-email">Correo<input id="g-email" class="inp" type="email" autocomplete="email" required></label>
      <label class="fld" for="g-pass">Contraseña<input id="g-pass" class="inp" type="password" autocomplete="current-password" required></label>
      <button class="btn pri" type="submit">Entrar</button>`,
    signup:`<p class="note" style="margin:0">Para crear torneos, PÍCALE activa tu cuenta. Envía tu solicitud y nos comunicamos contigo.</p>
      <label class="fld" for="g-name">Tu nombre<input id="g-name" class="inp" autocomplete="name" required></label>
      <label class="fld" for="g-league">Nombre de tu liga u organización<input id="g-league" class="inp" placeholder="Ej. Liga Nocturna Cumbres"></label>
      <label class="fld" for="g-phone">WhatsApp<input id="g-phone" class="inp" type="tel" inputmode="tel" autocomplete="tel" placeholder="81 1234 5678"></label>
      <label class="fld" for="g-email">Correo<input id="g-email" class="inp" type="email" autocomplete="email" required></label>
      <label class="fld" for="g-pass">Contraseña (mínimo 6 caracteres)<input id="g-pass" class="inp" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="btn pri" type="submit">Solicitar acceso</button>`,
    pin:`<label class="fld" for="pin">PIN de PÍCALE<input id="pin" class="inp" type="password" inputmode="numeric" autocomplete="off"></label>
      <button class="btn pri" type="submit">Entrar como PÍCALE</button>${local?'<p class="note">Modo demo local · PIN: 2026. Las cuentas de dueños necesitan el servidor.</p>':''}`,
  }[GATE];
  return`<div class="wrap"><div class="gate2">
    <div class="gate-pitch"><div class="eyebrow">PÍCALE Fútbol · para dueños de liga</div><h1>Tu liga, transmitida como profesional</h1>
      <ul class="ticks"><li>Calendario, tabla, grupos y eliminatoria sin hojas de cálculo</li><li>Tus jugadores con su cuenta, su foto y sus estadísticas</li><li>Cámara All-in-One: cada partido en vivo y grabado</li><li>Página pública e imagen del rol para tus grupos de WhatsApp</li></ul>
      <a class="btn ghost" href="/futbol" target="_blank" rel="noopener">Ver ligas en vivo</a></div>
    <form class="gate box" id="gate">${local?'':`<div class="seg">${tab('login','Entrar')}${tab('signup','Solicitar acceso')}</div>`}${f}
      ${local?'':GATE==='pin'?'<button type="button" class="linkb" data-act="gate-tab" data-k="login">Soy dueño de liga</button>':'<button type="button" class="linkb" data-act="gate-tab" data-k="pin">Acceso PÍCALE</button>'}</form>
  </div></div>`;
}
function viewPlans(){
  const first=isOwner()&&ME.status!=='activo';
  return`<div class="box"><div class="box-h"><div><div class="eyebrow">${first?`Hola, ${esc(ME.name.split(' ')[0])}`:'Suscripción'}</div><h2 style="margin-top:6px">${first?'Elige tu plan para empezar':'Cambiar de plan'}</h2>
    <p>Los planes con cámara incluyen el equipo All-in-One de PÍCALE: llega a tu cancha, lo conectas y cada partido se transmite y se graba solo.</p></div></div>
    ${planCards(p=>`<button class="btn ${p.best?'pri':''}" data-act="choose-plan" data-plan="${p.id}">Elegir ${esc(p.name)}</button>`)}
    <p class="note" style="margin:14px 0 0">Demostración: al confirmar se activa la cuenta sin hacer ningún cargo.</p></div>`;
}
function openCheckout(pid){
  const p=planOf(pid);
  $('#dlg').innerHTML=`<div class="dlg"><div class="dlg-h"><div><div class="eyebrow">Confirmar suscripción</div><h3 style="margin-top:4px">${esc(p.name)}</h3></div><button class="btn sm ghost" data-act="dlg-close">Cerrar</button></div>
    <div class="co">
      <div class="co-r"><span>Plan ${esc(p.name)} · mensual</span><b class="num">${money(p.price)}</b></div>
      ${p.cams?`<div class="co-r"><span>${p.cams} cámara${p.cams>1?'s':''} All-in-One (comodato) + instalación</span><b>Incluido</b></div>`:''}
      <div class="co-r tot"><span>Total al mes</span><b class="num">${money(p.price)}</b></div>
    </div>
    <div class="demo-pay"><b>Pago de demostración</b><span>No se realiza ningún cargo. En la versión final aquí se paga con tarjeta, transferencia u OXXO y se renueva cada mes.</span></div>
    <button class="btn pri" data-act="pay" data-plan="${p.id}">Activar suscripción</button></div>`;
  const d=$('#dlg');if(!d.open)d.showModal();
}
function viewSub(){
  const p=planOf(ME.plan);const act=ME.status==='activo';
  return`<div class="box"><div class="box-h"><div><div class="eyebrow">Mi suscripción</div><h2 style="margin-top:6px">${p?esc(p.name):'Sin plan'}</h2></div>
    <span class="pill ${act?'fin':'live'}">${act?'Activa':ME.status==='cancelado'?'Cancelada':'Sin plan'}${ME.demo?' · demo':''}</span></div>
    <div class="facts">
      <div><span>Mensualidad</span><b class="num">${p?money(p.price):'—'}</b></div>
      <div><span>Cámaras All-in-One</span><b>${(ME.cams||[]).length} de ${p?.cams||0} conectadas</b></div>
      <div><span>Activa desde</span><b>${esc(ME.since||'—')}</b></div>
      <div><span>${act?'Próxima renovación':'Termina'}</span><b>${esc(ME.renews||'—')}</b></div>
      <div><span>Competencias</span><b>${myLeagues().length}</b></div>
    </div>
    <div class="toolbar" style="margin-top:16px"><button class="btn pri" data-act="go-plans">${act?'Cambiar de plan':'Reactivar'}</button>${act?'<button class="btn danger" data-act="cancel-sub" data-confirm="1">Cancelar suscripción</button>':''}</div></div>`;
}
function viewCams(){
  const n=(ME.cams||[]).length,max=10;
  const venues=[...new Set(myLeagues().flatMap(L=>[L.venue,...L.rounds.flatMap(r=>r.matches.map(m=>m.venue))]).filter(Boolean))];
  const list=(ME.cams||[]).map(c=>`<div class="camc"><div class="cam-big"></div><div class="camc-b">
      <div class="camc-h"><b>${esc(c.name)}</b>${c.code==='DEMO'?'<span class="pill fin"><span class="dot" style="color:var(--win)"></span>En línea · demo</span>':'<span class="pill">Esperando señal</span>'}</div>
      <small class="num">${esc(c.code)} · activada ${esc(c.added||'')}</small>
      <div class="toolbar"><label class="fld" for="cc-${c.id}" style="flex:1">Cancha que cubre<input id="cc-${c.id}" class="inp" list="venues" value="${esc(c.cancha)}" data-chg="cam-cancha" data-c="${c.id}" placeholder="Ej. Cancha 1"></label>
      <button class="btn sm ghost danger" data-act="cam-del" data-c="${c.id}" data-confirm="1">Quitar</button></div></div></div>`).join('');
  return`<div class="box"><div class="box-h"><div><div class="eyebrow">Cámaras All-in-One · ${n} conectada${n===1?'':'s'}</div><h2 style="margin-top:6px">Tus cámaras</h2>
    <p>Cada cámara cubre una cancha. Al poner un partido de esa cancha <b>En vivo</b>, la transmisión se activa sola; al marcarlo <b>Final</b>, el partido completo queda grabado en la página pública.</p></div></div>
    <div class="cams">${list}</div>
    ${max>n?`<form class="addcam" id="camF"><h3>Activar cámara</h3><p class="note" style="margin:0">El código viene en la etiqueta de tu cámara (por ejemplo PCL-7F3K). ¿Aún no te llega? Escribe <b>DEMO</b> para probar con la cámara de demostración.</p>
      <div class="toolbar"><label class="fld" for="cam-code">Código<input id="cam-code" class="inp num" required placeholder="PCL-7F3K" style="text-transform:uppercase"></label>
      <label class="fld" for="cam-name">Nombre<input id="cam-name" class="inp" placeholder="Cámara ${n+1}"></label>
      <label class="fld" for="cam-cancha" style="flex:1">Cancha<input id="cam-cancha" class="inp" list="venues" placeholder="Ej. Cancha 1"></label>
      <button class="btn pri" type="submit">Activar</button></div></form>`:''}
    <datalist id="venues">${venues.map(v=>`<option value="${esc(v)}">`).join('')}</datalist></div>
    <div class="box"><h3 style="margin-bottom:12px">Cómo funciona</h3><ol class="steps">
      <li><b>Llega tu cámara All-in-One.</b> Se monta en la cancha, se conecta a la corriente y a internet, y aquí la activas con su código.</li>
      <li><b>Capturas el partido como siempre.</b> Al ponerlo En vivo, la página pública empieza a transmitir desde la cámara de esa cancha.</li>
      <li><b>Al terminar queda grabado.</b> Jugadores y familias lo ven completo en la pestaña Transmisión de tu liga.</li></ol></div>`;
}
async function loadOwners(){try{OWN=await api('/owners')}catch(e){OWN=[];toast(e.message,'warn')}render()}
function viewOwners(){
  if(!OWN){loadOwners();return'<div class="box"><div class="empty">Cargando cuentas…</div></div>'}
  const all=OWN.filter(o=>o.role!=='player'),pl=OWN.filter(o=>o.role==='player');
  const pend=all.filter(o=>o.access==='pendiente'),own=all.filter(o=>o.access!=='pendiente');
  const wa=o=>{const d=String(o.phone||'').replace(/\D/g,'');return d?`<a href="https://wa.me/${d.length===10?'52'+d:d}" target="_blank" rel="noopener">${esc(o.phone)}</a>`:'—'};
  const linked=id=>S.teams.filter(t=>(t.players||[]).some(p=>p.uid===id));
  return`<div class="kpis"><div class="kpi"><span class="eyebrow">Dueños de liga</span><b class="num">${own.length}</b></div><div class="kpi"><span class="eyebrow">Jugadores con cuenta</span><b class="num">${pl.length}</b></div><div class="kpi"><span class="eyebrow">Cámaras conectadas</span><b class="num">${own.reduce((s,o)=>s+(o.cams||[]).length,0)}</b></div><div class="kpi"><span class="eyebrow">Competencias</span><b class="num">${S.leagues.length}</b></div></div>
  <div class="box ${pend.length?'reqbox':''}"><div class="box-h"><div><div class="eyebrow">${pend.length} pendiente${pend.length===1?'':'s'}</div><h2 style="margin-top:6px">Solicitudes para crear torneos</h2><p>Quien se registra como dueño de liga espera aquí hasta que lo apruebes.</p></div><button class="btn sm" data-act="owners-reload">Actualizar</button></div>
  ${pend.length?`<div class="reqs">${pend.map(o=>`<div class="req"><div class="req-b"><b>${esc(o.name)}</b><small>${esc(o.league||'Sin nombre de liga')} · ${esc(o.email)} · WhatsApp ${wa(o)} · ${esc(o.created||'')}</small></div>
    <div class="toolbar"><button class="btn sm pri" data-act="own-access" data-o="${o.id}" data-v="activo">Aprobar</button><button class="btn sm ghost danger" data-act="own-access" data-o="${o.id}" data-v="eliminar" data-confirm="1">Rechazar</button></div></div>`).join('')}</div>`
    :'<div class="empty">No hay solicitudes pendientes.</div>'}</div>
  <div class="box"><div class="box-h"><div><h2>Dueños de liga</h2><p>Cada dueño solo ve y edita sus competencias. Si suspendes una cuenta, sus torneos publicados siguen visibles pero ya no puede editarlos.</p></div><button class="btn sm ${NEWOWN?'ghost':'pri'}" data-act="own-new">${NEWOWN?'Cancelar':'+ Dar de alta dueño'}</button></div>
  ${NEWOWN?`<form class="addcam" id="ownF"><h3>Nuevo dueño de liga</h3><p class="note" style="margin:0">Queda activo desde ya. Al crearla se copian sus datos de acceso para que se los mandes por WhatsApp.</p>
    <div class="formg"><label class="fld" for="o-name">Nombre<input id="o-name" class="inp" required></label><label class="fld" for="o-league">Liga u organización<input id="o-league" class="inp"></label>
    <label class="fld" for="o-phone">WhatsApp<input id="o-phone" class="inp" type="tel"></label><label class="fld" for="o-email">Correo<input id="o-email" class="inp" type="email" required></label>
    <label class="fld" for="o-pass">Contraseña temporal<input id="o-pass" class="inp num" required minlength="6" value="${Math.random().toString(36).slice(2,10)}"></label></div>
    <div class="toolbar"><button class="btn pri" type="submit">Crear cuenta activa</button></div></form>`:''}
  ${own.length?`<div class="tw"><table class="st"><thead><tr><th class="l">Dueño</th><th class="l">Liga</th><th class="l">Correo</th><th class="l">WhatsApp</th><th>Cámaras</th><th>Competencias</th><th>Alta</th><th>Acceso</th></tr></thead><tbody>
  ${own.map(o=>{const s=o.access==='suspendido';return`<tr><td class="tn l">${esc(o.name)}</td><td class="l" style="font-family:var(--f-body)">${esc(o.league||'—')}</td><td class="l">${esc(o.email)}</td><td class="l">${wa(o)}</td><td>${(o.cams||[]).length}</td><td>${S.leagues.filter(L=>L.owner===o.id).length}</td><td>${esc(o.created||'')}</td>
    <td><button class="btn sm ${s?'pri':'ghost danger'}" data-act="own-access" data-o="${o.id}" data-v="${s?'activo':'suspendido'}" ${s?'':'data-confirm="1"'}>${s?'Reactivar':'Suspender'}</button></td></tr>`}).join('')}
  </tbody></table></div>`:'<div class="empty">Aún no hay dueños aprobados.</div>'}</div>
  <div class="box"><div class="box-h"><div><h2>Jugadores</h2><p>Se registran con el link de invitación de su equipo.</p></div></div>
  ${pl.length?`<div class="tw"><table class="st"><thead><tr><th class="l">Jugador</th><th class="l">Correo</th><th class="l">Equipos</th><th>Alta</th></tr></thead><tbody>
  ${pl.map(o=>`<tr><td class="tn l"><div>${avatar(o,'sm')}${esc(o.name)}</div></td><td class="l">${esc(o.email)}</td><td class="l" style="font-family:var(--f-body)">${linked(o.id).map(t=>esc(t.name)).join(', ')||'—'}</td><td>${esc(o.created||'')}</td></tr>`).join('')}
  </tbody></table></div>`:'<div class="empty">Aún no hay jugadores con cuenta.</div>'}</div>`;
}
function viewPending(){
  if(!CFG){loadCfg().then(render)}
  const susp=ME.access==='suspendido',first=esc(ME.name.split(' ')[0]);
  const msg=`Hola PÍCALE, soy ${ME.name}${ME.league?` de ${ME.league}`:''}. Me registré en PÍCALE Fútbol con el correo ${ME.email} y quiero activar mi cuenta para crear torneos.`;
  const btns=contactBtns(msg);
  return`<div class="wrap"><div class="gate box pend" style="margin:60px auto">
    <div class="eyebrow">${susp?'Cuenta suspendida':'Solicitud recibida'}</div><h2>Hola, ${first}</h2>
    <p>${susp?'Tu acceso para crear y editar torneos está pausado. Comunícate con PÍCALE para reactivarlo.'
      :'Tu cuenta ya está creada, pero para crear torneos <b>PÍCALE tiene que activarla</b>. Comunícate con nosotros y te damos acceso.'}</p>
    ${btns?`<div class="toolbar">${btns}</div>`:'<p class="note" style="margin:0">Comunícate con tu contacto de PÍCALE y dale el correo con el que te registraste.</p>'}
    <div class="facts"><div><span>Correo registrado</span><b>${esc(ME.email||'')}</b></div>${ME.league?`<div><span>Liga</span><b>${esc(ME.league)}</b></div>`:''}</div>
    <div class="toolbar"><button class="btn" data-act="pend-check">Ya me activaron</button><button class="btn ghost" data-act="logout">Salir</button></div></div></div>`;
}
function camAuto(m){if(!m||!m.cam)return;if(m.status==='vivo'&&!m.stream)m.stream=CAM_URL.stream(m.cam);if(m.status==='final'&&!m.vod)m.vod=CAM_URL.vod(m.cam,m.id)}

function viewAdmin(){
  if(!ME)return viewGate();
  if(ME.role==='player')return`<div class="wrap"><div class="gate box" style="margin:60px auto"><div class="eyebrow">Cuenta de jugador</div><h2>Hola, ${esc(ME.name.split(' ')[0])}</h2>
    <p>Este panel es para quienes organizan ligas. Tus torneos, tu foto y tus estadísticas están en tu cuenta de jugador.</p>
    <a class="btn pri" href="/futbol?cuenta">Ir a Mis torneos</a><button class="btn ghost" data-act="logout">Salir</button></div></div>`;
  if(ME.role==='pending')return viewPending();
  const owner=isOwner();const mine=myLeagues();
  if(AV.view==='league'&&!(curL()&&mine.includes(curL())))AV={view:'league',id:mine[0]?.id||null};
  if(AV.view==='league'&&!AV.id)AV={view:'new'};
  const side=`<aside class="adm-side"><div class="acct"><b>${esc(ME.name)}</b><small>${owner?esc(ME.league||'Dueño de liga'):'Administrador PÍCALE'}</small></div>
    <div class="side-h">Mis competencias</div>
    ${mine.map(L=>`<button class="side-b ${AV.view==='league'&&AV.id===L.id?'on':''}" data-act="adm-sel" data-id="${L.id}">${esc(L.name)}<small>${L.draft?'borrador':+L.lig>1?'liga + liguilla':L.kind}</small></button>`).join('')}
    <button class="side-b ${AV.view==='new'?'on':''}" data-act="adm-new">+ Nueva competencia</button>
    <div class="side-h">${owner?'Mi cuenta':'PÍCALE'}</div>
    ${owner?`<button class="side-b ${AV.view==='cams'?'on':''}" data-act="go-cams">Cámaras All-in-One<small>${(ME.cams||[]).length}</small></button>`
    :`<button class="side-b ${AV.view==='owners'?'on':''}" data-act="go-owners">Cuentas registradas</button>
    <button class="side-b" data-act="reset" data-confirm="1">Restaurar datos de ejemplo</button>`}
    <button class="side-b" data-act="logout">Salir</button></aside>`;
  const main={new:admNew,cams:viewCams,owners:viewOwners}[AV.view]?.()??admLeague(curL());
  return`<div class="wrap adm">${side}<main class="adm-main">${main}</main></div>`;
}
function admNew(){
  return`<form class="box" id="newL"><div class="box-h"><div><h2>Nueva competencia</h2><p>Después de crearla, da de alta sus equipos con sus jugadores y genera el calendario o el cuadro.</p></div></div>
  <div class="formg">
    <label class="fld full" for="nl-name">Nombre<input id="nl-name" required placeholder="Ej. Liga Nocturna Clausura 2027"></label>
    <label class="fld" for="nl-kind">Formato<select id="nl-kind" data-chg="nl-kind"><option value="liga">Liga · todos contra todos</option><option value="liguilla">Liga + liguilla</option><option value="grupos">Grupos + eliminación directa</option><option value="torneo">Torneo · eliminación directa</option></select></label>
    <label class="fld" for="nl-vu" data-for="liga liguilla grupos">Vueltas<select id="nl-vu"><option value="1">Una vuelta</option><option value="2">Ida y vuelta</option></select></label>
    <label class="fld" for="nl-lig" data-for="liguilla">Pasan a la liguilla<select id="nl-lig">${[[2,'2 · final directa'],[4,'4 · semifinales'],[6,'6 · 1° y 2° pasan directo a semis'],[8,'8 · cuartos de final'],[12,'12 · los 4 primeros directo a cuartos'],[16,'16 · octavos de final']].map(([n,t])=>`<option value="${n}" ${n===8?'selected':''}>${t}</option>`).join('')}</select></label>
    <label class="fld" for="nl-tie" data-for="liguilla">Si empatan en la liguilla<select id="nl-tie"><option value="pos">Pasa el mejor ubicado en la tabla</option><option value="pen">Se define en penales</option></select></label>
    <label class="fld" for="nl-ng" data-for="grupos">Número de grupos<select id="nl-ng">${[2,3,4,6,8].map(n=>`<option value="${n}" ${n===2?'selected':''}>${n} grupos</option>`).join('')}</select></label>
    <label class="fld" for="nl-q" data-for="grupos">Clasifican por grupo<select id="nl-q"><option value="1">1 equipo</option><option value="2" selected>2 equipos</option><option value="3">3 equipos</option><option value="4">4 equipos</option></select></label>
    <label class="fld" for="nl-season">Temporada<input id="nl-season" placeholder="Clausura 2027"></label>
    <label class="fld" for="nl-venue">Sede principal<input id="nl-venue" placeholder="Complejo deportivo"></label>
    <label class="chk full" for="nl-draft"><input id="nl-draft" type="checkbox" checked> Guardar como borrador (no se publica hasta que tú quieras)</label>
  </div><div style="margin-top:16px"><button class="btn pri" type="submit">Crear competencia</button></div></form>`;
}
// Muestra solo los campos que aplican al formato elegido.
function nlFields(){const k=$('#nl-kind')?.value;document.querySelectorAll('#newL [data-for]').forEach(el=>el.hidden=!el.dataset.for.split(' ').includes(k))
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
  if(other&&L.kind==='grupos'&&groupOf(L,tid)!==groupOf(L,other))return groupOf(L,tid)?`Es del ${groupOf(L,tid).name}`:'Sin grupo';
  if(other){if(isBlocked(L,tid,other))return'Cruce bloqueado';if(meetings(L,tid,other)>=(+L.vueltas||1))return'Ya se enfrentaron'}
  return null;
}
function admLeague(L){
  const avail=S.teams.filter(t=>!L.teams.includes(t.id));
  const head=`<div class="box"><div class="box-h"><div><div class="eyebrow">${kindLabel(L)}${L.kind!=='torneo'?` · ${L.vueltas==2?'ida y vuelta':'una vuelta'}`:''} · ${esc(L.season)}</div><h2 style="margin-top:6px">${esc(L.name)} ${L.draft?'<span class="pill draft">Borrador</span>':'<span class="pill fin">Publicada</span>'}</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${L.draft?`<button class="btn pri" data-act="publish">Publicar</button>`:''}<a class="btn ${L.draft?'':'pri'}" href="/futbol?liga=${L.id}" target="_blank" rel="noopener">${L.draft?'Vista previa':'Ver página pública'}</a><button class="btn" data-act="copy-link" data-id="${L.id}">Copiar liga</button><button class="btn danger" data-act="del-league" data-confirm="1">Eliminar</button></div></div>
    <div class="note">Página pública: <span class="num">${esc(pubURL(L.id))}</span> · ${L.teams.length} equipos · ${L.rounds.length} ${L.kind==='torneo'?'rondas':'jornadas y rondas'} · ${all(L).filter(m=>m.status==='final').length} partidos jugados</div>
    ${L.draft?`<div class="draftbar"><b>Borrador:</b> solo la ves tú. No aparece en la página pública y los links de capitán y de invitación se activan cuando la publiques. Cuando esté lista, pica <b>Publicar</b>.</div>`:`<div class="toolbar" style="margin-top:10px"><button class="btn sm ghost" data-act="unpublish" data-confirm="1">Regresar a borrador (ocultar)</button></div>`}</div>`;
  const others=myLeagues().filter(x=>x.id!==L.id&&x.teams.length);
  const tcards=L.teams.map(id=>{const t=T(id);if(!t)return'';const used=L.rounds.some(r=>r.matches.some(m=>m.h===id||m.a===id));
    return`<div class="tcard">${crest(id)}<div><b>${esc(t.name)}</b><small>${t.players.length} jugadores${used?' · en calendario':''}</small></div><button class="btn sm" data-act="team-edit" data-id="${id}">Editar y jugadores</button></div>`}).join('');
  const enr=`<div class="box"><div class="box-h"><div><h3>Equipos de la competencia <span class="note">${L.teams.length}</span></h3><p>Cada competencia tiene sus propios equipos, logos y plantillas. Lo que cambies aquí no afecta a otras competencias.</p></div><button class="btn pri" data-act="team-new">+ Nuevo equipo</button></div>
    <div class="teams-g">${tcards||'<div class="empty">Aún no hay equipos. Agrega el primero con “+ Nuevo equipo”.</div>'}</div>
    ${others.length?`<div class="toolbar" style="margin-top:16px"><label class="fld" for="imp-t" style="flex:1;min-width:220px">Copiar un equipo de otra competencia<select id="imp-t">${others.map(x=>`<optgroup label="${esc(x.name)}">${x.teams.map(id=>`<option value="${id}">${esc(tname(id))}</option>`).join('')}</optgroup>`).join('')}</select></label><button class="btn" data-act="team-copy">Copiar con sus jugadores</button></div>
    <div class="toolbar" style="margin-top:10px"><label class="fld" for="imp-l" style="flex:1;min-width:220px">O copia todos los equipos de una competencia<select id="imp-l">${others.map(x=>`<option value="${x.id}">${esc(x.name)} (${x.teams.length})</option>`).join('')}</select></label><button class="btn" data-act="team-copy-all">Copiar todos</button></div>`:''}</div>`;
  const blk=L.kind==='liga'?`<div class="box"><div class="box-h"><div><h3>Bloqueos de cruce</h3><p>Los equipos que ya se enfrentaron se bloquean solos según las vueltas. Agrega aquí cruces que nunca deben programarse (por ejemplo, dos equipos del mismo club).</p></div></div>
    <div class="toolbar"><label class="fld" for="b1" style="flex:1">Equipo A<select id="b1">${L.teams.map(id=>`<option value="${id}">${esc(tname(id))}</option>`).join('')}</select></label>
    <label class="fld" for="b2" style="flex:1">Equipo B<select id="b2">${L.teams.map((id,i)=>`<option value="${id}" ${i===1?'selected':''}>${esc(tname(id))}</option>`).join('')}</select></label>
    <button class="btn" data-act="blk-add">Bloquear cruce</button></div>
    <div class="blk" style="margin-top:12px">${(L.blocks||[]).map(([x,y],i)=>`<div class="blk-r">${crest(x,'xs')}${esc(tname(x))} <span class="vs">VS</span> ${crest(y,'xs')}${esc(tname(y))}<button class="btn sm ghost" data-act="blk-del" data-i="${i}">Quitar</button></div>`).join('')||'<span class="note">Sin bloqueos manuales.</span>'}</div></div>`:'';
  const exc=L.teams.length?admUnavail(L):'';
  if(L.kind==='grupos')return head+enr+exc+admGroups(L)+admCalendar(L)+admKO(L)+admAvisos(L);
  return head+enr+blk+exc+(L.kind==='liga'?admCalendar(L)+admLiguilla(L):admBracket(L))+admAvisos(L);
}
function admCalendar(L){
  const RS=L.rounds.filter(r=>!r.ko);
  if(!B.round||!RS.find(r=>r.id===B.round))B={round:(RS.find(r=>r.matches.some(m=>m.status!=='final'))||RS.at(-1))?.id||null,h:null,a:null};
  const picked=B.h||B.a;
  const ar=L.rounds.findIndex(r=>r.id===B.round);
  const tray=RS.length?`<div class="tray"><div class="tray-h">Armando <b>${ar>=0?rname(L,ar):'—'}</b>${picked?` · elegiste <b>${esc(tname(picked))}</b>, ahora su rival`:' · arrastra o toca dos equipos'}. Los bloqueados no se pueden elegir. También puedes arrastrar un equipo de aquí sobre un partido para cambiarlo.</div>
    <div class="chips">${L.teams.map(id=>{const sel=id===B.h||id===B.a;return tchip(id,{act:'pick',sel,lock:sel?null:lockReason(L,B.round,id,picked)})}).join('')}</div></div>`:'';
  const rounds=RS.map((r,i)=>{
    const done=r.matches.length&&r.matches.every(m=>m.status==='final');const lv=r.matches.some(m=>m.status==='vivo');
    const isA=r.id===B.round;const open=OPEN.has(r.id)||isA;
    const rows=r.matches.map(m=>calRow(L,r,m)).join('');
    const slot=side=>{const id=isA?B[side]:null;return`<button class="slot ${id?'full':''}" data-drop="slot" data-act="slot" data-r="${r.id}" data-side="${side}">${id?crest(id,'xs')+esc(tname(id)):side==='h'?'Local':'Visitante'}</button>`};
    return`<details class="rnd ${isA?'act':''}" data-rid="${r.id}" data-drop="round" ${open?'open':''}><summary>${r.matches.some(m=>m.status!=='programado')?`<span class="rgrip off" title="Jornada con partidos jugados: queda fija">${LOCK}</span>`:`<span class="rgrip" draggable="true" data-drag="r:${r.id}" title="Arrastra sobre otra jornada para intercambiarlas">⠿</span>`}<h3>${rname(L,i)}</h3>${lv?'<span class="pill live"><span class="dot"></span>En vivo</span>':done?'<span class="pill fin">Completa</span>':`<span class="pill">${r.matches.length} partidos</span>`}${(()=>{const n=r.matches.filter(m=>m.status==='programado'&&clashes(L,m).length).length;return n?`<span class="pill warnp">⚠ ${n} choque${n>1?'s':''}</span>`:''})()}
      <span class="sp"><button class="btn sm" data-act="img" data-r="${r.id}" ${r.matches.length?'':'disabled'}>Imagen del rol</button><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${rname(L,i)}"></span></summary>
      <div class="rnd-b">${rows}${(()=>{const fr=restingIn(L,r);return fr.length?`<div class="rest"><span class="note">${r.matches.length?'Descansan':'Sin partidos todavía'}:</span>${fr.map(id=>`<span class="tchip mini" ${dayBlocked(L,id,r.date)?'title="No puede jugar ese día"':''}>${crest(id,'xs')}${esc(shortN(id))}${dayBlocked(L,id,r.date)?' <span class="note">(no puede)</span>':''}</span>`).join('')}${canFill(L,r)?`<button class="btn sm pri" data-act="fill-round" data-r="${r.id}">Completar jornada automáticamente</button>`:fr.length>1&&r.matches.length?'<span class="note">Ya se enfrentaron entre ellos</span>':''}</div>`:''})()}<div class="build">${slot('h')}<span class="vs">VS</span>${slot('a')}</div>
      <div class="rnd-f">${r.matches.some(m=>m.status==='programado')?`<button class="btn sm" data-act="sched-round" data-r="${r.id}">Ordenar horarios</button>`:''}${r.matches.some(m=>m.status!=='programado')||RS.length<2?'':`<select class="inp mv" data-chg="rswap" data-r="${r.id}" aria-label="Intercambiar con otra jornada"><option value="">Intercambiar con…</option>${RS.map((R,k)=>R===r?'':`<option value="${R.id}" ${roundSwapWhy(L,r.id,R.id)?'disabled':''}>${rname(L,k)}${roundSwapWhy(L,r.id,R.id)?' · jugada':''}</option>`).join('')}</select>`}<button class="btn sm ghost danger" data-act="del-round" data-r="${r.id}" data-confirm="1">Eliminar jornada</button></div></div></details>`}).join('');
  return`<div class="box"><div class="box-h"><div><h3>${L.kind==='grupos'?'Fase de grupos':'Calendario'}</h3><p>Genera el calendario completo, <b>ve jornada por jornada</b> con “Siguiente jornada”, o arma cada una a mano. Para reprogramar: <b>arrastra una jornada</b> (⠿) sobre otra para intercambiar sus partidos, <b>arrastra un partido</b> a otra jornada (si sus equipos ya juegan allá, esos partidos se pasan a la jornada de origen), o <b>arrastra un equipo</b> sobre otro para intercambiarlos. En celular usa los selectores o toca los equipos. Verde = se puede, rojo = ya se enfrentaron o hay choque. Los partidos jugados quedan fijos.</p></div></div>
    <div class="toolbar"><label class="fld" for="g-start">Inicio<input type="date" id="g-start" value="${L.rounds[0]?.date||isoD(new Date())}"></label>
    <label class="fld" for="g-vu">Vueltas<select id="g-vu"><option value="1" ${L.vueltas!=2?'selected':''}>Una vuelta</option><option value="2" ${L.vueltas==2?'selected':''}>Ida y vuelta</option></select></label>
    ${L.kind==='grupos'?`<button class="btn pri" data-act="gen-gcal" ${RS.length?'data-confirm="1"':''} ${L.groups.some(g=>g.teams.length>=2)?'':'disabled'}>${RS.length?'Regenerar fase de grupos':'Generar fase de grupos'}</button>`:`<button class="btn pri" data-act="gen-cal" ${L.rounds.length?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>${L.rounds.length?'Regenerar calendario':'Generar calendario'}</button>`}
    <button class="btn" data-act="next-round" ${L.kind==='grupos'&&!L.groups.some(g=>g.teams.length>=2)||L.teams.length<2?'disabled':''}>+ Siguiente jornada</button>
    <button class="btn ghost" data-act="add-round">+ Jornada vacía (a mano)</button></div>
    ${L.teams.length>1?`<p class="note" style="margin:10px 0 0">${(()=>{const n=pendingPairs(L);return n?`Faltan <b>${n}</b> partido${n>1?'s':''} para completar ${L.vueltas==2?'ida y vuelta':'la vuelta'}. “Siguiente jornada” arma una jornada nueva solo con equipos que todavía no se enfrentan.`:'Ya se programaron todos los cruces.'})()}</p>`:''}
    ${schedBar(L)}</div>
    ${tray}<div>${rounds||'<div class="empty">Sin jornadas. Genera el calendario o agrega una jornada vacía.</div>'}</div>`;
}
function admBracket(L){
  const rounds=L.rounds.map(r=>`<details class="rnd" open><summary><h3>${esc(r.name)}</h3><span class="pill">${r.matches.filter(m=>!m.bye).length} partidos</span>
    <span class="sp"><button class="btn sm" data-act="img" data-r="${r.id}">Imagen del rol</button><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${esc(r.name)}"></span></summary>
    <div class="rnd-b">${r.matches.map(m=>{if(m.bye)return`<div class="mrow"><span class="grip"></span><span class="tm">Pase</span><div class="t h"><span>${esc(tname(m.h||m.a))}</span>${crest(m.h||m.a,'xs')}</div><span class="s">→</span><div class="t"><span class="note">Avanza directo</span></div><div class="ac"></div></div>`;const[h,a]=sc(m);return`<div class="mrow"><span class="grip"></span>${whenCell(L,r,m)}<div class="t h"><span>${esc(tname(m.h))}</span>${crest(m.h,'xs')}</div><span class="s">${m.status==='programado'?'vs':h+'–'+a}</span><div class="t">${crest(m.a,'xs')}<span>${esc(tname(m.a))}</span></div><div class="ac">${statusPill(m)}<button class="btn sm" data-act="edit-m" data-m="${m.id}" ${!m.h||!m.a?'disabled':''}>Capturar</button></div></div>`}).join('')}</div></details>`).join('');
  return`<div class="box"><div class="box-h"><div><h3>Cuadro eliminatorio</h3><p>Se sortea en el orden de inscripción (1 vs último). Los ganadores avanzan solos; en empate eliges quién pasa por penales.</p></div></div>
    <div class="toolbar"><label class="fld" for="g-start">Primera ronda<input type="date" id="g-start" value="${L.rounds[0]?.date||isoD(new Date())}"></label>
    <button class="btn pri" data-act="gen-bracket" ${L.rounds.length?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>${L.rounds.length?'Volver a sortear':'Generar cuadro'}</button></div></div>
    <div>${rounds||'<div class="empty">Inscribe equipos y genera el cuadro.</div>'}</div>`;
}



/* --- Excepciones: días u horarios en que un equipo no puede jugar --- */
const DOWS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const blocksFor=(L,tid)=>(L.unavail||[]).filter(u=>u.team===tid);
const dowOf=d=>new Date(d+'T12:00').getDay();
function hitsBlock(u,dt){
  const d=String(dt).slice(0,10),t=String(dt).slice(11,16);
  if(u.kind==='date'&&u.date!==d)return false;
  if(u.kind==='weekday'&&dowOf(d)!==+u.dow)return false;
  return t>=(u.from||'00:00')&&t<(u.to||'24:00');
}
const wholeDay=u=>!u.from&&!u.to;
const dayBlocked=(L,tid,d)=>blocksFor(L,tid).some(u=>wholeDay(u)&&hitsBlock(u,d+'T12:00'));
function clashes(L,m){if(!m||!m.date||m.bye)return[];return[m.h,m.a].filter(Boolean).flatMap(t=>blocksFor(L,t).filter(u=>hitsBlock(u,m.date)).map(u=>({t,u})))}
function blockWhen(u){if(u.kind==='weekday')return`los ${DOWS[+u.dow]}`;const s=new Date(u.date+'T12:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'short'}).replace('.','');return`el ${s}`}
function blockHours(u){if(wholeDay(u))return'';if(!u.from)return` antes de las ${u.to}`;if(!u.to)return` después de las ${u.from}`;return` de ${u.from} a ${u.to}`}
const blockText=u=>`no puede${blockHours(u)} ${blockWhen(u)}`;
const clashText=c=>`${shortN(c.t)} ${blockText(c.u)}${c.u.note?` (${c.u.note})`:''}`;
function admUnavail(L){
  const list=(L.unavail||[]);
  return`<div class="box"><div class="box-h"><div><h3>Excepciones de horario</h3><p>Días u horarios en que un equipo no puede jugar. Al armar jornadas y al ordenar horarios se respetan solas; si un equipo no puede en todo el día, descansa esa jornada. Si un partido queda en un horario que choca, aparece marcado en amarillo.</p></div></div>
    ${list.length?`<div class="blk">${list.map(u=>`<div class="blk-r">${crest(u.team,'xs')}<b>${esc(tname(u.team))}</b><span>${esc(blockText(u))}${u.note?` <span class="note">· ${esc(u.note)}</span>`:''}</span><button class="btn sm ghost" data-act="ex-del" data-id="${u.id}">Quitar</button></div>`).join('')}</div>`:'<p class="note" style="margin:0 0 4px">Sin excepciones todavía.</p>'}
    ${L.teams.length?`<div class="exform">
      <label class="fld" for="ex-team">Equipo<select id="ex-team" class="inp">${L.teams.map(id=>`<option value="${id}">${esc(tname(id))}</option>`).join('')}</select></label>
      <label class="fld" for="ex-kind">Cuándo<select id="ex-kind" class="inp" data-chg="ex-ui"><option value="date">Una fecha</option><option value="weekday">Cada semana</option></select></label>
      <label class="fld" for="ex-date" data-ex="date">Fecha<input id="ex-date" class="inp" type="date" value="${addDays(isoD(new Date()),7)}"></label>
      <label class="fld" for="ex-dow" data-ex="weekday" hidden>Día<select id="ex-dow" class="inp">${DOWS.map((d,i)=>`<option value="${i}" ${i===5?'selected':''}>${d}</option>`).join('')}</select></label>
      <label class="fld" for="ex-mode">Horario<select id="ex-mode" class="inp" data-chg="ex-ui"><option value="all">Todo el día</option><option value="before">No puede antes de…</option><option value="after">No puede después de…</option><option value="between">No puede entre…</option></select></label>
      <label class="fld" for="ex-t1" data-ex="t1" hidden>Hora<input id="ex-t1" class="inp num" type="time" step="300" value="20:00"></label>
      <label class="fld" for="ex-t2" data-ex="t2" hidden>y las<input id="ex-t2" class="inp num" type="time" step="300" value="22:00"></label>
      <label class="fld" for="ex-note" style="flex:1;min-width:160px">Motivo (opcional)<input id="ex-note" class="inp" placeholder="Ej. torneo de empresa"></label>
      <button class="btn pri" data-act="ex-add">Agregar excepción</button></div>`:''}
  </div>`;
}
function exUI(){const k=$('#ex-kind')?.value,m=$('#ex-mode')?.value;const show=(n,v)=>{const el=document.querySelector(`[data-ex="${n}"]`);if(el)el.hidden=!v};
  show('date',k==='date');show('weekday',k==='weekday');show('t1',m&&m!=='all');show('t2',m==='between');
  const l=document.querySelector('[for="ex-t1"]');if(l)l.firstChild.textContent=m==='between'?'De':'Hora'}

/* --- Horarios y jornada por jornada --- */
const addDays=(d,n)=>isoD(new Date(new Date(d+'T12:00').getTime()+n*864e5));
const SCH=L=>({t:'19:00',step:60,courts:1,...(L.sched||{})});
// Horario del partido número k de la jornada: avanza cada "step" minutos y reparte en las canchas.
function slotOf(L,r,k){
  const s=SCH(L),c=Math.max(1,+s.courts||1),[hh,mm]=String(s.t||'19:00').split(':').map(Number);
  const mins=hh*60+mm+Math.floor(k/c)*(+s.step||60),day=Math.floor(mins/1440),m2=((mins%1440)+1440)%1440;
  return{date:`${addDays(r.date,day)}T${p2(Math.floor(m2/60))}:${p2(m2%60)}`,venue:c>1?`Cancha ${k%c+1}`:(L.venue||'')};
}
function scheduleRound(L,r,only){
  const list=r.matches.filter(m=>!m.bye).sort((a,b)=>a.date.localeCompare(b.date));
  const todo=list.filter(m=>m.status==='programado'&&(!only||only.includes(m)));
  const fixed=list.filter(m=>!todo.includes(m));
  const max=list.length+24,taken=new Set();
  for(let k=0;k<max;k++){const s=slotOf(L,r,k);if(fixed.some(m=>m.date===s.date&&(m.venue||'')===(s.venue||'')))taken.add(k)}
  // Primero los equipos con más restricciones; cada partido toma el primer horario libre donde nadie tenga excepción.
  const nb=m=>blocksFor(L,m.h).length+blocksFor(L,m.a).length;
  todo.sort((a,b)=>nb(b)-nb(a)||a.date.localeCompare(b.date)).forEach(m=>{
    let first=-1,pick=-1;
    for(let k=0;k<max;k++){if(taken.has(k))continue;const s=slotOf(L,r,k);if(first<0)first=k;
      if(s.date.slice(0,10)!==r.date&&first>=0&&k>=list.length)break;
      if(!clashes(L,{...m,date:s.date}).length){pick=k;break}}
    const k=pick>=0?pick:first;taken.add(k);Object.assign(m,slotOf(L,r,k));
  });
  r.matches.sort((a,b)=>a.date.localeCompare(b.date));
}
const canMeet=(L,a,b)=>a!==b&&!isBlocked(L,a,b)&&meetings(L,a,b)<(+L.vueltas||1)&&(L.kind!=='grupos'||groupOf(L,a)===groupOf(L,b));
const playedCount=(L,id)=>L.rounds.reduce((s,r)=>s+r.matches.filter(m=>m.h===id||m.a===id).length,0);
// Busca la mayor cantidad de partidos posible entre equipos que todavía no se enfrentan.
function pairUp(L,ids){
  const target=Math.floor(ids.length/2);let best=[],steps=0;
  const mix=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
  (function rec(rem,acc){
    if(++steps>40000||best.length===target)return;
    if(acc.length>best.length)best=acc.slice();
    if(acc.length+Math.floor(rem.length/2)<=best.length||rem.length<2)return;
    let pick=0,opts=null;rem.forEach((x,i)=>{const o=rem.filter(y=>canMeet(L,x,y));if(!opts||o.length<opts.length){pick=i;opts=o}});
    const a=rem[pick],rest=rem.filter((_,i)=>i!==pick);
    for(const b of mix(opts)){rec(rest.filter(x=>x!==b),[...acc,[a,b]]);if(best.length===target)return}
    rec(rest,acc);
  })(mix(ids),[]);
  return best;
}
function homeAway(L,a,b){
  let prev=null;L.rounds.forEach(r=>r.matches.forEach(m=>{if(m.h===a&&m.a===b)prev='a';if(m.h===b&&m.a===a)prev='b'}));
  if(prev==='a')return[b,a];if(prev==='b')return[a,b];
  const homes=id=>L.rounds.reduce((s,r)=>s+r.matches.filter(m=>m.h===id).length,0);
  const ha=homes(a),hb=homes(b);return ha<hb||(ha===hb&&Math.random()<.5)?[a,b]:[b,a];
}
// Completa la jornada con los equipos libres. Si son impares, descansa el que más ha jugado.
function fillRound(L,r){
  const busy=new Set(r.matches.flatMap(m=>[m.h,m.a]));const added=[];
  const free=t=>!busy.has(t)&&!dayBlocked(L,t,r.date);
  const pools=L.kind==='grupos'?L.groups.map(g=>({g:g.id,ids:g.teams.filter(free)})):[{g:null,ids:L.teams.filter(free)}];
  pools.forEach(({g,ids})=>{
    // Primero intenta la siguiente jornada del rol "todos contra todos": así nunca sobra una jornada extra al final.
    const all=g?L.groups.find(x=>x.id===g).teams:L.teams;
    const circ=roundRobin(all,+L.vueltas||1).find(rr=>rr.length&&rr.every(([x,y])=>ids.includes(x)&&ids.includes(y)&&canMeet(L,x,y))&&rr.length===Math.floor(ids.length/2));
    if(circ){circ.forEach(([x,y])=>{const[h,a]=homeAway(L,x,y);
      const m={id:uid('m'),h,a,...(g?{g}:{}),date:r.date+'T23:59',venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''};r.matches.push(m);added.push(m)});return}
    let pairs=pairUp(L,ids);
    if(ids.length%2&&pairs.length<Math.floor(ids.length/2)){} // no hay cruces suficientes: se queda con los que haya
    else if(ids.length%2){ // impares: intenta que descanse quien más partidos lleva
      for(const rest of [...ids].sort((x,y)=>playedCount(L,y)-playedCount(L,x))){const p=pairUp(L,ids.filter(x=>x!==rest));if(p.length===Math.floor(ids.length/2)){pairs=p;break}}
    }
    pairs.forEach(([x,y])=>{const[h,a]=homeAway(L,x,y);const m={id:uid('m'),h,a,...(g?{g}:{}),date:r.date+'T23:59',venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''};r.matches.push(m);added.push(m)});
  });
  scheduleRound(L,r,added);return added.length;
}
function restingIn(L,r){const busy=new Set(r.matches.flatMap(m=>[m.h,m.a]));return(L.kind==='grupos'?L.groups.flatMap(g=>g.teams):L.teams).filter(t=>!busy.has(t))}
function canFill(L,r){const free=restingIn(L,r).filter(t=>!dayBlocked(L,t,r.date));return free.some((a,i)=>free.slice(i+1).some(b=>canMeet(L,a,b)))}
function pendingPairs(L){const ids=L.kind==='grupos'?L.groups.flatMap(g=>g.teams):L.teams;let n=0;ids.forEach((a,i)=>ids.slice(i+1).forEach(b=>{if(!isBlocked(L,a,b)&&(L.kind!=='grupos'||groupOf(L,a)===groupOf(L,b)))n+=Math.max(0,(+L.vueltas||1)-meetings(L,a,b))}));return n}
// Fecha (día de la semana) y hora editables en cada partido.
function whenCell(L,r,m){
  if(m.bye)return'<span class="tm">Pase</span>';
  const day=m.date.slice(0,10),base=r.date;const days=[...new Set([...Array.from({length:7},(_,i)=>addDays(base,i)),day])].sort();
  const lbl=d=>{const s=new Date(d+'T12:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric'}).replace('.','');return s.charAt(0).toUpperCase()+s.slice(1)};
  return`<span class="tm when"><select class="inp" data-chg="m-day" data-m="${m.id}" aria-label="Día del partido">${days.map(d=>`<option value="${d}" ${d===day?'selected':''}>${lbl(d)}</option>`).join('')}</select><input class="inp num" type="time" step="300" value="${m.date.slice(11,16)}" data-chg="m-time" data-m="${m.id}" aria-label="Hora del partido"></span>`;
}
function schedBar(L){
  const s=SCH(L);
  return`<div class="schedbar"><span class="eyebrow">Horarios</span>
    <label class="fld" for="s-t">Primer partido<input id="s-t" class="inp num" type="time" step="300" value="${esc(s.t)}" data-chg="sched" data-k="t"></label>
    <label class="fld" for="s-step">Cada<select id="s-step" class="inp" data-chg="sched" data-k="step">${[30,45,50,60,70,75,90,100,120].map(n=>`<option value="${n}" ${n==s.step?'selected':''}>${n} min</option>`).join('')}</select></label>
    <label class="fld" for="s-c">Canchas a la vez<select id="s-c" class="inp" data-chg="sched" data-k="courts">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n==s.courts?'selected':''}>${n}</option>`).join('')}</select></label>
    <span class="note">Se usan al generar jornadas y con “Ordenar horarios”. Cada partido se puede cambiar a mano.</span></div>`;
}


/* --- Avisos por WhatsApp de la competencia --- */
let NLOG={};
const KINDS={nuevo:'Programado',cambio:'Cambio',cancelado:'Cancelado',recordatorio:'Recordatorio'};
async function loadAvisos(lid){try{NLOG[lid]=await api('/avisos?liga='+encodeURIComponent(lid))}catch(e){NLOG[lid]={error:e.message}}if(curL()?.id===lid)render()}
function waText(e){const p=e.params||[];if(!p.length)return'';const head={nuevo:'Tienes partido',cambio:'Cambió tu partido',cancelado:'Se canceló tu partido',recordatorio:'Recordatorio de tu partido'}[e.kind];
  return`${head}: ${p[1]} vs ${p[2]}, ${p[3]} a las ${p[4]} · ${p[5]} (${p[6]})`}
function admAvisos(L){
  if(MODE!=='server')return'';
  const mode=L.notify||'all';const d=NLOG[L.id];if(d===undefined){NLOG[L.id]=null;loadAvisos(L.id)}
  const matchLbl=s=>s?`${esc(shortN(s.h))} vs ${esc(shortN(s.a))} · ${fmtD(s.date)} ${fmtT(s.date)}`:'';
  return`<div class="box"><div class="box-h"><div><h3>Avisos por WhatsApp</h3><p>Se mandan solos a los jugadores con cuenta que pusieron su celular: cuando se programa un partido, si cambia el día, la hora, la cancha o el rival, si se cancela, y un día antes. Si haces varios cambios seguidos, se espera ${d&&d.wait?d.wait:5} minutos y se manda un solo aviso con lo último.${L.draft?' <b>En borrador no se avisa nada</b>; los avisos empiezan al publicar.':''}</p></div>
    <label class="fld" for="l-notify">Avisar a<select id="l-notify" class="inp" data-chg="l-notify"><option value="all" ${mode==='all'?'selected':''}>Todos los jugadores con WhatsApp</option><option value="captains" ${mode==='captains'?'selected':''}>Solo capitanes</option><option value="off" ${mode==='off'?'selected':''}>Nadie (apagado)</option></select></label></div>
    ${!d?'<div class="empty">Cargando avisos…</div>':d.error?`<div class="empty">${esc(d.error)}</div>`:`
    ${d.live?'':'<div class="draftbar"><b>Modo prueba:</b> los avisos se registran aquí pero todavía no se envían. Se activan cuando PÍCALE conecte su número oficial de WhatsApp.</div>'}
    <div class="kpis" style="margin-top:12px"><div class="kpi"><span class="eyebrow">Jugadores con cuenta</span><b class="num">${d.accounts}</b></div><div class="kpi"><span class="eyebrow">Con WhatsApp activo</span><b class="num">${d.withWa}</b></div><div class="kpi"><span class="eyebrow">Capitanes con WhatsApp</span><b class="num">${d.captainsWa}/${d.captains}</b></div><div class="kpi"><span class="eyebrow">En espera</span><b class="num">${d.pending.length}</b></div></div>
    ${d.pending.length?`<div class="sec-h" style="margin-top:14px"><h3>Por enviar</h3></div><div class="wlog">${d.pending.map(p=>`<div class="wl"><span class="pill acc">${KINDS[p.kind]}</span><span>${matchLbl(p.snap)}</span><span class="note">sale ${fmtT(p.due)}</span></div>`).join('')}</div>`:''}
    <div class="sec-h" style="margin-top:14px"><h3>Últimos avisos</h3><button class="btn sm" data-act="avisos-reload">Actualizar</button></div>
    ${d.log.length?`<div class="wlog">${d.log.slice(0,40).map(e=>`<div class="wl"><span class="pill ${e.status==='enviado'?'fin':e.status==='error'?'live':''}">${esc(e.status)}</span><span><b>${esc(e.to||'—')}</b> <span class="note">${esc(e.phone||'')}</span><br><small>${esc(KINDS[e.kind]||e.kind)}${e.params&&e.params.length?' · '+esc(waText(e)):''}</small></span><span class="note">${fmtD(e.at)} ${fmtT(e.at)}</span></div>`).join('')}</div>`:'<div class="empty">Aún no se ha mandado ningún aviso.</div>'}`}
  </div>`;
}

/* --- Grupos y fase final --- */
function setGroup(tid,gid){
  const L=curL();if(!L.teams.includes(tid))return;
  L.groups.forEach(g=>g.teams=g.teams.filter(x=>x!==tid));
  if(gid){const g=L.groups.find(x=>x.id===gid);g.teams.push(tid);toast(`${shortN(tid)} → ${g.name}`)}
  save();render();
}
function admGroups(L){
  const assigned=new Set(L.groups.flatMap(g=>g.teams));const pool=L.teams.filter(id=>!assigned.has(id));
  const hasCal=L.rounds.some(r=>!r.ko&&r.matches.length);
  return`<div class="box"><div class="box-h"><div><h3>Grupos</h3><p>Arrastra los equipos a cada grupo (en celular, toca un equipo sin grupo y se va al grupo con menos equipos). Clasifican los mejores de cada grupo a la fase final.${hasCal?' <b>Si cambias los grupos, vuelve a generar la fase de grupos.</b>':''}</p></div>
    <button class="btn" data-act="g-shuffle" ${hasCal?'data-confirm="1"':''} ${L.teams.length<2?'disabled':''}>Sortear grupos</button></div>
    <div class="toolbar" style="margin-bottom:12px"><label class="fld" for="g-count">Grupos<select id="g-count" data-chg="g-count">${[2,3,4,6,8].map(n=>`<option value="${n}" ${n===L.groups.length?'selected':''}>${n} grupos</option>`).join('')}</select></label>
      <label class="fld" for="g-qual">Clasifican por grupo<select id="g-qual" data-chg="g-qual">${[1,2,3,4].map(n=>`<option value="${n}" ${n===(+L.qual||2)?'selected':''}>${n} equipo${n>1?'s':''}</option>`).join('')}</select></label>
      <span class="note" style="align-self:center">${L.groups.length*(+L.qual||2)} equipos pasan a la fase final</span></div>
    ${pool.length?`<div class="zone" data-drop="gpool" style="min-height:0;margin-bottom:12px"><div class="zone-h"><span>Sin grupo</span><span>${pool.length}</span></div><div class="chips">${pool.map(id=>tchip(id,{act:'g-auto'})).join('')}</div></div>`:''}
    <div class="ggrid">${L.groups.map(g=>`<div class="zone" data-drop="group" data-g="${g.id}"><div class="zone-h"><span>${esc(g.name)}</span><span>${g.teams.length}</span></div><div class="chips">${g.teams.map(id=>tchip(id,{act:'g-out'})).join('')||'<span class="note">Suelta equipos aquí</span>'}</div></div>`).join('')}</div></div>`;
}
function koRow(L,m){
  const[h,a]=sc(m);const lbl=s=>m[s]?esc(tname(m[s])):`<span class="note">${esc(m.src?srcLabel(L,m.src[s]):'Ganador anterior')}</span>`;
  if(m.bye)return`<div class="mrow"><span class="grip"></span><span class="tm">Pase</span><div class="t h"><span>${lbl(m.src?.h?'h':'a')}</span>${crest(m.h||m.a,'xs')}</div><span class="s">→</span><div class="t"><span class="note">Avanza directo</span></div><div class="ac"></div></div>`;
  return`<div class="mrow"><span class="grip"></span>${whenCell(L,koRounds(L).find(r=>r.matches.includes(m))||{date:m.date.slice(0,10)},m)}<div class="t h"><span>${lbl('h')}</span>${crest(m.h,'xs')}</div><span class="s">${m.status==='programado'?'vs':h+'–'+a}</span><div class="t">${crest(m.a,'xs')}<span>${lbl('a')}</span></div><div class="ac">${statusPill(m)}<button class="btn sm" data-act="edit-m" data-m="${m.id}" ${!m.h||!m.a?'disabled':''}>Capturar</button></div></div>`;
}
function admLiguilla(L){
  const on=+L.lig>1;
  const cfg=`<div class="toolbar"><label class="fld" for="lg-n">Pasan a la liguilla<select id="lg-n" data-chg="lg-n"><option value="0" ${on?'':'selected'}>Sin liguilla</option>${[[2,'2 · final directa'],[4,'4 · semifinales'],[6,'6 · 1° y 2° pasan directo a semis'],[8,'8 · cuartos de final'],[12,'12 · los 4 primeros directo a cuartos'],[16,'16 · octavos de final']].map(([n,t])=>`<option value="${n}" ${+L.lig===n?'selected':''} ${n>L.teams.length?'disabled':''}>${t}</option>`).join('')}</select></label>
    ${on?`<label class="fld" for="lg-tie">Si empatan<select id="lg-tie" data-chg="lg-tie"><option value="pos" ${L.ligTie!=='pen'?'selected':''}>Pasa el mejor ubicado</option><option value="pen" ${L.ligTie==='pen'?'selected':''}>Penales</option></select></label>`:''}</div>`;
  if(!on)return`<div class="box"><div class="box-h"><div><h3>Liguilla</h3><p>Al terminar la fase regular, los mejores de la tabla general juegan eliminación directa hasta la final. Actívala eligiendo cuántos pasan.</p></div></div>${cfg}</div>`;
  return admKO(L,cfg);
}
function admKO(L,cfg=''){
  const lig=L.kind==='liga';
  const KO=koRounds(L);const last=groupRoundsOf(L).at(-1);
  const start=KO[0]?.date||(last?isoD(new Date(new Date(last.date+'T12:00').getTime()+7*864e5)):isoD(new Date()));
  const done=groupsDone(L);
  const rounds=KO.map(r=>`<details class="rnd" open><summary><h3>${esc(r.name)}</h3><span class="pill">${r.matches.filter(m=>!m.bye).length} partidos</span>
    <span class="sp"><button class="btn sm" data-act="img" data-r="${r.id}" ${r.matches.some(m=>m.h&&m.a)?'':'disabled'}>Imagen del rol</button><input type="date" class="inp" style="width:auto;padding:5px 8px" value="${r.date}" data-chg="r-date" data-r="${r.id}" aria-label="Fecha de ${esc(r.name)}"></span></summary>
    <div class="rnd-b">${r.matches.map(m=>koRow(L,m)).join('')}</div></details>`).join('');
  const ph=lig?'liguilla':'fase final';
  return`<div class="box"><div class="box-h"><div><h3>${lig?'Liguilla':'Fase final · eliminación directa'}</h3><p>${lig?`Los cruces se llenan solos con la tabla general cuando se juegan todos los partidos de la fase regular: el 1° contra el último que clasifica, el 2° contra el penúltimo, y así. El 1° y el 2° solo se pueden ver en la final. ${L.ligTie==='pen'?'En empate eliges quién pasa por penales.':'En empate pasa el mejor ubicado en la tabla (o elige penales al capturar).'}`:'Los cruces se llenan solos cuando terminan todos los partidos de grupos: 1° de un grupo contra 2° de otro, y los del mismo grupo no se cruzan hasta la final. Los ganadores avanzan solos; en empate eliges quién pasa por penales.'}</p></div>
    ${KO.length?`<span class="pill ${done?'fin':''}">${done?(lig?'Fase regular terminada':'Grupos terminados'):(lig?'Fase regular en juego':'Grupos en juego')}</span>`:''}</div>
    ${cfg}
    <div class="toolbar"><label class="fld" for="ko-start">Inicio de la ${ph}<input type="date" id="ko-start" value="${start}"></label>
      <button class="btn pri" data-act="gen-ko" ${KO.some(r=>r.matches.some(m=>m.status!=='programado'))?'disabled':KO.length?'data-confirm="1"':''} ${(lig?L.teams.length>=2:L.groups.some(g=>g.teams.length))?'':'disabled'}>${KO.length?`Rehacer ${ph}`:`Generar ${ph}`}</button>
      ${KO.length?'<button class="btn" data-act="ko-fill">Llenar con la tabla actual</button>':''}</div></div>
    <div>${rounds||`<div class="empty">${lig?'Genera la liguilla para ver los cruces. Se llenan con la tabla al terminar la fase regular.':'Arma los grupos y genera la fase final para ver los cruces.'}</div>`}</div>`;
}

/* --- modal de partido --- */
function openMatch(lid,mid){MM={lid,mid};
  // Si hay una cámara asignada a la cancha del partido, se liga sola.
  const m=findM(LG(lid),mid).m;if(m&&!m.cam){const c=myCams().find(c=>c.cancha&&c.cancha.trim().toLowerCase()===(m.venue||'').trim().toLowerCase());if(c){m.cam=c.code;camAuto(m);save()}}
  drawMatch();const d=$('#dlg');if(!d.open)d.showModal()}
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
      ${L.kind==='torneo'||L.rounds.find(r=>r.matches.includes(m))?.ko?`<label class="fld" for="mf-pen">Si empatan, avanza (penales)<select id="mf-pen" data-chg="m-f" data-k="pen"><option value="">${L.kind==='liga'&&L.ligTie!=='pen'?'Mejor ubicado en la tabla':'—'}</option><option value="h" ${m.pen==='h'?'selected':''}>${esc(tname(m.h))}</option><option value="a" ${m.pen==='a'?'selected':''}>${esc(tname(m.a))}</option></select></label>`:'<span></span>'}
      <label class="fld full" for="mf-cam">Cámara All-in-One<select id="mf-cam" data-chg="m-cam"><option value="">Sin cámara</option>${myCams().map(c=>`<option value="${esc(c.code)}" ${m.cam===c.code?'selected':''}>${esc(c.name)}${c.cancha?' · '+esc(c.cancha):''}</option>`).join('')}</select></label>
    </div>
    ${m.cam?`<div class="camline ${m.status}"><span class="cam-ic"></span><div><span>${m.status==='vivo'?'<b>Transmitiendo en vivo</b> en la página pública':m.status==='final'?'<b>Grabación guardada:</b> el partido completo está en la página pública':'<b>Listo para transmitir.</b> Al ponerlo En vivo, la transmisión arranca sola'}</span><small>${esc(myCams().find(c=>c.code===m.cam)?.name||m.cam)}</small></div></div>`:(myCams().length?'':`<p class="note" style="margin:0">Con una cámara All-in-One, este partido se transmite y se graba solo. ${isOwner()?'Actívala en “Cámaras All-in-One”.':''}</p>`)}
    <details class="paste"><summary>Ligas manuales de transmisión y grabación (opcional)</summary><div class="formg" style="margin-top:10px">
      <label class="fld" for="mf-stream">Transmisión en vivo (.m3u8)<input id="mf-stream" type="url" placeholder="https://…" value="${esc(m.stream)}" data-chg="m-f" data-k="stream"></label>
      <label class="fld" for="mf-vod">Grabación (.mp4 o .m3u8)<input id="mf-vod" type="url" placeholder="https://…" value="${esc(m.vod)}" data-chg="m-f" data-k="vod"></label></div></details>
    <div><div class="box-h" style="margin-bottom:8px"><h3>Incidencias</h3><button class="btn sm" data-act="ev-add">+ Tarjeta u otro evento</button></div>
    <div style="display:flex;flex-direction:column;gap:8px">${evRows||'<span class="note">Usa “+ Gol” para sumar al marcador; luego elige al anotador y el minuto.</span>'}</div></div>
    <p class="note" style="margin:0">El marcador se calcula con los goles capturados. Los cambios se guardan al instante.</p></div>`;
}
function touchMatch(){const L=LG(MM.lid);camAuto(findM(L,MM.mid).m);propagate(L);save();drawMatch()}

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
/* Mover un partido a otra jornada. Si sus equipos ya juegan allá, los partidos que chocan
   se pasan a la jornada de origen (y en cadena, los que choquen con esos), así ambas jornadas
   quedan sin equipos repetidos. Solo se bloquea si alguno de esos partidos ya se jugó. */
function movePlan(L,mid,rid){
  const{m,r}=findM(L,mid);const R=L.rounds.find(x=>x.id===rid);if(!m||!R)return{why:'No disponible'};
  if(r===R)return{why:'Ya está en esta jornada'};if(m.status!=='programado')return{why:'Este partido ya se jugó'};
  const go=new Set([m]),back=new Set(),tm=new Set([m.h,m.a]);let ch=true;
  while(ch){ch=false;
    R.matches.forEach(x=>{if(!back.has(x)&&(tm.has(x.h)||tm.has(x.a))){back.add(x);tm.add(x.h);tm.add(x.a);ch=true}});
    r.matches.forEach(x=>{if(!go.has(x)&&(tm.has(x.h)||tm.has(x.a))){go.add(x);tm.add(x.h);tm.add(x.a);ch=true}});
  }
  const played=[...go,...back].find(x=>x.status!=='programado');
  if(played)return{why:`Choca con ${shortN(played.h)} vs ${shortN(played.a)}, que ya se jugó`};
  return{why:null,go:[...go],back:[...back],r,R};
}
function moveWhy(L,mid,rid){return movePlan(L,mid,rid).why}
function moveNote(L,mid,rid){const p=movePlan(L,mid,rid);if(p.why)return p.why;const n=p.back.length,e=p.go.length-1;
  return n?`También ${n===1?'pasa':'pasan'} ${n} partido${n>1?'s':''} de ${rname(L,rIdx(L,p.R))} a ${rname(L,rIdx(L,p.r))}${e?` y ${e} más se ${e>1?'mueven':'mueve'} contigo`:''}`:'Se mueve sin cambiar otros partidos'}
function swapWhy(L,m1,s1,m2,s2){
  const A=findM(L,m1),Z=findM(L,m2);if(!A.m||!Z.m)return'No disponible';
  if(A.m.status!=='programado'||Z.m.status!=='programado')return'Ese partido ya se jugó';
  if(m1===m2)return s1===s2?'Es el mismo equipo':null;
  const t1=A.m[s1],t2=Z.m[s2],o1=A.m[opp(s1)],o2=Z.m[opp(s2)];if(t1===t2)return'Es el mismo equipo';
  const ex=[m1,m2];
  if(L.kind==='grupos'&&(A.m.g!==Z.m.g))return'Son de grupos distintos';
  if(A.r!==Z.r){if(inRound(A.r,t2,ex))return`${shortN(t2)} ya juega en ${rname(L,rIdx(L,A.r))}`;if(inRound(Z.r,t1,ex))return`${shortN(t1)} ya juega en ${rname(L,rIdx(L,Z.r))}`}
  return pairWhy(L,t2,o1,ex)||pairWhy(L,t1,o2,ex);
}
function replaceWhy(L,mid,side,tid){
  const{m,r}=findM(L,mid);if(!m)return'No disponible';if(m.status!=='programado')return'Ese partido ya se jugó';
  if(m[side]===tid)return'Ya está en este partido';if(L.kind==='grupos'&&m.g&&groupOf(L,tid)?.id!==m.g)return`${shortN(tid)} es de otro grupo`;if(inRound(r,tid,[mid]))return`${shortN(tid)} ya juega en ${rname(L,rIdx(L,r))}`;
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
  const L=curL();const p=movePlan(L,mid,rid);if(p.why){toast(p.why,'warn');render();return}
  const{r,R,go,back}=p;
  r.matches=r.matches.filter(x=>!go.includes(x));R.matches=R.matches.filter(x=>!back.includes(x));
  go.forEach(x=>{x.date=R.date+x.date.slice(10);R.matches.push(x)});back.forEach(x=>{x.date=r.date+x.date.slice(10);r.matches.push(x)});
  [r,R].forEach(z=>z.matches.sort((a,b)=>a.date.localeCompare(b.date)));
  OPEN.add(r.id);OPEN.add(R.id);SW=null;save();
  toast(back.length?`Movido a ${rname(L,rIdx(L,R))}; ${back.length} partido${back.length>1?'s':''} pasa${back.length>1?'n':''} a ${rname(L,rIdx(L,r))}`:`Partido movido a ${rname(L,rIdx(L,R))}`);render();
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
  const mv=prog&&L.rounds.length>1?`<select class="inp mv" data-chg="mv" data-m="${m.id}" aria-label="Mover a otra jornada">${L.rounds.map((R,i)=>{if(R.ko)return'';if(R===r)return`<option value="" selected>Mover a…</option>`;const pl=movePlan(L,m.id,R.id);const k=pl.back?pl.back.length:0;return`<option value="${R.id}" ${pl.why?'disabled':''}>${rname(L,i)}${pl.why?' · ya jugado':k?` · cambia ${k} partido${k>1?'s':''}`:''}</option>`}).join('')}</select>`:'';
  return`<div class="mrow ${prog?'':'locked'}" ${prog?`draggable="true" data-drag="m:${m.id}" title="Arrastra el partido a otra jornada"`:'title="Partido jugado: ya no se puede mover"'}>
    <span class="grip">${prog?'⠿':LOCK}</span>${whenCell(L,r,m)}${teamCell(L,m,'h')}<span class="s">${prog?'vs':h+'–'+a}</span>${teamCell(L,m,'a')}
    <div class="ac">${prog&&clashes(L,m).length?'<span class="pill warnp">⚠ Choque</span>':''}${prog?'':statusPill(m)}${mv}<button class="btn sm" data-act="edit-m" data-m="${m.id}">Capturar</button><button class="btn sm ghost danger" data-act="del-m" data-m="${m.id}" data-confirm="1" aria-label="Eliminar partido">✕</button></div>${prog&&clashes(L,m).length?`<div class="mwarn">⚠ ${esc(clashes(L,m).map(clashText).join(' · '))}</div>`:''}</div>`;
}
let DRAG=null;
function markTargets(pl){
  const L=curL();if(!L)return;
  if(pl.startsWith('m:')){const mid=pl.slice(2);const own=findM(L,mid).r;document.querySelectorAll('details.rnd[data-rid]').forEach(d=>{if(own&&d.dataset.rid===own.id)return;const w=moveWhy(L,mid,d.dataset.rid);d.classList.add(w?'cant':'can');d.title=moveNote(L,mid,d.dataset.rid)})}
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
  if(d==='group'){setGroup(pl,z.dataset.g);return}if(d==='gpool'){setGroup(pl,null);return}
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
function newCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(6));r.forEach(x=>s+=a[x%a.length]);return s}
const inviteURL=(tid,code)=>`${location.origin}/futbol?unirse=${encodeURIComponent(tid)}.${code}`;
const captainURL=(tid,code)=>`${location.origin}/futbol?capitan=${encodeURIComponent(tid)}.${code}`;
function openTeam(id){
  TE=id;const t=id?T(id):null;
  if(t&&(!t.code||!t.capCode)){t.code=t.code||newCode();t.capCode=t.capCode||newCode();save()}
  TW=t?{name:t.name,short:t.short,color:t.color,logoV:t.logoV||0,logoImg:t.logoImg||null,code:t.code,capCode:t.capCode,captains:[...(t.captains||[])],removedUids:[...(t.removedUids||[])],
        players:(t.players||[]).map(p=>({n:p.n,name:p.name,pos:posOf(p),photo:p.photo||null,photoAt:p.photoAt||0,uid:p.uid||null,email:p.email||'',_old:p.name}))}
      :{name:'',short:'',color:'#2F6FB0',logoV:0,logoImg:null,code:newCode(),capCode:newCode(),captains:[],removedUids:[],players:[]};
  LOGOB=Math.floor((TW.logoV||0)/6)*6;drawTeam();const d=$('#dlg');if(!d.open)d.showModal();
}
const twPrev=()=>({...TW,short:(TW.short||autoShort(TW.name)).toUpperCase(),name:TW.name||'Equipo'});
function logoOpts(){const p={...twPrev(),logoImg:null};return[0,1,2,3,4,5].map(k=>LOGOB+k).map(v=>`<button type="button" class="lo ${!TW.logoImg&&v===(TW.logoV||0)?'on':''}" data-act="logo-pick" data-v="${v}" aria-label="Logo opción ${v+1}">${logoSVG({...p,logoV:v})}</button>`).join('')}
function refreshLogos(){const a=$('#dlg .te-logo'),b=$('#dlg .logo-opts');if(a)a.innerHTML=logoHTML(twPrev());if(b)b.innerHTML=logoOpts();const s=$('#tf-short');if(s)s.placeholder=autoShort(TW.name)}
function drawTeam(){
  const url=TE?inviteURL(TE,TW.code):'';
  $('#dlg').innerHTML=`<form class="dlg" id="teamF"><div class="dlg-h"><h3>${TE?'Editar equipo':'Nuevo equipo'}</h3><button type="button" class="btn sm ghost" data-act="dlg-close">Cerrar</button></div>
    <div class="te-top"><div class="te-logo">${logoHTML(twPrev())}</div><div class="formg">
      <label class="fld full" for="tf-name">Nombre<input id="tf-name" required value="${esc(TW.name)}" data-tw="name" placeholder="Ej. Halcones de Cumbres" autocomplete="off"></label>
      <label class="fld" for="tf-short">Abreviatura<input id="tf-short" maxlength="4" value="${esc(TW.short)}" data-tw="short" placeholder="${esc(autoShort(TW.name))}" style="text-transform:uppercase" autocomplete="off"></label>
      <label class="fld" for="tf-color">Color principal<input id="tf-color" type="color" value="${TW.color}" data-tw="color" style="height:42px;padding:4px"></label></div></div>
    <div><div class="box-h" style="margin-bottom:8px"><div><h3>Logo</h3><p>${TW.logoImg?'Estás usando el logo que subiste.':'Sube el logo del equipo o elige uno generado con su nombre y color.'}</p></div>
      <div class="toolbar"><button type="button" class="btn sm pri" data-act="logo-up">${TW.logoImg?'Cambiar logo':'Subir logo'}</button>${TW.logoImg?'<button type="button" class="btn sm" data-act="logo-clear">Usar uno generado</button>':'<button type="button" class="btn sm" data-act="logo-more">Más opciones</button>'}</div></div>
      <div class="logo-opts ${TW.logoImg?'dim':''}">${logoOpts()}</div></div>
    <div class="invite cap"><div><h3>Capitán del equipo</h3><p class="note" style="margin:4px 0 0">${TE?'Mándale este link al capitán. Crea su cuenta de PÍCALE y desde “Mi cuenta” registra y edita a sus jugadores (nombre, número, posición, foto y correo). Puede haber hasta 3 capitanes.':'Guarda el equipo para obtener el link de capitán.'}</p>
      ${TW.captains.length?`<div class="chips" style="margin-top:8px">${TW.captains.map(u=>{const p=TW.players.find(x=>x.uid===u);return`<span class="tchip mini">★ ${esc(p?.name||'Capitán')}<button type="button" class="xbtn" data-act="cap-del" data-u="${esc(u)}" aria-label="Quitar capitán">✕</button></span>`}).join('')}</div>`:''}</div>
      ${TE?`<div class="inv-link"><input class="inp num" readonly value="${esc(captainURL(TE,TW.capCode))}" aria-label="Link de capitán" id="cap-url"><button type="button" class="btn sm pri" data-act="cap-copy">Copiar link de capitán</button><button type="button" class="btn sm ghost" data-act="cap-new" data-confirm="1">Cambiar link</button></div>`:''}</div>
    <div class="invite"><div><h3>Invitar jugadores</h3><p class="note" style="margin:4px 0 0">${TE?'Comparte este link en el grupo del equipo. Cada jugador crea su cuenta de PÍCALE, pone su número y su foto, y queda en la plantilla. Al entrar ve sus torneos en “Mi cuenta”.':'Guarda el equipo para obtener su link de invitación.'}</p></div>
      ${TE?`<div class="inv-link"><input class="inp num" readonly value="${esc(url)}" aria-label="Link de invitación" id="inv-url"><button type="button" class="btn sm" data-act="inv-copy">Copiar link</button><button type="button" class="btn sm" data-act="inv-wa">Copiar mensaje</button><button type="button" class="btn sm ghost" data-act="inv-new" data-confirm="1">Cambiar link</button></div>`:''}</div>
    <div><div class="box-h" style="margin-bottom:8px"><div><h3>Jugadores <span class="note">${TW.players.length} registrados · ${TW.players.filter(p=>p.uid).length} con cuenta</span></h3><p>Toca la foto de cada jugador para subirla. Si escribes su correo, al registrarse su cuenta queda ligada sola.</p></div><button type="button" class="btn sm" data-act="pl-add">+ Agregar jugador</button></div>
      <div class="pl-list">${TW.players.map((p,i)=>`<div class="plr2">
        <button type="button" class="ava-btn" data-act="pl-photo" data-i="${i}" aria-label="Subir foto de ${esc(p.name||'jugador '+(i+1))}" title="Subir foto">${avatar(p)}<span class="cam-mini"></span></button>
        <input class="inp num" type="number" min="0" max="99" value="${esc(p.n)}" placeholder="#" data-pl="${i}" data-k="n" aria-label="Número del jugador ${i+1}">
        <input class="inp" value="${esc(p.name)}" placeholder="Nombre y apellido" data-pl="${i}" data-k="name" aria-label="Nombre del jugador ${i+1}" autocomplete="off">
        <select class="inp" data-pl="${i}" data-k="pos" aria-label="Posición del jugador ${i+1}">${POS.map(x=>`<option value="${x}" ${p.pos===x?'selected':''}>${POSN[x]}</option>`).join('')}</select>
        <button type="button" class="btn sm ghost danger" data-act="pl-del" data-i="${i}" aria-label="Quitar jugador ${i+1}">✕</button>
        <div class="plr-sub">${p.uid?`<span class="pill fin">Cuenta PÍCALE ligada</span> <button type="button" class="btn sm ${TW.captains.includes(p.uid)?'pri':'ghost'}" data-act="pl-cap" data-u="${esc(p.uid)}">${TW.captains.includes(p.uid)?'★ Capitán':'Hacer capitán'}</button>`:`<input class="inp" type="email" value="${esc(p.email||'')}" placeholder="Correo del jugador (opcional)" data-pl="${i}" data-k="email" aria-label="Correo del jugador ${i+1}" autocomplete="off">`}</div></div>`).join('')||'<span class="note">Sin jugadores. Agrégalos uno por uno, pega una lista o comparte el link de invitación.</span>'}</div>
      <details class="paste"><summary>Pegar una lista de jugadores</summary><textarea id="tf-paste" class="inp" placeholder="10 Juan Pérez&#10;1 Luis Garza POR&#10;9 Mario Leal DEL"></textarea><button type="button" class="btn sm" data-act="pl-import">Agregar a la plantilla</button></details></div>
    <div style="display:flex;gap:8px;justify-content:space-between">${TE?'<button type="button" class="btn danger" data-act="team-del" data-confirm="1">Eliminar equipo</button>':'<span></span>'}<button class="btn pri" type="submit">Guardar equipo</button></div></form>`;
}
function saveTeam(){
  const name=TW.name.trim();if(!name){toast('Escribe el nombre del equipo','warn');$('#tf-name')?.focus();return}
  const short=(TW.short||autoShort(name)).trim().toUpperCase().slice(0,4);
  const players=TW.players.filter(p=>p.name.trim()).map(p=>{const o={n:p.n===''?'':+p.n,name:p.name.trim(),pos:p.pos};
    if(p.photo){o.photo=p.photo;o.photoAt=p.photoAt||0}if(p.uid)o.uid=p.uid;else if((p.email||'').trim())o.email=p.email.trim().toLowerCase();return o});
  const base={name,short,color:TW.color,logoV:TW.logoV||0,logoImg:TW.logoImg||null,code:TW.code,capCode:TW.capCode,captains:TW.captains.filter(u=>players.some(p=>p.uid===u)),removedUids:TW.removedUids,players};
  if(TE){
    // Si renombraste a un jugador, sus goles y tarjetas lo siguen.
    TW.players.forEach(p=>{const nn=p.name.trim();if(p._old&&nn&&p._old!==nn)S.leagues.forEach(L=>L.rounds.forEach(r=>r.matches.forEach(m=>{const side=m.h===TE?'h':m.a===TE?'a':null;if(side)m.ev.forEach(e=>{if(e.side===side&&e.p===p._old)e.p=nn})})))});
    Object.assign(T(TE),base);
  }else{const id=uid('t');S.teams.push({id,lid:AV.id,...base});curL().teams.push(id)}
  save();$('#dlg').close();toast('Equipo guardado');
}

/* ===================== Arranque (administración) ===================== */
const pubURL=id=>location.origin+'/futbol?liga='+encodeURIComponent(id);
function render(){
  $('#mode').innerHTML=MODE==='server'?`${ME?`<span id="savest" class="mode ${SAVEST[1]}">${SAVEST[0]}</span> <span class="mode">${esc(ME.name)}</span>`:''}`:'<span class="mode">Modo demo · solo este navegador</span>';
  $('#app').innerHTML=viewAdmin();
  if($('#newL'))nlFields();
}
function place(rid,side,tid){
  const L=curL();if(B.round!==rid)B={round:rid,h:null,a:null};
  const other=side==='h'?B.a:B.h;const why=lockReason(L,rid,tid,other);
  if(why){toast(`${tname(tid)}: ${why.toLowerCase()}`,'warn');return}
  B[side]=tid;
  if(B.h&&B.a){const r=L.rounds.find(x=>x.id===rid);const k=r.matches.length;
    r.matches.push({id:uid('m'),h:B.h,a:B.a,...(L.kind==='grupos'?{g:groupOf(L,B.h)?.id}:{}),...slotOf(L,r,k),status:'programado',ev:[],stream:'',vod:''});
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
  reset(){S=seed();REPLACE=true;save();AV={view:'league',id:null};B={round:null,h:null,a:null};toast('Datos de ejemplo restaurados');render()},
  logout(){setTok('');ME=null;OWN=null;AV={view:'league',id:null};render()},
  'gate-tab'(el){GATE=el.dataset.k;render();setTimeout(()=>document.querySelector('#gate input')?.focus(),0)},
  'go-plans'(){AV={view:'plans'};render()},
  'go-sub'(){AV={view:subActive()?'sub':'plans'};render()},
  'go-cams'(){AV={view:'cams'};render()},
  'go-owners'(){AV={view:'owners'};OWN=null;render()},
  'owners-reload'(){OWN=null;render()},
  'own-new'(){NEWOWN=!NEWOWN;render();if(NEWOWN)setTimeout(()=>$('#o-name')?.focus(),0)},
  async 'own-access'(el){const v=el.dataset.v;try{await api('/owners/'+el.dataset.o,{method:'POST',body:JSON.stringify({access:v})});
    toast({activo:'Cuenta activada: ya puede crear torneos',suspendido:'Cuenta suspendida',eliminar:'Solicitud rechazada'}[v]);OWN=null;render()}catch(e){toast(e.message,'warn')}},
  async 'pend-check'(){try{const me=await api('/me');ME=me;if(me.role==='owner'){toast('¡Listo! Tu cuenta ya está activa');S=await loadData();AV={view:'league',id:null}}else toast('Todavía está pendiente. Comunícate con PÍCALE.','warn');render()}catch(e){toast(e.message,'warn')}},
  'choose-plan'(el){openCheckout(el.dataset.plan)},
  async pay(el){el.disabled=true;el.textContent='Activando…';
    try{ME={...await api('/subscribe',{method:'POST',body:JSON.stringify({plan:el.dataset.plan})}),role:'owner'};$('#dlg').close();
      const p=planOf(ME.plan);toast(`Suscripción ${p.name} activa`);AV={view:p.cams?'cams':(myLeagues().length?'league':'new'),id:myLeagues()[0]?.id};render()}
    catch(e){toast(e.message,'warn');el.disabled=false;el.textContent='Activar suscripción'}},
  async 'cancel-sub'(){try{ME={...await api('/cancel',{method:'POST'}),role:'owner'};toast('Suscripción cancelada');render()}catch(e){toast(e.message,'warn')}},
  async 'cam-del'(el){try{ME={...await api('/cams/'+el.dataset.c,{method:'POST',body:JSON.stringify({remove:true})}),role:'owner'};toast('Cámara quitada');render()}catch(e){toast(e.message,'warn')}},
  'copy-link'(el){const u=pubURL(el.dataset.id);navigator.clipboard?.writeText(u).then(()=>toast('Liga copiada')).catch(()=>toast(u))},
  enroll(el){enroll(el.dataset.team,true)},
  unenroll(el){enroll(el.dataset.team,false)},
  pick(el){const L=curL();if(!B.round)B.round=L.rounds[curRound(L)]?.id;if(!B.round){toast('Agrega una jornada primero','warn');return}
    const id=el.dataset.team;if(B.h===id){B.h=null;render();return}if(B.a===id){B.a=null;render();return}place(B.round,B.h?'a':'h',id)},
  slot(el){const rid=el.dataset.r,side=el.dataset.side;if(B.round!==rid)B={round:rid,h:null,a:null};else if(B[side])B[side]=null;render()},
  'gen-cal'(){const L=curL();const vu=+$('#g-vu').value;const st=$('#g-start').value||isoD(new Date());L.vueltas=vu;
    const base=new Date(st+'T12:00');
    L.rounds=roundRobin(L.teams,vu).map((pairs,i)=>{const d=isoD(new Date(base.getTime()+i*7*864e5));let k=0;
      const r={id:uid('r'),date:d,matches:[]};r.matches=pairs.filter(([h,a])=>!isBlocked(L,h,a)).map(([h,a])=>({id:uid('m'),h,a,...slotOf(L,r,k++),status:'programado',ev:[],stream:'',vod:''}));scheduleRound(L,r);return r}).concat(koRounds(L));
    B={round:null,h:null,a:null};OPEN.clear();save();toast(`${L.rounds.length} jornadas generadas`);render()},
  'next-round'(){const L=curL();if(L.kind!=='torneo')L.vueltas=+($('#g-vu')?.value||L.vueltas||1);const RS=L.rounds.filter(x=>!x.ko);const last=RS.at(-1);
    const r={id:uid('r'),date:last?addDays(last.date,7):($('#g-start')?.value||isoD(new Date())),matches:[]};
    if(!fillRound(L,r)){toast(pendingPairs(L)?'No se pudo armar otra jornada: los equipos libres ya se enfrentaron':'Ya se programaron todos los cruces','warn');return}
    L.rounds.splice(RS.length,0,r);OPEN.add(r.id);B={round:r.id,h:null,a:null};save();toast(`${rname(L,RS.length)} lista: ${r.matches.length} partido${r.matches.length>1?'s':''}${restingIn(L,r).length?` · descansa${restingIn(L,r).length>1?'n':''} ${restingIn(L,r).map(shortN).join(', ')}`:''}`);render()},
  'fill-round'(el){const L=curL();const r=L.rounds.find(x=>x.id===el.dataset.r);const n=fillRound(L,r);save();toast(n?`Se agregaron ${n} partido${n>1?'s':''}`:'No hay más cruces posibles en esta jornada',n?'':'warn');render()},
  'sched-round'(el){const L=curL();const r=L.rounds.find(x=>x.id===el.dataset.r);scheduleRound(L,r);save();toast('Horarios ordenados');render()},
  'add-round'(){const L=curL();const RS=L.rounds.filter(x=>!x.ko);const last=RS.at(-1);const d=last?isoD(new Date(new Date(last.date+'T12:00').getTime()+7*864e5)):isoD(new Date());
    const r={id:uid('r'),date:d,matches:[]};L.rounds.splice(RS.length,0,r);B={round:r.id,h:null,a:null};save();render()},
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
  'ex-add'(){const L=curL();const kind=$('#ex-kind').value,mode=$('#ex-mode').value,t1=$('#ex-t1').value,t2=$('#ex-t2').value;
    const u={id:uid('x'),team:$('#ex-team').value,kind,note:$('#ex-note').value.trim().slice(0,60),from:'',to:''};
    if(kind==='date'){if(!$('#ex-date').value){toast('Elige la fecha','warn');return}u.date=$('#ex-date').value}else u.dow=+$('#ex-dow').value;
    if(mode==='before')u.to=t1;else if(mode==='after')u.from=t1;else if(mode==='between'){if(!(t1<t2)){toast('La primera hora debe ser antes que la segunda','warn');return}u.from=t1;u.to=t2}
    (L.unavail=L.unavail||[]).push(u);save();
    const n=L.rounds.flatMap(r=>r.matches).filter(m=>m.status==='programado'&&clashes(L,m).some(c=>c.u===u)).length;
    toast(`${shortN(u.team)}: ${blockText(u)}${n?` · ${n} partido${n>1?'s':''} ya programado${n>1?'s':''} choca${n>1?'n':''}: usa “Ordenar horarios” o muévelo`:''}`,n?'warn':'');render()},
  'ex-del'(el){const L=curL();L.unavail=(L.unavail||[]).filter(u=>u.id!==el.dataset.id);save();render()},
  'avisos-reload'(){const id=curL().id;delete NLOG[id];render()},
  publish(){const L=curL();delete L.draft;save();toast(`${L.name} ya está publicada`);render()},
  unpublish(){const L=curL();L.draft=true;save();toast('Regresó a borrador: ya no aparece en la página pública');render()},
  'del-league'(){DELETED.add(AV.id);S.teams=S.teams.filter(t=>t.lid!==AV.id);S.leagues=S.leagues.filter(l=>l.id!==AV.id);AV={view:'league',id:null};save();render()},
  'gen-gcal'(){const L=curL();const vu=+$('#g-vu').value;L.vueltas=vu;genGroupCal(L,$('#g-start').value||isoD(new Date()),vu);groupRoundsOf(L).forEach(r=>scheduleRound(L,r));propagate(L);B={round:null,h:null,a:null};OPEN.clear();save();toast(`${groupRoundsOf(L).length} jornadas de grupos generadas`);render()},
  'g-shuffle'(){const L=curL();const ids=[...L.teams].sort(()=>Math.random()-.5);L.groups.forEach(g=>g.teams=[]);ids.forEach((id,i)=>L.groups[i%L.groups.length].teams.push(id));save();toast('Grupos sorteados');render()},
  'g-auto'(el){const L=curL();const g=[...L.groups].sort((a,b)=>a.teams.length-b.teams.length)[0];setGroup(el.dataset.team,g.id)},
  'g-out'(el){setGroup(el.dataset.team,null)},
  'gen-ko'(){const L=curL();buildKO(L,$('#ko-start').value||isoD(new Date()));koRounds(L).forEach(r=>scheduleRound(L,r));propagate(L);save();toast(L.kind==='liga'?'Liguilla generada':'Fase final generada');render()},
  'ko-fill'(){const L=curL();fillKO(L,true);propagate(L);save();toast(L.kind==='liga'?'Cruces llenados con la tabla general actual':'Cruces llenados con la tabla actual de cada grupo');render()},
  'team-copy-all'(){const L=curL();const src=LG($('#imp-l').value);if(!src)return;src.teams.forEach(tid=>{const t=T(tid);if(!t)return;const id=uid('t');S.teams.push({...JSON.parse(JSON.stringify(t)),id,lid:L.id});L.teams.push(id)});save();toast(`${src.teams.length} equipos copiados de ${src.name}`);render()},
  'team-new'(){openTeam(null)},
  tsel(el){const m=el.dataset.m,side=el.dataset.side;if(!SW){SW={m,side};render();toast('Ahora toca el equipo con el que lo quieres intercambiar');return}if(SW.m===m&&SW.side===side){SW=null;render();return}doSwap(SW.m,SW.side,m,side)},
  img(el){openImage(el.dataset.r)},
  'img-mode'(el){openImage(el.dataset.r,el.dataset.mode)},
  async 'img-share'(){try{await navigator.share({files:[new File([IMG.blob],IMG.fname,{type:'image/png'})],title:IMG.title,text:IMG.title})}catch(e){}},
  'img-text'(){navigator.clipboard?.writeText(IMG.txt).then(()=>toast('Texto copiado: pégalo en el grupo')).catch(()=>toast('No se pudo copiar','warn'))},
  'logo-more'(){LOGOB+=6;refreshLogos()},
  'logo-pick'(el){TW.logoV=+el.dataset.v;if(TW.logoImg){TW.logoImg=null;drawTeam()}else refreshLogos()},
  async 'logo-up'(){const f=await pickFile();if(!f)return;toast('Subiendo logo…');try{TW.logoImg=await uploadImage(f,'logo');drawTeam();toast('Logo listo. Guarda el equipo para aplicarlo.')}catch(e){toast(e.message,'warn')}},
  'logo-clear'(){TW.logoImg=null;drawTeam()},
  async 'pl-photo'(el){const i=+el.dataset.i;const f=await pickFile();if(!f)return;toast('Subiendo foto…');try{const u=await uploadImage(f,'photo');TW.players[i].photo=u;TW.players[i].photoAt=Date.now();drawTeam();toast('Foto lista. Guarda el equipo para aplicarla.')}catch(e){toast(e.message,'warn')}},
  'inv-copy'(){const u=$('#inv-url').value;navigator.clipboard?.writeText(u).then(()=>toast('Link copiado')).catch(()=>{$('#inv-url').select();toast('Selecciona y copia el link')})},
  'inv-wa'(){const t=`Únete a ${TW.name} en PÍCALE Fútbol: crea tu cuenta, pon tu número y tu foto, y sigue nuestros partidos en vivo.\n${$('#inv-url').value}`;navigator.clipboard?.writeText(t).then(()=>toast('Mensaje copiado: pégalo en el grupo del equipo')).catch(()=>toast('No se pudo copiar','warn'))},
  'cap-copy'(){const u=$('#cap-url').value;const t=`Eres capitán de ${TW.name} en PÍCALE Fútbol. Entra aquí, crea tu cuenta y registra a tus jugadores:\n${u}`;navigator.clipboard?.writeText(t).then(()=>toast('Mensaje para el capitán copiado')).catch(()=>{$('#cap-url').select();toast('Selecciona y copia el link')})},
  'cap-new'(){TW.capCode=newCode();if(TE){T(TE).capCode=TW.capCode;save()}drawTeam();toast('Link de capitán nuevo; el anterior ya no funciona')},
  'cap-del'(el){TW.captains=TW.captains.filter(u=>u!==el.dataset.u);drawTeam();toast('Guarda el equipo para quitarle el acceso')},
  'pl-cap'(el){const u=el.dataset.u;TW.captains=TW.captains.includes(u)?TW.captains.filter(x=>x!==u):[...TW.captains,u].slice(-3);drawTeam()},
  'inv-new'(){TW.code=newCode();if(TE){T(TE).code=TW.code;save()}drawTeam();toast('Link nuevo listo; el anterior ya no funciona')},
  'pl-add'(){TW.players.push({n:'',name:'',pos:'DEL'});drawTeam();const ins=document.querySelectorAll('#dlg [data-k="name"]');ins[ins.length-1]?.focus()},
  'pl-del'(el){const p=TW.players[+el.dataset.i];if(p?.uid)TW.removedUids.push(p.uid);TW.players.splice(+el.dataset.i,1);drawTeam()},
  'pl-import'(){const t=$('#tf-paste').value;t.split('\n').map(l=>l.trim()).filter(Boolean).forEach(l=>{const m=l.match(/^(\d+)?[\s.-]*(.+?)(?:\s+(POR|DEF|MED|DEL))?$/i);if(!m)return;TW.players.push({n:m[1]?+m[1]:'',name:m[2].trim(),pos:(m[3]||'').toUpperCase()||posOf({n:m[1]})})});drawTeam();toast('Jugadores agregados')},
  'team-edit'(el){openTeam(el.dataset.id)},
  'team-del'(){const L=curL();if(L.rounds.some(r=>r.matches.some(m=>m.h===TE||m.a===TE))){toast('Este equipo ya tiene partidos en el calendario; elimínalos antes de borrarlo','warn');return}
    S.teams=S.teams.filter(t=>t.id!==TE);L.teams=L.teams.filter(x=>x!==TE);L.blocks=(L.blocks||[]).filter(b=>!b.includes(TE));save();$('#dlg').close();toast('Equipo eliminado')},
  'team-copy'(){const L=curL();const src=T($('#imp-t').value);if(!src)return;const id=uid('t');
    S.teams.push({...JSON.parse(JSON.stringify(src)),id,lid:L.id});L.teams.push(id);save();toast(`${src.name} copiado con ${src.players.length} jugadores`);render()},
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
  if(k==='r-date'){const L=curL();const r=L.rounds.find(x=>x.id===el.dataset.r);if(!el.value)return;
    // Mueve toda la jornada conservando el día de cada partido (si uno era el domingo, sigue en domingo).
    const shift=Math.round((new Date(el.value+'T12:00')-new Date(r.date+'T12:00'))/864e5);r.date=el.value;r.matches.forEach(m=>m.date=addDays(m.date.slice(0,10),shift)+m.date.slice(10));save();render()}
  if(k==='m-time'||k==='m-day'){const L=curL();const{m,r}=findM(L,el.dataset.m);if(!m||!el.value)return;
    m.date=k==='m-time'?m.date.slice(0,11)+el.value:el.value+m.date.slice(10);r.matches.sort((a,b)=>a.date.localeCompare(b.date));save();const cl=clashes(L,m);toast(cl.length?`⚠ ${cl.map(clashText).join(' · ')}`:`${shortN(m.h)} vs ${shortN(m.a)}: ${fmtD(m.date)} ${fmtT(m.date)}`,cl.length?'warn':'');render();return}
  if(k==='ex-ui'){exUI();return}
  if(k==='l-notify'){curL().notify=el.value;save();toast(el.value==='off'?'Avisos apagados para esta competencia':el.value==='captains'?'Se avisará solo a capitanes':'Se avisará a todos los jugadores con WhatsApp');return}
  if(k==='sched'){const L=curL();L.sched={...SCH(L),[el.dataset.k]:el.dataset.k==='t'?el.value:+el.value};save();return}
  if(k==='g-count'){const L=curL();const n=+el.value;const old=L.groups;const ng=mkGroups(n);old.forEach((g,i)=>{if(ng[i])ng[i].teams=g.teams});L.groups=ng;save();render();return}
  if(k==='nl-kind'){nlFields();return}
  if(k==='lg-n'){const L=curL();const n=+el.value;if(koRounds(L).some(r=>r.matches.some(m=>m.status!=='programado'))){toast('La liguilla ya empezó: no se puede cambiar','warn');render();return}
    L.lig=n;if(n>1){L.ligTie=L.ligTie||'pos';if(koRounds(L).length){const st=koRounds(L)[0].date;buildKO(L,st);koRounds(L).forEach(r=>scheduleRound(L,r));propagate(L)}}else L.rounds=groupRoundsOf(L);
    save();toast(n>1?`Liguilla con ${n} equipos`:'Liguilla quitada');render();return}
  if(k==='lg-tie'){const L=curL();L.ligTie=el.value;propagate(L);save();render();return}
  if(k==='g-qual'){curL().qual=+el.value;save();toast('Si ya generaste la fase final, rehazla para aplicar el cambio');render();return}
  if(k==='rswap'){if(el.value)doSwapRounds(el.dataset.r,el.value);return}
  if(k==='mv'){if(el.value)doMove(el.dataset.m,el.value);return}
  if(k==='m-cam'){const L=LG(MM.lid);const{m}=findM(L,MM.mid);const old=m.cam;
    if(old){if(m.stream===CAM_URL.stream(old))m.stream='';if(m.vod===CAM_URL.vod(old,m.id))m.vod=''}
    m.cam=el.value||null;touchMatch();return}
  if(k==='cam-cancha'){api('/cams/'+el.dataset.c,{method:'POST',body:JSON.stringify({cancha:el.value})}).then(me=>{ME={...me,role:'owner'};toast('Cancha guardada')}).catch(e=>toast(e.message,'warn'));return}
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
  if(f.id==='gate'){
    const btn=f.querySelector('button[type=submit]');btn.disabled=true;
    try{
      if(MODE!=='server'){if($('#pin').value.trim()!==DEMO_PIN)throw new Error('PIN incorrecto');setTok('local');ME={id:'admin',role:'admin',name:'PÍCALE (demo local)'}}
      else{
        let res;
        if(GATE==='pin')res=await api('/login',{method:'POST',body:JSON.stringify({pin:$('#pin').value.trim()})});
        else if(GATE==='signup')res=await api('/signup',{method:'POST',body:JSON.stringify({name:$('#g-name').value,league:$('#g-league').value,phone:$('#g-phone').value,email:$('#g-email').value,password:$('#g-pass').value})});
        else res=await api('/login',{method:'POST',body:JSON.stringify({email:$('#g-email').value,password:$('#g-pass').value})});
        setTok(res.token);ME=res.me;
      }
      AV={view:'league',id:null};
      // Primera vez en servidor vacío o con datos viejos: PÍCALE publica los datos.
      if(ME.role==='admin'&&MODE==='server'){try{const j=await fetchServer();if(!j||MIGRATED)save()}catch(err){}}
      render();
    }catch(e){toast(e.message,'warn');btn.disabled=false}
  }
  if(f.id==='camF'){
    try{ME={...await api('/cams',{method:'POST',body:JSON.stringify({code:$('#cam-code').value,name:$('#cam-name').value,cancha:$('#cam-cancha').value})}),role:'owner'};toast('Cámara activada');render()}
    catch(e){toast(e.message,'warn')}
  }
  if(f.id==='ownF'){const btn=f.querySelector('button[type=submit]');btn.disabled=true;
    const pw=$('#o-pass').value,em=$('#o-email').value.trim();
    try{const o=await api('/owners',{method:'POST',body:JSON.stringify({name:$('#o-name').value,league:$('#o-league').value,phone:$('#o-phone').value,email:em,password:pw})});
      NEWOWN=false;OWN=null;render();
      const txt=`Ya tienes acceso a PÍCALE Fútbol para crear tus torneos.\nEntra en ${location.origin}/futbol/admin\nCorreo: ${em}\nContraseña: ${pw}`;
      try{await navigator.clipboard.writeText(txt);toast(`Cuenta de ${o.name} creada. Datos de acceso copiados para mandárselos.`)}catch(_){toast(`Cuenta creada. Contraseña: ${pw}`)}}
    catch(e){toast(e.message,'warn');btn.disabled=false}
  }
  if(f.id==='newL'){const name=$('#nl-name').value.trim();if(!name)return;
    let id=name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||uid('l');
    id=(id||'liga')+'-'+Math.random().toString(36).slice(2,6);while(LG(id))id+=Math.random().toString(36).slice(2,4);
    const sel=$('#nl-kind').value;const kind=sel==='liguilla'?'liga':sel;const nl={id,name,kind,...(sel==='liguilla'?{lig:+$('#nl-lig').value,ligTie:$('#nl-tie').value}:{}),draft:!!$('#nl-draft')?.checked,...(isOwner()?{owner:ME.id}:{}),vueltas:+$('#nl-vu').value,season:$('#nl-season').value.trim()||'Temporada',venue:$('#nl-venue').value.trim(),teams:[],blocks:[],rounds:[]};
    if(kind==='grupos'){nl.groups=mkGroups(+$('#nl-ng').value);nl.qual=+$('#nl-q').value}
    S.leagues.push(nl);
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
(async()=>{
  const h=location.hash.slice(1);if(h.startsWith('crear')){GATE='signup';}
  S=await loadData();
  const t=getTok();
  if(t==='local'&&MODE!=='server')ME={id:'admin',role:'admin',name:'PÍCALE (demo local)'};
  else if(t&&MODE==='server'){try{const me=await api('/me');ME=me.role?me:{...me,role:'owner'}}catch(e){setTok('')}}
  if(ME?.role==='admin'&&MIGRATED)save();
  render();
  afterRefresh=()=>render();
  const idle=()=>!document.hidden&&!$('#dlg').open&&!document.activeElement?.matches?.('input,select,textarea')&&!DRAG;
  const sync=async()=>{if(!ME||!idle())return;
    if(ME.role==='pending'){try{const me=await api('/me');if(me.role!==ME.role){ME=me;if(me.role==='owner'){S=await loadData();toast('¡Listo! Tu cuenta ya está activa')}render()}}catch(e){}return}const ch=await syncFromServer();const L=curL();if(L&&NLOG[L.id]&&AV.view==='league'){await loadAvisos(L.id);return}if(ch)render()};
  setInterval(sync,20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();
