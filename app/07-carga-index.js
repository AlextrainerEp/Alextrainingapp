
/* =====================================================================
 * Alex Training Lab · Control de carga dentro del index general
 * Convierte lo que ya guarda la app en sesiones para ATLCarga (ECOs + sRPE):
 *   - sesiones_planificadas (resistencia): pasos por zona → ECOs; «hecha» + RPE + minutos → sRPE
 *   - actividades (Strava): completan la sesión hecha de ese día o suman como actividad extra
 *   - sesiones (fuerza): RPE total × duración → sRPE
 * Cómo se reparten los minutos por zona (de más a menos fiable), y queda anotado en cada sesión:
 *   1. pasos de la sesión planificada        → «pasos»
 *   2. FC media de Strava vs zonas de FC      → «FC media»
 *   3. ritmo medio de Strava vs zonas de ritmo → «ritmo»
 *   4. tipo de sesión (rodaje = Z1, tirada = 70 % Z1 / 30 % Z2) → «tipo (estimado)»
 *   5. RPE de la sesión (≤4 Z1, 5 Z2, 6 Z3, 7 Z4, 8 Z5a, ≥9 Z5b) → «RPE (estimado)»
 * Si no hay zonas guardadas, se calculan desde el perfil del atleta (FC umbral / FC máx / ritmo umbral),
 * con las mismas fórmulas que la app de resistencia.
 * Usa funciones de la app: db, parseFecha, isoLocal, hecho, esCarrera, aResistencia, esc, $.
 * ===================================================================== */

const CARGA_DEPORTE = { rodaje: 'carrera', series: 'carrera', tirada: 'carrera', test: 'carrera', otro: 'carrera', bici: 'ciclismo', fuerza: 'fuerza', trail: 'trail' };
const CARGA_ZONA = { 1: 'z1', 2: 'z2', 3: 'z3', 4: 'z4', 5: 'z5', 6: 'z6' };
const CARGA_ESTIMACION = { rodaje: { z1: 1 }, tirada: { z1: 0.7, z2: 0.3 }, bici: { z1: 1 } };
const CARGA_FUERZA_MIN = 60;
const cargaZonaPorRPE = r => r <= 4 ? 1 : r <= 5 ? 2 : r <= 6 ? 3 : r <= 7 ? 4 : r <= 8 ? 5 : 6;

const CARGA_STRAVA_DEPORTE = t => {
  t = String(t || '');
  if (/TrailRun|Hike/i.test(t)) return 'trail';
  if (/Run/i.test(t)) return 'carrera';
  if (/Ride|Bike|Cycl/i.test(t)) return 'ciclismo';
  if (/Swim/i.test(t)) return 'natacion';
  if (/Weight|Workout|Crossfit|Strength|Yoga|Pilates/i.test(t)) return 'fuerza';
  return 'otro';
};
const cargaCompatibles = (a, b) => a === b || (['carrera', 'trail'].includes(a) && ['carrera', 'trail'].includes(b));
const cargaNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const cargaEscalar = (mz, f) => { const o = {}; for (const k in mz) o[k] = Math.round(mz[k] * f * 10) / 10; return o; };
const cargaTiempo = t => { const m = String(t || '').trim().match(/^(\d+):(\d{1,2})$/); return m ? +m[1] * 60 + +m[2] : null; };

// Zonas del atleta: las guardadas y, si faltan, calculadas desde su perfil (mismas fórmulas que la app de resistencia)
function cargaZonasAtleta(zonasApp, perfil) {
  const z = (zonasApp || []).slice();
  const f = perfil || {};
  if (!z.some(x => x.tipo === 'fc')) {
    const fcUm = cargaNum(f.fc_umbral), fcMax = cargaNum(f.fc_max), fcRep = cargaNum(f.fc_reposo);
    if (fcUm) [[0.70, 0.85], [0.85, 0.89], [0.90, 0.94], [0.95, 0.99], [1.00, 1.06]].forEach((r, i) => z.push({ tipo: 'fc', zona: i + 1, minimo: Math.round(fcUm * r[0]), maximo: Math.round(fcUm * r[1]), _perfil: true }));
    else if (fcMax) [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0]].forEach((r, i) => {
      const res = fcRep ? fcMax - fcRep : null;
      z.push({ tipo: 'fc', zona: i + 1, minimo: Math.round(res ? fcRep + r[0] * res : fcMax * r[0]), maximo: Math.round(res ? fcRep + r[1] * res : fcMax * r[1]), _perfil: true });
    });
  }
  if (!z.some(x => x.tipo === 'ritmo')) {
    const U = cargaTiempo(f.ritmo_umbral);
    if (U) [[1.29, 1.45], [1.14, 1.29], [1.06, 1.14], [0.99, 1.06], [0.90, 0.99]].forEach((r, i) => z.push({ tipo: 'ritmo', zona: i + 1, minimo: Math.round(U * r[0]), maximo: Math.round(U * r[1]), _perfil: true }));
  }
  return z;
}

function cargaZonaPorFC(fc, zonas) {
  const zs = zonas.filter(z => z.tipo === 'fc').map(z => ({ n: +z.zona, lo: +z.minimo, hi: +z.maximo })).sort((a, b) => a.n - b.n);
  if (!fc || !zs.length) return null;
  const d = zs.find(z => fc >= z.lo && fc <= z.hi); if (d) return d.n;
  if (fc < zs[0].lo) return zs[0].n;
  if (fc > zs[zs.length - 1].hi) return Math.min(6, zs[zs.length - 1].n + 1);
  return zs.reduce((m, z) => Math.abs((z.lo + z.hi) / 2 - fc) < Math.abs((m.lo + m.hi) / 2 - fc) ? z : m).n;
}
// ritmo en seg/km; en las zonas de ritmo, Z1 es la más lenta (más segundos)
function cargaZonaPorRitmo(seg, zonas) {
  const zs = zonas.filter(z => z.tipo === 'ritmo').map(z => ({ n: +z.zona, lo: Math.min(+z.minimo, +z.maximo), hi: Math.max(+z.minimo, +z.maximo) })).sort((a, b) => a.n - b.n);
  if (!seg || !zs.length) return null;
  const d = zs.find(z => seg >= z.lo && seg <= z.hi); if (d) return d.n;
  if (seg > zs[0].hi) return zs[0].n;                         // más lento que Z1
  if (seg < zs[zs.length - 1].lo) return Math.min(6, zs[zs.length - 1].n + 1); // más rápido que Z5
  return zs.reduce((m, z) => Math.abs((z.lo + z.hi) / 2 - seg) < Math.abs((m.lo + m.hi) / 2 - seg) ? z : m).n;
}

function cargaMinutosDePasos(pasos, zonas) {
  const mz = {}; let estimado = false;
  const ritmo = n => { const z = zonas.find(z => z.tipo === 'ritmo' && +z.zona === +n); return z ? (+z.minimo + +z.maximo) / 2 : null; };
  const sumar = (zona, min) => { const k = CARGA_ZONA[zona] || 'z1'; mz[k] = (mz[k] || 0) + min; };
  for (const ps of pasos) {
    const rep = Number(ps.rep) || 1, cant = cargaNum(ps.cantidad) || 0, u = String(ps.unidad || 'min').toLowerCase();
    let min;
    if (u === 'km' || u === 'm') {
      const km = u === 'm' ? cant / 1000 : cant;
      let seg = ritmo(ps.zona || 1); if (!seg) { seg = 330; estimado = true; }
      min = km * seg / 60;
    } else min = cant;
    if (!ps.zona) estimado = true;
    sumar(ps.zona || 1, min * rep);
    if (ps.rec && rep > 1) sumar(1, (cargaNum(ps.rec) || 0) * (rep - 1));
  }
  for (const k in mz) mz[k] = Math.round(mz[k] * 10) / 10;
  return { mz, estimado };
}

// Rellena zonas de una sesión realizada que no las tiene, con lo mejor disponible
function cargaCompletarZonas(s, ctx, info) {
  const tieneZonas = ATLCarga.minutosTotales(s.minutos_zona) > 0;
  if (tieneZonas && !s._estimado) return;
  const min = Number(s.duracion_min) || 0; if (!min) return;
  let zona = null, metodo = null;
  if (s._fc) { zona = cargaZonaPorFC(s._fc, ctx.zonas); if (zona) metodo = 'FC media'; }
  if (!zona && s._ritmo && ['carrera', 'trail'].includes(s.deporte)) { zona = cargaZonaPorRitmo(s._ritmo, ctx.zonas); if (zona) metodo = 'ritmo'; }
  if (zona) { s.minutos_zona = { [CARGA_ZONA[zona]]: min }; s.metodo_ecos = metodo + (ctx.zonasDePerfil ? ' (zonas del perfil)' : ''); s._estimado = false; return; }
  if (tieneZonas) return; // se queda con la estimación por tipo
  if (s.rpe != null && s.deporte !== 'fuerza') { s.minutos_zona = { [CARGA_ZONA[cargaZonaPorRPE(s.rpe)]]: min }; s.metodo_ecos = 'RPE (estimado)'; s._estimado = true; }
}

async function cargaSesionesCliente(clienteId) {
  const out = [], realesRes = [];
  const info = { stravaUnidas: 0, stravaExtra: 0 };
  let atletaIds = [];
  try { atletaIds = (await db('GET', 'atletas', `?user_id=eq.${clienteId}&select=id`)).map(a => a.id); } catch (e) {}
  const ctx = { zonas: [], zonasDePerfil: false };

  if (atletaIds.length) {
    const ids = atletaIds.join(',');
    const desde = isoLocal(new Date(Date.now() - 200 * 86400000));
    const [ps, zs, perf, acts] = await Promise.all([
      db('GET', 'sesiones_planificadas', `?atleta_id=in.(${ids})&select=*&order=fecha.asc`).catch(() => []),
      db('GET', 'zonas', `?atleta_id=in.(${ids})&select=*`).catch(() => []),
      db('GET', 'perfil_atleta', `?atleta_id=in.(${ids})&select=*`).catch(() => []),
      db('GET', 'actividades', `?atleta_id=in.(${ids})&fecha=gte.${desde}&select=*&order=inicio.asc`).catch(() => [])
    ]);
    ctx.zonas = cargaZonasAtleta(zs, (perf || [])[0]);
    ctx.zonasDePerfil = ctx.zonas.some(z => z._perfil);

    // ---- sesiones de resistencia ----
    for (const p of ps || []) {
      if (!p.fecha) continue;
      const fecha = String(p.fecha).slice(0, 10), tipo = p.tipo || 'otro', deporte = CARGA_DEPORTE[tipo] || 'carrera';
      const titulo = String(p.descripcion || '').split(' — ')[0] || tipo;
      let mz = {}, estimado = false, metodo = null;
      if (Array.isArray(p.pasos) && p.pasos.length) { ({ mz, estimado } = cargaMinutosDePasos(p.pasos, ctx.zonas)); metodo = estimado ? 'pasos (estimado)' : 'pasos'; }
      const durPlan = Number(p.duracion_min) || ATLCarga.minutosTotales(mz) || 0;
      if (!ATLCarga.minutosTotales(mz) && durPlan && CARGA_ESTIMACION[tipo]) { mz = cargaEscalar(CARGA_ESTIMACION[tipo], durPlan); estimado = true; metodo = 'tipo (estimado)'; }
      const conZonas = ATLCarga.minutosTotales(mz) > 0;
      out.push(ATLCarga.normalizarSesion({ id: 'rp-' + p.id, fecha, estado: 'planificada', deporte, titulo, minutos_zona: conZonas ? mz : {}, duracion_min: durPlan }));
      if (p.estado === 'hecha') {
        const durReal = cargaNum(p.duracion_real_min) || durPlan;
        const base = ATLCarga.minutosTotales(mz);
        const s = { id: 'rr-' + p.id, fecha, estado: 'realizada', deporte, titulo, duracion_min: durReal,
          minutos_zona: conZonas && base && durReal ? cargaEscalar(mz, durReal / base) : {},
          rpe: cargaNum(p.rpe), distancia_km: cargaNum(p.km_reales), fuente: 'App', metodo_ecos: conZonas ? metodo : null,
          _estimado: estimado, _durManual: cargaNum(p.duracion_real_min) != null };
        out.push(s); realesRes.push(s);
      }
    }

    // ---- actividades de Strava ----
    const usadas = new Set();
    for (const a of acts || []) {
      const fecha = String(a.fecha || a.inicio || '').slice(0, 10); if (!fecha) continue;
      const deporte = CARGA_STRAVA_DEPORTE(a.tipo);
      if (deporte === 'fuerza' || deporte === 'otro') continue; // la fuerza entra por su registro en la app
      const min = a.duracion_s ? Math.round(a.duracion_s / 6) / 10 : 0;
      const km = a.distancia_m ? Math.round(a.distancia_m / 10) / 100 : null;
      const ritmo = a.distancia_m && a.duracion_s ? a.duracion_s / (a.distancia_m / 1000) : null;
      const rpeA = cargaNum(a.rpe ?? a.perceived_exertion);
      const s = realesRes.find(r => !usadas.has(r) && r.fecha === fecha && cargaCompatibles(r.deporte, deporte));
      if (s) {
        usadas.add(s);
        if (!s._durManual && min) {
          const base = ATLCarga.minutosTotales(s.minutos_zona);
          if (base) s.minutos_zona = cargaEscalar(s.minutos_zona, min / base);
          s.duracion_min = min;
        }
        if (s.distancia_km == null && km != null) s.distancia_km = km;
        if (a.desnivel_m != null) s.desnivel_m = Math.round(a.desnivel_m);
        if (s.rpe == null && rpeA != null) s.rpe = rpeA;
        s._fc = cargaNum(a.fc_media); s._ritmo = ritmo; s.fuente = 'App + Strava';
        info.stravaUnidas++;
        continue;
      }
      const s2 = { id: 'st-' + (a.strava_id || a.id), fecha, estado: 'realizada', deporte, titulo: a.nombre || 'Actividad de Strava',
        duracion_min: min, minutos_zona: {}, rpe: rpeA, distancia_km: km, desnivel_m: a.desnivel_m != null ? Math.round(a.desnivel_m) : null,
        fuente: 'Strava (extra)', _fc: cargaNum(a.fc_media), _ritmo: ritmo, _estimado: false };
      out.push(s2); realesRes.push(s2); info.stravaExtra++;
    }

    // ---- zonas y ECOs de lo realizado ----
    for (const s of realesRes) {
      cargaCompletarZonas(s, ctx, info);
      Object.assign(s, ATLCarga.normalizarSesion(Object.assign({}, s, { ecos: null })));
      if (s.ecos == null) s.metodo_ecos = null;
    }
  }

  // ---- fuerza (y carrera escrita con formato de fuerza) ----
  try {
    const ses = await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&select=id,fecha,titulo,bloques,registro`);
    for (const s of ses || []) {
      const d = parseFecha(s.fecha); if (!d) continue;
      const fecha = isoLocal(d), reg = (s.registro || {}).s || {};
      const rpe = cargaNum(reg.rpe); let min = cargaNum(reg.min);
      if (typeof esCarrera === 'function' && esCarrera(s)) {
        const r = aResistencia(s);
        out.push(ATLCarga.normalizarSesion({ id: 'fp-' + s.id, fecha, estado: 'planificada', deporte: 'carrera', titulo: r.nombre, duracion_min: r.duracion_min || 0 }));
        if (hecho(s)) {
          const x = { id: 'fr-' + s.id, fecha, estado: 'realizada', deporte: 'carrera', titulo: r.nombre, duracion_min: min ?? (r.duracion_min || 0), rpe, minutos_zona: {}, fuente: 'App' };
          cargaCompletarZonas(x, ctx, info);
          out.push(ATLCarga.normalizarSesion(x));
        }
        continue;
      }
      out.push(ATLCarga.normalizarSesion({ id: 'fp-' + s.id, fecha, estado: 'planificada', deporte: 'fuerza', titulo: s.titulo || 'Fuerza', duracion_min: 0 }));
      if (hecho(s)) {
        const sinMin = min == null; if (sinMin) min = CARGA_FUERZA_MIN;
        out.push(ATLCarga.normalizarSesion({ id: 'fr-' + s.id, fecha, estado: 'realizada', deporte: 'fuerza', titulo: s.titulo || 'Fuerza', duracion_min: min, rpe,
          fuente: 'App', metodo_ecos: null, _sinMin: sinMin }));
      }
    }
  } catch (e) {}

  // ---- recuento de datos ----
  const reales = out.filter(s => s.estado === 'realizada');
  Object.assign(info, {
    total: reales.length,
    sinRPE: reales.filter(s => s.rpe == null).length,
    sinEcos: reales.filter(s => s.deporte !== 'fuerza' && s.ecos == null).length,
    estimadas: reales.filter(s => s.ecos != null && /estimado/.test(s.metodo_ecos || '')).length,
    fuerzaSinMin: reales.filter(s => s._sinMin).length,
    zonasDePerfil: ctx.zonasDePerfil, sinZonas: !ctx.zonas.length
  });
  return { sesiones: out, info };
}

function cargaNota(info) {
  const p = [];
  if (info.stravaUnidas || info.stravaExtra) p.push(`Strava: ${info.stravaUnidas} actividad(es) unidas a su sesión${info.stravaExtra ? ` y ${info.stravaExtra} extra` : ''}`);
  if (info.sinRPE) p.push(`${info.sinRPE} de ${info.total} sesiones hechas sin RPE: no suman sRPE (el atleta lo pone en la sesión o en la actividad de Strava)`);
  if (info.sinEcos) p.push(`${info.sinEcos} de resistencia sin ECOs (sin pasos, sin FC/ritmo y sin RPE)`);
  if (info.estimadas) p.push(`${info.estimadas} con ECOs estimados`);
  if (info.sinZonas) p.push('el atleta no tiene zonas ni FC/ritmo umbral en su perfil: complétalo para calcular las zonas de Strava');
  else if (info.zonasDePerfil) p.push('zonas calculadas desde su perfil (no tiene zonas guardadas)');
  if (info.fuerzaSinMin) p.push(`${info.fuerzaSinMin} de fuerza sin duración (se cuentan ${CARGA_FUERZA_MIN} min)`);
  return p.length ? 'Datos: ' + p.join(' · ') + '.' : '';
}

async function cargaFuerzaCliente(clienteId) {
  const ses = await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&select=id,fecha,titulo,bloques,registro`).catch(() => []);
  const out = []; const info = { total: 0, sinRPE: 0, sinMin: 0, sinRIR: 0 };
  for (const s of ses || []) {
    if (!hecho(s) || (typeof esCarrera === 'function' && esCarrera(s))) continue;
    const d = parseFecha(s.fecha); if (!d) continue;
    const a = ATLFuerza.analizarSesion(Object.assign({}, s, { fecha: isoLocal(d) }), typeof normEj === 'function' ? normEj : null);
    out.push(a); info.total++;
    if (a.rpe == null) info.sinRPE++;
    if (a.min == null) info.sinMin++;
    if (a.ejerciciosSinEsfuerzo) info.sinRIR++;
    if (a.ejerciciosSinKg) info.sinKg = (info.sinKg || 0) + 1;
  }
  return { sesiones: out, info };
}
function cargaNotaFuerza(i) {
  const p = [];
  if (i.sinRPE) p.push(`${i.sinRPE} de ${i.total} sesiones sin «RPE total» (no suman sRPE)`);
  if (i.sinMin) p.push(`${i.sinMin} sin duración (no suman sRPE)`);
  if (i.sinRIR) p.push(`${i.sinRIR} con ejercicios sin RIR ni RPE (no cuentan como series duras)`);
  if (i.sinKg) p.push(`${i.sinKg} con ejercicios sin kg (no suman tonelaje ni estiman el 1RM)`);
  return p.length ? 'Datos: ' + p.join(' · ') + '.' : '';
}

async function tabCarga(host, clienteId, nombre) {
  $(host).innerHTML = `<div class="atl-carga"><div class="card cab-carga" style="padding:10px 14px"><div class="filtros">
      <label>Ver</label><div class="seg" id="carga-vista">
        <button aria-pressed="true" data-v="global">Global (resistencia + fuerza)</button>
        <button aria-pressed="false" data-v="fuerza">Fuerza</button></div></div></div></div>
    <div id="carga-cont"><div class="card"><p class="muted">Calculando la carga…</p></div></div>`;
  const cont = $('#carga-cont');
  const ver = async v => {
    document.querySelectorAll('#carga-vista button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    cont.innerHTML = '<div class="card"><p class="muted">Calculando la carga…</p></div>';
    try {
      if (v === 'fuerza') {
        const { sesiones, info } = await cargaFuerzaCliente(clienteId);
        if (!sesiones.length) { cont.innerHTML = `<div class="card"><h3>Carga de fuerza</h3><p class="muted">${esc(nombre || 'Este cliente')} todavía no tiene sesiones de fuerza registradas.</p></div>`; return; }
        ATLCargaUI.panelFuerza(cont, { sesiones, atleta: nombre, nota: cargaNotaFuerza(info) });
      } else {
        const { sesiones, info } = await cargaSesionesCliente(clienteId);
        if (!sesiones.some(s => s.estado === 'realizada')) { cont.innerHTML = `<div class="card"><h3>Control de carga</h3><p class="muted">${esc(nombre || 'Este cliente')} todavía no tiene sesiones hechas ni actividades de Strava.</p></div>`; return; }
            const desdeB = ATLCarga.fecha.sumarDias(ATLCarga.fecha.lunes(ATLCarga.fecha.hoyISO()), -7 * 11);
        const bien = typeof bienestarSemanal === 'function' ? await bienestarSemanal(clienteId, desdeB) : null;
        ATLCargaUI.panelEntrenador(cont, { sesiones, atleta: nombre, nota: cargaNota(info), detalle: true, bienestar: bien });
        if (typeof iaBarra === 'function') { cont.insertAdjacentHTML('afterbegin', iaBarra(clienteId)); iaActivar(clienteId); }
      }
    } catch (e) {
      cont.innerHTML = `<div class="card"><p class="muted">No se pudo calcular la carga: ${esc(e.message)}</p></div>`;
    }
  };
  document.querySelectorAll('#carga-vista button').forEach(b => b.onclick = () => ver(b.dataset.v));
  ver('global');
}

