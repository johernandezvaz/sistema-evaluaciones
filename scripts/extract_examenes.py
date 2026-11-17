"""
Extrae la estructura de los exámenes en papel (formatos/2.-EXAM*.xlsx) a data/examenes.json.

Uso:
    python -I scripts/extract_examenes.py            # desde la raíz del proyecto

Qué extrae (por hoja de cada archivo):
  - título, campos de encabezado, preguntas teóricas con sus opciones y tipo,
  - número de casillas de pieza (Buena/Mala/Defecto) impresas en el formato,
  - bloques extra (INSPECCION, práctica de 3 días, firmas, código de documento),
  - imágenes embebidas (se copian a public/examenes/<slug>/).

Lo que NO viene en los Excel (respuesta correcta, puntaje por pregunta, clave G/B,
número real de piezas por examen) se deja como "TODO" — no se inventa.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
FORMATOS = ROOT / "formatos"
OUT_JSON = ROOT / "data" / "examenes.json"
OUT_IMG = ROOT / "public" / "examenes"

TODO = "TODO"

MAPEO = {
    "2.-EXAMEN 33.xlsx": dict(slug="alpine-33", modelo="ALPINE 33 (PINES Y CANDADOS)", grupo="PINTURA", confianza="baja",
                              nota="Misma pieza (marco Alpine) que HIGH GLOSS ALPINE y ALPINE[1]. Se asume relación con '33 PINES Y CANDADOS QUEBRADOS' de PROMEDIOS/PINT-26."),
    "2.-EXAMEN ALPINE 35.xlsx": dict(slug="alpine-35", modelo="ALPINE 35 (BRILLO BAJO)", grupo="PINTURA", confianza="baja",
                                     nota="Se asume = 'PIEZA BRILLO BAJO 35' de PROMEDIOS/CALIDAD 26. Hoja llamada MOLDEO pero título dice PINTURA."),
    "2.-EXAMEN ALPINE.xlsx": dict(slug="alpine", modelo="ALPINE (B1TXX)", grupo="PINTURA", confianza="media",
                                  nota="Consola Alpine. En históricos aparece como 'B1TXX ALPINE'."),
    "2.-EXAMEN ALPINE[1].xlsx": dict(slug="alpine-marco", modelo="ALPINE MARCO", grupo="PINTURA", confianza="baja",
                                     nota="Idéntico byte a byte a ALPINE[2]. Misma pieza que EXAMEN 33 sin preguntas de equipo. Posible duplicado/obsoleto."),
    "2.-EXAMEN ALPINE[2].xlsx": dict(slug="alpine-marco", modelo="ALPINE MARCO", grupo="PINTURA", confianza="baja",
                                     nota="Duplicado exacto de ALPINE[1]. Se ignora en el seed.", duplicado_de="2.-EXAMEN ALPINE[1].xlsx"),
    "2.-EXAMEN BEZEL.xlsx": dict(slug="bezel-inj", modelo="FAMILIA BEZEL INJ", grupo="MOLDEO", confianza="alta", nota=""),
    "2.-EXAMEN BOTON LASEREADO.xlsx": dict(slug="boton-laser", modelo="BOTON ESTAMPADO LASER", grupo="ENSAMBLES", confianza="alta", nota=""),
    "2.-EXAMEN BOTON SIN LASEREADO.xlsx": dict(slug="boton-sin-laser", modelo="BOTON SIN ESTAMPADO", grupo="ENSAMBLES", confianza="alta", nota=""),
    "2.-EXAMEN CUBIERTA.xlsx": dict(slug="cubiertas-pai", modelo="CUBIERTAS PAI", grupo="PINTURA", confianza="media",
                                    nota="Cubierta de airbag pintada (gris). Título 'AREA PINTURA'."),
    "2.-EXAMEN CUBIERTAS.xlsx": dict(slug="cubiertas-inj", modelo="FAMILIA CUBIERTAS (PAB/DAB)", grupo="MOLDEO", confianza="alta",
                                     nota="Título 'KAPPA CUBIERTAS INJ'. Celda I60 con #VALUE! (residuo)."),
    "2.-EXAMEN HIGH GLOSS ALPINE.xlsx": dict(slug="alto-brillo", modelo="ALTO BRILLO (HIGH GLOSS ALPINE)", grupo="PINTURA", confianza="alta", nota=""),
    "2.-EXAMEN HIGHAND.xlsx": dict(slug="highland", modelo="HIGHLAND", grupo="ENSAMBLES", confianza="alta",
                                   nota="Hoja1 es copia sin bloque de práctica de 3 días ni firma de calidad."),
    "2.-EXAMEN HONDA 18RM.xlsx": dict(slug="18rm", modelo="18RM 220D GARNISH (RIFLE)", grupo="ENSAMBLES", confianza="alta",
                                      nota="Dos variantes: '1er vez' (con práctica de 3 días) y 'anual' (re-certificación)."),
    "2.-EXAMEN HONDA KEYLESS.xlsx": dict(slug="keyless", modelo="KEYLESS", grupo="ENSAMBLES", confianza="alta",
                                         nota="Hoja1 es variante sin preguntas de equipo/herramienta."),
    "2.-EXAMNE BASE SWITH.xlsx": dict(slug="base-switch", modelo="BASE SWITCH", grupo=TODO, confianza="baja",
                                      nota="No aparece en la matriz ILUO ni en PROMEDIOS. ¿Corresponde a RAPTOR, VOLVO, CDX o HUD BEZEL?"),
}

VARIANTE_HOJA = {
    ("2.-EXAMEN HONDA 18RM.xlsx", "1er vez"): "primera_certificacion",
    ("2.-EXAMEN HONDA 18RM.xlsx", "anual"): "anual",
    ("2.-EXAMEN HIGHAND.xlsx", "Hoja1"): "sin_practica",
    ("2.-EXAMEN HONDA KEYLESS.xlsx", "Hoja1"): "corta",
}

HEADER_LABELS = {"Fecha:": "fecha", "MODELO": "modelo", "Calificacion:": "calificacion",
                 "Nombre :": "nombre", "# empleado": "numero_empleado", "Area :": "area"}
OPT_RE = re.compile(r"^\s*([A-C])\)\s*$")
ZONE_RE = re.compile(r"^\s*(\d)\s*[:.\-]*\s*([A-Za-zÁÉÍÓÚÑ\"].*)$")


def clean(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip()


def classify(text: str, options: list) -> str:
    t = text.lower()
    if "menciona" in t:
        return "texto_abierto"
    if "señala las partes" in t:
        return "etiquetar_diagrama"
    if options and all(o["texto"].lower() in ("si", "no") for o in options):
        return "si_no"
    return "opcion_multiple"


def parse_sheet(ws, fname: str) -> dict:
    rows: dict[int, list] = {}
    for r in ws.iter_rows():
        cells = [(c.column, c.value) for c in r if c.value is not None and clean(c.value) != ""]
        if cells:
            rows[r[0].row] = cells

    header, preguntas, extras = [], [], []
    piezas_row = None
    current = None

    for rn in sorted(rows):
        cells = rows[rn]
        first_col, first_val = cells[0]
        txt = clean(first_val)

        if rn == 1:
            continue
        # encabezado
        labels = [HEADER_LABELS[clean(v)] for _, v in cells if isinstance(v, str) and clean(v) in HEADER_LABELS]
        if labels:
            header += labels
            continue
        # inicio de la sección de piezas
        if isinstance(first_val, str) and txt.lower().startswith("marca si la pieza"):
            piezas_row = rn
            current = None
            break
        # pregunta nueva: texto largo en columna A
        if first_col == 1 and isinstance(first_val, str) and len(txt) > 15 and not OPT_RE.match(txt):
            current = {"texto": txt, "opciones": []}
            preguntas.append(current)
            continue
        if current is None:
            continue
        # opciones / zonas / si-no / numéricas
        i = 0
        while i < len(cells):
            col, v = cells[i]
            s = clean(v)
            m = OPT_RE.match(s) if isinstance(v, str) else None
            if m and i + 1 < len(cells):
                current["opciones"].append({"clave": m.group(1), "texto": clean(cells[i + 1][1])})
                i += 2
                continue
            z = ZONE_RE.match(s) if isinstance(v, str) else None
            if z:
                current["opciones"].append({"clave": z.group(1), "texto": z.group(2).strip()})
            elif re.fullmatch(r"\d\)", s):
                current["opciones"].append({"clave": s[0], "texto": ""})  # renglón para respuesta abierta
            elif s.lower() in ("si", "no"):
                current["opciones"].append({"clave": s.upper(), "texto": s.capitalize()})
            elif isinstance(v, (int, float)):
                letter = "ABC"[len(current["opciones"])] if len(current["opciones"]) < 3 else str(v)
                current["opciones"].append({"clave": letter, "texto": str(int(v))})
            elif current["opciones"] and isinstance(v, str):
                # continuación de la última opción (p. ej. "y trapos de microfibra")
                current["opciones"][-1]["texto"] += " " + s
            i += 1

    # piezas: números en columnas A y F después del encabezado Buena/Mala
    slots, extras_txt, codigo = set(), [], None
    for rn in sorted(rows):
        if piezas_row is None or rn <= piezas_row:
            continue
        for col, v in rows[rn]:
            if isinstance(v, (int, float)) and col in (1, 6):
                slots.add(int(v))
            elif isinstance(v, str):
                s = clean(v)
                if re.fullmatch(r"\d\d [A-Z]\d\d [A-Z]\d\d \d\d \d", s) or re.fullmatch(r"\d\d [A-Z]\d\d [A-Z] \d\d \d", s):
                    codigo = s
                elif s not in ("Buena", "Mala", "Defecto", "#VALUE!"):
                    extras_txt.append(s)

    faltantes = sorted(set(range(1, max(slots) + 1)) - slots) if slots else []

    for p in preguntas:
        p["tipo"] = classify(p["texto"], p["opciones"])
        p["respuesta_correcta"] = TODO
        p["puntaje"] = TODO
        if p["tipo"] == "texto_abierto":
            p["respuestas_esperadas"] = TODO
        if p["tipo"] == "etiquetar_diagrama":
            p["nota"] = "Las flechas son figuras dibujadas sobre la imagen; su posición no se puede mapear a zonas de forma confiable."

    return {
        "titulo": clean(rows.get(1, [(1, "")])[0][1]),
        "campos_encabezado": sorted(set(header), key=header.index),
        "preguntas": preguntas,
        "casillas_pieza_impresas": max(slots) if slots else 0,
        "casillas_faltantes_en_formato": faltantes,
        "columnas_por_pieza": ["Buena", "Mala", "Defecto"],
        "numero_piezas_examen": TODO,
        "clave_gb": TODO,
        "extras": extras_txt,
        "codigo_documento": codigo,
    }


def extract_images(path: Path, slug: str) -> list[str]:
    out = OUT_IMG / slug
    saved = []
    with zipfile.ZipFile(path) as z:
        for n in sorted(z.namelist()):
            if n.startswith("xl/media/") and n.rsplit(".", 1)[-1].lower() in ("png", "jpg", "jpeg"):
                out.mkdir(parents=True, exist_ok=True)
                dest = out / Path(n).name
                dest.write_bytes(z.read(n))
                saved.append(dest.relative_to(ROOT / "public").as_posix())
    return saved


def main() -> int:
    examenes = []
    for path in sorted(FORMATOS.glob("2.-EXAM*.xlsx")):
        meta = MAPEO.get(path.name)
        if meta is None:
            print(f"Sin mapeo para {path.name}; agrégalo a MAPEO", file=sys.stderr)
            return 1
        md5 = hashlib.md5(path.read_bytes()).hexdigest()
        wb = openpyxl.load_workbook(path)
        imagenes = [] if meta.get("duplicado_de") else extract_images(path, meta["slug"])
        for ws in wb.worksheets:
            data = parse_sheet(ws, path.name)
            examenes.append({
                "archivo": path.name,
                "hoja": ws.title,
                "md5": md5,
                "variante": VARIANTE_HOJA.get((path.name, ws.title), "principal"),
                **{k: v for k, v in meta.items()},
                "imagenes": imagenes,
                **data,
            })

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({"_nota": "Generado por scripts/extract_examenes.py. Los valores 'TODO' no existen en los Excel y deben confirmarse con Calidad.",
                                    "examenes": examenes}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(examenes)} hojas de examen -> {OUT_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
