/* =====================================================================
 * Alex Training Lab · Módulo de CARGA (motor de cálculo)
 * ECOs (Cejuela y Esteve-Lanao) + sRPE (Foster) + métricas de control.
 * Sin dependencias. Se expone como window.ATLCarga (y module.exports en Node).
 * ===================================================================== */
(function (global) {
  'use strict';

  // ---------- Escala ECOs (valor por minuto en cada zona) ----------
  const ZONAS = [
    { id: 'z1', valor: 1,  corto: 'Z1',  nombre: 'Por debajo de VT1',      ejemplo: 'Rodaje suave, calentamiento',  app: 'Z1' },
    { id: 'z2', valor: 2,  corto: 'Z2',  nombre: 'Umbral aeróbico (VT1)',  ejemplo: 'Rodaje medio, tirada larga',   app: 'Z2' },
    { id: 'z3', valor: 3,  corto: 'Z3',  nombre: 'Entre umbrales',         ejemplo: 'Ritmo maratón',                app: 'Z3' },
    { id: 'z4', valor: 4,  corto: 'Z4',  nombre: 'Umbral anaeróbico (VT2)',ejemplo: 'Continuo a umbral, ritmo media', app: 'Z4' },
    { id: 'z5', valor: 6,  corto: 'Z5a', nombre: 'VT2 – VAM',              ejemplo: 'Series 3–5 min (ritmo 5–10K)', app: 'Z5' },
    { id: 'z6', valor: 9,  corto: 'Z5b', nombre: 'VAM / VO2máx',           ejemplo: 'Series a VAM',                 app: 'Z5' },
    { id: 'z7', valor: 15, corto: 'Z6',  nombre: 'Capacidad láctica',      ejemplo: 'Series anaeróbicas largas',    app: '—'  },
    { id: 'z8', valor: 50, corto: 'Z7',  nombre: 'Potencia láctica',       ejemplo: 'Esfuerzos máximos cortos',     app: '—'  }
  ];

  // Coeficiente por deporte (carrera = referencia). Fuerza no tiene ECOs: se controla con sRPE.
  const DEPORTES = {
    carrera:  { nombre: 'Carrera',  coef: 1 },
    trail:    { nombre: 'Trail',    coef: 1 },     // en trail, zonas por FC (no por ritmo)
    ciclismo: { nombre: 'Ciclismo', coef: 0.5 },
    natacion: { nombre: 'Natación', coef: 0.75 },
    fuerza:   { nombre: 'Fuerza',   coef: null },
    otro:     { nombre: 'Otro',     coef: null }
  };

  // Umbrales orientativos (coinciden con el Método ATL: subidas ≤10–15 %/sem, A:C 0,8–1,3, descarga cada 3–4 sem)
  const UMBRALES = {
    subidaSemanalMax: 0.15,
    acMin: 0.8, acMax: 1.3, acAlto: 1.5,
    monotoniaMax: 2.0,
    costeSubida: 0.15,            // sRPE/ECO > 15 % sobre su media de 4 semanas → fatiga
    cumplimientoMin: 0.8, cumplimientoMax: 1.15,
    semanasSubiendoParaDescarga: 3
  };

  // ---------- utilidades de fecha (siempre en local, formato AAAA-MM-DD) ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const sumarDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = s => { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
  const hoyISO = () => iso(new Date());
  const r1 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;

  // ---------- cálculos por sesión ----------
  function calcularECOs(minutosZona, deporte) {
    const coef = (DEPORTES[deporte] || DEPORTES.carrera).coef;
    if (coef == null) return null;
    let base = 0;
    for (const z of ZONAS) base += (Number(minutosZona && minutosZona[z.id]) || 0) * z.valor;
    return r1(base * coef);
  }

  function calcularSRPE(duracionMin, rpe) {
    if (rpe == null || rpe === '') return null;
    return r1((Number(duracionMin) || 0) * Number(rpe));
  }

  function minutosTotales(minutosZona) {
    return ZONAS.reduce((a, z) => a + (Number(minutosZona && minutosZona[z.id]) || 0), 0);
  }

  /** Completa ecos/srpe de una sesión (no muta el original). */
  function normalizarSesion(s) {
    const out = Object.assign({ estado: 'realizada', deporte: 'carrera', minutos_zona: {} }, s);
    if (!out.duracion_min) out.duracion_min = minutosTotales(out.minutos_zona);
    // Recalcula ECOs si no vienen y hay minutos por zona (sin zonas, p. ej. Strava sin FC, quedan en null)
    if (out.ecos == null) out.ecos = minutosTotales(out.minutos_zona) > 0 ? calcularECOs(out.minutos_zona, out.deporte) : null;
    out.srpe = calcularSRPE(out.duracion_min, out.rpe);
    return out;
  }

  // ---------- series diarias ----------
  /** Devuelve [{fecha, valor}] día a día entre desde y hasta (ambos incluidos), con 0 en días sin sesión. */
  function serieDiaria(sesiones, desde, hasta, campo = 'srpe', estado = 'realizada') {
    const mapa = {};
    for (const s of sesiones) {
      if (s.estado !== estado) continue;
      const v = Number(s[campo]);
      if (!isFinite(v)) continue;
      const f = String(s.fecha).slice(0, 10);
      mapa[f] = (mapa[f] || 0) + v;
    }
    const out = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push({ fecha: f, valor: mapa[f] || 0 });
    return out;
  }

  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const desv = a => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

  // ---------- periodos: semana, mes, semestre y año ----------
  const PERIODOS = {
    semana:   { nombre: 'Semana',   corto: 'sem',  porDefecto: 12 },
    mes:      { nombre: 'Mes',      corto: 'mes',  porDefecto: 12 },
    semestre: { nombre: 'Semestre', corto: 'sem.', porDefecto: 6 },
    anio:     { nombre: 'Año',      corto: 'año',  porDefecto: 5 }
  };

  /** Primer día del periodo que contiene esa fecha. */
  function inicioPeriodo(unidad, f) {
    const d = parse(f);
    if (unidad === 'semana') return lunes(f);
    if (unidad === 'mes') return iso(new Date(d.getFullYear(), d.getMonth(), 1));
    if (unidad === 'semestre') return iso(new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1));
    return iso(new Date(d.getFullYear(), 0, 1));
  }
  /** Mueve n periodos (negativo = hacia atrás) desde el inicio de uno. */
  function moverPeriodo(unidad, ini, n) {
    const d = parse(ini);
    if (unidad === 'semana') return sumarDias(ini, 7 * n);
    if (unidad === 'mes') return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
    if (unidad === 'semestre') return iso(new Date(d.getFullYear(), d.getMonth() + 6 * n, 1));
    return iso(new Date(d.getFullYear() + n, 0, 1));
  }
  /** Último día del periodo. */
  const finPeriodo = (unidad, ini) => sumarDias(moverPeriodo(unidad, ini, 1), -1);

  /** Etiqueta corta para los ejes y la tabla. */
  function etiquetaPeriodo(unidad, ini) {
    const d = parse(ini);
    if (unidad === 'semana') return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
    if (unidad === 'mes') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace('.', '');
    if (unidad === 'semestre') return (d.getMonth() < 6 ? '1.er sem ' : '2.º sem ') + d.getFullYear();
    return String(d.getFullYear());
  }

  // ---------- resumen semanal (lunes a domingo) ----------
  function resumenSemanal(sesiones, { semanas = 12, hasta = hoyISO() } = {}) {
    const ses = sesiones.map(normalizarSesion);
    const ultimoLunes = lunes(hasta);
    const primerLunes = sumarDias(ultimoLunes, -7 * (semanas - 1));
    const dSrpe = serieDiaria(ses, primerLunes, sumarDias(ultimoLunes, 6), 'srpe');
    const out = [];
    for (let i = 0; i < semanas; i++) {
      const ini = sumarDias(primerLunes, 7 * i), fin = sumarDias(ini, 6);
      const enSemana = ses.filter(s => s.fecha >= ini && s.fecha <= fin);
      const real = enSemana.filter(s => s.estado === 'realizada');
      const plan = enSemana.filter(s => s.estado === 'planificada');
      const diarios = dSrpe.slice(i * 7, i * 7 + 7).map(d => d.valor);
      const srpe = real.reduce((a, s) => a + (s.srpe || 0), 0);
      const ecosReal = real.reduce((a, s) => a + (s.ecos || 0), 0);
      const ecosPlan = plan.reduce((a, s) => a + (s.ecos || 0), 0);
      const enCurso = hasta < fin;
      // en la semana en curso, el cumplimiento se mide solo contra lo planificado hasta hoy
      const ecosPlanHastaHoy = plan.filter(s => s.fecha <= hasta).reduce((a, s) => a + (s.ecos || 0), 0);
      const ecosRealConPlan = real.filter(s => s.ecos != null).reduce((a, s) => a + s.ecos, 0);
      const srpeConEcos = real.filter(s => s.ecos != null && s.srpe != null).reduce((a, s) => a + s.srpe, 0);
      const sd = desv(diarios);
      const monotonia = sd > 0 ? media(diarios) / sd : (srpe > 0 ? null : 0);
      out.push({
        semana: ini, fin, unidad: 'semana', etiqueta: etiquetaPeriodo('semana', ini),
        sesiones: real.length, sesionesPlan: plan.length,
        minutos: r1(real.reduce((a, s) => a + (Number(s.duracion_min) || 0), 0)),
        km: r1(real.reduce((a, s) => a + (Number(s.distancia_km) || 0), 0)),
        desnivel: Math.round(real.reduce((a, s) => a + (Number(s.desnivel_m) || 0), 0)),
        ecosPlan: r1(ecosPlan), ecosReal: r1(ecosReal),
        cumplimiento: ecosPlanHastaHoy > 0 ? r2(ecosRealConPlan / ecosPlanHastaHoy) : null,
        enCurso,
        srpe: r1(srpe),
        srpeFuerza: r1(real.filter(s => s.deporte === 'fuerza').reduce((a, s) => a + (s.srpe || 0), 0)),
        monotonia: r2(monotonia),
        strain: monotonia == null ? null : Math.round(srpe * monotonia),
        coste: ecosRealConPlan > 0 && srpeConEcos > 0 ? r2(srpeConEcos / ecosRealConPlan) : null, // UA de sRPE por cada ECO
        variacion: null, sobreMax4: null
      });
    }
    for (let i = 1; i < out.length; i++) {
      if (out[i].enCurso) continue; // una semana a medias no se compara
      const prev = out[i - 1].srpe, cur = out[i].srpe;
      out[i].variacion = prev > 0 ? r2((cur - prev) / prev) : null;
      // subida respecto a la semana más alta de las 4 anteriores (evita falsos avisos al volver de una descarga)
      const max4 = Math.max(0, ...out.slice(Math.max(0, i - 4), i).map(w => w.srpe || 0));
      out[i].sobreMax4 = max4 > 0 ? r2((cur - max4) / max4) : null;
    }
    return out;
  }

  /**
   * Resumen por periodo (semana, mes, semestre o año).
   * Las sumas se calculan con las sesiones de cada periodo; la monotonía y el strain
   * vienen de las semanas que empiezan dentro de él, porque están definidos por semana.
   */
  function resumenPeriodo(sesiones, { unidad = 'semana', n = null, hasta = hoyISO() } = {}) {
    const cuantos = n || (PERIODOS[unidad] || PERIODOS.semana).porDefecto;
    if (unidad === 'semana') return resumenSemanal(sesiones, { semanas: cuantos, hasta });
    const ses = sesiones.map(normalizarSesion);
    const ultimo = inicioPeriodo(unidad, hasta);
    const primero = moverPeriodo(unidad, ultimo, -(cuantos - 1));
    // semanas que abarcan todo el rango, para monotonía y strain
    const semanasTot = Math.ceil((parse(sumarDias(hasta, 7)) - parse(lunes(primero))) / (7 * 86400000)) + 1;
    const sem = resumenSemanal(sesiones, { semanas: Math.max(1, semanasTot), hasta });
    const out = [];
    for (let i = 0; i < cuantos; i++) {
      const ini = moverPeriodo(unidad, primero, i), fin = finPeriodo(unidad, ini);
      const dentro = ses.filter(x => x.fecha >= ini && x.fecha <= fin);
      const real = dentro.filter(x => x.estado === 'realizada');
      const plan = dentro.filter(x => x.estado === 'planificada');
      const semEn = sem.filter(w => w.semana >= ini && w.semana <= fin);
      const monots = semEn.map(w => w.monotonia).filter(x => x != null);
      const ecosRealConPlan = real.filter(x => x.ecos != null).reduce((a, x) => a + x.ecos, 0);
      const srpeConEcos = real.filter(x => x.ecos != null && x.srpe != null).reduce((a, x) => a + x.srpe, 0);
      const ecosPlanHastaHoy = plan.filter(x => x.fecha <= hasta).reduce((a, x) => a + (x.ecos || 0), 0);
      const srpe = real.reduce((a, x) => a + (x.srpe || 0), 0);
      out.push({
        semana: ini, fin, unidad, etiqueta: etiquetaPeriodo(unidad, ini), enCurso: hasta < fin,
        sesiones: real.length, sesionesPlan: plan.length,
        minutos: r1(real.reduce((a, x) => a + (Number(x.duracion_min) || 0), 0)),
        km: r1(real.reduce((a, x) => a + (Number(x.distancia_km) || 0), 0)),
        desnivel: Math.round(real.reduce((a, x) => a + (Number(x.desnivel_m) || 0), 0)),
        ecosPlan: r1(plan.reduce((a, x) => a + (x.ecos || 0), 0)), ecosReal: r1(real.reduce((a, x) => a + (x.ecos || 0), 0)),
        cumplimiento: ecosPlanHastaHoy > 0 ? r2(ecosRealConPlan / ecosPlanHastaHoy) : null,
        srpe: r1(srpe), srpeFuerza: r1(real.filter(x => x.deporte === 'fuerza').reduce((a, x) => a + (x.srpe || 0), 0)),
        monotonia: monots.length ? r2(monots.reduce((a, b) => a + b, 0) / monots.length) : null,
        strain: semEn.reduce((a, w) => a + (w.strain || 0), 0) || null,
        coste: ecosRealConPlan > 0 && srpeConEcos > 0 ? r2(srpeConEcos / ecosRealConPlan) : null,
        semanas: semEn.length, variacion: null, sobreMax4: null
      });
    }
    for (let i = 1; i < out.length; i++) {
      if (out[i].enCurso) continue;
      const prev = out[i - 1].srpe;
      out[i].variacion = prev > 0 ? r2((out[i].srpe - prev) / prev) : null;
    }
    return out;
  }

  // ---------- agudo:crónico y fitness/fatiga ----------
  /** Ratio agudo:crónico diario. metodo 'media' (7 d / media de 4 semanas) o 'ewma'. */
  function agudoCronico(diario, { metodo = 'ewma', aguda = 7, cronica = 28 } = {}) {
    const out = [];
    if (metodo === 'ewma') {
      const la = 2 / (aguda + 1), lc = 2 / (cronica + 1);
      let a = 0, c = 0;
      diario.forEach((d, i) => {
        a = d.valor * la + (1 - la) * a;
        c = d.valor * lc + (1 - lc) * c;
        out.push({ fecha: d.fecha, aguda: r1(a), cronica: r1(c), ratio: i >= cronica - 1 && c > 0 ? r2(a / c) : null });
      });
    } else {
      diario.forEach((d, i) => {
        if (i < cronica - 1) { out.push({ fecha: d.fecha, aguda: null, cronica: null, ratio: null }); return; }
        const a = diario.slice(i - aguda + 1, i + 1).reduce((s, x) => s + x.valor, 0);
        const c = diario.slice(i - cronica + 1, i + 1).reduce((s, x) => s + x.valor, 0) / (cronica / aguda);
        out.push({ fecha: d.fecha, aguda: r1(a), cronica: r1(c), ratio: c > 0 ? r2(a / c) : null });
      });
    }
    return out;
  }

  /** Modelo de Banister simplificado: forma (CTL 42 d), fatiga (ATL 7 d) y balance (TSB = CTL − ATL). */
  function formaFatiga(diario, { ctl = 42, atl = 7 } = {}) {
    let C = 0, A = 0;
    const kc = 1 - Math.exp(-1 / ctl), ka = 1 - Math.exp(-1 / atl);
    return diario.map(d => {
      const tsb = C - A; // balance del día (antes de entrenar)
      C = C + (d.valor - C) * kc;
      A = A + (d.valor - A) * ka;
      return { fecha: d.fecha, forma: r1(C), fatiga: r1(A), balance: r1(tsb) };
    });
  }

  // ---------- alertas para el entrenador ----------
  function alertas(semanal, ac, u = UMBRALES) {
    const res = [];
    const n = semanal.length;
    if (!n) return res;
    const enCurso = semanal[n - 1];
    const iRef = enCurso.enCurso && n > 1 ? n - 2 : n - 1;   // métricas semanales: última semana completa
    const act = semanal[iRef];
    const ultimaRatio = [...ac].reverse().find(x => x.ratio != null);
    const fmtPct = x => `${Math.round(x * 100)} %`;
    const n2 = x => String(x).replace('.', ',');

    if (act.sobreMax4 != null && act.sobreMax4 > u.subidaSemanalMax)
      res.push({ nivel: 'alto', texto: `La semana pasada la carga superó en un ${fmtPct(act.sobreMax4)} a la semana más alta del último mes (máximo recomendado ${fmtPct(u.subidaSemanalMax)}).` });
    if (ultimaRatio) {
      if (ultimaRatio.ratio > u.acAlto) res.push({ nivel: 'alto', texto: `Ratio agudo:crónico de ${n2(ultimaRatio.ratio)}: pico brusco de carga. Conviene suavizar los próximos días.` });
      else if (ultimaRatio.ratio > u.acMax) res.push({ nivel: 'medio', texto: `Ratio agudo:crónico de ${n2(ultimaRatio.ratio)}, por encima de ${n2(u.acMax)}. Vigila la recuperación.` });
      else if (ultimaRatio.ratio < u.acMin) res.push({ nivel: 'info', texto: `Ratio agudo:crónico de ${n2(ultimaRatio.ratio)}: está entrenando por debajo de su base (bien si es descarga; si no, te quedas corto).` });
    }
    if (act.monotonia != null && act.monotonia > u.monotoniaMax)
      res.push({ nivel: 'medio', texto: `Monotonía de ${n2(act.monotonia)} la semana pasada (> ${n2(u.monotoniaMax)}): todos los días se parecen demasiado. Alterna días duros y suaves.` });
    const costesPrev = semanal.slice(Math.max(0, iRef - 4), iRef).map(s => s.coste).filter(x => x != null);
    if (act.coste != null && costesPrev.length >= 2) {
      const m = media(costesPrev);
      if (act.coste > m * (1 + u.costeSubida))
        res.push({ nivel: 'alto', texto: `La semana pasada, la misma carga objetiva le costó un ${fmtPct(act.coste / m - 1)} más (sRPE/ECO ${n2(act.coste)} frente a ${n2(r2(m))}): posible fatiga acumulada.` });
      else if (act.coste < m * (1 - u.costeSubida))
        res.push({ nivel: 'ok', texto: `La semana pasada le costó un ${fmtPct(1 - act.coste / m)} menos que su media para la misma carga: buena adaptación, puedes progresar.` });
    }
    const cu = enCurso.cumplimiento, cuTxt = enCurso.enCurso ? 'en lo que va de semana' : 'esta semana';
    if (cu != null) {
      if (cu < u.cumplimientoMin) res.push({ nivel: 'info', texto: `Ha completado el ${fmtPct(cu)} de los ECOs planificados ${cuTxt}.` });
      else if (cu > u.cumplimientoMax) res.push({ nivel: 'medio', texto: `Ha hecho el ${fmtPct(cu)} de los ECOs planificados ${cuTxt}: se está pasando de lo previsto.` });
    }
    let subidas = 0;
    for (let i = iRef; i > 0 && semanal[i].variacion != null && semanal[i].variacion > 0; i--) subidas++;
    if (subidas >= u.semanasSubiendoParaDescarga)
      res.push({ nivel: 'medio', texto: `Lleva ${subidas} semanas seguidas subiendo carga: toca planificar una semana de descarga.` });
    if (!res.length) res.push({ nivel: 'ok', texto: 'Carga dentro de rangos. Sin avisos esta semana.' });
    return res;
  }

  // ---------- Strava → sesión ----------
  const MAPA_STRAVA = {
    Run: 'carrera', VirtualRun: 'carrera', TrailRun: 'trail', Hike: 'trail',
    Ride: 'ciclismo', VirtualRide: 'ciclismo', GravelRide: 'ciclismo', MountainBikeRide: 'ciclismo', EBikeRide: 'ciclismo',
    Swim: 'natacion', WeightTraining: 'fuerza', Workout: 'fuerza', Crossfit: 'fuerza'
  };

  /** Límites superiores de FC (lpm) para z1..z5 a partir de FC reposo/máx (Karvonen). Editables por atleta. */
  function limitesFCKarvonen(fcReposo, fcMax, pct = [0.70, 0.78, 0.85, 0.90, 0.95]) {
    return pct.map(p => Math.round(fcReposo + (fcMax - fcReposo) * p));
  }

  /** Minutos por zona desde los streams de Strava (heartrate + time). Por encima del último límite → z6. */
  function minutosZonaDesdeFC(fc, tiempo, limites) {
    const mz = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0, z7: 0, z8: 0 };
    if (!fc || !tiempo || fc.length !== tiempo.length) return mz;
    for (let i = 1; i < fc.length; i++) {
      const dt = Math.min(Math.max(tiempo[i] - tiempo[i - 1], 0), 30); // ignora pausas largas
      const h = fc[i];
      let k = limites.findIndex(l => h <= l);
      if (k === -1) k = 5;
      mz['z' + (k + 1)] += dt / 60;
    }
    for (const k in mz) mz[k] = r1(mz[k]);
    return mz;
  }

  /** Convierte una actividad de Strava (DetailedActivity) en sesión del módulo. */
  function sesionDesdeStrava(act, { atletaId, limitesFC, streams } = {}) {
    const deporte = MAPA_STRAVA[act.sport_type || act.type] || 'otro';
    const minutos = r1((act.moving_time || act.elapsed_time || 0) / 60);
    let mz = {};
    if (streams && streams.heartrate && streams.time && limitesFC)
      mz = minutosZonaDesdeFC(streams.heartrate.data || streams.heartrate, streams.time.data || streams.time, limitesFC);
    const tieneZonas = minutosTotales(mz) > 0;
    return normalizarSesion({
      atleta_id: atletaId,
      fecha: String(act.start_date_local || act.start_date).slice(0, 10),
      estado: 'realizada', origen: 'strava', strava_id: act.id,
      deporte, titulo: act.name,
      duracion_min: minutos,
      minutos_zona: tieneZonas ? mz : {},                       // sin FC no se inventan ECOs (queda sRPE)
      rpe: act.perceived_exertion != null ? Number(act.perceived_exertion) : null, // RPE que el atleta pone en Strava (1–10), si existe
      distancia_km: act.distance ? r2(act.distance / 1000) : null,
      desnivel_m: act.total_elevation_gain != null ? Math.round(act.total_elevation_gain) : null
    });
  }

  const API = {
    ZONAS, DEPORTES, UMBRALES, ESCALA_RPE: [
      [0, 'Reposo'], [1, 'Muy, muy fácil'], [2, 'Fácil'], [3, 'Moderado'], [4, 'Algo duro'],
      [5, 'Duro'], [6, ''], [7, 'Muy duro'], [8, ''], [9, ''], [10, 'Máximo']
    ],
    calcularECOs, calcularSRPE, minutosTotales, normalizarSesion,
    serieDiaria, resumenSemanal, resumenPeriodo, agudoCronico, formaFatiga, alertas,
    PERIODOS, inicioPeriodo, moverPeriodo, finPeriodo, etiquetaPeriodo,
    limitesFCKarvonen, minutosZonaDesdeFC, sesionDesdeStrava,
    fecha: { iso, parse, sumarDias, lunes, hoyISO, inicioPeriodo, moverPeriodo, finPeriodo, etiquetaPeriodo }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.ATLCarga = API;
})(typeof window !== 'undefined' ? window : globalThis);
