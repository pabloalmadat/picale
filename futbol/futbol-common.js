
/* ===================== Datos ===================== */
const KEY='picale-futbol-v1', DEMO_PIN='2026', FUTBOL_API='/api/futbol', API=FUTBOL_API+'/data';
let MODE='local';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Math.random().toString(36).slice(2,8);
const p2=n=>String(n).padStart(2,'0');
const isoD=d=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
function mkRng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function seed(){
  const R=mkRng(11);
  const FN=['Diego','Luis','Andrés','Emilio','Rodrigo','Santiago','Mateo','Iván','Jorge','Óscar','Héctor','Ricardo','Mauricio','Arturo','Fernando','Gael','Sebastián','Carlos','Alan','Eduardo'];
  const LN=['Garza','Treviño','Villarreal','Cantú','Salinas','Leal','González','Elizondo','Martínez','Cavazos','Montemayor','Guerra','Saldaña','Benavides','Zambrano','Rodríguez'];
  const spec=[['Deportivo Cumbres','CUM','#1E5AA8'],['Atlético Contry','ACO','#C8102E'],['Real San Jerónimo','RSJ','#6B2D8F'],['Halcones Linda Vista','HLV','#0F7B5F'],['Club Mitras','MIT','#D9822B'],['Toros de Guadalupe','TGU','#8A1C1C'],['Leones de la Silla','LSI','#E3B505'],['Unión Obispado','UOB','#2B3A67'],['Sporting Valle Oriente','SVO','#00A3AD'],['Fénix Apodaca','FAP','#E4572E'],['Cachorros Escobedo','CES','#3D7A2A'],['Juventud Santa Catarina','JSC','#5B6C7D']];
  const teams=spec.map(([name,short,color],i)=>({id:'t'+(i+1),name,short,color,players:[1,4,5,6,7,8,9,10,11].map(n=>({n,name:FN[Math.floor(R()*FN.length)]+' '+LN[Math.floor(R()*LN.length)]}))}));
  const S={teams,leagues:[]};
  const TT=id=>teams.find(t=>t.id===id);
  const goals=()=>{const x=R();return x<.22?0:x<.5?1:x<.75?2:x<.9?3:4};
  function fill(m,hs,as,upTo=90){
    m.ev=[];
    const add=(side,n)=>{for(let i=0;i<n;i++){const pl=TT(side==='h'?m.h:m.a).players;m.ev.push({t:'g',side,p:pl[1+Math.floor(R()*8)].name,m:1+Math.floor(R()*upTo)})}};
    add('h',hs);add('a',as);
    const nc=Math.floor(R()*3);for(let i=0;i<nc;i++){const side=R()<.5?'h':'a';const pl=TT(side==='h'?m.h:m.a).players;m.ev.push({t:R()<.88?'y':'r',side,p:pl[1+Math.floor(R()*8)].name,m:1+Math.floor(R()*upTo)})}
    m.ev.sort((a,b)=>a.m-b.m);
  }
  // Liga
  const lt=teams.slice(0,8).map(t=>t.id);
  const L={id:'apertura26',name:'Liga PÍCALE Apertura 2026',kind:'liga',season:'Apertura 2026',venue:'Complejo Cumbres',vueltas:2,teams:lt,blocks:[],rounds:[]};
  roundRobin(lt,2).forEach((pairs,ri)=>{
    const d=new Date(2026,8,9+ri*7);
    const times=ri===8?[13,15,17,19]:[19,20,21,22];
    const r={id:uid('r'),date:isoD(d),matches:[]};
    pairs.forEach(([h,a],mi)=>{
      const m={id:uid('m'),h,a,date:`${r.date}T${p2(times[mi])}:00`,venue:'Cancha '+(mi%2+1),status:'programado',ev:[],stream:'',vod:''};
      if(ri<8||(ri===8&&mi===0)){m.status='final';fill(m,goals(),goals());m.vod='https://picalereplay.com'}
      else if(ri===8&&mi===1){m.status='vivo';fill(m,1,1,30);m.stream='https://picalereplay.com'}
      r.matches.push(m);
    });
    L.rounds.push(r);
  });
  S.leagues.push(L);
  // Torneo
  const ct=teams.slice(4,12).map(t=>t.id);
  const C={id:'copa-relampago',name:'Copa Relámpago Noviembre',kind:'torneo',season:'Noviembre 2026',venue:'Parque Fundidora',vueltas:1,teams:ct,blocks:[],rounds:[]};
  genBracket(C,['2026-10-25','2026-11-01','2026-11-08']);
  C.rounds[0].matches.forEach((m,i)=>{m.status='final';m.vod='https://picalereplay.com';let hs=goals(),as=goals();fill(m,hs,as);const[h,a]=sc(m);if(h===a)m.pen=i%2?'a':'h'});
  propagate(C);
  const s1=C.rounds[1].matches[0];s1.status='final';fill(s1,2,1);s1.vod='https://picalereplay.com';
  C.rounds[1].matches[1].date='2026-11-07T18:00';
  propagate(C);
  S.leagues.push(C);
  // Grupos + eliminación directa
  const gt=teams.slice(0,8).map(t=>t.id);
  const G={id:'copa-monterrey',name:'Copa Monterrey de Grupos',kind:'grupos',season:'Invierno 2026',venue:'Complejo Cumbres',vueltas:1,qual:2,teams:gt,blocks:[],groups:mkGroups(2),rounds:[]};
  G.groups[0].teams=[gt[0],gt[2],gt[4],gt[6]];G.groups[1].teams=[gt[1],gt[3],gt[5],gt[7]];
  genGroupCal(G,'2026-10-21',1);
  G.rounds.forEach((r,ri)=>r.matches.forEach(m=>{if(ri<2){m.status='final';fill(m,goals(),goals());m.vod='https://picalereplay.com'}}));
  buildKO(G,'2026-11-11');propagate(G);
  S.leagues.push(G);
  migrate(S);
  return S;
}

/* Cada competencia tiene sus propios equipos. Los datos viejos con equipos compartidos
   se separan: el equipo se copia para cada competencia (id fijo, igual en todas las páginas). */
function migrate(D){
  let ch=false;const find=id=>D.teams.find(t=>t.id===id);
  D.leagues.forEach(L=>{L.teams=L.teams.map(id=>{
    const t=find(id);if(!t)return id;
    if(!t.lid){t.lid=L.id;ch=true;return id}
    if(t.lid===L.id)return id;
    const nid=`${id}_${L.id}`;if(!find(nid)){D.teams.push({...JSON.parse(JSON.stringify(t)),id:nid,lid:L.id})}ch=true;
    L.rounds.forEach(r=>r.matches.forEach(m=>{if(m.h===id)m.h=nid;if(m.a===id)m.a=nid}));
    (L.blocks||[]).forEach(b=>{if(b[0]===id)b[0]=nid;if(b[1]===id)b[1]=nid});
    (L.groups||[]).forEach(g=>g.teams=g.teams.map(x=>x===id?nid:x));
    return nid;
  })});
  return ch;
}
function roundRobin(ids,vueltas){
  let arr=[...ids];if(arr.length%2)arr.push(null);
  const n=arr.length,rounds=[];
  for(let r=0;r<n-1;r++){
    const ms=[];
    for(let i=0;i<n/2;i++){let h=arr[i],a=arr[n-1-i];if((r+i)%2)[h,a]=[a,h];if(h&&a)ms.push([h,a])}
    rounds.push(ms);
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  if(vueltas==2)rounds.push(...rounds.map(ms=>ms.map(([h,a])=>[a,h])));
  return rounds;
}
const RNAMES={2:'Final',4:'Semifinales',8:'Cuartos de final',16:'Octavos de final',32:'Dieciseisavos'};
function genBracket(L,dates){
  const ids=[...L.teams];let size=1;while(size<ids.length)size*=2;
  while(ids.length<size)ids.push(null);
  const nR=Math.log2(size);L.rounds=[];
  const base=dates?.[0]||isoD(new Date());
  for(let r=0;r<nR;r++){
    const d=dates?.[r]||isoD(new Date(new Date(base+'T12:00').getTime()+r*7*864e5));
    const cnt=size/2**(r+1);
    const round={id:uid('r'),name:RNAMES[cnt*2]||`Ronda ${r+1}`,date:d,matches:[]};
    for(let i=0;i<cnt;i++){
      const m={id:uid('m'),h:null,a:null,date:`${d}T${p2(Math.min(10+i*2,22))}:00`,venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''};
      if(r===0){m.h=ids[i];m.a=ids[size-1-i];if(!m.h||!m.a)m.bye=true}
      round.matches.push(m);
    }
    L.rounds.push(round);
  }
}

/* ---------- Grupos + eliminación directa ---------- */
const GL='ABCDEFGH';
const koRounds=L=>L.rounds.filter(r=>r.ko);
const groupRoundsOf=L=>L.rounds.filter(r=>!r.ko);
const groupOf=(L,tid)=>(L.groups||[]).find(g=>g.teams.includes(tid));
const groupName=(L,gid)=>(L.groups||[]).find(g=>g.id===gid)?.name||'';
const groupTable=(L,g)=>table(L,g.teams,m=>m.g===g.id);
const mkGroups=n=>Array.from({length:n},(_,i)=>({id:'g'+GL[i],name:'Grupo '+GL[i],teams:[]}));
const srcLabel=(L,x)=>x?`${x.p}° ${groupName(L,x.g)}`:'Pase directo';
function genGroupCal(L,start,vu){
  const per=L.groups.map(g=>roundRobin(g.teams,vu));const n=Math.max(0,...per.map(x=>x.length));const base=new Date(start+'T12:00');const out=[];
  for(let k=0;k<n;k++){const d=isoD(new Date(base.getTime()+k*7*864e5));let slot=0;const ms=[];
    per.forEach((rr,gi)=>(rr[k]||[]).forEach(([h,a])=>ms.push({id:uid('m'),h,a,g:L.groups[gi].id,date:`${d}T${p2(Math.min(9+slot++,22))}:00`,venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''})));
    out.push({id:uid('r'),date:d,matches:ms})}
  L.rounds=out.concat(koRounds(L));
}
// Cruces de la primera ronda: 1° de un grupo contra 2° de otro, y los del mismo grupo en mitades opuestas.
function koSlots(L){
  const G=(L.groups||[]).filter(g=>g.teams.length);const q=Math.max(1,+L.qual||2);
  if(q===2&&[2,4,8].includes(G.length)){const top=[],bot=[];for(let k=0;k<G.length;k+=2){top.push([{g:G[k].id,p:1},{g:G[k+1].id,p:2}]);bot.push([{g:G[k+1].id,p:1},{g:G[k].id,p:2}])}return top.concat(bot)}
  const seeds=[];for(let p=1;p<=q;p++)G.forEach(g=>seeds.push({g:g.id,p}));if(seeds.length<2)return[];
  let size=2;while(size<seeds.length)size*=2;const pairs=[];for(let i=0;i<size/2;i++)pairs.push([seeds[i]||null,seeds[size-1-i]||null]);return pairs;
}
function buildKO(L,start){
  const pairs=koSlots(L);if(!pairs.length){L.rounds=groupRoundsOf(L);return}
  const base=new Date(start+'T12:00');const rounds=[];let cnt=pairs.length,r=0;
  while(true){const d=isoD(new Date(base.getTime()+r*7*864e5));const R={id:uid('r'),ko:true,name:RNAMES[cnt*2]||`Ronda ${r+1}`,date:d,matches:[]};
    for(let i=0;i<cnt;i++){const m={id:uid('m'),h:null,a:null,date:`${d}T${p2(Math.min(10+i*2,22))}:00`,venue:L.venue||'',status:'programado',ev:[],stream:'',vod:''};
      if(r===0){m.src={h:pairs[i][0],a:pairs[i][1]};if(!pairs[i][0]||!pairs[i][1])m.bye=true}R.matches.push(m)}
    rounds.push(R);if(cnt===1)break;cnt/=2;r++}
  L.rounds=groupRoundsOf(L).concat(rounds);
}
function groupsDone(L){const ms=groupRoundsOf(L).flatMap(r=>r.matches);return ms.length>0&&ms.every(m=>m.status==='final')}
function fillKO(L,force){
  const R0=koRounds(L)[0];if(!R0||(!force&&!groupsDone(L)))return;
  const pos={};(L.groups||[]).forEach(g=>pos[g.id]=groupTable(L,g).map(r=>r.id));
  R0.matches.forEach(m=>{if(!m.src||m.status!=='programado'||(m.ev||[]).length)return;['h','a'].forEach(s=>{const x=m.src[s];m[s]=x?(pos[x.g]?.[x.p-1]||null):null})});
}
function winner(m){
  if(!m)return null;if(m.bye)return m.h||m.a;if(m.status!=='final'||!m.h||!m.a)return null;
  const[h,a]=sc(m);if(h>a)return m.h;if(a>h)return m.a;return m.pen==='h'?m.h:m.pen==='a'?m.a:null;
}
function propagate(L){
  let R;if(L.kind==='torneo')R=L.rounds;else if(L.kind==='grupos'){fillKO(L);R=koRounds(L)}else return;
  for(let r=1;r<R.length;r++)R[r].matches.forEach((m,i)=>{const p=R[r-1].matches;m.h=winner(p[2*i]);m.a=winner(p[2*i+1])});
}


let S;
function localData(){try{const r=localStorage.getItem(KEY);if(r)return JSON.parse(r)}catch(e){}return null}
async function fetchServer(){
  const r=await fetch(API,{cache:'no-store',headers:typeof authH==='function'?authH():{}});if(!r.ok)throw new Error('api');
  const j=await r.json();MODE='server';return j&&j.leagues?j:null;
}
let MIGRATED=false;
async function loadData(){
  let d=null;
  try{d=(await fetchServer())||seed()}catch(e){MODE='local';d=localData()||seed()}
  MIGRATED=migrate(d);return d;
}
/* ---------- Sesión (dueño de liga o PÍCALE) ---------- */
const AUTH_KEY='picale-futbol-token';
const getTok=()=>{try{return localStorage.getItem(AUTH_KEY)||''}catch(e){return getTok._||''}};
const setTok=t=>{getTok._=t||'';try{t?localStorage.setItem(AUTH_KEY,t):localStorage.removeItem(AUTH_KEY)}catch(e){}};
const authH=()=>{const t=getTok();return t&&t!=='local'?{'Authorization':'Bearer '+t}:{}};
let ME=null; // {id, role:'owner'|'admin', name, plan, status, cams...}
async function api(path,opts={}){
  const r=await fetch(FUTBOL_API+path,{...opts,headers:{'Content-Type':'application/json',...authH(),...(opts.headers||{})}});
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const err=new Error(j?.detail||'No se pudo completar. Revisa tu conexión.');err.status=r.status;throw err}
  return j;
}
let _saveT=null,_saving=false,_again=false;
const DELETED=new Set();let REPLACE=false;
let afterRefresh=null; // cada página decide cómo redibujar cuando llegan datos nuevos
let SAVEST=['● Guardado','srv'];
function saveState(t,cls){SAVEST=[t,cls||''];const el=document.getElementById('savest');if(el){el.textContent=t;el.className='mode '+(cls||'')}}
const savePending=()=>_saving||_saveT!==null;
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
  if(MODE!=='server')return;
  clearTimeout(_saveT);saveState('Guardando…');
  _saveT=setTimeout(()=>{_saveT=null;flush()},350);
}
async function flush(){
  if(_saving){_again=true;return}
  _saving=true;const del=[...DELETED],rep=REPLACE;
  try{
    const res=await api('/data',{method:'PUT',body:JSON.stringify({...S,deleted:del,...(rep?{replace:true}:{})})});
    del.forEach(x=>DELETED.delete(x));if(rep)REPLACE=false;
    S.leagues.forEach(L=>{if(res.revs&&res.revs[L.id]!=null)L.rev=res.revs[L.id]});
    if(res.conflicts&&res.conflicts.length){
      // Otra pantalla cambió esa competencia antes: se carga lo más reciente para no pisarlo.
      const fresh=await fetchServer();if(fresh){S=fresh;migrate(S)}
      toast(`Se hicieron cambios en ${res.conflicts.join(', ')} desde otra pantalla. Ya cargué lo más reciente: repite tu último cambio.`,'warn');
      afterRefresh&&afterRefresh();
    }
    saveState('● Guardado','srv');
  }catch(e){saveState('Sin guardar','');toast(e.status===401?'Tu sesión expiró. Vuelve a entrar.':'No se pudo guardar en el servidor. Revisa la conexión.','warn')}
  finally{_saving=false;if(_again){_again=false;flush()}}
}
// Trae los cambios hechos desde otras pantallas cuando esta no tiene nada pendiente.
async function syncFromServer(){
  if(MODE!=='server'||savePending()||DELETED.size)return false;
  try{const fresh=await fetchServer();if(fresh&&!savePending()&&JSON.stringify(fresh)!==JSON.stringify(S)){S=fresh;migrate(S);return true}}catch(e){}
  return false;
}

/* ---------- Planes para dueños de liga ----------
   Precios de ejemplo para la demo: cámbialos aquí y se actualizan en todas las páginas. */
const PLANS=[
  {id:'liga',name:'Liga',price:990,cams:0,tag:'Para empezar',
   feats:['Competencias ilimitadas: liga, grupos y eliminatoria','Página pública con tabla, estadísticas y página por equipo','Imagen del rol semanal para WhatsApp','Captura de resultados desde el celular']},
  {id:'pro',name:'Liga PRO',price:2490,cams:1,tag:'El más elegido',best:true,
   feats:['Todo lo del plan Liga','1 cámara All-in-One PÍCALE incluida','Transmisión en vivo de cada partido','Grabación automática del partido completo','Instalación y soporte de PÍCALE']},
  {id:'complejo',name:'Complejo',price:5990,cams:3,tag:'Varias canchas',
   feats:['Todo lo de Liga PRO','3 cámaras All-in-One (una por cancha)','Transmisiones simultáneas','Soporte prioritario']},
];
const planOf=id=>PLANS.find(p=>p.id===id);
const money=n=>'$'+n.toLocaleString('es-MX')+' MXN';
/* Cámaras All-in-One: de dónde sale la señal en vivo y la grabación de cada partido.
   DEMO usa un video público de prueba para enseñar el reproductor funcionando. */
const DEMO_VIDEO='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const CAM_URL={
  stream:code=>code==='DEMO'?DEMO_VIDEO:`https://api.picalereplay.com/hls/${code}.m3u8`,
  vod:(code,mid)=>code==='DEMO'?DEMO_VIDEO:`https://api.picalereplay.com/grabaciones/${code}/${mid}.mp4`,
};

/* ===================== Utilidades ===================== */
const T=id=>S.teams.find(t=>t.id===id);
const LG=id=>S.leagues.find(l=>l.id===id);
const tname=id=>T(id)?.name||'Por definir';
function ink(hex){const h=(hex||'#777').replace('#','');const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);return(r*299+g*587+b*114)/1000>150?'#111':'#fff'}
/* ---------- Escudos generados por nombre ---------- */
function hashStr(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function lum(hex){const h=(hex||'#777').replace('#','');return(parseInt(h.substr(0,2),16)*299+parseInt(h.substr(2,2),16)*587+parseInt(h.substr(4,2),16)*114)/1000}
function starPts(R,r){let p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,k=i%2?r:R;p.push((Math.cos(a)*k).toFixed(1)+','+(Math.sin(a)*k).toFixed(1))}return p.join(' ')}
const LOGO_ICONS={
  ball:c=>`<circle r="17" fill="none" stroke="${c}" stroke-width="3.5"/><polygon points="${starPts(8,8).split(' ').filter((_,i)=>i%2===0).join(' ')}" fill="${c}"/><path d="M0-8V-17M7.6-2.5L16-5.3M4.7 6.5L10 13.8M-4.7 6.5L-10 13.8M-7.6-2.5L-16-5.3" stroke="${c}" stroke-width="2.5"/>`,
  crown:c=>`<path d="M-19 11V-9L-9.5 1L0-15L9.5 1L19-9V11Z" fill="${c}"/><rect x="-19" y="13" width="38" height="5" fill="${c}"/>`,
  star:c=>`<polygon points="${starPts(19,8)}" fill="${c}"/>`,
  flame:c=>`<path d="M0-20C10-8 16 0 12 10C9 18-9 18-12 10C-15 2-8-4-4-12C-3-4 2-2 4-6C5-10 3-15 0-20Z" fill="${c}"/>`,
  horns:c=>`<path d="M-21-14C-17 1-8 4 0 4C8 4 17 1 21-14C14-5 8-3 0-3C-8-3-14-5-21-14Z" fill="${c}"/><path d="M-9 4H9L6 17H-6Z" fill="${c}"/>`,
  wing:c=>`<path d="M-20 10C-10-16 10-20 21-16C12-12 14-8 6-6C12-4 10 0 2 0C8 2 4 6-4 6C0 10-10 12-20 10Z" fill="${c}"/>`,
  paw:c=>`<ellipse cy="7" rx="10" ry="8.5" fill="${c}"/><circle cx="-12" cy="-4" r="4.5" fill="${c}"/><circle cx="12" cy="-4" r="4.5" fill="${c}"/><circle cx="-5" cy="-12" r="4.5" fill="${c}"/><circle cx="5" cy="-12" r="4.5" fill="${c}"/>`,
  bolt:c=>`<path d="M5-20L-12 4H-2L-6 20L12-6H2Z" fill="${c}"/>`,
  mountain:c=>`<path d="M-22 14L-10-10L-4 0L2-6L10-15L22 14Z" fill="${c}"/>`,
};
const LOGO_WORDS=[[/fenix|fénix|fuego|llama/i,'flame'],[/le[oó]n|real|rey|reyes|corona|imperio/i,'crown'],[/halc[oó]n|[aá]guila|guila|cuervo|gavil/i,'wing'],[/toro|buf|bisonte|carnero/i,'horns'],[/cachorro|lobo|tigre|puma|jaguar|oso|coyote|perro/i,'paw'],[/rayo|rel[aá]mpago|trueno|tormenta|electr/i,'bolt'],[/silla|cerro|cumbre|sierra|mitras|monta|volc/i,'mountain'],[/estrella|uni[oó]n|juventud|nova|astro/i,'star']];
const LOGO_SHAPES=['M18 10H102V62C102 92 60 113 60 113C60 113 18 92 18 62Z','M60 8A52 52 0 1 1 59.9 8Z','M60 6L104 31V89L60 114L16 89V31Z'];
const LOGO_PATTERNS=[
  ()=> '',
  c=>[24,48,72,96].map(x=>`<rect x="${x-6}" y="0" width="12" height="120" fill="${c}"/>`).join(''),
  c=>`<rect x="60" y="0" width="60" height="120" fill="${c}"/>`,
  c=>`<path d="M-10 22L22-10L130 98L98 130Z" fill="${c}"/>`,
  c=>`<rect x="0" y="22" width="120" height="12" fill="${c}"/><rect x="0" y="70" width="120" height="12" fill="${c}"/>`,
  c=>`<path d="M0 30L60 64L120 30V48L60 82L0 48Z" fill="${c}"/>`,
];
let _logoN=0;
function logoParts(t){
  const h=hashStr((t.name||'')+'|'+(t.logoV||0));
  const p=t.color||'#2F6FB0';const lp=lum(p);
  const cands=['#F4F1EA','#14181A','#E9C46A','#C9CED1','#B3262E'];
  const rot=(h>>>6)%cands.length;let sec=cands[rot];
  for(let i=0;i<cands.length;i++){const c=cands[(rot+i)%cands.length];if(Math.abs(lum(c)-lp)>95){sec=c;break}}
  const kw=LOGO_WORDS.find(([re])=>re.test(t.name||''));
  const gen=['ball','star','bolt','crown','ball'];
  return{p,sec,shape:h%3,pattern:(h>>>3)%LOGO_PATTERNS.length,icon:kw?kw[1]:gen[(h>>>9)%gen.length]};
}
function logoSVG(t,standalone=false){
  const L=logoParts(t),id='lgc'+(++_logoN),sh=LOGO_SHAPES[L.shape];
  const code=esc((t.short||'').toUpperCase().slice(0,4));
  return`<svg ${standalone?'xmlns="http://www.w3.org/2000/svg" width="240" height="240" ':''}viewBox="0 0 120 120" role="img" aria-label="${esc(t.name||'')}"><defs><clipPath id="${id}"><path d="${sh}"/></clipPath></defs>`+
    `<path d="${sh}" fill="${L.p}"/><g clip-path="url(#${id})">${LOGO_PATTERNS[L.pattern](L.sec)}<rect x="0" y="82" width="120" height="17" fill="${L.sec}"/></g>`+
    `<circle cx="60" cy="50" r="25" fill="${L.p}" stroke="${L.sec}" stroke-width="3.5"/><g transform="translate(60 50) scale(.92)">${LOGO_ICONS[L.icon](L.sec)}</g>`+
    `<text x="60" y="95.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="13.5" letter-spacing="1" fill="${L.p}">${code}</text>`+
    `<path d="${sh}" fill="none" stroke="${L.sec}" stroke-width="4"/></svg>`;
}
const logoURL=t=>t.logoImg||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(logoSVG(t,true));
const logoHTML=t=>t.logoImg?`<img src="${esc(t.logoImg)}" alt="" loading="lazy">`:logoSVG(t);
function crest(id,size=''){const t=T(id);if(!t)return`<span class="crest tbd ${size}">?</span>`;return`<span class="crest lg-on ${t.logoImg?'img':''} ${size}" aria-hidden="true">${logoHTML(t)}</span>`}

/* ---------- Fotos de jugadores ---------- */
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
function avatar(p,size=''){
  if(p&&p.photo)return`<span class="ava ${size}"><img src="${esc(p.photo)}" alt="" loading="lazy"></span>`;
  const h=hashStr(p?.name||'');return`<span class="ava ${size}" style="--h:${h%360}">${esc(initials(p?.name))}</span>`;
}
const findPlayer=(tid,name)=>(T(tid)?.players||[]).find(p=>p.name===name);
/* Reduce la imagen en el navegador antes de subirla (logos en PNG para conservar la transparencia). */
function shrinkImage(file,max,type){
  return new Promise((res,rej)=>{
    if(!file||!/^image\//.test(file.type)){rej(new Error('Elige una imagen JPG, PNG o WEBP'));return}
    const url=URL.createObjectURL(file);const im=new Image();
    im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      const x=c.getContext('2d');if(type==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL(type,.86))};
    im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('No se pudo leer la imagen'))};im.src=url;
  });
}
async function uploadImage(file,kind){
  if(MODE!=='server')throw new Error('Subir imágenes necesita el servidor (no funciona en modo demo local)');
  const data=await shrinkImage(file,kind==='logo'?320:480,kind==='logo'?'image/png':'image/jpeg');
  return(await api('/upload',{method:'POST',body:JSON.stringify({data})})).url;
}
function pickFile(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='image/png,image/jpeg,image/webp';i.onchange=()=>res(i.files[0]||null);i.click()})}

/* ---------- Jugadores y equipos ---------- */
const POS=['POR','DEF','MED','DEL'];
const POSN={POR:'Portero',DEF:'Defensa',MED:'Medio',DEL:'Delantero'};
function posOf(p){if(p.pos)return p.pos;const n=+p.n;if(!n)return'DEL';if(n===1||n===12||n===13)return'POR';if(n>=2&&n<=5)return'DEF';if([6,8,10,14,15,16].includes(n))return'MED';return'DEL'}
const teamURL=(lid,tid)=>`/futbol?liga=${encodeURIComponent(lid)}&equipo=${encodeURIComponent(tid)}`;
const leagueURL=lid=>`/futbol?liga=${encodeURIComponent(lid)}`;
function playerStats(L,tid){
  const t=T(tid);const map={};
  (t?.players||[]).forEach(p=>map[p.name]={n:p.n,name:p.name,pos:posOf(p),photo:p.photo,uid:p.uid,g:0,y:0,r:0,mg:0});
  all(L).forEach(m=>{
    if(m.status!=='final'||(m.h!==tid&&m.a!==tid))return;const side=m.h===tid?'h':'a';const scored=new Set();
    m.ev.forEach(e=>{if(e.side!==side||!e.p)return;const x=map[e.p]||(map[e.p]={n:'',name:e.p,pos:'—',g:0,y:0,r:0,mg:0});
      if(e.t==='g'){x.g++;scored.add(e.p)}else x[e.t]++});
    scored.forEach(n=>map[n].mg++);
  });
  return Object.values(map);
}
function teamMatches(L,tid){return all(L).filter(m=>!m.bye&&(m.h===tid||m.a===tid)).sort((a,b)=>new Date(a.date)-new Date(b.date))}

function sc(m){let h=0,a=0;(m.ev||[]).forEach(e=>{if(e.t==='g')e.side==='h'?h++:a++});return[h,a]}
const all=L=>L.rounds.flatMap((r,ri)=>r.matches.map(m=>({...m,ri,_m:m})));
const fmtD=d=>{const s=new Date(d).toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,'');return s.charAt(0).toUpperCase()+s.slice(1)};
const fmtT=d=>{const x=new Date(d);return p2(x.getHours())+':'+p2(x.getMinutes())};
const rname=(L,i)=>L.kind==='torneo'||L.rounds[i]?.ko?L.rounds[i]?.name:`Jornada ${i+1}`;
const kindLabel=L=>L.kind==='liga'?'Liga':L.kind==='grupos'?'Grupos + eliminación directa':'Torneo eliminatorio';
function curRound(L){const i=L.rounds.findIndex(r=>r.matches.some(m=>m.status!=='final'&&!m.bye));return i<0?Math.max(0,L.rounds.length-1):i}
function featured(L){
  const ms=all(L).filter(m=>!m.bye&&m.h&&m.a);
  const live=ms.find(m=>m.status==='vivo');if(live)return{m:live,kind:'vivo'};
  const now=Date.now();const nx=ms.filter(m=>m.status==='programado'&&new Date(m.date).getTime()>=now-36e5).sort((a,b)=>new Date(a.date)-new Date(b.date))[0];
  if(nx)return{m:nx,kind:'prox'};
  const lf=ms.filter(m=>m.status==='final').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  return lf?{m:lf,kind:'fin'}:null;
}
function meetings(L,a,b){let c=0;L.rounds.forEach(r=>r.matches.forEach(m=>{if((m.h===a&&m.a===b)||(m.h===b&&m.a===a))c++}));return c}
const isBlocked=(L,a,b)=>(L.blocks||[]).some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
function toast(msg,kind=''){const t=$('#toast');t.textContent=msg;t.className='on '+kind;clearTimeout(toast._);toast._=setTimeout(()=>t.className='',2600)}
function statusPill(m){
  if(m.status==='vivo')return'<span class="pill live"><span class="dot"></span>En vivo</span>';
  if(m.status==='final')return'<span class="pill fin">Final</span>';
  return'<span class="pill">Programado</span>';
}

function table(L,teams=L.teams,filt=null){
  const R={};teams.forEach(id=>R[id]={id,pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0,form:[]});
  L.rounds.forEach(r=>r.matches.forEach(m=>{
    if(m.status!=='final'||!R[m.h]||!R[m.a]||(filt&&!filt(m)))return;const[h,a]=sc(m);
    const H=R[m.h],A=R[m.a];H.pj++;A.pj++;H.gf+=h;H.gc+=a;A.gf+=a;A.gc+=h;
    if(h>a){H.g++;H.pts+=3;A.p++;H.form.push('G');A.form.push('P')}
    else if(a>h){A.g++;A.pts+=3;H.p++;A.form.push('G');H.form.push('P')}
    else{H.e++;A.e++;H.pts++;A.pts++;H.form.push('E');A.form.push('E')}
  }));
  return Object.values(R).sort((x,y)=>y.pts-x.pts||(y.gf-y.gc)-(x.gf-x.gc)||y.gf-x.gf||tname(x.id).localeCompare(tname(y.id)));
}
function stats(L){
  const scr={},crd={},tm={};let goals=0,played=0,cards=0;
  L.teams.forEach(id=>tm[id]={id,gf:0,gc:0,pj:0,cs:0});
  all(L).forEach(m=>{
    if(m.status!=='final'||!m.h||!m.a)return;const[h,a]=sc(m);played++;goals+=h+a;
    m.ev.forEach(e=>{const tid=e.side==='h'?m.h:m.a;
      if(e.t==='g'){if(e.p){const k=e.p+'|'+tid;scr[k]=(scr[k]||0)+1}}
      else{cards++;if(e.p){const k=e.p+'|'+tid;crd[k]=crd[k]||{y:0,r:0};crd[k][e.t]++}}});
    [[m.h,h,a],[m.a,a,h]].forEach(([id,f,c])=>{const t=tm[id];if(!t)return;t.pj++;t.gf+=f;t.gc+=c;if(!c)t.cs++});
  });
  const split=k=>{const[p,t]=k.split('|');return{p,t}};
  return{goals,played,cards,
    scorers:Object.entries(scr).map(([k,v])=>({...split(k),v})).sort((a,b)=>b.v-a.v||a.p.localeCompare(b.p)).slice(0,10),
    cardsL:Object.entries(crd).map(([k,v])=>({...split(k),y:v.y,r:v.r,v:v.y+v.r*2})).sort((a,b)=>b.v-a.v).slice(0,8),
    teams:Object.values(tm)};
}

