import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { Boton, cx } from './ui'

export interface Toast {
  id: number
  tipo: 'exito' | 'error' | 'info'
  titulo: string
  texto?: string
  acciones?: { etiqueta: string; onClick: () => void }[]
  duracion?: number
}

let toasts: Toast[] = []
let siguiente = 1
const oyentesT = new Set<() => void>()
const emitirT = () => oyentesT.forEach((f) => f())

export function avisar(t: Omit<Toast, 'id'>) {
  const id = siguiente++
  toasts = [...toasts.slice(-3), { ...t, id }]
  emitirT()
  const dur = t.duracion ?? (t.tipo === 'error' ? 7000 : t.acciones?.length ? 7000 : 3800)
  setTimeout(() => quitarToast(id), dur)
  return id
}

export function quitarToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emitirT()
}

export function Toasts() {
  const lista = useSyncExternalStore(
    (f) => {
      oyentesT.add(f)
      return () => oyentesT.delete(f)
    },
    () => toasts,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-[calc(max(1.25rem,env(safe-area-inset-bottom))+64px)] md:inset-x-auto md:left-[96px] md:items-start md:px-0 md:pb-6 xl:left-[272px] no-imprimir" aria-live="polite">
      {lista.map((t) => (
        <div
          key={t.id}
          role={t.tipo === 'error' ? 'alert' : 'status'}
          className="anim-escala pointer-events-auto flex w-full max-w-[520px] items-start gap-3 rounded-[16px] bg-[#0b0b0b]/95 md:w-[420px] px-4 py-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl dark:bg-[#2c2c2e]/95 dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.6)]"
        >
          <span className="mt-0.5 shrink-0">
            {t.tipo === 'exito' ? <CheckCircle2 className="size-5 text-[#10d451]" /> : t.tipo === 'error' ? <AlertCircle className="size-5 text-[#ff6961]" /> : <Info className="size-5 text-[#64b5ff]" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{t.titulo}</p>
            {t.texto && <p className="mt-0.5 text-[13px] text-white/75">{t.texto}</p>}
            {t.acciones?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {t.acciones.map((a) => (
                  <button
                    key={a.etiqueta}
                    onClick={() => {
                      a.onClick()
                      quitarToast(t.id)
                    }}
                    className="rounded-full bg-white/14 px-3 py-1 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/22"
                  >
                    {a.etiqueta}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button onClick={() => quitarToast(t.id)} className="-mr-1 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar aviso">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

interface Pregunta {
  titulo: string
  texto?: ReactNode
  confirmar: string
  peligro?: boolean
  resolver: (v: boolean) => void
}

let pregunta: Pregunta | null = null
const oyentesC = new Set<() => void>()

export function confirmar(opts: { titulo: string; texto?: ReactNode; confirmar?: string; peligro?: boolean }): Promise<boolean> {
  return new Promise((resolver) => {
    pregunta = { confirmar: 'Aceptar', ...opts, resolver }
    oyentesC.forEach((f) => f())
  })
}

function cerrarPregunta(v: boolean) {
  pregunta?.resolver(v)
  pregunta = null
  oyentesC.forEach((f) => f())
}

export function Confirmaciones() {
  const p = useSyncExternalStore(
    (f) => {
      oyentesC.add(f)
      return () => oyentesC.delete(f)
    },
    () => pregunta,
  )
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!p) return
    ref.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrarPregunta(false)
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [p])
  if (!p) return null
  return (
    <div className="anim-fundido fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px] no-imprimir" onMouseDown={() => cerrarPregunta(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={p.titulo} className="anim-escala w-full max-w-[400px] rounded-[20px] bg-elevated p-6 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{p.titulo}</h2>
        {p.texto && <div className="mt-2 text-[14px] text-ink-2">{p.texto}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => cerrarPregunta(false)}>
            Cancelar
          </Boton>
          <Boton ref={ref} variante={p.peligro ? 'peligro' : 'primario'} onClick={() => cerrarPregunta(true)} className={cx(p.peligro && 'bg-bad text-white hover:bg-bad')}>
            {p.confirmar}
          </Boton>
        </div>
      </div>
    </div>
  )
}
