process.env.TZ = 'America/Mexico_City'

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { crearDbDesdeSeed } from '../src/shared/reducer.js'
import { cedulaPorTipoLlamada } from '../src/lib/catalog'
import { promedio } from '../src/lib/analytics'
import { calcularCapacidad, calcularMuestreo, repartoEquipo } from '../src/lib/operacion'
import { cumplimiento, estadoKpi } from '../src/lib/kpis'
import { nivelDe } from '../src/lib/plans'
import { semaforoDe } from '../src/lib/scoring'
import { sumarDias } from '../src/lib/dates'
import type { Canal, Causa, DB, Evaluacion } from '../src/lib/types'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const db: DB = crearDbDesdeSeed(seed, '2026-10-02T12:00:00.000Z')

const RAIZ = new URL('../../', import.meta.url)
const LIBRO = {
  Inbound: new URL('CEDULA INBOUND ADRIANA SEP.xlsm', RAIZ),
  Monitoreo: new URL('Cedula Monitoreo Adriana SEP 1.xlsm', RAIZ),
  Modelo: new URL('Modelo Reincidencias-Plan de acción.xlsx', RAIZ),
}
const hayLibros = Object.values(LIBRO).every((u) => existsSync(u))
const libros = new Map<keyof typeof LIBRO, XLSX.WorkBook>()
function leer(nombre: keyof typeof LIBRO) {
  let wb = libros.get(nombre)
  if (!wb) {
    wb = XLSX.read(readFileSync(LIBRO[nombre]), { cellFormula: true, cellDates: true, UTC: true })
    libros.set(nombre, wb)
  }
  return wb
}

type Celda = XLSX.CellObject & { f?: string }
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const igual = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9)
const norm = (t: unknown) => String(t ?? '').replace(/\u00a0/g, ' ').trim().toUpperCase()

type Causa_ =
  | 'coincide'
  | 'ref'
  | 'captura'
  | 'fila1'
  | 'portal'

interface Resultado {
  hoja: string
  celda: string
  formula: string
  excel: unknown
  portal: number | null
  causa: Causa_
}

const HOJAS_DATOS = ['Acumulado', 'Evaluación', 'Retroalimentación', 'Tipo de llamada', 'Cedulas', 'Descriptor']

function conciliarReportes(canal: Canal): Resultado[] {
  const libro = leer(canal)
  const evals = db.evaluaciones.filter((e) => e.canal === canal)
  const columnaRubro = new Map<string, string>()
  for (const [k, col] of Object.entries(db.catalogo.acumulado[canal].respuestas)) columnaRubro.set(col, k)
  const motivoDeColumna = (col: string) => Object.entries(db.catalogo.acumulado[canal].motivos).find(([, c]) => c === col)?.[0]
  const acumulado = libro.Sheets['Acumulado']
  const filaUno = { H: norm(acumulado.H1?.v), D: norm(acumulado.D1?.v), C: norm(acumulado.C1?.v), I: acumulado.I1?.v }
  const cedulaDe = (texto: unknown) => cedulaPorTipoLlamada(db.catalogo, canal, String(texto ?? '').replace(/\u00a0/g, ' ').trim())?.id
  const analistaDe = (nombre: unknown) => db.analistas.find((a) => [a.nombre, a.corto, ...a.alias].some((x) => norm(x) === norm(nombre)))?.id
  const resultados: Resultado[] = []

  for (const [nombreHoja, h] of Object.entries(libro.Sheets)) {
    if (HOJAS_DATOS.includes(nombreHoja)) continue
    for (const dir of Object.keys(h).filter((k) => !k.startsWith('!'))) {
      const c = h[dir] as Celda
      if (!c.f || !/Acumulado!/.test(c.f)) continue
      const f = c.f.replace(/\$/g, '')
      const funcion = /AVERAGE/.test(f) ? 'promedio' : /COUNT/.test(f) && !/COUNTA/.test(f) ? 'conteo' : null
      if (!funcion) continue
      if (c.t === 'e' || /#REF!/.test(f)) {
        resultados.push({ hoja: `${canal} · ${nombreHoja}`, celda: dir, formula: c.f, excel: c.v, portal: null, causa: 'ref' })
        continue
      }
      const ref = (a: string) => {
        const m = /^(?:'?([^'!]+)'?!)?([A-Z]+\d+)$/.exec(a.trim())
        if (!m) return undefined
        return (m[1] ? libro.Sheets[m[1]] : h)?.[m[2]]?.v
      }
      const criterios: [string, unknown][] = []
      for (const m of f.matchAll(/Acumulado!([A-Z]+):\1,((?:'[^']+'|[A-Za-zÁÉÍÓÚ ]+)?!?[A-Z]+\d+|"[^"]*"|\d+)/g)) {
        const crudo = m[2]
        criterios.push([m[1], crudo.startsWith('"') ? crudo.slice(1, -1) : /^\d+$/.test(crudo) ? Number(crudo) : ref(crudo)])
      }
      const cumple = (e: Evaluacion, [columna, valor]: [string, unknown], literal: boolean): boolean => {
        const v = typeof valor === 'string' ? norm(valor) : valor
        switch (columna) {
          case 'H':
            return literal ? norm(e.tipoLlamada) === v : e.cedulaId === cedulaDe(valor) && (canal === 'Inbound' || norm(e.tipoLlamada) === v)
          case 'C':
            return literal ? norm(e.origen?.idOriginal ?? '') === v : norm(e.agenteId) === v
          case 'D':
            if (canal === 'Monitoreo') return norm(e.proceso) === v
            return literal ? norm(e.analista) === v || analistaDe(e.analista) === analistaDe(valor) : e.analistaId === analistaDe(valor)
          case 'E':
            return canal === 'Monitoreo' && e.analistaId === analistaDe(valor)
          case 'F':
            return valor instanceof Date && e.fechaEvaluacion === valor.toISOString().slice(0, 10)
          case 'I':
            return e.semana === Number(valor)
          default: {
            const k = columnaRubro.get(columna)
            if (k) return (e.respuestas[k] ?? '') === (v === 'NO' ? 'N' : v === 'SI' ? 'S' : v === 'N/A' ? 'A' : '?')
            const motivo = motivoDeColumna(columna)
            return motivo ? norm(e.motivos[motivo] ?? '') === v : false
          }
        }
      }
      const filaUnoCumple = criterios.every(([columna, valor]) => {
        const v = typeof valor === 'string' ? norm(valor) : valor
        return columna in filaUno && filaUno[columna as keyof typeof filaUno] === v
      })
      const filtrar = (literal: boolean) => evals.filter((e) => criterios.every((cr) => cumple(e, cr, literal)))
      const calcular = (modo: 'portal' | 'captura' | 'fila1'): number | null => {
        const literal = modo !== 'portal'
        if (/\/\(COUNTIFS/.test(f)) {
          const colRubro = criterios.find(([cl]) => columnaRubro.has(cl))![0]
          const k = columnaRubro.get(colRubro)!
          const l = evals.filter((e) => criterios.filter(([cl]) => !columnaRubro.has(cl)).every((cr) => cumple(e, cr, literal)))
          const no = l.filter((e) => e.respuestas[k] === 'N').length
          const si = l.filter((e) => e.respuestas[k] === 'S').length
          return si + no ? no / (si + no) : 0
        }
        if (funcion === 'conteo') {
          const total = filtrar(literal).length + (modo === 'fila1' && filaUnoCumple ? 1 : 0)
          const div = /\)\/([A-Z]+\d+)$/.exec(f)
          if (!div) return total
          const d = n(ref(div[1]))
          return d ? total / d : 0
        }
        return promedio(filtrar(literal).map((e) => e.puntaje))
      }
      const vacio = funcion === 'conteo' ? 0 : null
      const excel = n(c.v) ?? vacio
      const valor = (x: number | null) => x ?? vacio
      const portal = calcular('portal')
      const causa: Causa_ = igual(excel, valor(portal))
        ? 'coincide'
        : igual(excel, valor(calcular('captura')))
          ? 'captura'
          : igual(excel, valor(calcular('fila1')))
            ? 'fila1'
            : 'portal'
      resultados.push({ hoja: `${canal} · ${nombreHoja}`, celda: dir, formula: c.f, excel: c.v, portal, causa })
    }
  }
  return resultados
}

function resumenPorHoja(resultados: Resultado[]) {
  const porHoja = new Map<string, Record<Causa_ | 'total', number>>()
  for (const r of resultados) {
    const x = porHoja.get(r.hoja) ?? { total: 0, coincide: 0, ref: 0, captura: 0, fila1: 0, portal: 0 }
    x.total++
    x[r.causa]++
    porHoja.set(r.hoja, x)
  }
  return porHoja
}

describe.skipIf(!hayLibros)('hojas de reporte de las cédulas (Ejecutivos, Resultados, Tipo de llamada, Desempeño…)', () => {
  for (const canal of ['Inbound', 'Monitoreo'] as Canal[]) {
    it(`${canal}: toda celda coincide o la diferencia es un error conocido del Excel`, () => {
      const resultados = conciliarReportes(canal)
      const porHoja = resumenPorHoja(resultados)
      for (const [hoja, x] of porHoja)
        console.log(`${hoja.padEnd(46)} ${String(x.total).padStart(4)} celdas · coinciden ${x.coincide} · #REF! ${x.ref} · captura ${x.captura} · fila 1 ${x.fila1}`)
      const sinExplicar = resultados.filter((r) => r.causa === 'portal')
      expect(sinExplicar.map((r) => `${r.hoja} ${r.celda}: Excel ${JSON.stringify(r.excel)} · portal ${r.portal} · ${r.formula.slice(0, 120)}`)).toEqual([])
      expect(resultados.length).toBeGreaterThan(1500)
      expect(resultados.filter((r) => r.causa === 'coincide').length / resultados.length).toBeGreaterThan(0.95)
    })
  }

  it('las hojas de Desempeño Analista y Resultados Generales de Monitoreo coinciden al 100 %', () => {
    const porHoja = resumenPorHoja([...conciliarReportes('Inbound'), ...conciliarReportes('Monitoreo')])
    for (const hoja of ['Inbound · Desempeño Analista', 'Inbound · Ejecutivos', 'Monitoreo · Resultados Generales', 'Monitoreo · Desempeño Analista']) {
      const x = porHoja.get(hoja)!
      expect(x.coincide, hoja).toBe(x.total)
    }
  })
})

describe.skipIf(!hayLibros)('ponderaciones y rubros críticos de la hoja Evaluación', () => {
  it('Inbound: cada fila del formulario tiene el mismo peso y criticidad en las 7 cédulas', () => {
    const wb = leer('Inbound')
    const tl = wb.Sheets['Tipo de llamada']
    const ev = wb.Sheets['Evaluación']
    const v = (h: XLSX.WorkSheet, a: string) => h[a]?.v
    const tabla = new Map<string, { pesos: unknown[]; crit: unknown[] }>()
    const rango = XLSX.utils.decode_range(tl['!ref']!)
    for (let r = 2; r <= rango.e.r; r++) {
      const t = v(tl, `N${r + 1}`)
      if (t === undefined || tabla.has(String(t))) continue
      tabla.set(String(t), {
        pesos: [14, 15, 16, 17, 18, 19, 20].map((c) => v(tl, XLSX.utils.encode_cell({ r, c }))),
        crit: [23, 24, 25, 26, 27, 28, 29].map((c) => v(tl, XLSX.utils.encode_cell({ r, c }))),
      })
    }
    const columnas = [14, 15, 16, 17, 18, 19, 20].map((c) => String(v(tl, XLSX.utils.encode_cell({ r: 1, c }))))
    const diferencias: string[] = []
    let filas = 0
    for (let r = 12; r <= 45; r++) {
      const h = ev[`H${r}`] as Celda | undefined
      if (!h?.f) continue
      const m = /VLOOKUP\(([A-Z])\d+,'Tipo de llamada'!\$N:\$U/.exec(h.f)
      if (!m) continue
      filas++
      const fila = tabla.get(String(v(ev, `${m[1]}${r}`)))!
      const g = (ev[`G${r}`] as Celda | undefined)?.f ?? ''
      const porMotivo = !/W:\$AD/.test(g)
      const item = Object.values(db.catalogo.items).find((i) => i.canal === 'Inbound' && i.fila === r)!
      columnas.forEach((nombre, ci) => {
        const ced = db.catalogo.cedulas.find((c) => c.canal === 'Inbound' && (c.nombreExcel === nombre || c.alias.includes(nombre)))!
        const enPortal = ced.items.find((x) => x.key === item.key)
        const pesoExcel = typeof fila.pesos[ci] === 'number' ? fila.pesos[ci] : null
        if ((enPortal?.peso ?? null) !== pesoExcel) diferencias.push(`${ced.id} fila ${r}: peso Excel ${pesoExcel} · portal ${enPortal?.peso}`)
        if (enPortal && pesoExcel !== null) {
          const criticoExcel = porMotivo ? 'motivo' : fila.crit[ci] === 'Crítico' ? 'siempre' : 'no'
          if (enPortal.critico !== criticoExcel) diferencias.push(`${ced.id} fila ${r}: crítico Excel ${criticoExcel} · portal ${enPortal.critico}`)
        }
      })
    }
    expect(filas).toBeGreaterThan(25)
    expect(diferencias).toEqual([
      'inb-fraude fila 45: crítico Excel motivo · portal no',
      'inb-roext fila 45: crítico Excel motivo · portal no',
      'inb-aclaracion fila 45: crítico Excel motivo · portal no',
    ])
  })

  it('Monitoreo: pesos de No fraude / Fraude y filas críticas iguales al formulario', () => {
    const wb = leer('Monitoreo')
    const tl = wb.Sheets['Tipo de llamada']
    const ev = wb.Sheets['Evaluación']
    const tabla = new Map<string, [unknown, unknown]>()
    for (let r = 3; r <= 30; r++) {
      const t = tl[`C${r}`]?.v
      if (t !== undefined && !tabla.has(String(t))) tabla.set(String(t), [tl[`D${r}`]?.v, tl[`E${r}`]?.v])
    }
    const diferencias: string[] = []
    for (let r = 12; r <= 38; r++) {
      const f = (ev[`F${r}`] as Celda | undefined)?.f
      if (!f) continue
      const m = /VLOOKUP\(([A-Z])(\d+),/.exec(f)!
      const pesos = tabla.get(String(ev[`${m[1]}${m[2]}`]?.v))!
      const item = Object.values(db.catalogo.items).find((i) => i.canal === 'Monitoreo' && i.fila === r)!
      const critico = /IF\(\$G\$\d+="No","Crítico"/.test(f)
      ;(['mon-nofraude', 'mon-fraude'] as const).forEach((id, ci) => {
        const enPortal = db.catalogo.cedulas.find((c) => c.id === id)!.items.find((x) => x.key === item.key)
        const pesoExcel = typeof pesos[ci] === 'number' ? pesos[ci] : null
        if ((enPortal?.peso ?? null) !== pesoExcel) diferencias.push(`${id} fila ${r}: peso Excel ${pesoExcel} · portal ${enPortal?.peso}`)
        if (enPortal && (enPortal.critico !== 'no') !== critico) diferencias.push(`${id} fila ${r}: crítico Excel ${critico} · portal ${enPortal.critico}`)
      })
    }
    expect(diferencias).toEqual([])
    expect(db.catalogo.cedulas.filter((c) => c.canal === 'Monitoreo').map((c) => c.total)).toEqual([98, 98])
  })
})

describe.skipIf(!hayLibros)('libro Modelo Reincidencias: valores guardados por Excel', () => {
  const hoja = (nombre: string) => leer('Modelo').Sheets[nombre]
  const v = (nombre: string, celda: string) => hoja(nombre)[celda]?.v
  const p = db.operacion.parametros
  const m = calcularCapacidad(p, db.operacionDef.tareas, {}, [])

  it('TIEMPOS TAREA: volumen, minutos, horas y % de la carga de las 26 tareas', () => {
    for (let r = 6; r <= 31; r++) {
      const id = String(v('TIEMPOS TAREA', `A${r}`))
      const t = m.tareas.find((x) => x.def.id === id)!
      expect(t, id).toBeDefined()
      expect(t.volumen, `${id} volumen`).toBeCloseTo(Number(v('TIEMPOS TAREA', `K${r}`)), 9)
      expect(t.minAplicado, `${id} minutos`).toBeCloseTo(Number(v('TIEMPOS TAREA', `J${r}`)), 9)
      expect(t.horas, `${id} horas`).toBeCloseTo(Number(v('TIEMPOS TAREA', `L${r}`)), 9)
      expect(t.pct, `${id} %`).toBeCloseTo(Number(v('TIEMPOS TAREA', `M${r}`)), 9)
    }
    expect(m.demanda).toBeCloseTo(Number(v('TIEMPOS TAREA', 'L32')), 9)
  })

  it('DIMENSIONAMIENTO y RESUMEN', () => {
    const d = (c: string) => Number(v('DIMENSIONAMIENTO', c))
    expect(m.demanda).toBeCloseTo(d('C7'), 9)
    expect(m.capacidadAnalista).toBeCloseTo(d('C8'), 9)
    expect(m.capacidadEquipo).toBeCloseTo(d('C9'), 9)
    expect(m.ocupacion).toBeCloseTo(d('C10'), 12)
    expect(m.diferencia).toBeCloseTo(d('C11'), 9)
    expect(m.demandaAnalista).toBeCloseTo(d('C12'), 9)
    expect(m.demandaDia).toBeCloseTo(d('C13'), 9)
    expect(m.horasLibres).toBeCloseTo(d('C14'), 9)
    expect(p.ocupObj).toBeCloseTo(d('C15'), 12)
    expect(m.estado).toBe(v('DIMENSIONAMIENTO', 'C16'))
    for (let r = 21; r <= 27; r++) {
      const cat = m.porCategoria.find((x) => x.categoria === v('DIMENSIONAMIENTO', `B${r}`))
      expect(cat?.horas ?? 0, String(v('DIMENSIONAMIENTO', `B${r}`))).toBeCloseTo(d(`C${r}`), 9)
    }
    expect([m.sla.promedio.casos, m.sla.pico.casos]).toEqual([d('C32'), d('D32')])
    expect(m.sla.promedio.horas).toBeCloseTo(d('C33'), 9)
    expect(m.sla.pico.horas).toBeCloseTo(d('D33'), 9)
    expect(m.sla.promedio.pctJornada).toBeCloseTo(d('C34'), 9)
    expect(m.sla.pico.pctJornada).toBeCloseTo(d('D34'), 9)
    expect([m.sla.promedio.analistas, m.sla.pico.analistas]).toEqual([d('C35'), d('D35')])
    const r = (c: string) => v('RESUMEN', c)
    expect(m.capacidadEquipo).toBeCloseTo(Number(r('C12')), 9)
    expect(m.demanda).toBeCloseTo(Number(r('C13')), 9)
    expect(m.ocupacion).toBeCloseTo(Number(r('C14')), 12)
    expect(m.demandaAnalista).toBeCloseTo(Number(r('C15')), 9)
    expect(m.estado).toBe(r('C16'))
    for (const fila of [20, 21, 22]) {
      expect(m.demandaAnalista).toBeCloseTo(Number(r(`C${fila}`)), 9)
      expect(m.capacidadAnalista).toBeCloseTo(Number(r(`D${fila}`)), 9)
      expect(m.demandaAnalista / m.capacidadAnalista).toBeCloseTo(Number(r(`E${fila}`)), 12)
      expect(m.estado).toBe(r(`F${fila}`))
    }
  })

  it('MUESTREO RIESGO y EQUIPO Y CAPACITACIÓN', () => {
    const mu = calcularMuestreo(p)
    const c = (x: string) => Number(v('MUESTREO RIESGO', x))
    mu.segmentos.forEach((s, i) => {
      const r = 7 + i
      expect(s.nombre).toBe(v('MUESTREO RIESGO', `B${r}`))
      if (s.pct !== null) expect(s.pct).toBeCloseTo(c(`D${r}`), 12)
      expect(s.agentes).toBe(c(`E${r}`))
      expect(s.frecuencia).toBe(c(`F${r}`))
      expect(s.semana).toBeCloseTo(c(`G${r}`), 9)
      expect(s.mes).toBeCloseTo(c(`H${r}`), 9)
    })
    expect(mu.totalAgentes).toBe(c('E11'))
    expect(mu.totalSemana).toBeCloseTo(c('G11'), 9)
    expect(mu.totalMes).toBeCloseTo(c('H11'), 9)
    expect(mu.diarias).toBeCloseTo(c('C14'), 9)
    expect(mu.meta).toBe(c('C15'))
    expect(mu.libres).toBeCloseTo(c('C16'), 9)
    expect(mu.cobertura).toBeCloseTo(c('C17'), 9)
    expect([mu.repartoMonitoreo, mu.repartoInbound]).toEqual([c('C18'), c('C19')])
    expect(String(v('MUESTREO RIESGO', 'B23'))).toContain(`menos de ${mu.minimoMes} auditorías`)
    const e = (x: string) => Number(v('EQUIPO Y CAPACITACIÓN', x))
    expect(repartoEquipo(p)).toEqual([
      { agentes: e('C8'), diarias: e('C9') },
      { agentes: e('D8'), diarias: e('D9') },
      { agentes: e('E8'), diarias: e('E9') },
    ])
  })

  it('KPIS CALIDAD: mismas metas, sentido y fórmula de cumplimiento/estado', () => {
    const defs = db.operacionDef.kpis
    expect(defs).toHaveLength(12)
    defs.forEach((def, i) => {
      const r = 6 + i
      expect(def.meta, def.id).toBeCloseTo(Number(v('KPIS CALIDAD', `D${r}`)), 12)
      expect(def.sentido, def.id).toBe(String(v('KPIS CALIDAD', `E${r}`)).toLowerCase())
      const real = v('KPIS CALIDAD', `H${r}`)
      if (typeof real === 'number') {
        expect(cumplimiento(def, real), def.id).toBeCloseTo(Number(v('KPIS CALIDAD', `I${r}`)), 12)
        expect(estadoKpi(cumplimiento(def, real)), def.id).toBe(v('KPIS CALIDAD', `J${r}`))
      }
    })
    const excelI = (h: number, d: number, mayor: boolean) => (mayor ? (d === 0 ? 1 : h / d) : h <= d ? 1 : h === 0 ? 1 : d === 0 ? 0 : d / h)
    const excelJ = (i: number) => (i >= 1 ? 'CUMPLE' : i >= 0.9 ? 'EN RIESGO' : 'NO CUMPLE')
    for (const def of defs)
      for (const h of [0, 0.5, 0.85, 0.9, 0.95, 1, 2, 3, 5, 7.5]) {
        expect(cumplimiento(def, h)).toBeCloseTo(excelI(h, def.meta, def.sentido === 'mayor'), 12)
        expect(estadoKpi(cumplimiento(def, h))).toBe(excelJ(excelI(h, def.meta, def.sentido === 'mayor')))
      }
  })

  it('PLAN ACCION IND: semáforo, nivel, acción y fecha compromiso de las filas capturadas', () => {
    const { meta, umbralRojo } = db.config
    const SEMAFORO = { verde: 'VERDE', amarillo: 'AMARILLO', rojo: 'ROJO' } as const
    for (const r of [6, 8]) {
      const c = (x: string) => v('PLAN ACCION IND', `${x}${r}`)
      const g = Number(c('G'))
      const critico = c('I') === 'Sí'
      const nivel = nivelDe(g, critico, Number(c('K')), c('J') as Causa, meta, umbralRojo)
      expect(SEMAFORO[semaforoDe(g, critico, db.config)!], `L${r}`).toBe(c('L'))
      expect(nivel, `M${r}`).toBe(c('M'))
      const ruta = db.modelo.ruta.find((x) => x.nivel === nivel)!
      if (r === 8) {
        expect(`${ruta.nombre}: ${ruta.accion}`).toBe(c('N'))
        const deteccion = (c('B') as Date).toISOString().slice(0, 10)
        expect(sumarDias(deteccion, ruta.plazo)).toBe((c('O') as Date).toISOString().slice(0, 10))
      }
    }
    for (let r = 13; r <= 17; r++) {
      const nivel = Number(v('MODELO REINCIDENCIA', `B${r}`))
      const ruta = db.modelo.ruta.find((x) => x.nivel === nivel)!
      expect(ruta.nombre).toBe(v('MODELO REINCIDENCIA', `C${r}`))
      expect(ruta.plazo).toBe(v('MODELO REINCIDENCIA', `F${r}`))
    }
  })

  it('ERRORES CRÍTICOS: rubros críticos y sus puntos por cédula iguales a las cédulas', () => {
    const NOMBRES: Record<string, string> = {
      'TH Confirma mov. (Rechazo / Originación)': 'inb-rechazo',
      'TH Confirma mov. (Bloqueos)': 'inb-bloqueos',
      Fraude: 'inb-fraude',
      ROEXT: 'inb-roext',
      'Aclaración simple': 'inb-aclaracion',
      'Aviso de viaje': 'inb-aviso',
      SAC: 'inb-sac',
      'Monitoreo - No fraude': 'mon-nofraude',
      'Monitoreo - Fraude': 'mon-fraude',
    }
    const totales: Record<string, [number, number]> = {}
    for (let r = 11; r <= 19; r++) {
      const id = NOMBRES[String(v('ERRORES CRÍTICOS', `C${r}`))]
      const ced = db.catalogo.cedulas.find((c) => c.id === id)!
      const criticos = ced.items.filter((i) => i.critico !== 'no')
      expect(criticos.length, `${id} ítems críticos`).toBe(v('ERRORES CRÍTICOS', `E${r}`))
      expect(criticos.reduce((s, i) => s + i.peso, 0), `${id} pts críticos`).toBe(v('ERRORES CRÍTICOS', `F${r}`))
      totales[id] = [Number(v('ERRORES CRÍTICOS', `G${r}`)), ced.total]
    }
    const distintos = Object.entries(totales).filter(([, [modelo, cedula]]) => modelo !== cedula)
    expect(Object.fromEntries(distintos)).toEqual({ 'inb-aviso': [121, 126], 'inb-sac': [122, 94] })
  })
})
