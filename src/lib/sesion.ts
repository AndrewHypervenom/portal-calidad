import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Perfil } from './supabase'

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