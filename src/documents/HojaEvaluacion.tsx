import type { DB, Evaluacion } from '../lib/types'
import { bloquesDeCedula, cedulaPorId } from '../lib/catalog'
import { calificarEvaluacion } from '../lib/scoring'
import { fechaMedia } from '../lib/dates'
import { duracion, pct } from '../lib/format'

const RESP = { S: 'Sí', N: 'No', A: 'N/A' } as const

export function HojaEvaluacion({ db, ev }: { db: DB; ev: Evaluacion }) {
  const calif = calificarEvaluacion(ev, db.catalogo)
  const ced = cedulaPorId(db.catalogo, ev.cedulaId)
  const celda = 'border border-black/25 px-2 py-1 align-top'
  return (
    <div className="hoja mx-auto bg-white p-8 text-[10.5pt] leading-snug text-black">
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <img src={`${import.meta.env.BASE_URL}marca/logo-preferencial.png`} alt="Positivo S+" className="h-6 w-auto" />
        <div className="text-right">
          <p className="text-[13pt] font-bold">Formato de Evaluación Bradescard</p>
          <p className="text-[9pt]">
            {ev.folio} · {ev.canal}
            {ev.canal === 'Monitoreo' ? ` · ${ev.proceso}` : ''}
          </p>
        </div>
      </div>
      <table className="mt-3 w-full border-collapse text-[9.5pt]">
        <tbody>
          <tr>
            <td className={`${celda} w-[20%] font-semibold`}>Nombre del ejecutivo</td>
            <td className={celda}>{ev.agenteNombre}</td>
            <td className={`${celda} w-[20%] font-semibold`}>Duración de la llamada</td>
            <td className={celda}>{duracion(ev.duracionSeg)}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>ID ejecutivo</td>
            <td className={celda}>{ev.agenteId}</td>
            <td className={`${celda} font-semibold`}>Tipo de llamada</td>
            <td className={celda}>{ev.tipoLlamada || ced?.nombre}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>Analista de calidad</td>
            <td className={celda}>{ev.analista}</td>
            <td className={`${celda} font-semibold`}>Semana de evaluación</td>
            <td className={celda}>{ev.semana}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>Fecha de llamada</td>
            <td className={celda}>{fechaMedia(ev.fechaLlamada)}</td>
            <td className={`${celda} font-semibold`}>ID cliente / llamada / caso</td>
            <td className={celda}>{ev.idCaso || '—'}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>Fecha de evaluación</td>
            <td className={celda}>{fechaMedia(ev.fechaEvaluacion)}</td>
            <td className={`${celda} font-semibold`}>Promedio</td>
            <td className={`${celda} font-bold`}>
              {pct(ev.puntaje)}
              {ev.critico ? ' · ERROR CRÍTICO' : ''}
            </td>
          </tr>
        </tbody>
      </table>
      <table className="mt-3 w-full border-collapse text-[9pt]">
        <thead>
          <tr className="bg-black/[0.06] text-left">
            <th className={`${celda} w-[14%]`}>Bloque</th>
            <th className={celda}>Tópico</th>
            <th className={`${celda} w-[9%] text-center`}>Crítico</th>
            <th className={`${celda} w-[9%] text-center`}>Pond.</th>
            <th className={`${celda} w-[10%] text-center`}>Cumplimiento</th>
            <th className={`${celda} w-[26%]`}>Principal área de oportunidad</th>
          </tr>
        </thead>
        <tbody>
          {bloquesDeCedula(db.catalogo, ev.cedulaId).map((g) =>
            g.items.map((it, i) => {
              const r = ev.respuestas[it.key]
              return (
                <tr key={it.key} className="evitar-corte">
                  {i === 0 && (
                    <td className={`${celda} font-semibold`} rowSpan={g.items.length}>
                      {g.bloque}
                    </td>
                  )}
                  <td className={celda}>{it.def.topico}</td>
                  <td className={`${celda} text-center`}>{(ev.criticos[it.key] ?? 'no') === 'no' ? '—' : ev.criticos[it.key] === 'motivo' ? 'Según motivo' : 'Crítico'}</td>
                  <td className={`${celda} text-center`}>{ev.pesos[it.key] ?? it.peso}</td>
                  <td className={`${celda} text-center font-semibold ${calif.criticos.includes(it.key) ? 'underline' : ''}`}>{r ? RESP[r] : '—'}</td>
                  <td className={celda}>{[ev.motivos[it.key], ev.areas[it.key]].filter(Boolean).join(' · ')}</td>
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
      <div className="mt-3 border border-black/25 p-2 text-[9.5pt]">
        <p className="font-semibold">Observaciones generales</p>
        <p className="mt-1 min-h-[3em] whitespace-pre-line">{ev.observaciones}</p>
      </div>
      <p className="mt-4 text-[8pt] text-black/60">
        Puntos: Sí {calif.si} · No {calif.no} · Posibles {calif.posibles}. Fórmula: puntos de “Sí” ÷ (puntos de “Sí” + “No”); cualquier “No” en un rubro crítico deja la calificación en 0.
      </p>
    </div>
  )
}
