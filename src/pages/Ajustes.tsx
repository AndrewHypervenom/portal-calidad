import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Database, Download, FileSpreadsheet, Plus, RotateCcw, Search, ShieldAlert, Upload, X } from 'lucide-react'
import type { Agente, Analista, Canal, CriticoModo, DB, Dictamen, Evaluacion } from '../lib/types'
import { useVista } from '../lib/vista'
import { store, useStore } from '../lib/store'
import { ir, setParams, useRuta } from '../lib/router'
import { bloquesDeCedula, cedulaPorId } from '../lib/catalog'
import { leerAcumulado, exportarLibro, hojasEvaluaciones, type ResultadoImport } from '../lib/excel'
import { diaLocal, fechaMedia, hoyIso } from '../lib/dates'
import { normalizar, num, pct } from '../lib/format'
import { NOMBRE_DOC, estadoFirmas } from '../documents/reglas'
import { categoriaActividad, NOMBRE_CATEGORIA_ACTIVIDAD } from '../lib/actividad'
import { desviacionCalibracion } from '../lib/kpis'
import { EncabezadoPagina } from '../components/Layout'
import { avisar, confirmar } from '../components/feedback'
import { AreaTexto, Boton, Campo, EncabezadoTarjeta, Entrada, Insignia, Interruptor, Segmentado, Selector, Tarjeta, cx } from '../components/ui'

type Sub = 'general' | 'ejecutivos' | 'analistas' | 'catalogo' | 'datos'

export function Ajustes() {
  const ruta = useRuta()
  const sub = (ruta.sub ?? 'general') as Sub
  return (
    <div>
      <EncabezadoPagina titulo="Ajustes" subtitulo="Configuración compartida por todo el equipo. Los cambios se guardan solos." />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmentado<Sub>
          valor={sub}
          onChange={(v) => ir('ajustes', { sub: v === 'general' ? null : v })}
          opciones={[
            { valor: 'general', etiqueta: 'General y firmantes' },
            { valor: 'ejecutivos', etiqueta: 'Ejecutivos' },
            { valor: 'analistas', etiqueta: 'Analistas' },
            { valor: 'catalogo', etiqueta: 'Catálogo de cédulas' },
            { valor: 'datos', etiqueta: 'Datos, respaldo e importación' },
          ]}
        />
      </div>
      {sub === 'ejecutivos' ? <Ejecutivos /> : sub === 'analistas' ? <Analistas /> : sub === 'catalogo' ? <Catalogo /> : sub === 'datos' ? <Datos /> : <General />}
    </div>
  )
}

function General() {
  const { db } = useVista()
  const c = db.config
  const guardar = (k: string, v: unknown) => void store.op('config.actualizar', { [k]: v })
  const texto = (k: keyof typeof c, etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <Entrada key={`${k}-${String(c[k])}`} defaultValue={String(c[k] ?? '')} onBlur={(e) => e.target.value !== String(c[k] ?? '') && guardar(k, e.target.value.trim())} />
    </Campo>
  )
  const porcentaje = (k: 'meta' | 'umbralRojo', etiqueta: string, ayuda: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <div className="flex items-center gap-2">
        <Entrada
          key={`${k}-${c[k]}`}
          defaultValue={String(Math.round(c[k] * 1000) / 10)}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(',', '.'))
            if (!Number.isNaN(n) && n > 0 && n <= 100 && n / 100 !== c[k]) {
              guardar(k, n / 100)
              void store.op('operacion.parametro', { key: k === 'meta' ? 'metaCalidad' : 'umbralRojo', valor: n / 100 })
            }
          }}
          className="w-[100px] text-right tabular"
        />
        <span className="text-ink-2">%</span>
      </div>
    </Campo>
  )
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Tarjeta className="p-5">
        <h3 className="mb-4 text-[15px] font-semibold">Metas de calidad</h3>
        <div className="grid grid-cols-2 gap-4">
          {porcentaje('meta', 'Meta de calidad', 'Verde: calificación igual o mayor.')}
          {porcentaje('umbralRojo', 'Umbral de rojo', 'Rojo: debajo de este valor.')}
        </div>
        <p className="mt-4 rounded-[12px] bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">Amarillo = entre el umbral y la meta. Cualquier error crítico es rojo. Estos valores definen el semáforo, el nivel del plan de acción y los KPIs.</p>
      </Tarjeta>
      <Tarjeta className="p-5">
        <h3 className="mb-4 text-[15px] font-semibold">Organización</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {texto('empresa', 'Empresa')}
          {texto('cliente', 'Cliente')}
          {texto('area', 'Área')}
          {texto('centroResultados', 'Centro de resultados', 'Aparece en la retroalimentación.')}
          {texto('puestoAgente', 'Puesto del ejecutivo', 'Aparece en el acta administrativa.')}
          {texto('ciudad', 'Ciudad', 'Para el acta administrativa.')}
        </div>
      </Tarjeta>
      <Tarjeta className="p-5 lg:col-span-2">
        <h3 className="mb-4 text-[15px] font-semibold">Firmantes predeterminados de los documentos</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {texto('supervisorOperaciones', 'Supervisor(a) de operaciones', 'Si el ejecutivo tiene supervisor propio, se usa ese.')}
          {texto('supervisorCalidad', 'Supervisor(a) de calidad')}
          {texto('coordinacionCalidad', 'Coordinación de calidad')}
          {texto('talentoHumano', 'Talento Humano')}
        </div>
      </Tarjeta>
    </div>
  )
}

const PROCESOS_POR_CANAL: Record<Canal, string[]> = { Inbound: ['Inbound'], Monitoreo: ['Monitoreo', 'VCAS', 'VRM', 'ATM', 'Back Up', 'Autorizaciones', 'Supervisión'] }

function Ejecutivos() {
  const { db } = useVista()
  const [q, setQ] = useState('')
  const [canal, setCanal] = useState<'todos' | Canal>('todos')
  const [edicion, setEdicion] = useState<(Agente & { idAnterior?: string }) | null>(null)
  const formulario = useRef<HTMLDivElement>(null)
  const claveEdicion = edicion ? edicion.idAnterior ?? 'nuevo' : null
  useEffect(() => {
    if (!claveEdicion) return
    setTimeout(() => {
      formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      formulario.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    }, 50)
  }, [claveEdicion])
  const lista = useMemo(() => {
    const n = normalizar(q)
    return db.agentes
      .filter((a) => (canal === 'todos' || a.canal === canal) && (!n || normalizar(`${a.nombre} ${a.id} ${a.proceso} ${a.supervisor ?? ''}`).includes(n)))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.canal.localeCompare(b.canal) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [db.agentes, q, canal])
  const conteo = (id: string) => db.evaluaciones.filter((e) => e.agenteId === id).length

  const guardar = async () => {
    if (!edicion) return
    const id = edicion.id.trim().toUpperCase()
    if (!id || !edicion.nombre.trim()) {
      avisar({ tipo: 'error', titulo: 'Falta el ID o el nombre' })
      return
    }
    if (id !== edicion.idAnterior && db.agentes.some((a) => a.id === id)) {
      avisar({ tipo: 'error', titulo: 'Ese ID ya existe', texto: 'Usa otro identificador.' })
      return
    }
    if (edicion.idAnterior && id !== edicion.idAnterior && conteo(edicion.idAnterior)) {
      const ok = await confirmar({ titulo: 'Cambiar el ID', texto: `Se actualizarán ${conteo(edicion.idAnterior)} evaluaciones y sus documentos al nuevo ID ${id}.`, confirmar: 'Cambiar' })
      if (!ok) return
    }
    const ag: Agente & { idAnterior?: string } = { ...edicion, id, nombre: edicion.nombre.trim(), idProvisional: edicion.idProvisional && id === edicion.idAnterior ? true : undefined }
    await store.op('agente.guardar', ag)
    setEdicion(null)
    avisar({ tipo: 'exito', titulo: 'Ejecutivo guardado', texto: `${ag.nombre} (${ag.id})` })
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Entrada prefijo={<Search className="size-4" />} placeholder="Buscar ejecutivo, ID, proceso o supervisor…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px] flex-1" />
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
          <Boton variante="primario" tam="sm" icono={<Plus className="size-4" />} onClick={() => setEdicion({ id: '', nombre: '', canal: canal === 'todos' ? 'Inbound' : canal, proceso: canal === 'Monitoreo' ? 'Monitoreo' : 'Inbound', activo: true })}>
            Agregar ejecutivo
          </Boton>
        </div>
      </Tarjeta>

      {edicion && (
        <div ref={formulario} className="scroll-mt-24">
        <Tarjeta className="anim-aparecer p-5">
          <h3 className="mb-4 text-[15px] font-semibold">{edicion.idAnterior ? `Editar ${edicion.idAnterior}` : 'Nuevo ejecutivo'}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo etiqueta="ID (usuario / número de empleado)" ayuda={edicion.idProvisional ? 'ID provisional generado en la migración: reemplázalo por el real.' : undefined}>
              <Entrada value={edicion.id} onChange={(e) => setEdicion({ ...edicion, id: e.target.value })} placeholder="DCA1234 o iniciales" />
            </Campo>
            <Campo etiqueta="Nombre completo" className="md:col-span-2">
              <Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Canal">
              <Segmentado<Canal>
                completo
                valor={edicion.canal}
                onChange={(c) => setEdicion({ ...edicion, canal: c, proceso: PROCESOS_POR_CANAL[c][0] })}
                opciones={[
                  { valor: 'Inbound', etiqueta: 'Inbound' },
                  { valor: 'Monitoreo', etiqueta: 'Monitoreo' },
                ]}
              />
            </Campo>
            <Campo etiqueta="Proceso">
              <Selector value={edicion.proceso} onChange={(e) => setEdicion({ ...edicion, proceso: e.target.value })}>
                {PROCESOS_POR_CANAL[edicion.canal].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Supervisor(a)">
              <Entrada value={edicion.supervisor ?? ''} onChange={(e) => setEdicion({ ...edicion, supervisor: e.target.value })} placeholder={db.config.supervisorOperaciones} />
            </Campo>
            <Campo etiqueta="Fecha de ingreso" ayuda="Durante 60 días entra al segmento de nuevo ingreso del muestreo y al seguimiento de nuevos ingresos.">
              <Entrada type="date" value={edicion.fechaIngreso ?? ''} max={hoyIso()} onChange={(e) => setEdicion({ ...edicion, fechaIngreso: e.target.value })} />
            </Campo>
            {edicion.fechaIngreso && (
              <Campo etiqueta="Dictamen del periodo de prueba" ayuda="Corte 3 (día 30). Alimenta el KPI “Nuevos ingresos que acreditan”.">
                <Segmentado<Dictamen | ''>
                  completo
                  valor={edicion.dictamen ?? ''}
                  onChange={(v) => setEdicion({ ...edicion, dictamen: v || undefined, fechaDictamen: v ? edicion.fechaDictamen || hoyIso() : undefined })}
                  opciones={[
                    { valor: '', etiqueta: 'Pendiente' },
                    { valor: 'acredita', etiqueta: 'Acredita' },
                    { valor: 'no-acredita', etiqueta: 'No acredita' },
                  ]}
                />
              </Campo>
            )}
            <Campo etiqueta="Activo">
              <div className="flex h-9 items-center gap-3">
                <Interruptor etiqueta="Activo" activo={edicion.activo} onChange={(v) => setEdicion({ ...edicion, activo: v })} />
                <span className="text-[13px] text-ink-2">{edicion.activo ? 'Se evalúa y cuenta en cobertura' : 'Inactivo: se conserva su historial'}</span>
              </div>
            </Campo>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Boton onClick={() => setEdicion(null)}>Cancelar</Boton>
            <Boton variante="primario" icono={<Check className="size-4" />} onClick={guardar}>
              Guardar
            </Boton>
          </div>
        </Tarjeta>
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        <div className="desplazable overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-2">
                <th className="px-5 pt-4 pb-2 font-medium">ID</th>
                <th className="px-3 pt-4 pb-2 font-medium">Nombre</th>
                <th className="px-3 pt-4 pb-2 font-medium">Canal · proceso</th>
                <th className="px-3 pt-4 pb-2 font-medium">Supervisor</th>
                <th className="px-3 pt-4 pb-2 text-right font-medium">Evaluaciones</th>
                <th className="px-5 pt-4 pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id} onClick={() => setEdicion({ ...a, idAnterior: a.id })} className={cx('cursor-pointer border-t border-line hover:bg-hover', !a.activo && 'opacity-60')}>
                  <td className="px-5 py-2.5 font-medium tabular">
                    {a.id} {a.idProvisional && <Insignia tono="ambar">provisional</Insignia>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.nombre}
                    {a.alias?.length ? <p className="text-[11.5px] text-ink-3">También aparece como: {a.alias.join(', ')}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">
                    {a.canal} · {a.proceso}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{a.supervisor || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular">{conteo(a.id)}</td>
                  <td className="px-5 py-2.5">{a.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
                    {a.dictamen && <Insignia tono={a.dictamen === 'acredita' ? 'verde' : 'rojo'} className="ml-1">{a.dictamen === 'acredita' ? 'Acredita' : 'No acredita'}</Insignia>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
          {lista.length} ejecutivos. Fusionados desde las hojas “Ejecutivos” de Inbound y Monitoreo y “AGENTES” del modelo; los marcados como provisionales no tenían ID en los Excel.
        </p>
      </Tarjeta>
    </div>
  )
}

function Analistas() {
  const { db } = useVista()
  const [edicion, setEdicion] = useState<Analista | null>(null)
  const guardar = async () => {
    if (!edicion?.nombre.trim()) return
    const id = edicion.id || normalizar(edicion.nombre).replace(/\s+/g, '-')
    await store.op('analista.guardar', { ...edicion, id, nombre: edicion.nombre.trim(), corto: edicion.corto.trim() || edicion.nombre.trim() })
    setEdicion(null)
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[15px] font-semibold">Analistas de calidad</h3>
          <Boton tam="sm" variante="primario" icono={<Plus className="size-4" />} onClick={() => setEdicion({ id: '', nombre: '', corto: '', activo: true, alias: [] })}>
            Agregar
          </Boton>
        </div>
        <ul>
          {db.analistas.map((a) => (
            <li key={a.id}>
              <button onClick={() => setEdicion({ ...a })} className={cx('flex w-full items-center gap-3 border-t border-line px-5 py-3 text-left hover:bg-hover', !a.activo && 'opacity-60')}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.nombre}</span>
                  <span className="block text-[12px] text-ink-2">
                    {a.corto} · {db.evaluaciones.filter((e) => e.analistaId === a.id).length} evaluaciones
                  </span>
                </span>
                {a.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
              </button>
            </li>
          ))}
        </ul>
      </Tarjeta>
      {edicion && (
        <Tarjeta className="anim-aparecer h-fit p-5">
          <h3 className="mb-4 text-[15px] font-semibold">{edicion.id ? 'Editar analista' : 'Nuevo analista'}</h3>
          <div className="flex flex-col gap-3">
            <Campo etiqueta="Nombre completo">
              <Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Nombre corto">
              <Entrada value={edicion.corto} onChange={(e) => setEdicion({ ...edicion, corto: e.target.value })} />
            </Campo>
            <div className="flex items-center gap-3">
              <Interruptor etiqueta="Activo" activo={edicion.activo} onChange={(v) => setEdicion({ ...edicion, activo: v })} />
              <span className="text-[13px] text-ink-2">Activo (aparece en los formularios)</span>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Boton onClick={() => setEdicion(null)}>Cancelar</Boton>
            <Boton variante="primario" onClick={guardar}>
              Guardar
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  )
}

function Catalogo() {
  const { db } = useVista()
  const ruta = useRuta()
  const cedulaId = ruta.params.get('cedula') ?? db.catalogo.cedulas[0].id
  const ced = cedulaPorId(db.catalogo, cedulaId) ?? db.catalogo.cedulas[0]
  const [abierto, setAbierto] = useState<string | null>(null)
  const cambiar = (key: string, cambios: Record<string, unknown>) => void store.op('catalogo.item', { cedulaId: ced.id, key, cambios })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Selector value={ced.id} onChange={(e) => setParams({ cedula: e.target.value })} className="w-[300px]" aria-label="Cédula">
          {db.catalogo.cedulas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.canal} · {c.nombre}
            </option>
          ))}
        </Selector>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <AlertTriangle className="size-4 text-warn" /> Los cambios aplican a las evaluaciones nuevas; las existentes conservan los pesos con que se calificaron.
        </p>
      </div>
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[15px] font-semibold">{ced.nombre}</h3>
          <span className="text-[13px] text-ink-2 tabular">
            Total: <span className="font-semibold text-ink">{ced.total} pts</span>
          </span>
        </div>
        {bloquesDeCedula(db.catalogo, ced.id).map((g) => (
          <div key={g.bloque}>
            <p className="border-t border-line-strong bg-surface-2/60 px-5 py-1.5 text-[12px] font-semibold text-ink-2">{g.bloque}</p>
            {g.items.map((it) => (
              <div key={it.key} className="border-t border-line px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <button className="min-w-[200px] flex-1 text-left text-[13.5px] font-medium hover:text-accent-ink" onClick={() => setAbierto(abierto === it.key ? null : it.key)}>
                    {it.def.topico}
                  </button>
                  <Selector
                    value={it.critico}
                    onChange={(e) => cambiar(it.key, { critico: e.target.value as CriticoModo })}
                    className="w-[190px]"
                    aria-label="Tipo de rubro"
                  >
                    <option value="no">No crítico</option>
                    <option value="siempre">Crítico</option>
                    {it.def.motivos?.length ? <option value="motivo">Crítico según motivo</option> : null}
                  </Selector>
                  <div className="flex items-center gap-1.5">
                    <Entrada
                      key={`${it.key}-${it.peso}`}
                      defaultValue={String(it.peso)}
                      onBlur={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isNaN(n) && n >= 0 && n !== it.peso) cambiar(it.key, { peso: n })
                      }}
                      className="h-8 w-[70px] text-right tabular"
                      aria-label={`Ponderación de ${it.def.topico}`}
                    />
                    <span className="text-[12px] text-ink-3">pts</span>
                  </div>
                </div>
                {abierto === it.key && (
                  <div className="anim-aparecer mt-3 grid gap-3 md:grid-cols-2">
                    <Campo etiqueta="Cuándo sí cumple">
                      <AreaTexto key={`si-${it.cuandoSi}`} rows={4} defaultValue={it.cuandoSi ?? ''} onBlur={(e) => e.target.value !== (it.cuandoSi ?? '') && cambiar(it.key, { cuandoSi: e.target.value })} />
                    </Campo>
                    <Campo etiqueta="Cuándo no cumple / qué es error crítico">
                      <AreaTexto key={`no-${it.cuandoNo}`} rows={4} defaultValue={it.cuandoNo ?? ''} onBlur={(e) => e.target.value !== (it.cuandoNo ?? '') && cambiar(it.key, { cuandoNo: e.target.value })} />
                    </Campo>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </Tarjeta>
    </div>
  )
}

function Datos() {
  const { db } = useVista()
  const { modo } = useStore()
  const [importacion, setImportacion] = useState<ResultadoImport | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)
  const respaldoRef = useRef<HTMLInputElement>(null)

  const descargarRespaldo = () => {
    const blob = new Blob([JSON.stringify(store.get().db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portal-calidad-respaldo-${hoyIso()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const restaurar = async (f: File) => {
    try {
      const datos = JSON.parse(await f.text()) as DB
      if (!datos.evaluaciones || !datos.catalogo) throw new Error('El archivo no es un respaldo del portal.')
      const ok = await confirmar({
        titulo: 'Restaurar respaldo',
        texto: `Se reemplazarán TODOS los datos actuales por los del respaldo (${datos.evaluaciones.length} evaluaciones, ${datos.documentos?.length ?? 0} documentos). Descarga antes un respaldo si tienes dudas.`,
        confirmar: 'Restaurar',
        peligro: true,
      })
      if (!ok) return
      await store.op('datos.restaurar', { db: datos })
      avisar({ tipo: 'exito', titulo: 'Respaldo restaurado' })
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo restaurar', texto: err instanceof Error ? err.message : String(err) })
    }
  }

  const exportarTodo = () => {
    void exportarLibro(`portal-calidad-completo-${hoyIso()}`, [
      ...hojasEvaluaciones(db, db.evaluaciones),
      {
        nombre: 'Ejecutivos',
        filas: db.agentes.map((a) => ({ ID: a.id, Nombre: a.nombre, Canal: a.canal, Proceso: a.proceso, Supervisor: a.supervisor ?? '', 'Fecha de ingreso': a.fechaIngreso ?? '', Activo: a.activo ? 'Sí' : 'No', Evaluaciones: db.evaluaciones.filter((e) => e.agenteId === a.id).length })),
      },
      {
        nombre: 'Documentos',
        filas: db.documentos.map((d) => ({ Folio: d.folio, Documento: NOMBRE_DOC[d.tipo], Ejecutivo: d.agenteNombre, Evaluación: db.evaluaciones.find((e) => e.id === d.evaluacionId)?.folio ?? '', Creado: diaLocal(d.creadoEn), Firmas: `${estadoFirmas(d).firmadas}/${estadoFirmas(d).total}`, Anulado: d.anulado ? 'Sí' : 'No' })),
      },
      {
        nombre: 'Seguimiento de planes',
        filas: Object.values(db.seguimientos).map((s) => ({ Evaluación: db.evaluaciones.find((e) => e.id === s.evaluacionId)?.folio ?? s.evaluacionId, 'Causa raíz': s.causa ?? '', 'Acción realizada': s.accionRealizada ?? '', Notas: s.notas ?? '', Cierre: s.cierreManual ? `${diaLocal(s.cierreManual.fecha)} · ${s.cierreManual.motivo}` : '' })),
      },
      {
        nombre: 'Calibraciones',
        filas: (db.operacion.calibraciones ?? []).map((c) => ({ Fecha: c.fecha, Llamada: c.referencia, Canal: c.canal, ...Object.fromEntries(Object.entries(c.puntajes).map(([k, v]) => [db.analistas.find((a) => a.id === k)?.nombre ?? k, v])), 'Desviación (pts)': desviacionCalibracion(c) ?? '', Acuerdos: c.notas })),
      },
      {
        nombre: 'Bitácora',
        filas: db.actividad.map((a) => ({ Fecha: diaLocal(a.fecha), Hora: a.fecha, Persona: a.por, Tema: NOMBRE_CATEGORIA_ACTIVIDAD[categoriaActividad(a)], Movimiento: a.accion, Detalle: a.detalle })),
      },
    ])
  }

  const leer = async (f: File) => {
    setLeyendo(true)
    try {
      setImportacion(await leerAcumulado(f, db))
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo leer el Excel', texto: err instanceof Error ? err.message : String(err) })
    } finally {
      setLeyendo(false)
    }
  }

  const importar = async () => {
    if (!importacion) return
    const nuevas = importacion.filas.filter((f) => f.estado === 'nueva' && f.ev)
    setImportando(true)
    try {
      const agentes = new Map<string, Agente>()
      const analistas = new Map<string, Analista>()
      for (const f of nuevas) {
        if (f.agenteNuevo) agentes.set(f.agenteNuevo.id, f.agenteNuevo)
        if (f.analistaNuevo) analistas.set(f.analistaNuevo.id, f.analistaNuevo)
      }
      for (const a of agentes.values()) await store.op('agente.guardar', a)
      for (const a of analistas.values()) await store.op('analista.guardar', a)
      const r = await store.op<{ evaluaciones: Evaluacion[]; duplicadas: number }>('evaluaciones.importar', { evaluaciones: nuevas.map((f) => f.ev) })
      avisar({ tipo: 'exito', titulo: `${r.evaluaciones.length} evaluaciones importadas`, texto: `${agentes.size} ejecutivos nuevos · ${r.duplicadas} ya existían` })
      setImportacion(null)
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo importar', texto: err instanceof Error ? err.message : String(err) })
    } finally {
      setImportando(false)
    }
  }

  const reiniciar = async () => {
    const ok = await confirmar({
      titulo: 'Restablecer los datos originales',
      texto: 'Se borrarán todas las evaluaciones, documentos y cambios capturados en el portal y se volverá a cargar la migración de los Excel. Esta acción no se puede deshacer (salvo con un respaldo).',
      confirmar: 'Borrar y restablecer',
      peligro: true,
    })
    if (ok) {
      await store.op('datos.reiniciar', {})
      avisar({ tipo: 'info', titulo: 'Datos restablecidos' })
    }
  }

  const resumenImport = importacion
    ? {
        nuevas: importacion.filas.filter((f) => f.estado === 'nueva').length,
        duplicadas: importacion.filas.filter((f) => f.estado === 'duplicada').length,
        errores: importacion.filas.filter((f) => f.estado === 'error').length,
        coinciden: importacion.filas.filter((f) => f.coincide === true).length,
        difieren: importacion.filas.filter((f) => f.coincide === false).length,
      }
    : null

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Tarjeta className="p-5">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-accent-ink" />
            <h3 className="text-[15px] font-semibold">Almacenamiento</h3>
          </div>
          <p className="mt-2 text-[13px] text-ink-2">
            {modo === 'servidor' ? 'Servidor del portal: los datos se comparten en vivo con todo el equipo y se respaldan solos cada día en la carpeta “datos/respaldos”.' : 'Modo local: los datos viven solo en este navegador. Inicia el servidor del portal para compartirlos con el equipo.'}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
            <div>
              <dt className="text-ink-2">Evaluaciones</dt>
              <dd className="font-semibold tabular">{num(db.evaluaciones.length)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Documentos</dt>
              <dd className="font-semibold tabular">{num(db.documentos.length)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Ejecutivos</dt>
              <dd className="font-semibold tabular">{num(db.agentes.length)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Cambios registrados</dt>
              <dd className="font-semibold tabular">{num(db.rev)}</dd>
            </div>
          </dl>
        </Tarjeta>
        <Tarjeta className="p-5">
          <h3 className="text-[15px] font-semibold">Respaldo</h3>
          <p className="mt-2 text-[13px] text-ink-2">Descarga una copia completa (JSON) o restaura una anterior.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Boton tam="sm" variante="primario" icono={<Download className="size-4" />} onClick={descargarRespaldo}>
              Descargar respaldo
            </Boton>
            <Boton tam="sm" icono={<Upload className="size-4" />} onClick={() => respaldoRef.current?.click()}>
              Restaurar
            </Boton>
            <input
              ref={respaldoRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void restaurar(f)
                e.target.value = ''
              }}
            />
          </div>
        </Tarjeta>
        <Tarjeta className="p-5">
          <h3 className="text-[15px] font-semibold">Exportar todo a Excel</h3>
          <p className="mt-2 text-[13px] text-ink-2">Un libro con las evaluaciones de Inbound y Monitoreo (como el Acumulado), ejecutivos, documentos, seguimiento de planes, calibraciones y la bitácora.</p>
          <Boton tam="sm" className="mt-4" icono={<FileSpreadsheet className="size-4" />} onClick={exportarTodo}>
            Descargar libro
          </Boton>
        </Tarjeta>
      </div>

      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta
          titulo="Importar evaluaciones desde Excel"
          subtitulo="Para cargar meses anteriores: sube un libro de cédulas Inbound o Monitoreo (.xlsm / .xlsx). Se lee la hoja “Acumulado”, se recalcula cada calificación y se compara con la de Excel antes de importar."
          accion={
            <Boton variante="primario" tam="sm" icono={<Upload className="size-4" />} cargando={leyendo} onClick={() => archivoRef.current?.click()}>
              Elegir archivo
            </Boton>
          }
        />
        <input
          ref={archivoRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void leer(f)
            e.target.value = ''
          }}
        />
        {importacion && resumenImport && (
          <div className="border-t border-line">
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <p className="mr-2 text-[13.5px] font-semibold">
                {importacion.archivo} · {importacion.canal}
              </p>
              <Insignia tono="azul">{resumenImport.nuevas} nuevas</Insignia>
              <Insignia>{resumenImport.duplicadas} ya existen</Insignia>
              {resumenImport.errores > 0 && <Insignia tono="rojo">{resumenImport.errores} con error</Insignia>}
              <Insignia tono="verde">{resumenImport.coinciden} cuadran con Excel</Insignia>
              {resumenImport.difieren > 0 && <Insignia tono="ambar">{resumenImport.difieren} difieren</Insignia>}
              <div className="flex-1" />
              <Boton tam="sm" icono={<X className="size-4" />} onClick={() => setImportacion(null)}>
                Descartar
              </Boton>
              <Boton tam="sm" variante="primario" icono={<Check className="size-4" />} disabled={!resumenImport.nuevas} cargando={importando} onClick={importar}>
                Importar {resumenImport.nuevas}
              </Boton>
            </div>
            {importacion.avisos.length > 0 && (
              <div className="mx-5 mb-3 rounded-[10px] border border-warn/40 bg-warn-soft px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-warn-ink">
                  <AlertTriangle className="size-4 shrink-0" />
                  Fórmulas rotas en este Excel
                </p>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-9 text-[12.5px] text-ink-2">
                  {importacion.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="max-h-[420px] overflow-auto border-t border-line">
              <table className="w-full min-w-[880px] text-[12.5px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-[12px] text-ink-2">
                    <th className="px-5 py-2 font-medium">Fila</th>
                    <th className="px-3 py-2 font-medium">Ejecutivo</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Cédula</th>
                    <th className="px-3 py-2 text-right font-medium">Excel</th>
                    <th className="px-3 py-2 text-right font-medium">Portal</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-5 py-2 font-medium">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {importacion.filas.map((f) => (
                    <tr key={f.fila} className="border-t border-line align-top">
                      <td className="px-5 py-2 tabular text-ink-2">{f.fila}</td>
                      <td className="px-3 py-2">{f.ev?.agenteNombre ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.ev ? fechaMedia(f.ev.fechaEvaluacion) : '—'}</td>
                      <td className="px-3 py-2">{f.ev ? cedulaPorId(db.catalogo, f.ev.cedulaId)?.nombre : '—'}</td>
                      <td className="px-3 py-2 text-right tabular">{pct(f.promedioExcel)}</td>
                      <td className={cx('px-3 py-2 text-right font-semibold tabular', f.coincide === false && 'text-warn-ink')}>{pct(f.ev?.puntaje ?? null)}</td>
                      <td className="px-3 py-2">{f.estado === 'nueva' ? <Insignia tono="azul">Nueva</Insignia> : f.estado === 'duplicada' ? <Insignia>Ya existe</Insignia> : <Insignia tono="rojo">Error</Insignia>}</td>
                      <td className="px-5 py-2 text-ink-2">{f.mensajes.join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="overflow-hidden">
        <EncabezadoTarjeta titulo="Migración desde los Excel" subtitulo={`Origen de los datos iniciales · generado ${db.generadoSeed ? fechaMedia(db.generadoSeed.slice(0, 10)) : '—'}`} />
        <div className="grid grid-cols-1 gap-5 px-5 pb-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2 uppercase">Hallazgos y correcciones</p>
            <ul className="flex flex-col gap-2">
              {db.hallazgos.map((h) => (
                <li key={h} className="flex gap-2 text-[13px] text-ink-2">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2 uppercase">Libros y hojas analizadas</p>
            <div className="flex flex-col gap-3">
              {db.fuentes.map((f) => (
                <div key={f.archivo} className="rounded-[12px] bg-surface-2/70 p-3">
                  <p className="text-[13px] font-semibold">{f.archivo}</p>
                  <p className="truncate font-mono text-[10.5px] text-ink-3" title={f.sha256}>
                    SHA-256 {f.sha256}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.hojas.map((h) => (
                      <Insignia key={h.nombre} tono={h.errores ? 'ambar' : h.visible ? 'neutro' : 'violeta'} className="font-medium">
                        {h.nombre}
                        {!h.visible ? ' (oculta)' : ''}
                        {h.errores ? ` · ${h.errores} #REF` : ''}
                      </Insignia>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-wrap items-center gap-3 p-5">
        <RotateCcw className="size-5 text-bad-ink" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Restablecer datos originales</p>
          <p className="text-[12.5px] text-ink-2">Borra lo capturado en el portal y vuelve a cargar la migración de los Excel. Útil solo para capacitación o pruebas.</p>
        </div>
        <Boton variante="peligro" tam="sm" onClick={reiniciar}>
          Restablecer
        </Boton>
      </Tarjeta>
    </div>
  )
}
