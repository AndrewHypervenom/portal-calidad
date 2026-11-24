import type { ReactNode } from 'react'
import { Bell, ClipboardCheck, FileSignature, Gauge, History, ListChecks, Scale, Target, UserPlus, type LucideIcon } from 'lucide-react'
import { abrirPanel, ir } from '../lib/router'
import { useVista } from '../lib/vista'
import { Boton, EncabezadoTarjeta, Tarjeta } from '../components/ui'

interface Paso {
  icono: LucideIcon
  titulo: string
  texto: ReactNode
  accion: string
  ir: () => void
}

const DIARIO: Paso[] = [
  {
    icono: Bell,
    titulo: '1. Revisa tus pendientes',
    texto: 'La campana y el Resumen juntan lo urgente: planes vencidos, feedback fuera de plazo, documentos por firmar, bases fuera del SLA de 24 h y auditorías atrasadas.',
    accion: 'Abrir alertas',
    ir: () => abrirPanel('alertas', 'todas'),
  },
  {
    icono: ClipboardCheck,
    titulo: '2. Evalúa según el plan de la semana',
    texto: 'El muestreo por riesgo dice a quién auditar: más al que está en rojo o con plan de acción. La calificación, la reincidencia, el nivel del plan y los documentos se calculan solos al guardar.',
    accion: 'Ver a quién auditar',
    ir: () => ir('operacion', { sub: 'muestreo' }),
  },
  {
    icono: FileSignature,
    titulo: '3. Da el feedback y firma',
    texto: 'Feedback en menos de 48 h (24 h si hubo error crítico). Llena compromiso, causa y si desconocía la información; la firma del colaborador registra el feedback y la acción del plan.',
    accion: 'Documentos por firmar',
    ir: () => ir('seguimiento', { sub: 'documentos', params: { firma: 'pendiente' } }),
  },
  {
    icono: Target,
    titulo: '4. Da seguimiento a los planes',
    texto: 'Registra la causa raíz (saber, poder o querer). El plan se cierra solo con 3 auditorías seguidas en meta; si reincide, sube de nivel automáticamente.',
    accion: 'Planes abiertos',
    ir: () => ir('seguimiento'),
  },
]

const SEMANAL: Paso[] = [
  {
    icono: ListChecks,
    titulo: 'Lunes · Planear',
    texto: 'Semáforo de ejecutivos, top 5 de errores (tema del refuerzo grupal) y lista de quién intervenir.',
    accion: 'Ver resumen',
    ir: () => ir('inicio'),
  },
  {
    icono: Scale,
    titulo: 'Cada 15 días · Calibrar',
    texto: 'Todos califican la misma llamada y se registra la diferencia: alimenta el KPI de desviación en calibración (meta ≤ 5 pts).',
    accion: 'Calibraciones',
    ir: () => ir('operacion', { sub: 'calibraciones' }),
  },
  {
    icono: UserPlus,
    titulo: 'Nuevos ingresos · Día 30',
    texto: 'Con la fecha de ingreso, el ejecutivo entra al muestreo intensivo y al seguimiento por fase; registra su dictamen (acredita / no acredita).',
    accion: 'Nuevos ingresos',
    ir: () => ir('operacion', { sub: 'equipo' }),
  },
  {
    icono: Gauge,
    titulo: 'Viernes · Actuar y reportar',
    texto: 'Revisa los KPIs del área (se calculan solos), cierra brechas con evidencia y exporta a Excel lo que necesites reportar.',
    accion: 'KPIs del área',
    ir: () => ir('operacion', { sub: 'kpis' }),
  },
  {
    icono: History,
    titulo: 'Siempre · Bitácora',
    texto: 'Cada evaluación, firma, cambio de plan o de configuración queda registrado con su autor y hora; también dentro de cada evaluación, plan y documento.',
    accion: 'Abrir bitácora',
    ir: () => ir('bitacora'),
  },
]

function Lista({ pasos }: { pasos: Paso[] }) {
  return (
    <ul className="px-2 pb-3">
      {pasos.map((p) => (
        <li key={p.titulo} className="flex flex-col gap-3 rounded-[12px] px-3 py-3 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <p.icono className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">{p.titulo}</span>
            <span className="block text-[13px] leading-relaxed text-ink-2">{p.texto}</span>
          </span>
          <Boton tam="sm" variante="tinte" className="self-start sm:self-center" onClick={p.ir}>
            {p.accion}
          </Boton>
        </li>
      ))}
    </ul>
  )
}

export function Rutina() {
  const { db } = useVista()
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Tarjeta>
        <EncabezadoTarjeta titulo="Rutina diaria del analista" subtitulo={`Meta del equipo: ${db.operacion.parametros.metaAudDia} auditorías diarias · meta de calidad ${Math.round(db.config.meta * 100)}%`} />
        <Lista pasos={DIARIO} />
      </Tarjeta>
      <Tarjeta>
        <EncabezadoTarjeta titulo="Ciclo semanal (PHVA) y tareas periódicas" subtitulo="Del modelo antirreincidencia: planear, hacer, verificar y actuar" />
        <Lista pasos={SEMANAL} />
      </Tarjeta>
    </div>
  )
}
