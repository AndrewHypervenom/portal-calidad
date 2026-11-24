import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, CheckCircle2, FileDown, Lock, PenLine, Printer, RotateCcw, Trash2 } from 'lucide-react'
import type { Documento } from '../lib/types'
import { useDb, store } from '../lib/store'
import { abrirPanel, cerrarPanel } from '../lib/router'
import { derivarPlanes } from '../lib/plans'
import { fechaHora, hoyIso } from '../lib/dates'
import { historialDe } from '../lib/actividad'
import { Hoja } from '../components/Hoja'
import { avisar, confirmar } from '../components/feedback'
import { AreaTexto, Boton, BotonIcono, Campo, Entrada, Insignia, Segmentado, cx } from '../components/ui'
import { CAMPOS, FIRMANTES, NOMBRE_DOC, camposFaltantes, camposIniciales, estadoFirmas } from './plantillas'
import { Historial } from '../panels/comunes'
import { Papel } from './Papel'
import { PadFirma } from './PadFirma'
import { descargarWord } from './word'

export function EditorDocumento({ id, profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const db = useDb()
  const doc = db.documentos.find((d) => d.id === id)
  const [campos, setCampos] = useState<Record<string, string>>(doc?.campos ?? {})
  const [firmando, setFirmando] = useState<string | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [vistaMovil, setVistaMovil] = useState<'datos' | 'papel'>('datos')
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimo = useRef(doc?.actualizadoEn)

  useEffect(() => {
    if (doc && doc.actualizadoEn !== ultimo.current) {
      ultimo.current = doc.actualizadoEn
      setCampos(doc.campos)
    }
  }, [doc])

  useEffect(() => {
    if (!firmando) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setFirmando(null)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [firmando])

  const plan = useMemo(() => (doc ? derivarPlanes(db, hoyIso()).planPorEval.get(doc.evaluacionId) : undefined), [db, doc])
  if (!doc)
    return (
      <Hoja titulo="Documento no encontrado" onCerrar={cerrarPanel} profundidad={profundidad} arriba={arriba}>
        <p className="text-[14px] text-ink-2">El documento se eliminó o no existe.</p>
      </Hoja>
    )
  const ev = db.evaluaciones.find((e) => e.id === doc.evaluacionId)
  const firmas = estadoFirmas(doc)
  const bloqueado = firmas.firmadas > 0 || !!doc.anulado
  const faltan = doc.anulado ? [] : camposFaltantes({ ...doc, campos }, ev)
  const historial = historialDe(db, [{ tipo: 'documento', id: doc.id }])
  const vista: Documento = { ...doc, campos }

  const guardar = (nuevos: Record<string, string>) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      void store
        .op<Documento>('documento.guardar', { ...doc, campos: nuevos })
        .then((d) => (ultimo.current = d.actualizadoEn))
        .catch((err) => avisar({ tipo: 'error', titulo: 'No se guardó', texto: String(err) }))
    }, 500)
  }
  const cambiar = (k: string, v: string) => {
    const nuevos = { ...campos, [k]: v }
    setCampos(nuevos)
    guardar(nuevos)
  }

  const firmar = async (firmanteId: string, nombre: string, png: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    const firmasNuevas = { ...(doc.firmas ?? {}), [firmanteId]: { nombre, img: png, fecha: new Date().toISOString() } }
    await store.op('documento.guardar', { ...doc, campos, firmas: firmasNuevas })
    setFirmando(null)
    const completo = FIRMANTES[doc.tipo].every((f) => firmasNuevas[f.id as keyof typeof firmasNuevas])
    avisar({ tipo: 'exito', titulo: completo ? 'Documento firmado por todos' : 'Firma guardada', texto: completo ? 'Quedó bloqueado como evidencia.' : `${Object.keys(firmasNuevas).length} de ${FIRMANTES[doc.tipo].length} firmas` })
  }

  const quitarFirma = async (firmanteId: string) => {
    const ok = await confirmar({ titulo: 'Quitar esta firma', texto: 'Úsalo solo si la firma se capturó por error.', confirmar: 'Quitar', peligro: true })
    if (!ok) return
    const f = { ...(doc.firmas ?? {}) }
    delete f[firmanteId]
    await store.op('documento.guardar', { ...doc, campos, firmas: f })
  }

  const restablecer = async () => {
    if (!ev) return
    const ok = await confirmar({ titulo: 'Restablecer con los datos de la evaluación', texto: 'Se reemplazarán los textos capturados en este documento.', confirmar: 'Restablecer' })
    if (!ok) return
    const nuevos = camposIniciales(doc.tipo, db, ev, plan)
    setCampos(nuevos)
    await store.op('documento.guardar', { ...doc, campos: nuevos })
  }

  const anular = async () => {
    const ok = await confirmar({ titulo: `¿Anular ${doc.folio}?`, texto: 'El documento queda como anulado (no se borra) y puedes generar uno nuevo desde el plan o la evaluación.', confirmar: 'Anular', peligro: true })
    if (ok) await store.op('documento.guardar', { ...doc, campos, anulado: true })
  }

  const eliminar = async () => {
    const ok = await confirmar({ titulo: `¿Eliminar ${doc.folio}?`, texto: 'Solo se pueden eliminar documentos sin firmas.', confirmar: 'Eliminar', peligro: true })
    if (!ok) return
    await store.op('documento.eliminar', { id: doc.id })
    cerrarPanel()
  }

  const imprimir = () => {
    setImprimiendo(true)
    setTimeout(() => {
      window.print()
      setImprimiendo(false)
    }, 80)
  }

  const word = async () => {
    try {
      await descargarWord(vista)
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo generar el Word', texto: err instanceof Error ? err.message : String(err) })
    }
  }

  const desconocia = /^s[ií]/i.test(campos.desconocia ?? '')
  const firmante = FIRMANTES[doc.tipo].find((f) => f.id === firmando)

  return (
    <Hoja
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      ancho={1180}
      encabezado={
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink-2">
            {doc.folio || 'Nuevo'} · {ev ? `${ev.folio} · ` : ''}
            {doc.agenteNombre}
          </p>
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] leading-tight font-semibold tracking-[-0.018em] sm:text-[19px]">
            {NOMBRE_DOC[doc.tipo]}
            {doc.anulado ? <Insignia>Anulado</Insignia> : firmas.completo ? <Insignia tono="verde">Firmado</Insignia> : <Insignia tono={firmas.firmadas ? 'ambar' : 'azul'}>{`${firmas.firmadas} de ${firmas.total} firmas`}</Insignia>}
          </h2>
        </div>
      }
      acciones={
        <>
          {doc.tipo !== 'retro' && (
            <BotonIcono etiqueta="Descargar Word (plantilla oficial)" onClick={word}>
              <FileDown className="size-[18px]" />
            </BotonIcono>
          )}
          {!firmas.firmadas && !doc.anulado && (
            <BotonIcono etiqueta="Eliminar documento" onClick={eliminar} className="hover:text-bad-ink">
              <Trash2 className="size-[18px]" />
            </BotonIcono>
          )}
          <Boton variante="primario" tam="sm" icono={<Printer className="size-4" />} onClick={imprimir} aria-label="Imprimir o guardar como PDF" title="Imprimir o guardar como PDF">
            <span className="hidden sm:inline">Imprimir / PDF</span>
          </Boton>
        </>
      }
    >
      <div className="mb-3 md:hidden">
        <Segmentado
          completo
          valor={vistaMovil}
          onChange={setVistaMovil}
          opciones={[
            { valor: 'datos', etiqueta: 'Datos y firmas' },
            { valor: 'papel', etiqueta: 'Vista previa' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className={cx('min-w-0 rounded-[18px] bg-surface-3/60 p-3 md:p-6 dark:bg-black/40', vistaMovil === 'datos' && 'hidden md:block')}>
          <div className="origin-top overflow-x-auto">
            <Papel doc={vista} />
          </div>
        </div>

        <div className={cx('flex flex-col gap-5', vistaMovil === 'papel' && 'hidden md:flex')}>
          {bloqueado && (
            <div className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-4 py-3 text-[12.5px] text-ink-2">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>{doc.anulado ? 'Documento anulado: se conserva como registro.' : 'El contenido se bloqueó al recibir la primera firma, para que sirva como evidencia. Si necesitas cambiarlo, anúlalo y genera uno nuevo.'}</span>
            </div>
          )}

          {faltan.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-[14px] bg-warn-soft px-4 py-3 text-[12.5px] text-warn-ink" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">Falta llenar antes de firmar:</span> {faltan.map((f) => f.etiqueta).join(' · ')}. Al recibir la primera firma el contenido se bloquea como evidencia.
              </span>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Firmas</h3>
            <div className="overflow-hidden rounded-[14px] bg-surface-2/70">
              {FIRMANTES[doc.tipo].map((f) => {
                const firma = doc.firmas?.[f.id]
                return (
                  <div key={f.id} className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                    {firma ? <CheckCircle2 className="size-5 shrink-0 text-good-ink" /> : <PenLine className="size-5 shrink-0 text-ink-3" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{f.etiqueta}</p>
                      <p className="truncate text-[12px] text-ink-2">{firma ? `${firma.nombre} · ${fechaHora(firma.fecha)}` : campos[f.campoNombre] || 'Sin nombre'}</p>
                    </div>
                    {firma ? (
                      !doc.anulado &&
                      !firmas.completo && (
                        <button onClick={() => void quitarFirma(f.id)} className="text-[12px] font-medium text-ink-3 hover:text-bad-ink" title="Solo si la firma se capturó por error">
                          Quitar
                        </button>
                      )
                    ) : (
                      <Boton tam="sm" variante="tinte" disabled={!!doc.anulado || faltan.length > 0} title={faltan.length ? 'Completa los campos marcados antes de firmar' : undefined} onClick={() => setFirmando(f.id)}>
                        Firmar
                      </Boton>
                    )}
                  </div>
                )
              })}
            </div>
            {doc.tipo === 'retro' && <p className="mt-1.5 text-[11.5px] text-ink-3">Al firmar el colaborador se registra el feedback y la acción del plan (niveles 1 y 2).</p>}
          </section>

          {doc.tipo === 'retro' && desconocia && plan && plan.seguimiento?.causa !== 'SABER' && (
            <button onClick={() => void store.op('seguimiento.actualizar', { evaluacionId: plan.id, causa: 'SABER' })} className="rounded-[14px] bg-accent-soft px-4 py-3 text-left text-[12.5px] font-medium text-accent-ink">
              El colaborador desconocía la información: asignar causa raíz “SABER” al plan ›
            </button>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Contenido</h3>
              {!bloqueado && ev && (
                <button onClick={restablecer} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-ink hover:underline">
                  <RotateCcw className="size-3.5" /> Restablecer
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {CAMPOS[doc.tipo].map((c) => {
                const pendiente = !bloqueado && faltan.some((f) => f.id === c.id)
                return (
                  <Campo
                    key={c.id}
                    etiqueta={
                      <>
                        {c.etiqueta}
                        {pendiente && <span className="ml-1.5 font-semibold text-warn-ink">· falta llenar</span>}
                      </>
                    }
                    ayuda={c.ayuda}
                  >
                    {c.opciones ? (
                      <Segmentado<string>
                        completo
                        etiqueta={c.etiqueta}
                        valor={campos[c.id] ?? ''}
                        onChange={(v) => !bloqueado && cambiar(c.id, v)}
                        opciones={c.opciones.map((o) => ({ valor: o, etiqueta: o }))}
                      />
                    ) : c.multilinea ? (
                      <AreaTexto rows={Math.min(8, Math.max(3, (campos[c.id] ?? '').split('\n').length + 1))} value={campos[c.id] ?? ''} disabled={bloqueado} onChange={(e) => cambiar(c.id, e.target.value)} />
                    ) : (
                      <Entrada type={c.tipo ?? 'text'} value={campos[c.id] ?? ''} disabled={bloqueado} onChange={(e) => cambiar(c.id, e.target.value)} />
                    )}
                  </Campo>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Historial del documento</h3>
            <Historial entradas={historial} vacio="Generado antes de que existiera la bitácora detallada." />
          </section>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {ev && (
              <Boton tam="sm" onClick={() => abrirPanel('ev', ev.id)}>
                Ver evaluación
              </Boton>
            )}
            {plan && (
              <Boton tam="sm" onClick={() => abrirPanel('plan', plan.id)}>
                Ver plan
              </Boton>
            )}
            {firmas.firmadas > 0 && !doc.anulado && (
              <Boton tam="sm" variante="peligro" icono={<Ban className="size-4" />} onClick={anular}>
                Anular
              </Boton>
            )}
          </div>
        </div>
      </div>

      {firmante && (
        <div className="anim-fundido fixed inset-0 z-[95] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onMouseDown={() => setFirmando(null)}>
          <div className="anim-escala w-full max-w-[560px] rounded-[22px] bg-elevated p-6 shadow-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={`Firmar: ${firmante.etiqueta}`}>
            <h3 className="mb-4 text-[17px] font-semibold">{firmante.etiqueta}</h3>
            <PadFirma etiqueta={firmante.etiqueta} nombreInicial={campos[firmante.campoNombre] ?? ''} onCancelar={() => setFirmando(null)} onGuardar={(n, png) => void firmar(firmante.id, n, png)} />
          </div>
        </div>
      )}

      {imprimiendo &&
        createPortal(
          <div className="zona-impresion solo-impresion">
            <Papel doc={vista} />
          </div>,
          document.body,
        )}
    </Hoja>
  )
}
