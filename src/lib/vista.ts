import { useEffect, useMemo, useState } from 'react'
import type { DB } from './types'
import { useDb } from './store'
import { usePrefs } from './prefs'
import { hoyIso } from './dates'
import { deClaveTexto, filtrar, periodoInicial, resolverPeriodo, type Periodo } from './periodo'
import { derivarPlanes } from './plans'
import { semaforoAgentes } from './analytics'
import { calcularAlertas, resumenAlertas, type Alerta } from './alertas'

const memoAlertas = new WeakMap<DB, { clave: string; alertas: Alerta[] }>()

export function useAlertas() {
  const db = useDb()
  const hoy = hoyIso()
  const [minuto, setMinuto] = useState(() => Math.floor(Date.now() / 60000))
  useEffect(() => {
    const t = setInterval(() => setMinuto(Math.floor(Date.now() / 60000)), 30000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    const clave = `${hoy}|${minuto}`
    let hit = memoAlertas.get(db)
    if (!hit || hit.clave !== clave) {
      hit = { clave, alertas: calcularAlertas(db, derivarPlanes(db, hoy), hoy, new Date(minuto * 60000)) }
      memoAlertas.set(db, hit)
    }
    return { alertas: hit.alertas, ...resumenAlertas(hit.alertas) }
  }, [db, hoy, minuto])
}

export function useVista() {
  const db = useDb()
  const prefs = usePrefs()
  const hoy = hoyIso()
  const periodo: Periodo = deClaveTexto(prefs.periodo) ?? periodoInicial(db.evaluaciones, hoy)
  const rango = resolverPeriodo(periodo, hoy, db.evaluaciones.reduce((m, e) => (e.fechaEvaluacion < m ? e.fechaEvaluacion : m), '9999'))
  const canal = prefs.canal
  const evals = useMemo(() => filtrar(db.evaluaciones, rango.desde, rango.hasta, canal), [db.evaluaciones, rango.desde, rango.hasta, canal])
  const evalsAnt = useMemo(
    () => (rango.anterior ? filtrar(db.evaluaciones, rango.anterior.desde, rango.anterior.hasta, canal) : []),
    [db.evaluaciones, rango.anterior, canal],
  )
  const derivados = useMemo(() => derivarPlanes(db, hoy), [db, hoy])
  const referencia = rango.hasta < hoy ? rango.hasta : hoy
  const agentesCanal = useMemo(() => db.agentes.filter((a) => canal === 'todos' || a.canal === canal), [db.agentes, canal])
  const semaforos = useMemo(() => semaforoAgentes(db.evaluaciones, agentesCanal, referencia, db.config), [db.evaluaciones, agentesCanal, referencia, db.config])
  const planesPeriodo = useMemo(
    () => derivados.planes.filter((p) => p.ev.fechaEvaluacion >= rango.desde && p.ev.fechaEvaluacion <= rango.hasta && (canal === 'todos' || p.ev.canal === canal)),
    [derivados.planes, rango.desde, rango.hasta, canal],
  )
  return { db, hoy, periodo, rango, canal, evals, evalsAnt, derivados, referencia, agentesCanal, semaforos, planesPeriodo, cfg: db.config }
}

export type Vista = ReturnType<typeof useVista>
