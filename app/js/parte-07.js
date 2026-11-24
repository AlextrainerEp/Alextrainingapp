/* =====================================================================
 * Alex Training Lab · Módulo de CARGA (interfaz)
 * Requiere carga-core.js (window.ATLCarga). Sin dependencias.
 *   ATLCargaUI.panelEntrenador(el, { sesiones, atleta, semanas, hasta, metodoAC })
 *   ATLCargaUI.formularioRPE(el, { sesion, onGuardar })
 *   ATLCargaUI.planificador(el, { atletaId, fecha, onGuardar })
 *   ATLCargaUI.repositorioSupabase(supabaseClient)
 * ===================================================================== */
(function (global) {
  'use strict';
  const C = global.ATLCarga;
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- estilos (una sola vez) ----------
  const CSS = `
.atl-carga{color-scheme:light;--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;
--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);
--s-real:#2a78d6;--s-plan:#eb6834;--s-res:#1baf7a;--s-fza:#eda100;--band:rgba(42,120,214,.10);
--good:#0ca30c;--warn:#fab219;--serious:#ec835a;--crit:#d03b3b;--good-text:#006300;
font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .atl-carga{color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;--ink:#f0efec;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--s-real:#3987e5;--s-plan:#d95926;--s-res:#199e70;--s-fza:#c98500;--band:rgba(57,135,229,.16);--good-text:#0ca30c}}
:root[data-theme="dark"] .atl-carga{color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;--ink:#f0efec;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--s-real:#3987e5;--s-plan:#d95926;--s-res:#199e70;--s-fza:#c98500;--band:rgba(57,135,229,.16);--good-text:#0ca30c}
.atl-carga *{box-sizing:border-box}
.atl-carga h2{font-size:18px;margin:0 0 4px}.atl-carga h3{font-size:15px;margin:0 0 2px}
.atl-carga .sub{color:var(--ink2);font-size:13px;margin:0 0 12px}
.atl-carga .card{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:16px;margin-bottom:16px}
.atl-carga .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.atl-carga .kpi{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:12px 14px}
.atl-carga .kpi .l{font-size:12px;color:var(--ink2)}.atl-carga .kpi .v{font-size:24px;font-weight:600;margin-top:2px}
.atl-carga .kpi .d{font-size:12px;color:var(--muted)}
.atl-carga .alertas{list-style:none;margin:0;padding:0}
.atl-carga .alertas li{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--grid)}
.atl-carga .alertas li:first-child{border-top:0}
.atl-carga .chip{flex:none;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;color:#fff;white-space:nowrap}
.atl-carga .chip.alto{background:var(--crit)}.atl-carga .chip.medio{background:var(--warn);color:#0b0b0b}
.atl-carga .chip.info{background:var(--axis);color:var(--ink)}.atl-carga .chip.ok{background:var(--good)}
.atl-carga .legend{display:flex;gap:16px;font-size:12px;color:var(--ink2);margin:4px 0 6px}
.atl-carga .legend span{display:inline-flex;align-items:center;gap:6px}
.atl-carga .legend i{display:inline-block;width:10px;height:10px;border-radius:2px}
.atl-carga .legend i.line{height:2px;width:14px;border-radius:1px}
.atl-carga svg{display:block;width:100%;height:auto;overflow:visible}
.atl-carga svg text{font-size:11px;fill:var(--muted)}
.atl-carga .hit{fill:transparent;cursor:default}.atl-carga .hit:focus{outline:none}
.atl-carga .bar{transition:opacity .1s}.atl-carga .grp:hover .bar,.atl-carga .grp:focus-within .bar{opacity:.8}
.atl-carga .tip{position:fixed;pointer-events:none;z-index:50;background:var(--surface);color:var(--ink);border:1px solid var(--ring);
border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:none;min-width:150px}
.atl-carga .tip .t{color:var(--ink2);margin-bottom:4px}.atl-carga .tip .row{display:flex;align-items:center;gap:6px}
.atl-carga .tip .row b{font-weight:600}.atl-carga .tip .row i{width:10px;height:2px;display:inline-block}
.atl-carga .tip .row span{color:var(--ink2)}
.atl-carga table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.atl-carga th,.atl-carga td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--grid);white-space:nowrap}
.atl-carga th{color:var(--ink2);font-weight:500}.atl-carga th:first-child,.atl-carga td:first-child{text-align:left}
.atl-carga .tabla{overflow-x:auto}
.atl-carga .tabla-ses td:nth-child(2){white-space:normal;min-width:140px;text-align:left}.atl-carga .tabla-ses td:nth-child(3),.atl-carga .tabla-ses td:nth-child(7),.atl-carga .tabla-ses td:nth-child(10),.atl-carga .tabla-ses th:nth-child(2),.atl-carga .tabla-ses th:nth-child(3),.atl-carga .tabla-ses th:nth-child(7),.atl-carga .tabla-ses th:nth-child(10){text-align:left}
.atl-carga .warn{color:var(--crit);font-weight:600}
.atl-carga .row2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.atl-carga .row2 .card{margin-bottom:0}
.atl-carga .seg{display:inline-flex;border:1px solid var(--ring);border-radius:8px;overflow:hidden}
.atl-carga .seg button{border:0;background:transparent;color:var(--ink2);padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
.atl-carga .seg button[aria-pressed="true"]{background:var(--plane);color:var(--ink);font-weight:600}
.atl-carga .filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:0}
.atl-carga .nav-per{display:inline-flex;align-items:center;gap:6px}
.atl-carga .seg-b{border:1px solid var(--ring);background:var(--surface);color:var(--ink);border-radius:8px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer;min-width:34px}
.atl-carga .seg-b:disabled{opacity:.35;cursor:default}
.atl-carga .seg-b.hoy{font-weight:600}
.atl-carga .rango{font-size:12.5px;color:var(--ink2);white-space:nowrap;min-width:140px;text-align:center}
@media(max-width:600px){.atl-carga .nav-per{flex:1 0 100%;justify-content:space-between}.atl-carga .rango{min-width:0}}
.atl-carga .cab-carga .sub{margin-bottom:8px}
.atl-carga label{font-size:13px;color:var(--ink2)}
.atl-carga input,.atl-carga select,.atl-carga textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:8px;padding:6px 8px}
.atl-carga input[type=range]{width:100%;padding:0;accent-color:var(--s-real)}
.atl-carga .btn{font:inherit;font-weight:600;border:0;border-radius:8px;padding:9px 16px;background:var(--s-real);color:#fff;cursor:pointer}
.atl-carga .rpe-num{font-size:40px;font-weight:600;text-align:center}.atl-carga .rpe-txt{text-align:center;color:var(--ink2);margin-bottom:8px}
.atl-carga .zonas{display:grid;grid-template-columns:1fr 80px 50px;gap:6px 10px;align-items:center;font-size:13px}
.atl-carga .zonas .zn{color:var(--ink)}.atl-carga .zonas .zx{color:var(--muted);font-size:12px}
.atl-carga .total{display:flex;gap:20px;margin:12px 0;font-size:14px}.atl-carga .total b{font-size:20px}
`;
  function estilos() {
    if (document.getElementById('atl-carga-css')) return;
    const s = document.createElement('style'); s.id = 'atl-carga-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---------- helpers ----------
  const h = (tag, attrs = {}, ...hijos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
    }
    hijos.flat().forEach(x => x != null && e.append(x.nodeType ? x : document.createTextNode(String(x))));
    return e;
  };
  const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const fmt = (x, d = 0) => x == null ? '—' : Number(x).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtSem = iso => { const d = C.fecha.parse(iso); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', ''); };
  const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  // barra con esquinas superiores redondeadas (4px) y base recta
  const barPath = (x, y, w, hgt, r = 4) => { if (hgt <= 0) return ''; r = Math.min(r, hgt, w / 2);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`; };

  function crearTooltip(raiz) {
    const t = h('div', { class: 'tip', role: 'status' }); raiz.append(t);
    return {
      mostrar(ev, titulo, filas) {
        t.replaceChildren(h('div', { class: 't', text: titulo }),
          ...filas.map(f => h('div', { class: 'row' }, h('i', { style: `background:${f.color || 'var(--axis)'}` }), h('b', { text: f.valor }), h('span', { text: f.nombre }))));
        t.style.display = 'block';
        const r = ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
        const x = ev.clientX || (r.left + r.width / 2), y = ev.clientY || r.top;
        const w = t.offsetWidth; t.style.left = Math.min(Math.max(8, x + 12), innerWidth - w - 8) + 'px'; t.style.top = Math.max(8, y - t.offsetHeight - 12) + 'px';
      },
      ocultar() { t.style.display = 'none'; }
    };
  }

  // ---------- gráficas ----------
  const W = 640, H = 220, M = { t: 10, r: 8, b: 26, l: 44 };

  function ejes(svg, max, n, etiquetas, cada = 1) {
    const ih = H - M.t - M.b;
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, y = M.t + ih - ih * i / 4;
      svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: i ? 'var(--grid)' : 'var(--axis)', 'stroke-width': 1 }));
      const t = s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = fmt(v); svg.append(t);
    }
    const iw = (W - M.l - M.r) / n;
    etiquetas.forEach((e, i) => { if (i % cada) return; const t = s('text', { x: M.l + iw * i + iw / 2, y: H - 8, 'text-anchor': 'middle' }); t.textContent = e; svg.append(t); });
    return { ih, iw };
  }

  /** Barras agrupadas (series lado a lado) por semana. */
  function barrasAgrupadas(datos, series, tip, titulo) {
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': titulo });
    const max = niceMax(Math.max(1, ...datos.flatMap(d => series.map(x => d[x.key] || 0))));
    const { ih, iw } = ejes(svg, max, datos.length, datos.map(d => d.etiqueta || fmtSem(d.semana)), datos.length > 8 ? 2 : 1);
    const bw = Math.min(24, (iw * 0.7 - 2 * (series.length - 1)) / series.length);
    datos.forEach((d, i) => {
      const g = s('g', { class: 'grp' });
      const x0 = M.l + iw * i + (iw - (bw * series.length + 2 * (series.length - 1))) / 2;
      series.forEach((se, k) => {
        const v = d[se.key] || 0, bh = ih * v / max;
        g.append(s('path', { class: 'bar', d: barPath(x0 + k * (bw + 2), M.t + ih - bh, bw, bh), fill: se.color }));
      });
      const hit = s('rect', { class: 'hit', x: M.l + iw * i, y: M.t, width: iw, height: ih, tabindex: 0 });
      const show = ev => tip.mostrar(ev, d.unidad && d.unidad !== 'semana' ? d.etiqueta : `Semana del ${fmtSem(d.semana)}`, series.map(se => ({ color: se.color, valor: fmt(d[se.key]), nombre: se.label })));
      hit.addEventListener('pointermove', show); hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', tip.ocultar); hit.addEventListener('blur', tip.ocultar);
      g.append(hit); svg.append(g);
    });
    return svg;
  }

  /** Barras apiladas por semana. */
  function barrasApiladas(datos, series, tip, titulo) {
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': titulo });
    const max = niceMax(Math.max(1, ...datos.map(d => series.reduce((a, x) => a + (d[x.key] || 0), 0))));
    const { ih, iw } = ejes(svg, max, datos.length, datos.map(d => d.etiqueta || fmtSem(d.semana)), datos.length > 8 ? 2 : 1);
    const bw = Math.min(24, iw * 0.6);
    datos.forEach((d, i) => {
      const g = s('g', { class: 'grp' }); const x = M.l + iw * i + (iw - bw) / 2;
      let acc = 0; const vis = series.filter(se => (d[se.key] || 0) > 0);
      vis.forEach((se, k) => {
        const v = d[se.key], bh = ih * v / max, y = M.t + ih - ih * (acc + v) / max;
        const top = k === vis.length - 1;
        const hh = Math.max(0, bh - (k > 0 ? 2 : 0)); // 2px de separación entre segmentos
        g.append(s(top ? 'path' : 'rect', top ? { class: 'bar', d: barPath(x, y, bw, hh), fill: se.color } : { class: 'bar', x, y, width: bw, height: hh, fill: se.color }));
        acc += v;
      });
      const hit = s('rect', { class: 'hit', x: M.l + iw * i, y: M.t, width: iw, height: ih, tabindex: 0 });
      const show = ev => tip.mostrar(ev, d.unidad && d.unidad !== 'semana' ? d.etiqueta : `Semana del ${fmtSem(d.semana)}`, [
        ...series.map(se => ({ color: se.color, valor: fmt(d[se.key]), nombre: se.label })),
        { valor: fmt(series.reduce((a, se) => a + (d[se.key] || 0), 0)), nombre: 'Total' }]);
      hit.addEventListener('pointermove', show); hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', tip.ocultar); hit.addEventListener('blur', tip.ocultar);
      g.append(hit); svg.append(g);
    });
    return svg;
  }

  /** Línea del ratio agudo:crónico con la franja 0,8–1,3 sombreada. */
  function lineaRatio(datos, tip, u = C.UMBRALES) {
    const W = 1000, H = 240;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Ratio agudo:crónico diario' });
    const vals = datos.map(d => d.ratio).filter(v => v != null);
    const max = Math.max(2, Math.ceil(Math.max(0, ...vals) * 2) / 2);
    const ih = H - M.t - M.b, iw = W - M.l - M.r, n = datos.length;
    const X = i => M.l + (n > 1 ? iw * i / (n - 1) : iw / 2), Y = v => M.t + ih - ih * v / max;
    svg.append(s('rect', { x: M.l, y: Y(u.acMax), width: iw, height: Y(u.acMin) - Y(u.acMax), fill: 'var(--band)' }));
    for (let v = 0; v <= max + 1e-9; v += 0.5) {
      svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: v ? 'var(--grid)' : 'var(--axis)' }));
      const t = s('text', { x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = fmt(v, 1); svg.append(t);
    }
    const paso = Math.ceil(n / 8);
    datos.forEach((d, i) => { if (i % paso) return; const t = s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }); t.textContent = fmtSem(d.fecha); svg.append(t); });
    let dstr = '', on = false;
    datos.forEach((d, i) => { if (d.ratio == null) { on = false; return; } dstr += (on ? 'L' : 'M') + X(i) + ',' + Y(Math.min(d.ratio, max)); on = true; });
    svg.append(s('path', { d: dstr, fill: 'none', stroke: 'var(--s-real)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const ult = [...datos.keys()].reverse().find(i => datos[i].ratio != null);
    if (ult != null) {
      svg.append(s('circle', { cx: X(ult), cy: Y(Math.min(datos[ult].ratio, max)), r: 4, fill: 'var(--s-real)', stroke: 'var(--surface)', 'stroke-width': 2 }));
      const t = s('text', { x: X(ult) - 6, y: Y(Math.min(datos[ult].ratio, max)) - 8, 'text-anchor': 'end', style: 'fill:var(--ink);font-weight:600' }); t.textContent = fmt(datos[ult].ratio, 2); svg.append(t);
    }
    const cross = s('line', { y1: M.t, y2: M.t + ih, stroke: 'var(--axis)', visibility: 'hidden' }); svg.append(cross);
    const dot = s('circle', { r: 4, fill: 'var(--s-real)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }); svg.append(dot);
    const hit = s('rect', { class: 'hit', x: M.l, y: M.t, width: iw, height: ih, tabindex: 0 });
    const show = (ev, iForzado) => {
      let i = iForzado;
      if (i == null) { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); i = Math.round((p.x - M.l) / iw * (n - 1)); }
      i = Math.max(0, Math.min(n - 1, i)); const d = datos[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      if (d.ratio != null) { dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(Math.min(d.ratio, max))); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
      tip.mostrar(ev, C.fecha.parse(d.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }), [
        { color: 'var(--s-real)', valor: fmt(d.ratio, 2), nombre: 'Ratio agudo:crónico' },
        { valor: fmt(d.aguda), nombre: 'Carga aguda (sRPE)' }, { valor: fmt(d.cronica), nombre: 'Carga crónica (sRPE)' }]);
    };
    hit.addEventListener('pointermove', e => show(e)); hit.addEventListener('focus', e => show(e, ult));
    const hide = () => { tip.ocultar(); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
    hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
    svg.append(hit);
    return svg;
  }

  const leyenda = items => h('div', { class: 'legend' }, items.map(it => h('span', {}, h('i', { class: it.linea ? 'line' : '', style: `background:${it.color}` }), it.label)));

  // ---------- PANEL DEL ENTRENADOR ----------
  function panelEntrenador(el, opts) {
    estilos();
    const estado = Object.assign({ unidad: 'semana', n: null, desplaz: 0, hasta: C.fecha.hoyISO(), metodoAC: 'ewma' }, opts);
    const hoy = estado.hasta;
    const raiz = h('div', { class: 'atl-carga' }); el.replaceChildren(raiz);
    const tip = crearTooltip(raiz);

    function pintar() {
      const sesiones = estado.sesiones.map(C.normalizarSesion);
      const U = estado.unidad, uNom = C.PERIODOS[U].nombre.toLowerCase();
      const cuantos = estado.n || C.PERIODOS[U].porDefecto;
      // «hasta» se mueve con las flechas: 0 = hasta hoy
      const finVista = estado.desplaz === 0 ? hoy
        : C.fecha.finPeriodo(U, C.fecha.moverPeriodo(U, C.fecha.inicioPeriodo(U, hoy), -estado.desplaz));
      const sem = C.resumenPeriodo(sesiones, { unidad: U, n: cuantos, hasta: finVista });
      const desde = C.fecha.sumarDias(sem[0].semana, -56); // historial extra para la carga crónica
      const finDatos = sem[sem.length - 1].fin > finVista ? finVista : sem[sem.length - 1].fin;
      const diario = C.serieDiaria(sesiones, desde, finDatos, 'srpe');
      const ac = C.agudoCronico(diario, { metodo: estado.metodoAC });
      const ff = C.formaFatiga(diario);
      // el ratio agudo:crónico es diario: se muestran siempre las últimas 16 semanas de la vista
      const iniAC = C.fecha.sumarDias(finDatos, -111);
      const acVis = ac.filter(d => d.fecha >= iniAC);
      const act = sem[sem.length - 1], ant = sem[sem.length - 2] || {};
      const ref = act.enCurso && sem.length > 1 ? ant : act; // último periodo completo
      const ultAC = [...ac].reverse().find(d => d.ratio != null);
      const ultFF = ff[ff.length - 1];
      // los avisos se calculan siempre por semana, aunque se esté mirando por mes o por año
      const semAvisos = U === 'semana' ? sem : C.resumenSemanal(sesiones, { semanas: 12, hasta: finVista });
      const alertas = C.alertas(semAvisos, ac);

      const rangoTxt = `${C.fecha.parse(sem[0].semana).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })} – ${C.fecha.parse(finDatos).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}`;
      const filtros = h('div', { class: 'filtros' },
        h('label', { text: 'Ver por' }),
        h('div', { class: 'seg' }, Object.entries(C.PERIODOS).map(([k, p]) => h('button', { 'aria-pressed': String(U === k), text: p.nombre, onclick: () => { estado.unidad = k; estado.n = null; estado.desplaz = 0; pintar(); } }))),
        h('div', { class: 'nav-per' },
          h('button', { class: 'seg-b', title: `${C.PERIODOS[U].nombre} anterior`, 'aria-label': `${C.PERIODOS[U].nombre} anterior`, text: '‹', onclick: () => { estado.desplaz++; pintar(); } }),
          h('span', { class: 'rango', text: rangoTxt }),
          h('button', { class: 'seg-b', title: `${C.PERIODOS[U].nombre} siguiente`, 'aria-label': `${C.PERIODOS[U].nombre} siguiente`, text: '›', disabled: estado.desplaz === 0 ? '' : null, onclick: () => { estado.desplaz = Math.max(0, estado.desplaz - 1); pintar(); } }),
          estado.desplaz ? h('button', { class: 'seg-b hoy', text: 'Hoy', onclick: () => { estado.desplaz = 0; pintar(); } }) : null),
        h('label', { text: 'Cuántos' }),
        h('div', { class: 'seg' }, (U === 'semana' ? [6, 12, 24] : U === 'mes' ? [6, 12, 24] : U === 'semestre' ? [4, 6, 10] : [3, 5, 10])
          .map(k => h('button', { 'aria-pressed': String(cuantos === k), text: String(k), onclick: () => { estado.n = k; pintar(); } }))),
        h('label', { text: 'Ratio A:C' }),
        h('div', { class: 'seg' }, [['ewma', 'EWMA'], ['media', 'Media móvil']].map(([k, t]) => h('button', { 'aria-pressed': String(estado.metodoAC === k), text: t, onclick: () => { estado.metodoAC = k; pintar(); } }))));

      const kpi = (l, v, d) => h('div', { class: 'kpi' }, h('div', { class: 'l', text: l }), h('div', { class: 'v', text: v }), h('div', { class: 'd', text: d }));
      const kpis = h('div', { class: 'kpis' },
        kpi(`ECOs · ${act.etiqueta}`, fmt(act.ecosReal), act.ecosPlan ? `de ${fmt(act.ecosPlan)} planificados${act.cumplimiento != null ? ` · ${fmt(act.cumplimiento * 100)} % de lo previsto` : ''}` : 'sin planificación'),
        kpi(`sRPE · ${act.etiqueta}`, fmt(act.srpe) + ' UA', ant.srpe != null ? `${uNom} anterior ${fmt(ant.srpe)} UA` : ''),
        kpi('Ratio agudo:crónico', ultAC ? fmt(ultAC.ratio, 2) : '—', `orientativo ${fmt(C.UMBRALES.acMin, 1)}–${fmt(C.UMBRALES.acMax, 1)}`),
        kpi(`Monotonía · ${ref.etiqueta}`, fmt(ref.monotonia, 2), `strain ${fmt(ref.strain)} · aviso > ${fmt(C.UMBRALES.monotoniaMax, 1)}` + (U === 'semana' ? '' : ' (media de sus semanas)')),
        kpi(`Coste percibido · ${ref.etiqueta}`, ref.coste != null ? fmt(ref.coste, 2) : '—', 'UA de sRPE por cada ECO'),
        kpi('Balance forma-fatiga', fmt(ultFF && ultFF.balance), `forma ${fmt(ultFF && ultFF.forma)} · fatiga ${fmt(ultFF && ultFF.fatiga)}`));

      // aviso de bienestar: si la media baja y la carga sube
      const bsem = estado.bienestar || [];
      const bAct = bsem.find(b => b.semana === ref.semana), bPrev = bsem.filter(b => b.semana < ref.semana).slice(-4);
      if (bAct && bAct.global != null && bPrev.length >= 2) {
        const m = bPrev.reduce((a, b) => a + (b.global || 0), 0) / bPrev.length;
        if (m && bAct.global < m - 0.5) alertas.unshift({ nivel: 'medio', texto: `Dice sentirse peor que de costumbre (${fmt(bAct.global, 1)} sobre 5 frente a ${fmt(m, 1)} de media). Si la carga va alta, conviene aflojar.` });
      }
      const sAlert = h('div', { class: 'card' }, h('h3', { text: 'Avisos de la última semana' }), h('p', { class: 'sub', text: 'Para decidir si subir, mantener o bajar la carga.' }),
        h('ul', { class: 'alertas' }, alertas.map(a => h('li', {}, h('span', { class: 'chip ' + a.nivel, text: { alto: 'Alto', medio: 'Atención', info: 'Info', ok: 'OK' }[a.nivel] }), h('span', { text: a.texto })))));

      const serECO = [{ key: 'ecosPlan', label: 'Planificado', color: 'var(--s-plan)' }, { key: 'ecosReal', label: 'Realizado', color: 'var(--s-real)' }];
      const serSRPE = [{ key: 'srpeRes', label: 'Resistencia', color: 'var(--s-res)' }, { key: 'srpeFuerza', label: 'Fuerza', color: 'var(--s-fza)' }];
      const semS = sem.map(w => Object.assign({}, w, { srpeRes: Math.max(0, (w.srpe || 0) - (w.srpeFuerza || 0)) }));

      const g1 = h('div', { class: 'card' }, h('h3', { text: `Carga objetiva (ECOs) por ${uNom}` }), h('p', { class: 'sub', text: 'Lo que planificas frente a lo que ha hecho.' }),
        leyenda(serECO), barrasAgrupadas(sem, serECO, tip, 'ECOs planificados y realizados por semana'));
      const g2 = h('div', { class: 'card' }, h('h3', { text: `Carga interna (sRPE) por ${uNom}` }), h('p', { class: 'sub', text: 'Minutos × RPE, sumando carrera y fuerza.' }),
        leyenda(serSRPE), barrasApiladas(semS, serSRPE, tip, 'sRPE semanal de resistencia y fuerza'));
      const g3 = h('div', { class: 'card' }, h('h3', { text: 'Ratio agudo:crónico (sRPE)' }),
        h('p', { class: 'sub', text: 'Últimas 16 semanas del periodo que estás viendo: carga de los 7 días anteriores frente a la de las 4 semanas anteriores. Franja sombreada: zona orientativa 0,8–1,3. Sirve para detectar picos bruscos, no predice lesiones.' }),
        lineaRatio(acVis, tip));

      const cols = [[C.PERIODOS[U].nombre, w => (w.etiqueta || fmtSem(w.semana)) + (w.enCurso ? ' (en curso)' : '')], ['Hechas/plan.', w => `${w.sesiones}${w.sesionesPlan ? '/' + w.sesionesPlan : ''}`], ['Min', w => fmt(w.minutos)], ['Km', w => fmt(w.km, 1)],
        ['D+ (m)', w => fmt(w.desnivel)], ['ECOs plan', w => fmt(w.ecosPlan)], ['ECOs real', w => fmt(w.ecosReal)], ['Cumpl.', w => w.cumplimiento == null ? '—' : fmt(w.cumplimiento * 100) + ' %'],
        ['sRPE', w => fmt(w.srpe)], ['Var.', w => w.variacion == null ? '—' : (w.variacion > 0 ? '+' : '') + fmt(w.variacion * 100) + ' %'],
        ['Monot.', w => fmt(w.monotonia, 2)], ['Strain', w => fmt(w.strain)], ['sRPE/ECO', w => fmt(w.coste, 2)]];
      const bienPorSem = {}; (estado.bienestar || []).forEach(b => bienPorSem[b.semana] = b);
      if (estado.bienestar && estado.bienestar.length) cols.push(
        ['Sueño', w => fmt((bienPorSem[w.semana] || {}).sueno, 1)],
        ['Energía', w => fmt((bienPorSem[w.semana] || {}).fatiga, 1)],
        ['Dolor', w => fmt((bienPorSem[w.semana] || {}).dolor, 1)],
        ['Ánimo', w => fmt((bienPorSem[w.semana] || {}).animo, 1)]);
      const tabla = h('div', { class: 'card' }, h('h3', { text: `Tabla por ${uNom}` }), h('div', { class: 'tabla' }, h('table', {},
        h('thead', {}, h('tr', {}, cols.map(c => h('th', { text: c[0] })))),
        h('tbody', {}, [...sem].reverse().map(w => h('tr', {}, cols.map(([n, f]) => {
          const td = h('td', { text: f(w) });
          if ((n === 'Var.' && w.sobreMax4 > C.UMBRALES.subidaSemanalMax) || (n === 'Monot.' && w.monotonia > C.UMBRALES.monotoniaMax)) td.className = 'warn';
          return td;
        })))))));

      let detalle = null;
      if (estado.detalle) {
        const reales = sesiones.filter(x => x.estado === 'realizada' && x.fecha >= sem[0].semana && x.fecha <= finDatos)
          .sort((a, b) => a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
        const dep = d => (C.DEPORTES[d] || {}).nombre || d;
        const colsD = [['Fecha', x => C.fecha.parse(x.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })],
          ['Sesión', x => x.titulo || '—'], ['Tipo', x => dep(x.deporte)], ['Min', x => fmt(x.duracion_min)], ['Km', x => x.distancia_km ? fmt(x.distancia_km, 1) : '—'],
          ['ECOs', x => x.deporte === 'fuerza' ? 'n/a' : fmt(x.ecos)], ['Cálculo ECOs', x => x.deporte === 'fuerza' ? 'solo sRPE' : (x.metodo_ecos || 'faltan datos')],
          ['RPE', x => x.rpe == null ? 'falta' : fmt(x.rpe)], ['sRPE', x => x.srpe == null ? '—' : fmt(x.srpe)], ['Fuente', x => x.fuente || '']];
        detalle = h('div', { class: 'card' }, h('h3', { text: 'Sesiones realizadas' }),
          h('p', { class: 'sub', text: 'Carga de cada sesión del periodo. «falta» = el atleta no ha puesto el RPE, así que no suma sRPE.' }),
          h('div', { class: 'tabla' }, h('table', { class: 'tabla-ses' },
            h('thead', {}, h('tr', {}, colsD.map(c => h('th', { text: c[0] })))),
            h('tbody', {}, reales.map(x => h('tr', {}, colsD.map(([n, f]) => {
              const v = f(x), td = h('td', { text: v });
              if ((n === 'RPE' && v === 'falta') || (n === 'Cálculo ECOs' && v === 'faltan datos')) td.className = 'warn';
              return td;
            })))))));
      }
      const cabecera = h('div', { class: 'card cab-carga' },
        h('h2', { text: `Control de carga${estado.atleta ? ' · ' + estado.atleta : ''}` }),
        h('p', { class: 'sub', text: 'ECOs = carga objetiva (minutos × valor de zona × deporte). sRPE = carga interna (minutos × RPE 0–10). Fuerza solo con sRPE.' }),
        estado.nota ? h('p', { class: 'sub nota-datos', text: estado.nota }) : null,
        filtros);
      raiz.replaceChildren(...[
        cabecera, kpis, sAlert, h('div', { class: 'row2' }, g1, g2), h('div', { style: 'height:16px' }), g3, tabla, detalle, tipEl].filter(Boolean));
      tip.ocultar();
    }
    const tipEl = raiz.querySelector('.tip');
    pintar();
    return { actualizar(nuevas) { if (nuevas) estado.sesiones = nuevas; pintar(); } };
  }


  // ---------- PANEL DE FUERZA (por RPE / RIR, sin encoder) ----------
  function panelFuerza(el, opts) {
    estilos();
    const FZ = global.ATLFuerza;
    const estado = Object.assign({ unidad: 'semana', n: null, desplaz: 0, hasta: C.fecha.hoyISO() }, opts);
    const hoy = estado.hasta;
    const raiz = h('div', { class: 'atl-carga' }); el.replaceChildren(raiz);
    const tip = crearTooltip(raiz); const tipEl = raiz.querySelector('.tip');
    function pintar() {
      const an = estado.sesiones; // analizadas (ATLFuerza.analizarSesion) con fecha ISO
      const U = estado.unidad, uNom = C.PERIODOS[U].nombre.toLowerCase();
      const cuantos = estado.n || C.PERIODOS[U].porDefecto;
      const finVista = estado.desplaz === 0 ? hoy
        : C.fecha.finPeriodo(U, C.fecha.moverPeriodo(U, C.fecha.inicioPeriodo(U, hoy), -estado.desplaz));
      const sem = FZ.resumenSemanal(an, { unidad: U, n: cuantos, hasta: finVista, fecha: C.fecha });
      const n = sem.length, cur = sem[n - 1], ref = cur.enCurso && n > 1 ? sem[n - 2] : cur;
      const al = FZ.alertas(U === 'semana' ? sem : FZ.resumenSemanal(an, { semanas: 12, hasta: finVista, fecha: C.fecha }));
      const finDatos = cur.fin > finVista ? finVista : cur.fin;
      const rangoTxt = `${C.fecha.parse(sem[0].semana).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })} – ${C.fecha.parse(finDatos).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}`;
      const kpi = (l, v, d) => h('div', { class: 'kpi' }, h('div', { class: 'l', text: l }), h('div', { class: 'v', text: v }), h('div', { class: 'd', text: d }));
      const cab = h('div', { class: 'card cab-carga' },
        h('h2', { text: `Carga de fuerza${estado.atleta ? ' · ' + estado.atleta : ''}` }),
        h('p', { class: 'sub', text: 'Sin encoder: sRPE de la sesión (min × RPE total) y, por ejercicio, series duras (RIR ≤ 4), carácter del esfuerzo (reps / (reps + RIR)) y desviación del RIR respecto al objetivo.' }),
        estado.nota ? h('p', { class: 'sub nota-datos', text: estado.nota }) : null,
        h('div', { class: 'filtros' }, h('label', { text: 'Ver por' }),
          h('div', { class: 'seg' }, Object.entries(C.PERIODOS).map(([k, p]) => h('button', { 'aria-pressed': String(U === k), text: p.nombre, onclick: () => { estado.unidad = k; estado.n = null; estado.desplaz = 0; pintar(); } }))),
          h('div', { class: 'nav-per' },
            h('button', { class: 'seg-b', title: `${C.PERIODOS[U].nombre} anterior`, 'aria-label': `${C.PERIODOS[U].nombre} anterior`, text: '‹', onclick: () => { estado.desplaz++; pintar(); } }),
            h('span', { class: 'rango', text: rangoTxt }),
            h('button', { class: 'seg-b', title: `${C.PERIODOS[U].nombre} siguiente`, 'aria-label': `${C.PERIODOS[U].nombre} siguiente`, text: '›', disabled: estado.desplaz === 0 ? '' : null, onclick: () => { estado.desplaz = Math.max(0, estado.desplaz - 1); pintar(); } }),
            estado.desplaz ? h('button', { class: 'seg-b hoy', text: 'Hoy', onclick: () => { estado.desplaz = 0; pintar(); } }) : null),
          h('label', { text: 'Cuántos' }),
          h('div', { class: 'seg' }, (U === 'semana' ? [6, 12, 24] : U === 'mes' ? [6, 12, 24] : U === 'semestre' ? [4, 6, 10] : [3, 5, 10])
            .map(k => h('button', { 'aria-pressed': String(cuantos === k), text: String(k), onclick: () => { estado.n = k; pintar(); } })))));
      const kpis = h('div', { class: 'kpis' },
        kpi(`sRPE fuerza · ${cur.etiqueta}`, fmt(cur.srpe) + ' UA', `${cur.sesiones} sesión(es) · ${uNom} anterior ${fmt((sem[n - 2] || {}).srpe)} UA`),
        kpi(`Series duras · ${ref.etiqueta}`, fmt(ref.seriesDuras), ref.seriesDurasPlan ? `de ${fmt(ref.seriesDurasPlan)} previstas · RIR ≤ ${FZ.RIR_DURA}` : `RIR ≤ ${FZ.RIR_DURA}`),
        kpi(`RIR medio · ${ref.etiqueta}`, fmt(ref.rirMedio, 1), 'repeticiones que le quedaban'),
        kpi('Desviación de RIR', ref.desvRIR == null ? '—' : (ref.desvRIR > 0 ? '+' : '') + fmt(ref.desvRIR, 1), '+ = más duro de lo previsto'),
        kpi('Carácter del esfuerzo', ref.ce == null ? '—' : fmt(ref.ce * 100) + ' %', 'reps hechas / reps posibles'),
        kpi(`Tonelaje · ${ref.etiqueta}`, ref.tonelaje ? fmt(ref.tonelaje) + ' kg' : '—', 'kg × repeticiones'));
      const sAl = h('div', { class: 'card' }, h('h3', { text: 'Avisos de fuerza' }),
        h('ul', { class: 'alertas' }, al.map(a => h('li', {}, h('span', { class: 'chip ' + a.nivel, text: { alto: 'Alto', medio: 'Atención', info: 'Info', ok: 'OK' }[a.nivel] }), h('span', { text: a.texto })))));
      const serS = [{ key: 'seriesDurasPlan', label: 'Previstas', color: 'var(--s-plan)' }, { key: 'seriesDuras', label: 'Hechas', color: 'var(--s-real)' }];
      const g1 = h('div', { class: 'card' }, h('h3', { text: `Series duras por ${uNom}` }), h('p', { class: 'sub', text: `Series a ${FZ.RIR_DURA} repeticiones o menos del fallo (sin calentamiento).` }),
        leyenda(serS), barrasAgrupadas(sem, serS, tip, `Series duras previstas y hechas por ${uNom}`));
      const serR = [{ key: 'srpe', label: 'sRPE fuerza', color: 'var(--s-fza)' }];
      const g2 = h('div', { class: 'card' }, h('h3', { text: `sRPE de fuerza por ${uNom}` }), h('p', { class: 'sub', text: 'Minutos × RPE total del entrenamiento.' }),
        barrasAgrupadas(sem, serR, tip, `sRPE de fuerza por ${uNom}`));
      // tabla por patrón (últimas 6 semanas)
      const ult = sem.slice(-6);
      const usados = FZ.PATRONES.filter(p => ult.some(w => w.porPatron[p] > 0) || FZ.PRIORITARIOS.includes(p));
      const tPat = h('div', { class: 'card' }, h('h3', { text: 'Series duras por patrón de movimiento' }),
        h('p', { class: 'sub', text: `Últimos 6 periodos de los que estás viendo. En rojo, patrones prioritarios para el corredor sin series duras en ese ${uNom}.` }),
        h('div', { class: 'tabla' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', { text: 'Patrón' }), ult.map(w => h('th', { text: (w.etiqueta || fmtSem(w.semana)) + (w.enCurso ? '*' : '') })))),
          h('tbody', {}, usados.map(p => h('tr', {}, h('td', { text: p }), ult.map(w => {
            const v = w.porPatron[p] || 0, td = h('td', { text: v ? fmt(v) : '—' });
            if (!v && FZ.PRIORITARIOS.includes(p) && w.sesiones && !w.enCurso) td.className = 'warn';
            return td;
          })))))));
      // tabla de sesiones
      const reales = an.filter(x => x.fecha >= sem[0].semana && x.fecha <= finDatos).sort((a, b) => a.fecha < b.fecha ? 1 : -1);
      const cols = [['Fecha', x => C.fecha.parse(x.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })], ['Sesión', x => x.titulo],
        ['Min', x => x.min == null ? 'falta' : fmt(x.min)], ['RPE', x => x.rpe == null ? 'falta' : fmt(x.rpe, x.rpe % 1 ? 1 : 0)], ['sRPE', x => fmt(x.srpe)],
        ['Series', x => fmt(x.series)], ['Duras', x => `${fmt(x.seriesDuras)}${x.seriesDurasPlan ? '/' + fmt(x.seriesDurasPlan) : ''}`], ['Reps', x => fmt(x.reps)], ['Tonelaje', x => x.tonelaje ? fmt(x.tonelaje) + ' kg' : '—'],
        ['RIR medio', x => fmt(x.rirMedio, 1)], ['Desv. RIR', x => x.desvRIR == null ? '—' : (x.desvRIR > 0 ? '+' : '') + fmt(x.desvRIR, 1)], ['C. esfuerzo', x => x.ce == null ? '—' : fmt(x.ce * 100) + ' %']];
      const tSes = h('div', { class: 'card' }, h('h3', { text: 'Sesiones de fuerza realizadas' }),
        h('p', { class: 'sub', text: '«falta» = el entrenado no lo ha apuntado. Duras: hechas / previstas.' }),
        h('div', { class: 'tabla' }, h('table', { class: 'tabla-ses' },
          h('thead', {}, h('tr', {}, cols.map(c => h('th', { text: c[0] })))),
          h('tbody', {}, reales.map(x => h('tr', {}, cols.map(([nn, f]) => { const v = f(x), td = h('td', { text: v });
            if (v === 'falta' || (nn === 'Desv. RIR' && x.desvRIR >= 1)) td.className = 'warn'; return td; })))))));
      // progresión del 1RM estimado por ejercicio
      const prog = FZ.progresion1RM(an, { fecha: C.fecha, semanas: estado.semanas, hasta: estado.hasta });
      let tRM = null;
      if (prog.length) {
        const colsR = [['Ejercicio', x => x.nombre], ['Patrón', x => x.patron],
          ['1.ª vez', x => fmt(x.valorPrimera, 1) + ' kg'], ['Última', x => fmt(x.valorUltima, 1) + ' kg'],
          ['Cambio', x => x.cambio == null ? '—' : (x.cambio > 0 ? '+' : '') + fmt(x.cambio, 1) + ' %'], ['Semanas', x => fmt(x.n)]];
        tRM = h('div', { class: 'card' }, h('h3', { text: 'Fuerza estimada por ejercicio (1RM)' }),
          h('p', { class: 'sub', text: 'Estimación con la fórmula de Epley ajustada por el RIR, a partir de los kg que apunta el entrenado. Solo sale cuando quedan 12 repeticiones o menos para el fallo.' }),
          h('div', { class: 'tabla' }, h('table', { class: 'tabla-ses' },
            h('thead', {}, h('tr', {}, colsR.map(c => h('th', { text: c[0] })))),
            h('tbody', {}, prog.map(x => h('tr', {}, colsR.map(([nn, f]) => {
              const td = h('td', { text: f(x) });
              if (nn === 'Cambio' && x.cambio != null) td.style.color = x.cambio >= 0 ? 'var(--good-text)' : 'var(--crit)';
              return td;
            })))))));
      }
      raiz.replaceChildren(...[cab, kpis, sAl, h('div', { class: 'row2' }, g1, g2), h('div', { style: 'height:16px' }), tPat, tRM, tSes, tipEl].filter(Boolean));
      tip.ocultar();
    }
    pintar();
    return { actualizar(n) { if (n) estado.sesiones = n; pintar(); } };
  }

  // ---------- FORMULARIO RPE (atleta, tras la sesión) ----------
  function formularioRPE(el, { sesion = {}, onGuardar } = {}) {
    estilos();
    let rpe = sesion.rpe != null ? Number(sesion.rpe) : 5;
    const num = h('div', { class: 'rpe-num' }), txt = h('div', { class: 'rpe-txt' });
    const dur = h('input', { type: 'number', min: 0, step: 1, value: sesion.duracion_min || '', style: 'width:100px' });
    const res = h('div', { class: 'sub' });
    const etiqueta = v => (C.ESCALA_RPE.slice().reverse().find(([n, t]) => n <= v && t) || [0, ''])[1];
    const upd = () => { num.textContent = rpe; txt.textContent = etiqueta(rpe); const sr = C.calcularSRPE(dur.value, rpe); res.textContent = sr != null && dur.value ? `Carga de la sesión: ${fmt(sr)} UA` : ''; };
    const rango = h('input', { type: 'range', min: 0, max: 10, step: 1, value: rpe, 'aria-label': 'Esfuerzo percibido de 0 a 10', oninput: e => { rpe = Number(e.target.value); upd(); } });
    dur.addEventListener('input', upd);
    const card = h('div', { class: 'atl-carga' }, h('div', { class: 'card' },
      h('h3', { text: '¿Cómo de dura ha sido la sesión en conjunto?' }),
      h('p', { class: 'sub', text: 'Contesta unos 30 minutos después de terminar, pensando en toda la sesión, no solo en el final.' }),
      num, txt, rango,
      h('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin:2px 0 12px' }, h('span', { text: '0 Reposo' }), h('span', { text: '5 Duro' }), h('span', { text: '10 Máximo' })),
      h('label', {}, 'Duración (min) ', dur), res,
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', text: 'Guardar', onclick: () => onGuardar && onGuardar(C.normalizarSesion(Object.assign({}, sesion, { rpe, duracion_min: Number(dur.value) || 0, estado: 'realizada' }))) }))));
    el.replaceChildren(card); upd();
  }

  // ---------- PLANIFICADOR DE SESIÓN (entrenador) ----------
  function planificador(el, { atletaId, fecha = C.fecha.hoyISO(), sesion = {}, onGuardar } = {}) {
    estilos();
    const mz = Object.assign({}, sesion.minutos_zona || {});
    const dep = h('select', {}, Object.entries(C.DEPORTES).map(([k, d]) => h('option', { value: k, text: d.nombre })));
    dep.value = sesion.deporte || 'carrera';
    const f = h('input', { type: 'date', value: sesion.fecha || fecha });
    const tit = h('input', { type: 'text', placeholder: 'p. ej. 5 × 4\' a ritmo 10K', value: sesion.titulo || '', style: 'flex:1;min-width:200px' });
    const durF = h('input', { type: 'number', min: 0, value: sesion.duracion_min || '', style: 'width:90px' });
    const tot = h('div', { class: 'total' });
    const zonas = h('div', { class: 'zonas' });
    const upd = () => {
      const fuerza = C.DEPORTES[dep.value].coef == null;
      zonas.style.display = fuerza ? 'none' : ''; durF.parentElement.style.display = fuerza ? '' : 'none';
      const min = fuerza ? Number(durF.value) || 0 : C.minutosTotales(mz);
      const ecos = fuerza ? null : C.calcularECOs(mz, dep.value);
      tot.replaceChildren(h('span', {}, 'Duración ', h('b', { text: fmt(min) }), ' min'), h('span', {}, 'ECOs ', h('b', { text: fuerza ? '—' : fmt(ecos) })),
        fuerza ? h('span', { class: 'sub', text: 'La fuerza se controla con sRPE (min × RPE) al registrarla.' }) : '');
    };
    C.ZONAS.forEach(z => {
      const inp = h('input', { type: 'number', min: 0, step: 1, value: mz[z.id] || '', 'aria-label': `Minutos en ${z.nombre}`, oninput: e => { mz[z.id] = Number(e.target.value) || 0; upd(); } });
      zonas.append(h('div', {}, h('div', { class: 'zn', text: `${z.corto} · ${z.nombre}` }), h('div', { class: 'zx', text: z.ejemplo })), inp, h('div', { class: 'zx', text: `× ${z.valor}` }));
    });
    dep.addEventListener('change', upd); durF.addEventListener('input', upd);
    el.replaceChildren(h('div', { class: 'atl-carga' }, h('div', { class: 'card' },
      h('h3', { text: 'Planificar sesión' }),
      h('div', { class: 'filtros' }, f, dep, tit),
      h('label', {}, 'Duración (min) ', durF),
      h('p', { class: 'sub', text: 'Minutos en cada zona (incluye calentamiento, recuperaciones y vuelta a la calma).' }), zonas, tot,
      h('button', { class: 'btn', text: 'Guardar en el plan', onclick: () => {
        const fuerza = C.DEPORTES[dep.value].coef == null;
        onGuardar && onGuardar(C.normalizarSesion({ id: sesion.id, atleta_id: atletaId, fecha: f.value, estado: 'planificada', origen: 'plan', deporte: dep.value, titulo: tit.value,
          minutos_zona: fuerza ? {} : mz, duracion_min: fuerza ? Number(durF.value) || 0 : C.minutosTotales(mz) }));
      } }))));
    upd();
  }

  // ---------- acceso a Supabase ----------
  function repositorioSupabase(sb, tabla = 'carga_sesiones') {
    const limpiar = x => { const o = Object.assign({}, x); delete o.srpe; if (!o.id) delete o.id; return o; }; // srpe lo calcula la BD
    return {
      async cargar(atletaId, desde) {
        let q = sb.from(tabla).select('*').eq('atleta_id', atletaId).order('fecha');
        if (desde) q = q.gte('fecha', desde);
        const { data, error } = await q; if (error) throw error; return data;
      },
      async guardar(sesion) {
        const { data, error } = await sb.from(tabla).upsert(limpiar(sesion)).select().single(); if (error) throw error; return data;
      },
      async guardarRPE(id, rpe, duracionMin) {
        const cambios = { rpe }; if (duracionMin != null) cambios.duracion_min = duracionMin;
        const { data, error } = await sb.from(tabla).update(cambios).eq('id', id).select().single(); if (error) throw error; return data;
      },
      /** Guarda actividades de Strava ya convertidas con ATLCarga.sesionDesdeStrava (no duplica: strava_id único). */
      async importarStrava(sesiones) {
        const { data, error } = await sb.from(tabla).upsert(sesiones.map(limpiar), { onConflict: 'strava_id', ignoreDuplicates: false }).select(); if (error) throw error; return data;
      },
      async borrar(id) { const { error } = await sb.from(tabla).delete().eq('id', id); if (error) throw error; }
    };
  }

  global.ATLCargaUI = { panelEntrenador, panelFuerza, formularioRPE, planificador, repositorioSupabase };
})(window);
