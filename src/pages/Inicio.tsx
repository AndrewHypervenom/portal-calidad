import { useMemo, type ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, ClipboardList, FileSignature, Gauge, Minus, ShieldAlert, Target, Users } from 'lucide-react'
import { useAlertas, useVista } from '../lib/vista'
import { abrirPanel, ir } from '../lib/router'
import { erroresPorTema, porAnalista, porCedula, promedio, resumen, seriePorSemana } from '../lib/analytics'
import { nivelVigente, planAbierto } from '../lib/plans'
import { calcularKpis, formatoKpi } from '../lib/kpis'
import { ICONO_ACTIVIDAD, categoriaActividad, destinoActividad } from '../lib/actividad'
import { claveMes, diasHabiles, haceCuanto, hoyIso, nombreMesCapital } from '../lib/dates'
import { deltaPts, nombreCorto, num, pct } from '../lib/format'
import { setPrefs } from '../lib/prefs'
import { EncabezadoPagina } from '../components/Layout'
import { BarraApilada, GraficaLineas, ListaBarras, Medidor, Sparkline } from '../components/charts'
import { Avatar, Boton, EncabezadoTarjeta, Insignia, NivelBadge, Puntaje, SemaforoPill, Tarjeta, Vacio, colorPuntaje, cx } from '../components/ui'
import { FilaAlerta } from '../panels/PanelAlertas'

function TarjetaPendientes({ className }: { className?: string }) {
  const { alertas, atender, alta } = useAlertas()
  const top = alertas.filter((a) => a.gravedad !== 'baja').slice(0, 4)
  const revisar = alertas.length - atender
  if (!atender)
    return (
      <Tarjeta className={cx('flex flex-col justify-center gap-2 p-5', className)}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-good-soft text-good-ink">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold">Todo al día</p>
            <p className="text-[12.5px] text-ink-2">Sin planes vencidos, feedback fuera de plazo, firmas pendientes ni auditorías atrasadas.</p>
          </div>
        </div>
        {revisar > 0 && (
          <button className="enlace self-start text-[12.5px] font-medium" onClick={() => abrirPanel('alertas', 'todas')}>
            {revisar} aviso{revisar === 1 ? '' : 's'} para revisar ›
          </button>
        )}
      </Tarjeta>
    )
  return (
    <Tarjeta className={cx('overflow-hidden', className)}>
      <EncabezadoTarjeta
        titulo={`Pendientes de hoy (${atender})`}
        subtitulo={alta ? `${alta} urgente${alta === 1 ? '' : 's'} · lo más antiguo primero` : 'Lo más antiguo primero'}
        accion={
          <Boton variante="fantasma" tam="sm" onClick={() => abrirPanel('alertas', 'todas')}>
            Ver todas <ChevronRight className="size-4" />
          </Boton>
        }
      />
      <div className="px-2 pb-2">
        {top.map((a) => (
          <FilaAlerta key={a.id} a={a} />
        ))}
      </div>
    </Tarjeta>
  )
}

function TarjetaKpis() {
  const { db, derivados, hoy, rango } = useVista()
  const mes = rango.mes ?? claveMes(hoy)
  const kpis = useMemo(() => calcularKpis(db, mes, derivados, hoy), [db, mes, derivados, hoy])
  const conDato = kpis.filter((k) => k.estado)
  const cumplen = conDato.filter((k) => k.estado === 'CUMPLE').length
  const orden = { 'NO CUMPLE': 0, 'EN RIESGO': 1, CUMPLE: 2 } as const
  const lista = [...conDato].sort((a, b) => orden[a.estado!] - orden[b.estado!]).slice(0, 6)
  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoTarjeta
        titulo="KPIs del área"
        subtitulo={`${nombreMesCapital(mes)} · ${cumplen} de ${conDato.length} con dato cumplen`}
        accion={
          <Boton variante="fantasma" tam="sm" onClick={() => ir('operacion', { sub: 'kpis' })}>
            Todos <ChevronRight className="size-4" />
          </Boton>
        }
      />
      {lista.length === 0 ? (
        <Vacio icono={<Gauge />} titulo="Sin datos del mes" texto="Los KPIs se calculan solos con las evaluaciones, planes, bases y tiempos." className="py-6" />
      ) : (
        <ul className="px-2 pb-3">
          {lista.map((k) => (
            <li key={k.def.id}>
              <button onClick={() => ir('operacion', { sub: 'kpis' })} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" title={k.def.nombre}>{k.def.nombre}</span>
                  <span className="block text-[11.5px] text-ink-2">
                    Real {formatoKpi(k.def, k.valor)} · meta {k.def.sentido === 'mayor' ? '≥' : '≤'} {formatoKpi(k.def, k.def.meta)}
                  </span>
                </span>
                <Insignia tono={k.estado === 'CUMPLE' ? 'verde' : k.estado === 'EN RIESGO' ? 'ambar' : 'rojo'}>{k.estado === 'CUMPLE' ? 'Cumple' : k.estado === 'EN RIESGO' ? 'En riesgo' : 'No cumple'}</Insignia>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

function Tile({
  etiqueta,
  valor,
  pie,
  delta,
  icono,
  onClick,
  extra,
  tono,
}: {
  etiqueta: string
  valor: ReactNode
  pie?: ReactNode
  delta?: { valor: number | null; texto: string; bueno: 'arriba' | 'abajo' } | null
  icono: ReactNode
  onClick?: () => void
  extra?: ReactNode
  tono?: string
}) {
  let deltaUI: ReactNode = null
  if (delta && delta.valor !== null) {
    const sube = delta.valor > 0.0005
    const baja = delta.valor < -0.0005
    const bueno = (sube && delta.bueno === 'arriba') || (baja && delta.bueno === 'abajo')
    const malo = (sube && delta.bueno === 'abajo') || (baja && delta.bueno === 'arriba')
    deltaUI = (
      <span className={cx('inline-flex items-center gap-0.5 text-[12px] font-semibold', bueno ? 'text-good-ink' : malo ? 'text-bad-ink' : 'text-ink-2')}>
        {sube ? <ArrowUpRight className="size-3.5" /> : baja ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
        {delta.texto}
      </span>
    )
  }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cx('card flex min-w-0 flex-col p-4 text-left md:p-5', onClick && 'transition-transform duration-200 ease-apple hover:-translate-y-0.5 hover:shadow-raised active:translate-y-0')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-2">{etiqueta}</span>
        <span className={cx('flex size-7 items-center justify-center rounded-full', tono ?? 'bg-fill-2 text-ink-2')}>{icono}</span>
      </div>
      <div className="mt-2 text-[30px] leading-none font-bold tracking-[-0.03em]">{valor}</div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-2">
        {deltaUI}
        {pie}
      </div>
      {extra && <div className="mt-3">{extra}</div>}
    </Comp>
  )
}

export function Inicio() {
  const v = useVista()
  const { db, evals, evalsAnt, rango, cfg, canal, derivados, semaforos } = v
  const r = useMemo(() => resumen(evals, cfg), [evals, cfg])
  const rAnt = useMemo(() => resumen(evalsAnt, cfg), [evalsAnt, cfg])
  const serie = useMemo(() => seriePorSemana(evals, rango), [evals, rango])
  const errores = useMemo(() => erroresPorTema(evals, db.catalogo).slice(0, 5), [evals, db.catalogo])
  const cedulas = useMemo(() => porCedula(evals, db.catalogo, cfg).filter((c) => c.n > 0 && (canal === 'todos' || c.canal === canal)), [evals, db.catalogo, cfg, canal])
  const analistas = useMemo(() => porAnalista(evals, db.analistas), [evals, db.analistas])
  const hoy = hoyIso()
  const corte = rango.hasta < hoy ? rango.hasta : hoy
  const habiles = rango.desde > '2000' ? diasHabiles(rango.desde, corte) : 0
  const par = db.operacion.parametros
  const totalAgentes = Math.max(1, (par.agInbound || 0) + (par.agMonitoreo || 0))
  const proporcion = canal === 'Inbound' ? (par.agInbound || 0) / totalAgentes : canal === 'Monitoreo' ? (par.agMonitoreo || 0) / totalAgentes : 1
  const esperadas = (par.metaAudDia || 0) * habiles * proporcion

  const conteoSem = useMemo(() => {
    const c = { verde: 0, amarillo: 0, rojo: 0, 'sin-dato': 0 }
    for (const a of v.agentesCanal) if (a.activo) c[semaforos.get(a.id)?.estado ?? 'sin-dato']++
    return c
  }, [semaforos, v.agentesCanal])
  const evaluados = conteoSem.verde + conteoSem.amarillo + conteoSem.rojo

  const planesCanal = derivados.planes.filter((p) => canal === 'todos' || p.ev.canal === canal)
  const abiertos = planesCanal.filter(planAbierto)
  const vencidos = abiertos.filter((p) => p.estado === 'vencido').length
  const historicos = planesCanal.filter((p) => p.estado === 'historico').length

  const atencion = useMemo(() => {
    const filas = v.agentesCanal
      .filter((a) => a.activo)
      .map((a) => {
        const s = semaforos.get(a.id)
        const plan = nivelVigente(planesCanal, a.id)
        const ultimas = evals.filter((e) => e.agenteId === a.id)
        const reinc = planesCanal.some((p) => p.ev.agenteId === a.id && planAbierto(p) && p.reincidencia > 0)
        return { a, s, plan, n: ultimas.length, reinc, prom: s?.promedio ?? promedio(ultimas.map((e) => e.puntaje)) }
      })
      .filter((x) => x.plan || x.s?.estado === 'rojo' || x.s?.estado === 'amarillo')
    const peso = (x: (typeof filas)[number]) => (x.plan?.nivel ?? 0) * 10 + (x.s?.estado === 'rojo' ? 5 : x.s?.estado === 'amarillo' ? 2 : 0) + (x.reinc ? 3 : 0)
    return filas.sort((x, y) => peso(y) - peso(x) || (x.prom ?? 1) - (y.prom ?? 1)).slice(0, 7)
  }, [v.agentesCanal, semaforos, planesCanal, evals])

  const deltaProm = r.promedio !== null && rAnt.promedio !== null ? r.promedio - rAnt.promedio : null
  const pctMeta = r.n ? r.enMeta / r.n : null
  const pctMetaAnt = rAnt.n ? rAnt.enMeta / rAnt.n : null
  const etqCanal = canal === 'todos' ? 'Inbound y Monitoreo' : canal
  const actividad = db.actividad.slice(0, 7)

  return (
    <div>
      <EncabezadoPagina
        titulo="Resumen"
        subtitulo={
          <>
            {rango.etiqueta} · {etqCanal} · {num(r.n)} evaluaciones de {num(r.agentes)} ejecutivos
          </>
        }
      />

      <div className="anim-aparecer mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <TarjetaPendientes className="lg:col-span-2" />
        <TarjetaKpis />
      </div>

      {r.n === 0 ? (
        <Tarjeta>
          <Vacio
            icono={<ClipboardList />}
            titulo="Sin evaluaciones en este periodo"
            texto="Cambia el periodo en la barra superior o registra la primera evaluación."
            accion={
              <div className="flex gap-2">
                <Boton variante="primario" onClick={() => ir('evaluar')}>
                  Nueva evaluación
                </Boton>
                <Boton onClick={() => setPrefs({ periodo: 'todo' })}>Ver todo el historial</Boton>
              </div>
            }
          />
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="anim-aparecer grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 min-[1660px]:grid-cols-6">
            <Tile
              etiqueta="Calidad promedio"
              valor={<span className={cx(r.promedio !== null && r.promedio < cfg.meta ? 'text-ink' : '')}>{pct(r.promedio)}</span>}
              icono={<Target className="size-4" />}
              tono={r.promedio !== null && r.promedio >= cfg.meta ? 'bg-good-soft text-good-ink' : 'bg-warn-soft text-warn-ink'}
              delta={rango.anterior && rAnt.n ? { valor: deltaProm, texto: `${deltaPts(deltaProm)} vs ${rango.anterior.etiqueta.toLowerCase()}`, bueno: 'arriba' } : null}
              pie={!rAnt.n || !rango.anterior ? <span>Meta {pct(cfg.meta, 0)}</span> : null}
              extra={<Sparkline valores={serie.map((s) => s.promedio)} color={colorPuntaje(r.promedio, false, cfg.meta, cfg.umbralRojo)} />}
              onClick={() => ir('analisis')}
            />
            <Tile
              etiqueta="Evaluaciones"
              valor={num(r.n)}
              icono={<ClipboardList className="size-4" />}
              pie={esperadas ? <span>de {num(Math.round(esperadas))} esperadas ({pct(r.n / esperadas, 0)})</span> : null}
              extra={esperadas ? <Medidor valor={r.n / esperadas} color={r.n >= esperadas ? 'var(--good)' : 'var(--accent)'} /> : undefined}
              onClick={() => ir('evaluaciones')}
            />
            <Tile
              etiqueta="En meta (≥ 90%)"
              valor={pct(pctMeta, 0)}
              icono={<Activity className="size-4" />}
              delta={pctMetaAnt !== null && pctMeta !== null && rango.anterior ? { valor: pctMeta - pctMetaAnt, texto: `${deltaPts(pctMeta - pctMetaAnt)}`, bueno: 'arriba' } : null}
              pie={<span>{num(r.enMeta)} de {num(r.n)}</span>}
              onClick={() => ir('evaluaciones')}
            />
            <Tile
              etiqueta="Errores críticos"
              valor={num(r.criticos)}
              icono={<ShieldAlert className="size-4" />}
              tono={r.criticos ? 'bg-bad-soft text-bad-ink' : 'bg-good-soft text-good-ink'}
              delta={rango.anterior && rAnt.n ? { valor: r.criticos - rAnt.criticos, texto: `${r.criticos - rAnt.criticos >= 0 ? '+' : '−'}${Math.abs(r.criticos - rAnt.criticos)} vs anterior`, bueno: 'abajo' } : null}
              pie={<span>{pct(r.n ? r.criticos / r.n : 0)} de las evaluaciones</span>}
              onClick={() => ir('evaluaciones', { params: { critico: '1' } })}
            />
            <Tile
              etiqueta="Ejecutivos en rojo"
              valor={num(conteoSem.rojo)}
              icono={<Users className="size-4" />}
              tono={conteoSem.rojo ? 'bg-bad-soft text-bad-ink' : 'bg-fill-2 text-ink-2'}
              pie={<span>de {num(evaluados)} evaluados en 4 semanas</span>}
              onClick={() => ir('equipo', { params: { sem: 'rojo' } })}
            />
            <Tile
              etiqueta="Planes abiertos"
              valor={num(abiertos.length)}
              icono={<FileSignature className="size-4" />}
              tono={vencidos ? 'bg-bad-soft text-bad-ink' : 'bg-fill-2 text-ink-2'}
              pie={vencidos ? <span className="font-semibold text-bad-ink">{vencidos} vencidos</span> : historicos ? <span>{historicos} del Excel sin seguimiento</span> : <span>Ninguno vencido</span>}
              onClick={() => ir('seguimiento')}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Tarjeta className="lg:col-span-2">
              <EncabezadoTarjeta
                titulo="Calidad por semana"
                subtitulo={rango.mes ? 'Promedio de las evaluaciones de cada semana del mes' : 'Promedio semanal (semanas que inician en lunes)'}
                accion={
                  <Boton variante="fantasma" tam="sm" onClick={() => ir('analisis')}>
                    Detalle <ChevronRight className="size-4" />
                  </Boton>
                }
              />
              <div className="px-4 pb-4">
                <GraficaLineas
                  categorias={serie.map((s) => ({ etiqueta: s.etiqueta, detalle: `${s.detalle} · ${s.n} evaluaciones` }))}
                  series={
                    canal === 'todos'
                      ? [
                          { id: 'inb', nombre: 'Inbound', color: 'var(--series-1)', valores: serie.map((s) => s.porCanal.Inbound.promedio), extra: serie.map((s) => (s.porCanal.Inbound.n ? `${s.porCanal.Inbound.n} eval.` : null)) },
                          { id: 'mon', nombre: 'Monitoreo', color: 'var(--series-2)', valores: serie.map((s) => s.porCanal.Monitoreo.promedio), extra: serie.map((s) => (s.porCanal.Monitoreo.n ? `${s.porCanal.Monitoreo.n} eval.` : null)) },
                        ]
                      : [{ id: 'c', nombre: canal, color: canal === 'Inbound' ? 'var(--series-1)' : 'var(--series-2)', valores: serie.map((s) => s.promedio), extra: serie.map((s) => (s.n ? `${s.n} eval.` : null)) }]
                  }
                  meta={cfg.meta}
                  etiquetaMeta="Meta"
                />
              </div>
            </Tarjeta>
            <Tarjeta>
              <EncabezadoTarjeta titulo="Semáforo de ejecutivos" subtitulo="Promedio de las últimas 4 semanas y críticos del mes" />
              <div className="px-5 pb-5">
                <BarraApilada
                  segmentos={[
                    { id: 'verde', etiqueta: 'En meta', valor: conteoSem.verde, color: 'var(--good)' },
                    { id: 'amarillo', etiqueta: 'En riesgo', valor: conteoSem.amarillo, color: 'var(--warn)' },
                    { id: 'rojo', etiqueta: 'Bajo desempeño', valor: conteoSem.rojo, color: 'var(--bad)' },
                    { id: 'sin', etiqueta: 'Sin evaluar', valor: conteoSem['sin-dato'], color: 'var(--fill)' },
                  ]}
                />
                <ul className="mt-4 flex flex-col gap-1">
                  {(
                    [
                      ['verde', conteoSem.verde],
                      ['amarillo', conteoSem.amarillo],
                      ['rojo', conteoSem.rojo],
                      ['sin-dato', conteoSem['sin-dato']],
                    ] as const
                  ).map(([k, n]) => (
                    <li key={k}>
                      <button onClick={() => ir('equipo', { params: { sem: k } })} className="flex w-full items-center justify-between rounded-[10px] px-2 py-1.5 transition-colors hover:bg-hover">
                        <SemaforoPill estado={k} />
                        <span className="flex items-center gap-1 text-[14px] font-semibold tabular">
                          {n}
                          <ChevronRight className="size-4 text-ink-3" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 px-2 text-[12px] text-ink-2">
                  El muestreo sugerido audita más a quien está en rojo.{' '}
                  <button className="enlace font-medium" onClick={() => ir('operacion', { sub: 'muestreo' })}>
                    Ver plan de la semana
                  </button>
                </p>
              </div>
            </Tarjeta>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Tarjeta>
              <EncabezadoTarjeta
                titulo="Requieren atención"
                subtitulo="Planes abiertos, reincidencias y semáforo en rojo o amarillo"
                accion={
                  <Boton variante="fantasma" tam="sm" onClick={() => ir('seguimiento')}>
                    Planes <ChevronRight className="size-4" />
                  </Boton>
                }
              />
              {atencion.length === 0 ? (
                <Vacio titulo="Nadie requiere atención" texto="Todos los ejecutivos evaluados están en meta y sin planes abiertos." className="py-8" />
              ) : (
                <ul className="px-2 pb-3">
                  {atencion.map(({ a, s, plan, reinc }) => (
                    <li key={a.id}>
                      <button onClick={() => abrirPanel('ag', a.id)} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-hover">
                        <Avatar nombre={a.nombre} tam={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{nombreCorto(a.nombre)}</span>
                          <span className="block truncate text-[12px] text-ink-2">
                            {a.canal === 'Inbound' ? 'Inbound' : a.proceso} · {s?.n ?? 0} eval. en 4 sem.
                            {plan ? ` · ${plan.fallas[0]?.topico ?? ''}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Puntaje valor={s?.promedio ?? null} critico={false} meta={cfg.meta} umbral={cfg.umbralRojo} />
                          <span className="flex gap-1">
                            {reinc && <Insignia tono="violeta">Reincide</Insignia>}
                            {plan ? (
                              <NivelBadge nivel={plan.nivel} corto />
                            ) : s?.criticosMes ? (
                              <Insignia tono="rojo" icono={<ShieldAlert className="size-3" />} title="El semáforo queda en rojo con cualquier error crítico del mes">
                                {s.criticosMes} crítico{s.criticosMes === 1 ? '' : 's'} en el mes
                              </Insignia>
                            ) : (
                              <SemaforoPill estado={s?.estado ?? null} compacto />
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            <Tarjeta>
              <EncabezadoTarjeta
                titulo="Errores más frecuentes"
                subtitulo="Top 5 del periodo: tema del refuerzo grupal de la semana"
                accion={
                  <Boton variante="fantasma" tam="sm" onClick={() => ir('analisis', { sub: 'rubros' })}>
                    Todos <ChevronRight className="size-4" />
                  </Boton>
                }
              />
              {errores.length === 0 ? (
                <Vacio titulo="Sin incumplimientos" texto="No hay rubros con “No cumple” en el periodo." className="py-8" />
              ) : (
                <div className="px-3 pb-4">
                  <ListaBarras
                    filas={errores.map((e) => ({
                      id: e.tema,
                      etiqueta: e.topico,
                      sub: `${e.bloque} · ${e.canal} · ${e.agentes} ejecutivo${e.agentes === 1 ? '' : 's'}${e.criticos ? ` · ${e.criticos} crítico${e.criticos === 1 ? '' : 's'}` : ''}`,
                      valor: e.fallas,
                      texto: (
                        <span>
                          {e.fallas} <span className="font-normal text-ink-2">· {pct(e.tasa, 0)}</span>
                        </span>
                      ),
                      color: e.criticos ? 'var(--bad)' : 'var(--series-1)',
                      onClick: () => ir('evaluaciones', { params: { rubro: e.tema } }),
                      titulo: `${e.fallas} incumplimientos de ${e.evaluados} veces evaluado`,
                    }))}
                  />
                  <p className="mt-2 px-2 text-[11.5px] text-ink-3">Número de incumplimientos · tasa = “No” entre “Sí” + “No”. En rojo, rubros con errores críticos.</p>
                </div>
              )}
            </Tarjeta>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Tarjeta className="overflow-hidden lg:col-span-2">
              <EncabezadoTarjeta titulo="Resultados por cédula" subtitulo={`Promedio general ${pct(r.promedio)} · diferencia en puntos porcentuales`} />
              <div className="desplazable overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead>
                    <tr className="text-left text-[12px] text-ink-2">
                      <th className="px-5 pb-2 font-medium">Cédula</th>
                      <th className="px-3 pb-2 text-right font-medium">Evaluaciones</th>
                      <th className="px-3 pb-2 font-medium">Promedio</th>
                      <th className="px-3 pb-2 text-right font-medium">Diferencia</th>
                      <th className="px-5 pb-2 text-right font-medium">Críticos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cedulas.map((c) => (
                      <tr key={c.cedulaId} onClick={() => ir('evaluaciones', { params: { cedula: c.cedulaId } })} className="cursor-pointer border-t border-line transition-colors hover:bg-hover">
                        <td className="px-5 py-2.5">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="ml-1.5 text-[11.5px] text-ink-3">{c.canal}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{c.n}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Puntaje valor={c.promedio} meta={cfg.meta} umbral={cfg.umbralRojo} />
                            <div className="w-[96px] shrink-0">
                              <Medidor valor={c.promedio ?? 0} color={colorPuntaje(c.promedio, false, cfg.meta, cfg.umbralRojo)} marca={cfg.meta} alto={5} />
                            </div>
                          </div>
                        </td>
                        <td className={cx('px-3 py-2.5 text-right font-medium tabular whitespace-nowrap', (c.delta ?? 0) >= 0 ? 'text-good-ink' : 'text-bad-ink')}>{deltaPts(c.delta)}</td>
                        <td className="px-5 py-2.5 text-right tabular">{c.criticos ? <span className="font-semibold text-bad-ink">{c.criticos}</span> : <span className="text-ink-3">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
            <Tarjeta>
              <EncabezadoTarjeta
                titulo="Analistas de calidad"
                subtitulo="Evaluaciones registradas en el periodo"
                accion={
                  <Boton variante="fantasma" tam="sm" onClick={() => ir('equipo', { sub: 'analistas' })}>
                    Detalle <ChevronRight className="size-4" />
                  </Boton>
                }
              />
              <ul className="px-2 pb-3">
                {analistas.map((a) => (
                  <li key={a.analista.id}>
                    <button onClick={() => abrirPanel('an', a.analista.id)} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-hover">
                      <Avatar nombre={a.analista.nombre} tam={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{a.analista.corto}</span>
                        <span className="block text-[12px] text-ink-2">
                          {a.diasActivos} días · {num(a.n / Math.max(1, a.diasActivos), 1)} por día
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[15px] font-semibold tabular">{a.n}</span>
                        <span className="block text-[11.5px] text-ink-2">prom. {pct(a.promedio)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          </div>

          {actividad.length > 0 && (
            <Tarjeta>
              <EncabezadoTarjeta
                titulo="Actividad reciente"
                subtitulo="Lo último que registró el equipo (se actualiza en vivo)"
                accion={
                  <Boton variante="fantasma" tam="sm" onClick={() => ir('bitacora')}>
                    Bitácora <ChevronRight className="size-4" />
                  </Boton>
                }
              />
              <ul className="grid grid-cols-1 gap-x-6 px-5 pb-4 md:grid-cols-2">
                {actividad.map((x) => {
                  const Icono = ICONO_ACTIVIDAD[categoriaActividad(x)]
                  const abrir = destinoActividad(x, db)
                  return (
                    <li key={x.id} className="border-t border-line first:border-t-0 md:[&:nth-child(2)]:border-t-0">
                      <button disabled={!abrir} onClick={abrir ?? undefined} className="flex w-full items-center gap-3 rounded-[10px] py-2.5 text-left transition-colors enabled:hover:bg-hover disabled:cursor-default">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-2 text-ink-2">
                          <Icono className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{x.accion}</span>
                          <span className="block truncate text-[12px] text-ink-2">{x.detalle}</span>
                        </span>
                        <span className="shrink-0 text-right text-[11.5px] text-ink-3">
                          {haceCuanto(x.fecha)}
                          {x.por && <span className="block">{nombreCorto(x.por)}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}
    </div>
  )
}
