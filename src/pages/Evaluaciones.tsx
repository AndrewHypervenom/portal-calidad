import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, FileSignature, Filter, ListChecks, Search, ShieldAlert, X } from 'lucide-react'
import type { Evaluacion } from '../lib/types'
import { useVista } from '../lib/vista'
import { abrirPanel, ir, setParams, useRuta } from '../lib/router'
import { cedulaPorId } from '../lib/catalog'
import { semaforoDe } from '../lib/scoring'
import { fechaConDia, fechaCorta } from '../lib/dates'
import { duracion, nombreCorto, normalizar, num, pct } from '../lib/format'
import { exportarLibro, hojasEvaluaciones } from '../lib/excel'
import { EncabezadoPagina } from '../components/Layout'
import { avisar } from '../components/feedback'
import { Boton, Entrada, Insignia, NivelBadge, Puntaje, SemaforoPill, Segmentado, Selector, Tarjeta, Vacio, cx } from '../components/ui'

type Orden = 'fecha' | 'agente' | 'puntaje' | 'cedula' | 'analista' | 'folio'
type FiltroRes = 'todas' | 'verde' | 'amarillo' | 'rojo' | 'critico'

export function Evaluaciones() {
  const { db, evals, rango, cfg, derivados } = useVista()
  const ruta = useRuta()
  const q = ruta.params.get('q') ?? ''
  const cedula = ruta.params.get('cedula') ?? ''
  const analista = ruta.params.get('analista') ?? ''
  const rubro = ruta.params.get('rubro') ?? ''
  const semana = ruta.params.get('semana') ?? ''
  const res = (ruta.params.get('critico') === '1' ? 'critico' : ruta.params.get('res') ?? 'todas') as FiltroRes
  const [orden, setOrden] = useState<{ campo: Orden; desc: boolean }>({ campo: 'fecha', desc: true })
  const [limite, setLimite] = useState(80)

  const filtradas = useMemo(() => {
    const n = normalizar(q)
    const temaKeys = rubro ? new Set(Object.values(db.catalogo.items).filter((i) => i.tema === rubro).map((i) => i.key)) : null
    let l = evals.filter((e) => {
      if (cedula && e.cedulaId !== cedula) return false
      if (analista && e.analistaId !== analista) return false
      if (semana && String(e.semana) !== semana) return false
      if (temaKeys && !Object.entries(e.respuestas).some(([k, r]) => r === 'N' && temaKeys.has(k))) return false
      if (res !== 'todas') {
        if (res === 'critico') {
          if (!e.critico) return false
        } else if (semaforoDe(e.puntaje, e.critico, cfg) !== res || (res === 'rojo' && e.critico)) return false
      }
      if (n && !normalizar(`${e.folio} ${e.agenteNombre} ${e.agenteId} ${e.idCaso} ${e.analista} ${e.observaciones}`).includes(n)) return false
      return true
    })
    const dir = orden.desc ? -1 : 1
    const cmp: Record<Orden, (a: Evaluacion, b: Evaluacion) => number> = {
      fecha: (a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion) || a.creadoEn.localeCompare(b.creadoEn),
      folio: (a, b) => a.folio.localeCompare(b.folio),
      agente: (a, b) => a.agenteNombre.localeCompare(b.agenteNombre, 'es'),
      puntaje: (a, b) => (a.puntaje ?? -1) - (b.puntaje ?? -1),
      cedula: (a, b) => a.cedulaId.localeCompare(b.cedulaId),
      analista: (a, b) => a.analista.localeCompare(b.analista, 'es'),
    }
    l = l.slice().sort((a, b) => cmp[orden.campo](a, b) * dir)
    return l
  }, [evals, q, cedula, analista, semana, rubro, res, orden, cfg, db.catalogo.items])

  const rubroTexto = rubro ? Object.values(db.catalogo.items).find((i) => i.tema === rubro)?.topico : null
  const hayFiltros = q || cedula || analista || rubro || semana || res !== 'todas'
  const semanas = [...new Set(evals.map((e) => e.semana))].sort()
  const docsPorEval = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of db.documentos) if (!d.anulado) m.set(d.evaluacionId, (m.get(d.evaluacionId) ?? 0) + 1)
    return m
  }, [db.documentos])

  const exportar = async () => {
    try {
      await exportarLibro(`evaluaciones-${rango.etiqueta.replace(/\s+/g, '-').toLowerCase()}`, hojasEvaluaciones(db, filtradas))
      avisar({ tipo: 'exito', titulo: 'Excel descargado', texto: `${filtradas.length} evaluaciones` })
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo exportar', texto: String(err) })
    }
  }

  const encabezado = (campo: Orden, texto: string, clase = '') => (
    <th className={cx('px-3 pb-2 font-medium', clase)}>
      <button onClick={() => setOrden((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo === 'fecha' || campo === 'puntaje' }))} className="inline-flex items-center gap-1 hover:text-ink">
        {texto}
        {orden.campo === campo && (orden.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )

  return (
    <div>
      <EncabezadoPagina
        titulo="Evaluaciones"
        subtitulo={`${num(filtradas.length)} de ${num(evals.length)} en ${rango.etiqueta.toLowerCase()}`}
        acciones={
          <>
            <Boton tam="sm" icono={<Download className="size-4" />} onClick={exportar}>
              Exportar a Excel
            </Boton>
          </>
        }
      />
      <Tarjeta className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada
            prefijo={<Search className="size-4" />}
            placeholder="Buscar ejecutivo, folio, caso u observación…"
            value={q}
            onChange={(e) => setParams({ q: e.target.value })}
            className="min-w-[220px] flex-1"
          />
          <Selector value={cedula} onChange={(e) => setParams({ cedula: e.target.value })} className="w-[220px]" aria-label="Cédula">
            <option value="">Todas las cédulas</option>
            {db.catalogo.cedulas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
          <Selector value={analista} onChange={(e) => setParams({ analista: e.target.value })} className="w-[190px]" aria-label="Analista">
            <option value="">Todos los analistas</option>
            {db.analistas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.corto}
              </option>
            ))}
          </Selector>
          {rango.mes && (
            <Selector value={semana} onChange={(e) => setParams({ semana: e.target.value })} className="w-[130px]" aria-label="Semana">
              <option value="">Semana</option>
              {semanas.map((s) => (
                <option key={s} value={String(s)}>
                  Semana {s}
                </option>
              ))}
            </Selector>
          )}
          <Segmentado<FiltroRes>
            tam="sm"
            valor={res}
            onChange={(v) => setParams({ res: v === 'todas' || v === 'critico' ? null : v, critico: v === 'critico' ? '1' : null })}
            opciones={[
              { valor: 'todas', etiqueta: 'Todas' },
              { valor: 'verde', etiqueta: 'En meta' },
              { valor: 'amarillo', etiqueta: 'En riesgo' },
              { valor: 'rojo', etiqueta: 'Bajo' },
              { valor: 'critico', etiqueta: 'Críticas' },
            ]}
          />
        </div>
        {(rubroTexto || hayFiltros) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
            {rubroTexto && (
              <Insignia tono="azul" icono={<Filter className="size-3" />}>
                Falló: {rubroTexto}
                <button className="ml-1" onClick={() => setParams({ rubro: null })} aria-label="Quitar filtro de rubro">
                  <X className="size-3" />
                </button>
              </Insignia>
            )}
            {hayFiltros && (
              <button className="text-[12.5px] font-medium text-accent-ink hover:underline" onClick={() => setParams({ q: null, cedula: null, analista: null, rubro: null, semana: null, res: null, critico: null })}>
                Quitar filtros
              </button>
            )}
          </div>
        )}
      </Tarjeta>

      {filtradas.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<ListChecks />} titulo="Sin evaluaciones" texto="Ajusta los filtros o el periodo de la barra superior." accion={<Boton variante="primario" onClick={() => ir('evaluar')}>Nueva evaluación</Boton>} />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta className="hidden overflow-hidden lg:block">
            <div className="desplazable overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-2">
                    <th className="w-0 pl-5" />
                    {encabezado('fecha', 'Fecha y folio', 'pl-1')}
                    {encabezado('agente', 'Ejecutivo')}
                    {encabezado('cedula', 'Cédula')}
                    {encabezado('analista', 'Analista', 'hidden xl:table-cell')}
                    <th className="hidden px-3 pb-2 text-right font-medium 2xl:table-cell">Duración</th>
                    {encabezado('puntaje', 'Calificación')}
                    <th className="hidden px-3 pb-2 font-medium 2xl:table-cell">Resultado</th>
                    <th className="px-3 pr-5 pb-2 font-medium">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0, limite).map((e) => {
                    const info = derivados.info.get(e.id)
                    const docs = docsPorEval.get(e.id)
                    return (
                      <tr key={e.id} onClick={() => abrirPanel('ev', e.id)} className="group cursor-pointer border-t border-line transition-colors hover:bg-hover">
                        <td className="pl-5">{e.critico && <ShieldAlert className="size-4 text-bad-ink" aria-label="Error crítico" />}</td>
                        <td className="py-2.5 pr-3 pl-1 whitespace-nowrap">
                          <span className="block">{fechaConDia(e.fechaEvaluacion)}</span>
                          <span className="block text-[11.5px] font-medium text-ink-3 tabular">{e.folio}</span>
                        </td>
                        <td className="max-w-[230px] px-3 py-2.5">
                          <span className="block truncate font-medium">{e.agenteNombre}</span>
                          <span className="block truncate text-[11.5px] text-ink-3">
                            {e.agenteId} · {e.canal === 'Inbound' ? 'Inbound' : e.proceso}
                          </span>
                        </td>
                        <td className="max-w-[200px] px-3 py-2.5">
                          <span className="block truncate" title={cedulaPorId(db.catalogo, e.cedulaId)?.nombre}>{cedulaPorId(db.catalogo, e.cedulaId)?.nombre}</span>
                          {e.canal === 'Monitoreo' && <span className="block truncate text-[11.5px] text-ink-3">{e.tipoLlamada}</span>}
                        </td>
                        <td className="hidden px-3 py-2.5 whitespace-nowrap text-ink-2 xl:table-cell">{nombreCorto(e.analista)}</td>
                        <td className="hidden px-3 py-2.5 text-right text-ink-2 tabular 2xl:table-cell">{duracion(e.duracionSeg)}</td>
                        <td className="px-3 py-2.5">
                          <Puntaje valor={e.puntaje} critico={e.critico} meta={cfg.meta} umbral={cfg.umbralRojo} />
                        </td>
                        <td className="hidden px-3 py-2.5 2xl:table-cell">
                          <SemaforoPill estado={semaforoDe(e.puntaje, e.critico, cfg)} critico={e.critico} compacto />
                        </td>
                        <td className="px-3 py-2.5 pr-5 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {info && info.nivel > 0 ? (
                              <span title={info.reincidencia > 0 ? `Nivel ${info.nivel}: repite un rubro por ${info.reincidencia + 1}.ª vez en 30 días` : `Nivel ${info.nivel}`} className="inline-flex items-center gap-1">
                                <NivelBadge nivel={info.nivel} corto />
                                {info.reincidencia > 0 && <span className="text-[11px] font-semibold text-violet">↻{info.reincidencia + 1}</span>}
                              </span>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                            {docs ? (
                              <span title={`${docs} documento(s)`} className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-2">
                                <FileSignature className="size-3.5" />
                                {docs}
                              </span>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:hidden">
            {filtradas.slice(0, limite).map((e) => (
              <button key={e.id} onClick={() => abrirPanel('ev', e.id)} className="card flex items-center gap-3 p-3.5 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{e.agenteNombre}</p>
                  <p className="truncate text-[12px] text-ink-2">
                    {e.folio} · {fechaCorta(e.fechaEvaluacion)} · {cedulaPorId(db.catalogo, e.cedulaId)?.nombre}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Puntaje valor={e.puntaje} critico={e.critico} meta={cfg.meta} umbral={cfg.umbralRojo} grande />
                  <span className="flex gap-1">
                    {e.critico && <Insignia tono="rojo">Crítico</Insignia>}
                    {(derivados.info.get(e.id)?.nivel ?? 0) > 0 && <NivelBadge nivel={derivados.info.get(e.id)!.nivel} corto />}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {filtradas.length > limite && (
            <div className="mt-4 flex justify-center">
              <Boton onClick={() => setLimite((l) => l + 120)}>Mostrar más ({num(filtradas.length - limite)} restantes)</Boton>
            </div>
          )}
          <p className="mt-3 px-1 text-[12px] text-ink-3">
            Promedio de la selección: <span className="font-semibold text-ink-2">{pct(filtradas.reduce((s, e) => s + (e.puntaje ?? 0), 0) / Math.max(1, filtradas.filter((e) => e.puntaje !== null).length))}</span>
          </p>
        </>
      )}
    </div>
  )
}
