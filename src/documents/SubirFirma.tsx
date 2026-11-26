import { useRef, useState } from 'react'
import { ImageUp, X } from 'lucide-react'
import { Boton, Campo, Entrada } from '../components/ui'

const MAX_BYTES = 2 * 1024 * 1024 
const MAX_ANCHO = 600
const MAX_ALTO = 220
const UMBRAL_BLANCO = 225 

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}


async function procesarFirma(archivo: File): Promise<string> {
  const img = await cargarImagen(archivo)
  const escalaInicial = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escalaInicial)
  c.height = Math.round(img.height * escalaInicial)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)

  const datos = ctx.getImageData(0, 0, c.width, c.height)
  const p = datos.data
  let x0 = c.width,
    y0 = c.height,
    x1 = -1,
    y1 = -1
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      const claro = Math.min(p[i], p[i + 1], p[i + 2])
      if (p[i + 3] < 20 || claro > UMBRAL_BLANCO) {
        p[i + 3] = 0 // fondo → transparente
      } else {
       
        p[i] = p[i + 1] = p[i + 2] = Math.round(claro * 0.35)
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error('No se encontró una firma en la imagen. Usa una foto con fondo blanco y tinta oscura.')
  ctx.putImageData(datos, 0, 0)

  const margen = 6
  x0 = Math.max(0, x0 - margen)
  y0 = Math.max(0, y0 - margen)
  x1 = Math.min(c.width - 1, x1 + margen)
  y1 = Math.min(c.height - 1, y1 + margen)
  const ancho = x1 - x0 + 1
  const alto = y1 - y0 + 1
  const escala = Math.min(1, MAX_ANCHO / ancho, MAX_ALTO / alto)

  const salida = document.createElement('canvas')
  salida.width = Math.max(1, Math.round(ancho * escala))
  salida.height = Math.max(1, Math.round(alto * escala))
  salida.getContext('2d')!.drawImage(c, x0, y0, ancho, alto, 0, 0, salida.width, salida.height)
  return salida.toDataURL('image/png')
}


export function SubirFirma({ nombreInicial, etiqueta, onGuardar, onCancelar }: { nombreInicial: string; etiqueta: string; onGuardar: (nombre: string, png: string) => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [png, setPng] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  async function elegir(archivo: File | undefined) {
    setError('')
    setPng(null)
    if (!archivo) return
    if (!['image/png', 'image/jpeg'].includes(archivo.type)) return setError('El archivo debe ser una imagen PNG o JPG.')
    if (archivo.size > MAX_BYTES) return setError('La imagen supera los 2 MB.')
    setProcesando(true)
    try {
      setPng(await procesarFirma(archivo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la imagen.')
    } finally {
      setProcesando(false)
    }
  }

  function quitar() {
    setPng(null)
    if (entrada.current) entrada.current.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <Campo etiqueta={`Nombre de quien firma · ${etiqueta}`}>
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
      </Campo>

      <div>
        <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
          <ImageUp className="size-4" /> Sube una foto o escaneo de tu firma (PNG o JPG, máx. 2 MB)
        </span>
        <div className="flex h-[190px] w-full items-center justify-center rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]">
          {procesando ? (
            <p className="text-[13px] text-ink-3">Procesando la imagen…</p>
          ) : png ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <img src={png} alt="Vista previa de la firma" className="max-h-full max-w-full object-contain" />
              <button onClick={quitar} className="absolute top-0 right-0 rounded-full bg-black/60 p-1 text-white" aria-label="Quitar imagen">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Boton icono={<ImageUp className="size-4" />} onClick={() => entrada.current?.click()}>
              Elegir imagen
            </Boton>
          )}
        </div>
        <input ref={entrada} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void elegir(e.target.files?.[0])} />
        <p className="mt-1.5 text-[11.5px] text-ink-3">Tip: firma en una hoja blanca con tinta oscura y toma la foto con buena luz. El fondo se quita automáticamente.</p>
        {error && <p className="mt-1 text-[12.5px] text-bad-ink">{error}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!png || !nombre.trim()} onClick={() => png && onGuardar(nombre.trim(), png)}>
          Guardar firma
        </Boton>
      </div>
    </div>
  )
}