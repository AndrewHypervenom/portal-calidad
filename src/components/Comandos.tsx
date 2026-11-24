import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, CornerDownLeft, FileText, Moon, Search, Sun, User } from 'lucide-react'
import { useDb } from '../lib/store'
import { abrirPanel, ir } from '../lib/router'
import { normalizar, pct } from '../lib/format'
import { fechaMedia } from '../lib/dates'
import { setPrefs, temaEfectivo } from '../lib/prefs'
import { cedulaPorId } from '../lib/catalog'
import { PAGINAS } from './navegacion'
import { Avatar, Tecla, cx } from './ui'

interface Resultado {
  id: string
  grupo: string
  titulo: ReactNode
  detalle?: ReactNode
  icono: ReactNode
  accion: () => void
}

export function Comandos({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const db = useDb()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (abierto) {
      setQ('')
      setI(0)
    }
  }, [abierto])

  const resultados = useMemo<Resultado[]>(() => {
    const n = normalizar(q)
    const paginas = PAGINAS.filter((p) => !n || normalizar(`${p.titulo} ${p.palabras ?? ''}`).includes(n)).map((p) => ({
      id: `p-${p.id}`,
      grupo: 'Ir a',
      titulo: p.titulo,
      detalle: p.descripcion,
      icono: <p.icono className="size-4" />,
      accion: () => ir(p.id),
    }))
    const acciones: Resultado[] = [
      { id: 'a-inb', grupo: 'Acciones', titulo: 'Nueva evaluación Inbound', icono: <FileText className="size-4" />, accion: () => ir('evaluar', { params: { canal: 'Inbound' } }) },
      { id: 'a-mon', grupo: 'Acciones', titulo: 'Nueva evaluación Monitoreo', icono: <FileText className="size-4" />, accion: () => ir('evaluar', { params: { canal: 'Monitoreo' } }) },
      {
        id: 'a-tema',
        grupo: 'Acciones',
        titulo: temaEfectivo() === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
        icono: temaEfectivo() === 'oscuro' ? <Sun className="size-4" /> : <Moon className="size-4" />,
        accion: () => setPrefs({ tema: temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro' }),
      },
    ].filter((a) => !n || normalizar(String(a.titulo)).includes(n))
    if (!n) return [...paginas, ...acciones]
    const agentes = db.agentes
      .filter((a) => normalizar(`${a.nombre} ${a.id} ${(a.alias ?? []).join(' ')}`).includes(n))
      .slice(0, 6)
      .map((a) => ({
        id: `ag-${a.id}`,
        grupo: 'Ejecutivos',
        titulo: a.nombre,
        detalle: `${a.id} · ${a.canal === 'Inbound' ? 'Inbound' : a.proceso}`,
        icono: <Avatar nombre={a.nombre} tam={22} />,
        accion: () => abrirPanel('ag', a.id),
      }))
    const evals = db.evaluaciones
      .filter((e) => normalizar(`${e.folio} ${e.idCaso} ${e.agenteNombre} ${e.agenteId}`).includes(n))
      .sort((a, b) => b.fechaEvaluacion.localeCompare(a.fechaEvaluacion))
      .slice(0, 7)
      .map((e) => ({
        id: `ev-${e.id}`,
        grupo: 'Evaluaciones',
        titulo: `${e.folio} · ${e.agenteNombre}`,
        detalle: `${fechaMedia(e.fechaEvaluacion)} · ${cedulaPorId(db.catalogo, e.cedulaId)?.nombre ?? ''} · ${pct(e.puntaje)}${e.idCaso ? ` · caso ${e.idCaso}` : ''}`,
        icono: <FileText className="size-4" />,
        accion: () => abrirPanel('ev', e.id),
      }))
    return [...agentes, ...evals, ...paginas, ...acciones]
  }, [q, db])

  useEffect(() => {
    lista.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [i])

  if (!abierto) return null
  let ultimoGrupo = ''
  return (
    <div className="anim-fundido fixed inset-0 z-[70] flex items-start justify-center bg-black/25 px-4 pt-[12vh] backdrop-blur-[2px] no-imprimir" onMouseDown={onCerrar}>
      <div className="anim-escala w-full max-w-[600px] overflow-hidden rounded-[20px] bg-elevated shadow-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Buscar">
        <div className="flex items-center gap-3 px-4 hairline-b">
          <Search className="size-[18px] text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setI(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((x) => Math.min(resultados.length - 1, x + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((x) => Math.max(0, x - 1))
              } else if (e.key === 'Enter' && resultados[i]) {
                e.preventDefault()
                resultados[i].accion()
                onCerrar()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onCerrar()
              }
            }}
            placeholder="Busca ejecutivos, folios, casos o páginas…"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
            aria-label="Buscar en el portal"
          />
          <Tecla>Esc</Tecla>
        </div>
        <div ref={lista} className="max-h-[52vh] overflow-y-auto p-2">
          {resultados.length === 0 && <p className="px-3 py-10 text-center text-[13.5px] text-ink-2">Sin resultados para “{q}”.</p>}
          {resultados.map((r, k) => {
            const cabecera = r.grupo !== ultimoGrupo ? r.grupo : null
            ultimoGrupo = r.grupo
            return (
              <div key={r.id}>
                {cabecera && <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{cabecera}</p>}
                <button
                  data-i={k}
                  onMouseEnter={() => setI(k)}
                  onClick={() => {
                    r.accion()
                    onCerrar()
                  }}
                  className={cx('flex w-full items-center gap-3 rounded-[11px] px-3 py-2 text-left', k === i && 'bg-accent-soft')}
                >
                  <span className={cx('flex size-6 shrink-0 items-center justify-center', k === i ? 'text-accent-ink' : 'text-ink-2')}>{r.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{r.titulo}</span>
                    {r.detalle && <span className={cx('block truncate text-[12px]', 'text-ink-2')}>{r.detalle}</span>}
                  </span>
                  {k === i ? <CornerDownLeft className="size-4 shrink-0" /> : r.grupo === 'Ejecutivos' ? <User className="size-4 shrink-0 text-ink-3" /> : <ArrowRight className="size-4 shrink-0 text-ink-3" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
