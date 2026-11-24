/* =====================================================================
 * Alex Training Lab · Análisis con IA (solo entrenador)
 * Manda a la Edge Function «analizar-ia» un resumen con NÚMEROS de carga:
 * ni nombre, ni correo, ni anamnesis, ni ningún dato de salud.
 * Usa de la app: db, esc, $, S, SUPA_URL / SUPABASE_URL.
 * ===================================================================== */

/** Resumen anónimo para la IA: solo cifras de entrenamiento. */
function iaResumen(sesiones, fuerzaAn, bienestar, info) {
  const C = ATLCarga, hasta = C.fecha.hoyISO();
  const sem = C.resumenPeriodo(sesiones, { unidad: 'semana', n: 12, hasta });
  const mes = C.resumenPeriodo(sesiones, { unidad: 'mes', n: 6, hasta });
  const diario = C.serieDiaria(sesiones.map(C.normalizarSesion), C.fecha.sumarDias(sem[0].semana, -56), hasta, 'srpe');
  const ac = C.agudoCronico(diario), ff = C.formaFatiga(diario);
  const u = [...ac].reverse().find(x => x.ratio != null), f = ff[ff.length - 1];
  const limpia = w => ({ semana: w.semana, enCurso: w.enCurso || undefined, sesiones: w.sesiones, minutos: w.minutos, km: w.km,
    desnivel: w.desnivel || undefined, ecosPlan: w.ecosPlan, ecosReal: w.ecosReal, cumplimiento: w.cumplimiento,
    srpe: w.srpe, srpeFuerza: w.srpeFuerza || undefined, monotonia: w.monotonia, coste: w.coste });
  const out = {
    hoy: hasta,
    semanas: sem.map(limpia),
    meses: mes.map(w => ({ mes: w.etiqueta, sesiones: w.sesiones, minutos: w.minutos, km: w.km, ecosReal: w.ecosReal, srpe: w.srpe })),
    ratioAgudoCronico: u ? u.ratio : null,
    formaFatiga: f ? { forma: f.forma, fatiga: f.fatiga, balance: f.balance } : null,
    avisosAutomaticos: C.alertas(sem, ac).map(a => a.texto),
    calidadDeLosDatos: info ? { sesionesSinRPE: info.sinRPE, sinEcos: info.sinEcos, estimadas: info.estimadas,
      actividadesStrava: info.stravaUnidas + info.stravaExtra, fuerzaSinDuracion: info.fuerzaSinMin } : undefined
  };
  if (fuerzaAn && fuerzaAn.length) {
    const sf = ATLFuerza.resumenSemanal(fuerzaAn, { semanas: 12, hasta, fecha: C.fecha });
    out.fuerza = {
      semanas: sf.map(w => ({ semana: w.semana, sesiones: w.sesiones, seriesDuras: w.seriesDuras, seriesDurasPlan: w.seriesDurasPlan,
        series: w.series, tonelaje: w.tonelaje, rirMedio: w.rirMedio, desvRIR: w.desvRIR, srpe: w.srpe })),
      seriesDurasPorPatron: sf[sf.length - 1] ? sf[sf.length - 1].porPatron : {},
      progresion1RM: ATLFuerza.progresion1RM(fuerzaAn, { fecha: C.fecha, semanas: 24, hasta })
        .map(x => ({ ejercicio: x.nombre, patron: x.patron, primera: x.valorPrimera, ultima: x.valorUltima, cambioPct: x.cambio })),
      avisos: ATLFuerza.alertas(sf).map(a => a.texto)
    };
  }
  if (bienestar && bienestar.length) out.bienestar = bienestar.map(b => ({ semana: b.semana, dias: b.dias, sueno: b.sueno, energia: b.fatiga, dolor: b.dolor, animo: b.animo }));
  return out;
}

/** Texto muy sencillo a HTML: ## títulos, - listas, **negrita**. */
function iaHTML(t) {
  const linea = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = []; let lista = false;
  String(t || '').split('\n').forEach(l => {
    const s = l.trim();
    if (/^#{2,3}\s/.test(s)) { if (lista) { out.push('</ul>'); lista = false; } out.push(`<h4>${linea(s.replace(/^#+\s*/, ''))}</h4>`); return; }
    if (/^[-*]\s/.test(s) || /^\d+[.)]\s/.test(s)) { if (!lista) { out.push('<ul>'); lista = true; } out.push(`<li>${linea(s.replace(/^([-*]|\d+[.)])\s*/, ''))}</li>`); return; }
    if (lista) { out.push('</ul>'); lista = false; }
    if (s) out.push(`<p>${linea(s)}</p>`);
  });
  if (lista) out.push('</ul>');
  return out.join('');
}

/** Historial sesión a sesión (sin nombres ni notas) para que la IA proponga progresiones y regresiones. */
async function iaHistorial(clienteId) {
  const desde = ATLCarga.fecha.sumarDias(ATLCarga.fecha.hoyISO(), -84);
  const fuerza = [];
  const ses = await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&select=fecha,titulo,bloques,registro`).catch(() => []);
  for (const s of ses || []) {
    const d = parseFecha(s.fecha);
    if (!d || !hecho(s)) continue;
    const fecha = isoLocal(d);
    if (fecha < desde) continue;
    const ejercicios = [];
    (s.bloques || []).forEach((b, bi) => (b.ejercicios || []).forEach((ex, ei) => {
      const e = normEj(ex);
      if (!e.ej) return;
      const r = (s.registro || {})[`${bi}-${ei}`] || {};
      const hay = Object.entries(r).some(([f, v]) => f !== 'estado' && v !== '' && v != null);
      ejercicios.push({
        ejercicio: e.ej,
        plan: { series: e.ser || undefined, reps: e.rep || undefined, intensidad: e.int || undefined, rir: e.rir || undefined, rpe: e.rpe || undefined },
        realizado: hay ? { series: r.ser || undefined, kg: r.kg || undefined, reps: r.reps || undefined, rir: r.rir || undefined, rpe: r.rpe || undefined, estado: r.estado || undefined } : null
      });
    }));
    fuerza.push({ fecha, sesion: s.titulo || 'Fuerza', ejercicios });
  }
  fuerza.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const resistencia = [];
  const at = await db('GET', 'atletas', `?user_id=eq.${clienteId}&select=id`).catch(() => []);
  if (at && at.length) {
    const ps = await db('GET', 'sesiones_planificadas', `?atleta_id=in.(${at.map(a => a.id).join(',')})&fecha=gte.${desde}&order=fecha.asc&select=fecha,tipo,descripcion,duracion_min,duracion_real_min,km_reales,rpe,estado`).catch(() => []);
    (ps || []).forEach(p => resistencia.push({
      fecha: String(p.fecha).slice(0, 10), tipo: p.tipo, sesion: String(p.descripcion || '').split(' — ')[0],
      planMin: p.duracion_min ?? undefined, estado: p.estado, realMin: p.duracion_real_min ?? undefined,
      realKm: p.km_reales ?? undefined, rpe: p.rpe ?? undefined
    }));
  }
  return { fuerza, resistencia };
}

/** Separa el bloque JSON de sesiones propuestas por la IA (fuerza y running) del texto del análisis. */
function iaExtraerPlan(texto) {
  const m = String(texto || '').match(/```json\s*([\s\S]*?)```/);
  if (!m) return { texto: String(texto || ''), plan: null };
  let obj = {};
  try { obj = JSON.parse(m[1]) || {}; } catch (e) { obj = {}; }
  const sesiones = Array.isArray(obj.sesiones) ? obj.sesiones : [];
  const running = Array.isArray(obj.running) ? obj.running : [];
  return { texto: String(texto).replace(m[0], '').trim(), plan: (sesiones.length || running.length) ? { sesiones, running } : null };
}
const IA_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const iaNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const iaPasoTxt = x => `${x.rep > 1 ? x.rep + '×' : ''}${x.cantidad ?? ''} ${x.unidad || 'min'}${x.zona ? ' Z' + x.zona : ''}`;
function iaPlanHTML(plan) {
  const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  const fuerza = plan.sesiones.map(s => `<div class="ia-ses"><b>${esc(s.dia || '')}</b> · 🏋️ ${esc(s.titulo || 'Fuerza')}
      <div class="muted">${(s.bloques || []).map(b => (b.ejercicios || []).map(e => esc(e.ej || '') + (e.ser ? ' ' + esc(String(e.ser)) + '×' + esc(String(e.rep || '')) : '')).join(' · ')).join(' · ')}</div></div>`).join('');
  const run = plan.running.map(s => `<div class="ia-ses"><b>${esc(s.dia || '')}</b> · 🏃 ${esc(s.titulo || 'Running')}
      <div class="muted">${(s.pasos || []).map(iaPasoTxt).map(esc).join(' · ')}</div></div>`).join('');
  return `<div class="ia-plan card"><h3>📋 Plan propuesto para la semana que viene</h3>
    ${fuerza}${run}
    <div class="row"><label>Lunes de inicio <input type="date" id="ia-plan-fecha" value="${isoLocal(d)}"></label>
      <button class="gold" id="ia-plan-add" type="button">Añadir al plan del entrenado</button></div>
    <div class="msg" id="ia-plan-msg"></div></div>`;
}
function iaPlanActivar(clienteId, plan) {
  const b = $('#ia-plan-add'); if (!b) return;
  b.onclick = async () => {
    const msg = $('#ia-plan-msg');
    try {
      const base = parseFecha($('#ia-plan-fecha').value);
      if (!base) { msg.textContent = 'Elige una fecha.'; return; }
      const lun = new Date(base); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
      const diaFecha = dia => { const idx = IA_DIAS.indexOf(iaNorm(dia)); const f = new Date(lun); f.setDate(f.getDate() + (idx < 0 ? 0 : idx)); return isoLocal(f); };
      const lote = plan.sesiones.map(s => ({ cliente_id: clienteId, fecha: diaFecha(s.dia), titulo: s.titulo || 'Fuerza',
        bloques: (s.bloques || []).map(bl => ({ nombre: bl.nombre || 'General', ejercicios: (bl.ejercicios || []).map(normEj) })), registro: {} }));
      const fechas = [...lote.map(x => x.fecha), ...plan.running.map(s => diaFecha(s.dia))];
      const previas = fechas.length ? await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&fecha=in.(${fechas.join(',')})&select=id`).catch(() => []) : [];
      if (previas && previas.length && !confirm(`Ya hay ${previas.length} sesión(es) en esos días. ¿Añadir las nuevas igualmente?`)) return;
      msg.textContent = 'Añadiendo…';
      if (lote.length) await db('POST', 'sesiones', '', lote, 'return=minimal');
      if (plan.running.length) {
        const [c] = await db('GET', 'perfiles', `?id=eq.${clienteId}&select=id,nombre,modulos`);
        const atletaId = await asegurarFichaRes(c);
        if (!modulosDe(c).includes('resistencia')) {
          await db('PATCH', 'perfiles', `?id=eq.${clienteId}`, { modulos: [...modulosDe(c), 'resistencia'] }, 'return=minimal');
        }
        const resis = plan.running.map(s => {
          const pasos = (s.pasos || []).map(x => ({ nombre: x.nombre || '', rep: Number(x.rep) || 1, cantidad: Number(x.cantidad) || null, unidad: x.unidad || 'min', zona: Number(x.zona) || null, rec: x.rec != null ? Number(x.rec) : null }));
          const tipo = RES_NOMBRE[s.tipo] ? s.tipo : 'otro';
          const dur = pasos.reduce((q, p) => q + (p.cantidad || 0) * (p.rep || 1) + (p.rec ? p.rec * ((p.rep || 1) - 1) : 0), 0);
          return { atleta_id: atletaId, fecha: diaFecha(s.dia), tipo, descripcion: (s.titulo || RES_NOMBRE[tipo]) + (s.texto ? ' — ' + s.texto : ''), pasos, duracion_min: Math.round(dur) || null, estado: 'pendiente' };
        });
        await db('POST', 'sesiones_planificadas', '', resis, 'return=minimal');
      }
      b.disabled = true; b.textContent = 'Añadido ✓';
      msg.className = 'msg ok';
      msg.textContent = `Añadidas ${lote.length + plan.running.length} sesión(es) al plan. Ya aparecen en Entrenamientos del entrenado.`;
    } catch (e) { msg.textContent = 'No se pudo añadir: ' + e.message; msg.className = 'msg err'; }
  };
}
async function iaAnalizar(clienteId, host, pregunta) {
  const caja = typeof host === 'string' ? $(host) : host;
  caja.innerHTML = '<div class="ia-caja"><p class="muted">Analizando… puede tardar unos segundos.</p></div>';
  try {
    const [{ sesiones, info }, fz, bien] = await Promise.all([
      cargaSesionesCliente(clienteId),
      cargaFuerzaCliente(clienteId).then(r => r.sesiones).catch(() => []),
      bienestarSemanal(clienteId, ATLCarga.fecha.sumarDias(ATLCarga.fecha.hoyISO(), -84)).catch(() => null)
    ]);
    const datos = iaResumen(sesiones, fz, bien, info);
    datos.historial = await iaHistorial(clienteId).catch(() => null);
    const base = String(typeof SB_URL !== 'undefined' ? SB_URL : '').replace(/\/+$/, '');
    const r = await fetch(`${base}/functions/v1/analizar-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.access },
      body: JSON.stringify({ datos, pregunta: pregunta || '' })
    });
    const j = await r.json().catch(() => ({ error: 'Respuesta ilegible del servidor' }));
    if (!r.ok || j.error) throw new Error(j.error || ('Error ' + r.status));
    if (!String(j.texto || '').trim()) throw new Error('La IA no devolvió texto. Vuelve a pulsar Analizar.');
    const { texto, plan } = iaExtraerPlan(j.texto);
    caja.innerHTML = `<div class="ia-caja"><div class="ia-cab"><b>🤖 Análisis</b><span class="muted">${new Date().toLocaleString('es-ES')}</span></div>
      <div class="ia-texto">${iaHTML(texto)}</div>
      <p class="muted ia-pie">Lo ha escrito una IA a partir de los números de carga, sin saber quién es el entrenado. Revísalo antes de aplicarlo: la decisión es tuya.</p></div>
      ${plan ? iaPlanHTML(plan) : ''}`;
    if (plan) iaPlanActivar(clienteId, plan);
  } catch (e) {
    const falta = /ANTHROPIC_API_KEY|Falta la clave/.test(e.message);
    caja.innerHTML = `<div class="ia-caja"><p class="muted">No se pudo analizar: ${esc(e.message)}</p>${
      falta ? '<p class="muted">Añade tu clave en Supabase → Edge Functions → Secrets, con el nombre <b>ANTHROPIC_API_KEY</b>.</p>' : ''}</div>`;
  }
}

/* ---------- Planificación completa con IA (fuerza + running), editable antes de enviar ---------- */
const IA_DIAS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
function iaPasoATexto(x) {
  const n = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const cuerpo = `${x.rep > 1 ? x.rep + 'x' : ''}${n(x.cantidad)} ${x.unidad || 'min'}${x.zona ? ' Z' + x.zona : ''}${x.rec && x.rep > 1 ? ' rec ' + n(x.rec) : ''}`.trim();
  return (x.nombre ? x.nombre + ': ' : '') + cuerpo;
}
function iaTextoAPasos(txt) {
  const num = t => t == null || t === '' ? null : Number(String(t).replace(',', '.'));
  return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).map(l => {
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
function iaLunesProx() { const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return isoLocal(d); }
function iaSesHTML(s) {
  const tipo = s.tipo === 'fuerza' || (!s.tipo && s.ejercicios) ? 'fuerza' : (['rodaje', 'series', 'tirada'].includes(s.tipo) ? s.tipo : 'rodaje');
  const txt = tipo === 'fuerza'
    ? (s.ejercicios || []).map(e => [e.ej, e.ser, e.rep, e.int, e.rir, e.sup].map(v => v == null ? '' : v).join(' | ')).join('\n')
    : (s.pasos || []).map(iaPasoATexto).join('\n');
  const selDia = IA_DIAS_ES.map(d => `<option value="${d}"${iaNorm(d) === iaNorm(s.dia) ? ' selected' : ''}>${d}</option>`).join('');
  const selTipo = [['fuerza', 'Fuerza'], ['rodaje', 'Rodaje'], ['series', 'Series'], ['tirada', 'Tirada larga']]
    .map(([k, l]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${l}</option>`).join('');
  return `<div class="ia-edit">
    <div class="row"><select class="ia-dia">${selDia}</select><select class="ia-tipo">${selTipo}</select>
      <input class="ia-tit" value="${esc(s.titulo || '')}" placeholder="Título"><button class="sec ia-quitar" type="button">✕</button></div>
    <textarea class="ia-txt" rows="${Math.max(3, txt.split('\n').length + 1)}" spellcheck="false">${esc(txt)}</textarea></div>`;
}
function iaPlanCompletoHTML() {
  const sel = (id, lista, def) => `<select id="${id}">${lista.map(n => `<option${n === def ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  return `<div class="card ia-barra">
    <h3>🗓 Planificación completa con IA</h3>
    <p class="muted">La IA propone varias semanas de fuerza y de running. Lo revisas y lo cambias aquí antes de pasarlo al entrenado.</p>
    <div class="row">
      <label>Semanas ${sel('ia-pc-sem', [1, 2, 3, 4, 6, 8], 4)}</label>
      <label>Días de fuerza ${sel('ia-pc-f', [0, 1, 2, 3, 4, 5], 2)}</label>
      <label>Días de running ${sel('ia-pc-r', [0, 1, 2, 3, 4, 5], 3)}</label>
    </div>
    <input id="ia-pc-obj" placeholder="Objetivo (opcional): por ejemplo, media maratón en abril" style="width:100%">
    <div class="row">
      <label>Objetivo de carga (opcional) <input id="ia-pc-oej" placeholder="Ejercicio, p. ej. Sentadilla" style="width:100%"></label>
      <label>Kg <input id="ia-pc-okg" type="number" min="1" step="0.5" style="width:90px"></label>
      <label>Tipo ${sel('ia-pc-otipo', ['1RM', 'Peso de trabajo'], '1RM')}</label>
      <label>Reps (si es trabajo) <input id="ia-pc-oreps" type="number" min="1" max="30" value="5" style="width:70px"></label>
      <label>Plazo ${sel('ia-pc-osem', [4, 6, 8, 12, 16, 24], 12)} semanas</label>
    </div>
    <div class="row"><button class="gold" id="ia-pc-b" type="button">🗓 Generar planificación</button></div>
    <div id="ia-pc-out"></div></div>`;
}
/** Avisos de la revisión del método. No bloquean: el entrenador decide. */
function iaAvisosHTML(avisos) {
  const lista = Array.isArray(avisos) ? avisos : [];
  if (!lista.length) return '<div class="ia-avisos ok"><b>✓ Sin avisos según el método.</b></div>';
  const revisar = lista.filter(a => a.nivel === 'revisar').length;
  return `<div class="ia-avisos"><b>${revisar ? '⚠️ ' + revisar + ' aviso(s) para revisar' : 'ℹ️ Solo avisos informativos'}</b>
    <ul>${lista.map(a => `<li>${a.semana ? '<b>S' + esc(a.semana) + '</b> · ' : ''}${a.nivel === 'revisar' ? '⚠️ ' : 'ℹ️ '}${esc(a.texto)}</li>`).join('')}</ul></div>`;
}
function iaPlanEditorHTML(plan) {
  return `<div class="ia-plan-ed">${plan.semanas.map((w, i) => `<details class="ia-sem" open><summary><b>Semana ${w.semana || i + 1}</b></summary>
      ${(w.sesiones || []).map(iaSesHTML).join('')}
      <button class="sec ia-mas" type="button">+ Sesión</button></details>`).join('')}
    <div class="row"><label>Lunes de inicio <input type="date" id="ia-pc-ini" value="${iaLunesProx()}"></label></div>
    <p class="muted">Fuerza: una línea por ejercicio, «Ejercicio | series | reps | intensidad | RIR | superserie» (por ejemplo, «Sentadilla | 3 | 6 | 80 kg | RIR 3 | B1»). Running: una línea por paso, por ejemplo «Calentamiento: 10 min Z1» o «Series: 6x800 m Z4 rec 2».</p>
    <div class="row"><button class="gold" id="ia-pc-add" type="button">Añadir todo al plan del entrenado</button></div>
    <div class="msg" id="ia-pc-msg"></div></div>`;
}
async function iaDatosCliente(clienteId) {
  const [{ sesiones, info }, fz, bien] = await Promise.all([
    cargaSesionesCliente(clienteId),
    cargaFuerzaCliente(clienteId).then(r => r.sesiones).catch(() => []),
    bienestarSemanal(clienteId, ATLCarga.fecha.sumarDias(ATLCarga.fecha.hoyISO(), -84)).catch(() => null)
  ]);
  const datos = iaResumen(sesiones, fz, bien, info);
  datos.historial = await iaHistorial(clienteId).catch(() => null);
  return datos;
}
function iaPlanCompletoActivar(clienteId) {
  const b = $('#ia-pc-b'); if (!b) return;
  b.onclick = async () => {
    const out = $('#ia-pc-out');
    b.disabled = true; b.textContent = 'Generando… puede tardar un minuto';
    out.innerHTML = '<p class="muted">Generando la planificación…</p>';
    try {
      const datos = await iaDatosCliente(clienteId);
      const base = String(typeof SB_URL !== 'undefined' ? SB_URL : '').replace(/\/+$/, '');
      const ejObj = $('#ia-pc-oej').value.trim();
      const kgObj = +$('#ia-pc-okg').value;
      const objetivoEj = ejObj && kgObj > 0 ? {
        ejercicio: ejObj, kg: kgObj,
        tipo: $('#ia-pc-otipo').value === 'Peso de trabajo' ? 'trabajo' : 'rm',
        reps: +$('#ia-pc-oreps').value || 5,
        semanas: +$('#ia-pc-osem').value
      } : null;
      const r = await fetch(`${base}/functions/v1/analizar-ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.access },
        body: JSON.stringify({ datos, modo: 'planificar', opciones: {
          semanas: +$('#ia-pc-sem').value, diasFuerza: +$('#ia-pc-f').value, diasCarrera: +$('#ia-pc-r').value,
          objetivo: $('#ia-pc-obj').value.trim(), objetivoEj } })
      });
      const j = await r.json().catch(() => ({ error: 'Respuesta ilegible del servidor' }));
      if (!r.ok || j.error) throw new Error(j.error || ('Error ' + r.status));
      out.innerHTML = iaAvisosHTML(j.avisos) + iaPlanEditorHTML(j.plan);
      iaPlanEditorActivar(clienteId);
    } catch (e) {
      out.innerHTML = `<p class="muted">No se pudo generar: ${esc(e.message)}</p>`;
    } finally {
      b.disabled = false; b.textContent = '🗓 Generar de nuevo';
    }
  };
}
function iaPlanEditorActivar(clienteId) {
  const out = $('#ia-pc-out');
  out.onclick = e => {
    const q = e.target.closest('button'); if (!q) return;
    if (q.classList.contains('ia-quitar')) { q.closest('.ia-edit').remove(); return; }
    if (q.classList.contains('ia-mas')) { q.insertAdjacentHTML('beforebegin', iaSesHTML({ dia: 'lunes', tipo: 'fuerza', titulo: 'Fuerza', ejercicios: [] })); return; }
    if (q.id === 'ia-pc-add') iaPlanAnadir(clienteId);
  };
  out.onchange = e => {
    if (!e.target.classList.contains('ia-tipo')) return;
    const ta = e.target.closest('.ia-edit').querySelector('.ia-txt');
    ta.value = '';
    ta.placeholder = e.target.value === 'fuerza' ? 'Sentadilla | 3 | 6 | 80 kg | RIR 3 | B1' : 'Calentamiento: 10 min Z1\nSeries: 6x800 m Z4 rec 2';
  };
}
async function iaPlanAnadir(clienteId) {
  const msg = $('#ia-pc-msg'), b = $('#ia-pc-add');
  try {
    const lun0 = parseFecha($('#ia-pc-ini').value);
    if (!lun0) { msg.textContent = 'Elige el lunes de inicio.'; return; }
    const lun = new Date(lun0); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
    const fuerza = [], resis = [];
    document.querySelectorAll('#ia-pc-out .ia-sem').forEach((sEl, si) => {
      sEl.querySelectorAll('.ia-edit').forEach(ed => {
        const idx = IA_DIAS.indexOf(iaNorm(ed.querySelector('.ia-dia').value));
        const f = new Date(lun); f.setDate(f.getDate() + si * 7 + (idx < 0 ? 0 : idx));
        const fecha = isoLocal(f);
        const tipo = ed.querySelector('.ia-tipo').value;
        const titulo = ed.querySelector('.ia-tit').value.trim() || (tipo === 'fuerza' ? 'Fuerza' : 'Running');
        const txt = ed.querySelector('.ia-txt').value;
        if (tipo === 'fuerza') {
          const ejs = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            const c = l.split('|').map(x => x.trim());
            return { ej: c[0] || '', ser: c[1] || '', rep: c[2] || '', int: c[3] || '', rir: c[4] || '', sup: c[5] || '' };
          }).filter(x => x.ej);
          if (ejs.length) fuerza.push({ cliente_id: clienteId, fecha, titulo, bloques: [{ nombre: 'Principal', ejercicios: ejs.map(normEj) }], registro: {} });
        } else {
          const pasos = iaTextoAPasos(txt);
          if (pasos.length) {
            const dur = pasos.reduce((q, p) => q + (p.cantidad || 0) * (p.rep || 1) + (p.rec ? p.rec * ((p.rep || 1) - 1) : 0), 0);
            resis.push({ fecha, tipo, descripcion: titulo, pasos, duracion_min: Math.round(dur) || null, estado: 'pendiente' });
          }
        }
      });
    });
    if (!fuerza.length && !resis.length) { msg.textContent = 'No hay sesiones con ejercicios o pasos.'; return; }
    const fechas = [...fuerza.map(x => x.fecha), ...resis.map(x => x.fecha)];
    const previas = await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&fecha=in.(${fechas.join(',')})&select=id`).catch(() => []);
    if (previas && previas.length && !confirm(`Ya hay ${previas.length} sesión(es) en esas fechas. ¿Añadir igualmente?`)) return;
    msg.textContent = 'Añadiendo…';
    if (fuerza.length) await db('POST', 'sesiones', '', fuerza, 'return=minimal');
    if (resis.length) {
      const [c] = await db('GET', 'perfiles', `?id=eq.${clienteId}&select=id,nombre,modulos`);
      const atletaId = await asegurarFichaRes(c);
      if (!modulosDe(c).includes('resistencia')) await db('PATCH', 'perfiles', `?id=eq.${clienteId}`, { modulos: [...modulosDe(c), 'resistencia'] }, 'return=minimal');
      await db('POST', 'sesiones_planificadas', '', resis.map(x => Object.assign({ atleta_id: atletaId }, x)), 'return=minimal');
    }
    b.disabled = true; b.textContent = 'Añadido ✓';
    msg.className = 'msg ok';
    msg.textContent = `Añadidas ${fuerza.length + resis.length} sesión(es): ${fuerza.length} de fuerza y ${resis.length} de running. Ya están en Entrenamientos del entrenado.`;
  } catch (e) { msg.textContent = 'No se pudo añadir: ' + e.message; msg.className = 'msg err'; }
}

/** Barra con el botón y el recuadro de pregunta, para la pestaña de Carga. */
function iaBarra(clienteId) {
  return `<div class="card ia-barra">
    <div class="row"><button class="gold" id="ia-b">🤖 Analizar con IA</button>
      <input id="ia-q" placeholder="¿Algo concreto que quieras preguntar? (opcional)" style="flex:1;min-width:180px;margin:0"></div>
    <p class="muted">Se mandan solo cifras de entrenamiento: nada de nombre, correo, anamnesis ni datos de salud.</p>
    <div id="ia-out"></div></div>${iaPlanCompletoHTML()}`;
}
function iaActivar(clienteId) {
  iaPlanCompletoActivar(clienteId);
  const b = $('#ia-b');
  if (!b) return;
  b.onclick = async () => {
    b.disabled = true; b.textContent = 'Analizando…';
    await iaAnalizar(clienteId, '#ia-out', ($('#ia-q') || {}).value || '');
    b.disabled = false; b.textContent = '🤖 Analizar de nuevo';
  };
}
