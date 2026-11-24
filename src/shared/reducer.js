const PREFIJO_EVAL = { Inbound: 'INB', Monitoreo: 'MON' }
const PREFIJO_DOC = { retro: 'RET', carta: 'CAR', acta: 'ACT' }
const MAX_ACTIVIDAD = 5000
const NOMBRE_DOC = { retro: 'Retroalimentación', carta: 'Carta de compromiso', acta: 'Acta administrativa' }
const FIRMANTES_DOC = {
  retro: ['colaborador', 'supOperaciones', 'analista', 'supCalidad'],
  carta: ['supervisor', 'analista', 'agente', 'testigo'],
  acta: ['calidad', 'supOperaciones', 'agente', 'talentoHumano'],
}
const ETIQUETA_FIRMANTE = {
  colaborador: 'Colaborador',
  supOperaciones: 'Supervisor de operaciones',
  analista: 'Analista de calidad',
  supCalidad: 'Supervisor de calidad',
  supervisor: 'Supervisor',
  agente: 'Agente',
  testigo: 'Testigo',
  calidad: 'Área de calidad',
  talentoHumano: 'Talento Humano',
}

export const VERSION_DB = 2

function slug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function separarTemas(items) {
  const grupos = new Map()
  for (const it of Object.values(items).sort((a, b) => a.fila - b.fila)) {
    const k = `${it.canal}|${it.tema}`
    const g = grupos.get(k)
    if (g) g.push(it)
    else grupos.set(k, [it])
  }
  let copia = null
  for (const g of grupos.values()) {
    for (const it of g.slice(1)) {
      if (it.bloque === g[0].bloque) continue
      copia = copia || { ...items }
      copia[it.key] = { ...it, tema: `${it.tema}:${slug(it.bloque)}` }
    }
  }
  return copia || items
}

const HALLAZGOS_CONCILIACION = [
  'PLAN ACCION IND: la reincidencia se cuenta por rubro de la misma cédula (“Cédula · Ítem”) y solo con auditorías de días anteriores (COUNTIFS … fecha < detección); un error crítico llega a nivel 4 solo si se repite ese mismo rubro crítico. El portal aplica estas reglas igual que la hoja.',
  'PLAN ACCION IND: la hoja cierra un plan solo con la 3.ª verificación en meta y lo marca VENCIDO por fecha aunque la acción ya se hizo. El portal sigue el MODELO REINCIDENCIA: cierra con 3 auditorías seguidas en meta (sin crítico ni repetir el rubro) y la fecha compromiso aplica a la acción del nivel.',
  'CATÁLOGO CÉDULA del Modelo: Aviso de viaje suma 121 pts y SAC 122 pts, pero los formularios suman 126 y 94 (al catálogo le falta “Comentarios correctos en ASHI” y en SAC trae el script en 50). Los rubros críticos y sus puntos sí coinciden. El portal usa los del formulario, que son los que califican.',
  'Los reportes de Inbound también cuentan la fila 1 del Acumulado (la que refleja el formulario en blanco): por eso “Resultados por tipo de cédula” muestra 11 evaluaciones de FRAUDE en lugar de 10.',
  'Acumulado de Monitoreo: en la fila 1, la columna AV (área de “Front · Socio, correo del cliente, 4 dígitos…”, fila 20 del formulario) apunta a #REF! y la AW (área de “Front · Capturas”, fila 21) lee la fila 20. Desde esa falla el Excel guarda el área de la fila 20 en la columna de “Capturas” y no guarda la de “Capturas”. Al importar, el portal lo detecta, avisa y asigna cada área a su rubro.',
  'KPIs: “Errores críticos” cuenta errores (rubros críticos fallados), como la hoja ERRORES CRÍTICOS; en septiembre son 7 errores en 5 evaluaciones. “Feedback oportuno” usa 48 h, o 24 h si hubo error crítico (regla “Feedback a tiempo”), y no cuenta las auditorías del Excel sin registro de feedback.',
]

function conHallazgos(lista) {
  const actual = lista || []
  const faltan = HALLAZGOS_CONCILIACION.filter((h) => !actual.includes(h))
  return faltan.length ? [...actual, ...faltan] : actual
}

export function migrarDb(db) {
  if (!db || (db.version || 1) >= VERSION_DB) return db
  return { ...db, version: VERSION_DB, catalogo: { ...db.catalogo, items: separarTemas(db.catalogo.items) }, hallazgos: conHallazgos(db.hallazgos) }
}

export function crearDbDesdeSeed(seed, now = new Date().toISOString()) {
  const parametros = {}
  for (const p of seed.operacion.parametros) parametros[p.key] = p.valor
  const seq = { INB: 0, MON: 0, RET: 0, CAR: 0, ACT: 0 }
  for (const e of seed.evaluaciones) actualizarSeq(seq, e.folio)
  return {
    version: VERSION_DB,
    rev: 0,
    creado: now,
    generadoSeed: seed.generado,
    config: seed.config,
    analistas: seed.analistas,
    agentes: seed.agentes,
    catalogo: { ...seed.catalogo, items: separarTemas(seed.catalogo.items) },
    modelo: seed.modelo,
    operacionDef: {
      parametros: seed.operacion.parametros,
      tareas: seed.operacion.tareas,
      kpis: seed.operacion.kpis,
      basesCatalogo: seed.operacion.basesCatalogo,
      equipo: seed.operacion.equipo,
    },
    operacion: { parametros, tareasMin: {}, kpisManual: {}, tiempos: [], bases: [], calibraciones: [] },
    evaluaciones: seed.evaluaciones,
    seguimientos: {},
    documentos: [],
    actividad: [],
    fuentes: seed.fuentes,
    hallazgos: conHallazgos(seed.hallazgos),
    seq,
  }
}

function actualizarSeq(seq, folio) {
  const m = /^([A-Z]{3})-(\d+)$/.exec(folio || '')
  if (!m) return
  const n = Number(m[2])
  if (!(m[1] in seq) || n > seq[m[1]]) seq[m[1]] = n
}

function siguienteFolio(seq, pref, digitos = 5) {
  seq[pref] = (seq[pref] || 0) + 1
  return `${pref}-${String(seq[pref]).padStart(digitos, '0')}`
}

function upsert(lista, item, campo = 'id') {
  const i = lista.findIndex((x) => x[campo] === item[campo])
  if (i < 0) return [...lista, item]
  const copia = lista.slice()
  copia[i] = item
  return copia
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von'])

function nombreCorto(nombre = '') {
  const p = String(nombre).trim().split(/\s+/)
  if (p.length <= 2) return String(nombre)
  let i = p.length - 2
  if (PARTICULAS.has(p[i].toLowerCase()) && i - 1 >= 1) i--
  return `${p[0]} ${p[i]}`
}

function pct(v) {
  return typeof v === 'number' ? `${Math.round(v * 1000) / 10}%` : '—'
}

function valorParametro(def, v) {
  if (v === null || v === undefined || v === '') return 'automático'
  return def && def.tipo === 'pct' ? pct(Number(v)) : String(v)
}

const AGRUPABLES = new Set(['Documento actualizado', 'Notas del plan actualizadas'])
const VENTANA_AGRUPAR_MS = 10 * 60 * 1000

function registrar(db, env, accion, detalle, ref) {
  if (!env.opId) return db.actividad
  if (db.actividad.some((a) => a.id === env.opId)) return db.actividad
  const entrada = { id: env.opId, fecha: env.now, por: env.por || '', accion, detalle, ref: ref || null }
  const ultima = db.actividad[0]
  if (
    ultima &&
    AGRUPABLES.has(accion) &&
    ultima.accion === accion &&
    ultima.por === entrada.por &&
    ultima.ref &&
    ref &&
    ultima.ref.tipo === ref.tipo &&
    ultima.ref.id === ref.id &&
    new Date(env.now).getTime() - new Date(ultima.fecha).getTime() < VENTANA_AGRUPAR_MS
  ) {
    return [entrada, ...db.actividad.slice(1)]
  }
  return [entrada, ...db.actividad].slice(0, MAX_ACTIVIDAD)
}

export function aplicar(dbIn, env, opciones = {}) {
  const now = env.now || new Date().toISOString()
  env = { ...env, now }
  const p = env.payload
  let db = { ...dbIn, seq: { ...dbIn.seq } }
  let salida = p

  switch (env.op) {
    case 'evaluacion.guardar': {
      const previa = db.evaluaciones.find((e) => e.id === p.id)
      const ev = { ...p }
      const pref = PREFIJO_EVAL[ev.canal] || 'EVA'
      if (previa) {
        ev.folio = ev.folio || previa.folio
        ev.creadoEn = ev.creadoEn || previa.creadoEn
        ev.creadoPor = ev.creadoPor || previa.creadoPor
        if (previa.origen && !ev.origen) ev.origen = previa.origen
      } else {
        const duplicado = ev.folio && db.evaluaciones.some((e) => e.folio === ev.folio && e.id !== ev.id)
        if (!ev.folio || (duplicado && opciones.autoritativo)) ev.folio = siguienteFolio(db.seq, pref)
        ev.creadoEn = ev.creadoEn || now
        ev.creadoPor = ev.creadoPor || env.por || ''
      }
      actualizarSeq(db.seq, ev.folio)
      ev.actualizadoEn = now
      db.evaluaciones = upsert(db.evaluaciones, ev)
      db.actividad = registrar(db, env, previa ? 'Evaluación editada' : 'Evaluación registrada',
        `${ev.folio} · ${nombreCorto(ev.agenteNombre)} · ${pct(ev.puntaje)}`, { tipo: 'evaluacion', id: ev.id })
      salida = ev
      break
    }
    case 'evaluacion.eliminar': {
      const ev = db.evaluaciones.find((e) => e.id === p.id)
      db.evaluaciones = db.evaluaciones.filter((e) => e.id !== p.id)
      if (db.seguimientos[p.id]) {
        db.seguimientos = { ...db.seguimientos }
        delete db.seguimientos[p.id]
      }
      db.documentos = db.documentos.filter((d) => d.evaluacionId !== p.id)
      if (ev) db.actividad = registrar(db, env, 'Evaluación eliminada', `${ev.folio} · ${nombreCorto(ev.agenteNombre)}`, null)
      break
    }
    case 'evaluacion.feedback': {
      db.evaluaciones = db.evaluaciones.map((e) =>
        e.id === p.id ? { ...e, feedback: p.fecha ? { fecha: p.fecha, por: env.por || '' } : undefined, actualizadoEn: now } : e,
      )
      const ev = db.evaluaciones.find((e) => e.id === p.id)
      if (ev) db.actividad = registrar(db, env, p.fecha ? 'Feedback entregado' : 'Feedback desmarcado', `${ev.folio} · ${nombreCorto(ev.agenteNombre)}`, { tipo: 'evaluacion', id: ev.id })
      break
    }
    case 'seguimiento.actualizar': {
      const actual = db.seguimientos[p.evaluacionId] || { evaluacionId: p.evaluacionId }
      const nuevo = { ...actual }
      for (const [k, v] of Object.entries(p)) {
        if (v === null || v === undefined || v === '') delete nuevo[k]
        else nuevo[k] = v
      }
      nuevo.evaluacionId = p.evaluacionId
      nuevo.actualizadoEn = now
      db.seguimientos = { ...db.seguimientos, [p.evaluacionId]: nuevo }
      const ev = db.evaluaciones.find((e) => e.id === p.evaluacionId)
      if (ev) {
        const que = p.cierreManual
          ? 'Plan cerrado manualmente'
          : 'cierreManual' in p && actual.cierreManual
            ? 'Plan reabierto'
            : p.accionRealizada
              ? 'Acción del plan realizada'
              : 'accionRealizada' in p && actual.accionRealizada
                ? 'Acción del plan desmarcada'
                : p.causa
                  ? `Causa raíz: ${p.causa}`
                  : p.retomado
                    ? 'Plan del Excel retomado'
                    : 'notas' in p
                      ? 'Notas del plan actualizadas'
                      : 'Plan actualizado'
        db.actividad = registrar(db, env, que, `${ev.folio} · ${nombreCorto(ev.agenteNombre)}`, { tipo: 'plan', id: ev.id })
      }
      break
    }
    case 'documento.guardar': {
      const previo = db.documentos.find((d) => d.id === p.id)
      const doc = { ...p }
      if (previo) {
        doc.folio = doc.folio || previo.folio
        doc.creadoEn = doc.creadoEn || previo.creadoEn
        doc.creadoPor = doc.creadoPor || previo.creadoPor
      } else {
        const pref = PREFIJO_DOC[doc.tipo] || 'DOC'
        const duplicado = doc.folio && db.documentos.some((d) => d.folio === doc.folio && d.id !== doc.id)
        if (!doc.folio || (duplicado && opciones.autoritativo)) doc.folio = siguienteFolio(db.seq, pref, 4)
        doc.creadoEn = doc.creadoEn || now
        doc.creadoPor = doc.creadoPor || env.por || ''
      }
      actualizarSeq(db.seq, doc.folio)
      doc.actualizadoEn = now
      db.documentos = upsert(db.documentos, doc)
      const antes = (previo && previo.firmas) || {}
      const despues = doc.firmas || {}
      const nuevas = Object.keys(despues).filter((k) => !antes[k])
      const retiradas = Object.keys(antes).filter((k) => !despues[k])
      const quien = (k, f) => `${ETIQUETA_FIRMANTE[k] || k}${f && f.nombre ? ` (${f.nombre})` : ''}`
      let accion = 'Documento actualizado'
      let extra = ''
      if (!previo) accion = 'Documento generado'
      else if (doc.anulado && !previo.anulado) accion = 'Documento anulado'
      else if (nuevas.length) {
        accion = (FIRMANTES_DOC[doc.tipo] || []).every((k) => despues[k]) ? 'Documento firmado por todos' : 'Documento firmado'
        extra = ` · firmó ${nuevas.map((k) => quien(k, despues[k])).join(', ')}`
      } else if (retiradas.length) {
        accion = 'Firma retirada'
        extra = ` · ${retiradas.map((k) => quien(k, antes[k])).join(', ')}`
      }
      db.actividad = registrar(db, env, accion, `${doc.folio} · ${NOMBRE_DOC[doc.tipo] || 'Documento'} · ${nombreCorto(doc.agenteNombre)}${extra}`, { tipo: 'documento', id: doc.id })
      if (doc.tipo === 'retro' && !doc.anulado && nuevas.includes('colaborador')) {
        db.evaluaciones = db.evaluaciones.map((e) =>
          e.id === doc.evaluacionId && !e.feedback ? { ...e, feedback: { fecha: despues.colaborador.fecha || now, por: env.por || '' }, actualizadoEn: now } : e,
        )
      }
      salida = doc
      break
    }
    case 'documento.eliminar': {
      const doc = db.documentos.find((d) => d.id === p.id)
      db.documentos = db.documentos.filter((d) => d.id !== p.id)
      if (doc) db.actividad = registrar(db, env, 'Documento eliminado', `${doc.folio} · ${nombreCorto(doc.agenteNombre)}`, null)
      break
    }
    case 'agente.guardar': {
      const ag = { ...p }
      const anterior = ag.idAnterior && ag.idAnterior !== ag.id ? ag.idAnterior : null
      delete ag.idAnterior
      if (anterior) {
        db.agentes = db.agentes.filter((a) => a.id !== anterior)
        db.evaluaciones = db.evaluaciones.map((e) => (e.agenteId === anterior ? { ...e, agenteId: ag.id, agenteNombre: ag.nombre } : e))
        db.documentos = db.documentos.map((d) => (d.agenteId === anterior ? { ...d, agenteId: ag.id } : d))
      }
      const previo = db.agentes.find((a) => a.id === ag.id)
      if (previo && previo.nombre !== ag.nombre) {
        db.evaluaciones = db.evaluaciones.map((e) => (e.agenteId === ag.id ? { ...e, agenteNombre: ag.nombre } : e))
      }
      db.agentes = upsert(db.agentes, ag)
      const dictamen = ag.dictamen && (!previo || previo.dictamen !== ag.dictamen)
      const queAgente = dictamen ? 'Dictamen del periodo de prueba' : previo || anterior ? 'Ejecutivo actualizado' : 'Ejecutivo agregado'
      db.actividad = registrar(db, env, queAgente, `${ag.nombre} (${ag.id})${dictamen ? ` · ${ag.dictamen === 'acredita' ? 'Acredita' : 'No acredita'}` : ''}`, { tipo: 'agente', id: ag.id })
      salida = ag
      break
    }
    case 'agente.eliminar': {
      const ag = db.agentes.find((a) => a.id === p.id)
      const tieneHistoria = db.evaluaciones.some((e) => e.agenteId === p.id)
      if (tieneHistoria) db.agentes = db.agentes.map((a) => (a.id === p.id ? { ...a, activo: false } : a))
      else db.agentes = db.agentes.filter((a) => a.id !== p.id)
      if (ag) db.actividad = registrar(db, env, tieneHistoria ? 'Ejecutivo desactivado' : 'Ejecutivo eliminado', `${ag.nombre} (${ag.id})`, tieneHistoria ? { tipo: 'agente', id: ag.id } : null)
      break
    }
    case 'analista.guardar': {
      const previo = db.analistas.find((a) => a.id === p.id)
      db.analistas = upsert(db.analistas, { ...p })
      if (previo && previo.nombre !== p.nombre) {
        db.evaluaciones = db.evaluaciones.map((e) => (e.analistaId === p.id ? { ...e, analista: p.nombre } : e))
      }
      db.actividad = registrar(db, env, previo ? 'Analista actualizado' : 'Analista agregado', `${p.nombre}${p.activo === false ? ' · inactivo' : ''}`, { tipo: 'analista', id: p.id })
      break
    }
    case 'analista.eliminar': {
      const an = db.analistas.find((a) => a.id === p.id)
      const tieneHistoria = db.evaluaciones.some((e) => e.analistaId === p.id)
      if (tieneHistoria) db.analistas = db.analistas.map((a) => (a.id === p.id ? { ...a, activo: false } : a))
      else db.analistas = db.analistas.filter((a) => a.id !== p.id)
      if (an) db.actividad = registrar(db, env, tieneHistoria ? 'Analista desactivado' : 'Analista eliminado', an.nombre, null)
      break
    }
    case 'config.actualizar': {
      db.config = { ...db.config, ...p }
      db.actividad = registrar(db, env, 'Configuración actualizada', Object.keys(p).join(', '), null)
      break
    }
    case 'catalogo.item': {
      const cedulas = db.catalogo.cedulas.map((c) => {
        if (c.id !== p.cedulaId) return c
        const items = c.items.map((it) => (it.key === p.key ? { ...it, ...p.cambios } : it))
        return { ...c, items, total: items.reduce((s, it) => s + (Number(it.peso) || 0), 0) }
      })
      db.catalogo = { ...db.catalogo, cedulas }
      db.actividad = registrar(db, env, 'Catálogo actualizado', `${p.cedulaId} · ${p.key}`, null)
      break
    }
    case 'operacion.parametro': {
      const def = ((db.operacionDef && db.operacionDef.parametros) || []).find((x) => x.key === p.key)
      const anterior = db.operacion.parametros[p.key]
      db.operacion = { ...db.operacion, parametros: { ...db.operacion.parametros, [p.key]: p.valor } }
      db.actividad = registrar(db, env, 'Parámetro actualizado', `${def ? def.nombre : p.key}: ${valorParametro(def, anterior)} → ${valorParametro(def, p.valor)}`, { tipo: 'parametro', id: p.key })
      break
    }
    case 'operacion.tarea': {
      const tareasMin = { ...db.operacion.tareasMin }
      if (p.minEstandar === null || p.minEstandar === undefined || p.minEstandar === '') delete tareasMin[p.id]
      else tareasMin[p.id] = Number(p.minEstandar)
      db.operacion = { ...db.operacion, tareasMin }
      const t = ((db.operacionDef && db.operacionDef.tareas) || []).find((x) => x.id === p.id)
      db.actividad = registrar(db, env, 'Tiempo estándar actualizado', `${p.id}${t ? ` · ${t.tarea}` : ''}: ${p.id in tareasMin ? `${tareasMin[p.id]} min` : 'valor original del modelo'}`, { tipo: 'tarea', id: p.id })
      break
    }
    case 'operacion.kpi': {
      const mes = { ...(db.operacion.kpisManual[p.mes] || {}) }
      if (p.valor === null || p.valor === undefined || p.valor === '') delete mes[p.id]
      else mes[p.id] = Number(p.valor)
      db.operacion = { ...db.operacion, kpisManual: { ...db.operacion.kpisManual, [p.mes]: mes } }
      const k = ((db.operacionDef && db.operacionDef.kpis) || []).find((x) => x.id === p.id)
      const v = p.id in mes ? (k && k.unidad === 'pct' ? pct(mes[p.id]) : String(mes[p.id])) : 'cálculo automático'
      db.actividad = registrar(db, env, 'KPI capturado', `${k ? k.nombre : p.id} · ${p.mes}: ${v}`, { tipo: 'kpi', id: p.mes })
      break
    }
    case 'tiempo.guardar': {
      const previo = db.operacion.tiempos.some((t) => t.id === p.id)
      db.operacion = { ...db.operacion, tiempos: upsert(db.operacion.tiempos, { ...p }) }
      db.actividad = registrar(db, env, previo ? 'Tiempo actualizado' : 'Tiempo registrado', `${p.tareaId} · ${p.fecha} ${p.inicio}–${p.fin} · ${p.cantidad} u.`, { tipo: 'tiempo', id: p.id })
      break
    }
    case 'tiempo.eliminar': {
      const t = db.operacion.tiempos.find((x) => x.id === p.id)
      db.operacion = { ...db.operacion, tiempos: db.operacion.tiempos.filter((x) => x.id !== p.id) }
      if (t) db.actividad = registrar(db, env, 'Tiempo eliminado', `${t.tareaId} · ${t.fecha} ${t.inicio}–${t.fin}`, null)
      break
    }
    case 'base.guardar': {
      const previo = db.operacion.bases.find((b) => b.id === p.id)
      db.operacion = { ...db.operacion, bases: upsert(db.operacion.bases, { ...p }) }
      const que = !previo ? (p.tipo === 'correo' ? 'Correo registrado' : 'Base registrada') : p.respondido && !previo.respondido ? (p.tipo === 'correo' ? 'Correo respondido' : 'Base respondida') : 'Registro de base actualizado'
      db.actividad = registrar(db, env, que, `${p.nombre} · ${p.casos || 0} casos`, { tipo: 'base', id: p.id })
      break
    }
    case 'base.eliminar': {
      const b = db.operacion.bases.find((x) => x.id === p.id)
      db.operacion = { ...db.operacion, bases: db.operacion.bases.filter((x) => x.id !== p.id) }
      if (b) db.actividad = registrar(db, env, 'Registro de base eliminado', b.nombre, null)
      break
    }
    case 'calibracion.guardar': {
      const lista = db.operacion.calibraciones || []
      const previo = lista.some((c) => c.id === p.id)
      db.operacion = { ...db.operacion, calibraciones: upsert(lista, { ...p, creadoPor: p.creadoPor || env.por || '' }) }
      const vals = Object.values(p.puntajes || {}).filter((v) => typeof v === 'number')
      const desv = vals.length > 1 ? Math.round((Math.max(...vals) - Math.min(...vals)) * 1000) / 10 : 0
      db.actividad = registrar(db, env, previo ? 'Calibración actualizada' : 'Calibración registrada', `${p.referencia || 'Sin referencia'} · ${vals.length} analistas · desviación ${desv} pts`, { tipo: 'calibracion', id: p.id })
      break
    }
    case 'calibracion.eliminar': {
      const lista = db.operacion.calibraciones || []
      const c = lista.find((x) => x.id === p.id)
      db.operacion = { ...db.operacion, calibraciones: lista.filter((x) => x.id !== p.id) }
      if (c) db.actividad = registrar(db, env, 'Calibración eliminada', c.referencia || c.fecha, null)
      break
    }
    case 'evaluaciones.importar': {
      const llave = (e) => [e.canal, e.agenteId, e.fechaEvaluacion, String(e.idCaso || '').trim(), e.cedulaId].join('|')
      const existentes = new Set(db.evaluaciones.map(llave))
      const ids = new Set(db.evaluaciones.map((e) => e.id))
      const nuevas = []
      let duplicadas = 0
      for (const e of p.evaluaciones || []) {
        if (ids.has(e.id) || existentes.has(llave(e))) {
          duplicadas++
          continue
        }
        const ev = { ...e }
        if (!ev.folio || db.evaluaciones.some((x) => x.folio === ev.folio) || nuevas.some((x) => x.folio === ev.folio)) {
          ev.folio = siguienteFolio(db.seq, PREFIJO_EVAL[ev.canal] || 'EVA')
        }
        actualizarSeq(db.seq, ev.folio)
        ev.creadoEn = ev.creadoEn || now
        ev.actualizadoEn = now
        ev.creadoPor = ev.creadoPor || env.por || ''
        existentes.add(llave(ev))
        ids.add(ev.id)
        nuevas.push(ev)
      }
      db.evaluaciones = [...db.evaluaciones, ...nuevas]
      db.actividad = registrar(db, env, 'Importación desde Excel', `${nuevas.length} evaluaciones nuevas · ${duplicadas} ya existían`, null)
      salida = { evaluaciones: nuevas, duplicadas }
      break
    }
    case 'datos.restaurar': {
      const nuevo = migrarDb(p.db)
      db = { ...nuevo, rev: dbIn.rev, seq: { ...nuevo.seq } }
      db.actividad = registrar(db, env, 'Respaldo restaurado', `${nuevo.evaluaciones.length} evaluaciones`, null)
      salida = { db }
      break
    }
    default:
      throw new Error(`Operación desconocida: ${env.op}`)
  }
  return { db, payload: salida, env: { ...env, payload: salida } }
}
