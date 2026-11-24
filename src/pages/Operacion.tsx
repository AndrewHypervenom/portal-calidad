import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ClipboardCheck, Plus, Printer, Sparkles, Trash2 } from 'lucide-react'
import type { RegistroBase, RegistroTiempo } from '../lib/types'
import { useVista } from '../lib/vista'
import { store } from '../lib/store'
import { abrirPanel, ir, useRuta } from '../lib/router'
import { agentesActivos, calcularCapacidad, calcularMuestreo, repartoEquipo, type EstadoEquipo } from '../lib/operacion'
import { planSemanal, EXTRA_POR_PLAN, SEMANAS_EXTRA } from '../lib/muestreo'
import { calcularKpis, formatoKpi } from '../lib/kpis'
import { claveMes, diaLocal, fechaConDia, fechaCorta, fechaHora, hoyIso, nombreMesCapital } from '../lib/dates'
import { nombreCorto, num, pct, uid } from '../lib/format'
import { mesesConDatos } from '../lib/periodo'
import { EncabezadoPagina } from '../components/Layout'
import { ListaBarras, Medidor } from '../components/charts'
import { avisar } from '../components/feedback'
import { AreaTexto, Boton, BotonIcono, Campo, EncabezadoTarjeta, Entrada, Insignia, SemaforoPill, Segmentado, Selector, Tarjeta, Vacio, cx } from '../components/ui'
import { Calibraciones, NuevosIngresos } from './OperacionExtra'

type Sub = 'capacidad' | 'muestreo' | 'kpis' | 'calibraciones' | 'tiempos' | 'bases' | 'parametros' | 'equipo'

export function Operacion() {
  const ruta = useRuta()
  const sub = (ruta.sub ?? 'capacidad') as Sub
  return (
    <div>
      <EncabezadoPagina titulo="Operación de calidad" subtitulo="Capacidad del equipo, a quién auditar, indicadores del área y tiempos reales. Todo se recalcula al cambiar los parámetros." />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmentado<Sub>
          valor={sub}
          onChange={(v) => ir('operacion', { sub: v === 'capacidad' ? null : v })}
          opciones={[
            { valor: 'capacidad', etiqueta: 'Capacidad' },
            { valor: 'muestreo', etiqueta: 'Muestreo y plan semanal' },
            { valor: 'kpis', etiqueta: 'KPIs del área' },
            { valor: 'calibraciones', etiqueta: 'Calibraciones' },
            { valor: 'tiempos', etiqueta: 'Tiempos por tarea' },
            { valor: 'bases', etiqueta: 'Bases y correos' },
            { valor: 'parametros', etiqueta: 'Parámetros' },
            { valor: 'equipo', etiqueta: 'Equipo y nuevos ingresos' },
          ]}
        />
      </div>
      {sub === 'muestreo' ? <Muestreo /> : sub === 'kpis' ? <Kpis /> : sub === 'calibraciones' ? <Calibraciones /> : sub === 'tiempos' ? <Tiempos /> : sub === 'bases' ? <Bases /> : sub === 'parametros' ? <Parametros /> : sub === 'equipo' ? <EquipoCalidad /> : <Capacidad />}
    </div>
  )
}

const TONO_ESTADO: Record<EstadoEquipo, 'verde' | 'ambar' | 'rojo'> = { SOSTENIBLE: 'verde', 'AL LÍMITE': 'ambar', SOBRECARGA: 'rojo' }

function useModelo() {
  const { db } = useVista()
  return useMemo(() => calcularCapacidad(db.operacion.parametros, db.operacionDef.tareas, db.operacion.tareasMin, db.operacion.tiempos), [db.operacion, db.operacionDef.tareas])
}

function Capacidad() {
  const { db } = useVista()
  const m = useModelo()
  const p = db.operacion.parametros
  const color = m.estado === 'SOSTENIBLE' ? 'var(--good)' : m.estado === 'AL LÍMITE' ? 'var(--warn)' : 'var(--bad)'
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Demanda del mes</p>
          <p className="mt-1.5 text-[30px] leading-none font-bold tracking-[-0.03em]">
            {num(m.demanda, 1)} <span className="text-[16px] font-semibold text-ink-2">h</span>
          </p>
          <p className="mt-2 text-[12px] text-ink-2">26 tareas del equipo</p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Capacidad productiva</p>
          <p className="mt-1.5 text-[30px] leading-none font-bold tracking-[-0.03em]">
            {num(m.capacidadEquipo, 1)} <span className="text-[16px] font-semibold text-ink-2">h</span>
          </p>
          <p className="mt-2 text-[12px] text-ink-2">
            {num(p.nAnalistas)} analistas × {num(m.capacidadAnalista, 1)} h
          </p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Ocupación del equipo</p>
          <p className="mt-1.5 text-[30px] leading-none font-bold tracking-[-0.03em]">{pct(m.ocupacion, 0)}</p>
          <div className="mt-3">
            <Medidor valor={m.ocupacion} color={color} marca={p.ocupObj} />
          </div>
          <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
            <Insignia tono={TONO_ESTADO[m.estado]}>{m.estado}</Insignia> techo {pct(p.ocupObj, 0)}
          </p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Horas libres por analista</p>
          <p className={cx('mt-1.5 text-[30px] leading-none font-bold tracking-[-0.03em]', m.horasLibres < 0 && 'text-bad-ink')}>
            {num(m.horasLibres, 1)} <span className="text-[16px] font-semibold text-ink-2">h</span>
          </p>
          <p className="mt-2 text-[12px] text-ink-2">
            Carga: {num(m.demandaAnalista, 1)} h/mes · {num(m.demandaDia, 1)} h/día
          </p>
        </Tarjeta>
      </div>

      <Tarjeta className="flex items-start gap-3 p-5">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent-ink" />
        <p className="text-[14px] leading-relaxed">{m.conclusion}</p>
      </Tarjeta>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Tarjeta>
          <EncabezadoTarjeta titulo="Horas del mes por actividad" subtitulo="Suma de las tareas de cada categoría" />
          <div className="px-3 pb-4">
            <ListaBarras
              filas={m.porCategoria
                .slice()
                .sort((a, b) => b.horas - a.horas)
                .map((c) => ({ id: c.categoria, etiqueta: c.categoria, valor: c.horas, texto: `${num(c.horas, 1)} h · ${pct(c.pct, 0)}` }))}
            />
          </div>
        </Tarjeta>
        <div className="flex flex-col gap-5">
          <Tarjeta className="overflow-hidden">
            <EncabezadoTarjeta titulo="Carga por analista" subtitulo="Reparto parejo de la demanda (antes: hoja RESUMEN)" />
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Analista</th>
                  <th className="px-3 pb-2 text-right font-medium">Demanda</th>
                  <th className="px-3 pb-2 text-right font-medium">Capacidad</th>
                  <th className="px-3 pb-2 text-right font-medium">Ocupación</th>
                  <th className="px-5 pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {db.operacionDef.equipo.map((n) => (
                  <tr key={n} className="border-t border-line">
                    <td className="px-5 py-2.5 font-medium">{n}</td>
                    <td className="px-3 py-2.5 text-right tabular">{num(m.demandaAnalista, 1)} h</td>
                    <td className="px-3 py-2.5 text-right tabular">{num(m.capacidadAnalista, 1)} h</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular">{pct(m.capacidadAnalista ? m.demandaAnalista / m.capacidadAnalista : 0, 0)}</td>
                    <td className="px-5 py-2.5">
                      <Insignia tono={TONO_ESTADO[m.estado]}>{m.estado}</Insignia>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
          <Tarjeta className="overflow-hidden">
            <EncabezadoTarjeta titulo="Riesgo de SLA de 24 h en bases fijas" subtitulo="Horas para auditar y responder una base" />
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Concepto</th>
                  <th className="px-3 pb-2 text-right font-medium">Base promedio</th>
                  <th className="px-5 pb-2 text-right font-medium">Base pico</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Casos en la base', num(m.sla.promedio.casos), num(m.sla.pico.casos)],
                  ['Horas para auditar y responder', `${num(m.sla.promedio.horas, 1)} h`, `${num(m.sla.pico.horas, 1)} h`],
                  ['% de la jornada productiva de 1 analista', pct(m.sla.promedio.pctJornada, 0), pct(m.sla.pico.pctJornada, 0)],
                  ['Analistas dedicados ese día', num(m.sla.promedio.analistas), num(m.sla.pico.analistas)],
                ].map(([a, b, c]) => (
                  <tr key={a} className="border-t border-line">
                    <td className="px-5 py-2.5">{a}</td>
                    <td className="px-3 py-2.5 text-right tabular">{b}</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}

function Muestreo() {
  const { db, derivados, hoy } = useVista()
  const p = db.operacion.parametros
  const semana = useMemo(() => planSemanal(db, derivados.planes, hoy), [db, derivados.planes, hoy])
  const real = useMemo(() => {
    const c = { verde: 0, amarillo: 0, rojo: 0, nuevos: 0 }
    for (const f of semana.filas) {
      if (f.nuevo) c.nuevos++
      else if (f.estado === 'verde' || f.estado === 'amarillo' || f.estado === 'rojo') c[f.estado]++
    }
    return c
  }, [semana])
  const sinEvaluar = semana.filas.filter((f) => !f.nuevo && f.estado === 'sin-dato').length
  const conExtra = semana.filas.filter((f) => f.extra > 0).length
  const supuesto = calcularMuestreo(p)
  const conReal = calcularMuestreo(p, real)
  const [verTodos, setVerTodos] = useState(false)

  const TablaSeg = ({ m, titulo, sub }: { m: ReturnType<typeof calcularMuestreo>; titulo: string; sub: string }) => (
    <Tarjeta className="overflow-hidden">
      <EncabezadoTarjeta titulo={titulo} subtitulo={sub} />
      <div className="desplazable overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Segmento</th>
              <th className="px-2 pb-2 text-right font-medium">Agentes</th>
              <th className="px-2 pb-2 text-right font-medium">Aud./agente/sem</th>
              <th className="px-2 pb-2 text-right font-medium">Aud./semana</th>
              <th className="px-5 pb-2 text-right font-medium">Aud./mes</th>
            </tr>
          </thead>
          <tbody>
            {m.segmentos.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-5 py-2.5">
                  {s.id === 'nuevo' ? <Insignia tono="violeta">Nuevo ingreso</Insignia> : <SemaforoPill estado={s.id} />}
                  {s.pct !== null && <span className="ml-2 text-[12px] text-ink-3">{pct(s.pct, 0)} de la plantilla</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular">{num(s.agentes)}</td>
                <td className="px-2 py-2.5 text-right tabular">{num(s.frecuencia, 1)}</td>
                <td className="px-2 py-2.5 text-right tabular">{num(s.semana, 1)}</td>
                <td className="px-5 py-2.5 text-right tabular">{num(s.mes, 1)}</td>
              </tr>
            ))}
            <tr className="border-t border-line-strong font-semibold">
              <td className="px-5 py-2.5">Total</td>
              <td className="px-2 py-2.5 text-right tabular">{num(m.totalAgentes)}</td>
              <td />
              <td className="px-2 py-2.5 text-right tabular">{num(m.totalSemana, 1)}</td>
              <td className="px-5 py-2.5 text-right tabular">{num(m.totalMes, 1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-line px-5 py-3 text-[12.5px] sm:grid-cols-4">
        <div>
          <p className="text-ink-2">Auditorías diarias requeridas</p>
          <p className="text-[15px] font-semibold tabular">{num(m.diarias, 1)}</p>
        </div>
        <div>
          <p className="text-ink-2">Meta diaria del equipo</p>
          <p className="text-[15px] font-semibold tabular">{num(m.meta)}</p>
        </div>
        <div>
          <p className="text-ink-2">Libres por día</p>
          <p className={cx('text-[15px] font-semibold tabular', m.libres < 0 && 'text-bad-ink')}>{num(m.libres, 1)}</p>
        </div>
        <div>
          <p className="text-ink-2">Cobertura por agente/mes</p>
          <p className="text-[15px] font-semibold tabular">{num(m.cobertura, 1)}</p>
        </div>
      </div>
    </Tarjeta>
  )

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta
          titulo={`Plan de auditoría de esta semana · ${fechaCorta(semana.lunes)} – ${fechaCorta(semana.domingo)}`}
          subtitulo={`Audita más a quien más lo necesita: rojo ${num(p.freqRojo, 1)}, amarillo ${num(p.freqAmarillo, 1)}, verde ${num(p.freqVerde, 1)} y nuevo ingreso ${num(p.freqNuevo, 1)} por semana${conExtra ? `; +${EXTRA_POR_PLAN} por plan N2 o mayor en sus primeras ${SEMANAS_EXTRA} semanas (${conExtra} ejecutivos)` : ''}. ${semana.pendientes ? `Faltan ${semana.pendientes} auditorías.` : 'Plan de la semana completo.'}`}
        />
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Ejecutivo</th>
                <th className="px-3 pb-2 font-medium">Segmento</th>
                <th className="px-3 pb-2 text-right font-medium">Esta semana</th>
                <th className="px-3 pb-2 font-medium">Avance</th>
                <th className="px-3 pb-2 font-medium">Última evaluación</th>
                <th className="px-5 pb-2" />
              </tr>
            </thead>
            <tbody>
              {(verTodos ? semana.filas : semana.filas.slice(0, 15)).map((x) => (
                <tr key={x.agente.id} className="border-t border-line">
                  <td className="px-5 py-2">
                    <button onClick={() => abrirPanel('ag', x.agente.id)} className="text-left hover:text-accent-ink">
                      <span className="block font-medium">{nombreCorto(x.agente.nombre)}</span>
                      <span className="block text-[11.5px] text-ink-3">
                        {x.agente.id} · {x.agente.canal === 'Inbound' ? 'Inbound' : x.agente.proceso}
                        {x.plan ? ` · plan N${x.plan.nivel}` : ''}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">{x.nuevo ? <Insignia tono="violeta">Nuevo ingreso</Insignia> : <SemaforoPill estado={x.estado} critico={x.critico} compacto />}</td>
                  <td className="px-3 py-2 text-right tabular whitespace-nowrap">
                    <span className="font-semibold">{x.hechas}</span> / {x.objetivo}
                    {x.extra > 0 && <span className="block text-[11px] text-violet">+{x.extra} por plan N{x.plan?.nivel}</span>}
                  </td>
                  <td className="w-[140px] px-3 py-2">
                    <Medidor valor={x.objetivo ? x.hechas / x.objetivo : 1} color={x.hechas >= x.objetivo ? 'var(--good)' : 'var(--accent)'} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-2">{x.ultima ? fechaConDia(x.ultima) : 'Nunca'}</td>
                  <td className="px-5 py-2 text-right">
                    {x.pendientes > 0 ? (
                      <Boton tam="sm" variante="tinte" icono={<ClipboardCheck className="size-3.5" />} onClick={() => ir('evaluar', { params: { agente: x.agente.id } })}>
                        Evaluar
                      </Boton>
                    ) : (
                      <CheckCircle2 className="ml-auto size-5 text-good-ink" aria-label="Cuota de la semana completa" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {semana.filas.length > 15 && (
          <div className="border-t border-line px-5 py-2.5">
            <button className="text-[13px] font-medium text-accent-ink hover:underline" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Ver menos' : `Ver los ${semana.filas.length} ejecutivos activos`}
            </button>
          </div>
        )}
      </Tarjeta>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TablaSeg m={conReal} titulo="Con el semáforo real" sub={`Ejecutivos activos según sus últimas 4 semanas${sinEvaluar ? ` · ${sinEvaluar} sin evaluaciones recientes (cuentan como verde en el plan semanal)` : ''}`} />
        <TablaSeg m={supuesto} titulo="Con los porcentajes supuestos" sub={`${num(agentesActivos(p))} agentes · ${pct(p.pctRojo, 0)} rojo y ${pct(p.pctAmarillo, 0)} amarillo (parámetros)`} />
      </div>
      <Tarjeta className="p-5 text-[13px] leading-relaxed text-ink-2">
        <p className="mb-1 font-semibold text-ink">Reglas del muestreo</p>
        <p>• El semáforo se recalcula con el promedio de calidad de las últimas 4 semanas y los errores críticos del mes.</p>
        <p>• Ningún agente cierra el mes con menos de {conReal.minimoMes} auditorías (cobertura 100% de la plantilla).</p>
        <p>• Con un plan de acción nivel 2 o mayor: {EXTRA_POR_PLAN} auditorías extra por semana durante {SEMANAS_EXTRA} semanas (ruta antirreincidencia); con nivel 3, auditar el 100% de la tipología crítica esa semana.</p>
        <p>• Selección aleatoria dentro de cada segmento, variando turno y tipo de gestión. Reparto sugerido: {supuesto.repartoMonitoreo} diarias de Monitoreo/VCAS/ATM y {supuesto.repartoInbound} de Inbound.</p>
      </Tarjeta>
    </div>
  )
}

function Kpis() {
  const { db, derivados, rango } = useVista()
  const meses = mesesConDatos(db.evaluaciones)
  const actual = claveMes(hoyIso())
  if (!meses.includes(actual)) meses.unshift(actual)
  const [mes, setMes] = useState(rango.mes ?? meses[0])
  const kpis = useMemo(() => calcularKpis(db, mes, derivados), [db, mes, derivados])
  const guardar = (id: string, valor: string, unidad: string) => {
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    if (n !== null && Number.isNaN(n)) return
    void store.op('operacion.kpi', { mes, id, valor: n === null ? null : unidad === 'pct' ? n / 100 : n })
  }
  const cumplen = kpis.filter((k) => k.estado === 'CUMPLE').length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Selector value={mes} onChange={(e) => setMes(e.target.value)} className="w-[200px]" aria-label="Mes">
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombreMesCapital(m)}
            </option>
          ))}
        </Selector>
        <p className="text-[13px] text-ink-2">
          {cumplen} de {kpis.filter((k) => k.estado).length} indicadores con dato cumplen la meta · los automáticos se calculan con los datos del portal; los demás se capturan aquí.
        </p>
      </div>
      <Tarjeta className="overflow-hidden">
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pt-4 pb-2 font-medium">Indicador</th>
                <th className="px-3 pt-4 pb-2 font-medium">Meta</th>
                <th className="px-3 pt-4 pb-2 font-medium">Real del mes</th>
                <th className="px-3 pt-4 pb-2 font-medium">Cumplimiento</th>
                <th className="px-3 pt-4 pb-2 font-medium">Estado</th>
                <th className="px-5 pt-4 pb-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.def.id} className="border-t border-line align-top">
                  <td className="max-w-[260px] px-5 py-3">
                    <p className="font-medium">{k.def.nombre}</p>
                    <p className="text-[11.5px] text-ink-3">{k.def.formula}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular">
                    {k.def.sentido === 'mayor' ? '≥ ' : '≤ '}
                    {formatoKpi(k.def, k.def.meta)}
                    <p className="text-[11.5px] text-ink-3">{k.def.frecuencia}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Entrada
                        key={`${mes}-${k.def.id}-${k.valor}`}
                        defaultValue={k.valor === null ? '' : k.def.unidad === 'pct' ? String(Math.round(k.valor * 1000) / 10) : String(k.valor)}
                        onBlur={(e) => {
                          const actualTxt = k.valor === null ? '' : k.def.unidad === 'pct' ? String(Math.round(k.valor * 1000) / 10) : String(k.valor)
                          if (e.target.value !== actualTxt) guardar(k.def.id, e.target.value, k.def.unidad)
                        }}
                        className="h-8 w-[84px] text-right tabular"
                        aria-label={`Valor real de ${k.def.nombre}`}
                      />
                      <span className="text-[12px] text-ink-3">{k.def.unidad === 'pct' ? '%' : k.def.unidad === 'pts' ? 'pts' : ''}</span>
                    </div>
                    <p className="mt-1 text-[11px]">{k.fuente === 'auto' ? <span className="text-good-ink">Automático</span> : k.fuente === 'manual' ? <span className="text-accent-ink">Capturado</span> : <span className="text-ink-3">Sin dato</span>}</p>
                  </td>
                  <td className="w-[140px] px-3 py-3">
                    {k.cumplimiento !== null ? (
                      <>
                        <p className="font-semibold tabular">{pct(k.cumplimiento, 0)}</p>
                        <Medidor valor={k.cumplimiento} color={k.estado === 'CUMPLE' ? 'var(--good)' : k.estado === 'EN RIESGO' ? 'var(--warn)' : 'var(--bad)'} alto={5} className="mt-1" />
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">{k.estado ? <Insignia tono={k.estado === 'CUMPLE' ? 'verde' : k.estado === 'EN RIESGO' ? 'ambar' : 'rojo'}>{k.estado}</Insignia> : <span className="text-ink-3">—</span>}</td>
                  <td className="max-w-[280px] px-5 py-3 text-[12px] text-ink-2">
                    {k.detalle}
                    <p className="text-ink-3">{k.def.responsable}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">Cumplimiento: si “mayor es mejor”, real ÷ meta; si “menor es mejor”, meta ÷ real (100% si está dentro de la meta). Estado: ≥ 100% cumple, ≥ 90% en riesgo. Escribe un valor para reemplazar el automático; bórralo para volver al cálculo.</p>
      </Tarjeta>
    </div>
  )
}

function Tiempos() {
  const { db } = useVista()
  const m = useModelo()
  const minMed = db.operacion.parametros.minMediciones || 5
  const hoy = hoyIso()
  const [nuevo, setNuevo] = useState({ fecha: hoy, analistaId: db.analistas.find((a) => a.activo)?.id ?? '', tareaId: 'T01', inicio: '', fin: '', cantidad: '1', observacion: '' })
  const minutos = (() => {
    if (!nuevo.inicio || !nuevo.fin) return 0
    const [h1, m1] = nuevo.inicio.split(':').map(Number)
    const [h2, m2] = nuevo.fin.split(':').map(Number)
    return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1))
  })()
  const agregar = async () => {
    if (!minutos || !Number(nuevo.cantidad)) {
      avisar({ tipo: 'error', titulo: 'Revisa el registro', texto: 'Indica hora de inicio, fin y la cantidad de unidades.' })
      return
    }
    const reg: RegistroTiempo = { id: uid(), fecha: nuevo.fecha, analistaId: nuevo.analistaId, tareaId: nuevo.tareaId, inicio: nuevo.inicio, fin: nuevo.fin, minutos, cantidad: Number(nuevo.cantidad), observacion: nuevo.observacion.trim() }
    await store.op('tiempo.guardar', reg)
    setNuevo((x) => ({ ...x, inicio: x.fin, fin: '', cantidad: '1', observacion: '' }))
    avisar({ tipo: 'exito', titulo: 'Tiempo registrado', texto: `${minutos} min · ${num(minutos / reg.cantidad, 1)} min por unidad` })
  }
  const registros = db.operacion.tiempos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.inicio.localeCompare(a.inicio))
  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo="Catálogo de tareas y tiempos" subtitulo={`Con ${minMed} o más mediciones reales, el tiempo real reemplaza al estándar. Puedes ajustar el estándar escribiendo en la columna.`} />
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Tarea</th>
                <th className="px-3 pb-2 font-medium">Volumen del mes</th>
                <th className="px-3 pb-2 text-right font-medium">Min. estándar</th>
                <th className="px-3 pb-2 text-right font-medium">Mediciones</th>
                <th className="px-3 pb-2 text-right font-medium">Min. real</th>
                <th className="px-3 pb-2 text-right font-medium">Min. aplicado</th>
                <th className="px-3 pb-2 text-right font-medium">Horas</th>
                <th className="px-5 pb-2 text-right font-medium">% carga</th>
              </tr>
            </thead>
            <tbody>
              {m.tareas.map((t) => (
                <tr key={t.def.id} className="border-t border-line align-top">
                  <td className="max-w-[320px] px-5 py-2.5">
                    <p className="font-medium">
                      <span className="mr-1.5 text-ink-3 tabular">{t.def.id}</span>
                      {t.def.tarea}
                    </p>
                    <p className="text-[11.5px] text-ink-3">
                      {t.def.categoria} · {t.def.incluye}
                    </p>
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <p className="font-semibold tabular">
                      {num(t.volumen, 1)} <span className="font-normal text-ink-2">{t.def.unidad}</span>
                    </p>
                    <p className="text-[11.5px] text-ink-3">{t.textoVolumen}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Entrada
                      key={`${t.def.id}-${t.minEstandar}`}
                      defaultValue={String(t.minEstandar)}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v === String(t.minEstandar)) return
                        void store.op('operacion.tarea', { id: t.def.id, minEstandar: v === '' || Number(v) === t.def.minEstandar ? null : Number(v) })
                      }}
                      className="ml-auto h-8 w-[72px] text-right tabular"
                      aria-label={`Minutos estándar ${t.def.id}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{t.mediciones || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular">{t.minReal === null ? '—' : num(t.minReal, 1)}</td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {num(t.minAplicado, 1)}
                    {t.usaReal && <Insignia tono="verde" className="ml-1">real</Insignia>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{num(t.horas, 1)}</td>
                  <td className="px-5 py-2.5 text-right tabular text-ink-2">{pct(t.pct, 1)}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-5 py-3" colSpan={6}>
                  Total de demanda mensual del equipo
                </td>
                <td className="px-3 py-3 text-right tabular">{num(m.demanda, 1)} h</td>
                <td className="px-5 py-3 text-right tabular">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta>
        <EncabezadoTarjeta titulo="Toma de tiempos" subtitulo="Registra cada bloque de trabajo (ej. auditorías de 8:30 a 10:30, 7 auditorías). Antes: hoja TOMA_TIEMPOS." />
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 md:grid-cols-4 xl:grid-cols-8">
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
          </Campo>
          <Campo etiqueta="Analista">
            <Selector value={nuevo.analistaId} onChange={(e) => setNuevo({ ...nuevo, analistaId: e.target.value })}>
              {db.analistas
                .filter((a) => a.activo)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.corto}
                  </option>
                ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Tarea" className="col-span-2">
            <Selector value={nuevo.tareaId} onChange={(e) => setNuevo({ ...nuevo, tareaId: e.target.value })}>
              {db.operacionDef.tareas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.tarea}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Inicio">
            <Entrada type="time" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} />
          </Campo>
          <Campo etiqueta="Fin" ayuda={minutos ? `${minutos} min` : undefined}>
            <Entrada type="time" value={nuevo.fin} onChange={(e) => setNuevo({ ...nuevo, fin: e.target.value })} />
          </Campo>
          <Campo etiqueta="Cantidad" ayuda={minutos && Number(nuevo.cantidad) ? `${num(minutos / Number(nuevo.cantidad), 1)} min/unidad` : undefined}>
            <Entrada inputMode="numeric" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
          </Campo>
          <div className="flex items-end">
            <Boton variante="primario" icono={<Plus className="size-4" />} onClick={agregar} className="w-full">
              Registrar
            </Boton>
          </div>
          <Campo etiqueta="Observación" className="col-span-2 md:col-span-4 xl:col-span-8">
            <Entrada value={nuevo.observacion} onChange={(e) => setNuevo({ ...nuevo, observacion: e.target.value })} placeholder="Ej. 7 auditorías de Monitoreo" />
          </Campo>
        </div>
        {registros.length > 0 ? (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-[13px]">
              <tbody>
                {registros.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-t border-line first:border-t-0">
                    <td className="px-5 py-2 whitespace-nowrap">{fechaConDia(r.fecha)}</td>
                    <td className="px-3 py-2">{db.analistas.find((a) => a.id === r.analistaId)?.corto}</td>
                    <td className="px-3 py-2">
                      {r.tareaId} · {db.operacionDef.tareas.find((t) => t.id === r.tareaId)?.tarea}
                    </td>
                    <td className="px-3 py-2 tabular">
                      {r.inicio}–{r.fin}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{r.minutos} min</td>
                    <td className="px-3 py-2 text-right tabular">{r.cantidad} u.</td>
                    <td className="px-3 py-2 text-right font-semibold tabular">{num(r.minutos / Math.max(1, r.cantidad), 1)} min/u</td>
                    <td className="px-3 py-2 text-ink-2">{r.observacion}</td>
                    <td className="px-5 py-2 text-right">
                      <BotonIcono etiqueta="Eliminar registro" tam="sm" onClick={() => void store.op('tiempo.eliminar', { id: r.id })}>
                        <Trash2 className="size-4" />
                      </BotonIcono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-line px-5 py-4 text-[13px] text-ink-2">Aún no hay registros. Con {minMed} mediciones de una tarea, su tiempo real se usa en el modelo de capacidad y en el KPI de ocupación.</p>
        )}
      </Tarjeta>
    </div>
  )
}

function Bases() {
  const { db } = useVista()
  const ahora = () => {
    const d = new Date()
    d.setSeconds(0, 0)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const vacio = (): RegistroBase => ({ id: uid(), tipo: 'base', nombre: db.operacionDef.basesCatalogo[0]?.nombre ?? '', enviadaPor: db.operacionDef.basesCatalogo[0]?.enviadaPor ?? '', recibido: ahora(), respondido: '', casos: 0, analistaId: db.analistas.find((a) => a.activo)?.id ?? '', hallazgos: [] })
  const [edicion, setEdicion] = useState<RegistroBase | null>(null)
  const [imprimir, setImprimir] = useState<RegistroBase | null>(null)
  const formulario = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (edicion) setTimeout(() => formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }, [edicion?.id])
  const lista = db.operacion.bases.slice().sort((a, b) => b.recibido.localeCompare(a.recibido))
  const enSla = (b: RegistroBase) => !!b.respondido && new Date(b.respondido).getTime() - new Date(b.recibido).getTime() <= 24 * 3600 * 1000
  const guardar = async () => {
    if (!edicion) return
    await store.op('base.guardar', { ...edicion, hallazgos: edicion.hallazgos.filter((h) => h.caso || h.observacion) })
    setEdicion(null)
    avisar({ tipo: 'exito', titulo: 'Registro guardado' })
  }
  const imprimirNotificacion = (b: RegistroBase) => {
    setImprimir(b)
    setTimeout(() => {
      window.print()
      setImprimir(null)
    }, 80)
  }
  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta
          titulo="Bases fijas y solicitudes por correo"
          subtitulo="Registro de recepción y respuesta: calcula solo los KPIs de SLA de 24 h y genera la “Notificación de auditorías base corporativo”."
          accion={
            <Boton variante="primario" tam="sm" icono={<Plus className="size-4" />} onClick={() => setEdicion(vacio())}>
              Registrar
            </Boton>
          }
        />
        {lista.length === 0 ? (
          <Vacio titulo="Sin registros" texto="Registra cada base o correo al recibirlo y marca la hora de respuesta al enviarla." className="py-8" />
        ) : (
          <div className="desplazable overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Recibido</th>
                  <th className="px-3 pb-2 font-medium">Base / correo</th>
                  <th className="px-3 pb-2 text-right font-medium">Casos</th>
                  <th className="px-3 pb-2 font-medium">Respondido</th>
                  <th className="px-3 pb-2 font-medium">SLA 24 h</th>
                  <th className="px-3 pb-2 font-medium">Analista</th>
                  <th className="px-5 pb-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((b) => (
                  <tr key={b.id} className="cursor-pointer border-t border-line hover:bg-hover" onClick={() => setEdicion({ ...b, hallazgos: b.hallazgos.slice() })}>
                    <td className="px-5 py-2.5 whitespace-nowrap">{fechaHora(b.recibido)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{b.nombre}</p>
                      <p className="text-[11.5px] text-ink-3">
                        {b.tipo === 'base' ? 'Base fija' : 'Correo'} · {b.enviadaPor} · {b.hallazgos.length} hallazgo(s)
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{b.casos}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.respondido ? fechaHora(b.respondido) : <span className="text-warn-ink">Pendiente</span>}</td>
                    <td className="px-3 py-2.5">{b.respondido ? enSla(b) ? <Insignia tono="verde">En tiempo</Insignia> : <Insignia tono="rojo">Fuera de SLA</Insignia> : <Insignia tono="ambar">Abierto</Insignia>}</td>
                    <td className="px-3 py-2.5">{db.analistas.find((a) => a.id === b.analistaId)?.corto}</td>
                    <td className="px-5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <BotonIcono etiqueta="Imprimir notificación" tam="sm" onClick={() => imprimirNotificacion(b)}>
                        <Printer className="size-4" />
                      </BotonIcono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {edicion && (
        <div ref={formulario}>
        <Tarjeta className="anim-aparecer p-5">
          <h3 className="mb-4 text-[15px] font-semibold">{db.operacion.bases.some((b) => b.id === edicion.id) ? 'Editar registro' : 'Nuevo registro'}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Campo etiqueta="Tipo">
              <Segmentado
                completo
                valor={edicion.tipo}
                onChange={(t) => setEdicion({ ...edicion, tipo: t, nombre: t === 'correo' ? 'Solicitud por correo' : db.operacionDef.basesCatalogo[0]?.nombre ?? '' })}
                opciones={[
                  { valor: 'base', etiqueta: 'Base fija' },
                  { valor: 'correo', etiqueta: 'Correo' },
                ]}
              />
            </Campo>
            <Campo etiqueta="Base / asunto">
              {edicion.tipo === 'base' ? (
                <Selector
                  value={edicion.nombre}
                  onChange={(e) => {
                    const b = db.operacionDef.basesCatalogo.find((x) => x.nombre === e.target.value)
                    setEdicion({ ...edicion, nombre: e.target.value, enviadaPor: b?.enviadaPor ?? edicion.enviadaPor })
                  }}
                >
                  {db.operacionDef.basesCatalogo.map((b) => (
                    <option key={b.nombre} value={b.nombre}>
                      {b.nombre}
                    </option>
                  ))}
                </Selector>
              ) : (
                <Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
              )}
            </Campo>
            <Campo etiqueta="Enviada por">
              <Entrada value={edicion.enviadaPor} onChange={(e) => setEdicion({ ...edicion, enviadaPor: e.target.value })} />
            </Campo>
            <Campo etiqueta="Recibido">
              <Entrada type="datetime-local" value={edicion.recibido} onChange={(e) => setEdicion({ ...edicion, recibido: e.target.value })} />
            </Campo>
            <Campo etiqueta="Respondido">
              <div className="flex gap-2">
                <Entrada type="datetime-local" value={edicion.respondido ?? ''} onChange={(e) => setEdicion({ ...edicion, respondido: e.target.value })} />
                <Boton tam="sm" onClick={() => setEdicion({ ...edicion, respondido: ahora() })}>
                  Ahora
                </Boton>
              </div>
            </Campo>
            <Campo etiqueta="Casos">
              <Entrada inputMode="numeric" value={String(edicion.casos || '')} onChange={(e) => setEdicion({ ...edicion, casos: Number(e.target.value) || 0 })} />
            </Campo>
          </div>
          <p className="mt-5 mb-2 text-[12.5px] font-semibold text-ink-2">Hallazgos por agente (para la notificación)</p>
          <div className="flex flex-col gap-2">
            {edicion.hallazgos.map((h, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[140px_220px_1fr_auto]">
                <Entrada placeholder="Caso" value={h.caso} onChange={(e) => setEdicion({ ...edicion, hallazgos: edicion.hallazgos.map((x, j) => (j === i ? { ...x, caso: e.target.value } : x)) })} />
                <Selector value={h.agenteId} onChange={(e) => setEdicion({ ...edicion, hallazgos: edicion.hallazgos.map((x, j) => (j === i ? { ...x, agenteId: e.target.value } : x)) })}>
                  <option value="">Agente…</option>
                  {db.agentes
                    .filter((a) => a.activo)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </Selector>
                <AreaTexto rows={1} placeholder="Observaciones al agente" value={h.observacion} onChange={(e) => setEdicion({ ...edicion, hallazgos: edicion.hallazgos.map((x, j) => (j === i ? { ...x, observacion: e.target.value } : x)) })} />
                <BotonIcono etiqueta="Quitar hallazgo" onClick={() => setEdicion({ ...edicion, hallazgos: edicion.hallazgos.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </BotonIcono>
              </div>
            ))}
            <Boton tam="sm" variante="fantasma" icono={<Plus className="size-4" />} onClick={() => setEdicion({ ...edicion, hallazgos: [...edicion.hallazgos, { caso: '', agenteId: '', observacion: '' }] })} className="self-start">
              Agregar hallazgo
            </Boton>
          </div>
          <div className="mt-5 flex justify-between gap-2">
            {db.operacion.bases.some((b) => b.id === edicion.id) ? (
              <Boton
                variante="peligro"
                tam="sm"
                onClick={() => {
                  void store.op('base.eliminar', { id: edicion.id })
                  setEdicion(null)
                }}
              >
                Eliminar
              </Boton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Boton onClick={() => setEdicion(null)}>Cancelar</Boton>
              <Boton variante="primario" onClick={guardar}>
                Guardar
              </Boton>
            </div>
          </div>
        </Tarjeta>
        </div>
      )}
      {imprimir &&
        createPortal(
          <div className="zona-impresion solo-impresion">
            <div className="hoja mx-auto bg-white p-8 text-[10pt] text-black">
              <div className="flex items-center justify-between border-b-2 border-black pb-2">
                <img src={`${import.meta.env.BASE_URL}marca/logo-preferencial.png`} alt="Positivo S+" className="h-6" />
                <div className="text-right">
                  <p className="text-[9pt] font-semibold uppercase">Proceso de calidad y auditorías internas</p>
                  <p className="text-[12pt] font-bold">FORMATO: NOTIFICACIÓN DE LAS AUDITORÍAS BASE CORPORATIVO</p>
                </div>
              </div>
              <p className="mt-3 text-[9.5pt]">
                {imprimir.nombre} · enviada por {imprimir.enviadaPor} · recibida {fechaHora(imprimir.recibido)} · {imprimir.casos} casos
              </p>
              <table className="mt-3 w-full border-collapse text-[9pt]">
                <thead>
                  <tr className="bg-black/[0.06] text-left">
                    <th className="border border-black/30 px-2 py-1">FECHA</th>
                    <th className="border border-black/30 px-2 py-1">CASO</th>
                    <th className="border border-black/30 px-2 py-1">NOMBRE DEL AGENTE</th>
                    <th className="border border-black/30 px-2 py-1">OBSERVACIONES AL AGENTE</th>
                  </tr>
                </thead>
                <tbody>
                  {imprimir.hallazgos.map((h, i) => (
                    <tr key={i}>
                      <td className="border border-black/30 px-2 py-1 whitespace-nowrap">{fechaCorta(diaLocal(imprimir.recibido))}</td>
                      <td className="border border-black/30 px-2 py-1">{h.caso}</td>
                      <td className="border border-black/30 px-2 py-1">{db.agentes.find((a) => a.id === h.agenteId)?.nombre ?? ''}</td>
                      <td className="border border-black/30 px-2 py-1">{h.observacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-10 text-right text-[9.5pt] font-semibold">ATENTAMENTE: CALIDAD</p>
              <p className="mt-12 w-64 border-t border-black pt-1 text-center text-[9pt]">Firma del Analista de Calidad</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Parametros() {
  const { db, semaforos } = useVista()
  const p = db.operacion.parametros
  const activos = db.agentes.filter((a) => a.activo)
  const evaluados = [...semaforos.values()].filter((s) => s.estado !== 'sin-dato')
  const sugerencias: Record<string, { valor: number; texto: string }> = {
    nAnalistas: { valor: db.analistas.filter((a) => a.activo).length, texto: 'analistas activos' },
    agMonitoreo: { valor: activos.filter((a) => a.canal === 'Monitoreo').length, texto: 'ejecutivos activos de Monitoreo en Ajustes' },
    agInbound: { valor: activos.filter((a) => a.canal === 'Inbound').length, texto: 'ejecutivos activos de Inbound en Ajustes' },
    ...(evaluados.length
      ? {
          pctRojo: { valor: Math.round((evaluados.filter((s) => s.estado === 'rojo').length / evaluados.length) * 100) / 100, texto: 'semáforo real (4 semanas)' },
          pctAmarillo: { valor: Math.round((evaluados.filter((s) => s.estado === 'amarillo').length / evaluados.length) * 100) / 100, texto: 'semáforo real (4 semanas)' },
        }
      : {}),
  }
  const valorDe = (key: string) => (key === 'metaCalidad' ? db.config.meta : key === 'umbralRojo' ? db.config.umbralRojo : p[key])
  const guardar = (key: string, tipo: 'pct' | 'num', texto: string) => {
    const n = Number(texto.replace(',', '.'))
    if (Number.isNaN(n) || texto.trim() === '') return
    const valor = tipo === 'pct' ? n / 100 : n
    if (key === 'metaCalidad' || key === 'umbralRojo') {
      void store.op('config.actualizar', { [key === 'metaCalidad' ? 'meta' : 'umbralRojo']: valor })
      void store.op('operacion.parametro', { key, valor })
    } else void store.op('operacion.parametro', { key, valor })
  }
  const grupos = [...new Set(db.operacionDef.parametros.map((x) => x.grupo))]
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {grupos.map((g) => (
        <Tarjeta key={g} className="overflow-hidden">
          <EncabezadoTarjeta titulo={g} />
          <ul>
            {db.operacionDef.parametros
              .filter((x) => x.grupo === g)
              .map((x) => {
                const v = valorDe(x.key)
                const s = sugerencias[x.key]
                const texto = x.tipo === 'pct' ? String(Math.round(v * 1000) / 10) : String(v)
                return (
                  <li key={x.key} className="flex items-start gap-3 border-t border-line px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{x.nombre}</p>
                      <p className="text-[11.5px] text-ink-3">{x.fuente}</p>
                      {s && Math.abs(s.valor - v) > 1e-9 && (
                        <button onClick={() => guardar(x.key, x.tipo, x.tipo === 'pct' ? String(s.valor * 100) : String(s.valor))} className="mt-1 text-[12px] font-medium text-accent-ink hover:underline">
                          Usar dato real: {x.tipo === 'pct' ? pct(s.valor, 0) : num(s.valor)} ({s.texto})
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Entrada key={`${x.key}-${v}`} defaultValue={texto} onBlur={(e) => e.target.value !== texto && guardar(x.key, x.tipo, e.target.value)} className="h-8 w-[84px] text-right tabular" aria-label={x.nombre} />
                      <span className="w-[70px] text-[12px] text-ink-3">{x.tipo === 'pct' ? '%' : x.unidad}</span>
                    </div>
                  </li>
                )
              })}
          </ul>
        </Tarjeta>
      ))}
    </div>
  )
}

function EquipoCalidad() {
  const { db } = useVista()
  const reparto = repartoEquipo(db.operacion.parametros)
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {db.modelo.roles.map((r, i) => (
          <Tarjeta key={i} className="p-5">
            <p className="text-[12px] font-semibold text-ink-2 uppercase">Analista de calidad {i + 1}</p>
            <p className="mt-1 text-[17px] font-semibold">{db.operacionDef.equipo[i] ?? r.analista}</p>
            <p className="mt-1 text-[13px] text-ink-2">{r.rol}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[12px] bg-surface-2/70 p-2.5">
                <p className="text-[11.5px] text-ink-2">Agentes a cargo</p>
                <p className="text-[18px] font-bold tabular">{reparto[i]?.agentes}</p>
              </div>
              <div className="rounded-[12px] bg-surface-2/70 p-2.5">
                <p className="text-[11.5px] text-ink-2">Auditorías diarias</p>
                <p className="text-[18px] font-bold tabular">{reparto[i]?.diarias}</p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed">{r.responsabilidades}</p>
            <p className="mt-2 text-[12px] text-ink-2">Respaldo: {r.respaldo}</p>
          </Tarjeta>
        ))}
      </div>
      <NuevosIngresos />
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo="Ruta de calidad del nuevo ingreso" subtitulo="Qué hace calidad en cada fase de la capacitación y el periodo de prueba (registra la fecha de ingreso del ejecutivo en Ajustes para que entre al segmento de nuevo ingreso)" />
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Fase</th>
                <th className="px-3 pb-2 font-medium">Días</th>
                <th className="px-3 pb-2 font-medium">Actividad de calidad</th>
                <th className="px-3 pb-2 font-medium">Cómo se hace</th>
                <th className="px-3 pb-2 font-medium">Responsable</th>
                <th className="px-5 pb-2 font-medium">Criterio para avanzar</th>
              </tr>
            </thead>
            <tbody>
              {db.modelo.fasesIngreso.map((f) => (
                <tr key={f.fase} className="border-t border-line align-top">
                  <td className="px-5 py-2.5 font-semibold whitespace-nowrap">{f.fase}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{f.dias}</td>
                  <td className="px-3 py-2.5">{f.actividad}</td>
                  <td className="max-w-[360px] px-3 py-2.5 text-ink-2">{f.como}</td>
                  <td className="px-3 py-2.5 text-ink-2">{f.responsable}</td>
                  <td className="px-5 py-2.5">{f.criterio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  )
}
