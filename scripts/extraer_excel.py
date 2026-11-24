from __future__ import annotations

import datetime as dt
import difflib
import hashlib
import json
import re
import sys
import unicodedata
import warnings
from pathlib import Path

import openpyxl
from openpyxl.utils import column_index_from_string as ci

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = Path(__file__).resolve().parents[1] / "public" / "seed.json"
F_INBOUND = RAIZ / "CEDULA INBOUND ADRIANA SEP.xlsm"
F_MONITOREO = RAIZ / "Cedula Monitoreo Adriana SEP 1.xlsm"
F_MODELO = RAIZ / "Modelo Reincidencias-Plan de acción.xlsx"
F_RETRO = RAIZ / "PLANTILLAS ACTA - CARTA DE COMPROMISO - RETRO" / "Formato de Retroalimentación Positivo S+.xlsx"


def limpio(v) -> str:
    if v is None:
        return ""
    s = str(v).replace("\xa0", " ").replace("\r", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return s.strip()


def clave(v) -> str:
    s = unicodedata.normalize("NFD", limpio(v).lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", s)


def tema(v) -> str:
    s = unicodedata.normalize("NFD", limpio(v).lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def fecha_iso(v) -> str | None:
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return None


def semana_del_mes(iso: str) -> int:
    d = dt.date.fromisoformat(iso)
    return (d.day + d.replace(day=1).weekday() - 1) // 7 + 1


def duracion_segundos(v) -> tuple[int | None, str | None]:
    if v in (None, 0, "0", ""):
        return None, None
    h = m = s = None
    if isinstance(v, dt.time):
        h, m, s = v.hour, v.minute, v.second
    elif isinstance(v, dt.timedelta):
        tot = int(v.total_seconds())
        h, m, s = tot // 3600, (tot % 3600) // 60, tot % 60
    else:
        partes = [p for p in re.split(r"[:.]", str(v).strip()) if p != ""]
        try:
            nums = [int(float(p)) for p in partes]
        except ValueError:
            return None, f"Duración no reconocida: {v!r}"
        if len(nums) == 3:
            h, m, s = nums
        elif len(nums) == 2:
            h, m, s = 0, nums[0], nums[1]
        else:
            return None, f"Duración no reconocida: {v!r}"
    if h and h >= 1 and s == 0:
        return h * 60 + m, f"Duración capturada como {h:02d}:{m:02d}:00; se interpretó como {h:02d}:{m:02d} (mm:ss)"
    return h * 3600 + m * 60 + s, None


def respuesta(v) -> str | None:
    t = clave(v)
    if t in ("si", "s"):
        return "S"
    if t == "no":
        return "N"
    if t in ("na", "noaplica"):
        return "A"
    return None


def texto_opcional(v) -> str:
    t = limpio(v)
    return "" if t in ("0", "#REF!", "-") else t


def slug(v: str) -> str:
    return tema(v)


print("Leyendo libros…")
wb_in_f = openpyxl.load_workbook(F_INBOUND, data_only=False)
wb_in = openpyxl.load_workbook(F_INBOUND, data_only=True)
wb_mo_f = openpyxl.load_workbook(F_MONITOREO, data_only=False)
wb_mo = openpyxl.load_workbook(F_MONITOREO, data_only=True)
wb_md = openpyxl.load_workbook(F_MODELO, data_only=True)


def inventario(path: Path, wb_f, wb_v):
    hojas = []
    for ws in wb_f.worksheets:
        formulas = valores = 0
        for fila in ws.iter_rows():
            for c in fila:
                if c.value is None:
                    continue
                if isinstance(c.value, str) and c.value.startswith("="):
                    formulas += 1
                else:
                    valores += 1
        errores = 0
        for fila in wb_v[ws.title].iter_rows():
            for c in fila:
                if isinstance(c.value, str) and c.value.startswith("#") and c.value.endswith(("!", "?", "A")):
                    errores += 1
        hojas.append({
            "nombre": ws.title,
            "visible": ws.sheet_state == "visible",
            "rango": ws.dimensions,
            "formulas": formulas,
            "valores": valores,
            "errores": errores,
        })
    return {"archivo": path.name, "bytes": path.stat().st_size, "sha256": sha256(path), "hojas": hojas}


fuentes = [
    inventario(F_INBOUND, wb_in_f, wb_in),
    inventario(F_MONITOREO, wb_mo_f, wb_mo),
    inventario(F_MODELO, openpyxl.load_workbook(F_MODELO, data_only=False), wb_md),
]
if F_RETRO.exists():
    wb_rt_f = openpyxl.load_workbook(F_RETRO, data_only=False)
    fuentes.append(inventario(F_RETRO, wb_rt_f, openpyxl.load_workbook(F_RETRO, data_only=True)))

tl = wb_in["Tipo de llamada"]
ev_in = wb_in_f["Evaluación"]
ced_in = wb_in["Cedulas"]


def vlookup_tl(texto, col_inicial: int, indice: int):
    objetivo = str(texto).upper()
    for r in range(1, tl.max_row + 1):
        v = tl.cell(r, col_inicial).value
        if v is not None and str(v).upper() == objetivo:
            return tl.cell(r, col_inicial + indice - 1).value
    return None


CEDULAS_IN = [
    ("inb-rechazo", "TH Confirma mov. (Rechazo / Originación)", "TH CONFIRMA MOVIMIENTOS (RECHAZO) y/o SEGUIMIENTO A ORIGINACION",
     ["MOVIMIENTOS (RECHAZO) y/o SEGUIMIENTO A ORIGINACION"], 2, "A"),
    ("inb-bloqueos", "TH Confirma mov. (Bloqueos)", "TH CONFIRMA MOVIMIENTOS (Bloqueos: BLKI, BLKT, Bloqueo P, BNFC)", [], 3, "G"),
    ("inb-fraude", "Fraude", "FRAUDE", [], 4, "M"),
    ("inb-roext", "ROEXT (Robo / Extravío)", "ROEXT", [], 5, "S"),
    ("inb-aclaracion", "Aclaración simple", "ACLARACIÓN SIMPLE", [], 6, "Y"),
    ("inb-aviso", "Aviso de viaje", "AVISO DE VIAJE", [], 7, "AE"),
    ("inb-sac", "SAC (Servicio al cliente)", "SAC SERVICIO DE ATENCIÓN AL CLIENTE", [], 8, "AK"),
]

BLOQUE_FORM_IN = {}
for r in range(12, 46):
    if r <= 18:
        BLOQUE_FORM_IN[r] = "Falcon"
    elif r <= 25:
        BLOQUE_FORM_IN[r] = "Front"
    elif r <= 31:
        BLOQUE_FORM_IN[r] = "Vcas"
    elif r <= 36:
        BLOQUE_FORM_IN[r] = "Vision"
    elif r <= 38:
        BLOQUE_FORM_IN[r] = "VRM"
    elif r == 39:
        BLOQUE_FORM_IN[r] = "B.I"
    else:
        BLOQUE_FORM_IN[r] = "Manejo de llamada"
BLOQUE_FORM_IN[31] = "Vision"
BLOQUE_FORM_IN[43] = "Control de llamada"
BLOQUE_FORM_IN[44] = "Control de llamada"

CLAVES_IN = {
    12: "inb.cierre-caso", 13: "inb.creacion-caso", 14: "inb.hotlist-aprobar-rechazar", 15: "inb.hotlist-aprobar",
    16: "inb.hotlist-rechazar", 17: "inb.hotlist-aviso-viaje", 18: "inb.califica-llamada-falcon", 19: "inb.codificacion",
    20: "inb.llenado-front", 21: "inb.llenado-front-afectacion", 22: "inb.sube-capturas", 23: "inb.capturas-completas",
    24: "inb.subir-excel", 25: "inb.califica-llamada-front", 26: "inb.vcas-calificacion", 27: "inb.bypass",
    28: "inb.vcas-bloquea-tarjeta", 29: "inb.vcas-califica-transacciones", 30: "inb.vcas-calificacion-aclaracion",
    31: "inb.valida-compras-facturar", 32: "inb.ofaa-cresp", 33: "inb.comentarios-ashi", 34: "inb.desbloqueo",
    35: "inb.bloqueo-correcto", 36: "inb.artd-arsd", 37: "inb.vrm-calificacion", 38: "inb.vrm-comentario",
    39: "inb.folio-bi", 40: "inb.script-app", 41: "inb.script-proceso", 42: "inb.confirmacion-movimientos",
    43: "inb.educacion", 44: "inb.control-puntualidad", 45: "inb.autentica",
}
COL_IN = {12: "L", 13: "M", 14: "N", 15: "P", 16: "Q", 17: "R", 18: "S", 19: "T", 20: "U", 21: "V", 22: "W", 23: "X",
          24: "Y", 25: "Z", 26: "AA", 27: "AB", 28: "AD", 29: "AE", 30: "AF", 31: "AG", 32: "AH", 33: "AI", 34: "AJ",
          35: "AK", 36: "AL", 37: "AM", 38: "AN", 39: "AP", 40: "AQ", 41: "AR", 42: "AS", 43: "AT", 44: "AU", 45: "AW"}
COL_MOTIVO_IN = {14: "O", 27: "AC", 39: "AO", 45: "AV"}
COL_AREA_IN = {}
_c = ci("AY")
for r in range(12, 46):
    COL_AREA_IN[r] = openpyxl.utils.get_column_letter(_c)
    _c += 1

MOTIVOS_IN = {
    14: [("Lista incorrecta", True), ("Datos incorrectos", False)],
    27: [("No genera Bypass", True), ("Menos a 24 hrs.", False)],
    39: [("Levantamiento incorrecto", True), ("Información incorrecta", False)],
    45: [("Aut Incompleta", True), ("Aut Incorrecta", True), ("Aut CallerID/OTP", False)],
}
TOPICO_DISPLAY_IN = {
    40: "Script de App, Script de Fraudes y Encuesta de satisfacción",
    41: "Script de proceso (SLA de aclaración o bonificación, mantenimientos, costos de reposición, etc.)",
}

items: dict[str, dict] = {}
filas_in: dict[int, dict] = {}
for r in range(12, 46):
    d, e = ev_in.cell(r, 4).value, ev_in.cell(r, 5).value
    h_formula = ev_in.cell(r, 8).value
    usa_e = isinstance(h_formula, str) and f"VLOOKUP(E{r}" in h_formula
    texto_busqueda = e if usa_e else d
    fijo = h_formula if isinstance(h_formula, (int, float)) else None
    topico = TOPICO_DISPLAY_IN.get(r, limpio(texto_busqueda))
    key = CLAVES_IN[r]
    item = {
        "key": key,
        "canal": "Inbound",
        "bloque": BLOQUE_FORM_IN[r],
        "topico": topico,
        "tema": "inb:" + tema(topico),
        "fila": r,
    }
    if r in MOTIVOS_IN:
        item["motivos"] = [{"label": m, "critico": c} for m, c in MOTIVOS_IN[r]]
    items[key] = item
    filas_in[r] = {"texto": texto_busqueda, "fijo": fijo, "motivo": r in MOTIVOS_IN}

merged_ced = list(ced_in.merged_cells.ranges)


def valor_merge(ws, merged, fila, col):
    for rg in merged:
        if rg.min_row <= fila <= rg.max_row and rg.min_col <= col <= rg.max_col:
            return ws.cell(rg.min_row, rg.min_col).value
    return ws.cell(fila, col).value


def criterios_bloque(col_letra: str):
    c0 = ci(col_letra)
    filas = []
    sistema = ""
    for r in range(5, 26):
        continuacion = any(rg.min_row < r <= rg.max_row and rg.min_col <= c0 + 1 <= rg.max_col for rg in merged_ced)
        if continuacion:
            continue
        sis = valor_merge(ced_in, merged_ced, r, c0)
        top = valor_merge(ced_in, merged_ced, r, c0 + 1)
        if top is None:
            continue
        if sis and limpio(sis) != limpio(top):
            sistema = limpio(sis)
        filas.append({
            "sistema": sistema,
            "topico": limpio(top),
            "peso": ced_in.cell(r, c0 + 2).value,
            "si": limpio(valor_merge(ced_in, merged_ced, r, c0 + 3)),
            "no": limpio(valor_merge(ced_in, merged_ced, r, c0 + 4)),
        })
    return filas


ALIAS_CRITERIO = {
    40: ["cumple con el script"], 41: ["cumple con el script"], 42: ["cumple con el script"],
    18: ["califica correctamente la llamada@falcon"], 25: ["califica correctamente la llamada@front"],
}

_cat_flags = {}
_cat_ws0 = wb_md["CATÁLOGO CÉDULA"]
for _r in range(5, _cat_ws0.max_row + 1):
    _ced, _top, _crit = _cat_ws0.cell(_r, 3).value, _cat_ws0.cell(_r, 5).value, _cat_ws0.cell(_r, 8).value
    if _ced and _top:
        _cat_flags[(clave(_ced), clave(_top))] = _crit
NOMBRE_CATALOGO_IN = {
    "inb-rechazo": "TH Confirma mov. (Rechazo / Originación)", "inb-bloqueos": "TH Confirma mov. (Bloqueos)", "inb-fraude": "Fraude",
    "inb-roext": "ROEXT", "inb-aclaracion": "Aclaración simple", "inb-aviso": "Aviso de viaje", "inb-sac": "SAC",
}
TOPICO_CATALOGO_MOTIVO = {14: "Ingresa a HOTLIST_APROBAR / Ingresa a HOTLIST_Rechazar", 27: "Aplica Bypass", 39: "Crea el Folio Correctamente", 45: "Autentica correctamente"}
ajustes_criticos = []

CRITERIOS_POR_CEDULA = {cid: criterios_bloque(col) for cid, _, _, _, _, col in CEDULAS_IN}


def buscar_criterio(filas, r):
    objetivo = clave(filas_in[r]["texto"])
    candidatos = ALIAS_CRITERIO.get(r)
    for fila in filas:
        if not (fila["si"] or fila["no"]):
            continue
        k = clave(fila["topico"])
        if candidatos:
            for cand in candidatos:
                texto, _, sis = cand.partition("@")
                if k == clave(texto) and (not sis or clave(fila["sistema"]) == clave(sis)):
                    return fila
        elif k == objetivo:
            return fila
    return None


_desc_in = {clave(limpio(desc_in_ws_cell.value)): r for r, desc_in_ws_cell in
            ((r, wb_in["Descriptor"].cell(r, 2)) for r in range(3, 19))}


def descriptor_in_texto(*temas):
    partes = []
    ws = wb_in["Descriptor"]
    for t in temas:
        r = _desc_in.get(clave(t))
        if r:
            partes.append(f"{limpio(ws.cell(r, 2).value)}: {limpio(ws.cell(r, 3).value)}")
    return "\n\n".join(partes)


CRITERIO_DESCRIPTOR_IN = {
    43: descriptor_in_texto("Educación", "Frases de conexión ", "Comunicación efectiva y escucha activa"),
    44: descriptor_in_texto("Control de llamada, empatía", "Puntualidad"),
}

cedulas = []
for cid, nombre, nombre_excel, alias, idx, col_bloque in CEDULAS_IN:
    lista = []
    for r in range(12, 46):
        info = filas_in[r]
        peso = info["fijo"] if info["fijo"] is not None else vlookup_tl(info["texto"], ci("N"), idx)
        if not isinstance(peso, (int, float)):
            continue
        if info["motivo"]:
            flag = _cat_flags.get((clave(NOMBRE_CATALOGO_IN[cid]), clave(TOPICO_CATALOGO_MOTIVO[r])))
            critico = "motivo" if flag != "No" else "no"
            if critico == "no":
                ajustes_criticos.append(f"{nombre}: {TOPICO_CATALOGO_MOTIVO[r]}")
        else:
            g = vlookup_tl(info["texto"], ci("W"), idx)
            critico = "siempre" if g == "Crítico" else "no"
        encontrado = buscar_criterio(CRITERIOS_POR_CEDULA[cid], r)
        if not encontrado:
            for otra in CRITERIOS_POR_CEDULA.values():
                encontrado = buscar_criterio(otra, r)
                if encontrado:
                    break
        entrada = {"key": CLAVES_IN[r], "peso": peso, "critico": critico}
        if encontrado:
            if encontrado["si"]:
                entrada["cuandoSi"] = encontrado["si"]
            if encontrado["no"]:
                entrada["cuandoNo"] = encontrado["no"]
        elif CRITERIO_DESCRIPTOR_IN.get(r):
            entrada["cuandoSi"] = CRITERIO_DESCRIPTOR_IN[r]
        lista.append(entrada)
    cedulas.append({
        "id": cid,
        "canal": "Inbound",
        "nombre": nombre,
        "nombreExcel": nombre_excel,
        "alias": alias,
        "items": lista,
        "total": sum(i["peso"] for i in lista),
    })

tlm = wb_mo["Tipo de llamada"]
ev_mo = wb_mo_f["Evaluación"]

CLAVES_MO = {
    12: "mon.califica-falcon", 13: "mon.cierre-caso", 14: "mon.casillas-comentario", 15: "mon.hotlist-aprobar",
    16: "mon.vrm-mantenimiento", 17: "mon.vrm-califica", 18: "mon.vrm-comentario", 19: "mon.front-calificacion",
    20: "mon.front-datos", 21: "mon.front-capturas", 22: "mon.front-comentario", 23: "mon.subir-excel",
    24: "mon.vcas-califica", 25: "mon.bypass", 26: "mon.vcas-bloqueo", 27: "mon.comentario-ashi",
    28: "mon.desbloqueo", 29: "mon.bloqueo-tarjeta", 30: "mon.bi-ticket", 31: "mon.script-entrada-salida",
    32: "mon.script-app-fraudes", 33: "mon.script-proceso", 34: "mon.confirmacion-movimientos",
    35: "mon.control-empatia", 36: "mon.cordialidad", 37: "mon.escucha-activa", 38: "mon.solucion-contacto",
}
BLOQUE_MO = {}
for r in range(12, 39):
    BLOQUE_MO[r] = ("Falcon" if r <= 15 else "VRM" if r <= 18 else "Front" if r <= 23 else "Vcas" if r <= 26
                    else "Vision+" if r <= 29 else "BI" if r == 30 else "Manejo de llamada")
COL_MO = {r: openpyxl.utils.get_column_letter(ci("L") + (r - 12)) for r in range(12, 39)}
COL_AREA_MO = {r: openpyxl.utils.get_column_letter(ci("AN") + (r - 12)) for r in range(12, 39)}

DESC_MO = {
    15: "Ver terminación de la tarjeta, día de la llamada a 30 días y agregar la opción TH Confirma movimiento.",
    25: "Se valida Visa: si no hay movimiento no se debe mandar Bypass. Solo aplica si hay contacto con el cliente y para movimientos rechazados que el cliente sí reconoce.",
    28: "Quitar los bloqueos en Vision (ARQE: BLKI - BLKT \"N\"). Si tienen Y se califica como no cumple.",
}
desc_mo_ws = wb_mo["Descriptor"]
desc_bloque_mo = {
    "Falcon": limpio(desc_mo_ws["C2"].value), "VRM": limpio(desc_mo_ws["C3"].value),
    "Front": limpio(desc_mo_ws["C4"].value), "Vcas": limpio(desc_mo_ws["C5"].value),
    "Vision+": limpio(desc_mo_ws["C6"].value), "BI": limpio(desc_mo_ws["C8"].value),
}
desc_manejo_mo = {
    31: limpio(desc_mo_ws["G2"].value), 32: limpio(desc_mo_ws["G2"].value), 33: limpio(desc_mo_ws["G2"].value),
    34: limpio(desc_mo_ws["G2"].value), 35: limpio(desc_mo_ws["G3"].value), 36: limpio(desc_mo_ws["G4"].value),
    37: limpio(desc_mo_ws["G5"].value), 38: limpio(desc_mo_ws["G6"].value),
}

cat_ws = wb_md["CATÁLOGO CÉDULA"]
criterio_critico = {}
for r in range(5, cat_ws.max_row + 1):
    ced = limpio(cat_ws.cell(r, 3).value)
    top = limpio(cat_ws.cell(r, 5).value)
    if ced and top and cat_ws.cell(r, 8).value == "Sí":
        criterio_critico[(clave(ced), clave(top))] = limpio(cat_ws.cell(r, 9).value)

for r in range(12, 39):
    d = ev_mo.cell(r, 4).value
    key = CLAVES_MO[r]
    topico = limpio(d)
    items[key] = {
        "key": key,
        "canal": "Monitoreo",
        "bloque": BLOQUE_MO[r],
        "topico": topico,
        "tema": "mon:" + tema(topico),
        "fila": r,
    }


def peso_mo(texto, col):
    for rr in range(3, 31):
        v = tlm.cell(rr, 3).value
        if v is not None and clave(v) == clave(texto):
            return tlm.cell(rr, col).value
    return None


def separar_temas(items: dict) -> None:
    grupos: dict[tuple, list] = {}
    for it in sorted(items.values(), key=lambda x: x["fila"]):
        grupos.setdefault((it["canal"], it["tema"]), []).append(it)
    for lista in grupos.values():
        for it in lista[1:]:
            if it["bloque"] != lista[0]["bloque"]:
                it["tema"] = f'{it["tema"]}:{tema(it["bloque"])}'


separar_temas(items)

CRITICOS_MO = set()
for r in range(12, 39):
    f = ev_mo.cell(r, 6).value
    if isinstance(f, str) and '="No","Crítico"' in f:
        CRITICOS_MO.add(r)

for cid, nombre, tipos, col, ced_cat in [
    ("mon-nofraude", "Monitoreo · No fraude", ["NO FRAUDE"], 4, "Monitoreo - No fraude"),
    ("mon-fraude", "Monitoreo · Fraude", ["FRAUDE/Con Afectación", "FRAUDE/Sin Afectación"], 5, "Monitoreo - Fraude"),
]:
    lista = []
    for r in range(12, 39):
        texto = ev_mo.cell(r, 4).value
        peso = peso_mo(texto, col)
        if not isinstance(peso, (int, float)):
            continue
        entrada = {"key": CLAVES_MO[r], "peso": peso, "critico": "siempre" if r in CRITICOS_MO else "no"}
        crit_txt = criterio_critico.get((clave(ced_cat), clave(texto)))
        if crit_txt:
            entrada["cuandoNo"] = crit_txt
        desc = DESC_MO.get(r) or desc_manejo_mo.get(r) or desc_bloque_mo.get(BLOQUE_MO[r])
        if desc:
            entrada["cuandoSi"] = desc
        lista.append(entrada)
    cedulas.append({
        "id": cid,
        "canal": "Monitoreo",
        "nombre": nombre,
        "nombreExcel": tipos[0],
        "alias": tipos[1:],
        "tiposLlamada": tipos,
        "items": lista,
        "total": sum(i["peso"] for i in lista),
    })

desc_in_ws = wb_in["Descriptor"]
descriptor_in = []
bloque_actual = ""
for r in range(3, 19):
    b = desc_in_ws.cell(r, 1).value
    if b:
        bloque_actual = limpio(b).replace("\n", " ")
    descriptor_in.append({
        "grupo": bloque_actual,
        "tema": limpio(desc_in_ws.cell(r, 2).value),
        "descripcion": limpio(desc_in_ws.cell(r, 3).value),
        "porQue": limpio(valor_merge(desc_in_ws, list(desc_in_ws.merged_cells.ranges), r, 4)),
    })
descriptor_mo = []
for b, celda in [("Falcon", "C2"), ("VRM", "C3"), ("Front", "C4"), ("Vcas", "C5"), ("Vision+", "C6"), ("BI", "C8")]:
    descriptor_mo.append({"grupo": "¿Qué evaluamos en cada aplicativo?", "tema": b, "descripcion": limpio(desc_mo_ws[celda].value), "porQue": ""})
for f_, g_ in [("F2", "G2"), ("F3", "G3"), ("F4", "G4"), ("F5", "G5"), ("F6", "G6")]:
    descriptor_mo.append({"grupo": "Manejo de llamada", "tema": limpio(desc_mo_ws[f_].value), "descripcion": limpio(desc_mo_ws[g_].value), "porQue": ""})
for b_, c_ in [("B9", "C9"), ("B10", "C10"), ("B11", "C11")]:
    descriptor_mo.append({"grupo": "Políticas y procesos", "tema": limpio(desc_mo_ws[b_].value), "descripcion": limpio(desc_mo_ws[c_].value), "porQue": ""})
for b_, c_ in [("B12", "C12"), ("B13", "C13"), ("B14", "C14")]:
    descriptor_mo.append({"grupo": "Casos críticos", "tema": limpio(desc_mo_ws[b_].value), "descripcion": limpio(desc_mo_ws[c_].value), "porQue": ""})
nota_mo = limpio(desc_mo_ws["A3"].value)

agentes: list[dict] = []


def buscar_agente(nombre: str, canal: str | None = None, umbral: float = 0.86):
    k = clave(nombre)
    if not k:
        return None
    for a in agentes:
        if canal and a["canal"] != canal:
            continue
        if clave(a["nombre"]) == k or k in [clave(x) for x in a.get("alias", [])]:
            return a
    mejor, puntaje = None, 0.0
    for a in agentes:
        if canal and a["canal"] != canal:
            continue
        for n in [a["nombre"], *a.get("alias", [])]:
            p = difflib.SequenceMatcher(None, clave(n), k).ratio()
            if p > puntaje:
                mejor, puntaje = a, p
    return mejor if puntaje >= umbral else None


def agregar_alias(a: dict, nombre: str):
    nombre = limpio(nombre)
    if nombre and clave(nombre) != clave(a["nombre"]) and clave(nombre) not in [clave(x) for x in a["alias"]]:
        a["alias"].append(nombre)


ej_in = wb_in["Ejecutivos"]
for r in range(3, 30):
    i, n = ej_in.cell(r, 1).value, ej_in.cell(r, 2).value
    if i and n:
        agentes.append({"id": limpio(i), "nombre": limpio(n), "canal": "Inbound", "proceso": "Inbound", "activo": True, "alias": []})
ej_mo = wb_mo["Ejecutivos"]
for r in range(3, 40):
    i, n = ej_mo.cell(r, 1).value, ej_mo.cell(r, 2).value
    if i and n:
        agentes.append({"id": limpio(i), "nombre": limpio(n), "canal": "Monitoreo", "proceso": "Monitoreo", "activo": True, "alias": []})

ag_ws = wb_md["AGENTES"]
PROCESO_MAP = {"inbound": "Inbound", "monitoreo": "Monitoreo", "vcas": "VCAS", "back up": "Back Up",
               "autorizaciones": "Autorizaciones", "supervision": "Supervisión", "supervisión": "Supervisión", "atm": "ATM", "vrm": "VRM"}


def iniciales(nombre: str) -> str:
    partes = [p for p in re.split(r"\s+", limpio(nombre)) if p and p.lower() not in ("de", "del", "la", "las", "los")]
    s = "".join(unicodedata.normalize("NFD", p)[0] for p in partes).upper()
    return re.sub(r"[^A-Z]", "", s) or "AG"


for r in range(2, ag_ws.max_row + 1):
    n, p = ag_ws.cell(r, 1).value, ag_ws.cell(r, 2).value
    if not n:
        continue
    proceso = PROCESO_MAP.get(limpio(p).lower(), limpio(p) or "Monitoreo")
    canal = "Inbound" if proceso == "Inbound" else "Monitoreo"
    a = buscar_agente(n, canal)
    if a:
        mismo_texto = clave(a["nombre"]) == clave(n)
        espaciado_distinto = len(limpio(a["nombre"]).split()) != len(limpio(n).split())
        if not mismo_texto or espaciado_distinto:
            if not mismo_texto:
                agregar_alias(a, a["nombre"])
            a["nombre"] = limpio(n)
        a["proceso"] = proceso
    else:
        base_id = iniciales(n)
        nuevo = base_id
        k = 2
        while any(x["id"] == nuevo for x in agentes):
            nuevo = f"{base_id}{k}"
            k += 1
        agentes.append({"id": nuevo, "nombre": limpio(n), "canal": canal, "proceso": proceso, "activo": True,
                        "alias": [], "idProvisional": True})

ANALISTAS = [
    {"id": "adriana-nery", "nombre": "Adriana Nery", "corto": "Adriana Nery", "activo": True, "alias": ["Adriana"]},
    {"id": "norma-ruiz", "nombre": "Norma Yaneth Ruiz Campos", "corto": "Norma Ruiz", "activo": True, "alias": ["Norma Ruiz", "NORMA RUIZ"]},
    {"id": "victor-estrella", "nombre": "Victor Joel Estrella Cortes", "corto": "Victor Estrella", "activo": True,
     "alias": ["Victor Joel Estrella", "Victor Estrella", "VICTOR JOEL ESTRELLA CORTES"]},
    {"id": "hector-brambila", "nombre": "Hector Brambila", "corto": "Hector Brambila", "activo": False, "alias": []},
    {"id": "santiago-moreno", "nombre": "Santiago Moreno", "corto": "Santiago Moreno", "activo": False, "alias": []},
    {"id": "jair-garcia", "nombre": "Jair García", "corto": "Jair García", "activo": False, "alias": []},
    {"id": "fredy-bedoya", "nombre": "Fredy Bedolla Zapata", "corto": "Fredy Bedolla", "activo": False, "alias": ["Fredy Bedoya", "FREDY BEDOLLA ZAPATA"]},
    {"id": "karen-rosas", "nombre": "Karen Vanessa Rosas Vazquez", "corto": "Karen Rosas", "activo": False, "alias": ["KAREN ROSAS"]},
    {"id": "daniela-hernandez", "nombre": "Daniela Guadalupe Hernandez Gonzalez", "corto": "Daniela Hernández", "activo": False, "alias": ["DANIELA HERNANDEZ"]},
]


def buscar_analista(nombre) -> dict | None:
    k = clave(nombre)
    for a in ANALISTAS:
        if k in [clave(a["nombre"]), clave(a["corto"]), *[clave(x) for x in a["alias"]]]:
            return a
    mejor, puntaje = None, 0.0
    for a in ANALISTAS:
        p = difflib.SequenceMatcher(None, clave(a["nombre"]), k).ratio()
        if p > puntaje:
            mejor, puntaje = a, p
    return mejor if puntaje > 0.8 else None


CED_BY_ID = {c["id"]: c for c in cedulas}


def calcular(cedula: dict, resp: dict, motivos: dict):
    si = no = 0.0
    critico = False
    criticos = []
    for it in cedula["items"]:
        a = resp.get(it["key"])
        if a == "S":
            si += it["peso"]
        elif a == "N":
            no += it["peso"]
            es_crit = it["critico"] == "siempre"
            if it["critico"] == "motivo":
                m = motivos.get(it["key"])
                es_crit = any(x["label"] == m and x["critico"] for x in items[it["key"]].get("motivos", []))
            if es_crit:
                critico = True
                criticos.append(it["key"])
    if critico:
        return 0.0, True, criticos
    return (si / (si + no) if si + no else None), False, criticos


def cedula_inbound(texto):
    k = clave(texto)
    for c in cedulas:
        if c["canal"] == "Inbound" and k in [clave(c["nombreExcel"]), *[clave(a) for a in c["alias"]]]:
            return c
    return None


def cedula_monitoreo(tipo):
    k = clave(tipo)
    for c in cedulas:
        if c["canal"] == "Monitoreo" and k in [clave(t) for t in c["tiposLlamada"]]:
            return c
    return None


evaluaciones = []
problemas = []


def migrar(canal: str, wb, archivo: Path):
    ws = wb["Acumulado"]
    filas = [r for r in range(5, ws.max_row + 1) if ws.cell(r, 2).value not in (None, "")]
    for r in filas:
        g = lambda col: ws.cell(r, ci(col)).value
        notas = []
        if canal == "Inbound":
            cedula = cedula_inbound(g("H"))
            tipo_llamada = cedula["nombreExcel"] if cedula else limpio(g("H"))
            proceso = "Inbound"
            analista_txt = g("D")
            f_llamada = fecha_iso(g("E"))
            f_eval = fecha_iso(g("F"))
            dur = g("G")
            resp_cols = {CLAVES_IN[k]: v for k, v in COL_IN.items()}
            area_cols = {CLAVES_IN[k]: v for k, v in COL_AREA_IN.items()}
            motivo_cols = {CLAVES_IN[k]: v for k, v in COL_MOTIVO_IN.items()}
            obs = texto_opcional(g("AX"))
        else:
            cedula = cedula_monitoreo(g("H"))
            tipo_llamada = limpio(g("H"))
            proceso = limpio(g("D")) or "Monitoreo"
            analista_txt = g("E")
            f_llamada = None
            f_eval = fecha_iso(g("F"))
            dur = g("G")
            resp_cols = {CLAVES_MO[k]: v for k, v in COL_MO.items()}
            area_cols = {CLAVES_MO[k]: v for k, v in COL_AREA_MO.items()}
            motivo_cols = {}
            obs = texto_opcional(g("AM"))
        if not cedula:
            problemas.append(f"{archivo.name} fila {r}: cédula no reconocida {g('H')!r}")
            continue
        aplicables = {i["key"] for i in cedula["items"]}
        resp, motivos, areas = {}, {}, {}
        for key, col in resp_cols.items():
            a = respuesta(g(col))
            if a and key in aplicables:
                resp[key] = a
        for key, col in motivo_cols.items():
            m = texto_opcional(g(col))
            if m and key in aplicables:
                motivos[key] = m
        for key, col in area_cols.items():
            t = texto_opcional(g(col))
            if t and key in aplicables:
                areas[key] = t
        sin_respuesta = [k for k in aplicables if k not in resp]
        if sin_respuesta:
            notas.append(f"{len(sin_respuesta)} rubro(s) sin respuesta en Excel (no cuentan en la calificación)")
        con_motivo = [k for k in aplicables if items[k].get("motivos") and resp.get(k) == "N" and k not in motivos]
        if con_motivo:
            notas.append("Motivo no registrado en Excel para: " + ", ".join(items[k]["topico"] for k in con_motivo)
                         + " (Excel no lo consideró crítico)")
        id_txt = limpio(g("C"))
        nombre_txt = limpio(g("B"))
        agente = next((a for a in agentes if a["id"] == id_txt), None) if id_txt and id_txt != "0" else None
        if agente is None:
            agente = buscar_agente(nombre_txt, canal)
            if agente:
                notas.append(f"ID de ejecutivo recuperado por nombre ({agente['id']})")
            else:
                problemas.append(f"{archivo.name} fila {r}: agente no encontrado {nombre_txt!r}")
                continue
        elif clave(agente["nombre"]) != clave(nombre_txt):
            agregar_alias(agente, nombre_txt)
        analista = buscar_analista(analista_txt)
        if not analista:
            problemas.append(f"{archivo.name} fila {r}: analista no encontrado {analista_txt!r}")
            continue
        seg, nota_dur = duracion_segundos(dur)
        if nota_dur:
            notas.append(nota_dur)
        semana = g("I")
        semana = int(semana) if isinstance(semana, (int, float)) else semana_del_mes(f_eval)
        if semana != semana_del_mes(f_eval):
            notas.append(f"Semana capturada {semana}; por fecha correspondería la semana {semana_del_mes(f_eval)}")
        promedio = g("K")
        puntaje, critico, criticos = calcular(cedula, resp, motivos)
        if not isinstance(promedio, (int, float)) or puntaje is None or abs(puntaje - promedio) > 1e-9:
            problemas.append(f"{archivo.name} fila {r}: calificación Excel {promedio} ≠ calculada {puntaje}")
        id_caso = g("J")
        id_caso = limpio(int(id_caso) if isinstance(id_caso, float) and id_caso.is_integer() else id_caso)
        evaluaciones.append({
            "_orden": (f_eval, -r),
            "canal": canal,
            "cedulaId": cedula["id"],
            "tipoLlamada": tipo_llamada,
            "proceso": proceso,
            "agenteId": agente["id"],
            "agenteNombre": agente["nombre"],
            "analistaId": analista["id"],
            "analista": analista["nombre"],
            "fechaLlamada": f_llamada,
            "fechaEvaluacion": f_eval,
            "semana": semana,
            "duracionSeg": seg,
            "idCaso": id_caso,
            "respuestas": resp,
            "motivos": motivos,
            "areas": areas,
            "observaciones": obs,
            "pesos": {i["key"]: i["peso"] for i in cedula["items"]},
            "criticos": {i["key"]: i["critico"] for i in cedula["items"] if i["critico"] != "no"},
            "puntaje": puntaje,
            "critico": critico,
            "origen": {
                "tipo": "excel",
                "archivo": archivo.name,
                "fila": r,
                "folioExcel": g("A"),
                "promedioExcel": promedio,
                "agenteOriginal": nombre_txt,
                "idOriginal": id_txt if id_txt and id_txt != "0" else None,
            },
            "notasMigracion": notas,
        })


migrar("Inbound", wb_in, F_INBOUND)
migrar("Monitoreo", wb_mo, F_MONITOREO)

for canal, pref in (("Inbound", "INB"), ("Monitoreo", "MON")):
    lista = sorted([e for e in evaluaciones if e["canal"] == canal], key=lambda e: e["_orden"])
    for n, e in enumerate(lista, start=1):
        e["folio"] = f"{pref}-{n:05d}"
        e["id"] = f"{pref.lower()}-{e['fechaEvaluacion'].replace('-', '')}-{n:04d}"
        creado = dt.datetime.fromisoformat(e["fechaEvaluacion"] + "T18:00:00") + dt.timedelta(seconds=n)
        e["creadoEn"] = creado.isoformat()
        e["actualizadoEn"] = e["creadoEn"]
        e["creadoPor"] = e["analista"]
evaluaciones.sort(key=lambda e: (e["fechaEvaluacion"], e["creadoEn"]))
for e in evaluaciones:
    e.pop("_orden", None)

pm = wb_md["PARAMETROS"]
PARAM_CELDAS = [
    ("nAnalistas", "C7", "Equipo de calidad"), ("horasJornada", "C8", "Equipo de calidad"), ("pctEfectiva", "C9", "Equipo de calidad"),
    ("diasMes", "C10", "Equipo de calidad"), ("semanasMes", "C11", "Equipo de calidad"), ("ocupObj", "C12", "Equipo de calidad"),
    ("agMonitoreo", "C15", "Plantilla de la operación"), ("agInbound", "C16", "Plantilla de la operación"),
    ("vacantes", "C17", "Plantilla de la operación"), ("ingresosMes", "C18", "Plantilla de la operación"),
    ("pctRojo", "C19", "Plantilla de la operación"), ("pctAmarillo", "C20", "Plantilla de la operación"),
    ("metaCalidad", "C21", "Plantilla de la operación"), ("umbralRojo", "C22", "Plantilla de la operación"),
    ("metaAudDia", "C25", "Volumen de trabajo"), ("basesSemana", "C26", "Volumen de trabajo"),
    ("casosBaseProm", "C27", "Volumen de trabajo"), ("casosBasePico", "C28", "Volumen de trabajo"),
    ("correosDia", "C29", "Volumen de trabajo"), ("casosCorreoProm", "C30", "Volumen de trabajo"),
    ("casosCorreoPico", "C31", "Volumen de trabajo"), ("circularesMes", "C32", "Volumen de trabajo"),
    ("feedbackAgMes", "C35", "Política de gestión"), ("refuerzoIndMes", "C36", "Política de gestión"),
    ("refuerzoGrupalSem", "C37", "Política de gestión"), ("audVerifMes", "C38", "Política de gestión"),
    ("calibracionesSem", "C39", "Política de gestión"), ("asistCalibracion", "C40", "Política de gestión"),
    ("audNesting", "C41", "Política de gestión"), ("fbNesting", "C42", "Política de gestión"),
    ("minMediciones", "C43", "Política de gestión"), ("cohortesMes", "C44", "Política de gestión"),
]
parametros = []
for key, celda, grupo in PARAM_CELDAS:
    fila = pm[celda].row
    unidad = limpio(pm.cell(fila, 4).value)
    parametros.append({
        "key": key,
        "grupo": grupo,
        "nombre": limpio(pm.cell(fila, 2).value),
        "valor": pm[celda].value,
        "unidad": unidad,
        "fuente": limpio(pm.cell(fila, 5).value),
        "tipo": "pct" if unidad == "%" else "num",
    })
mr = wb_md["MUESTREO RIESGO"]
parametros += [
    {"key": "freqVerde", "grupo": "Muestreo por riesgo", "nombre": "Auditorías por agente a la semana — Verde", "valor": mr["F7"].value, "unidad": "aud/sem", "fuente": "MUESTREO RIESGO", "tipo": "num"},
    {"key": "freqAmarillo", "grupo": "Muestreo por riesgo", "nombre": "Auditorías por agente a la semana — Amarillo", "valor": mr["F8"].value, "unidad": "aud/sem", "fuente": "MUESTREO RIESGO", "tipo": "num"},
    {"key": "freqRojo", "grupo": "Muestreo por riesgo", "nombre": "Auditorías por agente a la semana — Rojo", "valor": mr["F9"].value, "unidad": "aud/sem", "fuente": "MUESTREO RIESGO", "tipo": "num"},
    {"key": "freqNuevo", "grupo": "Muestreo por riesgo", "nombre": "Auditorías por agente a la semana — Nuevo ingreso", "valor": mr["F10"].value, "unidad": "aud/sem", "fuente": "MUESTREO RIESGO", "tipo": "num"},
]
equipo = [limpio(pm[c].value) for c in ("C46", "C47", "C48")]

tt = wb_md["TIEMPOS TAREA"]
tareas = []
for r in range(6, 32):
    tareas.append({
        "id": limpio(tt.cell(r, 1).value),
        "categoria": limpio(tt.cell(r, 2).value),
        "tarea": limpio(tt.cell(r, 3).value),
        "incluye": limpio(tt.cell(r, 4).value),
        "unidad": limpio(tt.cell(r, 5).value),
        "volumenTexto": limpio(tt.cell(r, 6).value),
        "minEstandar": tt.cell(r, 7).value,
        "excelHoras": tt.cell(r, 12).value,
    })

kp = wb_md["KPIS CALIDAD"]
KPI_AUTO = {6: "metaAuditorias", 7: "slaBases", 8: "slaCorreos", 9: "cobertura", 10: "feedbackOportuno", 11: "reincidencia",
            12: "planesATiempo", 13: "calibracion", 14: "acreditan", 15: "calidadPromedio", 16: "erroresCriticos", 17: "ocupacion"}
kpis = []
for r in range(6, 18):
    kpis.append({
        "id": KPI_AUTO[r],
        "nombre": limpio(kp.cell(r, 2).value),
        "formula": limpio(kp.cell(r, 3).value),
        "meta": kp.cell(r, 4).value,
        "sentido": "mayor" if limpio(kp.cell(r, 5).value).lower() == "mayor" else "menor",
        "frecuencia": limpio(kp.cell(r, 6).value),
        "responsable": limpio(kp.cell(r, 7).value),
        "unidad": "pts" if r == 13 else ("n" if r == 16 else "pct"),
        "excelReal": kp.cell(r, 8).value,
    })

mrm = wb_md["MODELO REINCIDENCIA"]
causas = [{"id": limpio(mrm.cell(r, 3).value), "pregunta": limpio(mrm.cell(r, 4).value),
           "senales": limpio(mrm.cell(r, 5).value), "intervencion": limpio(mrm.cell(r, 7).value)} for r in (7, 8, 9)]
ruta = []
for r in range(13, 18):
    nivel = mrm.cell(r, 2).value
    plazo = mrm.cell(r, 6).value
    accion = limpio(mrm.cell(r, 5).value)
    ruta.append({
        "nivel": nivel, "nombre": limpio(mrm.cell(r, 3).value), "disparador": limpio(mrm.cell(r, 4).value),
        "accion": accion, "plazo": plazo, "responsable": limpio(mrm.cell(r, 7).value),
        "evidencia": limpio(mrm.cell(r, 8).value), "salida": limpio(mrm.cell(r, 9).value),
    })
reglas = [{"titulo": limpio(mrm.cell(r, 2).value), "texto": limpio(mrm.cell(r, 4).value)} for r in range(20, 27)]
phva = [{"dia": limpio(mrm.cell(r, 3).value), "fase": limpio(mrm.cell(r, 4).value), "que": limpio(mrm.cell(r, 5).value)} for r in range(30, 34)]

eq = wb_md["EQUIPO Y CAPACITACIÓN"]
roles = []
for c in (3, 4, 5):
    roles.append({
        "analista": limpio(eq.cell(6, c).value) if not str(eq.cell(6, c).value).startswith("=") else "",
        "rol": limpio(eq.cell(7, c).value),
        "responsabilidades": limpio(eq.cell(10, c).value),
        "respaldo": limpio(eq.cell(11, c).value),
    })
fases = []
for r in range(20, 30):
    fases.append({
        "fase": limpio(eq.cell(r, 2).value), "dias": limpio(eq.cell(r, 3).value), "actividad": limpio(eq.cell(r, 4).value),
        "como": limpio(eq.cell(r, 5).value), "responsable": limpio(eq.cell(r, 6).value), "evidencia": limpio(eq.cell(r, 7).value),
        "criterio": limpio(eq.cell(r, 8).value),
    })
bases_catalogo = []
for r in range(70, 73):
    bases_catalogo.append({
        "nombre": limpio(pm.cell(r, 2).value), "enviadaPor": limpio(pm.cell(r, 3).value),
        "frecuencia": limpio(pm.cell(r, 4).value), "sla": limpio(pm.cell(r, 5).value), "casos": limpio(pm.cell(r, 6).value),
    })

for a in agentes:
    a["alias"] = sorted(set(a["alias"]))
    if not a["alias"]:
        a.pop("alias")

hallazgos = [
    "Las 114 calificaciones históricas se recalcularon con el motor del portal y coinciden al 100% con la columna Promedio del Excel.",
    "En el Excel, un \"No\" en Hotlist, Bypass, Folio BI o Autenticación solo es crítico si se elige el motivo crítico; el histórico no tiene motivos registrados, por eso esos \"No\" no se trataron como críticos (igual que Excel).",
    "La hoja 'Resultados por tipo de cédula' y la fila de Rechazo de 'Resultados Generales' de Inbound no contaban 24 evaluaciones porque el nombre de la cédula no coincidía ('MOVIMIENTOS…' vs 'TH CONFIRMA MOVIMIENTOS…'). El portal usa identificadores estables y las incluye.",
    "19 evaluaciones de Monitoreo no tenían ID de ejecutivo; se recuperó por nombre. En Excel no contaban en las hojas por ejecutivo.",
    "Duraciones de Monitoreo capturadas como hh:mm (por ejemplo 02:53:00) se interpretaron como minutos:segundos.",
    "En Monitoreo, el rubro 'Califica transacciones VRM/Mantenimiento' revisaba la respuesta de otra fila (G17) para marcar crítico. El portal aplica la regla de la cédula; no cambia ninguna calificación histórica.",
    "En Monitoreo, el 'Promedio Fraude' de Excel era el promedio simple de dos promedios (con y sin afectación); el portal calcula el promedio real de todas las evaluaciones de fraude.",
    "Hojas con referencias rotas (#REF!) en Excel: 'Ejecutivos por tipo de cédula', 'Tipo Llamada y Agente', 'Retroalimentación' y columna de áreas del Acumulado de Monitoreo. El portal recalcula esos reportes desde las evaluaciones.",
    "“Autentica correctamente” en Fraude, ROEXT y Aclaración simple: el formulario de Excel lo volvía crítico con el motivo “Aut Incompleta/Incorrecta”, pero el catálogo oficial y la matriz de críticos dicen que en esas cédulas no es crítico. El portal sigue el catálogo; no cambia ninguna calificación histórica.",
    "La cédula oficial de SAC pondera el script con 50 puntos, pero el formulario de evaluación aplica 17 (2 + 5 + 10). El portal respeta el formulario para que el histórico cuadre; se puede ajustar en Ajustes → Catálogo de cédulas.",
]

seed = {
    "version": 1,
    "generado": dt.datetime.now().replace(microsecond=0).isoformat(),
    "fuentes": fuentes,
    "hallazgos": hallazgos,
    "config": {
        "meta": 0.9,
        "umbralRojo": 0.8,
        "empresa": "Positivo S+",
        "cliente": "Bradescard",
        "area": "Prevención de Fraudes",
        "centroResultados": "BRADESCARD-PREVENCIÓN DE FRAUDES",
        "puestoAgente": "Analista de Prevención de Fraudes",
        "ciudad": "",
        "supervisorOperaciones": "Aneth Michelle Manzano",
        "supervisorCalidad": "",
        "coordinacionCalidad": "",
        "talentoHumano": "Jocelyn Monserrat Aldaz Villalobos",
        "tiposAuditoria": ["AUDIO Y PROCESOS", "EN VIVO"],
        "procesosMonitoreo": ["Monitoreo", "VCAS", "VRM"],
        "procesos": ["Inbound", "Monitoreo", "VCAS", "VRM", "ATM", "Back Up", "Autorizaciones", "Supervisión"],
    },
    "analistas": ANALISTAS,
    "agentes": agentes,
    "catalogo": {
        "items": items,
        "cedulas": cedulas,
        "descriptores": {"Inbound": descriptor_in, "Monitoreo": descriptor_mo, "notaMonitoreo": nota_mo},
        "acumulado": {
            "Inbound": {"respuestas": {CLAVES_IN[k]: v for k, v in COL_IN.items()},
                        "motivos": {CLAVES_IN[k]: v for k, v in COL_MOTIVO_IN.items()},
                        "areas": {CLAVES_IN[k]: v for k, v in COL_AREA_IN.items()},
                        "campos": {"folio": "A", "nombre": "B", "id": "C", "analista": "D", "fechaLlamada": "E", "fechaEvaluacion": "F",
                                   "duracion": "G", "tipo": "H", "semana": "I", "caso": "J", "promedio": "K", "observaciones": "AX"}},
            "Monitoreo": {"respuestas": {CLAVES_MO[k]: v for k, v in COL_MO.items()},
                          "motivos": {},
                          "areas": {CLAVES_MO[k]: v for k, v in COL_AREA_MO.items()},
                          "campos": {"folio": "A", "nombre": "B", "id": "C", "proceso": "D", "analista": "E", "fechaEvaluacion": "F",
                                     "duracion": "G", "tipo": "H", "semana": "I", "caso": "J", "promedio": "K", "observaciones": "AM"}},
        },
    },
    "modelo": {"causas": causas, "ruta": ruta, "reglas": reglas, "phva": phva, "roles": roles, "fasesIngreso": fases},
    "operacion": {
        "parametros": parametros,
        "equipo": equipo,
        "tareas": tareas,
        "kpis": kpis,
        "basesCatalogo": bases_catalogo,
    },
    "evaluaciones": evaluaciones,
}

if problemas:
    print("\nPROBLEMAS:")
    for p in problemas:
        print("  -", p)
    sys.exit(1)

SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
inb = sum(1 for e in evaluaciones if e["canal"] == "Inbound")
mon = len(evaluaciones) - inb
print(f"OK → {SALIDA}")
print(f"  cédulas: {len(cedulas)} · ítems: {len(items)} · agentes: {len(agentes)} · evaluaciones: {len(evaluaciones)} (Inbound {inb}, Monitoreo {mon})")
for c in cedulas:
    print(f"   {c['id']:<15} {len(c['items']):>2} rubros · {c['total']:>3} pts · críticos: {sum(1 for i in c['items'] if i['critico'] != 'no')}")
