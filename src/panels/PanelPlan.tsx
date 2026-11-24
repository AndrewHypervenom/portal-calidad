import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Lock, RotateCcw, ShieldAlert, XCircle } from 'lucide-react'
import type { Causa, TipoDoc } from '../lib/types'
import { useVista } from '../lib/vista'
import { store } from '../lib/store'
import { abrirPanel, cerrarPanel } from '../lib/router'
import { fechaHora, fechaMedia, hoyIso } from '../lib/dates'
import { pct } from '../lib/format'
import { crearDocumento, NOMBRE_DOC } from '../documents/plantillas'
import { historialDe } from '../lib/actividad'
import { Hoja } from '../components/Hoja'
import { avisar, confirmar } from '../components/feedback'
import { AreaTexto, Boton, EstadoPlanPill, Insignia, Interruptor, NivelBadge, Segmentado, cx } from '../components/ui'
import { BotonCrearDoc, FilaDocumento, Grupo, Historial, Seccion } from './comunes'

export function PanelPlan({ id, profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const { db, derivados } = useVista()
  const plan = derivados.planPorEval.get(id)
  const [notas, setNotas] = useState(plan?.seguimiento?.notas ?? '')
  useEffect(() => setNotas(plan?.seguimiento?.notas ?? ''), [plan?.seguimiento?.notas])
  if (!plan)
    return (
      <Hoja titulo="Plan de acción" onCerrar={cerrarPanel} profundidad={profundidad} arriba={arriba}>
        <p className="text-[14px] text-ink-2">Esta evaluación no requiere plan de acción (nivel 0, en meta y sin errores críticos).</p>
      </Hoja>
    )
  const ev = plan.ev
  const seg = plan.seguimiento
  const causaDef = db.modelo.causas.find((c) => c.id === seg?.causa)
  const actualizar = (cambios: Record<string, unknown>) => store.op('seguimiento.actualizar', { evaluacionId: ev.id, ...cambios }).catch((err) => avisar({ tipo: 'error', titulo: 'No se guardó', texto: String(err) }))
  const dias = plan.diasParaCompromiso

  const generar = async (tipo: TipoDoc) => {
    const doc = await crearDocumento(tipo, db, ev, plan)
    abrirPanel('doc', doc.id)
  }

  const cerrarManual = async () => {
    const ok = await confirmar({
      titulo: 'Cerrar el plan manualmente',
      texto: plan.nivel === 4 ? 'Confirma que la decisión quedó documentada (acta firmada / resolución de jefe directo y RR. HH.).' : 'Úsalo solo si el plan se resolvió por otra vía. Lo normal es que se cierre solo con 3 auditorías en meta.',
      confirmar: 'Cerrar plan',
    })
    if (!ok) return
    await actualizar({ cierreManual: { fecha: new Date().toISOString(), motivo: plan.nivel === 4 ? 'Decisión documentada' : 'Cierre manual', por: store.por } })
    avisar({ tipo: 'exito', titulo: 'Plan cerrado' })
  }

  return (
    <Hoja
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      encabezado={
        <div>
          <p className="text-[12.5px] font-medium text-ink-2">
            Plan de acción · {ev.folio} · detectado {fechaMedia(ev.fechaEvaluacion)}
          </p>
          <button onClick={() => abrirPanel('ag', ev.agenteId)} className="block max-w-full truncate text-left text-[19px] font-semibold tracking-[-0.018em] hover:text-accent-ink">
            {ev.agenteNombre}
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <NivelBadge nivel={plan.nivel} />
        <EstadoPlanPill estado={plan.estado} />
        {plan.reincidencia > 0 && <Insignia tono="violeta">Reincidencia: {plan.reincidencia + 1}.ª vez en 30 días</Insignia>}
        {ev.critico && (
          <Insignia tono="rojo" icono={<ShieldAlert className="size-3" />}>
            Error crítico
          </Insignia>
        )}
      </div>

      <div className="mt-4 rounded-[16px] bg-surface-2/70 p-4">
        <p className="text-[12px] font-semibold text-ink-2 uppercase">Acción obligatoria</p>
        <p className="mt-1 text-[14px] leading-snug font-medium">{plan.ruta.accion}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-3">
          <div>
            <p className="text-ink-2">Fecha compromiso</p>
            <p className="font-semibold">{fechaMedia(plan.compromiso)}</p>
            {plan.estado !== 'cerrado' && plan.estado !== 'reincide' && !plan.accionFecha && (
              <p className={cx('font-medium', dias < 0 ? 'text-bad-ink' : dias <= 2 ? 'text-warn-ink' : 'text-ink-2')}>
                {dias < 0 ? `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'Vence hoy' : `Faltan ${dias} día${dias === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
          <div>
            <p className="text-ink-2">Responsable</p>
            <p className="font-medium">{plan.ruta.responsable}</p>
          </div>
          <div>
            <p className="text-ink-2">Evidencia</p>
            <p className="font-medium">{plan.ruta.evidencia}</p>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-2">
          <span className="font-semibold text-ink">Criterio de salida:</span> {plan.ruta.salida}
        </p>
      </div>

      <Seccion titulo="Incumplimientos detectados">
        <Grupo>
          {plan.fallas.map((f) => (
            <div key={f.key} className="flex items-start gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
              {f.critico ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad-ink" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad-ink" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{f.topico}</span>
                <span className="block text-[12px] text-ink-2">
                  {f.bloque}
                  {f.motivo ? ` · ${f.motivo}` : ''}
                  {f.area ? ` · ${f.area}` : ''}
                </span>
              </span>
              {f.reincidencia > 0 && <Insignia tono="violeta">{f.reincidencia + 1}.ª vez</Insignia>}
            </div>
          ))}
          {plan.fallas.length === 0 && <p className="px-3.5 py-3 text-[13px] text-ink-2">Calificación debajo de la meta ({pct(ev.puntaje)}).</p>}
        </Grupo>
      </Seccion>

      <Seccion titulo="Causa raíz">
        <Segmentado<Causa | ''>
          completo
          valor={seg?.causa ?? ''}
          onChange={(c) => void actualizar({ causa: c || null })}
          opciones={[
            { valor: 'SABER', etiqueta: 'Saber' },
            { valor: 'PODER', etiqueta: 'Poder' },
            { valor: 'QUERER', etiqueta: 'Querer' },
          ]}
        />
        {causaDef ? (
          <div className="mt-2 rounded-[14px] bg-surface-2/70 px-4 py-3 text-[12.5px]">
            <p className="font-semibold">{causaDef.pregunta}</p>
            <p className="mt-0.5 text-ink-2">Señales: {causaDef.senales}</p>
            <p className="mt-1 text-ink-2">
              <span className="font-semibold text-ink">Intervención:</span> {causaDef.intervencion}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-ink-2">Elige la causa tras el feedback: ¿no conoce el procedimiento (Saber), no tiene cómo hacerlo (Poder) o decide no hacerlo (Querer)? Con “Querer” y 2 reincidencias el plan sube a nivel 4.</p>
        )}
      </Seccion>

      <Seccion titulo="Seguimiento">
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">Acción realizada</p>
            <p className="text-[12px] text-ink-2">
              {plan.accionFecha
                ? `${fechaMedia(plan.accionFecha)} · ${plan.accionOrigen === 'documento' ? 'por la firma del documento' : plan.accionOrigen === 'feedback' ? 'por el feedback entregado' : 'marcada manualmente'}`
                : 'Se marca sola al firmar el documento del nivel o al registrar el feedback.'}
            </p>
          </div>
          <Interruptor etiqueta="Acción realizada" activo={!!plan.accionFecha} deshabilitado={plan.accionOrigen === 'documento' || plan.accionOrigen === 'feedback'} onChange={(v) => void actualizar({ accionRealizada: v ? hoyIso() : null })} />
        </div>

        <p className="mt-4 mb-2 text-[12.5px] font-medium text-ink-2">Verificación: siguientes 3 auditorías del ejecutivo (en meta, sin crítico y sin repetir el rubro)</p>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const v = plan.verificaciones[i]
            if (!v)
              return (
                <div key={i} className="flex flex-col items-center gap-1 rounded-[14px] border border-dashed border-line-strong px-2 py-3 text-center">
                  <CircleDashed className="size-5 text-ink-3" />
                  <span className="text-[12px] text-ink-2">Pendiente</span>
                </div>
              )
            return (
              <button key={i} onClick={() => abrirPanel('ev', v.ev.id)} className={cx('flex flex-col items-center gap-1 rounded-[14px] px-2 py-3 text-center transition-colors', v.pasa ? 'bg-good-soft hover:brightness-95' : 'bg-bad-soft hover:brightness-95')}>
                {v.pasa ? <CheckCircle2 className="size-5 text-good-ink" /> : <XCircle className="size-5 text-bad-ink" />}
                <span className="text-[13px] font-semibold tabular">{pct(v.ev.puntaje)}</span>
                <span className="text-[11px] text-ink-2">
                  {v.ev.folio} · {v.razon}
                </span>
              </button>
            )
          })}
        </div>
        {plan.estado === 'reincide' && plan.sucesorId && (
          <button onClick={() => abrirPanel('plan', plan.sucesorId!)} className="mt-2 w-full rounded-[12px] bg-violet-soft px-3 py-2 text-left text-[12.5px] font-medium text-violet">
            El ejecutivo volvió a fallar: el seguimiento continúa en el plan de la evaluación siguiente ›
          </button>
        )}
      </Seccion>

      <Seccion titulo="Documentos del nivel">
        <Grupo>
          {plan.documentos.map((d) => (
            <FilaDocumento key={d.id} doc={d} />
          ))}
          {plan.docsFaltantes.map((t) => (
            <BotonCrearDoc key={t} tipo={t} onClick={() => void generar(t)} />
          ))}
          {plan.documentos.length === 0 && plan.docsFaltantes.length === 0 && <p className="px-3.5 py-3 text-[13px] text-ink-2">Este nivel no requiere documentos.</p>}
        </Grupo>
        <p className="mt-1.5 text-[11.5px] text-ink-3">Nivel 1–2: {NOMBRE_DOC.retro}. Nivel 3: además {NOMBRE_DOC.carta.toLowerCase()}. Nivel 4: además {NOMBRE_DOC.acta.toLowerCase()}.</p>
      </Seccion>

      <Seccion titulo="Historial del plan">
        <Historial
          entradas={historialDe(db, [{ tipo: 'plan', id: ev.id }, { tipo: 'evaluacion', id: ev.id }, ...plan.documentos.map((d) => ({ tipo: 'documento', id: d.id }))])}
          vacio={ev.origen?.tipo === 'excel' ? 'Plan migrado desde Excel: sin movimientos en el portal todavía.' : 'Sin movimientos registrados.'}
        />
      </Seccion>

      <Seccion titulo="Notas">
        <AreaTexto rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} onBlur={() => notas !== (seg?.notas ?? '') && void actualizar({ notas })} placeholder="Acuerdos, fechas de refuerzo, escuchas lado a lado…" />
      </Seccion>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {seg?.cierreManual ? (
          <>
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <Lock className="size-3.5" /> Cerrado manualmente {fechaHora(seg.cierreManual.fecha)}
              {seg.cierreManual.por ? ` por ${seg.cierreManual.por}` : ''}
            </p>
            <Boton tam="sm" icono={<RotateCcw className="size-4" />} onClick={() => void actualizar({ cierreManual: null })}>
              Reabrir
            </Boton>
          </>
        ) : plan.estado !== 'cerrado' ? (
          <>
            <p className="text-[12px] text-ink-3">{plan.nivel === 4 ? 'El nivel 4 se cierra con la decisión documentada.' : 'Se cerrará solo con 3 auditorías seguidas en meta.'}</p>
            <Boton tam="sm" onClick={cerrarManual}>
              Cerrar plan
            </Boton>
          </>
        ) : (
          <p className="text-[12.5px] text-good-ink">Cerrado el {fechaMedia(plan.fechaCierre)} tras {plan.diasAbiertos} días.</p>
        )}
      </div>
    </Hoja>
  )
}
