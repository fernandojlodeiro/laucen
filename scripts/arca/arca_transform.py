#!/usr/bin/env python3
"""
arca_transform.py — Convierte un ZIP mensual de ARCA (Información agregada de
comercio exterior) en dos CSV comprimidos listos para cargar en Postgres:

  impo_items_AAAAMM.csv.gz     una fila por ítem de despacho (deduplicado)
  impo_impuestos_AAAAMM.csv.gz una fila por ítem y concepto de arancel

Columnas del .lst (separador comilla simple, latin-1, 2 líneas de encabezado):
  0 ADU  1 DESTINACION  2 NUM_ITEM  3 FECHA(AAAAMM)  4 NOMBRE_IMPORTADOR(30 car.)
  5 M(transporte)  6 UN(unidad)  7 CANT_UNIDAD_MEDIDA  8 FOB_DOLAR(del ítem)
  9 FOB_TOTAL(de la destinación)  10 DIV  11 PAI origen  12 PAI procedencia
  13 POS_NCM  14 COD(concepto arancel)  15 MONTO(USD)

Uso:
  python arca_transform.py 202608.zip [carpeta_salida]

No descomprime a disco ni carga el archivo en memoria: lee en streaming.
Probado con 202608.zip (7.826.669 filas -> 530.186 ítems) en ~1 min (Python 3, sin dependencias).
"""
import csv, gzip, io, os, re, sys, zipfile

def main(zip_path, out_dir="."):
    m = re.search(r"(\d{6})", os.path.basename(zip_path))
    if not m:
        sys.exit("El nombre del zip debe contener AAAAMM, ej. 202608.zip")
    periodo = m.group(1)
    zf = zipfile.ZipFile(zip_path)
    name = next(n for n in zf.namelist() if n.lower().startswith("impo_"))

    items_path = os.path.join(out_dir, f"impo_items_{periodo}.csv.gz")
    tax_path   = os.path.join(out_dir, f"impo_impuestos_{periodo}.csv.gz")
    f_items = gzip.open(items_path, "wt", newline="", encoding="utf-8")
    f_tax   = gzip.open(tax_path,   "wt", newline="", encoding="utf-8")
    w_items = csv.writer(f_items); w_tax = csv.writer(f_tax)
    w_items.writerow(["periodo","aduana","destinacion","num_item","importador",
                      "transporte","unidad","cantidad","fob_item","fob_total",
                      "divisa","pais_origen","pais_procedencia","ncm"])
    w_tax.writerow(["periodo","destinacion","num_item","concepto","monto"])

    seen = set(); n_rows = n_items = 0
    with zf.open(name) as raw:
        for i, line in enumerate(io.TextIOWrapper(raw, encoding="latin-1", newline="\n")):
            if i < 2:            # dos líneas de encabezado
                continue
            p = line.rstrip("\n").rstrip().split("'")
            if len(p) < 16:
                continue
            n_rows += 1
            dest = p[1].strip(); item = p[2].strip()
            key = (dest, item)
            if key not in seen:
                seen.add(key); n_items += 1
                w_items.writerow([periodo, p[0].strip(), dest, item, p[4].strip(),
                                  p[5].strip(), p[6].strip(), p[7].strip(),
                                  p[8].strip(), p[9].strip(), p[10].strip(),
                                  p[11].strip(), p[12].strip(), p[13].strip()])
            w_tax.writerow([periodo, dest, item, p[14].strip(), p[15].strip()])
    f_items.close(); f_tax.close()
    print(f"{periodo}: {n_rows} filas crudas -> {n_items} items. Salida: {items_path}, {tax_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ".")
