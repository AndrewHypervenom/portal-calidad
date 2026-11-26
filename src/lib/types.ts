export type Canal = 'Inbound' | 'Monitoreo'
export type Resp = 'S' | 'N' | 'A'
export type CriticoModo = 'siempre' | 'motivo' | 'no'
export type Semaforo = 'verde' | 'amarillo' | 'rojo'
export type Causa = 'SABER' | 'PODER' | 'QUERER'
export type TipoDoc = 'retro' | 'carta' | 'acta'

export interface Motivo {
  label: string
  critico: boolean
}

export interface ItemDef {
  key: string
  canal: Canal
  bloque: string
  topico: string
  tema: string
  fila: number
  motivos?: Motivo[]
}

export interface CedulaItem {
  key: string
  peso: number
  critico: CriticoModo
  cuandoSi?: string
  cuandoNo?: string
}

export interface Cedula {
  id: string
  canal: Canal
  nombre: string
  nombreExcel: string
  alias: string[]
  tiposLlamada?: string[]
  items: CedulaItem[]
  total: number
}

export interface Descriptor {
  grupo: string
  tema: string
  descripcion: string
  porQue: string
}

export interface MapeoAcumulado {
  respuestas: Record<string, string>
  motivos: Record<string, string>
  areas: Record<string, string>
  campos: Record<string, string>
}

export interface Catalogo {
  items: Record<string, ItemDef>
  cedulas: Cedula[]
  descriptores: { Inbound: Descriptor[]; Monitoreo: Descriptor[]; notaMonitoreo: string }
  acumulado: Record<Canal, MapeoAcumulado>
}

export type Dictamen = 'acredita' | 'no-acredita'

export interface Agente {
  id: string
  nombre: string
  canal: Canal
  proceso: string
  activo: boolean
  alias?: string[]
  idProvisional?: boolean
  supervisor?: string
  correo?: string
  fechaIngreso?: string
  analistaId?: string
  dictamen?: Dictamen
  fechaDictamen?: string
}

export interface Calibracion {
  id: string
  fecha: string
  referencia: string
  canal: Canal
  cedulaId?: string
  puntajes: Record<string, number>
  notas: string
  creadoPor?: string
}

export interface Analista {
  id: string
  nombre: string
  corto: string
  activo: boolean
  alias: string[]
}

export interface OrigenEval {
  tipo: 'excel' | 'portal'
  archivo?: string
  fila?: number
  folioExcel?: number | string
  promedioExcel?: number | string | null
  agenteOriginal?: string
  idOriginal?: string | null
}

export interface Evaluacion {
  id: string
  folio: string
  canal: Canal
  cedulaId: string
  tipoLlamada: string
  proceso: string
  agenteId: string
  agenteNombre: string
  analistaId: string
  analista: string
  fechaLlamada: string | null
  fechaEvaluacion: string
  semana: number
  duracionSeg: number | null
  idCaso: string
  tipoAuditoria?: string
  respuestas: Record<string, Resp>
  motivos: Record<string, string>
  areas: Record<string, string>
  observaciones: string
  pesos: Record<string, number>
  criticos: Record<string, CriticoModo>
  puntaje: number | null
  critico: boolean
  feedback?: { fecha: string; por: string }
  origen?: OrigenEval
  notasMigracion?: string[]
  creadoEn: string
  actualizadoEn: string
  creadoPor: string
}

export interface Seguimiento {
  evaluacionId: string
  causa?: Causa
  accionRealizada?: string
  notas?: string
  supervisor?: string
  cierreManual?: { fecha: string; motivo: string; por: string }
  retomado?: string
  actualizadoEn?: string
}

export interface Firma {
  nombre: string
  img: string
  fecha: string
  via?: 'enlace'
  metodo?: 'dibujo' | 'imagen'
  comentario?: string
}

export interface Documento {
  id: string
  folio: string
  tipo: TipoDoc
  evaluacionId: string
  agenteId: string
  agenteNombre: string
  campos: Record<string, string>
  firmas: Record<string, Firma>
  anulado?: boolean
  creadoEn: string
  actualizadoEn: string
  creadoPor: string
}

export interface ParametroDef {
  key: string
  grupo: string
  nombre: string
  valor: number
  unidad: string
  fuente: string
  tipo: 'pct' | 'num'
}

export interface TareaDef {
  id: string
  categoria: string
  tarea: string
  incluye: string
  unidad: string
  volumenTexto: string
  minEstandar: number
  excelHoras: number
}

export interface KpiDef {
  id: string
  nombre: string
  formula: string
  meta: number
  sentido: 'mayor' | 'menor'
  frecuencia: string
  responsable: string
  unidad: 'pct' | 'pts' | 'n'
  excelReal?: number | null
}

export interface RegistroTiempo {
  id: string
  fecha: string
  analistaId: string
  tareaId: string
  inicio: string
  fin: string
  minutos: number
  cantidad: number
  observacion: string
}

export interface HallazgoBase {
  caso: string
  agenteId: string
  observacion: string
}

export interface RegistroBase {
  id: string
  tipo: 'base' | 'correo'
  nombre: string
  enviadaPor: string
  recibido: string
  respondido?: string
  casos: number
  analistaId: string
  hallazgos: HallazgoBase[]
}

export interface Config {
  meta: number
  umbralRojo: number
  empresa: string
  cliente: string
  area: string
  centroResultados: string
  puestoAgente: string
  ciudad: string
  supervisorOperaciones: string
  supervisorCalidad: string
  coordinacionCalidad: string
  talentoHumano: string
  tiposAuditoria: string[]
  procesosMonitoreo: string[]
  procesos: string[]
}

export interface RutaNivel {
  nivel: number
  nombre: string
  disparador: string
  accion: string
  plazo: number
  responsable: string
  evidencia: string
  salida: string
}

export interface Modelo {
  causas: { id: Causa; pregunta: string; senales: string; intervencion: string }[]
  ruta: RutaNivel[]
  reglas: { titulo: string; texto: string }[]
  phva: { dia: string; fase: string; que: string }[]
  roles: { analista: string; rol: string; responsabilidades: string; respaldo: string }[]
  fasesIngreso: { fase: string; dias: string; actividad: string; como: string; responsable: string; evidencia: string; criterio: string }[]
}

export interface Fuente {
  archivo: string
  bytes: number
  sha256: string
  hojas: { nombre: string; visible: boolean; rango: string; formulas: number; valores: number; errores: number }[]
}

export interface Actividad {
  id: string
  fecha: string
  por: string
  accion: string
  detalle: string
  ref: { tipo: string; id: string } | null
}

export interface DB {
  version: number
  rev: number
  creado: string
  generadoSeed?: string
  config: Config
  analistas: Analista[]
  agentes: Agente[]
  catalogo: Catalogo
  modelo: Modelo
  operacionDef: {
    parametros: ParametroDef[]
    tareas: TareaDef[]
    kpis: KpiDef[]
    basesCatalogo: { nombre: string; enviadaPor: string; frecuencia: string; sla: string; casos: string }[]
    equipo: string[]
  }
  operacion: {
    parametros: Record<string, number>
    tareasMin: Record<string, number>
    kpisManual: Record<string, Record<string, number>>
    tiempos: RegistroTiempo[]
    bases: RegistroBase[]
    calibraciones?: Calibracion[]
  }
  evaluaciones: Evaluacion[]
  seguimientos: Record<string, Seguimiento>
  documentos: Documento[]
  actividad: Actividad[]
  fuentes: Fuente[]
  hallazgos: string[]
  seq: Record<string, number>
}

export type OpName =
  | 'evaluacion.guardar'
  | 'evaluacion.eliminar'
  | 'evaluacion.feedback'
  | 'seguimiento.actualizar'
  | 'documento.guardar'
  | 'documento.eliminar'
  | 'agente.guardar'
  | 'agente.eliminar'
  | 'analista.guardar'
  | 'analista.eliminar'
  | 'config.actualizar'
  | 'catalogo.item'
  | 'operacion.parametro'
  | 'operacion.tarea'
  | 'operacion.kpi'
  | 'tiempo.guardar'
  | 'tiempo.eliminar'
  | 'base.guardar'
  | 'base.eliminar'
  | 'calibracion.guardar'
  | 'calibracion.eliminar'
  | 'evaluaciones.importar'
  | 'datos.restaurar'
  | 'datos.reiniciar'