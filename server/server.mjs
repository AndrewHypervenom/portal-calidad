import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { crearApi } from './api.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(RAIZ, 'dist')
const args = process.argv.slice(2)
const red = args.includes('--red') || process.env.HOST === '0.0.0.0'
const iPuerto = args.indexOf('--puerto')
const PUERTO = Number(iPuerto >= 0 ? args[iPuerto + 1] : process.env.PORT || 4173)
const HOST = red ? '0.0.0.0' : process.env.HOST || '127.0.0.1'

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No existe dist/. Compila primero con:  npm run build')
  process.exit(1)
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain; charset=utf-8',
}

const api = crearApi()

const CLAVE = process.env.PORTAL_CLAVE || ''
const USUARIO = process.env.PORTAL_USUARIO || 'calidad'
const PUBLICOS = new Set(['/manifest.webmanifest', '/favicon.png', '/apple-touch-icon.png', '/icono-512.png'])
const huella = (texto) => createHash('sha256').update(texto).digest()
const ESPERADA = huella(`${USUARIO}:${CLAVE}`)

function autorizado(req) {
  const m = /^Basic\s+(\S+)$/i.exec(req.headers.authorization || '')
  return !!m && timingSafeEqual(huella(Buffer.from(m[1], 'base64').toString('utf8')), ESPERADA)
}

function servirArchivo(res, archivo, cacheLarga) {
  const ext = path.extname(archivo).toLowerCase()
  res.writeHead(200, {
    'Content-Type': TIPOS[ext] || 'application/octet-stream',
    'Cache-Control': cacheLarga ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  fs.createReadStream(archivo).pipe(res)
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (CLAVE && !PUBLICOS.has(url.pathname) && !autorizado(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Portal de Calidad", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end('Portal de Calidad: escribe el usuario y la contraseña que te compartieron.')
  }
  if (url.pathname.startsWith('/api/')) return api(req, res)
  let ruta = decodeURIComponent(url.pathname)
  const destino = path.normalize(path.join(DIST, ruta))
  if (!destino.startsWith(DIST)) {
    res.writeHead(403)
    return res.end()
  }
  if (ruta !== '/' && fs.existsSync(destino) && fs.statSync(destino).isFile()) {
    return servirArchivo(res, destino, ruta.startsWith('/assets/'))
  }
  servirArchivo(res, path.join(DIST, 'index.html'), false)
})

servidor.listen(PUERTO, HOST, () => {
  console.log('\n  Portal de Calidad · Positivo S+')
  console.log(`  ➜  Este equipo:   http://localhost:${PUERTO}`)
  if (red) {
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) console.log(`  ➜  Red local:     http://${i.address}:${PUERTO}`)
    }
  } else {
    console.log('     (para compartir en la red local usa:  npm run start:red)')
  }
  if (CLAVE) console.log(`  Acceso protegido: usuario «${USUARIO}» y la contraseña de PORTAL_CLAVE`)
  console.log(`  Datos en: ${path.join(process.env.DATA_DIR || path.join(RAIZ, 'datos'), 'portal.json')}\n`)
})
