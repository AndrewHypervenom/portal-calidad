import { useMemo } from 'react'
import { useVista } from '../lib/vista'
import { cerrarPanel } from '../lib/router'
import { porAnalista, promedio } from '../lib/analytics'
import { cedulaPorId } from '../lib/catalog'
import { claveMes, diasHabiles, hoyIso } from '../lib/dates'
import { deltaPts, num, pct } from '../lib/format'
import { repartoEquipo } from '../lib/operacion'
import { Hoja } from '../components/Hoja'
import { CalendarioMes, ListaBarras } from '../components/charts'
import { Avatar, Puntaje, colorPuntaje } from '../components/ui'
import { FilaEvaluacion, Grupo, Seccion } from './comunes'

export function PanelAnalista({ id, profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const { db, evals, rango, cfg } = useVista()
  const analista = db.analistas.find((a) => a.id === id)
  const propias = useMemo(() => evals.filter((e) => e.analistaId === id), [evals, id])
  const fila = porAnalista(propias, db.analistas)[0]
  const equipo = promedio(evals.map((e) => e.puntaje))
  const mes = rango.mes ?? claveMes(hoyIso())
  const hoy = hoyIso()
  const habiles = rango.desde > '2000' ? diasHabiles(rango.desde, rango.hasta < hoy ? rango.hasta : hoy) : 0
  const idx = db.operacionDef.equipo.findIndex((n) => analista && [analista.corto, analista.nombre].includes(n))
  const metaDiaria = idx >= 0 ? repartoEquipo(db.operacion.parametros)[idx]?.diarias : Math.round((db.operacion.parametros.metaAudDia || 15) / Math.max(1, db.analistas.filter((a) => a.activo).length))
  const porCedula = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of propias) m.set(e.cedulaId, (m.get(e.cedulaId) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [propias])
  const nombre = analista?.nombre ?? propias[0]?.analista ?? id

  return (
    <Hoja
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      encabezado={
        <div className="flex items-center gap-3">
          <Avatar nombre={nombre} tam={44} />
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-semibold tracking-[-0.018em]">{nombre}</h2>
            <p className="text-[12.5px] text-ink-2">Analista de calidad · {rango.etiqueta}</p>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { e: 'Evaluaciones', v: num(fila?.n ?? 0) },
          { e: 'Por día hábil', v: habiles ? num((fila?.n ?? 0) / habiles, 1) : '—', s: metaDiaria ? `meta sugerida ${metaDiaria}` : '' },
          { e: 'Promedio otorgado', v: <Puntaje valor={fila?.promedio ?? null} meta={cfg.meta} umbral={cfg.umbralRojo} grande /> },
          { e: 'Vs. equipo', v: fila?.promedio !== null && fila?.promedio !== undefined && equipo !== null ? deltaPts(fila.promedio - equipo) : '—', s: `equipo ${pct(equipo)}` },
        ].map((x) => (
          <div key={x.e} className="rounded-[14px] bg-surface-2/70 p-3">
            <p className="text-[12px] text-ink-2">{x.e}</p>
            <div className="mt-0.5 text-[20px] font-bold tracking-[-0.02em]">{x.v}</div>
            {x.s && <p className="text-[11.5px] text-ink-3">{x.s}</p>}
          </div>
        ))}
      </div>

      <Seccion titulo={rango.mes ? 'Evaluaciones por día' : 'Evaluaciones por día · mes actual'} className="mt-5">
        <div className="rounded-[14px] bg-surface-2/40 p-3">
          <CalendarioMes mes={mes} conteos={fila?.porDia ?? new Map()} meta={metaDiaria} />
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-3">Número grande = evaluaciones registradas ese día (antes: hoja “Desempeño Analista”).</p>
      </Seccion>

      {porCedula.length > 0 && (
        <Seccion titulo="Por cédula">
          <ListaBarras
            filas={porCedula.map(([c, n]) => {
              const prom = promedio(propias.filter((e) => e.cedulaId === c).map((e) => e.puntaje))
              return { id: c, etiqueta: cedulaPorId(db.catalogo, c)?.nombre ?? c, sub: `promedio ${pct(prom)}`, valor: n, texto: num(n), color: colorPuntaje(prom, false, cfg.meta, cfg.umbralRojo) }
            })}
          />
        </Seccion>
      )}

      <Seccion titulo={`Últimas evaluaciones (${propias.length})`}>
        <Grupo>
          {propias
            .slice()
            .sort((a, b) => b.fechaEvaluacion.localeCompare(a.fechaEvaluacion) || b.creadoEn.localeCompare(a.creadoEn))
            .slice(0, 25)
            .map((e) => (
              <FilaEvaluacion key={e.id} db={db} ev={e} mostrarAgente />
            ))}
        </Grupo>
      </Seccion>
    </Hoja>
  )
}
