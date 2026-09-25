#!/usr/bin/env python3
"""ARCA: impo_AAAAMM.lst (dentro del ZIP mensual) -> dos CSV comprimidos.

Uso:
    python arca_transform.py C:\\Laucen\\arca\\raw\\202608.zip C:\\Laucen\\arca\\out\\
    python arca_transform.py C:\\Laucen\\arca\\raw\\*.zip C:\\Laucen\\arca\\out\\

Escribe, por mes:
    impo_items_AAAAMM.csv.gz      una fila por ítem (columnas 0-13, deduplicadas)
    impo_impuestos_AAAAMM.csv.gz  una fila por ítem y concepto de arancel
    impo_resumen_AAAAMM.json      los conteos (los usa cargar.mjs)

Lee en streaming desde el ZIP (nunca descomprime el .lst a disco ni lo sube
entero a memoria). Python 3 sin dependencias. Imprime UNA línea de resumen por
mes: es lo único que hay que mirar.

Formato del .lst (docs/orden-arca-importaciones.md, sección 1): latin-1,
separador comilla simple, 2 líneas de encabezado, líneas rellenadas con
espacios, 16 columnas. El mismo ítem (DESTINACION + NUM_ITEM) se repite una
vez por concepto de arancel: columnas 0-13 iguales, cambian 14 (COD) y 15
(MONTO).
"""

import csv
import glob
import gzip
import io
import json
import os
import re
import sys
import time
import zipfile

COLUMNAS_ITEM = [
    "periodo", "aduana", "destinacion", "num_item", "importador", "transporte",
    "unidad", "cantidad", "fob_item", "fob_total", "divisa", "pais_origen",
    "pais_procedencia", "ncm",
]
COLUMNAS_IMPUESTO = ["periodo", "destinacion", "num_item", "concepto", "monto"]
N_COLUMNAS = 16
IMPORTADOR = 4  # la única columna de texto libre: si trae una comilla, se rearma


def numero(texto):
    """'8178.75', '8.178,75', '8178,75', '' -> '8178.75' / ''. Nunca inventa."""
    t = texto.strip()
    if not t:
        return ""
    if "," in t and "." in t:
        # el último separador es el decimal
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        float(t)
    except ValueError:
        raise ValueError(f"número inválido: {texto!r}")
    return t


def partir(linea):
    """Parte una línea en sus 16 columnas (o None si no se puede)."""
    campos = linea.rstrip("\r\n").rstrip().split("'")
    if len(campos) == N_COLUMNAS + 1 and campos[-1].strip() == "":
        campos.pop()  # separador al final de la línea
    if len(campos) > N_COLUMNAS:
        # el nombre del importador trajo comillas simples (ej. O'NEILL)
        sobran = len(campos) - N_COLUMNAS
        nombre = "'".join(campos[IMPORTADOR:IMPORTADOR + sobran + 1])
        campos = campos[:IMPORTADOR] + [nombre] + campos[IMPORTADOR + sobran + 1:]
    if len(campos) != N_COLUMNAS:
        return None
    return [c.strip() for c in campos]


def transformar(ruta_zip, carpeta_salida):
    inicio = time.time()
    nombre = os.path.basename(ruta_zip)
    m = re.fullmatch(r"(\d{6})\.zip", nombre, re.IGNORECASE)
    if not m:
        raise SystemExit(f"{nombre}: el ZIP tiene que llamarse AAAAMM.zip")
    periodo = m.group(1)

    with zipfile.ZipFile(ruta_zip) as z:
        candidatos = [n for n in z.namelist() if re.search(r"impo_\d{6}\.lst$", n, re.IGNORECASE)]
        if len(candidatos) != 1:
            raise SystemExit(f"{nombre}: no encontré un único impo_AAAAMM.lst adentro")

        os.makedirs(carpeta_salida, exist_ok=True)
        ruta_items = os.path.join(carpeta_salida, f"impo_items_{periodo}.csv.gz")
        ruta_imp = os.path.join(carpeta_salida, f"impo_impuestos_{periodo}.csv.gz")
        tmp_items, tmp_imp = ruta_items + ".tmp", ruta_imp + ".tmp"

        vistos = {}          # (destinacion, num_item) -> hash de columnas 0-13 (poca memoria)
        despachos = set()
        importadores = set()
        filas = malformadas = inconsistentes = otro_periodo = impuestos = 0

        with z.open(candidatos[0]) as crudo, \
                gzip.open(tmp_items, "wt", encoding="utf-8", newline="", compresslevel=6) as f_items, \
                gzip.open(tmp_imp, "wt", encoding="utf-8", newline="", compresslevel=6) as f_imp:
            texto = io.TextIOWrapper(crudo, encoding="latin-1", newline="")
            w_items = csv.writer(f_items)
            w_imp = csv.writer(f_imp)
            w_items.writerow(COLUMNAS_ITEM)
            w_imp.writerow(COLUMNAS_IMPUESTO)

            for n, linea in enumerate(texto):
                if n < 2 or not linea.strip():
                    continue  # encabezado / renglón vacío
                filas += 1
                c = partir(linea)
                if c is None or not c[1] or not c[2].isdigit():
                    malformadas += 1
                    continue
                try:
                    cantidad, fob_item, fob_total = numero(c[7]), numero(c[8]), numero(c[9])
                    monto = numero(c[15])
                except ValueError:
                    malformadas += 1
                    continue
                destinacion, num_item = c[1], int(c[2])
                clave = (destinacion, num_item)
                item = (c[0], destinacion, num_item, c[4], c[5], c[6], cantidad, fob_item,
                        fob_total, c[10], c[11], c[12], c[13])
                huella = hash(item)
                previo = vistos.get(clave)
                if previo is None:
                    vistos[clave] = huella
                    if c[3] and c[3] != periodo:
                        otro_periodo += 1
                    despachos.add(destinacion)
                    importadores.add(c[4])
                    w_items.writerow((periodo,) + item)
                elif previo != huella:
                    inconsistentes += 1
                if c[14]:
                    w_imp.writerow((periodo, destinacion, num_item, c[14], monto))
                    impuestos += 1

    os.replace(tmp_items, ruta_items)
    os.replace(tmp_imp, ruta_imp)
    segundos = time.time() - inicio
    # lo lee scripts/arca/cargar.mjs para anotar la carga en arca_cargas
    with open(os.path.join(carpeta_salida, f"impo_resumen_{periodo}.json"), "w") as f:
        json.dump({"periodo": periodo, "filas_crudas": filas, "items": len(vistos),
                   "despachos": len(despachos), "importadores": len(importadores),
                   "filas_impuestos": impuestos, "malformadas": malformadas,
                   "inconsistentes": inconsistentes}, f)
    print(f"{periodo}: filas_crudas={filas} items={len(vistos)} despachos={len(despachos)} "
          f"importadores={len(importadores)} filas_impuestos={impuestos} "
          f"malformadas={malformadas} inconsistentes={inconsistentes} "
          f"fecha_distinta={otro_periodo} ({segundos:.0f} s)", flush=True)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    salida = sys.argv[-1]
    zips = []
    for patron in sys.argv[1:-1]:
        zips.extend(sorted(glob.glob(patron)) or [patron])
    for ruta in zips:
        transformar(ruta, salida)


if __name__ == "__main__":
    main()
