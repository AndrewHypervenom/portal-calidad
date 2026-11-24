const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function num(v: number | null | undefined, dec = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (dec === 0) return nf0.format(v)
  if (dec === 1) return nf1.format(v)
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v)
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const x = v * 100
  if (Math.abs(x - Math.round(x)) < 1e-7) return `${Math.round(x)}%`
  if (dec === 0) return `${Math.round(x)}%`
  const f = 10 ** dec
  let r = Math.round(x * f) / f
  if (r > x && Number.isInteger(r)) r = Math.floor(x * f) / f
  return `${r.toFixed(dec)}%`
}

export function pctCorto(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const x = v * 100
  if (Math.abs(x - Math.round(x)) < 1e-7) return `${Math.round(x)}%`
  return `${Math.floor(x)}%`
}

export function deltaPts(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const x = v * 100
  const s = x > 0.05 ? '+' : x < -0.05 ? '−' : '±'
  return `${s}${Math.abs(x).toFixed(1)} pts`
}

export function duracion(seg: number | null | undefined): string {
  if (seg === null || seg === undefined) return '—'
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = Math.round(seg % 60)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function parseDuracion(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  const partes = t.split(/[:.]/).map((p) => p.trim())
  if (partes.some((p) => p === '' || !/^\d+$/.test(p))) return null
  const n = partes.map(Number)
  if (n.length === 1) return n[0] >= 100 ? Math.floor(n[0] / 100) * 60 + (n[0] % 100) : n[0] * 60
  if (n.length === 2) return n[1] < 60 ? n[0] * 60 + n[1] : null
  if (n.length === 3) return n[1] < 60 && n[2] < 60 ? n[0] * 3600 + n[1] * 60 + n[2] : null
  return null
}

export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter((x) => !['de', 'del', 'la', 'las', 'los', 'y'].includes(x.toLowerCase()))
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + (p.length > 2 ? p[p.length - 2][0] : p[1][0])).toUpperCase()
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von'])

export function nombreCorto(nombre: string): string {
  const p = nombre.trim().split(/\s+/)
  if (p.length <= 2) return nombre.trim()
  let i = p.length - 2
  if (PARTICULAS.has(p[i].toLowerCase()) && i - 1 >= 1) i--
  return `${p[0]} ${p[i]}`
}

export function plural(n: number, uno: string, varios: string): string {
  return `${num(n)} ${n === 1 ? uno : varios}`
}

export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function compacto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`
  return num(n)
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
