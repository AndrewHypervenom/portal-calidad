process.env.TZ = 'America/Bogota'

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { leerAcumulado } from '../src/lib/excel'
import { crearDbDesdeSeed } from '../src/shared/reducer.js'
import type { DB } from '../src/lib/types'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const db: DB = crearDbDesdeSeed(seed, '2026-10-02T12:00:00.000Z')

const LIBROS = ['CEDULA INBOUND ADRIANA SEP.xlsm', 'Cedula Monitoreo Adriana SEP 1.xlsm']

describe('importar el Acumulado de los libros originales', () => {
  for (const nombre of LIBROS) {
    const ruta = new URL(`../../${nombre}`, import.meta.url)
    it.skipIf(!existsSync(ruta))(`${nombre}: todo “ya existe” y coincide con lo migrado`, async () => {
      const r = await leerAcumulado(new File([readFileSync(ruta)], nombre), db)
      const migradas = db.evaluaciones.filter((e) => e.origen?.archivo === nombre)
      const leidas = r.filas.filter((f) => f.ev)
      expect(leidas).toHaveLength(migradas.length)
      for (const { fila, ev, estado, coincide } of leidas) {
        const m = migradas.find((e) => e.origen?.fila === fila)!
        const donde = `${nombre} fila ${fila}`
        expect(m, donde).toBeDefined()
        expect(estado, donde).toBe('duplicada')
        expect(coincide, donde).not.toBe(false)
        expect(ev!.fechaEvaluacion, donde).toBe(m.fechaEvaluacion)
        expect(ev!.fechaLlamada, donde).toBe(m.fechaLlamada)
        expect(ev!.duracionSeg, donde).toBe(m.duracionSeg)
        expect(ev!.agenteId, donde).toBe(m.agenteId)
        expect(ev!.cedulaId, donde).toBe(m.cedulaId)
        expect(ev!.idCaso, donde).toBe(m.idCaso)
        expect(ev!.respuestas, donde).toEqual(m.respuestas)
        expect(ev!.areas, donde).toEqual(m.areas)
        expect(ev!.puntaje, donde).toBeCloseTo(m.puntaje ?? NaN, 12)
        expect(Object.values(ev!.areas).some((t) => /^\d+$/.test(t)), donde).toBe(false)
      }
    })
  }

  const monitoreo = new URL('../../Cedula Monitoreo Adriana SEP 1.xlsm', import.meta.url)
  it.skipIf(!existsSync(monitoreo))('Monitoreo: avisa de las fórmulas de área rotas en la fila 1 del Acumulado (AV y AW)', async () => {
    const r = await leerAcumulado(new File([readFileSync(monitoreo)], 'Cedula Monitoreo Adriana SEP 1.xlsm'), db)
    expect(r.avisos).toHaveLength(3)
    expect(r.avisos[0]).toContain('Columna AV')
    expect(r.avisos[0]).toContain('#REF!')
    expect(r.avisos[1]).toContain('Columna AW')
    expect(r.avisos[2]).toMatch(/^1 evaluación se guardó con esas fórmulas/)
  })

  it.skipIf(!existsSync(monitoreo))('Monitoreo: en una fila guardada con la fórmula rota, el área de la columna AW es la de “Front – datos”', async () => {
    const libro = XLSX.read(readFileSync(monitoreo), { cellFormula: true, cellDates: true, UTC: true })
    const hoja = libro.Sheets['Acumulado']
    expect(hoja.AV5?.t).toBe('e')
    hoja.AW5 = { t: 's', v: 'Revisar captura de datos en Front' }
    const archivo = new File([XLSX.write(libro, { type: 'array', bookType: 'xlsx' })], 'prueba.xlsx')
    const r = await leerAcumulado(archivo, db)
    const fila = r.filas.find((f) => f.fila === 5)!
    expect(fila.ev!.areas['mon.front-datos']).toBe('Revisar captura de datos en Front')
    expect(fila.ev!.areas['mon.front-capturas']).toBeUndefined()
    expect(fila.mensajes.join(' · ')).toContain('tomada de la columna AW')
    const otra = r.filas.find((f) => f.fila === 6)!
    expect(otra.mensajes.join(' · ')).not.toContain('fórmula rota')
  })

  const inbound = new URL('../../CEDULA INBOUND ADRIANA SEP.xlsm', import.meta.url)
  it.skipIf(!existsSync(inbound))('Inbound: sin fórmulas rotas en la fila 1', async () => {
    const r = await leerAcumulado(new File([readFileSync(inbound)], 'CEDULA INBOUND ADRIANA SEP.xlsm'), db)
    expect(r.avisos).toEqual([])
  })
})
