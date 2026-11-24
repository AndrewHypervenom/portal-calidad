import { useMemo, useState } from 'react'
import { ClipboardCheck, Download } from 'lucide-react'
import { useVista } from '../lib/vista'
import { abrirPanel, cerrarPanel, ir } from '../lib/router'
import { matrizProcesoTipo, porAgente, promedio } from '../lib/analytics'
import { cedulaPorId, cedulasDeCanal } from '../lib/catalog'
import { nivelVigente, planAbierto, ETIQUETA_ESTADO } from '../lib/plans'
import { fechaCorta, fechaMedia } from '../lib/dates'
import { pct, num } from '../lib/format'
import { exportarLibro, hojasEvaluaciones } from '../lib/excel'
import { Hoja } from '../components/Hoja'
import { GraficaLineas, ListaBarras } from '../components/charts'
import { Avatar, Boton, BotonIcono, EstadoPlanPill, Insignia, NivelBadge, Puntaje, SemaforoPill, Segmentado, colorPuntaje } from '../components/ui'
import { FilaDocumento, FilaEvaluacion, Grupo, Seccion } from './comunes'

export function PanelAgente({ id, profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const { db, evals: evalsPeriodo, rango, derivados, cfg, semaforos } = useVista()
  const [alcance, setAlcance] = useState<'periodo' | 'todo'>('periodo')
  const agente = db.agentes.find((a) => a.id === id)
  const todas = useMemo(() => db.evaluaciones.filter((e) => e.agenteId === id).sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion) || a.creadoEn.localeCompare(b.creadoEn)), [db.evaluaciones, id])
  const delPeriodo = useMemo(() => evalsPeriodo.filter((e) => e.agenteId === id), [evalsPeriodo, id])
  const lista = alcance === 'periodo' ? delPeriodo : todas
  const fila = useMemo(() => porAgente(lista, db.agentes, cfg).get(id), [lista, db.agentes, cfg, id])
  const planes = derivados.planes.filter((p) => p.ev.agenteId === id)
  const vigente = nivelVigente(derivados.planes, id)
  const sem = semaforos.get(id)
  const docs = db.documentos.filter((d) => d.agenteId === id).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  const nombre = agente?.nombre ?? todas[0]?.agenteNombre ?? id
  const procesoTipo = useMemo(() => {
    const mon = lista.filter((e) => e.canal === 'Monitoreo')
    if (!mon.length) return null
    const tipos = cedulasDeCanal(db.catalogo, 'Monitoreo').flatMap((c) => c.tiposLlamada ?? [])
    const m = matrizProcesoTipo(mon, db.config.procesosMonitoreo, tipos)
    return { columnas: m.columnas, filas: m.filas.filter((r) => r.celdas[0].n > 0) }
  }, [lista, db.catalogo, db.config.procesosMonitoreo])

  const fallas = useMemo(() => {
    if (!fila) return []
    const porTema = new Map<string, { topico: string; bloque: string; n: number; ultima: string }>()
    for (const e of lista) {
      for (const [k, r] of Object.entries(e.respuestas)) {
        if (r !== 'N' || !(k in e.pesos)) continue
        const def = db.catalogo.items[k]
        if (!def) continue
        const x = porTema.get(def.tema) ?? { topico: def.topico, bloque: def.bloque, n: 0, ultima: e.fechaEvaluacion }
        x.n++
        if (e.fechaEvaluacion > x.ultima) x.ultima = e.fechaEvaluacion
        porTema.set(def.tema, x)
      }
    }
    return [...porTema.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  }, [fila, lista, db.catalogo.items])

  const exportar = () => void exportarLibro(`historial-${id}`, hojasEvaluaciones(db, todas))

  return (
    <Hoja
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      ancho={720}
      encabezado={
        <div className="flex items-center gap-3">
          <Avatar nombre={nombre} tam={44} />
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-semibold tracking-[-0.018em]">{nombre}</h2>
            <p className="truncate text-[12.5px] text-ink-2">
              {id} · {agente?.canal ?? todas[0]?.canal}
              {agente && agente.proceso !== agente.canal ? ` · ${agente.proceso}` : ''}
              {agente && !agente.activo ? ' · Inactivo' : ''}
            </p>
          </div>
        </div>
      }
      acciones={
        <>
          <BotonIcono etiqueta="Exportar historial a Excel" onClick={exportar}>
            <Download className="size-[18px]" />
          </BotonIcono>
          <Boton variante="primario" tam="sm" icono={<ClipboardCheck className="size-4" />} onClick={() => ir('evaluar', { params: { agente: id } })}>
            Evaluar
          </Boton>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <SemaforoPill estado={sem?.estado ?? null} critico={!!sem?.criticosMes} />
        {vigente ? <NivelBadge nivel={vigente.nivel} /> : <Insignia tono="verde">Sin plan abierto</Insignia>}
        {sem?.criticosMes ? <Insignia tono="rojo">{sem.criticosMes} crítico(s) este mes</Insignia> : null}
        <span className="text-[12px] text-ink-2">Semáforo: promedio de 4 semanas {pct(sem?.promedio ?? null)} ({sem?.n ?? 0} eval.)</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Segmentado
          tam="sm"
          valor={alcance}
          onChange={setAlcance}
          opciones={[
            { valor: 'periodo', etiqueta: rango.etiqueta },
            { valor: 'todo', etiqueta: 'Todo el historial' },
          ]}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { e: 'Evaluaciones', v: num(fila?.n ?? 0) },
          { e: 'Promedio', v: <Puntaje valor={fila?.promedio ?? null} meta={cfg.meta} umbral={cfg.umbralRojo} grande /> },
          { e: 'En meta', v: fila?.n ? pct(fila.enMeta / fila.n, 0) : '—' },
          { e: 'Errores críticos', v: <span className={fila?.criticos ? 'text-bad-ink' : ''}>{fila?.criticos ?? 0}</span> },
        ].map((x) => (
          <div key={x.e} className="rounded-[14px] bg-surface-2/70 p-3">
            <p className="text-[12px] text-ink-2">{x.e}</p>
            <div className="mt-0.5 text-[20px] font-bold tracking-[-0.02em]">{x.v}</div>
          </div>
        ))}
      </div>

      {todas.length > 1 && (
        <Seccion titulo="Historial de calificaciones" className="mt-5">
          <div className="rounded-[14px] bg-surface-2/40 p-2">
            <GraficaLineas
              alto={190}
              categorias={todas.slice(-16).map((e) => ({ etiqueta: fechaCorta(e.fechaEvaluacion), detalle: `${e.folio} · ${cedulaPorId(db.catalogo, e.cedulaId)?.nombre ?? ''}` }))}
              series={[{ id: 'p', nombre: 'Calificación', color: colorPuntaje(promedio(todas.map((e) => e.puntaje)), false, cfg.meta, cfg.umbralRojo), valores: todas.slice(-16).map((e) => e.puntaje) }]}
              meta={cfg.meta}
              dominioMin={0}
            />
          </div>
          {todas.length > 16 && <p className="mt-1 text-[11.5px] text-ink-3">Últimas 16 evaluaciones.</p>}
        </Seccion>
      )}

      {fila && fila.porCedula.size > 0 && (
        <Seccion titulo="Por cédula">
          <ListaBarras
            max={1}
            filas={[...fila.porCedula.entries()].map(([c, x]) => ({
              id: c,
              etiqueta: cedulaPorId(db.catalogo, c)?.nombre ?? c,
              sub: `${x.n} evaluación${x.n === 1 ? '' : 'es'}`,
              valor: x.promedio ?? 0,
              texto: pct(x.promedio),
              color: colorPuntaje(x.promedio, false, cfg.meta, cfg.umbralRojo),
            }))}
          />
        </Seccion>
      )}

      {procesoTipo && procesoTipo.filas.length > 0 && (
        <Seccion titulo="Por proceso y tipo de llamada">
          <div className="desplazable overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[11.5px] text-ink-2">
                  <th className="px-3 py-1.5 font-medium">Proceso</th>
                  {procesoTipo.columnas.map((c) => (
                    <th key={c.id} className="px-1.5 py-1.5 text-center font-medium">
                      {c.etiqueta.replace('Fraude con afectación', 'Con afect.').replace('Fraude sin afectación', 'Sin afect.').replace('Fraude (todos)', 'Fraude')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procesoTipo.filas.map((r) => (
                  <tr key={r.proceso} className="border-t border-line">
                    <td className="px-3 py-1.5 font-medium">{r.proceso}</td>
                    {r.celdas.map((c, i) => (
                      <td key={i} className="px-1.5 py-1.5 text-center whitespace-nowrap tabular">
                        {c.n ? (
                          <>
                            <span className="font-semibold" style={{ color: colorPuntaje(c.promedio, false, cfg.meta, cfg.umbralRojo) }}>
                              {pct(c.promedio)}
                            </span>{' '}
                            <span className="text-ink-3">({c.n})</span>
                          </>
                        ) : (
                          <span className="text-ink-3">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3">Antes: hoja “Tipo Llamada y Agente”. Fraude = promedio de todas sus llamadas de fraude.</p>
        </Seccion>
      )}

      {fallas.length > 0 && (
        <Seccion titulo="Rubros que más falla">
          <Grupo>
            {fallas.map(([tema, f]) => (
              <button key={tema} onClick={() => ir('evaluaciones', { params: { rubro: tema, q: id } })} className="flex w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left first:border-t-0 hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{f.topico}</span>
                  <span className="block text-[12px] text-ink-2">
                    {f.bloque} · última vez {fechaCorta(f.ultima)}
                  </span>
                </span>
                {f.n > 1 && <Insignia tono="violeta">{f.n} veces</Insignia>}
                {f.n === 1 && <Insignia>1 vez</Insignia>}
              </button>
            ))}
          </Grupo>
        </Seccion>
      )}

      {planes.length > 0 && (
        <Seccion titulo={`Planes de acción (${planes.filter(planAbierto).length} abiertos)`}>
          <Grupo>
            {planes.slice(0, 8).map((p) => (
              <button key={p.id} onClick={() => abrirPanel('plan', p.id)} className="flex w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left first:border-t-0 hover:bg-hover">
                <NivelBadge nivel={p.nivel} corto />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{p.fallas[0]?.topico ?? p.ruta.nombre}</span>
                  <span className="block truncate text-[12px] text-ink-2">
                    {p.ev.folio} · {fechaMedia(p.ev.fechaEvaluacion)} · {ETIQUETA_ESTADO[p.estado]}
                  </span>
                </span>
                <EstadoPlanPill estado={p.estado} />
              </button>
            ))}
          </Grupo>
        </Seccion>
      )}

      {docs.length > 0 && (
        <Seccion titulo="Documentos">
          <Grupo>
            {docs.slice(0, 8).map((d) => (
              <FilaDocumento key={d.id} doc={d} />
            ))}
          </Grupo>
        </Seccion>
      )}

      <Seccion titulo={`Evaluaciones (${lista.length})`}>
        {lista.length ? (
          <Grupo>
            {lista
              .slice()
              .reverse()
              .slice(0, 40)
              .map((e) => (
                <FilaEvaluacion key={e.id} db={db} ev={e} />
              ))}
          </Grupo>
        ) : (
          <p className="text-[13px] text-ink-2">Sin evaluaciones en {alcance === 'periodo' ? 'este periodo' : 'el historial'}.</p>
        )}
      </Seccion>
    </Hoja>
  )
}
