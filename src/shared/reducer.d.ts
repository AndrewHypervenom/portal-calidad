import type { DB } from '../lib/types'

export interface Envelope {
  opId?: string
  op: string
  payload: any
  por?: string
  now?: string
}

export function crearDbDesdeSeed(seed: any, now?: string): DB
export function aplicar(db: DB, env: Envelope, opciones?: { autoritativo?: boolean }): { db: DB; payload: any; env: Envelope }
export const VERSION_DB: number
export function migrarDb<T extends DB | null | undefined>(db: T): T
