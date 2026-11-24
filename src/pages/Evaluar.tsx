import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleSlash, ClipboardCheck, Info, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react'
import type { Agente, Canal, Evaluacion, Resp } from '../lib/types'
import { useDb, store } from '../lib/store'
import { usePrefs } from '../lib/prefs'
import { abrirPanel, ir, setParams, useRuta } from '../lib/router'
import { bloquesDeCedula, cedulaPorId, cedulasDeCanal, etiquetaTipo, type GrupoBloque, type ItemCompleto } from '../lib/catalog'
import { calificar, etiquetaResultado, semaforoDe } from '../lib/scoring'
import { contarReincidencia, nivelPlan, DOCS_POR_NIVEL, derivarPlanes } from '../lib/plans'
import { fechaCorta, fechaMedia, hoyIso, nombreMes, semanaDelMes, sumarDias } from '../lib/dates'
import { duracion, nombreCorto, parseDuracion, pct, uid } from '../lib/format'
import { crearDocumentosAutomaticos } from '../documents/plantillas'
import { EncabezadoPagina } from '../components/Layout'
import { SelectorAgente } from '../components/SelectorAgente'
import { Anillo, Medidor } from '../components/charts'
import { avisar, confirmar, quitarToast } from '../components/feedback'
import { AreaTexto, Boton, Campo, Entrada, Insignia, NivelBadge, SemaforoPill, Segmentado, Selector, Tarjeta, Tecla, colorPuntaje, cx } from '../components/ui'

interface Borrador {
  id: string | null
  canal: Canal | null
  agenteId: string | null
  cedulaId: string | null
  tipoLlamada: string
  proceso: string
  analistaId: string
  fechaLlamada: string
  fechaEvaluacion: string
  duracion: string
  idCaso: string
  tipoAuditoria: string
  respuestas: Record<string, Resp>
  motivos: Record<string, string>
  areas: Record<string, string>
  observaciones: string
}

const CLAVE_BORRADOR = 'portal-calidad:borrador'

function leerBorrador(): Borrador | null {
  try {
    const t = localStorage.getItem(CLAVE_BORRADOR)
    const g = t ? (JSON.parse(t) as Borrador) : null
    return g && !g.id ? g : null
  } catch {
    return null
  }
}

function borradorConDatos(g: Borrador): boolean {
  return !!(g.agenteId || Object.keys(g.respuestas ?? {}).length || g.observaciones?.trim() || g.idCaso?.trim())
}

function borradorVacio(analistaId: string, canal: Canal | null = null, conservar?: Partial<Borrador>): Borrador {
  const hoy = hoyIso()
  return {
    id: null,
    canal,
    agenteId: null,
    cedulaId: null,
    tipoLlamada: '',
    proceso: canal === 'Inbound' ? 'Inbound' : '',
    analistaId,
    fechaLlamada: hoy,
    fechaEvaluacion: hoy,
    duracion: '',
    idCaso: '',
    tipoAuditoria: 'AUDIO Y PROCESOS',
    respuestas: {},
    motivos: {},
    areas: {},
    observaciones: '',
    ...conservar,
  }
}

function desdeEvaluacion(ev: Evaluacion): Borrador {
  return {
    id: ev.id,
    canal: ev.canal,
    agenteId: ev.agenteId,
    cedulaId: ev.cedulaId,
    tipoLlamada: ev.tipoLlamada,
    proceso: ev.proceso,
    analistaId: ev.analistaId,
    fechaLlamada: ev.fechaLlamada ?? ev.fechaEvaluacion,
    fechaEvaluacion: ev.fechaEvaluacion,
    duracion: ev.duracionSeg !== null ? duracion(ev.duracionSeg) : '',
    idCaso: ev.idCaso,
    tipoAuditoria: ev.tipoAuditoria ?? 'AUDIO Y PROCESOS',
    respuestas: { ...ev.respuestas },
    motivos: { ...ev.motivos },
    areas: { ...ev.areas },
    observaciones: ev.observaciones,
  }
}

const NOMBRES_CORTOS_CEDULA: Record<string, string> = {
  'inb-rechazo': 'Rechazo / Originación',
  'inb-bloqueos': 'Bloqueos',
  'inb-fraude': 'Fraude',
  'inb-roext': 'ROEXT',
  'inb-aclaracion': 'Aclaración simple',
  'inb-aviso': 'Aviso de viaje',
  'inb-sac': 'SAC',
}

export function Evaluar() {
  const db = useDb()
  const prefs = usePrefs()
  const ruta = useRuta()
  const editarId = ruta.sub
  const evEditar = editarId ? db.evaluaciones.find((e) => e.id === editarId) : undefined
  const analistaDefecto = db.analistas.find((a) => a.id === prefs.analistaId && a.activo)?.id ?? ''

  const [b, setB] = useState<Borrador>(() => {
    if (evEditar) return desdeEvaluacion(evEditar)
    const canalParam = ruta.params.get('canal') as Canal | null
    const agenteParam = ruta.params.get('agente')
    const ag = agenteParam ? db.agentes.find((a) => a.id === agenteParam) : undefined
    if (ag) return borradorVacio(analistaDefecto, ag.canal, { agenteId: ag.id, proceso: ag.canal === 'Inbound' ? 'Inbound' : procesoMonitoreo(ag) })
    const guardado = leerBorrador()
    if (guardado && (borradorConDatos(guardado) || !canalParam)) return { ...guardado, analistaId: guardado.analistaId || analistaDefecto }
    return borradorVacio(analistaDefecto, canalParam)
  })
  const [guardando, setGuardando] = useState(false)
  const [intento, setIntento] = useState(false)
  const filaActiva = useRef<string | null>(null)
  const avisoFalta = useRef<number | null>(null)

  const agenteUrl = ruta.params.get('agente')
  const canalUrl = ruta.params.get('canal') as Canal | null
  useEffect(() => {
    if (evEditar || (!agenteUrl && !canalUrl)) return
    let vigente = true
    void (async () => {
      const ag = agenteUrl ? db.agentes.find((a) => a.id === agenteUrl) : undefined
      const destinoCanal = ag?.canal ?? canalUrl
      const yaEsta = ag ? b.agenteId === ag.id : b.canal === destinoCanal && !b.agenteId
      if (!yaEsta) {
        const actual = b.agenteId ? db.agentes.find((a) => a.id === b.agenteId) : undefined
        if (Object.keys(b.respuestas).length) {
          const ok = await confirmar({
            titulo: 'Tienes una evaluación sin guardar',
            texto: `${actual ? `${actual.nombre}: ` : ''}${Object.keys(b.respuestas).length} rubros calificados. ¿Descartarla y empezar ${ag ? `la de ${ag.nombre}` : `una de ${destinoCanal}`}?`,
            confirmar: 'Descartar y empezar',
            peligro: true,
          })
          if (!ok || !vigente) {
            setParams({ agente: null, canal: null })
            return
          }
        }
        setB(
          ag
            ? borradorVacio(b.analistaId || analistaDefecto, ag.canal, { agenteId: ag.id, proceso: ag.canal === 'Inbound' ? 'Inbound' : procesoMonitoreo(ag), fechaEvaluacion: b.fechaEvaluacion, fechaLlamada: b.fechaLlamada })
            : borradorVacio(b.analistaId || analistaDefecto, destinoCanal, { fechaEvaluacion: b.fechaEvaluacion, fechaLlamada: b.fechaLlamada }),
        )
        setIntento(false)
      }
      setParams({ agente: null, canal: null })
    })()
    return () => {
      vigente = false
    }
  }, [agenteUrl, canalUrl])

  useEffect(() => {
    if (evEditar && b.id !== evEditar.id) setB(desdeEvaluacion(evEditar))
  }, [editarId])

  useEffect(() => {
    if (b.id) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b))
      } catch {
      }
    }, 300)
    return () => clearTimeout(t)
  }, [b])

  const agente = b.agenteId ? db.agentes.find((a) => a.id === b.agenteId) ?? null : null
  const cedula = b.cedulaId ? cedulaPorId(db.catalogo, b.cedulaId) : undefined
  const bloques = useMemo(() => (b.cedulaId ? bloquesDeCedula(db.catalogo, b.cedulaId) : []), [db.catalogo, b.cedulaId])
  const items = useMemo(() => bloques.flatMap((g) => g.items), [bloques])
  const calif = useMemo(() => (cedula ? calificar(cedula.items, db.catalogo.items, b.respuestas, b.motivos) : null), [cedula, db.catalogo.items, b.respuestas, b.motivos])
  const cfg = db.config
  const semana = b.fechaEvaluacion ? semanaDelMes(b.fechaEvaluacion) : null

  const historial = useMemo(() => {
    if (!agente) return []
    return db.evaluaciones
      .filter((e) => e.agenteId === agente.id && e.id !== b.id)
      .sort((x, y) => y.fechaEvaluacion.localeCompare(x.fechaEvaluacion) || y.creadoEn.localeCompare(x.creadoEn))
  }, [db.evaluaciones, agente, b.id])

  const reincidencias = useMemo(() => {
    const r = new Map<string, number>()
    if (!calif || !agente || !b.fechaEvaluacion || !b.cedulaId) return r
    const previas = historial.filter((e) => e.canal === agente.canal)
    for (const key of calif.fallas) r.set(key, contarReincidencia(previas, b.fechaEvaluacion, b.cedulaId, key))
    return r
  }, [calif, agente, historial, b.fechaEvaluacion, b.cedulaId])
  const nivel = calif
    ? nivelPlan(
        calif.puntaje,
        calif.critico,
        calif.fallas.map((k) => ({ critico: calif.criticos.includes(k), reincidencia: reincidencias.get(k) ?? 0 })),
        undefined,
        cfg.meta,
        cfg.umbralRojo,
      )
    : 0
  const ruta0 = db.modelo.ruta.find((r) => r.nivel === nivel)
  const semaforo = calif ? semaforoDe(calif.puntaje, calif.critico, cfg) : null
  const duracionSeg = parseDuracion(b.duracion)
  const duplicado = b.idCaso.trim() && agente ? db.evaluaciones.find((e) => e.id !== b.id && e.agenteId === agente.id && e.idCaso.trim() === b.idCaso.trim() && e.cedulaId === b.cedulaId) : undefined

  const errores: string[] = []
  if (!agente) errores.push('Elige al ejecutivo')
  if (!cedula) errores.push(b.canal === 'Monitoreo' ? 'Elige el tipo de llamada' : 'Elige la cédula (tipo de llamada)')
  if (b.canal === 'Monitoreo' && !b.proceso) errores.push('Elige el proceso')
  if (!b.fechaEvaluacion) errores.push('Indica la fecha de evaluación')
  if (!b.analistaId) errores.push('Elige al analista de calidad')
  if (b.duracion && duracionSeg === null) errores.push('Duración con formato mm:ss')
  if (calif && calif.faltantes.length) errores.push(`Faltan ${calif.faltantes.length} rubro${calif.faltantes.length === 1 ? '' : 's'} por calificar`)
  if (calif && calif.motivoPendiente.length) errores.push('Elige el motivo de los rubros marcados con “No”')

  useEffect(() => {
    if (!errores.length && avisoFalta.current !== null) {
      quitarToast(avisoFalta.current)
      avisoFalta.current = null
    }
  })

  const set = (cambios: Partial<Borrador>) => setB((x) => ({ ...x, ...cambios }))

  const elegirAgente = (a: Agente | null) => {
    if (!a) {
      set({ agenteId: null })
      return
    }
    const cambiaCanal = a.canal !== b.canal
    set({
      agenteId: a.id,
      canal: a.canal,
      proceso: a.canal === 'Inbound' ? 'Inbound' : b.canal === 'Monitoreo' && b.proceso ? b.proceso : procesoMonitoreo(a),
      ...(cambiaCanal ? { cedulaId: null, tipoLlamada: '', respuestas: {}, motivos: {}, areas: {} } : {}),
    })
  }

  const elegirCedula = (cedulaId: string, tipo: string) => {
    if (cedulaId === b.cedulaId) {
      set({ tipoLlamada: tipo })
      return
    }
    const nueva = cedulaPorId(db.catalogo, cedulaId)
    const validas = new Set(nueva?.items.map((i) => i.key))
    const filtrar = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => validas.has(k)))
    set({ cedulaId, tipoLlamada: tipo, respuestas: filtrar(b.respuestas), motivos: filtrar(b.motivos), areas: filtrar(b.areas) })
  }

  const responder = (key: string, r: Resp, avanzar = false) => {
    setB((x) => {
      const respuestas = { ...x.respuestas, [key]: r }
      const motivos = { ...x.motivos }
      const areas = { ...x.areas }
      if (r !== 'N') {
        delete motivos[key]
        delete areas[key]
      }
      return { ...x, respuestas, motivos, areas }
    })
    if (avanzar) {
      const i = items.findIndex((it) => it.key === key)
      const siguiente = items.slice(i + 1).find((it) => !b.respuestas[it.key] && it.key !== key) ?? items[i + 1]
      if (siguiente) setTimeout(() => document.getElementById(`rubro-${siguiente.key}`)?.focus(), 0)
    }
  }

  const completarCumple = () => {
    setB((x) => {
      const respuestas = { ...x.respuestas }
      for (const it of items) if (!respuestas[it.key]) respuestas[it.key] = 'S'
      return { ...x, respuestas }
    })
  }

  const limpiar = async () => {
    if (Object.keys(b.respuestas).length && !(await confirmar({ titulo: '¿Empezar de nuevo?', texto: 'Se borrarán las respuestas capturadas en este formulario.', confirmar: 'Borrar', peligro: true }))) return
    setB(borradorVacio(b.analistaId || analistaDefecto, b.canal, { fechaEvaluacion: b.fechaEvaluacion, fechaLlamada: b.fechaEvaluacion }))
    setIntento(false)
    try {
      localStorage.removeItem(CLAVE_BORRADOR)
    } catch {
    }
  }

  const guardar = async () => {
    setIntento(true)
    if (errores.length || !agente || !cedula || !calif) {
      if (avisoFalta.current !== null) quitarToast(avisoFalta.current)
      avisoFalta.current = avisar({ tipo: 'error', titulo: 'Falta información', texto: errores.join(' · ') })
      return
    }
    setGuardando(true)
    try {
      const analista = db.analistas.find((a) => a.id === b.analistaId)
      const aplicables = new Set(cedula.items.map((i) => i.key))
      const soloN = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => aplicables.has(k) && b.respuestas[k] === 'N' && v !== '' && v !== undefined))
      const previa = b.id ? db.evaluaciones.find((e) => e.id === b.id) : undefined
      const ev: Evaluacion = {
        id: b.id ?? uid(),
        folio: previa?.folio ?? '',
        canal: agente.canal,
        cedulaId: cedula.id,
        tipoLlamada: b.tipoLlamada || cedula.nombreExcel,
        proceso: agente.canal === 'Inbound' ? 'Inbound' : b.proceso,
        agenteId: agente.id,
        agenteNombre: agente.nombre,
        analistaId: b.analistaId,
        analista: analista?.nombre ?? '',
        fechaLlamada: b.fechaLlamada || null,
        fechaEvaluacion: b.fechaEvaluacion,
        semana: semanaDelMes(b.fechaEvaluacion),
        duracionSeg,
        idCaso: b.idCaso.trim(),
        tipoAuditoria: b.tipoAuditoria,
        respuestas: Object.fromEntries(Object.entries(b.respuestas).filter(([k]) => aplicables.has(k))),
        motivos: soloN(b.motivos),
        areas: soloN(b.areas),
        observaciones: b.observaciones.trim(),
        pesos: Object.fromEntries(cedula.items.map((i) => [i.key, i.peso])),
        criticos: Object.fromEntries(cedula.items.filter((i) => i.critico !== 'no').map((i) => [i.key, i.critico])),
        puntaje: calif.puntaje,
        critico: calif.critico,
        feedback: previa?.feedback,
        origen: previa?.origen ?? { tipo: 'portal' },
        notasMigracion: previa?.notasMigracion,
        creadoEn: previa?.creadoEn ?? '',
        actualizadoEn: '',
        creadoPor: previa?.creadoPor ?? '',
      }
      const guardada = await store.op<Evaluacion>('evaluacion.guardar', ev)
      const dbActual = store.get().db!
      const plan = derivarPlanes(dbActual, hoyIso()).planPorEval.get(guardada.id)
      const docs = plan ? await crearDocumentosAutomaticos(dbActual, guardada, plan) : []
      try {
        localStorage.removeItem(CLAVE_BORRADOR)
      } catch {
      }
      const acciones: { etiqueta: string; onClick: () => void }[] = [{ etiqueta: 'Ver evaluación', onClick: () => abrirPanel('ev', guardada.id) }]
      if (docs.length) acciones.push({ etiqueta: `Abrir ${docs[0].tipo === 'retro' ? 'retroalimentación' : 'documento'}`, onClick: () => abrirPanel('doc', docs[0].id) })
      avisar({
        tipo: 'exito',
        titulo: `${guardada.folio} guardada · ${pct(guardada.puntaje)}`,
        texto: plan ? `Nivel ${plan.nivel} · ${plan.ruta.nombre}${docs.length ? ` · ${docs.length} documento${docs.length > 1 ? 's' : ''} listo${docs.length > 1 ? 's' : ''} para firmar` : ''}` : 'En meta: sin plan de acción.',
        acciones,
      })
      if (b.id) {
        ir('evaluaciones', { params: { p: `ev:${guardada.id}` } })
      } else {
        setB(borradorVacio(b.analistaId, b.canal, { fechaEvaluacion: b.fechaEvaluacion, fechaLlamada: b.fechaEvaluacion, tipoAuditoria: b.tipoAuditoria }))
        setIntento(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err) {
      avisar({ tipo: 'error', titulo: 'No se pudo guardar', texto: err instanceof Error ? err.message : String(err) })
    } finally {
      setGuardando(false)
    }
  }

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void guardar()
      }
    }
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  })

  const tiposMonitoreo = useMemo(() => cedulasDeCanal(db.catalogo, 'Monitoreo').flatMap((c) => (c.tiposLlamada ?? []).map((t) => ({ tipo: t, cedulaId: c.id }))), [db.catalogo])
  const ultimas = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of db.evaluaciones) if (!m.has(e.agenteId) || e.fechaEvaluacion > m.get(e.agenteId)!) m.set(e.agenteId, e.fechaEvaluacion)
    return new Map([...m].map(([k, v]) => [k, fechaCorta(v)]))
  }, [db.evaluaciones])
  const respondidos = calif?.respondidos ?? 0

  return (
    <div>
      <EncabezadoPagina
        titulo={evEditar ? `Editar ${evEditar.folio}` : 'Nueva evaluación'}
        subtitulo={
          evEditar ? (
            <>Los cambios recalculan la calificación, la reincidencia y el plan de acción.</>
          ) : (
            <>
              La calificación, la reincidencia, el plan y los documentos se calculan solos.
            </>
          )
        }
        acciones={
          <Boton variante="plano" tam="sm" icono={<RotateCcw className="size-4" />} onClick={limpiar}>
            Empezar de nuevo
          </Boton>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta className="anim-aparecer p-5 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Campo etiqueta="Ejecutivo evaluado" className="md:col-span-2" error={intento && !agente ? 'Elige al ejecutivo' : undefined}>
                <SelectorAgente agentes={db.agentes} valor={b.agenteId} onChange={elegirAgente} canal={b.canal && !b.agenteId ? b.canal : null} autoFocus={!b.agenteId && !evEditar} ultimos={ultimas} />
                {agente && <ContextoAgente agenteId={agente.id} historial={historial} />}
              </Campo>
              {!agente && (
                <Campo etiqueta="Canal" className="md:col-span-2">
                  <Segmentado<'' | Canal>
                    valor={b.canal ?? ''}
                    onChange={(c) => set({ canal: c || null, cedulaId: null, tipoLlamada: '' })}
                    opciones={[
                      { valor: '', etiqueta: 'Todos' },
                      { valor: 'Inbound', etiqueta: 'Inbound' },
                      { valor: 'Monitoreo', etiqueta: 'Monitoreo / VCAS / VRM' },
                    ]}
                  />
                </Campo>
              )}
              {b.canal === 'Inbound' && (
                <Campo etiqueta="Cédula (tipo de llamada)" className="md:col-span-2" error={intento && !cedula ? 'Elige la cédula' : undefined}>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cédula">
                    {cedulasDeCanal(db.catalogo, 'Inbound').map((c) => (
                      <Chip key={c.id} activo={b.cedulaId === c.id} onClick={() => elegirCedula(c.id, c.nombreExcel)} titulo={c.nombreExcel}>
                        {NOMBRES_CORTOS_CEDULA[c.id] ?? c.nombre}
                      </Chip>
                    ))}
                  </div>
                </Campo>
              )}
              {b.canal === 'Monitoreo' && (
                <>
                  <Campo etiqueta="Tipo de llamada" className="md:col-span-2" error={intento && !cedula ? 'Elige el tipo de llamada' : undefined}>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de llamada">
                      {tiposMonitoreo.map((t) => (
                        <Chip key={t.tipo} activo={b.cedulaId === t.cedulaId && b.tipoLlamada === t.tipo} onClick={() => elegirCedula(t.cedulaId, t.tipo)}>
                          {etiquetaTipo(t.tipo)}
                        </Chip>
                      ))}
                    </div>
                  </Campo>
                  <Campo etiqueta="Proceso" className="md:col-span-2" error={intento && !b.proceso ? 'Elige el proceso' : undefined}>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Proceso">
                      {cfg.procesosMonitoreo.map((p) => (
                        <Chip key={p} activo={b.proceso === p} onClick={() => set({ proceso: p })}>
                          {p}
                        </Chip>
                      ))}
                    </div>
                  </Campo>
                </>
              )}
              <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:grid-cols-4">
                <Campo etiqueta="Fecha de la llamada">
                  <Entrada type="date" value={b.fechaLlamada} max={hoyIso()} onChange={(e) => set({ fechaLlamada: e.target.value })} />
                </Campo>
                <Campo etiqueta="Fecha de evaluación" ayuda={semana ? `Semana ${semana} de ${nombreMes(b.fechaEvaluacion.slice(0, 7), false)}` : undefined}>
                  <Entrada type="date" value={b.fechaEvaluacion} onChange={(e) => set({ fechaEvaluacion: e.target.value })} />
                </Campo>
                <Campo etiqueta="Duración (mm:ss)" error={b.duracion && duracionSeg === null ? 'Ej. 6:51' : undefined}>
                  <Entrada inputMode="numeric" placeholder="6:51" value={b.duracion} onChange={(e) => set({ duracion: e.target.value })} onBlur={() => duracionSeg !== null && set({ duracion: duracion(duracionSeg) })} />
                </Campo>
                <Campo etiqueta="ID cliente / llamada / caso" error={duplicado ? `Ya evaluado en ${duplicado.folio}` : undefined}>
                  <Entrada placeholder="12045512" value={b.idCaso} onChange={(e) => set({ idCaso: e.target.value })} />
                </Campo>
              </div>
              <Campo etiqueta="Analista de calidad">
                <Selector value={b.analistaId} onChange={(e) => set({ analistaId: e.target.value })}>
                  <option value="">Elegir…</option>
                  {db.analistas
                    .filter((a) => a.activo || a.id === b.analistaId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Tipo de auditoría">
                <Segmentado
                  completo
                  valor={b.tipoAuditoria}
                  onChange={(v) => set({ tipoAuditoria: v })}
                  opciones={cfg.tiposAuditoria.map((t) => ({ valor: t, etiqueta: t.charAt(0) + t.slice(1).toLowerCase() }))}
                />
              </Campo>
            </div>
          </Tarjeta>

          {!cedula ? (
            <Tarjeta className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <ClipboardCheck className="size-9 text-ink-3" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold">{agente ? 'Elige el tipo de llamada' : 'Empieza eligiendo al ejecutivo'}</p>
              <p className="max-w-sm text-[13px] text-ink-2">Aparecerán solo los rubros que aplican a esa cédula, con su ponderación, criterios y errores críticos.</p>
            </Tarjeta>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink-2">
                    <span className="font-semibold text-ink">{cedula.nombre}</span> · {items.length} rubros · {cedula.total} puntos ·{' '}
                    {items.filter((i) => i.critico !== 'no').length} críticos
                  </p>
                  <p className="mt-0.5 hidden text-[12px] text-ink-3 lg:block">
                    Atajos en cada rubro: <Tecla>1</Tecla> cumple · <Tecla>2</Tecla> no cumple · <Tecla>3</Tecla> no aplica · <Tecla>Ctrl</Tecla>+<Tecla>Enter</Tecla> guarda
                  </p>
                </div>
                <div className="flex gap-2">
                  <Boton variante="tinte" tam="sm" icono={<Sparkles className="size-4" />} onClick={completarCumple} disabled={!calif?.faltantes.length}>
                    Marcar pendientes como “Cumple”
                  </Boton>
                </div>
              </div>
              {bloques.map((g) => (
                <BloqueRubros
                  key={g.bloque}
                  grupo={g}
                  b={b}
                  intento={intento}
                  reincidencias={reincidencias}
                  responder={responder}
                  setMotivo={(k, m) => setB((x) => ({ ...x, motivos: { ...x.motivos, [k]: m } }))}
                  setArea={(k, t) => setB((x) => ({ ...x, areas: { ...x.areas, [k]: t } }))}
                  filaActiva={filaActiva}
                />
              ))}
              <Tarjeta className="p-5 md:p-6">
                <Campo etiqueta="Observaciones generales" ayuda="Aparecen en la retroalimentación y en el historial del ejecutivo.">
                  <AreaTexto rows={3} value={b.observaciones} onChange={(e) => set({ observaciones: e.target.value })} placeholder="Ej. Buen manejo de la llamada; reforzar validación de transacciones en VRM." />
                </Campo>
              </Tarjeta>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <Tarjeta className="anim-aparecer overflow-hidden">
            <div className="flex items-center gap-4 p-5">
              <Anillo valor={calif?.puntaje ?? null} color={colorPuntaje(calif?.puntaje, calif?.critico, cfg.meta, cfg.umbralRojo)} tam={104} grosor={10}>
                <span className="text-[24px] font-bold tracking-[-0.02em]">{calif?.puntaje === null || !calif ? '—' : pct(calif.puntaje)}</span>
                <span className="text-[11px] text-ink-2">calificación</span>
              </Anillo>
              <div className="min-w-0 flex-1">
                {calif ? <SemaforoPill estado={semaforo} critico={calif.critico} /> : <Insignia>Sin datos</Insignia>}
                <p className="mt-2 text-[12.5px] text-ink-2">{calif ? etiquetaResultado(calif.puntaje, calif.critico, cfg) : 'Elige ejecutivo y cédula'}</p>
                {calif && (
                  <p className="mt-0.5 text-[12px] text-ink-3 tabular">
                    Sí {calif.si} · No {calif.no} · de {calif.posibles} pts
                  </p>
                )}
              </div>
            </div>
            {calif && (
              <div className="px-5 pb-4">
                <div className="mb-1.5 flex justify-between text-[12px] text-ink-2">
                  <span>Rubros calificados</span>
                  <span className="font-semibold text-ink tabular">
                    {respondidos} / {calif.aplicables}
                  </span>
                </div>
                <Medidor valor={calif.aplicables ? respondidos / calif.aplicables : 0} color={respondidos === calif.aplicables ? 'var(--good)' : 'var(--accent)'} />
              </div>
            )}
            {calif && calif.fallas.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2 text-[12px] font-semibold text-ink-2">Incumplimientos ({calif.fallas.length})</p>
                <ul className="space-y-1.5">
                  {calif.fallas.map((k) => {
                    const def = db.catalogo.items[k]
                    const r = reincidencias.get(k) ?? 0
                    return (
                      <li key={k} className="flex items-start gap-2 text-[12.5px]">
                        {calif.criticos.includes(k) ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-bad-ink" /> : <X className="mt-0.5 size-3.5 shrink-0 text-bad-ink" />}
                        <span className="min-w-0 flex-1">
                          <button className="text-left hover:underline" onClick={() => document.getElementById(`rubro-${k}`)?.focus()}>
                            {def?.topico}
                          </button>
                          {r > 0 && <span className="ml-1 font-semibold text-violet">· {r + 1}.ª vez en 30 días</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {calif && respondidos > 0 && (
              <div className="border-t border-line px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink-2">Plan de acción</p>
                  <NivelBadge nivel={nivel} corto />
                </div>
                <p className="mt-1.5 text-[13px] font-semibold">{ruta0?.nombre}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{nivel === 0 ? 'Sin plan: muestreo normal y reconocimiento.' : ruta0?.accion}</p>
                {nivel > 0 && (
                  <p className="mt-2 text-[12px] text-ink-2">
                    Compromiso: <span className="font-semibold text-ink">{fechaMedia(sumarDias(b.fechaEvaluacion || hoyIso(), ruta0?.plazo ?? 0))}</span> · Se generará:{' '}
                    <span className="font-semibold text-ink">{(DOCS_POR_NIVEL[nivel] ?? []).map((d) => ({ retro: 'Retroalimentación', carta: 'Carta de compromiso', acta: 'Acta administrativa' })[d]).join(' + ')}</span>
                  </p>
                )}
              </div>
            )}
            <div className="border-t border-line p-4">
              {intento && errores.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {errores.map((e) => (
                    <li key={e} className="flex items-center gap-1.5 text-[12.5px] text-bad-ink">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {duplicado && (
                <button onClick={() => abrirPanel('ev', duplicado.id)} className="mb-3 flex w-full items-center gap-1.5 rounded-[10px] bg-warn-soft px-3 py-2 text-left text-[12.5px] text-warn-ink">
                  <Info className="size-3.5 shrink-0" />
                  Este caso ya se evaluó para el ejecutivo ({duplicado.folio}). Ver
                </button>
              )}
              <Boton variante="primario" tam="lg" className="w-full" onClick={guardar} cargando={guardando} icono={<Check className="size-[18px]" />}>
                {evEditar ? 'Guardar cambios' : 'Guardar evaluación'}
              </Boton>
              <p className="mt-2 text-center text-[11.5px] text-ink-3">
                Se calculan solos: reincidencia, nivel, fecha compromiso y documentos.
              </p>
            </div>
          </Tarjeta>
        </aside>
      </div>
    </div>
  )
}

function procesoMonitoreo(a: Agente) {
  return ['Monitoreo', 'VCAS', 'VRM'].includes(a.proceso) ? a.proceso : 'Monitoreo'
}

function Chip({ activo, onClick, children, titulo }: { activo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      title={titulo}
      onClick={onClick}
      className={cx(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-[background,color,box-shadow] duration-150',
        activo ? 'bg-accent text-on-accent shadow-[0_1px_2px_rgba(0,0,0,0.15)]' : 'bg-fill-2 text-ink hover:bg-fill',
      )}
    >
      {activo && <Check className="size-3.5" />}
      {children}
    </button>
  )
}

function ContextoAgente({ agenteId, historial }: { agenteId: string; historial: Evaluacion[] }) {
  const db = useDb()
  const ultimas = historial.slice(0, 4)
  const plan = useMemo(() => {
    const d = derivarPlanes(db, hoyIso())
    return d.planes.find((p) => p.ev.agenteId === agenteId && ['pendiente', 'verificacion', 'vencido'].includes(p.estado))
  }, [db, agenteId])
  if (!ultimas.length) return <p className="mt-1.5 text-[12px] text-ink-3">Primera evaluación registrada para este ejecutivo.</p>
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
      <span>Últimas:</span>
      {ultimas.map((e) => (
        <button key={e.id} onClick={() => abrirPanel('ev', e.id)} className="inline-flex items-center gap-1 hover:text-ink">
          <span className="size-1.5 rounded-full" style={{ background: colorPuntaje(e.puntaje, e.critico, db.config.meta, db.config.umbralRojo) }} />
          <span className="font-semibold tabular">{pct(e.puntaje)}</span>
          <span className="text-ink-3">{fechaCorta(e.fechaEvaluacion)}</span>
        </button>
      ))}
      {plan && (
        <button onClick={() => abrirPanel('plan', plan.id)} className="inline-flex items-center gap-1 font-medium text-violet hover:underline">
          Plan abierto N{plan.nivel}
          <ChevronRight className="size-3" />
        </button>
      )}
      <button onClick={() => abrirPanel('ag', agenteId)} className="font-medium text-accent-ink hover:underline">
        Ver perfil de {nombreCorto(db.agentes.find((a) => a.id === agenteId)?.nombre ?? '')}
      </button>
    </div>
  )
}

function BloqueRubros({
  grupo,
  b,
  intento,
  reincidencias,
  responder,
  setMotivo,
  setArea,
  filaActiva,
}: {
  grupo: GrupoBloque
  b: Borrador
  intento: boolean
  reincidencias: Map<string, number>
  responder: (k: string, r: Resp, avanzar?: boolean) => void
  setMotivo: (k: string, m: string) => void
  setArea: (k: string, t: string) => void
  filaActiva: React.MutableRefObject<string | null>
}) {
  const si = grupo.items.filter((i) => b.respuestas[i.key] === 'S').reduce((s, i) => s + i.peso, 0)
  const no = grupo.items.filter((i) => b.respuestas[i.key] === 'N').reduce((s, i) => s + i.peso, 0)
  const pendientes = grupo.items.filter((i) => !b.respuestas[i.key]).length
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 md:px-6">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{grupo.bloque}</h3>
        <span className="text-[12px] text-ink-2 tabular">
          {pendientes ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''} · ` : ''}
          {si} de {grupo.puntos - grupo.items.filter((i) => b.respuestas[i.key] === 'A').reduce((s, i) => s + i.peso, 0)} pts
          {no > 0 && <span className="text-bad-ink"> · −{no}</span>}
        </span>
      </div>
      <ul>
        {grupo.items.map((it) => (
          <FilaRubro
            key={it.key}
            it={it}
            resp={b.respuestas[it.key]}
            motivo={b.motivos[it.key]}
            area={b.areas[it.key] ?? ''}
            reincidencia={reincidencias.get(it.key) ?? 0}
            pendienteMotivo={intento && b.respuestas[it.key] === 'N' && it.critico === 'motivo' && !b.motivos[it.key]}
            faltante={intento && !b.respuestas[it.key]}
            responder={responder}
            setMotivo={setMotivo}
            setArea={setArea}
            filaActiva={filaActiva}
          />
        ))}
      </ul>
    </Tarjeta>
  )
}

function FilaRubro({
  it,
  resp,
  motivo,
  area,
  reincidencia,
  pendienteMotivo,
  faltante,
  responder,
  setMotivo,
  setArea,
  filaActiva,
}: {
  it: ItemCompleto
  resp?: Resp
  motivo?: string
  area: string
  reincidencia: number
  pendienteMotivo: boolean
  faltante: boolean
  responder: (k: string, r: Resp, avanzar?: boolean) => void
  setMotivo: (k: string, m: string) => void
  setArea: (k: string, t: string) => void
  filaActiva: React.MutableRefObject<string | null>
}) {
  const [verCriterio, setVerCriterio] = useState(false)
  const critico = it.critico !== 'no'
  return (
    <li
      id={`rubro-${it.key}`}
      tabIndex={0}
      onFocus={() => (filaActiva.current = it.key)}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
        const k = e.key.toLowerCase()
        if (k === '1' || k === 's') responder(it.key, 'S', true)
        else if (k === '2' || k === 'n') responder(it.key, 'N', false)
        else if (k === '3' || k === 'a') responder(it.key, 'A', true)
        else if (k === 'arrowdown' || k === 'arrowup') {
          e.preventDefault()
          const filas = [...document.querySelectorAll<HTMLElement>('li[id^="rubro-"]')]
          const i = filas.findIndex((f) => f.id === `rubro-${it.key}`)
          filas[i + (k === 'arrowdown' ? 1 : -1)]?.focus()
        } else return
        if (k !== 'arrowdown' && k !== 'arrowup') e.preventDefault()
      }}
      className={cx(
        'group relative border-t border-line px-5 py-3 outline-none transition-colors md:px-6',
        'focus-visible:bg-accent-soft/50 focus-visible:shadow-[inset_3px_0_0_var(--accent)]',
        resp === 'N' && 'bg-bad-soft/40 shadow-[inset_3px_0_0_var(--bad)]',
        faltante && 'bg-warn-soft/40',
      )}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={() => setVerCriterio((v) => !v)} className="text-left text-[14px] leading-snug font-medium hover:text-accent-ink" aria-expanded={verCriterio}>
              {it.def.topico}
            </button>
            {critico && (
              <Insignia tono="rojo" icono={<ShieldAlert className="size-3" />}>
                {it.critico === 'motivo' ? 'Crítico según motivo' : 'Crítico'}
              </Insignia>
            )}
            {reincidencia > 0 && resp === 'N' && <Insignia tono="violeta">{reincidencia + 1}.ª vez en 30 días</Insignia>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
            <span className="tabular">{it.peso} pts</span>
            {(it.cuandoSi || it.cuandoNo) && (
              <button type="button" onClick={() => setVerCriterio((v) => !v)} className="inline-flex items-center gap-0.5 hover:text-accent-ink">
                {verCriterio ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                Criterio
              </button>
            )}
          </div>
        </div>
        <ControlRespuesta valor={resp} onChange={(r) => responder(it.key, r)} />
      </div>
      {verCriterio && (
        <div className="anim-aparecer mt-3 grid gap-2 rounded-[12px] bg-surface-2 p-3 text-[12.5px] leading-relaxed sm:grid-cols-2">
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
        </div>
      )}
      {resp === 'N' && (
        <div className="anim-aparecer mt-3 flex flex-col gap-2.5">
          {it.def.motivos?.length ? (
            <div>
              <p className={cx('mb-1.5 text-[12px] font-medium', pendienteMotivo ? 'text-bad-ink' : 'text-ink-2')}>Motivo {pendienteMotivo && '(obligatorio)'}</p>
              <div className="flex flex-wrap gap-1.5">
                {it.def.motivos.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => setMotivo(it.key, m.label)}
                    className={cx(
                      'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                      motivo === m.label ? (m.critico ? 'bg-bad text-white' : 'bg-ink text-surface') : 'bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-hover',
                    )}
                  >
                    {m.critico && <ShieldAlert className="size-3.5" />}
                    {m.label}
                    {m.critico && <span className="opacity-80">· crítico</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Entrada value={area} onChange={(e) => setArea(it.key, e.target.value)} placeholder="Principal área de oportunidad (opcional)…" className="bg-surface" />
        </div>
      )}
    </li>
  )
}

function ControlRespuesta({ valor, onChange }: { valor?: Resp; onChange: (r: Resp) => void }) {
  const op = (r: Resp, etiqueta: string, icono: React.ReactNode, clasesActivo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={valor === r}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        onChange(r)
      }}
      className={cx(
        'inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[8px] px-2.5 text-[12.5px] font-semibold transition-[background,color,box-shadow] duration-150 sm:flex-none',
        valor === r ? clasesActivo : 'text-ink-2 hover:bg-hover hover:text-ink',
      )}
    >
      {icono}
      {etiqueta}
    </button>
  )
  return (
    <div role="radiogroup" aria-label="Respuesta" className="flex shrink-0 gap-0.5 rounded-[10px] bg-fill-2 p-[2px]">
      {op('S', 'Cumple', <Check className="size-3.5" />, 'bg-[#0b7a34] text-white shadow-[0_1px_2px_rgba(0,0,0,0.15)]')}
      {op('N', 'No cumple', <X className="size-3.5" />, 'bg-[#c4232a] text-white shadow-[0_1px_2px_rgba(0,0,0,0.15)]')}
      {op('A', 'N/A', <CircleSlash className="size-3.5" />, 'bg-[var(--segmented-on)] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]')}
    </div>
  )
}
