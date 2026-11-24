import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !llave) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env')
}

export const supabase = createClient(url, llave, {
  auth: { persistSession: true, autoRefreshToken: true },
})


export type Rol = 'admin' | 'analista'


export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  analista: 'Analista de calidad',
}

export interface Perfil {
  id: string
  nombre: string
  correo: string
  rol: Rol
  analista_id: string | null
  activo: boolean
}