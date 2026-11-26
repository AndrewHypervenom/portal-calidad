import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'


const VIGENCIA_MS = 48 * 60 * 60 * 1000


export const FIRMANTE_AGENTE = { retro: 'colaborador', carta: 'agente', acta: 'agente' }


export function crearFirmas(dirDatos) {
  const archivo = path.join(dirDatos, 'enlaces-firma.json')
  let enlaces = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : []

  const guardar = () => fs.writeFileSync(archivo, JSON.stringify(enlaces, null, 2))
  const huella = (token) => createHash('sha256').update(token).digest('hex')

  function estado(e) {
    if (e.usadoEn) return 'firmado'
    if (e.revocadoEn) return 'revocado'
    if (Date.parse(e.venceEn) < Date.now()) return 'vencido'
    return 'activo'
  }

  
  function publico(e) {
    const { tokenHash, ...resto } = e
    return { ...resto, estado: estado(e) }
  }

  return {
    estado,


    crear({ documentoId, firmante, correo, por }) {
      const ahora = new Date().toISOString()
      for (const e of enlaces) if (e.documentoId === documentoId && estado(e) === 'activo') e.revocadoEn = ahora
      const token = randomBytes(32).toString('base64url')
      const enlace = {
        id: randomUUID(),
        tokenHash: huella(token),
        documentoId,
        firmante,
        correo,
        creadoPor: por,
        creadoEn: ahora,
        venceEn: new Date(Date.now() + VIGENCIA_MS).toISOString(),
        usadoEn: null,
        revocadoEn: null,
      }
      enlaces.push(enlace)
      guardar()
      return { token, enlace: publico(enlace) }
    },

    listar(documentoId) {
      return enlaces.filter((e) => e.documentoId === documentoId).map(publico).reverse()
    },

    revocar(id) {
      const e = enlaces.find((x) => x.id === id)
      if (!e || estado(e) !== 'activo') return false
      e.revocadoEn = new Date().toISOString()
      guardar()
      return true
    },

    buscar(token) {
      const h = huella(token)
      return enlaces.find((e) => e.tokenHash === h) ?? null
    },

    marcarUsado(e, extra) {
      Object.assign(e, { usadoEn: new Date().toISOString(), ...extra })
      guardar()
    },

    nuevoId: () => randomUUID(),
  }
}