// Motor de planificación de resistencia · v1
// Reglas acordadas:
//  - El plan nace en «borrador». Solo el entrenador lo autoriza (autorizar).
//  - Doble umbral: solo atletas avanzados, con al menos 12 semanas de historial y sin lesión activa.
//  - Lesión activa: carga reducida y sin sesiones de calidad; el plan queda marcado para revisión.
//  - La carga se guía por RPE y por datos de Strava. No usa pulso ni VFC.
//  - Carga de bloques: +5 % por semana de carga, tope 25 %; cada 4 semanas, descarga; las 2 últimas, puesta a punto.

const NIVELES = ['principiante', 'intermedio', 'avanzado'];
export const MIN_SEMANAS_DOBLE_UMBRAL = 12;
const PASO_CARGA = 0.05;
const TOPE_CARGA = 1.25;
const FACTOR_DESCARGA = 0.75;
const FACTOR_PUESTA_A_PUNTO = [0.7, 0.5];
const MIN_POR_KM = 6;
const MIN_BASE_DEFECTO = 120;
const FACTOR_LESION = 0.7;

// Reparto semanal por número de días disponibles. Día 2 = martes, 4 = jueves, 5 = viernes, 6 = sábado.
const REPARTO = {
  2: [['calidad', 0.4, 2], ['larga', 0.6, 6]],
  3: [['calidad', 0.3, 2], ['rodaje', 0.3, 4], ['larga', 0.4, 6]],
  4: [['calidad', 0.25, 2], ['rodaje', 0.25, 4], ['rodaje', 0.2, 5], ['larga', 0.3, 6]],
};

const redondear = (x) => Math.round(x * 1000) / 1000;

// Minutos base por semana: media de las últimas 4 semanas del historial; si no hay, km actuales × 6; si no, 120.
export function baseMinutos(atleta, historial = []) {
  const ultimas = historial.slice(-4).map((s) => Number(s.minutos) || 0).filter((m) => m > 0);
  if (ultimas.length) return Math.round(ultimas.reduce((a, b) => a + b, 0) / ultimas.length);
  if (atleta.km_semana_actual) return Math.round(Number(atleta.km_semana_actual) * MIN_POR_KM);
  return MIN_BASE_DEFECTO;
}

// Factor de carga de cada semana (1 = semana 1).
export function factoresSemanas(semanas) {
  const out = [];
  let bloques = 0;
  let ultimoBloque = 1;
  for (let w = 1; w <= semanas; w++) {
    if (w >= semanas - 1) {
      out.push(FACTOR_PUESTA_A_PUNTO[w - semanas + 1]);
      continue;
    }
    if (w % 4 === 0) {
      out.push(redondear(FACTOR_DESCARGA * ultimoBloque));
      continue;
    }
    const f = Math.min(1 + PASO_CARGA * bloques, TOPE_CARGA);
    bloques++;
    ultimoBloque = f;
    out.push(redondear(f));
  }
  return out;
}

const esPuestaAPunto = (w, semanas) => w >= semanas - 1;

function nombreSesion(tipo, doble) {
  if (tipo === 'calidad') return doble ? 'Doble umbral' : 'Series';
  if (tipo === 'larga') return 'Tirada larga';
  return 'Rodaje';
}

function rpeObjetivo(tipo, doble, puestaAPunto) {
  if (tipo === 'calidad') return puestaAPunto ? 6 : 7;
  if (tipo === 'larga') return 4;
  return 3;
}

// Genera un plan en borrador. No aplica nada al calendario.
export function generarBorrador(atleta, opciones = {}) {
  if (!atleta || !NIVELES.includes(atleta.nivel)) throw new Error('Nivel no válido.');
  const dias = Number(atleta.dias_disponibles) || 0;
  if (dias < 2) throw new Error('Hacen falta al menos 2 días de entrenamiento a la semana.');
  const diasUsados = Math.min(dias, 4);
  const semanas = opciones.semanas ?? 12;
  const historial = opciones.historial ?? [];
  const lesion = !!atleta.lesion_activa;
  const dobleUmbral = atleta.nivel === 'avanzado'
    && (Number(atleta.semanas_historial) || 0) >= MIN_SEMANAS_DOBLE_UMBRAL
    && !lesion;

  const avisos = [];
  if (atleta.nivel === 'avanzado' && !dobleUmbral) {
    avisos.push(lesion
      ? 'Doble umbral desactivado por lesión activa.'
      : `Doble umbral no disponible: hacen falta ${MIN_SEMANAS_DOBLE_UMBRAL} semanas de historial.`);
  }
  if (lesion) avisos.push('Lesión activa: carga reducida y sin sesiones de calidad. Revísalo antes de autorizarlo.');

  const base = baseMinutos(atleta, historial) * (lesion ? FACTOR_LESION : 1);
  const factores = factoresSemanas(semanas);
  const sesiones = [];

  factores.forEach((factor, i) => {
    const w = i + 1;
    REPARTO[diasUsados].forEach(([tipoBase, peso, diaSemana]) => {
      const tipo = lesion && tipoBase === 'calidad' ? 'rodaje' : tipoBase;
      const doble = tipo === 'calidad' && dobleUmbral;
      const puesta = esPuestaAPunto(w, semanas);
      sesiones.push({
        semana: w,
        dia_semana: diaSemana,
        tipo: tipo === 'calidad' ? 'series' : tipo === 'larga' ? 'tirada' : 'rodaje',
        nombre: nombreSesion(tipo, doble),
        duracion_min: Math.round(base * peso * factor),
        rpe_objetivo: rpeObjetivo(tipo, doble, puesta),
        doble_umbral: doble,
      });
    });
  });

  return { estado: 'borrador', nivel: atleta.nivel, semanas, sesiones, avisos, autorizado_por: null };
}

// Solo un borrador puede autorizarse, y lo hace el entrenador.
export function autorizar(plan, entrenadorId) {
  if (!plan || plan.estado !== 'borrador') throw new Error('Solo se puede autorizar un borrador.');
  if (!entrenadorId) throw new Error('Hace falta indicar el entrenador que autoriza.');
  return { ...plan, estado: 'autorizado', autorizado_por: entrenadorId };
}
