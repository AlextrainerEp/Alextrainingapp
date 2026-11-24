/* =====================================================================
 * Alex Training Lab · Planificaciones tipo para iniciados
 * Método BCP (fases F1/F2 de fuerza) + carrera continua y trail.
 * Resistencia: 75-85 % del tiempo en zona baja, subidas ≤10-15 % por semana
 * y descarga cada 4.ª semana. Fuerza: F1 circuito → F2 superseries.
 * Usa de la app: db, esc, $, isoLocal, asegurarFichaRes, modulosDe.
 * ===================================================================== */

/* ---------- Ejercicios base, por patrón (fuerza) ---------- */
const PL_F1 = {           // F1: movilidad, estabilidad y control motor · circuito, mismo peso
  A: [{ cod: 'A1', ej: 'Plancha frontal', ser: '3', rep: '20-30 s', int: 'Peso corporal', rir: '', nota: 'Costillas abajo, glúteo apretado' },
      { cod: 'A2', ej: 'Dead bug', ser: '3', rep: '8 por lado', int: 'Peso corporal', rir: '', nota: 'Zona lumbar pegada al suelo' }],
  B: [{ cod: 'B1', ej: 'Sentadilla goblet', ser: '3', rep: '8-10-12', int: 'Mismo peso todo el circuito', rir: '', nota: 'Patrón anterior' },
      { cod: 'B2', ej: 'Press banca con mancuernas', ser: '3', rep: '8-10-12', int: 'Mismo peso', rir: '', nota: 'Empuje horizontal' },
      { cod: 'B3', ej: 'Peso muerto rumano con mancuernas', ser: '3', rep: '8-10-12', int: 'Mismo peso', rir: '', nota: 'Cadena posterior' },
      { cod: 'B4', ej: 'Remo con mancuerna a una mano', ser: '3', rep: '8-10-12 por lado', int: 'Mismo peso', rir: '', nota: 'Tracción horizontal' },
      { cod: 'B5', ej: 'Puente de glúteo a dos piernas', ser: '3', rep: '10-15-20', int: 'Peso corporal o mancuerna', rir: '', nota: 'Glúteo: más repeticiones' },
      { cod: 'B6', ej: 'Press militar con mancuernas', ser: '3', rep: '8-10-12', int: 'Mismo peso', rir: '', nota: 'Empuje vertical' }],
  C: [{ cod: 'C1', ej: 'Elevación de talones de pie', ser: '2', rep: '12-15', int: 'Peso corporal', rir: '', nota: 'Gemelo y sóleo: clave para correr' },
      { cod: 'C2', ej: 'Sentadilla lateral', ser: '2', rep: '8 por lado', int: 'Peso corporal', rir: '', nota: 'Plano frontal y aductores' }]
};
const PL_F2 = {           // F2: fuerza base · superseries torso-pierna, se introduce el RIR
  A: [{ cod: 'A1', ej: 'Pallof press', ser: '3', rep: '10 por lado', int: 'Goma', rir: '', nota: 'Antirrotación' }],
  B: [{ cod: 'B1', ej: 'Sentadilla goblet', ser: '3', rep: '8-10-12', int: 'Sube peso si llegas holgado', rir: '6', nota: 'Superserie con B2' },
      { cod: 'B2', ej: 'Remo con mancuerna a una mano', ser: '3', rep: '8-10-12 por lado', int: '', rir: '6', nota: 'Superserie con B1' }],
  C: [{ cod: 'C1', ej: 'Peso muerto rumano con mancuernas', ser: '3', rep: '8-10-12', int: '', rir: '6', nota: 'Superserie con C2' },
      { cod: 'C2', ej: 'Press banca con mancuernas', ser: '3', rep: '8-10-12', int: '', rir: '6', nota: 'Superserie con C1' }],
  D: [{ cod: 'D1', ej: 'Zancada hacia atrás', ser: '3', rep: '8 por lado', int: '', rir: '6', nota: 'Unilateral' },
      { cod: 'D2', ej: 'Elevación de talones a una pierna', ser: '3', rep: '10-12 por lado', int: '', rir: '6', nota: 'Sóleo' },
      { cod: 'D3', ej: 'Copenhagen (rodilla apoyada)', ser: '2', rep: '20-30 s por lado', int: 'Peso corporal', rir: '', nota: 'Aductores' }]
};
// Variante de la 2.ª sesión semanal: se cambian los patrones (S1 EH-TH-EV · S2 TH-EH-TV)
const PL_VAR = {
  'Press banca con mancuernas': 'Flexiones (o en banco inclinado)',
  'Press militar con mancuernas': 'Dominada asistida o jalón',
  'Remo con mancuerna a una mano': 'Remo invertido en barra baja',
  'Sentadilla goblet': 'Sentadilla split',
  'Peso muerto rumano con mancuernas': 'Peso muerto rumano a una pierna',
  'Zancada hacia atrás': 'Step-up al cajón',
  'Puente de glúteo a dos piernas': 'Puente de glúteo a una pierna'
};
const plVariar = e => Object.assign({}, e, { ej: PL_VAR[e.ej] || e.ej });

const PL_CALENT = { nombre: 'Calentamiento', ejercicios: [
  { cod: '', ej: 'Movilidad de cadera y tobillo', ser: '1', rep: '5 min', int: '', rir: '', nota: 'De central a distal' },
  { cod: '', ej: 'Activación: puente + plancha lateral', ser: '2', rep: '20 s', int: 'Peso corporal', rir: '', nota: '' }
] };

/* ---------- Plantillas ---------- */
const PLANTILLAS = {
  'fza-f1': {
    nombre: 'Fuerza · F1 Iniciación (4 semanas, 2 días)',
    tipo: 'fuerza', semanas: 4, dias: [1, 4],   // martes y viernes
    descripcion: 'Movilidad, estabilidad y control motor. Circuito B1-B6 con el mismo peso en todos los ejercicios, 8-10-12 repeticiones (glúteo 10-15-20) y RPE 3-6. Es la fase de entrada del método BCP.',
    sesion(sem, dia) {
      const seg = dia > 0;
      const prog = sem === 0 ? 'Aprender el movimiento, peso cómodo'
        : sem === 1 ? 'Mismo peso, mejor técnica'
        : sem === 2 ? 'Sube un poco el peso si las 12 salen holgadas'
        : 'Semana de descarga: quita una vuelta al circuito';
      const vueltas = sem === 3 ? '2' : '3';
      const ap = l => l.map(e => Object.assign({}, seg ? plVariar(e) : e, { ser: vueltas, prog }));
      return { titulo: `Fuerza F1 · semana ${sem + 1} · sesión ${dia > 0 ? 2 : 1}`, bloques: [
        PL_CALENT,
        { nombre: 'Core', ejercicios: ap(PL_F1.A) },
        { nombre: 'Parte principal', ejercicios: ap(PL_F1.B) },
        { nombre: 'Accesorios', ejercicios: ap(PL_F1.C) }
      ] };
    }
  },
  'fza-f2': {
    nombre: 'Fuerza · F2 Fuerza base (4 semanas, 2 días)',
    tipo: 'fuerza', semanas: 4, dias: [1, 4],
    descripcion: 'Fuerza base en superseries torso-pierna, 8-10-12 repeticiones con RIR 6. Se prioriza cadena posterior, gemelo-sóleo y aductores, que es lo que más protege al corredor.',
    sesion(sem, dia) {
      const seg = dia > 0;
      const prog = sem === 0 ? 'Busca terminar a RIR 6 (te quedan 6 repeticiones)'
        : sem === 1 ? 'Sube peso si acabas a RIR 7-8'
        : sem === 2 ? 'Semana más exigente: RIR 5-6'
        : 'Semana de descarga: una serie menos y RIR 8';
      const series = sem === 3 ? '2' : '3';
      const ap = l => l.map(e => Object.assign({}, seg ? plVariar(e) : e, { ser: e.ser === '2' ? '2' : series, rir: sem === 3 ? '8' : e.rir, prog }));
      return { titulo: `Fuerza F2 · semana ${sem + 1} · sesión ${dia > 0 ? 2 : 1}`, bloques: [
        PL_CALENT,
        { nombre: 'Core', ejercicios: ap(PL_F2.A) },
        { nombre: 'Parte principal', ejercicios: ap(PL_F2.B).concat(ap(PL_F2.C)) },
        { nombre: 'Accesorios', ejercicios: ap(PL_F2.D) }
      ] };
    }
  },
  'res-asfalto': {
    nombre: 'Carrera continua · Iniciación asfalto (8 semanas, 3 días)',
    tipo: 'resistencia', semanas: 8, dias: [1, 3, 6],   // martes, jueves y domingo
    descripcion: 'Entrada a la carrera continua. Casi todo en zona 1-2 (el 80 % del tiempo), una sesión con cambios suaves y una tirada larga que crece poco a poco. Subidas de volumen por debajo del 15 % y descarga en las semanas 4 y 8.',
    sesion(sem, dia) {
      const desc = sem === 3 || sem === 7;                 // semanas de descarga
      const k = desc ? 0.75 : 1 + 0.10 * (sem - Math.floor(sem / 4));
      const m = x => Math.max(10, Math.round(x * k / 5) * 5);
      if (dia === 0) return { tipo: 'rodaje', nombre: 'Rodaje suave',
        texto: 'Todo el rato en Z1: deberías poder hablar sin ahogarte. Si te falta aire, anda un minuto y sigue.',
        pasos: [{ nombre: 'Rodaje', rep: 1, cantidad: m(25), unidad: 'min', zona: 1 }] };
      if (dia === 1) return { tipo: 'rodaje', nombre: sem < 2 ? 'Rodaje con andar-correr' : 'Rodaje con cambios suaves',
        texto: sem < 2 ? 'Alterna correr y andar. Lo importante es acabar entero, no rápido.'
          : 'Tras calentar, mete bloques algo más vivos en Z3 sin llegar a asfixiarte, y recupera trotando.',
        pasos: sem < 2
          ? [{ nombre: 'Calentamiento', rep: 1, cantidad: 5, unidad: 'min', zona: 1 },
             { nombre: 'Correr', rep: 6, cantidad: 3, unidad: 'min', zona: 2, rec: 2 },
             { nombre: 'Vuelta a la calma', rep: 1, cantidad: 5, unidad: 'min', zona: 1 }]
          : [{ nombre: 'Calentamiento', rep: 1, cantidad: 10, unidad: 'min', zona: 1 },
             { nombre: 'Cambios', rep: desc ? 4 : 4 + sem, cantidad: 2, unidad: 'min', zona: 3, rec: 2 },
             { nombre: 'Vuelta a la calma', rep: 1, cantidad: 8, unidad: 'min', zona: 1 }] };
      return { tipo: 'tirada', nombre: 'Tirada larga',
        texto: 'La sesión más importante de la semana. Ritmo tranquilo de principio a fin; el último tercio, algo más vivo si te sobra.',
        pasos: [{ nombre: 'Tirada', rep: 1, cantidad: m(35), unidad: 'min', zona: 1 },
                { nombre: 'Final algo más vivo', rep: 1, cantidad: desc ? 5 : 10, unidad: 'min', zona: 2 }] };
    }
  },
  'res-trail': {
    nombre: 'Trail · Iniciación en montaña (8 semanas, 3 días)',
    tipo: 'resistencia', semanas: 8, dias: [1, 3, 6],
    descripcion: 'Lo mismo que el plan de asfalto, pero con dos cosas propias del trail: subir andando rápido cuando la cuesta aprieta y bajar de forma progresiva para que las piernas aguanten el excéntrico. Descarga en las semanas 4 y 8.',
    sesion(sem, dia) {
      const desc = sem === 3 || sem === 7;
      const k = desc ? 0.75 : 1 + 0.10 * (sem - Math.floor(sem / 4));
      const m = x => Math.max(10, Math.round(x * k / 5) * 5);
      if (dia === 0) return { tipo: 'rodaje', nombre: 'Rodaje suave en llano',
        texto: 'Terreno fácil y zona 1. Sirve para acumular minutos sin castigar las piernas.',
        pasos: [{ nombre: 'Rodaje', rep: 1, cantidad: m(25), unidad: 'min', zona: 1 }] };
      if (dia === 1) return { tipo: 'series', nombre: 'Cuestas: subir y bajar',
        texto: 'Sube a buen ritmo: si la cuesta pasa de unos 15 grados, andar rápido gasta menos que correr. Baja controlado, con pasos cortos y rápidos. La bajada es la que deja las piernas tocadas, así que no la fuerces.',
        pasos: [{ nombre: 'Calentamiento', rep: 1, cantidad: 12, unidad: 'min', zona: 1 },
                { nombre: 'Subida (corriendo o andando rápido)', rep: desc ? 4 : 4 + sem, cantidad: 2, unidad: 'min', zona: 4, rec: 3 },
                { nombre: 'Vuelta a la calma', rep: 1, cantidad: 8, unidad: 'min', zona: 1 }] };
      return { tipo: 'tirada', nombre: 'Tirada larga con desnivel',
        texto: 'Por terreno parecido al de tu carrera. Sube andando lo que haga falta y baja sin frenar en exceso, pero sin lanzarte.',
        pasos: [{ nombre: 'Tirada', rep: 1, cantidad: m(40), unidad: 'min', zona: 1 },
                { nombre: 'Subidas incluidas', rep: 1, cantidad: desc ? 8 : 12, unidad: 'min', zona: 2 }] };
    }
  }
};

/* ---------- Crear el plan en el calendario ---------- */
function plFecha(inicio, semana, diaSemana) {
  const d = new Date(inicio + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // lunes de esa semana
  d.setDate(d.getDate() + semana * 7 + diaSemana);
  return isoLocal(d);
}

async function plCrear(clave, cliente, inicio, dias) {
  const P = PLANTILLAS[clave];
  const diasUso = (dias && dias.length ? dias : P.dias).slice(0, 7).sort((a, b) => a - b);
  const fuerza = [], resis = [];
  for (let sem = 0; sem < P.semanas; sem++) {
    diasUso.forEach((dw, i) => {
      const fecha = plFecha(inicio, sem, dw);
      const s = P.sesion(sem, i);
      if (P.tipo === 'fuerza') fuerza.push({ cliente_id: cliente.id, fecha: fecha.split('-').reverse().join('/'), titulo: s.titulo, bloques: s.bloques, registro: {} });
      else resis.push({ fecha, tipo: s.tipo, descripcion: s.nombre + (s.texto ? ' — ' + s.texto : ''), pasos: s.pasos,
        duracion_min: s.pasos.reduce((a, p) => a + (p.cantidad || 0) * (p.rep || 1) + (p.rec ? p.rec * ((p.rep || 1) - 1) : 0), 0), estado: 'pendiente' });
    });
  }
  if (fuerza.length) await db('POST', 'sesiones', '', fuerza, 'return=minimal');
  if (resis.length) {
    const atletaId = await asegurarFichaRes(cliente);
    const mods = modulosDe(cliente);
    if (!mods.includes('resistencia')) {
      const nuevos = [...mods, 'resistencia'];
      await db('PATCH', 'perfiles', `?id=eq.${cliente.id}`, { modulos: nuevos }, 'return=minimal');
      cliente.modulos = nuevos;
    }
    await db('POST', 'sesiones_planificadas', '', resis.map(r => Object.assign({ atleta_id: atletaId }, r)), 'return=minimal');
  }
  return fuerza.length + resis.length;
}

/* ---------- Panel ---------- */
const PL_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function plPanel(cliente, alTerminar) {
  const ov = document.createElement('div');
  ov.className = 'modal';
  const hoy = isoLocal(new Date());
  const lunesProx = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - (d.getDay() || 7)) % 7 || 7)); return isoLocal(d); })();
  let clave = 'res-asfalto', dias = PLANTILLAS[clave].dias.slice();
  const pintar = () => {
    const P = PLANTILLAS[clave];
    ov.innerHTML = `<div class="modal-card" style="max-width:620px">
      <h3>Planificación tipo</h3>
      <p class="muted">Crea un plan completo para ${esc(cliente.nombre || 'este entrenado')}. Luego puedes cambiar lo que quieras sesión a sesión.</p>
      <label>Plantilla <select id="pl-sel">${Object.entries(PLANTILLAS).map(([k, v]) => `<option value="${k}"${k === clave ? ' selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></label>
      <p class="pl-desc">${esc(P.descripcion)}</p>
      <label>Empezar la semana del <input type="date" id="pl-ini" value="${lunesProx}"></label>
      <div class="pl-dias"><span>Días de entrenamiento</span>${PL_DIAS.map((d, i) => `<button type="button" class="pl-dia${dias.includes(i) ? ' on' : ''}" data-d="${i}">${d}</button>`).join('')}</div>
      <p class="muted" id="pl-res"></p>
      <div class="row" style="margin-top:12px"><button class="gold" id="pl-crear">Crear plan</button><button class="sec" id="pl-cerrar">Cancelar</button><span class="msg" id="pl-msg"></span></div>
      <p class="muted">Se añaden al calendario como sesiones nuevas; no se borra ni se toca nada de lo que ya tenga.</p></div>`;
    const P2 = PLANTILLAS[clave];
    const n = P2.semanas * (dias.length || P2.dias.length);
    $('#pl-res').textContent = `${P2.semanas} semanas · ${dias.length || P2.dias.length} sesiones por semana · ${n} sesiones en total.`;
    $('#pl-sel').onchange = e => { clave = e.target.value; dias = PLANTILLAS[clave].dias.slice(); pintar(); };
    ov.querySelectorAll('.pl-dia').forEach(b => b.onclick = () => {
      const d = +b.dataset.d;
      dias = dias.includes(d) ? dias.filter(x => x !== d) : [...dias, d].sort((a, b2) => a - b2);
      pintar();
    });
    $('#pl-cerrar').onclick = () => ov.remove();
    $('#pl-crear').onclick = async () => {
      const msg = $('#pl-msg'), ini = $('#pl-ini').value;
      if (!ini) { msg.textContent = 'Elige la semana de inicio'; msg.className = 'msg err'; return; }
      if (!dias.length) { msg.textContent = 'Marca al menos un día'; msg.className = 'msg err'; return; }
      msg.textContent = 'Creando…'; msg.className = 'msg';
      try {
        const n2 = await plCrear(clave, cliente, ini, dias);
        ov.remove();
        if (alTerminar) alTerminar(n2, ini);
      } catch (e) { msg.textContent = 'No se pudo crear: ' + e.message; msg.className = 'msg err'; }
    };
  };
  document.body.appendChild(ov);
  pintar();
}
