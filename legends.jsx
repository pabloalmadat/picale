import { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================================
   THE LEGENDS — Padel Teams League
   Somos Pádel × The Legends × Pícale
   ----------------------------------------------------------------------------
   ARQUITECTURA DE DATOS
   Toda la app se alimenta de un único objeto LEAGUE. Nada de marcadores,
   tablas ni estadísticas está escrito a mano en los componentes: la
   clasificación, los récords de jugador y las estadísticas se calculan.
   Para conectar Pícale basta con reemplazar LEAGUE por un fetch al API:

     const [league, setLeague] = useState(null);
     useEffect(() => { fetch('/api/leagues/the-legends/season/2026-a')
       .then(r => r.json()).then(setLeague); }, []);

   League ├ Seasons ├ Cities ├ Venues ├ Teams ├ Players ├ Matchdays ├ Matches
   Match  ├ players ├ teams ├ venue ├ court ├ date ├ score ├ status
          ├ streamUrl ├ replayUrl ├ clips
============================================================================ */

const LEAGUE = {
  id: "the-legends",
  name: "The Legends",
  subtitle: "Padel Teams League",
  season: { id: "2026-a", name: "Temporada 2026 · Apertura" },

  cities: [
    { id: "mty", name: "Monterrey" },
    { id: "chi", name: "Chihuahua" },
    { id: "jrz", name: "Ciudad Juárez" },
    { id: "cun", name: "Cancún" },
    { id: "cdmx", name: "Ciudad de México" },
    { id: "qro", name: "Querétaro" },
  ],

  venues: [
    { id: "somos-mty", name: "Somos Pádel", cityId: "mty", courts: 8, host: true },
    { id: "legends-chi", name: "Legends Arena", cityId: "chi", courts: 4, host: false },
  ],

  teams: [
    { id: "hal", name: "Halcones NL", short: "HAL", cityId: "mty", color: "#E4B84B", captain: "p1" },
    { id: "tit", name: "Titanes Cumbres", short: "TIT", cityId: "mty", color: "#7FA7C4", captain: "p5" },
    { id: "lob", name: "Lobos del Norte", short: "LOB", cityId: "chi", color: "#A7B0A4", captain: "p9" },
    { id: "bra", name: "Bravos Juárez", short: "BRA", cityId: "jrz", color: "#D98A5B", captain: "p13" },
    { id: "mar", name: "Marea Cancún", short: "MAR", cityId: "cun", color: "#6FB5A8", captain: "p17" },
    { id: "con", name: "Cóndores CDMX", short: "CON", cityId: "cdmx", color: "#A98BC4", captain: "p21" },
  ],

  players: [
    { id: "p1", name: "Pablo Almada", teamId: "hal", side: "Revés" },
    { id: "p2", name: "Juan Pérez", teamId: "hal", side: "Drive" },
    { id: "p3", name: "Rodrigo Sáenz", teamId: "hal", side: "Revés" },
    { id: "p4", name: "Emilio Cantú", teamId: "hal", side: "Drive" },
    { id: "p5", name: "Carlos García", teamId: "tit", side: "Revés" },
    { id: "p6", name: "Diego López", teamId: "tit", side: "Drive" },
    { id: "p7", name: "Andrés Villarreal", teamId: "tit", side: "Revés" },
    { id: "p8", name: "Memo Treviño", teamId: "tit", side: "Drive" },
    { id: "p9", name: "Iván Nájera", teamId: "lob", side: "Revés" },
    { id: "p10", name: "Sebastián Ruiz", teamId: "lob", side: "Drive" },
    { id: "p11", name: "Marco Herrera", teamId: "lob", side: "Revés" },
    { id: "p12", name: "Fernando Domínguez", teamId: "lob", side: "Drive" },
    { id: "p13", name: "Alan Quintana", teamId: "bra", side: "Revés" },
    { id: "p14", name: "Beto Salas", teamId: "bra", side: "Drive" },
    { id: "p15", name: "Hugo Márquez", teamId: "bra", side: "Revés" },
    { id: "p16", name: "Nicolás Peña", teamId: "bra", side: "Drive" },
    { id: "p17", name: "Luis Ortega", teamId: "mar", side: "Revés" },
    { id: "p18", name: "Samuel Ríos", teamId: "mar", side: "Drive" },
    { id: "p19", name: "Tomás Aguilar", teamId: "mar", side: "Revés" },
    { id: "p20", name: "Bruno Elizondo", teamId: "mar", side: "Drive" },
    { id: "p21", name: "Erick Zamora", teamId: "con", side: "Revés" },
    { id: "p22", name: "Julián Ponce", teamId: "con", side: "Drive" },
    { id: "p23", name: "Raúl Mendoza", teamId: "con", side: "Revés" },
    { id: "p24", name: "Iker Fuentes", teamId: "con", side: "Drive" },
  ],

  matchdays: [
    { id: "j1", number: 1, date: "2026-08-10", venueId: "somos-mty", status: "final" },
    { id: "j2", number: 2, date: "2026-08-17", venueId: "somos-mty", status: "final" },
    { id: "j3", number: 3, date: "2026-08-24", venueId: "legends-chi", status: "final" },
    { id: "j4", number: 4, date: "2026-08-31", venueId: "somos-mty", status: "live" },
  ],

  // sets: [[gamesA, gamesB], ...] · el tercer set es super tiebreak a 10
  matches: [
    { id: "m1", matchdayId: "j1", court: 1, time: "18:00", teamA: "hal", teamB: "lob", sets: [[6, 4], [3, 6], [10, 8]], status: "final" },
    { id: "m2", matchdayId: "j1", court: 2, time: "18:00", teamA: "tit", teamB: "bra", sets: [[6, 2], [6, 4]], status: "final" },
    { id: "m3", matchdayId: "j1", court: 3, time: "19:30", teamA: "mar", teamB: "con", sets: [[4, 6], [6, 3], [8, 10]], status: "final" },

    { id: "m4", matchdayId: "j2", court: 1, time: "18:00", teamA: "hal", teamB: "bra", sets: [[7, 5], [6, 4]], status: "final" },
    { id: "m5", matchdayId: "j2", court: 2, time: "18:00", teamA: "lob", teamB: "con", sets: [[6, 7], [6, 3], [10, 6]], status: "final" },
    { id: "m6", matchdayId: "j2", court: 3, time: "19:30", teamA: "tit", teamB: "mar", sets: [[6, 1], [5, 7], [10, 7]], status: "final" },

    { id: "m7", matchdayId: "j3", court: 1, time: "17:00", teamA: "hal", teamB: "con", sets: [[3, 6], [6, 4], [9, 11]], status: "final" },
    { id: "m8", matchdayId: "j3", court: 2, time: "17:00", teamA: "tit", teamB: "lob", sets: [[6, 4], [6, 4]], status: "final" },
    { id: "m9", matchdayId: "j3", court: 3, time: "18:30", teamA: "bra", teamB: "mar", sets: [[6, 3], [4, 6], [10, 5]], status: "final" },

    { id: "m10", matchdayId: "j4", court: 1, time: "18:00", teamA: "hal", teamB: "tit", sets: [[6, 4], [3, 2]], status: "live", elapsed: 2760 },
    { id: "m11", matchdayId: "j4", court: 2, time: "18:00", teamA: "lob", teamB: "mar", sets: [[6, 7], [6, 4], [4, 3]], status: "live", elapsed: 5220 },
    { id: "m12", matchdayId: "j4", court: 3, time: "20:00", teamA: "bra", teamB: "con", sets: [], status: "scheduled" },
  ],
};

/* ============================================================================
   DERIVADOS — nada de esto se escribe a mano
============================================================================ */

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const byId = (arr, id) => arr.find((x) => x.id === id);

function hydrate(league) {
  const md = (id) => byId(league.matchdays, id);
  const teams = league.teams.map((t) => ({
    ...t,
    slug: slugify(t.name),
    city: byId(league.cities, t.cityId).name,
    players: league.players.filter((p) => p.teamId === t.id),
  }));
  const players = league.players.map((p) => ({
    ...p,
    slug: slugify(p.name),
    team: byId(teams, p.teamId),
  }));

  const matches = league.matches.map((m) => {
    const day = md(m.matchdayId);
    const venue = byId(league.venues, day.venueId);
    const city = byId(league.cities, venue.cityId);
    // La pareja rota por jornada: impares juegan la 1ª pareja, pares la 2ª.
    const idx = day.number % 2 === 1 ? [0, 1] : [2, 3];
    const pair = (teamId) => players.filter((p) => p.teamId === teamId).filter((_, i) => idx.includes(i));
    const teamA = byId(teams, m.teamA);
    const teamB = byId(teams, m.teamB);
    const setsA = m.sets.filter(([a, b]) => a > b && isSetClosed(a, b)).length;
    const setsB = m.sets.filter(([a, b]) => b > a && isSetClosed(b, a)).length;
    const winner = m.status === "final" ? (setsA > setsB ? teamA : teamB) : null;
    return {
      ...m,
      slug: `jornada-${day.number}-cancha-${m.court}`,
      matchday: day,
      venue,
      city,
      date: day.date,
      teamA,
      teamB,
      pairA: pair(m.teamA),
      pairB: pair(m.teamB),
      setsA,
      setsB,
      winner,
      streamUrl: m.status === "live" ? `https://stream.picalereplay.com/legends/${m.id}.m3u8` : null,
      replayUrl: m.status === "final" ? `https://replay.picalereplay.com/legends/${m.id}` : null,
      clips: m.status === "scheduled" ? [] : buildClips(m, pair(m.teamA), pair(m.teamB)),
      stats: m.status === "scheduled" ? null : buildStats(m),
    };
  });

  return { ...league, teams, players, matches };
}

function isSetClosed(a, b) {
  if (a >= 10) return true; // super tiebreak
  return a >= 6 && a - b >= 1;
}

// Pseudoaleatorio determinista: mismos números en cada render.
function seeded(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (min, max) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return min + (h % (max - min + 1));
  };
}

function buildClips(m, pairA, pairB) {
  const r = seeded(m.id + "clips");
  const kinds = [
    ["Smash por 3", "El punto que rompió el saque"],
    ["Bandeja y volea ganadora", "Cierre de red impecable"],
    ["Salida de pared doble", "Defensa que termina en punto"],
    ["Víbora cruzada", "Ángulo imposible desde el fondo"],
    ["Punto de set", "Rally de 18 golpes"],
  ];
  const all = [...pairA, ...pairB];
  const n = m.status === "live" ? 2 : 3;
  return Array.from({ length: n }, (_, i) => {
    const k = kinds[r(0, kinds.length - 1)];
    const p = all[r(0, all.length - 1)];
    return {
      id: `${m.id}-c${i + 1}`,
      title: `${k[0]} — ${p.name.split(" ")[0]} ${p.name.split(" ")[1] || ""}`.trim(),
      note: k[1],
      set: r(1, Math.max(1, m.sets.length)),
      minute: `${r(4, 78)}'`,
      seconds: r(9, 24),
      playerId: p.id,
    };
  });
}

function buildStats(m) {
  const r = seeded(m.id + "stats");
  const pointsA = r(58, 92);
  const pointsB = r(58, 92);
  return {
    duration: `${r(58, 104)} min`,
    points: [pointsA, pointsB],
    winners: [r(14, 32), r(14, 32)],
    errors: [r(9, 26), r(9, 26)],
    smashes: [r(6, 19), r(6, 19)],
    breaks: [r(1, 6), r(1, 6)],
    firstServe: [`${r(58, 84)}%`, `${r(58, 84)}%`],
    longestRally: `${r(14, 31)} golpes`,
  };
}

function standings(db) {
  const rows = db.teams.map((t) => {
    const played = db.matches.filter((m) => m.status === "final" && (m.teamA.id === t.id || m.teamB.id === t.id));
    let pg = 0, pp = 0, sf = 0, sc = 0;
    played.forEach((m) => {
      const home = m.teamA.id === t.id;
      const mine = home ? m.setsA : m.setsB;
      const theirs = home ? m.setsB : m.setsA;
      sf += mine; sc += theirs;
      if (m.winner.id === t.id) pg++; else pp++;
    });
    return { team: t, pj: played.length, pg, pp, sf, sc, dif: sf - sc, pts: pg * 3 };
  });
  return rows.sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.sf - a.sf);
}

function playerRecord(db, player) {
  const played = db.matches.filter((m) => [...m.pairA, ...m.pairB].some((p) => p.id === player.id));
  const finals = played.filter((m) => m.status === "final");
  const wins = finals.filter((m) => {
    const inA = m.pairA.some((p) => p.id === player.id);
    return m.winner.id === (inA ? m.teamA.id : m.teamB.id);
  }).length;
  const losses = finals.length - wins;
  return {
    matches: played,
    played: finals.length,
    wins,
    losses,
    winRate: finals.length ? Math.round((wins / finals.length) * 1000) / 10 : 0,
    clips: played.flatMap((m) => m.clips.filter((c) => c.playerId === player.id).map((c) => ({ ...c, match: m }))),
  };
}

/* ============================================================================
   ESTILOS
============================================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

.lg *, .lg *::before, .lg *::after { box-sizing: border-box; }
.lg {
  --ink:#050506; --panel:#0D0D0F; --panel2:#151519; --line:rgba(245,242,236,.10);
  --line-strong:rgba(245,242,236,.22);
  --ivory:#F5F2EC; --muted:#8B8B90; --gold:#E4B84B; --gold-soft:rgba(228,184,75,.14);
  --live:#FF3355; --live-soft:rgba(255,51,85,.13); --sage:#A7B0A4;
  background:var(--ink); color:var(--ivory);
  font-family:'Inter',system-ui,sans-serif; font-size:15px; line-height:1.55;
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
.lg h1,.lg h2,.lg h3,.lg h4 { font-family:'Barlow Condensed',sans-serif; font-weight:700; line-height:.95; margin:0; letter-spacing:-.01em; }
.lg p { margin:0; }
.lg button { font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
.lg a { color:inherit; text-decoration:none; }
.lg :focus-visible { outline:2px solid var(--gold); outline-offset:3px; }
.lg-num { font-family:'Barlow Condensed',sans-serif; font-variant-numeric:tabular-nums; font-weight:700; }

.wrap { max-width:1180px; margin:0 auto; padding:0 18px; }

/* ---- nav ---- */
.nav { position:sticky; top:0; z-index:40; background:rgba(5,5,6,.86); backdrop-filter:blur(14px); border-bottom:1px solid var(--line); }
.nav-in { display:flex; align-items:center; gap:22px; height:60px; }
.brand { display:flex; align-items:baseline; gap:8px; }
.brand-mark { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:22px; letter-spacing:.06em; }
.brand-mark span { color:var(--gold); }
.nav-links { display:none; gap:20px; margin-left:8px; flex:1; }
.nav-link { font-size:13.5px; color:var(--muted); padding:6px 0; border-bottom:2px solid transparent; transition:color .15s; }
.nav-link:hover { color:var(--ivory); }
.nav-link.on { color:var(--ivory); border-bottom-color:var(--gold); }
.nav-link.live-l { color:var(--live); }
.nav-right { margin-left:auto; display:flex; align-items:center; gap:14px; }
.picale-tag { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--muted); letter-spacing:.04em; }
.picale-logo { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:15px; color:var(--sage); letter-spacing:.08em; }
.burger { display:grid; gap:4px; padding:8px; margin-right:-8px; }
.burger i { display:block; width:20px; height:1.5px; background:var(--ivory); }
.sheet { border-top:1px solid var(--line); background:var(--panel); }
.sheet a { display:block; padding:13px 18px; border-bottom:1px solid var(--line); font-size:15px; }

/* ---- ticker ---- */
.ticker { display:flex; align-items:center; gap:14px; height:36px; overflow:hidden; border-bottom:1px solid var(--line); background:var(--panel); font-size:12px; }
.ticker-head { display:flex; align-items:center; gap:7px; padding:0 14px; height:100%; background:var(--live-soft); color:var(--live); white-space:nowrap; font-weight:600; letter-spacing:.05em; }
.ticker-track { display:flex; gap:26px; white-space:nowrap; animation:slide 34s linear infinite; }
.ticker-item { color:var(--muted); }
.ticker-item b { color:var(--ivory); font-weight:500; }
.ticker-item .sc { color:var(--gold); font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:14px; }
@keyframes slide { from{transform:translateX(0)} to{transform:translateX(-50%)} }

.dot { width:7px; height:7px; border-radius:50%; background:var(--live); box-shadow:0 0 0 0 rgba(255,51,85,.6); animation:pulse 2s infinite; flex:none; }
@keyframes pulse { 70%{box-shadow:0 0 0 8px rgba(255,51,85,0)} 100%{box-shadow:0 0 0 0 rgba(255,51,85,0)} }

/* ---- hero ---- */
.hero { padding:48px 0 34px; border-bottom:1px solid var(--line); }
.hero-grid { display:grid; gap:32px; }
.hero-kicker { font-size:12px; color:var(--muted); letter-spacing:.16em; margin-bottom:16px; }
.hero-title { font-size:clamp(60px,15vw,132px); line-height:.82; letter-spacing:-.02em; }
.hero-title .l2 { display:block; color:var(--gold); }
.hero-sub { margin-top:14px; font-family:'Barlow Condensed',sans-serif; font-size:clamp(17px,4vw,22px); letter-spacing:.22em; color:var(--ivory); font-weight:500; }
.hero-lede { margin-top:16px; color:var(--muted); max-width:46ch; font-size:15.5px; }
.hero-brands { margin-top:22px; display:flex; align-items:center; gap:12px; font-size:11.5px; color:var(--muted); letter-spacing:.1em; }
.hero-brands b { color:var(--ivory); font-weight:500; }
.reveal { animation:rise .7s cubic-bezier(.2,.7,.3,1) both; }
.reveal-2 { animation-delay:.09s; } .reveal-3 { animation-delay:.17s; }
@keyframes rise { from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:none} }

.cta-row { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.btn { display:inline-flex; align-items:center; gap:9px; padding:12px 20px; border:1px solid var(--line-strong); font-size:13.5px; font-weight:500; transition:background .15s,border-color .15s; }
.btn:hover { background:rgba(245,242,236,.06); }
.btn-live { background:var(--live); border-color:var(--live); color:#fff; font-weight:600; }
.btn-live:hover { background:#ff1f47; }
.btn-gold { background:var(--gold); border-color:var(--gold); color:#141208; font-weight:600; }
.btn-gold:hover { background:#f0c65a; }
.btn-sm { padding:8px 14px; font-size:12.5px; }

/* ---- monitor (hero live panel) ---- */
.monitor { border:1px solid var(--line); background:var(--panel); }
.monitor-top { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line); font-size:11.5px; color:var(--muted); letter-spacing:.06em; }
.monitor-live { display:flex; align-items:center; gap:7px; color:var(--live); font-weight:600; }
.monitor-body { padding:16px 14px 18px; }
.monitor-empty { padding:26px 16px; text-align:center; color:var(--muted); font-size:14px; }

/* ---- court frame (video placeholder) ---- */
.court { position:relative; display:block; width:100%; background:#08080A; border:1px solid var(--line); }
.court svg { display:block; width:100%; height:auto; }
.court-badge { position:absolute; top:10px; left:10px; display:flex; align-items:center; gap:6px; padding:5px 9px; background:rgba(255,51,85,.92); color:#fff; font-size:10.5px; font-weight:600; letter-spacing:.08em; }
.court-badge.rp { background:rgba(228,184,75,.92); color:#141208; }
.court-cam { position:absolute; bottom:10px; right:12px; font-size:10.5px; color:var(--muted); letter-spacing:.06em; }
.court-play { position:absolute; inset:0; display:grid; place-items:center; }
.play-btn { width:58px; height:58px; border-radius:50%; background:rgba(245,242,236,.1); border:1px solid var(--line-strong); display:grid; place-items:center; backdrop-filter:blur(6px); transition:transform .18s,background .18s; }
.court:hover .play-btn { transform:scale(1.07); background:rgba(245,242,236,.18); }
.play-btn:after { content:''; border-left:14px solid var(--ivory); border-top:9px solid transparent; border-bottom:9px solid transparent; margin-left:4px; }

/* ---- chips ---- */
.chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; font-size:10.5px; font-weight:600; letter-spacing:.08em; border:1px solid var(--line); color:var(--muted); }
.chip.live { color:var(--live); border-color:rgba(255,51,85,.4); background:var(--live-soft); }
.chip.final { color:var(--sage); border-color:rgba(167,176,164,.3); }
.chip.sched { color:var(--gold); border-color:rgba(228,184,75,.32); }

/* ---- sections ---- */
.sec { padding:44px 0; border-bottom:1px solid var(--line); }
.sec-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
.sec-title { font-size:clamp(26px,6vw,38px); letter-spacing:-.01em; }
.sec-note { font-size:12.5px; color:var(--muted); margin-top:6px; }
.sec-link { font-size:12.5px; color:var(--gold); white-space:nowrap; border-bottom:1px solid rgba(228,184,75,.4); padding-bottom:2px; }

/* ---- fixture strip ---- */
.fixtures { display:grid; gap:10px; }
.fx { display:grid; grid-template-columns:52px 1fr; border:1px solid var(--line); background:var(--panel); text-align:left; width:100%; transition:border-color .15s,background .15s; }
.fx:hover { border-color:var(--line-strong); background:var(--panel2); }
.fx.is-live { border-left:2px solid var(--live); }
.fx-court { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; border-right:1px solid var(--line); padding:14px 0; }
.fx-court b { font-family:'Barlow Condensed',sans-serif; font-size:26px; line-height:1; }
.fx-court span { font-size:9.5px; color:var(--muted); letter-spacing:.08em; }
.fx-body { padding:12px 14px; display:grid; gap:10px; }
.fx-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:11.5px; color:var(--muted); }
.fx-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:12px; }
.fx-side { display:flex; align-items:center; gap:10px; min-width:0; }
.fx-side.lost { opacity:.55; }
.fx-bar { width:3px; height:26px; flex:none; }
.fx-team { font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:600; line-height:1.05; }
.fx-players { font-size:11.5px; color:var(--muted); line-height:1.3; }
.fx-sets { display:flex; gap:4px; }
.fx-sets b { min-width:26px; text-align:center; font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; padding:1px 0; }
.fx-sets b.cur { color:var(--live); }
.fx-sets b.won { color:var(--gold); }
.fx-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; padding-top:9px; border-top:1px solid var(--line); font-size:12px; }
.fx-cta { color:var(--gold); font-weight:500; }
.fx-cta.livec { color:var(--live); }

/* ---- table ---- */
.tbl { width:100%; border-collapse:collapse; font-size:14px; }
.tbl th { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:13px; letter-spacing:.1em; color:var(--muted); text-align:right; padding:0 0 10px; border-bottom:1px solid var(--line); }
.tbl th:nth-child(1),.tbl th:nth-child(2) { text-align:left; }
.tbl td { padding:12px 0; border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; }
.tbl td:nth-child(1),.tbl td:nth-child(2) { text-align:left; }
.tbl tr:hover td { background:rgba(245,242,236,.03); }
.pos { font-family:'Barlow Condensed',sans-serif; font-size:19px; font-weight:700; color:var(--muted); width:34px; }
.pos.top { color:var(--gold); }
.tteam { display:flex; align-items:center; gap:10px; }
.tpts { font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:700; }
.tbl .hide-sm { display:none; }

/* ---- grids ---- */
.grid { display:grid; gap:10px; }
.g2 { grid-template-columns:1fr; }
.g3 { grid-template-columns:repeat(2,1fr); }
.card { border:1px solid var(--line); background:var(--panel); padding:16px; text-align:left; width:100%; transition:border-color .15s,background .15s; }
.card:hover { border-color:var(--line-strong); background:var(--panel2); }

.team-card { display:grid; gap:12px; }
.team-top { display:flex; align-items:center; gap:12px; }
.crest { width:42px; height:42px; flex:none; display:grid; place-items:center; border:1px solid var(--line-strong); font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:16px; letter-spacing:.04em; }
.team-name { font-family:'Barlow Condensed',sans-serif; font-size:21px; font-weight:600; line-height:1.05; }
.team-city { font-size:11.5px; color:var(--muted); }
.team-stats { display:flex; gap:16px; font-size:12px; color:var(--muted); border-top:1px solid var(--line); padding-top:11px; }
.team-stats b { font-family:'Barlow Condensed',sans-serif; font-size:17px; color:var(--ivory); display:block; font-weight:700; }

.p-card { display:flex; align-items:center; gap:12px; }
.avatar { width:40px; height:40px; flex:none; display:grid; place-items:center; border:1px solid var(--line); font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:14px; background:var(--panel2); }
.p-name { font-family:'Barlow Condensed',sans-serif; font-size:18px; font-weight:600; line-height:1.1; }
.p-meta { font-size:11.5px; color:var(--muted); }
.p-wr { margin-left:auto; text-align:right; }
.p-wr b { font-family:'Barlow Condensed',sans-serif; font-size:19px; font-weight:700; color:var(--gold); }
.p-wr span { display:block; font-size:10px; color:var(--muted); letter-spacing:.05em; }

/* ---- filters ---- */
.filters { display:grid; gap:12px; margin-bottom:22px; padding:14px; border:1px solid var(--line); background:var(--panel); }
.frow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.flabel { font-size:11px; color:var(--muted); letter-spacing:.1em; min-width:74px; }
.fbtn { padding:6px 11px; border:1px solid var(--line); font-size:12.5px; color:var(--muted); transition:.15s; }
.fbtn:hover { color:var(--ivory); border-color:var(--line-strong); }
.fbtn.on { background:var(--ivory); color:#0B0B0C; border-color:var(--ivory); font-weight:600; }
.fclear { margin-left:auto; font-size:12px; color:var(--gold); }

/* ---- match page ---- */
.mp-head { padding:26px 0 20px; border-bottom:1px solid var(--line); }
.back { font-size:12.5px; color:var(--muted); margin-bottom:16px; display:inline-block; }
.back:hover { color:var(--ivory); }
.mp-title { font-size:clamp(30px,8vw,54px); }
.mp-meta { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:12px; font-size:12.5px; color:var(--muted); }
.score-board { display:grid; gap:0; border:1px solid var(--line); background:var(--panel); margin:24px 0; }
.sb-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:14px; padding:16px 16px; }
.sb-row + .sb-row { border-top:1px solid var(--line); }
.sb-team { display:flex; align-items:center; gap:12px; min-width:0; }
.sb-name { font-family:'Barlow Condensed',sans-serif; font-size:clamp(22px,6vw,32px); font-weight:700; line-height:1; }
.sb-players { font-size:12px; color:var(--muted); margin-top:4px; }
.sb-players a:hover { color:var(--ivory); text-decoration:underline; }
.sb-sets { display:flex; gap:6px; }
.sb-sets b { min-width:38px; text-align:center; font-family:'Barlow Condensed',sans-serif; font-size:clamp(28px,8vw,42px); font-weight:700; font-variant-numeric:tabular-nums; color:var(--muted); }
.sb-sets b.won { color:var(--ivory); }
.sb-sets b.cur { color:var(--live); }
.sb-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 16px; border-top:1px solid var(--line); background:var(--panel2); font-size:12px; color:var(--muted); }

.sub { font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:600; letter-spacing:.02em; margin-bottom:14px; display:flex; align-items:center; gap:9px; }
.blk { padding:26px 0; border-bottom:1px solid var(--line); }

.clips { display:grid; gap:10px; grid-template-columns:1fr; }
.clip { border:1px solid var(--line); background:var(--panel); text-align:left; transition:border-color .15s; }
.clip:hover { border-color:var(--line-strong); }
.clip-b { padding:11px 13px; }
.clip-t { font-size:13.5px; font-weight:500; }
.clip-m { font-size:11.5px; color:var(--muted); margin-top:3px; }

.stats { display:grid; gap:0; border:1px solid var(--line); background:var(--panel); }
.st { display:grid; grid-template-columns:44px 1fr 44px; align-items:center; gap:12px; padding:11px 14px; }
.st + .st { border-top:1px solid var(--line); }
.st-v { font-family:'Barlow Condensed',sans-serif; font-size:19px; font-weight:700; font-variant-numeric:tabular-nums; }
.st-v.r { text-align:right; }
.st-l { text-align:center; font-size:11.5px; color:var(--muted); letter-spacing:.04em; }
.st-bar { grid-column:1/-1; height:2px; background:var(--panel2); display:flex; }
.st-bar i { display:block; height:100%; }

.pathpill { display:flex; align-items:center; gap:9px; padding:8px 11px; border:1px solid var(--line); background:var(--panel); font-size:11.5px; color:var(--muted); overflow:hidden; }
.pathpill code { font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pathpill button { color:var(--gold); white-space:nowrap; font-size:11.5px; }

.hero-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--line); border:1px solid var(--line); margin-top:20px; }
.hs { background:var(--panel); padding:14px; }
.hs b { display:block; font-family:'Barlow Condensed',sans-serif; font-size:30px; font-weight:700; line-height:1; }
.hs span { font-size:11px; color:var(--muted); letter-spacing:.06em; }

.empty { padding:34px 16px; text-align:center; border:1px dashed var(--line-strong); color:var(--muted); font-size:14px; }
.empty b { display:block; color:var(--ivory); font-family:'Barlow Condensed',sans-serif; font-size:20px; margin-bottom:6px; font-weight:600; }

/* ---- marcas ---- */
.venue-badge { display:inline-flex; align-items:center; gap:10px; padding:7px 11px; border:1px solid var(--line); background:var(--panel); }
.venue-badge > span { font-size:10.5px; color:var(--muted); letter-spacing:.08em; white-space:nowrap; }
.venue-alt { font-family:'Barlow Condensed',sans-serif; font-size:17px; font-weight:600; color:var(--ivory)!important; letter-spacing:.04em; }
.nav-somos { display:none; padding-right:14px; margin-right:2px; border-right:1px solid var(--line); }
.lockup { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
.lockup i { font-style:normal; font-family:'Barlow Condensed',sans-serif; font-size:20px; color:var(--muted); }
.lockup .legends-word { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:clamp(20px,5vw,28px); letter-spacing:.06em; color:var(--gold); line-height:1; }

/* ---- publicidad ---- */
.ad { position:relative; display:flex; align-items:center; justify-content:center; padding:22px 16px; border:1px solid var(--line); background:var(--panel); text-align:center; transition:border-color .15s; }
.ad:hover { border-color:var(--line-strong); }
.ad-empty { border-style:dashed; }
.ad-leaderboard { min-height:104px; }
.ad-banner { min-height:92px; }
.ad-billboard { min-height:230px; }
.ad-court { min-height:74px; border-top:0; }
.ad-tag { position:absolute; top:7px; left:10px; font-size:9px; letter-spacing:.14em; color:var(--muted); }
.ad-size { position:absolute; bottom:7px; right:10px; font-size:9px; letter-spacing:.06em; color:var(--muted); }
.ad-fallback b { display:block; font-family:'Barlow Condensed',sans-serif; font-size:clamp(20px,5vw,26px); font-weight:700; letter-spacing:.04em; line-height:1.05; }
.ad-fallback > span { display:block; margin-top:5px; font-size:12px; color:var(--muted); }
.ad-empty .ad-fallback b { color:var(--muted); }
.ad-img { max-width:100%; max-height:200px; height:auto; display:block; }
.rail { border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:18px 0; margin-top:26px; }
.rail-h { display:block; font-size:10.5px; letter-spacing:.14em; color:var(--muted); margin-bottom:12px; }
.rail-list { display:flex; flex-wrap:wrap; gap:8px; }
.rail-item { padding:8px 13px; border:1px solid var(--line); font-family:'Barlow Condensed',sans-serif; font-size:16px; font-weight:600; letter-spacing:.03em; }
.rail-free { color:var(--muted)!important; border-style:dashed; }

/* ---- footer ---- */
.foot { padding:44px 0 96px; }
.foot-brands { display:flex; flex-wrap:wrap; align-items:center; gap:10px; font-family:'Barlow Condensed',sans-serif; font-size:clamp(18px,5vw,26px); letter-spacing:.06em; font-weight:600; }
.foot-brands i { color:var(--muted); font-style:normal; }
.foot-brands .g { color:var(--gold); }
.foot-brands .s { color:var(--sage); }
.foot-note { margin-top:16px; font-size:12.5px; color:var(--muted); max-width:60ch; }
.foot-links { display:flex; flex-wrap:wrap; gap:16px; margin-top:20px; font-size:12.5px; color:var(--muted); }
.foot-links a:hover { color:var(--ivory); }

/* ---- bottom nav (mobile) ---- */
.bnav { position:fixed; left:0; right:0; bottom:0; z-index:50; display:grid; grid-template-columns:repeat(5,1fr); background:rgba(5,5,6,.94); backdrop-filter:blur(14px); border-top:1px solid var(--line); }
.bnav button { padding:9px 2px 11px; display:grid; justify-items:center; gap:4px; font-size:10px; color:var(--muted); letter-spacing:.02em; }
.bnav button.on { color:var(--ivory); }
.bnav button.on .bi { border-color:var(--gold); color:var(--gold); }
.bi { width:20px; height:20px; display:grid; place-items:center; border:1px solid var(--line); font-family:'Barlow Condensed',sans-serif; font-size:12px; font-weight:700; }

@media (min-width:760px) {
  .g2 { grid-template-columns:1fr 1fr; }
  .g3 { grid-template-columns:repeat(3,1fr); }
  .clips { grid-template-columns:repeat(3,1fr); }
  .fx { grid-template-columns:64px 1fr; }
  .tbl .hide-sm { display:table-cell; }
  .hero-stats { grid-template-columns:repeat(4,1fr); }
}
@media (min-width:1000px) {
  .lg { font-size:15.5px; }
  .nav-links { display:flex; }
  .nav-somos { display:block; }
  .burger { display:none; }
  .hero { padding:70px 0 52px; }
  .hero-grid { grid-template-columns:1.15fr .85fr; align-items:center; }
  .bnav { display:none; }
  .foot { padding-bottom:44px; }
  .sec { padding:60px 0; }
}
@media (prefers-reduced-motion:reduce) {
  .lg *, .lg *::before, .lg *::after { animation:none !important; transition:none !important; }
}
`;

/* ============================================================================
   UTILIDADES DE VISTA
============================================================================ */

const DB = hydrate(LEAGUE);
const ORIGIN = "https://legends.picalereplay.com";

/* ----------------------------------------------------------------------------
   MARCAS
   Para usar los logotipos reales solo pon la URL del PNG (fondo transparente)
   en logoUrl. Si está vacío se dibuja la versión vectorial de respaldo.
---------------------------------------------------------------------------- */
const SOMOS_LOGO = "data:image/png;base64,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";
const SOMOS_BALL = "data:image/png;base64,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";

const BRANDS = {
  somos: { name: "Somos Pádel", logoUrl: SOMOS_LOGO },
  picale: { name: "Pícale", logoUrl: "" },
};

function SomosMark({ height = 20, tone = "var(--ivory)" }) {
  const b = BRANDS.somos;
  if (b.logoUrl) return <img src={b.logoUrl} alt={b.name} style={{ height, width: "auto", display: "block" }} />;
  return (
    <svg viewBox="0 0 214 40" style={{ height, width: "auto", display: "block" }} role="img" aria-label={b.name}>
      <g fill="none" stroke={tone} strokeWidth="2.4">
        <ellipse cx="17" cy="15.5" rx="12" ry="13.5" />
        <path d="M17 29 L17 37" strokeLinecap="round" />
      </g>
      <g fill={tone} opacity=".75">
        <circle cx="12" cy="12" r="1.7" /><circle cx="22" cy="12" r="1.7" />
        <circle cx="17" cy="17" r="1.7" /><circle cx="12" cy="22" r="1.7" />
        <circle cx="22" cy="22" r="1.7" />
      </g>
      <text x="41" y="27" fill={tone} fontFamily="'Barlow Condensed',sans-serif" fontSize="25"
        fontWeight="700" letterSpacing="1.6">SOMOS</text>
      <text x="128" y="27" fill={tone} fontFamily="'Barlow Condensed',sans-serif" fontSize="25"
        fontWeight="400" letterSpacing="1.6" opacity=".72">PÁDEL</text>
    </svg>
  );
}

function PicaleMark({ height = 18, tone = "var(--sage)" }) {
  const b = BRANDS.picale;
  if (b.logoUrl) return <img src={b.logoUrl} alt={b.name} style={{ height, width: "auto", display: "block" }} />;
  return (
    <svg viewBox="0 0 128 40" style={{ height, width: "auto", display: "block" }} role="img" aria-label={b.name}>
      <g stroke={tone} strokeWidth="2.4" fill="none">
        <path d="M5 30 L14 10 L23 30" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="30" y="28" fill={tone} fontFamily="'Barlow Condensed',sans-serif" fontSize="26"
        fontWeight="700" letterSpacing="2.4">PÍCALE</text>
    </svg>
  );
}

function VenueBadge({ venue, city, compact }) {
  const isSomos = venue.id === "somos-mty";
  return (
    <span className="venue-badge">
      {isSomos ? <SomosMark height={compact ? 22 : 32} /> : (
        <span className="venue-alt">{venue.name}</span>
      )}
      {!compact && <span>Sede{city ? ` · ${city.name}` : ""}</span>}
    </span>
  );
}

const fmtDate = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
};
const fmtShort = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};
const initials = (name) => name.split(" ").slice(0, 2).map((w) => w[0]).join("");
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pairNames = (pair) => pair.map((p) => p.name).join(" / ");

/* ============================================================================
   COMPONENTES BASE
============================================================================ */


/* ----------------------------------------------------------------------------
   PUBLICIDAD
   Inventario de la liga. Cada patrocinador puede tener imagen propia:
   pon la URL en imageUrl y el espacio la usa en lugar del texto.
   Los espacios muestran su medida para poder venderlos como inventario.
---------------------------------------------------------------------------- */
const SPONSORS = [
  { id: "atr", name: "ATR Smart Buildings", line: "Automatización y control para clubes deportivos", color: "#7FA7C4", imageUrl: "", url: "#" },
  { id: "shop", name: "Somos Pádel Shop", line: "Palas, grips y bolas dentro del club", color: "#D8E23F", imageUrl: "", url: "#" },
  { id: "nutri", name: "Nutrisport MTY", line: "Hidratación oficial de la liga", color: "#6FB5A8", imageUrl: "", url: "#" },
  { id: "vertice", name: "Clínica Vértice", line: "Fisioterapia y recuperación deportiva", color: "#A98BC4", imageUrl: "", url: "#" },
  { id: "autonorte", name: "Auto Norte", line: "Patrocinador del MVP de la jornada", color: "#D98A5B", imageUrl: "", url: "#" },
];

const AD_SIZES = {
  leaderboard: "970 × 90",
  banner: "728 × 90",
  billboard: "300 × 250",
  court: "valla virtual · 1280 × 120",
};

function AdSlot({ format = "leaderboard", sponsor, note, empty }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (sponsor || empty) return;
    const t = setInterval(() => setI((x) => x + 1), 8000);
    return () => clearInterval(t);
  }, [sponsor, empty]);

  if (empty) {
    return (
      <div className={`ad ad-${format} ad-empty`}>
        <span className="ad-tag">Espacio publicitario</span>
        <span className="ad-fallback"><b>Disponible</b><span>{note || "Escríbenos para reservarlo"}</span></span>
        <span className="ad-size">{AD_SIZES[format]}</span>
      </div>
    );
  }
  const s = sponsor ? SPONSORS.find((x) => x.id === sponsor) || SPONSORS[0] : SPONSORS[i % SPONSORS.length];
  return (
    <a className={`ad ad-${format}`} href={s.url} onClick={(e) => e.preventDefault()}>
      <span className="ad-tag">Publicidad</span>
      {s.imageUrl
        ? <img className="ad-img" src={s.imageUrl} alt={s.name} />
        : <span className="ad-fallback"><b style={{ color: s.color }}>{s.name}</b><span>{s.line}</span></span>}
      <span className="ad-size">{note || AD_SIZES[format]}</span>
    </a>
  );
}

function SponsorRail() {
  return (
    <div className="rail">
      <span className="rail-h">Patrocinadores de la temporada</span>
      <div className="rail-list">
        {SPONSORS.map((s) => (
          <span className="rail-item" key={s.id} style={{ borderColor: s.color + "55", color: s.color }}>{s.name}</span>
        ))}
        <span className="rail-item rail-free">Tu marca aquí</span>
      </div>
    </div>
  );
}

function CourtFrame({ ratio = 16 / 9 }) {
  const h = Math.round(1000 / ratio);
  return (
    <svg viewBox={`0 0 1000 ${h}`} aria-hidden="true">
      <rect width="1000" height={h} fill="#08080A" />
      <g stroke="rgba(245,242,236,.16)" fill="none" strokeWidth="2">
        <path d={`M170 ${h - 40} L830 ${h - 40} L700 ${h * 0.34} L300 ${h * 0.34} Z`} />
        <path d={`M225 ${h * 0.68} L775 ${h * 0.68}`} />
        <path d={`M500 ${h - 40} L500 ${h * 0.68}`} />
        <path d={`M262 ${h * 0.52} L738 ${h * 0.52}`} />
      </g>
      <g stroke="rgba(228,184,75,.5)" strokeWidth="2">
        <path d={`M205 ${h * 0.52} L795 ${h * 0.52}`} />
      </g>
      <g fill="rgba(245,242,236,.07)">
        <circle cx="395" cy={h * 0.62} r="9" />
        <circle cx="612" cy={h * 0.58} r="9" />
        <circle cx="430" cy={h * 0.44} r="7" />
        <circle cx="585" cy={h * 0.43} r="7" />
      </g>
    </svg>
  );
}

function VideoSurface({ match, kind, onOpen }) {
  const live = kind === "live";
  return (
    <div className="court" role="img" aria-label={live ? "Transmisión en vivo" : "Replay del partido"}>
      <CourtFrame />
      <span className={`court-badge${live ? "" : " rp"}`}>
        {live && <i className="dot" style={{ background: "#fff" }} />} {live ? "EN VIVO" : "REPLAY"}
      </span>
      <span className="court-cam">Cancha {match.court} · cámara Pícale</span>
      {onOpen && (
        <button className="court-play" onClick={onOpen} aria-label={live ? "Ver en vivo" : "Ver replay"}>
          <span className="play-btn" />
        </button>
      )}
    </div>
  );
}

function StatusChip({ m, elapsed }) {
  if (m.status === "live")
    return (
      <span className="chip live">
        <i className="dot" /> EN VIVO {elapsed != null ? `· ${clock(elapsed)}` : ""}
      </span>
    );
  if (m.status === "final") return <span className="chip final">FINALIZADO</span>;
  return <span className="chip sched">{m.time} h</span>;
}

function SetsRow({ m, side, size = "sm" }) {
  const sets = m.sets;
  return (
    <div className={size === "sm" ? "fx-sets" : "sb-sets"}>
      {sets.length === 0 && <b style={{ color: "var(--muted)" }}>–</b>}
      {sets.map(([a, b], i) => {
        const mine = side === "A" ? a : b;
        const other = side === "A" ? b : a;
        const closed = isSetClosed(a, b) || isSetClosed(b, a);
        const isCurrent = m.status === "live" && i === sets.length - 1 && !closed;
        const won = closed && mine > other;
        return (
          <b key={i} className={isCurrent ? "cur" : won ? "won" : ""}>
            {mine}
          </b>
        );
      })}
    </div>
  );
}

function Fixture({ m, go, elapsed }) {
  const lostA = m.status === "final" && m.winner.id !== m.teamA.id;
  const lostB = m.status === "final" && m.winner.id !== m.teamB.id;
  return (
    <div className={`fx${m.status === "live" ? " is-live" : ""}`}>
      <div className="fx-court">
        <b className="lg-num">{m.court}</b>
        <span>CANCHA</span>
      </div>
      <div className="fx-body">
        <div className="fx-meta">
          <StatusChip m={m} elapsed={elapsed} />
          <span>Jornada {m.matchday.number}</span>
          <span>·</span>
          <span>{m.venue.name}, {m.city.name}</span>
          <span>·</span>
          <span>{fmtShort(m.date)}</span>
        </div>

        <button className="fx-row" onClick={() => go(`/legends/match/${m.slug}`)} style={{ textAlign: "left" }}>
          <div className={`fx-side${lostA ? " lost" : ""}`}>
            <i className="fx-bar" style={{ background: m.teamA.color }} />
            <div style={{ minWidth: 0 }}>
              <div className="fx-team">{m.teamA.name}</div>
              <div className="fx-players">{pairNames(m.pairA)}</div>
            </div>
          </div>
          <SetsRow m={m} side="A" />
        </button>

        <button className="fx-row" onClick={() => go(`/legends/match/${m.slug}`)} style={{ textAlign: "left" }}>
          <div className={`fx-side${lostB ? " lost" : ""}`}>
            <i className="fx-bar" style={{ background: m.teamB.color }} />
            <div style={{ minWidth: 0 }}>
              <div className="fx-team">{m.teamB.name}</div>
              <div className="fx-players">{pairNames(m.pairB)}</div>
            </div>
          </div>
          <SetsRow m={m} side="B" />
        </button>

        <div className="fx-foot">
          <span style={{ color: "var(--muted)" }}>
            {m.status === "scheduled" ? `Empieza a las ${m.time} h` : `${m.setsA}–${m.setsB} en sets`}
          </span>
          <button className={`fx-cta${m.status === "live" ? " livec" : ""}`} onClick={() => go(`/legends/match/${m.slug}`)}>
            {m.status === "live" ? "Ver transmisión →" : m.status === "final" ? "Ver replay →" : "Ver partido →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ t, row, go }) {
  return (
    <button className="card team-card" onClick={() => go(`/legends/team/${t.slug}`)}>
      <div className="team-top">
        <span className="crest" style={{ color: t.color, borderColor: t.color + "66" }}>{t.short}</span>
        <div>
          <div className="team-name">{t.name}</div>
          <div className="team-city">{t.city}</div>
        </div>
      </div>
      <div className="team-stats">
        <div><b>{row.pj}</b>Jugados</div>
        <div><b>{row.pg}</b>Ganados</div>
        <div><b>{row.pp}</b>Perdidos</div>
        <div><b style={{ color: "var(--gold)" }}>{row.pts}</b>Puntos</div>
      </div>
    </button>
  );
}

function PlayerCard({ p, go }) {
  const rec = playerRecord(DB, p);
  return (
    <button className="card p-card" onClick={() => go(`/legends/player/${p.slug}`)}>
      <span className="avatar" style={{ color: p.team.color }}>{initials(p.name)}</span>
      <div style={{ minWidth: 0 }}>
        <div className="p-name">{p.name}</div>
        <div className="p-meta">{p.team.name} · {p.side}</div>
      </div>
      <div className="p-wr">
        <b>{rec.winRate}%</b>
        <span>{rec.wins}G · {rec.losses}P</span>
      </div>
    </button>
  );
}

function PathPill({ path }) {
  const [copied, setCopied] = useState(false);
  const url = ORIGIN + path;
  const copy = () => {
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setCopied(false);
    }
  };
  return (
    <div className="pathpill">
      <code>{url}</code>
      <button onClick={copy}>{copied ? "Copiado" : "Copiar liga"}</button>
    </div>
  );
}

function Filters({ groups, onClear }) {
  return (
    <div className="filters">
      {groups.map((g) => (
        <div className="frow" key={g.label}>
          <span className="flabel">{g.label}</span>
          {g.options.map((o) => (
            <button key={o.value} className={`fbtn${g.value === o.value ? " on" : ""}`} onClick={() => g.onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      ))}
      <div className="frow">
        <button className="fclear" onClick={onClear}>Limpiar filtros</button>
      </div>
    </div>
  );
}

/* ============================================================================
   PÁGINAS
============================================================================ */

function Home({ go, elapsed }) {
  const liveMatches = DB.matches.filter((m) => m.status === "live");
  const next = DB.matchdays[DB.matchdays.length - 1];
  const nextVenue = byId(DB.venues, next.venueId);
  const nextCity = byId(DB.cities, nextVenue.cityId);
  const dayMatches = DB.matches.filter((m) => m.matchdayId === next.id);
  const results = DB.matches.filter((m) => m.status === "final").slice(-3).reverse();
  const table = standings(DB);
  const featured = liveMatches[0];

  return (
    <>
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="hero-kicker reveal">{DB.season.name}</div>
            <h1 className="hero-title reveal reveal-2">
              THE<br />
              <span className="l2">LEGENDS</span>
            </h1>
            <div className="hero-sub reveal reveal-3">PADEL TEAMS LEAGUE</div>
            <p className="hero-lede reveal reveal-3">
              La liga de equipos donde cada partido cuenta. Seis equipos, cuatro jornadas y
              todas las canchas transmitidas en vivo.
            </p>
            <div className="cta-row reveal reveal-3">
              <button className="btn btn-live" onClick={() => go("/legends/live")}>
                <i className="dot" style={{ background: "#fff" }} /> Ver en vivo
              </button>
              <button className="btn" onClick={() => go(`/legends/matchday/${next.id}`)}>Ver próxima jornada</button>
            </div>
            <div className="hero-brands reveal reveal-3">
              <SomosMark height={30} /><span>×</span>
              <b>THE LEGENDS</b><span>×</span>
              <PicaleMark height={15} />
            </div>
          </div>

          <div className="monitor reveal reveal-3">
            <div className="monitor-top">
              <span className="monitor-live">
                {liveMatches.length ? <><i className="dot" /> {liveMatches.length} partidos en vivo</> : "Sin transmisión activa"}
              </span>
              {(featured ? featured.venue.id : nextVenue.id) === "somos-mty"
                ? <SomosMark height={20} />
                : <span>{nextVenue.name}</span>}
            </div>
            {featured ? (
              <>
                <VideoSurface match={featured} kind="live" onOpen={() => go(`/legends/match/${featured.slug}`)} />
                <div className="monitor-body">
                  <div className="fx-row" style={{ marginBottom: 8 }}>
                    <div className="fx-side">
                      <i className="fx-bar" style={{ background: featured.teamA.color }} />
                      <div>
                        <div className="fx-team">{featured.teamA.short}</div>
                        <div className="fx-players">{pairNames(featured.pairA)}</div>
                      </div>
                    </div>
                    <SetsRow m={featured} side="A" />
                  </div>
                  <div className="fx-row">
                    <div className="fx-side">
                      <i className="fx-bar" style={{ background: featured.teamB.color }} />
                      <div>
                        <div className="fx-team">{featured.teamB.short}</div>
                        <div className="fx-players">{pairNames(featured.pairB)}</div>
                      </div>
                    </div>
                    <SetsRow m={featured} side="B" />
                  </div>
                  <button className="btn btn-live btn-sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                    onClick={() => go(`/legends/match/${featured.slug}`)}>
                    Ver cancha {featured.court}
                  </button>
                </div>
              </>
            ) : (
              <div className="monitor-empty">No hay partidos en vivo en este momento.</div>
            )}
          </div>
        </div>
      </header>

      <div className="wrap" style={{ paddingTop: 22 }}><AdSlot format="leaderboard" /></div>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Próxima jornada</h2>
              <p className="sec-note">Jornada {next.number} · {fmtDate(next.date)} · desde las {dayMatches[0].time} h</p>
              <div style={{ marginTop: 12 }}><VenueBadge venue={nextVenue} city={nextCity} /></div>
            </div>
            <button className="sec-link" onClick={() => go("/legends/matchdays")}>Todas las jornadas</button>
          </div>
          <div className="fixtures">
            {dayMatches.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
          </div>
          <div style={{ marginTop: 14 }}><AdSlot format="banner" sponsor="shop" note="jornada presentada por" /></div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Últimos resultados</h2>
              <p className="sec-note">Cada partido finalizado queda grabado con su replay y sus mejores puntos.</p>
            </div>
            <button className="sec-link" onClick={() => go("/legends/results")}>Ver todos</button>
          </div>
          <div className="fixtures">
            {results.map((m) => <Fixture key={m.id} m={m} go={go} />)}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Clasificación</h2>
              <p className="sec-note">Tres puntos por victoria. Desempate por diferencia de sets.</p>
            </div>
            <button className="sec-link" onClick={() => go("/legends/standings")}>Tabla completa</button>
          </div>
          <StandingsTable rows={table.slice(0, 4)} go={go} compact />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div><h2 className="sec-title">Equipos</h2></div>
            <button className="sec-link" onClick={() => go("/legends/teams")}>Ver los seis</button>
          </div>
          <div className="grid g3">
            {DB.teams.slice(0, 3).map((t) => (
              <TeamCard key={t.id} t={t} row={table.find((r) => r.team.id === t.id)} go={go} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Jugadores en forma</h2>
              <p className="sec-note">Ordenados por porcentaje de victorias en la temporada.</p>
            </div>
            <button className="sec-link" onClick={() => go("/legends/players")}>Todos los jugadores</button>
          </div>
          <div className="grid g3">
            {[...DB.players]
              .map((p) => ({ p, r: playerRecord(DB, p) }))
              .filter((x) => x.r.played > 0)
              .sort((a, b) => b.r.winRate - a.r.winRate || b.r.wins - a.r.wins)
              .slice(0, 6)
              .map(({ p }) => <PlayerCard key={p.id} p={p} go={go} />)}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Replays y mejores puntos</h2>
              <p className="sec-note">Generados automáticamente por Pícale al terminar cada punto.</p>
            </div>
          </div>
          <div className="clips">
            {DB.matches.filter((m) => m.clips.length).slice(-3).flatMap((m) => m.clips.slice(0, 1).map((c) => (
              <button className="clip" key={c.id} onClick={() => go(`/legends/match/${m.slug}`)}>
                <div style={{ position: "relative" }}>
                  <CourtFrame ratio={16 / 9} />
                  <span className="court-cam">0:{String(c.seconds).padStart(2, "0")}</span>
                </div>
                <div className="clip-b">
                  <div className="clip-t">{c.title}</div>
                  <div className="clip-m">Jornada {m.matchday.number} · Cancha {m.court} · {c.minute}</div>
                </div>
              </button>
            )))}
          </div>
        </div>
      </section>
    </>
  );
}

function LivePage({ go, elapsed }) {
  const live = DB.matches.filter((m) => m.status === "live");
  const upcoming = DB.matches.filter((m) => m.status === "scheduled");
  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">En vivo</h1>
        <div className="mp-meta">
          {live.length ? <><i className="dot" /> {live.length} canchas transmitiendo ahora</> : "Sin transmisión activa"}
          <span>·</span><span>Transmisión y tecnología por</span><PicaleMark height={14} />
        </div>
        {live.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <VenueBadge venue={live[0].venue} city={live[0].city} />
          </div>
        )}
      </div>

      <div className="blk">
        {live.length ? (
          <div className="grid g2">
            {live.map((m) => (
              <div className="card" key={m.id} style={{ padding: 0 }}>
                <VideoSurface match={m} kind="live" onOpen={() => go(`/legends/match/${m.slug}`)} />
                <AdSlot format="court" />
                <div style={{ padding: 16 }}>
                  <div className="fx-meta" style={{ marginBottom: 12 }}>
                    <StatusChip m={m} elapsed={elapsed[m.id]} />
                    <span>Cancha {m.court}</span><span>·</span><span>{m.venue.name}</span>
                  </div>
                  <div className="fx-row" style={{ marginBottom: 8 }}>
                    <div className="fx-side">
                      <i className="fx-bar" style={{ background: m.teamA.color }} />
                      <div><div className="fx-team">{m.teamA.name}</div><div className="fx-players">{pairNames(m.pairA)}</div></div>
                    </div>
                    <SetsRow m={m} side="A" />
                  </div>
                  <div className="fx-row">
                    <div className="fx-side">
                      <i className="fx-bar" style={{ background: m.teamB.color }} />
                      <div><div className="fx-team">{m.teamB.name}</div><div className="fx-players">{pairNames(m.pairB)}</div></div>
                    </div>
                    <SetsRow m={m} side="B" />
                  </div>
                  <button className="btn btn-live btn-sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                    onClick={() => go(`/legends/match/${m.slug}`)}>Ver transmisión</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <b>No hay partidos en vivo en este momento.</b>
            El siguiente arranca en unas horas.
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="blk">
          <h3 className="sub">Siguiente en cancha</h3>
          <div className="fixtures">
            {upcoming.map((m) => <Fixture key={m.id} m={m} go={go} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchesPage({ go, elapsed, initialStatus = "all", title = "Partidos", note }) {
  const [jornada, setJornada] = useState("all");
  const [ciudad, setCiudad] = useState("all");
  const [equipo, setEquipo] = useState("all");
  const [estado, setEstado] = useState(initialStatus);

  const clear = () => { setJornada("all"); setCiudad("all"); setEquipo("all"); setEstado(initialStatus); };

  const list = DB.matches.filter((m) => {
    if (jornada !== "all" && m.matchdayId !== jornada) return false;
    if (ciudad !== "all" && m.city.id !== ciudad) return false;
    if (equipo !== "all" && m.teamA.id !== equipo && m.teamB.id !== equipo) return false;
    if (estado !== "all" && m.status !== estado) return false;
    return true;
  });

  const groups = [
    {
      label: "JORNADA", value: jornada, onChange: setJornada,
      options: [{ value: "all", label: "Todas" }, ...DB.matchdays.map((d) => ({ value: d.id, label: `J${d.number}` }))],
    },
    {
      label: "CIUDAD", value: ciudad, onChange: setCiudad,
      options: [{ value: "all", label: "Todas" },
      ...DB.cities.filter((c) => DB.matches.some((m) => m.city.id === c.id)).map((c) => ({ value: c.id, label: c.name }))],
    },
    {
      label: "EQUIPO", value: equipo, onChange: setEquipo,
      options: [{ value: "all", label: "Todos" }, ...DB.teams.map((t) => ({ value: t.id, label: t.short }))],
    },
    {
      label: "ESTADO", value: estado, onChange: setEstado,
      options: [
        { value: "all", label: "Todos" },
        { value: "live", label: "En vivo" },
        { value: "final", label: "Finalizados" },
        { value: "scheduled", label: "Programados" },
      ],
    },
  ];

  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">{title}</h1>
        <div className="mp-meta">{note || `${DB.matches.length} partidos en la temporada`}</div>
      </div>
      <div className="blk">
        <Filters groups={groups} onClear={clear} />
        <div style={{ marginBottom: 18 }}><AdSlot format="banner" /></div>
        {list.length ? (
          <div className="fixtures">
            {list.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
          </div>
        ) : (
          <div className="empty"><b>Ningún partido con esos filtros.</b>Quita alguno para ver más resultados.</div>
        )}
      </div>
    </div>
  );
}

function MatchdaysPage({ go, elapsed }) {
  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">Jornadas</h1>
        <div className="mp-meta">{DB.season.name} · {DB.matchdays.length} jornadas</div>
      </div>
      {DB.matchdays.slice().reverse().map((d) => {
        const venue = byId(DB.venues, d.venueId);
        const city = byId(DB.cities, venue.cityId);
        const ms = DB.matches.filter((m) => m.matchdayId === d.id);
        return (
          <div className="blk" key={d.id}>
            <div className="sec-head">
              <div>
                <h3 className="sub" style={{ marginBottom: 4 }}>Jornada {d.number}</h3>
                <p className="sec-note">{venue.name}, {city.name} · {fmtDate(d.date)}</p>
              </div>
              <button className="sec-link" onClick={() => go(`/legends/matchday/${d.id}`)}>Abrir jornada</button>
            </div>
            <div className="fixtures">
              {ms.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchdayPage({ id, go, elapsed }) {
  const d = byId(DB.matchdays, id);
  if (!d) return <NotFound go={go} />;
  const venue = byId(DB.venues, d.venueId);
  const city = byId(DB.cities, venue.cityId);
  const ms = DB.matches.filter((m) => m.matchdayId === d.id);
  return (
    <div className="wrap">
      <div className="mp-head">
        <button className="back" onClick={() => go("/legends/matchdays")}>← Jornadas</button>
        <h1 className="mp-title">Jornada {d.number}</h1>
        <div className="mp-meta">
          <span>📅 {fmtDate(d.date)}</span><span>·</span>
          <span>⏰ desde las {ms[0].time} h</span><span>·</span>
          <span>{ms.length} canchas</span>
        </div>
        <div style={{ marginTop: 14 }}><VenueBadge venue={venue} city={city} /></div>
      </div>
      <div className="blk">
        <div className="fixtures">
          {ms.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
        </div>
        <PathPill path={`/legends/matchday/${d.id}`} />
      </div>
    </div>
  );
}

function MatchPage({ slug, go, elapsed }) {
  const m = DB.matches.find((x) => x.slug === slug);
  if (!m) return <NotFound go={go} />;
  const live = m.status === "live";
  const s = m.stats;

  return (
    <div className="wrap">
      <div className="mp-head">
        <button className="back" onClick={() => go("/legends/matches")}>← Partidos</button>
        <div className="fx-meta" style={{ marginBottom: 10 }}>
          <StatusChip m={m} elapsed={elapsed[m.id]} />
          <span>The Legends · Jornada {m.matchday.number}</span>
        </div>
        <h1 className="mp-title">{m.teamA.short} <span style={{ color: "var(--muted)" }}>vs</span> {m.teamB.short}</h1>
        <div className="mp-meta">
          <span>Cancha {m.court}</span><span>·</span>
          <span>{m.city.name}</span><span>·</span>
          <span>{fmtDate(m.date)}, {m.time} h</span>
        </div>
        <div style={{ marginTop: 14 }}><VenueBadge venue={m.venue} city={m.city} /></div>
      </div>

      <div className="score-board">
        {["A", "B"].map((side) => {
          const team = side === "A" ? m.teamA : m.teamB;
          const pair = side === "A" ? m.pairA : m.pairB;
          const lost = m.status === "final" && m.winner.id !== team.id;
          return (
            <div className="sb-row" key={side} style={{ opacity: lost ? 0.55 : 1 }}>
              <div className="sb-team">
                <span className="crest" style={{ color: team.color, borderColor: team.color + "66" }}>{team.short}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="sb-name">{team.name}</div>
                  <div className="sb-players">
                    {pair.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && " / "}
                        <a href={`${ORIGIN}/legends/player/${p.slug}`} onClick={(e) => { e.preventDefault(); go(`/legends/player/${p.slug}`); }}>
                          {p.name}
                        </a>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <SetsRow m={m} side={side} size="lg" />
            </div>
          );
        })}
        <div className="sb-foot">
          <span>{m.status === "scheduled" ? "Por jugarse" : `Sets ${m.setsA}–${m.setsB}`}</span>
          <span>{m.status === "final" ? `Ganó ${m.winner.name}` : live ? "Marcador Pícale en tiempo real" : `Empieza ${m.time} h`}</span>
        </div>
      </div>

      <AdSlot format="leaderboard" note="patrocinador del partido" />

      {m.status !== "scheduled" && (
        <div className="blk">
          <h3 className="sub">{live ? "Transmisión" : "Replay"}</h3>
          <VideoSurface match={m} kind={live ? "live" : "replay"} onOpen={() => { }} />
          <div className="fx-meta" style={{ marginTop: 10 }}>
            <span style={{ color: "var(--sage)" }}>Powered by Pícale</span><span>·</span>
            <span>{live ? m.streamUrl : m.replayUrl}</span>
          </div>
        </div>
      )}

      {m.clips.length > 0 && (
        <div className="blk">
          <h3 className="sub">Mejores puntos</h3>
          <div className="clips">
            {m.clips.map((c) => (
              <div className="clip" key={c.id}>
                <div style={{ position: "relative" }}>
                  <CourtFrame />
                  <span className="court-cam">0:{String(c.seconds).padStart(2, "0")}</span>
                  <span className="court-play"><span className="play-btn" style={{ width: 40, height: 40 }} /></span>
                </div>
                <div className="clip-b">
                  <div className="clip-t">{c.title}</div>
                  <div className="clip-m">Set {c.set} · {c.minute} · {c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {s && (
        <div className="blk">
          <h3 className="sub">Estadísticas</h3>
          <div className="stats">
            <StatRow label="Puntos ganados" a={s.points[0]} b={s.points[1]} colorA={m.teamA.color} colorB={m.teamB.color} />
            <StatRow label="Winners" a={s.winners[0]} b={s.winners[1]} colorA={m.teamA.color} colorB={m.teamB.color} />
            <StatRow label="Errores no forzados" a={s.errors[0]} b={s.errors[1]} colorA={m.teamA.color} colorB={m.teamB.color} invert />
            <StatRow label="Smashes" a={s.smashes[0]} b={s.smashes[1]} colorA={m.teamA.color} colorB={m.teamB.color} />
            <StatRow label="Breaks" a={s.breaks[0]} b={s.breaks[1]} colorA={m.teamA.color} colorB={m.teamB.color} />
            <div className="st">
              <span className="st-v">{s.firstServe[0]}</span>
              <span className="st-l">Primer saque dentro</span>
              <span className="st-v r">{s.firstServe[1]}</span>
            </div>
          </div>
          <div className="fx-meta" style={{ marginTop: 12 }}>
            <span>Duración {s.duration}</span><span>·</span>
            <span>Rally más largo {s.longestRally}</span><span>·</span>
            <span>{live ? "Datos parciales, se actualizan al cierre" : "Datos del sistema de marcador Pícale"}</span>
          </div>
        </div>
      )}

      <div className="blk">
        <h3 className="sub">Compartir partido</h3>
        <PathPill path={`/legends/match/${m.slug}`} />
      </div>
    </div>
  );
}

function StatRow({ label, a, b, colorA, colorB, invert }) {
  const total = a + b || 1;
  const pa = (a / total) * 100;
  const leadA = invert ? a < b : a > b;
  return (
    <div className="st" style={{ gridTemplateColumns: "44px 1fr 44px" }}>
      <span className="st-v" style={{ color: leadA ? colorA : "var(--muted)" }}>{a}</span>
      <span className="st-l">{label}</span>
      <span className="st-v r" style={{ color: !leadA ? colorB : "var(--muted)" }}>{b}</span>
      <span className="st-bar">
        <i style={{ width: `${pa}%`, background: colorA, opacity: 0.75 }} />
        <i style={{ width: `${100 - pa}%`, background: colorB, opacity: 0.75 }} />
      </span>
    </div>
  );
}

function StandingsTable({ rows, go, compact }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>POS</th>
          <th>EQUIPO</th>
          <th>PJ</th>
          <th>PG</th>
          <th>PP</th>
          {!compact && <th className="hide-sm">SF</th>}
          {!compact && <th className="hide-sm">SC</th>}
          <th className="hide-sm">DIF</th>
          <th>PTS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.team.id} onClick={() => go(`/legends/team/${r.team.slug}`)} style={{ cursor: "pointer" }}>
            <td className={`pos${i < 2 ? " top" : ""}`}>{i + 1}</td>
            <td>
              <span className="tteam">
                <i style={{ width: 3, height: 22, background: r.team.color, display: "block" }} />
                <span>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 600 }}>{r.team.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{r.team.city}</span>
                </span>
              </span>
            </td>
            <td>{r.pj}</td>
            <td>{r.pg}</td>
            <td>{r.pp}</td>
            {!compact && <td className="hide-sm">{r.sf}</td>}
            {!compact && <td className="hide-sm">{r.sc}</td>}
            <td className="hide-sm">{r.dif > 0 ? `+${r.dif}` : r.dif}</td>
            <td className="tpts" style={{ color: i < 2 ? "var(--gold)" : "var(--ivory)" }}>{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StandingsPage({ go }) {
  const rows = standings(DB);
  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">Clasificación</h1>
        <div className="mp-meta">
          <span>{DB.season.name}</span><span>·</span>
          <span>Tres puntos por victoria</span><span>·</span>
          <span>Desempate por diferencia de sets</span>
        </div>
      </div>
      <div className="blk">
        <AdSlot format="leaderboard" sponsor="atr" note="tabla presentada por" />
        <div style={{ marginTop: 22 }}><StandingsTable rows={rows} go={go} /></div>
      </div>
    </div>
  );
}

function TeamsPage({ go }) {
  const table = standings(DB);
  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">Equipos</h1>
        <div className="mp-meta">{DB.teams.length} equipos · {DB.players.length} jugadores</div>
      </div>
      <div className="blk">
        <div className="grid g3">
          {table.map((r) => <TeamCard key={r.team.id} t={r.team} row={r} go={go} />)}
        </div>
      </div>
    </div>
  );
}

function TeamPage({ slug, go, elapsed }) {
  const t = DB.teams.find((x) => x.slug === slug);
  if (!t) return <NotFound go={go} />;
  const row = standings(DB).find((r) => r.team.id === t.id);
  const pos = standings(DB).findIndex((r) => r.team.id === t.id) + 1;
  const ms = DB.matches.filter((m) => m.teamA.id === t.id || m.teamB.id === t.id);
  return (
    <div className="wrap">
      <div className="mp-head">
        <button className="back" onClick={() => go("/legends/teams")}>← Equipos</button>
        <div className="team-top" style={{ marginBottom: 12 }}>
          <span className="crest" style={{ width: 56, height: 56, fontSize: 20, color: t.color, borderColor: t.color + "66" }}>{t.short}</span>
          <div>
            <h1 className="mp-title" style={{ fontSize: "clamp(28px,7vw,46px)" }}>{t.name}</h1>
            <div className="mp-meta" style={{ marginTop: 6 }}><span>{t.city}</span><span>·</span><span>{pos}º de la tabla</span></div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hs"><b>{row.pj}</b><span>PARTIDOS</span></div>
          <div className="hs"><b>{row.pg}</b><span>VICTORIAS</span></div>
          <div className="hs"><b>{row.pp}</b><span>DERROTAS</span></div>
          <div className="hs"><b style={{ color: "var(--gold)" }}>{row.pts}</b><span>PUNTOS</span></div>
        </div>
      </div>

      <div className="blk">
        <h3 className="sub">Plantel</h3>
        <div className="grid g2">
          {t.players.map((p) => <PlayerCard key={p.id} p={p} go={go} />)}
        </div>
      </div>

      <div className="blk">
        <h3 className="sub">Partidos</h3>
        <div className="fixtures">
          {ms.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
        </div>
      </div>

      <div className="blk"><PathPill path={`/legends/team/${t.slug}`} /></div>
    </div>
  );
}

function PlayersPage({ go }) {
  const [equipo, setEquipo] = useState("all");
  const list = DB.players.filter((p) => equipo === "all" || p.teamId === equipo);
  return (
    <div className="wrap">
      <div className="mp-head">
        <h1 className="mp-title">Jugadores</h1>
        <div className="mp-meta">{DB.players.length} jugadores registrados en la temporada</div>
      </div>
      <div className="blk">
        <Filters
          groups={[{
            label: "EQUIPO", value: equipo, onChange: setEquipo,
            options: [{ value: "all", label: "Todos" }, ...DB.teams.map((t) => ({ value: t.id, label: t.short }))],
          }]}
          onClear={() => setEquipo("all")}
        />
        <div className="grid g2">
          {list.map((p) => <PlayerCard key={p.id} p={p} go={go} />)}
        </div>
      </div>
    </div>
  );
}

function PlayerPage({ slug, go, elapsed }) {
  const p = DB.players.find((x) => x.slug === slug);
  if (!p) return <NotFound go={go} />;
  const rec = playerRecord(DB, p);
  return (
    <div className="wrap">
      <div className="mp-head">
        <button className="back" onClick={() => go("/legends/players")}>← Jugadores</button>
        <div className="team-top" style={{ marginBottom: 12 }}>
          <span className="avatar" style={{ width: 56, height: 56, fontSize: 20, color: p.team.color }}>{initials(p.name)}</span>
          <div>
            <h1 className="mp-title" style={{ fontSize: "clamp(28px,7vw,46px)" }}>{p.name}</h1>
            <div className="mp-meta" style={{ marginTop: 6 }}>
              <button onClick={() => go(`/legends/team/${p.team.slug}`)} style={{ color: p.team.color }}>{p.team.name}</button>
              <span>·</span><span>{p.team.city}</span><span>·</span><span>{p.side}</span>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hs"><b>{rec.played}</b><span>PARTIDOS</span></div>
          <div className="hs"><b>{rec.wins}</b><span>VICTORIAS</span></div>
          <div className="hs"><b>{rec.losses}</b><span>DERROTAS</span></div>
          <div className="hs"><b style={{ color: "var(--gold)" }}>{rec.winRate}%</b><span>WIN RATE</span></div>
        </div>
      </div>

      {rec.clips.length > 0 && (
        <div className="blk">
          <h3 className="sub">Sus mejores puntos</h3>
          <div className="clips">
            {rec.clips.slice(0, 3).map((c) => (
              <button className="clip" key={c.id} onClick={() => go(`/legends/match/${c.match.slug}`)}>
                <div style={{ position: "relative" }}>
                  <CourtFrame />
                  <span className="court-cam">0:{String(c.seconds).padStart(2, "0")}</span>
                </div>
                <div className="clip-b">
                  <div className="clip-t">{c.title}</div>
                  <div className="clip-m">Jornada {c.match.matchday.number} · Cancha {c.match.court}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="blk">
        <h3 className="sub">Partidos y replays</h3>
        {rec.matches.length ? (
          <div className="fixtures">
            {rec.matches.map((m) => <Fixture key={m.id} m={m} go={go} elapsed={elapsed[m.id]} />)}
          </div>
        ) : (
          <div className="empty"><b>Todavía no juega esta temporada.</b>Aparecerá aquí en cuanto dispute su primer partido.</div>
        )}
      </div>

      <div className="blk">
        <h3 className="sub">Compartir perfil</h3>
        <PathPill path={`/legends/player/${p.slug}`} />
      </div>
    </div>
  );
}

function NotFound({ go }) {
  return (
    <div className="wrap">
      <div className="blk" style={{ paddingTop: 60 }}>
        <div className="empty">
          <b>Esa página no existe.</b>
          Vuelve al inicio para ver la jornada en curso.
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-sm" onClick={() => go("/legends")}>Ir al inicio</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   NAVEGACIÓN + APP
============================================================================ */

const NAV = [
  { label: "Inicio", path: "/legends" },
  { label: "En vivo", path: "/legends/live", live: true },
  { label: "Jornadas", path: "/legends/matchdays" },
  { label: "Partidos", path: "/legends/matches" },
  { label: "Resultados", path: "/legends/results" },
  { label: "Clasificación", path: "/legends/standings" },
  { label: "Equipos", path: "/legends/teams" },
  { label: "Jugadores", path: "/legends/players" },
];

const BNAV = [
  { label: "Inicio", icon: "L", path: "/legends" },
  { label: "En vivo", icon: "●", path: "/legends/live" },
  { label: "Partidos", icon: "VS", path: "/legends/matches" },
  { label: "Tabla", icon: "#", path: "/legends/standings" },
  { label: "Equipos", icon: "T", path: "/legends/teams" },
];

function Ticker({ go }) {
  const live = DB.matches.filter((m) => m.status === "live");
  const next = DB.matches.filter((m) => m.status === "scheduled");
  const items = [
    ...live.map((m) => ({
      key: m.id, node: (
        <>
          <b>Cancha {m.court}</b> {m.teamA.short} <span className="sc">{m.sets.map(([a]) => a).join(" ")}</span>
          {" — "}<span className="sc">{m.sets.map(([, b]) => b).join(" ")}</span> {m.teamB.short}
        </>
      ), path: `/legends/match/${m.slug}`,
    })),
    ...next.map((m) => ({
      key: m.id, node: <><b>{m.time} h</b> Cancha {m.court} · {m.teamA.short} vs {m.teamB.short}</>,
      path: `/legends/match/${m.slug}`,
    })),
  ];
  if (!items.length) return null;
  const track = [...items, ...items];
  return (
    <div className="ticker">
      <span className="ticker-head"><i className="dot" /> LIVE</span>
      <div className="ticker-track">
        {track.map((it, i) => (
          <button className="ticker-item" key={it.key + i} onClick={() => go(it.path)}>{it.node}</button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [path, setPath] = useState("/legends");
  const [menu, setMenu] = useState(false);
  const [tick, setTick] = useState(0);
  const topRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = useMemo(() => {
    const out = {};
    DB.matches.forEach((m) => { if (m.status === "live") out[m.id] = (m.elapsed || 0) + tick; });
    return out;
  }, [tick]);

  const go = (p) => {
    setPath(p);
    setMenu(false);
    if (topRef.current && topRef.current.scrollIntoView) topRef.current.scrollIntoView({ block: "start" });
  };

  const seg = path.split("/").filter(Boolean); // ["legends", ...]
  let page;
  if (seg.length === 1) page = <Home go={go} elapsed={elapsed} />;
  else if (seg[1] === "live") page = <LivePage go={go} elapsed={elapsed} />;
  else if (seg[1] === "matches") page = <MatchesPage go={go} elapsed={elapsed} />;
  else if (seg[1] === "results")
    page = <MatchesPage go={go} elapsed={elapsed} initialStatus="final" title="Resultados"
      note="Todos los partidos cerrados de la temporada, con replay y mejores puntos." />;
  else if (seg[1] === "matchdays") page = <MatchdaysPage go={go} elapsed={elapsed} />;
  else if (seg[1] === "matchday") page = <MatchdayPage id={seg[2]} go={go} elapsed={elapsed} />;
  else if (seg[1] === "match") page = <MatchPage slug={seg[2]} go={go} elapsed={elapsed} />;
  else if (seg[1] === "standings") page = <StandingsPage go={go} />;
  else if (seg[1] === "teams") page = <TeamsPage go={go} />;
  else if (seg[1] === "team") page = <TeamPage slug={seg[2]} go={go} elapsed={elapsed} />;
  else if (seg[1] === "players") page = <PlayersPage go={go} />;
  else if (seg[1] === "player") page = <PlayerPage slug={seg[2]} go={go} elapsed={elapsed} />;
  else page = <NotFound go={go} />;

  const isOn = (p) => (p === "/legends" ? path === p : path.startsWith(p));

  return (
    <div className="lg">
      <style>{CSS}</style>
      <span ref={topRef} />

      <Ticker go={go} />

      <nav className="nav">
        <div className="wrap nav-in">
          <button className="brand" onClick={() => go("/legends")}>
            <span className="brand-mark">THE <span>LEGENDS</span></span>
          </button>
          <div className="nav-links">
            {NAV.map((n) => (
              <button key={n.path} className={`nav-link${isOn(n.path) ? " on" : ""}${n.live ? " live-l" : ""}`} onClick={() => go(n.path)}>
                {n.label}
              </button>
            ))}
          </div>
          <div className="nav-right">
            <span className="nav-somos" title="Sede oficial"><SomosMark height={26} /></span>
            <span className="picale-tag">
              Powered by <PicaleMark height={15} />
            </span>
            <button className="burger" onClick={() => setMenu(!menu)} aria-label="Menú" aria-expanded={menu}>
              <i /><i /><i />
            </button>
          </div>
        </div>
        {menu && (
          <div className="sheet">
            {NAV.map((n) => (
              <a key={n.path} href={ORIGIN + n.path} onClick={(e) => { e.preventDefault(); go(n.path); }}
                style={{ color: n.live ? "var(--live)" : undefined }}>
                {n.label}
              </a>
            ))}
          </div>
        )}
      </nav>

      <main>{page}</main>

      <footer className="foot">
        <div className="wrap">
          <div className="lockup">
            <SomosMark height={54} />
            <i>×</i>
            <span className="legends-word">THE LEGENDS</span>
            <i>×</i>
            <PicaleMark height={26} />
          </div>
          <p className="foot-note">
            Somos Pádel es la sede. The Legends es la liga. Pícale es la tecnología que transmite,
            marca y graba cada punto: streaming en vivo, replay instantáneo, marcador y estadísticas.
          </p>
          <SponsorRail />
          <div className="foot-links">
            {NAV.map((n) => (
              <a key={n.path} href={ORIGIN + n.path} onClick={(e) => { e.preventDefault(); go(n.path); }}>{n.label}</a>
            ))}
          </div>
          <p className="foot-note" style={{ marginTop: 22, fontSize: 11.5 }}>
            {DB.season.name} · Datos de demostración · picalereplay.com
          </p>
        </div>
      </footer>

      <nav className="bnav">
        {BNAV.map((n) => (
          <button key={n.path} className={isOn(n.path) ? "on" : ""} onClick={() => go(n.path)}>
            <span className="bi" style={n.path === "/legends/live" && isOn(n.path) ? { color: "var(--live)", borderColor: "var(--live)" } : undefined}>
              {n.icon}
            </span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
