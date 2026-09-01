import { useState, useEffect, useMemo } from "react";

/* ============================================================================
   PÍCALE — PLATAFORMA ADMINISTRATIVA
   Una sola aplicación · múltiples organizaciones · roles · permisos
   ----------------------------------------------------------------------------
   CAPAS

     auth        sesión, usuario, organización
     rbac        permisos y alcance (scope) por organización
     api         única puerta de entrada a los datos
     ui          pantallas, sidebar según rol

   MODO DE DATOS
   Cambia MODE a "api" cuando el backend esté listo. Ninguna pantalla toca los
   datos directamente: todas pasan por api.*, así que el cambio es de una línea
   y no hay que reescribir la interfaz.

     MODE = "mock"  → datos locales en memoria (esta V1)
     MODE = "api"   → fetch contra FastAPI con token en Authorization

   CONTRATO REST ESPERADO (lo que debe exponer el backend)

     POST   /auth/login                 { email, password } → { token, user }
     GET    /auth/me                    → user con organization, role, permissions
     GET    /organizations              → lista (solo super_admin)
     POST   /organizations
     GET    /users?organization_id=
     POST   /users                      { email, name, organization_id, role }
     PATCH  /users/:id                  { role, active }
     GET    /venues?organization_id=
     GET    /courts?venue_id=
     PATCH  /courts/:id                 { camera, stream_enabled }
     GET    /leagues?organization_id=
     GET    /seasons?league_id=
     GET    /matchdays?season_id=
     GET    /matches?matchday_id=&venue_id=
     PATCH  /matches/:id                { court_id, starts_at, status, sets,
                                          stream_url, replay_url }
     GET    /clips?match_id=
     GET    /screens?venue_id=          pantallas de Pícale TV
     GET    /devices?venue_id=          botones y reproductores Pícale

   SEGURIDAD
   Este archivo esconde y bloquea lo que no corresponde al rol, pero eso es
   comodidad, no seguridad: cualquiera puede editar el JavaScript del navegador.
   La validación de verdad tiene que repetirse en el backend, con el mismo mapa
   de permisos de ROLE_PERMISSIONS y comprobando siempre la organización dueña
   del recurso antes de responder.
============================================================================ */

const MODE = "mock";
const API_BASE = "https://picalereplay.com/api";

/* ============================================================================
   1. PERMISOS
============================================================================ */
const PERMISSIONS = [
  "view_matches", "edit_matches", "create_matches", "delete_matches",
  "view_players", "edit_players", "create_players", "delete_players",
  "view_teams", "edit_teams", "create_teams", "delete_teams",
  "manage_streams", "manage_replays", "manage_clips",
  "manage_venues", "manage_courts",
  "manage_users", "manage_organizations",
  "manage_system",
];

const ROLE_PERMISSIONS = {
  super_admin: PERMISSIONS,
  club_admin: [
    "view_matches",
    "manage_streams", "manage_replays",
    "manage_venues", "manage_courts",
    "manage_users",
  ],
  league_admin: [
    "view_matches", "edit_matches", "create_matches", "delete_matches",
    "view_players", "edit_players", "create_players", "delete_players",
    "view_teams", "edit_teams", "create_teams", "delete_teams",
    "manage_replays", "manage_clips",
    "manage_users",
  ],
};

const ROLE_LABEL = { super_admin: "Super admin", club_admin: "Admin de club", league_admin: "Admin de liga" };
const ROLE_HOME = { super_admin: "/admin", club_admin: "/admin/club", league_admin: "/admin/league" };

/* can(user, permiso, recurso)
   El permiso dice QUÉ puede hacer. El scope dice SOBRE QUÉ.
   Un admin de liga con edit_matches solo edita partidos de su liga. */
function can(user, perm, resource) {
  if (!user) return false;
  const perms = ROLE_PERMISSIONS[user.role] || [];
  if (!perms.includes(perm)) return false;
  if (user.role === "super_admin") return true;
  if (!resource) return true;
  const owners = [resource.organizationId, resource.leagueOrgId, resource.venueOrgId].filter(Boolean);
  if (!owners.length) return true;
  return owners.includes(user.organizationId);
}

/* ============================================================================
   2. DATOS (mock). Estructura idéntica a la que devolverá el API.
============================================================================ */
const seed = () => ({
  organizations: [
    { id: "org-picale", name: "Pícale", type: "platform", city: "Monterrey" },
    { id: "org-somos", name: "Somos Pádel", type: "club", city: "Monterrey" },
    { id: "org-legends", name: "The Legends", type: "league", city: "Monterrey" },
    { id: "org-cordillera", name: "Cordillera PC", type: "club", city: "Monterrey" },
  ],
  users: [
    { id: "u1", name: "Pablo Almada", email: "pablo@picale.mx", password: "picale", organizationId: "org-picale", role: "super_admin", active: true },
    { id: "u2", name: "Admin Somos Pádel", email: "admin@somospadel.mx", password: "somos", organizationId: "org-somos", role: "club_admin", active: true },
    { id: "u3", name: "Admin The Legends", email: "admin@thelegends.mx", password: "legends", organizationId: "org-legends", role: "league_admin", active: true },
  ],
  venues: [
    { id: "ven-somos", organizationId: "org-somos", name: "Somos Pádel", city: "Monterrey", courts: 8 },
    { id: "ven-cordillera", organizationId: "org-cordillera", name: "Cordillera PC", city: "Monterrey", courts: 4 },
  ],
  courts: [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `c-somos-${i + 1}`, venueId: "ven-somos", organizationId: "org-somos", number: i + 1,
      camera: i < 4 ? "Hikvision DS-2CD1347G2H" : null,
      streamEnabled: i < 4, screen: i < 4, replayButton: i < 4,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `c-cor-${i + 1}`, venueId: "ven-cordillera", organizationId: "org-cordillera", number: i + 1,
      camera: null, streamEnabled: false, screen: false, replayButton: false,
    })),
  ],
  leagues: [
    { id: "lg-legends", organizationId: "org-legends", name: "The Legends Padel Teams League", venues: ["ven-somos", "ven-cordillera"] },
  ],
  seasons: [
    { id: "s-fall26", leagueId: "lg-legends", name: "Fall Season 2026", from: "2026-09-01", to: "2026-10-28", active: true },
  ],
  divisions: [
    { id: "varonil", seasonId: "s-fall26", name: "Varonil" },
    { id: "femenil", seasonId: "s-fall26", name: "Femenil" },
  ],
  teams: [
    { id: "v-nac", divisionId: "varonil", organizationId: "org-legends", name: "Nación Cuatro by Candelas", short: "NAC" },
    { id: "v-lio", divisionId: "varonil", organizationId: "org-legends", name: "Lions", short: "LIO" },
    { id: "v-mon", divisionId: "varonil", organizationId: "org-legends", name: "Monono", short: "MON" },
    { id: "v-for", divisionId: "varonil", organizationId: "org-legends", name: "Forza", short: "FOR" },
    { id: "v-gpp", divisionId: "varonil", organizationId: "org-legends", name: "GP Padel Team", short: "GPP" },
    { id: "v-cue", divisionId: "varonil", organizationId: "org-legends", name: "Cuerno", short: "CUE" },
    { id: "v-meg", divisionId: "varonil", organizationId: "org-legends", name: "Mariscos el Gordo", short: "MEG" },
    { id: "v-tou", divisionId: "varonil", organizationId: "org-legends", name: "Tourpadel", short: "TOU" },
    { id: "v-fou", divisionId: "varonil", organizationId: "org-legends", name: "Four Padel", short: "4PD" },
    { id: "f-ipl", divisionId: "femenil", organizationId: "org-legends", name: "IPlay Padel", short: "IPL" },
    { id: "f-mon", divisionId: "femenil", organizationId: "org-legends", name: "Monono", short: "MON" },
    { id: "f-fou", divisionId: "femenil", organizationId: "org-legends", name: "Four Padel", short: "4PD" },
    { id: "f-pap", divisionId: "femenil", organizationId: "org-legends", name: "Papalote", short: "PAP" },
    { id: "f-alo", divisionId: "femenil", organizationId: "org-legends", name: "Aloe Real", short: "ALO" },
    { id: "f-p76", divisionId: "femenil", organizationId: "org-legends", name: "Padel 76", short: "P76" },
    { id: "f-sul", divisionId: "femenil", organizationId: "org-legends", name: "Sultanas", short: "SUL" },
  ],
  players: [],
  matchdays: MATCHDAY_SEED(),
  matches: MATCH_SEED(),
  clips: [],
});

function MATCHDAY_SEED() {
  const v = [
    [1, "2026-09-01"], [2, "2026-09-02"], [3, "2026-09-08"], [4, "2026-09-09"],
    [5, "2026-09-15"], [6, "2026-09-16"], [7, "2026-09-22"], [8, "2026-09-23"],
    [9, "2026-09-29"], [10, "2026-09-30"], [11, "2026-10-06"], [12, "2026-10-07"],
    [13, "2026-10-13"], [14, "2026-10-14"], [15, "2026-10-20"], [16, "2026-10-21"],
  ];
  const f = v.slice(0, 14);
  const mk = (div, list, extra) => [
    ...list.map(([n, date]) => ({
      id: `${div[0]}-j${n}`, divisionId: div, seasonId: "s-fall26", n, date,
      venueId: new Date(date + "T12:00:00").getDay() === 2 ? "ven-somos" : "ven-cordillera",
    })),
    ...extra,
  ];
  const finals = (div, base) => [
    { id: `${div[0]}-sf`, divisionId: div, seasonId: "s-fall26", n: base + 1, phase: "Semifinales", date: "2026-10-27", venueId: "ven-somos" },
    { id: `${div[0]}-fin`, divisionId: div, seasonId: "s-fall26", n: base + 2, phase: "Final", date: "2026-10-28", venueId: "ven-cordillera" },
  ];
  return [...mk("varonil", v, finals("varonil", 16)), ...mk("femenil", f, finals("femenil", 14))];
}

const PAIRS = {
  "v-j1": [["v-nac", "v-lio"], ["v-gpp", "v-tou"]], "v-j2": [["v-meg", "v-cue"], ["v-fou", "v-for"]],
  "v-j3": [["v-meg", "v-fou"], ["v-mon", "v-cue"]], "v-j4": [["v-gpp", "v-for"], ["v-lio", "v-tou"]],
  "v-j5": [["v-lio", "v-for"], ["v-gpp", "v-meg"]], "v-j6": [["v-nac", "v-tou"], ["v-mon", "v-fou"]],
  "v-j7": [["v-tou", "v-for"], ["v-nac", "v-cue"]], "v-j8": [["v-mon", "v-gpp"], ["v-lio", "v-meg"]],
  "v-j9": [["v-cue", "v-fou"], ["v-lio", "v-mon"]], "v-j10": [["v-nac", "v-for"], ["v-tou", "v-meg"]],
  "v-j11": [["v-tou", "v-mon"], ["v-for", "v-meg"]], "v-j12": [["v-cue", "v-gpp"], ["v-nac", "v-fou"]],
  "v-j13": [["v-nac", "v-meg"], ["v-fou", "v-gpp"]], "v-j14": [["v-for", "v-mon"], ["v-cue", "v-lio"]],
  "v-j15": [["v-nac", "v-gpp"], ["v-fou", "v-lio"], ["v-meg", "v-mon"], ["v-cue", "v-tou"]],
  "v-j16": [["v-nac", "v-mon"], ["v-gpp", "v-lio"], ["v-fou", "v-tou"], ["v-for", "v-cue"]],
  "f-j1": [["f-mon", "f-pap"], ["f-sul", "f-p76"]], "f-j2": [["f-ipl", "f-fou"]],
  "f-j3": [["f-alo", "f-pap"], ["f-fou", "f-p76"]], "f-j4": [["f-sul", "f-mon"]],
  "f-j5": [["f-alo", "f-sul"], ["f-fou", "f-mon"]], "f-j6": [["f-ipl", "f-p76"]],
  "f-j7": [["f-p76", "f-mon"], ["f-ipl", "f-pap"]], "f-j8": [["f-fou", "f-alo"]],
  "f-j9": [["f-p76", "f-alo"], ["f-pap", "f-sul"]], "f-j10": [["f-ipl", "f-mon"]],
  "f-j11": [["f-mon", "f-alo"], ["f-ipl", "f-sul"]], "f-j12": [["f-pap", "f-fou"]],
  "f-j13": [["f-ipl", "f-alo"], ["f-sul", "f-fou"]], "f-j14": [["f-pap", "f-p76"]],
};

function MATCH_SEED() {
  const out = [];
  MATCHDAY_SEED().forEach((d) => {
    const pairs = PAIRS[d.id] || (d.phase ? [["Por definir", "Por definir"]] : []);
    pairs.forEach((p, i) => {
      out.push({
        id: `${d.id}-c${i + 1}`, matchdayId: d.id, divisionId: d.divisionId,
        organizationId: "org-legends", venueOrgId: d.venueId === "ven-somos" ? "org-somos" : "org-cordillera",
        leagueOrgId: "org-legends", venueId: d.venueId,
        courtId: d.venueId === "ven-somos" ? `c-somos-${i + 1}` : `c-cor-${i + 1}`,
        teamA: p[0], teamB: p[1], startsAt: "", status: "scheduled",
        sets: [], streamUrl: "", replayUrl: "",
      });
    });
  });
  return out;
}

/* ============================================================================
   3. CAPA DE DATOS — todas las pantallas pasan por aquí
============================================================================ */
let DB = seed();

const store = {
  load() {
    try {
      const raw = sessionStorage.getItem("picale_db");
      if (raw) DB = JSON.parse(raw);
    } catch (e) { }
  },
  save() {
    try { sessionStorage.setItem("picale_db", JSON.stringify(DB)); } catch (e) { }
  },
};
store.load();

async function request(path, opts = {}) {
  if (MODE === "api") {
    const r = await fetch(API_BASE + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token()}`, ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  return null; // en modo mock cada método resuelve local
}

const api = {
  organizations: () => DB.organizations,
  organization: (id) => DB.organizations.find((o) => o.id === id),
  createOrganization: (data) => { DB.organizations.push({ id: "org-" + Date.now(), ...data }); store.save(); },

  users: (orgId) => (orgId ? DB.users.filter((u) => u.organizationId === orgId) : DB.users),
  createUser: (data) => { DB.users.push({ id: "u" + Date.now(), active: true, ...data }); store.save(); },
  updateUser: (id, patch) => { Object.assign(DB.users.find((u) => u.id === id), patch); store.save(); },

  venues: (orgId) => (orgId ? DB.venues.filter((v) => v.organizationId === orgId) : DB.venues),
  courts: (venueId) => DB.courts.filter((c) => !venueId || c.venueId === venueId),
  updateCourt: (id, patch) => { Object.assign(DB.courts.find((c) => c.id === id), patch); store.save(); },

  leagues: () => DB.leagues,
  seasons: () => DB.seasons,
  divisions: () => DB.divisions,
  teams: (divisionId) => DB.teams.filter((t) => !divisionId || t.divisionId === divisionId),
  createTeam: (data) => { DB.teams.push({ id: "t" + Date.now(), organizationId: "org-legends", ...data }); store.save(); },
  updateTeam: (id, patch) => { Object.assign(DB.teams.find((t) => t.id === id), patch); store.save(); },

  players: (teamId) => DB.players.filter((p) => !teamId || p.teamId === teamId),
  createPlayer: (data) => { DB.players.push({ id: "p" + Date.now(), organizationId: "org-legends", ...data }); store.save(); },
  deletePlayer: (id) => { DB.players = DB.players.filter((p) => p.id !== id); store.save(); },

  matchdays: (divisionId) => DB.matchdays.filter((d) => !divisionId || d.divisionId === divisionId),
  matches: (filter = {}) => DB.matches.filter((m) =>
    (!filter.matchdayId || m.matchdayId === filter.matchdayId) &&
    (!filter.divisionId || m.divisionId === filter.divisionId) &&
    (!filter.venueId || m.venueId === filter.venueId)),
  match: (id) => DB.matches.find((m) => m.id === id),
  updateMatch: (id, patch) => { Object.assign(DB.matches.find((m) => m.id === id), patch); store.save(); },

  teamName: (id) => { const t = DB.teams.find((x) => x.id === id); return t ? t.name : id; },
  courtLabel: (id) => { const c = DB.courts.find((x) => x.id === id); return c ? `Cancha ${c.number}` : "—"; },
  venueName: (id) => { const v = DB.venues.find((x) => x.id === id); return v ? v.name : "—"; },
  reset: () => { DB = seed(); store.save(); },
};

/* ============================================================================
   4. SESIÓN
============================================================================ */
const auth = {
  _user: null,
  token: () => { try { return sessionStorage.getItem("picale_token") || ""; } catch (e) { return ""; } },
  current() {
    if (this._user) return this._user;
    try {
      const raw = sessionStorage.getItem("picale_user");
      if (raw) this._user = JSON.parse(raw);
    } catch (e) { }
    return this._user;
  },
  login(email, password) {
    const u = DB.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
    if (!u || u.password !== password) return null;
    const user = { id: u.id, name: u.name, email: u.email, role: u.role, organizationId: u.organizationId };
    this._user = user;
    try {
      sessionStorage.setItem("picale_user", JSON.stringify(user));
      sessionStorage.setItem("picale_token", "mock." + u.id);
    } catch (e) { }
    return user;
  },
  logout() {
    this._user = null;
    try { sessionStorage.removeItem("picale_user"); sessionStorage.removeItem("picale_token"); } catch (e) { }
  },
};

/* ============================================================================
   5. NAVEGACIÓN POR ROL
============================================================================ */
const NAV = {
  super_admin: [
    { path: "/admin", label: "Dashboard" },
    { path: "/admin/organizations", label: "Organizaciones", perm: "manage_organizations" },
    { path: "/admin/clubs", label: "Clubes", perm: "manage_venues" },
    { path: "/admin/leagues", label: "Ligas", perm: "view_matches" },
    { path: "/admin/matches", label: "Partidos", perm: "view_matches" },
    { path: "/admin/teams", label: "Equipos", perm: "view_teams" },
    { path: "/admin/players", label: "Jugadores", perm: "view_players" },
    { path: "/admin/streaming", label: "Streaming", perm: "manage_streams" },
    { path: "/admin/tv", label: "Pícale TV", perm: "manage_streams" },
    { path: "/admin/devices", label: "Pícale Players", perm: "manage_courts" },
    { path: "/admin/users", label: "Usuarios", perm: "manage_users" },
    { path: "/admin/settings", label: "Configuración", perm: "manage_system" },
  ],
  club_admin: [
    { path: "/admin/club", label: "Dashboard" },
    { path: "/admin/courts", label: "Mis canchas", perm: "manage_courts" },
    { path: "/admin/matches", label: "Partidos", perm: "view_matches" },
    { path: "/admin/streaming", label: "Streaming", perm: "manage_streams" },
    { path: "/admin/replays", label: "Replays", perm: "manage_replays" },
    { path: "/admin/tv", label: "Pícale TV", perm: "manage_streams" },
    { path: "/admin/users", label: "Usuarios", perm: "manage_users" },
    { path: "/admin/settings", label: "Configuración" },
  ],
  league_admin: [
    { path: "/admin/league", label: "Dashboard" },
    { path: "/admin/matchdays", label: "Jornadas", perm: "view_matches" },
    { path: "/admin/matches", label: "Partidos", perm: "edit_matches" },
    { path: "/admin/teams", label: "Equipos", perm: "view_teams" },
    { path: "/admin/players", label: "Jugadores", perm: "view_players" },
    { path: "/admin/standings", label: "Clasificación", perm: "view_matches" },
    { path: "/admin/replays", label: "Replays", perm: "manage_replays" },
    { path: "/admin/clips", label: "Clips", perm: "manage_clips" },
    { path: "/admin/users", label: "Usuarios", perm: "manage_users" },
    { path: "/admin/settings", label: "Configuración" },
  ],
};

/* ============================================================================
   6. ESTILOS
============================================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
.pc *, .pc *::before, .pc *::after { box-sizing:border-box; }
.pc {
  --ink:#050506; --panel:#0D0D0F; --panel2:#151519; --line:rgba(245,242,236,.10);
  --line2:rgba(245,242,236,.22); --ivory:#F5F2EC; --muted:#8B8B90;
  --sage:#A7B0A4; --live:#FF3355; --ok:#22C55E; --warn:#E4B84B;
  background:var(--ink); color:var(--ivory); font-family:'Inter',system-ui,sans-serif;
  font-size:14.5px; line-height:1.55; min-height:100vh; -webkit-font-smoothing:antialiased;
}
.pc h1,.pc h2,.pc h3 { font-family:'Barlow Condensed',sans-serif; font-weight:700; line-height:1; margin:0; }
.pc button { font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
.pc input, .pc select { font:inherit; color:var(--ivory); background:var(--panel2);
  border:1px solid var(--line); padding:9px 11px; width:100%; }
.pc input:focus, .pc select:focus { outline:none; border-color:var(--sage); }
.pc :focus-visible { outline:2px solid var(--sage); outline-offset:2px; }
.pc label { display:block; font-size:11px; letter-spacing:.08em; color:var(--muted); margin-bottom:5px; }

/* login */
.login { min-height:100vh; display:grid; place-items:center; padding:24px; }
.login-box { width:100%; max-width:390px; }
.login-card { border:1px solid var(--line); background:var(--panel); padding:26px; margin-top:22px; }
.login h1 { font-size:26px; letter-spacing:.02em; }
.login .sub { color:var(--muted); font-size:12.5px; margin-top:8px; }
.field { margin-bottom:14px; }
.err { color:var(--live); font-size:12.5px; margin-bottom:12px; }
.demo { margin-top:18px; border-top:1px solid var(--line); padding-top:14px; font-size:12px; color:var(--muted); }
.demo b { color:var(--ivory); font-weight:500; }
.demo button { display:block; text-align:left; padding:7px 0; color:var(--sage); font-size:12.5px; }

/* shell */
.shell { display:grid; grid-template-columns:1fr; min-height:100vh; }
.side { border-right:1px solid var(--line); background:var(--panel); display:none; flex-direction:column; }
.side-top { padding:18px 16px; border-bottom:1px solid var(--line); }
.org { display:flex; align-items:center; gap:10px; margin-top:14px; }
.org-badge { width:34px; height:34px; display:grid; place-items:center; border:1px solid var(--line2);
  font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:14px; flex:none; }
.org-name { font-family:'Barlow Condensed',sans-serif; font-size:17px; font-weight:600; line-height:1.1; }
.org-role { font-size:10.5px; color:var(--muted); letter-spacing:.05em; }
.side-nav { padding:10px 0; flex:1; overflow:auto; }
.side-nav button { display:block; width:100%; text-align:left; padding:9px 16px; font-size:13.5px; color:var(--muted); border-left:2px solid transparent; }
.side-nav button:hover { color:var(--ivory); background:rgba(245,242,236,.03); }
.side-nav button.on { color:var(--ivory); border-left-color:var(--sage); background:rgba(167,176,164,.07); }
.side-foot { padding:14px 16px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); }
.side-foot button { color:var(--live); margin-top:8px; font-size:12.5px; }

.topbar { display:flex; align-items:center; gap:12px; padding:12px 18px; border-bottom:1px solid var(--line);
  background:rgba(5,5,6,.92); position:sticky; top:0; z-index:20; backdrop-filter:blur(12px); }
.topbar .who { margin-left:auto; text-align:right; font-size:12px; color:var(--muted); }
.burger { display:grid; gap:4px; padding:6px; }
.burger i { width:19px; height:1.5px; background:var(--ivory); display:block; }
.drawer { border-bottom:1px solid var(--line); background:var(--panel); }
.drawer button { display:block; width:100%; text-align:left; padding:11px 18px; border-bottom:1px solid var(--line); font-size:14px; }
.main { padding:22px 18px 60px; max-width:1120px; }

.head { margin-bottom:20px; }
.head h1 { font-size:clamp(26px,5vw,36px); }
.head p { color:var(--muted); font-size:12.5px; margin:8px 0 0; }

.cards { display:grid; gap:10px; grid-template-columns:repeat(2,1fr); margin-bottom:22px; }
.kpi { border:1px solid var(--line); background:var(--panel); padding:14px; }
.kpi b { display:block; font-family:'Barlow Condensed',sans-serif; font-size:30px; line-height:1; }
.kpi span { font-size:10.5px; color:var(--muted); letter-spacing:.06em; }

.panel { border:1px solid var(--line); background:var(--panel); margin-bottom:16px; }
.panel-h { padding:12px 15px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; }
.panel-h h3 { font-size:19px; }
.panel-h .right { margin-left:auto; display:flex; gap:8px; }
.panel-b { padding:15px; }

.tbl { width:100%; border-collapse:collapse; font-size:13.5px; }
.tbl th { text-align:left; font-family:'Barlow Condensed',sans-serif; font-size:12px; letter-spacing:.1em;
  color:var(--muted); font-weight:600; padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
.tbl td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:middle; }
.tbl tr:hover td { background:rgba(245,242,236,.03); }
.tbl .num { text-align:right; font-variant-numeric:tabular-nums; }
.scroll { overflow-x:auto; }

.btn { display:inline-flex; align-items:center; gap:7px; padding:8px 14px; border:1px solid var(--line2); font-size:12.5px; }
.btn:hover { background:rgba(245,242,236,.06); }
.btn-p { background:var(--ivory); color:#0B0B0C; border-color:var(--ivory); font-weight:600; }
.btn-p:hover { background:#fff; }
.btn-d { border-color:rgba(255,51,85,.5); color:var(--live); }
.btn-sm { padding:5px 10px; font-size:12px; }

.tag { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; font-size:10.5px;
  letter-spacing:.06em; border:1px solid var(--line); color:var(--muted); font-weight:600; }
.tag.ok { color:var(--ok); border-color:rgba(34,197,94,.4); }
.tag.live { color:var(--live); border-color:rgba(255,51,85,.4); }
.tag.warn { color:var(--warn); border-color:rgba(228,184,75,.4); }

.row { display:grid; gap:12px; grid-template-columns:1fr; }
.row2 { display:grid; gap:12px; grid-template-columns:1fr 1fr; }
.muted { color:var(--muted); font-size:12.5px; }
.empty { padding:26px; text-align:center; border:1px dashed var(--line2); color:var(--muted); font-size:13.5px; }
.empty b { display:block; color:var(--ivory); font-family:'Barlow Condensed',sans-serif; font-size:18px; margin-bottom:5px; }

.deny { max-width:460px; margin:60px auto; text-align:center; }
.deny h2 { font-size:26px; margin-bottom:10px; }
.deny p { color:var(--muted); font-size:13.5px; }
.perm-grid { display:flex; flex-wrap:wrap; gap:6px; }
.perm { padding:4px 8px; border:1px solid var(--line); font-size:11px; color:var(--muted); font-family:'Barlow Condensed',sans-serif; letter-spacing:.04em; }
.perm.on { color:var(--ok); border-color:rgba(34,197,94,.35); }

.sets-in { display:flex; gap:6px; }
.sets-in input { width:52px; text-align:center; padding:7px 4px; }

@media (min-width:900px){
  .shell { grid-template-columns:238px 1fr; }
  .side { display:flex; }
  .burger { display:none; }
  .cards { grid-template-columns:repeat(4,1fr); }
  .main { padding:26px 26px 60px; }
}
`;

/* ============================================================================
   7. UI COMÚN
============================================================================ */
const PICALE_LOGO = "data:image/png;base64,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";
const Picale = ({ h = 18 }) => <img src={PICALE_LOGO} alt="Pícale" style={{ height: h, width: "auto", display: "block" }} />;

function Tag({ kind, children }) { return <span className={`tag ${kind || ""}`}>{children}</span>; }

function Panel({ title, right, children }) {
  return (
    <div className="panel">
      {(title || right) && (
        <div className="panel-h">
          {title && <h3>{title}</h3>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      <div className="panel-b">{children}</div>
    </div>
  );
}

function Deny({ what }) {
  return (
    <div className="deny">
      <h2>Sin acceso</h2>
      <p>Tu cuenta no tiene permiso para {what || "esta sección"}. Si crees que es un error, pídele a Pícale que revise tu rol.</p>
    </div>
  );
}

const statusTag = (s) =>
  s === "live" ? <Tag kind="live">EN VIVO</Tag> : s === "final" ? <Tag kind="ok">FINALIZADO</Tag> : <Tag>PROGRAMADO</Tag>;

/* ============================================================================
   8. PANTALLAS
============================================================================ */

function Dashboard({ user, go }) {
  const org = api.organization(user.organizationId);
  const isClub = user.role === "club_admin";
  const isLeague = user.role === "league_admin";

  const myVenues = isClub ? api.venues(user.organizationId) : api.venues();
  const myCourts = api.courts().filter((c) => !isClub || c.organizationId === user.organizationId);
  const matches = api.matches().filter((m) => !isClub || m.venueOrgId === user.organizationId);
  const live = matches.filter((m) => m.status === "live");
  const done = matches.filter((m) => m.status === "final");
  const cams = myCourts.filter((c) => c.camera).length;

  return (
    <>
      <div className="head">
        <h1>{org.name}</h1>
        <p>{ROLE_LABEL[user.role]} · sesión de {user.name}</p>
      </div>

      <div className="cards">
        {!isLeague && <div className="kpi"><b>{myCourts.length}</b><span>CANCHAS</span></div>}
        {!isLeague && <div className="kpi"><b>{cams}</b><span>CON CÁMARA</span></div>}
        <div className="kpi"><b>{matches.length}</b><span>PARTIDOS</span></div>
        <div className="kpi"><b style={{ color: live.length ? "var(--live)" : undefined }}>{live.length}</b><span>EN VIVO</span></div>
        {isLeague && <div className="kpi"><b>{api.teams().length}</b><span>EQUIPOS</span></div>}
        {isLeague && <div className="kpi"><b>{done.length}</b><span>JUGADOS</span></div>}
        {user.role === "super_admin" && <div className="kpi"><b>{api.organizations().length}</b><span>ORGANIZACIONES</span></div>}
      </div>

      <Panel title="Siguientes partidos" right={<button className="btn btn-sm" onClick={() => go("/admin/matches")}>Ver todos</button>}>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Jornada</th><th>Partido</th><th>Sede</th><th>Cancha</th><th>Estado</th></tr></thead>
            <tbody>
              {matches.filter((m) => m.status !== "final").slice(0, 8).map((m) => {
                const d = api.matchdays().find((x) => x.id === m.matchdayId);
                return (
                  <tr key={m.id}>
                    <td>{d.date}</td>
                    <td>{d.phase || `J${d.n}`} · {d.divisionId}</td>
                    <td>{api.teamName(m.teamA)} vs {api.teamName(m.teamB)}</td>
                    <td>{api.venueName(m.venueId)}</td>
                    <td>{api.courtLabel(m.courtId)}</td>
                    <td>{statusTag(m.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Tus permisos">
        <div className="perm-grid">
          {PERMISSIONS.map((p) => (
            <span key={p} className={`perm${can(user, p) ? " on" : ""}`}>{p}</span>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          El backend debe validar exactamente esta misma lista antes de responder cualquier petición.
        </p>
      </Panel>
    </>
  );
}

function MatchesScreen({ user }) {
  const [, force] = useState(0);
  const [division, setDivision] = useState("varonil");
  const [matchday, setMatchday] = useState("all");
  const [editing, setEditing] = useState(null);

  let list = api.matches({ divisionId: division });
  if (user.role === "club_admin") list = list.filter((m) => m.venueOrgId === user.organizationId);
  if (matchday !== "all") list = list.filter((m) => m.matchdayId === matchday);

  const editable = (m) => can(user, "edit_matches", m);
  const days = api.matchdays(division);

  return (
    <>
      <div className="head">
        <h1>Partidos</h1>
        <p>
          {user.role === "club_admin"
            ? "Partidos jugados en tus instalaciones. Puedes consultarlos y administrar su transmisión, pero el resultado lo carga la liga."
            : "Carga resultados, cambia cancha, estado y las ligas de transmisión y replay."}
        </p>
      </div>

      <Panel>
        <div className="row2">
          <div>
            <label>DIVISIÓN</label>
            <select value={division} onChange={(e) => { setDivision(e.target.value); setMatchday("all"); }}>
              {api.divisions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label>JORNADA</label>
            <select value={matchday} onChange={(e) => setMatchday(e.target.value)}>
              <option value="all">Todas</option>
              {days.map((d) => <option key={d.id} value={d.id}>{d.phase || `Jornada ${d.n}`} · {d.date}</option>)}
            </select>
          </div>
        </div>
      </Panel>

      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr><th>Fecha</th><th>Jornada</th><th>Partido</th><th>Sede</th><th>Cancha</th><th>Marcador</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const d = api.matchdays().find((x) => x.id === m.matchdayId);
                return (
                  <tr key={m.id}>
                    <td className="muted">{d.date}</td>
                    <td>{d.phase || `J${d.n}`}</td>
                    <td>{api.teamName(m.teamA)} <span className="muted">vs</span> {api.teamName(m.teamB)}</td>
                    <td className="muted">{api.venueName(m.venueId)}</td>
                    <td>{api.courtLabel(m.courtId)}</td>
                    <td className="num">{m.sets.length ? m.sets.map((s) => s.join("-")).join("  ") : "—"}</td>
                    <td>{statusTag(m.status)}</td>
                    <td>
                      {editable(m)
                        ? <button className="btn btn-sm" onClick={() => setEditing(m.id)}>Editar</button>
                        : <span className="muted">solo lectura</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!list.length && <div className="panel-b"><div className="empty"><b>Sin partidos</b>Cambia los filtros.</div></div>}
      </div>

      {editing && <MatchEditor id={editing} user={user} onClose={() => { setEditing(null); force((x) => x + 1); }} />}
    </>
  );
}

function MatchEditor({ id, user, onClose }) {
  const m = api.match(id);
  const [sets, setSets] = useState(m.sets.length ? m.sets : [["", ""], ["", ""], ["", ""]]);
  const [status, setStatus] = useState(m.status);
  const [courtId, setCourtId] = useState(m.courtId);
  const [startsAt, setStartsAt] = useState(m.startsAt);
  const [streamUrl, setStreamUrl] = useState(m.streamUrl);
  const [replayUrl, setReplayUrl] = useState(m.replayUrl);

  const courts = api.courts(m.venueId);
  const save = () => {
    const clean = sets
      .map(([a, b]) => [parseInt(a, 10), parseInt(b, 10)])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    api.updateMatch(id, { sets: clean, status, courtId, startsAt, streamUrl, replayUrl });
    onClose();
  };

  return (
    <Panel
      title={`${api.teamName(m.teamA)} vs ${api.teamName(m.teamB)}`}
      right={<>
        <button className="btn btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn btn-sm btn-p" onClick={save}>Guardar</button>
      </>}
    >
      <div className="row2" style={{ marginBottom: 14 }}>
        <div>
          <label>ESTADO</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="scheduled">Programado</option>
            <option value="live">En vivo</option>
            <option value="final">Finalizado</option>
          </select>
        </div>
        <div>
          <label>CANCHA</label>
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            {courts.map((c) => <option key={c.id} value={c.id}>Cancha {c.number}{c.camera ? " · con cámara" : ""}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>HORARIO</label>
        <input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} placeholder="20:00" />
      </div>

      <div className="field">
        <label>MARCADOR POR SETS</label>
        {sets.map((s, i) => (
          <div className="sets-in" key={i} style={{ marginBottom: 6 }}>
            <input value={s[0]} onChange={(e) => { const n = sets.map((x) => x.slice()); n[i][0] = e.target.value; setSets(n); }} />
            <input value={s[1]} onChange={(e) => { const n = sets.map((x) => x.slice()); n[i][1] = e.target.value; setSets(n); }} />
            <span className="muted" style={{ alignSelf: "center" }}>set {i + 1}{i === 2 ? " (super tiebreak)" : ""}</span>
          </div>
        ))}
      </div>

      {can(user, "manage_streams", m) || can(user, "manage_replays", m) ? (
        <>
          <div className="field">
            <label>LIGA DE TRANSMISIÓN (HLS)</label>
            <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://picalereplay.com/hls/cancha1.m3u8" />
          </div>
          <div className="field">
            <label>LIGA DEL REPLAY</label>
            <input value={replayUrl} onChange={(e) => setReplayUrl(e.target.value)} placeholder="https://picalereplay.com/replay/..." />
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function CourtsScreen({ user }) {
  const [, force] = useState(0);
  const venues = user.role === "super_admin" ? api.venues() : api.venues(user.organizationId);
  return (
    <>
      <div className="head">
        <h1>Canchas</h1>
        <p>Cámaras, transmisión, pantalla y botón de replay por cancha.</p>
      </div>
      {venues.map((v) => (
        <div className="panel" key={v.id}>
          <div className="panel-h"><h3>{v.name}</h3><span className="muted">{v.city}</span></div>
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Cancha</th><th>Cámara</th><th>Transmisión</th><th>Pantalla</th><th>Botón replay</th><th></th></tr></thead>
              <tbody>
                {api.courts(v.id).map((c) => (
                  <tr key={c.id}>
                    <td>Cancha {c.number}</td>
                    <td className="muted">{c.camera || "sin cámara"}</td>
                    <td>{c.streamEnabled ? <Tag kind="ok">ACTIVA</Tag> : <Tag>APAGADA</Tag>}</td>
                    <td>{c.screen ? <Tag kind="ok">SÍ</Tag> : <Tag>NO</Tag>}</td>
                    <td>{c.replayButton ? <Tag kind="ok">SÍ</Tag> : <Tag>NO</Tag>}</td>
                    <td>
                      {can(user, "manage_courts", c) ? (
                        <button className="btn btn-sm" disabled={!c.camera}
                          style={!c.camera ? { opacity: .4, cursor: "not-allowed" } : null}
                          onClick={() => { api.updateCourt(c.id, { streamEnabled: !c.streamEnabled }); force((x) => x + 1); }}>
                          {c.streamEnabled ? "Apagar" : "Encender"}
                        </button>
                      ) : <span className="muted">solo lectura</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function StreamingScreen({ user }) {
  const courts = api.courts().filter((c) => user.role === "super_admin" || c.organizationId === user.organizationId);
  const withCam = courts.filter((c) => c.camera);
  return (
    <>
      <div className="head">
        <h1>Streaming</h1>
        <p>Estado de cada señal HLS. La liga pública lee estas mismas rutas.</p>
      </div>
      <div className="cards">
        <div className="kpi"><b>{withCam.length}</b><span>CÁMARAS</span></div>
        <div className="kpi"><b style={{ color: "var(--ok)" }}>{withCam.filter((c) => c.streamEnabled).length}</b><span>TRANSMITIENDO</span></div>
        <div className="kpi"><b>{courts.length - withCam.length}</b><span>SIN CÁMARA</span></div>
        <div className="kpi"><b>1080p</b><span>CALIDAD</span></div>
      </div>
      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Cancha</th><th>Sede</th><th>Manifiesto HLS</th><th>Estado</th></tr></thead>
            <tbody>
              {withCam.map((c) => (
                <tr key={c.id}>
                  <td>Cancha {c.number}</td>
                  <td className="muted">{api.venueName(c.venueId)}</td>
                  <td className="muted">/hls/cancha{c.number}.m3u8</td>
                  <td>{c.streamEnabled ? <Tag kind="live">AL AIRE</Tag> : <Tag>APAGADA</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TvScreen({ user }) {
  const courts = api.courts().filter((c) => (user.role === "super_admin" || c.organizationId === user.organizationId) && c.screen);
  return (
    <>
      <div className="head">
        <h1>Pícale TV</h1>
        <p>Pantallas instaladas en cancha: marcador, repeticiones y anuncios del club.</p>
      </div>
      {courts.length ? (
        <div className="panel">
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Pantalla</th><th>Sede</th><th>Contenido</th><th>Estado</th></tr></thead>
              <tbody>
                {courts.map((c) => (
                  <tr key={c.id}>
                    <td>Cancha {c.number}</td>
                    <td className="muted">{api.venueName(c.venueId)}</td>
                    <td className="muted">Marcador + replay + anuncios</td>
                    <td><Tag kind="ok">CONECTADA</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="empty"><b>Sin pantallas</b>Activa la pantalla desde la sección de canchas.</div>}
    </>
  );
}

function DevicesScreen({ user }) {
  const courts = api.courts().filter((c) => (user.role === "super_admin" || c.organizationId === user.organizationId) && c.replayButton);
  return (
    <>
      <div className="head">
        <h1>Pícale Players</h1>
        <p>Botones de repetición instalados en cancha.</p>
      </div>
      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Dispositivo</th><th>Cancha</th><th>Sede</th><th>Estado</th></tr></thead>
            <tbody>
              {courts.map((c) => (
                <tr key={c.id}>
                  <td>ESP32 · botón replay</td>
                  <td>Cancha {c.number}</td>
                  <td className="muted">{api.venueName(c.venueId)}</td>
                  <td><Tag kind="ok">EN LÍNEA</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TeamsScreen({ user }) {
  const [division, setDivision] = useState("varonil");
  const teams = api.teams(division);
  return (
    <>
      <div className="head"><h1>Equipos</h1><p>Los equipos pertenecen a la liga, no al club.</p></div>
      <Panel>
        <label>DIVISIÓN</label>
        <select value={division} onChange={(e) => setDivision(e.target.value)}>
          {api.divisions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Panel>
      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Equipo</th><th>Clave</th><th>División</th><th>Jugadores</th></tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td><td className="muted">{t.short}</td>
                  <td className="muted">{t.divisionId}</td>
                  <td className="num">{api.players(t.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PlayersScreen({ user }) {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(api.teams()[0].id);
  const players = api.players();
  const mayCreate = can(user, "create_players");

  return (
    <>
      <div className="head"><h1>Jugadores</h1><p>Al dar de alta un jugador se activa su perfil público en la liga.</p></div>

      {mayCreate && (
        <Panel title="Alta de jugador" right={
          <button className="btn btn-sm btn-p" disabled={!name.trim()}
            onClick={() => { api.createPlayer({ name: name.trim(), teamId }); setName(""); force((x) => x + 1); }}>
            Agregar
          </button>}>
          <div className="row2">
            <div><label>NOMBRE</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" /></div>
            <div>
              <label>EQUIPO</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {api.teams().map((t) => <option key={t.id} value={t.id}>{t.name} · {t.divisionId}</option>)}
              </select>
            </div>
          </div>
        </Panel>
      )}

      {players.length ? (
        <div className="panel">
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Jugador</th><th>Equipo</th><th></th></tr></thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td className="muted">{api.teamName(p.teamId)}</td>
                    <td>{can(user, "delete_players") &&
                      <button className="btn btn-sm btn-d" onClick={() => { api.deletePlayer(p.id); force((x) => x + 1); }}>Quitar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="empty"><b>Todavía no hay plantillas cargadas</b>Da de alta a los jugadores para activar sus perfiles públicos.</div>}
    </>
  );
}

function MatchdaysScreen() {
  const [division, setDivision] = useState("varonil");
  const days = api.matchdays(division);
  return (
    <>
      <div className="head"><h1>Jornadas</h1><p>Fechas y sedes de la temporada.</p></div>
      <Panel>
        <label>DIVISIÓN</label>
        <select value={division} onChange={(e) => setDivision(e.target.value)}>
          {api.divisions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Panel>
      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Jornada</th><th>Fecha</th><th>Sede</th><th>Partidos</th><th>Transmisión</th></tr></thead>
            <tbody>
              {days.map((d) => {
                const somos = d.venueId === "ven-somos";
                return (
                  <tr key={d.id}>
                    <td>{d.phase || `Jornada ${d.n}`}</td>
                    <td className="muted">{d.date}</td>
                    <td>{api.venueName(d.venueId)}</td>
                    <td className="num">{api.matches({ matchdayId: d.id }).length}</td>
                    <td>{somos ? <Tag kind="ok">SÍ</Tag> : <Tag>NO</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StandingsScreen() {
  const [division, setDivision] = useState("varonil");
  const rows = api.teams(division).map((t) => {
    const played = api.matches({ divisionId: division }).filter((m) => m.status === "final" && (m.teamA === t.id || m.teamB === t.id));
    let pg = 0, pp = 0;
    played.forEach((m) => {
      let a = 0, b = 0;
      m.sets.forEach(([x, y]) => (x > y ? a++ : b++));
      const win = (m.teamA === t.id && a > b) || (m.teamB === t.id && b > a);
      win ? pg++ : pp++;
    });
    return { t, pj: played.length, pg, pp, pts: pg * 3 };
  }).sort((a, b) => b.pts - a.pts);

  return (
    <>
      <div className="head"><h1>Clasificación</h1><p>Se calcula sola con los resultados cargados en Partidos.</p></div>
      <Panel>
        <label>DIVISIÓN</label>
        <select value={division} onChange={(e) => setDivision(e.target.value)}>
          {api.divisions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Panel>
      <div className="panel">
        <table className="tbl">
          <thead><tr><th>#</th><th>Equipo</th><th className="num">PJ</th><th className="num">PG</th><th className="num">PP</th><th className="num">PTS</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.t.id}>
                <td className="muted">{i + 1}</td><td>{r.t.name}</td>
                <td className="num">{r.pj}</td><td className="num">{r.pg}</td>
                <td className="num">{r.pp}</td><td className="num">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MediaScreen({ kind }) {
  const done = api.matches().filter((m) => m.status === "final");
  return (
    <>
      <div className="head">
        <h1>{kind === "clips" ? "Clips" : "Replays"}</h1>
        <p>{kind === "clips"
          ? "Mejores puntos generados por el botón de cancha y el autoedit de Pícale."
          : "Grabación completa de cada partido transmitido."}</p>
      </div>
      {done.length ? (
        <div className="panel">
          <table className="tbl">
            <thead><tr><th>Partido</th><th>Sede</th><th>Archivo</th></tr></thead>
            <tbody>
              {done.map((m) => (
                <tr key={m.id}>
                  <td>{api.teamName(m.teamA)} vs {api.teamName(m.teamB)}</td>
                  <td className="muted">{api.venueName(m.venueId)}</td>
                  <td className="muted">{m.replayUrl || "en proceso"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <b>Todavía no hay partidos terminados</b>
          Los {kind === "clips" ? "clips" : "replays"} aparecen aquí en cuanto se cierra un partido transmitido.
        </div>
      )}
    </>
  );
}

function OrganizationsScreen({ user }) {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState("club");
  if (!can(user, "manage_organizations")) return <Deny what="administrar organizaciones" />;

  return (
    <>
      <div className="head"><h1>Organizaciones</h1><p>Clubes, ligas y clientes dentro de la plataforma.</p></div>
      <Panel title="Nueva organización" right={
        <button className="btn btn-sm btn-p" disabled={!name.trim()}
          onClick={() => { api.createOrganization({ name: name.trim(), type, city: "Monterrey" }); setName(""); force((x) => x + 1); }}>
          Crear
        </button>}>
        <div className="row2">
          <div><label>NOMBRE</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Club o liga" /></div>
          <div>
            <label>TIPO</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="club">Club</option><option value="league">Liga</option><option value="platform">Plataforma</option>
            </select>
          </div>
        </div>
      </Panel>
      <div className="panel">
        <table className="tbl">
          <thead><tr><th>Organización</th><th>Tipo</th><th>Ciudad</th><th className="num">Usuarios</th><th className="num">Sedes</th></tr></thead>
          <tbody>
            {api.organizations().map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td><td className="muted">{o.type}</td><td className="muted">{o.city}</td>
                <td className="num">{api.users(o.id).length}</td>
                <td className="num">{api.venues(o.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClubsScreen() {
  const clubs = api.organizations().filter((o) => o.type === "club");
  return (
    <>
      <div className="head"><h1>Clubes</h1><p>Sedes conectadas a Pícale.</p></div>
      {clubs.map((o) => (
        <Panel key={o.id} title={o.name} right={<span className="muted">{o.city}</span>}>
          <table className="tbl">
            <thead><tr><th>Sede</th><th className="num">Canchas</th><th className="num">Con cámara</th></tr></thead>
            <tbody>
              {api.venues(o.id).map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td className="num">{api.courts(v.id).length}</td>
                  <td className="num">{api.courts(v.id).filter((c) => c.camera).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
    </>
  );
}

function LeaguesScreen() {
  return (
    <>
      <div className="head"><h1>Ligas</h1><p>Competiciones alojadas en la plataforma.</p></div>
      {api.leagues().map((l) => (
        <Panel key={l.id} title={l.name} right={<span className="muted">{api.organization(l.organizationId).name}</span>}>
          <table className="tbl">
            <thead><tr><th>Temporada</th><th>Del</th><th>Al</th><th className="num">Jornadas</th><th className="num">Partidos</th></tr></thead>
            <tbody>
              {api.seasons().filter((s) => s.leagueId === l.id).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td className="muted">{s.from}</td><td className="muted">{s.to}</td>
                  <td className="num">{api.matchdays().length}</td>
                  <td className="num">{api.matches().length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 10 }}>
            Sedes: {l.venues.map((v) => api.venueName(v)).join(" · ")}
          </p>
        </Panel>
      ))}
    </>
  );
}

function UsersScreen({ user }) {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(user.role === "super_admin" ? "club_admin" : user.role);
  const [orgId, setOrgId] = useState(user.organizationId);
  if (!can(user, "manage_users")) return <Deny what="administrar usuarios" />;

  const scoped = user.role === "super_admin" ? api.users() : api.users(user.organizationId);
  const orgs = user.role === "super_admin" ? api.organizations() : [api.organization(user.organizationId)];

  return (
    <>
      <div className="head">
        <h1>Usuarios</h1>
        <p>{user.role === "super_admin"
          ? "Todas las cuentas de la plataforma."
          : "Cuentas de tu organización. No puedes ver ni crear usuarios de otras organizaciones."}</p>
      </div>

      <Panel title="Nuevo usuario" right={
        <button className="btn btn-sm btn-p" disabled={!name.trim() || !email.trim()}
          onClick={() => {
            api.createUser({ name: name.trim(), email: email.trim(), password: "cambiar", organizationId: orgId, role });
            setName(""); setEmail(""); force((x) => x + 1);
          }}>Crear</button>}>
        <div className="row2" style={{ marginBottom: 12 }}>
          <div><label>NOMBRE</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label>EMAIL</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@club.mx" /></div>
        </div>
        <div className="row2">
          <div>
            <label>ORGANIZACIÓN</label>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={user.role !== "super_admin"}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label>ROL</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {user.role === "super_admin" && <option value="super_admin">Super admin</option>}
              <option value="club_admin">Admin de club</option>
              <option value="league_admin">Admin de liga</option>
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          El usuario nuevo queda con contraseña temporal. El cambio obligatorio en el primer acceso lo tiene que imponer el backend.
        </p>
      </Panel>

      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Usuario</th><th>Email</th><th>Organización</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {scoped.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td className="muted">{api.organization(u.organizationId).name}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.active ? <Tag kind="ok">ACTIVO</Tag> : <Tag>SUSPENDIDO</Tag>}</td>
                  <td>
                    {u.id !== user.id && (
                      <button className="btn btn-sm" onClick={() => { api.updateUser(u.id, { active: !u.active }); force((x) => x + 1); }}>
                        {u.active ? "Suspender" : "Reactivar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SettingsScreen({ user }) {
  const org = api.organization(user.organizationId);
  return (
    <>
      <div className="head"><h1>Configuración</h1><p>{org.name} · {ROLE_LABEL[user.role]}</p></div>

      <Panel title="Origen de los datos">
        <p className="muted">
          Modo actual: <b style={{ color: "var(--ivory)" }}>{MODE}</b>. En modo mock todo vive en el navegador y se reinicia
          al cerrar la pestaña. Cambiando MODE a "api" la aplicación consume {API_BASE} sin tocar ninguna pantalla.
        </p>
        {can(user, "manage_system") && (
          <button className="btn btn-sm btn-d" style={{ marginTop: 12 }}
            onClick={() => { api.reset(); location.reload(); }}>Reiniciar datos de prueba</button>
        )}
      </Panel>

      <Panel title="Permisos de este rol">
        <div className="perm-grid">
          {PERMISSIONS.map((p) => <span key={p} className={`perm${can(user, p) ? " on" : ""}`}>{p}</span>)}
        </div>
      </Panel>

      {can(user, "manage_system") && (
        <Panel title="Pendiente para producción">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li>Autenticación real con hash de contraseña y expiración de token.</li>
            <li>Repetir la validación de permisos y organización en cada endpoint.</li>
            <li>Registro de actividad: quién cambió qué resultado y cuándo.</li>
            <li>Recuperación de contraseña e invitaciones por correo.</li>
          </ul>
        </Panel>
      )}
    </>
  );
}

/* ============================================================================
   9. LOGIN
============================================================================ */
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const u = auth.login(email, password);
    if (!u) { setErr("Correo o contraseña incorrectos."); return; }
    onLogin(u);
  };

  const quick = (e, p) => { setEmail(e); setPassword(p); setErr(""); };

  return (
    <div className="login">
      <div className="login-box">
        <Picale h={26} />
        <div className="login-card">
          <h1>Entrar a la plataforma</h1>
          <p className="sub">Clubes, ligas y torneos administrados desde un solo lugar.</p>
          <div style={{ height: 20 }} />
          {err && <div className="err">{err}</div>}
          <div className="field">
            <label>CORREO</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div className="field">
            <label>CONTRASEÑA</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <button className="btn btn-p" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Entrar</button>

          <div className="demo">
            <b>Cuentas de la V1</b>
            <button onClick={() => quick("pablo@picale.mx", "picale")}>pablo@picale.mx · super admin</button>
            <button onClick={() => quick("admin@somospadel.mx", "somos")}>admin@somospadel.mx · club</button>
            <button onClick={() => quick("admin@thelegends.mx", "legends")}>admin@thelegends.mx · liga</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   10. APP
============================================================================ */
const ROUTE_PERM = {
  "/admin/organizations": "manage_organizations",
  "/admin/clubs": "manage_venues",
  "/admin/leagues": "view_matches",
  "/admin/matches": "view_matches",
  "/admin/matchdays": "view_matches",
  "/admin/standings": "view_matches",
  "/admin/teams": "view_teams",
  "/admin/players": "view_players",
  "/admin/courts": "manage_courts",
  "/admin/streaming": "manage_streams",
  "/admin/tv": "manage_streams",
  "/admin/devices": "manage_courts",
  "/admin/replays": "manage_replays",
  "/admin/clips": "manage_clips",
  "/admin/users": "manage_users",
};

export default function App() {
  const [user, setUser] = useState(() => auth.current());
  const [path, setPath] = useState(() => (location.hash || "").replace("#", "") || "/admin");
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const onHash = () => setPath((location.hash || "").replace("#", "") || "/admin");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p) => { location.hash = p; setPath(p); setDrawer(false); window.scrollTo(0, 0); };

  if (!user) {
    return (
      <div className="pc">
        <style>{CSS}</style>
        <Login onLogin={(u) => { setUser(u); go(ROLE_HOME[u.role]); }} />
      </div>
    );
  }

  const nav = NAV[user.role];
  const org = api.organization(user.organizationId);
  const home = ROLE_HOME[user.role];

  /* Guardia: ninguna ruta se dibuja sin permiso, aunque se escriba a mano. */
  const needed = ROUTE_PERM[path];
  const allowed = !needed || can(user, needed);
  const known = path === home || nav.some((n) => n.path === path) || path === "/admin/settings";

  let screen;
  if (!allowed) screen = <Deny what="entrar a esa sección" />;
  else if (path === "/admin" || path === "/admin/club" || path === "/admin/league") screen = <Dashboard user={user} go={go} />;
  else if (path === "/admin/organizations") screen = <OrganizationsScreen user={user} />;
  else if (path === "/admin/clubs") screen = <ClubsScreen />;
  else if (path === "/admin/leagues") screen = <LeaguesScreen />;
  else if (path === "/admin/matches") screen = <MatchesScreen user={user} />;
  else if (path === "/admin/matchdays") screen = <MatchdaysScreen />;
  else if (path === "/admin/standings") screen = <StandingsScreen />;
  else if (path === "/admin/teams") screen = <TeamsScreen user={user} />;
  else if (path === "/admin/players") screen = <PlayersScreen user={user} />;
  else if (path === "/admin/courts") screen = <CourtsScreen user={user} />;
  else if (path === "/admin/streaming") screen = <StreamingScreen user={user} />;
  else if (path === "/admin/tv") screen = <TvScreen user={user} />;
  else if (path === "/admin/devices") screen = <DevicesScreen user={user} />;
  else if (path === "/admin/replays") screen = <MediaScreen kind="replays" />;
  else if (path === "/admin/clips") screen = <MediaScreen kind="clips" />;
  else if (path === "/admin/users") screen = <UsersScreen user={user} />;
  else if (path === "/admin/settings") screen = <SettingsScreen user={user} />;
  else screen = <Deny what="entrar a esa sección" />;

  /* Un dashboard de otro rol tampoco se abre a mano. */
  if (allowed && !known && ["/admin", "/admin/club", "/admin/league"].includes(path)) screen = <Deny what="entrar a ese panel" />;

  return (
    <div className="pc">
      <style>{CSS}</style>
      <div className="shell">
        <aside className="side">
          <div className="side-top">
            <Picale h={20} />
            <div className="org">
              <span className="org-badge">{org.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="org-name">{org.name}</div>
                <div className="org-role">{ROLE_LABEL[user.role]}</div>
              </div>
            </div>
          </div>
          <nav className="side-nav">
            {nav.filter((n) => !n.perm || can(user, n.perm)).map((n) => (
              <button key={n.path} className={path === n.path ? "on" : ""} onClick={() => go(n.path)}>{n.label}</button>
            ))}
          </nav>
          <div className="side-foot">
            {user.name}<br />{user.email}
            <button onClick={() => { auth.logout(); setUser(null); location.hash = ""; }}>Cerrar sesión</button>
          </div>
        </aside>

        <div>
          <div className="topbar">
            <button className="burger" onClick={() => setDrawer(!drawer)} aria-label="Menú"><i /><i /><i /></button>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 600 }}>{org.name}</span>
            <span className="who">{user.name}<br />{ROLE_LABEL[user.role]}</span>
          </div>
          {drawer && (
            <div className="drawer">
              {nav.filter((n) => !n.perm || can(user, n.perm)).map((n) => (
                <button key={n.path} onClick={() => go(n.path)}>{n.label}</button>
              ))}
              <button onClick={() => { auth.logout(); setUser(null); location.hash = ""; }} style={{ color: "var(--live)" }}>Cerrar sesión</button>
            </div>
          )}
          <main className="main">{screen}</main>
        </div>
      </div>
    </div>
  );
}
