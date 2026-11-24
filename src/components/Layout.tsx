import { useMemo, useState, type ReactNode } from 'react'
import { Bell, CalendarDays, Check, ChevronDown, Laptop, Moon, MoreHorizontal, Plus, Search, Sun } from 'lucide-react'
import { useRuta, ir, enlace, abrirPanel } from '../lib/router'
import { useStore } from '../lib/store'
import { setPrefs, temaEfectivo, usePrefs, type Tema } from '../lib/prefs'
import { useAlertas, useVista } from '../lib/vista'
import { claveTexto, mesesConDatos, type FiltroCanal, type Periodo } from '../lib/periodo'
import { claveMes, hoyIso, nombreMesCapital } from '../lib/dates'
import { num } from '../lib/format'
import { planAbierto } from '../lib/plans'
import { PAGINAS } from './navegacion'
import { Popover, OpcionMenu, TituloMenu } from './Popover'
import { Avatar, Boton, Entrada, Segmentado, Tecla, cx } from './ui'

export const PAGINAS_CON_FILTROS = new Set(['inicio', 'evaluaciones', 'equipo', 'seguimiento', 'analisis'])

const BASE = import.meta.env.BASE_URL

export function Marca({ compacta, negativa, className }: { compacta?: boolean; negativa?: boolean; className?: string }) {
  usePrefs()
  if (compacta) return <img src={`${BASE}marca/isotipo.png`} alt="Positivo S+" draggable={false} className={cx('h-[22px] w-auto select-none', className)} />
  const oscuro = negativa ?? temaEfectivo() === 'oscuro'
  return (
    <img
      src={`${BASE}marca/${oscuro ? 'logo-preferencial-negativo' : 'logo-preferencial'}.png`}
      alt="Positivo S+"
      draggable={false}
      className={cx('h-[19px] w-auto select-none', className)}
    />
  )
}

function useConteoPlanes() {
  const { derivados } = useVista()
  return useMemo(() => {
    const abiertos = derivados.planes.filter(planAbierto)
    return { abiertos: abiertos.length, vencidos: abiertos.filter((p) => p.estado === 'vencido').length }
  }, [derivados])
}

function BarraLateral() {
  const ruta = useRuta()
  const { abiertos, vencidos } = useConteoPlanes()
  return (
    <aside className="zona-marca fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-line md:flex xl:w-[248px] no-imprimir">
      <div className="flex h-[64px] shrink-0 items-center justify-center px-5 xl:justify-start">
        <a href={enlace('inicio')} className="flex items-center rounded-[8px]" aria-label="Positivo S+ · ir al resumen">
          <span className="hidden xl:inline">
            <Marca negativa />
          </span>
          <span className="xl:hidden">
            <Marca compacta />
          </span>
        </a>
      </div>
      <div className="linea-marca mx-5 hidden h-[2px] rounded-full xl:block" aria-hidden />
      <p className="hidden px-5 pt-2.5 pb-3 text-[11.5px] font-medium tracking-[0.01em] text-ink-2 xl:block">Calidad · Prevención de Fraudes</p>
      <nav className="mt-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 xl:mt-0" aria-label="Secciones">
        {PAGINAS.map((p) => {
          const activo = ruta.pagina === p.id
          const badge = p.id === 'seguimiento' ? (vencidos ? { n: vencidos, rojo: true } : abiertos ? { n: abiertos, rojo: false } : null) : null
          return (
            <a
              key={p.id}
              href={enlace(p.id)}
              title={p.titulo}
              aria-current={activo ? 'page' : undefined}
              className={cx(
                'group relative flex h-9 shrink-0 items-center gap-3 rounded-[9px] px-2.5 text-[13.5px] font-medium transition-colors xl:px-3',
                'justify-center xl:justify-start',
                activo ? 'bg-[var(--press)] text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
              )}
            >
              {activo && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden />}
              <p.icono className={cx('size-[18px] shrink-0', activo ? 'text-accent' : '')} strokeWidth={activo ? 2.2 : 1.9} />
              <span className="hidden flex-1 truncate xl:block">{p.titulo}</span>
              {badge && (
                <span
                  className={cx(
                    'absolute top-0.5 right-0.5 min-w-[18px] rounded-full px-1.5 text-center text-[10.5px] leading-[18px] font-semibold tabular xl:static',
                    badge.rojo ? 'bg-bad text-white' : 'bg-fill text-ink',
                  )}
                  title={badge.rojo ? `${badge.n} planes vencidos` : `${badge.n} planes abiertos`}
                >
                  {badge.n}
                </span>
              )}
            </a>
          )
        })}
      </nav>
      <PieLateral />
    </aside>
  )
}

function PieLateral() {
  const { db, conexion, modo } = useStore()
  const prefs = usePrefs()
  const analista = db?.analistas.find((a) => a.id === prefs.analistaId)
  const estado =
    modo === 'local'
      ? { color: 'bg-ink-3', texto: 'Modo local · solo este navegador' }
      : conexion === 'en-linea'
        ? { color: 'bg-good', texto: 'Sincronizado en vivo' }
        : { color: 'bg-warn', texto: 'Reconectando…' }
  return (
    <div className="flex flex-col gap-2 border-t border-line p-3">
      <Popover
        alinear="inicio"
        ancho={270}
        className="w-full"
        disparador={(abierto, alternar) => (
          <button
            onClick={alternar}
            aria-expanded={abierto}
            className={cx('flex w-full items-center justify-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-hover xl:justify-start', abierto && 'bg-hover')}
            title="Analista que usa este equipo"
          >
            {analista ? (
              <Avatar nombre={analista.nombre} tam={32} />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-[13px] font-semibold text-ink-2">?</span>
            )}
            <span className="hidden min-w-0 flex-1 xl:block">
              <span className="block truncate text-[13px] font-semibold">{analista?.corto ?? (prefs.analistaId === 'consulta' ? 'Solo consulta' : 'Elige tu nombre')}</span>
              <span className="block truncate text-[11.5px] text-ink-2">{analista ? 'Analista de calidad' : 'Toca para elegir tu nombre'}</span>
            </span>
            <ChevronDown className={cx('hidden size-4 shrink-0 text-ink-3 transition-transform xl:block', abierto && 'rotate-180')} />
          </button>
        )}
      >
        {(cerrar) => (
          <>
            <TituloMenu>¿Quién usa este equipo?</TituloMenu>
            {db?.analistas
              .filter((a) => a.activo)
              .map((a) => (
                <OpcionMenu
                  key={a.id}
                  activo={a.id === prefs.analistaId}
                  onClick={() => {
                    setPrefs({ analistaId: a.id })
                    cerrar()
                  }}
                >
                  {a.nombre}
                </OpcionMenu>
              ))}
            <div className="my-1 h-px bg-line" />
            <OpcionMenu
              activo={prefs.analistaId === 'consulta'}
              onClick={() => {
                setPrefs({ analistaId: 'consulta' })
                cerrar()
              }}
            >
              Solo consulta
            </OpcionMenu>
          </>
        )}
      </Popover>
      <div className="hidden xl:block">
        <Segmentado<Tema>
          completo
          tam="sm"
          etiqueta="Apariencia"
          valor={prefs.tema}
          onChange={(t) => setPrefs({ tema: t })}
          opciones={[
            { valor: 'claro', etiqueta: '', icono: <Sun className="size-3.5" />, titulo: 'Claro' },
            { valor: 'oscuro', etiqueta: '', icono: <Moon className="size-3.5" />, titulo: 'Oscuro' },
            { valor: 'sistema', etiqueta: '', icono: <Laptop className="size-3.5" />, titulo: 'Automático (sistema)' },
          ]}
        />
      </div>
      <div className="flex items-center justify-center gap-2 px-1 text-[11.5px] text-ink-2 xl:justify-start" title={estado.texto}>
        <span className={cx('size-2 shrink-0 rounded-full', estado.color)} />
        <span className="hidden truncate xl:inline">{estado.texto}</span>
      </div>
    </div>
  )
}

export function BotonAlertas() {
  const { atender, alta } = useAlertas()
  return (
    <button
      onClick={() => abrirPanel('alertas', 'todas')}
      aria-label={atender ? `Alertas: ${atender} por atender${alta ? `, ${alta} urgentes` : ''}` : 'Alertas: todo al día'}
      title="Alertas"
      className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-2 text-ink-2 transition-colors hover:bg-fill hover:text-ink"
    >
      <Bell className="size-4" />
      {atender > 0 && (
        <span
          className={cx(
            'absolute -top-1 -right-1 min-w-[18px] rounded-full px-1 text-center text-[10.5px] leading-[18px] font-bold tabular shadow-[0_0_0_2px_var(--bg)]',
            alta ? 'bg-bad text-white' : 'bg-warn text-black',
          )}
        >
          {atender > 99 ? '99+' : atender}
        </span>
      )}
    </button>
  )
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function FiltroPeriodo({ compacto }: { compacto?: boolean }) {
  const { db, rango } = useVista()
  const prefs = usePrefs()
  const [desde, setDesde] = useState(rango.desde.length === 10 && rango.desde > '2000' ? rango.desde : hoyIso())
  const [hasta, setHasta] = useState(rango.hasta < '2999' ? rango.hasta : hoyIso())
  const meses = mesesConDatos(db.evaluaciones)
  const actual = claveMes(hoyIso())
  if (!meses.includes(actual)) meses.unshift(actual)
  const conteo = (m: string) => db.evaluaciones.filter((e) => e.fechaEvaluacion.startsWith(m)).length
  const elegir = (p: Periodo) => setPrefs({ periodo: claveTexto(p) })
  const clave = prefs.periodo
  return (
    <Popover
      alinear="fin"
      ancho={290}
      disparador={(abierto, alternar) => (
        <button
          onClick={alternar}
          className={cx('inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-fill-2 pr-2.5 pl-3 text-[13px] font-medium transition-colors hover:bg-fill', abierto && 'bg-fill')}
          aria-label={`Periodo: ${rango.etiqueta}`}
        >
          {!compacto && <CalendarDays className="size-4 text-ink-2" />}
          <span className={cx('truncate', compacto ? 'max-w-[120px]' : 'max-w-[170px]')}>
            {compacto && rango.mes ? `${MESES_CORTOS[Number(rango.mes.slice(5, 7)) - 1]} ${rango.mes.slice(0, 4)}` : rango.etiqueta}
          </span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </button>
      )}
    >
      {(cerrar) => (
        <>
          <TituloMenu>Mes</TituloMenu>
          {meses.slice(0, 12).map((m) => (
            <OpcionMenu
              key={m}
              activo={clave === `mes:${m}` || (clave === '' && rango.mes === m)}
              detalle={num(conteo(m))}
              onClick={() => {
                elegir({ tipo: 'mes', mes: m })
                cerrar()
              }}
            >
              {nombreMesCapital(m)}
            </OpcionMenu>
          ))}
          <div className="my-1 h-px bg-line" />
          {[
            { p: { tipo: 'dias', dias: 30 } as Periodo, t: 'Últimos 30 días' },
            { p: { tipo: 'dias', dias: 90 } as Periodo, t: 'Últimos 90 días' },
            { p: { tipo: 'anio', anio: Number(hoyIso().slice(0, 4)) } as Periodo, t: `Año ${hoyIso().slice(0, 4)}` },
            { p: { tipo: 'todo' } as Periodo, t: 'Todo el historial' },
          ].map((x) => (
            <OpcionMenu
              key={x.t}
              activo={clave === claveTexto(x.p)}
              onClick={() => {
                elegir(x.p)
                cerrar()
              }}
            >
              {x.t}
            </OpcionMenu>
          ))}
          <div className="my-1 h-px bg-line" />
          <TituloMenu>Rango personalizado</TituloMenu>
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 px-2 text-[12.5px]" aria-label="Desde" />
            <span className="text-ink-3">–</span>
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 px-2 text-[12.5px]" aria-label="Hasta" />
          </div>
          <div className="px-2 pb-1">
            <Boton
              tam="sm"
              variante="tinte"
              className="w-full"
              disabled={!desde || !hasta || hasta < desde}
              onClick={() => {
                elegir({ tipo: 'rango', desde, hasta })
                cerrar()
              }}
            >
              <Check className="size-3.5" /> Aplicar rango
            </Boton>
          </div>
        </>
      )}
    </Popover>
  )
}

export function FiltroCanalGlobal() {
  const prefs = usePrefs()
  return (
    <Segmentado<FiltroCanal>
      tam="sm"
      etiqueta="Canal"
      valor={prefs.canal}
      onChange={(c) => setPrefs({ canal: c })}
      opciones={[
        { valor: 'todos', etiqueta: 'Todos' },
        { valor: 'Inbound', etiqueta: 'Inbound' },
        { valor: 'Monitoreo', etiqueta: 'Monitoreo' },
      ]}
    />
  )
}

function BarraSuperior({ onBuscar }: { onBuscar: () => void }) {
  const ruta = useRuta()
  const pagina = PAGINAS.find((p) => p.id === ruta.pagina) ?? PAGINAS[0]
  const conFiltros = PAGINAS_CON_FILTROS.has(ruta.pagina)
  return (
    <header className="material sticky top-0 z-20 hairline-b no-imprimir">
      <div className="mx-auto flex h-[56px] max-w-[1480px] items-center gap-2 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <Marca compacta />
          <span className="truncate text-[15px] font-semibold">{pagina.corto}</span>
        </div>
        <div className="flex-1" />
        {conFiltros && (
          <div className="hidden items-center gap-2 sm:flex">
            <FiltroPeriodo />
            <FiltroCanalGlobal />
          </div>
        )}
        <BotonAlertas />
        <button
          onClick={onBuscar}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-fill-2 px-3 text-[13px] text-ink-2 transition-colors hover:bg-fill hover:text-ink"
          aria-label="Buscar (Ctrl+K)"
          title="Buscar (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="hidden lg:inline">Buscar</span>
          <span className="hidden items-center gap-0.5 lg:inline-flex">
            <Tecla>Ctrl</Tecla>
            <Tecla>K</Tecla>
          </span>
        </button>
        {ruta.pagina !== 'evaluar' && (
          <div className="hidden sm:block">
            <Boton variante="primario" tam="sm" icono={<Plus className="size-4" />} onClick={() => ir('evaluar')}>
              Nueva evaluación
            </Boton>
          </div>
        )}
      </div>
      {conFiltros && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto px-4 pb-2.5 sm:hidden">
          <FiltroPeriodo compacto />
          <FiltroCanalGlobal />
        </div>
      )}
    </header>
  )
}

function BarraInferior() {
  const ruta = useRuta()
  const principales = PAGINAS.filter((p) => p.movil)
  const resto = PAGINAS.filter((p) => !p.movil)
  return (
    <nav className="material fixed inset-x-0 bottom-0 z-30 flex border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden no-imprimir" aria-label="Secciones">
      {principales.map((p) => {
        const activo = ruta.pagina === p.id
        return (
          <a key={p.id} href={enlace(p.id)} aria-current={activo ? 'page' : undefined} className={cx('flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium', activo ? 'text-accent-ink' : 'text-ink-2')}>
            <p.icono className="size-[22px]" strokeWidth={activo ? 2.2 : 1.8} />
            {p.corto}
          </a>
        )
      })}
      <Popover
        alinear="fin"
        ancho={240}
        className="flex flex-1"
        disparador={(abierto, alternar) => (
          <button
            onClick={alternar}
            aria-expanded={abierto}
            aria-label="Más secciones"
            className={cx('flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium', abierto || resto.some((p) => p.id === ruta.pagina) ? 'text-accent-ink' : 'text-ink-2')}
          >
            <MoreHorizontal className="size-[22px]" />
            Más
          </button>
        )}
      >
        {(cerrar) => (
          <div className="flex flex-col">
            {resto.map((p) => (
              <OpcionMenu
                key={p.id}
                activo={ruta.pagina === p.id}
                icono={<p.icono className="size-4" />}
                onClick={() => {
                  ir(p.id)
                  cerrar()
                }}
              >
                {p.titulo}
              </OpcionMenu>
            ))}
          </div>
        )}
      </Popover>
    </nav>
  )
}

export function Layout({ children, onBuscar }: { children: ReactNode; onBuscar: () => void }) {
  return (
    <div className="min-h-dvh">
      <BarraLateral />
      <div className="md:pl-[72px] xl:pl-[248px]">
        <BarraSuperior onBuscar={onBuscar} />
        <main className="mx-auto max-w-[1480px] px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-16">{children}</main>
      </div>
      <BarraInferior />
    </div>
  )
}

export function EncabezadoPagina({ titulo, subtitulo, acciones }: { titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="anim-aparecer mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="titulo-grande">{titulo}</h1>
        {subtitulo && <div className="mt-1.5 text-[14px] text-ink-2">{subtitulo}</div>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}
