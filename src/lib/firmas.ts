import { tokenSesion } from './sesion'

export type EstadoEnlace = 'activo' | 'firmado' | 'vencido' | 'revocado'

export interface EnlaceFirma {
  id: string
  documentoId: string
  firmante: string
  correo: string
  creadoPor: string
  creadoEn: string
  venceEn: string
  usadoEn: string | null
  revocadoEn: string | null
  estado: EstadoEnlace
}

export const ETIQUETA_ESTADO_ENLACE: Record<EstadoEnlace, string> = {
  activo: 'Pendiente de firma',
  firmado: 'Firmado',
  vencido: 'Vencido',
  revocado: 'Anulado',
}


async function api<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(ruta, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion()}`, ...((init.headers as Record<string, string>) ?? {}) },
  })
  const cuerpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(cuerpo.error || 'No se pudo completar la acción')
  return cuerpo as T
}


export function urlFirma(token: string): string {
  return `${location.origin}${location.pathname}#/firmar/${token}`
}

export function listarEnlaces(documentoId: string) {
  return api<EnlaceFirma[]>(`/api/firmas/enlaces?documentoId=${encodeURIComponent(documentoId)}`)
}

export async function crearEnlace(documentoId: string, correo: string) {
  const r = await api<{ token: string; enlace: EnlaceFirma }>('/api/firmas/enlaces', {
    method: 'POST',
    body: JSON.stringify({ documentoId, correo }),
  })
  return { url: urlFirma(r.token), enlace: r.enlace }
}

export function revocarEnlace(id: string) {
  return api<{ ok: boolean }>(`/api/firmas/enlaces/${id}`, { method: 'DELETE' })
}


export function abrirCorreo(o: { correo: string; nombre: string; documento: string; folio: string; url: string; venceEn: string }) {
  const vence = new Date(o.venceEn).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
  const asunto = `Firma pendiente: ${o.documento} ${o.folio}`
  const cuerpo = [
    `Hola ${o.nombre},`,
    '',
    `El área de Calidad te comparte el documento "${o.documento}" (${o.folio}) para tu revisión y firma.`,
    '',
    'Ábrelo en este enlace:',
    o.url,
    '',
    `El enlace es personal, sirve una sola vez y vence el ${vence}.`,
    'Si tienes alguna observación, puedes dejarla al momento de firmar.',
    '',
    'Gracias,',
    'Área de Calidad',
  ].join('\n')
  window.location.href = `mailto:${o.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}