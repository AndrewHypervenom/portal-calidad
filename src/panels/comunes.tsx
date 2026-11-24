import type { ReactNode } from 'react'
import { ChevronRight, FilePlus2, FileSignature, ShieldAlert } from 'lucide-react'
import type { Actividad, DB, Documento, Evaluacion, TipoDoc } from '../lib/types'
import { abrirPanel } from '../lib/router'
import { cedulaPorId } from '../lib/catalog'
import { diaLocal, fechaConDia, fechaHora, fechaMedia } from '../lib/dates'
import { NOMBRE_DOC, estadoFirmas } from '../documents/reglas'
import { Insignia, Puntaje, cx } from '../components/ui'

export function Seccion({ titulo, accion, children, className }: { titulo: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-6 first:mt-0', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  )
}

export function Grupo({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('overflow-hidden rounded-[14px] bg-surface-2/70 dark:bg-surface-2/60', className)}>{children}</div>
}

export function FilaEvaluacion({ db, ev, mostrarAgente }: { db: DB; ev: Evaluacion; mostrarAgente?: boolean }) {
  return (
    <button onClick={() => abrirPanel('ev', ev.id)} className="flex w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-hover">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {mostrarAgente ? ev.agenteNombre : cedulaPorId(db.catalogo, ev.cedulaId)?.nombre}
        </span>
        <span className="block truncate text-[12px] text-ink-2">
          {ev.folio} · {fechaConDia(ev.fechaEvaluacion)}
          {mostrarAgente ? ` · ${cedulaPorId(db.catalogo, ev.cedulaId)?.nombre}` : ev.canal === 'Monitoreo' ? ` · ${ev.tipoLlamada}` : ''}
        </span>
      </span>
      {ev.critico && <ShieldAlert className="size-4 shrink-0 text-bad-ink" aria-label="Error crítico" />}
      <Puntaje valor={ev.puntaje} critico={ev.critico} meta={db.config.meta} umbral={db.config.umbralRojo} />
      <ChevronRight className="size-4 shrink-0 text-ink-3" />
    </button>
  )
}

export function FilaDocumento({ doc }: { doc: Documento }) {
  const f = estadoFirmas(doc)
  return (
    <button onClick={() => abrirPanel('doc', doc.id)} className="flex w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-hover">
      <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-[9px]', f.completo ? 'bg-good-soft text-good-ink' : 'bg-info-soft text-info-ink')}>
        <FileSignature className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{NOMBRE_DOC[doc.tipo]}</span>
        <span className="block truncate text-[12px] text-ink-2">
          {doc.folio} · {fechaMedia(diaLocal(doc.creadoEn))}
        </span>
      </span>
      {doc.anulado ? <Insignia tono="neutro">Anulado</Insignia> : f.completo ? <Insignia tono="verde">Firmado</Insignia> : f.firmadas ? <Insignia tono="ambar">{`${f.firmadas}/${f.total} firmas`}</Insignia> : <Insignia tono="azul">Por firmar</Insignia>}
      <ChevronRight className="size-4 shrink-0 text-ink-3" />
    </button>
  )
}

export function BotonCrearDoc({ tipo, onClick, deshabilitado }: { tipo: TipoDoc; onClick: () => void; deshabilitado?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className="flex w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left text-accent-ink transition-colors first:border-t-0 hover:bg-hover disabled:opacity-50"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-fill-2">
        <FilePlus2 className="size-4" />
      </span>
      <span className="text-[13.5px] font-medium">Generar {NOMBRE_DOC[tipo].toLowerCase()}</span>
    </button>
  )
}

export function Historial({ entradas, vacio }: { entradas: Actividad[]; vacio?: string }) {
  if (!entradas.length) return <p className="rounded-[14px] bg-surface-2/70 px-4 py-3 text-[12.5px] text-ink-2">{vacio ?? 'Sin movimientos registrados en el portal.'}</p>
  return (
    <ol className="ml-2 border-l border-line-strong pl-4">
      {entradas.map((a) => (
        <li key={a.id} className="relative pb-3.5 last:pb-0">
          <span className="absolute top-[5px] -left-[21px] size-[9px] rounded-full border-2 border-surface bg-ink-3" aria-hidden />
          <p className="text-[13px] leading-snug font-semibold">{a.accion}</p>
          <p className="text-[12.5px] leading-snug break-words text-ink-2">{a.detalle}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {fechaHora(a.fecha)}
            {a.por ? ` · ${a.por}` : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}
