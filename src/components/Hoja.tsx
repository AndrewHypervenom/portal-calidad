import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './ui'

export function Hoja({
  titulo,
  subtitulo,
  encabezado,
  acciones,
  children,
  pie,
  onCerrar,
  ancho = 680,
  profundidad = 0,
  arriba = true,
}: {
  titulo?: ReactNode
  subtitulo?: ReactNode
  encabezado?: ReactNode
  acciones?: ReactNode
  children: ReactNode
  pie?: ReactNode
  onCerrar: () => void
  ancho?: number
  profundidad?: number
  arriba?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!arriba) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const activo = document.activeElement as HTMLElement | null
        if (activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA') && activo.dataset.esc !== 'cerrar') {
          activo.blur()
          return
        }
        onCerrar()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [arriba, onCerrar])
  useEffect(() => {
    if (arriba) ref.current?.focus({ preventScroll: true })
  }, [arriba])

  const desplazamiento = arriba ? 0 : 18
  return (
    <>
      {profundidad === 0 && <div className="anim-fundido fixed inset-0 z-40 bg-black/[0.18] dark:bg-black/45 no-imprimir" onMouseDown={onCerrar} aria-hidden />}
      {profundidad > 0 && arriba && <div className="fixed inset-0 z-40 no-imprimir" style={{ zIndex: 40 + profundidad * 2 }} onMouseDown={onCerrar} aria-hidden />}
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
        className={cx(
          'hoja-ancho anim-panel fixed z-50 flex flex-col overflow-hidden bg-surface shadow-pop outline-none no-imprimir',
          'inset-x-0 bottom-0 top-[max(2.5rem,env(safe-area-inset-top))] rounded-t-[22px]',
          'md:inset-y-3 md:right-3 md:left-auto md:top-3 md:rounded-[22px]',
          !arriba && 'md:brightness-[0.98]',
        )}
        style={{ zIndex: 41 + profundidad * 2, ['--ancho' as string]: `${ancho}px`, transform: desplazamiento ? `translateX(-${desplazamiento}px)` : undefined }}
      >
        <header className="material sticky top-0 z-10 flex items-start gap-3 px-5 pt-4 pb-3 hairline-b md:px-6">
          <div className="min-w-0 flex-1">
            {encabezado ?? (
              <>
                {titulo && <h2 className="truncate text-[19px] font-semibold tracking-[-0.018em]">{titulo}</h2>}
                {subtitulo && <div className="mt-0.5 text-[13px] text-ink-2">{subtitulo}</div>}
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            <button onClick={onCerrar} aria-label="Cerrar panel" title="Cerrar (Esc)" className="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-fill-2 text-ink-2 transition-colors hover:bg-fill hover:text-ink">
              <X className="size-[18px]" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8 md:px-6">{children}</div>
        {pie && <footer className="material border-t border-line px-5 py-3 md:px-6">{pie}</footer>}
      </section>
    </>
  )
}
