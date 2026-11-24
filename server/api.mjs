import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { aplicar, crearDbDesdeSeed, migrarDb } from '../src/shared/reducer.js'
import { OPS_SOLO_ADMIN, tokenDe, verificar } from './auth.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_CUERPO = 60 * 1024 * 1024
const RESPALDOS_A_CONSERVAR = 30

function leerSeed() {
  for (const p of [path.join(RAIZ, 'dist', 'seed.json'), path.join(RAIZ, 'public', 'seed.json')]) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  throw new Error('No se encontró seed.json. Ejecuta: npm run extraer')
}

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function escribirAtomico(archivo, contenido) {
  const tmp = `${archivo}.${process.pid}.tmp`
  fs.writeFileSync(tmp, contenido)
  for (let intento = 0; intento < 5; intento++) {
    try {
      fs.renameSync(tmp, archivo)
      return
    } catch (err) {
      if (intento === 4) {
        fs.copyFileSync(tmp, archivo)
        fs.rmSync(tmp, { force: true })
        return
      }
      const hasta = Date.now() + 40 * (intento + 1)
      while (Date.now() < hasta) {}
    }
  }
}

export function crearApi(opciones = {}) {
  const dirDatos = path.resolve(opciones.dirDatos || process.env.DATA_DIR || path.join(RAIZ, 'datos'))
  const dirRespaldos = path.join(dirDatos, 'respaldos')
  const archivo = path.join(dirDatos, 'portal.json')
  fs.mkdirSync(dirRespaldos, { recursive: true })

  let db
  let migrada = false
  if (fs.existsSync(archivo)) {
    const leida = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    db = migrarDb(leida)
    if (db !== leida) {
      db = { ...db, rev: (leida.rev || 0) + 1 }
      migrada = true
    }
  } else {
    db = crearDbDesdeSeed(leerSeed())
    escribirAtomico(archivo, JSON.stringify(db))
  }
  let ultimoRespaldo = ''
  const clientes = new Set()
  if (migrada) guardar()

  function guardar() {
    const hoy = hoyLocal()
    if (hoy !== ultimoRespaldo) {
      const destino = path.join(dirRespaldos, `portal-${hoy}.json`)
      if (!fs.existsSync(destino) && fs.existsSync(archivo)) fs.copyFileSync(archivo, destino)
      ultimoRespaldo = hoy
      const lista = fs.readdirSync(dirRespaldos).filter((f) => /^portal-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
      for (const viejo of lista.slice(0, Math.max(0, lista.length - RESPALDOS_A_CONSERVAR))) fs.rmSync(path.join(dirRespaldos, viejo), { force: true })
    }
    escribirAtomico(archivo, JSON.stringify(db))
  }

  function difundir(mensaje) {
    const datos = `event: op\ndata: ${JSON.stringify(mensaje)}\n\n`
    for (const res of clientes) res.write(datos)
  }

  function json(res, status, cuerpo, extra = {}) {
    const texto = JSON.stringify(cuerpo)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
    res.end(texto)
  }

  function leerCuerpo(req) {
    return new Promise((resolve, reject) => {
      let total = 0
      const partes = []
      req.on('data', (c) => {
        total += c.length
        if (total > MAX_CUERPO) {
          reject(new Error('El cuerpo de la solicitud es demasiado grande'))
          req.destroy()
        } else partes.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')))
      req.on('error', reject)
    })
  }

  return async function api(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next ? next() : json(res, 404, { error: 'No encontrado' })
    try {
      // Toda la API exige una sesión válida
      const usuario = await verificar(tokenDe(req, url))
      if (!usuario) return json(res, 401, { error: 'Sesión no válida o vencida. Vuelve a iniciar sesión.' })

      if (req.method === 'GET' && url.pathname === '/api/salud') {
        return json(res, 200, { ok: true, rev: db.rev, evaluaciones: db.evaluaciones.length })
      }
      if (req.method === 'GET' && url.pathname === '/api/estado') {
        return json(res, 200, db)
      }
      if (req.method === 'GET' && url.pathname === '/api/eventos') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        res.write(`retry: 3000\nevent: hola\ndata: ${JSON.stringify({ rev: db.rev })}\n\n`)
        clientes.add(res)
        const latido = setInterval(() => res.write(': latido\n\n'), 25000)
        req.on('close', () => {
          clearInterval(latido)
          clientes.delete(res)
        })
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/respaldo') {
        if (usuario.rol !== 'admin') return json(res, 403, { error: 'Solo el administrador puede descargar respaldos.' })
        const nombre = `portal-calidad-${hoyLocal()}.json`
        return json(res, 200, db, { 'Content-Disposition': `attachment; filename="${nombre}"` })
      }
      if (req.method === 'POST' && url.pathname === '/api/op') {
        const cuerpo = JSON.parse(await leerCuerpo(req))
        if (OPS_SOLO_ADMIN.has(cuerpo.op) && usuario.rol !== 'admin') {
          return json(res, 403, { error: 'Tu rol no tiene permiso para esta acción.' })
        }
        let env = {
          opId: cuerpo.opId || randomUUID(),
          op: cuerpo.op,
          payload: cuerpo.payload,
          por: usuario.nombre, // el nombre sale del token, no del navegador
          now: new Date().toISOString(),
        }
        if (env.op === 'datos.reiniciar') env = { ...env, op: 'datos.restaurar', payload: { db: crearDbDesdeSeed(leerSeed()) } }
        if (env.op === 'datos.restaurar' && (!env.payload?.db?.evaluaciones || !env.payload?.db?.catalogo)) {
          return json(res, 400, { error: 'El archivo de respaldo no tiene el formato del portal.' })
        }
        const r = aplicar(db, env, { autoritativo: true })
        db = r.db
        db.rev = (db.rev || 0) + 1
        guardar()
        const mensaje = { rev: db.rev, opId: env.opId, op: env.op, payload: r.payload, por: env.por, now: env.now }
        difundir(mensaje)
        return json(res, 200, { ok: true, ...mensaje })
      }
      return json(res, 404, { error: 'Ruta de API no encontrada' })
    } catch (err) {
      console.error('[api]', err)
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }
}