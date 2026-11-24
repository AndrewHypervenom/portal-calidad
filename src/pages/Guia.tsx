import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, ShieldAlert } from 'lucide-react'
import type { Canal } from '../lib/types'
import { useVista } from '../lib/vista'
import { ir, setParams, useRuta } from '../lib/router'
import { bloquesDeCedula, cedulaPorId } from '../lib/catalog'
import { normalizar, pct } from '../lib/format'
import { EncabezadoPagina } from '../components/Layout'
import { EncabezadoTarjeta, Entrada, Insignia, NivelBadge, Segmentado, Tarjeta, cx } from '../components/ui'
import { Rutina } from './GuiaRutina'

type Sub = 'rutina' | 'cedulas' | 'descriptor' | 'ruta' | 'criticos'

export function Guia() {
  const ruta = useRuta()
  const sub = (ruta.sub ?? (ruta.params.get('cedula') ? 'cedulas' : 'rutina')) as Sub
  return (
    <div>
      <EncabezadoPagina titulo="Guía" subtitulo="Cómo trabajar con el portal, cédulas oficiales, criterios de evaluación, errores críticos y ruta antirreincidencia" />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmentado<Sub>
          valor={sub}
          onChange={(v) => ir('guia', { sub: v === 'rutina' ? null : v })}
          opciones={[
            { valor: 'rutina', etiqueta: 'Cómo trabajar' },
            { valor: 'cedulas', etiqueta: 'Cédulas y criterios' },
            { valor: 'criticos', etiqueta: 'Errores críticos' },
            { valor: 'ruta', etiqueta: 'Ruta antirreincidencia' },
            { valor: 'descriptor', etiqueta: 'Descriptor' },
          ]}
        />
      </div>
      {sub === 'rutina' ? <Rutina /> : sub === 'descriptor' ? <Descriptor /> : sub === 'ruta' ? <Ruta /> : sub === 'criticos' ? <Criticos /> : <Cedulas />}
    </div>
  )
}

function Cedulas() {
  const { db } = useVista()
  const ruta = useRuta()
  const cedulaId = ruta.params.get('cedula') ?? db.catalogo.cedulas[0].id
  const ced = cedulaPorId(db.catalogo, cedulaId) ?? db.catalogo.cedulas[0]
  const bloques = bloquesDeCedula(db.catalogo, ced.id)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const todos = abiertos.size === ced.items.length
  const criticos = ced.items.filter((i) => i.critico !== 'no')
  const ptsCrit = criticos.reduce((s, i) => s + i.peso, 0)
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Tarjeta className="h-fit p-2 lg:sticky lg:top-[76px]">
        {(['Inbound', 'Monitoreo'] as Canal[]).map((c) => (
          <div key={c} className="mb-1">
            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{c}</p>
            {db.catalogo.cedulas
              .filter((x) => x.canal === c)
              .map((x) => (
                <button
                  key={x.id}
                  onClick={() => {
                    setParams({ cedula: x.id })
                    setAbiertos(new Set())
                  }}
                  className={cx('flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-[13.5px] transition-colors', x.id === ced.id ? 'bg-accent font-semibold text-on-accent' : 'hover:bg-hover')}
                >
                  <span className="truncate font-medium">{x.nombre.replace('Monitoreo · ', '')}</span>
                  <span className={cx('shrink-0 pl-2 text-[12px] whitespace-nowrap tabular', x.id === ced.id ? 'text-on-accent/75' : 'text-ink-3')}>{x.total} pts</span>
                </button>
              ))}
          </div>
        ))}
      </Tarjeta>
      <div className="flex min-w-0 flex-col gap-4">
        <Tarjeta className="p-5">
          <p className="text-[12.5px] font-medium text-ink-2">
            {ced.canal}
            {ced.tiposLlamada ? ` · tipos de llamada: ${ced.tiposLlamada.join(', ')}` : ` · en Excel: ${ced.nombreExcel}`}
          </p>
          <h2 className="mt-0.5 text-[22px] font-bold tracking-[-0.02em]">{ced.nombre}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Insignia tono="azul">{ced.items.length} rubros</Insignia>
            <Insignia>{ced.total} puntos</Insignia>
            <Insignia tono="rojo" icono={<ShieldAlert className="size-3" />}>
              {criticos.length} críticos · {pct(ced.total ? ptsCrit / ced.total : 0, 0)} del puntaje
            </Insignia>
          </div>
          <p className="mt-3 text-[13px] text-ink-2">Calificación = puntos “Sí” ÷ (puntos “Sí” + “No”). “No aplica” no cuenta. Un “No” en un rubro crítico deja la calificación en 0.</p>
          <button className="mt-3 text-[13px] font-medium text-accent-ink hover:underline" onClick={() => setAbiertos(todos ? new Set() : new Set(ced.items.map((i) => i.key)))}>
            {todos ? 'Contraer criterios' : 'Ver todos los criterios'}
          </button>
        </Tarjeta>
        {bloques.map((g) => (
          <Tarjeta key={g.bloque} className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[15px] font-semibold">{g.bloque}</h3>
              <span className="text-[12px] text-ink-2 tabular">{g.puntos} pts</span>
            </div>
            <ul>
              {g.items.map((it) => {
                const abierto = abiertos.has(it.key)
                return (
                  <li key={it.key} className="border-t border-line">
                    <button
                      onClick={() =>
                        setAbiertos((s) => {
                          const n = new Set(s)
                          if (n.has(it.key)) n.delete(it.key)
                          else n.add(it.key)
                          return n
                        })
                      }
                      className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover"
                      aria-expanded={abierto}
                    >
                      {abierto ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-ink-3" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3" />}
                      <span className="min-w-0 flex-1 text-[14px] font-medium">{it.def.topico}</span>
                      {it.critico !== 'no' && (
                        <Insignia tono="rojo" icono={<ShieldAlert className="size-3" />}>
                          {it.critico === 'motivo' ? 'Crítico según motivo' : 'Crítico'}
                        </Insignia>
                      )}
                      <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular">{it.peso} pts</span>
                    </button>
                    {abierto && (
                      <div className="anim-aparecer grid gap-3 px-5 pb-4 pl-12 text-[13px] leading-relaxed md:grid-cols-2">
                        {it.cuandoSi && (
                          <div>
                            <p className="mb-0.5 font-semibold text-good-ink">Cuándo sí cumple</p>
                            <p className="whitespace-pre-line text-ink-2">{it.cuandoSi}</p>
                          </div>
                        )}
                        {it.cuandoNo && (
                          <div>
                            <p className="mb-0.5 font-semibold text-bad-ink">Cuándo no cumple</p>
                            <p className="whitespace-pre-line text-ink-2">{it.cuandoNo}</p>
                          </div>
                        )}
                        {it.def.motivos && (
                          <div className="md:col-span-2">
                            <p className="mb-1 font-semibold">Motivos al marcar “No”</p>
                            <div className="flex flex-wrap gap-1.5">
                              {it.def.motivos.map((m) => (
                                <Insignia key={m.label} tono={m.critico ? 'rojo' : 'neutro'}>
                                  {m.label}
                                  {m.critico ? ' · crítico' : ' · no crítico'}
                                </Insignia>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Tarjeta>
        ))}
      </div>
    </div>
  )
}

function Criticos() {
  const { db } = useVista()
  const [q, setQ] = useState('')
  const [canal, setCanal] = useState<'todos' | Canal>('todos')
  const filas = useMemo(() => {
    const n = normalizar(q)
    return db.catalogo.cedulas
      .filter((c) => canal === 'todos' || c.canal === canal)
      .flatMap((c) => c.items.filter((i) => i.critico !== 'no').map((i) => ({ c, i, def: db.catalogo.items[i.key] })))
      .filter((x) => !n || normalizar(`${x.c.nombre} ${x.def.topico} ${x.i.cuandoNo ?? ''}`).includes(n))
  }, [db.catalogo, q, canal])
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar rubro o cédula…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px] flex-1" />
        <Segmentado<'todos' | Canal>
          tam="sm"
          valor={canal}
          onChange={setCanal}
          opciones={[
            { valor: 'todos', etiqueta: 'Todos' },
            { valor: 'Inbound', etiqueta: 'Inbound' },
            { valor: 'Monitoreo', etiqueta: 'Monitoreo' },
          ]}
        />
      </div>
      <div className="desplazable overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-2">
              <th className="px-5 pb-2 font-medium">Cédula</th>
              <th className="px-3 pb-2 font-medium">Sistema</th>
              <th className="px-3 pb-2 font-medium">Rubro</th>
              <th className="px-3 pb-2 text-right font-medium">Pts</th>
              <th className="px-5 pb-2 font-medium">Qué se considera error crítico</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ c, i, def }) => (
              <tr key={`${c.id}-${i.key}`} className="border-t border-line align-top">
                <td className="px-5 py-2.5 whitespace-nowrap">{c.nombre}</td>
                <td className="px-3 py-2.5 text-ink-2">{def.bloque}</td>
                <td className="px-3 py-2.5 font-medium">
                  {def.topico}
                  {i.critico === 'motivo' && <p className="text-[11.5px] font-normal text-ink-2">Crítico solo con motivo: {def.motivos?.filter((m) => m.critico).map((m) => m.label).join(' o ')}</p>}
                </td>
                <td className="px-3 py-2.5 text-right tabular">{i.peso}</td>
                <td className="max-w-[420px] px-5 py-2.5 whitespace-pre-line text-ink-2">{i.cuandoNo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">{filas.length} rubros críticos. Un error crítico pone al ejecutivo en rojo y su plan en nivel 3 (o 4 si reincide).</p>
    </Tarjeta>
  )
}

function Ruta() {
  const { db } = useVista()
  const m = db.modelo
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {m.causas.map((c) => (
          <Tarjeta key={c.id} className="p-5">
            <p className="text-[12px] font-semibold tracking-wide text-ink-2 uppercase">Causa raíz</p>
            <p className="mt-0.5 text-[22px] font-bold tracking-[-0.02em]">{c.id.charAt(0) + c.id.slice(1).toLowerCase()}</p>
            <p className="mt-1 text-[14px] font-medium">{c.pregunta}</p>
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">Señales:</span> {c.senales}
            </p>
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">Qué funciona:</span> {c.intervencion}
            </p>
          </Tarjeta>
        ))}
      </div>
      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta
          titulo="Ruta escalonada de intervención"
          subtitulo="El portal asigna el nivel solo con la calificación, los errores críticos, la reincidencia en 30 días y la causa raíz. Como en el PLAN ACCION IND, la reincidencia se cuenta por rubro de la misma cédula y con auditorías de días anteriores; un error crítico llega a nivel 4 cuando se repite ese mismo rubro."
        />
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pb-2 font-medium">Nivel</th>
                <th className="px-3 pb-2 font-medium">Disparador</th>
                <th className="px-3 pb-2 font-medium">Acción obligatoria</th>
                <th className="px-3 pb-2 text-right font-medium">Plazo</th>
                <th className="px-3 pb-2 font-medium">Responsable</th>
                <th className="px-3 pb-2 font-medium">Evidencia</th>
                <th className="px-5 pb-2 font-medium">Criterio de salida</th>
              </tr>
            </thead>
            <tbody>
              {m.ruta.map((r) => (
                <tr key={r.nivel} className="border-t border-line align-top">
                  <td className="px-5 py-3">
                    <NivelBadge nivel={r.nivel} />
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-ink-2">{r.disparador}</td>
                  <td className="max-w-[300px] px-3 py-3">{r.accion}</td>
                  <td className="px-3 py-3 text-right tabular">{r.plazo ? `${r.plazo} días` : '—'}</td>
                  <td className="px-3 py-3 text-ink-2">{r.responsable}</td>
                  <td className="px-3 py-3 text-ink-2">{r.evidencia}</td>
                  <td className="px-5 py-3">{r.salida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Tarjeta>
          <EncabezadoTarjeta titulo="Reglas que evitan la reincidencia" />
          <ul className="px-5 pb-4">
            {m.reglas.map((r) => (
              <li key={r.titulo} className="border-t border-line py-2.5 first:border-t-0">
                <p className="text-[13.5px] font-semibold">{r.titulo}</p>
                <p className="text-[13px] text-ink-2">{r.texto}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta>
          <EncabezadoTarjeta titulo="Ciclo semanal de mejora (PHVA)" />
          <ul className="px-5 pb-4">
            {m.phva.map((x) => (
              <li key={x.dia} className="flex gap-4 border-t border-line py-2.5 first:border-t-0">
                <span className="w-[130px] shrink-0">
                  <span className="block text-[13.5px] font-semibold">{x.fase}</span>
                  <span className="block text-[12px] text-ink-2">{x.dia}</span>
                </span>
                <span className="text-[13px] text-ink-2">{x.que}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  )
}

function Descriptor() {
  const { db } = useVista()
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {(['Inbound', 'Monitoreo'] as Canal[]).map((c) => {
        const lista = db.catalogo.descriptores[c]
        const grupos = [...new Set(lista.map((d) => d.grupo))]
        return (
          <Tarjeta key={c} className="overflow-hidden">
            <EncabezadoTarjeta titulo={`Descriptor · ${c}`} subtitulo={c === 'Monitoreo' ? db.catalogo.descriptores.notaMonitoreo : 'Qué evalúa cada bloque y por qué'} />
            {grupos.map((g) => (
              <div key={g} className="border-t border-line px-5 py-3">
                <p className="mb-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{g}</p>
                {lista
                  .filter((d) => d.grupo === g)
                  .map((d) => (
                    <div key={d.tema} className="mb-3 last:mb-0">
                      <p className="text-[14px] font-semibold">{d.tema}</p>
                      <p className="text-[13px] whitespace-pre-line text-ink-2">{d.descripcion}</p>
                      {d.porQue && <p className="mt-0.5 text-[12.5px] text-ink-3">¿Por qué? {d.porQue}</p>}
                    </div>
                  ))}
              </div>
            ))}
          </Tarjeta>
        )
      })}
    </div>
  )
}
