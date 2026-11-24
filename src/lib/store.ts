import { useSyncExternalStore } from 'react'
import { aplicar, crearDbDesdeSeed, migrarDb } from '../shared/reducer.js'
import type { DB, OpName } from './types'
import { uid } from './format'

export type Modo = 'servidor' | 'local'
export type Conexion = 'conectando' | 'en-linea' | 'reconectando' | 'local'

export interface EstadoStore {
  db: DB | null
  modo: Modo
  conexion: Conexion
  error: string | null
}

interface MensajeOp {
  rev: number
  opId: string
  op: string
  payload: unknown
  por: string
  now: string
}

const IDB_NOMBRE = 'portal-calidad'
const IDB_CLAVE = 'db'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NOMBRE, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function leerLocal(): Promise<DB | null> {
  try {
    const base = await idb()
    return await new Promise((resolve) => {
      const tx = base.transaction('kv', 'readonly').objectStore('kv').get(IDB_CLAVE)
      tx.onsuccess = () => resolve((tx.result as DB) ?? null)
      tx.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function escribirLocal(db: DB): Promise<void> {
  try {
    const base = await idb()
    await new Promise<void>((resolve) => {
      const tx = base.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(db, IDB_CLAVE)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
  }
}

async function cargarSeed(): Promise<DB> {
  const r = await fetch(`${import.meta.env.BASE_URL}seed.json`, { cache: 'no-store' })
  return crearDbDesdeSeed(await r.json())
}

class Store {
  private estado: EstadoStore = { db: null, modo: 'servidor', conexion: 'conectando', error: null }
  private oyentes = new Set<() => void>()
  private eventos: EventSource | null = null
  private sondeo: ReturnType<typeof setInterval> | null = null
  private temporizador: ReturnType<typeof setTimeout> | null = null
  private recargando = false
  por = ''

  subscribe = (fn: () => void) => {
    this.oyentes.add(fn)
    return () => {
      this.oyentes.delete(fn)
    }
  }

  get = () => this.estado

  private set(parcial: Partial<EstadoStore>) {
    this.estado = { ...this.estado, ...parcial }
    for (const fn of this.oyentes) fn()
  }

  async iniciar() {
    try {
      const r = await fetch('/api/estado', { cache: 'no-store' })
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sin api')
      const db = (await r.json()) as DB
      this.set({ db, modo: 'servidor', conexion: 'en-linea', error: null })
      this.conectarEventos()
    } catch {
      try {
        const db = migrarDb((await leerLocal()) ?? (await cargarSeed()))
        this.set({ db, modo: 'local', conexion: 'local', error: null })
      } catch (err) {
        this.set({ error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  private conectarEventos() {
    this.eventos?.close()
    const es = new EventSource('/api/eventos')
    this.eventos = es
    let saludo = false
    es.addEventListener('hola', (e) => {
      saludo = true
      this.detenerSondeo()
      const { rev } = JSON.parse((e as MessageEvent).data)
      this.set({ conexion: 'en-linea' })
      if (rev !== this.estado.db?.rev) void this.recargar()
    })
    es.addEventListener('op', (e) => this.recibir(JSON.parse((e as MessageEvent).data)))
    es.onerror = () => {
      if (!this.sondeo) this.set({ conexion: 'reconectando' })
    }
    setTimeout(() => {
      if (!saludo) this.iniciarSondeo()
    }, 6000)
  }

  private iniciarSondeo() {
    if (this.sondeo) return
    const revisar = async () => {
      try {
        const r = await fetch('/api/salud', { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const { rev } = (await r.json()) as { rev: number }
        this.set({ conexion: 'en-linea' })
        if (rev !== this.estado.db?.rev) await this.recargar()
      } catch {
        this.set({ conexion: 'reconectando' })
      }
    }
    this.sondeo = setInterval(() => void revisar(), 4000)
    void revisar()
  }

  private detenerSondeo() {
    if (this.sondeo) clearInterval(this.sondeo)
    this.sondeo = null
  }

  private recibir(m: MensajeOp) {
    const db = this.estado.db
    if (!db || m.rev <= db.rev) return
    if (m.rev !== db.rev + 1) {
      void this.recargar()
      return
    }
    try {
      const r = aplicar(db, { opId: m.opId, op: m.op, payload: m.payload, por: m.por, now: m.now })
      this.set({ db: { ...r.db, rev: m.rev } })
    } catch {
      void this.recargar()
    }
  }

  async recargar() {
    if (this.estado.modo !== 'servidor' || this.recargando) return
    this.recargando = true
    try {
      const r = await fetch('/api/estado', { cache: 'no-store' })
      if (r.ok) this.set({ db: (await r.json()) as DB })
    } finally {
      this.recargando = false
    }
  }

  private guardarLocal() {
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = setTimeout(() => {
      if (this.estado.db) void escribirLocal(this.estado.db)
    }, 250)
  }

  async op<T = any>(op: OpName, payload: unknown): Promise<T> {
    const db = this.estado.db
    if (!db) throw new Error('Los datos aún no se cargan')
    let env = { opId: uid(), op: op as string, payload, por: this.por, now: new Date().toISOString() }

    if (this.estado.modo === 'local') {
      if (op === 'datos.reiniciar') env = { ...env, op: 'datos.restaurar', payload: { db: await cargarSeed() } }
      const r = aplicar(db, env)
      this.set({ db: { ...r.db, rev: db.rev + 1 } })
      this.guardarLocal()
      return r.payload as T
    }

    const masiva = op === 'evaluaciones.importar' || op === 'datos.restaurar' || op === 'datos.reiniciar'
    if (!masiva) {
      try {
        const r = aplicar(db, env)
        this.set({ db: { ...r.db, rev: db.rev } })
      } catch {
      }
    }
    let resp: Response
    try {
      resp = await fetch('/api/op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) })
    } catch {
      await this.recargar()
      throw new Error('No hay conexión con el servidor; el cambio no se guardó.')
    }
    const cuerpo = await resp.json()
    if (!resp.ok) {
      await this.recargar()
      throw new Error(cuerpo.error || 'No se pudo guardar el cambio')
    }
    this.recibir(cuerpo as MensajeOp)
    return cuerpo.payload as T
  }
}

export const store = new Store()

export function useStore(): EstadoStore {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

export function useDb(): DB {
  const { db } = useStore()
  if (!db) throw new Error('Base de datos no cargada')
  return db
}
