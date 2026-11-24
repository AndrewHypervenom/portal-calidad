const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function aIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function deIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function hoyIso(): string {
  return aIso(new Date())
}

export function diaLocal(marca: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(marca)) return marca
  const d = new Date(marca)
  return Number.isNaN(d.getTime()) ? marca.slice(0, 10) : aIso(d)
}

export function sumarDias(iso: string, dias: number): string {
  const d = deIso(iso)
  d.setDate(d.getDate() + dias)
  return aIso(d)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((deIso(hasta).getTime() - deIso(desde).getTime()) / 86400000)
}

export function semanaDelMes(iso: string): number {
  const d = deIso(iso)
  const primero = new Date(d.getFullYear(), d.getMonth(), 1)
  const offset = (primero.getDay() + 6) % 7
  return Math.floor((d.getDate() + offset - 1) / 7) + 1
}

export function inicioSemana(iso: string): string {
  const d = deIso(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return aIso(d)
}

export function claveMes(iso: string): string {
  return iso.slice(0, 7)
}

export function nombreMes(clave: string, conAnio = true): string {
  const [y, m] = clave.split('-').map(Number)
  return conAnio ? `${MESES[m - 1]} ${y}` : MESES[m - 1]
}

export function nombreMesCapital(clave: string): string {
  const t = nombreMes(clave)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function primerDiaMes(clave: string): string {
  return `${clave}-01`
}

export function ultimoDiaMes(clave: string): string {
  const [y, m] = clave.split('-').map(Number)
  return aIso(new Date(y, m, 0))
}

export function mesAnterior(clave: string): string {
  const [y, m] = clave.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return aIso(d).slice(0, 7)
}

export function diasHabiles(desde: string, hasta: string): number {
  if (hasta < desde) return 0
  let n = 0
  const d = deIso(desde)
  const fin = deIso(hasta)
  while (d <= fin) {
    const w = d.getDay()
    if (w !== 0 && w !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

export function fechaCorta(iso?: string | null): string {
  if (!iso) return '—'
  const d = deIso(iso)
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

export function fechaMedia(iso?: string | null): string {
  if (!iso) return '—'
  const d = deIso(iso)
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}

export function fechaConDia(iso?: string | null): string {
  if (!iso) return '—'
  const d = deIso(iso)
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

export function fechaLarga(iso?: string | null): string {
  if (!iso) return '—'
  const d = deIso(iso)
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

export function partesFecha(iso: string) {
  const d = deIso(iso)
  return { dia: d.getDate(), mes: MESES[d.getMonth()], anio: d.getFullYear() }
}

export function fechaHora(isoDateTime?: string | null): string {
  if (!isoDateTime) return '—'
  const d = new Date(isoDateTime)
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} · ${hh}:${mm}`
}

export function haceCuanto(isoDateTime: string, ahora = new Date()): string {
  const d = new Date(isoDateTime)
  const seg = Math.round((ahora.getTime() - d.getTime()) / 1000)
  if (seg < 60) return 'hace un momento'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.round(h / 24)
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return fechaMedia(aIso(d))
}

export { MESES, MESES_CORTOS }
