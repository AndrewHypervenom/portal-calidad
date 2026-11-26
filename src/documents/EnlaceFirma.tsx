import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Mail, RefreshCw } from 'lucide-react'
import type { Documento } from '../lib/types'
import { useDb } from '../lib/store'
import { avisar, confirmar } from '../components/feedback'
import { Boton, Campo, Entrada, Insignia } from '../components/ui'
import { ETIQUETA_ESTADO_ENLACE, abrirCorreo, crearEnlace, listarEnlaces, revocarEnlace, type EnlaceFirma as Enlace } from '../lib/firmas'
import { NOMBRE_DOC } from './plantillas'

const FIRMANTE_AGENTE = { retro: 'colaborador', carta: 'agente', acta: 'agente' } as const

const TONO = { activo: 'azul', firmado: 'verde', vencido: 'ambar', revocado: 'neutro' } as const

const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Sección del editor: generar y seguir el enlace para que el agente firme sin iniciar sesión
export function EnlaceFirma({ doc, bloqueadoPorCampos }: { doc: Documento; bloqueadoPorCampos: boolean }) {
  const db = useDb()
  const agente = db.agentes.find((a) => a.id === doc.agenteId)
  const yaFirmo = !!doc.firmas?.[FIRMANTE_AGENTE[doc.tipo]]
  const [correo, setCorreo] = useState(agente?.correo ?? '')
  const [enlaces, setEnlaces] = useState<Enlace[]>([])
  const [ultimaUrl, setUltimaUrl] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(() => {
    listarEnlaces(doc.id)
      .then(setEnlaces)
      .catch(() => setEnlaces([]))
  }, [doc.id])

  // Se recarga cuando cambia el documento (por ejemplo, cuando el agente firma)
  useEffect(() => cargar(), [cargar, doc.actualizadoEn])

  if (doc.anulado) return null

  const activo = enlaces.find((e) => e.estado === 'activo')
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())

  async function generar() {
    setTrabajando(true)
    try {
      const { url, enlace } = await crearEnlace(doc.id, correo.trim())
      setUltimaUrl(url)
      cargar()
      abrirCorreo({ correo: correo.trim(), nombre: doc.agenteNombre, documento: NOMBRE_DOC[doc.tipo], folio: doc.folio, url, venceEn: enlace.venceEn })
      avisar({ tipo: 'exito', titulo: 'Enlace generado', texto: 'Se abrió tu correo con el mensaje listo para enviar.' })
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo generar el enlace', texto: err instanceof Error ? err.message : String(err) })
    } finally {
      setTrabajando(false)
    }
  }

  async function copiar() {
    if (!ultimaUrl) return
    await navigator.clipboard.writeText(ultimaUrl)
    avisar({ tipo: 'exito', titulo: 'Enlace copiado' })
  }

  async function anular(e: Enlace) {
    const ok = await confirmar({ titulo: 'Anular el enlace', texto: 'El agente ya no podrá firmar con ese enlace. Puedes generar uno nuevo.', confirmar: 'Anular', peligro: true })
    if (!ok) return
    await revocarEnlace(e.id)
    if (activo?.id === e.id) setUltimaUrl(null)
    cargar()
  }

  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Firma del agente por enlace</h3>
      <div className="flex flex-col gap-3 rounded-[14px] bg-surface-2/70 p-3.5">
        {yaFirmo ? (
          <p className="text-[13px] text-ink-2">El agente ya firmó este documento.</p>
        ) : (
          <>
            <Campo etiqueta="Correo del agente" htmlFor="correo-agente" ayuda={agente?.correo ? undefined : 'Tip: el administrador puede guardarlo en Ajustes → Ejecutivos.'}>
              <Entrada id="correo-agente" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@positivosmais.com" />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton
                tam="sm"
                variante="primario"
                icono={activo ? <RefreshCw className="size-4" /> : <Mail className="size-4" />}
                disabled={trabajando || !correoValido || bloqueadoPorCampos}
                title={bloqueadoPorCampos ? 'Completa los campos marcados antes de enviar' : undefined}
                onClick={() => void generar()}
              >
                {activo ? 'Generar nuevo y enviar' : 'Generar enlace y enviar'}
              </Boton>
              {ultimaUrl && (
                <Boton tam="sm" icono={<Copy className="size-4" />} onClick={() => void copiar()}>
                  Copiar enlace
                </Boton>
              )}
            </div>
            <p className="text-[11.5px] text-ink-3">El enlace vence en 48 h y sirve una sola vez. Generar uno nuevo anula el anterior.</p>
          </>
        )}

        {enlaces.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-line pt-3">
            {enlaces.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 text-[12.5px]">
                <Link2 className="size-4 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {e.correo || 'Sin correo'} · creado {fecha(e.creadoEn)} por {e.creadoPor}
                  </p>
                  <p className="truncate text-ink-3">{e.usadoEn ? `Firmado ${fecha(e.usadoEn)}` : `Vence ${fecha(e.venceEn)}`}</p>
                </div>
                <Insignia tono={TONO[e.estado]}>{ETIQUETA_ESTADO_ENLACE[e.estado]}</Insignia>
                {e.estado === 'activo' && (
                  <button onClick={() => void anular(e)} className="text-[12px] font-medium text-ink-3 hover:text-bad-ink">
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}