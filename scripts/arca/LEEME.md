# Carga de importaciones (ARCA + Softrade)

La orden completa está en `docs/orden-arca-importaciones.md`. Esto es el
paso a paso para la sesión de Claude Code **que corre en la PC de Fer**
(donde están los archivos). La sesión en la nube no ve `C:\`.

## Una sola vez

1. `npm install` en el repo.
2. Crear `.env.local` en la raíz del repo con `DATABASE_URL=<contraseña de la base>`
   (la misma que está en Vercel; Fer la tiene). Nunca se sube al repo.
3. Python 3 instalado (sin paquetes extra).

## Dónde van los archivos

| Qué | Carpeta |
|---|---|
| ZIP mensuales de ARCA, nombre original `AAAAMM.zip` | `C:\Laucen\arca\raw\` |
| `arancel.zip` (Nomenclatura Común del Mercosur) | `C:\Laucen\arca\ref\` |
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

# Todos los meses que haya en raw\ (los ya cargados se saltean; --forzar para recargar)
python scripts\arca\arca_transform.py "C:\Laucen\arca\raw\*.zip" C:\Laucen\arca\out
node scripts\arca\cargar.mjs arca C:\Laucen\arca\out

# Softrade: carga cada .xlsx nuevo de in\ y lo mueve a done\ (o error\ con un .log)
node scripts\arca\cargar.mjs softrade C:\Laucen\softrade

# Verificar contra los números de la orden (sección 8, pasos 4 y 6)
node scripts\arca\cargar.mjs verificar
```

Otros: `node scripts\arca\cargar.mjs resumen [AAAAMM ...]` recalcula las tablas
resumen; `esquema` sólo crea/actualiza las tablas.

## Reglas

- Mirar sólo la línea de resumen que imprime cada script. **No** abrir los
  `.lst` ni los `.csv.gz` (salvo las 3 primeras líneas para verificar formato).
- `malformadas` o `inconsistentes` distintos de 0 en `arca_transform.py`: mirar
  antes de cargar. `fecha_distinta` es informativo.
- Impuestos por concepto (`--con-impuestos`): **no cargar todavía**, pendiente
  de decisión de Fer (ocupan ~15 veces lo que los ítems). El `.csv.gz` queda en
  `out\`, así que el dato no se pierde.
- `arca_transform.py` se reescribió porque el original no llegó al repo. Si
  aparece el original, comparar la salida de los dos sobre 202608 y quedarse
  con el que dé los números de la orden.
