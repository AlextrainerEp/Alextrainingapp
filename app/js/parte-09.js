/* =====================================================================
 * Alex Training Lab · Edición completa desde el entrenador (app general)
 *  - preguntarMoverCopiar(titulo, fechaTxt) → 'mover' | 'copiar' | null
 *  - abrirEditorRes(p, zonas, alGuardar)    → editor de TODOS los campos de una sesión de resistencia
 * Usa funciones de la app: esc, RES_NOMBRE.
 * ===================================================================== */

function preguntarMoverCopiar(titulo, fechaTxt) {
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.className = 'modal';
    ov.innerHTML = `<div class="modal-card" style="max-width:420px;margin-top:20vh">
      <h3>¿Mover o copiar?</h3>
      <p>«${esc(titulo)}» → <b>${esc(fechaTxt)}</b></p>
      <p class="muted">Mover la quita de su día. Copiar la deja donde está y crea otra igual (sin registro del cliente) en el día nuevo.</p>
      <div class="row"><button class="gold" data-r="mover">Mover</button><button class="gold" data-r="copiar">Copiar</button><button class="sec" data-r="">Cancelar</button></div></div>`;
    ov.onclick = e => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== ov) return;
      ov.remove(); res(b ? (b.dataset.r || null) : null);
    };
    document.body.appendChild(ov);
  });
}

// Pasos de resistencia como texto: «Calentamiento: 15 min Z1», «Series: 6x800 m Z4 rec 2», «Vuelta a la calma: 10 min Z1»
function pasoATexto(x) {
  const n = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const cuerpo = `${x.rep > 1 ? x.rep + 'x' : ''}${n(x.cantidad)} ${x.unidad || 'min'}${x.zona ? ' Z' + x.zona : ''}${x.rec && x.rep > 1 ? ' rec ' + n(x.rec) : ''}`.trim();
  return (x.nombre ? x.nombre + ': ' : '') + cuerpo;
}
function textoAPasos(txt) {
  const num = t => t == null || t === '' ? null : Number(String(t).replace(',', '.'));
  return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).map(l => {
    if (l.includes('\t')) {   // filas pegadas de Excel: Paso, Rep, Cantidad, Unidad, Zona, Recup
      const c = l.split('\t').map(x => x.trim());
      return { nombre: c[0] || '', rep: num(c[1]) || 1, cantidad: num(c[2]), unidad: /^(m|km|min)$/i.test(c[3] || '') ? c[3].toLowerCase() : 'min', zona: num(String(c[4] || '').replace(/z/i, '')), rec: num(c[5]) };
    }
    let nombre = '', t = l;
    const dp = l.match(/^([^:\d][^:]{0,40}):\s*(.*)$/); if (dp) { nombre = dp[1].trim(); t = dp[2]; }
    const o = { nombre, rep: 1, cantidad: null, unidad: 'min', zona: null, rec: null };
    let m;
    if ((m = t.match(/\b(?:rec(?:up(?:eraci[oó]n)?)?\.?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:'|min)?/i))) { o.rec = num(m[1]); t = t.replace(m[0], ' '); }
    if ((m = t.match(/\bZ(?:ona)?\s*([1-5])\b/i))) { o.zona = Number(m[1]); t = t.replace(m[0], ' '); }
    if ((m = t.match(/(\d+)\s*[x×]\s*/i))) { o.rep = Number(m[1]); t = t.replace(m[0], ' '); }
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(km|m|min|'|minutos?)(?![a-z])/i))) { o.cantidad = num(m[1]); o.unidad = /^km$/i.test(m[2]) ? 'km' : /^m$/i.test(m[2]) ? 'm' : 'min'; t = t.replace(m[0], ' '); }
    if (!o.nombre) o.nombre = t.replace(/\s{2,}/g, ' ').trim();
    return o;
  });
}
function abrirEditorRes(p, zonas, alGuardar) {
  let pasosTexto = false;
  const partes = (() => { const d = String(p.descripcion || ''), i = d.indexOf(' — '); return i > 0 ? [d.slice(0, i), d.slice(i + 3)] : [d, '']; })();
  let pasos = (Array.isArray(p.pasos) ? p.pasos : []).map(x => Object.assign({ nombre: '', rep: 1, cantidad: '', unidad: 'min', zona: '', rec: '' }, x));
  const ov = document.createElement('div');
  ov.className = 'modal';
  ov.innerHTML = `<div class="modal-card"><h3>Editar sesión de resistencia</h3><div id="er"></div></div>`;
  document.body.appendChild(ov);
  const opt = (o, v) => Object.entries(o).map(([k, t]) => `<option value="${esc(k)}"${String(v ?? '') === String(k) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const val = (sel) => { const el = ov.querySelector(sel); return el ? el.value.trim() : ''; };
  const leerPasos = () => pasosTexto ? textoAPasos(ov.querySelector('#er-pasos-txt').value) : [...ov.querySelectorAll('.er-paso')].map(tr => {
    const g = f => tr.querySelector(`[data-p="${f}"]`).value.trim();
    const n = t => t === '' ? null : Number(String(t).replace(',', '.'));
    return { nombre: g('nombre'), rep: n(g('rep')) || 1, cantidad: n(g('cantidad')), unidad: g('unidad') || 'min', zona: g('zona') ? Number(g('zona')) : null, rec: n(g('rec')) };
  });
  const durAuto = ps => ps.length && ps.every(x => x.unidad === 'min' && x.cantidad != null)
    ? Math.round(ps.reduce((a, x) => a + x.cantidad * (x.rep || 1) + (x.rec && x.rep > 1 ? x.rec * (x.rep - 1) : 0), 0)) : null;
  const pintar = () => {
    ov.querySelector('#er').innerHTML = `
      <div class="row"><label>Fecha <input type="date" id="er-fecha" value="${esc(p.fecha || '')}"></label>
        <label>Tipo <select id="er-tipo">${opt(RES_NOMBRE, p.tipo || 'otro')}</select></label>
        <label>Duración prevista (min) <input id="er-dur" inputmode="numeric" value="${esc(p.duracion_min ?? '')}" placeholder="auto si los pasos van en min"></label></div>
      <label>Nombre <input id="er-nombre" value="${esc(partes[0])}"></label>
      <label>Explicación (una idea por línea; «Ritmos: 4:30» sale en negrita) <textarea id="er-desc" rows="4">${esc(partes[1])}</textarea></label>
      <h3 style="margin-top:12px">Pasos</h3>
      <div class="row e-modos"><button class="${pasosTexto ? 'sec' : 'gold'}" data-a="pasos-tabla">▦ Tabla</button><button class="${pasosTexto ? 'gold' : 'sec'}" data-a="pasos-texto">✏️ Texto (copiar y pegar)</button><button class="sec" data-a="copiar-res">📋 Copiar sesión</button><button class="sec" data-a="pegar-res">📥 Pegar sesión</button></div>
      ${pasosTexto ? `<p class="muted e-ayuda">Un paso por línea: <b>Calentamiento: 15 min Z1</b> · <b>Series: 6x800 m Z4 rec 2</b> · <b>Vuelta a la calma: 10 min</b>. También puedes pegar filas de Excel.</p>
      <textarea id="er-pasos-txt" class="e-txt" rows="8" spellcheck="false">${esc(pasos.map(pasoATexto).join('\n'))}</textarea>` : `
      <div class="ses"><table><tr><th>Paso</th><th>Rep.</th><th>Cantidad</th><th>Unidad</th><th>Zona</th><th>Recup. (min)</th><th></th></tr>
        ${pasos.map((x, i) => `<tr class="er-paso">
          <td><input data-p="nombre" value="${esc(x.nombre)}" placeholder="Calentamiento"></td>
          <td><input class="n" data-p="rep" inputmode="numeric" value="${esc(x.rep ?? 1)}"></td>
          <td><input class="n" data-p="cantidad" inputmode="decimal" value="${esc(x.cantidad ?? '')}"></td>
          <td><select data-p="unidad">${opt({ min: 'min', m: 'm', km: 'km' }, x.unidad || 'min')}</select></td>
          <td><select data-p="zona">${opt({ '': '—', 1: 'Z1', 2: 'Z2', 3: 'Z3', 4: 'Z4', 5: 'Z5' }, x.zona ?? '')}</select></td>
          <td><input class="n" data-p="rec" inputmode="decimal" value="${esc(x.rec ?? '')}"></td>
          <td><button class="danger" data-a="delp" data-i="${i}">×</button></td></tr>`).join('')}
      </table></div>
      <button class="sec" data-a="addp" style="margin-top:6px">+ Paso</button>`}
      <h3 style="margin-top:14px">Registro</h3>
      <div class="row">
        <label>Estado <select id="er-estado">${opt({ pendiente: 'Pendiente', hecha: 'Hecha', omitida: 'No hecha' }, p.estado || 'pendiente')}</select></label>
        <label>RPE (1-10) <select id="er-rpe">${opt(Object.assign({ '': '—' }, Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, n]))), p.rpe ?? '')}</select></label>
        <label>Tiempo real (mm:ss o h:mm:ss) <input id="er-min" inputmode="text" placeholder="53:45 o 1:25:40" value="${esc(minutosAHMS(p.duracion_real_min))}"></label>
        <label>Km reales <input id="er-km" inputmode="decimal" value="${esc(p.km_reales ?? '')}"></label></div>
      <label>Notas del cliente <textarea id="er-notas" rows="2">${esc(p.notas_atleta || '')}</textarea></label>
      <label>Tu comentario (lo verá el cliente) <textarea id="er-com" rows="2">${esc(p.comentario_entrenador || '')}</textarea></label>
      <div class="row" style="margin-top:12px"><button class="gold" data-a="guardar">Guardar cambios</button><button class="sec" data-a="cerrar">Cancelar</button><span class="msg" id="er-m"></span></div>`;
  };
  const guardarEstado = () => {   // conserva lo escrito al repintar
    pasos = leerPasos();
    p = Object.assign({}, p, { fecha: val('#er-fecha'), tipo: val('#er-tipo'), duracion_min: val('#er-dur'), estado: val('#er-estado'), rpe: val('#er-rpe'),
      duracion_real_min: val('#er-min'), km_reales: val('#er-km'), notas_atleta: val('#er-notas'), comentario_entrenador: val('#er-com') });
    partes[0] = val('#er-nombre'); partes[1] = ov.querySelector('#er-desc').value;
  };
  ov.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'cerrar') { ov.remove(); return; }
    guardarEstado();
    const avisoR = (t, ok = true) => { const m = ov.querySelector('#er-m'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
    if (a === 'pasos-texto') { pasosTexto = true; pintar(); return; }
    if (a === 'pasos-tabla') { pasosTexto = false; pintar(); return; }
    if (a === 'copiar-res') {
      const txt = ['## SESIÓN RESISTENCIA', 'Tipo: ' + (RES_NOMBRE[p.tipo] || p.tipo || ''), 'Duración: ' + (p.duracion_min || ''), 'Nombre: ' + partes[0], '### Explicación', partes[1], '### Pasos', ...pasos.map(pasoATexto)].join('\n');
      const ok = await copiarTexto(txt); avisoR(ok ? 'Sesión copiada. Abre otra y pulsa «📥 Pegar sesión».' : 'No se pudo copiar', ok); return;
    }
    if (a === 'pegar-res') {
      let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) {}
      if (!t) { pasosTexto = true; pintar(); avisoR('Pega los pasos aquí con Ctrl+V'); return; }
      if (/^## SESIÓN RESISTENCIA/m.test(t)) {
        const sec = (ini, fin) => { const i = t.indexOf(ini); if (i < 0) return ''; const j = fin ? t.indexOf(fin, i) : -1; return t.slice(i + ini.length, j < 0 ? undefined : j).trim(); };
        const campo = k => { const m = t.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : ''; };
        const tp = Object.entries(RES_NOMBRE).find(([k, v]) => v === campo('Tipo')); if (tp) p.tipo = tp[0];
        if (campo('Duración')) p.duracion_min = campo('Duración');
        partes[0] = campo('Nombre') || partes[0];
        partes[1] = sec('### Explicación', '### Pasos');
        pasos = textoAPasos(sec('### Pasos'));
      } else pasos = textoAPasos(t);
      pasosTexto = false; pintar(); avisoR('Pegado. Revisa y pulsa Guardar cambios.'); return;
    }
    if (a === 'addp') { pasos.push({ nombre: '', rep: 1, cantidad: '', unidad: 'min', zona: '', rec: '' }); pintar(); return; }
    if (a === 'delp') { pasos.splice(+b.dataset.i, 1); pintar(); return; }
    if (a === 'guardar') {
      const num = t => { if (t === '' || t == null) return null; const n = Number(String(t).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
      const ps = pasos.filter(x => x.nombre || x.cantidad != null);
      const dur = num(p.duracion_min) ?? durAuto(ps);
      const cambios = {
        fecha: p.fecha || null, tipo: p.tipo || 'otro',
        descripcion: (partes[0] || RES_NOMBRE[p.tipo] || 'Sesión') + (partes[1].trim() ? ' — ' + partes[1].trim() : ''),
        duracion_min: dur, pasos: ps.length ? ps : null,
        estado: p.estado || 'pendiente', rpe: num(p.rpe), duracion_real_min: minutosDesdeTexto(p.duracion_real_min), km_reales: num(p.km_reales),
        notas_atleta: p.notas_atleta || null, comentario_entrenador: p.comentario_entrenador || null
      };
      const m = ov.querySelector('#er-m');
      if (!cambios.fecha) { m.textContent = 'Pon una fecha'; m.className = 'msg err'; return; }
      if ([cambios.duracion_min, cambios.duracion_real_min, cambios.km_reales].some(Number.isNaN)) { m.textContent = 'Duración y km tienen que ser números; el tiempo, como 53:45 o 1:25:40'; m.className = 'msg err'; return; }
      try { await alGuardar(cambios); ov.remove(); }
      catch (err) { m.textContent = err.message; m.className = 'msg err'; }
    }
  };
  pintar();
}
