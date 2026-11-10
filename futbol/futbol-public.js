/* ===================== Vistas públicas ===================== */
let PT={tab:'jornadas',round:null,lid:null,vid:null};
const PITCH=`<svg class="pitch" viewBox="0 0 760 500" fill="none" stroke="var(--line-2)" stroke-width="2" aria-hidden="true"><rect x="40" y="40" width="680" height="420" rx="4"/><line x1="380" y1="40" x2="380" y2="460"/><circle cx="380" cy="250" r="70"/><circle cx="380" cy="250" r="3" fill="var(--line-2)"/><rect x="40" y="140" width="110" height="220"/><rect x="40" y="200" width="40" height="100"/><rect x="610" y="140" width="110" height="220"/><rect x="680" y="200" width="40" height="100"/><path d="M150 205a60 60 0 0 1 0 90M610 205a60 60 0 0 0 0 90"/></svg>`;
const tlink=(L,id,txt)=>id&&T(id)?`<a class="tl" href="${teamURL(L.id,id)}">${esc(txt??tname(id))}</a>`:`<span>${esc(txt??tname(id))}</span>`;

function viewHome(){
  const cards=S.leagues.filter(L=>!L.draft).map(L=>{
    const f=featured(L);const live=all(L).some(m=>m.status==='vivo');
    const ci=curRound(L);
    return`<a class="comp" href="${leagueURL(L.id)}">
      <div class="row">${live?'<span class="pill live"><span class="dot"></span>En vivo</span>':''}<span class="pill acc">${kindLabel(L)}</span><span class="pill">${esc(L.season)}</span></div>
      <h3>${esc(L.name)}</h3>
      <div class="crests">${L.teams.slice(0,8).map(id=>crest(id,'sm')).join('')}</div>
      <div class="note">${L.teams.length} equipos · ${esc(rname(L,ci)||'Sin calendario')}${f?` · ${f.kind==='vivo'?'Jugando':f.kind==='prox'?'Próximo':'Último'}: ${esc(T(f.m.h)?.short||'?')} vs ${esc(T(f.m.a)?.short||'?')}`:''}</div>
    </a>`}).join('');
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr">
    <div><div class="eyebrow">Ligas y torneos amateur · Monterrey</div><h1>Cada partido, <em>en vivo</em> y grabado</h1>
    <p style="color:var(--muted);max-width:56ch;margin:0">Calendario, resultados, tabla y estadísticas de cada competencia, con la transmisión de PÍCALE desde la cancha.</p></div></div></section>
    <div class="wrap sec"><div class="sec-h"><h2>Competencias</h2></div>
    <div class="cards">${cards||'<div class="empty">Aún no hay competencias. Vuelve pronto.</div>'}</div>
    <div class="ownband"><div><div class="eyebrow">¿Juegas en una liga?</div><h3 style="margin-top:6px">Crea tu cuenta y ve tus torneos, tus partidos y tus goles</h3></div><a class="btn pri" href="/futbol?cuenta">Mi cuenta</a></div></div>`;
}

function matchCard(L,f,label){
  if(!f)return`<div class="feat"><div class="empty">Sin partidos programados.</div></div>`;
  const m=f.m;const[h,a]=sc(m);
  const lbl=f.kind==='vivo'?'<span class="pill live"><span class="dot"></span>En vivo</span>':f.kind==='prox'?`<span class="pill acc">${label||'Próximo partido'}</span>`:'<span class="pill fin">Último resultado</span>';
  const mid=f.kind==='prox'?`<div><div class="feat-cd" data-cd="${m.date}">--:--:--</div><div class="note">${fmtD(m.date)} · ${fmtT(m.date)}</div></div>`
    :`<div class="feat-sc">${h}–${a}<small>${f.kind==='vivo'?'Marcador en vivo':'Final'}</small></div>`;
  const btn=`<button class="btn ${f.kind==='vivo'?'live':f.kind==='fin'?'':'pri'}" data-act="watch" data-m="${m.id}">${f.kind==='vivo'?'Ver transmisión':f.kind==='fin'?'Ver repetición':'Sala de transmisión'}</button>`;
  return`<div class="feat"><div class="feat-h">${lbl}<span class="note">${esc(rname(L,m.ri))}${m.g?' · '+esc(groupName(L,m.g)):''}${m.venue?' · '+esc(m.venue):''}</span></div>
    <div class="feat-m"><div class="tm">${crest(m.h,'lg')}${tlink(L,m.h)}</div>${mid}<div class="tm">${crest(m.a,'lg')}${tlink(L,m.a)}</div></div>
    <div class="feat-f">${btn}<button class="btn ghost" data-act="tab" data-tab="jornadas" data-round="${m.ri}">Ver ${L.kind==='liga'?'jornada':'ronda'}</button></div></div>`;
}

function viewLeague(L){
  if(PT.lid!==L.id)PT={tab:'jornadas',round:null,lid:L.id,vid:null};
  const ci=curRound(L);if(PT.round==null)PT.round=ci;
  const doneR=L.rounds.filter(r=>r.matches.length&&r.matches.every(m=>m.status==='final'||m.bye)).length;
  const pct=L.rounds.length?Math.round(doneR/L.rounds.length*100):0;
  const live=all(L).some(m=>m.status==='vivo');
  const tabs=L.kind==='grupos'?[['jornadas','Jornadas'],['grupos','Grupos'],['cuadro','Fase final'],['equipos','Equipos'],['estadisticas','Estadísticas'],['transmision','Transmisión']]
    :[['jornadas',L.kind==='liga'?'Jornadas':'Partidos'],[L.kind==='liga'?'tabla':'cuadro',L.kind==='liga'?'Tabla':'Cuadro'],...(hasKO(L)?[['cuadro','Liguilla']]:[]),['equipos','Equipos'],['estadisticas','Estadísticas'],['transmision','Transmisión']];
  const body={jornadas:pubRounds,tabla:pubTable,grupos:pubGroups,cuadro:pubBracket,equipos:pubTeams,estadisticas:pubStats,transmision:pubWatch}[PT.tab]||pubRounds;
  return`<section class="hero">${PITCH}<div class="wrap hero-in">
    <div><div class="eyebrow">${L.kind==='liga'?(hasKO(L)?'Liga + liguilla':'Liga · todos contra todos'):kindLabel(L)} · ${esc(L.season)} · ${L.teams.length} equipos</div>
      <h1>${esc(L.name)}</h1>
      <div class="prog"><div class="lbl"><span><b>${esc(rname(L,ci)||'—')}</b> de ${L.rounds.length}</span><span>${pct}% jugado</span></div><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="note">Sede principal: ${esc(L.venue||'Por definir')}</div></div></div>
    ${matchCard(L,featured(L))}</div></section>
    <nav class="tabs" aria-label="Secciones"><div class="wrap">${tabs.map(([k,v])=>`<button data-act="tab" data-tab="${k}" class="${PT.tab===k?'on':''}">${v}${k==='transmision'&&live?' <span class="tab-live"></span>':''}</button>`).join('')}</div></nav>
    <div class="wrap sec">${body(L)}</div>`;
}

function fixture(L,m){
  const[h,a]=sc(m);const played=m.status!=='programado';
  const scoreH=played?`<div class="fx-sc"><span class="${h>=a?'w':'l'}">${h}</span><span class="l">–</span><span class="${a>=h?'w':'l'}">${a}</span></div>`:`<div class="fx-sc tm">${fmtT(m.date)}</div>`;
  const act=`<button class="btn sm ${m.status==='vivo'?'live':'ghost'}" data-act="watch" data-m="${m.id}">${m.status==='vivo'?'Ver en vivo':m.status==='final'?'Repetición':'Transmisión'}</button>`;
  const evs=side=>m.ev.filter(e=>e.side===side).map(e=>`<div class="ev">${side==='h'?`<span>${esc(e.p||'Sin asignar')}</span><span class="ic ${e.t}"></span><span class="mn">${e.m?e.m+"'":''}</span>`:`<span class="mn">${e.m?e.m+"'":''}</span><span class="ic ${e.t}"></span><span>${esc(e.p||'Sin asignar')}</span>`}</div>`).join('');
  const pen=m.pen&&h===a&&m.status==='final'?`<div class="none">Avanza ${esc(tname(m.pen==='h'?m.h:m.a))} en penales</div>`:'';
  return`<details class="fx"><summary>
    <div class="fx-meta"><b>${fmtD(m.date)}</b>${played?fmtT(m.date)+' · ':''}${m.g?`<span class="gtag">${esc(groupName(L,m.g))}</span> · `:''}${esc(m.venue)}</div>
    <div class="fx-t h">${tlink(L,m.h)}${crest(m.h)}</div>${scoreH}
    <div class="fx-t a">${crest(m.a)}${tlink(L,m.a)}</div>
    <div class="fx-a">${statusPill(m)}${act}</div></summary>
    <div class="fx-d">${m.ev.length?`<div class="evl h">${evs('h')}</div><div class="evl">${evs('a')}</div>`:`<div class="none">${played?'Sin incidencias registradas.':'Las incidencias aparecerán aquí durante el partido.'}</div>`}${pen}</div></details>`;
}
function pubRounds(L){
  if(!L.rounds.length)return'<div class="empty">El calendario aún no se ha publicado.</div>';
  const i=Math.min(PT.round,L.rounds.length-1);const r=L.rounds[i];
  const sel=L.rounds.map((x,k)=>{const done=x.matches.every(m=>m.status==='final'||m.bye);const lv=x.matches.some(m=>m.status==='vivo');
    return`<button data-act="round" data-i="${k}" class="${k===i?'on':''} ${done?'done':''} ${lv?'lv':''}" aria-label="${esc(rname(L,k))}">${L.kind!=='torneo'&&!x.ko?k+1:esc(({'Semifinales':'Semis','Cuartos de final':'Cuartos','Octavos de final':'Octavos'})[x.name]||x.name.split(' ')[0])}</button>`}).join('');
  const ms=r.matches.filter(m=>!m.bye);
  return`<div class="sec-h"><div><div class="eyebrow">${fmtD(r.date+'T12:00')}</div><h2>${esc(rname(L,i))}</h2></div></div>
    <div class="rsel">${sel}</div>
    ${ms.length?`<div class="fxl">${ms.map(m=>fixture(L,m)).join('')}</div>`:'<div class="empty">Partidos por definir.</div>'}
    <div class="note">Toca un partido para ver goles y tarjetas, o el nombre de un equipo para ver su página.</div>`;
}
function pubTable(L){
  const rows=table(L);const q=hasKO(L)?+L.lig:0;
  return`<div class="sec-h"><h2>Tabla general</h2><div class="legend">${q?`<span><i></i>Zona de liguilla (top ${q})</span>`:''}<span>3 pts victoria · 1 empate</span></div></div>
  <div class="tw"><table class="st"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th><th>Últimos 5</th></tr></thead><tbody>
  ${rows.map((r,i)=>`<tr class="${i<q?'q':''}"><td class="pos">${i+1}</td><td class="tn l"><div>${crest(r.id,'sm')}${tlink(L,r.id)}</div></td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.gf-r.gc>0?'+':''}${r.gf-r.gc}</td><td class="pts">${r.pts}</td><td><div class="form">${r.form.slice(-5).map(f=>`<i class="${f}">${f}</i>`).join('')}</div></td></tr>`).join('')}
  </tbody></table></div>`;
}
function pubGroups(L){
  const q=+L.qual||2;
  const cards=(L.groups||[]).map(g=>{const rows=groupTable(L,g);
    return`<div class="panel gpanel"><div class="sec-h" style="margin-bottom:10px"><h3>${esc(g.name)}</h3><span class="note">${g.teams.length} equipos</span></div>
    <div class="tw"><table class="st gt"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>Pts</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr class="${i<q?'q':''}"><td class="pos">${i+1}</td><td class="tn l"><div>${crest(r.id,'sm')}${tlink(L,r.id)}</div></td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.gf-r.gc>0?'+':''}${r.gf-r.gc}</td><td class="pts">${r.pts}</td></tr>`).join('')||'<tr><td colspan="8" class="note">Sin equipos</td></tr>'}
    </tbody></table></div></div>`}).join('');
  return`<div class="sec-h"><h2>Grupos</h2><div class="legend"><span><i></i>Clasifican a la fase final (top ${q})</span><span>3 pts victoria · 1 empate</span></div></div><div class="ggrid pub">${cards}</div>`;
}
function pubBracket(L){
  const lig=L.kind==='liga';const RS=hasKO(L)?koRounds(L):L.rounds;
  if(!RS.length)return`<div class="empty">${lig?`Al terminar la fase regular, los ${+L.lig} primeros de la tabla juegan la liguilla.`:L.kind==='grupos'?'La fase final se arma al terminar los grupos.':'El cuadro aún no se ha sorteado.'}</div>`;
  const cols=RS.map((r,ri)=>`<div class="bk-col"><h4>${esc(r.name)}</h4>${r.matches.map(m=>{
    const w=winner(m,L);const[h,a]=sc(m);const showS=m.status!=='programado'&&!m.bye;
    const row=(id,s,side)=>`<div class="bk-r ${w&&w!==id?'lose':''}">${crest(id,'xs')}${id?tlink(L,id):`<span class="tbd-l">${ri===0&&m.src?esc(srcLabel(L,m.src[side])):m.bye&&ri===0?'Pase directo':'Por definir'}</span>`}${showS?`<b>${s}</b>`:''}</div>`;
    return`<div class="bk-m ${ri===RS.length-1?'fin-m':''}">${row(m.h,h,'h')}${row(m.a,a,'a')}<div class="bk-f"><span>${fmtD(m.date)} · ${fmtT(m.date)}</span><span>${m.status==='vivo'?'EN VIVO':m.pen&&h===a&&m.status==='final'?'Penales':lig&&h===a&&m.status==='final'&&w?'Pasa mejor ubicado':m.status==='final'?'Final':''}</span></div></div>`}).join('')}</div>`).join('');
  const champ=winner(RS.at(-1).matches[0],L);
  return`<div class="sec-h"><h2>${lig?'Liguilla':L.kind==='grupos'?'Fase final':'Cuadro'}</h2>${hasKO(L)&&!groupsDone(L)?`<span class="note">Los cruces se llenan solos al terminar ${lig?'la fase regular':'la fase de grupos'}</span>`:''}${champ?`<span class="pill acc">Campeón: ${esc(tname(champ))}</span>`:''}</div><div class="bk"><div class="bk-in">${cols}</div></div>`;
}
function pubTeams(L){
  const rows=table(L);const pos=Object.fromEntries(rows.map((r,i)=>[r.id,{...r,i}]));
  const cards=L.teams.map(id=>{const r=pos[id];const n=(T(id)?.players||[]).length;
    return`<a class="tcard2" href="${teamURL(L.id,id)}">${crest(id,'xl')}<div><b>${esc(tname(id))}</b><small>${L.kind==='liga'&&r?`${r.i+1}° lugar · ${r.pts} pts · `:''}${L.kind==='grupos'?(()=>{const g=groupOf(L,id);if(!g)return'';const p=groupTable(L,g).findIndex(x=>x.id===id);return`${p+1}° ${esc(g.name)} · `})():''}${n} jugadores</small>${r?`<div class="form">${r.form.slice(-5).map(f=>`<i class="${f}">${f}</i>`).join('')}</div>`:''}</div></a>`}).join('');
  return`<div class="sec-h"><h2>Equipos</h2><span class="note">Toca un equipo para ver su plantilla y estadísticas</span></div><div class="tgrid">${cards||'<div class="empty">Sin equipos inscritos.</div>'}</div>`;
}
function lbRows(L,arr,valFn,subFn,max){
  return arr.length?`<div class="lb">${arr.map((x,i)=>{const tid=x.t||x.id;return`<a class="lb-r" href="${teamURL(L.id,tid)}"><span class="rk">${i+1}</span>${x.p&&findPlayer(tid,x.p)?.photo?avatar(findPlayer(tid,x.p)):crest(tid,'sm')}<div class="nm"><b>${esc(x.p||tname(tid))}</b><small>${subFn(x)}</small></div><span class="v">${valFn(x)}</span><div class="lb-bar"><i style="width:${max?Math.round(x._v/max*100):0}%"></i></div></a>`}).join('')}</div>`:'<div class="empty">Sin datos todavía.</div>';
}
function pubStats(L){
  const s=stats(L);
  const scorers=s.scorers.map(x=>({...x,_v:x.v}));
  const cards=s.cardsL.map(x=>({...x,_v:x.v}));
  const atk=s.teams.filter(t=>t.pj).map(t=>({...t,_v:t.gf})).sort((a,b)=>b.gf-a.gf).slice(0,6);
  const def=s.teams.filter(t=>t.pj).map(t=>({...t,_v:t.cs})).sort((a,b)=>a.gc/a.pj-b.gc/b.pj).slice(0,6);
  return`<div class="sec-h"><h2>Estadísticas</h2><span class="note">Solo partidos finalizados</span></div>
  <div class="kpis"><div class="kpi"><span class="eyebrow">Goles</span><b class="num">${s.goals}</b></div><div class="kpi"><span class="eyebrow">Goles por partido</span><b class="num">${s.played?(s.goals/s.played).toFixed(2):'0'}</b></div><div class="kpi"><span class="eyebrow">Partidos jugados</span><b class="num">${s.played}</b></div><div class="kpi"><span class="eyebrow">Tarjetas</span><b class="num">${s.cards}</b></div></div>
  <div class="grid2">
    <div class="panel"><h3>Tabla de goleo</h3>${lbRows(L,scorers,x=>x.v,x=>esc(T(x.t)?.name||''),scorers[0]?.v)}</div>
    <div class="panel"><h3>Mejor ataque</h3>${lbRows(L,atk,x=>x.gf,x=>`${x.pj} PJ · ${(x.gf/x.pj).toFixed(1)} por partido`,atk[0]?.gf)}</div>
    <div class="panel"><h3>Mejor defensa</h3>${lbRows(L,def,x=>x.gc,x=>`${x.cs} porterías en cero · ${(x.gc/x.pj).toFixed(1)} recibidos por partido`,Math.max(1,...def.map(d=>d.cs)))}</div>
    <div class="panel"><h3>Disciplina</h3>${lbRows(L,cards,x=>`${x.y}<span class="cy">▮</span>${x.r?` ${x.r}<span class="cr">▮</span>`:''}`,x=>esc(T(x.t)?.name||''),cards[0]?.v)}</div>
  </div>`;
}

/* ---------- Transmisión ---------- */
const playable=u=>/\.(m3u8|mp4|webm)(\?|#|$)/i.test(u||'');
function watchPick(L){
  const ms=all(L).filter(m=>!m.bye&&m.h&&m.a);
  return ms.find(m=>m.id===PT.vid)||ms.find(m=>m.status==='vivo')
    ||ms.filter(m=>m.status==='programado').sort((a,b)=>new Date(a.date)-new Date(b.date))[0]
    ||ms.filter(m=>m.status==='final').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
}
function player(L,m){
  const[h,a]=sc(m);const ht=T(m.h),at=T(m.a);
  const url=m.status==='vivo'?m.stream:m.status==='final'?m.vod:'';
  const canPlay=playable(url);
  const goals=m.ev.filter(e=>e.t==='g'&&e.m);
  const badge=m.status==='vivo'?'<span class="pill live pl-badge"><span class="dot"></span>En vivo</span>':m.status==='final'?'<span class="pill pl-badge">Grabado</span>':'<span class="pill acc pl-badge">Programado</span>';
  const bug=`<div class="pl-bug">${crest(m.h,'xs')}<b>${esc(ht?.short||'')}</b><span class="pl-sc">${m.status==='programado'?'vs':`${h}<i>-</i>${a}`}</span><b>${esc(at?.short||'')}</b>${crest(m.a,'xs')}<em>${m.status==='vivo'?'EN VIVO':m.status==='final'?'FINAL':fmtT(m.date)}</em></div>`;
  let center='';
  if(!canPlay){
    if(m.status==='vivo')center=url?`<h3>Transmisión en vivo</h3><p>Este partido se transmite en otra plataforma.</p><a class="btn live" href="${esc(url)}" target="_blank" rel="noopener">Abrir transmisión</a>`
      :`<div class="pl-spin"></div><h3>Conectando con la cámara de la cancha</h3><p>La señal aparece aquí en cuanto el club inicia la transmisión.</p>`;
    else if(m.status==='programado')center=`<span class="eyebrow">La transmisión inicia en</span><div class="pl-cd num" data-cd="${m.date}">--:--:--</div><p>${fmtD(m.date)} · ${fmtT(m.date)} · ${esc(m.venue)}</p>`;
    else center=url?`<h3>Partido completo disponible</h3><a class="btn pri" href="${esc(url)}" target="_blank" rel="noopener">Ver grabación</a>`
      :`<span class="pl-play"></span><h3>La grabación estará disponible pronto</h3><p>PÍCALE sube el partido completo al terminar.</p>`;
  }
  const marks=goals.map(e=>`<i class="pl-mk ${e.side}" style="left:${Math.min(e.m,90)/90*100}%" title="${e.m}' ${esc(e.p||'Gol')}"></i>`).join('');
  const prog=m.status==='final'?100:m.status==='vivo'?Math.min(98,Math.max(...goals.map(g=>g.m),35)/90*100):0;
  return`<div class="player" style="--c1:${ht?.color||'#333'};--c2:${at?.color||'#555'}">
    ${canPlay?`<video id="pv" controls playsinline ${m.status==='vivo'?'autoplay muted':''} data-src="${esc(url)}"></video>`:`<div class="pl-bg">${PITCH}</div><div class="pl-center">${center}</div>`}
    ${bug}${badge}<span class="pl-wm">PÍCALE</span>
    ${canPlay?'':`<div class="pl-ctl"><span class="pl-btn pp"></span><div class="pl-bar"><i style="width:${prog}%"></i>${marks}</div><span class="pl-time num">${m.status==='vivo'?'● EN VIVO':m.status==='final'?'90:00':'00:00'}</span><span class="pl-hd">HD</span><span class="pl-btn fs"></span></div>`}
  </div>`;
}
function wcard(L,m,sel){
  const[h,a]=sc(m);const ht=T(m.h),at=T(m.a);
  return`<button class="vid ${sel?'sel':''}" data-act="watch" data-m="${m.id}" data-noscroll="1">
    <div class="thumb" style="background:linear-gradient(115deg,${ht?.color||'#333'} 0 48%,${at?.color||'#555'} 52% 100%)">
      <span class="tag">${m.status==='vivo'?'<span class="pill live dark"><span class="dot"></span>En vivo</span>':m.status==='final'?'<span class="pill dark">Grabado</span>':'<span class="pill dark">'+fmtD(m.date)+' · '+fmtT(m.date)+'</span>'}</span>
      ${crest(m.h,'lg')}<span class="play"></span>${crest(m.a,'lg')}${m.status!=='programado'?`<span class="sc">${h} – ${a}</span>`:''}</div>
    <div class="vid-b"><b>${esc(tname(m.h))} vs ${esc(tname(m.a))}</b><small>${esc(rname(L,m.ri))} · ${esc(m.venue)}</small></div></button>`;
}
function pubWatch(L){
  const m=watchPick(L);if(!m)return'<div class="empty">Aún no hay partidos programados.</div>';
  PT.vid=m.id;
  const ms=all(L).filter(x=>!x.bye&&x.h&&x.a);
  const live=ms.filter(x=>x.status==='vivo');
  const next=ms.filter(x=>x.status==='programado').sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,6);
  const vods=ms.filter(x=>x.status==='final').sort((a,b)=>new Date(b.date)-new Date(a.date));
  const goals=m.ev.filter(e=>e.t==='g');
  const sect=(t,arr,empty)=>`<div class="sec-h"><h3>${t}</h3><span class="note">${arr.length}</span></div>${arr.length?`<div class="vids">${arr.map(x=>wcard(L,x,x.id===m.id)).join('')}</div>`:`<div class="empty">${empty}</div>`}`;
  return`<div class="watch" id="watch">${player(L,m)}
    <div class="w-info"><div><div class="eyebrow">${esc(rname(L,m.ri))} · ${fmtD(m.date)} · ${fmtT(m.date)} · ${esc(m.venue)}</div>
      <h2>${tlink(L,m.h)} <span class="vs">vs</span> ${tlink(L,m.a)}</h2></div>
      <div class="w-mo">${goals.length?goals.map(e=>`<span class="mo"><span class="ic g"></span>${e.m?e.m+"' ":''}${esc(e.p||'Gol')} · ${esc(T(e.side==='h'?m.h:m.a)?.short||'')}</span>`).join(''):`<span class="note">${m.status==='programado'?'Los momentos clave aparecerán aquí durante el partido.':'Sin goles registrados.'}</span>`}</div></div></div>
    ${sect('En vivo ahora',live,'No hay partidos transmitiéndose en este momento.')}
    ${sect('Próximas transmisiones',next,'No hay partidos programados.')}
    ${sect('Partidos grabados',vods,'Las grabaciones aparecerán al terminar cada partido.')}`;
}
function loadHls(){return new Promise((res,rej)=>{if(window.Hls)return res(window.Hls);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';s.onload=()=>res(window.Hls);s.onerror=rej;document.head.appendChild(s)})}
function noSignal(v){
  const box=v.closest('.player');if(!box||box.dataset.nosig)return;box.dataset.nosig='1';v.remove();
  const live=box.querySelector('.pl-badge.live');
  box.insertAdjacentHTML('afterbegin',`<div class="pl-bg">${PITCH}</div><div class="pl-center"><div class="pl-spin"></div><h3>${live?'La cámara aún no envía señal':'La grabación se está procesando'}</h3><p>${live?'En cuanto la cámara de la cancha se conecte, el partido aparece aquí.':'Vuelve en unos minutos para ver el partido completo.'}</p></div>`);
}
async function mountPlayer(){
  const v=$('#pv');if(!v||v.dataset.ready)return;v.dataset.ready='1';const u=v.dataset.src;
  v.addEventListener('error',()=>noSignal(v));
  if(/\.m3u8/i.test(u)&&!v.canPlayType('application/vnd.apple.mpegurl')){try{const H=await loadHls();if(H&&H.isSupported()){const h=new H();h.on(H.Events.ERROR,(e,d)=>{if(d.fatal){h.destroy();noSignal(v)}});h.loadSource(u);h.attachMedia(v);return}}catch(e){}}
  v.src=u;
}

/* ---------- Planes para dueños de liga ---------- */
function viewPlans(){
  const steps=[['Elige tu plan','Te das de alta en minutos y empiezas a armar tu liga, tus grupos o tu torneo.'],['Llega tu cámara All-in-One','PÍCALE la instala en tu cancha. La activas con su código desde tu panel.'],['Cada partido, en vivo y grabado','Al poner el partido En vivo se transmite solo, y al terminar queda grabado en la página de tu liga.']];
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr">
    <div><div class="eyebrow">Para dueños de liga</div><h1>Tu liga, <em>transmitida</em> como profesional</h1>
    <p style="color:var(--muted);max-width:60ch;margin:0 0 20px">Calendario, tabla, grupos, eliminatoria y estadísticas de cada jugador, con la cámara All-in-One de PÍCALE transmitiendo y grabando cada partido.</p>
    <div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn pri" href="/futbol/admin#crear-pro">Crear mi cuenta</a><a class="btn" href="/futbol">Ver ligas en vivo</a></div></div></div></section>
    <div class="wrap sec">
      <div class="sec-h"><h2>Cómo funciona</h2></div>
      <ol class="hsteps">${steps.map(([t,d])=>`<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
      <div class="sec-h"><h2>Planes</h2><span class="note">Precios mensuales en pesos mexicanos</span></div>
      <div class="plans">${PLANS.map(p=>`<div class="plan ${p.best?'best':''}"><div class="plan-h"><span class="eyebrow">${esc(p.tag)}</span><h3>${esc(p.name)}</h3>
        <div class="price"><b class="num">${money(p.price)}</b><span>al mes</span></div>
        <div class="cams-n">${p.cams?`<span class="cam-ic"></span>${p.cams} cámara${p.cams>1?'s':''} All-in-One incluida${p.cams>1?'s':''}`:'Sin cámara · solo software'}</div></div>
        <ul>${p.feats.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><a class="btn ${p.best?'pri':''}" href="/futbol/admin#crear-${p.id}">Empezar con ${esc(p.name)}</a></div>`).join('')}</div>
      <div class="ownband"><div><h3>¿Ya tienes cuenta?</h3><p class="note" style="margin:4px 0 0">Entra a tu panel para capturar partidos y manejar tus cámaras.</p></div><a class="btn" href="/futbol/admin">Entrar a mi panel</a></div>
    </div>`;
}

/* ---------- Mi cuenta (jugadores) ---------- */
let ACC='signup',JOIN=null; // JOIN: {tid,code}
function myTeams(){return ME?S.teams.filter(t=>(t.players||[]).some(p=>p.uid===ME.id)):[]}
function accForm(ctx){
  const tab=(k,t)=>`<button type="button" class="${ACC===k?'on':''}" data-act="acc-tab" data-k="${k}">${t}</button>`;
  return`<form class="gate box" id="accF" style="margin:0">${ctx||''}<div class="seg">${tab('signup','Crear cuenta')}${tab('login','Ya tengo cuenta')}</div>
    ${ACC==='signup'?`<label class="fld" for="a-name">Nombre y apellido<input id="a-name" class="inp" autocomplete="name" required></label>`:''}
    <label class="fld" for="a-email">Correo<input id="a-email" class="inp" type="email" autocomplete="email" required></label>
    <label class="fld" for="a-pass">Contraseña${ACC==='signup'?' (mínimo 6 caracteres)':''}<input id="a-pass" class="inp" type="password" autocomplete="${ACC==='signup'?'new-password':'current-password'}" minlength="6" required></label>
    <button class="btn pri" type="submit">${ACC==='signup'?'Crear mi cuenta':'Entrar'}</button>
    <p class="note" style="margin:0">Tu cuenta de PÍCALE sirve para todos tus equipos y torneos.</p></form>`;
}
function viewAccount(){
  if(MODE!=='server')return`<div class="wrap sec"><div class="empty">Las cuentas de jugador funcionan cuando la página está conectada al servidor.</div></div>`;
  if(!ME)return`<div class="wrap"><div class="gate2">
    <div class="gate-pitch"><div class="eyebrow">Para jugadores</div><h1>Tu equipo, tus partidos, tus goles</h1>
      <ul class="ticks"><li>Todos tus torneos en un solo lugar</li><li>Tu próximo partido y la transmisión en vivo</li><li>Tus goles y tarjetas en cada torneo</li></ul>
      <p class="note">¿Tu equipo te mandó un link de invitación? Ábrelo para unirte directo a la plantilla.</p></div>
    ${accForm()}</div></div>`;
  if(ME.role!=='player')return`<div class="wrap"><div class="gate box" style="margin:60px auto"><div class="eyebrow">${ME.role==='admin'?'PÍCALE':'Dueño de liga'}</div><h2>Hola, ${esc(ME.name.split(' ')[0])}</h2>
    <p>Tu cuenta es de organizador. Administra tus competencias desde tu panel.</p><a class="btn pri" href="/futbol/admin">Ir a mi panel</a><button class="btn ghost" data-act="acc-logout">Salir</button></div></div>`;
  const teams=myTeams().filter(t=>!LG(t.lid)?.draft);
  const cards=teams.map(t=>{const L=LG(t.lid);if(!L)return'';const me=t.players.find(p=>p.uid===ME.id);
    const ps=playerStats(L,t.id).find(x=>x.uid===ME.id||x.name===me.name)||{g:0,mg:0,y:0,r:0};
    const ms=teamMatches(L,t.id);const nx=ms.find(m=>m.status==='vivo')||ms.find(m=>m.status==='programado');
    let pos='';if(L.kind==='liga'){const rows=table(L);const i=rows.findIndex(r=>r.id===t.id);if(i>=0)pos=`${i+1}° de ${rows.length} · ${rows[i].pts} pts`}
    else if(L.kind==='grupos'){const g=groupOf(L,t.id);if(g){const gr=groupTable(L,g);const i=gr.findIndex(r=>r.id===t.id);pos=`${i+1}° del ${g.name} · ${gr[i]?.pts||0} pts`}}
    else pos='Torneo eliminatorio';
    const rival=nx?(nx.h===t.id?nx.a:nx.h):null;
    return`<div class="myt"><div class="myt-h">${crest(t.id,'lg')}<div><small>${esc(L.name)}${isCaptain(t)?' · <span class="pill acc">★ Capitán</span>':''}</small><b>${esc(t.name)}</b><small>${me.n!==''&&me.n!=null?'#'+esc(me.n)+' · ':''}${POSN[posOf(me)]||'Jugador'}${pos?' · '+esc(pos):''}</small></div></div>
      <div class="mystats"><div><b class="num">${ps.g}</b><span>Goles</span></div><div><b class="num">${ps.mg}</b><span>Partidos con gol</span></div><div><b class="num">${ps.y}</b><span>Amarillas</span></div><div><b class="num">${ps.r}</b><span>Rojas</span></div></div>
      ${nx?`<div class="mynext"><div><div class="eyebrow">${nx.status==='vivo'?'Jugando ahora':'Próximo partido'}</div><b>vs ${esc(tname(rival))}</b> <span class="note">· ${fmtD(nx.date)} ${fmtT(nx.date)}${nx.venue?' · '+esc(nx.venue):''}</span></div>${nx.status==='vivo'?'<span class="pill live"><span class="dot"></span>En vivo</span>':`<span class="num" data-cd="${nx.date}">--:--:--</span>`}</div>`:'<div class="mynext"><span class="note">Sin partidos programados por ahora.</span></div>'}
      <div class="toolbar">${isCaptain(t)?`<a class="btn pri" href="/futbol?cuenta&plantilla=${encodeURIComponent(t.id)}">★ Registrar jugadores</a>`:''}<a class="btn ${isCaptain(t)?'':'pri'}" href="${teamURL(L.id,t.id)}">Ver mi equipo</a><a class="btn" href="${leagueURL(L.id)}">Ver ${L.kind==='liga'?'la liga':'el torneo'}</a></div></div>`}).join('');
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr"><div class="me-hero">
      <button class="me-ava" data-act="me-photo" aria-label="Cambiar mi foto" title="Cambiar mi foto">${avatar(ME,'xl')}<span class="cam-mini"></span></button>
      <div><div class="eyebrow">Mi cuenta · jugador</div><h1 style="margin:6px 0 8px;font-size:clamp(36px,6vw,64px)">${esc(ME.name)}</h1>
      <div class="note">${esc(ME.email)} · ${teams.length} equipo${teams.length===1?'':'s'} · <button class="linkb" data-act="acc-logout">Salir</button></div></div></div></div></section>
    <div class="wrap sec">${teams.length?`<div class="sec-h"><h2>Mi estadística total</h2><a class="btn sm" href="${profileURL(ME.id)}">Ver mi perfil completo</a></div>${careerTiles(careerOf(ME.id))}`:''}<div class="sec-h"><h2>Mis torneos</h2>${ME.photo?'':'<span class="note">Toca tu círculo para subir tu foto; sale en la plantilla de tu equipo.</span>'}</div>
    ${waBox(false)}
    ${cards?`<div class="mytgrid">${cards}</div>`:`<div class="empty">Aún no estás en ningún equipo.<br>Pídele al organizador de tu liga el <b>link de invitación</b> de tu equipo, o que registre tu correo (${esc(ME.email)}) en la plantilla.</div>`}</div>`;
}
function viewJoin(){
  const t=T(JOIN.tid);const L=t&&LG(t.lid);
  const head=linkHead(t,L,'Únete a','Únete a tu equipo');
  if(!ME)return`<div class="wrap"><div class="joincard">${accForm(head+'<p class="note" style="margin:0;text-align:center">Crea tu cuenta de PÍCALE o entra con la que ya tienes para unirte a la plantilla.</p>')}</div></div>`;
  if(ME.role!=='player')return`<div class="wrap"><div class="joincard box">${head}<p>Para unirte como jugador entra con una cuenta de jugador. Ahorita tienes abierta una cuenta de organizador.</p><button class="btn" data-act="acc-logout">Salir y entrar como jugador</button></div></div>`;
  if(t&&(t.players||[]).some(p=>p.uid===ME.id))return`<div class="wrap"><div class="joincard box">${head}<p style="text-align:center">Ya estás en la plantilla de ${esc(t?.name||'tu equipo')}.</p><a class="btn pri" href="/futbol?cuenta">Ver mis torneos</a></div></div>`;
  return`<div class="wrap"><form class="joincard box" id="joinF">${head}
    <p class="note" style="margin:0;text-align:center">Entras como <b>${esc(ME.name)}</b>.</p>
    <div class="formg"><label class="fld" for="j-n">Número de playera<input id="j-n" class="inp num" type="number" min="0" max="99" placeholder="10"></label>
    <label class="fld" for="j-pos">Posición<select id="j-pos" class="inp">${POS.map(x=>`<option value="${x}" ${x==='MED'?'selected':''}>${POSN[x]}</option>`).join('')}</select></label></div>
    ${waBox(true)}
    <button class="btn pri" type="submit">Unirme al equipo</button></form></div>`;
}

/* ---------- Perfil del jugador: su estadística en todas las ligas ---------- */
const profileURL=uid=>`/futbol?jugador=${encodeURIComponent(uid)}`;
function careerOf(uid){
  const rows=[];
  S.teams.forEach(t=>{const L=LG(t.lid);if(!L||L.draft)return;const me=(t.players||[]).find(p=>p.uid===uid);if(!me)return;
    const ps=playerStats(L,t.id).find(x=>x.uid===uid)||{g:0,mg:0,y:0,r:0};
    let G=0,E=0,P=0;const goals=[];
    teamMatches(L,t.id).forEach(m=>{if(m.status!=='final')return;const[h,a]=sc(m);const f=m.h===t.id?h:a,c=m.h===t.id?a:h;f>c?G++:f<c?P++:E++;
      const side=m.h===t.id?'h':'a';m.ev.forEach(e=>{if(e.t==='g'&&e.side===side&&e.p===me.name)goals.push({m,e,rival:m.h===t.id?m.a:m.h})})});
    rows.push({L,t,me,ps,G,E,P,pj:G+E+P,goals});
  });
  const tot=rows.reduce((s,r)=>({g:s.g+r.ps.g,mg:s.mg+r.ps.mg,y:s.y+r.ps.y,r:s.r+r.ps.r,pj:s.pj+r.pj,G:s.G+r.G}),{g:0,mg:0,y:0,r:0,pj:0,G:0});
  return{rows,tot};
}
function careerTiles(c){
  return`<div class="kpis k6"><div class="kpi"><span class="eyebrow">Torneos</span><b class="num">${c.rows.length}</b></div><div class="kpi"><span class="eyebrow">Goles</span><b class="num">${c.tot.g}</b></div><div class="kpi"><span class="eyebrow">Partidos con gol</span><b class="num">${c.tot.mg}</b></div><div class="kpi"><span class="eyebrow">Partidos de su equipo</span><b class="num">${c.tot.pj}</b></div><div class="kpi"><span class="eyebrow">Amarillas</span><b class="num">${c.tot.y}</b></div><div class="kpi"><span class="eyebrow">Rojas</span><b class="num">${c.tot.r}</b></div></div>`;
}
function careerTable(c){
  if(!c.rows.length)return'<div class="empty">Todavía no aparece en ninguna competencia publicada.</div>';
  return`<div class="tw"><table class="st"><thead><tr><th class="l">Competencia</th><th class="l">Equipo</th><th>#</th><th>Pos</th><th>PJ equipo</th><th>G-E-P</th><th>Goles</th><th>Prom.</th><th>TA</th><th>TR</th></tr></thead><tbody>
  ${c.rows.map(r=>`<tr><td class="l" style="font-family:var(--f-body)"><a class="tl" href="${leagueURL(r.L.id)}">${esc(r.L.name)}</a></td><td class="tn l"><div>${crest(r.t.id,'sm')}<a class="tl" href="${teamURL(r.L.id,r.t.id)}">${esc(r.t.name)}</a></div></td><td>${esc(r.me.n??'—')}</td><td><span class="pos-c ${posOf(r.me)}">${posOf(r.me)}</span></td><td>${r.pj}</td><td>${r.G}-${r.E}-${r.P}</td><td class="pts">${r.ps.g}</td><td>${r.pj?(r.ps.g/r.pj).toFixed(2):'0'}</td><td>${r.ps.y}</td><td>${r.ps.r}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function viewProfile(uid){
  const c=careerOf(uid);const first=c.rows[0]?.me;
  if(!first&&!(ME&&ME.id===uid))return`<div class="wrap sec"><div class="empty">Este perfil no existe o el jugador todavía no está en ninguna competencia publicada.</div></div>`;
  const who=first||ME;const mine=ME&&ME.id===uid;
  const goals=c.rows.flatMap(r=>r.goals.map(g=>({...g,L:r.L}))).sort((a,b)=>b.m.date.localeCompare(a.m.date)).slice(0,10);
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr"><div class="me-hero">
      ${avatar(mine?{...who,photo:ME.photo||who.photo}:who,'xl')}
      <div><div class="eyebrow">Perfil de jugador · PÍCALE Fútbol</div><h1 style="margin:6px 0 8px;font-size:clamp(36px,6vw,64px)">${esc(mine?ME.name:who.name)}</h1>
      <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${c.rows.map(r=>`<a class="pill" href="${teamURL(r.L.id,r.t.id)}" style="text-decoration:none">${esc(r.t.short)} · ${esc(r.L.name)}</a>`).join('')}</div></div></div></div></section>
    <div class="wrap sec">${careerTiles(c)}
      <div class="sec-h"><h2>Por competencia</h2><span class="note">Solo partidos finalizados</span></div>${careerTable(c)}
      <div class="sec-h"><h2>Últimos goles</h2></div>
      ${goals.length?`<div class="fxl">${goals.map(g=>`<a class="goalrow" href="${leagueURL(g.L.id)}"><span class="ic g"></span><b class="num">${g.e.m?g.e.m+"'":'—'}</b><span>vs ${esc(tname(g.rival))}</span><span class="note">${esc(g.L.name)} · ${esc(rname(g.L,g.m.ri))} · ${fmtD(g.m.date)}</span></a>`).join('')}</div>`:'<div class="empty">Sin goles registrados todavía.</div>'}
      ${mine?`<div class="ownband"><div><h3>Este es tu perfil público</h3><p class="note" style="margin:4px 0 0">Compártelo: cualquiera puede ver tus números en todas tus ligas.</p></div><button class="btn" data-act="copy-profile">Copiar mi link</button></div>`:''}
    </div>`;
}

function waBox(compact){
  const ph=(ME?.phone||'').replace(/^52(?=\d{10}$)/,'');
  return`<div class="${compact?'wa-mini':'box wa-box'}">${compact?'':`<div class="box-h" style="margin-bottom:6px"><div><h3>Avisos por WhatsApp</h3><p>Te avisamos cuando se programe un partido de tu equipo, si cambia el día, la hora o la cancha, si se cancela, y un día antes.</p></div>${ME?.wa&&ME?.phone?'<span class="pill fin">Activos</span>':'<span class="pill">Apagados</span>'}</div>`}
    <label class="fld" for="${compact?'x':'w'}-phone">Celular (10 dígitos)<input id="${compact?'x':'w'}-phone" class="inp num" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="81 1234 5678" value="${esc(ph)}"></label>
    <label class="chk" for="${compact?'x':'w'}-wa"><input id="${compact?'x':'w'}-wa" type="checkbox" ${ME?.wa||!ME?.phone?'checked':''}> Quiero recibir avisos de mis partidos por WhatsApp</label>
    ${compact?'':'<div class="toolbar"><button class="btn pri" type="button" data-act="wa-save">Guardar</button></div><p class="note" style="margin:0">Puedes apagarlos cuando quieras. Tu número no se muestra en ninguna página.</p>'}</div>`;
}
const waBody=pfx=>{const el=document.getElementById(pfx+'-phone');return el?{phone:el.value,wa:document.getElementById(pfx+'-wa').checked}:{}};

/* ---------- Capitanes ---------- */
let CAPJ=null,RW=null; // CAPJ: {tid,code} del link de capitán · RW: plantilla en edición
const isCaptain=t=>!!(ME&&t&&(t.captains||[]).includes(ME.id));
function linkHead(t,L,title,fallback){
  // En un borrador el equipo no se ve hasta unirse: se muestra un encabezado general.
  if(!t||!L)return`<div style="text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center"><div class="eyebrow">PÍCALE Fútbol</div><h2>${fallback}</h2></div>`;
  return`<div style="text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center">${crest(t.id,'xl')}<div class="eyebrow">${esc(L.name)}${L.draft?' · borrador':''}</div><h2>${title} ${esc(t.name)}</h2></div>`;
}
function viewCaptainJoin(){
  const t=T(CAPJ.tid);const L=t&&LG(t.lid);
  const head=linkHead(t,L,'Capitán de','Registra a tu equipo como capitán');
  if(!ME)return`<div class="wrap"><div class="joincard">${accForm(head+'<p class="note" style="margin:0;text-align:center">Crea tu cuenta de PÍCALE (o entra con la que ya tienes) para quedar como capitán y registrar a tus jugadores.</p>')}</div></div>`;
  if(ME.role!=='player')return`<div class="wrap"><div class="joincard box">${head}<p>Para ser capitán entra con una cuenta de jugador. Ahorita tienes abierta una cuenta de organizador.</p><button class="btn" data-act="acc-logout">Salir y entrar como jugador</button></div></div>`;
  if(isCaptain(t))return`<div class="wrap"><div class="joincard box">${head}<p style="text-align:center">Ya eres capitán de ${esc(t.name)}.</p><a class="btn pri" href="/futbol?cuenta&plantilla=${encodeURIComponent(t.id)}">Registrar a mis jugadores</a></div></div>`;
  return`<div class="wrap"><form class="joincard box" id="capF">${head}
    <p class="note" style="margin:0;text-align:center">Entras como <b>${esc(ME.name)}</b>. Como capitán también juegas en el equipo: pon tu número.</p>
    <div class="formg"><label class="fld" for="c-n">Tu número de playera<input id="c-n" class="inp num" type="number" min="0" max="99" placeholder="10"></label>
    <label class="fld" for="c-pos">Tu posición<select id="c-pos" class="inp">${POS.map(x=>`<option value="${x}" ${x==='MED'?'selected':''}>${POSN[x]}</option>`).join('')}</select></label></div>
    ${waBox(true)}
    <button class="btn pri" type="submit">Ser capitán y registrar a mi equipo</button></form></div>`;
}
function openRoster(tid){
  const t=T(tid);if(!t)return;
  RW={tid,players:(t.players||[]).map(p=>({n:p.n??'',name:p.name,pos:posOf(p),photo:p.photo||null,photoAt:p.photoAt||0,uid:p.uid||null,email:p.email||'',_old:p.name}))};
}
function viewRoster(tid){
  const t=T(tid);const L=t&&LG(t.lid);
  if(!ME||ME.role!=='player')return viewAccount();
  if(!t||!L||!isCaptain(t))return`<div class="wrap sec"><div class="empty">Solo el capitán puede registrar jugadores de este equipo.</div></div>`;
  if(!RW||RW.tid!==tid)openRoster(tid);
  const inv=t.code?`${location.origin}/futbol?unirse=${encodeURIComponent(t.id)}.${t.code}`:'';
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr"><div>
      <a class="back" href="/futbol?cuenta">← Mis torneos</a>
      <div class="t-hero">${crest(t.id,'hg')}<div><div class="eyebrow">${esc(L.name)}${L.draft?' · borrador':''} · capitán</div><h1 style="margin:6px 0 8px;font-size:clamp(34px,5vw,60px)">${esc(t.name)}</h1>
      <div class="note">${RW.players.length} jugadores · ${RW.players.filter(p=>p.uid).length} con cuenta</div></div></div></div></div></section>
    <div class="wrap sec">
      <form class="box" id="rosterF"><div class="box-h"><div><h2>Mis jugadores</h2><p>Registra a tu plantilla: toca el círculo para subir la foto. Si pones el correo de un jugador, al crear su cuenta queda ligado solo.</p></div><button type="button" class="btn pri" data-act="r-add">+ Agregar jugador</button></div>
        <div class="pl-list roster" style="max-height:none">${RW.players.map((p,i)=>`<div class="plr2">
          <button type="button" class="ava-btn" data-act="r-photo" data-i="${i}" aria-label="Subir foto de ${esc(p.name||'jugador '+(i+1))}" title="Subir foto">${avatar(p)}<span class="cam-mini"></span></button>
          <input class="inp num" type="number" min="0" max="99" value="${esc(p.n)}" placeholder="#" data-rw="${i}" data-k="n" aria-label="Número del jugador ${i+1}">
          <input class="inp" value="${esc(p.name)}" placeholder="Nombre y apellido" data-rw="${i}" data-k="name" aria-label="Nombre del jugador ${i+1}" autocomplete="off">
          <select class="inp" data-rw="${i}" data-k="pos" aria-label="Posición del jugador ${i+1}">${POS.map(x=>`<option value="${x}" ${p.pos===x?'selected':''}>${POSN[x]}</option>`).join('')}</select>
          ${p.uid===ME.id?'<span class="pill acc" title="Eres capitán">★ Tú</span>':`<button type="button" class="btn sm ghost danger" data-act="r-del" data-i="${i}" aria-label="Quitar a ${esc(p.name||'jugador')}">✕</button>`}
          <div class="plr-sub">${p.uid?`<span class="pill fin">Cuenta PÍCALE ligada</span>${(t.captains||[]).includes(p.uid)&&p.uid!==ME.id?' <span class="pill acc">★ Capitán</span>':''}`:`<input class="inp" type="email" value="${esc(p.email||'')}" placeholder="Correo del jugador (opcional)" data-rw="${i}" data-k="email" aria-label="Correo del jugador ${i+1}" autocomplete="off">`}</div></div>`).join('')||'<span class="note">Aún no hay jugadores.</span>'}</div>
        <details class="paste"><summary>Pegar una lista de jugadores</summary><textarea id="r-paste" class="inp" placeholder="10 Juan Pérez&#10;1 Luis Garza POR&#10;9 Mario Leal DEL"></textarea><button type="button" class="btn sm" data-act="r-import">Agregar a la plantilla</button></details>
        <div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn pri" type="submit">Guardar plantilla</button></div></form>
      ${inv?`<div class="invite"><div><h3>Que cada jugador se registre solo</h3><p class="note" style="margin:4px 0 0">Comparte este link en el grupo del equipo: cada quien crea su cuenta, pone su número y su foto, y ve sus partidos y sus goles.</p></div>
        <div class="inv-link"><input class="inp num" readonly value="${esc(inv)}" id="r-inv" aria-label="Link de invitación"><button type="button" class="btn sm" data-act="r-inv">Copiar mensaje para el grupo</button></div></div>`:''}
    </div>`;
}

/* ---------- Página de equipo ---------- */
function viewTeam(L,tid){
  const t=T(tid);const rows=table(L);const ri=rows.findIndex(r=>r.id===tid);const r=rows[ri]||{pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0,form:[]};
  const st=stats(L).teams.find(x=>x.id===tid)||{cs:0};
  const ms=teamMatches(L,tid);
  const live=ms.find(m=>m.status==='vivo');const nx=ms.find(m=>m.status==='programado');const last=[...ms].reverse().find(m=>m.status==='final');
  const f=live?{m:live,kind:'vivo'}:nx?{m:nx,kind:'prox'}:last?{m:last,kind:'fin'}:null;
  const ps=playerStats(L,tid).sort((a,b)=>POS.indexOf(a.pos)-POS.indexOf(b.pos)||(+a.n||99)-(+b.n||99));
  const top=[...ps].sort((a,b)=>b.g-a.g)[0];
  const lg=stats(L).scorers;const leagueTop=lg[0]?.v||0;
  const res=ms.filter(m=>m.status!=='programado').reverse();const up=ms.filter(m=>m.status==='programado');
  let big=null;res.forEach(m=>{if(m.status!=='final')return;const[h,a]=sc(m);const d=(m.h===tid?h-a:a-h);if(d>0&&(!big||d>big.d))big={m,d,s:m.h===tid?`${h}-${a}`:`${a}-${h}`,rv:m.h===tid?m.a:m.h}});
  const squad=ps.length?`<div class="tw"><table class="st sq"><thead><tr><th>#</th><th class="l">Jugador</th><th>Pos</th><th>Goles</th><th>Partidos con gol</th><th>Amarillas</th><th>Rojas</th></tr></thead><tbody>
    ${ps.map(p=>`<tr class="${top&&top.g&&p.name===top.name?'q':''}"><td class="pos">${esc(p.n||'—')}</td><td class="tn l"><div>${avatar(p,'sm')}<span>${p.uid?`<a class="tl" href="${profileURL(p.uid)}" title="Ver su perfil y estadística en todas sus ligas">${esc(p.name)}</a><span class="acc-dot" title="Tiene cuenta PÍCALE"></span>`:esc(p.name)}</span>${top&&top.g&&p.name===top.name?'<span class="pill acc">Goleador</span>':''}</div></td><td><span class="pos-c ${p.pos}">${p.pos}</span></td><td class="pts">${p.g}</td><td>${p.mg}</td><td>${p.y?`${p.y}<span class="cy">▮</span>`:'0'}</td><td>${p.r?`${p.r}<span class="cr">▮</span>`:'0'}</td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty">Este equipo aún no registra jugadores.</div>';
  return`<section class="hero">${PITCH}<div class="wrap hero-in">
    <div><a class="back" href="${leagueURL(L.id)}">← ${esc(L.name)}</a>
      <div class="t-hero">${crest(tid,'hg')}<div><div class="eyebrow">${esc(L.season)} · ${(t?.players||[]).length} jugadores</div><h1 style="margin:6px 0 12px">${esc(t?.name||'Equipo')}</h1>
      <div class="row">${L.kind==='liga'&&ri>=0?`<span class="pill acc">${ri+1}° lugar</span><span class="pill fin">${r.pts} pts</span>`:''}${L.kind==='grupos'&&groupOf(L,tid)?(()=>{const g=groupOf(L,tid);const gr=groupTable(L,g);const p=gr.findIndex(x=>x.id===tid);return`<span class="pill acc">${p+1}° ${esc(g.name)}</span><span class="pill fin">${gr[p]?.pts||0} pts</span>`})():''}<div class="form">${r.form.slice(-5).map(x=>`<i class="${x}">${x}</i>`).join('')}</div></div></div></div></div>
    ${matchCard(L,f,'Próximo partido')}</div></section>
    <div class="wrap sec">
      <div class="kpis k6"><div class="kpi"><span class="eyebrow">Jugados</span><b class="num">${r.pj}</b></div><div class="kpi"><span class="eyebrow">G · E · P</span><b class="num">${r.g}-${r.e}-${r.p}</b></div><div class="kpi"><span class="eyebrow">Goles a favor</span><b class="num">${r.gf}</b></div><div class="kpi"><span class="eyebrow">Goles en contra</span><b class="num">${r.gc}</b></div><div class="kpi"><span class="eyebrow">Porterías en cero</span><b class="num">${st.cs}</b></div><div class="kpi"><span class="eyebrow">Promedio de gol</span><b class="num">${r.pj?(r.gf/r.pj).toFixed(1):'0'}</b></div></div>
      <div class="sec-h"><h2>Plantilla y estadísticas</h2><span class="note">Solo partidos finalizados</span></div>${squad}
      <div class="grid2">
        <div class="panel"><h3>Goleadores del equipo</h3>${(()=>{const g=ps.filter(p=>p.g).sort((a,b)=>b.g-a.g).slice(0,5);return g.length?`<div class="lb">${g.map((p,i)=>`<div class="lb-r"><span class="rk">${i+1}</span>${avatar(p)}<div class="nm"><b>${p.uid?`<a class="tl" href="${profileURL(p.uid)}">${esc(p.name)}</a>`:esc(p.name)}</b><small>${POSN[p.pos]||'Jugador'} · #${esc(p.n||'—')}</small></div><span class="v">${p.g}</span><div class="lb-bar"><i style="width:${Math.round(p.g/Math.max(leagueTop,1)*100)}%"></i></div></div>`).join('')}</div><p class="note" style="margin:12px 0 0">La barra compara contra el líder de goleo de la liga (${leagueTop}).</p>`:'<div class="empty">Sin goles todavía.</div>'})()}</div>
        <div class="panel"><h3>Resumen</h3><div class="facts">
          <div><span>Posición</span><b>${L.kind==='liga'&&ri>=0?`${ri+1}° de ${rows.length}`:L.kind==='grupos'&&groupOf(L,tid)?(()=>{const g=groupOf(L,tid);const gr=groupTable(L,g);return`${gr.findIndex(x=>x.id===tid)+1}° de ${gr.length} en ${esc(g.name)}`})():'—'}</b></div>
          <div><span>Diferencia de gol</span><b>${r.gf-r.gc>0?'+':''}${r.gf-r.gc}</b></div>
          <div><span>Mayor goleada</span><b>${big?`${big.s} vs ${esc(T(big.rv)?.short||'')}`:'—'}</b></div>
          <div><span>Racha actual</span><b>${r.form.length?(()=>{const lastF=r.form.at(-1);let n=0;for(let i=r.form.length-1;i>=0&&r.form[i]===lastF;i--)n++;return`${n} ${lastF==='G'?'victoria':lastF==='E'?'empate':'derrota'}${n>1?'s':''}`})():'—'}</b></div>
          <div><span>Tarjetas</span><b>${ps.reduce((s,p)=>s+p.y,0)} amarillas · ${ps.reduce((s,p)=>s+p.r,0)} rojas</b></div>
        </div></div>
      </div>
      ${up.length?`<div class="sec-h"><h2>Próximos partidos</h2></div><div class="fxl">${up.map(m=>fixture(L,m)).join('')}</div>`:''}
      ${res.length?`<div class="sec-h"><h2>Resultados</h2></div><div class="fxl">${res.map(m=>fixture(L,m)).join('')}</div>`:''}
    </div>`;
}

/* ===================== Arranque (página pública) ===================== */
function render(){
  const q=new URLSearchParams(location.search);const id=q.get('liga'),tid=q.get('equipo');
  if(!(q.has('cuenta')&&q.get('plantilla')))RW=null;
  const L=id&&LG(id);
  const nav=document.querySelector('.top nav');if(nav)nav.innerHTML=`<a href="/futbol" class="${!q.has('cuenta')&&!q.has('unirse')?'on':''}">Competencias</a><a href="/futbol?cuenta" class="${q.has('cuenta')?'on':''}">${ME?.role==='player'?esc(ME.name.split(' ')[0]):'Mi cuenta'}</a>`;
  if(q.has('unirse')){const[tid,code]=(q.get('unirse')||'').split('.');JOIN={tid,code};document.title='Unirme a mi equipo · PÍCALE Fútbol';$('#app').innerHTML=viewJoin();return}
  if(q.has('cuenta')&&!q.get('plantilla')){document.title='Mi cuenta · PÍCALE Fútbol';$('#app').innerHTML=viewAccount();tick();return}
  if(q.get('jugador')){const c=careerOf(q.get('jugador'));document.title=`${c.rows[0]?.me.name||'Jugador'} · PÍCALE Fútbol`;$('#app').innerHTML=viewProfile(q.get('jugador'));return}
  if(q.has('capitan')){const[ct,cc]=(q.get('capitan')||'').split('.');CAPJ={tid:ct,code:cc};document.title='Capitán · PÍCALE Fútbol';$('#app').innerHTML=viewCaptainJoin();return}
  if(q.has('cuenta')&&q.get('plantilla')){document.title='Mis jugadores · PÍCALE Fútbol';$('#app').innerHTML=viewRoster(q.get('plantilla'));return}
  if(L&&tid&&T(tid)){document.title=`${tname(tid)} · ${L.name}`;$('#app').innerHTML=viewTeam(L,tid)}
  else{document.title=L?`${L.name} · PÍCALE Fútbol`:'PÍCALE Fútbol';$('#app').innerHTML=L?viewLeague(L):viewHome()}
  if(L&&L.draft)$('#app').insertAdjacentHTML('afterbegin','<div class="draftban"><div class="wrap"><b>Vista previa de borrador:</b> solo tú la ves. Publícala desde tu panel cuando esté lista.</div></div>');
  tick();mountPlayer();
}
function tick(){document.querySelectorAll('[data-cd]').forEach(el=>{let s=Math.max(0,Math.floor((new Date(el.dataset.cd)-Date.now())/1000));const d=Math.floor(s/86400);s%=86400;el.textContent=(d?d+'d ':'')+p2(Math.floor(s/3600))+':'+p2(Math.floor(s%3600/60))+':'+p2(s%60)})}
const ACT={
  tab(el){
    const q=new URLSearchParams(location.search);
    if(q.get('equipo')){history.pushState(null,'',leagueURL(q.get('liga')))}
    PT.tab=el.dataset.tab;if(el.dataset.round)PT.round=+el.dataset.round;render();document.querySelector('.tabs')?.scrollIntoView({block:'start'})},
  round(el){PT.round=+el.dataset.i;render()},
  'acc-tab'(el){ACC=el.dataset.k;render()},
  async 'wa-save'(el){el.disabled=true;try{ME=await api('/profile',{method:'POST',body:JSON.stringify(waBody('w'))});toast(ME.wa&&ME.phone?'Listo: te avisaremos por WhatsApp':'Avisos por WhatsApp apagados');render()}catch(e){toast(e.message,'warn');el.disabled=false}},
  'copy-profile'(){const u=location.origin+profileURL(ME.id);navigator.clipboard?.writeText(u).then(()=>toast('Link de tu perfil copiado')).catch(()=>toast(u))},
  'r-add'(){RW.players.push({n:'',name:'',pos:'MED',email:''});render();const ins=document.querySelectorAll('[data-rw][data-k="name"]');ins[ins.length-1]?.focus()},
  'r-del'(el){RW.players.splice(+el.dataset.i,1);render()},
  async 'r-photo'(el){const i=+el.dataset.i;const f=await pickFile();if(!f)return;toast('Subiendo foto…');try{RW.players[i].photo=await uploadImage(f,'photo');RW.players[i].photoAt=Date.now();render();toast('Foto lista. Guarda la plantilla para aplicarla.')}catch(e){toast(e.message,'warn')}},
  'r-import'(){const t=$('#r-paste').value;t.split('\n').map(l=>l.trim()).filter(Boolean).forEach(l=>{const m=l.match(/^(\d+)?[\s.-]*(.+?)(?:\s+(POR|DEF|MED|DEL))?$/i);if(!m)return;RW.players.push({n:m[1]?+m[1]:'',name:m[2].trim(),pos:(m[3]||'').toUpperCase()||posOf({n:m[1]}),email:''})});render();toast('Jugadores agregados. Guarda la plantilla.')},
  'r-inv'(){const t=T(RW.tid);const txt=`Únete a ${t.name} en PÍCALE Fútbol: crea tu cuenta, pon tu número y tu foto, y sigue nuestros partidos en vivo.\n${$('#r-inv').value}`;navigator.clipboard?.writeText(txt).then(()=>toast('Mensaje copiado: pégalo en el grupo del equipo')).catch(()=>{$('#r-inv').select();toast('Selecciona y copia el link')})},
  'acc-logout'(){setTok('');ME=null;render()},
  async 'me-photo'(){const f=await pickFile();if(!f)return;toast('Subiendo foto…');
    try{const url=await uploadImage(f,'photo');ME={...ME,...await api('/profile',{method:'POST',body:JSON.stringify({photo:url})})};S=(await fetchServer())||S;render();toast('Foto actualizada en todos tus equipos')}catch(e){toast(e.message,'warn')}},
  watch(el){
    const q=new URLSearchParams(location.search);
    if(q.get('equipo')){history.pushState(null,'',leagueURL(q.get('liga')))}
    PT.tab='transmision';PT.vid=el.dataset.m;render();
    (document.getElementById('watch')||document.querySelector('.tabs'))?.scrollIntoView({block:'start',behavior:'smooth'})},
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;if(el.closest('summary'))e.preventDefault();ACT[el.dataset.act]?.(el,e)});
document.addEventListener('input',e=>{const el=e.target;if(RW&&el.dataset.rw!=null){const p=RW.players[+el.dataset.rw];if(p)p[el.dataset.k]=el.dataset.k==='n'?(el.value===''?'':+el.value):el.value}});
document.addEventListener('change',e=>{const el=e.target;if(RW&&el.dataset.rw!=null&&el.dataset.k==='pos'){RW.players[+el.dataset.rw].pos=el.value}});
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;const btn=f.querySelector('button[type=submit]');if(btn)btn.disabled=true;
  try{
    if(f.id==='accF'){
      const body={email:$('#a-email').value,password:$('#a-pass').value};
      const res=ACC==='signup'?await api('/signup',{method:'POST',body:JSON.stringify({...body,name:$('#a-name').value,role:'player'})}):await api('/login',{method:'POST',body:JSON.stringify(body)});
      setTok(res.token);ME=res.me;S=(await fetchServer())||S;
      toast(ACC==='signup'?'Cuenta creada':'Bienvenido');render();
    }
    if(f.id==='capF'){
      const r=await api('/captain/claim',{method:'POST',body:JSON.stringify({team:CAPJ.tid,code:CAPJ.code,n:$('#c-n').value,pos:$('#c-pos').value,...waBody('x')})});
      ME=await api('/me');
      S=(await fetchServer())||S;RW=null;history.replaceState(null,'',`/futbol?cuenta&plantilla=${encodeURIComponent(r.team)}`);toast('Ya eres capitán: registra a tus jugadores');render();
    }
    if(f.id==='rosterF'){
      const players=RW.players.filter(p=>p.name.trim()).map(p=>({n:p.n,name:p.name.trim(),pos:p.pos,photo:p.photo,photoAt:p.photoAt,uid:p.uid,email:p.email}));
      const renames=RW.players.filter(p=>p._old&&p.name.trim()&&p._old!==p.name.trim()).map(p=>[p._old,p.name.trim()]);
      await api('/captain/roster',{method:'POST',body:JSON.stringify({team:RW.tid,players,renames})});
      S=(await fetchServer())||S;const tid=RW.tid;RW=null;openRoster(tid);toast('Plantilla guardada');render();if(btn)btn.disabled=false;
    }
    if(f.id==='joinF'){
      await api('/join',{method:'POST',body:JSON.stringify({team:JOIN.tid,code:JOIN.code,n:$('#j-n').value,pos:$('#j-pos').value,...waBody('x')})});
      ME=await api('/me');
      S=(await fetchServer())||S;history.replaceState(null,'','/futbol?cuenta');toast(`Ya estás en ${T(JOIN.tid)?.name||'tu equipo'}`);render();
    }
  }catch(err){toast(err.message,'warn');if(btn)btn.disabled=false}
});
window.addEventListener('popstate',render);
// Actualización automática: servidor cada 15 s; en modo demo, cuando el admin guarda en este mismo navegador.
function playing(){const v=$('#pv');return v&&!v.paused}
async function refresh(){
  if(MODE!=='server'||playing()||RW||document.activeElement?.matches?.('input,select,textarea'))return;
  try{const j=await fetchServer();if(j&&JSON.stringify(j)!==JSON.stringify(S)){S=j;render()}}catch(e){}
}
window.addEventListener('storage',e=>{if(e.key===KEY&&MODE==='local'&&!playing()){const d=localData();if(d){S=d;render()}}});
(async()=>{
  S=await loadData();
  if(MODE==='server'&&getTok()&&getTok()!=='local'){try{ME=await api('/me')}catch(e){if(e.status===401)setTok('')}}
  render();setInterval(tick,1000);setInterval(refresh,15000);
})();
