/**
 * picale.js — Auth y utilidades compartidas
 * Importar en todas las páginas: <script src="picale.js"></script>
 */

var PICALE = (function() {
  var CLOUD = 'https://api.picalereplay.com';

  // ── AUTH ──
  function getToken() { return localStorage.getItem('picale_token'); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('picale_user') || 'null'); } catch(e) { return null; }
  }
  function isLoggedIn() { return !!getToken() && !!getUser(); }

  function logout() {
    localStorage.removeItem('picale_token');
    localStorage.removeItem('picale_user');
    window.location.href = 'auth.html';
  }

  function requireAuth(callback, redirectPage) {
    if (isLoggedIn()) { callback(); return; }
    var page = redirectPage || window.location.pathname.split('/').pop() || 'clubs.html';
    window.location.href = 'auth.html?redirect=' + page;
  }

  // ── AUTH HEADER BUTTON ──
  function renderAuthBtn(containerId, redirectPage) {
    var container = document.getElementById(containerId || 'auth-btn-container');
    if (!container) return;
    var user = getUser();
    if (user) {
      var initial = (user.name || user.username || 'U')[0].toUpperCase();
      var photoHtml = user.photo_url
        ? '<img src="' + user.photo_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : initial;
      container.innerHTML =
        '<a href="perfil.html" style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:5px 12px 5px 5px;text-decoration:none;color:#F0EDE6;font-size:12px;backdrop-filter:blur(8px);">'
        + '<div style="width:26px;height:26px;border-radius:50%;background:rgba(94,232,122,.15);border:1px solid rgba(94,232,122,.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#5EE87A;overflow:hidden;flex-shrink:0;">' + photoHtml + '</div>'
        + '<span>' + (user.name || user.username || 'Perfil') + '</span>'
        + '</a>';
    } else {
      var page = redirectPage || window.location.pathname.split('/').pop() || 'clubs.html';
      container.innerHTML =
        '<a href="auth.html?redirect=' + page + '" style="display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:6px 14px;text-decoration:none;color:#F0EDE6;font-size:12px;backdrop-filter:blur(8px);">'
        + '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="4" r="2.5"/><path d="M1 11c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>'
        + 'Entrar'
        + '</a>';
    }
  }

  // ── API HELPER ──
  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    var token = getToken();
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (options.json) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.json);
      delete options.json;
    }
    return fetch(CLOUD + path, options).then(function(r) {
      if (r.status === 401) { logout(); return; }
      return r.json();
    });
  }

  // ── TOAST ──
  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);left:50%;transform:translateX(-50%) translateY(20px);background:rgba(30,30,30,.95);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:8px 18px;font-size:13px;color:#F0EDE6;opacity:0;transition:all .3s;z-index:9999;white-space:nowrap;backdrop-filter:blur(12px);font-family:"DM Sans",sans-serif;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(function() {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2500);
  }

  // ── PUBLIC ──
  return {
    CLOUD: CLOUD,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    logout: logout,
    requireAuth: requireAuth,
    renderAuthBtn: renderAuthBtn,
    api: api,
    showToast: showToast,
  };
})();
