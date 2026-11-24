import type { ReactNode } from 'react'
import type { Documento } from '../lib/types'
import { FIRMANTES } from './plantillas'

const linea = 'border-b border-black/70'
const LOGO = `${import.meta.env.BASE_URL}marca/logo-preferencial.png`

function Encabezado({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="relative mb-5">
      <div className="flex items-start justify-between gap-6">
        <img src={LOGO} alt="Positivo S+" className="mt-1 h-[22px] w-auto" />
        <div className="text-right">
          <p className="text-[9pt] font-semibold tracking-wide text-black/70 uppercase">Proceso de calidad y auditorías internas</p>
          <p className="text-[13pt] leading-tight font-bold">{titulo}</p>
          {subtitulo && <p className="text-[8.5pt] text-black/60">{subtitulo}</p>}
        </div>
      </div>
      <img src={`${import.meta.env.BASE_URL}marca/linea.png`} alt="" className="mt-3 block h-auto w-full" />
    </div>
  )
}

function Firma({ doc, id, etiqueta, nombre }: { doc: Documento; id: string; etiqueta: string; nombre?: string }) {
  const f = doc.firmas?.[id]
  return (
    <div className="evitar-corte flex flex-col items-center text-center">
      <div className="flex h-[56px] w-full items-end justify-center">{f ? <img src={f.img} alt={`Firma de ${f.nombre}`} className="max-h-[54px] max-w-[85%] object-contain" /> : null}</div>
      <div className={`w-[88%] ${linea}`} />
      <p className="mt-1 text-[8.5pt] font-semibold">{etiqueta}</p>
      <p className="text-[8.5pt]">{f?.nombre || nombre || ' '}</p>
      {f && <p className="text-[7pt] text-black/50">Firmado {new Date(f.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
    </div>
  )
}

function Hoja({ children }: { children: ReactNode }) {
  return <div className="hoja mx-auto w-full max-w-[816px] rounded-[6px] bg-white px-[56px] py-[48px] text-[10.5pt] leading-[1.5] text-black shadow-[0_2px_12px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]">{children}</div>
}

function Texto({ valor, vacio = ' ' }: { valor?: string; vacio?: string }) {
  return <span className="whitespace-pre-line">{valor?.trim() ? valor : vacio}</span>
}

export function PapelRetro({ doc }: { doc: Documento }) {
  const c = doc.campos
  const fila = (a: string, va: string | undefined, b: string, vb: string | undefined) => (
    <tr>
      <td className="w-[23%] border border-black/40 bg-black/[0.04] px-2 py-1 text-[8.5pt] font-semibold">{a}</td>
      <td className="w-[27%] border border-black/40 px-2 py-1">{va || ' '}</td>
      <td className="w-[22%] border border-black/40 bg-black/[0.04] px-2 py-1 text-[8.5pt] font-semibold">{b}</td>
      <td className="border border-black/40 px-2 py-1">{vb || ' '}</td>
    </tr>
  )
  return (
    <Hoja>
      <Encabezado titulo="FORMATO: RETROALIMENTACIÓN" subtitulo={doc.folio ? `Folio ${doc.folio}` : undefined} />
      <table className="w-full border-collapse text-[9.5pt]">
        <tbody>
          {fila('FECHA DE LA LLAMADA', c.fechaLlamada, 'NOMBRE DEL AGENTE', c.agente)}
          {fila('FECHA DE LA EVALUACIÓN', c.fechaEvaluacion, 'NOMBRE DEL AUDITOR', c.auditor)}
          {fila('TIPO DE AUDITORÍA', c.tipoAuditoria, 'CASO', c.caso)}
          {fila('CENTRO DE RESULTADOS', c.centroResultados, 'DURACIÓN', c.duracion)}
          <tr>
            <td colSpan={2} className="border-0" />
            <td className="border border-black/40 bg-black/[0.04] px-2 py-1 text-[8.5pt] font-semibold">CALIFICACIÓN</td>
            <td className="border border-black/40 px-2 py-1 text-[12pt] font-bold">{c.calificacion}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-[9pt] font-bold">CRITERIOS DE LA AUDITORÍA:</p>
      <p className="mt-1 border border-black/30 px-2.5 py-1.5 text-[9.5pt]">
        <Texto valor={c.criterios} />
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9pt] font-bold">ÁREAS DE OPORTUNIDAD:</p>
          <div className="mt-1 min-h-[104px] border border-black/30 px-2.5 py-1.5 text-[9.5pt]">
            <Texto valor={c.areas} />
          </div>
        </div>
        <div>
          <p className="text-[9pt] font-bold">COMPROMISO DEL AGENTE</p>
          <div className="mt-1 min-h-[104px] border border-black/30 px-2.5 py-1.5 text-[9.5pt]">
            <Texto valor={c.compromiso} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1.6fr_1fr] gap-4">
        <div>
          <p className="text-[9pt] font-bold">¿POR QUÉ SE GENERÓ ESTE ERROR EN EL PROCESO?</p>
          <div className="mt-1 min-h-[54px] border border-black/30 px-2.5 py-1.5 text-[9.5pt]">
            <Texto valor={c.porQue} />
          </div>
        </div>
        <div>
          <p className="text-[9pt] font-bold">¿DESCONOCÍA ESTA INFORMACIÓN?</p>
          <div className="mt-1 min-h-[54px] border border-black/30 px-2.5 py-1.5 text-[9.5pt]">
            <Texto valor={c.desconocia} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4">
        <Firma doc={doc} id="colaborador" etiqueta="Firma del Colaborador" nombre={c.agente} />
        <Firma doc={doc} id="supOperaciones" etiqueta="Firma del Supervisor de Operaciones" nombre={c.supervisor} />
        <Firma doc={doc} id="analista" etiqueta="Firma del Analista de Calidad" nombre={c.auditor} />
        <Firma doc={doc} id="supCalidad" etiqueta="Firma del Supervisor de Calidad" nombre={c.supCalidad} />
      </div>
      <p className="mt-3 text-[8.5pt]">C.C. {c.cc}</p>
    </Hoja>
  )
}

export function PapelCarta({ doc }: { doc: Documento }) {
  const c = doc.campos
  return (
    <Hoja>
      <table className="mb-5 w-full border-collapse text-[9pt]">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[34%] border border-black/40 px-3 py-2">
              <img src={LOGO} alt="Positivo S+" className="h-[20px] w-auto" />
            </td>
            <td colSpan={2} className="border border-black/40 px-3 py-2 text-center text-[12pt] font-bold">
              CARTA DE COMPROMISO
            </td>
          </tr>
          <tr>
            <td className="border border-black/40 px-3 py-1.5">Nivel de confidencialidad: Interno</td>
            <td className="border border-black/40 px-3 py-1.5">
              Fecha de implementación: {c.fecha}
              <br />
              Creado/modificado por: {c.creadoPor}
              {doc.folio ? (
                <>
                  <br />
                  Folio: {doc.folio}
                </>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-6">
        <span className="font-bold">NOMBRE DEL ASOCIADO:</span> {c.asociado}
      </p>
      <p className="mt-2">
        <span className="font-bold">ÁREA:</span> {c.area}
      </p>
      <p className="mt-6 text-justify">
        Por medio de la presente, se deja constancia de que el colaborador <span className="font-semibold">{c.asociado || 'Nombre completo colaborador'}</span> ha sido informado sobre una serie de incumplimientos relacionados con{' '}
        <span className="font-semibold">{c.motivo || 'XXXXX'}</span>, los cuales requieren una mejora inmediata para asegurar el adecuado funcionamiento del equipo y el cumplimiento de los lineamientos de la compañía.
      </p>
      <p className="mt-4">Los incumplimientos identificados son los siguientes:</p>
      <div className="mt-2 pl-4">
        <Texto valor={c.incumplimientos} vacio="Enumerar incumplimientos" />
      </div>
      <p className="mt-4">Ante lo anterior, el colaborador se compromete a:</p>
      <div className="mt-2 pl-4">
        <Texto valor={c.compromisos} vacio="Describir compromisos" />
      </div>
      <p className="mt-4 text-justify">
        Este compromiso se adquiere con el fin de mejorar el desempeño laboral y evitar la reincidencia de las situaciones mencionadas. El incumplimiento de lo aquí establecido podrá dar lugar a la aplicación de las medidas disciplinarias
        correspondientes, conforme a la normativa interna.
      </p>
      <p className="mt-4">La presente carta se firma como constancia de conocimiento y aceptación del compromiso asumido.</p>
      <p className="mt-8 text-center font-bold">ATENTAMENTE</p>
      <p className="text-center font-bold">ÁREA DE CALIDAD</p>
      <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6">
        {FIRMANTES.carta.map((f) => (
          <Firma key={f.id} doc={doc} id={f.id} etiqueta={f.etiqueta} nombre={c[f.campoNombre]} />
        ))}
      </div>
    </Hoja>
  )
}

export function PapelActa({ doc }: { doc: Documento }) {
  const c = doc.campos
  const b = (v?: string, vacio = '____') => <span className="font-semibold underline decoration-black/40 underline-offset-2">{v?.trim() ? v : vacio}</span>
  return (
    <Hoja>
      <div className="mb-6 flex items-center justify-between">
        <img src={LOGO} alt="Positivo S+" className="h-[20px] w-auto" />
        {doc.folio && <p className="text-[9pt] text-black/60">Folio {doc.folio}</p>}
      </div>
      <p className="text-center text-[12.5pt] font-bold">ACTA ADMINISTRATIVA POR SEGUIMIENTO A INDICADORES DE CALIDAD</p>
      <p className="mt-6 text-justify">
        El día {b(c.dia, 'x')} del mes de {b(c.mes, 'xxx')} del {b(c.anio, '2026')} a las {b(c.hora, '__:__')} horas, nos encontramos reunidos en la ciudad de {b(c.ciudad)} para realizar la presente Acta Administrativa con número de
        folio {b(doc.folio)} al colaborador {b(c.agente, 'Nombre del agente')} en el puesto {b(c.puesto)} junto con la C. {b(c.analista)} como Analista de calidad y la C. {b(c.supervisor)} como Supervisor de Operaciones, por los
        siguientes motivos:
      </p>
      <div className="mt-4 pl-2">
        <Texto valor={c.motivos} vacio="- Describir el motivo de la sanción." />
      </div>
      <p className="mt-5 text-justify">Por tal motivo se levanta acta, se solicita no reincidir con este comportamiento ya que de ser así se verá afectado en su expediente.</p>
      <p className="mt-4">Firman de conformidad los que aquí intervienen:</p>
      <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8">
        {FIRMANTES.acta.map((f) => (
          <Firma key={f.id} doc={doc} id={f.id} etiqueta={f.etiqueta} nombre={c[f.campoNombre]} />
        ))}
      </div>
    </Hoja>
  )
}

export function Papel({ doc }: { doc: Documento }) {
  if (doc.tipo === 'carta') return <PapelCarta doc={doc} />
  if (doc.tipo === 'acta') return <PapelActa doc={doc} />
  return <PapelRetro doc={doc} />
}
