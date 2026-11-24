import { useEffect, useMemo, type ReactNode } from 'react'
import { Download, ShieldAlert } from 'lucide-react'
import type { Canal, Evaluacion } from '../lib/types'
import { useVista } from '../lib/vista'
import { abrirPanel, ir, useRuta } from '../lib/router'
import { distribucion, matrizErrores, matrizProcesoTipo, motivosResumen, porCedula, promedio, resumen } from '../lib/analytics'
import { cedulasDeCanal } from '../lib/catalog'
import { semanaDelMes, ultimoDiaMes, fechaCorta } from '../lib/dates'
import { deltaPts, duracion, num, pct } from '../lib/format'
import { exportarLibro } from '../lib/excel'
import { EncabezadoPagina } from '../components/Layout'
import { GraficaColumnas, LeyendaCalor, ListaBarras, estiloCalor } from '../components/charts'
import { Boton, EncabezadoTarjeta, Insignia, Puntaje, Tarjeta, Vacio, colorPuntaje, cx } from '../components/ui'

const SECCIONES = [
  { id: 'cedulas', titulo: 'Por cédula y semana' },
  { id: 'rubros', titulo: 'Tasa de error por rubro' },
  { id: 'criticos', titulo: 'Errores críticos' },
  { id: 'motivos', titulo: 'Motivos' },
  { id: 'monitoreo', titulo: 'Monitoreo por proceso' },
  { id: 'distribucion', titulo: 'Distribución' },
]

function Celda({ v, n, children }: { v: number | null; n?: number; children?: ReactNode }) {
  const { cfg } = useVista()
  if (v === null || n === 0) return <td className="px-2 py-2 text-center text-ink-3">n/a</td>
  return (
    <td className="px-1.5 py-1.5 text-center">
      <span className="inline-block min-w-[62px] rounded-[7px] px-1.5 py-1 text-[12.5px] font-semibold whitespace-nowrap tabular" style={{ background: `color-mix(in srgb, ${colorPuntaje(v, false, cfg.meta, cfg.umbralRojo)} 15%, transparent)` }}>
        {children ?? pct(v)}
      </span>
    </td>
  )
}

export function Analisis() {
  const { db, evals, rango, cfg, canal } = useVista()
  const ruta = useRuta()
  useEffect(() => {
    if (ruta.sub) setTimeout(() => document.getElementById(`sec-${ruta.sub}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
  }, [ruta.sub])
  const canales = (['Inbound', 'Monitoreo'] as Canal[]).filter((c) => canal === 'todos' || canal === c)

  const exportar = () => {
    const hojas = canales.flatMap((c) => {
      const m = matrizErrores(evals, db.catalogo, c)
      const filasMatriz = m.temas.map((t) => {
        const fila: Record<string, unknown> = { Bloque: t.bloque, Rubro: t.topico }
        for (const ced of m.cedulas) {
          const x = m.celdas.get(`${t.tema}|${ced.id}`)
          fila[ced.nombre] = x ? (x.tasa === null ? '' : Math.round(x.tasa * 1000) / 1000) : 'n/a'
        }
        fila['Total'] = m.totalPorTema.get(t.tema)?.tasa ?? ''
        return fila
      })
      const ced = porCedula(evals.filter((e) => e.canal === c), db.catalogo, cfg)
        .filter((x) => x.canal === c)
        .map((x) => ({ Cédula: x.nombre, Monitoreos: x.n, 'Promedio QA': x.promedio ?? '', Diferencia: x.delta ?? '', Críticos: x.criticos }))
      return [
        { nombre: `${c} - por cédula`, filas: ced },
        { nombre: `${c} - tasa de error`, filas: filasMatriz },
      ]
    })
    void exportarLibro(`analisis-${rango.etiqueta.toLowerCase().replace(/\s+/g, '-')}`, hojas)
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Análisis"
        subtitulo={`${rango.etiqueta} · ${num(evals.length)} evaluaciones · todo se recalcula desde las evaluaciones`}
        acciones={
          <Boton tam="sm" icono={<Download className="size-4" />} onClick={exportar}>
            Exportar a Excel
          </Boton>
        }
      />
      <nav className="sticky top-[56px] z-10 -mx-4 mb-5 flex gap-1.5 overflow-x-auto bg-bg/80 px-4 py-2 backdrop-blur-md md:-mx-8 md:px-8" aria-label="Secciones del análisis">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="h-8 shrink-0 rounded-full bg-fill-2 px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink"
          >
            {s.titulo}
          </button>
        ))}
      </nav>

      {evals.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Sin evaluaciones en el periodo" texto="Cambia el periodo o el canal en la barra superior." />
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-6">
          <section id="sec-cedulas" className="scroll-mt-[120px]">
            {canales.map((c) => (
              <PorCedulaSemana key={c} canal={c} evals={evals.filter((e) => e.canal === c)} />
            ))}
          </section>
          <section id="sec-rubros" className="scroll-mt-[120px] flex flex-col gap-5">
            {canales.map((c) => (
              <MapaRubros key={c} canal={c} evals={evals} />
            ))}
          </section>
          <section id="sec-criticos" className="scroll-mt-[120px]">
            <Criticos evals={evals} />
          </section>
          <section id="sec-motivos" className="scroll-mt-[120px]">
            <Motivos evals={evals} />
          </section>
          {canales.includes('Monitoreo') && (
            <section id="sec-monitoreo" className="scroll-mt-[120px]">
              <MonitoreoProceso evals={evals.filter((e) => e.canal === 'Monitoreo')} />
            </section>
          )}
          <section id="sec-distribucion" className="scroll-mt-[120px]">
            <Distribucion evals={evals} />
          </section>
        </div>
      )}
    </div>
  )
}

function PorCedulaSemana({ canal, evals }: { canal: Canal; evals: Evaluacion[] }) {
  const { db, cfg, rango } = useVista()
  const filas = useMemo(() => porCedula(evals, db.catalogo, cfg).filter((c) => c.canal === canal), [evals, db.catalogo, cfg, canal])
  const general = resumen(evals, cfg)
  const semanas = rango.mes ? Array.from({ length: semanaDelMes(ultimoDiaMes(rango.mes)) }, (_, i) => i + 1) : [...new Set(evals.map((e) => e.semana))].sort()
  const promSemana = (s: number) => promedio(evals.filter((e) => e.semana === s).map((e) => e.puntaje))
  if (!evals.length) return null
  return (
    <Tarjeta className="mb-5 overflow-hidden">
      <EncabezadoTarjeta titulo={`${canal}: resultados por cédula y semana`} subtitulo={`Promedio general ${pct(general.promedio)} · ${general.n} evaluaciones. Celdas en color según la meta.`} />
      <div className="desplazable overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Indicador</th>
              {filas.map((c) => (
                <th key={c.cedulaId} className="px-2 pb-2 text-center font-medium">
                  {c.nombre.replace('Monitoreo · ', '')}
                </th>
              ))}
              <th className="px-3 pb-2 text-center font-semibold text-ink">General</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="px-5 py-2 font-medium">Monitoreos</td>
              {filas.map((c) => (
                <td key={c.cedulaId} className="px-2 py-2 text-center tabular">
                  {c.n ? (
                    <button className="enlace" onClick={() => ir('evaluaciones', { params: { cedula: c.cedulaId } })}>
                      {c.n}
                    </button>
                  ) : (
                    <span className="text-ink-3">n/a</span>
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-semibold tabular">{general.n}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="px-5 py-2 font-medium">Promedio QA</td>
              {filas.map((c) => (
                <Celda key={c.cedulaId} v={c.promedio} n={c.n} />
              ))}
              <Celda v={general.promedio} n={general.n} />
            </tr>
            <tr className="border-t border-line">
              <td className="px-5 py-2 font-medium">Diferencia vs. general</td>
              {filas.map((c) => (
                <td key={c.cedulaId} className={cx('px-2 py-2 text-center font-medium tabular', !c.n ? 'text-ink-3' : (c.delta ?? 0) >= 0 ? 'text-good-ink' : 'text-bad-ink')}>
                  {c.n ? deltaPts(c.delta) : 'n/a'}
                </td>
              ))}
              <td className="px-3 py-2" />
            </tr>
            <tr className="border-t border-line">
              <td className="px-5 py-2 font-medium">Errores críticos</td>
              {filas.map((c) => (
                <td key={c.cedulaId} className="px-2 py-2 text-center tabular">
                  {c.n ? c.criticos ? <span className="font-semibold text-bad-ink">{c.criticos}</span> : 0 : <span className="text-ink-3">n/a</span>}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-semibold tabular">{general.criticos}</td>
            </tr>
            {semanas.map((s, i) => {
              const ps = promSemana(s)
              const ant = i > 0 ? promSemana(semanas[i - 1]) : null
              return (
                <tr key={`n${s}`} className={cx('border-t border-line', i === 0 && 'border-t-line-strong')}>
                  <td className="px-5 py-2">
                    <span className="font-medium">Semana {s}</span>
                    {ps !== null && ant !== null && <span className={cx('block text-[11.5px] whitespace-nowrap tabular', ps - ant >= 0 ? 'text-good-ink' : 'text-bad-ink')}>{deltaPts(ps - ant)} vs anterior</span>}
                  </td>
                  {filas.map((c) => {
                    const x = c.porSemana.get(s)
                    return (
                      <Celda key={c.cedulaId} v={x?.promedio ?? null} n={x?.n ?? 0}>
                        {pct(x?.promedio ?? null)} <span className="font-normal text-ink-2">({x?.n})</span>
                      </Celda>
                    )
                  })}
                  <Celda v={ps} n={evals.filter((e) => e.semana === s).length}>
                    {pct(ps)} <span className="font-normal text-ink-2">({evals.filter((e) => e.semana === s).length})</span>
                  </Celda>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">Entre paréntesis, número de evaluaciones de la semana. “n/a” = sin evaluaciones de esa cédula.</p>
    </Tarjeta>
  )
}

function MapaRubros({ canal, evals }: { canal: Canal; evals: Evaluacion[] }) {
  const { db } = useVista()
  const m = useMemo(() => matrizErrores(evals, db.catalogo, canal), [evals, db.catalogo, canal])
  const conDatos = m.cedulas.filter((c) => evals.some((e) => e.cedulaId === c.id))
  if (!conDatos.length) return null
  let bloque = ''
  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoTarjeta
        titulo={`${canal}: tasa de error por rubro`}
        subtitulo="“No cumple” entre (“Sí” + “No”) por cédula. Toca una celda para ver esas evaluaciones."
        accion={<LeyendaCalor maximo={0.5} />}
      />
      <div className="desplazable overflow-x-auto pb-2">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Rubro</th>
              {conDatos.map((c) => (
                <th key={c.id} className="px-1 pb-2 text-center font-medium">
                  {c.nombre.replace('Monitoreo · ', '')}
                </th>
              ))}
              <th className="px-3 pb-2 text-center font-semibold text-ink">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.temas.map((t) => {
              const nuevoBloque = t.bloque !== bloque
              bloque = t.bloque
              const total = m.totalPorTema.get(t.tema)
              return (
                <tr key={t.tema} className={cx('border-t', nuevoBloque ? 'border-line-strong' : 'border-line')}>
                  <td className="max-w-[340px] px-5 py-1.5">
                    {nuevoBloque && <span className="block text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{t.bloque}</span>}
                    <span className="block truncate" title={t.topico}>
                      {t.topico}
                    </span>
                  </td>
                  {conDatos.map((c) => {
                    const x = m.celdas.get(`${t.tema}|${c.id}`)
                    if (!x) return <td key={c.id} className="px-1 py-1.5 text-center text-[11.5px] text-ink-3">—</td>
                    if (x.tasa === null) return <td key={c.id} className="px-1 py-1.5 text-center text-[11.5px] text-ink-3">·</td>
                    return (
                      <td key={c.id} className="px-1 py-1">
                        <button
                          onClick={() => x.no && ir('evaluaciones', { params: { rubro: t.tema, cedula: c.id } })}
                          title={`${x.no} de ${x.si + x.no}`}
                          className="mx-auto flex h-8 w-full min-w-[56px] items-center justify-center rounded-[7px] text-[12px] font-semibold tabular"
                          style={x.no ? estiloCalor(x.tasa, 0.5) : { background: 'var(--fill-2)', color: 'var(--ink-3)' }}
                        >
                          {pct(x.tasa, 0)}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-center font-semibold tabular">{total?.tasa === null || !total ? '—' : `${pct(total.tasa, 0)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">“—” el rubro no existe en esa cédula · “·” existe pero no se calificó en el periodo.</p>
    </Tarjeta>
  )
}

function Criticos({ evals }: { evals: Evaluacion[] }) {
  const { db, cfg } = useVista()
  const criticas = evals.filter((e) => e.critico).sort((a, b) => b.fechaEvaluacion.localeCompare(a.fechaEvaluacion))
  const resumenCed = db.catalogo.cedulas.map((c) => {
    const crit = c.items.filter((i) => i.critico !== 'no')
    return { c, items: c.items.length, criticos: crit.length, ptsCrit: crit.reduce((s, i) => s + i.peso, 0), pts: c.total }
  })
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo={`Evaluaciones con error crítico (${criticas.length})`} subtitulo="Un “No” en un rubro crítico deja la calificación en 0 y sube el plan al nivel 3 o 4" />
        {criticas.length === 0 ? (
          <Vacio titulo="Sin errores críticos" className="py-8" />
        ) : (
          <ul className="px-2 pb-3">
            {criticas.slice(0, 20).map((e) => {
              const claves = Object.entries(e.respuestas)
                .filter(([k, r]) => r === 'N' && (e.criticos[k] === 'siempre' || (e.criticos[k] === 'motivo' && db.catalogo.items[k]?.motivos?.some((m) => m.label === e.motivos[k] && m.critico))))
                .map(([k]) => db.catalogo.items[k]?.topico)
              return (
                <li key={e.id}>
                  <button onClick={() => abrirPanel('ev', e.id)} className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-hover">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{e.agenteNombre}</span>
                      <span className="block truncate text-[12px] text-ink-2">
                        {fechaCorta(e.fechaEvaluacion)} · {e.folio} · {claves.join(', ')}
                      </span>
                    </span>
                    <Puntaje valor={e.puntaje} critico meta={cfg.meta} umbral={cfg.umbralRojo} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo="Peso de los rubros críticos por cédula" subtitulo="Antes: hoja “ERRORES CRÍTICOS”. Detalle de cada rubro en la Guía." />
        <div className="desplazable overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Cédula</th>
                <th className="px-2 pb-2 text-right font-medium">Rubros</th>
                <th className="px-2 pb-2 text-right font-medium">Críticos</th>
                <th className="px-2 pb-2 text-right font-medium">Pts críticos</th>
                <th className="px-5 pb-2 text-right font-medium">% del puntaje</th>
              </tr>
            </thead>
            <tbody>
              {resumenCed.map((r) => (
                <tr key={r.c.id} onClick={() => ir('guia', { params: { cedula: r.c.id } })} className="cursor-pointer border-t border-line hover:bg-hover">
                  <td className="px-5 py-2">{r.c.nombre}</td>
                  <td className="px-2 py-2 text-right tabular">{r.items}</td>
                  <td className="px-2 py-2 text-right tabular">{r.criticos}</td>
                  <td className="px-2 py-2 text-right tabular">
                    {r.ptsCrit} / {r.pts}
                  </td>
                  <td className="px-5 py-2 text-right font-semibold tabular">{pct(r.pts ? r.ptsCrit / r.pts : 0, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  )
}

function Motivos({ evals }: { evals: Evaluacion[] }) {
  const { db } = useVista()
  const lista = motivosResumen(evals, db.catalogo)
  if (!lista.some((m) => m.fallas)) return null
  return (
    <Tarjeta>
      <EncabezadoTarjeta titulo="Motivos de incumplimiento (Inbound)" subtitulo="Hotlist, Bypass, Folio BI y Autenticación: el motivo decide si el “No” es crítico" />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 pb-5 md:grid-cols-2">
        {lista.map((m) => (
          <div key={m.key}>
            <p className="text-[13.5px] font-semibold">
              {m.topico} <span className="font-normal text-ink-2">· {m.fallas} “No”</span>
            </p>
            {m.fallas ? (
              <ListaBarras
                max={Math.max(1, m.fallas)}
                filas={[
                  ...m.porMotivo.map((x) => ({ id: x.label, etiqueta: x.critico ? `${x.label} (crítico)` : x.label, valor: x.n, texto: num(x.n), color: x.critico ? 'var(--bad)' : 'var(--series-1)' })),
                  ...(m.sinMotivo ? [{ id: 'sin', etiqueta: 'Sin motivo registrado (histórico)', valor: m.sinMotivo, texto: num(m.sinMotivo), color: 'var(--ink-3)' }] : []),
                ]}
              />
            ) : (
              <p className="py-2 text-[12.5px] text-ink-3">Sin incumplimientos en el periodo.</p>
            )}
          </div>
        ))}
      </div>
    </Tarjeta>
  )
}

function MonitoreoProceso({ evals }: { evals: Evaluacion[] }) {
  const { db, rango } = useVista()
  const procesos = db.config.procesosMonitoreo
  const tipos = cedulasDeCanal(db.catalogo, 'Monitoreo').flatMap((c) => c.tiposLlamada ?? [])
  const semanas = rango.mes ? Array.from({ length: semanaDelMes(ultimoDiaMes(rango.mes)) }, (_, i) => i + 1) : []
  const encabezados = matrizProcesoTipo([], procesos, tipos).columnas.map((c) => c.etiqueta)
  const Tabla = ({ titulo, lista }: { titulo: string; lista: Evaluacion[] }) => (
    <>
      <tr className="border-t border-line-strong bg-surface-2/50">
        <td colSpan={encabezados.length + 1} className="px-5 py-1.5 text-[12px] font-semibold text-ink-2">
          {titulo}
        </td>
      </tr>
      {matrizProcesoTipo(lista, procesos, tipos).filas.map((r) => (
        <tr key={r.proceso} className="border-t border-line">
          <td className="px-5 py-1.5 font-medium">{r.proceso}</td>
          {r.celdas.map((c, i) => (
            <Celda key={i} v={c.promedio} n={c.n}>
              {pct(c.promedio)} <span className="font-normal text-ink-2">({c.n})</span>
            </Celda>
          ))}
        </tr>
      ))}
    </>
  )
  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoTarjeta titulo="Monitoreo por proceso y tipo de llamada" subtitulo="Promedio (evaluaciones). El promedio de fraude es el real de todas las llamadas de fraude, no el promedio de dos promedios." />
      <div className="desplazable overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Proceso</th>
              {encabezados.map((h) => (
                <th key={h} className="px-2 pb-2 text-center font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Tabla titulo={rango.etiqueta} lista={evals} />
            {semanas.map((s) => {
              const l = evals.filter((e) => e.semana === s)
              return l.length ? <Tabla key={s} titulo={`Semana ${s}`} lista={l} /> : null
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

function Distribucion({ evals }: { evals: Evaluacion[] }) {
  const d = distribucion(evals)
  const dur = promedio(evals.map((e) => e.duracionSeg))
  return (
    <Tarjeta>
      <EncabezadoTarjeta titulo="Distribución de calificaciones" subtitulo={`Número de evaluaciones por rango · duración promedio de llamada ${duracion(dur === null ? null : Math.round(dur))}`} />
      <div className="px-5 pb-5">
        <GraficaColumnas
          datos={d.map((b, i) => ({ etiqueta: b.etiqueta, valor: b.n, color: i === 0 ? 'var(--bad)' : i < 3 ? 'var(--bad)' : i === 3 ? 'var(--warn)' : 'var(--good)', detalle: `${b.n} evaluaciones` }))}
          formato={(v) => num(v)}
          alto={210}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Insignia tono="rojo">Debajo del umbral o crítico</Insignia>
          <Insignia tono="ambar">En riesgo</Insignia>
          <Insignia tono="verde">En meta</Insignia>
        </div>
      </div>
    </Tarjeta>
  )
}
