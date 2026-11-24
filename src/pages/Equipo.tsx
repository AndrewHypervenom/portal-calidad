import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Search, Users } from 'lucide-react'
import type { Agente, Canal } from '../lib/types'
import { useVista } from '../lib/vista'
import { abrirPanel, ir, setParams, useRuta } from '../lib/router'
import { porAgente, porAnalista, promedio, type EstadoAgente, type FilaAgente } from '../lib/analytics'
import { nivelVigente } from '../lib/plans'
import { cedulasDeCanal, etiquetaTipo, temasDeCanal } from '../lib/catalog'
import { semanaDelMes, ultimoDiaMes, diasHabiles, hoyIso } from '../lib/dates'
import { deltaPts, nombreCorto, normalizar, num, pctCorto } from '../lib/format'
import { exportarLibro } from '../lib/excel'
import { EncabezadoPagina } from '../components/Layout'
import { Sparkline, estiloCalor } from '../components/charts'
import { Avatar, Boton, Entrada, NivelBadge, Puntaje, SemaforoPill, Segmentado, Tarjeta, Vacio, colorPuntaje, cx } from '../components/ui'

type Vista = 'resumen' | 'errores' | 'cedulas'
type Orden = 'nombre' | 'n' | 'promedio' | 'criticos' | 'semaforo'
const ORDEN_SEM: Record<EstadoAgente, number> = { rojo: 0, amarillo: 1, verde: 2, 'sin-dato': 3 }

export function Equipo() {
  const ruta = useRuta()
  const sub = ruta.sub === 'analistas' ? 'analistas' : 'ejecutivos'
  return (
    <div>
      <EncabezadoPagina
        titulo="Equipo"
        subtitulo={sub === 'ejecutivos' ? 'Desempeño de cada ejecutivo en el periodo y su semáforo de las últimas 4 semanas' : 'Productividad y criterio de los analistas de calidad'}
        acciones={
          <Segmentado
            valor={sub}
            onChange={(v) => ir('equipo', { sub: v === 'analistas' ? 'analistas' : null })}
            opciones={[
              { valor: 'ejecutivos', etiqueta: 'Ejecutivos' },
              { valor: 'analistas', etiqueta: 'Analistas de calidad' },
            ]}
          />
        }
      />
      {sub === 'ejecutivos' ? <Ejecutivos /> : <Analistas />}
    </div>
  )
}

function Ejecutivos() {
  const { db, evals, rango, cfg, semaforos, derivados, agentesCanal, canal } = useVista()
  const ruta = useRuta()
  const sem = (ruta.params.get('sem') ?? 'todos') as EstadoAgente | 'todos'
  const q = ruta.params.get('q') ?? ''
  const vista = (ruta.params.get('vista') ?? 'resumen') as Vista
  const [orden, setOrden] = useState<{ campo: Orden; desc: boolean }>({ campo: 'semaforo', desc: false })
  const filasMap = useMemo(() => porAgente(evals, db.agentes, cfg), [evals, db.agentes, cfg])
  const semanas = rango.mes ? Array.from({ length: semanaDelMes(ultimoDiaMes(rango.mes)) }, (_, i) => i + 1) : []

  const lista = useMemo(() => {
    const n = normalizar(q)
    const ids = new Set([...agentesCanal.filter((a) => a.activo).map((a) => a.id), ...filasMap.keys()])
    let l = [...ids]
      .map((id) => ({ agente: agentesCanal.find((a) => a.id === id) ?? filasMap.get(id)?.agente, fila: filasMap.get(id), s: semaforos.get(id) }))
      .filter((x): x is { agente: Agente; fila: FilaAgente | undefined; s: ReturnType<typeof semaforos.get> } => !!x.agente && (canal === 'todos' || x.agente.canal === canal))
    if (sem !== 'todos') l = l.filter((x) => (x.s?.estado ?? 'sin-dato') === sem)
    if (n) l = l.filter((x) => normalizar(`${x.agente.nombre} ${x.agente.id} ${x.agente.proceso}`).includes(n))
    const dir = orden.desc ? -1 : 1
    l.sort((a, b) => {
      switch (orden.campo) {
        case 'nombre':
          return a.agente.nombre.localeCompare(b.agente.nombre, 'es') * dir
        case 'n':
          return ((a.fila?.n ?? 0) - (b.fila?.n ?? 0)) * dir
        case 'promedio':
          return ((a.fila?.promedio ?? -1) - (b.fila?.promedio ?? -1)) * dir
        case 'criticos':
          return ((a.fila?.criticos ?? 0) - (b.fila?.criticos ?? 0)) * dir
        default:
          return (ORDEN_SEM[a.s?.estado ?? 'sin-dato'] - ORDEN_SEM[b.s?.estado ?? 'sin-dato']) * dir || (a.s?.promedio ?? 2) - (b.s?.promedio ?? 2)
      }
    })
    return l
  }, [agentesCanal, filasMap, semaforos, sem, q, orden, canal])

  const exportar = () => {
    const filas = lista.map(({ agente, fila, s }) => {
      const r: Record<string, unknown> = {
        ID: agente.id,
        Ejecutivo: agente.nombre,
        Canal: agente.canal,
        Proceso: agente.proceso,
        Monitoreos: fila?.n ?? 0,
        'Promedio general': fila?.promedio ?? '',
      }
      for (const s2 of semanas) r[`Semana ${s2}`] = fila?.porSemana.get(s2) ?? ''
      for (const cd of cedulasDeCanal(db.catalogo, agente.canal)) r[`Prom. ${cd.nombre}`] = fila?.porCedula.get(cd.id)?.promedio ?? ''
      if (agente.canal === 'Monitoreo') {
        for (const t of cedulasDeCanal(db.catalogo, 'Monitoreo').flatMap((cd) => cd.tiposLlamada ?? []).filter((x) => x.toUpperCase().startsWith('FRAUDE')))
          r[`Prom. ${etiquetaTipo(t)}`] = fila?.porTipo.get(t)?.promedio ?? ''
        for (const p of db.config.procesosMonitoreo) r[`Prom. proceso ${p}`] = fila?.porProceso.get(p)?.promedio ?? ''
      }
      r['Errores críticos'] = fila?.criticos ?? 0
      r['Semáforo (4 semanas)'] = s?.estado ?? 'sin-dato'
      for (const [k, n2] of fila?.fallasPorTema ?? []) r[`No: ${db.catalogo.items[k]?.topico ?? k}`] = n2
      return r
    })
    void exportarLibro(`ejecutivos-${rango.etiqueta.toLowerCase().replace(/\s+/g, '-')}`, [{ nombre: 'Ejecutivos', filas }])
  }

  const th = (campo: Orden, texto: string, clase = '') => (
    <th className={cx('px-3 pb-2 font-medium', clase)}>
      <button onClick={() => setOrden((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo !== 'nombre' && campo !== 'semaforo' }))} className="inline-flex items-center gap-1 hover:text-ink">
        {texto}
        {orden.campo === campo && (orden.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )

  return (
    <>
      <Tarjeta className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar ejecutivo o ID…" value={q} onChange={(e) => setParams({ q: e.target.value })} className="min-w-[200px] flex-1" />
          <Segmentado<EstadoAgente | 'todos'>
            tam="sm"
            valor={sem}
            onChange={(v) => setParams({ sem: v === 'todos' ? null : v })}
            opciones={[
              { valor: 'todos', etiqueta: 'Todos' },
              { valor: 'rojo', etiqueta: 'Bajo' },
              { valor: 'amarillo', etiqueta: 'En riesgo' },
              { valor: 'verde', etiqueta: 'En meta' },
              { valor: 'sin-dato', etiqueta: 'Sin evaluar' },
            ]}
          />
          <Segmentado<Vista>
            tam="sm"
            valor={vista}
            onChange={(v) => setParams({ vista: v === 'resumen' ? null : v })}
            opciones={[
              { valor: 'resumen', etiqueta: 'Resumen' },
              { valor: 'errores', etiqueta: 'Errores por rubro' },
              { valor: 'cedulas', etiqueta: 'Por cédula' },
            ]}
          />
          <Boton tam="sm" icono={<Download className="size-4" />} onClick={exportar}>
            Excel
          </Boton>
        </div>
      </Tarjeta>

      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<Users />} titulo="Sin ejecutivos para estos filtros" />
        </Tarjeta>
      ) : vista === 'resumen' ? (
        <Tarjeta className="overflow-hidden">
          <div className="desplazable overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  {th('nombre', 'Ejecutivo', 'pl-5')}
                  {th('n', 'Eval.', 'text-right')}
                  {th('promedio', 'Promedio')}
                  <th className="px-3 pb-2 font-medium">Tendencia</th>
                  {semanas.map((s) => (
                    <th key={s} className="px-2 pb-2 text-center font-medium">
                      Sem {s}
                    </th>
                  ))}
                  {th('criticos', 'Críticos', 'text-right')}
                  {th('semaforo', 'Semáforo 4 sem.')}
                  <th className="px-3 pr-5 pb-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ agente, fila, s }) => {
                  const plan = nivelVigente(derivados.planes, agente.id)
                  return (
                    <tr key={agente.id} onClick={() => abrirPanel('ag', agente.id)} className="cursor-pointer border-t border-line transition-colors hover:bg-hover">
                      <td className="py-2 pr-3 pl-5">
                        <div className="flex items-center gap-2.5">
                          <Avatar nombre={agente.nombre} tam={30} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{agente.nombre}</p>
                            <p className="truncate text-[11.5px] text-ink-3">
                              {agente.id} · {agente.canal === 'Inbound' ? 'Inbound' : agente.proceso}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{fila?.n ?? 0}</td>
                      <td className="px-3 py-2">{fila ? <Puntaje valor={fila.promedio} meta={cfg.meta} umbral={cfg.umbralRojo} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="w-[110px] px-3 py-2">{fila && fila.n > 1 ? <Sparkline valores={fila.evals.map((e) => e.puntaje)} color={colorPuntaje(fila.promedio, false, cfg.meta, cfg.umbralRojo)} alto={24} /> : null}</td>
                      {semanas.map((sm) => {
                        const v = fila?.porSemana.get(sm)
                        return (
                          <td key={sm} className="px-1 py-2 text-center">
                            {v === undefined ? (
                              <span className="text-ink-3">·</span>
                            ) : (
                              <span className="inline-block min-w-[46px] rounded-[7px] px-1.5 py-0.5 text-[12px] font-semibold tabular" style={{ background: `color-mix(in srgb, ${colorPuntaje(v, false, cfg.meta, cfg.umbralRojo)} 16%, transparent)` }}>
                                {pctCorto(v)}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right tabular">{fila?.criticos ? <span className="font-semibold text-bad-ink">{fila.criticos}</span> : <span className="text-ink-3">0</span>}</td>
                      <td className="px-3 py-2">
                        <SemaforoPill estado={s?.estado ?? 'sin-dato'} critico={!!s?.criticosMes} compacto />
                      </td>
                      <td className="px-3 py-2 pr-5">{plan ? <NivelBadge nivel={plan.nivel} corto /> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
            {num(lista.length)} ejecutivos · celdas de semana = promedio de esa semana · semáforo: últimas 4 semanas y críticos del mes.
          </p>
        </Tarjeta>
      ) : vista === 'errores' ? (
        <div className="flex flex-col gap-4">
          {(['Inbound', 'Monitoreo'] as Canal[])
            .filter((c) => canal === 'todos' || canal === c)
            .map((c) => (
              <MapaErrores key={c} canal={c} lista={lista.filter((x) => x.agente.canal === c && x.fila)} />
            ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(['Inbound', 'Monitoreo'] as Canal[])
            .filter((c) => canal === 'todos' || canal === c)
            .map((c) => {
              const ceds = cedulasDeCanal(db.catalogo, c)
              const tiposFraude = c === 'Monitoreo' ? ceds.flatMap((cd) => cd.tiposLlamada ?? []).filter((t) => t.toUpperCase().startsWith('FRAUDE')) : []
              const filas = lista.filter((x) => x.agente.canal === c && x.fila)
              if (!filas.length) return null
              return (
                <Tarjeta key={c} className="overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <h3 className="text-[15px] font-semibold">{c}: promedio por cédula</h3>
                    <p className="text-[12.5px] text-ink-2">Antes: hoja “{c === 'Inbound' ? 'Ejecutivos por tipo de cédula' : 'Tipo Llamada y Agente'}”. Entre paréntesis, número de evaluaciones.</p>
                  </div>
                  <div className="desplazable overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-[12px] text-ink-2">
                          <th className="px-5 pb-2 font-medium">Ejecutivo</th>
                          <th className="px-2 pb-2 text-center font-medium">General</th>
                          {ceds.map((cd) => (
                            <th key={cd.id} className="px-2 pb-2 text-center font-medium">
                              {cd.nombre.replace('Monitoreo · ', '')}
                            </th>
                          ))}
                          {tiposFraude.map((t) => (
                            <th key={t} className="px-2 pb-2 text-center font-medium">
                              {etiquetaTipo(t)}
                            </th>
                          ))}
                          {c === 'Monitoreo' &&
                            db.config.procesosMonitoreo.map((p) => (
                              <th key={p} className="px-2 pb-2 text-center font-medium">
                                {p}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map(({ agente, fila }) => (
                          <tr key={agente.id} onClick={() => abrirPanel('ag', agente.id)} className="cursor-pointer border-t border-line hover:bg-hover">
                            <td className="px-5 py-2 font-medium whitespace-nowrap">{nombreCorto(agente.nombre)}</td>
                            <CeldaProm v={fila!.promedio} n={fila!.n} />
                            {ceds.map((cd) => {
                              const x = fila!.porCedula.get(cd.id)
                              return <CeldaProm key={cd.id} v={x?.promedio ?? null} n={x?.n ?? 0} />
                            })}
                            {tiposFraude.map((t) => {
                              const x = fila!.porTipo.get(t)
                              return <CeldaProm key={t} v={x?.promedio ?? null} n={x?.n ?? 0} />
                            })}
                            {c === 'Monitoreo' &&
                              db.config.procesosMonitoreo.map((p) => {
                                const x = fila!.porProceso.get(p)
                                return <CeldaProm key={p} v={x?.promedio ?? null} n={x?.n ?? 0} />
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              )
            })}
        </div>
      )}
    </>
  )
}

function CeldaProm({ v, n }: { v: number | null; n: number }) {
  const { cfg } = useVista()
  if (!n) return <td className="px-2 py-2 text-center text-ink-3">·</td>
  return (
    <td className="px-2 py-2 text-center">
      <span className="inline-block min-w-[58px] rounded-[7px] px-1.5 py-0.5 text-[12px] font-semibold whitespace-nowrap tabular" style={{ background: `color-mix(in srgb, ${colorPuntaje(v, false, cfg.meta, cfg.umbralRojo)} 16%, transparent)` }}>
        {pctCorto(v)} <span className="font-normal text-ink-2">({n})</span>
      </span>
    </td>
  )
}

function MapaErrores({ canal, lista }: { canal: Canal; lista: { agente: Agente; fila: FilaAgente | undefined }[] }) {
  const { db } = useVista()
  const temas = useMemo(() => {
    const totales = new Map<string, number>()
    for (const { fila } of lista) for (const [k, n] of fila?.fallasPorTema ?? []) totales.set(db.catalogo.items[k]?.tema ?? k, (totales.get(db.catalogo.items[k]?.tema ?? k) ?? 0) + n)
    return temasDeCanal(db.catalogo, canal)
      .filter((t) => totales.get(t.tema))
      .sort((a, b) => (totales.get(b.tema) ?? 0) - (totales.get(a.tema) ?? 0))
      .map((t) => ({ ...t, total: totales.get(t.tema) ?? 0 }))
  }, [lista, db.catalogo, canal])
  if (!lista.length) return null
  const max = Math.max(1, ...lista.flatMap(({ fila }) => [...(fila?.fallasPorTema.values() ?? [])]))
  const fallasTema = (fila: FilaAgente | undefined, tema: string) => {
    let n = 0
    for (const [k, c] of fila?.fallasPorTema ?? []) if ((db.catalogo.items[k]?.tema ?? k) === tema) n += c
    return n
  }
  return (
    <Tarjeta className="overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-[15px] font-semibold">{canal}: incumplimientos por rubro</h3>
        <p className="text-[12.5px] text-ink-2">Número de “No cumple” de cada ejecutivo en el periodo. Solo rubros con al menos un incumplimiento. Antes: columnas por rubro de la hoja “Ejecutivos”.</p>
      </div>
      {temas.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-ink-2">Sin incumplimientos en el periodo.</p>
      ) : (
        <div className="desplazable overflow-x-auto pb-2">
          <table className="text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-5 pb-2 text-left text-[12px] font-medium text-ink-2">Ejecutivo</th>
                {temas.map((t) => (
                  <th key={t.tema} className="h-[150px] w-11 px-0 pb-2 align-bottom font-medium text-ink-2">
                    <div className="mx-auto w-5 [writing-mode:vertical-rl] rotate-180 text-left text-[11.5px] leading-tight whitespace-nowrap" title={t.topico}>
                      {t.topico.length > 34 ? `${t.topico.slice(0, 33)}…` : t.topico}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(({ agente, fila }) => (
                <tr key={agente.id} className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-surface px-5 py-1.5 font-medium whitespace-nowrap">
                    <button onClick={() => abrirPanel('ag', agente.id)} className="hover:text-accent-ink">
                      {nombreCorto(agente.nombre)}
                    </button>
                  </td>
                  {temas.map((t) => {
                    const n = fallasTema(fila, t.tema)
                    return (
                      <td key={t.tema} className="p-0.5 text-center">
                        <button
                          onClick={() => ir('evaluaciones', { params: { rubro: t.tema, q: agente.id } })}
                          disabled={!n}
                          title={`${agente.nombre} · ${t.topico}: ${n}`}
                          className="flex h-8 w-10 items-center justify-center rounded-[6px] font-semibold tabular disabled:cursor-default"
                          style={n ? estiloCalor(n / max, 1) : { background: 'var(--fill-2)', color: 'var(--ink-3)' }}
                        >
                          {n || ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t border-line-strong">
                <td className="sticky left-0 z-10 bg-surface px-5 py-1.5 text-[12px] font-semibold text-ink-2">Total</td>
                {temas.map((t) => (
                  <td key={t.tema} className="py-1.5 text-center text-[12px] font-semibold tabular">
                    {t.total}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  )
}

function Analistas() {
  const { db, evals, rango, cfg } = useVista()
  const filas = useMemo(() => porAnalista(evals, db.analistas), [evals, db.analistas])
  const equipo = promedio(evals.map((e) => e.puntaje))
  const hoy = hoyIso()
  const habiles = rango.desde > '2000' ? diasHabiles(rango.desde, rango.hasta < hoy ? rango.hasta : hoy) : 0
  if (!filas.length)
    return (
      <Tarjeta>
        <Vacio icono={<Users />} titulo="Sin evaluaciones en el periodo" />
      </Tarjeta>
    )
  return (
    <Tarjeta className="overflow-hidden">
      <div className="desplazable overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Analista</th>
              <th className="px-3 pb-2 text-right font-medium">Evaluaciones</th>
              <th className="px-3 pb-2 text-right font-medium">Por día hábil</th>
              <th className="px-3 pb-2 text-right font-medium">Días activos</th>
              <th className="px-3 pb-2 font-medium">Promedio otorgado</th>
              <th className="px-3 pb-2 text-right font-medium">Vs. equipo</th>
              <th className="px-3 pb-2 text-right font-medium">Inbound</th>
              <th className="px-3 pb-2 text-right font-medium">Monitoreo</th>
              <th className="px-5 pb-2 text-right font-medium">Críticos detectados</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.analista.id} onClick={() => abrirPanel('an', a.analista.id)} className="cursor-pointer border-t border-line hover:bg-hover">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={a.analista.nombre} tam={30} />
                    <span className="font-medium">{a.analista.nombre}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular">{a.n}</td>
                <td className="px-3 py-2.5 text-right tabular">{habiles ? num(a.n / habiles, 1) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular">{a.diasActivos}</td>
                <td className="px-3 py-2.5">
                  <Puntaje valor={a.promedio} meta={cfg.meta} umbral={cfg.umbralRojo} />
                </td>
                <td className="px-3 py-2.5 text-right tabular text-ink-2">{a.promedio !== null && equipo !== null ? deltaPts(a.promedio - equipo) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular">{a.porCanal.Inbound}</td>
                <td className="px-3 py-2.5 text-right tabular">{a.porCanal.Monitoreo}</td>
                <td className="px-5 py-2.5 text-right tabular">{a.criticos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
        Una diferencia grande contra el promedio del equipo puede indicar criterios distintos: conviene calibrar. Toca un analista para ver su calendario de evaluaciones.
      </p>
    </Tarjeta>
  )
}
