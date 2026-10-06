---
titulo: Importaciones ARCA
menu: Sourcing › Importaciones ARCA
ruta: /importaciones
rutas: /importaciones, /importaciones/descubrir, /importaciones/rubros, /importaciones/cargas, /importaciones/depurar, /importaciones/ncm, /importaciones/importador
permiso: importaciones_ver
resumen: Buscador sobre todos los despachos de importación argentinos publicados por ARCA (desde 2017), enriquecidos con Softrade: rankings de importadores, NCM y países, serie mensual, ítem por ítem, consultas para descubrir oportunidades y rubros (grupos de NCM).
---

## Para qué sirve

ARCA publica gratis, mes a mes desde enero de 2017, el detalle de **cada ítem de cada despacho de importación** de la Argentina: importador, posición arancelaria (NCM), cantidad, valor FOB en dólares, país de origen, país de procedencia, aduana y medio de transporte. Esta pantalla carga todo eso y permite consultarlo con muchos filtros para responder preguntas como:

- ¿Quién importa tal producto, cuánto y desde dónde?
- ¿Qué posiciones vienen creciendo desde China?
- ¿Qué importa un competidor?
- ¿Cuánto paga hoy de arancel, IVA y tasa de estadística una posición?

Algunos ítems además tienen datos de **Softrade** (una plataforma de datos de aduana): marca, código de artículo, CIF, kilos netos, fecha exacta y el nombre completo del importador. Esos Excel se exportan a mano y se cargan aparte.

Es, junto con el [Radar](/radar), la base para decidir qué rubros y productos buscar en China.

## Cómo se llega

- Menú **Sourcing › Importaciones ARCA**.
- Arriba hay cuatro pestañas: **Buscar** ([/importaciones](/importaciones)), **Descubrir** ([/importaciones/descubrir](/importaciones/descubrir)), **Rubros** ([/importaciones/rubros](/importaciones/rubros)) y **Cargas** ([/importaciones/cargas](/importaciones/cargas)).
- La **ficha de una NCM** (/importaciones/ncm) se abre tocando cualquier código NCM subrayado; la **ficha de un importador** (/importaciones/importador) se abre tocando el nombre de un importador.
- **Depurar posiciones** (/importaciones/depurar) se abre desde la pestaña Cargas, con el botón **🧹 Depurar posiciones** (sólo lo ve Fer).
- Arriba a la izquierda, **← Panel** vuelve al panel.

Para entrar hace falta el permiso «Ver Importaciones»; sin él, el sistema te devuelve al panel. Crear, renombrar y borrar rubros, y agregarles o quitarles NCM, pide además «Armar rubros».

Si todavía no hay ningún mes cargado, todas las pestañas muestran "Todavía no hay meses de ARCA cargados" y el botón **Ver cargas**.

## Qué hay en la pantalla

### Pestaña Buscar

**Filtros** (se combinan entre sí; se aplican con **Buscar**; **Limpiar** los borra):
- **Desde** / **Hasta**: meses cargados (mm/aaaa).
- **NCM (una o varias, o prefijo: 85, 8516, 9403.20)**: separadas por espacio, coma o punto y coma.
- **Rubro**: uno de tus rubros guardados ("Ninguno" = sin filtro).
- **Importador (texto)**: parte del nombre.
- **País de origen** y **País de procedencia** ("Todos" o un país).
- **Transporte**: Marítimo, Aéreo, Terrestre, los códigos sin nombre ("(sin nombre)") o "(vacío)".
- **Aduana (código)**.
- **FOB unitario (USD)**: mín. y máx.
- **Cantidad**: mín. y máx.
- **Marca (Softrade)** y **Cód. artículo (Softrade)**.

Debajo del formulario, una línea dice el período, si la consulta sale "desde el resumen mensual" o "desde el detalle ítem por ítem (filtro fino: puede tardar más)" y, si hay algún filtro puesto y hay datos de Softrade, "Softrade cubre N de M ítems (X%)".

**Sub-pestañas** con cinco salidas para el mismo filtro:
- **Importadores**: Importador · FOB USD · % del total · Cantidad · Ítems · NCM (cuántas distintas) · Transporte principal.
- **NCM**: NCM · Descripción · FOB USD · % del total · Cantidad · Ítems · Importadores.
- **Países**: País de origen · FOB USD · % del total · Cantidad · Ítems · Importadores.
- **Serie mensual**: Mes · FOB USD (con una barrita proporcional) · Cantidad · Ítems · Importadores · FOB Marítimo · FOB Aéreo · FOB Terrestre · FOB Vacío · FOB otros.
- **Ítems**: el detalle despacho por despacho: ✦ (tiene datos de Softrade) · Mes · Despacho / ítem · Importador (con el nombre completo de Softrade abajo, si lo hay) · NCM · Origen · Transporte · Cantidad (con la unidad) · FOB USD · FOB unit. · Arancel hoy · IVA · Estadística. Si algún ítem tiene Softrade, se suman CIF USD, Kg netos, Marca, Cód. artículo y Fecha.

En Importadores y NCM, los títulos subrayados de las columnas ordenan la tabla (el elegido queda en negrita con ▼).

Arriba de cada tabla: "N en total." o "Se muestran 200 de N." y el botón **⬇ Exportar CSV**.

### Pestaña Descubrir

Cuatro consultas (sub-pestañas), cada una con sus parámetros y el botón **Consultar**:

- **NCM que crecen**: Hasta · Ventana (meses) · País de origen · Transporte · Capítulo / prefijo NCM · Rubro · FOB mínimo (USD) · Mín. importadores. Columnas: NCM · Descripción · FOB actual · FOB anterior · Diferencia USD · Var. FOB · Var. cantidad · Importadores ("N (antes M)"). La variación sale en verde ▲ o rojo ▼; "nuevo" si antes no había nada.
- **Importadores nuevos**: Desde · Hasta · Sin actividad en los N meses anteriores · País de origen · Capítulo / prefijo NCM · Rubro. Columnas: Importador · Desde (primer mes con despachos) · FOB USD · Ítems · Sus NCM principales.
- **Pocos importadores, mucho FOB**: Desde · Hasta · FOB total mínimo (USD) · Máx. importadores · País de origen · Capítulo / prefijo NCM · Rubro. Columnas: NCM · Descripción · FOB USD · Ítems · Importadores · El principal · Su %.
- **Marítimo / aéreo por NCM**: Desde · Hasta · País de origen · Capítulo / prefijo NCM · Rubro · FOB mínimo (USD). Columnas: NCM · Descripción · FOB USD · Ítems · y para Marítimo, Aéreo, Terrestre, Vacío y Otros: "% de ítems · % de FOB" y el FOB unitario promedio ("USD/u").

Si no hay resultados: "Nada para estos parámetros."

### Pestaña Rubros

Un **rubro** es un grupo de NCM con nombre (por ejemplo "Calefacción"), propio de tu organización, que después se usa como filtro en Buscar y en Descubrir.

- Columna izquierda, **Mis rubros**: botón **Nuevo rubro** arriba a la derecha; buscador **Buscar rubro** (busca mientras escribís, con la caja "Comienza por", por nombre, N.º o una NCM del rubro); la lista con el nombre, cuántas NCM tiene, el **lápiz** ✏️ (cambiar el nombre) y el **tacho** 🗑 (pregunta "¿Borrar?" **Sí** / **No**).
- Al elegir un rubro: su nombre, el botón **Buscar con este rubro** y la tabla de sus NCM (NCM · Descripción · tacho "¿Quitar?"). Nota al pie: "Una partida o prefijo (ej. 85.16) incluye todas las NCM que empiezan así."
- **Buscar en el nomenclador**: cuadro de texto ("ej. calentador, radiador, 8516.29") y botón **Buscar** (busca lo escrito tal cual, entero, en el código, la descripción, la descripción completa, el tipo y la unidad; con "?" separás condiciones que tienen que estar todas en el mismo dato y con "*" las que pueden estar en datos distintos). Muestra hasta 200 posiciones con una caja para tildar cada una (las que ya están en el rubro aparecen tildadas y bloqueadas). Abajo: **Agregar las tildadas a "rubro"** si hay un rubro elegido, o un campo **Nombre del rubro nuevo** y **Crear rubro con las tildadas** si no.

### Pestaña Cargas

- **Meses de ARCA cargados (N)**: Mes · Filas crudas · Ítems · Filas con concepto de impuesto · Cargado (fecha y hora). Debajo, desplegable **Faltan N meses (hasta mm/aaaa)** con los meses que faltan, agrupados por año ("todo el año" si falta entero).
- **Excel de Softrade cargados (N)**: Archivo · Filas · Ítems · Subítems · Filtros usados · Cargado.
- **Tablas de referencia**: cuántas posiciones tiene el nomenclador vigente, cuántas versiones del nomenclador hay cargadas, sufijos, cuántas NCM tienen IVA y estadística deducidos, cuántos países, transportes y conceptos tienen nombre, y el tamaño de la base.
- **Cómo se carga**: recordatorio de dónde se dejan los archivos en la PC de Fer.
- Sólo para Fer: "Sacar de la base los capítulos y partidas que no vas a estudiar." con el botón **🧹 Depurar posiciones**.

### Depurar posiciones (sólo Fer)

Lista de los capítulos del Sistema Armonizado (01 Animales vivos … 97 Arte y antigüedades), del que más registros tiene al que menos, cada uno con su caja para tildar, su nombre, el % de la base que representa y, si corresponde, la etiqueta **propuesta** con el motivo. El desplegable **Partidas (N)** abre las partidas del capítulo, cada una con su caja. Arriba dice qué % de la base se saca con lo tildado y cuándo se aplicó por última vez. Abajo, el botón **Guardar lo tildado**; **← Cargas** vuelve.

### Ficha de una NCM

- El código y su descripción completa (o "No está en el nomenclador (o todavía no se cargó).").
- **Desde** / **Hasta** y botón **Ver**; botón **Ver ítems en Buscar** (abre Buscar → Ítems con esa NCM).
- Tres recuadros:
  - **FOB del período (ARCA)**: "USD …" y cuántos ítems.
  - **Lo que paga hoy, importando desde fuera del Mercosur**: **Arancel** (del nomenclador, con su fecha de vigencia; un rango "18–35%" si las aperturas difieren), **IVA** ("deducido de X de Y despachos", o "por defecto: no se pudo deducir de los despachos — revisar" con un asterisco) y **Estadística** ("deducida de X de Y despachos" o "sin despachos para deducirla").
  - **CIF y kilos (Softrade)**: Ítems con Softrade · CIF USD · Kg netos · FOB por kg · CIF / FOB.
- Desplegable **Aperturas SIM y su arancel (N)**: Apertura · Descripción · Arancel.
- **Serie mensual**, **Importadores (N)** (los 50 primeros: Importador · FOB USD · % · Cantidad · Vía), **Países de origen** y **Marcas vistas (Softrade)** (Marca · Subítems · Ítems · FOB divisa · Moneda).

### Ficha de un importador

- El nombre tal como viene de ARCA, con la aclaración "ARCA trae el nombre cortado a 30 caracteres." y, si Softrade lo tiene, "Completo según Softrade: …".
- **Desde** / **Hasta**, **Ver** y **Ver ítems en Buscar**.
- **Serie mensual** de ese importador.
- **Sus NCM (N)**: NCM · Descripción · FOB USD · % · Cantidad · Ítems, con una caja para tildar cada una (todas vienen tildadas; sólo con «Armar rubros»). Abajo: el desplegable de rubros y **Agregar las tildadas a este rubro**, más **Crear otro rubro**; o, si no tenés ningún rubro, **Nombre del rubro nuevo** y **Crear rubro con las tildadas**.
- **Países de origen** y **Marcas vistas (Softrade)**.

## Cómo se hace

### Ver quién importa un producto
1. Entrá a **Buscar**.
2. En **NCM**, escribí la posición o un prefijo (por ejemplo "8516.29" o "8516").
3. Elegí **Desde** y **Hasta** y, si querés, **País de origen** (por ejemplo China).
4. Apretá **Buscar** y quedate en la sub-pestaña **Importadores**.
5. Tocá un importador para ver su ficha.

### Encontrar la NCM de un producto
1. Entrá a **Rubros** y usá **Buscar en el nomenclador** con una palabra ("calentador").
2. O en **Buscar**, filtrá por **Marca (Softrade)** o **Cód. artículo (Softrade)** y mirá la sub-pestaña **NCM**.

### Ver la evolución mes a mes
1. Poné el filtro en **Buscar**.
2. Elegí un rango amplio en **Desde** / **Hasta**.
3. Abrí la sub-pestaña **Serie mensual**.

### Exportar a Excel
1. Armá el filtro y elegí la sub-pestaña.
2. Apretá **⬇ Exportar CSV**. Se baja un archivo que abre bien el Excel en castellano, con todas las filas (no sólo las 200 de la pantalla).

### Armar un rubro desde el nomenclador
1. Entrá a **Rubros** y apretá **Nuevo rubro**; escribí el nombre y apretá **Crear**.
2. Con el rubro elegido, escribí en **Buscar en el nomenclador** y apretá **Buscar**.
3. Tildá las posiciones y apretá **Agregar las tildadas a "rubro"**.
4. Atajo: sin rubro elegido, buscá, tildá, escribí **Nombre del rubro nuevo** y apretá **Crear rubro con las tildadas**.

### Armar un rubro a partir de un competidor
1. Abrí la ficha del importador.
2. En **Sus NCM**, destildá las que no te interesan.
3. Elegí el rubro y apretá **Agregar las tildadas a este rubro** (o creá uno nuevo).

### Renombrar, borrar o limpiar un rubro
- Renombrar: lápiz ✏️ al lado del rubro → cambiá el nombre → **Guardar** (o **Cancelar**).
- Borrar: tacho 🗑 → **Sí**.
- Quitar una NCM: elegí el rubro → tacho de la NCM → **Sí**.

### Usar un rubro como filtro
- En la ficha del rubro, **Buscar con este rubro**; o elegilo en el desplegable **Rubro** de Buscar o de Descubrir.

### Buscar NCM que crecen desde China
1. **Descubrir → NCM que crecen**.
2. Por defecto compara los últimos 12 meses contra los 12 anteriores, origen China, transporte Marítimo.
3. Ajustá **Ventana (meses)**, **FOB mínimo** o **Mín. importadores** y apretá **Consultar**.
4. Ordená tocando **Diferencia USD**, **Var. FOB**, **Var. cantidad**, **FOB actual** o **Importadores**.

### Saber cuánto paga hoy una posición
1. Tocá la NCM en cualquier tabla.
2. Mirá el recuadro **Lo que paga hoy…**. Si el IVA tiene asterisco, es un 21 % puesto por defecto: revisalo.

### Ver qué meses están cargados
1. **Cargas** → **Meses de ARCA cargados** y el desplegable **Faltan N meses**.

### Depurar posiciones (Fer)
1. **Cargas** → **🧹 Depurar posiciones**.
2. Tildá lo que querés sacar (un capítulo entero o partidas sueltas).
3. Apretá **Guardar lo tildado**. Aparece "Guardado.". **Guardar no borra nada**: el borrado se hace después, cuando Fer lo pide.

## Criterios y reglas

**De dónde salen los datos.** Los ZIP mensuales de ARCA, el nomenclador NCM y los Excel de Softrade se bajan a mano y se cargan desde la PC de Fer con una sesión de Claude Code; la carga **no** se hace desde esta pantalla. ARCA publica con alrededor de un mes de atraso: la pestaña Cargas considera "último mes posible" el mes anterior al actual y cuenta como faltantes todos los meses desde enero de 2017 que no estén cargados.

**Un ítem = una línea de despacho.** ARCA repite cada ítem una vez por cada concepto de impuesto; el sistema lo guarda una sola vez (despacho + número de ítem). **No se guarda ningún monto de impuestos por despacho**: sólo se usan para deducir las tasas de cada NCM (ver más abajo).

**El nombre del importador** viene **cortado a 30 caracteres** por ARCA. Softrade, cuando cubre el ítem, trae el nombre completo.

**Período por defecto.** En Buscar, si no elegís meses, se usa sólo **el último mes cargado**. En las fichas de NCM e importador, los **últimos 12 meses cargados**.

**Cómo se interpreta el filtro de NCM.** Se pueden poner varias, separadas por espacio, coma o punto y coma, con o sin puntos ("85162900" es lo mismo que "8516.29.00"). Un código completo de 8 dígitos busca exacto; uno más corto busca **todas las NCM que empiezan así** (85 = todo el capítulo 85). Un rubro funciona igual: cada código del rubro, si es una partida o prefijo, incluye todo lo que empieza así.

**Importador (texto)** busca el texto en cualquier parte del nombre, sin distinguir mayúsculas. Desde una ficha de importador, en cambio, se filtra por el nombre exacto.

**Resumen o detalle.** Si el filtro usa sólo período, NCM, rubro, país de origen, transporte e importador, la consulta sale de un **resumen mensual** (rápido). Si usa país de procedencia, aduana, FOB unitario, cantidad, marca o código de artículo, sale del **detalle ítem por ítem** (más lento). La pantalla dice cuál usó.

**Cálculos de las tablas.**
- **% del total**: el FOB de esa fila sobre el FOB de **todas** las filas del filtro (no sólo las 200 visibles).
- **Transporte principal** / **Vía**: el medio por el que ese importador trajo más FOB.
- **FOB unit.**: FOB del ítem ÷ cantidad declarada.
- **Ítems**: cantidad de líneas de despacho.
- La sub-pestaña Ítems ordena por FOB de mayor a menor.
- Transportes con nombre confirmado: 8 = Marítimo, 2 = Aéreo, 4 = Terrestre. El código vacío es un grupo grande sin aclarar ("Vacío"); los demás códigos se muestran tal cual. Países y otros códigos sin nombre conocido se muestran con el código crudo: **nunca se inventa un nombre**.

**Topes.** En pantalla se muestran hasta 200 filas (Importadores, NCM, Ítems). El CSV baja hasta 100.000 filas, separado por punto y coma y con coma decimal, con el mismo filtro y orden que la pantalla. En Descubrir: 200 filas en "NCM que crecen" y 300 en las otras tres. En la búsqueda del nomenclador, 200 posiciones.

**Lo que paga hoy una NCM** (importando desde fuera del Mercosur):
- **Arancel**: el derecho de importación extrazona del **nomenclador vigente** (la última versión cargada). Si la NCM tiene aperturas SIM con aranceles distintos, se muestra el rango (mínimo–máximo). En la tabla de ítems, si Softrade trae la apertura exacta, se usa la de esa apertura.
- **IVA** y **tasa de estadística**: no están en el nomenclador; se **deducen de los despachos** de esa NCM. Por cada ítem: CIF = derechos ÷ arancel; estadística % = estadística ÷ CIF; IVA % = IVA ÷ (CIF + derechos + estadística). Sólo se usan ítems con arancel mayor que cero y un CIF creíble (entre 1 y 1,6 veces el FOB). Las tasas se redondean a 0,5; el IVA se lleva a la tasa legal más cercana (21 %, 10,5 % o 27 %) si está a 1,5 puntos o menos. Se queda la tasa **que más se repite en los últimos 12 meses cargados**, y se informa de cuántos despachos salió.
- Si el IVA no se puede deducir (arancel 0 o sin despachos), se muestra **21 % por defecto**, marcado con asterisco y "revisar" (decisión de Fer: 21 % es lo general; 10,5 % es para pocas posiciones como bienes de capital, notebooks o impresoras 3D).

**Softrade.** Los datos de Softrade se cruzan con ARCA por despacho e ítem. La marca ✦ indica que el ítem tiene Softrade. "FOB por kg" = FOB (de Softrade) ÷ kg netos; "CIF / FOB" = CIF ÷ FOB, ambos sobre los ítems que tienen CIF.

**Descubrir, consulta por consulta.**
- **NCM que crecen**: compara la ventana elegida (por defecto 12 meses, de 1 a 60, terminando en "Hasta") contra la misma cantidad de meses inmediatamente anteriores. Diferencia USD = FOB actual − FOB anterior; Var. FOB y Var. cantidad = actual ÷ anterior − 1. El **FOB mínimo** se aplica al FOB de la ventana actual; **Mín. importadores** cuenta importadores distintos en la ventana actual. Por defecto: origen China, transporte Marítimo, orden por Diferencia USD. Si el período anterior no está cargado, todo aparece como "nuevo".
- **Importadores nuevos**: importadores con despachos en el período (y con el filtro de país, prefijo o rubro) que **no importaron nada, de ningún rubro**, en los N meses anteriores al "Desde" (por defecto 12, de 1 a 120). Ordenados por FOB; "Sus NCM principales" son sus 5 NCM con más FOB. Si esos meses previos no están cargados, todos parecen nuevos.
- **Pocos importadores, mucho FOB**: NCM con FOB total del período mayor o igual al mínimo (por defecto USD 500.000) y con **como mucho** el máximo de importadores distintos (por defecto 3). Por defecto: últimos 12 meses cargados, origen China. "El principal" es el importador con más FOB y "Su %", su parte del FOB total.
- **Marítimo / aéreo por NCM**: para cada NCM, qué parte de los ítems y del FOB vino por cada vía, y el FOB unitario promedio por vía (FOB ÷ cantidad). Por defecto: últimos 12 meses, origen China, orden por FOB; tocando el título de una vía se ordena por la parte del FOB que vino por esa vía.

**Rubros.** Son de cada organización: cada uno ve y usa sólo los suyos. Un rubro necesita nombre ("El rubro necesita un nombre."). Agregar una NCM que ya está no la duplica. Borrar un rubro no borra nada de los despachos.

**Depurar posiciones.** Es una decisión global (vale para toda la base) y la toma sólo Fer. Viene marcada una propuesta, con su motivo. Tildar un capítulo saca todas sus partidas. Guardar sólo registra la decisión; el borrado efectivo se hace después, a pedido de Fer. Lo sacado deja de cargarse en las próximas cargas; si se cambia de idea, se vuelve a cargar desde los archivos.

## Preguntas frecuentes

**¿Por qué el nombre del importador aparece cortado?**
ARCA lo publica con 30 caracteres como máximo. Si el ítem tiene datos de Softrade, la ficha muestra el nombre completo.

**¿Por qué Buscar me muestra un solo mes?**
Sin elegir **Desde** y **Hasta**, toma el último mes cargado. Cambiá el rango y apretá **Buscar**.

**¿El IVA que muestra es seguro?**
Si dice "deducido de X de Y despachos", sale de lo que efectivamente se pagó. Si tiene asterisco y dice "por defecto", es un 21 % puesto hasta revisarlo.

**¿Qué es el transporte "Vacío"?**
Ítems que ARCA publica sin código de transporte. Todavía no se sabe qué significa; se muestra aparte.

**¿Por qué algunos países aparecen como un número?**
Porque todavía no se cargó el nombre de ese código. El sistema nunca inventa nombres.

**¿El CSV baja sólo lo que veo?**
Baja el mismo filtro y orden, pero todas las filas (hasta 100.000), no sólo las 200 de la pantalla.

**¿Puedo cargar un mes nuevo desde acá?**
No. La carga se hace desde la PC de Fer con los archivos descargados de ARCA; la pestaña Cargas sólo muestra qué hay y qué falta.

**¿Qué es un rubro y para qué sirve?**
Un grupo de NCM con nombre. Sirve para filtrar Buscar y Descubrir por un tema (por ejemplo "Calefacción") sin escribir cada código.

**¿Por qué no veo las cajas para tildar NCM en la ficha del importador?**
Hace falta el permiso «Armar rubros».

**¿Dónde busco el producto en China?**
La pantalla **Búsqueda en China** todavía no está hecha: figura como próximamente en el menú Sourcing.

## Relacionado

- [Radar](/radar): tendencias de búsqueda en Mercado Libre.
- [Rubros](/importaciones/rubros)
- [Descubrir](/importaciones/descubrir)
- [Cargas](/importaciones/cargas)
- [Despachos de importación](/compras/despachos): los despachos propios de la empresa (otra cosa: no son los datos públicos de ARCA).
