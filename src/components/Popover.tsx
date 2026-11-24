import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './ui'

const MARGEN = 8
const SEPARACION = 6

interface Posicion {
  top: number
  left: number
  ancho: number
  maxAlto: number
  arriba: boolean
}

export function Popover({
  disparador,
  children,
  alinear = 'inicio',
  ancho = 280,
  className,
}: {
  disparador: (abierto: boolean, alternar: () => void) => ReactNode
  children: (cerrar: () => void) => ReactNode
  alinear?: 'inicio' | 'fin'
  ancho?: number
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<Posicion | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)

  const colocar = useCallback(() => {
    const t = ref.current?.getBoundingClientRect()
    const c = capa.current
    if (!t || !c) return
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const w = Math.min(ancho, vw - 2 * MARGEN)
    const alto = c.scrollHeight
    const espacioAbajo = vh - t.bottom - SEPARACION - MARGEN
    const espacioArriba = t.top - SEPARACION - MARGEN
    const arriba = alto > espacioAbajo && espacioArriba > espacioAbajo
    const maxAlto = Math.max(140, arriba ? espacioArriba : espacioAbajo)
    const visible = Math.min(alto, maxAlto)
    const left = Math.max(MARGEN, Math.min(alinear === 'fin' ? t.right - w : t.left, vw - w - MARGEN))
    const top = arriba ? Math.max(MARGEN, t.top - SEPARACION - visible) : t.bottom + SEPARACION
    setPos((p) => (p && p.top === top && p.left === left && p.maxAlto === maxAlto && p.ancho === w && p.arriba === arriba ? p : { top, left, ancho: w, maxAlto, arriba }))
  }, [ancho, alinear])

  useLayoutEffect(() => {
    if (abierto) colocar()
    else setPos(null)
  }, [abierto, colocar])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      const n = e.target as Node
      if (ref.current?.contains(n) || capa.current?.contains(n)) return
      setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setAbierto(false)
      }
    }
    const reubicar = () => colocar()
    document.addEventListener('pointerdown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('resize', reubicar)
    window.addEventListener('scroll', reubicar, true)
    return () => {
      document.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('resize', reubicar)
      window.removeEventListener('scroll', reubicar, true)
    }
  }, [abierto, colocar])

  return (
    <div ref={ref} className={cx('relative', className)}>
      {disparador(abierto, () => setAbierto((v) => !v))}
      {abierto &&
        createPortal(
          <div
            ref={capa}
            className={cx('fixed z-[75] overflow-y-auto overscroll-contain rounded-[14px] bg-elevated p-1.5 text-ink shadow-pop no-imprimir', pos ? 'anim-escala' : 'invisible')}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.ancho ?? Math.min(ancho, window.innerWidth - 2 * MARGEN),
              maxHeight: pos?.maxAlto,
              transformOrigin: pos?.arriba ? 'bottom center' : 'top center',
            }}
          >
            {children(() => setAbierto(false))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function OpcionMenu({ activo, onClick, children, icono, detalle }: { activo?: boolean; onClick: () => void; children: ReactNode; icono?: ReactNode; detalle?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-hover', activo && 'font-semibold')}
    >
      <span className="flex w-4 shrink-0 justify-center text-accent-ink">{activo ? '✓' : icono}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detalle && <span className="shrink-0 text-[12px] text-ink-3">{detalle}</span>}
    </button>
  )
}

export function TituloMenu({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{children}</p>
}
