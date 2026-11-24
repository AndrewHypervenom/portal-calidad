import { useMemo, useState } from 'react'
import { ChevronRight, Download, History, Search } from 'lucide-react'
import type { Actividad } from '../lib/types'
import { useDb } from '../lib/store'
import { setParams, useRuta } from '../lib/router'
import { ICONO_ACTIVIDAD, categoriaActividad, destinoActividad, NOMBRE_CATEGORIA_ACTIVIDAD, type CategoriaActividad } from '../lib/actividad'
import { aIso, diaLocal, fechaConDia, fechaMedia, hoyIso, sumarDias } from '../lib/dates'
import { normalizar, num } from '../lib/format'
import { exportarLibro } from '../lib/excel'
import { EncabezadoPagina } from '../components/Layout'
import { avisar } from '../components/feedback'
import { Boton, Entrada, Selector, Tarjeta, Vacio, cx } from '../components/ui'

function hora(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function Bitacora() {
  const db = useDb()
  const ruta = useRuta()
  const q = ruta.params.get('q') ?? ''
  const persona = ruta.params.get('persona') ?? ''
  const cat = (ruta.params.get('tema') ?? '') as CategoriaActividad | ''
  const desde = ruta.params.get('desde') ?? ''
  const hasta = ruta.params.get('hasta') ?? ''
  const [limite, setLimite] = useState(150)

  const personas = useMemo(() => [...new Set(db.actividad.map((a) => a.por).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [db.actividad])
  const lista = useMemo(() => {
    const n = normalizar(q)
    return db.actividad.filter((a) => {
      const dia = diaLocal(a.fecha)
      if (desde && dia < desde) return false
      if (hasta && dia > hasta) return false
      if (persona && a.por !== persona) return false
      if (cat && categoriaActividad(a) !== cat) return false
      if (n && !normalizar(`${a.accion} ${a.detalle} ${a.por}`).includes(n)) return false
      return true
    })
  }, [db.actividad, q, persona, cat, desde, hasta])

  const porDia = useMemo(() => {
    const m = new Map<string, Actividad[]>()
    for (const a of lista.slice(0, limite)) {
      const d = diaLocal(a.fecha)
      const l = m.get(d)
      if (l) l.push(a)
      else m.set(d, [a])
    }
    return [...m.entries()]
  }, [lista, limite])

  const hayFiltros = q || persona || cat || desde || hasta
  const hoy = hoyIso()
  const ayer = sumarDias(hoy, -1)

  const exportar = async () => {
    try {
      await exportarLibro(`bitacora-${aIso(new Date())}`, [
        {
          nombre: 'Bitácora',
          filas: lista.map((a) => ({
            Fecha: diaLocal(a.fecha),
            Hora: hora(a.fecha),
            Persona: a.por || '—',
            Tema: NOMBRE_CATEGORIA_ACTIVIDAD[categoriaActividad(a)],
            Movimiento: a.accion,
            Detalle: a.detalle,
          })),
          anchos: { Movimiento: 30, Detalle: 80, Persona: 28, Tema: 30 },
        },
      ])
      avisar({ tipo: 'exito', titulo: 'Bitácora descargada', texto: `${num(lista.length)} movimientos` })
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo exportar', texto: String(err) })
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Bitácora"
        subtitulo="Historial de cambios del portal: quién registró, editó, firmó o configuró algo y cuándo. Se conservan los últimos 5,000 movimientos."
        acciones={
          <Boton tam="sm" icono={<Download className="size-4" />} onClick={exportar} disabled={!lista.length}>
            Exportar a Excel
          </Boton>
        }
      />
      <Tarjeta className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar folio, ejecutivo, documento…" value={q} onChange={(e) => setParams({ q: e.target.value })} className="min-w-[220px] flex-1" />
          <Selector value={persona} onChange={(e) => setParams({ persona: e.target.value })} className="w-[210px]" aria-label="Persona">
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Selector>
          <Selector value={cat} onChange={(e) => setParams({ tema: e.target.value })} className="w-[250px]" aria-label="Tema">
            <option value="">Todos los temas</option>
            {(Object.keys(NOMBRE_CATEGORIA_ACTIVIDAD) as CategoriaActividad[]).map((c) => (
              <option key={c} value={c}>
                {NOMBRE_CATEGORIA_ACTIVIDAD[c]}
              </option>
            ))}
          </Selector>
          <div className="flex items-center gap-1.5">
            <Entrada type="date" value={desde} max={hasta || undefined} onChange={(e) => setParams({ desde: e.target.value })} className="w-[150px]" aria-label="Desde" />
            <span className="text-ink-3">–</span>
            <Entrada type="date" value={hasta} min={desde || undefined} onChange={(e) => setParams({ hasta: e.target.value })} className="w-[150px]" aria-label="Hasta" />
          </div>
        </div>
        {hayFiltros && (
          <div className="mt-2 flex items-center gap-3 px-1 text-[12.5px]">
            <span className="text-ink-2">
              {num(lista.length)} de {num(db.actividad.length)} movimientos
            </span>
            <button className="font-medium text-accent-ink hover:underline" onClick={() => setParams({ q: null, persona: null, tema: null, desde: null, hasta: null })}>
              Quitar filtros
            </button>
          </div>
        )}
      </Tarjeta>

      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={<History />}
            titulo={db.actividad.length ? 'Sin movimientos para estos filtros' : 'Aún no hay movimientos'}
            texto={db.actividad.length ? 'Cambia los filtros o el rango de fechas.' : 'Cada evaluación, firma, plan o cambio de configuración aparecerá aquí con su autor y hora.'}
          />
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-4">
          {porDia.map(([dia, l]) => (
            <Tarjeta key={dia} className="overflow-hidden">
              <p className="border-b border-line px-5 py-2.5 text-[12.5px] font-semibold text-ink-2">
                {dia === hoy ? 'Hoy' : dia === ayer ? 'Ayer' : fechaConDia(dia)} · {fechaMedia(dia)}
                <span className="ml-2 font-normal text-ink-3">{l.length} movimiento{l.length === 1 ? '' : 's'}</span>
              </p>
              <ul>
                {l.map((a) => {
                  const c = categoriaActividad(a)
                  const Icono = ICONO_ACTIVIDAD[c]
                  const abrir = destinoActividad(a, db)
                  const Comp = abrir ? 'button' : 'div'
                  return (
                    <li key={a.id}>
                      <Comp
                        onClick={abrir ?? undefined}
                        className={cx('flex w-full items-start gap-3 border-t border-line px-5 py-3 text-left first:border-t-0', abrir && 'transition-colors hover:bg-hover')}
                      >
                        <span className="w-11 shrink-0 pt-0.5 text-[12px] text-ink-3 tabular">{hora(a.fecha)}</span>
                        <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-2 text-ink-2">
                          <Icono className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold">{a.accion}</span>
                          <span className="block text-[12.5px] break-words text-ink-2">{a.detalle}</span>
                        </span>
                        <span className="hidden shrink-0 text-right text-[12px] text-ink-2 sm:block">{a.por || 'Sin nombre'}</span>
                        {abrir && <ChevronRight className="mt-1 size-4 shrink-0 text-ink-3" />}
                      </Comp>
                    </li>
                  )
                })}
              </ul>
            </Tarjeta>
          ))}
          {lista.length > limite && (
            <div className="flex justify-center">
              <Boton onClick={() => setLimite((x) => x + 300)}>Mostrar más ({num(lista.length - limite)} restantes)</Boton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
