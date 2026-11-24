import type { Documento } from '../lib/types'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

const ARCHIVO: Partial<Record<Documento['tipo'], string>> = {
  carta: 'plantillas/carta-compromiso.docx',
  acta: 'plantillas/acta-administrativa.docx',
}

function runs(p: Element): Element[] {
  return [...p.getElementsByTagNameNS(W, 'r')]
}

function textoRun(r: Element): string {
  return [...r.getElementsByTagNameNS(W, 't')].map((t) => t.textContent ?? '').join('')
}

function textoParrafo(p: Element): string {
  return runs(p).map(textoRun).join('')
}

function setTexto(r: Element, texto: string, quitarEstilos = false) {
  const ts = [...r.getElementsByTagNameNS(W, 't')]
  let t = ts[0]
  if (!t) {
    t = r.ownerDocument.createElementNS(W, 'w:t')
    r.appendChild(t)
  }
  for (const otro of ts.slice(1)) otro.remove()
  t.textContent = texto
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  if (quitarEstilos) {
    const rpr = r.getElementsByTagNameNS(W, 'rPr')[0]
    if (rpr) for (const tag of ['i', 'iCs', 'highlight']) for (const el of [...rpr.getElementsByTagNameNS(W, tag)]) el.remove()
  }
}

function agregarLinea(r: Element, texto: string) {
  if (!texto.trim()) return
  const d = r.ownerDocument
  r.appendChild(d.createElementNS(W, 'w:br'))
  const t = d.createElementNS(W, 'w:t')
  t.textContent = texto
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  r.appendChild(t)
}

function buscar(doc: XMLDocument, contiene: string): Element | undefined {
  return [...doc.getElementsByTagNameNS(W, 'p')].find((p) => textoParrafo(p).includes(contiene))
}

function lineasEnParrafos(p: Element, lineas: string[], llenar: (copia: Element, linea: string) => void) {
  const padre = p.parentNode!
  const limpias = lineas.map((l) => l.trim()).filter(Boolean)
  if (!limpias.length) limpias.push('')
  for (const linea of limpias) {
    const copia = p.cloneNode(true) as Element
    llenar(copia, linea)
    padre.insertBefore(copia, p)
  }
  p.remove()
}

function llenarCarta(doc: XMLDocument, c: Record<string, string>) {
  const fecha = buscar(doc, 'Fecha de Implementación')
  if (fecha) {
    const r = runs(fecha)
    if (r[1]) setTexto(r[1], c.fecha ?? '')
    for (const x of r.slice(2)) setTexto(x, '')
  }
  const creado = buscar(doc, 'Creado/modificado por')
  if (creado) runs(creado)[1] && setTexto(runs(creado)[1], c.creadoPor ?? '')
  const asociado = buscar(doc, 'NOMBRE DEL ASOCIADO')
  if (asociado) {
    const r = runs(asociado)
    if (r[1]) setTexto(r[1], ` ${c.asociado ?? ''}`)
  }
  const area = buscar(doc, 'ÁREA:')
  if (area) {
    const r0 = runs(area)[0]
    const nuevo = r0.cloneNode(true) as Element
    setTexto(nuevo, c.area ?? '')
    const rpr = nuevo.getElementsByTagNameNS(W, 'rPr')[0]
    if (rpr && !rpr.getElementsByTagNameNS(W, 'b').length) rpr.insertBefore(doc.createElementNS(W, 'w:b'), rpr.firstChild)
    r0.after(nuevo)
  }
  const cuerpo = buscar(doc, 'Por medio de la presente')
  if (cuerpo) {
    for (const r of runs(cuerpo)) {
      const t = textoRun(r)
      if (t === 'Nombre completo colaborador') setTexto(r, c.asociado ?? '', true)
      if (t === 'XXXXX') setTexto(r, c.motivo ?? '', true)
    }
  }
  const incumpl = buscar(doc, 'Enumerar')
  if (incumpl)
    lineasEnParrafos(incumpl, (c.incumplimientos ?? '').split('\n'), (p, l) => {
      const r = runs(p)
      setTexto(r[0], l, true)
      for (const x of r.slice(1)) setTexto(x, '')
    })
  const compromisos = buscar(doc, 'Describir compromisos')
  if (compromisos)
    lineasEnParrafos(compromisos, (c.compromisos ?? '').split('\n'), (p, l) => {
      const r = runs(p)
      setTexto(r[0], l, true)
      for (const x of r.slice(1)) setTexto(x, '')
    })
  const sup = buscar(doc, 'Firma del Supervisor')
  if (sup) agregarLinea(runs(sup)[0], c.supervisor ?? '')
  const ana = buscar(doc, 'Firma del Analista de Calidad')
  if (ana) agregarLinea(runs(ana)[0], c.analista ?? '')
  const ag = buscar(doc, 'Asociado/Agente')
  if (ag) agregarLinea(runs(ag)[runs(ag).length - 1], c.asociado ?? '')
}

function llenarActa(doc: XMLDocument, c: Record<string, string>, folio: string) {
  const p = buscar(doc, 'El día')
  if (p) {
    let nombres = 0
    const [hh, mm] = (c.hora || '').split(':')
    for (const r of runs(p)) {
      const t = textoRun(r)
      if (t === 'x') setTexto(r, c.dia ?? '', true)
      else if (t === 'xxx') setTexto(r, c.mes ?? '', true)
      else if (t.trim() === '2026') setTexto(r, `${c.anio ?? ''} `)
      else if (t === '18') setTexto(r, hh?.trim() || '__')
      else if (t === ':30') setTexto(r, `:${mm?.trim() || '__'}`)
      else if (t.includes('ciudad de ___')) setTexto(r, t.replace('___', c.ciudad?.trim() || '___'))
      else if (t.includes('folio ____')) setTexto(r, t.replace('____', folio || '____'))
      else if (t.trim() === 'Nombre del agente') {
        nombres++
        setTexto(r, nombres === 1 ? c.agente ?? '' : ` ${c.analista ?? ''} `, true)
      } else if (t === 'Analista de Prevención de Fraudes') setTexto(r, c.puesto ?? t)
      else if (t.includes('Aneth Michelle Manzano')) setTexto(r, t.replace('Aneth Michelle Manzano', c.supervisor || 'Aneth Michelle Manzano'))
    }
  }
  const motivo = buscar(doc, 'Describir el motivo')
  if (motivo)
    lineasEnParrafos(motivo, (c.motivos ?? '').split('\n'), (copia, l) => {
      const r = runs(copia)
      setTexto(r[0], '-')
      if (r[1]) setTexto(r[1], ` ${l.replace(/^-\s*/, '')}`, true)
    })
  const calidad = buscar(doc, 'Área de')
  if (calidad) agregarLinea(runs(calidad)[runs(calidad).length - 1], c.analista ?? '')
  const nombreSup = [...doc.getElementsByTagNameNS(W, 'p')].find((x) => textoParrafo(x).trim() === 'Nombre')
  if (nombreSup) setTexto(runs(nombreSup)[0], c.supervisor ?? '')
  const agente = buscar(doc, 'Agente de Operaciones')
  if (agente) agregarLinea(runs(agente)[0], c.agente ?? '')
  const th = buscar(doc, 'Jocelyn Monserrat Aldaz Villalobos')
  if (th) setTexto(runs(th)[0], c.talentoHumano ?? '')
}

export async function descargarWord(doc: Documento) {
  const ruta = ARCHIVO[doc.tipo]
  if (!ruta) throw new Error('Este documento se descarga como PDF desde “Imprimir / PDF”.')
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
  const resp = await fetch(`${import.meta.env.BASE_URL}${ruta}`)
  if (!resp.ok) throw new Error('No se encontró la plantilla de Word')
  const archivos = unzipSync(new Uint8Array(await resp.arrayBuffer()))
  const xml = new DOMParser().parseFromString(strFromU8(archivos['word/document.xml']), 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('La plantilla de Word no se pudo leer')
  if (doc.tipo === 'carta') llenarCarta(xml, doc.campos)
  else llenarActa(xml, doc.campos, doc.folio)
  archivos['word/document.xml'] = strToU8(new XMLSerializer().serializeToString(xml))
  const salida = zipSync(archivos, { level: 6 })
  const blob = new Blob([salida], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.folio || doc.tipo} - ${doc.agenteNombre}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
