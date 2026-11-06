/* PÍCALE App — una sola página, router por hash.
 * Usa el mismo API que la web (api.picalereplay.com).
 * Endpoints nuevos (partido completo, créditos, dispositivos) están en docs/APP-BACKEND.md.
 */
(function () {
  'use strict';
  var CFG = window.PICALE_CONFIG;
  var API = CFG.API;
  var Cap = window.Capacitor || null;
  var Plugins = (Cap && Cap.Plugins) || {};
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var $view = document.getElementById('view');

  // ───────────────────────── storage (Preferences en nativo, localStorage en web)
  var store = {
    get: function (k) {
      if (Plugins.Preferences) return Plugins.Preferences.get({ key: k }).then(function (r) { return r.value; });
      try { return Promise.resolve(localStorage.getItem(k)); } catch (e) { return Promise.resolve(null); }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) {}
      if (Plugins.Preferences) return Plugins.Preferences.set({ key: k, value: v });
      return Promise.resolve();
    },
    del: function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
      if (Plugins.Preferences) return Plugins.Preferences.remove({ key: k });
      return Promise.resolve();
    },
  };

  var S = { token: null, user: null, sport: 'padel', credits: null, activeMatch: null, timer: null, hls: null, demo: false };

  // ───────────────────────── helpers
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function api(path, opts) {
    opts = opts || {};
    var h = opts.headers || {};
    if (S.token) h.Authorization = 'Bearer ' + S.token;
    if (opts.json !== undefined) { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    opts.headers = h;
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401) { logout(true); throw { status: 401 }; }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw { status: r.status, data: d };
        return d;
      });
    });
  }
  function notReady(e) { return e && (e.status === 404 || e.status === 405 || e.status === 501); }
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function haptic() { if (Plugins.Haptics) Plugins.Haptics.impact({ style: 'MEDIUM' }).catch(function () {}); }
  function allCourts() {
    var out = [];
    window.PICALE_CLUBS.forEach(function (c) { c.courts.forEach(function (ct) { out.push(Object.assign({ club: c.name, clubId: c.id, sport: c.sport }, ct)); }); });
    return out;
  }
  function courtById(id) { return allCourts().filter(function (c) { return c.courtId === id || c.key === id; })[0] || null; }

  // ───────────────────────── auth
  function saveSession(data) {
    S.token = data.access_token;
    S.user = { id: data.user_id, name: data.name, username: data.username, photo_url: data.photo_url };
    return Promise.all([store.set('picale_token', S.token), store.set('picale_user', JSON.stringify(S.user))]);
  }
  function logout(silent) {
    S.token = null; S.user = null; S.credits = null;
    store.del('picale_token'); store.del('picale_user');
    if (!silent) toast('Sesión cerrada');
    location.hash = '#/login';
  }
  function boot() {
    Promise.all([store.get('picale_token'), store.get('picale_user'), store.get('picale_sport')]).then(function (v) {
      S.token = v[0];
      try { S.user = JSON.parse(v[1] || 'null'); } catch (e) { S.user = null; }
      S.sport = v[2] || 'padel';
      S.demo = /[?&]demo=1/.test(location.search);
      // QR escaneado con la cámara normal: /c/<código> manda aquí con ?qr=<código>
      var qp = new URLSearchParams(location.search), qr = qp.get('qr');
      if (qr) {
        S.pendingQR = CFG.WEB + '/c/' + qr;
        qp.delete('qr');
        var qs = qp.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
      renderSport();
      if (!S.token) {
        var h0 = location.hash;
        S.next = h0 && h0 !== '#/login' && h0 !== '#/' ? h0 : (S.pendingQR ? '#/partido' : null);
        return finishBoot('#/login');
      }
      // Valida el token en segundo plano: si responde, entra directo a Mis clips.
      api('/api/v1/auth/me').then(function (me) {
        S.user = Object.assign(S.user || {}, me);
        store.set('picale_user', JSON.stringify(S.user));
        afterLogin();
      }).catch(function (e) {
        if (e && e.status === 401) return finishBoot('#/login');
        afterLogin(); // sin internet: deja entrar con lo guardado
      });
    });
  }
  function finishBoot(hash) {
    var sp = document.getElementById('splash');
    if (sp) { sp.style.opacity = 0; setTimeout(function () { sp.remove(); }, 300); }
    if (hash && location.hash !== hash) location.hash = hash; else route();
  }
  function afterLogin() {
    registerPush();
    initPurchases();
    var h = location.hash;
    var target = S.next || (S.pendingQR ? '#/partido' : null);
    S.next = null;
    if (target) return finishBoot(target);
    finishBoot(!h || h === '#/login' || h === '#/' ? '#/clips' : null);
  }

  // ───────────────────────── sport toggle
  function renderSport() {
    var el = document.getElementById('sport-toggle');
    el.innerHTML = Object.keys(CFG.SPORTS).map(function (k) {
      return '<span data-s="' + k + '" class="' + (S.sport === k ? 'on' : '') + '">' + CFG.SPORTS[k].emoji + ' ' + CFG.SPORTS[k].label + '</span>';
    }).join('');
  }
  document.getElementById('sport-toggle').addEventListener('click', function (e) {
    var s = e.target.closest('[data-s]'); if (!s) return;
    S.sport = s.getAttribute('data-s'); store.set('picale_sport', S.sport); renderSport(); haptic(); route();
  });

  // ───────────────────────── router
  var routes = {
    login: viewLogin, clips: viewClips, vivo: viewVivo, partido: viewPartido,
    analisis: viewAnalisis, perfil: viewPerfil, creditos: viewCreditos, admin: viewAdmin,
    club: viewClub, americana: viewAmericana,
  };
  function route() {
    stopHls();
    var parts = (location.hash.replace(/^#\/?/, '') || 'clips').split('/');
    var name = parts[0];
    if (!S.token && name !== 'login') { S.next = location.hash; location.hash = '#/login'; return; }
    var fn = routes[name] || viewClips;
    var chrome = name !== 'login';
    document.getElementById('topbar').classList.toggle('hidden', !chrome);
    document.getElementById('tabbar').classList.toggle('hidden', !chrome);
    $view.classList.toggle('full', !chrome);
    var tab = name === 'americana' ? 'partido' : name === 'club' ? 'perfil' : name;
    document.querySelectorAll('.tabbar a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
    window.scrollTo(0, 0);
    fn(parts.slice(1));
  }
  window.addEventListener('hashchange', route);

  // ───────────────────────── LOGIN
  function viewLogin() {
    var mode = 'login';
    function draw() {
      $view.innerHTML =
        '<div class="login">' +
        '<div class="logo">PÍ<span>CALE</span></div><div class="tagline">TU JUGADA MÁS CERCA</div>' +
        '<div class="seg"><button data-m="login" class="' + (mode === 'login' ? 'on' : '') + '">Entrar</button><button data-m="reg" class="' + (mode === 'reg' ? 'on' : '') + '">Crear cuenta</button></div>' +
        (mode === 'reg'
          ? '<label class="field"><span>Nombre</span><input id="f-name" autocomplete="name"></label>' +
            '<label class="field"><span>Usuario (opcional)</span><input id="f-user" autocapitalize="none" autocomplete="username"></label>'
          : '') +
        '<label class="field"><span>Correo</span><input id="f-email" type="email" inputmode="email" autocapitalize="none" autocomplete="email"></label>' +
        '<label class="field"><span>Contraseña</span><input id="f-pass" type="password" autocomplete="' + (mode === 'reg' ? 'new-password' : 'current-password') + '"></label>' +
        '<div class="err" id="f-err"></div>' +
        '<button class="btn mt" id="f-go">' + (mode === 'reg' ? 'CREAR CUENTA' : 'ENTRAR') + '</button>' +
        '<p class="free">' + (isNative ? 'Solo entras una vez. La app te mantiene con tu sesión.' : 'Es la misma cuenta de picalereplay.com.') + '</p>' +
        (isNative ? '' : '<p class="free"><a class="link" href="/">‹ Volver a picalereplay.com</a></p>') +
        '</div>';
      $view.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { mode = b.getAttribute('data-m'); draw(); }; });
      $view.querySelector('#f-go').onclick = submit;
      $view.querySelector('#f-pass').onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    }
    function submit() {
      var btn = $view.querySelector('#f-go'), err = $view.querySelector('#f-err');
      var email = $view.querySelector('#f-email').value.trim(), pass = $view.querySelector('#f-pass').value;
      if (!email || !pass) { err.textContent = 'Escribe tu correo y contraseña'; return; }
      var body = { email: email, password: pass };
      if (mode === 'reg') {
        body.name = $view.querySelector('#f-name').value.trim();
        body.username = $view.querySelector('#f-user').value.trim() || null;
        if (!body.name) { err.textContent = 'Escribe tu nombre'; return; }
      }
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; err.textContent = '';
      api('/api/v1/auth/' + (mode === 'reg' ? 'register' : 'login'), { method: 'POST', json: body })
        .then(saveSession)
        .then(function () { haptic(); afterLogin(); })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = mode === 'reg' ? 'CREAR CUENTA' : 'ENTRAR';
          var d = (e && e.data && e.data.detail) || '';
          err.textContent = typeof d === 'string' && d ? d : (mode === 'reg' ? 'No se pudo crear la cuenta' : 'Correo o contraseña incorrectos');
        });
    }
    draw();
  }

  // ───────────────────────── MIS CLIPS
  function viewClips() {
    var name = (S.user && (S.user.name || S.user.username)) || '';
    $view.innerHTML = '<h1>Mis clips</h1><p class="sub">' + (name ? 'Hola ' + esc(name.split(' ')[0]) + '. ' : '') +
      'Tus jugadas guardadas y su análisis, gratis.</p><div id="clips" class="mt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    if (S.sport === 'futbol') return clipsFutbol();
    if (!S.user || !S.user.id) return;
    api('/api/v1/social/users/' + S.user.id + '/clips').then(function (d) {
      var clips = d.clips || [];
      var box = document.getElementById('clips'); if (!box) return;
      if (!clips.length) {
        box.innerHTML = '<div class="empty"><div class="ico">🎾</div>Aún no tienes clips.<br>Pícale al botón en la cancha y guárdalos desde <b>En vivo</b>.</div>';
        return;
      }
      box.innerHTML = '<div class="grid">' + clips.map(function (c, i) {
        var ct = courtById(c.court_id);
        var ai = c.analysis || c.ai_label || c.shot_type;
        return '<button class="clip" data-i="' + i + '">' +
          (c.thumbnail_url ? '<img src="' + esc(c.thumbnail_url) + '" loading="lazy">' : '<video src="' + esc(c.url) + '#t=0.5" preload="metadata" muted playsinline></video>') +
          (ai ? '<span class="badge ai">AI · ' + esc(typeof ai === 'string' ? ai : (ai.shot_type || 'análisis')) + '</span>' : '') +
          '<div class="meta"><b>' + esc(ct ? ct.club : 'PÍCALE') + '</b>' + esc((ct ? ct.name + ' · ' : '') + fmtTime(c.created_at)) + '</div></button>';
      }).join('') + '</div>';
      box.querySelectorAll('.clip').forEach(function (b) { b.onclick = function () { openClip(clips[+b.getAttribute('data-i')]); }; });
    }).catch(function () {
      var box = document.getElementById('clips'); if (box) box.innerHTML = '<div class="empty">No pudimos cargar tus clips. Revisa tu conexión.</div>';
    });
  }
  function clipsFutbol() {
    document.getElementById('clips').innerHTML =
      '<div class="empty"><div class="ico">⚽</div>Clips de fútbol muy pronto en la app.<br>Mientras, la liga está en la web.</div>' +
      '<button class="btn ghost" id="fut-web">Abrir PÍCALE Fútbol</button>';
    document.getElementById('fut-web').onclick = function () { openExternal(CFG.WEB + '/futbol'); };
  }
  function openClip(c) {
    var m = document.getElementById('modal');
    var ai = c.analysis && typeof c.analysis === 'object' ? c.analysis : null;
    m.innerHTML = '<div class="bar"><span class="sub" style="margin:0">' + esc(fmtTime(c.created_at)) + '</span><button class="x" id="mx">×</button></div>' +
      '<video src="' + esc(c.url) + '" controls autoplay playsinline></video>' +
      (ai ? '<div style="padding:12px 16px 0"><span class="chip green">AI</span> <span class="sub">' + esc(ai.summary || ai.shot_type || '') + '</span></div>' : '') +
      '<div class="acts"><button class="btn ghost" id="msave">Guardar</button><button class="btn" id="mshare">Compartir</button></div>';
    m.classList.remove('hidden');
    m.querySelector('#mx').onclick = closeModal;
    m.querySelector('#mshare').onclick = function () { shareUrl(c.url, 'Mi jugada en PÍCALE'); };
    m.querySelector('#msave').onclick = function () { saveVideo(c.url); };
  }
  function closeModal() { var m = document.getElementById('modal'); m.classList.add('hidden'); m.classList.remove('solid'); m.innerHTML = ''; }

  function shareUrl(url, title) {
    if (Plugins.Share) return Plugins.Share.share({ title: title, url: url, dialogTitle: 'Compartir' }).catch(function () {});
    if (navigator.share) return navigator.share({ title: title, url: url }).catch(function () {});
    navigator.clipboard && navigator.clipboard.writeText(url); toast('Link copiado');
  }
  function saveVideo(url) {
    // En nativo: descarga a archivos y abre el share sheet (ahí aparece "Guardar video").
    if (Plugins.Filesystem && Plugins.FileTransfer && Plugins.Share) {
      toast('Descargando…');
      var name = 'picale_' + Date.now() + '.mp4';
      Plugins.Filesystem.getUri({ directory: 'CACHE', path: name })
        .then(function (u) { return Plugins.FileTransfer.downloadFile({ url: url, path: u.uri }).then(function () { return u.uri; }); })
        .then(function (uri) { return Plugins.Share.share({ files: [uri], dialogTitle: 'Guardar clip' }); })
        .catch(function () { toast('No se pudo descargar'); });
      return;
    }
    openExternal(url);
  }
  function openExternal(url) {
    if (Plugins.Browser) Plugins.Browser.open({ url: url }); else window.open(url, '_blank');
  }

  // ───────────────────────── EN VIVO
  function viewVivo(args) {
    var clubs = window.PICALE_CLUBS.filter(function (c) { return c.sport === S.sport; });
    if (args[0]) {
      var ct = courtById(args[0]);
      if (!ct) { location.hash = '#/vivo'; return; }
      $view.innerHTML = '<a href="#/vivo" class="link">‹ Canchas</a><h1 class="mt">' + esc(ct.club) + '</h1><p class="sub">' + esc(ct.name) + (ct.sub ? ' · ' + esc(ct.sub) : '') + '</p>' +
        '<div class="player mt"><video id="live" playsinline muted autoplay controls></video><span class="chip red live"><span class="dot"></span>EN VIVO</span></div>' +
        '<button class="btn mt" id="start-here">Analizar en esta cancha</button>' +
        '<button class="btn ghost" id="share-live">Compartir transmisión</button>';
      playHls(document.getElementById('live'), ct.hls);
      document.getElementById('start-here').onclick = function () { location.hash = '#/partido'; };
      document.getElementById('share-live').onclick = function () { shareUrl(CFG.WEB + '/tv.html?hls=' + encodeURIComponent(ct.hls) + '&name=' + encodeURIComponent(ct.club + ' ' + ct.name), 'En vivo en PÍCALE'); };
      return;
    }
    $view.innerHTML = '<h1>En vivo</h1><p class="sub">Canchas transmitiendo ahora.</p>' +
      (clubs.length ? clubs.map(function (c) {
        return '<h2>' + esc(c.name) + ' <span class="sub" style="font-family:var(--body);font-size:13px">· ' + esc(c.city) + '</span></h2><div class="list">' +
          c.courts.map(function (ct) {
            return '<a class="item" href="#/vivo/' + ct.key + '"><span class="dot"></span><div><div class="ttl">' + esc(ct.name) + '</div>' +
              (ct.sub ? '<div class="dsc">' + esc(ct.sub) + '</div>' : '') + '</div><span class="chev">›</span></a>';
          }).join('') + '</div>';
      }).join('') : '<div class="empty"><div class="ico">⚽</div>Todavía no hay canchas de fútbol transmitiendo.</div>');
  }
  function playHls(video, src) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; return; }
    if (window.Hls && Hls.isSupported()) { S.hls = new Hls({ lowLatencyMode: true }); S.hls.loadSource(src); S.hls.attachMedia(video); }
  }
  function stopHls() { if (S.hls) { S.hls.destroy(); S.hls = null; } }

  // ───────────────────────── ANALIZAR (partido o entrenamiento)
  // Flujo: usar token → escanear QR → confirmar cancha → iniciar → terminar →
  //        nombrar jugadores → se analiza en el VPS → push cuando está listo.
  function loadCredits() {
    if (S.demo) { if (S.credits === null || S.credits === undefined) S.credits = 3; return Promise.resolve(S.credits); }
    return api('/ai/credits/me').then(function (d) { S.credits = d.credits || 0; return S.credits; })
      .catch(function (e) { S.credits = notReady(e) ? null : S.credits; return S.credits; });
  }
  function loadActive() {
    if (S.demo) return Promise.resolve(S.activeMatch);
    return api('/ai/sessions/active').then(function (d) { S.activeMatch = d && d.id ? d : null; return S.activeMatch; })
      .catch(function () { return S.activeMatch; });
  }
  function tokensFor(type, min) { return type === 'training' ? Math.ceil(min / 60) : 1; }
  function typeLabel(t) { return t === 'training' ? 'Entrenamiento' : 'Partido'; }

  function viewPartido() {
    clearInterval(S.timer);
    $view.innerHTML = '<div id="pt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    if (S.sport === 'futbol') {
      document.getElementById('pt').innerHTML = '<h1>Analizar</h1><div class="empty"><div class="ico">⚽</div>El análisis completo para fútbol viene después de pádel.</div>';
      return;
    }
    Promise.all([loadCredits(), loadActive()]).then(function () {
      var m = S.activeMatch;
      if (m && m.status === 'recording') return stepRecording();
      if (m && m.status === 'naming') return stepNaming();
      if (S.pendingQR && !S.demo && !S.skipEventCheck) {
        var raw = S.pendingQR;
        return api('/ai/courts/resolve-qr', { method: 'POST', json: { qr: raw } }).then(function (c) {
          if (c.event) { S.pendingQR = null; c._raw = raw; return stepEventChoice(c); }
          stepUseToken();
        }).catch(function () { stepUseToken(); });
      }
      S.skipEventCheck = false;
      stepUseToken();
    });
  }
  function pt() { return document.getElementById('pt'); }
  function stepper(n) {
    var names = ['Token', 'Cancha', 'Juego', 'Nombres', 'Análisis'];
    return '<div class="stepper">' + names.map(function (x, i) { return '<span class="' + (i < n ? 'done' : i === n ? 'on' : '') + '">' + x + '</span>'; }).join('') + '</div>';
  }

  // 1 · Usar token
  function stepUseToken() {
    var box = pt(); if (!box) return;
    var sel = S.flow && S.flow.type ? S.flow : { type: 'match', min: CFG.FULL_MATCH_MINUTES };
    function draw() {
      var cost = tokensFor(sel.type, sel.min);
      var credits = S.credits;
      var enough = credits === null || credits >= cost;
      box.innerHTML = stepper(0) + '<h1>Analizar</h1><p class="sub">La IA analiza la sesión completa desde la cámara del club.</p>' +
        (credits === null
          ? '<div class="note">El análisis se está terminando de conectar en el servidor. <a class="link" href="?demo=1#/partido">Ver demo</a></div>'
          : '<a class="credits mt" href="#/creditos"><div><div class="sub" style="margin:0">Tus tokens</div><b>' + credits + '</b></div><span class="link">Comprar ›</span></a>') +
        '<div class="types mt">' +
          typeCard('match', '🎾', 'Partido', 'Hasta ' + CFG.FULL_MATCH_MINUTES + ' min · stats de los 4 jugadores y tus puntos en clips, sin picar el botón', '1 token') +
          typeCard('training', '🎯', 'Entrenamiento', 'Para coaches · reporte por alumno, clase completa y editor de clips', '1 token / hora') +
        '</div>' +
        (sel.type === 'training'
          ? '<h2>Duración</h2><div class="seg">' + CFG.TRAINING_MINUTES.map(function (mn) {
              return '<button data-min="' + mn + '" class="' + (sel.min === mn ? 'on' : '') + '">' + mn + ' min · ' + tokensFor('training', mn) + '</button>';
            }).join('') + '</div>'
          : '') +
        (S.pendingQR ? '<div class="note" style="border-color:var(--green-line);color:var(--text)">✓ QR de la cancha recibido. Al continuar confirmamos cuál es.</div>' : '') +
        '<button class="btn mt" id="use"' + (enough ? '' : ' disabled') + '>USAR ' + cost + ' TOKEN' + (cost > 1 ? 'S' : '') + (S.pendingQR ? ' Y CONFIRMAR CANCHA' : ' Y ESCANEAR CANCHA') + '</button>' +
        (!enough ? '<a class="btn ghost" href="#/creditos">Comprar tokens</a>' : '') +
        '<p class="free">El token se descuenta hasta que inicias. Los clips del botón y su análisis son gratis.</p>' +
        '<a class="item mt" href="#/americana" style="border:1px solid var(--line);border-radius:14px"><span class="tag">🏆</span><div><div class="ttl">¿Jugaste una americana?</div><div class="dsc">Búscate en los partidos de tu club</div></div><span class="chev">›</span></a>';
      box.querySelectorAll('[data-type]').forEach(function (b) { b.onclick = function () { sel.type = b.getAttribute('data-type'); sel.min = sel.type === 'training' ? CFG.TRAINING_MINUTES[0] : CFG.FULL_MATCH_MINUTES; haptic(); draw(); }; });
      box.querySelectorAll('[data-min]').forEach(function (b) { b.onclick = function () { sel.min = +b.getAttribute('data-min'); draw(); }; });
      box.querySelector('#use').onclick = function () {
        S.flow = { type: sel.type, min: sel.min, cost: cost };
        if (S.pendingQR) { var q = S.pendingQR; S.pendingQR = null; stepScan(); resolveQR(q); } else stepScan();
      };
    }
    function typeCard(t, ico, ttl, dsc, price) {
      return '<button class="type' + (sel.type === t ? ' sel' : '') + '" data-type="' + t + '"><span class="ico">' + ico + '</span><span class="tx"><b>' + ttl + '</b><small>' + dsc + '</small></span><span class="chip' + (sel.type === t ? ' green' : '') + '">' + price + '</span></button>';
    }
    draw();
  }

  // 2 · Escanear QR (obligatorio) → 3 · confirmar cancha
  function stepScan() {
    var box = pt(); if (!box) return;
    box.innerHTML = stepper(1) + '<button class="link" id="back">‹ Atrás</button><h1 class="mt">Escanea el QR de tu cancha</h1>' +
      '<p class="sub">Está en la reja o en la botonera de la cancha. Así sabemos exactamente qué cámara grabar.</p>' +
      '<div class="qrbox mt"><svg viewBox="0 0 120 120"><path d="M8 34V14a6 6 0 0 1 6-6h20M86 8h20a6 6 0 0 1 6 6v20M112 86v20a6 6 0 0 1-6 6H86M34 112H14a6 6 0 0 1-6-6V86"/><rect x="40" y="40" width="16" height="16" rx="2"/><rect x="64" y="40" width="16" height="16" rx="2"/><rect x="40" y="64" width="16" height="16" rx="2"/><path d="M66 66h4v4h-4zM74 74h6v6h-6z"/></svg></div>' +
      '<button class="btn mt" id="scan">ABRIR CÁMARA</button>' +
      (S.demo ? '<button class="btn ghost" id="sim">Simular escaneo (demo)</button>' : '') +
      '<div class="err" id="qerr"></div>';
    box.querySelector('#back').onclick = stepUseToken;
    box.querySelector('#scan').onclick = function () {
      scanRaw().then(function (raw) { if (raw) resolveQR(raw); });
    };
    var sim = box.querySelector('#sim'); if (sim) sim.onclick = function () { resolveQR(CFG.WEB + '/c/demo-somos-3'); };
  }
  function scanRaw() {
    var BS = Plugins.BarcodeScanner;
    if (!BS) return webScan();
    var ready = Cap.getPlatform() === 'android'
      ? BS.isGoogleBarcodeScannerModuleAvailable().then(function (r) { if (!r.available) { toast('Preparando el escáner…'); return BS.installGoogleBarcodeScannerModule(); } })
      : Promise.resolve();
    return ready.then(function () { return BS.requestPermissions(); })
      .then(function () { return BS.scan({ formats: ['QR_CODE'] }); })
      .then(function (r) { return r && r.barcodes && r.barcodes[0] && r.barcodes[0].rawValue; })
      .catch(function () { return null; });
  }
  // Escáner en el navegador: cámara trasera + BarcodeDetector (Chrome/Android) o jsQR (Safari/iPhone).
  function webScan() {
    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Tu navegador no deja usar la cámara. Escanea el QR con la cámara del teléfono.');
        return resolve(null);
      }
      var m = document.getElementById('modal');
      m.innerHTML = '<div class="bar"><span class="sub" style="margin:0">Apunta al QR de la cancha</span><button class="x" id="mx" aria-label="Cerrar">×</button></div>' +
        '<div class="scanwrap"><video id="qv" playsinline muted></video><div class="scanframe"></div></div>' +
        '<p class="free" style="padding:0 16px calc(var(--sb) + 18px)">También puedes escanearlo con la cámara normal del teléfono.</p>';
      m.classList.remove('hidden');
      var video = m.querySelector('#qv'), stream = null, done = false;
      var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      var det = null;
      try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
      function finish(v) {
        if (done) return; done = true;
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        closeModal(); resolve(v);
      }
      function next() { setTimeout(function () { requestAnimationFrame(loop); }, 120); }
      function loop() {
        if (done) return;
        if (video.readyState < 2) return next();
        if (det) {
          det.detect(video).then(function (c) { if (c && c[0]) finish(c[0].rawValue); else next(); })
            .catch(function () { det = null; next(); });
          return;
        }
        var w = video.videoWidth, h = video.videoHeight, sc = Math.min(1, 640 / Math.max(w, h));
        canvas.width = Math.round(w * sc); canvas.height = Math.round(h * sc);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var r = window.jsQR ? window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }) : null;
        if (r && r.data) return finish(r.data);
        next();
      }
      m.querySelector('#mx').onclick = function () { finish(null); };
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(function (st) { stream = st; video.srcObject = st; return video.play(); })
        .then(loop)
        .catch(function () { toast('No pudimos abrir la cámara. Revisa los permisos del navegador.'); finish(null); });
    });
  }

  // El servidor decide qué cancha es: el QR lleva un código secreto por cancha,
  // y además confirma que su cámara está transmitiendo antes de dejar iniciar.
  function resolveQR(raw) {
    var err = document.getElementById('qerr'); if (err) err.textContent = '';
    var p = S.demo
      ? Promise.resolve({ court_id: 'fc8bbc6d-e21b-466d-92e6-a2beefe6bd38', club_name: 'Somos Pádel', court_name: 'Cancha 3', sport: 'padel', stream_ok: true, hls_url: courtById('somos_c3').hls })
      : api('/ai/courts/resolve-qr', { method: 'POST', json: { qr: raw } });
    p.then(function (c) { haptic(); if (c.event && c.event.live) { c._raw = raw; return stepEventChoice(c); } stepConfirm(c); }).catch(function (e) {
      var msg = e && e.status === 404 ? 'Ese QR no es de una cancha PÍCALE.' : notReady(e) ? 'La verificación de cancha llega muy pronto.' : 'No pudimos verificar la cancha. Intenta otra vez.';
      if (err) err.textContent = msg; else toast(msg);
    });
  }
  function stepConfirm(c) {
    var box = pt(); if (!box) return;
    var f = S.flow;
    box.innerHTML = stepper(1) + '<h1>¿Es tu cancha?</h1><p class="sub">Revisa que en la cámara se vea tu cancha antes de iniciar.</p>' +
      '<div class="card mt"><div class="spread"><div><div class="sub" style="margin:0">' + esc(c.club_name) + '</div><div style="font-weight:700;font-size:22px;margin-top:2px">' + esc(c.court_name) + '</div></div>' +
        (c.stream_ok ? '<span class="chip green">✓ Cámara OK</span>' : '<span class="chip red">Sin señal</span>') + '</div>' +
        '<div class="player mt"><video id="cv" playsinline muted autoplay></video><span class="chip red live"><span class="dot"></span>EN VIVO</span></div></div>' +
      '<div class="card mt spread"><div><div class="sub" style="margin:0">' + typeLabel(f.type) + '</div><b>' + f.min + ' min</b></div><span class="chip green">' + f.cost + ' token' + (f.cost > 1 ? 's' : '') + '</span></div>' +
      '<button class="btn rec mt" id="go"' + (c.stream_ok ? '' : ' disabled') + '>● INICIAR ' + (f.type === 'training' ? 'ENTRENAMIENTO' : 'PARTIDO') + '</button>' +
      '<button class="btn ghost" id="rescan">No es mi cancha · escanear otra vez</button>' +
      (c.stream_ok ? '' : '<div class="note">' + (c.edge_online === false ? 'El club está sin conexión con PÍCALE en este momento.' : 'La cámara de esta cancha no está transmitiendo.') + ' Avisa en recepción; no se te cobrará el token.</div>');
    if (c.hls_url) playHls(document.getElementById('cv'), c.hls_url);
    box.querySelector('#rescan').onclick = function () { stopHls(); stepScan(); };
    box.querySelector('#go').onclick = function () { stopHls(); startSession(c); };
  }

  // 4 · Iniciar
  function startSession(c) {
    var f = S.flow, btn = document.getElementById('go');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    var now = Date.now() / 1000;
    var p = S.demo
      ? Promise.resolve({ id: 'demo', type: f.type, status: 'recording', court_id: c.court_id, started_at: now, ends_at: now + f.min * 60 })
      : api('/ai/sessions', { method: 'POST', json: { type: f.type, court_id: c.court_id, duration_min: f.min } });
    p.then(function (m) {
      haptic(); S.activeMatch = m; if (S.credits) S.credits -= f.cost; stepRecording();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '● INICIAR';
      var d = e && e.data && e.data.detail;
      if (e && e.status === 402) { toast('No tienes tokens suficientes'); location.hash = '#/creditos'; return; }
      if (e && e.status === 409) return toast(d || 'Ya hay una sesión grabándose en esta cancha');
      if (e && e.status === 412) return toast(d || 'La cámara no está transmitiendo');
      toast(notReady(e) ? 'Muy pronto disponible' : 'No se pudo iniciar. Intenta de nuevo.');
    });
  }

  function stepRecording() {
    var m = S.activeMatch, box = pt(); if (!box || !m) return;
    var ct = courtById(m.court_id);
    box.innerHTML = stepper(2) + '<div class="card hero-rec"><span class="chip red"><span class="dot"></span>GRABANDO · ' + esc(typeLabel(m.type).toUpperCase()) + '</span>' +
      '<div class="ring on"><div class="t" id="rt">--:--</div><div class="l">RESTANTE</div></div>' +
      '<div style="font-weight:700">' + esc(ct ? ct.club + ' · ' + ct.name : 'Tu cancha') + '</div>' +
      '<p class="sub">' + (isNative ? 'Puedes cerrar la app.' : 'Puedes cerrar esta página.') + ' Al terminar te pedimos los nombres de los jugadores.</p></div>' +
      '<button class="btn mt" id="end">FIN DEL JUEGO</button>';
    function tick() {
      var left = m.ends_at - Date.now() / 1000, el = document.getElementById('rt');
      if (!el) return clearInterval(S.timer);
      el.textContent = mmss(left);
      if (left <= 0) { clearInterval(S.timer); finish(true); }
    }
    function finish(auto) {
      var p = S.demo ? Promise.resolve({ status: 'naming' }) : api('/ai/sessions/' + m.id + '/finish', { method: 'POST' });
      p.then(function (r) {
        clearInterval(S.timer); haptic();
        if (r && r.status === 'cancelled') {
          S.activeMatch = null; S.flow = null; if (S.credits != null) S.credits += (r.refunded || 0);
          toast('Terminaste en los primeros minutos: te devolvimos tu token');
          return stepUseToken();
        }
        m.status = (r && r.status) || 'naming'; stepNaming();
      })
        .catch(function () { if (!auto) toast('No se pudo terminar. Intenta de nuevo.'); });
    }
    tick(); clearInterval(S.timer); S.timer = setInterval(tick, 1000);
    document.getElementById('end').onclick = function () {
      if (confirm('¿Terminó el juego? Dejamos de grabar y te pedimos los nombres.')) finish(false);
    };
  }

  // 5 · Nombres: foto del final de la sesión con los jugadores detectados; tocas a cada uno.
  function stepNaming() {
    var m = S.activeMatch, box = pt(); if (!box || !m) return;
    box.innerHTML = stepper(3) + '<h1>¿Quiénes jugaron?</h1><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div><p class="mt">Sacando una foto de la cancha…</p></div>';
    var tries = 0;
    function loadSnap() {
      var p = S.demo ? Promise.resolve(demoSnapshot()) : api('/ai/sessions/' + m.id + '/snapshot');
      p.then(function (snap) {
        // El último pedazo de video tarda unos segundos en llegar del club
        if (snap && snap.pending && tries++ < 40) { if (pt()) setTimeout(loadSnap, 3000); return; }
        drawNaming(snap && !snap.pending ? snap : { image_url: null, people: [] });
      }).catch(function () { drawNaming({ image_url: null, people: [] }); });
    }
    loadSnap();

    function drawNaming(snap) {
      var people = snap.people && snap.people.length ? snap.people
        : [{ track_id: 'A', box: null, hint: 'Cerca · izquierda' }, { track_id: 'B', box: null, hint: 'Cerca · derecha' }, { track_id: 'C', box: null, hint: 'Fondo · izquierda' }, { track_id: 'D', box: null, hint: 'Fondo · derecha' }];
      var names = S.flow && S.flow.names || {};
      var training = m.type === 'training';
      function draw() {
        var meTaken = Object.keys(names).some(function (k) { return names[k].me; });
        box.innerHTML = stepper(3) + '<h1>¿Quiénes ' + (training ? 'entrenaron' : 'jugaron') + '?</h1><p class="sub">Toca a cada ' + (training ? 'alumno' : 'jugador') + ' en la foto y escribe su nombre. Así cada quien recibe sus propias estadísticas.</p>' +
          (snap.image_url
            ? '<div class="snap mt"><img src="' + esc(snap.image_url) + '">' + people.filter(function (p) { return p.box; }).map(function (p) {
                var b = p.box, n = names[p.track_id];
                return '<button class="pbox' + (n ? ' named' : '') + '" data-t="' + esc(p.track_id) + '" style="left:' + b[0] * 100 + '%;top:' + b[1] * 100 + '%;width:' + b[2] * 100 + '%;height:' + b[3] * 100 + '%"><span>' + esc(n ? (n.me ? 'Yo' : n.name) : p.track_id) + '</span></button>';
              }).join('') + '</div>'
            : '') +
          '<div class="list mt">' + people.map(function (p) {
            var n = names[p.track_id];
            return '<button class="item" style="width:100%;text-align:left" data-t="' + esc(p.track_id) + '"><span class="tag">' + esc(p.track_id) + '</span><div><div class="ttl">' + (n ? esc(n.me ? 'Yo' : n.name) : (training ? 'Alumno' : 'Jugador') + ' ' + esc(p.track_id)) + '</div>' +
              (p.hint ? '<div class="dsc">' + esc(p.hint) + '</div>' : '') + '</div><span class="chev">' + (n ? '✓' : '›') + '</span></button>';
          }).join('') + '</div>' +
          '<button class="btn mt" id="analyze"' + (Object.keys(names).length ? '' : ' disabled') + '>ANALIZAR ' + (training ? 'ENTRENAMIENTO' : 'PARTIDO') + '</button>' +
          '<p class="free">' + (training ? 'Si tú como coach no sales en cámara, solo nombra a tus alumnos.' : 'Mínimo márcate a ti.') + ' A quien tenga cuenta escríbelo con @usuario y le llegará su reporte.</p>';
        box.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { ask(b.getAttribute('data-t'), meTaken); }; });
        box.querySelector('#analyze').onclick = submit;
      }
      function ask(tid, meTaken) {
        var mm = document.getElementById('modal');
        var cur = names[tid];
        mm.innerHTML = '<div class="sheet"><h1 style="font-size:26px">' + (training ? 'Alumno ' : 'Jugador ') + esc(tid) + '</h1>' +
          (!meTaken || (cur && cur.me) ? '<button class="btn mt" id="w-me">Soy yo</button>' : '') +
          '<label class="field"><span>Nombre o @usuario de PÍCALE</span><input id="w-name" autocapitalize="words" value="' + esc(cur && !cur.me ? cur.name : '') + '"></label>' +
          '<button class="btn ghost mt" id="w-ok">Guardar</button>' +
          (cur ? '<button class="btn danger" id="w-clr">Quitar</button>' : '') + '</div>';
        mm.classList.remove('hidden');
        mm.onclick = function (e) { if (e.target === mm) closeModal(); };
        var me = mm.querySelector('#w-me'); if (me) me.onclick = function () { names[tid] = { me: true }; closeModal(); draw(); };
        mm.querySelector('#w-ok').onclick = function () { var v = mm.querySelector('#w-name').value.trim(); if (v) names[tid] = { name: v }; closeModal(); draw(); };
        var clr = mm.querySelector('#w-clr'); if (clr) clr.onclick = function () { delete names[tid]; closeModal(); draw(); };
        setTimeout(function () { var i = mm.querySelector('#w-name'); if (i && !me) i.focus(); }, 50);
      }
      function submit() {
        var payload = { players: Object.keys(names).map(function (k) {
          var a = names[k];
          if (a.me) return { track_id: k, me: true };
          return /^@/.test(a.name) ? { track_id: k, username: a.name.slice(1) } : { track_id: k, display_name: a.name };
        }) };
        var btn = box.querySelector('#analyze'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
        var p2 = S.demo ? Promise.resolve({ status: 'queued' }) : api('/ai/sessions/' + m.id + '/players', { method: 'PUT', json: payload });
        p2.then(function () {
          haptic();
          if (S.demo) { S._demoNames = names; S._demoType = m.type; S._demoReadyAt = Date.now() + 6000; }
          S.activeMatch = null; S.flow = null;
          stepQueued(m);
        }).catch(function () { btn.disabled = false; btn.textContent = 'ANALIZAR'; toast('No se pudo enviar. Intenta de nuevo.'); });
      }
      draw();
    }
  }

  // 6 · Se analiza en el VPS  ·  7 · push cuando está listo
  function stepQueued(m) {
    var box = pt(); if (!box) return;
    box.innerHTML = stepper(4) + '<div class="card hero-rec"><div class="ring"><div class="t">AI</div><div class="l">ANALIZANDO</div></div>' +
      '<div style="font-weight:700;font-size:17px">Estamos analizando tu ' + (m.type === 'training' ? 'entrenamiento' : 'partido') + '</div>' +
      '<p class="sub">' + (isNative ? 'Te llega una notificación cuando esté listo.' : 'Puedes cerrar esta página: tu análisis aparece en la pestaña Análisis cuando esté listo.') + ' Normalmente tarda unos minutos.</p><div class="progress"><i></i></div></div>' +
      '<a class="btn ghost mt" href="#/analisis">Ver mis análisis</a>';
    if (S.demo) setTimeout(function () { toast('🔔 Tu análisis está listo'); }, 6000);
  }

  // ───────────────────────── ANÁLISIS
  function viewAnalisis(args) {
    clearInterval(S.timer);
    if (args[0]) return analisisDetail(args[0]);
    $view.innerHTML = '<h1>Análisis</h1><p class="sub">Tus partidos y entrenamientos analizados por IA.</p><div id="al" class="mt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    var p = S.demo ? Promise.resolve({ sessions: [demoSession(S._demoType || 'match'), demoSession('training', 'demo-t')] }) : api('/ai/sessions/me');
    p.then(function (d) {
      var list = d.sessions || [], box = document.getElementById('al'); if (!box) return;
      if (!list.length) { box.innerHTML = '<div class="empty"><div class="ico">📊</div>Aún no tienes análisis.</div><a class="btn" href="#/partido">Analizar un partido</a>'; return; }
      box.innerHTML = '<div class="list">' + list.map(function (m) {
        var ct = courtById(m.court_id);
        return '<a class="item" href="#/analisis/' + m.id + '"><span class="tag">' + (m.type === 'training' ? '🎯' : '🎾') + '</span><div><div class="ttl">' + esc(typeLabel(m.type)) + ' · ' + esc(ct ? ct.club : '') + '</div><div class="dsc">' + esc((ct ? ct.name + ' · ' : '') + fmtTime(m.started_at)) + '</div></div>' +
          '<span style="margin-left:auto">' + statusChip(m.status) + '</span></a>';
      }).join('') + '</div>';
    }).catch(function (e) {
      var box = document.getElementById('al'); if (!box) return;
      box.innerHTML = notReady(e)
        ? '<div class="empty"><div class="ico">📊</div>El análisis completo llega muy pronto.</div><a class="btn ghost" href="?demo=1#/analisis">Ver ejemplos</a>'
        : '<div class="empty">No pudimos cargar tus análisis.</div>';
    });
  }
  function statusChip(s) {
    var map = { cancelled: ['', 'Cancelada'], waiting_video: ['amber', 'Recibiendo video'], recording: ['red', 'Grabando'], naming: ['amber', 'Faltan nombres'], queued: ['amber', 'En cola'], processing: ['amber', 'Analizando'],
      ready: ['green', 'Listo'], failed: ['red', 'Error · token devuelto'] };
    var v = map[s] || ['', s || ''];
    return '<span class="chip ' + v[0] + '">' + esc(v[1]) + '</span>';
  }

  function analisisDetail(id) {
    $view.innerHTML = '<a href="#/analisis" class="link">‹ Análisis</a><div id="ad" class="mt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    function load() {
      var p = S.demo ? Promise.resolve(id === 'demo-t' ? demoSession('training', 'demo-t') : demoSession(S._demoType || 'match')) : api('/ai/sessions/' + id);
      p.then(function (m) {
        var box = document.getElementById('ad'); if (!box) return clearInterval(S.timer);
        if (m.status === 'naming') { S.activeMatch = m; location.hash = '#/partido'; return; }
        if (/recording|queued|processing/.test(m.status)) {
          box.innerHTML = '<h1>Analizando</h1><p class="sub">' + statusChip(m.status) + '</p>' +
            '<div class="card mt"><div class="sub" style="margin:0">La IA está siguiendo a cada jugador, clasificando golpes y midiendo distancias. Te mandamos una notificación cuando termine.</div>' +
            '<div class="progress"><i style="' + (m.progress ? 'animation:none;width:' + Math.round(m.progress * 100) + '%' : '') + '"></i></div></div>';
          clearInterval(S.timer); S.timer = setInterval(load, 15000);
          return;
        }
        clearInterval(S.timer);
        if (m.status === 'failed') { box.innerHTML = '<div class="empty"><div class="ico">⚠️</div>No pudimos analizar esta sesión. Tu token fue devuelto.</div>'; return; }
        drawReport(box, m);
      }).catch(function () {
        var box = document.getElementById('ad'); if (box) box.innerHTML = '<div class="empty">No se encontró el análisis.</div>';
      });
    }
    load();
  }

  function drawReport(box, m) {
    var players = m.players || [];
    var training = m.type === 'training';
    var me = players.filter(function (p) { return p.is_me; })[0] || players[0];
    var sel = me;
    var ct = courtById(m.court_id);
    function who(p) { return p.is_me ? 'Yo' : (p.display_name || (training ? 'Alumno ' : 'Jugador ') + p.track_id); }
    function draw() {
      var st = (sel && sel.stats) || {};
      var shots = st.shots || {};
      var totalShots = Object.keys(shots).reduce(function (a, k) { return a + shots[k]; }, 0) || 1;
      var noShots = st.total_shots == null;
      var main = noShots
        ? stat(st.distance_m != null ? (st.distance_m / 1000).toFixed(2) + ' km' : '—', 'Distancia recorrida') +
          stat(st.active_min != null ? Math.round(st.active_min) + ' min' : '—', 'En movimiento') +
          stat(st.net_pct != null ? Math.round(st.net_pct) + '%' : '—', 'Cerca de la red') +
          stat(st.max_speed_kmh != null ? st.max_speed_kmh.toFixed(1) + ' km/h' : '—', 'Velocidad máx.')
        : training
        ? stat(st.total_shots != null ? st.total_shots : '—', 'Golpes') +
          stat(st.shots_per_min != null ? st.shots_per_min.toFixed(1) : '—', 'Golpes por minuto') +
          stat(st.avg_rally != null ? st.avg_rally.toFixed(1) : '—', 'Rally promedio (golpes)') +
          stat(st.active_min != null ? Math.round(st.active_min) + ' min' : '—', 'Tiempo activo')
        : stat(st.distance_m != null ? (st.distance_m / 1000).toFixed(2) + ' km' : '—', 'Distancia recorrida') +
          stat(st.total_shots != null ? st.total_shots : '—', 'Golpes') +
          stat(st.net_pct != null ? Math.round(st.net_pct) + '%' : '—', 'Tiempo en la red') +
          stat(st.max_speed_kmh != null ? st.max_speed_kmh.toFixed(1) + ' km/h' : '—', 'Velocidad máx.');
      sbox.innerHTML = '<h2>Estadísticas</h2>' +
        '<div class="seg" style="overflow-x:auto">' + players.map(function (p) {
          return '<button data-t="' + esc(p.track_id) + '" class="' + (p === sel ? 'on' : '') + '">' + esc(who(p)) + '</button>';
        }).join('') + '</div>' +
        '<div class="stats mt">' + main + '</div>' +
        (noShots ? '<div class="note">Conteo de golpes por tipo: próximamente. Esta versión beta mide movimiento y posición.</div>' : '') +
        (Object.keys(shots).length ? '<h2>Tipos de golpe</h2><div class="card">' + Object.keys(shots).sort(function (a, b) { return shots[b] - shots[a]; }).map(function (k) {
          return '<div style="margin-top:10px"><div class="spread" style="font-size:13.5px"><span>' + esc(k) + '</span><b>' + shots[k] + '</b></div><div class="bar"><i style="width:' + Math.round(shots[k] / totalShots * 100) + '%"></i></div></div>';
        }).join('') + '</div>' : '') +
        (sel && sel.clips_by_shot ? '<h2>Clips por golpe</h2><div class="chips">' + Object.keys(sel.clips_by_shot).map(function (k) {
          var arr = sel.clips_by_shot[k] || [];
          return '<button class="chip" data-shot="' + esc(k) + '">▶ ' + esc(k) + ' · ' + arr.length + '</button>';
        }).join('') + '</div>' : '') +
        (sel && sel.heatmap_url ? '<h2>Mapa de calor</h2><img src="' + esc(sel.heatmap_url) + '" style="width:100%;border-radius:16px;border:1px solid var(--line)">' : '') +
        (sel && sel.coach_summary ? '<h2>' + (training ? 'Resumen de la IA' : 'Resumen del coach') + '</h2><div class="card coach">' + esc(sel.coach_summary).replace(/\n/g, '<br>') + '</div>' : '') +
        (training && m.is_owner !== false
          ? '<h2>Notas del coach</h2><textarea id="note" class="ta" placeholder="Qué trabajar la próxima clase…">' + esc((sel && sel.coach_note) || '') + '</textarea>' +
            '<button class="btn mt" id="send">Enviar reporte a ' + esc(who(sel)) + '</button>'
          : '<button class="btn mt" id="share">Compartir mis estadísticas</button>');
      sbox.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { sel = players.filter(function (p) { return String(p.track_id) === b.getAttribute('data-t'); })[0]; draw(); }; });
      sbox.querySelectorAll('[data-shot]').forEach(function (b) { b.onclick = function () {
        var arr = sel.clips_by_shot[b.getAttribute('data-shot')] || [];
        if (arr[0] && arr[0].url) openClip({ url: arr[0].url, created_at: m.started_at }); else toast('Clips de ejemplo: en el análisis real se abren aquí');
      }; });
      var sh = sbox.querySelector('#share'); if (sh) sh.onclick = function () { shareUrl(CFG.WEB + '/analisis/' + m.id, 'Mi partido analizado con PÍCALE AI'); };
      var sd = sbox.querySelector('#send'); if (sd) sd.onclick = function () {
        var note = sbox.querySelector('#note').value.trim();
        sel.coach_note = note;
        var p = S.demo ? Promise.resolve({}) : api('/ai/sessions/' + m.id + '/players/' + sel.track_id + '/report', { method: 'POST', json: { coach_note: note } });
        p.then(function (r) {
          haptic();
          if (r && r.delivered) toast('Reporte enviado a ' + who(sel));
          else shareUrl((r && r.url) || CFG.WEB + '/analisis/' + m.id + '?p=' + sel.track_id, 'Tu reporte de entrenamiento PÍCALE');
        }).catch(function () { toast('No se pudo enviar'); });
      };
    }
    function stat(v, k) { return '<div class="stat"><div class="v">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
    box.innerHTML = '<span class="chip' + (training ? ' amber' : ' green') + '">' + (training ? '🎯 Entrenamiento' : '🎾 Partido') + '</span>' +
      '<h1 class="mt">' + esc(ct ? ct.club : 'Tu sesión') + '</h1><p class="sub">' + esc((ct ? ct.name + ' · ' : '') + fmtTime(m.started_at)) + '</p>' +
      '<div id="clipsec"></div><div id="statsec"></div>';
    var sbox = box.querySelector('#statsec');
    drawClips(box.querySelector('#clipsec'), m);
    draw();
  }

  // Clips del partido completo: los puntos salen solos y el jugador corta los suyos.
  function drawClips(box, m) {
    var moments = m.moments || [], clips = m.clips || [], dur = m.duration_s || 0;
    var markIn = null, markOut = null, stopAt = null, poll = null;
    function t(x) { return mmss(x || 0); }
    function render() {
      box.innerHTML =
        '<h2>Tus clips</h2>' +
        (clips.length ? '<div class="grid">' + clips.map(function (c, i) {
          return '<button class="clip" data-c="' + i + '">' +
            (c.status === 'ready' ? '<img src="' + esc(c.thumbnail_url) + '" loading="lazy">' : '<div class="empty" style="padding:40% 0 0"><div class="spin" style="margin:auto;color:var(--green)"></div></div>') +
            '<span class="badge' + (c.auto ? ' ai' : '') + '">' + (c.auto ? 'AUTOMÁTICO' : 'TU CLIP') + '</span>' +
            '<div class="meta"><b>' + esc(c.title || 'Clip') + '</b>' + t(c.start) + ' · ' + Math.round(c.end - c.start) + ' s</div></button>';
        }).join('') + '</div>' : '<div class="note">Aquí aparecen tus clips: los mejores puntos se cortan solos y puedes crear los tuyos abajo.</div>') +
        (m.video_url
          ? '<h2>Partido completo</h2>' +
            '<div class="player"><video id="fv" src="' + esc(m.video_url) + '" controls playsinline preload="metadata"></video></div>' +
            (dur ? '<div class="tl" id="tl">' + moments.map(function (x, i) {
              return '<i data-m="' + i + '" class="' + (x.top ? 'top' : '') + '" style="left:' + (x.start / dur * 100) + '%;width:' + Math.max(0.6, (x.end - x.start) / dur * 100) + '%"></i>';
            }).join('') + '<b id="tl-in" class="mk hidden"></b><b id="tl-out" class="mk hidden"></b><span id="tl-now"></span></div>' : '') +
            (moments.length ? '<div class="sub" style="margin:10px 0 6px">' + moments.length + ' puntos detectados · toca uno para verlo</div><div class="chips">' + moments.map(function (x, i) {
              return '<button class="chip' + (x.top ? ' green' : '') + '" data-m="' + i + '">' + (x.top ? '★ ' : '') + 'Punto ' + (i + 1) + ' · ' + t(x.start) + '</button>';
            }).join('') + '</div>' : '') +
            '<div class="card mt"><div class="ttl" style="font-weight:700">Crea tu clip</div>' +
            '<p class="sub" style="margin-top:4px">Pon el video donde empieza la jugada y marca el inicio; luego donde termina y marca el fin.</p>' +
            '<div class="row mt"><button class="btn ghost" id="b-in" style="flex:1">Inicio ' + (markIn != null ? t(markIn) : '') + '</button>' +
            '<button class="btn ghost" id="b-out" style="flex:1;margin-top:0">Fin ' + (markOut != null ? t(markOut) : '') + '</button></div>' +
            '<label class="field"><span>Nombre (opcional)</span><input id="b-title" maxlength="60" placeholder="Ej. Bandeja ganadora"></label>' +
            '<button class="btn mt" id="b-make"' + (markIn != null && markOut != null && markOut - markIn >= 2 ? '' : ' disabled') + '>CREAR CLIP' +
            (markIn != null && markOut != null && markOut > markIn ? ' · ' + Math.round(markOut - markIn) + ' s' : '') + '</button></div>'
          : (clips.length ? '<p class="free">El partido completo se guarda 30 días; tus clips se quedan.</p>' : ''));
      wire();
    }
    function wire() {
      box.querySelectorAll('[data-c]').forEach(function (b) {
        b.onclick = function () { var c = clips[+b.getAttribute('data-c')]; if (c.status === 'ready') openClip({ url: c.url, created_at: m.started_at }); else toast('Se está cortando, unos segundos…'); };
      });
      var v = box.querySelector('#fv'); if (!v) return;
      box.querySelectorAll('[data-m]').forEach(function (b) {
        b.onclick = function () {
          var x = moments[+b.getAttribute('data-m')];
          markIn = x.start; markOut = x.end; stopAt = x.end;
          v.currentTime = x.start; v.play().catch(function () {});
          updMarks();
        };
      });
      function layout() {   // duración exacta del video para la línea de tiempo
        if (!v.duration || !isFinite(v.duration)) return;
        dur = v.duration;
        box.querySelectorAll('.tl i[data-m]').forEach(function (el) {
          var x = moments[+el.getAttribute('data-m')];
          el.style.left = (x.start / dur * 100) + '%';
          el.style.width = Math.max(0.6, (Math.min(x.end, dur) - x.start) / dur * 100) + '%';
        });
        updMarks();
      }
      v.onloadedmetadata = layout; layout();
      v.ontimeupdate = function () {
        if (stopAt != null && v.currentTime >= stopAt) { v.pause(); stopAt = null; }
        var now = box.querySelector('#tl-now'); if (now && dur) now.style.left = (v.currentTime / dur * 100) + '%';
      };
      var tl = box.querySelector('#tl');
      if (tl) tl.onclick = function (e) { if (e.target.hasAttribute('data-m')) return; var r = tl.getBoundingClientRect(); v.currentTime = (e.clientX - r.left) / r.width * dur; };
      box.querySelector('#b-in').onclick = function () { markIn = v.currentTime; if (markOut != null && markOut <= markIn) markOut = null; updMarks(); };
      box.querySelector('#b-out').onclick = function () { markOut = v.currentTime; if (markIn != null && markOut <= markIn) markIn = null; updMarks(); };
      box.querySelector('#b-make').onclick = make;
      updMarks();
    }
    function updMarks() {
      var bi = box.querySelector('#b-in'), bo = box.querySelector('#b-out'), mk = box.querySelector('#b-make');
      if (!bi) return;
      bi.textContent = 'Inicio' + (markIn != null ? ' ' + t(markIn) : '');
      bo.textContent = 'Fin' + (markOut != null ? ' ' + t(markOut) : '');
      var ok = markIn != null && markOut != null && markOut - markIn >= 2 && markOut - markIn <= 90;
      mk.disabled = !ok;
      mk.textContent = 'CREAR CLIP' + (markIn != null && markOut != null && markOut > markIn ? ' · ' + Math.round(markOut - markIn) + ' s' : '');
      [['#tl-in', markIn], ['#tl-out', markOut]].forEach(function (p) {
        var el = box.querySelector(p[0]); if (!el || !dur) return;
        el.classList.toggle('hidden', p[1] == null); if (p[1] != null) el.style.left = (p[1] / dur * 100) + '%';
      });
      if (markIn != null && markOut != null && markOut - markIn > 90) toast('Un clip puede durar hasta 90 segundos');
    }
    function make() {
      var b = box.querySelector('#b-make'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      var title = box.querySelector('#b-title').value.trim();
      api('/ai/sessions/' + m.id + '/clips', { method: 'POST', json: { start: markIn, end: markOut, title: title } })
        .then(function (c) { haptic(); toast('Cortando tu clip…'); clips.push(c); clips.sort(function (a, b) { return a.start - b.start; }); markIn = markOut = null; render(); watch(); })
        .catch(function (e) { toast((e && e.data && e.data.detail) || 'No se pudo crear el clip'); updMarks(); });
    }
    function watch() {
      clearInterval(poll);
      if (!clips.some(function (c) { return c.status === 'processing'; })) return;
      poll = setInterval(function () {
        if (!document.body.contains(box)) return clearInterval(poll);
        api('/ai/sessions/' + m.id + '/clips').then(function (d) {
          var before = JSON.stringify(clips.map(function (c) { return c.status; }));
          clips = d.clips || [];
          if (JSON.stringify(clips.map(function (c) { return c.status; })) !== before) {
            var v = box.querySelector('#fv'), at = v ? v.currentTime : 0;
            render();
            var v2 = box.querySelector('#fv'); if (v2 && at) v2.currentTime = at;
          }
          if (!clips.some(function (c) { return c.status === 'processing'; })) clearInterval(poll);
        }).catch(function () {});
      }, 4000);
    }
    render(); watch();
  }

  // ───────────────────────── datos de demo
  function demoSnapshot() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b5a"/><stop offset="1" stop-color="#244d73"/></linearGradient></defs>' +
      '<rect width="640" height="360" fill="#111"/><polygon points="180,40 460,40 600,350 40,350" fill="url(#g)"/>' +
      '<g stroke="#e8e8e8" stroke-width="3" fill="none"><polygon points="180,40 460,40 600,350 40,350"/><line x1="110" y1="195" x2="530" y2="195" stroke-width="5"/>' +
      '<line x1="152" y1="102" x2="488" y2="102"/><line x1="78" y1="270" x2="562" y2="270"/><line x1="320" y1="102" x2="320" y2="270"/></g>' +
      fig(190, 300, 1.25, '#e6b04a') + fig(430, 290, 1.25, '#e85a5a') + fig(250, 100, 0.8, '#5ab0e8') + fig(380, 95, 0.8, '#eeeeee') + '</svg>';
    function fig(x, y, s, c) {
      return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')"><circle cx="0" cy="-58" r="9" fill="#d7a98a"/><rect x="-11" y="-48" width="22" height="30" rx="6" fill="' + c + '"/><rect x="-10" y="-19" width="8" height="26" rx="3" fill="#222"/><rect x="2" y="-19" width="8" height="26" rx="3" fill="#222"/></g>';
    }
    return {
      image_url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      people: [
        { track_id: 'A', box: [0.255, 0.585, 0.08, 0.27], hint: 'Cerca · izquierda · amarillo' },
        { track_id: 'B', box: [0.63, 0.56, 0.08, 0.27], hint: 'Cerca · derecha · rojo' },
        { track_id: 'C', box: [0.36, 0.115, 0.06, 0.18], hint: 'Fondo · izquierda · azul' },
        { track_id: 'D', box: [0.565, 0.1, 0.06, 0.18], hint: 'Fondo · derecha · blanco' },
      ],
    };
  }
  function demoSession(type, id) {
    var t = Date.now() / 1000 - 3600 * 2, names = (type === (S._demoType || 'match') && S._demoNames) || null;
    var ready = !S._demoReadyAt || Date.now() > S._demoReadyAt || id === 'demo-t';
    var you = (S.user && S.user.name) || 'Yo';
    function pl(tid, d, sh, net, sp, extra) {
      var n = names && names[tid], total = Object.keys(sh).reduce(function (a, k) { return a + sh[k]; }, 0);
      var p = { track_id: tid, is_me: !!(n && n.me), display_name: n ? (n.me ? you : n.name) : null,
        stats: Object.assign({ distance_m: d, total_shots: total, net_pct: net, max_speed_kmh: sp, shots: sh }, extra || {}),
        coach_summary: type === 'training'
          ? 'Ejemplo: ' + total + ' golpes en la sesión. Lo más trabajado: ' + Object.keys(sh).sort(function (a, b) { return sh[b] - sh[a]; })[0].toLowerCase() + '. La consistencia bajó en los últimos 15 minutos.'
          : 'Ejemplo: recorriste ' + (d / 1000).toFixed(1) + ' km y estuviste en la red el ' + net + '% del tiempo. En el análisis real la IA lo escribe con base en tus golpes y tu posición en cada punto.' };
      if (type === 'training') p.clips_by_shot = { Bandeja: [{}, {}, {}], Volea: [{}, {}], 'Salida de pared': [{}, {}, {}, {}] };
      return p;
    }
    if (type === 'training') {
      return { id: id || 'demo', type: 'training', is_owner: true, status: ready ? 'ready' : 'processing', court_id: 'somos_c3', started_at: t, players: [
        pl('A', 1200, { Bandeja: 64, Volea: 88, 'Salida de pared': 41, Drive: 52 }, 60, 15, { shots_per_min: 4.1, avg_rally: 6.3, active_min: 51 }),
        pl('B', 1100, { Bandeja: 58, Volea: 79, 'Salida de pared': 47, Drive: 40 }, 55, 14, { shots_per_min: 3.7, avg_rally: 5.8, active_min: 49 }),
      ] };
    }
    return { id: 'demo', type: 'match', status: ready ? 'ready' : 'processing', court_id: 'somos_c3', started_at: t, players: [
      pl('A', 2140, { Drive: 88, 'Revés': 41, Volea: 37, Globo: 22, Smash: 9, Saque: 30 }, 34, 21.4),
      pl('B', 1980, { Drive: 52, 'Revés': 71, Volea: 44, Globo: 31, Smash: 14, Saque: 28 }, 41, 19.8),
      pl('C', 2310, { Drive: 95, 'Revés': 38, Volea: 25, Globo: 40, Smash: 5, Saque: 31 }, 22, 22.9),
      pl('D', 2050, { Drive: 61, 'Revés': 66, Volea: 30, Globo: 35, Smash: 11, Saque: 29 }, 28, 20.6),
    ] };
  }

  // ───────────────────────── CRÉDITOS (compras dentro de la app)
  var rcReady = false;
  function initPurchases() {
    var P = Plugins.Purchases; if (!P || rcReady || !S.user) return;
    var key = Cap.getPlatform() === 'ios' ? CFG.REVENUECAT_IOS_KEY : CFG.REVENUECAT_ANDROID_KEY;
    if (!key) return;
    P.configure({ apiKey: key, appUserID: String(S.user.id) }).then(function () { rcReady = true; }).catch(function () {});
  }
  function viewCreditos() {
    $view.innerHTML = '<a href="#/partido" class="link">‹ Analizar</a><h1 class="mt">Tokens</h1>' +
      '<p class="sub">1 token = 1 partido completo (hasta ' + CFG.FULL_MATCH_MINUTES + ' min): estadísticas de los 4 jugadores, tus mejores puntos cortados en clips solos y el partido completo para crear los clips que quieras. En entrenamientos, 1 token por cada hora. El paquete de 10 está pensado para coaches.</p>' +
      '<div id="prods" class="mt"></div><p class="free">Los clips del botón y su análisis son gratis siempre.</p>';
    var box = document.getElementById('prods');
    var P = Plugins.Purchases;
    if (!isNative) return webCheckout(box);
    if (!P || !rcReady) {
      box.innerHTML = CFG.PRODUCTS.map(function (p) { return '<div class="card spread"><div class="ttl" style="font-weight:700">' + esc(p.label) + '</div><span class="chip">En la app</span></div>'; }).join('') +
        '<div class="note">Las compras funcionan dentro de la app de iPhone y Android.</div>';
      return;
    }
    P.getProducts({ productIdentifiers: CFG.PRODUCTS.map(function (p) { return p.id; }), type: 'NON_SUBSCRIPTION' }).then(function (r) {
      var prods = r.products || [];
      box.innerHTML = prods.map(function (p, i) {
        return '<div class="card spread"><div><div class="ttl" style="font-weight:700">' + esc(p.title) + '</div><div class="dsc sub" style="margin:2px 0 0">' + esc(p.description || '') + '</div></div>' +
          '<button class="btn" style="width:auto;padding:0 18px;height:44px" data-i="' + i + '">' + esc(p.priceString) + '</button></div>';
      }).join('');
      box.querySelectorAll('[data-i]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          P.purchaseStoreProduct({ product: prods[+b.getAttribute('data-i')] }).then(function () {
            haptic(); toast('¡Listo! Tus tokens ya están en tu cuenta');
            // El servidor acredita vía webhook de RevenueCat; damos unos segundos y refrescamos.
            setTimeout(function () { location.hash = '#/partido'; }, 1500);
          }).catch(function (e) { b.disabled = false; if (!(e && e.userCancelled)) toast('No se completó la compra'); });
        };
      });
    }).catch(function () { box.innerHTML = '<div class="empty">No pudimos cargar los precios.</div>'; });
  }

  // En la web se cobra con Mercado Pago (sin comisión de tiendas). Nunca se usa dentro de la app nativa.
  function webCheckout(box) {
    if (/[?&]pago=ok/.test(location.search)) toast('Pago recibido. Tus tokens aparecen en unos segundos.');
    box.innerHTML = '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>';
    function draw(list) {
      box.innerHTML = list.map(function (p, i) {
        return '<div class="card spread"><div><div class="ttl" style="font-weight:700">' + esc(p.label) + '</div>' +
          (p.price_mxn ? '<div class="sub" style="margin:2px 0 0">$' + esc(p.price_mxn) + ' MXN</div>' : '') + '</div>' +
          '<button class="btn" style="width:auto;padding:0 18px;height:44px" data-i="' + i + '">Comprar</button></div>';
      }).join('') + '<div id="pilot" class="note hidden">Durante el piloto los tokens los da PÍCALE. Pídelos en el club o escribe a <a class="link" href="mailto:hola@picalereplay.com">hola@picalereplay.com</a>.</div>';
      box.querySelectorAll('[data-i]').forEach(function (b) {
        b.onclick = function () {
          var p = list[+b.getAttribute('data-i')];
          b.disabled = true; b.innerHTML = '<span class="spin"></span>';
          api('/ai/purchases/checkout', { method: 'POST', json: { product_id: p.id, return_url: location.origin + location.pathname + '?pago=ok#/partido' } })
            .then(function (r) { if (r && r.url) location.href = r.url; else throw {}; })
            .catch(function (e) {
              b.disabled = false; b.textContent = 'Comprar';
              if (notReady(e)) document.getElementById('pilot').classList.remove('hidden');
              else toast('No se pudo abrir el pago. Intenta de nuevo.');
            });
        };
      });
    }
    api('/ai/purchases/products').then(function (d) { draw(d.products && d.products.length ? d.products : CFG.PRODUCTS); })
      .catch(function () { draw(CFG.PRODUCTS); });
  }

  // ───────────────────────── PERFIL
  function viewPerfil() {
    var u = S.user || {};
    var nm = u.name || u.username || 'Jugador';
    $view.innerHTML = '<div class="row"><div class="avatar">' + (u.photo_url ? '<img src="' + esc(u.photo_url) + '">' : esc(nm[0].toUpperCase())) + '</div>' +
      '<div><h1 style="font-size:30px">' + esc(nm) + '</h1>' + (u.username ? '<div class="sub" style="margin-top:2px">@' + esc(u.username) + '</div>' : '') + '</div></div>' +
      '<div class="list mt">' +
        '<a class="item" href="#/creditos"><div><div class="ttl">Mis tokens</div><div class="dsc" id="pc">—</div></div><span class="chev">›</span></a>' +
        '<button class="item" style="width:100%;text-align:left" id="edit"><div><div class="ttl">Editar perfil</div><div class="dsc">Foto, nombre, categoría</div></div><span class="chev">›</span></button>' +
        '<span id="pclub"></span>' +
        (u.is_admin ? '<a class="item" href="#/admin"><div><div class="ttl">Panel PÍCALE AI</div><div class="dsc">Dar tokens, clubes y sesiones</div></div><span class="chev">›</span></a>' : '') +
        '<button class="item" style="width:100%;text-align:left" id="web"><div><div class="ttl">PÍCALE en la web</div><div class="dsc">picalereplay.com</div></div><span class="chev">›</span></button>' +
      '</div>' +
      '<button class="btn danger mt" id="out">Cerrar sesión</button>';
    loadCredits().then(function (c) { var el = document.getElementById('pc'); if (el) el.textContent = c === null ? 'Muy pronto' : c; });
    api('/ai/me/roles').then(function (r) {
      var el = document.getElementById('pclub'); if (!el || !(r.clubs || []).length) return;
      el.outerHTML = '<a class="item" href="#/club"><div><div class="ttl">Panel del club</div><div class="dsc">' + esc(r.clubs.map(function (c) { return c.club_name; }).join(', ')) + ' · americanas con IA</div></div><span class="chev">›</span></a>';
    }).catch(function () {});
    document.getElementById('edit').onclick = function () { openExternal(CFG.WEB + '/perfil.html'); };
    document.getElementById('web').onclick = function () { openExternal(CFG.WEB); };
    document.getElementById('out').onclick = function () { if (confirm('¿Cerrar sesión?')) logout(); };
  }

  // ───────────────────────── ADMIN (piloto)
  function viewAdmin() {
    $view.innerHTML = '<a href="#/perfil" class="link">‹ Perfil</a><h1 class="mt">Panel PÍCALE AI</h1>' +
      '<h2>Clubes</h2><div id="ad-edges" class="list"><div class="item"><span class="spin" style="color:var(--green)"></span></div></div>' +
      '<h2>Tokens y administradores de cada club</h2><div id="ad-clubs"></div>' +
      '<h2>Dar tokens</h2><label class="field"><span>Buscar jugador (nombre, usuario o correo)</span><input id="ad-q" autocapitalize="none"></label>' +
      '<div id="ad-users" class="list mt"></div><p class="free">Solo aparecen jugadores que ya abrieron PÍCALE AI al menos una vez.</p>' +
      '<h2>Últimas sesiones</h2><div id="ad-sess" class="list"></div>';
    function users(q) {
      api('/ai/admin/users?q=' + encodeURIComponent(q || '')).then(function (d) {
        var box = document.getElementById('ad-users'); if (!box) return;
        box.innerHTML = (d.users || []).map(function (u) {
          return '<div class="item"><div style="min-width:0"><div class="ttl">' + esc(u.name || u.username || u.user_id) + '</div><div class="dsc">' +
            esc((u.username ? '@' + u.username + ' · ' : '') + (u.email || '')) + '</div></div>' +
            '<span class="chip" style="margin-left:auto">' + u.credits + '</span>' +
            '<button class="chip green" data-u="' + esc(u.user_id) + '" data-n="1">+1</button><button class="chip green" data-u="' + esc(u.user_id) + '" data-n="5">+5</button></div>';
        }).join('') || '<div class="item"><div class="dsc">Sin resultados</div></div>';
        box.querySelectorAll('[data-u]').forEach(function (b) {
          b.onclick = function () {
            b.disabled = true;
            api('/ai/admin/tokens', { method: 'POST', json: { user_id: b.getAttribute('data-u'), amount: +b.getAttribute('data-n'), note: 'piloto' } })
              .then(function () { haptic(); toast('Tokens agregados'); users(document.getElementById('ad-q').value); })
              .catch(function () { b.disabled = false; toast('No se pudo'); });
          };
        });
      }).catch(function (e) { var box = document.getElementById('ad-users'); if (box) box.innerHTML = '<div class="item"><div class="dsc">' + (e && e.status === 403 ? 'Tu cuenta no es administradora.' : 'El servicio PÍCALE AI no responde.') + '</div></div>'; });
    }
    api('/ai/admin/sessions').then(function (d) {
      var e = document.getElementById('ad-edges'), sb = document.getElementById('ad-sess'); if (!e) return;
      e.innerHTML = (d.edges || []).map(function (x) {
        return '<div class="item"><span class="dot" style="background:' + (x.online ? 'var(--green)' : 'var(--red)') + ';box-shadow:none"></span><div><div class="ttl">' + esc(x.club_id) + '</div><div class="dsc">' +
          (x.online ? 'Mini PC en línea' : 'Sin conexión') + (x.last_seen ? ' · ' + esc(fmtTime(x.last_seen)) : '') + '</div></div></div>';
      }).join('') || '<div class="item"><div class="dsc">Ninguna mini PC se ha conectado todavía.</div></div>';
      sb.innerHTML = (d.sessions || []).slice(0, 30).map(function (x) {
        return '<div class="item"><div style="min-width:0"><div class="ttl">' + esc(x.court) + '</div><div class="dsc">' + esc((x.user || '') + ' · ' + fmtTime(x.started_at) + (x.error ? ' · ' + x.error : '')) + '</div>' +
          (x.calibration_url ? '<a class="dsc" style="color:var(--green)" target="_blank" rel="noopener" href="' + esc(x.calibration_url) + '">Ver calibración automática' +
            (x.calibration && x.calibration.score != null ? ' · ' + Math.round(x.calibration.score * 100) + '%' : '') + '</a>' : '') + '</div><span style="margin-left:auto">' + statusChip(x.status) + '</span></div>';
      }).join('') || '<div class="item"><div class="dsc">Todavía no hay sesiones.</div></div>';
    }).catch(function () {});
    function clubs() {
      api('/ai/admin/clubs').then(function (d) {
        var box = document.getElementById('ad-clubs'); if (!box) return;
        box.innerHTML = (d.clubs || []).map(function (c) {
          return '<div class="card mt"><div class="spread"><div><b>' + esc(c.club_name) + '</b><div class="sub" style="margin:2px 0 0">' + c.courts + ' canchas · <a class="link" href="#/club/' + esc(c.club_id) + '">abrir panel</a></div></div>' +
            '<span class="chip">' + c.credits + ' tokens</span></div>' +
            '<div class="row mt" style="gap:8px"><button class="chip green" data-cl="' + esc(c.club_id) + '" data-n="5">+5</button><button class="chip green" data-cl="' + esc(c.club_id) + '" data-n="20">+20</button><button class="chip" data-cl="' + esc(c.club_id) + '" data-n="-5">−5</button></div>' +
            '<div class="sub mt" style="margin-bottom:4px">Administradores</div>' +
            (c.admins.length ? c.admins.map(function (a) {
              return '<div class="spread" style="padding:4px 0"><span>' + esc(a.name || a.username || a.email) + ' <span class="sub">' + esc(a.email || '') + '</span></span><button class="link" data-rm="' + esc(a.user_id) + '" data-club="' + esc(c.club_id) + '">Quitar</button></div>';
            }).join('') : '<div class="dsc sub">Nadie todavía</div>') +
            '<div class="row mt" style="gap:8px"><input class="ad-who" data-club="' + esc(c.club_id) + '" placeholder="correo o @usuario" autocapitalize="none" style="flex:1;min-width:0;background:var(--bg3);border:1px solid var(--line2);border-radius:10px;color:var(--text);padding:10px"><button class="chip green" data-add="' + esc(c.club_id) + '">Agregar</button></div></div>';
        }).join('');
        box.querySelectorAll('[data-cl]').forEach(function (b) {
          b.onclick = function () {
            b.disabled = true;
            api('/ai/admin/tokens', { method: 'POST', json: { user_id: 'club:' + b.getAttribute('data-cl'), amount: +b.getAttribute('data-n'), note: 'tokens del club' } })
              .then(function () { haptic(); toast('Tokens del club actualizados'); clubs(); }).catch(function () { b.disabled = false; toast('No se pudo'); });
          };
        });
        box.querySelectorAll('[data-add]').forEach(function (b) {
          b.onclick = function () {
            var club = b.getAttribute('data-add'), inp = box.querySelector('.ad-who[data-club="' + club + '"]');
            if (!inp.value.trim()) return;
            api('/ai/admin/club-admins', { method: 'POST', json: { club_id: club, who: inp.value.trim() } })
              .then(function (r) { toast(r.name + ' ahora administra el club'); clubs(); }).catch(function (e) { toast(errDetail(e, 'No se pudo')); });
          };
        });
        box.querySelectorAll('[data-rm]').forEach(function (b) {
          b.onclick = function () {
            api('/ai/admin/club-admins?club_id=' + encodeURIComponent(b.getAttribute('data-club')) + '&user_id=' + encodeURIComponent(b.getAttribute('data-rm')), { method: 'DELETE' })
              .then(function () { clubs(); }).catch(function () { toast('No se pudo'); });
          };
        });
      }).catch(function () {});
    }
    clubs();
    var tq; document.getElementById('ad-q').oninput = function (ev) { clearTimeout(tq); tq = setTimeout(function () { users(ev.target.value); }, 300); };
    users('');
  }

  // ───────────────────────── AMERICANAS
  // El club graba varias canchas de corrido; la IA separa cada partido y cada jugador se busca.
  function hhmm(ts) { return ts ? new Date(ts * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function spinner() { return '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>'; }
  function errDetail(e, fallback) { return (e && e.data && e.data.detail) || fallback; }

  function viewClub(args) {
    clearInterval(S.timer);
    $view.innerHTML = '<a href="#/perfil" class="link">‹ Perfil</a><div id="cb" class="mt">' + spinner() + '</div>';
    api('/ai/me/roles').then(function (r) {
      var clubs = r.clubs || [], box = document.getElementById('cb'); if (!box) return;
      if (!clubs.length) { box.innerHTML = '<div class="empty"><div class="ico">🏟️</div>Tu cuenta no administra ningún club.</div>'; return; }
      if (!args[0] && clubs.length > 1) {
        box.innerHTML = '<h1>Panel del club</h1><div class="list mt">' + clubs.map(function (c) {
          return '<a class="item" href="#/club/' + esc(c.club_id) + '"><div class="ttl">' + esc(c.club_name) + '</div><span class="chev">›</span></a>';
        }).join('') + '</div>';
        return;
      }
      clubPanel(args[0] || clubs[0].club_id);
    }).catch(function () { var box = document.getElementById('cb'); if (box) box.innerHTML = '<div class="empty">No se pudo cargar el panel.</div>'; });
  }

  function clubPanel(id) {
    var sel = { courts: {}, min: 120, title: '' }, P = null;
    function load() {
      api('/ai/clubs/' + encodeURIComponent(id) + '/panel').then(function (p) {
        P = p; if (sel.min && p.durations.indexOf(sel.min) < 0) sel.min = p.durations[0]; draw();
      }).catch(function (e) {
        var box = document.getElementById('cb'); if (box) box.innerHTML = '<div class="empty">' + esc(errDetail(e, 'No se pudo cargar el panel.')) + '</div>';
      });
    }
    function draw() {
      var box = document.getElementById('cb'); if (!box || !P) return clearInterval(S.timer);
      var ids = Object.keys(sel.courts).filter(function (k) { return sel.courts[k]; });
      var hours = Math.ceil(sel.min / 60), cost = ids.length * hours * P.tokens_per_court_hour;
      var live = P.events.filter(function (e) { return e.status === 'live'; });
      var past = P.events.filter(function (e) { return e.status !== 'live'; });
      var free = P.courts.filter(function (c) { return !c.busy; });
      box.innerHTML = '<h1>' + esc(P.club_name) + '</h1><p class="sub">Americanas y retas grabadas con IA</p>' +
        '<div class="card mt spread"><div><div class="sub" style="margin:0">Tokens del club</div><b style="font-size:28px">' + P.credits + '</b></div>' +
          (P.edge_online ? '<span class="chip green">● Mini PC en línea</span>' : '<span class="chip red">Mini PC sin conexión</span>') + '</div>' +
        live.map(function (e) {
          return '<a class="card mt" href="#/americana/' + e.id + '" style="display:block;border-color:var(--red)"><div class="spread"><div><b>' + esc(e.title) + '</b>' +
            '<div class="sub" style="margin:2px 0 0">' + e.courts + ' cancha' + (e.courts > 1 ? 's' : '') + ' · termina ' + hhmm(e.ends_at) + '</div></div>' + evChip(e.status) + '</div></a>';
        }).join('') +
        '<h2>Nueva americana</h2>' +
        '<label class="field"><span>Nombre (opcional)</span><input id="ev-t" maxlength="80" placeholder="Americana jueves" value="' + esc(sel.title) + '"></label>' +
        '<div class="spread mt"><b>Canchas</b>' + (free.length ? '<button class="link" id="ev-all">' + (ids.length === free.length ? 'Ninguna' : 'Todas') + '</button>' : '') + '</div>' +
        '<div class="courts mt">' + P.courts.map(function (c) {
          var on = !!sel.courts[c.id];
          return '<button data-c="' + c.id + '" class="' + (on ? 'on' : '') + '"' + (c.busy ? ' disabled' : '') + '>' + esc(c.court_name.replace(/^Cancha\s*/i, 'C')) +
            (c.busy ? '<small>grabando</small>' : '') + '</button>';
        }).join('') + '</div>' +
        '<b class="mt" style="display:block">Duración</b><div class="seg mt">' + P.durations.map(function (m) {
          return '<button data-m="' + m + '" class="' + (sel.min === m ? 'on' : '') + '">' + (m % 60 ? (m / 60).toFixed(1).replace('.0', '') : m / 60) + ' h</button>';
        }).join('') + '</div>' +
        '<div class="card mt spread"><div class="sub" style="margin:0">' + ids.length + ' cancha' + (ids.length === 1 ? '' : 's') + ' × ' + hours + ' h</div><span class="chip ' + (cost && cost <= P.credits ? 'green' : '') + '">' + cost + ' token' + (cost === 1 ? '' : 's') + '</span></div>' +
        '<button class="btn rec mt" id="ev-go"' + (ids.length && cost <= P.credits && P.edge_online ? '' : ' disabled') + '>● INICIAR AMERICANA</button>' +
        (cost > P.credits ? '<div class="note">Al club le faltan ' + (cost - P.credits) + ' tokens. Pídelos a PÍCALE.</div>' : '') +
        '<p class="free">Las canchas se graban de corrido. La IA separa cada partido sola; los jugadores se buscan escaneando el QR de su cancha.</p>' +
        (past.length ? '<h2>Anteriores</h2><div class="list">' + past.map(function (e) {
          return '<a class="item" href="#/americana/' + e.id + '"><div><div class="ttl">' + esc(e.title) + '</div><div class="dsc">' + esc(fmtTime(e.started_at)) + ' · ' + e.courts + ' canchas</div></div><span style="margin-left:auto">' + evChip(e.status) + '</span></a>';
        }).join('') + '</div>' : '');
      box.querySelector('#ev-t').oninput = function (ev) { sel.title = ev.target.value; };
      box.querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-c'); sel.courts[k] = !sel.courts[k]; haptic(); draw(); }; });
      box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { sel.min = +b.getAttribute('data-m'); draw(); }; });
      var all = box.querySelector('#ev-all');
      if (all) all.onclick = function () { var to = ids.length !== free.length; sel.courts = {}; if (to) free.forEach(function (c) { sel.courts[c.id] = true; }); draw(); };
      box.querySelector('#ev-go').onclick = function () {
        var b = this; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
        api('/ai/clubs/' + encodeURIComponent(id) + '/events', { method: 'POST', json: { court_ids: ids, duration_min: sel.min, title: sel.title } })
          .then(function (ev) { haptic(); toast('Americana iniciada · grabando ' + ids.length + ' canchas'); location.hash = '#/americana/' + ev.id; })
          .catch(function (e) { toast(errDetail(e, 'No se pudo iniciar')); load(); });
      };
    }
    load();
    S.timer = setInterval(function () { if (!document.getElementById('cb')) return clearInterval(S.timer); }, 5000);
  }

  function evChip(s) {
    var map = { live: ['red', '● Grabando'], processing: ['amber', 'Analizando'], ready: ['green', 'Listo'], cancelled: ['', 'Cancelada'], failed: ['red', 'Error'] };
    var v = map[s] || ['', s || ''];
    return '<span class="chip ' + v[0] + '">' + esc(v[1]) + '</span>';
  }

  function viewAmericana(args) {
    clearInterval(S.timer);
    if (args[0]) return americanaDetail(args[0], args[1]);
    $view.innerHTML = '<a href="#/partido" class="link">‹ Analizar</a><h1 class="mt">Americanas</h1><p class="sub">Búscate en los partidos de tu club y ve tus stats y mejores puntos.</p><div id="am" class="mt">' + spinner() + '</div>';
    api('/ai/events').then(function (d) {
      var box = document.getElementById('am'); if (!box) return;
      var list = d.events || [];
      box.innerHTML = list.length ? '<div class="list">' + list.map(function (e) {
        return '<a class="item" href="#/americana/' + e.id + '"><span class="tag">🏆</span><div><div class="ttl">' + esc(e.title) + ' · ' + esc(e.club_name || '') + '</div><div class="dsc">' + esc(fmtTime(e.started_at)) + '</div></div><span style="margin-left:auto">' + evChip(e.status) + '</span></a>';
      }).join('') + '</div>' : '<div class="empty"><div class="ico">🏆</div>No hay americanas en los últimos días.</div>';
    }).catch(function () { var box = document.getElementById('am'); if (box) box.innerHTML = '<div class="empty">No se pudieron cargar.</div>'; });
  }

  function americanaDetail(id, onlyCourt) {
    $view.innerHTML = '<a href="#/americana" class="link">‹ Americanas</a><div id="am" class="mt">' + spinner() + '</div>';
    var E = null;
    function load() {
      api('/ai/events/' + id).then(function (e) { E = e; draw(); }).catch(function () {
        var box = document.getElementById('am'); if (box) box.innerHTML = '<div class="empty">No se encontró la americana.</div>'; clearInterval(S.timer);
      });
    }
    function draw() {
      var box = document.getElementById('am'); if (!box) return clearInterval(S.timer);
      var courts = E.courts.filter(function (c) { return !onlyCourt || c.court_id === onlyCourt; });
      if (!courts.length) courts = E.courts;
      var total = E.courts.reduce(function (n, c) { return n + c.matches.length; }, 0);
      box.innerHTML = '<div class="spread"><div><h1 style="margin:0">' + esc(E.title) + '</h1><div class="sub" style="margin:2px 0 0">' + esc((E.club_name || '') + ' · ' + fmtTime(E.started_at)) + '</div></div>' + evChip(E.status) + '</div>' +
        (E.status === 'live' ? '<div class="note mt">Se está grabando (termina a las ' + hhmm(E.ends_at) + '). Al terminar, la IA separa cada partido (tarda unos minutos) y aquí te buscas. No necesitas token.</div>' +
          (E.is_club_admin ? '<button class="btn danger mt" id="ev-end">Terminar americana ahora</button>' : '') : '') +
        (E.status === 'processing' ? '<div class="note mt">La IA está separando los partidos. Esta página se actualiza sola.</div>' : '') +
        (E.status === 'ready' ? '<p class="sub mt">' + total + ' partido' + (total === 1 ? '' : 's') + ' encontrado' + (total === 1 ? '' : 's') + '. Toca el tuyo y elige cuál eres.</p>' : '') +
        (onlyCourt && E.courts.length > 1 ? '<a class="link" href="#/americana/' + E.id + '">Ver todas las canchas ›</a>' : '') +
        courts.map(function (c) {
          return '<h2>' + esc(c.court_name) + (c.status !== 'ready' ? ' <span style="vertical-align:middle">' + statusChip(c.status) + '</span>' : '') + '</h2>' +
            (c.status === 'processing' && c.progress ? '<div class="progress"><i style="animation:none;width:' + Math.round(c.progress * 100) + '%"></i></div>' : '') +
            (c.matches.length ? '<div class="matches">' + c.matches.map(function (m, i) {
              return '<button class="mcard' + (m.mine ? ' mine' : '') + '" data-s="' + m.session_id + '">' +
                (m.snapshot_url ? '<img loading="lazy" src="' + esc(m.snapshot_url) + '" alt="">' : '<div class="ph"></div>') +
                '<div class="mt-row"><b>Partido ' + (i + 1) + '</b><span class="sub" style="margin:0">' + hhmm(m.start) + '–' + hhmm(m.end) + '</span></div>' +
                '<div class="who-row">' + m.players.map(function (p) {
                  return '<span class="chip' + (p.is_me ? ' green' : p.claimed ? ' amber' : '') + '">' + p.track_id + (p.is_me ? ' · Tú' : p.claimed ? ' · ' + esc((p.name || '').split(' ')[0]) : '') + '</span>';
                }).join('') + '</div></button>';
            }).join('') + '</div>'
              : (c.status === 'ready' ? '<div class="dsc sub">No se detectaron partidos en esta cancha.</div>' : c.status === 'failed' ? '<div class="dsc sub">' + esc(c.error || 'No se pudo analizar') + ' · token devuelto al club</div>' : ''));
        }).join('');
      var end = box.querySelector('#ev-end');
      if (end) end.onclick = function () {
        if (!confirm('¿Terminar la americana ahora? Se dejan de grabar todas las canchas.')) return;
        end.disabled = true;
        api('/ai/events/' + E.id + '/finish', { method: 'POST' }).then(function (e) { E = e; E.is_club_admin = true; toast('Americana terminada · analizando'); draw(); })
          .catch(function (e) { end.disabled = false; toast(errDetail(e, 'No se pudo terminar')); });
      };
      box.querySelectorAll('[data-s]').forEach(function (b) {
        b.onclick = function () {
          var sid = b.getAttribute('data-s'), m = null;
          E.courts.forEach(function (c) { c.matches.forEach(function (x) { if (x.session_id === sid) m = x; }); });
          if (m.mine) { location.hash = '#/analisis/' + sid; return; }
          claimSheet(m);
        };
      });
      clearInterval(S.timer);
      if (E.status === 'live' || E.status === 'processing') S.timer = setInterval(load, 20000);
    }
    function claimSheet(m) {
      var md = document.getElementById('modal');
      md.innerHTML = '<div class="bar"><span class="sub" style="margin:0">' + hhmm(m.start) + '–' + hhmm(m.end) + '</span><button class="x" id="mx" aria-label="Cerrar">×</button></div>' +
        '<div style="padding:0 16px calc(var(--sb) + 18px);overflow:auto">' +
        (m.snapshot_url ? '<img src="' + esc(m.snapshot_url) + '" style="width:100%;border-radius:14px;display:block" alt="">' : '') +
        '<h1 class="mt" style="font-size:30px">¿Cuál eres tú?</h1><p class="sub">Busca tu letra sobre cada jugador en la foto.</p>' +
        '<div class="claim mt">' + m.players.map(function (p) {
          var taken = p.claimed && !p.is_me;
          return '<button data-t="' + p.track_id + '"' + (taken ? ' disabled' : '') + '><b>' + p.track_id + '</b><small>' + (taken ? esc(p.name || 'Ocupado') : 'Soy yo') + '</small></button>';
        }).join('') + '</div>' +
        (E.claim_cost ? '<p class="free">Ver tu partido cuesta ' + E.claim_cost + ' token' + (E.claim_cost > 1 ? 's' : '') + '.</p>' : '<p class="free">Gratis · lo pagó el club</p>') +
        '<p class="free">Si alguien eligió tu letra por error, avisa en recepción.</p></div>';
      md.classList.remove('hidden'); md.classList.add('solid');
      md.querySelector('#mx').onclick = closeModal;
      md.querySelectorAll('[data-t]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          api('/ai/sessions/' + m.session_id + '/claim', { method: 'POST', json: { track_id: b.getAttribute('data-t') } })
            .then(function () { haptic(); closeModal(); toast('¡Listo! Estos son tus stats'); location.hash = '#/analisis/' + m.session_id; })
            .catch(function (e) {
              b.disabled = false;
              if (e && e.status === 402) { closeModal(); toast('No tienes tokens suficientes'); location.hash = '#/creditos'; return; }
              toast(errDetail(e, 'No se pudo'));
            });
        };
      });
    }
    load();
  }

  // QR escaneado en una cancha que está (o estuvo hoy) en una americana
  function stepEventChoice(c) {
    var box = pt(); if (!box) return;
    var ev = c.event;
    box.innerHTML = '<h1>' + esc(c.court_name) + '</h1><p class="sub">' + esc(c.club_name) + '</p>' +
      '<div class="card mt" style="border-color:var(--green-line)"><div class="spread"><b>🏆 ' + esc(ev.title) + '</b>' + evChip(ev.live ? 'live' : 'ready') + '</div>' +
        '<div class="sub" style="margin:6px 0 0">' + (ev.live ? 'Esta cancha se está grabando con la americana del club. Tu partido ya queda grabado: no necesitas token.' : 'Esta cancha estuvo en una americana. Búscate en tu partido.') + '</div></div>' +
      '<a class="btn mt" href="#/americana/' + ev.id + '/' + c.court_id + '">' + (ev.live ? 'VER LA AMERICANA' : 'BUSCAR MI PARTIDO') + '</a>' +
      (ev.live ? '' : '<button class="btn ghost" id="other">Analizar otro partido con token</button>');
    var o = box.querySelector('#other');
    if (o) o.onclick = function () { S.pendingQR = c._raw; S.skipEventCheck = true; stepUseToken(); };
  }

  // ───────────────────────── PUSH
  function registerPush() {
    var PN = Plugins.PushNotifications; if (!PN || !isNative) return;
    PN.addListener('registration', function (t) {
      api('/ai/devices', { method: 'POST', json: { token: t.value, platform: Cap.getPlatform() } }).catch(function () {});
    });
    PN.addListener('pushNotificationActionPerformed', function (a) {
      var d = (a.notification && a.notification.data) || {};
      if (d.session_id) location.hash = '#/analisis/' + d.session_id;
      else if (d.clip_id) location.hash = '#/clips';
    });
    PN.requestPermissions().then(function (r) { if (r.receive === 'granted') PN.register(); }).catch(function () {});
  }

  // Deep link: si escanean el QR con la cámara normal del teléfono, abre la app en "Analizar"
  // y usa ese QR sin pedir escanearlo otra vez.
  if (Plugins.App) {
    Plugins.App.addListener('appUrlOpen', function (e) {
      if (/\/c\//.test(e.url)) { S.pendingQR = e.url; location.hash = '#/partido'; route(); }
    });
  }

  boot();
})();
