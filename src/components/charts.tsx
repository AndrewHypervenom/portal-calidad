import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'
import { pct } from '../lib/format'
import { deIso, aIso } from '../lib/dates'

export function useAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setAncho(el.clientWidth)
    const ro = new ResizeObserver((e) => setAncho(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

export function Sparkline({ valores, alto = 28, color = 'var(--accent)', className, etiqueta }: { valores: (number | null)[]; alto?: number; color?: string; className?: string; etiqueta?: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const pts = valores.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as { v: number; i: number }[]
  const min = Math.min(...pts.map((p) => p.v), 0.6)
  const max = Math.max(...pts.map((p) => p.v), 1)
  const w = Math.max(ancho, 10)
  const x = (i: number) => (valores.length <= 1 ? w / 2 : 3 + (i * (w - 6)) / (valores.length - 1))
  const y = (v: number) => 3 + (alto - 6) * (1 - (v - min) / (max - min || 1))
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const ultimo = pts[pts.length - 1]
  return (
    <div ref={ref} className={cx('w-full', className)} style={{ height: alto }} role="img" aria-label={etiqueta ?? `Tendencia: ${pts.map((p) => pct(p.v)).join(', ')}`}>
      {ancho > 0 && pts.length > 0 && (
        <svg width={w} height={alto} className="overflow-visible">
          {pts.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
          {ultimo && <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />}
        </svg>
      )}
    </div>
  )
}

export interface Serie {
  id: string
  nombre: string
  color: string
  valores: (number | null)[]
  extra?: (string | null)[]
}

export function GraficaLineas({
  categorias,
  series,
  meta,
  alto = 230,
  formato = (v: number) => pct(v),
  etiquetaMeta = 'Meta',
  dominioMin,
}: {
  categorias: { etiqueta: string; detalle?: string }[]
  series: Serie[]
  meta?: number
  alto?: number
  formato?: (v: number) => string
  etiquetaMeta?: string
  dominioMin?: number
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v !== null)
  const minVal = todos.length ? Math.min(...todos) : 0.8
  const d0 = dominioMin ?? Math.max(0, Math.min(0.8, Math.floor((minVal - 0.04) * 10) / 10))
  const d1 = 1
  const paso = d1 - d0 > 0.5 ? 0.25 : 0.1
  const ticks: number[] = []
  for (let t = d0; t <= d1 + 1e-9; t += paso) ticks.push(Math.round(t * 100) / 100)
  const m = { t: 14, r: 58, b: 30, l: 42 }
  const w = Math.max(0, ancho - m.l - m.r)
  const h = alto - m.t - m.b
  const n = categorias.length
  const x = (i: number) => m.l + (n <= 1 ? w / 2 : (i * w) / (n - 1))
  const y = (v: number) => m.t + h - ((Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0)) * h

  const caminos = series.map((s) => {
    let d = ''
    let abierto = false
    s.valores.forEach((v, i) => {
      if (v === null) {
        abierto = false
        return
      }
      d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      abierto = true
    })
    return d
  })

  const mover = (clientX: number) => {
    const el = ref.current
    if (!el || n === 0) return
    const r = el.getBoundingClientRect()
    const px = clientX - r.left
    let mejor = 0
    let dist = Infinity
    for (let i = 0; i < n; i++) {
      const dd = Math.abs(x(i) - px)
      if (dd < dist) {
        dist = dd
        mejor = i
      }
    }
    setHover(mejor)
  }

  const finales = series
    .map((s, k) => {
      for (let i = s.valores.length - 1; i >= 0; i--) if (s.valores[i] !== null) return { k, i, v: s.valores[i] as number }
      return null
    })
    .filter(Boolean) as { k: number; i: number; v: number }[]
  const ys = finales.map((f) => ({ ...f, yy: y(f.v) })).sort((a, b) => a.yy - b.yy)
  for (let i = 1; i < ys.length; i++) if (ys[i].yy - ys[i - 1].yy < 14) ys[i].yy = ys[i - 1].yy + 14

  const tooltipX = hover !== null ? x(hover) : 0
  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12.5px] text-ink-2">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-3.5 rounded-full" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
          {meta !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[1.5px] w-3.5 rounded-full bg-ink-3" />
              {etiquetaMeta} {formato(meta)}
            </span>
          )}
        </div>
      )}
      <div
        ref={ref}
        className="relative w-full select-none outline-none"
        style={{ height: alto }}
        tabIndex={0}
        role="img"
        aria-label={`Gráfica de líneas: ${series.map((s) => s.nombre).join(', ')}`}
        onPointerMove={(e) => mover(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, (v ?? -1) + 1))
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? n) - 1))
        }}
        onBlur={() => setHover(null)}
      >
        {ancho > 0 && (
          <svg width={ancho} height={alto} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            {meta !== undefined && meta >= d0 && (
              <g>
                <line x1={m.l} x2={m.l + w} y1={y(meta)} y2={y(meta)} stroke="var(--ink-3)" strokeWidth={1.25} opacity={0.75} />
                {series.length <= 1 && (
                  <text x={m.l + w + 6} y={y(meta)} dy="0.32em" fontSize={11} fill="var(--ink-2)">
                    {etiquetaMeta}
                  </text>
                )}
              </g>
            )}
            {categorias.map((c, i) => (
              <text key={i} x={x(i)} y={alto - 8} textAnchor="middle" fontSize={11.5} fill={hover === i ? 'var(--ink)' : 'var(--ink-3)'} fontWeight={hover === i ? 600 : 400}>
                {c.etiqueta}
              </text>
            ))}
            {hover !== null && <line x1={tooltipX} x2={tooltipX} y1={m.t} y2={m.t + h} stroke="var(--line-strong)" strokeWidth={1} />}
            {series.map((s, k) => (
              <g key={s.id}>
                <path d={caminos[k]} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {s.valores.map((v, i) =>
                  v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />,
                )}
              </g>
            ))}
            {ys.map((f) => (
              <text key={f.k} x={x(f.i) + 9} y={f.yy} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--ink)" className="tabular">
                {formato(f.v)}
              </text>
            ))}
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-[12px] bg-elevated px-3 py-2 shadow-pop"
            style={tooltipX > ancho / 2 ? { right: ancho - tooltipX + 12 } : { left: tooltipX + 12 }}
          >
            <p className="text-[12px] font-semibold">{categorias[hover]?.etiqueta}</p>
            {categorias[hover]?.detalle && <p className="text-[11px] text-ink-2">{categorias[hover].detalle}</p>}
            <div className="mt-1.5 space-y-1">
              {series.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[12px]">
                  <span className="h-[2px] w-3 rounded-full" style={{ background: s.color }} />
                  <span className="font-semibold tabular">{s.valores[hover] === null ? '—' : formato(s.valores[hover] as number)}</span>
                  <span className="text-ink-2">{s.nombre}</span>
                  {s.extra?.[hover] && <span className="ml-auto pl-2 text-ink-3">{s.extra[hover]}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function GraficaColumnas({
  datos,
  alto = 200,
  formato = (v: number) => String(v),
  color = 'var(--series-1)',
  meta,
  etiquetaMeta,
}: {
  datos: { etiqueta: string; valor: number | null; detalle?: string; color?: string }[]
  alto?: number
  formato?: (v: number) => string
  color?: string
  meta?: number
  etiquetaMeta?: string
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(meta ?? 0, ...datos.map((d) => d.valor ?? 0), 1)
  const m = { t: 22, b: 26 }
  const h = alto - m.t - m.b
  const banda = ancho / Math.max(datos.length, 1)
  const grosor = Math.min(24, banda * 0.5)
  const y = (v: number) => m.t + h - (v / max) * h
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: alto }} onPointerLeave={() => setHover(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} className="block overflow-visible" role="img" aria-label="Gráfica de columnas">
          <line x1={0} x2={ancho} y1={m.t + h} y2={m.t + h} stroke="var(--axis)" strokeWidth={1} />
          {meta !== undefined && (
            <g>
              <line x1={0} x2={ancho} y1={y(meta)} y2={y(meta)} stroke="var(--ink-3)" strokeWidth={1.25} opacity={0.7} />
              {etiquetaMeta && (
                <text x={ancho} y={y(meta) - 5} textAnchor="end" fontSize={11} fill="var(--ink-2)">
                  {etiquetaMeta}
                </text>
              )}
            </g>
          )}
          {datos.map((d, i) => {
            const cx0 = banda * i + banda / 2
            const v = d.valor ?? 0
            const top = y(v)
            const alturaBarra = m.t + h - top
            const r = Math.min(4, alturaBarra)
            const x0 = cx0 - grosor / 2
            const path = alturaBarra > 0 ? `M${x0},${m.t + h} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + grosor - r} Q${x0 + grosor},${top} ${x0 + grosor},${top + r} V${m.t + h} Z` : ''
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} className="outline-none">
                <rect x={banda * i} y={m.t} width={banda} height={h} fill="transparent" />
                {path && <path d={path} fill={d.color ?? color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {d.valor !== null && (
                  <text x={cx0} y={top - 6} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ink)" className="tabular">
                    {formato(d.valor)}
                  </text>
                )}
                <text x={cx0} y={alto - 8} textAnchor="middle" fontSize={11.5} fill="var(--ink-3)">
                  {d.etiqueta}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && datos[hover]?.detalle && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-[10px] bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left: Math.min(ancho - 160, Math.max(0, banda * hover + banda / 2 - 80)), width: 160 }}>
          <p className="font-semibold">{datos[hover].etiqueta}</p>
          <p className="text-ink-2">{datos[hover].detalle}</p>
        </div>
      )}
    </div>
  )
}

export interface FilaBarra {
  id: string
  etiqueta: ReactNode
  sub?: ReactNode
  valor: number
  texto: ReactNode
  color?: string
  onClick?: () => void
  titulo?: string
}

export function ListaBarras({ filas, max, color = 'var(--series-1)', grosor = 6 }: { filas: FilaBarra[]; max?: number; color?: string; grosor?: number }) {
  const tope = max ?? Math.max(...filas.map((f) => f.valor), 1e-9)
  return (
    <ul className="flex flex-col">
      {filas.map((f) => {
        const ancho = `${Math.max(0, Math.min(1, f.valor / tope)) * 100}%`
        const Comp = f.onClick ? 'button' : 'div'
        return (
          <li key={f.id}>
            <Comp
              onClick={f.onClick}
              title={f.titulo}
              className={cx('group grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 rounded-[10px] px-2 py-2 text-left', f.onClick && 'transition-colors hover:bg-hover')}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{f.etiqueta}</div>
                {f.sub && <div className="truncate text-[11.5px] text-ink-2">{f.sub}</div>}
                <div className="mt-1.5 overflow-hidden rounded-full bg-fill-2" style={{ height: grosor }}>
                  <div className="h-full rounded-full transition-[width] duration-500 ease-apple" style={{ width: ancho, background: f.color ?? color }} />
                </div>
              </div>
              <div className="pb-0.5 text-right text-[13px] font-semibold tabular">{f.texto}</div>
            </Comp>
          </li>
        )
      })}
    </ul>
  )
}

export function BarraApilada({ segmentos, alto = 12 }: { segmentos: { id: string; etiqueta: string; valor: number; color: string; icono?: ReactNode }[]; alto?: number }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0)
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height: alto }} role="img" aria-label={segmentos.map((s) => `${s.etiqueta}: ${s.valor}`).join(', ')}>
        {total === 0 ? (
          <div className="h-full w-full bg-fill-2" />
        ) : (
          segmentos
            .filter((s) => s.valor > 0)
            .map((s) => (
              <div
                key={s.id}
                className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.valor / total) * 100}%`, background: s.color, opacity: hover && hover !== s.id ? 0.45 : 1 }}
                onPointerEnter={() => setHover(s.id)}
                onPointerLeave={() => setHover(null)}
                title={`${s.etiqueta}: ${s.valor} (${pct(s.valor / total, 0)})`}
              />
            ))
        )}
      </div>
    </div>
  )
}

export function Anillo({ valor, color, tam = 112, grosor = 10, children }: { valor: number | null; color: string; tam?: number; grosor?: number; children?: ReactNode }) {
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, valor ?? 0))
  return (
    <div className="relative shrink-0" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90" aria-hidden>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={grosor} />
        {valor !== null && v > 0 && (
          <circle
            cx={tam / 2}
            cy={tam / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            style={{ transition: 'stroke-dasharray 600ms var(--ease), stroke 300ms ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function Medidor({ valor, color = 'var(--accent)', marca, alto = 6, className }: { valor: number; color?: string; marca?: number; alto?: number; className?: string }) {
  return (
    <div className={cx('relative w-full overflow-visible rounded-full bg-fill-2', className)} style={{ height: alto }}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-apple" style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%`, background: color }} />
      {marca !== undefined && <div className="absolute -top-1 w-[2px] rounded-full bg-ink-2" style={{ left: `calc(${Math.min(1, marca) * 100}% - 1px)`, height: alto + 8 }} />}
    </div>
  )
}

export function estiloCalor(t: number | null, maximo = 0.5): React.CSSProperties {
  if (t === null) return {}
  const a = t <= 0 ? 0 : 0.1 + Math.min(1, t / maximo) * 0.78
  return { background: `rgba(var(--heat), ${a.toFixed(3)})`, color: a > 0.55 ? '#fff' : undefined }
}

export function LeyendaCalor({ maximo = 0.5 }: { maximo?: number }) {
  const pasos = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((p) => p <= maximo + 1e-9)
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-ink-2">
      <span>Tasa de error</span>
      <div className="flex overflow-hidden rounded-[5px]">
        {pasos.map((p) => (
          <span key={p} className="flex h-5 w-9 items-center justify-center text-[10.5px] tabular" style={p === 0 ? { background: 'var(--fill-2)' } : estiloCalor(p, maximo)}>
            {Math.round(p * 100)}%
          </span>
        ))}
      </div>
      <span>o más</span>
    </div>
  )
}

export function CalendarioMes({ mes, conteos, meta }: { mes: string; conteos: Map<string, number>; meta?: number }) {
  const dias = useMemo(() => {
    const [y, m] = mes.split('-').map(Number)
    const primero = new Date(y, m - 1, 1)
    const offset = (primero.getDay() + 6) % 7
    const total = new Date(y, m, 0).getDate()
    const celdas: (string | null)[] = Array.from({ length: offset }, () => null)
    for (let d = 1; d <= total; d++) celdas.push(aIso(new Date(y, m - 1, d)))
    return celdas
  }, [mes])
  const max = Math.max(meta ?? 0, ...conteos.values(), 1)
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10.5px] font-medium text-ink-3">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d, i) => {
          if (!d) return <span key={i} />
          const n = conteos.get(d) ?? 0
          const w = deIso(d).getDay()
          const finde = w === 0 || w === 6
          const a = n ? 0.18 + (n / max) * 0.7 : 0
          return (
            <span
              key={d}
              title={`${deIso(d).getDate()}: ${n} ${n === 1 ? 'evaluación' : 'evaluaciones'}`}
              className={cx('relative flex aspect-square items-center justify-center rounded-[6px] tabular', finde && !n && 'opacity-50')}
              style={n ? { background: `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)`, color: a > 0.5 ? '#fff' : 'var(--ink)' } : { background: 'var(--fill-2)' }}
            >
              <span className={cx('absolute top-[2px] left-[4px] text-[9px] leading-none', n ? 'opacity-75' : 'text-ink-3')}>{deIso(d).getDate()}</span>
              {n > 0 && <span className="mt-1 text-[12.5px] font-semibold">{n}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function useMontado() {
  const [m, setM] = useState(false)
  useEffect(() => setM(true), [])
  return m
}
