import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Perfil } from './supabase'
import { avisar } from '../components/feedback'

export interface EstadoSesion {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  error: string | null
}

let estado: EstadoSesion = { cargando: true, sesion: null, perfil: null, error: null }
const oyentes = new Set<() => void>()

function set(parcial: Partial<EstadoSesion>) {
  estado = { ...estado, ...parcial }
  for (const fn of oyentes) fn()
}

async function cargarPerfil(sesion: Session | null) {
  if (!sesion) {
    set({ cargando: false, sesion: null, perfil: null })
    return
  }
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', sesion.user.id).maybeSingle()
  if (error || !data || !data.activo) {
    await supabase.auth.signOut()
    set({ cargando: false, sesion: null, perfil: null, error: 'Tu usuario no tiene acceso al portal. Contacta al administrador.' })
    return
  }
  set({ cargando: false, sesion, perfil: data as Perfil, error: null })
}


supabase.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'TOKEN_REFRESHED') {
    set({ sesion })
    return
  }
 
  setTimeout(() => void cargarPerfil(sesion), 0)
})

export async function iniciarSesion(correo: string, clave: string): Promise<boolean> {
  set({ error: null })
  const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
  if (error) {
    console.error('Error de Supabase:', error.message, error) // TEMPORAL
    set({ error: 'Correo o contraseña incorrectos.' })
    return false
  }
  registrarActividad()
  return true
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
}

const suscribir = (fn: () => void) => {
  oyentes.add(fn)
  return () => {
    oyentes.delete(fn)
  }
}
const leer = () => estado

export function useSesion(): EstadoSesion {
  return useSyncExternalStore(suscribir, leer, leer)
}

export function tokenSesion(): string {
  return estado.sesion?.access_token ?? ''
}


const INACTIVIDAD_MS = 30 * 60 * 1000
const AVISO_MS = 2 * 60 * 1000


const tiempoTexto = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} minuto${ms >= 120_000 ? 's' : ''}` : `${Math.round(ms / 1000)} segundos`)
let ultimaActividad = Date.now()
let avisado = false

function registrarActividad() {
  ultimaActividad = Date.now()
  avisado = false
}


for (const evento of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const) {
  window.addEventListener(evento, registrarActividad, { passive: true, capture: true })
}

function revisarInactividad() {
  if (!estado.perfil) return
  const inactivo = Date.now() - ultimaActividad
  if (inactivo >= INACTIVIDAD_MS) {
    avisado = false
    void supabase.auth.signOut().then(() => set({ error: `Tu sesión se cerró después de ${tiempoTexto(INACTIVIDAD_MS)} sin actividad.` }))
  } else if (inactivo >= INACTIVIDAD_MS - AVISO_MS && !avisado) {
    avisado = true
    avisar({
      tipo: 'info',
      titulo: 'Tu sesión se cerrará pronto',
      texto: `Por inactividad, en ${tiempoTexto(AVISO_MS)}. Mueve el mouse o presiona una tecla para seguir conectado.`,
      duracion: AVISO_MS,
    })
  }
}


setInterval(revisarInactividad, 5_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revisarInactividad()
})