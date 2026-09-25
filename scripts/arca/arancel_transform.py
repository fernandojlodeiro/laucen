#!/usr/bin/env python3
"""ARCA: arancel.zip (Nomenclatura Común del Mercosur) -> ref_ncm.csv y ref_sufijo.csv.

La fecha de vigencia sale del nombre del nomenclador (nomenclador_AAAAMMDD.txt)
y va en cada fila: una carga nueva es una versión nueva, no pisa la anterior.

Uso:
    python arancel_transform.py C:\\Laucen\\arca\\ref\\arancel.zip C:\\Laucen\\arca\\out\\

Del ZIP usa nomenclador_AAAAMMDD.txt y sufijos_AAAAMMDD.txt (latin-1,
separador @). Python 3 sin dependencias. Imprime una línea de resumen.

Nomenclador (docs, sección 5):
    2@85.16           @      @ ... @CALENTADORES ELECTRICOS DE AGUA ...
    2@8516.29.00      @      @ ... @--Los demas
    2@8516.29.00.100A @000.00@008.00@020.00@008.00@000.00@      @07@  @      Radiadores ...
Columna 1 = código, 2-6 = alícuotas, 8 = unidad, última = descripción,
indentada con espacios y guiones según el nivel. El padre se reconstruye con
una pila: partida -> guiones (-, --, ---) -> aperturas SIM por sangría.

Sufijos (docs, sección 5.1):  3@posición@código@norma@descripción
"""

import csv
import os
import re
import sys
import zipfile


def leer(z, prefijo):
    nombres = [n for n in z.namelist() if re.search(prefijo + r"_?\d*\.txt$", os.path.basename(n), re.IGNORECASE)]
    if len(nombres) != 1:
        raise SystemExit(f"no encontré un único {prefijo}_AAAAMMDD.txt en el ZIP")
    return z.read(nombres[0]).decode("latin-1").splitlines(), os.path.basename(nombres[0])


def vigencia_de(nombre):
    """Fecha de vigencia desde el nombre: nomenclador_25092026.txt (DDMMAAAA, como
    viene hoy de ARCA) o nomenclador_20260925.txt (AAAAMMDD) -> '2026-09-25'."""
    import datetime
    m = re.search(r"(\d{8})", nombre)
    if not m:
        raise SystemExit(f"{nombre}: no trae la fecha (8 números) en el nombre")
    d = m.group(1)
    for anio, mes, dia in ((d[4:], d[2:4], d[:2]), (d[:4], d[4:6], d[6:])):
        try:
            f = datetime.date(int(anio), int(mes), int(dia))
        except ValueError:
            continue
        if 2000 <= f.year <= 2100:
            return f.isoformat()
    raise SystemExit(f"{nombre}: no entiendo la fecha {d}")


def tipo_de(codigo):
    digitos = re.sub(r"\D", "", codigo)
    if re.fullmatch(r"\d{2}\.\d{2}", codigo):
        return "partida"
    if re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", codigo):
        return "ncm"
    if len(digitos) > 8:
        return "sim"
    return "subpartida"


def limpiar(desc):
    return re.sub(r"\s+", " ", desc.strip().lstrip("-").strip())


def alicuota(t):
    t = t.strip()
    try:
        return str(float(t)) if t else ""
    except ValueError:
        return ""


def nomenclador(lineas):
    filas = {}     # codigo -> dict (orden de inserción = orden del archivo)
    pila = []      # [(profundidad, codigo)]
    repetidos = raras = 0
    for linea in lineas:
        c = linea.split("@")
        if len(c) < 11 or c[0].strip() != "2":
            if linea.strip():
                raras += 1
            continue
        codigo = c[1].strip()
        desc_cruda = "@".join(c[10:]).rstrip()
        if not codigo:
            raras += 1
            continue
        if codigo in filas:
            repetidos += 1
            extra = limpiar(desc_cruda)
            if extra:
                filas[codigo]["descripcion"] += " " + extra
            continue
        tipo = tipo_de(codigo)
        sin_sangria = desc_cruda.lstrip(" ")
        guiones = len(sin_sangria) - len(sin_sangria.lstrip("-"))
        if tipo == "partida":
            prof = 0
        elif tipo == "sim":
            prof = 100 + (len(desc_cruda) - len(sin_sangria))  # por sangría
        else:
            prof = max(guiones, 1)
        partida = re.sub(r"\D", "", codigo)[:4]
        while pila and (pila[-1][0] >= prof or re.sub(r"\D", "", pila[-1][1])[:4] != partida):
            pila.pop()
        padre = pila[-1][1] if pila else ""
        filas[codigo] = {
            "codigo": codigo, "tipo": tipo, "nivel": len(pila) + 1, "padre": padre,
            "descripcion": limpiar(desc_cruda), "unidad": c[8].strip(),
            "alic": [alicuota(x) for x in c[2:7]],
        }
        pila.append((prof, codigo))

    for f in filas.values():
        partes, p = [f["descripcion"]], f["padre"]
        while p:
            partes.append(filas[p]["descripcion"])
            p = filas[p]["padre"]
        f["descripcion_completa"] = " › ".join(x for x in reversed(partes) if x)
    return list(filas.values()), repetidos, raras


def sufijos(lineas):
    filas, repetidos, raras = {}, 0, 0
    for linea in lineas:
        c = linea.split("@")
        if len(c) < 5 or c[0].strip() != "3":
            if linea.strip():
                raras += 1
            continue
        clave = (c[1].strip(), c[2].strip())
        if clave in filas:
            repetidos += 1
            continue
        filas[clave] = (clave[0], clave[1], c[3].strip(), "@".join(c[4:]).strip())
    return list(filas.values()), repetidos, raras


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    ruta_zip, salida = sys.argv[1], sys.argv[2]
    os.makedirs(salida, exist_ok=True)
    with zipfile.ZipFile(ruta_zip) as z:
        lineas, nombre_nom = leer(z, "nomenclador")
        vigencia = vigencia_de(nombre_nom)
        ncm, rep_n, raras_n = nomenclador(lineas)
        suf, rep_s, raras_s = sufijos(leer(z, "sufijos")[0])

    with open(os.path.join(salida, "ref_ncm.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["codigo", "vigencia", "tipo", "nivel", "padre", "descripcion", "descripcion_completa",
                    "unidad", "alic_1", "alic_2", "alic_3", "alic_4", "alic_5"])
        for x in ncm:
            w.writerow([x["codigo"], vigencia, x["tipo"], x["nivel"], x["padre"], x["descripcion"],
                        x["descripcion_completa"], x["unidad"], *x["alic"]])
    with open(os.path.join(salida, "ref_sufijo.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["posicion", "codigo", "norma", "descripcion"])
        w.writerows(suf)

    por_tipo = {}
    for x in ncm:
        por_tipo[x["tipo"]] = por_tipo.get(x["tipo"], 0) + 1
    print(f"arancel: vigencia={vigencia} ncm={len(ncm)} {por_tipo} repetidos={rep_n} raras={raras_n} | "
          f"sufijos={len(suf)} repetidos={rep_s} raras={raras_s}", flush=True)


if __name__ == "__main__":
    main()
