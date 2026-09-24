/* Sayfa — dosya biçimleri: PDF, DOCX, DOC, EPUB, ODT, RTF, TXT, MD, HTML */
(function () {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const LIBS = {
    pdf: CDN + 'pdfjs-dist@3.11.174/build/pdf.min.js',
    mammoth: CDN + 'mammoth@1.8.0/mammoth.browser.min.js',
    jszip: CDN + 'jszip@3.10.1/dist/jszip.min.js',
    pageflip: CDN + 'page-flip@2.0.7/dist/js/page-flip.browser.js',
  };
  const PDF_WORKER = CDN + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const PDF_FONTS = CDN + 'pdfjs-dist@3.11.174/standard_fonts/';
  const PDF_CMAPS = CDN + 'pdfjs-dist@3.11.174/cmaps/';

  const loading = {};
  function loadLib(name) {
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = LIBS[name];
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => { delete loading[name]; reject(new Error('Kütüphane yüklenemedi: ' + name + ' (internet bağlantısını kontrol edin)')); };
        document.head.appendChild(s);
      }).then(() => {
        if (name === 'pdf') window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      });
    }
    return loading[name];
  }

  const EXTS = ['pdf', 'docx', 'doc', 'epub', 'odt', 'rtf', 'txt', 'md', 'markdown', 'html', 'htm', 'xhtml'];
  const ext = (name) => (name.split('.').pop() || '').toLowerCase();
  const stripExt = (name) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1254').decode(buf); }
  }

  function detectLang(text) {
    const s = text.slice(0, 20000);
    const tr = (s.match(/[ğĞşŞıİ]/g) || []).length + (s.match(/\b(ve|bir|bu|için|ile|olarak|değil)\b/gi) || []).length;
    const en = (s.match(/\b(the|and|of|to|is|that|with)\b/gi) || []).length;
    const de = (s.match(/\b(der|die|und|das|nicht|ist)\b/gi) || []).length;
    if (tr >= en && tr >= de) return 'tr-TR';
    if (de > en) return 'de-DE';
    return 'en-US';
  }

  // ---------- düz metin / markdown ----------
  function textToHtml(text) {
    text = text.replace(/\r\n?/g, '\n');
    const hasBlank = /\n[ \t]*\n/.test(text);
    const paras = hasBlank ? text.split(/\n[ \t]*\n+/) : text.split('\n');
    return paras.map((p) => {
      const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
      const body = avg > 55 ? esc(lines.join(' ')) : lines.map(esc).join('<br>');
      return '<p>' + body + '</p>';
    }).join('\n');
  }

  function mdInline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  }
  function mdToHtml(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out = []; let para = []; let list = null;
    const flush = () => {
      if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; }
      if (list) { out.push('<' + list.t + '>' + list.items.map((i) => '<li>' + mdInline(i) + '</li>').join('') + '</' + list.t + '>'); list = null; }
    };
    for (const raw of lines) {
      const l = raw.trim();
      let m;
      if (!l) { flush(); continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { flush(); out.push('<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>'); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) { flush(); out.push('<hr>'); continue; }
      if ((m = l.match(/^>\s?(.*)$/))) { flush(); out.push('<blockquote><p>' + mdInline(m[1]) + '</p></blockquote>'); continue; }
      if ((m = l.match(/^[-*+]\s+(.*)$/)) || (m = l.match(/^\d+[.)]\s+(.*)$/))) {
        const t = /^\d/.test(l) ? 'ol' : 'ul';
        if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; }
        if (!list || list.t !== t) { if (list) flush(); list = { t, items: [] }; }
        list.items.push(m[1]); continue;
      }
      if (list) flush();
      para.push(l);
    }
    flush();
    return out.join('\n');
  }

  // ---------- RTF ----------
  function rtfToHtml(buf) {
    const u8 = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < u8.length; i += 0x8000) str += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'object', 'datastore', 'themedata', 'colorschememapping', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'fldinst', 'pgdsctbl', 'filetbl', 'revtbl', 'listtext', 'pntext', 'bkmkstart', 'bkmkend', 'nonshppict', 'shp', 'field-inst']);
    let cp = 'windows-1252';
    let out = ''; let bytes = [];
    const stack = []; let skip = false; let uc = 1; let ucSkip = 0;
    const flush = () => { if (bytes.length) { try { out += new TextDecoder(cp).decode(new Uint8Array(bytes)); } catch (e) { out += String.fromCharCode.apply(null, bytes); } bytes = []; } };
    const put = (s) => { if (skip) return; flush(); out += s; };
    let i = 0;
    while (i < str.length) {
      const c = str[i];
      if (c === '{') { stack.push({ skip, uc }); i++; continue; }
      if (c === '}') { flush(); const f = stack.pop(); if (f) { skip = f.skip; uc = f.uc; } i++; continue; }
      if (c === '\\') {
        const n = str[i + 1];
        if (n === "'") {
          const hex = parseInt(str.substr(i + 2, 2), 16); i += 4;
          if (ucSkip > 0) { ucSkip--; continue; }
          if (!skip && !isNaN(hex)) bytes.push(hex);
          continue;
        }
        if (n === '*') { skip = true; i += 2; continue; }
        if (n === '\\' || n === '{' || n === '}') { put(n); i += 2; continue; }
        if (n === '~') { put(' '); i += 2; continue; }
        if (n === '-' || n === '_') { i += 2; if (n === '_') put('-'); continue; }
        if (n === '\n' || n === '\r') { put('\n'); i += 2; continue; }
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(str.substr(i + 1, 40));
        if (!m) { i += 2; continue; }
        i += 1 + m[0].length;
        const w = m[1]; const arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
        if (SKIP.has(w)) { skip = true; continue; }
        if (w === 'ansicpg' && arg) cp = 'windows-' + arg;
        else if (w === 'uc') uc = arg || 0;
        else if (w === 'u') { let code = arg; if (code < 0) code += 65536; put(String.fromCharCode(code)); ucSkip = uc; }
        else if (w === 'par' || w === 'sect' || w === 'page') put('\n\n');
        else if (w === 'line') put('\n');
        else if (w === 'tab') put('\t');
        else if (w === 'cell') put(' \t ');
        else if (w === 'row') put('\n');
        else if (w === 'emdash') put('—');
        else if (w === 'endash') put('–');
        else if (w === 'lquote') put('‘');
        else if (w === 'rquote') put('’');
        else if (w === 'ldblquote') put('“');
        else if (w === 'rdblquote') put('”');
        else if (w === 'bullet') put('•');
        continue;
      }
      if (c === '\r' || c === '\n') { i++; continue; }
      if (ucSkip > 0) { ucSkip--; i++; continue; }
      if (!skip) bytes.push(c.charCodeAt(0));
      i++;
    }
    flush();
    return out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .map((p) => '<p>' + p.split('\n').map(esc).join('<br>') + '</p>').join('\n');
  }

  // ---------- eski Word .doc (CFB + parça tablosu) ----------
  function parseCFB(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if (!sig.every((b, i) => u8[i] === b)) throw new Error('not cfb');
    const ss = 1 << dv.getUint16(0x1E, true);
    const dirStart = dv.getUint32(0x30, true);
    const cutoff = dv.getUint32(0x38, true);
    const miniFatStart = dv.getUint32(0x3C, true);
    const difStart = dv.getUint32(0x44, true);
    const nDif = dv.getUint32(0x48, true);
    const END = 0xFFFFFFFA;
    const secOff = (s) => (s + 1) * ss;
    const fatSecs = [];
    for (let i = 0; i < 109; i++) { const v = dv.getUint32(0x4C + i * 4, true); if (v < END) fatSecs.push(v); }
    let d = difStart;
    for (let k = 0; k < nDif && d < END; k++) {
      for (let j = 0; j < ss / 4 - 1; j++) { const v = dv.getUint32(secOff(d) + j * 4, true); if (v < END) fatSecs.push(v); }
      d = dv.getUint32(secOff(d) + ss - 4, true);
    }
    const per = ss / 4;
    const fat = new Uint32Array(fatSecs.length * per);
    fatSecs.forEach((s, i) => { for (let j = 0; j < per; j++) { const o = secOff(s) + j * 4; fat[i * per + j] = o + 4 <= u8.length ? dv.getUint32(o, true) : 0xFFFFFFFE; } });
    const chain = (start, table) => { const out = []; const seen = new Set(); let s = start; while (s < END && s < table.length && !seen.has(s)) { seen.add(s); out.push(s); s = table[s]; } return out; };
    const readBig = (start, size) => {
      const secs = chain(start, fat); const buf = new Uint8Array(secs.length * ss);
      secs.forEach((s, i) => buf.set(u8.subarray(secOff(s), secOff(s) + ss), i * ss));
      return size === undefined ? buf : buf.subarray(0, size);
    };
    const dir = readBig(dirStart);
    const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    const entries = [];
    for (let off = 0; off + 128 <= dir.length; off += 128) {
      const nl = ddv.getUint16(off + 0x40, true);
      let name = '';
      for (let j = 0; j < Math.max(0, nl - 2); j += 2) name += String.fromCharCode(ddv.getUint16(off + j, true));
      entries.push({ name, type: dir[off + 0x42], start: ddv.getUint32(off + 0x74, true), size: ddv.getUint32(off + 0x78, true) });
    }
    const root = entries[0];
    const mini = root ? readBig(root.start, root.size) : new Uint8Array(0);
    const mfRaw = miniFatStart < END ? readBig(miniFatStart) : new Uint8Array(0);
    const miniFat = new Uint32Array(mfRaw.buffer.slice(mfRaw.byteOffset, mfRaw.byteOffset + (mfRaw.length & ~3)));
    const mss = 1 << dv.getUint16(0x20, true);
    return {
      get(name) {
        const e = entries.find((x) => x.name === name && x.type === 2);
        if (!e) return null;
        if (e.size < cutoff) {
          const secs = chain(e.start, miniFat); const buf = new Uint8Array(secs.length * mss);
          secs.forEach((s, i) => buf.set(mini.subarray(s * mss, s * mss + mss), i * mss));
          return buf.subarray(0, e.size);
        }
        return readBig(e.start, e.size);
      },
    };
  }

  function docToHtml(buf) {
    const u8 = new Uint8Array(buf);
    const head = String.fromCharCode.apply(null, u8.subarray(0, 5));
    if (head === '{\\rtf') return rtfToHtml(buf);
    const cfb = parseCFB(u8);
    const wd = cfb.get('WordDocument');
    if (!wd) throw new Error('WordDocument yok');
    const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
    if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('Desteklenmeyen Word sürümü');
    const flags = dv.getUint16(0x0A, true);
    if (flags & 0x0100) throw new Error('Şifreli belge');
    const table = cfb.get(flags & 0x0200 ? '1Table' : '0Table');
    const ccpText = dv.getUint32(0x4C, true);
    const fcClx = dv.getUint32(0x1A2, true), lcbClx = dv.getUint32(0x1A6, true);
    const clx = table.subarray(fcClx, fcClx + lcbClx);
    const cdv = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);
    let p = 0;
    while (clx[p] === 1) p += 3 + cdv.getUint16(p + 1, true);
    if (clx[p] !== 2) throw new Error('Parça tablosu yok');
    const lcb = cdv.getUint32(p + 1, true);
    const base = p + 5;
    const n = (lcb - 4) / 12;
    const cp1252 = new TextDecoder('windows-1252');
    const u16 = new TextDecoder('utf-16le');
    let text = '';
    for (let i = 0; i < n; i++) {
      const cpS = cdv.getUint32(base + i * 4, true), cpE = cdv.getUint32(base + (i + 1) * 4, true);
      if (cpS >= ccpText) break;
      const count = Math.min(cpE, ccpText) - cpS;
      const raw = cdv.getUint32(base + 4 * (n + 1) + i * 8 + 2, true);
      const compressed = raw & 0x40000000;
      const fc = raw & 0x3FFFFFFF;
      if (compressed) text += cp1252.decode(wd.subarray(fc / 2, fc / 2 + count));
      else text += u16.decode(wd.subarray(fc, fc + count * 2));
    }
    // alan kodlarını ve özel karakterleri temizle
    let out = ''; const fields = [];
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c === 0x13) { fields.push('code'); continue; }
      if (c === 0x14) { if (fields.length) fields[fields.length - 1] = 'res'; continue; }
      if (c === 0x15) { fields.pop(); continue; }
      if (fields.some((f) => f === 'code')) continue;
      if (c === 0x0D || c === 0x0C) out += '\n';
      else if (c === 0x0B) out += '\u2028';
      else if (c === 0x07) out += '\t';
      else if (c === 0x1E) out += '-';
      else if (c < 0x20 && c !== 0x09) continue;
      else out += ch;
    }
    return out.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => '<p>' + esc(l).replace(/\u2028/g, '<br>').replace(/\t+/g, ' — ') + '</p>').join('\n');
  }

  // ---------- ODT ----------
  async function odtToHtml(buf) {
    await loadLib('jszip');
    const zip = await window.JSZip.loadAsync(buf);
    const xml = await zip.file('content.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
    const inline = (node) => {
      let s = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { s += esc(c.data); continue; }
        if (c.nodeType !== 1) continue;
        switch (c.localName) {
          case 's': s += ' '.repeat(parseInt(c.getAttribute('text:c') || '1', 10)); break;
          case 'tab': s += ' '; break;
          case 'line-break': s += '<br>'; break;
          case 'note': case 'annotation': break;
          default: s += inline(c);
        }
      }
      return s;
    };
    const block = (node) => {
      let s = '';
      for (const c of node.childNodes) {
        if (c.nodeType !== 1) continue;
        switch (c.localName) {
          case 'h': { const l = Math.min(6, parseInt(c.getAttribute('text:outline-level') || '1', 10)); s += '<h' + l + '>' + inline(c) + '</h' + l + '>'; break; }
          case 'p': s += '<p>' + inline(c) + '</p>'; break;
          case 'list': s += '<ul>' + [...c.children].filter((x) => x.localName === 'list-item').map((li) => '<li>' + block(li) + '</li>').join('') + '</ul>'; break;
          case 'table': s += '<table>' + [...c.getElementsByTagNameNS('*', 'table-row')].map((r) => '<tr>' + [...r.children].filter((x) => x.localName === 'table-cell').map((td) => '<td>' + block(td) + '</td>').join('') + '</tr>').join('') + '</table>'; break;
          case 'section': case 'index-body': case 'table-of-content': s += block(c); break;
        }
      }
      return s;
    };
    return block(body);
  }

  // ---------- EPUB ----------
  function resolvePath(base, href) {
    href = decodeURIComponent(href.split('#')[0]);
    if (href.startsWith('/')) return href.slice(1);
    const parts = (base ? base.split('/') : []);
    for (const seg of href.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    return parts.join('/');
  }
  const dirOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';

  async function openEpub(buf) {
    await loadLib('jszip');
    const zip = await window.JSZip.loadAsync(buf);
    const containerXml = await zip.file('META-INF/container.xml').async('string');
    const cdoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const opfPath = cdoc.getElementsByTagNameNS('*', 'rootfile')[0].getAttribute('full-path');
    const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
    const opfDir = dirOf(opfPath);
    const manifest = {};
    for (const it of opf.getElementsByTagNameNS('*', 'item')) {
      manifest[it.getAttribute('id')] = { href: resolvePath(opfDir, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
    }
    const title = (opf.getElementsByTagNameNS('*', 'title')[0] || {}).textContent || '';
    const lang = (opf.getElementsByTagNameNS('*', 'language')[0] || {}).textContent || '';
    const spine = [...opf.getElementsByTagNameNS('*', 'itemref')].map((r) => manifest[r.getAttribute('idref')]).filter(Boolean);
    let coverItem = Object.values(manifest).find((m) => /cover-image/.test(m.props));
    if (!coverItem) {
      const meta = [...opf.getElementsByTagNameNS('*', 'meta')].find((m) => m.getAttribute('name') === 'cover');
      if (meta) coverItem = manifest[meta.getAttribute('content')];
    }
    return { zip, spine, title: title.trim(), lang: lang.trim(), coverItem };
  }

  async function epubToHtml(buf) {
    const ep = await openEpub(buf);
    const urls = [];
    const root = document.createElement('div');
    for (const item of ep.spine) {
      if (!/html|xml/.test(item.type)) continue;
      const f = ep.zip.file(item.href);
      if (!f) continue;
      const src = await f.async('string');
      let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
      if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(src, 'text/html');
      const body = doc.body || doc.getElementsByTagName('body')[0];
      if (!body) continue;
      const base = dirOf(item.href);
      // svg içindeki kapak resimlerini img'e çevir
      for (const svg of [...body.getElementsByTagName('svg')]) {
        const im = svg.getElementsByTagName('image')[0];
        if (im) {
          const img = doc.createElement('img');
          img.setAttribute('src', im.getAttribute('href') || im.getAttribute('xlink:href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '');
          svg.replaceWith(img);
        }
      }
      for (const img of [...body.getElementsByTagName('img')]) {
        const s = img.getAttribute('src');
        if (!s || /^data:/.test(s)) continue;
        const zf = ep.zip.file(resolvePath(base, s));
        if (zf) { const u = URL.createObjectURL(await zf.async('blob')); urls.push(u); img.setAttribute('src', u); }
        else img.remove();
      }
      const chap = document.createElement('div');
      chap.setAttribute('data-chapter', '1');
      for (const c of [...body.childNodes]) chap.appendChild(document.importNode(c, true));
      root.appendChild(chap);
    }
    return { root, title: ep.title, lang: ep.lang, urls };
  }

  // ---------- kapak ----------
  function thumbFromImage(src, w = 300) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w; c.height = Math.round(w * img.naturalHeight / img.naturalWidth);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function cover(blob, name) {
    const e = ext(name);
    try {
      if (e === 'pdf') {
        await loadLib('pdf');
        const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer(), standardFontDataUrl: PDF_FONTS, cMapUrl: PDF_CMAPS, cMapPacked: true }).promise;
        const page = await pdf.getPage(1);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 300 / vp1.width });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const url = c.toDataURL('image/jpeg', 0.8);
        let title = null;
        try { const md = await pdf.getMetadata(); title = md && md.info && md.info.Title; } catch (x) { /* yok */ }
        pdf.destroy();
        return { cover: url, title };
      }
      if (e === 'epub') {
        const ep = await openEpub(await blob.arrayBuffer());
        let url = null;
        if (ep.coverItem) {
          const f = ep.zip.file(ep.coverItem.href);
          if (f) { const u = URL.createObjectURL(await f.async('blob')); url = await thumbFromImage(u); URL.revokeObjectURL(u); }
        }
        return { cover: url, title: ep.title || null };
      }
    } catch (err) { console.warn('kapak', err); }
    return { cover: null, title: null };
  }

  // ---------- ana ayrıştırıcı ----------
  async function parse(blob, name) {
    const e = ext(name);
    const buf = await blob.arrayBuffer();
    const title = stripExt(name);
    if (e === 'pdf') {
      await loadLib('pdf');
      const pdf = await window.pdfjsLib.getDocument({ data: buf, standardFontDataUrl: PDF_FONTS, cMapUrl: PDF_CMAPS, cMapPacked: true }).promise;
      let lang = 'tr-TR';
      try {
        const p = await pdf.getPage(Math.min(pdf.numPages, 3));
        const tc = await p.getTextContent();
        lang = detectLang(tc.items.map((i) => i.str).join(' '));
      } catch (x) { /* metin yok */ }
      return { kind: 'pdf', pdf, title, lang };
    }
    let html = '', root = null, lang = '', urls = [], t = title;
    if (e === 'docx') {
      await loadLib('mammoth');
      const r = await window.mammoth.convertToHtml({ arrayBuffer: buf }, {
        styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Konu Başlığı'] => h1:fresh", "p[style-name='Başlık'] => h1:fresh"],
      });
      html = r.value;
    } else if (e === 'doc') {
      try { html = docToHtml(buf); }
      catch (err) { throw new Error('Bu .doc dosyası okunamadı (' + err.message + '). Word ile açıp .docx olarak kaydederseniz sorunsuz açılır.'); }
    } else if (e === 'epub') {
      const r = await epubToHtml(buf); root = r.root; lang = r.lang; urls = r.urls; if (r.title) t = r.title;
    } else if (e === 'odt') {
      html = await odtToHtml(buf);
    } else if (e === 'rtf') {
      html = rtfToHtml(buf);
    } else if (e === 'md' || e === 'markdown') {
      html = mdToHtml(decodeText(buf));
    } else if (e === 'html' || e === 'htm' || e === 'xhtml') {
      const doc = new DOMParser().parseFromString(decodeText(buf), 'text/html');
      const tt = doc.querySelector('title'); if (tt && tt.textContent.trim()) t = tt.textContent.trim();
      root = document.createElement('div');
      for (const c of [...doc.body.childNodes]) root.appendChild(document.importNode(c, true));
    } else {
      html = textToHtml(decodeText(buf));
    }
    if (!root) { root = document.createElement('div'); root.innerHTML = html; }
    const sample = root.textContent || '';
    if (!sample.trim() && !root.querySelector('img')) throw new Error('Dosyada okunabilir metin bulunamadı.');
    if (!lang) lang = detectLang(sample);
    if (lang.length === 2) lang = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR' }[lang] || lang;
    return { kind: 'flow', root, title: t, lang, urls };
  }

  window.Formats = { EXTS, ext, stripExt, parse, cover, loadLib, supported: (n) => EXTS.includes(ext(n)) };
})();
