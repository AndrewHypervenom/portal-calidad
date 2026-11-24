import type { Agente, Analista, Canal, DB, Evaluacion, Resp } from './types'
import { calificar } from './scoring'
import { cedulaPorTipoLlamada, bloquesDeCedula } from './catalog'
import { semanaDelMes } from './dates'
import { duracion, normalizar, uid } from './format'
import { semaforoDe, ETIQUETA_SEMAFORO } from './scoring'

type XLSX = typeof import('xlsx')
let xlsxMod: Promise<XLSX> | null = null
function cargarXlsx(): Promise<XLSX> {
  if (!xlsxMod) xlsxMod = import('xlsx')
  return xlsxMod
}

export interface HojaExport {
  nombre: string
  filas: Record<string, unknown>[]
  anchos?: Record<string, number>
}

export async function exportarLibro(archivo: string, hojas: HojaExport[]) {
  const X = await cargarXlsx()
  const libro = X.utils.book_new()
  for (const h of hojas) {
    const hoja = X.utils.json_to_sheet(h.filas.length ? h.filas : [{ Aviso: 'Sin datos para los filtros elegidos' }])
    const columnas = Object.keys(h.filas[0] ?? { Aviso: '' })
    hoja['!cols'] = columnas.map((c) => ({ wch: h.anchos?.[c] ?? Math.min(48, Math.max(10, c.length + 2)) }))
    X.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31))
  }
  X.writeFile(libro, archivo.endsWith('.xlsx') ? archivo : `${archivo}.xlsx`, { compression: true })
}

const TEXTO_RESP: Record<Resp, string> = { S: 'Sí', N: 'No', A: 'N/A' }

export function hojasEvaluaciones(db: DB, evals: Evaluacion[]): HojaExport[] {
  const hojas: HojaExport[] = []
  for (const canal of ['Inbound', 'Monitoreo'] as Canal[]) {
    const lista = evals.filter((e) => e.canal === canal).sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion) || a.folio.localeCompare(b.folio))
    if (!lista.length) continue
    const items = Object.values(db.catalogo.items)
      .filter((d) => d.canal === canal)
      .sort((a, b) => a.fila - b.fila)
    const filas = lista.map((e) => {
      const ced = db.catalogo.cedulas.find((c) => c.id === e.cedulaId)
      const sem = semaforoDe(e.puntaje, e.critico, db.config)
      const fila: Record<string, unknown> = {
        Folio: e.folio,
        'Fecha de evaluación': e.fechaEvaluacion,
        Semana: e.semana,
        'Fecha de llamada': e.fechaLlamada ?? '',
        'ID ejecutivo': e.agenteId,
        Ejecutivo: e.agenteNombre,
        Proceso: e.proceso,
        Cédula: ced?.nombre ?? e.cedulaId,
        'Tipo de llamada': e.tipoLlamada,
        Analista: e.analista,
        'Duración (mm:ss)': duracion(e.duracionSeg),
        'ID cliente / llamada / caso': e.idCaso,
        Calificación: e.puntaje === null ? '' : Math.round(e.puntaje * 10000) / 10000,
        'Error crítico': e.critico ? 'Sí' : 'No',
        Resultado: e.critico ? 'Error crítico' : sem ? ETIQUETA_SEMAFORO[sem] : '',
        Observaciones: e.observaciones,
      }
      for (const it of items) {
        const r = e.respuestas[it.key]
        fila[`${it.bloque} · ${it.topico}`] = it.key in e.pesos ? (r ? TEXTO_RESP[r] : '') : 'No aplica a la cédula'
        if (it.motivos?.length) fila[`Motivo · ${it.topico}`] = e.motivos[it.key] ?? ''
      }
      for (const it of items) if (e.areas[it.key]) fila[`Área de oportunidad · ${it.topico}`] = e.areas[it.key]
      return fila
    })
    hojas.push({ nombre: canal, filas, anchos: { Ejecutivo: 34, Cédula: 30, 'Tipo de llamada': 34, Analista: 28, Observaciones: 60 } })
  }
  return hojas
}

export interface FilaImport {
  fila: number
  ev: Evaluacion | null
  estado: 'nueva' | 'duplicada' | 'error'
  mensajes: string[]
  promedioExcel: number | null
  coincide: boolean | null
  agenteNuevo?: Agente
  analistaNuevo?: Analista
}

export interface ResultadoImport {
  archivo: string
  canal: Canal
  filas: FilaImport[]
  avisos: string[]
}

function areasDesalineadas(hoja: import('xlsx').WorkSheet, areas: Record<string, string>, items: DB['catalogo']['items'], canal: Canal) {
  const res: { key: string; col: string; leeDe: string | null }[] = []
  for (const [key, col] of Object.entries(areas)) {
    const f = String((hoja[`${col}1`] as { f?: string } | undefined)?.f ?? '')
    if (!f) continue
    const m = /Evaluaci[oó]n'?!\$?[A-Z]+\$?(\d+)/.exec(f)
    const fila = m ? Number(m[1]) : null
    if (fila === items[key]?.fila) continue
    res.push({ key, col, leeDe: fila === null ? null : (Object.values(items).find((i) => i.canal === canal && i.fila === fila)?.key ?? null) })
  }
  return res
}

function clave(t: unknown): string {
  return normalizar(String(t ?? '')).replace(/[^a-z0-9]/g, '')
}

function similitud(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigr = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const A = bigr(a)
  const B = bigr(b)
  let inter = 0
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0)
  return (2 * inter) / (a.length - 1 + b.length - 1)
}

function respuestaDe(v: unknown): Resp | null {
  const t = clave(v)
  if (t === 'si' || t === 's') return 'S'
  if (t === 'no') return 'N'
  if (t === 'na' || t === 'noaplica') return 'A'
  return null
}

function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return ''
  const t = String(v).trim()
  return t === '0' || t === '#REF!' || t === '-' ? '' : t
}

function fechaCelda(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim())) {
    const [d, m, y] = v.trim().split('/').map(Number)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function duracionCelda(v: unknown): { seg: number | null; nota?: string } {
  let h = 0
  let m = 0
  let s = 0
  if (v === null || v === undefined || v === '' || v === 0) return { seg: null }
  if (v instanceof Date) {
    h = v.getUTCHours()
    m = v.getUTCMinutes()
    s = v.getUTCSeconds()
  } else if (typeof v === 'number') {
    const tot = Math.round((v % 1) * 86400)
    h = Math.floor(tot / 3600)
    m = Math.floor((tot % 3600) / 60)
    s = tot % 60
  } else {
    const p = String(v).trim().split(/[:.]/).map(Number)
    if (p.some((x) => Number.isNaN(x))) return { seg: null, nota: `Duración no reconocida: ${v}` }
    if (p.length === 3) [h, m, s] = p
    else if (p.length === 2) [m, s] = p
    else return { seg: null }
  }
  if (h >= 1 && s === 0) return { seg: h * 60 + m, nota: `Duración ${h}:${String(m).padStart(2, '0')}:00 interpretada como ${h}:${String(m).padStart(2, '0')} (mm:ss)` }
  return { seg: h * 3600 + m * 60 + s }
}

function idsIniciales(nombre: string): string {
  return (
    normalizar(nombre)
      .split(' ')
      .filter((p) => p && !['de', 'del', 'la', 'las', 'los'].includes(p))
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'AG'
  )
}

export async function leerAcumulado(archivo: File, db: DB): Promise<ResultadoImport> {
  const X = await cargarXlsx()
  const libro = X.read(await archivo.arrayBuffer(), { cellDates: true, dense: false, UTC: true, cellFormula: true })
  const nombreHoja = libro.SheetNames.find((n) => clave(n) === 'acumulado')
  if (!nombreHoja) throw new Error('El archivo no tiene una hoja llamada “Acumulado”.')
  const hoja = libro.Sheets[nombreHoja]
  const celda = (col: string, fila: number) => {
    const c = hoja[`${col}${fila}`]
    return c && c.t !== 'e' ? (c.v as unknown) : undefined
  }
  const esError = (col: string, fila: number) => hoja[`${col}${fila}`]?.t === 'e'
  const canal: Canal = clave(celda('D', 4)) === 'proceso' ? 'Monitoreo' : 'Inbound'
  const mapa = db.catalogo.acumulado[canal]
  const items = db.catalogo.items
  const topico = (key: string) => `“${items[key]?.bloque ? `${items[key].bloque} · ` : ''}${items[key]?.topico ?? key}”`
  const desalineadas = areasDesalineadas(hoja, mapa.areas, items, canal)
  const marcasRotas = desalineadas.filter((d) => d.leeDe === null)
  let afectadas = 0
  const campos = mapa.campos
  const agentes = [...db.agentes]
  const analistas = [...db.analistas]
  const existentes = new Set(db.evaluaciones.map((e) => [e.canal, e.agenteId, e.fechaEvaluacion, e.idCaso.trim(), e.cedulaId].join('|')))
  const filas: FilaImport[] = []
  const rango = X.utils.decode_range(hoja['!ref'] ?? 'A1:A1')

  for (let f = 5; f <= rango.e.r + 1; f++) {
    const nombre = textoCelda(celda(campos.nombre, f))
    if (!nombre) continue
    const mensajes: string[] = []
    const fechaEval = fechaCelda(celda(campos.fechaEvaluacion, f))
    const tipo = textoCelda(celda(campos.tipo, f))
    const ced = cedulaPorTipoLlamada(db.catalogo, canal, tipo)
    if (!fechaEval || !ced) {
      filas.push({ fila: f, ev: null, estado: 'error', mensajes: [!fechaEval ? 'Fecha de evaluación inválida' : `Cédula no reconocida: “${tipo}”`], promedioExcel: null, coincide: null })
      continue
    }
    const idTxt = textoCelda(celda(campos.id, f))
    let agente = idTxt ? agentes.find((a) => a.id.toUpperCase() === idTxt.toUpperCase()) : undefined
    let agenteNuevo: Agente | undefined
    if (!agente) {
      const k = clave(nombre)
      let mejor: Agente | undefined
      let p = 0
      for (const a of agentes) {
        if (a.canal !== canal) continue
        for (const n of [a.nombre, ...(a.alias ?? [])]) {
          const s = similitud(clave(n), k)
          if (s > p) {
            p = s
            mejor = a
          }
        }
      }
      if (mejor && p >= 0.86) {
        agente = mejor
        mensajes.push(`Ejecutivo identificado por nombre (${mejor.id})`)
      } else {
        let id = idTxt || idsIniciales(nombre)
        let n = 2
        while (agentes.some((a) => a.id === id)) id = `${idTxt || idsIniciales(nombre)}${n++}`
        agenteNuevo = { id, nombre, canal, proceso: canal === 'Inbound' ? 'Inbound' : textoCelda(celda(campos.proceso ?? 'D', f)) || 'Monitoreo', activo: true, idProvisional: !idTxt }
        agentes.push(agenteNuevo)
        agente = agenteNuevo
        mensajes.push(`Ejecutivo nuevo: se agregará (${id})`)
      }
    }
    const analistaTxt = textoCelda(celda(campos.analista, f))
    const ka = clave(analistaTxt)
    let analista = analistas.find((a) => [a.nombre, a.corto, ...a.alias].some((n) => clave(n) === ka))
    if (!analista) analista = analistas.find((a) => similitud(clave(a.nombre), ka) > 0.85)
    let analistaNuevo: Analista | undefined
    if (!analista && analistaTxt) {
      analistaNuevo = { id: normalizar(analistaTxt).replace(/\s+/g, '-'), nombre: analistaTxt, corto: analistaTxt, activo: true, alias: [] }
      analistas.push(analistaNuevo)
      analista = analistaNuevo
      mensajes.push('Analista nuevo: se agregará')
    }
    const aplicables = new Set(ced.items.map((i) => i.key))
    const respuestas: Record<string, Resp> = {}
    const motivos: Record<string, string> = {}
    const areas: Record<string, string> = {}
    for (const [key, col] of Object.entries(mapa.respuestas)) {
      const r = respuestaDe(celda(col, f))
      if (r && aplicables.has(key)) respuestas[key] = r
    }
    for (const [key, col] of Object.entries(mapa.motivos)) {
      const t = textoCelda(celda(col, f))
      if (t && aplicables.has(key)) motivos[key] = t
    }
    const conFormulaRota = marcasRotas.some((d) => esError(d.col, f))
    if (conFormulaRota) afectadas++
    for (const [key, col] of Object.entries(mapa.areas)) {
      const desalineada = conFormulaRota ? desalineadas.find((d) => d.col === col) : undefined
      const destino = desalineada ? desalineada.leeDe : key
      const t = textoCelda(celda(col, f))
      if (destino && t && aplicables.has(destino)) {
        areas[destino] = t
        if (destino !== key) mensajes.push(`Área de oportunidad de ${topico(destino)} tomada de la columna ${col} (fórmula rota del Excel)`)
      }
    }
    if (conFormulaRota)
      for (const d of desalineadas)
        if (respuestas[d.key] === 'N' && !desalineadas.some((x) => x.leeDe === d.key && x.col !== d.col) && !areas[d.key])
          mensajes.push(`El Excel no guardó el área de oportunidad de ${topico(d.key)} (fórmula rota)`)
    const faltan = ced.items.filter((i) => !respuestas[i.key]).length
    if (faltan) mensajes.push(`${faltan} rubro(s) sin respuesta`)
    const dur = duracionCelda(celda(campos.duracion, f))
    if (dur.nota) mensajes.push(dur.nota)
    const calif = calificar(ced.items, db.catalogo.items, respuestas, motivos)
    const promedioCelda = celda(campos.promedio, f)
    const promedioExcel = typeof promedioCelda === 'number' ? promedioCelda : null
    const coincide = promedioExcel === null || calif.puntaje === null ? null : Math.abs(promedioExcel - calif.puntaje) < 1e-9
    if (coincide === false) mensajes.push(`Excel tenía ${(promedioExcel! * 100).toFixed(1)}%; el portal calcula ${((calif.puntaje ?? 0) * 100).toFixed(1)}%`)
    const semanaCelda = Number(celda(campos.semana, f))
    const idCasoV = celda(campos.caso, f)
    const ev: Evaluacion = {
      id: uid(),
      folio: '',
      canal,
      cedulaId: ced.id,
      tipoLlamada: canal === 'Inbound' ? ced.nombreExcel : tipo,
      proceso: canal === 'Inbound' ? 'Inbound' : textoCelda(celda(campos.proceso ?? 'D', f)) || 'Monitoreo',
      agenteId: agente.id,
      agenteNombre: agente.nombre,
      analistaId: analista?.id ?? '',
      analista: analista?.nombre ?? analistaTxt,
      fechaLlamada: campos.fechaLlamada ? fechaCelda(celda(campos.fechaLlamada, f)) : null,
      fechaEvaluacion: fechaEval,
      semana: semanaCelda >= 1 && semanaCelda <= 6 ? semanaCelda : semanaDelMes(fechaEval),
      duracionSeg: dur.seg,
      idCaso: idCasoV === null || idCasoV === undefined ? '' : String(typeof idCasoV === 'number' ? Math.round(idCasoV) : idCasoV).trim(),
      tipoAuditoria: 'AUDIO Y PROCESOS',
      respuestas,
      motivos,
      areas,
      observaciones: textoCelda(celda(campos.observaciones, f)),
      pesos: Object.fromEntries(ced.items.map((i) => [i.key, i.peso])),
      criticos: Object.fromEntries(ced.items.filter((i) => i.critico !== 'no').map((i) => [i.key, i.critico])),
      puntaje: calif.puntaje,
      critico: calif.critico,
      origen: { tipo: 'excel', archivo: archivo.name, fila: f, folioExcel: celda(campos.folio, f) as number, promedioExcel, agenteOriginal: nombre, idOriginal: idTxt || null },
      notasMigracion: mensajes.filter((m) => !m.startsWith('Ejecutivo nuevo') && !m.startsWith('Analista nuevo')),
      creadoEn: '',
      actualizadoEn: '',
      creadoPor: '',
    }
    const llave = [ev.canal, ev.agenteId, ev.fechaEvaluacion, ev.idCaso, ev.cedulaId].join('|')
    const duplicada = existentes.has(llave)
    existentes.add(llave)
    filas.push({ fila: f, ev, estado: duplicada ? 'duplicada' : 'nueva', mensajes, promedioExcel, coincide, agenteNuevo, analistaNuevo })
  }
  const avisos = desalineadas.map((d) =>
    d.leeDe === null
      ? `Columna ${d.col} del Acumulado (área de oportunidad de ${topico(d.key)}): su fórmula en la fila 1 apunta a una celda borrada (#REF!), por eso el Excel no guarda esa área.`
      : `Columna ${d.col} del Acumulado (área de oportunidad de ${topico(d.key)}): su fórmula en la fila 1 lee el área de ${topico(d.leeDe)}.`,
  )
  if (desalineadas.length)
    avisos.push(
      afectadas
        ? `${afectadas === 1 ? '1 evaluación se guardó' : `${afectadas} evaluaciones se guardaron`} con esas fórmulas: el portal asigna cada área al rubro del que realmente se leyó. Conviene corregir la fila 1 del Acumulado en el Excel.`
        : 'Ninguna evaluación del archivo se guardó con esas fórmulas, pero conviene corregir la fila 1 del Acumulado en el Excel.',
    )
  return { archivo: archivo.name, canal, filas, avisos }
}

export function rubrosEnTexto(db: DB, ev: Evaluacion): string {
  return bloquesDeCedula(db.catalogo, ev.cedulaId)
    .map((g) => `${g.bloque}: ${g.items.map((i) => `${i.def.topico} = ${ev.respuestas[i.key] ? TEXTO_RESP[ev.respuestas[i.key]] : '—'}`).join('; ')}`)
    .join('\n')
}
