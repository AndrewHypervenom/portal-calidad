import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')


function leerEnv() {
  const archivo = path.join(RAIZ, '.env')
  if (!fs.existsSync(archivo)) return {}
  const vars = {}
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(linea)
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return vars
}

const env = { ...leerEnv(), ...process.env }
const URL_SB = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const LLAVE = env.VITE_SUPABASE_ANON_KEY || ''
if (!URL_SB || !LLAVE) console.warn('[auth] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env: la API rechazará todas las peticiones.')


export const OPS_SOLO_ADMIN = new Set([
  'agente.guardar',
  'agente.eliminar',
  'analista.guardar',
  'analista.eliminar',
  'config.actualizar',
  'catalogo.item',
  'operacion.parametro',
  'operacion.tarea',
  'operacion.kpi',
  'evaluaciones.importar',
  'datos.restaurar',
  'datos.reiniciar',
])


const cache = new Map()
const DURACION_MS = 60_000


export function tokenDe(req, url) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')
  return m ? m[1] : url.searchParams.get('token') || ''
}


export async function verificar(token) {
  if (!token || !URL_SB || !LLAVE) return null
  const guardado = cache.get(token)
  if (guardado && guardado.vence > Date.now()) return guardado.usuario

  try {
    const cabeceras = { apikey: LLAVE, Authorization: `Bearer ${token}` }

    // 1. ¿De quién es este token?
    const ru = await fetch(`${URL_SB}/auth/v1/user`, { headers: cabeceras })
    if (!ru.ok) return null
    const user = await ru.json()

    // 2. Su perfil (se lee con el mismo token, así que aplica el RLS)
    const rp = await fetch(`${URL_SB}/rest/v1/perfiles?id=eq.${encodeURIComponent(user.id)}&select=id,nombre,rol,activo`, { headers: cabeceras })
    if (!rp.ok) return null
    const [perfil] = await rp.json()
    if (!perfil || !perfil.activo) return null

    const usuario = { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol }
    if (cache.size > 500) cache.clear()
    cache.set(token, { usuario, vence: Date.now() + DURACION_MS })
    return usuario
  } catch (err) {
    console.error('[auth] No se pudo validar el token con Supabase:', err)
    return null
  }
}