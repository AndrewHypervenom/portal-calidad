import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Scale, UserPlus } from 'lucide-react'
import type { Agente, Calibracion, Canal, Dictamen } from '../lib/types'
import { useVista } from '../lib/vista'
import { store } from '../lib/store'
import { abrirPanel, ir } from '../lib/router'
import { desviacionCalibracion } from '../lib/kpis'
import { DIAS_CALIBRACION } from '../lib/alertas'
import { cedulasDeCanal, cedulaPorId } from '../lib/catalog'
import { promedio } from '../lib/analytics'
import { diasEntre, fechaConDia, fechaMedia, sumarDias } from '../lib/dates'
import { nombreCorto, num, pct, uid } from '../lib/format'
import { avisar, confirmar } from '../components/feedback'
import { AreaTexto, Boton, Campo, EncabezadoTarjeta, Entrada, Insignia, Puntaje, Segmentado, Selector, Tarjeta, Vacio, cx } from '../components/ui'

export function Calibraciones() {
  const { db, hoy } = useVista()
  const lista = useMemo(() => (db.operacion.calibraciones ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)), [db.operacion.calibraciones])
  const analistas = db.analistas.filter((a) => a.activo)
  const meta = db.operacionDef.kpis.find((k) => k.id === 'calibracion')?.meta ?? 5
  const [edicion, setEdicion] = useState<Calibracion | null>(null)
  const [textos, setTextos] = useState<Record<string, string>>({})
  const formulario = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (edicion) setTimeout(() => formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }, [edicion?.id])

  const ultima = lista[0]
  const dias = ultima ? diasEntre(ultima.fecha, hoy) : null
  const nueva = (): Calibracion => ({ id: uid(), fecha: hoy, referencia: '', canal: 'Inbound', cedulaId: '', puntajes: {}, notas: '' })
  const editar = (c: Calibracion) => {
    setEdicion({ ...c, puntajes: { ...c.puntajes } })
    setTextos(Object.fromEntries(Object.entries(c.puntajes).map(([k, v]) => [k, String(Math.round(v * 1000) / 10)])))
  }
  const puntajes = (): Record<string, number> => {
    const r: Record<string, number> = {}
    for (const [k, t] of Object.entries(textos)) {
      const n = Number(t.replace(',', '.'))
      if (t.trim() !== '' && !Number.isNaN(n) && n >= 0 && n <= 100) r[k] = n / 100
    }
    return r
  }
  const actual = edicion ? desviacionCalibracion({ ...edicion, puntajes: puntajes() }) : null

  const usarFolio = () => {
    if (!edicion) return
    const ev = db.evaluaciones.find((e) => e.folio.toUpperCase() === edicion.referencia.trim().toUpperCase())
    if (!ev) return
    setEdicion({ ...edicion, referencia: ev.folio, canal: ev.canal, cedulaId: ev.cedulaId })
    if (ev.analistaId && ev.puntaje !== null && !textos[ev.analistaId]) setTextos((t) => ({ ...t, [ev.analistaId]: String(Math.round((ev.puntaje ?? 0) * 1000) / 10) }))
  }

  const guardar = async () => {
    if (!edicion) return
    const p = puntajes()
    if (Object.keys(p).length < 2) {
      avisar({ tipo: 'error', titulo: 'Faltan calificaciones', texto: 'Captura la calificación de al menos dos analistas para medir la desviación.' })
      return
    }
    await store.op('calibracion.guardar', { ...edicion, referencia: edicion.referencia.trim(), notas: edicion.notas.trim(), puntajes: p })
    avisar({ tipo: 'exito', titulo: 'Calibración guardada', texto: `Desviación ${num(desviacionCalibracion({ ...edicion, puntajes: p }) ?? 0, 1)} pts` })
    setEdicion(null)
    setTextos({})
  }
  const eliminar = async (c: Calibracion) => {
    const ok = await confirmar({ titulo: '¿Eliminar esta calibración?', texto: 'Se recalcula el KPI de desviación del mes.', confirmar: 'Eliminar', peligro: true })
    if (!ok) return
    await store.op('calibracion.eliminar', { id: c.id })
    setEdicion(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Última calibración</p>
          <p className={cx('mt-1.5 text-[26px] leading-none font-bold tracking-[-0.02em]', dias !== null && dias > DIAS_CALIBRACION && 'text-bad-ink')}>{dias === null ? 'Nunca' : dias === 0 ? 'Hoy' : `Hace ${dias} días`}</p>
          <p className="mt-2 text-[12px] text-ink-2">{ultima ? `${fechaMedia(ultima.fecha)} · próxima antes del ${fechaMedia(sumarDias(ultima.fecha, DIAS_CALIBRACION))}` : 'Regla del modelo: calibración quincenal'}</p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Desviación de la última</p>
          <p className="mt-1.5 text-[26px] leading-none font-bold tracking-[-0.02em]">{ultima ? `${num(desviacionCalibracion(ultima) ?? 0, 1)} pts` : '—'}</p>
          <p className="mt-2 text-[12px] text-ink-2">Meta del KPI: ≤ {num(meta)} pts entre analistas en la misma llamada</p>
        </Tarjeta>
        <Tarjeta className="flex flex-col justify-between gap-3 p-5">
          <p className="text-[13px] text-ink-2">Cada analista califica la misma llamada con la cédula; aquí se registra lo que dio cada uno. El KPI del mes toma la mayor diferencia.</p>
          <Boton variante="primario" tam="sm" icono={<Plus className="size-4" />} className="self-start" onClick={() => (setEdicion(nueva()), setTextos({}))}>
            Registrar calibración
          </Boton>
        </Tarjeta>
      </div>

      {edicion && (
        <div ref={formulario}>
          <Tarjeta className="anim-aparecer p-5">
            <h3 className="mb-4 text-[15px] font-semibold">{lista.some((c) => c.id === edicion.id) ? 'Editar calibración' : 'Nueva calibración'}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Campo etiqueta="Fecha">
                <Entrada type="date" value={edicion.fecha} max={hoy} onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })} />
              </Campo>
              <Campo etiqueta="Llamada calibrada" ayuda="Folio del portal (INB-…, MON-…) o ID del caso">
                <Entrada value={edicion.referencia} onChange={(e) => setEdicion({ ...edicion, referencia: e.target.value })} onBlur={usarFolio} placeholder="INB-00057" />
              </Campo>
              <Campo etiqueta="Canal">
                <Segmentado<Canal>
                  completo
                  valor={edicion.canal}
                  onChange={(c) => setEdicion({ ...edicion, canal: c, cedulaId: '' })}
                  opciones={[
                    { valor: 'Inbound', etiqueta: 'Inbound' },
                    { valor: 'Monitoreo', etiqueta: 'Monitoreo' },
                  ]}
                />
              </Campo>
              <Campo etiqueta="Cédula">
                <Selector value={edicion.cedulaId ?? ''} onChange={(e) => setEdicion({ ...edicion, cedulaId: e.target.value })}>
                  <option value="">Elegir…</option>
                  {cedulasDeCanal(db.catalogo, edicion.canal).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>
            <p className="mt-5 mb-2 text-[12.5px] font-semibold text-ink-2">Calificación que dio cada analista (%)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {analistas.map((a) => (
                <Campo key={a.id} etiqueta={a.nombre}>
                  <div className="flex items-center gap-2">
                    <Entrada inputMode="decimal" value={textos[a.id] ?? ''} onChange={(e) => setTextos({ ...textos, [a.id]: e.target.value })} placeholder="Ej. 92.5" className="text-right tabular" aria-label={`Calificación de ${a.nombre}`} />
                    <span className="text-ink-2">%</span>
                  </div>
                </Campo>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] bg-surface-2 px-4 py-3 text-[13px]">
              <Scale className="size-4 text-ink-2" />
              <span>
                Desviación: <span className="font-semibold tabular">{actual === null ? '—' : `${num(actual, 1)} pts`}</span>
              </span>
              {actual !== null && <Insignia tono={actual <= meta ? 'verde' : 'rojo'}>{actual <= meta ? 'Dentro de la meta' : 'Recalibrar el criterio'}</Insignia>}
            </div>
            <Campo etiqueta="Acuerdos de la calibración" className="mt-4">
              <AreaTexto rows={2} value={edicion.notas} onChange={(e) => setEdicion({ ...edicion, notas: e.target.value })} placeholder="Ej. Se unifica el criterio de “Cierre correcto del caso” cuando el cliente no confirma el fraude." />
            </Campo>
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              {lista.some((c) => c.id === edicion.id) ? (
                <Boton variante="peligro" tam="sm" onClick={() => void eliminar(edicion)}>
                  Eliminar
                </Boton>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Boton onClick={() => setEdicion(null)}>Cancelar</Boton>
                <Boton variante="primario" onClick={() => void guardar()}>
                  Guardar calibración
                </Boton>
              </div>
            </div>
          </Tarjeta>
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo="Calibraciones registradas" subtitulo="Toca una para editarla" />
        {lista.length === 0 ? (
          <Vacio icono={<Scale />} titulo="Aún no hay calibraciones" texto="Registra la primera: elige una llamada, que cada analista la califique y anota lo que dio cada uno." className="py-8" />
        ) : (
          <div className="desplazable overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Fecha</th>
                  <th className="px-3 pb-2 font-medium">Llamada</th>
                  <th className="px-3 pb-2 font-medium">Calificaciones</th>
                  <th className="px-3 pb-2 text-right font-medium">Desviación</th>
                  <th className="px-5 pb-2 font-medium">Acuerdos</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const d = desviacionCalibracion(c)
                  return (
                    <tr key={c.id} onClick={() => editar(c)} className="cursor-pointer border-t border-line align-top transition-colors hover:bg-hover">
                      <td className="px-5 py-2.5 whitespace-nowrap">{fechaConDia(c.fecha)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{c.referencia || 'Sin referencia'}</p>
                        <p className="text-[11.5px] text-ink-3">{c.cedulaId ? cedulaPorId(db.catalogo, c.cedulaId)?.nombre : c.canal}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {Object.entries(c.puntajes).map(([k, v]) => (
                            <Insignia key={k}>
                              {nombreCorto(db.analistas.find((a) => a.id === k)?.nombre ?? k)} {pct(v)}
                            </Insignia>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{d === null ? '—' : <Insignia tono={d <= meta ? 'verde' : 'rojo'}>{`${num(d, 1)} pts`}</Insignia>}</td>
                      <td className="max-w-[320px] px-5 py-2.5 text-ink-2">{c.notas || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}

function inicioFase(dias: string): number {
  const m = /\d+/.exec(dias)
  return m ? Number(m[0]) : 1
}

export function NuevosIngresos() {
  const { db, hoy, cfg } = useVista()
  const fases = db.modelo.fasesIngreso
  const lista = useMemo(
    () =>
      db.agentes
        .filter((a) => a.activo && a.fechaIngreso && diasEntre(a.fechaIngreso, hoy) >= 0 && (diasEntre(a.fechaIngreso, hoy) <= 90 || !a.dictamen))
        .sort((a, b) => (b.fechaIngreso ?? '').localeCompare(a.fechaIngreso ?? '')),
    [db.agentes, hoy],
  )
  const dictaminar = async (a: Agente, d: Dictamen | '') => {
    const { dictamen: _d, fechaDictamen: _f, ...resto } = a
    void _d
    void _f
    await store.op('agente.guardar', d ? { ...resto, dictamen: d, fechaDictamen: hoy } : resto)
    if (d) avisar({ tipo: 'exito', titulo: `Dictamen registrado: ${d === 'acredita' ? 'acredita' : 'no acredita'}`, texto: `${a.nombre} · cuenta para el KPI de nuevos ingresos del mes` })
  }
  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoTarjeta
        titulo="Nuevos ingresos en seguimiento"
        subtitulo="Fase de la ruta de calidad según los días desde su ingreso; el dictamen del día 30 alimenta el KPI “Nuevos ingresos que acreditan”"
        accion={
          <Boton tam="sm" icono={<UserPlus className="size-4" />} onClick={() => ir('ajustes', { sub: 'ejecutivos' })}>
            Registrar ingreso
          </Boton>
        }
      />
      {lista.length === 0 ? (
        <Vacio icono={<UserPlus />} titulo="Sin nuevos ingresos en seguimiento" texto="Registra la fecha de ingreso del ejecutivo en Ajustes → Ejecutivos: entra solo al segmento de nuevo ingreso del muestreo y a este seguimiento." className="py-8" />
      ) : (
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Ejecutivo</th>
                <th className="px-3 pb-2 font-medium">Ingreso</th>
                <th className="px-3 pb-2 font-medium">Fase actual</th>
                <th className="px-3 pb-2 font-medium">Auditorías</th>
                <th className="px-5 pb-2 font-medium">Dictamen (día 30)</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const dia = diasEntre(a.fechaIngreso!, hoy) + 1
                const fase = [...fases].reverse().find((f) => inicioFase(f.dias) <= dia) ?? fases[0]
                const evs = db.evaluaciones.filter((e) => e.agenteId === a.id && e.fechaEvaluacion >= a.fechaIngreso!)
                return (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="px-5 py-2.5">
                      <button className="text-left hover:text-accent-ink" onClick={() => abrirPanel('ag', a.id)}>
                        <span className="block font-medium">{a.nombre}</span>
                        <span className="block text-[11.5px] text-ink-3">
                          {a.id} · {a.canal === 'Inbound' ? 'Inbound' : a.proceso}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block">{fechaMedia(a.fechaIngreso)}</span>
                      <span className="block text-[11.5px] text-ink-3">día {dia}</span>
                    </td>
                    <td className="max-w-[300px] px-3 py-2.5">
                      <span className="block font-medium">{fase?.fase}</span>
                      <span className="block text-[11.5px] text-ink-2">
                        {fase?.actividad} · criterio: {fase?.criterio}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block tabular">{evs.length}</span>
                      {evs.length > 0 && <Puntaje valor={promedio(evs.map((e) => e.puntaje))} meta={cfg.meta} umbral={cfg.umbralRojo} />}
                    </td>
                    <td className="px-5 py-2.5">
                      <Segmentado<Dictamen | ''>
                        tam="sm"
                        valor={a.dictamen ?? ''}
                        onChange={(v) => void dictaminar(a, v)}
                        opciones={[
                          { valor: '', etiqueta: 'Pendiente' },
                          { valor: 'acredita', etiqueta: 'Acredita' },
                          { valor: 'no-acredita', etiqueta: 'No acredita' },
                        ]}
                      />
                      {a.fechaDictamen && <p className="mt-1 text-[11.5px] text-ink-3">Registrado el {fechaMedia(a.fechaDictamen)}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  )
}

