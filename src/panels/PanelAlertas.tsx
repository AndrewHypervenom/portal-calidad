import { useState } from 'react'
import { BellRing, ChevronRight, ClipboardList, Database, FileSignature, Gauge, Inbox, MessageSquareText, PartyPopper, Scale, Target, UserPlus, type LucideIcon } from 'lucide-react'
import { useAlertas } from '../lib/vista'
import { abrirPanel, cerrarPanel, ir } from '../lib/router'
import { NOMBRE_CATEGORIA, type Alerta, type CategoriaAlerta, type Gravedad } from '../lib/alertas'
import { Hoja } from '../components/Hoja'
import { Vacio, cx } from '../components/ui'
import { Grupo, Seccion } from './comunes'

export const ICONO_ALERTA: Record<CategoriaAlerta, LucideIcon> = {
  planes: Target,
  feedback: MessageSquareText,
  firmas: FileSignature,
  auditorias: ClipboardList,
  bases: Inbox,
  kpis: Gauge,
  calibracion: Scale,
  ingresos: UserPlus,
  datos: Database,
}

const TONO: Record<Gravedad, string> = {
  alta: 'bg-bad-soft text-bad-ink',
  media: 'bg-warn-soft text-warn-ink',
  baja: 'bg-fill-2 text-ink-2',
}

export function irAAlerta(a: Alerta) {
  if (a.destino.tipo === 'panel') abrirPanel(a.destino.panel, a.destino.id)
  else ir(a.destino.pagina, { sub: a.destino.sub, params: a.destino.params })
}

export function FilaAlerta({ a }: { a: Alerta }) {
  const Icono = ICONO_ALERTA[a.categoria]
  return (
    <button onClick={() => irAAlerta(a)} className="group flex w-full items-start gap-3 border-t border-line px-3.5 py-3 text-left transition-colors first:border-t-0 hover:bg-hover">
      <span className={cx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', TONO[a.gravedad])}>
        <Icono className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] leading-snug font-semibold">{a.titulo}</span>
        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-ink-2">{a.detalle}</span>
      </span>
      <span className="mt-1 flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-accent-ink">
        <span className="hidden sm:inline">{a.accion}</span>
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

const GRUPOS: [Gravedad, string][] = [
  ['alta', 'Urgente'],
  ['media', 'Por atender'],
  ['baja', 'Para revisar'],
]

export function PanelAlertas({ profundidad, arriba }: { id: string; profundidad: number; arriba: boolean }) {
  const { alertas, alta, atender } = useAlertas()
  const [filtro, setFiltro] = useState<'todas' | CategoriaAlerta>('todas')
  const categorias = [...new Set(alertas.map((a) => a.categoria))]
  const lista = alertas.filter((a) => filtro === 'todas' || a.categoria === filtro)
  return (
    <Hoja
      titulo="Alertas"
      onCerrar={cerrarPanel}
      profundidad={profundidad}
      arriba={arriba}
      ancho={560}
      encabezado={
        <div className="flex items-center gap-3">
          <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-full', alta ? 'bg-bad-soft text-bad-ink' : atender ? 'bg-warn-soft text-warn-ink' : 'bg-good-soft text-good-ink')}>
            <BellRing className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold tracking-[-0.018em]">Alertas</h2>
            <p className="text-[12.5px] text-ink-2">
              {atender ? `${atender} por atender${alta ? ` · ${alta} urgente${alta === 1 ? '' : 's'}` : ''}` : 'Todo al día'} · se actualizan solas con cada cambio
            </p>
          </div>
        </div>
      }
    >
      {alertas.length === 0 ? (
        <Vacio icono={<PartyPopper />} titulo="Todo al día" texto="No hay planes vencidos, feedback pendiente, firmas por recabar ni auditorías atrasadas." />
      ) : (
        <>
          {categorias.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar alertas por tema">
              {(['todas', ...categorias] as const).map((c) => {
                const n = c === 'todas' ? alertas.length : alertas.filter((a) => a.categoria === c).length
                const activo = filtro === c
                return (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setFiltro(c)}
                    className={cx('h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors', activo ? 'bg-ink text-surface' : 'bg-fill-2 text-ink-2 hover:bg-fill hover:text-ink')}
                  >
                    {c === 'todas' ? 'Todas' : NOMBRE_CATEGORIA[c]} <span className="tabular opacity-70">{n}</span>
                  </button>
                )
              })}
            </div>
          )}
          {GRUPOS.map(([g, titulo]) => {
            const l = lista.filter((a) => a.gravedad === g)
            if (!l.length) return null
            return (
              <Seccion key={g} titulo={`${titulo} (${l.length})`}>
                <Grupo>
                  {l.map((a) => (
                    <FilaAlerta key={a.id} a={a} />
                  ))}
                </Grupo>
              </Seccion>
            )
          })}
        </>
      )}
    </Hoja>
  )
}
