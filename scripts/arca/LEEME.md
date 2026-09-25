# Carga de importaciones (ARCA + Softrade)

La orden completa está en `docs/orden-arca-importaciones.md`. Esto es el
paso a paso para la sesión de Claude Code **que corre en la PC de Fer**
(donde están los archivos). La sesión en la nube no ve `C:\`.

## Una sola vez

1. `npm install` en el repo.
2. Crear `.env.local` en la raíz del repo con `DATABASE_URL=<contraseña de la base>`
   (la misma que está en Vercel; Fer la tiene). Nunca se sube al repo: `.gitignore`
   ya excluye `.env` y `.env*.local`.
3. Python 3 instalado (sin paquetes extra).

## Dónde van los archivos

| Qué | Carpeta |
|---|---|
| ZIP mensuales de ARCA, con el nombre tal como los baja ARCA (`AAAAMM.zip`; el mes sale de los 6 números del nombre, no hay que renombrar). Ojo: dos ZIP del mismo mes (ej. `202608 (1).zip`) se pisan | `C:\Laucen\arca\raw\` |
| `arancel.zip` (Nomenclatura Común del Mercosur), con ese nombre tal cual | `C:\Laucen\arca\ref\` |
| CSV intermedios (los generan los scripts) | `C:\Laucen\arca\out\` |
| Excel de Softrade | `C:\Laucen\softrade\in\` (se mueven solos a `done\` o `error\`) |

## Comandos

```
# Nomenclador NCM + sufijos
python scripts\arca\arancel_transform.py C:\Laucen\arca\ref\arancel.zip C:\Laucen\arca\out
node scripts\arca\cargar.mjs arancel C:\Laucen\arca\out

# ARCA: transformar (≈1 min por mes) y cargar
python scripts\arca\arca_transform.py C:\Laucen\arca\raw\202608.zip C:\Laucen\arca\out
node scripts\arca\cargar.mjs arca C:\Laucen\arca\out 202608

# Softrade: carga cada .xlsx nuevo de in\ y lo mueve a done\ (o error\ con un .log)
node scripts\arca\cargar.mjs softrade C:\Laucen\softrade

# Verificar contra los números de la orden (sección 8, pasos 4 y 6)
node scripts\arca\cargar.mjs verificar

# Cuál alícuota del nomenclador es derechos (cruce con Softrade)
node scripts\arca\cargar.mjs alicuotas

# SÓLO cuando verificar dio todo OK: el resto de los meses de raw\
# (los ya cargados se saltean; --forzar para recargar uno)
for %f in (C:\Laucen\arca\raw\*.zip) do python scripts\arca\arca_transform.py %f C:\Laucen\arca\out
node scripts\arca\cargar.mjs arca C:\Laucen\arca\out
```

Otros: `node scripts\arca\cargar.mjs resumen [AAAAMM ...]` recalcula las tablas
resumen; `derechos <carpeta>` recalcula `derechos_pct_efectivo` en todos los meses (ver abajo);
`esquema` sólo crea/actualiza las tablas.

## Reglas

- **Orden**: primero agosto 2026 + el Excel de ejemplo de Softrade, y `verificar`
  tiene que dar todo OK (ítems, despachos, importadores, 8516.29.00 China, el
  despacho 26001IC04154138R/1 con cantidad y FOB, derechos_pct_efectivo en null,
  y los chequeos de Softrade). Recién después, el resto de los meses.
- Mirar sólo la línea de resumen que imprime cada script. **No** abrir los
  `.lst` ni los `.csv.gz` (salvo las 3 primeras líneas para verificar formato).
- `arca_transform.py` es el de Cowork, probado contra el archivo real de agosto
  2026. No reescribirlo: si hace falta otra cosa, se hace en la carga.
- Impuestos: **no se guarda ningún monto** (recorte del 25/09, bitácora #3). Del
  `impo_impuestos_AAAAMM.csv.gz` sólo sale `derechos_pct_efectivo` (derechos /
  FOB × 100, 2 decimales). No borrar esos `.csv.gz` de `out\`: el recálculo los
  vuelve a leer.
- Concepto de derechos: **010** (confirmado por Fer el 25/09; 061 es la tasa de
  estadística). Está en `scripts/arca/parametros.mjs`. Si alguna vez cambia: poner
  el código ahí y correr `node scripts\arca\cargar.mjs derechos C:\Laucen\arca\out`.
- Alícuotas del nomenclador: después de cargar el arancel y el Excel de Softrade,
  `node scripts\arca\cargar.mjs alicuotas` identifica cuál de las 5 es derechos
  (cruce con el "% Dere." de Softrade) y lo anota en `ref_alicuota`. Las otras
  cuatro quedan sin nombre hasta que Fer las confirme.
- Cada carga de `arancel.zip` es una versión nueva (fecha del nombre del archivo);
  no pisa las anteriores. Recargar la misma fecha la reemplaza.
