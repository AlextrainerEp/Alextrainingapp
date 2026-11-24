/* =====================================================================
 * Alex Training Lab · Funciones añadidas sobre el control de carga
 *  1. Bienestar diario del entrenado (sueño, fatiga, dolor, ánimo)
 *  2. Aviso de sesiones hechas sin RPE
 *  3. Vista de carga simplificada para el entrenado
 *  4. Resumen de carga de todos los clientes (entrenador)
 * Usa funciones de la app: db, esc, $, isoLocal, parseFecha, shell.
 * ===================================================================== */

/* ---------- 1. Bienestar diario ---------- */
const BIEN_CAMPOS = [
  { k: 'sueno',  et: 'Sueño',            bajo: 'Muy mal',      alto: 'Muy bien',   escala: ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'] },
  { k: 'fatiga', et: 'Energía',          bajo: 'Agotado',      alto: 'Fresco',     escala: ['Agotado', 'Cansado', 'Normal', 'Fresco', 'Muy fresco'] },
  { k: 'dolor',  et: 'Agujetas / dolor', bajo: 'Muy dolorido', alto: 'Sin dolor',  escala: ['Muy dolorido', 'Dolorido', 'Algo', 'Poco', 'Sin dolor'] },
  { k: 'animo',  et: 'Ánimo',            bajo: 'Muy bajo',     alto: 'Muy bien',   escala: ['Muy bajo', 'Bajo', 'Normal', 'Bien', 'Muy bien'] }
];
const BIEN_CARAS = ['', '😖', '😕', '😐', '🙂', '😄'];

async function bienestarHoy(clienteId, fecha) {
  try { return (await db('GET', 'bienestar', `?cliente_id=eq.${clienteId}&fecha=eq.${fecha}&select=*`))[0] || null; }
  catch (e) { return e.message && /bienestar/.test(e.message) ? { __falta: true } : null; }
}

/** Tarjeta de bienestar para el entrenado. Se guarda al tocar, sin botón. */
/** Tarjeta «Hoy» del atleta: sus sesiones de hoy (fuerza y resistencia) y un botón que lleva a ellas. */
async function hoyCliente(host) {
  const el = typeof host === 'string' ? $(host) : host;
  if (!el) return;
  const hoy = isoLocal(new Date());
  let filas = [];
  try {
    const [ses, ats] = await Promise.all([
      db('GET', 'sesiones', `?cliente_id=eq.${S.user.id}&fecha=eq.${hoy}&select=id,fecha,titulo,bloques,registro`).catch(() => []),
      db('GET', 'atletas', `?user_id=eq.${S.user.id}&select=id`).catch(() => [])
    ]);
    (ses || []).forEach(s => {
      const n = (s.bloques || []).reduce((a, b) => a + ((b.ejercicios || []).length), 0);
      const hecha = Object.values(s.registro || {}).some(v => v && Object.entries(v).some(([k, x]) => k !== 'estado' && x !== '' && x != null));
      filas.push({ titulo: 'Entreno de fuerza', sub: `${n} ejercicio${n === 1 ? '' : 's'}`, hecha, tipo: 'fuerza' });
    });
    if (ats && ats.length) {
      const ps = await db('GET', 'sesiones_planificadas', `?atleta_id=in.(${ats.map(a => a.id).join(',')})&fecha=eq.${hoy}&select=id,tipo,descripcion,duracion_min,estado`).catch(() => []);
      (ps || []).forEach(p => filas.push({ titulo: String(p.descripcion || '').split(' — ')[0] || 'Sesión de resistencia',
        sub: p.duracion_min ? `${p.duracion_min} min` : '', hecha: p.estado === 'hecha', tipo: 'res' }));
    }
  } catch (e) { return; }
  if (!filas.length) {
    el.innerHTML = `<div class="card hoy-card hoy-vacio"><div class="hoy-tit">Hoy</div><p class="muted">Hoy no tienes entrenos programados. Descansa.</p></div>`;
    return;
  }
  const pendiente = filas.some(f => !f.hecha);
  el.innerHTML = `<div class="card hoy-card"><div class="hoy-tit">Hoy · ${esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
    ${filas.map(f => `<div class="hoy-item"><b>${esc(f.titulo)}</b><span class="muted">${esc(f.sub)}</span>${f.hecha ? '<span class="hoy-ok">✓ Hecha</span>' : ''}</div>`).join('')}
    <button type="button" class="gold hoy-btn" id="hoy-ir">${pendiente ? '▶ Empezar entrenamiento' : '✓ Ver lo registrado'}</button></div>`;
  $('#hoy-ir').onclick = () => {
    const obj = document.querySelector('#sub details.sesion, #sub details.sesion-res');
    if (!obj) return;
    obj.open = true;
    obj.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

async function tarjetaBienestar(host) {
  const hoy = isoLocal(new Date());
  const el = typeof host === 'string' ? $(host) : host;
  if (!el) return;
  const actual = await bienestarHoy(S.user.id, hoy) || {};
  if (actual.__falta) return;
  const val = Object.assign({}, actual);
  let abierta = false;   // cerrada por defecto; recuerda si el usuario la abrió
  const pintar = () => {
    const puesto = BIEN_CAMPOS.filter(c => val[c.k] != null).length;
    const estado = puesto === 4 ? 'Guardado ✓' : puesto === 0 ? '⏳ Pendiente · tarda 10 segundos' : `Faltan ${4 - puesto} de 4`;
    el.innerHTML = `<details class="card bien-card${puesto < 4 ? ' bien-pend' : ''}"${abierta ? ' open' : ''}>
      <summary class="bien-cab"><b>¿Cómo estás hoy?</b><span class="${puesto < 4 ? 'bien-aviso' : 'muted'}">${estado}</span></summary>
      ${BIEN_CAMPOS.map(c => `<div class="bien-fila"><span class="bien-et">${c.et}</span>
        <span class="bien-ops">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="bien-op${val[c.k] === n ? ' on' : ''}" data-b="${c.k}" data-v="${n}" title="${esc(c.escala[n - 1])}" aria-label="${esc(c.et)}: ${esc(c.escala[n - 1])}, ${n} de 5"><span class="bien-em">${BIEN_CARAS[n]}</span><small>${esc(c.escala[n - 1])}</small></button>`).join('')}</span></div>`).join('')}
      <div class="bien-msg muted" id="bien-msg"></div></details>`;
    const det = el.querySelector('.bien-card');
    if (det) det.addEventListener('toggle', () => { abierta = det.open; });
  };
  pintar();
  el.onclick = async ev => {
    const b = ev.target.closest('[data-b]'); if (!b) return;
    const k = b.dataset.b, v = Number(b.dataset.v);
    val[k] = val[k] === v ? null : v;
    pintar();
    const msg = $('#bien-msg');
    try {
      await db('POST', 'bienestar', '', { cliente_id: S.user.id, fecha: hoy, sueno: val.sueno ?? null, fatiga: val.fatiga ?? null, dolor: val.dolor ?? null, animo: val.animo ?? null },
        'resolution=merge-duplicates,return=minimal');
      if (msg) msg.textContent = 'Guardado ✓';
    } catch (e) { if (msg) msg.textContent = 'No se pudo guardar: ' + e.message; }
  };
}

/** Media de bienestar por semana, para el panel del entrenador. */
async function bienestarSemanal(clienteId, desde) {
  let datos = [];
  try { datos = await db('GET', 'bienestar', `?cliente_id=eq.${clienteId}&fecha=gte.${desde}&select=*&order=fecha.asc`); } catch (e) { return null; }
  if (!datos.length) return null;
  const F = ATLCarga.fecha, porSem = {};
  datos.forEach(d => {
    const k = F.lunes(d.fecha);
    porSem[k] = porSem[k] || { semana: k, n: 0, sueno: [], fatiga: [], dolor: [], animo: [] };
    porSem[k].n++;
    BIEN_CAMPOS.forEach(c => { if (d[c.k] != null) porSem[k][c.k].push(d[c.k]); });
  });
  const media = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  return Object.values(porSem).map(w => ({ semana: w.semana, dias: w.n, sueno: media(w.sueno), fatiga: media(w.fatiga), dolor: media(w.dolor), animo: media(w.animo),
    global: media([...w.sueno, ...w.fatiga, ...w.dolor, ...w.animo]) })).sort((a, b) => a.semana < b.semana ? -1 : 1);
}

/* ---------- 2. Aviso de sesiones hechas sin RPE ---------- */
/** Devuelve las sesiones hechas sin RPE de los últimos días (resistencia y fuerza). */
async function sesionesSinRPE(clienteId, dias = 14) {
  const desde = isoLocal(new Date(Date.now() - dias * 86400000));
  const out = [];
  try {
    const at = (await db('GET', 'atletas', `?user_id=eq.${clienteId}&select=id`)).map(a => a.id);
    if (at.length) {
      const ps = await db('GET', 'sesiones_planificadas', `?atleta_id=in.(${at.join(',')})&estado=eq.hecha&fecha=gte.${desde}&select=id,fecha,tipo,descripcion,rpe&order=fecha.desc`);
      (ps || []).forEach(p => { if (p.rpe == null) out.push({ tipo: 'res', id: p.id, fecha: p.fecha, nombre: String(p.descripcion || p.tipo || 'Sesión').split(' — ')[0] }); });
    }
  } catch (e) {}
  try {
    const ses = await db('GET', 'sesiones', `?cliente_id=eq.${clienteId}&select=id,fecha,titulo,bloques,registro`);
    (ses || []).forEach(s => {
      const d = parseFecha(s.fecha); if (!d || isoLocal(d) < desde) return;
      if (!hecho(s)) return;
      const r = (s.registro || {}).s || {};
      if (r.rpe === '' || r.rpe == null) out.push({ tipo: 'fza', id: s.id, fecha: isoLocal(d), nombre: s.titulo || 'Fuerza' });
    });
  } catch (e) {}
  return out.sort((a, b) => a.fecha < b.fecha ? 1 : -1);
}

/** Pinta el aviso al principio del panel del entrenado, si hay sesiones sin esfuerzo. */
async function avisoRPE(host, alAbrir) {
  const el = typeof host === 'string' ? $(host) : host;
  if (!el) return;
  const faltan = await sesionesSinRPE(S.user.id);
  if (!faltan.length) { el.innerHTML = ''; return; }
  const fTxt = f => { const d = new Date(f + 'T00:00:00'); return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }); };
  el.innerHTML = `<div class="card aviso-rpe"><b>⚡ Te falta decir cómo de duras fueron ${faltan.length === 1 ? 'una sesión' : faltan.length + ' sesiones'}</b>
    <p class="muted">Sin el esfuerzo (RPE) no se puede calcular tu carga. Toca una para apuntarlo.</p>
    ${faltan.slice(0, 6).map(f => `<button class="sec aviso-rpe-b" data-f="${esc(f.fecha)}" data-t="${f.tipo}">${esc(fTxt(f.fecha))} · ${esc(f.nombre)}</button>`).join('')}
    ${faltan.length > 6 ? `<p class="muted">y ${faltan.length - 6} más</p>` : ''}</div>`;
  el.querySelectorAll('.aviso-rpe-b').forEach(b => b.onclick = () => alAbrir && alAbrir(b.dataset.f, b.dataset.t));
}

/* ---------- 3. Vista de carga del entrenado (simplificada) ---------- */
const CARGA_CLI = { unidad: 'semana', n: null, desplaz: 0 };

async function tabCargaCliente(host) {
  const el = typeof host === 'string' ? $(host) : host;
  el.innerHTML = '<div class="card"><p class="muted">Calculando tu carga…</p></div>';
  let datos;
  try { datos = await cargaSesionesCliente(S.user.id); }
  catch (e) { el.innerHTML = `<div class="card"><p class="muted">No se pudo calcular tu carga: ${esc(e.message)}</p></div>`; return; }
  const { sesiones } = datos;
  if (!sesiones.some(s => s.estado === 'realizada')) {
    el.innerHTML = '<div class="card"><h3>Tu carga</h3><p class="muted">Todavía no tienes sesiones hechas. Cuando marques alguna y digas cómo de dura fue, aquí verás tu carga.</p></div>';
    return;
  }
  const bien = await bienestarSemanal(S.user.id, ATLCarga.fecha.sumarDias(ATLCarga.fecha.hoyISO(), -84));
  pintarCargaCliente(el, sesiones, bien);
}

function pintarCargaCliente(el, sesiones, bien) {
  const F = ATLCarga.fecha, hoy = F.hoyISO();
  const U = CARGA_CLI.unidad, P = ATLCarga.PERIODOS[U];
  const cuantos = CARGA_CLI.n || (U === 'semana' ? 8 : U === 'mes' ? 12 : U === 'semestre' ? 6 : 5);
  const finVista = CARGA_CLI.desplaz === 0 ? hoy
    : F.finPeriodo(U, F.moverPeriodo(U, F.inicioPeriodo(U, hoy), -CARGA_CLI.desplaz));
  const sem = ATLCarga.resumenPeriodo(sesiones, { unidad: U, n: cuantos, hasta: finVista });
  const finDatos = sem[sem.length - 1].fin > finVista ? finVista : sem[sem.length - 1].fin;
  const desde = F.sumarDias(sem[0].semana, -56);
  const diario = ATLCarga.serieDiaria(sesiones.map(ATLCarga.normalizarSesion), desde, finDatos, 'srpe');
  const ac = ATLCarga.agudoCronico(diario), ff = ATLCarga.formaFatiga(diario);
  const ult = [...ac].reverse().find(x => x.ratio != null), f = ff[ff.length - 1];
  const act = sem[sem.length - 1], ant = sem[sem.length - 2] || {};
  const n = x => x == null ? '—' : String(Math.round(x)).replace('.', ',');
  const uNom = P.nombre.toLowerCase();

  let est = { t: 'Carga normal', d: 'Vas en línea con lo que llevas entrenando.', c: 'ok' };
  if (ult && ult.ratio > 1.5) est = { t: 'Semana muy fuerte', d: 'Has subido bastante de golpe. Cuida el descanso y el sueño estos días.', c: 'alto' };
  else if (ult && ult.ratio > 1.3) est = { t: 'Carga alta', d: 'Estás entrenando por encima de tu media. Atento a cómo te recuperas.', c: 'medio' };
  else if (ult && ult.ratio < 0.8) est = { t: 'Semana suave', d: 'Estás por debajo de tu media. Bien si toca descargar.', c: 'info' };
  const bs = bien && bien[bien.length - 1];
  const rango = `${F.parse(sem[0].semana).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })} – ${F.parse(finDatos).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}`;

  el.innerHTML = `<div class="card"><h3>Tu carga</h3>
    <div class="cli-estado ${est.c}"><b>${esc(est.t)}</b><p>${esc(est.d)}</p></div>
    <div class="cli-filtros">
      <span class="cli-et">Ver por</span>
      <span class="cli-seg">${Object.entries(ATLCarga.PERIODOS).map(([k, p]) => `<button data-u="${k}"${U === k ? ' class="on"' : ''}>${p.nombre}</button>`).join('')}</span>
      <span class="carga-nav">
        <button data-mov="-1" aria-label="${esc(P.nombre)} anterior" title="${esc(P.nombre)} anterior">‹</button>
        <span class="cli-rango">${esc(rango)}</span>
        <button data-mov="1" aria-label="${esc(P.nombre)} siguiente" title="${esc(P.nombre)} siguiente"${CARGA_CLI.desplaz === 0 ? ' disabled' : ''}>›</button>
        ${CARGA_CLI.desplaz ? '<button data-hoy class="hoy">Hoy</button>' : ''}
      </span>
    </div>
    <div class="cli-kpis">
      <div><span class="l">${esc(act.etiqueta)}</span><span class="v">${n(act.srpe)}</span><span class="d">unidades de carga${ant.srpe ? ` · ${esc(uNom)} anterior ${n(ant.srpe)}` : ''}</span></div>
      <div><span class="l">Sesiones</span><span class="v">${act.sesiones}</span><span class="d">${n(act.minutos)} min${act.km ? ` · ${String(act.km).replace('.', ',')} km` : ''}</span></div>
      <div><span class="l">Frescura</span><span class="v">${f && f.balance > 0 ? '🟢' : f && f.balance > -10 ? '🟡' : '🔴'}</span><span class="d">${f && f.balance > 0 ? 'descansado' : f && f.balance > -10 ? 'con algo de fatiga' : 'cansado'}</span></div>
      ${bs ? `<div><span class="l">Cómo te sientes</span><span class="v">${BIEN_CARAS[Math.round(bs.global)] || '—'}</span><span class="d">${bs.dias} día(s) apuntados</span></div>` : ''}
    </div>
    <div id="cli-graf"></div>
    <p class="muted" style="margin-top:10px">Cada barra es ${U === 'semana' ? 'una semana' : U === 'mes' ? 'un mes' : U === 'semestre' ? 'medio año' : 'un año'}; la última, más clara, es ${U === 'semana' ? 'la que llevas ahora' : 'el periodo en curso'}. La carga de cada sesión son los minutos multiplicados por lo dura que te pareció (del 1 al 10).</p>
  </div>`;

  const max = Math.max(1, ...sem.map(w => w.srpe || 0));
  $('#cli-graf').innerHTML = `<div class="cli-barras${sem.length > 8 ? ' densa' : ''}">${sem.map(w => {
    const alto = Math.round((w.srpe || 0) / max * 100);
    return `<div class="cli-barra${w.enCurso ? ' curso' : ''}" title="${esc(w.etiqueta)}${w.enCurso ? ' (en curso)' : ''}: ${n(w.srpe)}"><span style="height:${alto}%"></span><small>${esc(w.etiqueta)}</small></div>`;
  }).join('')}</div>`;

  el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { CARGA_CLI.unidad = b.dataset.u; CARGA_CLI.n = null; CARGA_CLI.desplaz = 0; pintarCargaCliente(el, sesiones, bien); });
  el.querySelectorAll('[data-mov]').forEach(b => b.onclick = () => { CARGA_CLI.desplaz = Math.max(0, CARGA_CLI.desplaz - Number(b.dataset.mov)); pintarCargaCliente(el, sesiones, bien); });
  const bh = el.querySelector('[data-hoy]');
  if (bh) bh.onclick = () => { CARGA_CLI.desplaz = 0; pintarCargaCliente(el, sesiones, bien); };
}

/* ---------- 4. Resumen de carga de todos los clientes ---------- */
async function tabResumenCarga() {
  shell(`<div id="tab"><div class="an-panel"><h2 class="ent-tit">Carga de todos</h2><div id="res-carga"><p class="muted">Calculando…</p></div></div></div>`);
  navSet('<button id="volver">← Clientes</button><button class="on">📈 Carga de todos</button>');
  $('#volver').onclick = listaClientes;
  const cs = await db('GET', 'perfiles', '?rol=eq.cliente&order=nombre.asc&select=id,nombre');
  const hasta = ATLCarga.fecha.hoyISO();
  const filas = [];
  for (const c of cs) {
    try {
      const { sesiones } = await cargaSesionesCliente(c.id);
      const reales = sesiones.filter(s => s.estado === 'realizada');
      if (!reales.length) { filas.push({ c, vacio: true }); continue; }
      const sem = ATLCarga.resumenSemanal(sesiones, { semanas: 6, hasta });
      const desde = ATLCarga.fecha.sumarDias(sem[0].semana, -56);
      const ac = ATLCarga.agudoCronico(ATLCarga.serieDiaria(sesiones.map(ATLCarga.normalizarSesion), desde, hasta, 'srpe'));
      const al = ATLCarga.alertas(sem, ac);
      const ult = [...ac].reverse().find(x => x.ratio != null);
      const act = sem[sem.length - 1];
      const ultima = reales.map(s => s.fecha).sort().pop();
      filas.push({ c, act, ratio: ult && ult.ratio, al, ultima, sinRPE: reales.filter(s => s.rpe == null).length });
    } catch (e) { filas.push({ c, error: e.message }); }
  }
  const orden = { alto: 0, medio: 1, info: 2, ok: 3 };
  filas.sort((a, b) => (orden[(a.al || [{}])[0].nivel] ?? 4) - (orden[(b.al || [{}])[0].nivel] ?? 4));
  const n = x => x == null ? '—' : String(Math.round(x));
  const dias = f => { if (!f) return '—'; const d = Math.round((new Date(hasta) - new Date(f)) / 86400000); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
  $('#res-carga').innerHTML = `<p class="muted">Ordenado por urgencia. Toca un entrenado para abrir su ficha.</p>
    ${filas.map(f => {
      if (f.vacio) return `<button class="res-fila vacia" data-c="${f.c.id}"><b>${esc(f.c.nombre || 'Sin nombre')}</b><span class="muted">Sin sesiones hechas todavía</span></button>`;
      if (f.error) return `<button class="res-fila" data-c="${f.c.id}"><b>${esc(f.c.nombre || 'Sin nombre')}</b><span class="muted">No se pudo calcular: ${esc(f.error)}</span></button>`;
      const a = f.al[0] || { nivel: 'ok', texto: '' };
      return `<button class="res-fila" data-c="${f.c.id}">
        <span class="res-cab"><b>${esc(f.c.nombre || 'Sin nombre')}</b><span class="chip ${a.nivel}">${{ alto: 'Alto', medio: 'Atención', info: 'Info', ok: 'OK' }[a.nivel]}</span></span>
        <span class="res-datos">${n(f.act.srpe)} UA esta semana · ratio ${f.ratio == null ? '—' : String(f.ratio).replace('.', ',')} · ${f.act.sesiones} sesión(es) · última ${dias(f.ultima)}${f.sinRPE ? ` · ${f.sinRPE} sin RPE` : ''}</span>
        <span class="res-aviso">${esc(a.texto)}</span></button>`;
    }).join('')}`;
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => fichaCliente(b.dataset.c));
}

/* ---------- 5. Deshacer el último borrado ---------- */
let ULTIMO_BORRADO = null;
/** Vuelve a crear las sesiones borradas en el último borrado de ese cliente. */
async function restaurarBorradas(clienteId) {
  const b = ULTIMO_BORRADO;
  if (!b || b.clienteId !== clienteId || !b.lista || !b.lista.length) throw new Error('No hay nada que restaurar');
  const limpia = x => { const o = Object.assign({}, x); ['_res', '_fun', 'created_at'].forEach(k => delete o[k]); return o; };
  const fza = b.lista.filter(x => !x._res).map(limpia);
  const res = b.lista.filter(x => x._res).map(limpia);
  const meter = async (tabla, filas) => {
    if (!filas.length) return;
    try { await db('POST', tabla, '', filas, 'resolution=merge-duplicates,return=minimal'); }
    catch (e) { await db('POST', tabla, '', filas.map(f => { const o = Object.assign({}, f); delete o.id; return o; }), 'return=minimal'); }
  };
  await meter('sesiones', fza);
  await meter('sesiones_planificadas', res);
  ULTIMO_BORRADO = null;
}
