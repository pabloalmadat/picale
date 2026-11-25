/* PÍCALE · Sistema del club: datos de canchas y llamadas compartidas por
   panel.html (administrador), control.html (marcador desde el celular) y pantalla.html (TV de cancha). */
(function () {
  var API = 'https://api.picalereplay.com';
  var CLUBS = {
    somos: {
      id: 'somos', name: 'Somos Pádel', playtomic: true,
      courts: [
        { n: 1, uuid: '6bc0621c-f99a-4e1f-8971-d70155ea3383', key: '2111bf2250a5751d' },
        { n: 2, uuid: 'e1dc778e-831f-4fa4-bc86-d6a31a7de1d1', key: 'e6835934e7a68e22' },
        { n: 3, uuid: 'fc8bbc6d-e21b-466d-92e6-a2beefe6bd38', key: 'c776bfbbe6618fe4' },
        { n: 4, uuid: '2d54ad6f-895f-4f6c-b985-95b431fe03b3', key: 'f132a6e907de3361' },
        { n: 5, uuid: '28b6283d-dacf-428d-a3fb-fc0015d5f6aa', key: 'e4df4f9f11a4b00d' },
        { n: 6, uuid: '519bbd5d-b2f5-4a84-a257-6d327bebf9a8', key: 'e1f8c1f9fa4ea04f' },
        { n: 7, uuid: '28d80e5a-9f47-4bf8-a8e9-7d1dd0cfb512', key: '872566c01554f2e7' },
        { n: 8, uuid: '35c16c54-f31e-4397-922b-044722d06524', key: '410266125aa0e463' }
      ]
    },
    cuatro: {
      id: 'cuatro', name: 'Cuatro Pádel Sur', playtomic: false,     // Playtomic de Cuatro: siguiente etapa
      courts: [{ n: 1, uuid: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', key: 'c4f9a17e2d8b5048' }]
    }
  };

  function q(name, def) { return new URLSearchParams(location.search).get(name) || def; }
  function json(url, opt, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, ms || 10000);
    return fetch(url, Object.assign({ cache: 'no-store', signal: ctl && ctl.signal }, opt || {}))
      .then(function (r) { clearTimeout(t); if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  function post(url, body) {
    return json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }

  var P = window.PICALE_CLUB = {
    API: API, CLUBS: CLUBS, q: q,
    club: function () { return CLUBS[q('club', 'somos')] || CLUBS.somos; },
    court: function (club, n) { return club.courts.filter(function (c) { return c.n === +n; })[0] || club.courts[0]; },
    hls: function (c) { return API + '/hls/' + c.key + '/index.m3u8'; },

    // ── Playtomic (solo Somos por ahora) ──
    // Playtomic puede tardar (el servidor consulta a Playtomic en ese momento): 30 s, y un reintento
    today: function () {
      var u = API + '/api/v1/playtomic/today';
      return json(u, null, 30000).catch(function () { return json(u, null, 30000); })
        .then(function (d) {
          // Si el servidor solo manda la lista "bookings", se agrupa por cancha aquí
          if (d && !d.by_court && Array.isArray(d.bookings)) {
            d.by_court = {};
            d.bookings.forEach(function (b) { var k = String(b.court_num); (d.by_court[k] = d.by_court[k] || []).push(b); });
          }
          if (!d || !d.by_court) throw new Error('respuesta sin reservas: ' + JSON.stringify(d).slice(0, 120));
          return d;
        });
    },
    courtNow: function (n) { return json(API + '/api/v1/playtomic/court/' + n + '/now'); },
    bookingsFor: function (today, n) { return ((today && today.by_court) || {})[String(n)] || []; },
    live: function (arr) { return arr.filter(function (b) { return b.status === 'IN_PROGRESS'; })[0] || null; },
    upcoming: function (arr) {
      var now = P.localIso();
      var st = function (b) { return String(b.start || '').replace('Z', '').slice(0, 19); };
      return arr.filter(function (b) { return b.status !== 'IN_PROGRESS' && st(b) > now; })
        .sort(function (a, b) { return st(a) < st(b) ? -1 : 1; });
    },
    isClass: function (b) { return !!b && (b.display_type === 'clase' || /clase|lesson|class/i.test(b.booking_type || '')); },
    kind: function (b) {
      if (!b) return 'Libre';
      if (b.booking_type === 'TOURNAMENT') return 'Reta';
      return ({ partido: 'Partido', reserva: 'Reserva', clase: 'Clase', torneo: 'Torneo' })[b.display_type] || 'Reserva';
    },
    teams: function (b) {
      // Quita los lugares vacíos que manda Playtomic ("Participante 1", "Jugador 2")
      var ok = function (x) { x = typeof x === 'string' ? x : (x && (x.name || x.full_name)) || ''; return x && !/^(participante|jugador)\s*\d+$/i.test(x.trim()) ? x : null; };
      var clean = function (a) { return (a || []).map(ok).filter(Boolean); };
      var L = clean(b && b.team_left), R = clean(b && b.team_right);
      if (!L.length && !R.length && b && b.participants) { var p = clean(b.participants); L = p.slice(0, 2); R = p.slice(2, 4); }
      return { L: L, R: R };
    },
    // Playtomic manda la hora local del club sin zona: se compara contra la hora local de Monterrey
    localIso: function () {
      var d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
      var z = function (x) { return String(x).padStart(2, '0'); };
      return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
    },
    hhmm: function (iso) { return iso ? String(iso).substring(11, 16) : '--:--'; },

    // ── Marcador ──
    active: function (c) {
      return json(API + '/api/v1/score/court/' + c.uuid + '/active')
        .then(function (d) { return d && d.match_id ? d.match_id : null; })
        .catch(function (e) { if (e.status === 404) return null; throw e; });
    },
    match: function (id) { return json(API + '/api/v1/score/' + id); },
    create: function (club, c, f) {
      return post(API + '/api/v1/score/', {
        court_id: c.uuid, court_name: 'Cancha ' + c.n, club_name: club.name,
        left_p1: f.l1 || 'Jugador 1', left_p2: f.l2 || '', right_p1: f.r1 || 'Jugador 3', right_p2: f.r2 || '',
        current_server: f.server || 'left', scoring_mode: f.mode || 'traditional'
      });
    },
    event: function (id, type, source) { return post(API + '/api/v1/score/' + id + '/event', { type: type, source: source || 'celular' }); },
    socket: function (id, onState) {
      var ws, closed = false;
      function open() {
        try { ws = new WebSocket('wss://api.picalereplay.com/api/v1/score/' + id + '/ws'); } catch (e) { return; }
        ws.onmessage = function (e) { try { var m = JSON.parse(e.data); if (m.state) onState(m.state); } catch (x) {} };
        ws.onclose = function () { if (!closed) setTimeout(open, 2000); };
      }
      open();
      return { close: function () { closed = true; try { ws.close(); } catch (e) {} } };
    },

    // ── Transmisión: ¿llegan pedazos nuevos? (compara la secuencia en dos lecturas) ──
    _seq: {},
    stream: function (c) {
      return fetch(P.hls(c) + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) return 'off';
        return r.text().then(function (t) {
          var m = /MEDIA-SEQUENCE:(\d+)/.exec(t); if (!m) return 'off';
          var prev = P._seq[c.key]; P._seq[c.key] = +m[1];
          return prev === undefined ? 'on?' : (+m[1] > prev ? 'on' : 'stuck');
        });
      }).catch(function () { return 'off'; });
    },
    // ── Botón: último clip ──
    lastClip: function (c) {
      return json(API + '/api/v1/clips/?court_id=' + c.uuid + '&limit=1')
        .then(function (d) { return (d.clips || [])[0] || null; });
    },
    ago: function (ts) {
      if (!ts) return '—';
      var t = typeof ts === 'number' ? ts * 1000 : Date.parse(ts);
      var s = (Date.now() - t) / 1000;
      if (s < 90) return 'hace un momento';
      if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
      if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
      return 'hace ' + Math.round(s / 86400) + ' d';
    },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  };
})();
