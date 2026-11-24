import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import type { Semaforo } from '../lib/types'
import type { EstadoPlan } from '../lib/plans'
import { ETIQUETA_ESTADO } from '../lib/plans'
import { iniciales, pct } from '../lib/format'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'plano' | 'tinte'
type Tam = 'sm' | 'md' | 'lg'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-accent text-on-accent font-semibold hover:bg-accent-hover active:brightness-95 shadow-[0_1px_2px_rgba(0,0,0,0.14)]',
  secundario: 'bg-fill-2 text-ink hover:bg-fill active:bg-press',
  fantasma: 'text-accent-ink hover:bg-accent-soft active:bg-accent-soft',
  peligro: 'bg-bad-soft text-bad-ink hover:brightness-95',
  plano: 'text-ink-2 hover:bg-hover hover:text-ink active:bg-press',
  tinte: 'bg-accent-soft text-accent-ink hover:brightness-95',
}
const TAMANOS: Record<Tam, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-full',
  md: 'h-9 px-4 text-[14px] gap-2 rounded-full',
  lg: 'h-11 px-6 text-[15px] gap-2 rounded-full',
}

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tam?: Tam
  icono?: ReactNode
  cargando?: boolean
}

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = 'secundario', tam = 'md', icono, cargando, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background,color,filter,transform] duration-150 select-none active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100',
        VARIANTES[variante],
        TAMANOS[tam],
        className,
      )}
      {...rest}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" /> : icono}
      {children}
    </button>
  )
})

export const BotonIcono = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { etiqueta: string; tam?: 'sm' | 'md'; activo?: boolean }>(
  function BotonIcono({ etiqueta, tam = 'md', activo, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={etiqueta}
        title={etiqueta}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-ink active:bg-press disabled:opacity-40',
          tam === 'sm' ? 'size-8' : 'size-9',
          activo && 'bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

export interface OpcionSeg<T extends string> {
  valor: T
  etiqueta: ReactNode
  titulo?: string
  icono?: ReactNode
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  tam = 'md',
  className,
  completo,
  etiqueta,
}: {
  opciones: OpcionSeg<T>[]
  valor: T
  onChange: (v: T) => void
  tam?: 'sm' | 'md' | 'lg'
  className?: string
  completo?: boolean
  etiqueta?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cont = ref.current?.parentElement
    const activo = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!cont || !activo || cont.scrollWidth <= cont.clientWidth + 1) return
    const rc = cont.getBoundingClientRect()
    const ra = activo.getBoundingClientRect()
    cont.scrollBy({ left: ra.left + ra.width / 2 - (rc.left + rc.width / 2), behavior: 'smooth' })
  }, [valor])
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={etiqueta}
      className={cx('inline-flex items-stretch rounded-[10px] bg-fill-2 p-[2px]', completo && 'flex w-full', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const i = opciones.findIndex((o) => o.valor === valor)
        const j = (i + (e.key === 'ArrowRight' ? 1 : opciones.length - 1)) % opciones.length
        onChange(opciones[j].valor)
        ;(e.currentTarget.children[j] as HTMLElement | undefined)?.focus()
      }}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            title={o.titulo}
            onClick={() => onChange(o.valor)}
            className={cx(
              'relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap transition-[background,box-shadow,color] duration-200',
              tam === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : tam === 'lg' ? 'h-10 px-4 text-[14px]' : 'h-8 px-3 text-[13px]',
              completo && 'flex-1',
              activo ? 'bg-[var(--segmented-on)] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.icono}
            <span className="truncate">{o.etiqueta}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Campo({ etiqueta, ayuda, error, children, className, htmlFor }: { etiqueta?: ReactNode; ayuda?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {etiqueta && (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
          {etiqueta}
        </label>
      )}
      {children}
      {error ? <p className="text-[12px] text-bad-ink">{error}</p> : ayuda ? <p className="text-[12px] text-ink-3">{ayuda}</p> : null}
    </div>
  )
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { prefijo?: ReactNode }>(function Entrada(
  { className, prefijo, ...rest },
  ref,
) {
  if (prefijo)
    return (
      <div className={cx('campo flex h-9 items-center gap-2 px-3 focus-within:bg-surface focus-within:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--accent-soft)]', className)}>
        <span className="text-ink-3">{prefijo}</span>
        <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" {...rest} />
      </div>
    )
  return <input ref={ref} className={cx('campo h-9 w-full px-3 text-[14px]', className)} {...rest} />
})

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AreaTexto({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('campo w-full resize-y px-3 py-2 text-[14px] leading-relaxed', className)} {...rest} />
})

export function Selector({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('relative', className)}>
      <select className="campo h-9 w-full appearance-none pr-8 pl-3 text-[14px]" {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" />
    </div>
  )
}

export function Interruptor({ activo, onChange, etiqueta, deshabilitado }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onChange(!activo)}
      className={cx('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40', activo ? 'bg-good' : 'bg-fill')}
    >
      <span className={cx('absolute top-[2px] left-[2px] size-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-apple', activo && 'translate-x-[18px]')} />
    </button>
  )
}

export function Tarjeta({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  )
}

export function EncabezadoTarjeta({ titulo, subtitulo, accion, className }: { titulo: ReactNode; subtitulo?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h3>
        {subtitulo && <p className="mt-0.5 text-[12.5px] text-ink-2">{subtitulo}</p>}
      </div>
      {accion && <div className="flex shrink-0 items-center gap-1">{accion}</div>}
    </div>
  )
}

export function Insignia({ children, tono = 'neutro', className, icono, title }: { children: ReactNode; tono?: 'neutro' | 'azul' | 'verde' | 'ambar' | 'rojo' | 'violeta' | 'solido-rojo'; className?: string; icono?: ReactNode; title?: string }) {
  const tonos = {
    neutro: 'bg-fill-2 text-ink-2',
    azul: 'bg-info-soft text-info-ink',
    verde: 'bg-good-soft text-good-ink',
    ambar: 'bg-warn-soft text-warn-ink',
    rojo: 'bg-bad-soft text-bad-ink',
    violeta: 'bg-violet-soft text-violet',
    'solido-rojo': 'bg-bad text-white',
  }
  return (
    <span title={title} className={cx('inline-flex h-[22px] max-w-full shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap', tonos[tono], className)}>
      {icono}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function SemaforoPill({ estado, critico, compacto, className }: { estado: Semaforo | 'sin-dato' | null; critico?: boolean; compacto?: boolean; className?: string }) {
  if (critico)
    return (
      <Insignia tono="rojo" icono={<ShieldAlert className="size-3.5" />} className={className}>
        {compacto ? 'Crítico' : 'Error crítico'}
      </Insignia>
    )
  if (estado === 'verde')
    return (
      <Insignia tono="verde" icono={<CheckCircle2 className="size-3.5" />} className={className}>
        En meta
      </Insignia>
    )
  if (estado === 'amarillo')
    return (
      <Insignia tono="ambar" icono={<AlertTriangle className="size-3.5" />} className={className}>
        En riesgo
      </Insignia>
    )
  if (estado === 'rojo')
    return (
      <Insignia tono="rojo" icono={<XCircle className="size-3.5" />} className={className}>
        {compacto ? 'Bajo' : 'Bajo desempeño'}
      </Insignia>
    )
  return (
    <Insignia tono="neutro" icono={<CircleDashed className="size-3.5" />} className={className}>
      Sin evaluar
    </Insignia>
  )
}

export function colorPuntaje(p: number | null | undefined, critico: boolean | undefined, meta: number, umbral: number) {
  if (critico) return 'var(--bad)'
  if (p === null || p === undefined) return 'var(--ink-3)'
  if (p >= meta - 1e-9) return 'var(--good)'
  if (p >= umbral - 1e-9) return 'var(--warn)'
  return 'var(--bad)'
}

export function claseTintaPuntaje(p: number | null | undefined, critico: boolean | undefined, meta: number, umbral: number) {
  if (critico) return 'text-bad-ink'
  if (p === null || p === undefined) return 'text-ink-3'
  if (p >= meta - 1e-9) return 'text-good-ink'
  if (p >= umbral - 1e-9) return 'text-warn-ink'
  return 'text-bad-ink'
}

export function Puntaje({ valor, critico, meta, umbral, className, grande }: { valor: number | null | undefined; critico?: boolean; meta: number; umbral: number; className?: string; grande?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-semibold tabular', grande ? 'text-[15px]' : 'text-[13.5px]', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: colorPuntaje(valor, critico, meta, umbral) }} aria-hidden />
      {pct(valor)}
    </span>
  )
}

export const NOMBRE_NIVEL = ['Preventivo', 'Feedback y compromiso', 'Refuerzo focalizado', 'Plan de mejora formal', 'Escalamiento']

export function NivelBadge({ nivel, corto }: { nivel: number; corto?: boolean }) {
  const tono = (['neutro', 'azul', 'ambar', 'rojo', 'solido-rojo'] as const)[Math.max(0, Math.min(4, nivel))]
  return (
    <Insignia tono={tono}>
      N{nivel}
      {!corto && <span className="font-medium opacity-90"> · {NOMBRE_NIVEL[nivel]}</span>}
    </Insignia>
  )
}

export function EstadoPlanPill({ estado }: { estado: EstadoPlan }) {
  const tono = ({ pendiente: 'ambar', verificacion: 'azul', vencido: 'rojo', reincide: 'violeta', cerrado: 'verde', historico: 'neutro' } as const)[estado]
  return <Insignia tono={tono}>{ETIQUETA_ESTADO[estado]}</Insignia>
}

export function Avatar({ nombre, tam = 32, className }: { nombre: string; tam?: number; className?: string }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#7f8b8b] to-[#5c6767] font-semibold text-white dark:from-[#3a413f] dark:to-[#2a302e]', className)}
      style={{ width: tam, height: tam, fontSize: Math.round(tam * 0.38) }}
      aria-hidden
    >
      {iniciales(nombre)}
    </span>
  )
}

export function Vacio({ icono, titulo, texto, accion, className }: { icono?: ReactNode; titulo: string; texto?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icono && <div className="mb-1 text-ink-3 [&>svg]:size-9 [&>svg]:stroke-[1.5]">{icono}</div>}
      <p className="text-[15px] font-semibold">{titulo}</p>
      {texto && <p className="max-w-sm text-[13px] text-ink-2">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

export function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-fill px-1 font-sans text-[11px] font-medium text-ink-2">{children}</kbd>
}

export function Separador({ className }: { className?: string }) {
  return <div className={cx('h-px bg-line', className)} />
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-2">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-[13px]">{texto}</span>
    </div>
  )
}

export function Dato({ etiqueta, valor, className }: { etiqueta: ReactNode; valor: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt className="text-[12px] font-medium text-ink-2">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-medium">{valor}</dd>
    </div>
  )
}

export function useIdUnico(prefijo: string) {
  return `${prefijo}-${useId().replace(/:/g, '')}`
}
