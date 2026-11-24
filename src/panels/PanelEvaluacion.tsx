import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleSlash, FileSpreadsheet, MessageSquareText, Pencil, Printer, ShieldAlert, Trash2, X } from 'lucide-react'
import { useDb, store } from '../lib/store'
import { abrirPanel, cerrarPanel, ir } from '../lib/router'
import { bloquesDeCedula, cedulaPorId } from '../lib/catalog'
import { calificarEvaluacion, semaforoDe, etiquetaResultado } from '../lib/scoring'
import { derivarPlanes, fechaFeedback, limiteFeedback, tieneHallazgo } from '../lib/plans'
import { historialDe } from '../lib/actividad'
import { diaLocal, fechaHora, fechaLarga, fechaMedia, hoyIso } from '../lib/dates'
import { duracion, pct } from '../lib/format'
import { crearDocumento } from '../documents/plantillas'
import { HojaEvaluacion } from '../documents/HojaEvaluacion'
import { Hoja } from '../components/Hoja'
import { Anillo } from '../components/charts'
import { avisar, confirmar } from '../components/feedback'
import { BotonIcono, Boton, Dato, EstadoPlanPill, Insignia, Interruptor, NivelBadge, SemaforoPill, colorPuntaje, cx } from '../components/ui'
import { BotonCrearDoc, FilaDocumento, Grupo, Historial, Seccion } from './comunes'
import type { TipoDoc } from '../lib/types'

export function PanelEvaluacion({ id, profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const db = useDb()
  const ev = db.evaluaciones.find((e) => e.id === id)
  const [soloFallas, setSoloFallas] = useState(false)
  const [imprimiendo, setImprimiendo] = useState(false)
  const derivados = useMemo(() => derivarPlanes(db, hoyIso()), [db])
  if (!ev)
    return (
      <Hoja titulo="Evaluación no encontrada" onCerrar={cerrarPanel} profundidad={profundidad} arriba={arriba}>
        <p className="text-[14px] text-ink-2">La evaluación se eliminó o no existe.</p>
      </Hoja>
    )
  const cfg = db.config
  const ced = cedulaPorId(db.catalogo, ev.cedulaId)
  const calif = calificarEvaluacion(ev, db.catalogo)
  const info = derivados.info.get(ev.id)
  const plan = derivados.planPorEval.get(ev.id)
  const docs = db.documentos.filter((d) => d.evaluacionId === ev.id)
  const bloques = bloquesDeCedula(db.catalogo, ev.cedulaId)
  const semaforo = semaforoDe(ev.puntaje, ev.critico, cfg)
  const agente = db.agentes.find((a) => a.id === ev.agenteId)
  const fbFecha = fechaFeedback(ev, docs)
  const fbPorFirma = !ev.feedback && !!fbFecha
  const conHallazgo = tieneHallazgo(ev)
  const limiteFb = limiteFeedback(ev)
  const fbTarde = conHallazgo && !fbFecha && hoyIso() > limiteFb
  const historial = historialDe(db, [{ tipo: 'evaluacion', id: ev.id }, { tipo: 'plan', id: ev.id }, ...docs.map((d) => ({ tipo: 'documento', id: d.id }))])

  const generar = async (tipo: TipoDoc) => {
    try {
      const doc = await crearDocumento(tipo, db, ev, plan)
      abrirPanel('doc', doc.id)
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo generar', texto: String(err) })
    }
  }

  const eliminar = async () => {
    const ok = await confirmar({
      titulo: `¿Eliminar ${ev.folio}?`,
      texto: `Se eliminarán la evaluación${docs.length ? ` y ${docs.length} documento(s) asociados` : ''}. El plan de acción y los indicadores se recalcularán.`,
      confirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    await store.op('evaluacion.eliminar', { id: ev.id })
    cerrarPanel()
    avisar({ tipo: 'info', titulo: `${ev.folio} eliminada` })
  }

  const imprimir = () => {
    setImprimiendo(true)
    setTimeout(() => {
      window.print()
      setImprimiendo(false)
    }, 60)
  }

  return (
    <Hoja
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      encabezado={
        <div>
          <p className="text-[12.5px] font-medium text-ink-2">
            {ev.folio} · {ev.canal === 'Inbound' ? 'Inbound' : `Monitoreo · ${ev.proceso}`}
          </p>
          <h2 className="truncate text-[19px] font-semibold tracking-[-0.018em]">{ced?.nombre ?? ev.tipoLlamada}</h2>
        </div>
      }
      acciones={
        <>
          <BotonIcono etiqueta="Imprimir evaluación" onClick={imprimir}>
            <Printer className="size-[18px]" />
          </BotonIcono>
          <BotonIcono etiqueta="Editar" onClick={() => ir('evaluar', { sub: ev.id })}>
            <Pencil className="size-[18px]" />
          </BotonIcono>
          <BotonIcono etiqueta="Eliminar" onClick={eliminar} className="hover:text-bad-ink">
            <Trash2 className="size-[18px]" />
          </BotonIcono>
        </>
      }
    >
      <div className="flex items-center gap-5">
        <Anillo valor={ev.puntaje} color={colorPuntaje(ev.puntaje, ev.critico, cfg.meta, cfg.umbralRojo)} tam={96} grosor={9}>
          <span className="text-[22px] font-bold tracking-[-0.02em]">{pct(ev.puntaje)}</span>
        </Anillo>
        <div className="min-w-0 flex-1">
          <SemaforoPill estado={semaforo} critico={ev.critico} />
          <p className="mt-1.5 text-[13px] text-ink-2">
            {etiquetaResultado(ev.puntaje, ev.critico, cfg)} · Sí {calif.si} · No {calif.no} de {calif.posibles} pts
          </p>
          <button onClick={() => abrirPanel('ag', ev.agenteId)} className="mt-1 block max-w-full truncate text-left text-[15px] font-semibold hover:text-accent-ink">
            {ev.agenteNombre}
          </button>
          <p className="text-[12.5px] text-ink-2">
            {ev.agenteId}
            {agente && agente.proceso !== ev.canal ? ` · ${agente.proceso}` : ''}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] bg-surface-2/70 p-4 sm:grid-cols-3">
        <Dato etiqueta="Fecha de evaluación" valor={`${fechaMedia(ev.fechaEvaluacion)} · Sem ${ev.semana}`} />
        <Dato etiqueta="Fecha de la llamada" valor={fechaMedia(ev.fechaLlamada)} />
        <Dato etiqueta="Duración" valor={duracion(ev.duracionSeg)} />
        <Dato etiqueta="ID cliente / caso" valor={ev.idCaso || '—'} />
        <Dato etiqueta="Analista" valor={ev.analista} />
        <Dato etiqueta="Tipo de auditoría" valor={ev.tipoAuditoria ?? 'AUDIO Y PROCESOS'} />
        {ev.canal === 'Monitoreo' && <Dato etiqueta="Tipo de llamada" valor={ev.tipoLlamada} />}
      </dl>

      <Seccion titulo="Plan de acción">
        {plan ? (
          <button onClick={() => abrirPanel('plan', ev.id)} className="w-full rounded-[14px] bg-surface-2/70 p-4 text-left transition-colors hover:bg-hover">
            <div className="flex flex-wrap items-center gap-2">
              <NivelBadge nivel={plan.nivel} />
              <EstadoPlanPill estado={plan.estado} />
              {plan.reincidencia > 0 && <Insignia tono="violeta">Reincidencia {plan.reincidencia + 1}.ª vez</Insignia>}
            </div>
            <p className="mt-2 text-[13px] leading-snug text-ink-2">{plan.ruta.accion}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              Compromiso: <span className="font-semibold text-ink">{fechaMedia(plan.compromiso)}</span> · Verificación {plan.verificaciones.filter((v) => v.pasa).length}/3 · Abrir plan ›
            </p>
          </button>
        ) : (
          <p className="rounded-[14px] bg-good-soft px-4 py-3 text-[13px] text-good-ink">{info?.nivel === 0 ? 'Nivel 0 · Preventivo: en meta y sin errores críticos. No requiere plan.' : 'Sin plan de acción.'}</p>
        )}
      </Seccion>

      <Seccion titulo="Retroalimentación y documentos">
        <Grupo>
          {docs.map((d) => (
            <FilaDocumento key={d.id} doc={d} />
          ))}
          {!docs.some((d) => d.tipo === 'retro' && !d.anulado) && <BotonCrearDoc tipo="retro" onClick={() => generar('retro')} />}
          {plan && plan.nivel >= 3 && !docs.some((d) => d.tipo === (plan.nivel === 3 ? 'carta' : 'acta') && !d.anulado) && (
            <BotonCrearDoc tipo={plan.nivel === 3 ? 'carta' : 'acta'} onClick={() => generar(plan.nivel === 3 ? 'carta' : 'acta')} />
          )}
        </Grupo>
        <div className={cx('mt-2 flex items-center justify-between gap-3 rounded-[14px] px-4 py-3', fbTarde ? 'bg-bad-soft' : 'bg-surface-2/70')}>
          <div className="flex min-w-0 items-center gap-3">
            <MessageSquareText className={cx('size-5 shrink-0', fbTarde ? 'text-bad-ink' : 'text-ink-2')} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium">Feedback entregado al ejecutivo</p>
              <p className={cx('text-[12px]', fbTarde ? 'font-medium text-bad-ink' : 'text-ink-2')}>
                {ev.feedback
                  ? `${fechaHora(ev.feedback.fecha)}${ev.feedback.por ? ` · ${ev.feedback.por}` : ''}${diaLocal(ev.feedback.fecha) > limiteFb && conHallazgo ? ' · fuera de plazo' : ''}`
                  : fbPorFirma
                    ? `Registrado con la firma del colaborador en la retroalimentación (${fechaMedia(fbFecha)})`
                    : !conHallazgo
                      ? 'Sin incumplimientos: el feedback es reconocimiento (opcional para el KPI).'
                      : fbTarde
                        ? `Fuera de plazo: vencía el ${fechaMedia(limiteFb)} (${ev.critico ? '24 h por error crítico' : '48 h'}).`
                        : `Plazo: ${fechaMedia(limiteFb)} (${ev.critico ? '24 h por error crítico' : '48 h'}). Se registra solo al firmar el colaborador.`}
              </p>
            </div>
          </div>
          <Interruptor
            etiqueta="Feedback entregado"
            activo={!!ev.feedback || fbPorFirma}
            deshabilitado={fbPorFirma}
            onChange={(v) => void store.op('evaluacion.feedback', { id: ev.id, fecha: v ? new Date().toISOString() : null })}
          />
        </div>
      </Seccion>

      <Seccion
        titulo={`Rubros (${calif.aplicables})`}
        accion={
          <button className="text-[12.5px] font-medium text-accent-ink hover:underline" onClick={() => setSoloFallas((v) => !v)}>
            {soloFallas ? 'Ver todos' : `Solo incumplimientos (${calif.fallas.length})`}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {bloques.map((g) => {
            const items = g.items.filter((it) => !soloFallas || ev.respuestas[it.key] === 'N')
            if (!items.length) return null
            return (
              <Grupo key={g.bloque}>
                <p className="px-3.5 pt-2.5 pb-1 text-[12px] font-semibold text-ink-2">{g.bloque}</p>
                {items.map((it) => {
                  const r = ev.respuestas[it.key]
                  const critico = calif.criticos.includes(it.key)
                  return (
                    <div key={it.key} className={cx('border-t border-line px-3.5 py-2.5', r === 'N' && 'bg-bad-soft/50')}>
                      <div className="flex items-start gap-3">
                        <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
                          {it.def.topico}
                          <span className="ml-1.5 text-[11.5px] text-ink-3 tabular">{ev.pesos[it.key] ?? it.peso} pts</span>
                        </span>
                        {r === 'S' ? (
                          <Insignia tono="verde" icono={<Check className="size-3" />}>
                            Cumple
                          </Insignia>
                        ) : r === 'N' ? (
                          <Insignia tono="rojo" icono={critico ? <ShieldAlert className="size-3" /> : <X className="size-3" />}>
                            {critico ? 'No · crítico' : 'No cumple'}
                          </Insignia>
                        ) : r === 'A' ? (
                          <Insignia tono="neutro" icono={<CircleSlash className="size-3" />}>
                            N/A
                          </Insignia>
                        ) : (
                          <Insignia tono="ambar">Sin respuesta</Insignia>
                        )}
                      </div>
                      {r === 'N' && (ev.motivos[it.key] || ev.areas[it.key] || (it.def.motivos?.length && ev.origen?.tipo === 'excel')) && (
                        <p className="mt-1 text-[12.5px] text-ink-2">
                          {ev.motivos[it.key] ? <span className="font-medium text-ink">Motivo: {ev.motivos[it.key]}. </span> : it.def.motivos?.length ? <span>Motivo no registrado en Excel (no se trató como crítico). </span> : null}
                          {ev.areas[it.key]}
                        </p>
                      )}
                    </div>
                  )
                })}
              </Grupo>
            )
          })}
        </div>
      </Seccion>

      {ev.observaciones && (
        <Seccion titulo="Observaciones">
          <p className="rounded-[14px] bg-surface-2/70 px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-line">{ev.observaciones}</p>
        </Seccion>
      )}

      {ev.origen?.tipo === 'excel' && (
        <Seccion titulo="Origen">
          <div className="rounded-[14px] bg-surface-2/70 px-4 py-3 text-[12.5px] text-ink-2">
            <p className="flex items-center gap-1.5">
              <FileSpreadsheet className="size-4 text-good-ink" />
              Migrada de <span className="font-medium text-ink">{ev.origen.archivo}</span>, fila {ev.origen.fila} (folio Excel {String(ev.origen.folioExcel ?? '—')}).
            </p>
            {typeof ev.origen.promedioExcel === 'number' && (
              <p className="mt-1">
                Calificación en Excel {pct(ev.origen.promedioExcel)} · en el portal {pct(ev.puntaje)} {Math.abs(ev.origen.promedioExcel - (ev.puntaje ?? -1)) < 1e-9 ? '✓ coinciden' : '⚠ difieren'}
              </p>
            )}
            {ev.notasMigracion?.map((n) => (
              <p key={n} className="mt-1">
                • {n}
              </p>
            ))}
          </div>
        </Seccion>
      )}
      <Seccion titulo="Historial">
        <Historial entradas={historial} vacio={ev.origen?.tipo === 'excel' ? 'Migrada desde Excel: sin movimientos en el portal todavía.' : 'Sin movimientos registrados.'} />
      </Seccion>

      <p className="mt-6 text-center text-[11.5px] text-ink-3">
        Registrada {fechaLarga(diaLocal(ev.creadoEn))}
        {ev.creadoPor ? ` por ${ev.creadoPor}` : ''}
      </p>
      <div className="mt-3 flex justify-center gap-2 md:hidden">
        <Boton tam="sm" onClick={() => ir('evaluar', { sub: ev.id })}>
          Editar
        </Boton>
      </div>
      {imprimiendo &&
        createPortal(
          <div className="zona-impresion solo-impresion">
            <HojaEvaluacion db={db} ev={ev} />
          </div>,
          document.body,
        )}
    </Hoja>
  )
}
