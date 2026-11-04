
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
  return S;
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
function winner(m){
  if(!m)return null;if(m.bye)return m.h||m.a;if(m.status!=='final'||!m.h||!m.a)return null;
  const[h,a]=sc(m);if(h>a)return m.h;if(a>h)return m.a;return m.pen==='h'?m.h:m.pen==='a'?m.a:null;
}
function propagate(L){
  if(L.kind!=='torneo')return;
  for(let r=1;r<L.rounds.length;r++)L.rounds[r].matches.forEach((m,i)=>{const p=L.rounds[r-1].matches;m.h=winner(p[2*i]);m.a=winner(p[2*i+1])});
}

let S;
function localData(){try{const r=localStorage.getItem(KEY);if(r)return JSON.parse(r)}catch(e){}return null}
async function fetchServer(){
  const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw new Error('api');
  const j=await r.json();MODE='server';return j&&j.leagues?j:null;
}
async function loadData(){
  try{return (await fetchServer())||seed()}catch(e){MODE='local'}
  return localData()||seed();
}
const getPin=()=>{try{return sessionStorage.getItem('picale-futbol-pin')||''}catch(e){return getPin._||''}};
let _saveT;
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
  if(MODE!=='server')return;
  clearTimeout(_saveT);
  _saveT=setTimeout(async()=>{
    try{const r=await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json','X-Admin-Pin':getPin()},body:JSON.stringify(S)});
      if(r.status===401)toast('Tu sesión expiró. Vuelve a entrar con el PIN.','warn');else if(!r.ok)throw 0;}
    catch(e){toast('No se pudo guardar en el servidor. Revisa la conexión.','warn')}
  },350);
}

/* ===================== Utilidades ===================== */
const T=id=>S.teams.find(t=>t.id===id);
const LG=id=>S.leagues.find(l=>l.id===id);
const tname=id=>T(id)?.name||'Por definir';
function ink(hex){const h=(hex||'#777').replace('#','');const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);return(r*299+g*587+b*114)/1000>150?'#111':'#fff'}
function crest(id,size=''){const t=T(id);if(!t)return`<span class="crest tbd ${size}">?</span>`;return`<span class="crest ${size}" style="background:${t.color};color:${ink(t.color)}" aria-hidden="true">${esc(t.short)}</span>`}
function sc(m){let h=0,a=0;(m.ev||[]).forEach(e=>{if(e.t==='g')e.side==='h'?h++:a++});return[h,a]}
const all=L=>L.rounds.flatMap((r,ri)=>r.matches.map(m=>({...m,ri,_m:m})));
const fmtD=d=>{const s=new Date(d).toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,'');return s.charAt(0).toUpperCase()+s.slice(1)};
const fmtT=d=>{const x=new Date(d);return p2(x.getHours())+':'+p2(x.getMinutes())};
const rname=(L,i)=>L.kind==='torneo'?L.rounds[i]?.name:`Jornada ${i+1}`;
function curRound(L){const i=L.rounds.findIndex(r=>r.matches.some(m=>m.status!=='final'&&!m.bye));return i<0?Math.max(0,L.rounds.length-1):i}
function featured(L){
  const ms=all(L).filter(m=>!m.bye);
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

function table(L){
  const R={};L.teams.forEach(id=>R[id]={id,pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0,form:[]});
  L.rounds.forEach(r=>r.matches.forEach(m=>{
    if(m.status!=='final'||!R[m.h]||!R[m.a])return;const[h,a]=sc(m);
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

