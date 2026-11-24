import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Agente, Canal } from '../lib/types'
import { normalizar } from '../lib/format'
import { Avatar, Insignia, cx } from './ui'

export function SelectorAgente({
  agentes,
  valor,
  onChange,
  canal,
  autoFocus,
  ultimos,
}: {
  agentes: Agente[]
  valor: string | null
  onChange: (a: Agente | null) => void
  canal?: Canal | null
  autoFocus?: boolean
  ultimos?: Map<string, string>
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const seleccionado = agentes.find((a) => a.id === valor) ?? null

  const { resultados, otroCanal } = useMemo(() => {
    const q = normalizar(texto)
    const coincide = (a: Agente) => !q || normalizar(`${a.nombre} ${a.id} ${a.proceso} ${(a.alias ?? []).join(' ')}`).includes(q)
    const base = agentes.filter((a) => (a.activo || a.id === valor) && coincide(a)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const delCanal = canal ? base.filter((a) => a.canal === canal) : base
    if (canal && q && !delCanal.length && base.length) return { resultados: base.slice(0, 60), otroCanal: true }
    return { resultados: delCanal.slice(0, 60), otroCanal: false }
  }, [agentes, texto, canal, valor])

  useEffect(() => setIndice(0), [texto, canal])
  useEffect(() => {
    if (!valor) setTexto('')
  }, [valor])
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegir = (a: Agente) => {
    onChange(a)
    setTexto('')
    setAbierto(false)
  }

  if (seleccionado && !abierto)
    return (
      <div className="campo flex h-11 w-full items-center gap-2.5 pr-1.5 pl-2.5">
        <button
          type="button"
          onClick={() => {
            setAbierto(true)
            setTimeout(() => entrada.current?.focus(), 0)
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          title="Cambiar ejecutivo"
        >
          <Avatar nombre={seleccionado.nombre} tam={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{seleccionado.nombre}</span>
            <span className="block truncate text-[11.5px] text-ink-2">
              {seleccionado.id} · {seleccionado.canal}
              {seleccionado.proceso !== seleccionado.canal ? ` · ${seleccionado.proceso}` : ''}
            </span>
          </span>
        </button>
        <button type="button" aria-label="Quitar ejecutivo" title="Quitar ejecutivo" onClick={() => onChange(null)} className="shrink-0 rounded-full p-1.5 text-ink-3 hover:bg-fill hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    )

  return (
    <div ref={ref} className="relative">
      <div className="campo flex h-11 items-center gap-2 px-3 focus-within:bg-surface focus-within:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--accent-soft)]">
        <Search className="size-4 text-ink-3" />
        <input
          ref={entrada}
          autoFocus={autoFocus}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onClick={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!abierto) setAbierto(true)
              else setIndice((i) => Math.min(resultados.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndice((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter' && resultados[indice]) {
              e.preventDefault()
              elegir(resultados[indice])
            } else if (e.key === 'Escape') {
              setAbierto(false)
            }
          }}
          placeholder="Busca por nombre o ID del ejecutivo…"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
          aria-label="Buscar ejecutivo"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
        />
        {texto && (
          <button type="button" aria-label="Borrar búsqueda" onClick={() => setTexto('')} className="rounded-full p-1 text-ink-3 hover:bg-fill hover:text-ink">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {abierto && (
        <ul className="anim-escala absolute top-[calc(100%+6px)] z-30 max-h-[340px] w-full overflow-y-auto rounded-[14px] bg-elevated p-1.5 shadow-pop" role="listbox">
          {otroCanal && <li className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-warn-ink">Sin coincidencias en {canal}; estos ejecutivos son de otro canal:</li>}
          {resultados.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-2">Sin coincidencias para “{texto}”. Revisa el nombre o agrégalo en Ajustes → Ejecutivos.</li>}
          {resultados.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === indice}>
              <button
                type="button"
                onMouseEnter={() => setIndice(i)}
                onClick={() => elegir(a)}
                className={cx('flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left', i === indice && 'bg-accent-soft')}
              >
                <Avatar nombre={a.nombre} tam={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{a.nombre}</span>
                  <span className="block truncate text-[11.5px] text-ink-2">
                    {a.id}
                    {ultimos?.get(a.id) ? ` · última evaluación ${ultimos.get(a.id)}` : ' · sin evaluaciones'}
                  </span>
                </span>
                <Insignia tono={a.canal === 'Inbound' ? 'azul' : 'violeta'}>{a.canal === 'Inbound' ? 'Inbound' : a.proceso}</Insignia>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
