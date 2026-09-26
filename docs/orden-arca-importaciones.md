# Orden para Code — Base de importaciones argentinas (ARCA) en Laucen

Fecha: 25/09/2026, versión 2 (agrega Softrade, sufijos y consultas de descubrimiento). **Actualizada el 25/09 con las decisiones de Fer**: script de Cowork en `scripts/arca/`; **recorte de impuestos**: no se guarda ningún monto; arancel del nomenclador (columna 3) e IVA y estadística deducidos por NCM; nomenclador versionado por fecha de vigencia. Origen: sesión de Cowork con Fer. Este documento reemplaza cualquier versión anterior y cualquier suposición sobre datos de aduana. Todo lo que dice "verificado" fue probado con el archivo real de agosto 2026 o con el Excel real de Softrade.

---

## 0. Resumen en una línea

ARCA publica gratis, mes a mes desde 2017, el detalle de **cada ítem de cada despacho de importación argentino**, con nombre del importador, NCM, cantidad, FOB, país de origen y medio de transporte. Vamos a cargar todo (todos los países, todos los transportes) en Supabase, con tablas de referencia para leer los códigos, y construir sobre eso un buscador con muchos filtros. Es una de las dos fuentes (la otra es la base de tendencias de ML) para decidir qué rubros y productos buscar en China.

---

## 1. La fuente (verificado)

- Página: https://www.afip.gob.ar/operadoresComercioExterior/informacionAgregada/informacion-agregada.asp
- Descarga: `https://www.afip.gob.ar/operadoresComercioExterior/informacionAgregada/download.aspx?filename=AAAAMM.zip` (2017-01 a 2026-08 al día de hoy).
- **Los ZIP los baja Fer a mano y los deja en una carpeta local** (ver sección 3). Code NO los descarga (el proxy de Cowork bloquea afip.gob.ar; desde la PC de Fer se baja sin problema).
- Cada ZIP (~145 MB) trae 3 archivos `.lst`: `impo_AAAAMM.lst` (5,5 GB descomprimido), `expo_agregado_AAAAMM.lst`, `total_expo_agregado_AAAAMM.lst`. Solo nos interesa `impo_`.

### Formato de `impo_AAAAMM.lst` (verificado)
- Texto **latin-1**, separador **comilla simple** `'`, 2 líneas de encabezado, cada línea rellenada con espacios hasta 701 caracteres.
- 16 columnas (índice 0-15):

| # | Campo | Nota |
|---|---|---|
| 0 | ADU | aduana de registro (código) |
| 1 | DESTINACION | nº de despacho, ej. `26001IC04151676V` |
| 2 | NUM_ITEM | nº de ítem dentro del despacho |
| 3 | FECHA | AAAAMM (solo mes) |
| 4 | NOMBRE_IMPORTADOR | **truncado a 30 caracteres** |
| 5 | M | medio de transporte (código) |
| 6 | UN | unidad de medida (código) |
| 7 | CANT_UNIDAD_MEDIDA | cantidad |
| 8 | FOB_DOLAR | **FOB del ítem** en USD |
| 9 | FOB_TOTAL | FOB de toda la destinación (se repite en cada ítem) |
| 10 | DIV | divisa (código) |
| 11 | PAI | país de origen (código) |
| 12 | PAI | país de procedencia (código) |
| 13 | POS_NCM | NCM 8 dígitos, ej. `8516.29.00` |
| 14 | COD | concepto de arancel/impuesto (código) |
| 15 | MONTO | monto de ese concepto en USD |

- **Trampa principal: hay una fila por ítem y por concepto de arancel.** El mismo ítem aparece 10–15 veces con las columnas 0-13 idénticas y solo cambian 14 y 15. Agosto 2026: 7.826.669 filas → 530.186 ítems únicos (clave `DESTINACION + NUM_ITEM`), 64.863 despachos, 12.089 importadores distintos.
- No trae: descripción de mercadería, marca, modelo, proveedor, peso, día exacto.

---

## 2. Transformación (script probado, adjunto: `arca_transform.py`)

Regla de oro: **nunca abrir el .lst entero en memoria ni en Excel, nunca subir el crudo a Supabase.** Se lee en streaming desde el ZIP y se escriben dos CSV comprimidos por mes:

- `impo_items_AAAAMM.csv.gz` — una fila por ítem (columnas 0-13, deduplicadas). Agosto: 530.186 filas, 7,8 MB.
- `impo_impuestos_AAAAMM.csv.gz` — una fila por ítem y concepto (periodo, destinacion, num_item, concepto, monto). Agosto: 7,8 M filas, 46 MB. **No se carga**: `scripts/arca/cargar.mjs` lo lee sólo para deducir IVA y estadística por NCM (ver sección 4) y lo descarta. No borrarlo de `out\`: `cargar.mjs tasas` lo vuelve a leer para recalcular.

El script corre en ~1 minuto por mes con Python 3 sin dependencias. Está probado con 202608.zip. Está en `scripts/arca/arca_transform.py` y se usa tal cual; lo que haga falta de más se hace en la carga.

---

## 3. Flujo de archivos con Fer (para gastar pocos tokens)

1. Fer baja los ZIP a `C:\Laucen\arca\raw\` con el nombre original `AAAAMM.zip` (el script saca el período del nombre).
2. Esa carpeta y `C:\Laucen\arca\out\` van al `.gitignore`. Nada de esto entra al repo.
3. Code corre `python arca_transform.py C:\Laucen\arca\raw\AAAAMM.zip C:\Laucen\arca\out\` por cada mes (o un `for` sobre todos los ZIP). Lee solo la línea de resumen que imprime el script. **No hacer `cat`, `head`, `type` ni abrir los .lst ni los .csv.gz** salvo las 3 primeras líneas para verificar formato.
4. Carga a Supabase con `COPY` vía el cliente de Postgres en streaming (`scripts/arca/cargar.mjs`), mes por mes, en transacción. Paso a paso en `scripts/arca/LEEME.md`. Nunca por la interfaz web ni por inserts fila a fila.
5. Registrar en una tabla `arca_cargas` qué período se cargó, cuándo, cuántos ítems y cuántas combinaciones ítem × concepto había (sólo informativo), para no cargar dos veces y para saber qué falta.

---

## 4. Esquema propuesto en Supabase

Fer pasa a **plan Pro (USD 25/mes)** antes de la carga: el plan gratis tiene 500 MB y se pausa tras una semana sin uso; Pro incluye 8 GB (verificado en la página de precios el 25/09/2026). Estimación: todos los países, ~6,4 M ítems/año → 300–500 MB/año con índices en `arca_impo_items`; sin montos de impuestos. **Medido con agosto 2026 (26/09): ~150 MB por mes (ítems 109 MB + resúmenes ~38 MB) → ~1,8 GB por año, ~18 GB los 10 años.** La estimación anterior de "~100 MB/año" estaba mal.

```sql
create table arca_impo_items (
  periodo          char(6)  not null,        -- AAAAMM
  aduana           text     not null,
  destinacion      text     not null,
  num_item         int      not null,
  importador       text     not null,        -- 30 caracteres, tal cual viene
  transporte       text,                     -- código crudo ('2','4','8','', ...)
  unidad           text,
  cantidad         numeric,
  fob_item         numeric,                  -- USD
  fob_total        numeric,                  -- USD, de la destinación
  divisa           text,
  pais_origen      text,                     -- código crudo
  pais_procedencia text,
  ncm              text collate "C" not null, -- '8516.29.00'
  primary key (destinacion, num_item)
);
create index on arca_impo_items (ncm, periodo);
create index on arca_impo_items (importador);
create index on arca_impo_items (pais_origen, periodo);
create index on arca_impo_items (periodo);

create table arca_cargas (
  periodo char(6) primary key,
  cargado_en timestamptz default now(),
  filas_crudas bigint, items bigint, filas_impuestos bigint
);
```

**Impuestos (decidido por Fer el 25/09):** no se guarda ningún monto de impuestos por despacho. Lo que le importa a Fer es **cuánto paga hoy** una posición, importando desde fuera del Mercosur: **arancel** (del nomenclador vigente, columna 3 = derecho de importación extrazona), **IVA** y **tasa de estadística**. IVA y estadística no están en el nomenclador: se **deducen por NCM** de los despachos (conceptos 010 = derechos, 061 = estadística, 415 = IVA, confirmados por Fer). Por ítem: CIF = derechos / arancel; estadística % = estadística / CIF; IVA % = IVA / (CIF + derechos + estadística). Se guarda sólo cuántos ítems pagaron cada tasa por NCM y mes (`agg_tasas_mes`); la vista `ncm_tasas` da la que más se repite en los últimos 12 meses cargados. Lo que pagó cada competidor (`derechos_pct_efectivo`) se sacó: no le sirve a Fer.

### Tablas de referencia

```sql
create table ref_pais       (codigo text primary key, nombre text);
create table ref_transporte (codigo text primary key, nombre text);
create table ref_aduana     (codigo text primary key, nombre text);
create table ref_unidad     (codigo text primary key, nombre text);
create table ref_concepto   (codigo text primary key, nombre text);
create table ref_ncm (
  codigo       text primary key,   -- '8516.29.00' (8 dígitos) o apertura SIM
  nivel        int,                -- 1 partida, 2 ncm 8 dígitos, 3+ aperturas SIM
  padre        text,
  descripcion  text,
  descripcion_completa text,       -- concatenación de los ancestros (como muestra Softrade)
  unidad       text,
  uso_economico text,              -- futuro: consumo / intermedio / capital (INDEC o BEC)
  rubro_ml     text[]              -- futuro: etiquetas de rubro estilo ML
);
```

**Valores confirmados para cargar ya:**

- `ref_transporte`: `2` = Aéreo, `4` = Terrestre, `8` = Marítimo (confirmado por el despachante de Fer). Códigos `''` (vacío, 118.409 ítems en agosto, el tercer grupo), `1`, `3`, `7`, `9`, `A`, `M`: dejar el código crudo y nombre `NULL`; Fer está preguntando qué es el vacío.
- `ref_pais` (de las tablas Malvina, fuente no oficial pero consistente con los volúmenes): `310` China, `203` Brasil, `212` Estados Unidos, `438` Alemania, `313` Taiwan, `309` Corea Republicana, `308` Corea Democrática, `436` Turquía. El resto: código crudo y nombre `NULL` hasta conseguir la tabla completa. **Nunca inventar nombres.** El panel debe mostrar el código cuando no hay nombre.
- `ref_concepto` (visto en Softrade, que decodifica los mismos datos de ARCA): `415` IVA, `429` Ingresos Brutos, `450` Ciudad Autónoma de Bs. As., `422` IVA adicional, `424` Impuesto a las Ganancias. `010` y `061` figuran como "no disponible" en Softrade (probablemente derechos de importación y tasa estadística, **sin verificar**). Resto: crudo.
- `ref_ncm`: se carga desde el `arancel.zip` (ver sección 5).

---

## 5. Nomenclador NCM (archivo `arancel.zip`, verificado)

- Origen: link "Nomenclatura Común del Mercosur" en la misma página de ARCA → Arancel Integrado. Fer ya lo bajó (25/09/2026) y lo deja en `C:\Laucen\arca\ref\arancel.zip`.
- Contiene `nomenclador_AAAAMMDD.txt` (47.507 líneas), `capitulo_AAAAMMDD.txt` (97 líneas, notas legales) y `sufijos_AAAAMMDD.txt` (49.224 líneas, sufijos de valor: **sí se carga**, ver 5.1; es el diccionario de las marcas y atributos que trae Softrade).
- Formato del nomenclador: latin-1, separador `@`. Ejemplo de líneas:

```
2@85.16           @      @      @      @      @      @      @  @  @CALENTADORES ELECTRICOS DE AGUA ...
2@8516.29.00      @      @      @      @      @      @      @  @  @--Los demas
2@8516.29.00.100A @000.00@008.00@020.00@008.00@000.00@      @07@  @      Radiadores de circulacion de aceite
2@8516.29.00.230Q @000.00@008.00@020.00@008.00@000.00@      @07@  @       Con resistencia ceramica, incluso de coeficiente termico positivo (PTC)
```

- Columna 1 = código (partida `85.16`, NCM 8 dígitos `8516.29.00`, aperturas SIM de 11 dígitos + letra). **Columnas 2-7 = seis alícuotas**, según el diseño oficial de ARCA ("Consulta Arancel Integrado / Sufijos de Valor", DI PHSI): derecho de exportación, reintegro extrazona, **derecho de importación extrazona (el arancel para China, `alic_3`)**, reintegro intrazona, derecho de importación intrazona (Mercosur), derecho de importación específico mínimo. Columna 8 = unidad estadística, 9 = unidad de derecho específico. Los nombres están en `ref_alicuota`. Última columna = descripción, **indentada con espacios según el nivel jerárquico** (usar la cantidad de espacios iniciales y los guiones `-`/`--` para reconstruir padre/hijo). La fecha del nombre del archivo viene DDMMAAAA (`nomenclador_25092026.txt`).
- Los despachos usan NCM a 8 dígitos. Para el join basta `ref_ncm.codigo = arca_impo_items.ncm`. Las aperturas SIM se cargan igual para tener descripciones más finas y futuro uso.
- **Versiones:** `ref_ncm` lleva `vigencia` (la fecha del nombre del archivo, ej. `nomenclador_20260925.txt` → 25/09/2026) y la clave es (`codigo`, `vigencia`). Una carga nueva de `arancel.zip` crea una versión nueva sin pisar la anterior; el panel usa la vista `ref_ncm_vigente` (la última). `ref_ncm` es la fuente de los porcentajes vigentes.
- Armar `descripcion_completa` concatenando la descripción de la partida + subpartidas + la propia (es lo que hace Softrade y hace legible una NCM "Los demás").

### 5.1 Sufijos de valor (`sufijos_AAAAMMDD.txt`, verificado)

Formato: latin-1, separador `@`, 5 columnas: `3 @ posición @ código de sufijo @ norma @ descripción`. La posición puede ser un capítulo (`02`), una partida (`03.03`) o una apertura SIM (`9403.20.90.220`). Ejemplos reales:

```
3@02@AA@IG 11@MARCA
3@03.03@AI@IG 11@CODIGO DE PRODUCTO O ARTICULO
3@9403.20.90.220@NA01@R.@DE 1 PLAZA.
3@9403.20.90.220@NA02@R.@DE 2 PLAZAS.
3@9403.20.90.220@NB01@R.@REBATIBLES.
3@9403.20.90.220@NC01@R.@CON DISPOSITIVO DE ELEVACION.
```

```sql
create table ref_sufijo (
  posicion    text not null,   -- '02', '03.03', '9403.20.90.220' (tal cual viene)
  codigo      text not null,   -- 'AA', 'AI', 'NA01', 'NB01', ...
  norma       text,
  descripcion text,
  primary key (posicion, codigo)
);
```

Significado ya verificado: `AA` = MARCA, `AI` = CÓDIGO DE PRODUCTO O ARTÍCULO. Los `NA..`/`NB..`/`NC..` son atributos definidos por posición; `..00` = no aplica. Existe también `AB(...)` en los datos de Softrade: buscar su definición en este archivo y no asumirla.

---

## 6. Tablas resumen (para que el panel sea rápido en la instancia Micro)

Recalcular al terminar cada carga mensual:

- `agg_ncm_pais_mes` (ncm, pais_origen, transporte, periodo → items, fob, cantidad, importadores_distintos).
- `agg_ncm_importador_mes` (ncm, importador, periodo → items, fob, cantidad).
- `agg_importador_mes` (importador, periodo → items, fob, ncm_distintas).

Las consultas del panel van contra estas tablas; el detalle fila a fila se consulta solo cuando el usuario abre un ítem o exporta.

---

## 7. Panel "Importaciones" (segunda etapa, pero diseñar la base para esto)

Filtros combinables: rango de períodos, NCM (uno, varios, prefijo de capítulo, o un **rubro guardado**), país de origen, país de procedencia, medio de transporte, importador (búsqueda por texto), aduana, rango de FOB unitario, rango de cantidad.

Salidas:
- Tabla de ítems con todo decodificado (nombres, no códigos) y FOB unitario calculado. Juntos: FOB (ARCA), CIF + kg cuando hay Softrade, derechos pagados en % del FOB y las alícuotas vigentes del nomenclador. Sin montos de impuestos. Lo mismo en la ficha de NCM.
- Ranking de importadores para el filtro elegido: FOB, cantidad, ítems, **% sobre el total del filtro**, transporte predominante.
- Serie mensual: FOB, cantidad, ítems, cantidad de importadores, por transporte (marítimo vs aéreo vs terrestre vs vacío).
- Ranking de NCM dentro del filtro.
- Ranking de países de origen dentro del filtro.
- Exportar a CSV.

**Rubros guardados:** tabla `rubros` (id, nombre) y `rubro_ncm` (rubro_id, ncm). Fer los arma desde el panel: buscar en `ref_ncm` por texto, tildar posiciones, guardar. Además, desde la ficha de un importador, botón "ver todas sus NCM" con opción de agregarlas a un rubro (mapeo inverso: lo que importa un competidor conocido define el rubro en la práctica).

Sin mails, sin notificaciones.

### 7.1 Consultas de descubrimiento (parte del panel, prioridad alta)

Son las preguntas que solo se pueden responder con todo el universo cargado (Softrade no puede: hay que saber qué buscar y exporta de a ~9.000 filas). Cada una es una pantalla simple: 2–3 parámetros y una tabla ordenable, con link a la ficha de la NCM y del importador.

1. **NCM que crecen:** para un país de origen (default China) y un transporte (default marítimo), ranking de NCM por variación de FOB y de cantidad entre dos períodos (ej. últimos 12 meses vs los 12 anteriores). Filtros: capítulo/prefijo, FOB mínimo, cantidad mínima de importadores.
2. **Importadores nuevos:** importadores que aparecen en el período elegido y no existían en los N meses anteriores, con sus NCM y FOB. Sirve para detectar quién está entrando a un rubro.
3. **Pocos importadores, mucho FOB:** NCM cuyo FOB total supera un umbral y tienen ≤ N importadores distintos. Es la señal de nicho.
4. **Densidad marítimo / aéreo por NCM:** para cada NCM de origen China, % de ítems y de FOB que entra por marítimo vs aéreo vs terrestre vs vacío, y FOB unitario promedio por vía. Insumo directo del estudio de la "línea".
5. **Ficha de importador:** todo lo que importa un importador (NCM, país, vía, FOB, cantidad, serie mensual). Es el "mapeo inverso" para armar rubros.

---

## 7B. Softrade "Importaciones Detalladas" — tabla `softrade_detalle` y carga automática

Softrade (app.softrade.info, backend `PentaApi` = Penta-Transaction) es la plataforma a la que Fer accede con la cuenta de un amigo (Ariel). **Sin API** (la API de Penta cuesta USD 2.000/mes, descartada). Exporta Excel desde la interfaz; el tope de exportación está entre ~9.400 filas (anduvo) y ~17.300 (falló). Fer y Cowork bajan los Excel a mano y los dejan en `C:\Laucen\softrade\in\`. **Code no navega Softrade.**

### Qué trae cada Excel (verificado con `detalle_ARimportDetalladas_2026-8-5-131045.xlsx`)

Hoja `Detalle`, 36 columnas, encabezados exactos en la fila 1:

| Col | Encabezado | Nota |
|---|---|---|
| A | Identificador | mismo que `arca_impo_items.destinacion` |
| B | Item | mismo que `num_item` |
| C | Fecha | **día exacto** (datetime) |
| D | Tipo de Dato | 'DEFINITIVO' |
| E | NCM-SIM | 11 dígitos + letra, ej. `9403.20.90.990E` |
| F | Importador | **sin truncar** |
| G | Localidad | |
| H | Destinación | ej. 'CONSUMO' |
| I | Aduana | texto |
| J | Via Transporte | 'CAMION' / 'MARITIMA' / 'AEREA'… (texto) |
| K | País de Origen | texto |
| L | País de Procedencia | texto |
| M | U$S Unitario | |
| N | U$S FOB | del ítem |
| O | Flete U$S | |
| P | Seguro U$S | |
| Q | U$S CIF | |
| R | Cant. Estad. | |
| S | Un. Medida Estad. | |
| T | Cantidad | |
| U | Unidad de Medida | |
| V | Kgs. Netos | |
| W | Kgs. Brutos | |
| X | Derecho | USD |
| Y | % Dere. | |
| Z | Acuerdo ALADI | |
| AA | Item | **nº de subítem** (1..n) |
| AB | Marca - Sufijos | ej. 'MARCA: INTELBRAS' |
| AC | Cantidad | del subítem |
| AD | Unitario Divisa | del subítem |
| AE | FOB Divisa | del subítem |
| AF | Moneda Divisa | |
| AG | Condición de Venta | incoterm (FCA, FOB, CIF…) |
| AH | Marca o Descripcion | sufijos crudos: `AA(INTELBRAS)-AI(4770537 MRM 537)-NA00-NB00-NC00-\`` |
| AI | Descripcion Arancelaria | vino 'No disponible' en el ejemplo |
| AJ | Modelo | vino 'No disponible' en el ejemplo |

Hoja `Parámetros`: los filtros usados en la exportación (período, NCM-SIM, país). Guardarla como texto en `softrade_cargas.parametros`.

**Regla de subítems (verificado):** hay una fila por subítem. En las filas 2..n del mismo (Identificador, Item), las columnas de ítem (M a Z) vienen en **0** o 'No disponible'; solo la primera fila trae los valores del ítem. Los valores propios del subítem están en AA–AH. Al cargar: los campos de ítem se toman de la primera fila del grupo; nunca sumar M–Z entre subítems.

### Esquema

```sql
create table softrade_items (
  destinacion   text not null,
  num_item      int  not null,
  fecha         date,
  tipo_dato     text,
  ncm_sim       text,              -- 11 dígitos + letra
  importador    text,              -- completo
  localidad     text,
  destinacion_tipo text,
  aduana        text,
  via           text,
  pais_origen   text,
  pais_procedencia text,
  usd_unitario  numeric, usd_fob numeric, flete_usd numeric, seguro_usd numeric, usd_cif numeric,
  cant_estad    numeric, un_estad text, cantidad numeric, unidad text,
  kg_netos      numeric, kg_brutos numeric,
  derecho_usd   numeric, derecho_pct numeric, acuerdo_aladi text,
  cargado_de    text,              -- nombre del Excel
  primary key (destinacion, num_item)
);

create table softrade_subitems (
  destinacion   text not null,
  num_item      int  not null,
  num_subitem   int  not null,
  marca_texto   text,              -- col AB tal cual
  cantidad      numeric,
  unitario_divisa numeric,
  fob_divisa    numeric,
  moneda        text,
  incoterm      text,
  sufijos_raw   text,              -- col AH tal cual
  marca         text,              -- parseado de AA(...)
  codigo_articulo text,            -- parseado de AI(...)
  atributos     jsonb,             -- {"NA":"01","NB":"00","NC":"00", "AB":"..."} y cualquier otro par
  descripcion_arancelaria text,    -- col AI si no es 'No disponible'
  modelo        text,              -- col AJ si no es 'No disponible'
  primary key (destinacion, num_item, num_subitem)
);

create table softrade_cargas (
  archivo text primary key,
  cargado_en timestamptz default now(),
  parametros text,
  filas int, items int, subitems int
);
```

Relación con ARCA: `softrade_items (destinacion, num_item)` = `arca_impo_items (destinacion, num_item)`. Un ítem puede estar en ARCA y no en Softrade (lo normal) o en los dos. Nunca duplicar: Softrade enriquece, no reemplaza.

### Parser de sufijos (col AH)

Patrón: tokens separados por `-`, cada uno `XX(valor)` o `XXnn`. Reglas:
- `AA(valor)` → `marca` (normalizar espacios; `S/M` o vacío → `marca = 'S/M'`).
- `AI(valor)` → `codigo_articulo`.
- Cualquier otro `XX(valor)` → `atributos[XX] = valor` (ej. `AB`).
- `XXnn` (dos letras + dos dígitos) → `atributos[XX] = nn`.
- Ignorar el backtick final y tokens vacíos. Guardar siempre `sufijos_raw` sin tocar.
- La descripción de un atributo se resuelve con `ref_sufijo` por (posición SIM del ítem, `XX||nn`); si no hay match exacto, probar con la posición recortada (8 dígitos, partida, capítulo). No inventar.

### Carga automática

- Proceso (comando `node scripts/arca/cargar.mjs softrade`) que revisa `C:\Laucen\softrade\in\`, toma cada `.xlsx` que no esté en `softrade_cargas`, lo carga en transacción, lo registra y lo mueve a `C:\Laucen\softrade\done\`. Si falla, lo mueve a `error\` con un `.log` al lado.
- Si Fer exporta dos veces el mismo despacho (solapamiento de filtros), hacer **upsert** por clave primaria; no es error.
- Al terminar, refrescar una vista `v_items_enriquecidos` = `arca_impo_items` left join `softrade_items` left join (subitems agregados: cantidad de subítems, marcas distintas, códigos de artículo) para que el panel muestre marca/peso/CIF cuando existan.

### En el panel

- En cualquier tabla de ítems, columnas opcionales "Marca", "Cód. artículo", "Kg netos", "CIF", "Fecha exacta" que aparecen cuando el ítem tiene datos de Softrade; un ícono marca la fila como "enriquecida".
- Filtro por marca y por código de artículo (sobre `softrade_subitems`).
- Ficha de NCM y de importador: sección "Marcas vistas" con cantidad de subítems y FOB por marca.
- Indicador de cobertura: % de ítems del filtro actual que tienen datos de Softrade. Para que Fer sepa qué le falta exportar.

---

## 8. Orden de trabajo

1. Migraciones: tablas de datos, referencia, resumen, `arca_cargas`.
2. Cargar `ref_transporte`, `ref_pais` (parcial), `ref_concepto` (parcial) con los valores de la sección 4.
3. Cargar `ref_ncm` y `ref_sufijo` desde `arancel.zip`.
4. Correr `arca_transform.py` sobre **un solo mes** (202608, Fer ya lo tiene bajado) y cargarlo. Verificar contra estos números: 530.186 ítems, 64.863 despachos, 12.089 importadores; NCM `8516.29.00` con origen `310` debe dar 10 ítems y 7 importadores, y el despacho `26001IC04154138R` ítem 1 debe ser Importadora MCA, 230 unidades, FOB 8.178,75; el .lst trae filas de encabezado repetidas que la carga descarta (agosto: 2), así que ítems, despachos e importadores dan esa cantidad menos. Todo esto lo chequea `node scripts/arca/cargar.mjs verificar`.
5. Recalcular resumen. Una consulta de prueba desde la app.
6. Cargar el Excel de ejemplo de Softrade (`detalle_ARimportDetalladas_2026-8-5-131045.xlsx`, Fer lo deja en `C:\Laucen\softrade\in\`). Verificar: 158 filas → 93 ítems, 31 importadores; el ítem `26001IC03000924J` / 54 tiene 2 subítems, ambos marca INTELBRAS, códigos `4770537 MRM 537` y `4770029 COC 4038P`; el ítem `26008IC03000411H` / 11 tiene 15 subítems marca SACCARO. Cruzar con ARCA agosto: todos los identificadores del Excel deben existir en `arca_impo_items` con NCM `9403.20.90`. Después, `node scripts/arca/cargar.mjs alicuotas` para identificar la alícuota de derechos en el nomenclador.
7. Avisar a Fer. Recién después, el resto de los meses de ARCA en lote.
8. Consultas de descubrimiento (7.1).
9. Panel completo (7) con la capa Softrade (7B).

---

## 9. Fuera de alcance / no hacer

- No descargar los ZIP desde el entorno de Code.
- No inventar nombres de países, transportes, conceptos o unidades: código crudo hasta tener la tabla.
- No cargar `expo_*` por ahora.
- No navegar ni scrapear Softrade desde Code: los Excel llegan a la carpeta de entrada, nada más.
- Uso económico (insumo vs consumo) y etiquetado de rubros por IA: etapa posterior, dejar las columnas previstas en `ref_ncm`.

---

## 10. Pendientes que resuelve Fer

- Tabla oficial completa de códigos de país de ARCA/Malvina.
- Qué significa el transporte vacío (pregunta al despachante).
- Tabla NCM → uso económico (INDEC) o correspondencia HS→BEC (ONU).
- Bajar los meses de 2025-09 a 2026-07 (y luego años anteriores).
