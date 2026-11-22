
/* =====================================================================
 * Alex Training Lab · Carga de FUERZA sin encoder (por RPE / RIR del entrenado)
 * Con lo que ya apunta el cliente en cada ejercicio (reps hechas, RIR, RPE) y en la sesión
 * (RPE total + minutos) calcula:
 *   - sRPE de la sesión = minutos × RPE total (Foster)
 *   - series duras = series a ≤4 repeticiones de reserva (RIR ≤ 4; si solo hay RPE, RIR = 10 − RPE)
 *   - carácter del esfuerzo = reps hechas / (reps hechas + RIR)
 *   - desviación de RIR = RIR objetivo − RIR real (positivo = más duro de lo previsto)
 *   - series duras por patrón de movimiento y semana
 * Sin dependencias. Se expone como window.ATLFuerza (y module.exports en Node).
 * ===================================================================== */
(function (global) {
  'use strict';
  const RIR_DURA = 4;

  const PATRONES = [
    ['Pliometría / potencia', /\b(salto|saltos|jump|bound|drop|cmj|lanzamiento|throw|balon medicinal|slam|skipping|multisalto|pogo)/],
    ['Isquios', /(nordic|nordico|curl femoral|femoral|isquio|leg curl)/],
    ['Gemelo / sóleo', /(gemelo|soleo|talon|talones|calf)/],
    ['Aductores / abductores', /(aductor|abductor|copenha|monster walk|clamshell|almeja)/],
    ['Cadera (bisagra / puente)', /(peso muerto|rdl|bisagra|hip thrust|puente|good morning|buenos dias|swing|hiperextension|pull through)/],
    ['Rodilla (sentadilla / zancada)', /(sentadilla|squat|zancada|lunge|prensa|step|split|bulgara|pistol|extension de (rodilla|cuadriceps)|wall sit)/],
    ['Empuje vertical', /(press militar|press hombro|overhead|arnold|landmine press|pike|fondos|push press)/],
    ['Empuje horizontal', /(press banca|banca|flexion|flexiones|push.?up|press pecho|press inclinado|press plano|aperturas)/],
    ['Tracción vertical', /(dominada|jalon|pull.?up|chin.?up|pulldown|pullover)/],
    ['Tracción horizontal', /(remo|row|face pull|pajaro|inverted)/],
    ['Core', /(plancha|plank|pallof|dead bug|bird dog|rueda|ab wheel|crunch|antirrotacion|antirotacion|farmer|paseo|carry|hollow|rotacion|lenador|woodchop|abdominal|core)/],
    ['Accesorios', /(curl|biceps|triceps|elevaciones? laterales|elevacion lateral|extension de triceps|encogimiento)/]
  ];
  const PRIORITARIOS = ['Cadera (bisagra / puente)', 'Isquios', 'Gemelo / sóleo', 'Aductores / abductores'];

  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const num = v => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
  const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;

  function patron(nombre) {
    const t = norm(nombre);
    for (const [p, re] of PATRONES) if (re.test(t)) return p;
    return 'Otros';
  }
  const esCalentamiento = nombreBloque => /calent|movilidad|activaci|warm|vuelta a la calma|estiramiento/.test(norm(nombreBloque));

  /** «8,8,7» / «8/8/7» / «8-8-7» / «10 10 9» → [8,8,7]; «8» → [8] */
  function listaReps(txt) {
    const t = String(txt ?? '').replace(/\d+\s*kg/gi, ' '); // ignora pesos escritos («8 con 20kg»)
    const nums = t.match(/\d+/g) || [];
    return nums.map(Number);
  }

  /**
   * 1RM estimado con la fórmula de Epley ajustada por el RIR:
   * repeticiones equivalentes al fallo = reps hechas + RIR → 1RM = kg × (1 + reps/30).
   * Solo se estima con 12 repeticiones equivalentes o menos: por encima, la estimación deja de ser fiable.
   */
  function estimar1RM(kg, repsSerie, rir) {
    if (kg == null || kg <= 0 || !repsSerie || rir == null) return null;
    const alFallo = repsSerie + rir;
    if (alFallo < 1 || alFallo > 12) return null;
    return Math.round(kg * (1 + alFallo / 30) * 10) / 10;
  }

  /**
   * Analiza un ejercicio.
   * plan: {ej, ser, rep, rir, rpe}  (lo que pone el entrenador)
   * reg:  {reps, rir, rpe}          (lo que apunta el cliente)
   */
  function analizarEjercicio(plan, reg, bloque) {
    const nombre = plan.ej || 'Ejercicio';
    const calentamiento = esCalentamiento(bloque);
    const seriesPlan = num(plan.ser) || 1;
    const repsPlan = num(plan.rep);
    const rirObj = num(plan.rir) ?? (num(plan.rpe) != null ? 10 - num(plan.rpe) : null);
    // ejercicios por tiempo (plancha 30s, isométricos): cuentan series, no repeticiones
    const porTiempo = /\d\s*(s|seg|segundos|"|''|min)\b/i.test(String(plan.rep ?? '') + ' ' + String((reg && reg.reps) ?? ''));
    const lista = porTiempo ? [] : listaReps(reg && reg.reps);
    const hecho = !!(reg && Object.values(reg).some(v => v !== '' && v != null));
    let series = 0, reps = 0;
    if (lista.length > 1) { series = lista.length; reps = lista.reduce((a, b) => a + b, 0); }
    else if (lista.length === 1) { series = seriesPlan; reps = lista[0] * seriesPlan; }
    else if (hecho) { series = seriesPlan; reps = repsPlan != null && !porTiempo ? repsPlan * seriesPlan : 0; }
    let rir = num(reg && reg.rir);
    const rpe = num(reg && reg.rpe);
    if (rir == null && rpe != null) rir = Math.max(0, 10 - rpe);
    const repsSerie = series && reps ? reps / series : null;
    const duras = !calentamiento && rir != null && rir <= RIR_DURA ? series : 0;
    const ce = repsSerie && rir != null ? repsSerie / (repsSerie + rir) : null;
    // Peso, tonelaje y 1RM estimado (Epley ajustado por RIR; solo si el esfuerzo es fiable)
    const kg = num(reg && reg.kg);
    const tonelaje = kg != null && reps ? Math.round(kg * reps) : null;
    const unRM = estimar1RM(kg, repsSerie, rir);
    return {
      nombre, patron: patron(nombre), calentamiento, hecho,
      series, reps, rir, rpe, rirObj, duras, kg, tonelaje, unRM,
      seriesDurasPlan: !calentamiento && rirObj != null && rirObj <= RIR_DURA ? seriesPlan : 0,
      desvRIR: rir != null && rirObj != null ? rirObj - rir : null,
      ce
    };
  }

  /** Analiza una sesión de fuerza: {fecha, titulo, bloques:[{nombre, ejercicios:[plan]}], registro:{'bi-ei':{reps,rir,rpe}, s:{rpe,min}}} */
  function analizarSesion(ses, normEj) {
    const R = ses.registro || {};
    const ejercicios = [];
    (ses.bloques || []).forEach((b, bi) => (b.ejercicios || []).forEach((e0, ei) => {
      const e = normEj ? normEj(e0) : e0;
      ejercicios.push(analizarEjercicio(e, R[bi + '-' + ei] || {}, b.nombre));
    }));
    const s = R.s || {};
    const rpeSes = num(s.rpe), min = num(s.min);
    const hechos = ejercicios.filter(x => x.hecho && !x.calentamiento);
    const conRIR = hechos.filter(x => x.rir != null);
    const conDesv = hechos.filter(x => x.desvRIR != null);
    const conCE = hechos.filter(x => x.ce != null);
    const pesoSeries = (arr, f) => { const w = arr.reduce((a, x) => a + (x.series || 1), 0); return w ? arr.reduce((a, x) => a + f(x) * (x.series || 1), 0) / w : null; };
    return {
      fecha: ses.fecha, titulo: ses.titulo || 'Fuerza', ejercicios,
      min, rpe: rpeSes, srpe: min != null && rpeSes != null ? r1(min * rpeSes) : null,
      series: hechos.reduce((a, x) => a + x.series, 0),
      tonelaje: hechos.reduce((a, x) => a + (x.tonelaje || 0), 0) || null,
      ejerciciosSinKg: hechos.filter(x => x.kg == null).length,
      seriesDuras: hechos.reduce((a, x) => a + x.duras, 0),
      seriesDurasPlan: ejercicios.reduce((a, x) => a + x.seriesDurasPlan, 0),
      reps: hechos.reduce((a, x) => a + x.reps, 0),
      rirMedio: r1(pesoSeries(conRIR, x => x.rir)),
      desvRIR: r1(pesoSeries(conDesv, x => x.desvRIR)),
      ce: r2(pesoSeries(conCE, x => x.ce)),
      ejerciciosSinEsfuerzo: hechos.filter(x => x.rir == null).length
    };
  }

  /** Resumen semanal (lunes a domingo) a partir de sesiones analizadas con fecha ISO. */
  function resumenSemanal(analizadas, { semanas = 12, hasta, fecha, unidad = 'semana', n = null }) {
    const F = fecha; // ATLCarga.fecha
    const cuantos = n || semanas;
    const primer = F.moverPeriodo ? F.moverPeriodo(unidad, F.inicioPeriodo(unidad, hasta), -(cuantos - 1)) : F.sumarDias(F.lunes(hasta), -7 * (cuantos - 1));
    const out = [];
    for (let i = 0; i < cuantos; i++) {
      const ini = F.moverPeriodo ? F.moverPeriodo(unidad, primer, i) : F.sumarDias(primer, 7 * i);
      const fin = F.finPeriodo ? F.finPeriodo(unidad, ini) : F.sumarDias(ini, 6);
      const ss = analizadas.filter(s => s.fecha >= ini && s.fecha <= fin);
      const porPatron = {};
      ss.forEach(s => s.ejercicios.forEach(e => { if (e.duras) porPatron[e.patron] = (porPatron[e.patron] || 0) + e.duras; }));
      const sum = f => ss.reduce((a, s) => a + (f(s) || 0), 0);
      const media = (f, w) => { const v = ss.filter(s => f(s) != null); const ws = v.reduce((a, s) => a + (w(s) || 1), 0); return ws ? v.reduce((a, s) => a + f(s) * (w(s) || 1), 0) / ws : null; };
      out.push({
        semana: ini, fin, unidad, etiqueta: F.etiquetaPeriodo ? F.etiquetaPeriodo(unidad, ini) : ini, enCurso: hasta < fin, sesiones: ss.length,
        srpe: r1(sum(s => s.srpe)), minutos: r1(sum(s => s.min)),
        seriesDuras: sum(s => s.seriesDuras), seriesDurasPlan: sum(s => s.seriesDurasPlan), series: sum(s => s.series), reps: sum(s => s.reps),
        tonelaje: sum(s => s.tonelaje) || null,
        rirMedio: r1(media(s => s.rirMedio, s => s.series)), desvRIR: r1(media(s => s.desvRIR, s => s.series)), ce: r2(media(s => s.ce, s => s.series)),
        porPatron
      });
    }
    return out;
  }

  /** Mejor 1RM estimado por ejercicio y semana, para ver la progresión. */
  function progresion1RM(analizadas, { fecha, semanas = 12, hasta, minSemanas = 2 } = {}) {
    const F = fecha, ultimo = F.lunes(hasta), primer = F.sumarDias(ultimo, -7 * (semanas - 1));
    const porEj = {};
    analizadas.forEach(s => {
      if (s.fecha < primer || s.fecha > hasta) return;
      const sem = F.lunes(s.fecha);
      s.ejercicios.forEach(e => {
        if (e.unRM == null) return;
        const k = e.nombre.trim();
        porEj[k] = porEj[k] || { nombre: k, patron: e.patron, semanas: {} };
        porEj[k].semanas[sem] = Math.max(porEj[k].semanas[sem] || 0, e.unRM);
      });
    });
    return Object.values(porEj).map(x => {
      const ks = Object.keys(x.semanas).sort();
      const pri = x.semanas[ks[0]], ult = x.semanas[ks[ks.length - 1]];
      return Object.assign(x, { n: ks.length, primera: ks[0], ultima: ks[ks.length - 1], valorPrimera: pri, valorUltima: ult,
        cambio: ks.length > 1 && pri ? r1((ult - pri) / pri * 100) : null });
    }).filter(x => x.n >= minSemanas).sort((a, b) => (b.cambio ?? -999) - (a.cambio ?? -999));
  }

  function alertas(sem) {
    const res = [], n = sem.length; if (!n) return res;
    const cur = sem[n - 1], i = cur.enCurso && n > 1 ? n - 2 : n - 1, act = sem[i];
    const prev = sem.slice(Math.max(0, i - 4), i);
    const pct = x => Math.round(x * 100) + ' %', c = x => String(x).replace('.', ',');
    const max4 = Math.max(0, ...prev.map(w => w.seriesDuras));
    if (max4 > 0 && act.seriesDuras > max4 * 1.2)
      res.push({ nivel: 'alto', texto: `Series duras: ${act.seriesDuras} la semana pasada, un ${pct(act.seriesDuras / max4 - 1)} más que la semana más alta del último mes. Sube el volumen de forma más gradual.` });
    if (act.desvRIR != null && act.desvRIR >= 1)
      res.push({ nivel: 'alto', texto: `Entrena más cerca del fallo de lo previsto (RIR ${c(act.desvRIR)} por debajo del objetivo de media): posible fatiga o carga demasiado alta. Baja el peso o una serie.` });
    else if (act.desvRIR != null && act.desvRIR <= -2)
      res.push({ nivel: 'info', texto: `Se queda lejos del fallo (RIR ${c(Math.abs(act.desvRIR))} por encima del objetivo de media): puede subir peso o repeticiones.` });
    if (act.seriesDurasPlan > 0 && act.seriesDuras < act.seriesDurasPlan * 0.75)
      res.push({ nivel: 'info', texto: `Hizo ${act.seriesDuras} de ${act.seriesDurasPlan} series duras previstas.` });
    const faltan = PRIORITARIOS.filter(p => !(act.porPatron[p] > 0));
    if (act.sesiones && faltan.length)
      res.push({ nivel: 'info', texto: `Sin series duras la semana pasada en: ${faltan.join(', ')} (prioritarios para el corredor).` });
    const srpePrev = prev.map(w => w.srpe).filter(x => x > 0);
    if (srpePrev.length && act.srpe > Math.max(...srpePrev) * 1.15)
      res.push({ nivel: 'medio', texto: `La sRPE de fuerza superó en más de un 15 % a la semana más alta del último mes.` });
    if (!res.length) res.push({ nivel: 'ok', texto: 'Fuerza dentro de lo previsto. Sin avisos.' });
    return res;
  }

  const API = { RIR_DURA, estimar1RM, progresion1RM, PATRONES: PATRONES.map(p => p[0]).concat('Otros'), PRIORITARIOS, patron, listaReps, analizarEjercicio, analizarSesion, resumenSemanal, alertas };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.ATLFuerza = API;
})(typeof window !== 'undefined' ? window : globalThis);

