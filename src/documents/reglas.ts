import type { Documento, Evaluacion, TipoDoc } from '../lib/types'

export const NOMBRE_DOC: Record<TipoDoc, string> = {
  retro: 'Formato de Retroalimentación',
  carta: 'Carta de compromiso',
  acta: 'Acta administrativa',
}

export const NOMBRE_DOC_CORTO: Record<TipoDoc, string> = { retro: 'Retro', carta: 'Carta', acta: 'Acta' }

export interface Firmante {
  id: string
  etiqueta: string
  campoNombre: string
}

export const FIRMANTES: Record<TipoDoc, Firmante[]> = {
  retro: [
    { id: 'colaborador', etiqueta: 'Firma del Colaborador', campoNombre: 'agente' },
    { id: 'supOperaciones', etiqueta: 'Firma del Supervisor de Operaciones', campoNombre: 'supervisor' },
    { id: 'analista', etiqueta: 'Firma del Analista de Calidad', campoNombre: 'auditor' },
    { id: 'supCalidad', etiqueta: 'Firma del Supervisor de Calidad', campoNombre: 'supCalidad' },
  ],
  carta: [
    { id: 'supervisor', etiqueta: 'Firma del Supervisor', campoNombre: 'supervisor' },
    { id: 'analista', etiqueta: 'Firma del Analista de Calidad', campoNombre: 'analista' },
    { id: 'agente', etiqueta: 'Firma del Asociado / Agente', campoNombre: 'asociado' },
    { id: 'testigo', etiqueta: 'Testigo', campoNombre: 'testigo' },
  ],
  acta: [
    { id: 'calidad', etiqueta: 'Área de calidad', campoNombre: 'analista' },
    { id: 'supOperaciones', etiqueta: 'Supervisor de Operaciones', campoNombre: 'supervisor' },
    { id: 'agente', etiqueta: 'Agente de Operaciones', campoNombre: 'agente' },
    { id: 'talentoHumano', etiqueta: 'Talento Humano', campoNombre: 'talentoHumano' },
  ],
}

export interface CampoDoc {
  id: string
  etiqueta: string
  multilinea?: boolean
  ayuda?: string
  opciones?: string[]
  tipo?: 'time'
}

export const CAMPOS: Record<TipoDoc, CampoDoc[]> = {
  retro: [
    { id: 'agente', etiqueta: 'Nombre del agente' },
    { id: 'auditor', etiqueta: 'Nombre del auditor' },
    { id: 'fechaLlamada', etiqueta: 'Fecha de la llamada' },
    { id: 'fechaEvaluacion', etiqueta: 'Fecha de la evaluación' },
    { id: 'tipoAuditoria', etiqueta: 'Tipo de auditoría' },
    { id: 'centroResultados', etiqueta: 'Centro de resultados' },
    { id: 'caso', etiqueta: 'Caso' },
    { id: 'duracion', etiqueta: 'Duración' },
    { id: 'calificacion', etiqueta: 'Calificación' },
    { id: 'criterios', etiqueta: 'Criterios de la auditoría', multilinea: true },
    { id: 'areas', etiqueta: 'Áreas de oportunidad', multilinea: true },
    { id: 'compromiso', etiqueta: 'Compromiso del agente', multilinea: true },
    { id: 'porQue', etiqueta: '¿Por qué se generó este error en el proceso?', multilinea: true },
    { id: 'desconocia', etiqueta: '¿Desconocía esta información?', opciones: ['Sí', 'No'], ayuda: 'Si responde “Sí”, la causa raíz sugerida es SABER.' },
    { id: 'supervisor', etiqueta: 'Supervisor de operaciones' },
    { id: 'supCalidad', etiqueta: 'Supervisor de calidad' },
    { id: 'cc', etiqueta: 'C.C.' },
  ],
  carta: [
    { id: 'fecha', etiqueta: 'Fecha de implementación' },
    { id: 'creadoPor', etiqueta: 'Creado / modificado por' },
    { id: 'asociado', etiqueta: 'Nombre del asociado' },
    { id: 'area', etiqueta: 'Área' },
    { id: 'motivo', etiqueta: 'Incumplimientos relacionados con' },
    { id: 'incumplimientos', etiqueta: 'Incumplimientos identificados', multilinea: true },
    { id: 'compromisos', etiqueta: 'El colaborador se compromete a', multilinea: true },
    { id: 'supervisor', etiqueta: 'Supervisor' },
    { id: 'analista', etiqueta: 'Analista de calidad' },
    { id: 'testigo', etiqueta: 'Testigo' },
  ],
  acta: [
    { id: 'dia', etiqueta: 'Día' },
    { id: 'mes', etiqueta: 'Mes' },
    { id: 'anio', etiqueta: 'Año' },
    { id: 'hora', etiqueta: 'Hora de la reunión', tipo: 'time' },
    { id: 'ciudad', etiqueta: 'Ciudad' },
    { id: 'agente', etiqueta: 'Colaborador' },
    { id: 'puesto', etiqueta: 'Puesto' },
    { id: 'analista', etiqueta: 'Analista de calidad' },
    { id: 'supervisor', etiqueta: 'Supervisor de operaciones' },
    { id: 'motivos', etiqueta: 'Motivos', multilinea: true },
    { id: 'talentoHumano', etiqueta: 'Talento Humano' },
  ],
}

export function camposFaltantes(doc: Documento, ev?: Evaluacion): { id: string; etiqueta: string }[] {
  const c = doc.campos
  const vacio = (k: string) => !(c[k] ?? '').trim()
  const faltan: { id: string; etiqueta: string }[] = []
  const falta = (id: string, etiqueta: string) => faltan.push({ id, etiqueta })
  if (doc.tipo === 'retro') {
    const conHallazgo = ev ? Object.entries(ev.respuestas).some(([k, r]) => r === 'N' && k in ev.pesos) : true
    if (conHallazgo) {
      if (!(c.compromiso ?? '').replace(/^\s*me comprometo a\.*\s*/i, '').trim()) falta('compromiso', 'Compromiso del agente')
      if (vacio('porQue')) falta('porQue', '¿Por qué se generó este error?')
      if (vacio('desconocia')) falta('desconocia', '¿Desconocía esta información?')
    }
    if (vacio('supervisor')) falta('supervisor', 'Supervisor de operaciones')
  } else if (doc.tipo === 'carta') {
    if (vacio('incumplimientos')) falta('incumplimientos', 'Incumplimientos identificados')
    if (vacio('compromisos')) falta('compromisos', 'Compromisos del colaborador')
    if (vacio('supervisor')) falta('supervisor', 'Supervisor')
  } else {
    if (vacio('hora')) falta('hora', 'Hora de la reunión')
    if (vacio('ciudad')) falta('ciudad', 'Ciudad')
    if (vacio('motivos')) falta('motivos', 'Motivos')
    if (vacio('supervisor')) falta('supervisor', 'Supervisor de operaciones')
  }
  return faltan
}

export function estadoFirmas(doc: Documento): { firmadas: number; total: number; completo: boolean } {
  const total = FIRMANTES[doc.tipo].length
  const firmadas = FIRMANTES[doc.tipo].filter((f) => doc.firmas?.[f.id]).length
  return { firmadas, total, completo: firmadas === total }
}
