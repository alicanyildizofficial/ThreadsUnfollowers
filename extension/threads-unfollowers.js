/*!
 * Threads Unfollowers
 * threads.com (veya threads.net) uzerinde, giris yapmis halde tarayici konsoluna yapistirin.
 *
 * Calisma mantigi:
 *   1) Sayfanin kendi aglarini (fetch + XMLHttpRequest) dinler.
 *   2) "Takipciler" / "Takip edilenler" listesi acildiginda giden istegi sablon olarak kaydeder.
 *   3) Bu sablonu imlec (cursor) degistirerek sayfalayip tum listeyi toplar.
 *   4) Iki listeyi karsilastirip geri takip etmeyenleri cikarir.
 *   5) Sectiklerinizi, insan hizina yakin gecikmelerle takipten cikarir.
 *
 * Sabit doc_id / endpoint yazmadigi icin Threads API'sini degistirdiginde de calismaya devam eder.
 */
(function () {
  'use strict';

  var HOSTS = ['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'];
  if (HOSTS.indexOf(location.hostname) === -1) {
    alert('Bu araç yalnızca threads.com / threads.net üzerinde çalışır.');
    return;
  }
  if (window.__THREADS_UNFOLLOWERS__) {
    window.__THREADS_UNFOLLOWERS__.open();
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Sabitler ve depolama                                               */
  /* ------------------------------------------------------------------ */

  var WHITELIST_KEY = 'tu_whitelist';
  var TEMPLATES_KEY = 'tu_templates';
  var TEMPLATE_MAX_AGE = 30 * 24 * 3600 * 1000; // 30 gun
  var DEFAULT_APP_ID = '238260118697367'; // Threads (Barcelona) web app id
  var PAGE_SIZE = 50; // arayuzdeki sayfa basina satir
  var SCAN_PAGE_LIMIT = 500; // guvenlik siniri

  /*
   * Hiz sinirlari BILEREK sabittir ve arayuzden degistirilemez.
   * Bu degerleri dusurmek hesabin gecici olarak kisitlanmasina (action block)
   * yol acar; "biraz hizlandirayim" diyen kullanici hesabini yakar.
   * Degistirmek isteyen kaynak koda mudahale etmek zorunda kalsin.
   */
  var TIMINGS = {
    usersPerRequest: 25,
    pageDelayMin: 900,
    pageDelayMax: 2200,
    longPauseEvery: 6,
    longPauseMs: 12000,
    unfollowDelay: 4000,
    unfollowBatch: 5,
    unfollowBatchPause: 300000
  };

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  var timings = TIMINGS; // sabit; kullanici degistiremez
  var whitelist = loadJSON(WHITELIST_KEY, []);
  var whitelistIds = new Set(whitelist.map(function (u) { return String(u.id); }));

  /* ------------------------------------------------------------------ */
  /* Yardimcilar                                                        */
  /* ------------------------------------------------------------------ */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* mm:ss */
  function fmtLeft(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(total / 60), sec = total % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /*
   * Zorunlu molayi beklerken paneli donmus gibi birakma: saniyede bir geri sayimi
   * guncelle ve "Durdur"a basildiysa hemen cik. (Beklemeyi kisaltmaz, sadece
   * kullanicinin islemi iptal etmesine izin verir.)
   */
  async function pauseWithCountdown(ms, isStopped, onTick) {
    var end = Date.now() + ms;
    while (true) {
      var left = end - Date.now();
      if (left <= 0) return true;
      if (isStopped()) return false;
      onTick(left);
      await sleep(Math.min(1000, left));
    }
  }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function jitter(base, pct) {
    var d = base * (pct || 0.2);
    return Math.max(250, Math.round(base + (Math.random() * 2 - 1) * d));
  }
  function getCookie(name) {
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    if (parts.length !== 2) return null;
    return parts.pop().split(';').shift();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nowStr() {
    var d = new Date();
    return d.toLocaleTimeString('tr-TR', { hour12: false });
  }

  /* Bir JSON govdesinde kullanici dizisini bul */
  function looksLikeUserArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    var hit = 0;
    for (var i = 0; i < arr.length; i++) {
      var u = arr[i];
      if (u && typeof u === 'object' && typeof u.username === 'string' &&
          (u.pk != null || u.pk_id != null || u.id != null)) hit++;
    }
    return hit === arr.length;
  }
  function findUsers(root) {
    var seen = new Set(), stack = [root], best = null;
    while (stack.length) {
      var node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        if (looksLikeUserArray(node)) {
          if (!best || node.length > best.length) best = node;
          continue;
        }
        for (var i = 0; i < node.length; i++) stack.push(node[i]);
      } else {
        // relay tarzi edges/node yapisi
        if (Array.isArray(node.edges) && node.edges.length && node.edges[0] && node.edges[0].node) {
          var flat = node.edges.map(function (e) { return e.node; });
          if (looksLikeUserArray(flat) && (!best || flat.length > best.length)) best = flat;
        }
        for (var k in node) {
          try { stack.push(node[k]); } catch (e) {}
        }
      }
    }
    return best;
  }
  function findCursor(root) {
    var seen = new Set(), stack = [root];
    while (stack.length) {
      var node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (!Array.isArray(node)) {
        var keys = ['next_max_id', 'next_cursor', 'max_id'];
        for (var i = 0; i < keys.length; i++) {
          var v = node[keys[i]];
          if (typeof v === 'string' && v) return v;
          if (typeof v === 'number') return String(v);
        }
        var pi = node.page_info || node.pageInfo;
        if (pi && (pi.has_next_page || pi.hasNextPage) && (pi.end_cursor || pi.endCursor)) {
          return pi.end_cursor || pi.endCursor;
        }
        if ((node.has_next_page || node.hasNextPage) && (node.end_cursor || node.endCursor)) {
          return node.end_cursor || node.endCursor;
        }
      }
      for (var k in node) {
        try { stack.push(node[k]); } catch (e) {}
      }
    }
    return null;
  }
  /* Profil fotografi API surumune gore farkli alanlarda gelebiliyor. */
  function pickPic(u) {
    var direct = u.profile_pic_url || u.profilePicUrl || u.profile_picture_url ||
                 u.profile_pic_url_hd || u.profilePicUrlHd;
    if (typeof direct === 'string' && direct) return direct;
    var infos = [u.hd_profile_pic_url_info, u.profile_pic_url_info,
                 u.hd_profile_pic_versions, u.profile_pic_versions];
    for (var i = 0; i < infos.length; i++) {
      var v = infos[i];
      if (!v) continue;
      if (typeof v.url === 'string' && v.url) return v.url;
      if (Array.isArray(v) && v.length && v[0] && typeof v[0].url === 'string') return v[0].url;
    }
    return '';
  }

  function normalizeUser(u) {
    var id = u.pk != null ? u.pk : (u.pk_id != null ? u.pk_id : u.id);
    return {
      id: String(id),
      username: u.username || '',
      full_name: u.full_name || u.fullName || '',
      profile_pic_url: pickPic(u),
      is_verified: !!(u.is_verified || u.isVerified),
      is_private: !!(u.is_private || u.isPrivate)
    };
  }

  /* ------------------------------------------------------------------ */
  /* Ag dinleyici (kalibrasyon)                                         */
  /* ------------------------------------------------------------------ */

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var SNIFF = { appId: null, csrf: null, lsd: null, dtsg: null, meId: null };
  var TPL = { following: null, followers: null, unfollow: null };
  var DEBUG = { rawUser: null };
  var captureListeners = [];

  /* ---- Sablon kalicilastirma -------------------------------------- */
  /* Yakalanan istek localStorage'a yazilir; boylece kalibrasyon bir kez yapilir. */

  var TOKEN_KEYS = ['lsd', 'fb_dtsg', 'jazoest'];

  /* Oturum jetonlarini diske yazma: replay aninda zaten tazeleniyorlar. */
  function stripTokens(body) {
    if (typeof body !== 'string' || body.charAt(0) === '{') return body;
    try {
      var p = new URLSearchParams(body);
      var touched = false;
      TOKEN_KEYS.forEach(function (k) { if (p.has(k)) { p.set(k, ''); touched = true; } });
      return touched ? p.toString() : body;
    } catch (e) {
      return body;
    }
  }

  function saveTemplates() {
    var out = {};
    ['following', 'followers', 'unfollow'].forEach(function (k) {
      if (!TPL[k]) return;
      var copy = Object.assign({}, TPL[k]);
      copy.body = stripTokens(copy.body);
      copy.headers = Object.assign({}, copy.headers);
      delete copy.headers['x-fb-lsd'];
      delete copy.headers['x-csrftoken'];
      out[k] = copy;
    });
    saveJSON(TEMPLATES_KEY, out);
  }

  function loadTemplates() {
    var stored = loadJSON(TEMPLATES_KEY, null);
    if (!stored || typeof stored !== 'object') return;
    ['following', 'followers', 'unfollow'].forEach(function (k) {
      var t = stored[k];
      if (!t || !t.url || !t.method) return;
      if (Date.now() - (t.at || 0) > TEMPLATE_MAX_AGE) return;
      t.restored = true;
      TPL[k] = t;
    });
  }

  function dropTemplate(kind) {
    TPL[kind] = null;
    saveTemplates();
  }

  /* jazoest, fb_dtsg'den turetilir; dtsg degisince bu da degismeli. */
  function jazoestOf(dtsg) {
    var sum = 0;
    for (var i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
    return '2' + sum;
  }

  /* Sayfadan LSD / DTSG jetonlarini oku (canli istek yakalanmadiysa). */
  function scrapeTokens() {
    try {
      var html = document.documentElement.innerHTML;
      var lsdPatterns = [
        /"LSD",\[\],\{"token":"([^"]+)"/,
        /"lsd"\s*:\s*"([^"]{8,})"/,
        /name="lsd"\s+value="([^"]+)"/
      ];
      var dtsgPatterns = [
        /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
        /"DTSGInitData",\[\],\{"token":"([^"]+)"/,
        /"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/,
        /name="fb_dtsg"\s+value="([^"]+)"/
      ];
      var i, m;
      if (!SNIFF.lsd) {
        for (i = 0; i < lsdPatterns.length; i++) {
          m = html.match(lsdPatterns[i]);
          if (m) { SNIFF.lsd = m[1]; break; }
        }
      }
      if (!SNIFF.dtsg) {
        for (i = 0; i < dtsgPatterns.length; i++) {
          m = html.match(dtsgPatterns[i]);
          if (m) { SNIFF.dtsg = m[1]; break; }
        }
      }
    } catch (e) {}
  }

  /* Kayitli sablondaki jetonlar eskimis olur; gonderim aninda tazele. */
  function refreshTokens(headers, body) {
    if (!SNIFF.lsd || !SNIFF.dtsg) scrapeTokens();
    if (SNIFF.lsd && 'x-fb-lsd' in headers) headers['x-fb-lsd'] = SNIFF.lsd;
    if (SNIFF.csrf) headers['x-csrftoken'] = SNIFF.csrf;
    if (typeof body !== 'string' || body.charAt(0) === '{') return body;
    try {
      var p = new URLSearchParams(body);
      var changed = false;
      if (SNIFF.lsd && p.has('lsd')) { p.set('lsd', SNIFF.lsd); changed = true; }
      if (SNIFF.dtsg && p.has('fb_dtsg')) {
        p.set('fb_dtsg', SNIFF.dtsg);
        if (p.has('jazoest')) p.set('jazoest', jazoestOf(SNIFF.dtsg));
        changed = true;
      }
      return changed ? p.toString() : body;
    } catch (e) {
      return body;
    }
  }


  function onCapture(fn) { captureListeners.push(fn); }
  function emitCapture(kind) {
    captureListeners.forEach(function (f) { try { f(kind); } catch (e) {} });
  }

  function headersToObject(h, into) {
    into = into || {};
    if (!h) return into;
    try {
      if (typeof Headers !== 'undefined' && h instanceof Headers) {
        h.forEach(function (v, k) { into[k.toLowerCase()] = v; });
      } else if (Array.isArray(h)) {
        h.forEach(function (pair) { into[String(pair[0]).toLowerCase()] = pair[1]; });
      } else if (typeof h === 'object') {
        for (var k in h) into[k.toLowerCase()] = h[k];
      }
    } catch (e) {}
    return into;
  }
  function cleanHeaders(h) {
    var out = {};
    for (var k in h) {
      var lk = k.toLowerCase();
      if (lk === 'content-length' || lk === 'cookie' || lk === 'host' || lk === 'connection') continue;
      if (lk.indexOf('sec-') === 0 && lk !== 'sec-fetch-site') continue;
      out[lk] = h[k];
    }
    return out;
  }

  function sniffSecrets(url, headers, body) {
    if (headers['x-ig-app-id']) SNIFF.appId = headers['x-ig-app-id'];
    if (headers['x-csrftoken']) SNIFF.csrf = headers['x-csrftoken'];
    if (headers['x-fb-lsd']) SNIFF.lsd = headers['x-fb-lsd'];
    if (typeof body === 'string' && body.indexOf('fb_dtsg=') !== -1) {
      try { SNIFF.dtsg = new URLSearchParams(body).get('fb_dtsg') || SNIFF.dtsg; } catch (e) {}
    }
  }

  /* Istegin hangi listeye ait oldugunu tahmin et */
  function classify(url, body) {
    var hay = (String(url) + ' ' + (body || ''));
    var low = hay.toLowerCase();
    if (/\/friendships\/(destroy|\d+\/unfollow)/i.test(hay) || /unfollow/i.test(low)) {
      if (/destroy|unfollow/i.test(low) && !/following/i.test(low)) return 'unfollow';
    }
    if (/\/api\/v1\/friendships\/\d+\/following/i.test(hay)) return 'following';
    if (/\/api\/v1\/friendships\/\d+\/followers/i.test(hay)) return 'followers';
    if (/following/i.test(low) && !/followers/i.test(low)) return 'following';
    if (/followers/i.test(low) && !/following/i.test(low)) return 'followers';
    return null;
  }

  function storeTemplate(kind, req, userCount, cursor) {
    // Canli yakalama, diskten gelen eski sablonu her zaman ezer.
    if (TPL[kind] && !TPL[kind].restored && TPL[kind].users >= userCount) return;
    TPL[kind] = {
      kind: kind,
      method: req.method || 'GET',
      url: req.url,
      headers: cleanHeaders(req.headers || {}),
      body: typeof req.body === 'string' ? req.body : null,
      users: userCount,
      cursor: cursor,
      at: Date.now()
    };
    saveTemplates();
    emitCapture(kind);
  }

  function inspectResponse(req, text) {
    var json;
    try { json = JSON.parse(text); } catch (e) { return; }
    var users = findUsers(json);
    if (!users || users.length === 0) return;
    var kind = classify(req.url, req.body);
    if (kind !== 'following' && kind !== 'followers') return;
    storeTemplate(kind, req, users.length, findCursor(json));
  }

  function maybeCaptureUnfollow(req) {
    var hay = (String(req.url) + ' ' + (req.body || ''));
    if (!/destroy|unfollow/i.test(hay)) return;
    // Liste sorgularini takipten cikarma sanma
    if (/FollowersTab|FollowingTab|\/friendships\/\d+\/(following|followers)/i.test(hay)) return;
    var targetId = null;
    var m = String(req.url).match(/(?:destroy|unfollow)\/(\d{3,})/);
    if (m) targetId = m[1];
    if (!targetId && req.body) {
      // Govde form-encoded olabilir; hem ham hem cozulmus halinde ara.
      var candidates = [req.body];
      if (req.body.indexOf('%') !== -1) {
        try { candidates.push(decodeURIComponent(req.body)); } catch (e) {}
      }
      // Dikkat: "id" tek basina aranmaz, yoksa doc_id gibi alanlar hedef sanilir.
      var RE = /(?:^|[^A-Za-z0-9_])(?:target_user_id|targetUserId|target_id|user_id|userID|userId|pk)["'=:\s]+(\d{5,})/;
      for (var ci = 0; ci < candidates.length && !targetId; ci++) {
        var bm = candidates[ci].match(RE);
        if (bm) targetId = bm[1];
      }
    }
    if (!targetId) return;
    TPL.unfollow = {
      kind: 'unfollow',
      method: req.method || 'POST',
      url: req.url,
      headers: cleanHeaders(req.headers || {}),
      body: typeof req.body === 'string' ? req.body : null,
      targetId: targetId,
      at: Date.now()
    };
    saveTemplates();
    emitCapture('unfollow');
  }

  /* fetch yamasi */
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var req = { url: '', method: 'GET', headers: {}, body: null };
      var bodyPromise = Promise.resolve(null);
      try {
        if (typeof Request !== 'undefined' && input instanceof Request) {
          req.url = input.url;
          req.method = input.method;
          headersToObject(input.headers, req.headers);
          if (input.method !== 'GET' && input.method !== 'HEAD') {
            bodyPromise = input.clone().text().catch(function () { return null; });
          }
        } else {
          req.url = String(input);
        }
        if (init) {
          if (init.method) req.method = init.method;
          headersToObject(init.headers, req.headers);
          if (typeof init.body === 'string') bodyPromise = Promise.resolve(init.body);
        }
      } catch (e) {}

      var p = nativeFetch.apply(window, arguments);
      try {
        p.then(function (res) {
          // Govde baska yerde okunmadan ONCE klonla; yoksa "body already used" hatasi alinir.
          var textPromise = null;
          try {
            var ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct === '' || ct.indexOf('json') !== -1 || ct.indexOf('javascript') !== -1 || ct.indexOf('text/plain') !== -1) {
              textPromise = res.clone().text();
            }
          } catch (e) {}
          bodyPromise.then(function (b) {
            req.body = b;
            try {
              sniffSecrets(req.url, req.headers, req.body);
              maybeCaptureUnfollow(req);
            } catch (e) {}
            if (!textPromise) return;
            textPromise.then(function (t) {
              try { inspectResponse(req, t); } catch (e) {}
            }).catch(function () {});
          });
        }).catch(function () {});
      } catch (e) {}
      return p;
    };
  }

  /* XMLHttpRequest yamasi */
  (function () {
    var XO = XMLHttpRequest.prototype.open;
    var XS = XMLHttpRequest.prototype.send;
    var XH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tu = { method: method, url: String(url), headers: {}, body: null };
      return XO.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      if (this.__tu) this.__tu.headers[String(k).toLowerCase()] = v;
      return XH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var self = this;
      if (self.__tu && typeof body === 'string') self.__tu.body = body;
      if (self.__tu) {
        try {
          sniffSecrets(self.__tu.url, self.__tu.headers, self.__tu.body);
          maybeCaptureUnfollow(self.__tu);
        } catch (e) {}
        self.addEventListener('load', function () {
          try {
            if (typeof self.responseText === 'string' && self.responseText.charAt(0) === '{') {
              inspectResponse(self.__tu, self.responseText);
            }
          } catch (e) {}
        });
      }
      return XS.apply(this, arguments);
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Kimlik tespiti                                                     */
  /* ------------------------------------------------------------------ */

  function detectMeId() {
    if (SNIFF.meId) return SNIFF.meId;
    var c = getCookie('ds_user_id');
    if (c) { SNIFF.meId = c; return c; }
    try {
      var html = document.documentElement.innerHTML;
      var m = html.match(/"user_id"\s*:\s*"?(\d{5,})"?/) ||
              html.match(/"logged_in_user_id"\s*:\s*"?(\d{5,})"?/) ||
              html.match(/"viewer_id"\s*:\s*"?(\d{5,})"?/);
      if (m) { SNIFF.meId = m[1]; return m[1]; }
    } catch (e) {}
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Istek yeniden oynatma                                              */
  /* ------------------------------------------------------------------ */

  var CURSOR_KEYS = ['after', 'max_id', 'cursor', 'max_id_v2', 'end_cursor'];
  var COUNT_KEYS = ['first', 'count', 'page_size'];

  function applyCursorToVariables(vars, cursor) {
    var key = null;
    for (var i = 0; i < CURSOR_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(vars, CURSOR_KEYS[i])) { key = CURSOR_KEYS[i]; break; }
    }
    if (!key) key = 'after';
    vars[key] = cursor;
    return vars;
  }
  function applyCountToVariables(vars) {
    for (var i = 0; i < COUNT_KEYS.length; i++) {
      var k = COUNT_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(vars, k) && typeof vars[k] === 'number') {
        vars[k] = Math.max(1, Math.min(100, timings.usersPerRequest));
        return vars;
      }
    }
    return vars;
  }

  function buildRequest(tpl, cursor) {
    var url = tpl.url;
    var body = tpl.body;

    if (body && body.indexOf('variables=') !== -1) {
      // GraphQL: form-encoded govde icindeki variables JSON'u
      try {
        var params = new URLSearchParams(body);
        var vars = JSON.parse(params.get('variables') || '{}');
        applyCountToVariables(vars);
        if (cursor) applyCursorToVariables(vars, cursor);
        params.set('variables', JSON.stringify(vars));
        body = params.toString();
      } catch (e) {}
    } else if (body && body.charAt(0) === '{') {
      // JSON govde
      try {
        var obj = JSON.parse(body);
        if (obj.variables) {
          applyCountToVariables(obj.variables);
          if (cursor) applyCursorToVariables(obj.variables, cursor);
        } else {
          applyCountToVariables(obj);
          if (cursor) applyCursorToVariables(obj, cursor);
        }
        body = JSON.stringify(obj);
      } catch (e) {}
    } else {
      // REST: sorgu parametreleri
      try {
        var u = new URL(url, location.origin);
        if (u.searchParams.has('count')) {
          u.searchParams.set('count', String(Math.max(1, Math.min(100, timings.usersPerRequest))));
        }
        if (cursor) u.searchParams.set('max_id', cursor);
        url = u.toString();
      } catch (e) {}
    }

    var headers = Object.assign({}, tpl.headers);
    if (!headers['x-ig-app-id']) headers['x-ig-app-id'] = SNIFF.appId || DEFAULT_APP_ID;
    if (SNIFF.csrf && !headers['x-csrftoken']) headers['x-csrftoken'] = SNIFF.csrf;
    body = refreshTokens(headers, body);

    return { url: url, method: tpl.method, headers: headers, body: body };
  }

  function rawFetch(url, opts) {
    return (nativeFetch || window.fetch)(url, opts);
  }

  async function fetchListPage(tpl, cursor) {
    var r = buildRequest(tpl, cursor);
    var opts = { method: r.method, headers: r.headers, credentials: 'include', mode: 'cors' };
    if (r.method !== 'GET' && r.method !== 'HEAD' && r.body != null) opts.body = r.body;
    var res = await rawFetch(r.url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json && json.errors && json.errors.length) {
      throw new Error('GraphQL: ' + (json.errors[0].message || 'bilinmeyen hata'));
    }
    var users = findUsers(json) || [];
    if (users.length && !DEBUG.rawUser) DEBUG.rawUser = users[0]; // teshis icin ham ornek
    return { users: users.map(normalizeUser), cursor: findCursor(json) };
  }

  /* Otomatik deneme: sablon olmadan REST uclarini dene */
  async function probeRest(kind) {
    var me = detectMeId();
    if (!me) return null;
    var candidates = [
      location.origin + '/api/v1/friendships/' + me + '/' + kind + '/?count=25',
      'https://www.threads.com/api/v1/friendships/' + me + '/' + kind + '/?count=25',
      'https://www.threads.net/api/v1/friendships/' + me + '/' + kind + '/?count=25'
    ];
    var headers = {
      'x-ig-app-id': SNIFF.appId || DEFAULT_APP_ID,
      'x-requested-with': 'XMLHttpRequest'
    };
    if (SNIFF.csrf || getCookie('csrftoken')) headers['x-csrftoken'] = SNIFF.csrf || getCookie('csrftoken');
    for (var i = 0; i < candidates.length; i++) {
      try {
        var res = await rawFetch(candidates[i], { headers: headers, credentials: 'include' });
        if (!res.ok) continue;
        var json = await res.json();
        var users = findUsers(json);
        if (users && users.length) {
          storeTemplate(kind, { method: 'GET', url: candidates[i], headers: headers, body: null },
                        users.length, findCursor(json));
          return TPL[kind];
        }
      } catch (e) {}
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Takipten cikarma                                                   */
  /* ------------------------------------------------------------------ */

  async function unfollowUser(user) {
    var csrf = SNIFF.csrf || getCookie('csrftoken');
    // 1) Dogrudan REST
    if (csrf) {
      try {
        var res = await rawFetch(location.origin + '/api/v1/friendships/destroy/' + user.id + '/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-csrftoken': csrf,
            'x-ig-app-id': SNIFF.appId || DEFAULT_APP_ID,
            'x-requested-with': 'XMLHttpRequest'
          },
          body: 'user_id=' + encodeURIComponent(user.id) + '&container_module=profile'
        });
        if (res.ok) {
          var j = await res.json().catch(function () { return {}; });
          if (!j.status || j.status === 'ok') return { ok: true, via: 'rest' };
        }
      } catch (e) {}
    }
    // 2) Yakalanmis sablonu tekrar oynat
    if (TPL.unfollow) {
      try {
        var t = TPL.unfollow;
        var url = t.url.split(t.targetId).join(user.id);
        var body = t.body ? t.body.split(t.targetId).join(user.id) : null;
        var opts = {
          method: t.method,
          credentials: 'include',
          headers: Object.assign({}, t.headers)
        };
        if (body != null && t.method !== 'GET') opts.body = body;
        var r2 = await rawFetch(url, opts);
        if (r2.ok) {
          var t2 = await r2.text();
          if (t2.indexOf('"status":"fail"') === -1) return { ok: true, via: 'sablon' };
        }
        return { ok: false, error: 'HTTP ' + r2.status };
      } catch (e2) {
        return { ok: false, error: String(e2.message || e2) };
      }
    }
    return { ok: false, error: 'Takipten çıkarma yöntemi bulunamadı (bir hesabı elle takipten çıkıp kalibre et)' };
  }

  /* ------------------------------------------------------------------ */
  /* Uygulama durumu                                                    */
  /* ------------------------------------------------------------------ */

  var state = {
    view: 'setup',            // setup | scanning | review | unfollowing
    scan: { phase: '', loaded: 0, pages: 0, stop: false, note: '' },
    following: [],
    followers: [],
    followerIds: new Set(),
    tab: 'non',               // non | mutual | fans | white
    search: '',
    filters: { verified: true, private: true, noPic: true },
    page: 1,
    selected: new Set(),
    log: [],
    unfollow: { done: 0, total: 0, ok: 0, fail: 0, stop: false, note: '' },
    minimized: false,
    settingsOpen: false
  };

  /* ------------------------------------------------------------------ */
  /* Arayuz                                                             */
  /* ------------------------------------------------------------------ */

  /*
   * Arayuz tembel kurulur. Eklenti, scripti sayfa acilir acilmaz "sessiz" modda
   * yukluyor: boylece ag dinleyicisi arka planda calisip listeleri kendiliginden
   * yakaliyor, panel ancak kullanici butona basinca beliriyor.
   */
  var hostEl = null, shadow = null, panelEl = null, bodyEl = null, mounted = false;

  function mountUI() {
    if (mounted) return;
    mounted = true;

    hostEl = document.createElement('div');
    hostEl.id = 'threads-unfollowers-root';
    hostEl.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    shadow = hostEl.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' + CSS() + '</style>' +
      '<div class="panel" part="panel">' +
        '<header>' +
          '<div class="brand"><span class="dot"></span><b>Threads Unfollowers</b></div>' +
          '<div class="hbtns">' +
            '<button data-act="settings" title="Ayarlar">&#9881;</button>' +
            '<button data-act="min" title="Kucult">&#8211;</button>' +
            '<button data-act="close" title="Kapat">&times;</button>' +
          '</div>' +
        '</header>' +
        '<div class="body" id="body"></div>' +
      '</div>';
    document.body.appendChild(hostEl);
    panelEl = shadow.querySelector('.panel');
    bodyEl = shadow.getElementById('body');

    shadow.addEventListener('click', onShadowClick);
    shadow.addEventListener('change', onShadowChange);
    setupDragging();
  }

  function CSS() {
    return [
      ':host{all:initial}',
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
      '.panel{pointer-events:auto;position:fixed;top:16px;right:16px;width:430px;max-width:calc(100vw - 32px);',
      'max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#0a0a0a;color:#f5f5f5;',
      'border:1px solid #2a2a2a;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden;font-size:13px}',
      '.panel.min{height:auto}',
      '.panel.min .body{display:none}',
      'header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;',
      'background:#121212;border-bottom:1px solid #242424;cursor:move;user-select:none}',
      '.brand{display:flex;align-items:center;gap:8px;font-size:13px;letter-spacing:.2px}',
      '.dot{width:9px;height:9px;border-radius:50%;background:#3b82f6;box-shadow:0 0 10px #3b82f6}',
      '.hbtns{display:flex;gap:4px}',
      '.hbtns button{width:26px;height:26px;border:1px solid #2a2a2a;background:#1a1a1a;color:#ddd;',
      'border-radius:7px;cursor:pointer;font-size:14px;line-height:1}',
      '.hbtns button:hover{background:#252525}',
      '.body{padding:12px;overflow:auto;flex:1}',
      '.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:#2e2e2e;border-radius:4px}',
      'h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#8a8a8a;font-weight:700}',
      'p{margin:0 0 8px;line-height:1.55;color:#c9c9c9}',
      '.card{background:#141414;border:1px solid #242424;border-radius:10px;padding:11px;margin-bottom:10px}',
      '.steps{margin:0;padding-left:18px;color:#c9c9c9;line-height:1.7}',
      '.steps li{margin-bottom:2px}',
      '.status{display:flex;flex-direction:column;gap:6px;margin:10px 0}',
      '.st{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:#161616;border:1px solid #242424}',
      '.st .mark{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'font-size:11px;font-weight:700;background:#2a2a2a;color:#888;flex:0 0 auto}',
      '.st.ok{border-color:#1f5132;background:#0f1f16}.st.ok .mark{background:#22c55e;color:#04150b}',
      '.st .meta{margin-left:auto;color:#7a7a7a;font-size:11px}',
      'button.btn{width:100%;padding:11px;border-radius:10px;border:1px solid #2a2a2a;background:#1d1d1d;color:#f5f5f5;',
      'font-size:13px;font-weight:600;cursor:pointer;margin-top:6px}',
      'button.btn:hover:not(:disabled){background:#272727}',
      'button.btn:disabled{opacity:.42;cursor:not-allowed}',
      'button.btn.primary{background:#ffffff;color:#0a0a0a;border-color:#fff}',
      'button.btn.primary:hover:not(:disabled){background:#e6e6e6}',
      'button.btn.danger{background:#dc2626;border-color:#dc2626;color:#fff}',
      'button.btn.danger:hover:not(:disabled){background:#b91c1c}',
      '.row2{display:flex;gap:8px}.row2 .btn{margin-top:6px}',
      '.bar{height:5px;border-radius:3px;background:#222;overflow:hidden;margin:10px 0}',
      '.bar i{display:block;height:100%;background:linear-gradient(90deg,#3b82f6,#22d3ee);transition:width .3s}',
      '.tabs{display:flex;gap:4px;margin-bottom:9px;flex-wrap:wrap}',
      '.tabs button{flex:1;min-width:84px;padding:7px 6px;border-radius:8px;border:1px solid #242424;background:#151515;',
      'color:#8d8d8d;font-size:11px;font-weight:600;cursor:pointer}',
      '.tabs button.on{background:#fff;color:#0a0a0a;border-color:#fff}',
      'input[type=text]{width:100%;padding:9px 10px;border-radius:8px;border:1px solid #2a2a2a;background:#131313;',
      'color:#f5f5f5;font-size:12px;outline:none;margin-bottom:8px}',
      'input[type=text]:focus{border-color:#3b82f6}',
      'input[type=number]{width:96px;padding:6px 8px;border-radius:7px;border:1px solid #2a2a2a;background:#131313;color:#f5f5f5;font-size:12px}',
      '.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:9px;font-size:11px;color:#a5a5a5}',
      '.filters label{display:flex;align-items:center;gap:5px;cursor:pointer}',
      '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}',
      '.stats div{background:#141414;border:1px solid #242424;border-radius:8px;padding:7px;text-align:center}',
      '.stats span{display:block;font-size:10px;color:#7a7a7a;text-transform:uppercase;letter-spacing:.4px}',
      '.stats b{font-size:15px}',
      '.list{display:flex;flex-direction:column;gap:5px}',
      '.item{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:#131313;',
      'border:1px solid #222;cursor:pointer}',
      '.item:hover{background:#181818;border-color:#303030}',
      '.item.sel{border-color:#3b82f6;background:#101827}',
      '.avatar{position:relative;width:38px;height:38px;flex:0 0 auto;border-radius:50%;background:#262626;',
      'display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '.avatar::after{content:attr(data-initial);font-size:15px;font-weight:700;color:#7d7d7d}',
      '.avatar img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:50%}',
      '.avatar.broken img{display:none}',
      '.item .info{min-width:0;flex:1}',
      '.item .u{display:block;font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.item .n{display:block;color:#7f7f7f;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tag{display:inline-flex;align-items:center;justify-content:center;margin-left:5px;',
      'font-size:9px;line-height:1;padding:2px 4px;border-radius:20px;border:1px solid #333;color:#9a9a9a}',
      '.tag.v{border-color:#1d4ed8;color:#60a5fa;background:rgba(29,78,216,.15)}',
      '.tag.p{border:none;font-size:10px;padding:0 0 0 2px}',
      '.star{background:none;border:none;font-size:16px;cursor:pointer;color:#4a4a4a;',
      'padding:2px 4px;line-height:1;transition:color .12s ease}',
      '.star:hover{color:#facc15}',
      '.star.on{color:#facc15}',
      '.toolbar{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}',
      '.tb-label{font-size:10.5px;color:#6f6f6f;text-transform:uppercase;letter-spacing:.5px;margin-right:2px}',
      '.chip{flex:1;min-width:64px;padding:7px 8px;border-radius:8px;border:1px solid #2a2a2a;',
      'background:#171717;color:#d8d8d8;font-size:11.5px;font-weight:600;cursor:pointer}',
      '.chip:hover:not(:disabled){background:#222;border-color:#3a3a3a}',
      '.chip:disabled{opacity:.4;cursor:not-allowed}',
      '.chip.danger-text{color:#f87171}',
      '.chip.danger-text:hover:not(:disabled){background:#2a1010;border-color:#7f1d1d}',
      'button.btn.subtle{background:transparent;border-color:#242424;color:#8d8d8d;font-weight:500}',
      'button.btn.subtle:hover:not(:disabled){background:#161616;color:#ccc}',
      '.muted.center{text-align:center}',
      '.count-line{text-align:center;color:#7a7a7a;font-size:11.5px;margin:6px 0 8px}',
      '.empty{text-align:center;color:#7a7a7a;font-size:12.5px;line-height:1.6;padding:26px 14px;margin:0}',
      '.empty .star{font-size:13px}',
      '.tabs button b{display:block;font-size:13px;font-weight:700;margin-top:2px;color:inherit}',
      '.tabs button.on b{color:#0a0a0a}',
      '.stats div b{white-space:nowrap}',
      '.pager{display:flex;align-items:center;justify-content:center;gap:12px;margin:10px 0;color:#9a9a9a}',
      '.pager button{background:#1a1a1a;border:1px solid #2a2a2a;color:#ddd;border-radius:7px;width:30px;height:28px;cursor:pointer}',
      '.foot{position:sticky;bottom:-12px;background:#0a0a0a;padding-top:8px;margin-top:6px;border-top:1px solid #1e1e1e}',
      '.warn{background:#2a1a05;border:1px solid #7c4a03;color:#fbbf24;border-radius:9px;padding:9px;font-size:11.5px;line-height:1.5;margin-bottom:10px}',
      '.err{background:#2a0b0b;border:1px solid #7f1d1d;color:#fca5a5;border-radius:9px;padding:9px;font-size:11.5px;margin-bottom:10px}',
      '.log{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;max-height:260px;overflow:auto;',
      'background:#0e0e0e;border:1px solid #222;border-radius:9px;padding:9px}',
      '.log .ok{color:#86efac}.log .no{color:#fca5a5}.log .i{color:#93c5fd}',
      '.setrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #1d1d1d}',
      '.setrow:last-child{border-bottom:none}',
      '.setrow label{color:#c2c2c2;font-size:12px;flex:1}',
      '.setrow b{color:#62d6d0;font-size:12px;white-space:nowrap}',
      '.limits{margin-top:4px}',
      '.muted{color:#6f6f6f;font-size:11px}',
      '.link{color:#60a5fa;cursor:pointer;text-decoration:underline}'
    ].join('');
  }

  /* --- surukleme --- */
  function setupDragging() {
    var head = shadow.querySelector('header');
    var drag = null;
    head.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      var r = panelEl.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, top: r.top, left: r.left };
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var top = Math.max(0, Math.min(window.innerHeight - 60, drag.top + e.clientY - drag.y));
      var left = Math.max(0, Math.min(window.innerWidth - 120, drag.left + e.clientX - drag.x));
      panelEl.style.top = top + 'px';
      panelEl.style.left = left + 'px';
      panelEl.style.right = 'auto';
    });
    window.addEventListener('mouseup', function () { drag = null; });
  }

  /* --- gorunum yonlendirici --- */
  /* Tarama veya takipten cikarma suruyor mu? */
  function isBusy() {
    if (state.view === 'scanning') return !state.scan.stop;
    if (state.view === 'unfollowing') return state.unfollow.done < state.unfollow.total && !state.unfollow.stop;
    return false;
  }

  function render() {
    if (!mounted) return;
    panelEl.classList.toggle('min', state.minimized);
    if (state.minimized) return;
    if (state.settingsOpen) return renderSettings();
    if (state.view === 'setup') return renderSetup();
    if (state.view === 'scanning') return renderScanning();
    if (state.view === 'review') return renderReview();
    if (state.view === 'unfollowing') return renderUnfollowing();
  }

  function renderSetup() {
    var f = TPL.following, fr = TPL.followers;
    var ready = f && fr;

    bodyEl.innerHTML =
      (ready
        ? '<div class="card">' +
            '<h4>Hazır</h4>' +
            '<p>Bağlantı kayıtlı, kalibrasyona gerek yok. Doğrudan taramaya başlayabilirsin.</p>' +
          '</div>'
        : '<div class="card">' +
            '<h4>Bağlantıyı yakala</h4>' +
            '<p>Bunu <b>sadece bir kez</b> yapacaksın; sonraki taramalarda hatırlanır.</p>' +
            '<ol class="steps">' +
              '<li>Kendi profiline git.</li>' +
              '<li><b>Takipçiler</b>&rsquo;e tıkla, listeyi birkaç saniye kaydır, kapat.</li>' +
              '<li><b>Takip edilenler</b>&rsquo;e tıkla, listeyi birkaç saniye kaydır, kapat.</li>' +
            '</ol>' +
          '</div>') +
      '<div class="status">' +
        stRow('Takip edilenler', f) +
        stRow('Takipçiler', fr) +
      '</div>' +
      (ready ? '' : '<button class="btn" data-act="probe">Önce otomatik dene</button>') +
      '<button class="btn primary" data-act="scan"' + (ready ? '' : ' disabled') + '>Taramayı başlat</button>' +
      (ready ? '<button class="btn subtle" data-act="recalib">Kayıtlı bağlantıyı sıfırla</button>' : '') +
      '<p class="muted center">Paneli sürükleyebilir, &#8211; ile küçültüp Threads&rsquo;te gezinebilirsin.</p>';
  }
  function stRow(label, tpl) {
    var ok = !!tpl;
    var meta = !ok ? 'bekleniyor' : (tpl.restored ? 'kayıtlı' : tpl.users + ' hesap yakalandı');
    return '<div class="st ' + (ok ? 'ok' : '') + '">' +
      '<span class="mark">' + (ok ? '&#10003;' : '&#183;') + '</span>' +
      '<span>' + label + '</span>' +
      '<span class="meta">' + meta + '</span>' +
    '</div>';
  }

  function renderScanning() {
    var s = state.scan;
    var pct = Math.round(100 * (1 - 1 / (1 + s.loaded / 250)));
    bodyEl.innerHTML =
      '<div class="card">' +
        '<h4>Taranıyor</h4>' +
        '<p>' + esc(s.phase) + '</p>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="stats">' +
          statBox('Yüklenen', s.loaded) +
          statBox('İstek', s.pages) +
          statBox('Takip ettiğin', state.following.length) +
        '</div>' +
        (s.note ? '<p class="muted">' + esc(s.note) + '</p>' : '') +
      '</div>' +
      '<button class="btn danger" data-act="stopscan">Taramayı durdur</button>' +
      '<p class="muted center">Sekmeyi açık tut. Gecikmeler, Threads&rsquo;in geçici engel ' +
        'riskini azaltmak için bilerek konuldu.</p>';
  }
  function statBox(label, value) {
    return '<div><span>' + label + '</span><b>' + value + '</b></div>';
  }

  /* Sekme sayilarini tek seferde hesapla (her sekme icin ayri filtre pahali olmasin). */
  function tabCounts() {
    var followed = new Set(state.following.map(function (u) { return u.id; }));
    var c = { non: 0, mutual: 0, fans: 0, white: 0 };
    for (var i = 0; i < state.following.length; i++) {
      var u = state.following[i];
      if (whitelistIds.has(u.id)) { c.white++; continue; }
      if (state.followerIds.has(u.id)) c.mutual++; else c.non++;
    }
    for (var j = 0; j < state.followers.length; j++) {
      if (!followed.has(state.followers[j].id)) c.fans++;
    }
    return c;
  }

  function visibleUsers() {
    var list;
    if (state.tab === 'non') {
      list = state.following.filter(function (u) {
        return !state.followerIds.has(u.id) && !whitelistIds.has(u.id);
      });
    } else if (state.tab === 'mutual') {
      list = state.following.filter(function (u) {
        return state.followerIds.has(u.id) && !whitelistIds.has(u.id);
      });
    } else if (state.tab === 'fans') {
      var fol = new Set(state.following.map(function (u) { return u.id; }));
      list = state.followers.filter(function (u) { return !fol.has(u.id); });
    } else {
      list = state.following.filter(function (u) { return whitelistIds.has(u.id); });
    }
    var q = state.search.trim().toLowerCase();
    return list.filter(function (u) {
      if (!state.filters.verified && u.is_verified) return false;
      if (!state.filters.private && u.is_private) return false;
      if (!state.filters.noPic && !u.profile_pic_url) return false;
      if (!q) return true;
      return u.username.toLowerCase().indexOf(q) !== -1 ||
             (u.full_name || '').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return a.username.localeCompare(b.username, 'tr'); });
  }

  function renderReview() {
    var users = visibleUsers();
    var counts = tabCounts();
    var maxPage = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    if (state.page > maxPage) state.page = maxPage;
    var slice = users.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var canUnfollow = state.tab !== 'fans';
    var selected = state.selected.size;

    bodyEl.innerHTML =
      '<div class="stats">' +
        statBox('Takip ettiğin', state.following.length) +
        statBox('Takipçin', state.followers.length) +
        statBox('Geri takipsiz', counts.non) +
      '</div>' +
      '<div class="tabs">' +
        tabBtn('non', 'Geri takipsiz', counts.non) +
        tabBtn('mutual', 'Karşılıklı', counts.mutual) +
        tabBtn('fans', 'Seni takip eden', counts.fans) +
        tabBtn('white', 'Beyaz liste', counts.white) +
      '</div>' +
      '<input type="text" id="q" placeholder="Kullanıcı adı veya isim ara" value="' + esc(state.search) + '">' +
      '<div class="filters">' +
        '<label><input type="checkbox" data-f="verified"' + (state.filters.verified ? ' checked' : '') + '> Doğrulanmış</label>' +
        '<label><input type="checkbox" data-f="private"' + (state.filters.private ? ' checked' : '') + '> Gizli</label>' +
        '<label><input type="checkbox" data-f="noPic"' + (state.filters.noPic ? ' checked' : '') + '> Fotoğrafsız</label>' +
      '</div>' +
      (canUnfollow
        ? '<div class="toolbar">' +
            '<span class="tb-label">Seç</span>' +
            '<button class="chip" data-act="selpage">Sayfa</button>' +
            '<button class="chip" data-act="selall">Tümü (' + users.length + ')</button>' +
            '<button class="chip" data-act="selnone"' + (selected ? '' : ' disabled') + '>Temizle</button>' +
          '</div>'
        : '') +
      '<div class="toolbar">' +
        '<span class="tb-label">Dışa aktar</span>' +
        '<button class="chip" data-act="copy">Kopyala</button>' +
        '<button class="chip" data-act="csv">CSV</button>' +
        '<button class="chip" data-act="json">JSON</button>' +
      '</div>' +
      (users.length > PAGE_SIZE
        ? '<div class="pager">' +
            '<button data-act="prev"' + (state.page <= 1 ? ' disabled' : '') + '>&#10094;</button>' +
            '<span>' + state.page + ' / ' + maxPage + ' &middot; ' + users.length + ' kişi</span>' +
            '<button data-act="next"' + (state.page >= maxPage ? ' disabled' : '') + '>&#10095;</button>' +
          '</div>'
        : '<p class="count-line">' + users.length + ' kişi</p>') +
      '<div class="list">' + (slice.length ? slice.map(itemHTML).join('') : emptyState()) + '</div>' +
      '<div class="foot">' +
        (canUnfollow
          ? '<button class="btn ' + (selected ? 'danger' : '') + '" data-act="dounfollow"' +
            (selected ? '' : ' disabled') + '>' +
            (selected ? 'Seçilen ' + selected + ' hesabı takipten çıkar' : 'Takipten çıkarmak için hesap seç') +
            '</button>'
          : '<p class="muted center">Bu sekmedeki hesapları zaten takip etmiyorsun.</p>') +
        '<button class="btn subtle" data-act="rescan">Yeniden tara</button>' +
      '</div>';

    var q = bodyEl.querySelector('#q');
    if (q) {
      q.addEventListener('input', function () {
        state.search = q.value;
        state.page = 1;
        var pos = q.selectionStart;
        render();
        var q2 = bodyEl.querySelector('#q');
        if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }
    wireAvatars();
  }

  function emptyState() {
    var msg;
    if (state.search) msg = '&ldquo;' + esc(state.search) + '&rdquo; ile eşleşen hesap yok.';
    else if (state.tab === 'white') msg = 'Beyaz listen boş. Bir hesabı korumak için yanındaki ' +
      '<span class="star on">&#9733;</span> işaretine dokun.';
    else if (state.tab === 'non') msg = 'Takip ettiğin herkes seni geri takip ediyor.';
    else msg = 'Bu filtrelerde hesap yok.';
    return '<p class="empty">' + msg + '</p>';
  }

  /* Yuklenemeyen fotograflarda bas harf avatarina dus (inline onerror CSP'ye takilir). */
  function wireAvatars() {
    var imgs = bodyEl.querySelectorAll('.avatar img');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        if (img.__wired) return;
        img.__wired = true;
        var markBroken = function () {
          if (img.parentNode) img.parentNode.classList.add('broken');
        };
        if (img.complete && img.naturalWidth === 0) markBroken();
        img.addEventListener('error', markBroken);
      })(imgs[i]);
    }
  }
  function tabBtn(id, label, count) {
    return '<button data-tab="' + id + '" class="' + (state.tab === id ? 'on' : '') + '">' +
      label + '<b>' + count + '</b></button>';
  }
  function itemHTML(u) {
    var sel = state.selected.has(u.id);
    var star = whitelistIds.has(u.id);
    var initial = (u.username || '?').charAt(0).toUpperCase();
    return '<div class="item' + (sel ? ' sel' : '') + '" data-id="' + esc(u.id) + '">' +
      '<span class="avatar' + (u.profile_pic_url ? '' : ' broken') + '" data-initial="' + esc(initial) + '">' +
        (u.profile_pic_url ? '<img src="' + esc(u.profile_pic_url) + '" alt="" loading="lazy">' : '') +
      '</span>' +
      '<span class="info">' +
        '<span class="u">@' + esc(u.username) +
          (u.is_verified ? '<span class="tag v" title="Doğrulanmış">&#10003;</span>' : '') +
          (u.is_private ? '<span class="tag p" title="Gizli hesap">&#128274;</span>' : '') +
        '</span>' +
        '<span class="n">' + esc(u.full_name || ' ') + '</span>' +
      '</span>' +
      '<button class="star' + (star ? ' on' : '') + '" data-star="' + esc(u.id) + '" ' +
        'title="' + (star ? 'Beyaz listeden çıkar' : 'Beyaz listeye al') + '">&#9733;</button>' +
      '<input type="checkbox" data-pick="' + esc(u.id) + '"' + (sel ? ' checked' : '') + '>' +
    '</div>';
  }

  function renderUnfollowing() {
    var u = state.unfollow;
    var pct = u.total ? Math.round(u.done / u.total * 100) : 0;
    var bitti = u.done >= u.total;
    var basarili = u.ok;
    var basarisiz = u.fail;

    bodyEl.innerHTML =
      '<div class="card">' +
        '<h4>' + (bitti ? 'Tamamlandı' : 'Takipten çıkarılıyor') + '</h4>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="stats">' +
          statBox('İşlenen', u.done + ' / ' + u.total) +
          statBox('Başarılı', basarili) +
          statBox('Başarısız', basarisiz) +
        '</div>' +
        (u.note ? '<p class="muted">' + esc(u.note) + '</p>' : '') +
      '</div>' +
      '<div class="log">' + state.log.slice(-200).map(function (l) {
        return '<div class="' + l.t + '">[' + l.time + '] ' + esc(l.msg) + '</div>';
      }).join('') + '</div>' +
      (bitti
        ? '<button class="btn primary" data-act="backtolist">Listeye dön</button>'
        : '<button class="btn danger" data-act="stopunfollow">Durdur</button>');
    var log = bodyEl.querySelector('.log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function renderSettings() {
    bodyEl.innerHTML =
      '<div class="card">' +
        '<h4>Hız sınırları</h4>' +
        '<p>Bu değerler hesabını korumak için sabittir ve değiştirilemez. Daha hızlı ' +
          'çalışmak, Threads&rsquo;in geçici engel koymasının en yaygın sebebi.</p>' +
        '<div class="limits">' +
          limitRow('Liste istekleri arası', (Math.round(timings.pageDelayMin / 100) / 10) + '&ndash;' +
                   (Math.round(timings.pageDelayMax / 100) / 10) + ' sn') +
          limitRow('Takipten çıkarmalar arası', '~' + Math.round(timings.unfollowDelay / 1000) + ' sn') +
          limitRow(timings.unfollowBatch + ' çıkarmada bir mola',
                   Math.round(timings.unfollowBatchPause / 60000) + ' dakika') +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h4>Beyaz liste</h4>' +
        '<p><b>' + whitelist.length + '</b> hesap korunuyor. Bu hesaplar listelerde çıkmaz ve ' +
          'yanlışlıkla takipten çıkarılmaz.</p>' +
        '<div class="toolbar">' +
          '<button class="chip" data-act="wl-export">Dışa aktar</button>' +
          '<button class="chip" data-act="wl-import">İçe aktar</button>' +
          '<button class="chip danger-text" data-act="wl-clear">Temizle</button>' +
        '</div>' +
      '</div>' +
      '<button class="btn primary" data-act="closesettings">Kapat</button>';
  }
  function limitRow(label, value) {
    return '<div class="setrow"><label>' + label + '</label><b>' + value + '</b></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Olaylar                                                            */
  /* ------------------------------------------------------------------ */

  function onShadowClick(e) {
    var t = e.target;

    var starId = t.getAttribute && t.getAttribute('data-star');
    if (starId) {
      e.stopPropagation();
      toggleWhitelist(starId);
      render();
      return;
    }

    var pickId = t.getAttribute && t.getAttribute('data-pick');
    if (pickId) {
      e.stopPropagation();
      if (t.checked) state.selected.add(pickId); else state.selected.delete(pickId);
      render();
      return;
    }

    var item = t.closest && t.closest('.item');
    if (item) {
      var id = item.getAttribute('data-id');
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      render();
      return;
    }

    var tab = t.getAttribute && t.getAttribute('data-tab');
    if (tab) { state.tab = tab; state.page = 1; render(); return; }

    var act = t.getAttribute && t.getAttribute('data-act');
    if (!act) return;
    handleAction(act);
  }

  function onShadowChange(e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (f) { state.filters[f] = e.target.checked; state.page = 1; render(); return; }
  }

  function handleAction(act) {
    switch (act) {
      case 'close': {
        var soru = isBusy()
          ? 'İşlem sürüyor. Panel kapatılırsa işlem durur. Kapatılsın mı?'
          : 'Panel kapatılsın mı? Taranan liste kaybolur.';
        if (!confirm(soru)) return;
        // Arka planda calismaya devam etmesin.
        state.scan.stop = true;
        state.unfollow.stop = true;
        hostEl.remove();
        return;
      }
      case 'min':
        state.minimized = !state.minimized; render(); return;
      case 'settings':
        state.settingsOpen = true; render(); return;
      case 'closesettings':
        state.settingsOpen = false; render(); return;
      case 'probe':
        runProbe(); return;
      case 'recalib':
        if (confirm('Kayıtlı bağlantı silinsin mi? Listeleri bir kez daha açman gerekecek.')) {
          dropTemplate('following'); dropTemplate('followers');
          render();
        }
        return;
      case 'scan':
        startScan(); return;
      case 'stopscan':
        state.scan.stop = true; state.scan.note = 'Durduruluyor\u2026'; render(); return;
      case 'rescan':
        state.view = 'setup'; state.selected.clear(); render(); return;
      case 'prev':
        if (state.page > 1) { state.page--; render(); } return;
      case 'next':
        state.page++; render(); return;
      case 'selpage': {
        var u = visibleUsers().slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
        u.forEach(function (x) { state.selected.add(x.id); });
        render(); return;
      }
      case 'selall':
        visibleUsers().forEach(function (x) { state.selected.add(x.id); }); render(); return;
      case 'selnone':
        state.selected.clear(); render(); return;
      case 'copy': {
        var names = visibleUsers().map(function (x) { return '@' + x.username; }).join('\n');
        navigator.clipboard.writeText(names).then(function () { alert('Liste panoya kopyalandı.'); });
        return;
      }
      case 'csv':
        downloadCSV(); return;
      case 'json':
        downloadJSON(); return;
      case 'dounfollow':
        startUnfollow(); return;
      case 'stopunfollow':
        state.unfollow.stop = true; state.unfollow.note = 'Durduruluyor\u2026'; render(); return;
      case 'backtolist':
        state.view = 'review'; render(); return;
      case 'wl-export':
        exportWhitelist(); return;
      case 'wl-import':
        importWhitelist(); return;
      case 'wl-clear':
        if (confirm('Beyaz listedeki tüm hesaplar silinsin mi?')) {
          whitelist = []; whitelistIds = new Set(); saveJSON(WHITELIST_KEY, whitelist); render();
        }
        return;
    }
  }

  function toggleWhitelist(id) {
    if (whitelistIds.has(id)) {
      whitelist = whitelist.filter(function (u) { return String(u.id) !== String(id); });
      whitelistIds.delete(id);
    } else {
      var u = state.following.concat(state.followers).find(function (x) { return x.id === id; });
      if (u) { whitelist.push(u); whitelistIds.add(id); }
    }
    saveJSON(WHITELIST_KEY, whitelist);
    state.selected.delete(id);
  }

  function saveFile(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function downloadJSON() {
    saveFile('threads-liste.json', 'application/json', JSON.stringify(visibleUsers(), null, 2));
  }
  function downloadCSV() {
    var rows = [['id', 'username', 'full_name', 'is_verified', 'is_private']];
    visibleUsers().forEach(function (u) {
      rows.push([u.id, u.username, '"' + (u.full_name || '').replace(/"/g, '""') + '"', u.is_verified, u.is_private]);
    });
    saveFile('threads-liste.csv', 'text/csv', rows.map(function (r) { return r.join(','); }).join('\n'));
  }
  function exportWhitelist() {
    if (!whitelist.length) { alert('Beyaz listen boş.'); return; }
    saveFile('threads-beyaz-liste.json', 'application/json', JSON.stringify(whitelist, null, 2));
  }
  function importWhitelist() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var arr = JSON.parse(String(fr.result));
          if (!Array.isArray(arr)) throw new Error('Dosya bir liste içermiyor');
          var added = 0;
          arr.forEach(function (u) {
            if (!u || !u.id || !u.username) return;
            if (whitelistIds.has(String(u.id))) return;
            whitelist.push(u); whitelistIds.add(String(u.id)); added++;
          });
          saveJSON(WHITELIST_KEY, whitelist);
          alert(added + ' hesap beyaz listeye eklendi.');
          render();
        } catch (e) { alert('Dosya okunamadı: ' + e.message); }
      };
      fr.readAsText(file);
    };
    input.click();
  }

  /* ------------------------------------------------------------------ */
  /* Akislar                                                            */
  /* ------------------------------------------------------------------ */

  async function runProbe() {
    state.scan.note = '';
    bodyEl.querySelector('[data-act="probe"]').textContent = 'Deneniyor\u2026';
    var a = await probeRest('following');
    var b = await probeRest('followers');
    render();
    if (!a || !b) {
      alert('Otomatik deneme sonuç vermedi. Yukarıdaki adımları izleyip listeleri Threads üzerinde bir kez aç.');
    }
  }

  async function collectList(kind, label) {
    var tpl = TPL[kind];
    if (!tpl) throw new Error(label + ' için kayıtlı bağlantı yok.');
    var seen = new Set();
    var out = [];
    var cursor = null;
    var pages = 0;

    while (true) {
      if (state.scan.stop) break;
      var res;
      try {
        res = await fetchListPage(tpl, cursor);
      } catch (e) {
        if (pages === 0 && tpl.restored) {
          // Kayitli baglanti eskimis: at, kullanicidan bir kez daha kalibrasyon iste.
          dropTemplate(kind);
          state.scan.note = label + ': kayıtlı bağlantı artık geçerli değil, yeniden kalibrasyon gerekiyor.';
        } else {
          state.scan.note = label + ' alınamadı: ' + e.message + ' (o ana kadar ' + out.length + ' hesap)';
        }
        render();
        break;
      }
      pages++;
      state.scan.pages++;
      var fresh = 0;
      for (var i = 0; i < res.users.length; i++) {
        var u = res.users[i];
        if (!u.id || seen.has(u.id)) continue;
        seen.add(u.id); out.push(u); fresh++;
      }
      state.scan.loaded += fresh;
      state.scan.phase = label + ' taranıyor — ' + out.length + ' hesap';
      render();

      if (!res.cursor || res.users.length === 0 || fresh === 0) break;
      if (pages >= SCAN_PAGE_LIMIT) {
        state.scan.note = label + ': güvenlik sınırına ulaşıldı (' + SCAN_PAGE_LIMIT + ' istek).';
        break;
      }
      cursor = res.cursor;
      await sleep(rand(timings.pageDelayMin, timings.pageDelayMax));
      if (pages % timings.longPauseEvery === 0) {
        await pauseWithCountdown(
          timings.longPauseMs,
          function () { return state.scan.stop; },
          function (left) {
            state.scan.phase = label + ' — mola, ' + fmtLeft(left) + ' kaldı';
            render();
          }
        );
      }
    }
    return out;
  }

  async function startScan() {
    state.view = 'scanning';
    state.scan = { phase: 'Başlatılıyor\u2026', loaded: 0, pages: 0, stop: false, note: '' };
    state.following = []; state.followers = []; state.followerIds = new Set();
    state.selected.clear();
    render();
    try {
      state.following = await collectList('following', 'Takip edilenler');
      render();
      if (!state.scan.stop) {
        state.followers = await collectList('followers', 'Takipçiler');
      }
      state.followerIds = new Set(state.followers.map(function (u) { return u.id; }));
      state.view = 'review';
      state.tab = 'non';
      state.page = 1;
      render();
      if (state.scan.note) {
        setTimeout(function () {
          alert('Tarama tamamlandı, ama bir uyarı var:\n\n' + state.scan.note +
                '\n\nTakipçi listesi eksik kaldıysa bazı hesaplar yanlışlıkla "geri takip etmiyor" görünebilir.');
        }, 200);
      }
    } catch (e) {
      state.view = 'setup';
      render();
      alert('Tarama başarısız: ' + e.message);
    }
  }

  var LOG_LIMIT = 500;
  function log(type, msg) {
    state.log.push({ t: type, msg: msg, time: nowStr() });
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }

  async function startUnfollow() {
    var ids = Array.from(state.selected);
    var pool = state.following.filter(function (u) { return state.selected.has(u.id); });
    if (!pool.length) return;
    // On kontrol: hic bir takipten cikarma yolumuz yoksa bosuna 40 dakika beklenmesin.
    if (!(SNIFF.csrf || getCookie('csrftoken')) && !TPL.unfollow) {
      alert('Takipten çıkarma yöntemi bulunamadı.\n\n' +
            'Threads üzerinde herhangi bir hesabı elle bir kez takipten çık; ' +
            'araç o isteği öğrenip gerisini kendisi yapar. Sonra buraya dönüp tekrar dene.');
      return;
    }
    var risky = pool.filter(function (u) { return whitelistIds.has(u.id); });
    var msg = pool.length + ' hesabı takipten çıkarmak üzeresin.\n' +
      'Tahmini süre: ~' + estimateMinutes(pool.length) + ' dakika.\n' +
      (risky.length ? '\nDİKKAT: ' + risky.length + ' tanesi beyaz listende!\n' : '') +
      '\nDevam edilsin mi?';
    if (!confirm(msg)) return;

    state.view = 'unfollowing';
    state.log = [];
    state.unfollow = { done: 0, total: pool.length, ok: 0, fail: 0, stop: false, note: '' };
    log('i', pool.length + ' hesap için işlem başladı.');
    render();

    var consecutiveFails = 0;
    for (var i = 0; i < pool.length; i++) {
      if (state.unfollow.stop) { log('i', 'İşlem durduruldu.'); break; }
      var u = pool[i];
      var r = await unfollowUser(u);
      state.unfollow.done++;
      if (r.ok) {
        consecutiveFails = 0;
        state.unfollow.ok++;
        log('ok', '@' + u.username + ' takipten çıkıldı');
        // Hangi yolun ise yaradigi sadece konsolda kalsin; kullaniciya gurultu.
        console.debug('[TU] unfollow @' + u.username + ' -> ' + r.via);
        state.selected.delete(u.id);
        state.following = state.following.filter(function (x) { return x.id !== u.id; });
      } else {
        consecutiveFails++;
        state.unfollow.fail++;
        log('no', '@' + u.username + ' başarısız — ' + r.error);
        if (/429|400|checkpoint|challenge/i.test(r.error)) {
          log('i', 'Threads sınır koymuş olabilir. İşlem durduruluyor.');
          state.unfollow.note = 'Hız sınırı algılandı, durduruldu.';
          render();
          break;
        }
        if (consecutiveFails >= 3) {
          log('i', 'Üst üste 3 hata alındı, işlem durduruluyor.');
          state.unfollow.note = 'Üst üste hata nedeniyle durduruldu.';
          render();
          break;
        }
      }
      render();
      if (i === pool.length - 1) break;
      await sleep(jitter(timings.unfollowDelay, 0.25));
      if ((i + 1) % timings.unfollowBatch === 0) {
        log('i', 'Zorunlu mola başladı (' + fmtLeft(timings.unfollowBatchPause) + ') — kısıtlama riskini azaltma.');
        var completed = await pauseWithCountdown(
          timings.unfollowBatchPause,
          function () { return state.unfollow.stop; },
          function (left) { state.unfollow.note = 'Zorunlu mola — ' + fmtLeft(left); render(); }
        );
        state.unfollow.note = '';
        if (!completed) { log('i', 'Mola sırasında durduruldu.'); render(); break; }
      }
    }
    state.unfollow.note = '';
    log('i', 'İşlem tamamlandı.');
    render();
  }

  function estimateMinutes(n) {
    var ms = n * timings.unfollowDelay + Math.floor(n / timings.unfollowBatch) * timings.unfollowBatchPause;
    return Math.max(1, Math.round(ms / 60000));
  }

  /* ------------------------------------------------------------------ */
  /* Baslat                                                             */
  /* ------------------------------------------------------------------ */

  /* Islem ortasinda sekme kapatilirsa toplanan liste ve kalan islem kaybolur. */
  window.addEventListener('beforeunload', function (e) {
    if (!isBusy()) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  onCapture(function () { if (state.view === 'setup' && !state.settingsOpen) render(); });
  detectMeId();
  loadTemplates();

  // Eklenti sayfa acilisinda "sessiz" yukler: sadece dinle, panel acma.
  var SILENT = window.__TU_MODE__ === 'silent';
  if (!SILENT) {
    mountUI();
    render();
  }

  window.__THREADS_UNFOLLOWERS__ = {
    open: function () {
      mountUI();
      if (!document.body.contains(hostEl)) document.body.appendChild(hostEl);
      state.minimized = false;
      render();
    },
    state: state,
    templates: TPL,
    sniff: SNIFF,
    debug: DEBUG,
    // Fotograf sorunlarini teshis icin: __THREADS_UNFOLLOWERS__.sample()
    sample: function () {
      console.log('Ham kullanıcı objesi:', DEBUG.rawUser);
      console.log('Fotoğraf alanları:', DEBUG.rawUser ? Object.keys(DEBUG.rawUser).filter(function (k) {
        return /pic|photo|image|avatar/i.test(k);
      }) : 'yok');
      return DEBUG.rawUser;
    }
  };

  console.log('%cThreads Unfollowers hazır.', 'color:#3b82f6;font-weight:bold');
})();
