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
    analisis: viewAnalisis, perfil: viewPerfil, creditos: viewCreditos, admin: viewAdmin, calibrar: viewCalibrar,
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
      'Tus jugadas del botón. Pícale a una y analízala con IA.</p><div id="clips" class="mt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    if (S.sport === 'futbol') return clipsFutbol();
    if (!S.user || !S.user.id) return;
    var done = S.demo ? Promise.resolve({}) : api('/ai/clips/analyzed').catch(function () { return {}; });
    Promise.all([api('/api/v1/social/users/' + S.user.id + '/clips'), done]).then(function (all) {
      var d = all[0], ana = all[1] || {};
      S.clipAi = ana;
      var clips = d.clips || [];
      var box = document.getElementById('clips'); if (!box) return;
      if (!clips.length) {
        box.innerHTML = '<div class="empty"><div class="ico">🎾</div>Aún no tienes clips.<br>Pícale al botón en la cancha y guárdalos desde <b>En vivo</b>.</div>';
        return;
      }
      box.innerHTML = '<div class="grid">' + clips.map(function (c, i) {
        var ct = courtById(c.court_id);
        var ai = c.analysis || c.ai_label || c.shot_type, done = ana[String(c.id)];
        return '<button class="clip" data-i="' + i + '">' +
          (c.thumbnail_url ? '<img src="' + esc(c.thumbnail_url) + '" loading="lazy">' : '<video src="' + esc(c.url) + '#t=0.5" preload="metadata" muted playsinline></video>') +
          (done ? '<span class="badge ai">' + (done.status === 'ready' ? 'IA ✓' : done.status === 'failed' ? 'IA ✕' : 'IA · analizando') + '</span>'
            : ai ? '<span class="badge ai">AI · ' + esc(typeof ai === 'string' ? ai : (ai.shot_type || 'análisis')) + '</span>' : '') +
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
      '<div class="acts"><button class="btn ghost" id="msave">Guardar</button><button class="btn" id="mshare">' + (c.session ? 'Con mis stats' : 'Compartir') + '</button></div>' +
      (!c.session && c.id && c.court_id ? '<div style="padding:0 16px calc(var(--sb) + 16px)"><button class="btn ai-go" id="mai"></button></div>' : '');
    m.classList.remove('hidden');
    m.querySelector('#mx').onclick = closeModal;
    var bai = m.querySelector('#mai');
    if (bai) {
      var prev = (S.clipAi || {})[String(c.id)];
      var has = prev && prev.status !== 'failed';
      bai.textContent = has ? (prev.status === 'ready' ? '🤖 Ver análisis con IA' : '🤖 Analizando… ver avance') : '🤖 Analizar con IA';
      bai.onclick = function () {
        if (has) { closeModal(); location.hash = '#/analisis/' + prev.session_id; return; }
        if (S.demo) { toast('En la demo no se analizan clips'); return; }
        bai.disabled = true; bai.textContent = 'Enviando a la IA…';
        api('/ai/clips/analyze', { method: 'POST', json: { clip_id: c.id } }).then(function (r) {
          S.clipAi = S.clipAi || {}; S.clipAi[String(c.id)] = { session_id: r.id, status: r.status };
          closeModal(); location.hash = '#/analisis/' + r.id;
        }).catch(function (e) {
          bai.disabled = false; bai.textContent = '🤖 Analizar con IA';
          toast((e && e.data && e.data.detail) || 'No se pudo mandar a analizar. Intenta otra vez.');
        });
      };
    }
    if (c.session) { m.querySelector('#mshare').onclick = function () { shareSheet(c.session, c.clip_id); }; m.querySelector('#msave').onclick = function () { saveVideo(c.url); }; return; }
    m.querySelector('#mshare').onclick = function () { shareUrl(c.url, 'Mi jugada en PÍCALE'); };
    m.querySelector('#msave').onclick = function () { saveVideo(c.url); };
  }
  // Compartir en redes, estilo Strava: clip arriba + stats del jugador → video vertical para historias
  function shareSheet(m, preId, track) {
    var md = document.getElementById('modal'), pick = preId || null, clips = [], file = null, out = null, poll = null, alive = true;
    md.innerHTML = '<div class="bar"><span class="sub" style="margin:0">Compartir en redes</span><button class="x" id="mx" aria-label="Cerrar">×</button></div>' +
      '<div id="shb" style="padding:0 16px calc(var(--sb) + 18px);overflow:auto;flex:1"></div>';
    md.classList.remove('hidden'); md.classList.add('solid');
    md.querySelector('#mx').onclick = function () { alive = false; clearTimeout(poll); closeModal(); };
    var box = md.querySelector('#shb');
    function choose() {
      box.innerHTML = '<h1 style="font-size:30px">Elige tu jugada</h1><p class="sub">Armamos un video vertical con el clip y tus estadísticas, listo para historias.</p>' +
        (clips.length ? '<div class="grid mt">' + clips.map(function (c, i) {
          return '<button class="clip' + (c.id === pick ? ' sel' : '') + '" data-i="' + i + '"><img src="' + esc(c.thumbnail_url) + '" loading="lazy">' +
            '<span class="badge' + (c.auto ? ' ai' : '') + '">' + (c.auto ? 'AUTOMÁTICO' : 'TU CLIP') + '</span><div class="meta"><b>' + esc(c.title || 'Clip') + '</b>' + mmss(c.start) + ' · ' + Math.round(c.end - c.start) + ' s</div></button>';
        }).join('') + '</div><button class="btn mt" id="sh-go"' + (pick ? '' : ' disabled') + '>CREAR VIDEO</button>'
          : '<div class="note">Todavía no hay clips listos. Crea uno con el editor del partido completo.</div>');
      box.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { pick = clips[+b.getAttribute('data-i')].id; haptic(); choose(); }; });
      var go = box.querySelector('#sh-go'); if (go) go.onclick = create;
    }
    function create() {
      box.innerHTML = '<div class="empty" style="padding-top:30%"><div class="spin" style="margin:auto;color:var(--green)"></div><p class="sub mt">Armando tu video…<br>tarda unos segundos</p></div>';
      api('/ai/sessions/' + m.id + '/share', { method: 'POST', json: { clip_id: pick, track_id: track || undefined } }).then(wait)
        .catch(function (e) { toast(errDetail(e, 'No se pudo crear')); choose(); });
    }
    function wait(r) {
      if (!alive) return;
      if (r.status === 'ready') return done(r);
      if (r.status === 'failed') { toast('No se pudo armar el video, intenta con otro clip'); return choose(); }
      poll = setTimeout(function () {
        api('/ai/sessions/' + m.id + '/share/' + pick + (track ? '?track=' + track : '')).then(wait).catch(function () { toast('No se pudo'); choose(); });
      }, 2000);
    }
    function done(r) {
      out = r; file = null;
      box.innerHTML = '<video src="' + esc(r.video_url) + '" autoplay loop muted playsinline style="width:100%;max-height:62vh;object-fit:contain;border-radius:16px;background:#000;display:block"></video>' +
        '<button class="btn mt" id="sh-share">COMPARTIR VIDEO</button>' +
        '<div class="row mt" style="gap:10px"><button class="btn ghost" id="sh-img" style="flex:1;margin-top:0">Imagen</button><button class="btn ghost" id="sh-dl" style="flex:1;margin-top:0">Descargar</button></div>' +
        '<button class="link mt" id="sh-other" style="display:block;margin:14px auto 0">Elegir otro clip</button>';
      // se descarga de una vez: así el botón comparte al instante (iPhone lo exige)
      fetch(r.video_url).then(function (x) { return x.blob(); }).then(function (b) { file = new File([b], 'picale_jugada.mp4', { type: 'video/mp4' }); }).catch(function () {});
      box.querySelector('#sh-share').onclick = function () { shareFile(file, r.video_url, 'picale_jugada.mp4'); };
      box.querySelector('#sh-img').onclick = function () {
        fetch(r.image_url).then(function (x) { return x.blob(); }).then(function (b) { shareFile(new File([b], 'picale_stats.jpg', { type: 'image/jpeg' }), r.image_url, 'picale_stats.jpg'); });
      };
      box.querySelector('#sh-dl').onclick = function () { download(file, r.video_url, 'picale_jugada.mp4'); };
      box.querySelector('#sh-other').onclick = choose;
    }
    api('/ai/sessions/' + m.id + '/clips').then(function (d) {
      clips = ((d && d.clips) || d || []).filter(function (c) { return c.status === 'ready'; });
      if (pick && !clips.some(function (c) { return c.id === pick; })) pick = null;
      if (preId && pick) create(); else choose();
    }).catch(function () { box.innerHTML = '<div class="empty">No se pudieron cargar tus clips.</div>'; });
  }
  function shareFile(f, url, name) {
    if (Plugins.Share && Plugins.Filesystem) return saveVideo(url);           // app nativa
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      return navigator.share({ files: [f], title: 'Mi jugada en PÍCALE' }).catch(function () {});
    }
    if (!f) { toast('Un segundo, se está descargando…'); return; }
    download(f, url, name);
  }
  function download(f, url, name) {
    var a = document.createElement('a');
    a.href = f ? URL.createObjectURL(f) : url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Descargado · súbelo a tus historias');
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
      watchLive(document.getElementById('live'), ct.hls);
      document.getElementById('start-here').onclick = function () { location.hash = '#/partido'; };
      document.getElementById('share-live').onclick = function () { shareUrl(CFG.WEB + '/tv.html?hls=' + encodeURIComponent(ct.hls) + '&name=' + encodeURIComponent(ct.club + ' ' + ct.name), 'En vivo en PÍCALE'); };
      return;
    }
    $view.innerHTML = '<h1>En vivo</h1><p class="sub">Canchas transmitiendo ahora.</p>' +
      (clubs.length ? clubs.map(function (c) {
        return '<h2>' + esc(c.name) + ' <span class="sub" style="font-family:var(--body);font-size:13px">· ' + esc(c.city) + '</span></h2><div class="list">' +
          c.courts.map(function (ct) {
            return '<a class="item" href="#/vivo/' + ct.key + '" data-club="' + esc(c.id) + '" data-name="' + esc(ct.name) + '"><span class="dot"></span><div><div class="ttl">' + esc(ct.name) + '</div>' +
              '<div class="dsc">' + (ct.sub ? esc(ct.sub) : '') + '</div></div><span class="chev">›</span></a>';
          }).join('') + '</div>';
      }).join('') : '<div class="empty"><div class="ico">⚽</div>Todavía no hay canchas de fútbol transmitiendo.</div>');
    // Marca qué canchas sí están transmitiendo en este momento
    if (S.demo || !S.token) return;
    api('/ai/courts').then(function (d) {
      var live = {};
      (d.clubs || []).forEach(function (cl) { (cl.courts || []).forEach(function (x) { live[cl.club_id + '|' + x.court_name] = x.live; }); });
      [].forEach.call($view.querySelectorAll('.item[data-club]'), function (a) {
        var k = a.getAttribute('data-club') + '|' + a.getAttribute('data-name');
        if (!(k in live)) return;
        var dsc = a.querySelector('.dsc'), dot = a.querySelector('.dot');
        if (live[k]) { dsc.innerHTML = '<span style="color:var(--green)">● Transmitiendo</span>'; }
        else { dot.style.background = 'var(--muted2)'; dot.style.animation = 'none'; dsc.textContent = 'Sin señal ahora'; a.style.opacity = '.6'; }
      });
    }).catch(function () {});
  }
  function playHls(video, src) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; return; }
    if (window.Hls && Hls.isSupported()) { S.hls = new Hls({ lowLatencyMode: true }); S.hls.loadSource(src); S.hls.attachMedia(video); }
  }
  function stopHls() { clearTimeout(S.hlsWait); if (S.hls) { S.hls.destroy(); S.hls = null; } }
  // En vivo con aviso: si en 15 s no arranca (o el servidor da error) se dice claro en vez de quedarse cargando
  function watchLive(video, src) {
    var wrap = video.parentNode, done = false;
    function fail() {
      if (done) return; done = true; stopHls();
      video.removeAttribute('src'); try { video.load(); } catch (e) {}
      var o = document.createElement('div');
      o.className = 'live-off';
      o.innerHTML = '<div class="ico">📡</div><b>Esta cancha no está transmitiendo ahora</b>' +
        '<span>La cámara del club está apagada o sin internet. Intenta en un rato.</span>' +
        '<button class="btn ghost" type="button">Reintentar</button>';
      wrap.appendChild(o);
      var chip = wrap.querySelector('.chip.live'); if (chip) chip.style.display = 'none';
      o.querySelector('button').onclick = function () { o.remove(); if (chip) chip.style.display = ''; watchLive(video, src); };
    }
    function ok() { done = true; clearTimeout(S.hlsWait); }
    video.addEventListener('playing', ok, { once: true });
    video.addEventListener('error', fail, { once: true });
    clearTimeout(S.hlsWait);
    S.hlsWait = setTimeout(fail, 15000);
    playHls(video, src);
    if (S.hls) S.hls.on(Hls.Events.ERROR, function (ev, d) { if (d && d.fatal) fail(); });
    else if (!video.src) fail();
    // Algunos navegadores bloquean autoplay: si ya cargó datos, no es falla
    video.addEventListener('loadeddata', function () { ok(); video.play().catch(function () {}); }, { once: true });
  }

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
  function typeLabel(t) { return t === 'training' ? 'Entrenamiento' : t === 'clip' ? 'Jugada' : 'Partido'; }

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
      '<button class="btn ghost" id="pick">¿No hay QR? Elige tu cancha</button>' +
      (S.demo ? '<button class="btn ghost" id="sim">Simular escaneo (demo)</button>' : '') +
      '<div class="err" id="qerr"></div>';
    box.querySelector('#back').onclick = stepUseToken;
    box.querySelector('#pick').onclick = stepPickCourt;
    box.querySelector('#scan').onclick = function () {
      scanRaw().then(function (raw) { if (raw) resolveQR(raw); });
    };
    var sim = box.querySelector('#sim'); if (sim) sim.onclick = function () { resolveQR(CFG.WEB + '/c/demo-somos-3'); };
  }
  // Sin QR en la cancha: lista de canchas con su estado (conectada, ocupada, sin señal)
  function stepPickCourt() {
    var box = pt(); if (!box) return;
    box.innerHTML = stepper(1) + '<button class="link" id="back">‹ Escanear QR</button><h1 class="mt">Elige tu cancha</h1>' +
      '<p class="sub">Solo puedes elegir las que están conectadas en este momento.</p><div class="err" id="qerr"></div><div id="pc" class="mt"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div></div>';
    box.querySelector('#back').onclick = stepScan;
    var LBL = { ok: ['green', '● Conectada'], busy: ['amber', 'Ocupada'], event: ['amber', 'En americana'], offline: ['red', 'Club sin conexión'], no_camera: ['red', 'Cámara sin señal'] };
    function load() {
      api('/ai/courts').then(function (d) {
        var el = document.getElementById('pc'); if (!el) return;
        var clubs = (d && d.clubs) || [];
        el.innerHTML = clubs.length ? clubs.map(function (cl) {
          return '<div class="spread mt"><b>' + esc(cl.club_name) + '</b>' + (cl.edge_online ? '' : '<span class="chip red">Sin conexión</span>') + '</div><div class="list mt">' +
            cl.courts.map(function (c) {
              var l = LBL[c.status] || ['', c.status];
              return '<button class="item" data-q="' + esc(c.qr_code) + '"' + (c.status === 'ok' ? '' : ' disabled') + ' style="width:100%;text-align:left' + (c.status === 'ok' ? '' : ';opacity:.5') + '">' +
                '<span class="tag">' + (c.sport === 'futbol' ? '⚽' : '🎾') + '</span><div class="ttl">' + esc(c.court_name) + '</div>' +
                '<span class="chip ' + l[0] + '" style="margin-left:auto">' + (c.status === 'ok' && c.live === false ? 'Conectada · sin en vivo' : l[1]) + '</span></button>';
            }).join('') + '</div>';
        }).join('') + '<button class="link mt" id="rf" style="display:block;margin:16px auto 0">Actualizar</button>'
          : '<div class="empty">No hay canchas disponibles.</div>';
        el.querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { if (!b.disabled) resolveQR(b.getAttribute('data-q')); }; });
        var rf = el.querySelector('#rf'); if (rf) rf.onclick = function () { el.innerHTML = '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>'; load(); };
      }).catch(function () { var el = document.getElementById('pc'); if (el) el.innerHTML = '<div class="empty">No se pudo cargar. Intenta de nuevo.</div>'; });
    }
    load();
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
        (!c.stream_ok ? '<span class="chip red">Club sin conexión</span>' : c.camera_ok === false ? '<span class="chip amber">Sin en vivo · sí graba</span>' : '<span class="chip green">✓ Cámara OK</span>') + '</div>' +
        '<div class="player mt"><video id="cv" playsinline muted autoplay></video><span class="chip red live"><span class="dot"></span>EN VIVO</span></div></div>' +
      '<div class="card mt spread"><div><div class="sub" style="margin:0">' + typeLabel(f.type) + '</div><b>' + f.min + ' min</b></div><span class="chip green">' + f.cost + ' token' + (f.cost > 1 ? 's' : '') + '</span></div>' +
      '<button class="btn rec mt" id="go"' + (c.stream_ok ? '' : ' disabled') + '>● INICIAR ' + (f.type === 'training' ? 'ENTRENAMIENTO' : 'PARTIDO') + '</button>' +
      '<button class="btn ghost" id="rescan">No es mi cancha · escanear otra vez</button>' +
      (c.stream_ok ? (c.camera_ok === false ? '<div class="note">La transmisión en vivo de esta cancha está caída, pero tu partido sí se graba en el club y se analiza igual. Si no llega el video, se te regresa el token.</div>' : '')
        : '<div class="note">El club está sin conexión con PÍCALE en este momento. Avisa en recepción; no se te cobrará el token.</div>');
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
        return '<a class="item" href="#/analisis/' + m.id + '"><span class="tag">' + (m.type === 'training' ? '🎯' : m.type === 'clip' ? '🎬' : '🎾') + '</span><div><div class="ttl">' + esc(typeLabel(m.type)) + ' · ' + esc(ct ? ct.club : '') + '</div><div class="dsc">' + esc((ct ? ct.name + ' · ' : '') + fmtTime(m.started_at)) + '</div></div>' +
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
        if (m.status === 'failed') { box.innerHTML = '<div class="empty"><div class="ico">⚠️</div>' + (m.type === 'clip' ? 'No pudimos analizar este clip. Puedes intentarlo otra vez desde Mis clips.' : 'No pudimos analizar esta sesión. Tu token fue devuelto.') + '</div>'; return; }
        if (m.event_id) { var bk = $view.querySelector('a.link'); if (bk) { bk.href = '#/americana/' + m.event_id; bk.textContent = '‹ ' + (m.event_title || 'Americana'); } }
        drawReport(box, m);
      }).catch(function (e) {
        if (e && !e.status) console.error('analisis', e);
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
    var openShot = null, hasVideo = !!m.video_url;
    function more(st) {
      var rows = [];
      function row(k, v) { if (v != null && v !== '') rows.push('<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'); }
      if (st.back_pct != null) {
        rows.push('<div class="zones"><div class="zbar"><i style="width:' + st.back_pct + '%" class="zb"></i><i style="width:' + st.mid_pct + '%" class="zm"></i><i style="width:' + st.net_pct + '%" class="zn"></i></div>' +
          '<div class="spread zl"><span><i class="zb"></i>Fondo ' + Math.round(st.back_pct) + '%</span><span><i class="zm"></i>Medio ' + Math.round(st.mid_pct) + '%</span><span><i class="zn"></i>Red ' + Math.round(st.net_pct) + '%</span></div></div>');
      }
      if (st.drive_side_pct != null) row('Lado donde más jugó', st.drive_side_pct >= 60 ? 'Drive (' + Math.round(st.drive_side_pct) + '%)' : st.drive_side_pct <= 40 ? 'Revés (' + Math.round(100 - st.drive_side_pct) + '%)' : 'Los dos lados');
      row('Subidas a la red', st.net_approaches);
      row('Sprints (más de 15 km/h)', st.sprints);
      row('Velocidad promedio', st.avg_speed_kmh != null ? st.avg_speed_kmh.toFixed(1) + ' km/h' : null);
      row('Distancia por punto', st.distance_per_rally_m != null ? st.distance_per_rally_m + ' m' : null);
      row('Golpes por punto', st.shots_per_rally);
      row('Derechas vs revés', st.forehand_pct != null ? st.forehand_pct + '% / ' + (100 - st.forehand_pct) + '%' : null);
      row('Mano', st.hand ? (st.hand === 'zurdo' ? 'Zurdo' : 'Diestro') : null);
      return rows.length ? '<h2>Más datos</h2><div class="card kvs">' + rows.join('') + '</div>' : '';
    }
    function seekVideo(t) {
      var v = document.getElementById('fv'); if (!v) return;
      v.currentTime = Math.max(0, t - 1.5); v.play().catch(function () {});
      v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function draw() {
      var st = (sel && sel.stats) || {};
      var shots = st.shots || {};
      var totalShots = Object.keys(shots).reduce(function (a, k) { return a + shots[k]; }, 0) || 1;
      var noShots = st.total_shots == null;
      var main = noShots
        ? stat(st.distance_m != null ? (st.distance_m / 1000).toFixed(2) + ' km' : '—', 'Distancia recorrida') +
          stat(st.active_min != null ? (st.active_min < 1 ? Math.round(st.active_min * 60) + ' s' : Math.round(st.active_min) + ' min') : '—', 'En movimiento') +
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
        (noShots ? '<div class="note">' + (/^v2/.test(m.analysis_version || '') ? 'No se alcanzaron a leer golpes de este jugador (muy lejos de la cámara o tapado).' : 'Este análisis es de la versión anterior. Los partidos nuevos ya traen golpes por tipo.') + '</div>' : '') +
        (Object.keys(shots).length ? '<h2>Tipos de golpe</h2><div class="card shots">' + Object.keys(shots).sort(function (a, b) { return shots[b] - shots[a]; }).map(function (k) {
          var list = (st.shot_list || []).filter(function (x) { return x[1] === k; });
          return '<button class="shot-row" data-k="' + esc(k) + '"' + (list.length && hasVideo ? '' : ' disabled') + '><div class="spread" style="font-size:13.5px"><span>' + esc(k) + '</span><b>' + shots[k] + (list.length && hasVideo ? ' <span class="chev">›</span>' : '') + '</b></div><div class="bar"><i style="width:' + Math.round(shots[k] / totalShots * 100) + '%"></i></div></button>' +
            (openShot === k ? '<div class="chips shot-times">' + list.map(function (x, i) { return '<button class="chip" data-st="' + x[0] + '">▶ ' + mmss(x[0]) + '</button>'; }).join('') + '</div>' : '');
        }).join('') + '<p class="free" style="margin:12px 0 0">Beta: la IA lee los golpes por la postura del jugador. ' + (hasVideo ? 'Toca un tipo para ver cada golpe en el video.' : '') + '</p></div>' : '') +
        more(st) +
        (sel && sel.clips_by_shot ? '<h2>Clips por golpe</h2><div class="chips">' + Object.keys(sel.clips_by_shot).map(function (k) {
          var arr = sel.clips_by_shot[k] || [];
          return '<button class="chip" data-shot="' + esc(k) + '">▶ ' + esc(k) + ' · ' + arr.length + '</button>';
        }).join('') + '</div>' : '') +
        (sel && sel.heatmap_url ? '<h2>Mapa de calor</h2><img src="' + esc(sel.heatmap_url) + '" style="width:100%;border-radius:16px;border:1px solid var(--line)">' : '') +
        (sel && sel.coach_summary ? '<h2>' + (training ? 'Resumen de la IA' : 'Resumen del coach') + '</h2><div class="card coach">' + esc(sel.coach_summary).replace(/\n/g, '<br>') + '</div>' : '') +
        (training && m.is_owner !== false
          ? '<h2>Notas del coach</h2><textarea id="note" class="ta" placeholder="Qué trabajar la próxima clase…">' + esc((sel && sel.coach_note) || '') + '</textarea>' +
            '<button class="btn mt" id="send">Enviar reporte a ' + esc(who(sel)) + '</button>'
          : ((m.players || []).some(function (p) { return p.is_me; }) || m.is_owner
              ? '<button class="btn mt" id="share">📲 Compartir en redes</button><p class="free">Elige un clip y armamos tu historia con tus stats</p>' : ''));
      sbox.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { sel = players.filter(function (p) { return String(p.track_id) === b.getAttribute('data-t'); })[0]; openShot = null; draw(); }; });
      sbox.querySelectorAll('.shot-row').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-k'); openShot = openShot === k ? null : k; draw(); }; });
      sbox.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { seekVideo(parseFloat(b.getAttribute('data-st'))); }; });
      sbox.querySelectorAll('[data-shot]').forEach(function (b) { b.onclick = function () {
        var arr = sel.clips_by_shot[b.getAttribute('data-shot')] || [];
        if (arr[0] && arr[0].url) openClip({ url: arr[0].url, created_at: m.started_at }); else toast('Clips de ejemplo: en el análisis real se abren aquí');
      }; });
      var sh = sbox.querySelector('#share'); if (sh) sh.onclick = function () { shareSheet(m, null, m.is_owner && sel && !sel.is_me ? sel.track_id : null); };
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
    var ev = !!m.event_id;
    box.innerHTML = '<span class="chip' + (training ? ' amber' : ' green') + '">' + (training ? '🎯 Entrenamiento' : ev ? '🏆 Americana' : m.type === 'clip' ? '🎬 Jugada' : '🎾 Partido') + '</span>' +
      '<h1 class="mt">' + esc(ev ? (m.event_title || 'Americana') : ct ? ct.club : 'Tu sesión') + '</h1><p class="sub">' +
      esc((ev ? (m.court_name || (ct && ct.name) || '') + ' · ' : ct ? ct.name + ' · ' : '') + fmtTime(m.started_at)) + '</p>' +
      (m.spectator
        ? (m.snapshot_url ? '<img src="' + esc(m.snapshot_url) + '" style="width:100%;border-radius:14px;display:block;margin-top:6px" alt="">' : '') +
          '<div class="card mt" style="border-color:var(--green-line)"><b>¿Jugaste este partido?</b><div class="sub" style="margin:4px 0 0">Elige tu letra y te salen tus estadísticas, tu mapa de calor y tus clips.</div>' +
          '<button class="btn mt" id="iam">ELEGIR MI LETRA</button></div>'
        : '') +
      '<div id="clipsec"></div><div id="sumsec"></div><div id="plsec"></div><div id="statsec"></div>';
    var sbox = box.querySelector('#statsec');
    var sm = m.summary;
    if (sm && sm.rallies) {
      box.querySelector('#sumsec').innerHTML = '<h2>El partido</h2><div class="stats">' +
        stat(sm.rallies, 'Puntos jugados') +
        stat(sm.avg_rally_s != null ? Math.round(sm.avg_rally_s) + ' s' : '—', 'Duración promedio del punto') +
        stat(sm.longest_rally_s != null ? Math.round(sm.longest_rally_s) + ' s' : '—', 'Punto más largo') +
        stat(sm.avg_shots_per_rally != null ? sm.avg_shots_per_rally : '—', 'Golpes por punto') + '</div>';
    }
    if (!m.spectator && !training) drawPlayers(box.querySelector('#plsec'), m, players);
    drawClips(box.querySelector('#clipsec'), m);
    var iam = box.querySelector('#iam');
    if (iam) iam.onclick = function () {
      claimSheet({ session_id: m.id, snapshot_url: m.snapshot_url, start: m.started_at, end: m.ends_at,
        players: players.map(function (p) { return { track_id: p.track_id, claimed: !!p.display_name, is_me: p.is_me, name: p.display_name }; }) }, m.claim_cost);
    };
    if (!m.spectator) draw();
  }

  // ───────────────────────── CALIBRAR UNA CANCHA (admin, desde el cel)
  // Foto de la cámara + 4 esquinas que se arrastran; encima se dibujan las líneas reales (red, saque, centro)
  // para ver al momento si cuadra. Las esquinas pueden salir de la foto si la cámara corta la línea de fondo.
  function viewCalibrar(parts) {
    var cid = parts[0];
    $view.innerHTML = '<a href="#/admin" class="link">‹ Panel</a><h1 class="mt" id="cb-t">Calibrar cancha</h1><p class="sub" id="cb-s"></p>' +
      '<div id="cb"><div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div><p class="sub">Sacando foto de la cámara…</p></div></div>';
    function load(source) {
      api('/ai/admin/courts/' + cid + '/calibration' + (source ? '?source=' + source : '')).then(draw).catch(function (e) {
        var b = document.getElementById('cb'); if (!b) return;
        b.innerHTML = '<div class="empty"><div class="ico">📷</div>' + esc(errDetail(e, 'No se pudo sacar la foto')) + '</div>' +
          '<button class="btn ghost mt" id="cb-live">Intentar con el en vivo</button>';
        b.querySelector('#cb-live').onclick = function () { b.innerHTML = '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>'; load('live'); };
      });
    }
    function draw(d) {
      var box = document.getElementById('cb'); if (!box) return;
      document.getElementById('cb-t').textContent = d.court.court_name;
      document.getElementById('cb-s').textContent = d.court.club_name + ' · foto ' + (d.source || '') + (d.method ? ' · calibración ' + (d.method === 'auto' ? 'automática' : 'manual') : ' · sin calibrar');
      var W = d.width, H = d.height;
      var MX = 0.05 * W, MT = 0.05 * H, MB = 0.3 * H;          // margen para sacar esquinas de la foto
      var pts = (d.corners && d.corners.length === 4) ? d.corners.map(function (p) { return p.slice(); })
        : [[0.06 * W, 0.97 * H], [0.94 * W, 0.97 * H], [0.68 * W, 0.32 * H], [0.32 * W, 0.32 * H]];
      var NAMES = ['1 · cerca izq.', '2 · cerca der.', '3 · fondo der.', '4 · fondo izq.'];
      var R = W / 42, Z = 3, LR = W / 7;                         // tamaño del punto, zoom y radio de la lupa
      box.innerHTML =
        '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="chip" id="cb-v">📼 Foto de grabación</button><button class="chip" id="cb-l">📡 Foto del en vivo</button></div>' +
        '<div class="calib mt"><svg id="cb-svg" viewBox="' + (-MX) + ' ' + (-MT) + ' ' + (W + 2 * MX) + ' ' + (H + MT + MB) + '" preserveAspectRatio="xMidYMid meet">' +
          '<defs><clipPath id="cb-clip"><circle id="cb-cc" r="' + LR + '"></circle></clipPath></defs>' +
          '<rect x="' + (-MX) + '" y="' + (-MT) + '" width="' + (W + 2 * MX) + '" height="' + (H + MT + MB) + '" fill="#111"></rect>' +
          '<g id="cb-scene"><image href="' + esc(d.frame_url) + '" x="0" y="0" width="' + W + '" height="' + H + '"></image>' +
          '<g id="cb-lines" fill="none" stroke-linecap="round"></g></g>' +
          '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="rgba(255,255,255,.25)" stroke-dasharray="' + (W / 100) + '"></rect>' +
          '<g id="cb-pts"></g>' +
          '<g id="cb-loupe" style="display:none"><g clip-path="url(#cb-clip)"><rect id="cb-lbg" fill="#111"></rect><use id="cb-use" href="#cb-scene"></use></g>' +
          '<circle id="cb-lring" r="' + LR + '" fill="none" stroke="#5EE87A" stroke-width="' + (W / 300) + '"></circle>' +
          '<path id="cb-cross" stroke="#fff" stroke-width="' + (W / 600) + '"></path></g>' +
        '</svg></div>' +
        '<div class="card mt calib-help"><b>Cómo calibrar</b><ol>' +
          '<li>Arrastra cada punto a una esquina de la cancha, <b>a nivel del piso</b> (donde el cristal toca el pasto).</li>' +
          '<li>Las líneas verdes son la red, las líneas de saque y la línea central. Si caen sobre las líneas reales, quedó bien.</li>' +
          '<li>Si la cámara no alcanza a ver la línea de fondo de cerca, saca los puntos 1 y 2 por debajo de la foto hasta que las líneas de saque y la red cuadren.</li>' +
          '<li>Gira el cel para ver la foto más grande. Al arrastrar sale una lupa para atinarle exacto.</li></ol></div>' +
        '<div class="err" id="cb-err"></div>' +
        '<button class="btn mt" id="cb-save">GUARDAR CALIBRACIÓN</button>' +
        (d.method ? '<button class="btn ghost" id="cb-auto">Volver a la automática</button>' : '') +
        '<div id="cb-after"></div>';
      var svg = box.querySelector('#cb-svg'), gl = box.querySelector('#cb-lines'), gp = box.querySelector('#cb-pts');
      var loupe = box.querySelector('#cb-loupe');
      // homografía cancha (m) → imagen (px) con las 4 esquinas
      function homog() {
        var src = [[0, 0], [10, 0], [10, 20], [0, 20]], A = [], b = [];
        for (var i = 0; i < 4; i++) {
          var X = src[i][0], Y = src[i][1], u = pts[i][0], v = pts[i][1];
          A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
          A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
        }
        for (var c = 0; c < 8; c++) {                 // Gauss con pivoteo
          var mx = c; for (var r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[mx][c])) mx = r;
          var t = A[c]; A[c] = A[mx]; A[mx] = t; t = b[c]; b[c] = b[mx]; b[mx] = t;
          if (Math.abs(A[c][c]) < 1e-12) return null;
          for (r = 0; r < 8; r++) if (r !== c) {
            var f = A[r][c] / A[c][c];
            for (var k = c; k < 8; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
          }
        }
        var h = b.map(function (v, i) { return v / A[i][i]; });
        return function (X, Y) { var w = h[6] * X + h[7] * Y + 1; return [(h[0] * X + h[1] * Y + h[2]) / w, (h[3] * X + h[4] * Y + h[5]) / w]; };
      }
      function seg(P, a, b, color, wd) {
        var p = P(a[0], a[1]), q = P(b[0], b[1]);
        return '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" stroke="' + color + '" stroke-width="' + wd + '"></line>';
      }
      function render() {
        var P = homog(), sw = W / 260, html = '';
        if (P) {
          html += seg(P, [0, 0], [10, 0], '#FFD54A', sw) + seg(P, [10, 0], [10, 20], '#FFD54A', sw) + seg(P, [10, 20], [0, 20], '#FFD54A', sw) + seg(P, [0, 20], [0, 0], '#FFD54A', sw);
          html += seg(P, [0, 10], [10, 10], '#5EE87A', sw * 1.6);                                     // red
          html += seg(P, [0, 3.05], [10, 3.05], '#5EE87A', sw) + seg(P, [0, 16.95], [10, 16.95], '#5EE87A', sw);   // líneas de saque
          html += seg(P, [5, 3.05], [5, 16.95], '#5EE87A', sw);                                       // central
        }
        gl.innerHTML = html;
        gp.innerHTML = pts.map(function (p, i) {
          return '<g data-i="' + i + '" class="cb-h"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (R * 2.2) + '" fill="transparent"></circle>' +
            '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + R + '" fill="rgba(94,232,122,.25)" stroke="#5EE87A" stroke-width="' + (W / 300) + '"></circle>' +
            '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (W / 400) + '" fill="#fff"></circle>' +
            '<text x="' + p[0] + '" y="' + (p[1] - R * 1.4) + '" font-size="' + (W / 40) + '" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="' + (W / 500) + '" paint-order="stroke">' + NAMES[i] + '</text></g>';
        }).join('');
      }
      function toSvg(ev) {
        var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
        var p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return [Math.max(-MX, Math.min(W + MX, p.x)), Math.max(-MT, Math.min(H + MB, p.y))];
      }
      function showLoupe(p) {
        // la lupa va arriba del dedo (o abajo si no cabe) y muestra la zona aumentada
        var cx = p[0], cy = p[1] - LR * 1.8; if (cy - LR < -MT) cy = p[1] + LR * 1.8;
        box.querySelector('#cb-cc').setAttribute('cx', cx); box.querySelector('#cb-cc').setAttribute('cy', cy);
        box.querySelector('#cb-lring').setAttribute('cx', cx); box.querySelector('#cb-lring').setAttribute('cy', cy);
        var bg = box.querySelector('#cb-lbg'); bg.setAttribute('x', cx - LR); bg.setAttribute('y', cy - LR); bg.setAttribute('width', 2 * LR); bg.setAttribute('height', 2 * LR);
        box.querySelector('#cb-use').setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + Z + ') translate(' + (-p[0]) + ' ' + (-p[1]) + ')');
        var c = LR * 0.35;
        box.querySelector('#cb-cross').setAttribute('d', 'M' + (cx - c) + ' ' + cy + 'H' + (cx + c) + 'M' + cx + ' ' + (cy - c) + 'V' + (cy + c));
        loupe.style.display = '';
      }
      var drag = null;
      svg.addEventListener('pointerdown', function (ev) {
        var p = toSvg(ev), best = -1, bd = R * 3.2;
        pts.forEach(function (q, i) { var dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd < bd) { bd = dd; best = i; } });
        if (best < 0) return;
        ev.preventDefault(); svg.setPointerCapture(ev.pointerId);
        drag = { i: best, dx: pts[best][0] - p[0], dy: pts[best][1] - p[1] };
        showLoupe(pts[best]); haptic();
      });
      svg.addEventListener('pointermove', function (ev) {
        if (!drag) return; ev.preventDefault();
        var p = toSvg(ev);
        pts[drag.i] = [Math.round((p[0] + drag.dx) * 10) / 10, Math.round((p[1] + drag.dy) * 10) / 10];
        render(); showLoupe(pts[drag.i]);
      });
      function end() { drag = null; loupe.style.display = 'none'; }
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      render();
      box.querySelector('#cb-v').onclick = function () { box.innerHTML = '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>'; load('video'); };
      box.querySelector('#cb-l').onclick = function () { box.innerHTML = '<div class="empty"><div class="spin" style="margin:auto;color:var(--green)"></div></div>'; load('live'); };
      box.querySelector('#cb-save').onclick = function () {
        var bt = this, err = box.querySelector('#cb-err'); err.textContent = ''; bt.disabled = true;
        api('/ai/admin/courts/' + cid + '/calibration', { method: 'PUT', json: { corners: pts, width: W, height: H } }).then(function () {
          haptic(); toast('Calibración guardada'); bt.disabled = false;
          var ls = d.last_session, af = box.querySelector('#cb-after');
          af.innerHTML = '<div class="card mt" style="border-color:var(--green-line)"><b>Listo.</b><div class="sub" style="margin:4px 0 0">Los próximos partidos de esta cancha ya usan esta calibración.</div>' +
            (ls && ls.has_video ? '<button class="btn ghost mt" id="cb-re">Reanalizar el último partido (' + esc(fmtTime(ls.started_at)) + ')</button>' : '') + '</div>';
          var re = af.querySelector('#cb-re'); if (re) re.onclick = function () {
            re.disabled = true;
            api('/ai/admin/sessions/' + ls.id + '/reanalyze', { method: 'POST' }).then(function () { toast('Se mandó a analizar otra vez'); re.textContent = 'En la fila de la IA'; })
              .catch(function (e) { re.disabled = false; toast(errDetail(e, 'No se pudo')); });
          };
        }).catch(function (e) { bt.disabled = false; err.textContent = errDetail(e, 'No se pudo guardar'); });
      };
      var au = box.querySelector('#cb-auto'); if (au) au.onclick = function () {
        api('/ai/admin/courts/' + cid + '/calibration', { method: 'DELETE' }).then(function () { toast('La IA la vuelve a calibrar sola en el próximo partido'); location.hash = '#/admin'; })
          .catch(function () { toast('No se pudo'); });
      };
    }
    load();
  }

  // Jugadores del partido: quién es cada letra; el dueño (o quien ya está) agrega a los demás por @usuario o correo
  function drawPlayers(box, m, players) {
    if (!box || !players.length) return;
    box.innerHTML = '<h2>Jugadores</h2><div class="list">' + players.map(function (p) {
      var name = p.is_me ? 'Tú' : p.display_name;
      var tag = p.is_me ? '' : p.invited ? '<span class="chip amber">Invitado</span>' : p.has_account ? '<span class="chip green">Con cuenta</span>' : '';
      return '<div class="item pl"><span class="lt">' + esc(p.track_id) + '</span><div><div class="ttl">' + (name ? esc(name) : '<span style="color:var(--muted)">Sin asignar</span>') + '</div>' +
        '<div class="dsc">' + esc(p.side_label || '') + (p.invited && p.invite_email ? ' · ' + esc(p.invite_email) : '') + '</div></div>' + tag +
        (m.can_add_players ? '<button class="link" data-add="' + esc(p.track_id) + '">' + (name ? 'Cambiar' : 'Agregar') + '</button>' : '') + '</div>';
    }).join('') + '</div>' +
      (m.can_add_players ? '<p class="free">Agrega a tus compañeros con su @usuario o su correo. Si todavía no tienen cuenta, les llega su análisis en cuanto se registren con ese correo.</p>' : '');
    box.querySelectorAll('[data-add]').forEach(function (b) {
      b.onclick = function () { addPlayerSheet(m, players.filter(function (p) { return p.track_id === b.getAttribute('data-add'); })[0]); };
    });
  }
  function addPlayerSheet(m, p) {
    var md = document.getElementById('modal');
    var meTaken = (m.players || []).some(function (x) { return x.is_me; });
    md.innerHTML = '<div class="bar"><span class="sub" style="margin:0">Jugador ' + esc(p.track_id) + '</span><button class="x" id="mx" aria-label="Cerrar">×</button></div>' +
      '<div style="padding:0 16px calc(var(--sb) + 18px);overflow:auto">' +
      (m.snapshot_url ? '<img src="' + esc(m.snapshot_url) + '" style="width:100%;border-radius:14px;display:block" alt="Foto del partido con las letras">' : '') +
      '<h1 class="mt" style="font-size:28px">¿Quién es ' + esc(p.track_id) + '?</h1><p class="sub">' + esc(p.side_label || '') + '</p>' +
      '<label class="field"><span>@usuario o correo</span><input id="who" autocomplete="off" autocapitalize="none" inputmode="email" placeholder="@pablo o pablo@correo.com"></label>' +
      '<label class="field"><span>Nombre (si no tiene cuenta)</span><input id="nm" autocomplete="off" placeholder="Ej. Juan Pérez"></label>' +
      '<div class="err" id="aerr"></div>' +
      '<button class="btn mt" id="ok">AGREGAR</button>' +
      (!p.is_me && !meTaken ? '<button class="btn ghost" id="me">Soy yo</button>' : '') +
      (p.display_name || p.is_me ? '<button class="link mt" id="rm" style="display:block;margin:14px auto 0;color:var(--red)">Quitar a ' + esc(p.is_me ? 'mí' : p.display_name) + '</button>' : '') +
      '</div>';
    md.classList.remove('hidden'); md.classList.add('solid');
    md.querySelector('#mx').onclick = closeModal;
    function done(r) {
      haptic(); closeModal();
      if (r && r.invited) {
        toast('Invitación lista: mándale el link');
        shareUrl(r.link, 'Tu análisis del partido en PÍCALE AI');
      } else toast('Listo, ' + ((r && r.display_name) || 'jugador') + ' ya ve sus estadísticas');
      analisisDetail(m.id);
    }
    function send(who) {
      var err = md.querySelector('#aerr'); err.textContent = '';
      if (!who) { err.textContent = 'Escribe su @usuario o su correo'; return; }
      var bt = md.querySelector('#ok'); bt.disabled = true;
      api('/ai/sessions/' + m.id + '/players/' + p.track_id + '/assign', { method: 'POST', json: { who: who, name: md.querySelector('#nm').value.trim() } })
        .then(done).catch(function (e) { bt.disabled = false; err.textContent = errDetail(e, 'No se pudo agregar'); });
    }
    md.querySelector('#ok').onclick = function () { send(md.querySelector('#who').value.trim()); };
    userSuggest(md.querySelector('#who'), function (u) { send('@' + u.username); });
    var me = md.querySelector('#me'); if (me) me.onclick = function () { send('me'); };
    var rm = md.querySelector('#rm'); if (rm) rm.onclick = function () {
      api('/ai/sessions/' + m.id + '/players/' + p.track_id + '/assign', { method: 'DELETE' })
        .then(function () { closeModal(); toast('Listo'); analisisDetail(m.id); })
        .catch(function (e) { toast(errDetail(e, 'No se pudo quitar')); });
    };
  }

  // Sugerencias al escribir @ (como Instagram): lista debajo del campo; tocar una la elige
  function userSuggest(input, onPick) {
    var list = document.createElement('div'); list.className = 'suggest hidden';
    input.parentNode.appendChild(list);
    var t, last = '';
    input.addEventListener('input', function () {
      var v = input.value.trim();
      clearTimeout(t);
      if (v.indexOf('@') !== 0 || v.length < 2 || v.indexOf('@', 1) > 0) { list.classList.add('hidden'); return; }
      t = setTimeout(function () {
        last = v;
        api('/ai/users/search?q=' + encodeURIComponent(v.slice(1))).then(function (d) {
          if (input.value.trim() !== last) return;
          var us = d.users || [];
          if (!us.length) { list.innerHTML = '<div class="sg-none">Nadie con ese usuario. Puedes poner su correo.</div>'; list.classList.remove('hidden'); return; }
          list.innerHTML = us.map(function (u, i) {
            var ini = (u.name || u.username || '?').trim().charAt(0).toUpperCase();
            return '<button type="button" data-i="' + i + '"><span class="av">' + esc(ini) + '</span><span class="nm"><b>@' + esc(u.username) + '</b><small>' + esc(u.name || '') + '</small></span></button>';
          }).join('');
          list.classList.remove('hidden');
          list.querySelectorAll('[data-i]').forEach(function (b) {
            b.onclick = function () { var u = us[+b.getAttribute('data-i')]; input.value = '@' + u.username; list.classList.add('hidden'); haptic(); if (onPick) onPick(u); };
          });
        }).catch(function () {});
      }, 180);
    });
    input.addEventListener('blur', function () { setTimeout(function () { list.classList.add('hidden'); }, 200); });
  }

  // Clips del partido completo: los puntos salen solos y el jugador corta los suyos.
  function drawClips(box, m) {
    var moments = m.moments || [], clips = m.clips || [], dur = m.duration_s || 0;
    var markIn = null, markOut = null, stopAt = null, poll = null;
    function t(x) { return mmss(x || 0); }
    function render() {
      box.innerHTML =
        '<h2>' + (m.spectator ? 'Mejores puntos' : 'Tus clips') + '</h2>' +
        (clips.length ? '<div class="grid">' + clips.map(function (c, i) {
          return '<button class="clip" data-c="' + i + '">' +
            (c.status === 'ready' ? '<img src="' + esc(c.thumbnail_url) + '" loading="lazy">' : '<div class="empty" style="padding:40% 0 0"><div class="spin" style="margin:auto;color:var(--green)"></div></div>') +
            '<span class="badge' + (c.auto ? ' ai' : '') + '">' + (c.auto ? 'AUTOMÁTICO' : 'TU CLIP') + '</span>' +
            '<div class="meta"><b>' + esc(c.title || 'Clip') + '</b>' + t(c.start) + ' · ' + Math.round(c.end - c.start) + ' s</div></button>';
        }).join('') + '</div>' : '<div class="note">Aquí aparecen tus clips: los mejores puntos se cortan solos y puedes crear los tuyos abajo.</div>') +
        (m.video_url
          ? '<h2>' + (m.type === 'clip' ? 'Tu jugada completa' : 'Partido completo') + '</h2>' +
            '<div class="player"><video id="fv" src="' + esc(m.video_url) + '" controls playsinline preload="metadata"></video></div>' +
            (dur ? '<div class="tl" id="tl">' + moments.map(function (x, i) {
              return '<i data-m="' + i + '" class="' + (x.top ? 'top' : '') + '" style="left:' + (x.start / dur * 100) + '%;width:' + Math.max(0.6, (x.end - x.start) / dur * 100) + '%"></i>';
            }).join('') + '<b id="tl-in" class="mk hidden"></b><b id="tl-out" class="mk hidden"></b><span id="tl-now"></span></div>' : '') +
            (moments.length ? '<div class="sub" style="margin:10px 0 6px">' + moments.length + ' puntos detectados · toca uno para verlo</div><div class="chips">' + moments.map(function (x, i) {
              return '<button class="chip' + (x.top ? ' green' : '') + '" data-m="' + i + '">' + (x.top ? '★ ' : '') + 'Punto ' + (i + 1) + ' · ' + t(x.start) + '</button>';
            }).join('') + '</div>' : '') +
            (m.spectator ? '' : '<div class="card mt"><div class="ttl" style="font-weight:700">Crea tu clip</div>' +
            '<p class="sub" style="margin-top:4px">Pon el video donde empieza la jugada y marca el inicio; luego donde termina y marca el fin.</p>' +
            '<div class="row mt"><button class="btn ghost" id="b-in" style="flex:1">Inicio ' + (markIn != null ? t(markIn) : '') + '</button>' +
            '<button class="btn ghost" id="b-out" style="flex:1;margin-top:0">Fin ' + (markOut != null ? t(markOut) : '') + '</button></div>' +
            '<label class="field"><span>Nombre (opcional)</span><input id="b-title" maxlength="60" placeholder="Ej. Bandeja ganadora"></label>' +
            '<button class="btn mt" id="b-make"' + (markIn != null && markOut != null && markOut - markIn >= 2 ? '' : ' disabled') + '>CREAR CLIP' +
            (markIn != null && markOut != null && markOut > markIn ? ' · ' + Math.round(markOut - markIn) + ' s' : '') + '</button></div>')
          : (clips.length ? '<p class="free">El partido completo se guarda 30 días; tus clips se quedan.</p>' : ''));
      wire();
    }
    function wire() {
      box.querySelectorAll('[data-c]').forEach(function (b) {
        b.onclick = function () { var c = clips[+b.getAttribute('data-c')]; if (c.status === 'ready') openClip({ url: c.url, created_at: m.started_at, session: m, clip_id: c.id }); else toast('Se está cortando, unos segundos…'); };
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
      if (!box.querySelector('#b-in')) return;          // espectador: sin editor
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
    var nm = u.name || u.username || (u.email ? u.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Jugador');
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
      '<h2>Cuentas de PÍCALE <span class="sub" id="ac-n" style="font-size:14px"></span></h2>' +
      '<label class="field"><span>Buscar por @usuario, nombre o correo</span><input id="ac-q" autocapitalize="none" autocomplete="off"></label>' +
      '<div id="ac-list" class="list mt"></div><button class="link mt" id="ac-copy" style="display:block;margin:10px auto 0">Copiar lista de @usuarios</button>' +
      '<p class="free">Solo tú ves esta lista. "IA" = ya abrió PÍCALE AI.</p>' +
      '<h2>Calibrar canchas</h2><div id="ad-courts" class="list"></div><p class="free">La calibración le dice a la IA dónde están las líneas. Si una cancha sale mal (distancias raras, jugadores fuera de la cancha), calíbrala aquí.</p>' +
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
    var accs = [];
    function accounts(q) {
      api('/ai/admin/accounts?q=' + encodeURIComponent(q || '')).then(function (d) {
        var box = document.getElementById('ac-list'); if (!box) return;
        accs = d.accounts || [];
        document.getElementById('ac-n').textContent = '· ' + d.total + ' cuentas';
        box.innerHTML = accs.slice(0, 200).map(function (a) {
          return '<div class="item"><div style="min-width:0"><div class="ttl">' + (a.username ? '@' + esc(a.username) : '<span style="color:var(--muted)">sin @usuario</span>') + '</div>' +
            '<div class="dsc">' + esc((a.name || '') + (a.email ? ' · ' + a.email : '')) + '</div></div>' +
            (a.uses_ai ? '<span class="chip green" style="margin-left:auto">IA</span>' : '') + '</div>';
        }).join('') + (accs.length > 200 ? '<div class="item"><div class="dsc">… y ' + (accs.length - 200) + ' más. Usa el buscador.</div></div>' : '') ||
          '<div class="item"><div class="dsc">Sin resultados</div></div>';
      }).catch(function (e) { var box = document.getElementById('ac-list'); if (box) box.innerHTML = '<div class="item"><div class="dsc">' + esc(errDetail(e, 'No se pudo cargar')) + '</div></div>'; });
    }
    accounts('');
    var aq; document.getElementById('ac-q').oninput = function (ev) { clearTimeout(aq); aq = setTimeout(function () { accounts(ev.target.value); }, 300); };
    document.getElementById('ac-copy').onclick = function () {
      var txt = accs.filter(function (a) { return a.username; }).map(function (a) { return '@' + a.username + (a.name ? ' — ' + a.name : ''); }).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Lista copiada'); }, function () { toast('No se pudo copiar'); });
    };
    api('/ai/admin/courts').then(function (d) {
      var box = document.getElementById('ad-courts'); if (!box) return;
      var L = { manual: ['green', 'Manual'], auto: ['amber', 'Automática'] };
      box.innerHTML = (d.courts || []).map(function (c) {
        var l = L[c.calibration] || ['red', 'Sin calibrar'];
        return '<a class="item" href="#/calibrar/' + esc(c.id) + '"><span class="tag">' + (c.sport === 'futbol' ? '⚽' : '🎾') + '</span><div style="min-width:0"><div class="ttl">' + esc(c.court_name) + '</div><div class="dsc">' + esc(c.club_name) + '</div></div>' +
          '<span class="chip ' + l[0] + '" style="margin-left:auto">' + l[1] + (c.calibration === 'auto' && c.score != null ? ' · ' + Math.round(c.score * 100) + '%' : '') + '</span><span class="chev">›</span></a>';
      }).join('') || '<div class="item"><div class="dsc">No hay canchas.</div></div>';
    }).catch(function () {});
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
      box.innerHTML = '<div class="spread"><div><h1 style="margin:0">' + esc(E.title) + '</h1>' +
        (E.is_club_admin ? '<button class="link" id="ev-name" style="font-size:13px;margin-top:4px">✏️ Cambiar nombre</button>' : '') + '<div class="sub" style="margin:2px 0 0">' + esc((E.club_name || '') + ' · ' + fmtTime(E.started_at)) + '</div></div>' + evChip(E.status) + '</div>' +
        (E.status === 'live' ? '<div class="note mt">Se está grabando (termina a las ' + hhmm(E.ends_at) + '). Al terminar, la IA separa cada partido (tarda unos minutos) y aquí te buscas.</div>' +
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
      var ren = box.querySelector('#ev-name');
      if (ren) ren.onclick = function () {
        var t = prompt('Nombre de la americana', E.title || '');
        if (t == null || !t.trim() || t.trim() === E.title) return;
        api('/ai/events/' + E.id, { method: 'PATCH', json: { title: t.trim() } })
          .then(function (e) { E = e; toast('Nombre actualizado'); draw(); })
          .catch(function (e) { toast(errDetail(e, 'No se pudo cambiar')); });
      };
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
          location.hash = '#/analisis/' + sid;
        };
      });
      clearInterval(S.timer);
      if (E.status === 'live' || E.status === 'processing') S.timer = setInterval(load, 20000);
    }
    load();
  }

function claimSheet(m, cost) {
    var md = document.getElementById('modal');
    md.innerHTML = '<div class="bar"><span class="sub" style="margin:0">' + hhmm(m.start) + '–' + hhmm(m.end) + '</span><button class="x" id="mx" aria-label="Cerrar">×</button></div>' +
      '<div style="padding:0 16px calc(var(--sb) + 18px);overflow:auto">' +
      (m.snapshot_url ? '<img src="' + esc(m.snapshot_url) + '" style="width:100%;border-radius:14px;display:block" alt="">' : '') +
      '<h1 class="mt" style="font-size:30px">¿Cuál eres tú?</h1><p class="sub">Busca tu letra sobre cada jugador en la foto.</p>' +
      '<div class="claim mt">' + m.players.map(function (p) {
        var taken = p.claimed && !p.is_me;
        return '<button data-t="' + p.track_id + '"' + (taken ? ' disabled' : '') + '><b>' + p.track_id + '</b><small>' + (taken ? esc(p.name || 'Ocupado') : 'Soy yo') + '</small></button>';
      }).join('') + '</div>' +
      (cost ? '<p class="free">Ver tu partido cuesta ' + cost + ' token' + (cost > 1 ? 's' : '') + '.</p>' : '') +
      '<p class="free">Si alguien eligió tu letra por error, avisa en recepción.</p></div>';
    md.classList.remove('hidden'); md.classList.add('solid');
    md.querySelector('#mx').onclick = closeModal;
    md.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        api('/ai/sessions/' + m.session_id + '/claim', { method: 'POST', json: { track_id: b.getAttribute('data-t') } })
          .then(function () { haptic(); closeModal(); toast('¡Listo! Estos son tus stats'); var to = '#/analisis/' + m.session_id; if (location.hash === to) analisisDetail(m.session_id); else location.hash = to; })
          .catch(function (e) {
            b.disabled = false;
            if (e && e.status === 402) { closeModal(); toast('No tienes tokens suficientes'); location.hash = '#/creditos'; return; }
            toast(errDetail(e, 'No se pudo'));
          });
      };
    });
  }

  // QR escaneado en una cancha que está (o estuvo hoy) en una americana
  function stepEventChoice(c) {
    var box = pt(); if (!box) return;
    var ev = c.event;
    box.innerHTML = '<h1>' + esc(c.court_name) + '</h1><p class="sub">' + esc(c.club_name) + '</p>' +
      '<div class="card mt" style="border-color:var(--green-line)"><div class="spread"><b>🏆 ' + esc(ev.title) + '</b>' + evChip(ev.live ? 'live' : 'ready') + '</div>' +
        '<div class="sub" style="margin:6px 0 0">' + (ev.live ? 'Esta cancha se está grabando con la americana del club. Tu partido ya queda grabado.' : 'Esta cancha estuvo en una americana. Búscate en tu partido.') + '</div></div>' +
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
