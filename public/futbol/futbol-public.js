/* ===================== Vistas públicas ===================== */
let PT={tab:'jornadas',round:null,lid:null};
const PITCH=`<svg class="pitch" viewBox="0 0 760 500" fill="none" stroke="var(--line-2)" stroke-width="2" aria-hidden="true"><rect x="40" y="40" width="680" height="420" rx="4"/><line x1="380" y1="40" x2="380" y2="460"/><circle cx="380" cy="250" r="70"/><circle cx="380" cy="250" r="3" fill="var(--line-2)"/><rect x="40" y="140" width="110" height="220"/><rect x="40" y="200" width="40" height="100"/><rect x="610" y="140" width="110" height="220"/><rect x="680" y="200" width="40" height="100"/><path d="M150 205a60 60 0 0 1 0 90M610 205a60 60 0 0 0 0 90"/></svg>`;

function viewHome(){
  const cards=S.leagues.map(L=>{
    const f=featured(L);const live=all(L).some(m=>m.status==='vivo');
    const ci=curRound(L);
    return`<a class="comp" href="/futbol?liga=${L.id}">
      <div class="row">${live?'<span class="pill live"><span class="dot"></span>En vivo</span>':''}<span class="pill acc">${L.kind==='liga'?'Liga':'Torneo eliminatorio'}</span><span class="pill">${esc(L.season)}</span></div>
      <h3>${esc(L.name)}</h3>
      <div class="crests">${L.teams.slice(0,8).map(id=>crest(id,'sm')).join('')}</div>
      <div class="note">${L.teams.length} equipos · ${esc(rname(L,ci)||'Sin calendario')}${f?` · ${f.kind==='vivo'?'Jugando':f.kind==='prox'?'Próximo':'Último'}: ${esc(T(f.m.h)?.short||'?')} vs ${esc(T(f.m.a)?.short||'?')}`:''}</div>
    </a>`}).join('');
  return`<section class="hero">${PITCH}<div class="wrap hero-in" style="grid-template-columns:1fr">
    <div><div class="eyebrow">Ligas y torneos amateur · Monterrey</div><h1>Cada partido, <em>en vivo</em> y grabado</h1>
    <p style="color:var(--muted);max-width:56ch;margin:0">Calendario, resultados, tabla y estadísticas de cada competencia, con la transmisión de PÍCALE desde la cancha.</p></div></div></section>
    <div class="wrap sec"><div class="sec-h"><h2>Competencias</h2></div>
    <div class="cards">${cards||'<div class="empty">Aún no hay competencias. Vuelve pronto.</div>'}</div></div>`;
}

function featCard(L){
  const f=featured(L);if(!f)return`<div class="feat"><div class="empty">Genera el calendario para ver el próximo partido.</div></div>`;
  const m=f.m;const[h,a]=sc(m);
  const lbl=f.kind==='vivo'?'<span class="pill live"><span class="dot"></span>En vivo</span>':f.kind==='prox'?'<span class="pill acc">Próximo partido</span>':'<span class="pill fin">Último resultado</span>';
  const mid=f.kind==='prox'?`<div><div class="feat-cd" data-cd="${m.date}">--:--:--</div><div class="note">${fmtD(m.date)} · ${fmtT(m.date)}</div></div>`
    :`<div class="feat-sc">${h}–${a}<small>${f.kind==='vivo'?'Marcador en vivo':'Final'}</small></div>`;
  const btn=f.kind==='vivo'?(m.stream?`<a class="btn live" href="${esc(m.stream)}" target="_blank" rel="noopener">Ver transmisión</a>`:'')
    :f.kind==='fin'&&m.vod?`<a class="btn" href="${esc(m.vod)}" target="_blank" rel="noopener">Ver repetición</a>`:'';
  return`<div class="feat"><div class="feat-h">${lbl}<span class="note">${esc(rname(L,m.ri))} · ${esc(m.venue)}</span></div>
    <div class="feat-m"><div class="tm">${crest(m.h,'lg')}<span>${esc(tname(m.h))}</span></div>${mid}<div class="tm">${crest(m.a,'lg')}<span>${esc(tname(m.a))}</span></div></div>
    <div class="feat-f">${btn}<button class="btn ghost" data-act="tab" data-tab="jornadas" data-round="${m.ri}">Ver ${L.kind==='liga'?'jornada':'ronda'}</button></div></div>`;
}

function viewLeague(L){
  if(PT.lid!==L.id)PT={tab:'jornadas',round:null,lid:L.id};
  const ci=curRound(L);if(PT.round==null)PT.round=ci;
  const doneR=L.rounds.filter(r=>r.matches.length&&r.matches.every(m=>m.status==='final'||m.bye)).length;
  const pct=L.rounds.length?Math.round(doneR/L.rounds.length*100):0;
  const tabs=[['jornadas',L.kind==='liga'?'Jornadas':'Partidos'],[L.kind==='liga'?'tabla':'cuadro',L.kind==='liga'?'Tabla':'Cuadro'],['estadisticas','Estadísticas'],['videos','En vivo y grabados']];
  let body='';
  if(PT.tab==='jornadas')body=pubRounds(L);
  else if(PT.tab==='tabla')body=pubTable(L);
  else if(PT.tab==='cuadro')body=pubBracket(L);
  else if(PT.tab==='estadisticas')body=pubStats(L);
  else body=pubVideos(L);
  return`<section class="hero">${PITCH}<div class="wrap hero-in">
    <div><div class="eyebrow">${L.kind==='liga'?'Liga · todos contra todos':'Torneo eliminatorio'} · ${esc(L.season)} · ${L.teams.length} equipos</div>
      <h1>${esc(L.name)}</h1>
      <div class="prog"><div class="lbl"><span><b>${esc(rname(L,ci)||'—')}</b> de ${L.rounds.length}</span><span>${pct}% jugado</span></div><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="note">Sede principal: ${esc(L.venue||'Por definir')}</div></div></div>
    ${featCard(L)}</div></section>
    <nav class="tabs" aria-label="Secciones"><div class="wrap">${tabs.map(([k,v])=>`<button data-act="tab" data-tab="${k}" class="${PT.tab===k?'on':''}">${v}</button>`).join('')}</div></nav>
    <div class="wrap sec">${body}</div>`;
}

function fixture(L,m){
  const[h,a]=sc(m);const played=m.status!=='programado';
  const scoreH=played?`<div class="fx-sc"><span class="${h>=a?'w':'l'}">${h}</span><span class="l">–</span><span class="${a>=h?'w':'l'}">${a}</span></div>`:`<div class="fx-sc tm">${fmtT(m.date)}</div>`;
  const act=m.status==='vivo'&&m.stream?`<a class="btn sm live" href="${esc(m.stream)}" target="_blank" rel="noopener">Ver en vivo</a>`
    :m.status==='final'&&m.vod?`<a class="btn sm" href="${esc(m.vod)}" target="_blank" rel="noopener">Repetición</a>`:'';
  const evs=side=>m.ev.filter(e=>e.side===side).map(e=>`<div class="ev">${side==='h'?`<span>${esc(e.p||'Sin asignar')}</span><span class="ic ${e.t}"></span><span class="mn">${e.m?e.m+"'":''}</span>`:`<span class="mn">${e.m?e.m+"'":''}</span><span class="ic ${e.t}"></span><span>${esc(e.p||'Sin asignar')}</span>`}</div>`).join('');
  const pen=m.pen&&h===a&&m.status==='final'?`<div class="none">Avanza ${esc(tname(m.pen==='h'?m.h:m.a))} en penales</div>`:'';
  return`<details class="fx"><summary>
    <div class="fx-meta"><b>${fmtD(m.date)}</b>${played?fmtT(m.date)+' · ':''}${esc(m.venue)}</div>
    <div class="fx-t h"><span>${esc(tname(m.h))}</span>${crest(m.h)}</div>${scoreH}
    <div class="fx-t a">${crest(m.a)}<span>${esc(tname(m.a))}</span></div>
    <div class="fx-a">${statusPill(m)}${act}</div></summary>
    <div class="fx-d">${m.ev.length?`<div class="evl h">${evs('h')}</div><div class="evl">${evs('a')}</div>`:`<div class="none">${played?'Sin incidencias registradas.':'Las incidencias aparecerán aquí durante el partido.'}</div>`}${pen}</div></details>`;
}
function pubRounds(L){
  if(!L.rounds.length)return'<div class="empty">El calendario aún no se ha publicado.</div>';
  const i=Math.min(PT.round,L.rounds.length-1);const r=L.rounds[i];
  const sel=L.rounds.map((x,k)=>{const done=x.matches.every(m=>m.status==='final'||m.bye);const lv=x.matches.some(m=>m.status==='vivo');
    return`<button data-act="round" data-i="${k}" class="${k===i?'on':''} ${done?'done':''} ${lv?'lv':''}" aria-label="${esc(rname(L,k))}">${L.kind==='liga'?k+1:esc(x.name.split(' ')[0])}</button>`}).join('');
  const ms=r.matches.filter(m=>!m.bye);
  return`<div class="sec-h"><div><div class="eyebrow">${fmtD(r.date+'T12:00')}</div><h2>${esc(rname(L,i))}</h2></div></div>
    <div class="rsel">${sel}</div>
    ${ms.length?`<div class="fxl">${ms.map(m=>fixture(L,m)).join('')}</div>`:'<div class="empty">Partidos por definir.</div>'}
    <div class="note">Toca un partido para ver goles y tarjetas.</div>`;
}
function pubTable(L){
  const rows=table(L);
  return`<div class="sec-h"><h2>Tabla general</h2><div class="legend"><span><i></i>Zona de liguilla (top 4)</span><span>3 pts victoria · 1 empate</span></div></div>
  <div class="tw"><table class="st"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th><th>Últimos 5</th></tr></thead><tbody>
  ${rows.map((r,i)=>`<tr class="${i<4?'q':''}"><td class="pos">${i+1}</td><td class="tn l"><div>${crest(r.id,'sm')}${esc(tname(r.id))}</div></td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.gf-r.gc>0?'+':''}${r.gf-r.gc}</td><td class="pts">${r.pts}</td><td><div class="form">${r.form.slice(-5).map(f=>`<i class="${f}">${f}</i>`).join('')}</div></td></tr>`).join('')}
  </tbody></table></div>`;
}
function pubBracket(L){
  if(!L.rounds.length)return'<div class="empty">El cuadro aún no se ha sorteado.</div>';
  const cols=L.rounds.map((r,ri)=>`<div class="bk-col"><h4>${esc(r.name)}</h4>${r.matches.map(m=>{
    const w=winner(m);const[h,a]=sc(m);const showS=m.status!=='programado'&&!m.bye;
    const row=(id,s)=>`<div class="bk-r ${w&&w!==id?'lo':''}">${crest(id,'xs')}<span>${id?esc(tname(id)):m.bye&&ri===0?'Pase directo':'Por definir'}</span>${showS?`<b>${s}</b>`:''}</div>`;
    return`<div class="bk-m ${ri===L.rounds.length-1?'fin-m':''}">${row(m.h,h)}${row(m.a,a)}<div class="bk-f"><span>${fmtD(m.date)} · ${fmtT(m.date)}</span><span>${m.status==='vivo'?'EN VIVO':m.pen&&h===a&&m.status==='final'?'Penales':m.status==='final'?'Final':''}</span></div></div>`}).join('')}</div>`).join('');
  const champ=winner(L.rounds.at(-1).matches[0]);
  return`<div class="sec-h"><h2>Cuadro</h2>${champ?`<span class="pill acc">Campeón: ${esc(tname(champ))}</span>`:''}</div><div class="bk"><div class="bk-in">${cols}</div></div>`;
}
function pubStats(L){
  const s=stats(L);
  const lb=(arr,valFn,subFn,max)=>arr.length?`<div class="lb">${arr.map((x,i)=>`<div class="lb-r"><span class="rk">${i+1}</span>${crest(x.t||x.id,'sm')}<div class="nm"><b>${esc(x.p||tname(x.id))}</b><small>${subFn(x)}</small></div><span class="v">${valFn(x)}</span><div class="lb-bar"><i style="width:${max?Math.round(x._v/max*100):0}%"></i></div></div>`).join('')}</div>`:'<div class="empty">Sin datos todavía.</div>';
  const scorers=s.scorers.map(x=>({...x,_v:x.v}));
  const cards=s.cardsL.map(x=>({...x,_v:x.v}));
  const atk=s.teams.filter(t=>t.pj).map(t=>({...t,_v:t.gf})).sort((a,b)=>b.gf-a.gf).slice(0,6);
  const def=s.teams.filter(t=>t.pj).map(t=>({...t,_v:t.cs})).sort((a,b)=>a.gc/a.pj-b.gc/b.pj).slice(0,6);
  return`<div class="sec-h"><h2>Estadísticas</h2><span class="note">Solo partidos finalizados</span></div>
  <div class="kpis"><div class="kpi"><span class="eyebrow">Goles</span><b class="num">${s.goals}</b></div><div class="kpi"><span class="eyebrow">Goles por partido</span><b class="num">${s.played?(s.goals/s.played).toFixed(2):'0'}</b></div><div class="kpi"><span class="eyebrow">Partidos jugados</span><b class="num">${s.played}</b></div><div class="kpi"><span class="eyebrow">Tarjetas</span><b class="num">${s.cards}</b></div></div>
  <div class="grid2">
    <div class="panel"><h3>Tabla de goleo</h3>${lb(scorers,x=>x.v,x=>esc(T(x.t)?.name||''),scorers[0]?.v)}</div>
    <div class="panel"><h3>Mejor ataque</h3>${lb(atk,x=>x.gf,x=>`${x.pj} PJ · ${(x.gf/x.pj).toFixed(1)} por partido`,atk[0]?.gf)}</div>
    <div class="panel"><h3>Mejor defensa</h3>${lb(def,x=>x.gc,x=>`${x.cs} porterías en cero · ${(x.gc/x.pj).toFixed(1)} recibidos por partido`,Math.max(1,...def.map(d=>d.cs)))}</div>
    <div class="panel"><h3>Disciplina</h3>${lb(cards,x=>`${x.y}<span style="color:#E0B020">▮</span>${x.r?` ${x.r}<span style="color:#D7343A">▮</span>`:''}`,x=>esc(T(x.t)?.name||''),cards[0]?.v)}</div>
  </div>`;
}
function vidCard(L,m){
  const[h,a]=sc(m);const ht=T(m.h),at=T(m.a);const url=m.status==='vivo'?m.stream:m.vod;
  return`<a class="vid ${url?'':'off'}" ${url?`href="${esc(url)}" target="_blank" rel="noopener"`:''}>
    <div class="thumb" style="background:linear-gradient(115deg,${ht?.color||'#333'} 0 48%,${at?.color||'#555'} 52% 100%)">
      <span class="tag">${m.status==='vivo'?'<span class="pill live" style="background:rgba(0,0,0,.6)"><span class="dot"></span>En vivo</span>':'<span class="pill" style="background:rgba(0,0,0,.55);color:#fff">Grabado</span>'}</span>
      ${crest(m.h,'lg')}<span class="play"></span>${crest(m.a,'lg')}<span class="sc">${h} – ${a}</span></div>
    <div class="vid-b"><b>${esc(tname(m.h))} vs ${esc(tname(m.a))}</b><small>${esc(rname(L,m.ri))} · ${fmtD(m.date)} · ${url?(m.status==='vivo'?'Transmitiendo ahora':'Partido completo'):'Grabación no disponible'}</small></div></a>`;
}
function pubVideos(L){
  const ms=all(L);const live=ms.filter(m=>m.status==='vivo');const vods=ms.filter(m=>m.status==='final'&&!m.bye).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return`<div class="sec-h"><h2>En vivo ahora</h2></div>${live.length?`<div class="vids">${live.map(m=>vidCard(L,m)).join('')}</div>`:'<div class="empty">No hay partidos transmitiéndose en este momento.</div>'}
  <div class="sec-h" style="margin-top:12px"><h2>Partidos grabados</h2><span class="note">${vods.length} partidos</span></div>
  ${vods.length?`<div class="vids">${vods.map(m=>vidCard(L,m)).join('')}</div>`:'<div class="empty">Las grabaciones aparecerán al terminar cada partido.</div>'}`;
}

/* ===================== Arranque (página pública) ===================== */
function render(){
  const id=new URLSearchParams(location.search).get('liga');
  const L=id&&LG(id);
  document.title=L?`${L.name} · PÍCALE Fútbol`:'PÍCALE Fútbol';
  $('#app').innerHTML=L?viewLeague(L):viewHome();tick();
}
function tick(){document.querySelectorAll('[data-cd]').forEach(el=>{let s=Math.max(0,Math.floor((new Date(el.dataset.cd)-Date.now())/1000));const d=Math.floor(s/86400);s%=86400;el.textContent=(d?d+'d ':'')+p2(Math.floor(s/3600))+':'+p2(Math.floor(s%3600/60))+':'+p2(s%60)})}
const ACT={
  tab(el){PT.tab=el.dataset.tab;if(el.dataset.round)PT.round=+el.dataset.round;render();document.querySelector('.tabs')?.scrollIntoView({block:'start'})},
  round(el){PT.round=+el.dataset.i;render()},
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(el)ACT[el.dataset.act]?.(el,e)});
// Actualización automática: servidor cada 15 s; en modo demo, cuando el admin guarda en este mismo navegador.
async function refresh(){
  if(MODE!=='server')return;
  try{const j=await fetchServer();if(j&&JSON.stringify(j)!==JSON.stringify(S)){S=j;render()}}catch(e){}
}
window.addEventListener('storage',e=>{if(e.key===KEY&&MODE==='local'){const d=localData();if(d){S=d;render()}}});
(async()=>{S=await loadData();render();setInterval(tick,1000);setInterval(refresh,15000)})();
