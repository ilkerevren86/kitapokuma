/* ================= Sayfa — uygulama ================= */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const raf = () => new Promise((r) => setTimeout(r, 0));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let toastT;
  function toast(msg, ms = 2400) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ================= IndexedDB =================
  const DB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('sayfa', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
        };
        r.onsuccess = () => { this._db = r.result; res(r.result); };
        r.onerror = () => rej(r.error);
      });
    },
    async tx(store, mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode); const s = t.objectStore(store);
        const req = fn(s);
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    },
    get(store, key) { return this.tx(store, 'readonly', (s) => s.get(key)); },
    put(store, val) { return this.tx(store, 'readwrite', (s) => s.put(val)); },
    del(store, key) { return this.tx(store, 'readwrite', (s) => s.delete(key)); },
    all(store) { return this.tx(store, 'readonly', (s) => s.getAll()); },
  };

  // ================= Ayarlar =================
  const DEFAULTS = {
    theme: 'day', fontSize: 19, font: 'Literata', lineHeight: 1.55, margin: 'normal', justify: true,
    layout: 'auto', sound: true, volume: 0.7, speed: 'normal', keepAwake: false,
    voice: '', rate: 1, pitch: 1, pdfInvert: true, dim: 0, lastDayTheme: 'day',
    soundType: 'soft', pdfCrop: false,
  };
  let S = { ...DEFAULTS };
  try { Object.assign(S, JSON.parse(localStorage.getItem('sayfa.settings') || '{}')); } catch (e) { /* yok */ }
  const saveSettings = () => { try { localStorage.setItem('sayfa.settings', JSON.stringify(S)); } catch (e) { /* yok */ } };

  const FONTS = {
    Literata: '"Literata", Georgia, serif',
    Merriweather: '"Merriweather", Georgia, serif',
    'Crimson Pro': '"Crimson Pro", Georgia, serif',
    'EB Garamond': '"EB Garamond", Garamond, Georgia, serif',
    Georgia: 'Georgia, "Times New Roman", serif',
    Sans: '"Nunito Sans", system-ui, sans-serif',
  };
  const MARGINS = { narrow: [16, 14], normal: [28, 22], wide: [44, 34] };
  const SPEEDS = { slow: 1100, normal: 750, fast: 480 };
  const THEME_COLORS = { day: '#f3eee5', sepia: '#efe3cb', night: '#13110f', black: '#000000' };

  function applyTheme() {
    document.body.dataset.theme = S.theme;
    document.body.classList.toggle('pdf-invert', !!S.pdfInvert);
    document.body.classList.toggle('justify', !!S.justify);
    document.querySelector('meta[name=theme-color]').setAttribute('content', THEME_COLORS[S.theme]);
    const st = document.body.style;
    st.setProperty('--dim', S.dim);
    const night = S.theme === 'night' || S.theme === 'black';
    $('#libTheme').innerHTML = night
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>';
    $('#btnNight').classList.toggle('on', night);
  }
  function applyTypeVars() {
    const st = document.body.style;
    const [mi, mo] = MARGINS[S.margin] || MARGINS.normal;
    const scale = R.pw && R.pw < 360 ? 0.8 : 1;
    st.setProperty('--fs', S.fontSize + 'px');
    st.setProperty('--lh', S.lineHeight);
    st.setProperty('--font', FONTS[S.font] || FONTS.Literata);
    st.setProperty('--align', S.justify ? 'justify' : 'left');
    st.setProperty('--mi', Math.round(mi * scale) + 'px');
    st.setProperty('--mo', Math.round(mo * scale) + 'px');
  }
  function toggleNight() {
    const night = S.theme === 'night' || S.theme === 'black';
    if (night) S.theme = S.lastDayTheme || 'day';
    else { S.lastDayTheme = S.theme; S.theme = 'night'; }
    saveSettings(); applyTheme();
  }

  // ================= Sayfa çevirme sesi =================
  // Kağıt sesi sentezi. Tüm katmanlar yumuşak pencerelerle (ani başlangıç yok) açılıp kapanır,
  // böylece "tık/patlama" oluşmaz; en sonda sınırlayıcı taşmayı engeller.
  function makeNoise(ctx) {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    return b;
  }
  // 0..1 aralığında yumuşak zarf eğrisi (tepe noktası `peakAt`), düzensiz kağıt kıpırtısıyla
  function envCurve(n, peakAt, wobble) {
    const c = new Float32Array(n);
    const ph1 = Math.random() * 6, ph2 = Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const u = x < peakAt ? x / peakAt : 1 - (x - peakAt) / (1 - peakAt);
      const base = Math.pow(Math.sin(u * Math.PI / 2), 2);
      const wob = 1 + wobble * (0.6 * Math.sin(x * 23 + ph1) + 0.4 * Math.sin(x * 41 + ph2));
      c[i] = Math.max(0, base * wob);
    }
    c[0] = 0; c[n - 1] = 0;
    return c;
  }
  function hann(n) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return c; }

  function synthPageTurn(ctx, noise, out, t, opt) {
    const r = Math.random;
    const D = opt.dur;           // toplam süre (sn)
    const crisp = opt.crisp;
    const bus = ctx.createGain(); bus.gain.value = opt.volume; bus.connect(out);

    // 1) gövde: kağıdın havayı süpürmesi (yumuşak hışırtı)
    const a = ctx.createBufferSource(); a.buffer = noise; a.playbackRate.value = 0.85 + r() * 0.2;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280; hp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(900 + r() * 200, t);
    lp.frequency.linearRampToValueAtTime((crisp ? 5200 : 3400) + r() * 600, t + D * 0.4);
    lp.frequency.linearRampToValueAtTime(1400 + r() * 300, t + D);
    const ga = ctx.createGain(); ga.gain.value = 0;
    const peak = crisp ? 0.5 : 0.38;
    ga.gain.setValueCurveAtTime(envCurve(96, 0.32 + r() * 0.08, 0.22).map((v) => v * peak), t, D);
    a.connect(hp); hp.connect(lp); lp.connect(ga); ga.connect(bus);
    a.start(t, r() * 1.2); a.stop(t + D + 0.05);

    // 2) doku: lif sürtünmesi (çok kısa, yumuşak pencereli tanecikler)
    const n = crisp ? 12 + Math.floor(r() * 8) : 6 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const x = Math.pow(r(), 0.8);
      const at = t + D * (0.1 + x * 0.7);
      const len = 0.018 + r() * 0.03;
      const g = ctx.createBufferSource(); g.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + r() * 3600; bp.Q.value = 1.2;
      const gg = ctx.createGain(); gg.gain.value = 0;
      const amp = (crisp ? 0.22 : 0.12) * (0.4 + r() * 0.6);
      gg.gain.setValueCurveAtTime(hann(32).map((v) => v * amp), at, len);
      g.connect(bp); bp.connect(gg); gg.connect(bus);
      g.start(at, r() * 1.5); g.stop(at + len + 0.02);
    }

    // 3) sayfanın yerine yumuşakça oturması
    const st = t + D * (0.78 + r() * 0.06);
    const s = ctx.createBufferSource(); s.buffer = noise;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 1100 + r() * 300;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sg.gain.setValueCurveAtTime(hann(48).map((v) => v * (crisp ? 0.22 : 0.15)), st, 0.11);
    s.connect(sl); sl.connect(sg); sg.connect(bus);
    s.start(st, r()); s.stop(st + 0.15);
  }

  const Sfx = {
    ctx: null, noise: null, out: null, custom: null, last: 0,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.noise = makeNoise(this.ctx);
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.15;
      comp.connect(this.ctx.destination);
      this.out = comp;
      this.loadCustom();
    },
    loadCustom() {
      this.custom = null;
      let data = null;
      try { data = localStorage.getItem('sayfa.sound'); } catch (e) { /* yok */ }
      if (!data || !this.ctx) return;
      fetch(data).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => { this.custom = buf; }).catch(() => {});
    },
    flip() {
      if (!S.sound) return;
      const now = performance.now(); if (now - this.last < 200) return; this.last = now;
      this.init(); const ctx = this.ctx; if (!ctx) return;
      const t = ctx.currentTime + 0.01;
      if (S.soundType === 'custom' && this.custom) {
        const src = ctx.createBufferSource(); src.buffer = this.custom;
        const g = ctx.createGain(); g.gain.value = S.volume;
        src.connect(g); g.connect(this.out); src.start(t);
        return;
      }
      const flipMs = SPEEDS[S.speed] || 750;
      synthPageTurn(ctx, this.noise, this.out, t, {
        dur: Math.min(0.75, Math.max(0.38, flipMs / 1000 * 0.62)),
        crisp: S.soundType === 'crisp',
        volume: S.volume,
      });
    },
  };
  document.addEventListener('pointerdown', () => Sfx.init(), { once: true });

  // ================= Ekranı açık tutma =================
  const Wake = {
    lock: null, want: false,
    async set(on) {
      this.want = on;
      if (on) {
        if (!this.lock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
          try {
            this.lock = await navigator.wakeLock.request('screen');
            this.lock.addEventListener('release', () => { this.lock = null; });
          } catch (e) { console.warn('wakeLock', e); }
        }
      } else if (this.lock) { try { await this.lock.release(); } catch (e) { /* yok */ } this.lock = null; }
    },
  };
  function updateWake() {
    const inReader = $('#reader').classList.contains('active');
    Wake.set(inReader && ((TTS.active && !TTS.paused) || S.keepAwake));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Wake.want) { Wake.lock = null; Wake.set(true); }
    if (document.visibilityState === 'hidden') saveProgressNow();
  });

  // ================= Okuyucu durumu =================
  const R = {
    id: null, rec: null, prog: null, kind: null, title: '', lang: 'tr-TR',
    blocks: [], toc: [], pages: [], starts: [], chapAt: [], pdf: null, urls: [],
    pf: null, pw: 0, ph: 0, spread: false, cur: 0, rendered: new Map(), token: 0, building: false,
    lastFlipAt: 0, pdfSize: null, flipWaiters: [],
  };

  const stage = $('#stage');
  const reader = $('#reader');

  // Yakınlaştırma durumu: kitap sarmalayıcısına translate + scale uygulanır
  const Z = {
    scale: 1, x: 0, y: 0, t: 0,
    wrap() { return stage.querySelector('.book-wrap'); },
    apply(anim) {
      const w = this.wrap();
      if (w) {
        w.style.transition = anim ? 'transform .25s ease' : 'none';
        w.style.transform = this.scale > 1.001 || this.x || this.y ? 'translate(' + this.x + 'px,' + this.y + 'px) scale(' + this.scale + ')' : '';
      }
      reader.classList.toggle('zoomed', this.scale > 1.01);
      if (typeof updateZoomUI === 'function') updateZoomUI();
    },
    clamp() {
      const b = stage.querySelector('.book'); if (!b) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      const mx = Math.max(0, (b.offsetWidth * this.scale - W) / 2 + 12);
      const my = Math.max(0, (b.offsetHeight * this.scale - H) / 2 + 12);
      this.x = Math.max(-mx, Math.min(mx, this.x));
      this.y = Math.max(-my, Math.min(my, this.y));
    },
    setScale(s, cx, cy, anim) {
      s = Math.max(1, Math.min(4, s));
      const px = cx - stage.clientWidth / 2, py = cy - stage.clientHeight / 2;
      this.x = px - (px - this.x) * (s / this.scale);
      this.y = py - (py - this.y) * (s / this.scale);
      this.scale = s;
      if (s <= 1.01) { this.scale = 1; this.x = 0; this.y = 0; }
      this.clamp(); this.apply(anim); this.settle();
    },
    reset(silent) { this.scale = 1; this.x = 0; this.y = 0; if (!silent) { this.apply(true); this.settle(); } },
    toTop() { if (this.scale > 1.01) { this.y = 1e6; this.clamp(); this.apply(true); } },
    settle() { clearTimeout(this.t); this.t = setTimeout(() => { if (R.pf) renderPdfAround(R.cur); }, 280); },
  };

  // ---------- kaynak HTML'i temizle ve bloklara ayır ----------
  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE', 'FIGURE', 'FIGCAPTION', 'HR', 'DL', 'DT', 'DD', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'CENTER', 'ADDRESS', 'BODY', 'CAPTION']);
  const WRAPPERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'CENTER', 'BODY', 'ADDRESS']);
  const ATOMIC = new Set(['IMG', 'HR', 'SVG', 'svg', 'TR', 'FIGURE', 'VIDEO', 'CANVAS', 'MATH', 'math']);
  const KEEP_ATTR = new Set(['src', 'alt', 'colspan', 'rowspan', 'start', 'width', 'height', 'data-chapter']);

  function sanitize(root) {
    root.querySelectorAll('script,style,link,meta,iframe,object,embed,form,input,button,select,textarea,noscript,title,head,audio,video,template').forEach((n) => n.remove());
    const all = root.querySelectorAll('*');
    for (const n of all) {
      for (const a of [...n.attributes]) if (!KEEP_ATTR.has(a.name)) n.removeAttribute(a.name);
    }
    // gereksiz boş paragraflar
    root.querySelectorAll('p').forEach((p) => { if (!p.textContent.trim() && !p.querySelector('img,br')) p.remove(); });
    root.querySelectorAll('br + br').forEach((b) => b.remove());
  }
  const isBlockEl = (n) => n.nodeType === 1 && BLOCK.has(n.tagName.toUpperCase());
  const hasBlockKids = (n) => [...n.children].some((c) => BLOCK.has(c.tagName.toUpperCase()));
  const hasContent = (n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim());

  function wrapMixed(elm) {
    // blok + satır içi karışık içerikte satır içi parçaları sar
    if (!hasBlockKids(elm)) return;
    let run = [];
    const flush = (before) => {
      if (run.some(hasContent)) { const w = el('div', 'anon'); run[0].before(w); run.forEach((r) => w.appendChild(r)); }
      run = [];
    };
    for (const c of [...elm.childNodes]) {
      if (isBlockEl(c)) { flush(); wrapMixed(c); } else run.push(c);
    }
    flush();
  }

  function normalize(root) {
    const out = [];
    let pendingBreak = false;
    const walk = (node) => {
      let run = [];
      const flushRun = () => {
        if (run.some(hasContent)) {
          const p = document.createElement('p'); run.forEach((r) => p.appendChild(r));
          if (pendingBreak) { p.dataset.break = '1'; pendingBreak = false; }
          out.push(p);
        }
        run = [];
      };
      for (const c of [...node.childNodes]) {
        if (c.nodeType === 1 && WRAPPERS.has(c.tagName.toUpperCase()) && hasBlockKids(c)) {
          flushRun();
          if (c.dataset && c.dataset.chapter) pendingBreak = out.length > 0;
          walk(c);
        } else if (isBlockEl(c)) {
          flushRun();
          wrapMixed(c);
          if (pendingBreak) { c.dataset.break = '1'; pendingBreak = false; }
          out.push(c);
        } else if (c.nodeType === 1 || c.nodeType === 3) {
          run.push(c);
        }
      }
      flushRun();
    };
    walk(root);
    out.forEach((b, i) => { b.dataset.b = i; });
    return out;
  }

  // Türkçe heceleme: iki yana yaslarken boşlukları azaltmak için yumuşak tire (&shy;) ekler.
  // Kural: ünlüler arasındaki son ünsüz sonraki heceye geçer (ka-pı, kar-deş, kork-mak, sa-at).
  const SHY = '­';
  const TR_V = new Set('aeıioöuüâîûAEIİOÖUÜÂÎÛ');
  function hyphTR(w) {
    const vs = [];
    for (let i = 0; i < w.length; i++) if (TR_V.has(w[i])) vs.push(i);
    if (vs.length < 2) return w;
    const br = [];
    for (let k = 0; k < vs.length - 1; k++) {
      const b = vs[k + 1] - vs[k] - 1 === 0 ? vs[k + 1] : vs[k + 1] - 1;
      if (b >= 2 && w.length - b >= 2) br.push(b);
    }
    let out = '', last = 0;
    for (const b of br) { out += w.slice(last, b) + SHY; last = b; }
    return out + w.slice(last);
  }
  function hyphenate(blocks, lang) {
    if (!/^tr/i.test(lang)) return;
    const re = /[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]{6,}/g;
    for (const b of blocks) {
      if (/^(PRE|H[1-6])$/.test(b.tagName)) continue;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode;
        if (n.parentElement.closest('pre,code')) continue;
        n.data = n.data.replace(re, hyphTR);
      }
    }
  }
  const clean = (s) => s.replace(/­/g, '');

  // Stil bilgisi olmayan belgelerde (DOC, RTF, TXT) bölüm başlıklarını tahmin et
  function guessHeadings(blocks) {
    const KEY = /^(bölüm|kısım|kitap|önsöz|giriş|sonsöz|son söz|epilog|prolog|sunuş|chapter|part|prologue|epilogue|introduction|preface)\b/i;
    blocks.forEach((b, i) => {
      if (b.tagName !== 'P' || b.querySelector('img')) return;
      const t = b.textContent.trim();
      if (!t || t.length > 70 || /[.,;:!?…"”]$/.test(t)) return;
      const caps = t.length > 3 && t === t.toLocaleUpperCase('tr') && /\p{Lu}{3}/u.test(t);
      if (KEY.test(t) || caps || /^[IVXLC]+\.?$/.test(t) || /^\d{1,3}\.?$/.test(t)) {
        const h = document.createElement('h2');
        h.innerHTML = b.innerHTML; h.dataset.b = b.dataset.b;
        if (b.dataset.break) h.dataset.break = b.dataset.break;
        else if (i > 0) h.dataset.break = '1';
        blocks[i] = h;
      }
    });
  }

  async function prepareImages(root) {
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((img) => new Promise((res) => {
      const done = () => {
        if (img.naturalWidth) { img.setAttribute('width', img.naturalWidth); img.setAttribute('height', img.naturalHeight); } else img.remove();
        res();
      };
      if (img.complete && img.naturalWidth) return done();
      img.onload = done; img.onerror = () => { img.remove(); res(); };
      setTimeout(res, 8000);
    })));
  }

  // ---------- boyutlar ----------
  function computeDims() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const padX = W < 520 ? 6 : 14, padY = H < 520 ? 6 : 10;
    const aw = W - padX * 2, ah = H - padY * 2;
    let spread = S.layout === 'double' || (S.layout === 'auto' && aw / ah > 0.82 && aw >= 560);
    if (S.layout === 'double' && aw < 400) spread = false;
    let pw, ph;
    if (R.kind === 'pdf') {
      const a = R.pdfSize ? R.pdfSize.w / R.pdfSize.h : 0.707;
      const single = Math.min(aw, ah * a), double = Math.min(aw / 2, ah * a);
      // otomatikte: iki sayfa yan yana sayfaları belirgin küçültüyorsa tek sayfa göster
      if (S.layout === 'auto') spread = aw >= 560 && double >= single * 0.88;
      pw = spread ? double : single; ph = pw / a;
    } else {
      ph = ah;
      pw = spread ? aw / 2 : aw;
      const maxA = spread ? 0.78 : 0.8; // okunaklı satır uzunluğu
      if (pw / ph > maxA) pw = ph * maxA;
    }
    return { pw: Math.floor(pw), ph: Math.floor(ph), spread };
  }

  // ---------- sayfa kabuğu ----------
  function pageShell(idx, withFlow) {
    const p = el('div', 'page');
    const pg = el('div', 'pg');
    const head = el('div', 'pg-head');
    const body = el('div', 'pg-body');
    const foot = el('div', 'pg-foot', String(idx + 1));
    if (withFlow) body.appendChild(el('div', 'flow'));
    pg.append(head, body, foot);
    p.append(pg, el('div', 'ribbon'));
    return p;
  }

  // ---------- sayfalama ----------
  function textSplit(parent, node, fits) {
    const texts = []; let total = 0;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { texts.push({ n: w.currentNode, s: total }); total += w.currentNode.data.length; }
    if (!total) return null;
    const full = texts.map((t) => t.n.data).join('');
    const cuts = [];
    for (let i = 1; i < full.length; i++) if (/\s/.test(full[i - 1]) && !/\s/.test(full[i])) cuts.push(i);
    if (!cuts.length) return null;
    const locate = (pos) => { for (let k = texts.length - 1; k >= 0; k--) if (texts[k].s <= pos) return [texts[k].n, pos - texts[k].s]; return [texts[0].n, 0]; };
    const part = (a, b) => {
      const r = document.createRange();
      if (a == null) r.setStart(node, 0); else { const [n, o] = locate(a); r.setStart(n, o); }
      if (b == null) r.setEnd(node, node.childNodes.length); else { const [n, o] = locate(b); r.setEnd(n, o); }
      const sh = node.cloneNode(false); sh.appendChild(r.cloneContents()); return sh;
    };
    let lo = 0, hi = cuts.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const h = part(null, cuts[mid]); parent.appendChild(h);
      const ok = fits(); h.remove();
      if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return null;
    const head = part(null, cuts[best]); head.classList.add('split-head');
    const tail = part(cuts[best], null); tail.classList.add('cont'); tail.classList.remove('split-head');
    tail.removeAttribute('data-break');
    return { head, tail };
  }

  function fill(parent, node, fits) {
    parent.appendChild(node);
    if (fits()) return null;
    node.remove();
    if (node.nodeType !== 1) return node;
    if (ATOMIC.has(node.tagName)) return node;
    if (hasBlockKids(node)) {
      const shell = node.cloneNode(false); parent.appendChild(shell);
      const kids = [...node.childNodes]; let full = 0;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.nodeType === 3 && !k.data.trim()) { shell.appendChild(k); continue; }
        const rem = fill(shell, k, fits);
        if (rem) {
          const rest = node.cloneNode(false);
          rest.append(rem, ...kids.slice(i + 1));
          const placed = [...shell.childNodes].some(hasContent);
          if (!placed) { shell.remove(); return rest; }
          rest.classList.add('cont'); rest.removeAttribute('data-break');
          if (node.tagName === 'OL') rest.setAttribute('start', (parseInt(node.getAttribute('start'), 10) || 1) + full);
          return rest;
        }
        if (k.tagName === 'LI') full++;
      }
      return null;
    }
    const r = textSplit(parent, node, fits);
    if (!r) return node;
    parent.appendChild(r.head);
    return r.tail;
  }

  async function paginate(token) {
    const meas = $('#measure'); meas.innerHTML = '';
    const pages = [];
    let page, flow, bodyH;
    const fits = () => flow.getBoundingClientRect().height <= bodyH + 0.5;
    const newPage = () => {
      let carry = null;
      if (page) {
        const last = flow.lastElementChild;
        if (last && /^H[1-6]$/.test(last.tagName) && flow.children.length > 1) { carry = last; last.remove(); }
        pages.push(page); page.remove();
      }
      page = pageShell(pages.length, true);
      page.style.width = R.pw + 'px'; page.style.height = R.ph + 'px';
      meas.appendChild(page);
      flow = page.querySelector('.flow');
      bodyH = page.querySelector('.pg-body').clientHeight;
      if (carry) flow.appendChild(carry);
    };
    document.body.style.setProperty('--imgmax', Math.max(80, R.ph - 120) + 'px');
    newPage();
    let t0 = performance.now();
    const src = R.blocks;
    for (let i = 0; i < src.length; i++) {
      if (token !== R.token) return null;
      let node = src[i].cloneNode(true);
      if (node.dataset.break && flow.childNodes.length) newPage();
      let guard = 0;
      while (node && guard++ < 5000) {
        node = fill(flow, node, fits);
        if (node) {
          if (!flow.childNodes.length) { flow.appendChild(node); node = null; }
          newPage();
        }
      }
      if (performance.now() - t0 > 40) {
        setLoading(null, i / src.length);
        await raf(); t0 = performance.now();
      }
    }
    if (flow.childNodes.length || !pages.length) pages.push(page);
    page.remove();
    for (const p of pages) p.removeAttribute('style');
    return pages;
  }

  function pageStartBlock(p) {
    const f = p.querySelector('.flow');
    const c = f && f.querySelector('[data-b]');
    return c ? parseInt(c.dataset.b, 10) : 0;
  }

  // ---------- PDF sayfaları ----------
  function makePdfPages() {
    const pages = [];
    for (let i = 0; i < R.pdf.numPages; i++) {
      const p = el('div', 'page pdf-page');
      const h = el('div', 'pdf-holder', '<span class="ph">' + (i + 1) + '</span>');
      p.append(h, el('div', 'ribbon'));
      pages.push(p);
    }
    return pages;
  }

  // Beyaz kenar boşluklarını bul: birkaç örnek sayfanın içerik kutularını birleştir
  async function detectPdfCrop(pdf) {
    const n = pdf.numPages;
    const picks = [...new Set([1, 2, 3, Math.floor(n / 2), n - 1].filter((p) => p >= 1 && p <= n))].slice(0, 5);
    let box = null;
    for (const pn of picks) {
      try {
        const page = await pdf.getPage(pn);
        const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 220 / v1.width });
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const o = (y * c.width + x) * 4;
            if (d[o] + d[o + 1] + d[o + 2] < 690) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        if (x1 < 0) continue; // boş sayfa
        const b = { x0: x0 / c.width, y0: y0 / c.height, x1: (x1 + 1) / c.width, y1: (y1 + 1) / c.height };
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
      } catch (e) { /* atla */ }
    }
    if (!box) return null;
    const m = 0.02; // biraz nefes payı bırak
    box = { x0: Math.max(0, box.x0 - m), y0: Math.max(0, box.y0 - m), x1: Math.min(1, box.x1 + m), y1: Math.min(1, box.y1 + m) };
    if (box.x1 - box.x0 > 0.95 && box.y1 - box.y0 > 0.95) return null; // kırpmaya değmez
    if (box.x1 - box.x0 < 0.3 || box.y1 - box.y0 < 0.3) return null;   // şüpheli sonuç
    return box;
  }

  function applyCropSize() {
    const c = R.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
    R.pdfSize = { w: R.pdfSize0.w * (c.x1 - c.x0), h: R.pdfSize0.h * (c.y1 - c.y0) };
  }

  // yakınlaştırma düzeyine göre çizim kalitesi (net görüntü için)
  const zoomQ = () => (Z.scale <= 1.05 ? 1 : Z.scale <= 1.6 ? 1.6 : Z.scale <= 2.3 ? 2.3 : 3.2);

  let pdfQueue = Promise.resolve();
  function renderPdfAround(idx) {
    if (R.kind !== 'pdf') return;
    const tok = R.token;
    const vis = visiblePages();
    const want = [...vis];
    for (let d = 1; d <= 4; d++) { want.push(idx + d); if (d <= 2) want.push(idx - d); }
    pdfQueue = pdfQueue.then(async () => {
      for (const i of want) {
        if (tok !== R.token) return;
        if (i < 0 || i >= R.pages.length) continue;
        const q = vis.includes(i) ? zoomQ() : 1;
        const have = R.rendered.get(i);
        if (have && have.q >= q) continue;
        await renderPdfPage(i, tok, q);
      }
      // uzaktaki tuvalleri bırak, görünmeyen yüksek çözünürlüklüleri küçült (bellek)
      for (const [i, e] of R.rendered) {
        if (Math.abs(i - idx) > 8) { e.c.width = 0; e.c.height = 0; e.c.remove(); R.rendered.delete(i); R.pages[i].querySelector('.pdf-holder').innerHTML = '<span class="ph">' + (i + 1) + '</span>'; }
      }
    }).catch((e) => console.warn(e));
  }
  async function renderPdfPage(i, tok, q = 1) {
    const page = await R.pdf.getPage(i + 1);
    if (tok !== R.token) return;
    const v1 = page.getViewport({ scale: 1 });
    const cr = R.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
    const cw = v1.width * (cr.x1 - cr.x0), ch = v1.height * (cr.y1 - cr.y0);
    const s = Math.min(R.pw / cw, R.ph / ch);
    const cssW = cw * s, cssH = ch * s;
    let k = Math.min(window.devicePixelRatio || 1, 2) * q;
    k = Math.min(k, Math.sqrt(9e6 / (cssW * cssH))); // tuval başına ~9 MP sınırı
    const vp = page.getViewport({ scale: s * k, offsetX: -v1.width * cr.x0 * s * k, offsetY: -v1.height * cr.y0 * s * k });
    const c = document.createElement('canvas');
    c.width = Math.floor(cssW * k); c.height = Math.floor(cssH * k);
    c.style.width = Math.floor(cssW) + 'px'; c.style.height = Math.floor(cssH) + 'px';
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (tok !== R.token) return;
    const old = R.rendered.get(i);
    R.pages[i].querySelector('.pdf-holder').replaceChildren(c);
    if (old) { old.c.width = 0; old.c.height = 0; }
    R.rendered.set(i, { c, q });
  }

  // ---------- kitap oluştur (PageFlip) ----------
  function decoratePages() {
    const n = R.pages.length;
    R.pages.forEach((p, i) => {
      p.classList.remove('left', 'right', 'single');
      p.classList.add(R.spread ? (i % 2 ? 'right' : 'left') : 'single');
      if (R.kind === 'flow') {
        const head = p.querySelector('.pg-head');
        const chap = R.chapAt[i];
        head.textContent = (R.spread && i % 2 === 1 && chap) ? chap : (!R.spread && chap ? chap : R.title);
        p.querySelector('.pg-foot').textContent = String(i + 1);
      }
    });
    markRibbons();
    return n;
  }

  function buildBook(start) {
    if (R.pf) { try { R.pf.destroy(); } catch (e) { /* yok */ } R.pf = null; }
    stage.querySelectorAll('.book-wrap').forEach((b) => b.remove());
    R.pages.forEach((p) => p.removeAttribute('style'));
    decoratePages();
    const wrap = el('div', 'book-wrap');
    const holder = el('div', 'book' + (R.spread ? ' spread' : ' single'));
    holder.style.width = (R.spread ? R.pw * 2 : R.pw) + 'px';
    holder.style.height = R.ph + 'px';
    wrap.appendChild(holder);
    stage.appendChild(wrap);
    Z.clamp(); Z.apply(false);
    start = Math.max(0, Math.min(start || 0, R.pages.length - 1));
    const pf = new window.St.PageFlip(holder, {
      width: R.pw, height: R.ph, size: 'fixed', autoSize: false,
      usePortrait: true, showCover: false, startPage: start,
      drawShadow: true, maxShadowOpacity: 0.55, flippingTime: SPEEDS[S.speed] || 750,
      mobileScrollSupport: false, swipeDistance: 25, showPageCorners: true,
      disableFlipByClick: true, clickEventForward: true, useMouseEvents: true, startZIndex: 1,
    });
    pf.loadFromHTML(R.pages);
    pf.on('flip', (e) => onPageChanged(e.data, true));
    pf.on('changeState', (e) => {
      if (e.data === 'flipping' || e.data === 'user_fold') R.lastFlipAt = performance.now();
      if (e.data === 'flipping') Sfx.flip();
    });
    R.pf = pf;
    onPageChanged(pf.getCurrentPageIndex(), false);
  }

  function visiblePages() {
    const c = R.cur;
    if (!R.spread) return [c];
    const l = c - (c % 2);
    return [l, l + 1].filter((i) => i < R.pages.length);
  }

  function onPageChanged(idx, fromFlip) {
    R.cur = idx;
    R.flipWaiters.splice(0).forEach((f) => f());
    const n = R.pages.length;
    const vis = visiblePages();
    $('#pageSlider').max = n; $('#pageSlider').value = vis[0] + 1;
    $('#pageLabel').textContent = (vis.length > 1 ? (vis[0] + 1) + '–' + (vis[1] + 1) : (vis[0] + 1)) + ' / ' + n;
    $('#chapTitle').textContent = R.kind === 'flow' ? (R.chapAt[vis[0]] || '') : (R.pdfChap ? R.pdfChap(vis[0]) : '');
    $('#btnMark').classList.toggle('on', isMarked());
    renderPdfAround(idx);
    if (fromFlip) Z.toTop();
    saveProgress();
    if (fromFlip && TTS.active && !TTS.autoFlip) TTS.restartAt(vis[0]);
  }

  // ---------- yerleşim (ilk açılış ve boyut değişimi) ----------
  async function layout(keepPos) {
    const tok = ++R.token;
    TTS.hardStop();
    const d = computeDims();
    R.pw = d.pw; R.ph = d.ph; R.spread = d.spread;
    applyTypeVars();
    let startPage = 0;
    if (R.kind === 'flow') {
      const b = keepPos && keepPos.b != null ? keepPos.b : null;
      setLoading('Sayfalar diziliyor…', 0);
      try { await document.fonts.load(S.fontSize + 'px ' + (FONTS[S.font] || FONTS.Literata)); await document.fonts.ready; } catch (e) { /* yok */ }
      const pages = await paginate(tok);
      if (!pages || tok !== R.token) return;
      R.pages = pages;
      R.starts = pages.map(pageStartBlock);
      // her sayfanın bölüm başlığı
      let ti = -1; const chap = [];
      for (let i = 0; i < pages.length; i++) {
        while (ti + 1 < R.toc.length && R.toc[ti + 1].b <= R.starts[i]) ti++;
        let t = ti >= 0 ? R.toc[ti] : null;
        // sayfada başlayan başlık da sayılır
        const firstHead = pages[i].querySelector('.flow > :is(h1,h2)[data-b]');
        if (firstHead) { const found = R.toc.find((x) => x.b === +firstHead.dataset.b); if (found) t = found; }
        chap.push(t ? t.text : '');
      }
      R.chapAt = chap;
      if (b != null) {
        startPage = 0;
        for (let i = 0; i < R.starts.length; i++) { if (R.starts[i] <= b) startPage = i; else break; }
      } else if (keepPos && keepPos.ratio != null) startPage = Math.round(keepPos.ratio * (pages.length - 1));
    } else {
      R.rendered.forEach((e) => { e.c.width = 0; e.c.height = 0; });
      R.rendered.clear();
      R.pages = makePdfPages();
      startPage = keepPos && keepPos.page != null ? keepPos.page : 0;
    }
    if (tok !== R.token) return;
    buildBook(startPage);
    setLoading(false);
  }

  function currentPos() {
    const i = visiblePages()[0] || 0;
    if (R.kind === 'flow') return { b: R.starts[i] || 0, ratio: R.pages.length > 1 ? i / (R.pages.length - 1) : 0 };
    return { page: i };
  }

  let resizeT, lastSize = '';
  function onResize() {
    if (!R.id || !reader.classList.contains('active')) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const key = stage.clientWidth + 'x' + stage.clientHeight;
      if (key === lastSize) return;
      const d = computeDims();
      if (d.pw === R.pw && d.ph === R.ph && d.spread === R.spread) { lastSize = key; return; }
      lastSize = key;
      layout(currentPos());
    }, 350);
  }
  window.addEventListener('resize', onResize);
  if (window.screen && screen.orientation) screen.orientation.addEventListener('change', onResize);

  // ---------- yükleme göstergesi ----------
  function setLoading(text, frac) {
    const L = $('#loading');
    if (text === false) { L.hidden = true; return; }
    L.hidden = false;
    if (text) $('#loadingText').textContent = text;
    if (frac != null) $('#loadingBar').style.width = Math.round(frac * 100) + '%';
  }

  // ---------- kitap aç / kapat ----------
  async function openBook(id) {
    const rec = await DB.get('books', id);
    if (!rec) { toast('Kitap bulunamadı'); return; }
    show('reader');
    $('#toast').classList.remove('show');
    setLoading('Kitap açılıyor…', 0.05);
    closeBookData();
    R.id = id; R.rec = rec;
    R.prog = (await DB.get('progress', id)) || { id, bookmarks: [] };
    if (!R.prog.bookmarks) R.prog.bookmarks = [];
    $('#bookTitle').textContent = rec.title || rec.name;
    $('#chapTitle').textContent = '';
    try {
      await window.Formats.loadLib('pageflip');
      const parsed = await window.Formats.parse(rec.data, rec.name);
      R.kind = parsed.kind; R.title = rec.title || parsed.title; R.lang = parsed.lang || 'tr-TR';
      R.urls = parsed.urls || [];
      if (parsed.kind === 'pdf') {
        R.pdf = parsed.pdf;
        const p1 = await R.pdf.getPage(1); const vp = p1.getViewport({ scale: 1 });
        R.pdfSize0 = { w: vp.width, h: vp.height };
        R.crop = S.pdfCrop ? await detectPdfCrop(R.pdf) : null;
        applyCropSize();
        R.toc = await pdfOutline(R.pdf);
        R.pdfChap = (i) => { let t = ''; for (const x of R.toc) { if (x.page <= i) t = x.text; } return t; };
      } else {
        setLoading('Metin hazırlanıyor…', 0.1);
        const root = parsed.root;
        sanitize(root);
        await prepareImages(root);
        R.blocks = normalize(root);
        if (!R.blocks.some((b) => /^H[1-3]$/.test(b.tagName))) guessHeadings(R.blocks);
        const top = R.blocks.some((b) => b.tagName === 'H1') ? 'H1' : 'H2';
        R.blocks.forEach((b, i) => { if (i > 0 && b.tagName === top) b.dataset.break = '1'; });
        R.toc = R.blocks
          .filter((b) => /^H[1-3]$/.test(b.tagName) && b.textContent.trim())
          .map((b) => ({ b: +b.dataset.b, level: +b.tagName[1], text: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) }));
        if (!R.blocks.length) throw new Error('Belgede gösterilecek içerik yok.');
        hyphenate(R.blocks, R.lang);
      }
      const pos = R.kind === 'flow' ? { b: R.prog.b, ratio: R.prog.b == null && R.prog.total ? R.prog.page / Math.max(1, R.prog.total - 1) : null } : { page: R.prog.page || 0 };
      lastSize = stage.clientWidth + 'x' + stage.clientHeight;
      await layout(pos);
      rec.lastOpened = Date.now();
      DB.put('books', rec);
      showChrome(true);
      updateWake();
      if (R.prog.page) toast('Kaldığınız yerden devam: sayfa ' + (visiblePages()[0] + 1));
    } catch (err) {
      console.error(err);
      setLoading(false);
      toast(err.message || 'Dosya açılamadı', 5000);
      closeReader();
    }
  }

  async function pdfOutline(pdf) {
    const out = [];
    try {
      const ol = await pdf.getOutline();
      if (!ol) return out;
      const walk = async (items, level) => {
        for (const it of items) {
          if (out.length > 400) return;
          let page = null;
          try {
            let dest = it.dest;
            if (typeof dest === 'string') dest = await pdf.getDestination(dest);
            if (Array.isArray(dest) && dest[0]) page = typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : dest[0];
          } catch (e) { /* yok */ }
          if (page != null) out.push({ page, level, text: (it.title || '').trim() });
          if (it.items && it.items.length && level < 3) await walk(it.items, level + 1);
        }
      };
      await walk(ol, 1);
    } catch (e) { /* yok */ }
    return out;
  }

  function closeBookData() {
    R.token++;
    TTS.hardStop();
    if (R.pf) { try { R.pf.destroy(); } catch (e) { /* yok */ } R.pf = null; }
    stage.querySelectorAll('.book-wrap').forEach((b) => b.remove());
    if (R.pdf) { try { R.pdf.destroy(); } catch (e) { /* yok */ } }
    R.urls.forEach((u) => URL.revokeObjectURL(u));
    Object.assign(R, { id: null, rec: null, pdf: null, pages: [], blocks: [], toc: [], starts: [], chapAt: [], urls: [], pdfChap: null, pdfSize: null, pdfSize0: null, crop: null });
    Z.reset(true);
    R.rendered.clear();
  }

  function closeReader() {
    saveProgressNow();
    closeBookData();
    $('#zoomPill').hidden = true;
    show('library');
    renderLibrary();
    updateWake();
  }

  // ---------- ilerleme kaydı (kaldığım yer) ----------
  let saveT;
  function saveProgress() { clearTimeout(saveT); saveT = setTimeout(saveProgressNow, 600); }
  function saveProgressNow() {
    clearTimeout(saveT);
    if (!R.id || !R.pages.length) return;
    const i = visiblePages()[0];
    const pos = currentPos();
    Object.assign(R.prog, {
      page: i, total: R.pages.length, b: pos.b, updated: Date.now(),
      pct: R.pages.length > 1 ? Math.min(1, (visiblePages().slice(-1)[0] + 1) / R.pages.length) : 1,
      snippet: pageSnippet(i),
    });
    DB.put('progress', R.prog).catch(() => {});
  }
  function pageSnippet(i) {
    const p = R.pages[i]; if (!p) return '';
    const f = p.querySelector('.flow');
    if (!f) return R.pdfChap ? R.pdfChap(i) : '';
    return clean([...f.children].map((c) => c.textContent).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  // ---------- yer imleri ----------
  function markKey(i) { return R.kind === 'flow' ? { b: R.starts[i] } : { page: i }; }
  function markPage(m) {
    if (R.kind === 'flow') { let p = 0; for (let i = 0; i < R.starts.length; i++) { if (R.starts[i] <= m.b) p = i; else break; } return p; }
    return m.page;
  }
  function isMarked() {
    if (!R.prog) return false;
    const vis = visiblePages();
    return R.prog.bookmarks.some((m) => vis.includes(markPage(m)));
  }
  function markRibbons() {
    R.pages.forEach((p) => p.classList.remove('marked'));
    if (!R.prog) return;
    for (const m of R.prog.bookmarks) { const p = R.pages[markPage(m)]; if (p) p.classList.add('marked'); }
  }
  function toggleMark() {
    const vis = visiblePages();
    const existing = R.prog.bookmarks.filter((m) => vis.includes(markPage(m)));
    if (existing.length) {
      R.prog.bookmarks = R.prog.bookmarks.filter((m) => !existing.includes(m));
      toast('Yer imi kaldırıldı');
    } else {
      const i = vis[0];
      R.prog.bookmarks.push({ ...markKey(i), t: Date.now(), snippet: pageSnippet(i), chap: R.kind === 'flow' ? R.chapAt[i] : (R.pdfChap ? R.pdfChap(i) : '') });
      toast('Yer imi eklendi · sayfa ' + (i + 1));
    }
    markRibbons();
    $('#btnMark').classList.toggle('on', isMarked());
    saveProgressNow();
  }

  function goTo(i, animate) {
    if (!R.pf) return;
    i = Math.max(0, Math.min(R.pages.length - 1, i));
    const vis = visiblePages();
    if (vis.includes(i)) return;
    if (animate && Math.abs(i - R.cur) <= 2) R.pf.flip(i);
    else { Sfx.flip(); R.pf.turnToPage(i); onPageChanged(R.pf.getCurrentPageIndex(), true); }
  }

  // ================= Sesli okuma =================
  const synth = window.speechSynthesis;
  const TTS = {
    active: false, paused: false, autoFlip: false, page: 0, sents: [], si: 0, token: 0,
    sleepAt: 0,
    voices() { return synth ? synth.getVoices() : []; },
    pickVoice() {
      const vs = this.voices();
      if (S.voice) { const v = vs.find((x) => x.voiceURI === S.voice); if (v) return v; }
      const base = (R.lang || 'tr').slice(0, 2).toLowerCase();
      return vs.find((v) => v.lang && v.lang.toLowerCase().startsWith(base) && /google|neural|natural|premium/i.test(v.name))
        || vs.find((v) => v.lang && v.lang.toLowerCase().startsWith(base)) || null;
    },
    start(from) {
      if (!synth) { toast('Bu tarayıcı sesli okumayı desteklemiyor'); return; }
      this.active = true; this.paused = false;
      synth.cancel();
      this.speakPage(from != null ? from : visiblePages()[0], 0);
      syncTtsUI(); updateWake();
    },
    restartAt(i) { synth.cancel(); this.paused = false; this.speakPage(i, 0); syncTtsUI(); },
    pause() {
      if (!this.active) return;
      this.paused = true; this.token++; synth.cancel();
      syncTtsUI(); updateWake();
    },
    resume() {
      if (!this.active) return this.start();
      this.paused = false;
      const t = ++this.token; this.next(t);
      syncTtsUI(); updateWake();
    },
    stop() { this.hardStop(); syncTtsUI(); updateWake(); },
    hardStop() {
      this.active = false; this.paused = false; this.token++;
      if (synth) synth.cancel();
      clearHighlight();
      if (typeof syncTtsUI === 'function') syncTtsUI();
    },
    async speakPage(i, si) {
      const t = ++this.token;
      this.page = i;
      const sents = await pageSentences(i);
      if (t !== this.token) return;
      this.sents = sents; this.si = si;
      this.next(t);
    },
    next(t) {
      if (t !== this.token || !this.active || this.paused) return;
      if (this.sleepAt && Date.now() >= this.sleepAt) { this.sleepAt = 0; updateTimerBadge(); this.stop(); toast('Uyku zamanlayıcısı: sesli okuma durduruldu'); return; }
      if (this.si >= this.sents.length) { this.advance(t); return; }
      const s = this.sents[this.si];
      highlight(s.range);
      const u = new SpeechSynthesisUtterance(s.text);
      const v = this.pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = R.lang;
      u.rate = S.rate; u.pitch = S.pitch;
      u.onend = () => { if (t !== this.token) return; this.si++; this.next(t); };
      u.onerror = (e) => {
        if (t !== this.token) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn('tts', e.error); this.si++; setTimeout(() => this.next(t), 80);
      };
      synth.speak(u);
    },
    async advance(t) {
      const nxt = this.page + 1;
      if (nxt >= R.pages.length) { this.stop(); toast('Kitabın sonuna gelindi'); return; }
      if (!visiblePages().includes(nxt)) {
        this.autoFlip = true;
        const done = new Promise((res) => { R.flipWaiters.push(res); setTimeout(res, (SPEEDS[S.speed] || 750) + 900); });
        R.pf.flipNext('bottom');
        await done;
        this.autoFlip = false;
        await new Promise((r) => setTimeout(r, 150));
      }
      if (t !== this.token || !this.active) return;
      this.speakPage(nxt, 0);
    },
  };
  if (synth) { synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices(); }

  async function pageSentences(i) {
    const p = R.pages[i]; if (!p) return [];
    if (R.kind === 'pdf') {
      try {
        const page = await R.pdf.getPage(i + 1);
        const tc = await page.getTextContent();
        let text = '';
        for (const it of tc.items) { text += it.str; text += it.hasEOL ? '\n' : (/\s$/.test(it.str) ? '' : ' '); }
        text = text.replace(/-\n(?=\p{Ll})/gu, '').replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s+/g, ' ');
        return splitSentences(text).map((x) => ({ text: x.text, range: null }));
      } catch (e) { return []; }
    }
    const flow = p.querySelector('.flow'); if (!flow) return [];
    const segs = []; let text = ''; let lastBlock = null;
    const w = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      const blk = n.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,dt,dd,blockquote,pre,figcaption,div');
      if (lastBlock && blk !== lastBlock) text += '\n';
      lastBlock = blk;
      segs.push({ n, s: text.length, e: text.length + n.data.length });
      text += n.data;
    }
    const point = (pos) => {
      for (const sg of segs) if (pos >= sg.s && pos <= sg.e) return [sg.n, pos - sg.s];
      const sg = segs.find((x) => x.s >= pos) || segs[segs.length - 1];
      return [sg.n, Math.min(sg.n.data.length, Math.max(0, pos - sg.s))];
    };
    return splitSentences(text).map((x) => {
      let range = null;
      try { range = document.createRange(); const [a, ao] = point(x.s); const [b, bo] = point(x.e); range.setStart(a, ao); range.setEnd(b, bo); } catch (e) { range = null; }
      return { text: x.text, range };
    });
  }

  function splitSentences(text) {
    const out = [];
    const re = /[^.!?…\n]+(?:[.!?…]+["'”’»)\]]*)?/g;
    let m;
    while ((m = re.exec(text))) {
      let s = m.index, e = s + m[0].length;
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e <= s || !/[\p{L}\p{N}]/u.test(text.slice(s, e))) continue;
      // uzun cümleleri böl
      while (e - s > 240) {
        const chunk = text.slice(s, s + 240);
        let cut = Math.max(chunk.lastIndexOf(', '), chunk.lastIndexOf('; '), chunk.lastIndexOf(': '), chunk.lastIndexOf(' — '));
        if (cut < 80) cut = chunk.lastIndexOf(' ');
        if (cut < 20) cut = 240;
        out.push({ s, e: s + cut + 1, text: clean(text.slice(s, s + cut + 1)).replace(/\s+/g, ' ').trim() });
        s = s + cut + 1; while (s < e && /\s/.test(text[s])) s++;
      }
      out.push({ s, e, text: clean(text.slice(s, e)).replace(/\s+/g, ' ') });
    }
    return out;
  }

  const canHL = !!(window.CSS && CSS.highlights && window.Highlight);
  function highlight(range) {
    if (!canHL) return;
    if (range) CSS.highlights.set('tts', new Highlight(range)); else CSS.highlights.delete('tts');
  }
  function clearHighlight() { if (canHL) CSS.highlights.delete('tts'); }

  function syncTtsUI() {
    const playing = TTS.active && !TTS.paused;
    reader.classList.toggle('tts-playing', playing);
    $('#btnTts span').textContent = playing ? 'Duraklat' : (TTS.active ? 'Devam et' : 'Sesli oku');
    $('#btnStop').disabled = !TTS.active;
    const pill = $('#ttsPill');
    pill.hidden = !TTS.active;
    const lockTxt = ('wakeLock' in navigator) ? ' · ekran açık' : '';
    $('#pillText').textContent = (playing ? 'Sesli okuma' : 'Duraklatıldı') + (playing ? lockTxt : '');
    $('#pillPause').innerHTML = playing
      ? '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  }
  function ttsToggle() {
    if (!TTS.active) TTS.start();
    else if (TTS.paused) TTS.resume();
    else TTS.pause();
  }
  function updateTimerBadge() {
    const b = $('#timerBadge');
    if (!TTS.sleepAt) { b.textContent = ''; return; }
    const m = Math.max(0, Math.ceil((TTS.sleepAt - Date.now()) / 60000));
    b.textContent = m + '′';
  }
  setInterval(() => {
    updateTimerBadge();
    if (TTS.sleepAt && Date.now() >= TTS.sleepAt && TTS.active) { TTS.sleepAt = 0; TTS.stop(); updateTimerBadge(); toast('Uyku zamanlayıcısı: sesli okuma durduruldu'); }
  }, 10000);

  // ================= Okuyucu etkileşimleri =================
  let chromeT;
  function showChrome(auto) {
    reader.classList.remove('chrome-hidden');
    clearTimeout(chromeT);
    if (auto) chromeT = setTimeout(() => reader.classList.add('chrome-hidden'), 2600);
  }
  function toggleChrome() {
    clearTimeout(chromeT);
    reader.classList.toggle('chrome-hidden');
  }

  // ---------- yakınlaştırma: iki parmak, çift dokunma, kaydırma ----------
  let gestureEndAt = 0;
  let T = null;
  const tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const tmid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  function abortPageFlipTouch() {
    try {
      const ui = R.pf && R.pf.getUI(); if (ui) ui.touchPoint = null;
      if (R.pf) { R.pf.userStop({ x: 0, y: 0 }, true); if (R.pf.getState() === 'user_fold') R.pf.getFlipController().stopMove(); }
    } catch (e) { /* yok */ }
  }
  stage.addEventListener('touchstart', (e) => {
    if (!R.pf) return;
    if (e.touches.length >= 2) {
      abortPageFlipTouch();
      const [a, b] = e.touches;
      T = { mode: 'pinch', d0: tdist(a, b) || 1, s0: Z.scale, m0: tmid(a, b), x0: Z.x, y0: Z.y };
      e.stopPropagation(); if (e.cancelable) e.preventDefault();
      return;
    }
    if (Z.scale > 1.01) {
      const t = e.touches[0];
      T = { mode: 'pan', sx: t.clientX, sy: t.clientY, x0: Z.x, y0: Z.y, moved: false };
    }
  }, { capture: true, passive: false });
  stage.addEventListener('touchmove', (e) => {
    if (!T) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (T.mode === 'pinch' && e.touches.length >= 2) {
      const [a, b] = e.touches;
      const s = Math.max(1, Math.min(4, T.s0 * tdist(a, b) / T.d0));
      const m = tmid(a, b);
      Z.x = (m.x - W / 2) - ((T.m0.x - W / 2) - T.x0) * (s / T.s0);
      Z.y = (m.y - H / 2) - ((T.m0.y - H / 2) - T.y0) * (s / T.s0);
      Z.scale = s; Z.clamp(); Z.apply(false);
    } else if (T.mode === 'pan') {
      const t = e.touches[0];
      const dx = t.clientX - T.sx, dy = t.clientY - T.sy;
      if (Math.abs(dx) + Math.abs(dy) > 8) T.moved = true;
      Z.x = T.x0 + dx; Z.y = T.y0 + dy; Z.clamp(); Z.apply(false);
    }
    e.stopPropagation(); if (e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });
  stage.addEventListener('touchend', (e) => {
    if (!T) return;
    if (T.mode === 'pinch') {
      e.stopPropagation();
      if (e.touches.length === 0) {
        T = null; gestureEndAt = performance.now();
        if (Z.scale < 1.06) Z.reset(); else Z.settle();
      }
      return;
    }
    if (T.moved) gestureEndAt = performance.now();
    T = null;
    Z.settle();
  }, { capture: true });
  stage.addEventListener('wheel', (e) => {
    if (!R.pf) return;
    if (e.ctrlKey) { e.preventDefault(); Z.setScale(Z.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY, false); }
    else if (Z.scale > 1.01) { e.preventDefault(); Z.x -= e.deltaX; Z.y -= e.deltaY; Z.clamp(); Z.apply(false); Z.settle(); }
  }, { passive: false });

  // ---------- dokunma: kenarlar sayfa çevirir, orta menüleri açar, çift dokunma büyütür ----------
  let down = null, lastTap = null, tapT = null;
  stage.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
  stage.addEventListener('pointerup', (e) => {
    if (!down || !R.pf) return;
    const dx = Math.abs(e.clientX - down.x), dy = Math.abs(e.clientY - down.y), dt = performance.now() - down.t;
    down = null;
    if (dx > 12 || dy > 12 || dt > 450) return;
    if (performance.now() - gestureEndAt < 300) return;
    const x = e.clientX / stage.clientWidth;
    const now = performance.now();
    const edge = x < 0.22 || x > 0.78;
    if (!edge && lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
      clearTimeout(tapT); lastTap = null;
      if (Z.scale > 1.01) Z.reset(); else Z.setScale(2.2, e.clientX, e.clientY, true);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    const act = () => {
      if (performance.now() - R.lastFlipAt < 350) return; // PageFlip köşe dokunuşunu zaten işledi
      if (x < 0.22) R.pf.flipPrev('bottom');
      else if (x > 0.78) R.pf.flipNext('bottom');
      else toggleChrome();
    };
    clearTimeout(tapT);
    tapT = setTimeout(act, edge ? 40 : 300);
  }, true);

  function toggleZoomPill(force) {
    const p = $('#zoomPill');
    p.hidden = force != null ? !force : !p.hidden;
    updateZoomUI();
  }
  function updateZoomUI() {
    const p = $('#zoomPill');
    if (Z.scale > 1.01) p.hidden = false;
    $('#zoomVal').textContent = Math.round(Z.scale * 100) + '%';
    $('#btnZoom').classList.toggle('on', Z.scale > 1.01);
  }
  $('#btnZoom').onclick = () => toggleZoomPill();
  $('#zoomIn').onclick = () => Z.setScale(Z.scale + 0.25, stage.clientWidth / 2, stage.clientHeight / 2, true);
  $('#zoomOut').onclick = () => Z.setScale(Z.scale - 0.25, stage.clientWidth / 2, stage.clientHeight / 2, true);
  $('#zoomFit').onclick = () => { Z.reset(); toggleZoomPill(false); };

  document.addEventListener('keydown', (e) => {
    if (!reader.classList.contains('active') || !R.pf || !$('#sheet').hidden) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); R.pf.flipNext(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); R.pf.flipPrev(); }
    else if (e.key === 'Escape') closeReader();
  });

  $('#btnBack').onclick = closeReader;
  $('#btnPrev').onclick = () => R.pf && R.pf.flipPrev('bottom');
  $('#btnNext').onclick = () => R.pf && R.pf.flipNext('bottom');
  $('#btnMark').onclick = toggleMark;
  $('#btnNight').onclick = toggleNight;
  $('#libTheme').onclick = toggleNight;
  $('#btnTts').onclick = () => { Sfx.init(); ttsToggle(); };
  $('#btnStop').onclick = () => TTS.stop();
  $('#pillPause').onclick = (e) => { e.stopPropagation(); ttsToggle(); };
  $('#btnToc').onclick = openToc;
  $('#btnMarks').onclick = openMarks;
  $('#btnSettings').onclick = openSettings;
  $('#btnTimer').onclick = openTimer;
  const slider = $('#pageSlider');
  slider.oninput = () => { $('#pageLabel').textContent = slider.value + ' / ' + R.pages.length; };
  slider.onchange = () => goTo(parseInt(slider.value, 10) - 1, false);

  // ================= Alt paneller =================
  function openSheet(title, html, onMount) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false; $('#scrim').hidden = false;
    clearTimeout(chromeT);
    if (onMount) onMount($('#sheetBody'));
  }
  function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
  $('#scrim').onclick = closeSheet;
  $('#sheetClose').onclick = closeSheet;

  function openToc() {
    if (!R.toc.length) { openSheet('İçindekiler', '<p class="note">Bu belgede başlık bulunamadı. Sayfa kaydırıcısıyla gezinebilirsiniz.</p>'); return; }
    const cur = visiblePages()[0];
    const items = R.toc.map((t, k) => {
      const page = R.kind === 'flow' ? markPage({ b: t.b }) : t.page;
      return { ...t, page, k };
    });
    let curK = -1; items.forEach((it) => { if (it.page <= cur) curK = it.k; });
    const html = '<ul class="list">' + items.map((it) =>
      '<li class="lvl' + it.level + '"><button class="item' + (it.k === curK ? ' current' : '') + '" data-p="' + it.page + '"><span class="tx">' + escH(it.text) + '</span><span class="pn">' + (it.page + 1) + '</span></button></li>').join('') + '</ul>';
    openSheet('İçindekiler', html, (b) => {
      b.querySelectorAll('[data-p]').forEach((x) => { x.onclick = () => { closeSheet(); goTo(+x.dataset.p, false); }; });
      const c = b.querySelector('.current'); if (c) c.scrollIntoView({ block: 'center' });
    });
  }

  function openMarks() {
    const p = R.prog;
    const cur = visiblePages()[0];
    let html = '<div class="set-group"><h4>Kaldığım yer</h4><ul class="list"><li><button class="item current" data-p="' + cur + '"><span class="tx">Şu an: sayfa ' + (cur + 1) + ' / ' + R.pages.length +
      '<small>' + escH(pageSnippet(cur).slice(0, 110)) + '…</small></span><span class="pn">%' + Math.round(((cur + 1) / R.pages.length) * 100) + '</span></button></li></ul></div>';
    html += '<div class="set-group"><h4>Yer imlerim</h4>';
    const marks = [...p.bookmarks].map((m) => ({ m, page: markPage(m) })).sort((a, b) => a.page - b.page);
    if (!marks.length) html += '<p class="note">Henüz yer imi yok. Üst çubuktaki kurdele simgesine dokunarak bulunduğunuz sayfayı işaretleyin.</p>';
    else html += '<ul class="list">' + marks.map((x, k) => '<li><div class="row"><button class="item" data-p="' + x.page + '"><span class="tx">' + escH(x.m.chap || ('Sayfa ' + (x.page + 1))) +
      '<small>' + escH((x.m.snippet || '').slice(0, 110)) + '</small></span><span class="pn">' + (x.page + 1) + '</span></button><button class="icon-btn" data-del="' + k + '" aria-label="Sil"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg></button></div></li>').join('') + '</ul>';
    html += '</div>';
    openSheet('Kaldığım yer & yer imleri', html, (b) => {
      b.querySelectorAll('[data-p]').forEach((x) => { x.onclick = () => { closeSheet(); goTo(+x.dataset.p, false); }; });
      b.querySelectorAll('[data-del]').forEach((x) => {
        x.onclick = () => {
          const m = marks[+x.dataset.del].m;
          R.prog.bookmarks = R.prog.bookmarks.filter((y) => y !== m);
          markRibbons(); $('#btnMark').classList.toggle('on', isMarked()); saveProgressNow(); openMarks();
        };
      });
    });
  }

  function openTimer() {
    const opts = [[0, 'Kapalı'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [45, '45 dk'], [60, '1 saat'], [90, '1,5 saat']];
    const remain = TTS.sleepAt ? Math.ceil((TTS.sleepAt - Date.now()) / 60000) : 0;
    const html = '<p class="note">Sesli okuma seçtiğiniz süre sonunda durur ve ekranın kapanmasına izin verilir.' + (remain ? ' <b>Kalan: ' + remain + ' dk</b>' : '') + '</p><div class="chips">' +
      opts.map(([m, l]) => '<button class="chip" data-m="' + m + '" aria-pressed="' + (m === 0 && !TTS.sleepAt) + '">' + l + '</button>').join('') + '</div>';
    openSheet('Uyku zamanlayıcısı', html, (b) => {
      b.querySelectorAll('[data-m]').forEach((x) => {
        x.onclick = () => {
          const m = +x.dataset.m;
          TTS.sleepAt = m ? Date.now() + m * 60000 : 0;
          updateTimerBadge(); closeSheet();
          toast(m ? 'Sesli okuma ' + m + ' dk sonra duracak' : 'Zamanlayıcı kapatıldı');
          if (m && !TTS.active) TTS.start();
        };
      });
    });
  }

  function chips(name, opts, val) {
    return '<div class="chips" data-set="' + name + '">' + opts.map(([v, l]) => '<button class="chip" data-v="' + v + '" aria-pressed="' + (String(v) === String(val)) + '">' + l + '</button>').join('') + '</div>';
  }
  function sw(name, val) { return '<label class="switch"><input type="checkbox" data-sw="' + name + '"' + (val ? ' checked' : '') + '><i></i></label>'; }

  function openSettings() {
    const inReader = reader.classList.contains('active');
    const vs = TTS.voices();
    const base = (R.lang || 'tr').slice(0, 2);
    const sorted = [...vs].sort((a, b) => (b.lang.startsWith(base) - a.lang.startsWith(base)) || a.lang.localeCompare(b.lang));
    const cur = TTS.pickVoice();
    const voiceOpts = sorted.length
      ? sorted.map((v) => '<option value="' + escH(v.voiceURI) + '"' + (cur && cur.voiceURI === v.voiceURI ? ' selected' : '') + '>' + escH(v.name) + ' — ' + escH(v.lang) + '</option>').join('')
      : '<option value="">Ses bulunamadı (Ayarlar › Metin okuma çıkışı)</option>';
    const themes = [['day', 'Gündüz', '#fbf6ea', '#2b241d'], ['sepia', 'Sepya', '#f1e2c3', '#43321f'], ['night', 'Gece', '#211e1a', '#cbc1b1'], ['black', 'Siyah', '#000', '#aaa194']];
    const html =
      '<div class="set-group"><h4>Görünüm</h4>' +
        '<div class="swatches" data-set="theme">' + themes.map(([v, l, bg, fg]) => '<button class="swatch" data-v="' + v + '" aria-pressed="' + (S.theme === v) + '" title="' + l + '" style="background:' + bg + ';color:' + fg + '">Aa</button>').join('') + '</div>' +
        '<div class="set-row" style="margin-top:10px"><span>Karartma<small>Gece için ekstra loşluk</small></span><input type="range" min="0" max="0.7" step="0.05" value="' + S.dim + '" data-range="dim"></div>' +
      '</div>' +
      '<div class="set-group"><h4>Yazı</h4>' +
        '<div class="set-row"><span>Yazı boyutu</span><div class="stepper"><button data-step="-1" style="font-size:14px">A−</button><b id="fsVal">' + S.fontSize + '</b><button data-step="1" style="font-size:20px">A+</button></div></div>' +
        chips('font', Object.keys(FONTS).map((f) => [f, f === 'Sans' ? 'Sans' : f]), S.font) +
        '<div class="set-row" style="margin-top:8px"><span>Satır aralığı</span><input type="range" min="1.2" max="2.1" step="0.05" value="' + S.lineHeight + '" data-range="lineHeight"></div>' +
        '<div class="set-row"><span>Kenar boşluğu</span>' + chips('margin', [['narrow', 'Dar'], ['normal', 'Normal'], ['wide', 'Geniş']], S.margin) + '</div>' +
        '<div class="set-row"><span>İki yana yasla</span>' + sw('justify', S.justify) + '</div>' +
      '</div>' +
      '<div class="set-group"><h4>Sayfa düzeni</h4>' +
        chips('layout', [['auto', 'Otomatik'], ['single', 'Tek sayfa'], ['double', 'Çift sayfa (açık kitap)']], S.layout) +
        '<p class="note" style="padding-bottom:0">Otomatik: telefon katlıyken tek sayfa, açıkken iki sayfalık açık kitap.</p>' +
      '</div>' +
      '<div class="set-group"><h4>Sayfa çevirme</h4>' +
        '<div class="set-row"><span>Çevirme sesi</span>' + sw('sound', S.sound) + '</div>' +
        chips('soundType', [['soft', 'Yumuşak kağıt'], ['crisp', 'Belirgin kağıt'], ['custom', 'Kendi sesim']], S.soundType) +
        '<div class="set-row" style="margin-top:6px"><span>Ses düzeyi</span><input type="range" min="0.05" max="1" step="0.05" value="' + S.volume + '" data-range="volume"></div>' +
        '<div class="set-row"><span>Çevirme hızı</span>' + chips('speed', [['slow', 'Yavaş'], ['normal', 'Normal'], ['fast', 'Hızlı']], S.speed) + '</div>' +
        '<div class="btn-col" style="grid-template-columns:1fr 1fr"><button class="btn ghost" id="testFlip">Sesi dene</button><button class="btn ghost" id="pickSound">Ses dosyası seç</button></div>' +
        '<p class="note" style="padding-bottom:0">"Kendi sesim" ile telefonunuzdaki herhangi bir kısa sayfa çevirme sesini (MP3, WAV, OGG) kullanabilirsiniz.</p>' +
        '<input type="file" id="soundFile" accept="audio/*" hidden>' +
      '</div>' +
      '<div class="set-group"><h4>Sesli okuma</h4>' +
        '<select id="voiceSel" aria-label="Ses">' + voiceOpts + '</select>' +
        '<div class="set-row" style="margin-top:8px"><span>Okuma hızı <small id="rateVal">' + S.rate.toFixed(2) + '×</small></span><input type="range" min="0.5" max="2" step="0.05" value="' + S.rate + '" data-range="rate"></div>' +
        '<div class="set-row"><span>Ses tonu</span><input type="range" min="0.5" max="1.5" step="0.05" value="' + S.pitch + '" data-range="pitch"></div>' +
        '<p class="note" style="padding-bottom:0">Sesli okuma açıkken ekran kapanmaz. Daha doğal Türkçe ses için telefonda <i>Ayarlar › Erişilebilirlik › Metin okuma çıkışı</i> bölümünden Google ses motoru ve Türkçe ses paketi seçin.</p>' +
      '</div>' +
      '<div class="set-group"><h4>Ekran</h4>' +
        '<div class="set-row"><span>Okurken ekranı hep açık tut<small>Sesli okuma dışında da</small></span>' + sw('keepAwake', S.keepAwake) + '</div>' +
        '<div class="set-row"><span>PDF sayfalarını gece moduna uyarla</span>' + sw('pdfInvert', S.pdfInvert) + '</div>' +
        '<div class="set-row"><span>PDF kenar boşluklarını kırp<small>Yazıyı büyütmek için beyaz kenarları keser</small></span>' + sw('pdfCrop', S.pdfCrop) + '</div>' +
      '</div>';
    openSheet('Ayarlar', html, (b) => {
      let relayout = false;
      const relayoutSoon = () => { relayout = true; clearTimeout(openSettings.t); openSettings.t = setTimeout(doRelayout, 500); };
      const doRelayout = () => { if (relayout && inReader && R.id) { relayout = false; layout(currentPos()); } };
      b.querySelectorAll('[data-set]').forEach((grp) => {
        grp.querySelectorAll('[data-v]').forEach((btn) => {
          btn.onclick = () => {
            const k = grp.dataset.set; S[k] = btn.dataset.v; saveSettings();
            grp.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', x === btn));
            if (k === 'theme') { if (S.theme === 'day' || S.theme === 'sepia') S.lastDayTheme = S.theme; applyTheme(); }
            else if (k === 'speed') { if (R.pf) { const pos = currentPos(); buildBook(R.kind === 'flow' ? visiblePages()[0] : pos.page); } }
            else if (k === 'soundType') {
              if (S.soundType === 'custom' && !Sfx.custom) { $('#soundFile').click(); return; }
              Sfx.last = 0; Sfx.flip();
            }
            else relayoutSoon();
          };
        });
      });
      b.querySelectorAll('[data-step]').forEach((btn) => {
        btn.onclick = () => { S.fontSize = Math.max(12, Math.min(34, S.fontSize + +btn.dataset.step)); $('#fsVal').textContent = S.fontSize; saveSettings(); relayoutSoon(); };
      });
      b.querySelectorAll('[data-range]').forEach((r) => {
        r.oninput = () => {
          const k = r.dataset.range; S[k] = parseFloat(r.value); saveSettings();
          if (k === 'dim') applyTheme();
          if (k === 'rate') $('#rateVal').textContent = S.rate.toFixed(2) + '×';
        };
        r.onchange = () => { if (r.dataset.range === 'lineHeight') relayoutSoon(); if (r.dataset.range === 'volume') Sfx.flip(); if ((r.dataset.range === 'rate' || r.dataset.range === 'pitch') && TTS.active && !TTS.paused) { TTS.token++; synth.cancel(); TTS.next(TTS.token); } };
      });
      b.querySelectorAll('[data-sw]').forEach((c) => {
        c.onchange = () => {
          const k = c.dataset.sw; S[k] = c.checked; saveSettings();
          if (k === 'justify') { applyTheme(); relayoutSoon(); }
          if (k === 'pdfInvert') applyTheme();
          if (k === 'keepAwake') updateWake();
          if (k === 'pdfCrop' && R.kind === 'pdf' && R.pdf) {
            (async () => {
              const pos = currentPos();
              R.crop = S.pdfCrop ? await detectPdfCrop(R.pdf) : null;
              applyCropSize();
              if (S.pdfCrop && !R.crop) toast('Bu PDF\'te kırpılacak belirgin bir boşluk yok');
              layout(pos);
            })();
          }
        };
      });
      $('#soundFile').onchange = (e) => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 1.5 * 1024 * 1024) { toast('Ses dosyası en fazla 1,5 MB olabilir. Kısa bir kayıt seçin.', 4000); return; }
        const rd = new FileReader();
        rd.onload = () => {
          try { localStorage.setItem('sayfa.sound', rd.result); } catch (err) { toast('Ses kaydedilemedi (çok büyük)'); return; }
          S.soundType = 'custom'; saveSettings();
          Sfx.init(); Sfx.loadCustom();
          setTimeout(() => { Sfx.last = 0; Sfx.flip(); }, 400);
          b.querySelectorAll('[data-set=soundType] [data-v]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === 'custom'));
          toast('Kendi sesiniz ayarlandı: ' + f.name);
        };
        rd.readAsDataURL(f);
      };
      const pick = $('#pickSound'); if (pick) pick.onclick = () => $('#soundFile').click();
      $('#voiceSel').onchange = (e) => { S.voice = e.target.value; saveSettings(); if (TTS.active && !TTS.paused) { TTS.token++; synth.cancel(); TTS.next(TTS.token); } };
      $('#testFlip').onclick = () => { Sfx.last = 0; Sfx.flip(); };
      const obs = new MutationObserver(() => { if ($('#sheet').hidden) { obs.disconnect(); doRelayout(); } });
      obs.observe($('#sheet'), { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  // ================= Kitaplık =================
  function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function coverHTML(b) {
    const e = (b.ext || '').toUpperCase();
    if (b.cover) return '<div class="cover"><img src="' + b.cover + '" alt=""><span class="badge">' + e + '</span></div>';
    const h = hue(b.title || b.name);
    return '<div class="cover" style="background:linear-gradient(150deg,hsl(' + h + ' 42% 36%),hsl(' + ((h + 30) % 360) + ' 48% 20%))"><div class="gen-cover"><b>' + escH(b.title || b.name) + '</b><small>' + e + '</small></div></div>';
  }
  function ago(t) {
    if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'az önce';
    if (s < 3600) return Math.floor(s / 60) + ' dk önce';
    if (s < 86400) return Math.floor(s / 3600) + ' saat önce';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' gün önce';
    return new Date(t).toLocaleDateString('tr-TR');
  }

  async function renderLibrary() {
    const [books, progs] = await Promise.all([DB.all('books'), DB.all('progress')]);
    const P = Object.fromEntries(progs.map((p) => [p.id, p]));
    books.sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added));
    $('#bookCount').textContent = books.length ? books.length + ' kitap' : '';
    $('#emptyState').hidden = books.length > 0;

    const recent = books.filter((b) => b.lastOpened && P[b.id] && P[b.id].total);
    $('#continueSec').hidden = !recent.length;
    const cl = $('#continueList'); cl.innerHTML = '';
    if (recent.length) {
      const b = recent[0], p = P[b.id];
      const card = el('button', 'cont-card');
      card.innerHTML = coverHTML(b) +
        '<div class="cont-info"><div class="t">' + escH(b.title) + '</div>' +
        '<div class="m">Sayfa ' + (p.page + 1) + ' / ' + p.total + ' · %' + Math.round((p.pct || 0) * 100) + ' · ' + ago(p.updated) + '</div>' +
        '<div class="bar-prog"><i style="width:' + Math.round((p.pct || 0) * 100) + '%"></i></div>' +
        (p.snippet ? '<div class="q">“' + escH(p.snippet.slice(0, 120)) + '…”</div>' : '') +
        '<span class="go"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>Okumaya devam et</span></div>';
      card.onclick = () => openBook(b.id);
      cl.appendChild(card);
      if (recent.length > 1) {
        const mini = el('div', 'cont-mini');
        recent.slice(1, 6).forEach((rb) => {
          const rp = P[rb.id];
          const btn = el('button');
          btn.innerHTML = coverHTML(rb) + '<div><div class="t">' + escH(rb.title) + '</div><div class="m">Sayfa ' + (rp.page + 1) + ' / ' + rp.total + ' · %' + Math.round((rp.pct || 0) * 100) + '</div></div>';
          btn.onclick = () => openBook(rb.id);
          mini.appendChild(btn);
        });
        cl.appendChild(mini);
      }
    }

    const grid = $('#bookGrid'); grid.innerHTML = '';
    for (const b of books) {
      const p = P[b.id];
      const pct = p && p.pct ? Math.round(p.pct * 100) : 0;
      const card = el('div', 'book-card');
      card.setAttribute('role', 'button'); card.tabIndex = 0;
      card.innerHTML = coverHTML(b) +
        '<button class="more" aria-label="Seçenekler"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>' +
        '<div class="t">' + escH(b.title) + '</div>' +
        (pct ? '<div class="bar-prog"><i style="width:' + pct + '%"></i></div>' : '') +
        '<div class="m"><span>' + (pct ? '%' + pct : 'Yeni') + '</span><span>' + (b.size > 1048576 ? (b.size / 1048576).toFixed(1) + ' MB' : Math.ceil(b.size / 1024) + ' KB') + '</span></div>';
      card.onclick = (e) => { if (e.target.closest('.more')) return; openBook(b.id); };
      card.querySelector('.more').onclick = (e) => { e.stopPropagation(); bookMenu(b, p); };
      grid.appendChild(card);
    }
  }

  function bookMenu(b, p) {
    const html = '<p class="note" style="padding-top:0"><b>' + escH(b.title) + '</b><br>' + escH(b.name) + '</p><div class="btn-col">' +
      '<button class="btn" data-a="open">Aç</button>' +
      (p ? '<button class="btn ghost" data-a="reset">Baştan başla (kaldığım yeri sıfırla)</button>' : '') +
      '<button class="btn danger" data-a="del">Kitaplıktan sil</button></div>';
    openSheet('Kitap', html, (body) => {
      body.querySelector('[data-a=open]').onclick = () => { closeSheet(); openBook(b.id); };
      const r = body.querySelector('[data-a=reset]');
      if (r) r.onclick = async () => { const bm = (p && p.bookmarks) || []; await DB.put('progress', { id: b.id, bookmarks: bm }); b.lastOpened = 0; await DB.put('books', b); closeSheet(); renderLibrary(); toast('İlerleme sıfırlandı'); };
      body.querySelector('[data-a=del]').onclick = async (ev) => {
        const btn = ev.currentTarget;
        if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Emin misiniz? Silmek için tekrar dokunun'; return; }
        await DB.del('books', b.id); await DB.del('progress', b.id); closeSheet(); renderLibrary(); toast('Kitap silindi');
      };
    });
  }

  async function fileId(f) {
    const s = f.name + '|' + f.size + '|' + (f.lastModified || 0);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)).catch(() => null);
    if (!buf) return 'b' + hue(s) + '_' + f.size;
    return [...new Uint8Array(buf)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  async function addFiles(files) {
    files = [...files];
    const ok = files.filter((f) => window.Formats.supported(f.name));
    if (files.length && !ok.length) { toast('Desteklenmeyen dosya türü. PDF, DOC, DOCX, EPUB, ODT, RTF, TXT desteklenir.', 4000); return; }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    let lastId = null, added = 0;
    for (const f of ok) {
      const id = await fileId(f);
      lastId = id;
      if (await DB.get('books', id)) continue;
      toast('Ekleniyor: ' + f.name, 8000);
      const data = new Blob([await f.arrayBuffer()], { type: f.type || 'application/octet-stream' });
      const rec = { id, name: f.name, title: window.Formats.stripExt(f.name), ext: window.Formats.ext(f.name), size: f.size, added: Date.now(), lastOpened: 0, data, cover: null };
      const c = await Promise.race([
        window.Formats.cover(data, f.name),
        new Promise((r) => setTimeout(() => r({ cover: null, title: null }), 15000)),
      ]);
      if (c.cover) rec.cover = c.cover;
      if (c.title && c.title.trim().length > 2 && !/^(untitled|microsoft word|adsız)/i.test(c.title)) rec.title = c.title.trim();
      await DB.put('books', rec);
      added++;
    }
    await renderLibrary();
    if (ok.length === 1 && lastId) openBook(lastId);
    else if (added) toast(added + ' kitap eklendi');
    else toast('Bu kitaplar zaten kitaplıkta');
  }

  $('#fileInput').onchange = (e) => { const f = e.target.files; if (f && f.length) addFiles(f); e.target.value = ''; };

  // sürükle-bırak (masaüstü)
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  // ================= Ekranlar =================
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === name));
    closeSheet();
    if (name === 'reader') {
      reader.classList.remove('chrome-hidden', 'tts-playing');
      history.pushState({ reader: 1 }, '');
    }
  }
  window.addEventListener('popstate', () => {
    if (!$('#sheet').hidden) { closeSheet(); if (reader.classList.contains('active')) history.pushState({ reader: 1 }, ''); return; }
    if (reader.classList.contains('active')) closeReader();
  });
  window.addEventListener('pagehide', saveProgressNow);

  // ================= Başlangıç =================
  async function boot() {
    applyTheme();
    applyTypeVars();
    await renderLibrary();
    // paylaşımdan / dosya ile açmadan gelen dosyalar
    const params = new URLSearchParams(location.search);
    if (params.has('shared')) {
      history.replaceState(null, '', location.pathname);
      try {
        const cache = await caches.open('sayfa-share');
        const keys = await cache.keys();
        const files = [];
        for (const k of keys) {
          const res = await cache.match(k); const blob = await res.blob();
          files.push(new File([blob], decodeURIComponent(res.headers.get('X-Name') || 'belge'), { type: blob.type }));
          await cache.delete(k);
        }
        if (files.length) addFiles(files);
      } catch (e) { console.warn(e); }
    }
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (lp) => {
        if (!lp.files || !lp.files.length) return;
        const files = await Promise.all(lp.files.map((h) => h.getFile()));
        addFiles(files);
      });
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
    }
  }
  boot();

  window.__sayfa = { R, S, Z, TTS, Sfx, layout, addFiles, openBook, synthPageTurn, makeNoise };
})();
