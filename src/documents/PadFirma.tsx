import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'
import { Boton, Campo, Entrada } from '../components/ui'

export function PadFirma({ nombreInicial, etiqueta, onGuardar, onCancelar }: { nombreInicial: string; etiqueta: string; onGuardar: (nombre: string, png: string) => void; onCancelar: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [nombre, setNombre] = useState(nombreInicial)
  const [vacio, setVacio] = useState(true)
  const dibujando = useRef(false)
  const puntos = useRef<{ x: number; y: number }[]>([])

  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2.2
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = lienzo.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    puntos.current = [pos(e)]
    const ctx = lienzo.current!.getContext('2d')!
    const p = puntos.current[0]
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2)
    ctx.fillStyle = '#111111'
    ctx.fill()
    setVacio(false)
  }

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    const ctx = lienzo.current!.getContext('2d')!
    const p = pos(e)
    const pts = puntos.current
    pts.push(p)
    if (pts.length < 3) return
    const [a, b, c] = pts.slice(-3)
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
    const presion = e.pressure && e.pointerType === 'pen' ? 1.2 + e.pressure * 2 : 2.2
    ctx.lineWidth = presion
    ctx.beginPath()
    ctx.moveTo(m1.x, m1.y)
    ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y)
    ctx.stroke()
  }

  const fin = () => {
    dibujando.current = false
    puntos.current = []
  }

  const limpiar = () => {
    const c = lienzo.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setVacio(true)
  }

  const guardar = () => {
    const c = lienzo.current!
    const ctx = c.getContext('2d')!
    const { width, height } = c
    const datos = ctx.getImageData(0, 0, width, height).data
    let x0 = width
    let y0 = height
    let x1 = 0
    let y1 = 0
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (datos[(y * width + x) * 4 + 3] > 10) {
          if (x < x0) x0 = x
          if (y < y0) y0 = y
          if (x > x1) x1 = x
          if (y > y1) y1 = y
        }
      }
    }
    const m = 12
    x0 = Math.max(0, x0 - m)
    y0 = Math.max(0, y0 - m)
    x1 = Math.min(width, x1 + m)
    y1 = Math.min(height, y1 + m)
    const recorte = document.createElement('canvas')
    recorte.width = Math.max(1, x1 - x0)
    recorte.height = Math.max(1, y1 - y0)
    recorte.getContext('2d')!.drawImage(c, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height)
    onGuardar(nombre.trim(), recorte.toDataURL('image/png'))
  }

  return (
    <div className="flex flex-col gap-3">
      <Campo etiqueta={`Nombre de quien firma · ${etiqueta}`}>
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
      </Campo>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
            <PenLine className="size-4" /> Firma aquí con el mouse, el dedo o un lápiz
          </span>
          <button onClick={limpiar} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline">
            <Eraser className="size-3.5" /> Borrar
          </button>
        </div>
        <canvas
          ref={lienzo}
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fin}
          onPointerCancel={fin}
          className="h-[190px] w-full touch-none rounded-[14px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{ cursor: 'crosshair', backgroundImage: 'linear-gradient(to top, transparent 44px, rgba(0,0,0,0.18) 44px, rgba(0,0,0,0.18) 45px, transparent 45px)' }}
          aria-label="Área de firma"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar}>Cancelar</Boton>
        <Boton variante="primario" disabled={vacio || !nombre.trim()} onClick={guardar}>
          Guardar firma
        </Boton>
      </div>
    </div>
  )
}
