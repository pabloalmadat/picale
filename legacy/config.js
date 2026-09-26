/* =========================================================
   CONFIGURACIÓN DEL EVENTO — edita solo este archivo
   Lo usan evento.html, overlay.html y control.html
   ========================================================= */
window.EVENTO = {
  nombre: "LEGACY",                // texto de respaldo si no carga el logo
  subtitulo: "Transmisión en vivo",
  fecha: "Sábado 26 de septiembre de 2026",
  sede: "",                         // ej. "Arena Monterrey" (vacío = no se muestra)
  rounds: 4,              // rounds por pelea
  segRound: 120,          // duración de cada round en segundos (2:00)
  segDescanso: 60,        // descanso entre rounds en segundos (1:00)

  // TWITCH: pon solo el nombre del canal (o el link del canal). La página arma el
  // reproductor y el chat sola. Ej: twitchCanal: "picale_tv"
  twitchCanal: "picalereplay",
  twitchChat: true,        // mostrar el chat de Twitch junto al video

  // Alternativa sin Twitch: link embed de YouTube u otro player. Se ignora si hay twitchCanal.
  urlEnVivo: "",

  // Logo del evento: sustituye al texto "nombre" en overlay y página (vacío = usa el texto)
  logoEvento: "legacy/logos/legacy.png",

  // Logo principal (Pícale)
  logoPrincipal: "legacy/logos/picale.png",
};

/* ---------------------------------------------------------
   CARTELERA — "replay": pega el link NORMAL del video de la pelea, tal cual
   lo copias de Twitch (momento destacado, video o clip) o de YouTube.
   Ej: "https://www.twitch.tv/videos/2280000000"
       "https://www.twitch.tv/videos/2280000000?t=1h02m30s"  (empieza en ese minuto)
   Déjalo vacío hasta que esté listo.
   --------------------------------------------------------- */
window.CARTELERA = [
  { n: 1,  a: "FLORES",   b: "RODRIGUEZ", replay: "" },
  { n: 2,  a: "PEREZ",    b: "MORTON",    replay: "" },
  { n: 3,  a: "MENDOZA",  b: "MORALES",   replay: "" },
  { n: 4,  a: "FLORES",   b: "MALDONADO", replay: "" },
  { n: 5,  a: "CADENA",   b: "AMBRIZ",    replay: "" },
  { n: 6,  a: "GRANADOS", b: "TENIENTE",  replay: "" },
  { n: 7,  a: "CUESTAS",  b: "RAMSIE",    replay: "" },
  { n: 8,  a: "TOUCHE",   b: "SALAZAR",   replay: "" },
  { n: 9,  a: "ROBLES",   b: "CHAVEZ",    replay: "" },
  { n: 10, a: "GONZALEZ", b: "FLORES",    replay: "" },
  { n: 11, a: "GONZALEZ", b: "FELIX",     replay: "" },
  { n: 12, a: "CAMACHO",  b: "RODRIGUEZ", replay: "" },
  { n: 13, a: "VARGAS",   b: "CRUZ",      replay: "" },
  { n: 14, a: "MONTALVO", b: "AYALA",     replay: "" },
];

/* ---------------------------------------------------------
   LOGOS / MARCAS ALIADAS — sin Banregio.
   Los PNG ya van en la carpeta /logos (limpios y recortados).
   Si un archivo no existe, simplemente no se muestra.
   Para quitar todos los logos: deja la lista vacía  [ ]
   --------------------------------------------------------- */
window.LOGOS = [
  { nombre: "Nube Digital Studio",              archivo: "legacy/logos/nds.png" },
  { nombre: "Aragón",            archivo: "legacy/logos/aragon.png" },
  { nombre: "Palmar",            archivo: "legacy/logos/palmar.png" },
  { nombre: "Conteo",            archivo: "legacy/logos/conteo.png" },
  { nombre: "Booth",             archivo: "legacy/logos/booth.png" },
  { nombre: "Brief",             archivo: "legacy/logos/brief.png" },
  { nombre: "Llama Legal",       archivo: "legacy/logos/llama-legal.png" },
  { nombre: "Donut Disturb",     archivo: "legacy/logos/donut-disturb.png" },
  { nombre: "Legends",           archivo: "legacy/logos/legends.png" },
  { nombre: "Principia",         archivo: "legacy/logos/principia.png" },
  { nombre: "Legacy Revolution", archivo: "legacy/logos/legacy.png" },
];

/* ---------------------------------------------------------
   CÁMARAS AL PÚBLICO — marcos que van encima de la cámara
   (el centro queda transparente). Puedes cambiar textos y colores.
   --------------------------------------------------------- */
window.CAMS = [
  { id: "kiss",   titulo: "KISS CAM",       sub: "¡Beso o abucheo!",                 color: "#ff3d8b", fx: ["❤","💋","😘"] },
  { id: "shot",   titulo: "SHOT CAM",       sub: "Uno por la pelea",                 color: "#f2a900", fx: ["🥃","🍻","🔥"], cuenta: true },
  { id: "flex",   titulo: "FLEX CAM",       sub: "Enséñanos el músculo",             color: "#e3262f", fx: ["💪","🔥","🏆"] },
  { id: "ruge",   titulo: "RUGE CAM",       sub: "Que se oiga hasta el ring",        color: "#ff7a00", fx: ["📣","🔊","🗣️"], medidor: true },
  { id: "baile",  titulo: "DANCE CAM",      sub: "Mueve el esqueleto entre rounds",  color: "#9b5cff", fx: ["🕺","💃","🎶"] },
  { id: "guerra", titulo: "CARA DE GUERRA", sub: "Tu mejor cara de pelea",           color: "#e8b84a", fx: ["😤","🥊","⚡"] },
  { id: "fan",    titulo: "FAN CAM",        sub: "¿Esquina roja o esquina azul?",    color: "#1d63c9", fx: ["🔴","🔵","🥊"], esquinas: true },
];

/* ---------------------------------------------------------
   Estado compartido overlay <-> panel de control (no editar)
   --------------------------------------------------------- */
window.BoxState = (function () {
  const KEY = "picale-box-state";
  const E = window.EVENTO;
  const def = { pelea: 1, round: 1, lowerThird: true, bug: true, pantalla: "none", ganador: "", logos: true,
                tMode: "round", tRun: false, tLeft: E.segRound * 1000, tEnd: 0 };
  let ch = null;
  try { ch = new BroadcastChannel("picale-box"); } catch (e) {}
  function get() {
    try { return Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { return Object.assign({}, def); }
  }
  function set(patch) {
    const s = Object.assign(get(), patch, { t: Date.now() });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    if (ch) ch.postMessage(s);
    return s;
  }
  function on(cb) {
    if (ch) ch.onmessage = (e) => cb(e.data);
    window.addEventListener("storage", (e) => { if (e.key === KEY) cb(get()); });
    let last = 0;
    setInterval(() => { const s = get(); if ((s.t || 0) !== last) { last = s.t || 0; cb(s); } }, 700);
  }
  // ---- cronómetro (se calcula con la hora, así overlay y panel siempre coinciden) ----
  function restante(st) { return st.tRun ? Math.max(0, st.tEnd - Date.now()) : st.tLeft; }
  function fmt(ms) { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  const T = {
    iniciar(st) { const l = restante(st); return l > 0 ? { tRun: true, tEnd: Date.now() + l } : {}; },
    pausar(st)  { return { tRun: false, tLeft: restante(st) }; },
    alternar(st){ return st.tRun ? T.pausar(st) : T.iniciar(st); },
    reiniciar(modo) { return { tRun: false, tMode: modo || "round", tLeft: ((modo === "descanso") ? E.segDescanso : E.segRound) * 1000 }; },
  };
  return { get, set, on, def, restante, fmt, T };
})();
