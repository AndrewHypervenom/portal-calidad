import { useMemo, useState } from 'react'
import { Archive, CheckCircle2, Circle, Download, FileSignature, History, Search, ShieldAlert, Target, XCircle } from 'lucide-react'
import type { TipoDoc } from '../lib/types'
import { useVista } from '../lib/vista'
import { store } from '../lib/store'
import { abrirPanel, ir, setParams, useRuta } from '../lib/router'
import { planAbierto, ETIQUETA_ESTADO, type EstadoPlan, type Plan } from '../lib/plans'
import { diaLocal, fechaCorta, fechaMedia } from '../lib/dates'
import { nombreCorto, normalizar, num } from '../lib/format'
import { exportarLibro } from '../lib/excel'
import { NOMBRE_DOC, NOMBRE_DOC_CORTO, camposFaltantes, estadoFirmas } from '../documents/reglas'
import { ETIQUETA_SEMAFORO } from '../lib/scoring'
import { EncabezadoPagina } from '../components/Layout'
import { avisar, confirmar } from '../components/feedback'
import { Boton, Entrada, EstadoPlanPill, Insignia, NivelBadge, Puntaje, Segmentado, Tarjeta, Vacio, cx } from '../components/ui'

type FiltroPlan = 'abiertos' | 'vencido' | 'verificacion' | 'pendiente' | 'reincide' | 'cerrado' | 'historico' | 'todos'

export function Seguimiento() {
  const ruta = useRuta()
  const sub = ruta.sub === 'documentos' ? 'documentos' : 'planes'
  const { db } = useVista()
  const porFirmar = db.documentos.filter((d) => !d.anulado && !estadoFirmas(d).completo).length
  return (
    <div>
      <EncabezadoPagina
        titulo="Planes y actas"
        subtitulo={sub === 'planes' ? 'Se generan solos con cada evaluación debajo de la meta, con error crítico o reincidencia' : 'Retroalimentaciones, cartas de compromiso y actas administrativas con firma digital'}
        acciones={
          <Segmentado
            valor={sub}
            onChange={(v) => ir('seguimiento', { sub: v === 'documentos' ? 'documentos' : null })}
            opciones={[
              { valor: 'planes', etiqueta: 'Planes de acción' },
              { valor: 'documentos', etiqueta: porFirmar ? `Documentos · ${porFirmar} por firmar` : 'Documentos' },
            ]}
          />
        }
      />
      {sub === 'planes' ? <Planes /> : <Documentos />}
    </div>
  )
}

function Puntos({ plan }: { plan: Plan }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Verificación ${plan.verificaciones.filter((v) => v.pasa).length} de 3`}>
      {[0, 1, 2].map((i) => {
        const v = plan.verificaciones[i]
        if (!v) return <Circle key={i} className="size-3.5 text-ink-3" />
        return v.pasa ? <CheckCircle2 key={i} className="size-3.5 text-good-ink" /> : <XCircle key={i} className="size-3.5 text-bad-ink" />
      })}
    </span>
  )
}

function Planes() {
  const { db, derivados, rango, canal } = useVista()
  const ruta = useRuta()
  const filtro = (ruta.params.get('estado') ?? 'abiertos') as FiltroPlan
  const q = ruta.params.get('q') ?? ''
  const nivelF = ruta.params.get('nivel') ?? ''
  const [ocupado, setOcupado] = useState(false)

  const delCanal = useMemo(() => derivados.planes.filter((p) => canal === 'todos' || p.ev.canal === canal), [derivados.planes, canal])
  const enPeriodo = (p: Plan) => p.ev.fechaEvaluacion >= rango.desde && p.ev.fechaEvaluacion <= rango.hasta
  const abiertos = delCanal.filter(planAbierto)
  const historicos = delCanal.filter((p) => p.estado === 'historico')
  const conteo = (e: EstadoPlan) => delCanal.filter((p) => p.estado === e && (planAbierto(p) || enPeriodo(p))).length

  const lista = useMemo(() => {
    const n = normalizar(q)
    return delCanal.filter((p) => {
      if (filtro === 'abiertos' && !planAbierto(p)) return false
      if (filtro === 'historico' && p.estado !== 'historico') return false
      if (!['abiertos', 'todos', 'historico'].includes(filtro) && p.estado !== filtro) return false
      if (!planAbierto(p) && filtro !== 'historico' && !enPeriodo(p)) return false
      if (nivelF && String(p.nivel) !== nivelF) return false
      if (n && !normalizar(`${p.ev.agenteNombre} ${p.ev.agenteId} ${p.ev.folio} ${p.fallas.map((f) => f.topico).join(' ')}`).includes(n)) return false
      return true
    })
  }, [delCanal, filtro, q, nivelF, rango])

  const retomarTodos = async () => {
    const ok = await confirmar({
      titulo: `¿Retomar ${historicos.length} planes del histórico?`,
      texto: 'Pasarán a seguimiento normal: se marcarán como vencidos si su fecha compromiso ya pasó, hasta que registres la acción o se cierren con 3 auditorías en meta.',
      confirmar: 'Retomar',
    })
    if (!ok) return
    setOcupado(true)
    try {
      for (const p of historicos) await store.op('seguimiento.actualizar', { evaluacionId: p.id, retomado: new Date().toISOString() })
      avisar({ tipo: 'exito', titulo: 'Planes retomados', texto: `${historicos.length} planes en seguimiento` })
    } finally {
      setOcupado(false)
    }
  }

  const exportar = () =>
    void exportarLibro('planes-de-accion', [
      {
        nombre: 'Planes de acción',
        filas: lista.map((p) => ({
          'Fecha detección': p.ev.fechaEvaluacion,
          Folio: p.ev.folio,
          Agente: p.ev.agenteNombre,
          Canal: p.ev.canal === 'Inbound' ? 'Inbound' : p.ev.proceso,
          'Supervisor op.': db.agentes.find((a) => a.id === p.ev.agenteId)?.supervisor || db.config.supervisorOperaciones,
          'Analista calidad': p.ev.analista,
          Calificación: p.ev.puntaje,
          'Ítems': p.fallas.map((f) => f.topico).join('; '),
          '¿Crítico?': p.ev.critico ? 'Sí' : 'No',
          'Causa raíz': p.seguimiento?.causa ?? '',
          'Reincid. 30 días': p.reincidencia,
          Semáforo: p.ev.critico ? 'Error crítico' : p.semaforo ? ETIQUETA_SEMAFORO[p.semaforo] : '',
          Nivel: p.nivel,
          'Acción asignada (ruta)': `${p.ruta.nombre}: ${p.ruta.accion}`,
          'Fecha compromiso': p.compromiso,
          'Verif. 1': p.verificaciones[0]?.ev.puntaje ?? '',
          'Verif. 2': p.verificaciones[1]?.ev.puntaje ?? '',
          'Verif. 3': p.verificaciones[2]?.ev.puntaje ?? '',
          Estado: ETIQUETA_ESTADO[p.estado],
          'Días abiertos': p.diasAbiertos,
          'Fecha cierre': p.fechaCierre ?? '',
        })),
      },
    ])

  const chips: { f: FiltroPlan; etiqueta: string; n: number; tono?: string }[] = [
    { f: 'abiertos', etiqueta: 'Abiertos', n: abiertos.length },
    { f: 'vencido', etiqueta: 'Vencidos', n: conteo('vencido'), tono: 'text-bad-ink' },
    { f: 'pendiente', etiqueta: 'Acción pendiente', n: conteo('pendiente'), tono: 'text-warn-ink' },
    { f: 'verificacion', etiqueta: 'En verificación', n: conteo('verificacion'), tono: 'text-info-ink' },
    { f: 'reincide', etiqueta: 'Reincidieron', n: conteo('reincide'), tono: 'text-violet' },
    { f: 'cerrado', etiqueta: 'Cerrados', n: conteo('cerrado'), tono: 'text-good-ink' },
    ...(historicos.length ? [{ f: 'historico' as FiltroPlan, etiqueta: 'Histórico', n: historicos.length }] : []),
    { f: 'todos', etiqueta: 'Todos', n: delCanal.filter((p) => planAbierto(p) || enPeriodo(p)).length },
  ]

  return (
    <>
      <div className="anim-aparecer mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {chips.map((c) => (
          <button
            key={c.f}
            onClick={() => setParams({ estado: c.f === 'abiertos' ? null : c.f })}
            className={cx('card flex flex-col items-start px-3.5 py-3 text-left transition-[box-shadow,transform] duration-200', filtro === c.f ? 'shadow-[0_0_0_2px_var(--accent)]' : 'hover:-translate-y-0.5')}
          >
            <span className={cx('text-[22px] leading-none font-bold tracking-[-0.02em] tabular', c.tono)}>{c.n}</span>
            <span className="mt-1 text-[12px] font-medium text-ink-2">{c.etiqueta}</span>
          </button>
        ))}
      </div>

      {historicos.length > 0 && filtro !== 'historico' && (
        <div className="mb-4 flex flex-col gap-3 rounded-[16px] bg-surface px-4 py-3 shadow-card sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <History className="mt-0.5 size-5 shrink-0 text-ink-2 sm:mt-0" />
            <p className="min-w-0 flex-1 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">{historicos.length} planes vienen del Excel</span> sin registro de feedback ni acciones. No se cuentan como vencidos hasta que decidas retomarlos.
            </p>
          </div>
          <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
            <Boton tam="sm" onClick={() => setParams({ estado: 'historico' })}>
              Ver
            </Boton>
            <Boton tam="sm" variante="tinte" onClick={retomarTodos} cargando={ocupado}>
              Retomar seguimiento
            </Boton>
          </div>
        </div>
      )}

      <Tarjeta className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar ejecutivo, folio o rubro…" value={q} onChange={(e) => setParams({ q: e.target.value })} className="min-w-[220px] flex-1" />
          <Segmentado
            tam="sm"
            valor={nivelF}
            onChange={(v) => setParams({ nivel: v || null })}
            opciones={[
              { valor: '', etiqueta: 'Todos los niveles' },
              { valor: '1', etiqueta: 'N1' },
              { valor: '2', etiqueta: 'N2' },
              { valor: '3', etiqueta: 'N3' },
              { valor: '4', etiqueta: 'N4' },
            ]}
          />
          <Boton tam="sm" icono={<Download className="size-4" />} onClick={exportar}>
            Excel
          </Boton>
        </div>
      </Tarjeta>

      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<Target />} titulo={filtro === 'abiertos' ? 'Sin planes abiertos' : 'Sin planes para este filtro'} texto="Los planes se crean solos al guardar evaluaciones debajo de la meta, con error crítico o con reincidencia." />
        </Tarjeta>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="desplazable overflow-x-auto">
            <table className="w-full min-w-[1020px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Ejecutivo</th>
                  <th className="px-3 pb-2 font-medium">Detectado</th>
                  <th className="px-3 pb-2 font-medium">Calif.</th>
                  <th className="px-3 pb-2 font-medium">Rubro principal</th>
                  <th className="px-3 pb-2 font-medium">Nivel</th>
                  <th className="px-3 pb-2 font-medium">Compromiso</th>
                  <th className="px-3 pb-2 font-medium">Verificación</th>
                  <th className="px-3 pb-2 font-medium">Estado</th>
                  <th className="px-3 pr-5 pb-2 font-medium">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} onClick={() => abrirPanel('plan', p.id)} className="cursor-pointer border-t border-line transition-colors hover:bg-hover">
                    <td className="max-w-[220px] py-2.5 pr-3 pl-5">
                      <p className="truncate font-medium">{p.ev.agenteNombre}</p>
                      <p className="truncate text-[11.5px] text-ink-3">
                        {p.ev.agenteId} · {p.ev.canal === 'Inbound' ? 'Inbound' : p.ev.proceso}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p>{fechaCorta(p.ev.fechaEvaluacion)}</p>
                      <p className="text-[11.5px] text-ink-3">{p.ev.folio}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Puntaje valor={p.ev.puntaje} critico={p.ev.critico} meta={db.config.meta} umbral={db.config.umbralRojo} />
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      <p className="flex items-center gap-1 truncate">
                        {p.fallas[0]?.critico && <ShieldAlert className="size-3.5 shrink-0 text-bad-ink" />}
                        <span className="truncate">{p.fallas[0]?.topico ?? 'Debajo de la meta'}</span>
                      </p>
                      <p className="text-[11.5px] text-ink-3">
                        {p.fallas.length > 1 ? `+${p.fallas.length - 1} rubro${p.fallas.length > 2 ? 's' : ''}` : ''}
                        {p.reincidencia > 0 ? `${p.fallas.length > 1 ? ' · ' : ''}${p.reincidencia + 1}.ª vez en 30 días` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <NivelBadge nivel={p.nivel} corto />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className={cx(p.estado === 'vencido' && 'font-semibold text-bad-ink')}>{fechaCorta(p.compromiso)}</p>
                      <p className="text-[11.5px] text-ink-3">{p.accionFecha ? `Acción ${fechaCorta(p.accionFecha)}` : planAbierto(p) ? (p.diasParaCompromiso < 0 ? `hace ${-p.diasParaCompromiso} d` : `en ${p.diasParaCompromiso} d`) : ''}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Puntos plan={p} />
                    </td>
                    <td className="px-3 py-2.5">
                      <EstadoPlanPill estado={p.estado} />
                    </td>
                    <td className="px-3 py-2.5 pr-5">
                      <span className="flex flex-wrap gap-1">
                        {p.docsRequeridos.map((t) => {
                          const d = p.documentos.find((x) => x.tipo === t)
                          const f = d ? estadoFirmas(d) : null
                          return (
                            <Insignia key={t} title={NOMBRE_DOC[t]} tono={!d ? 'neutro' : f?.completo ? 'verde' : 'azul'} icono={<FileSignature className="size-3" />}>
                              {NOMBRE_DOC_CORTO[t]}
                              {d && !f?.completo ? ` ${f?.firmadas}/${f?.total}` : ''}
                            </Insignia>
                          )
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
            {num(lista.length)} planes · los abiertos se muestran sin importar el periodo · verificación = siguientes 3 auditorías del ejecutivo.
          </p>
        </Tarjeta>
      )}
    </>
  )
}

function Documentos() {
  const { db } = useVista()
  const ruta = useRuta()
  const tipo = (ruta.params.get('tipo') ?? '') as TipoDoc | ''
  const est = ruta.params.get('firma') ?? ''
  const q = ruta.params.get('q') ?? ''
  const lista = useMemo(() => {
    const n = normalizar(q)
    return db.documentos
      .filter((d) => (!tipo || d.tipo === tipo) && (!n || normalizar(`${d.folio} ${d.agenteNombre} ${d.agenteId}`).includes(n)))
      .filter((d) => {
        const f = estadoFirmas(d)
        if (est === 'pendiente') return !d.anulado && !f.completo
        if (est === 'firmado') return !d.anulado && f.completo
        if (est === 'anulado') return !!d.anulado
        return true
      })
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  }, [db.documentos, tipo, est, q])

  return (
    <>
      <Tarjeta className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar folio o ejecutivo…" value={q} onChange={(e) => setParams({ q: e.target.value })} className="min-w-[220px] flex-1" />
          <Segmentado<TipoDoc | ''>
            tam="sm"
            valor={tipo}
            onChange={(v) => setParams({ tipo: v || null })}
            opciones={[
              { valor: '', etiqueta: 'Todos' },
              { valor: 'retro', etiqueta: 'Retroalimentación' },
              { valor: 'carta', etiqueta: 'Cartas' },
              { valor: 'acta', etiqueta: 'Actas' },
            ]}
          />
          <Segmentado
            tam="sm"
            valor={est}
            onChange={(v) => setParams({ firma: v || null })}
            opciones={[
              { valor: '', etiqueta: 'Cualquier estado' },
              { valor: 'pendiente', etiqueta: 'Por firmar' },
              { valor: 'firmado', etiqueta: 'Firmados' },
              { valor: 'anulado', etiqueta: 'Anulados' },
            ]}
          />
        </div>
      </Tarjeta>
      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={<Archive />}
            titulo="Sin documentos"
            texto="Se generan solos al guardar una evaluación que requiere plan (nivel 1 o mayor). También puedes generarlos desde el detalle de cualquier evaluación."
          />
        </Tarjeta>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="desplazable overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-2">
                  <th className="px-5 pb-2 font-medium">Folio</th>
                  <th className="px-3 pb-2 font-medium">Documento</th>
                  <th className="px-3 pb-2 font-medium">Ejecutivo</th>
                  <th className="px-3 pb-2 font-medium">Evaluación</th>
                  <th className="px-3 pb-2 font-medium">Creado</th>
                  <th className="px-3 pr-5 pb-2 font-medium">Firmas</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => {
                  const f = estadoFirmas(d)
                  const ev = db.evaluaciones.find((e) => e.id === d.evaluacionId)
                  return (
                    <tr key={d.id} onClick={() => abrirPanel('doc', d.id)} className={cx('cursor-pointer border-t border-line transition-colors hover:bg-hover', d.anulado && 'opacity-55')}>
                      <td className="px-5 py-2.5 font-medium tabular">{d.folio}</td>
                      <td className="px-3 py-2.5">{NOMBRE_DOC[d.tipo]}</td>
                      <td className="px-3 py-2.5">{nombreCorto(d.agenteNombre)}</td>
                      <td className="px-3 py-2.5 text-ink-2">{ev ? `${ev.folio} · ${fechaCorta(ev.fechaEvaluacion)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-ink-2">{fechaMedia(diaLocal(d.creadoEn))}</td>
                      <td className="px-3 py-2.5 pr-5">
                        <span className="flex flex-wrap items-center gap-1">
                          {d.anulado ? <Insignia>Anulado</Insignia> : f.completo ? <Insignia tono="verde">Firmado</Insignia> : <Insignia tono={f.firmadas ? 'ambar' : 'azul'}>{`${f.firmadas} de ${f.total}`}</Insignia>}
                          {!d.anulado && !f.firmadas && camposFaltantes(d, ev).length > 0 && <Insignia tono="ambar">Falta llenar</Insignia>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </>
  )
}
