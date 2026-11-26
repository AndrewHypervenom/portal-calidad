import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { Documento } from '../lib/types'
import { Papel } from '../documents/Papel'
import { PadFirma } from '../documents/PadFirma'
import { SubirFirma } from '../documents/SubirFirma'
import { FIRMANTES, NOMBRE_DOC } from '../documents/plantillas'
import { Marca } from '../components/Layout'
import { AreaTexto, Campo, Cargando, Segmentado } from '../components/ui'

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; doc: Documento; firmante: string; venceEn: string }
  | { fase: 'firmado' }


export function FirmaPublica({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [leido, setLeido] = useState(false)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [metodo, setMetodo] = useState<'dibujo' | 'imagen'>('dibujo')

  useEffect(() => {
    fetch(`/api/firma-publica/${token}`, { cache: 'no-store' })
      .then(async (r) => {
        const c = await r.json()
        setEstado(r.ok ? { fase: 'listo', doc: c.doc, firmante: c.firmante, venceEn: c.venceEn } : { fase: 'error', mensaje: c.error })
      })
      .catch(() => setEstado({ fase: 'error', mensaje: 'No se pudo conectar con el portal. Intenta de nuevo en unos minutos.' }))
  }, [token])

  async function firmar(nombre: string, img: string) {
    setEnviando(true)
    setError('')
    try {
      const r = await fetch(`/api/firma-publica/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, img, comentario, metodo }),
      })
      const c = await r.json()
      if (!r.ok) throw new Error(c.error)
      setEstado({ fase: 'firmado' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la firma.')
    } finally {
      setEnviando(false)
    }
  }

  const firmanteActual = estado.fase === 'listo' ? FIRMANTES[estado.doc.tipo].find((f) => f.id === estado.firmante) : undefined
  const nombreSugerido = estado.fase === 'listo' && firmanteActual ? (estado.doc.campos[firmanteActual.campoNombre] ?? '') : ''

  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto flex max-w-[860px] flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <Marca className="h-[26px]" />
          <div className="linea-marca h-[3px] w-16 rounded-full" aria-hidden />
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Firma de documento</h1>
        </header>

        {estado.fase === 'cargando' && <Cargando texto="Cargando el documento…" />}

        {estado.fase === 'error' && (
          <div className="mx-auto flex max-w-[460px] flex-col items-center gap-3 rounded-[22px] bg-elevated p-7 text-center shadow-pop">
            <AlertTriangle className="size-10 text-warn" />
            <p className="text-[15px] font-semibold">{estado.mensaje}</p>
          </div>
        )}

        {estado.fase === 'firmado' && (
          <div className="mx-auto flex max-w-[460px] flex-col items-center gap-3 rounded-[22px] bg-elevated p-7 text-center shadow-pop">
            <CheckCircle2 className="size-10 text-good-ink" />
            <p className="text-[16px] font-semibold">¡Listo! Tu firma quedó registrada.</p>
            <p className="text-[14px] text-ink-2">El área de Calidad ya fue notificada. Puedes cerrar esta página.</p>
          </div>
        )}

        {estado.fase === 'listo' && (
          <>
            <p className="text-center text-[14px] text-ink-2">
              Revisa tu <b>{NOMBRE_DOC[estado.doc.tipo]}</b> ({estado.doc.folio}). El enlace vence el{' '}
              {new Date(estado.venceEn).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}.
            </p>

            <div className="overflow-x-auto">
              <Papel doc={estado.doc} />
            </div>

            <section className="mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-[22px] bg-elevated p-6 shadow-pop">
              <label className="flex items-start gap-2.5 text-[14px]">
                <input type="checkbox" className="mt-1 size-4" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
                <span>Leí el documento completo.</span>
              </label>

              <Campo etiqueta="Comentario u observación (opcional)" htmlFor="comentario" ayuda="Si no estás de acuerdo con algo, puedes dejarlo escrito aquí. Quedará registrado junto a tu firma.">
                <AreaTexto id="comentario" rows={3} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
              </Campo>

              {error && <p className="text-[13px] text-bad-ink">{error}</p>}

              {leido ? (
                enviando ? (
                  <Cargando texto="Guardando tu firma…" />
                ) : (
                  <>
                    <Segmentado<'dibujo' | 'imagen'>
                      completo
                      etiqueta="Forma de firmar"
                      valor={metodo}
                      onChange={setMetodo}
                      opciones={[
                        { valor: 'dibujo', etiqueta: 'Dibujar firma' },
                        { valor: 'imagen', etiqueta: 'Subir imagen' },
                      ]}
                    />
                    {metodo === 'dibujo' ? (
                      <PadFirma
                        key="dibujo"
                        etiqueta={firmanteActual?.etiqueta ?? 'Firma'}
                        nombreInicial={nombreSugerido}
                        onCancelar={() => setLeido(false)}
                        onGuardar={(nombre, img) => void firmar(nombre, img)}
                      />
                    ) : (
                      <SubirFirma
                        key="imagen"
                        etiqueta={firmanteActual?.etiqueta ?? 'Firma'}
                        nombreInicial={nombreSugerido}
                        onCancelar={() => setLeido(false)}
                        onGuardar={(nombre, img) => void firmar(nombre, img)}
                      />
                    )}
                  </>
                )
              ) : (
                <p className="text-[13px] text-ink-3">Marca la casilla para habilitar la firma.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}