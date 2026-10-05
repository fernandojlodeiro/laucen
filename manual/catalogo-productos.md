---
titulo: Productos
menu: Catálogo › Productos
ruta: /catalogo/productos
rutas: /catalogo/productos, /catalogo/productos/[id]
permiso: productos_ver
resumen: El catálogo: cada producto con sus variaciones, kits, fotos, cucardas, costo de importación, precios, stock y publicaciones.
---

## Para qué sirve

Es el maestro de artículos. Cada producto tiene su ficha con todo lo que el sistema sabe de él: datos generales, costo de importación estimado, variaciones (color, talle…), atributos, fotos, cucardas, componentes si es un kit, precios en cada lista, stock por depósito y publicaciones en los canales.

El sistema trabaja en tres capas: **familia → producto → variación**. Todo lo que se vende, se mueve o se publica (stock, precios, publicaciones, líneas de pedido) va siempre contra una **variación**. Un producto simple o un kit tiene exactamente una variación, que el sistema crea solo (la "variación única"), con el mismo SKU que el producto; por eso se ve y se maneja como si fuera uno solo.

## Cómo se llega

- Menú **Catálogo › Productos**.
- El buscador de la barra de arriba ("Buscar producto, MLA, cliente, proveedor…") encuentra productos por SKU, título o código de barras y lleva a su ficha.
- Desde casi cualquier lista del sistema, tocando el SKU o el título de un producto (pedidos, stock, listas de precios, publicaciones, vincular con Mercado Libre…).
- Desde [Familias](/catalogo/familias): el nombre de la familia o el número de productos abre esta lista filtrada por esa familia (con sus subfamilias).
- Al crear un producto desde [Vincular con Mercado Libre](/catalogo/publicaciones/ml) ("Crear producto"), se abre su ficha.

## Qué hay en la pantalla

### La lista de productos

Arriba a la derecha:
- **Descargar Excel** con su desplegable de configuraciones ("Como en pantalla" o una guardada) y "Configurar…". Baja todas las filas que cumplen los filtros (tope 50.000), con muchas más columnas que la pantalla: marca, modelo, línea, costo FOB y su moneda, costo promedio y último costo en pesos, un **precio por cada lista de precios** (el precio de lista de hoy de la variación principal), código de barras, IVA, descuento, peso y medidas, garantía, condición, categoría de ML, stock mínimo, umbral de pausa, cantidad de fotos, dirección de la foto principal, descripción, fechas de alta y modificación.
- **+ Nuevo producto**: abre el formulario de alta debajo del título.

Filtros (filtran al momento, sin botón "Buscar"):
- Buscador **"Buscar por SKU, título, marca o código de barras"**. También encuentra un producto por el SKU o el código de barras de cualquiera de sus variaciones. Con la caja **"Comienza por"** tildada (viene así) busca al principio del texto; destildada, en cualquier parte. La X adentro del cuadro borra lo escrito.
- **Mostrar inactivos**: sin tildar, los productos inactivos no aparecen.
- **Estado**: Todos los estados / Activo / Pausado / Inactivo. Elegir "Inactivo" los muestra aunque no esté tildado "Mostrar inactivos".
- **Familia**: buscador de familias (tipeás parte del nombre o del camino, ej. "Electrónica › Componentes"). Incluye las subfamilias de la elegida.
- **Tipo**: Todos los tipos / Simple / Con variaciones / Kit.
- **Kits de Virtual Seller**: sólo los marcados como kit que vino de Virtual Seller y hay que armar a mano.
- **Sin publicar en ningún canal**: productos que no tienen ninguna publicación activa en ningún canal (ninguna cuenta de Mercado Libre ni la web). Los **No publicables** no aparecen.
- **No publicables**: sólo los marcados como No publicable (insumos o partes de otro, como la unidad "-U" que se vende sólo en pack).
- **Con stock y sin publicación activa en ML** y **De la web, sin fotos**: las dos alertas del [Tablero de Mercado Libre](/mercadolibre) (productos activos con stock que no se están vendiendo por ML; productos de la tienda web sin ninguna foto). Con el filtro **Con stock y sin publicación activa en ML**, cada fila tiene el botón **Buscar en ML**, que abre **Publicar en Mercado Libre** para ese producto. Los **No publicables** no aparecen en estas dos alertas.

Arriba de la tabla, el selector **Vista** ("Estándar" o una vista guardada) elige qué columnas se ven y en qué orden; la última elegida queda recordada.

Columnas de la vista Estándar (todas se ordenan tocando el título):
- **SKU base**: lleva a la ficha. Al lado, el 📷 abre las fotos (si no tiene fotos, no aparece).
- **Título**: lleva a la ficha. Si es un kit de Virtual Seller, muestra la marca "Kit VS"; si está marcado como No publicable, "No publicable"; si no, la marca **"ML n/5"**: en cuántas de las cuentas de Mercado Libre está publicado (verde si está en todas, amarillo si en algunas, gris si en ninguna).
- **Familia**: filtra la lista por esa familia.
- **Tipo**: filtra la lista por ese tipo.
- **Variaciones**: cuántas variaciones tiene (un producto simple cuenta 1, su variación única). Lleva a la ficha.
- **Publicaciones**: en cuántas cuentas de Mercado Libre distintas está publicado (0 a 5). Cuenta una cuenta si tiene ahí al menos una publicación **activa o pausada** de cualquiera de sus variaciones; no cuenta las cerradas, ni cuántas publicaciones tiene en la misma cuenta (cuotas, variaciones), ni la web. Se ordena tocando el título de la columna. Lleva a [Publicaciones](/catalogo/publicaciones) buscando ese SKU.
- **Disponible**: suma del disponible (lo que hay menos lo reservado) de todas sus variaciones en todos los depósitos activos. En rojo si es negativo. Lleva a [Consulta de stock](/stock/consulta) buscando ese SKU.
- **Estado**: Activo (verde), Pausado (amarillo), Inactivo (gris). Las filas de productos inactivos se ven atenuadas.

La lista es de a 50 filas, con el paginador abajo ("1–50 de …", Anterior / Siguiente). Sin elegir orden, va por título.

### La ficha del producto

Arriba a la izquierda, el camino "Catálogo › Productos › SKU". El título muestra el SKU base, el título y el estado; debajo, el tipo, la familia y la marca.

Arriba a la derecha (según la pestaña):
- **Lápiz** (en Datos, Costo y Cucardas): pasa a modo edición. En edición, en el mismo lugar quedan **Grabar** y **Cancelar**.
- **+ Nueva variación** (pestaña Variaciones, sólo si el tipo es "Con variaciones"), **+ Nuevo atributo** (Atributos), **+ Nuevo componente** (Componentes del kit).
- **Duplicar**: crea una copia del producto (ver "Duplicar un producto" más abajo).
- **Pasar a Inactivo** / **Volver a Activo**.
- **Tacho** para borrar el producto entero: pregunta ahí mismo "¿Borrar el producto entero?" Sí / No.

Pestañas (cada una muestra entre paréntesis cuántas cosas tiene):
- **Datos**
- **Costo**
- **Variaciones (n)**: el número no cuenta la variación única de un producto simple; un producto sin variaciones muestra "(0)".
- **Atributos (n)**
- **Fotos (n)**: las del producto más las propias de cada variación.
- **Cucardas (n)**: las que lleva el producto (no cuenta las que hereda de la familia).
- **Componentes del kit (n)**: sólo aparece si el tipo es Kit.
- **Precios (n)**: cuántos precios propios cargados tiene en listas activas.
- **Stock (n)**: el disponible total en depósitos activos.
- **Publicaciones (n)**

#### Pestaña Datos

Abre en modo vista (los datos en sus marcos, sin poder tocarlos). Con el lápiz se editan:
- **SKU base**, **Título**, **Familia** (buscador), **Marca**, **Tipo** (Simple / Con variaciones / Kit; ayuda: "A simple o kit, sólo con una variación."), **Estado** (Activo / Pausado / Inactivo).
- **Código de barras**: en un producto con variaciones dice "Va en cada variación."
- **Modelo**, **Línea**, **Garantía** (ej. "6 meses"), **Condición** (Sin indicar / Nuevo / Usado / Reacondicionado).
- **Costo FOB** con su moneda (USD o ARS). Debajo, en gris, el costo "Puesto en depósito: promedio … · último … — sale de compras" (o "Sin costo en depósito todavía (sale de compras)."). En un producto con variaciones dice "Va en cada variación."; en un kit no se carga: muestra la suma de sus componentes.
- Casilla **Kit en Virtual Seller (armar a mano)**.
- Casilla **Precio en dólares (los pesos siguen al tipo de cambio del día)**.
- **Peso (g)**, **Stock mínimo** ("Debajo de esto, avisa el panel."), **Largo (cm)**, **Ancho (cm)**, **Alto (cm)**.
- **Descuento %**: vacío hereda de la familia (la ayuda muestra cuánto heredaría y cuál rige).
- **Umbral de pausa**: vacío = el del canal o el general (la ayuda muestra el general).
- **IVA**: 21 %, 10,5 %, 27 %, 5 %, 2,5 % o 0 %. "Los precios se cargan con IVA; al facturar se discrimina con esta alícuota."
- **Descripción larga**, a todo lo ancho.

Debajo, en modo vista, un desplegable **Atributos de Mercado Libre** con la categoría de ML y los atributos que trajo la publicación. Es sólo para mirar.

#### Pestaña Costo

Arriba, la caja del costo de importación del producto (se edita con el lápiz): **NCM (posición arancelaria)**, **Vía** (Avión / Barco / Courier; "informativa por ahora"), **Flete % (sobre FOB)** y **Seguro % (sobre FOB)**; el bloque "Se suman al costo (sobre CIF)": **Derecho de importación %**, **Tasa de estadística %**, **Arancel / otros %**, **Despachante %**, **Depósito fiscal y otros %**; y el bloque "Crédito fiscal y anticipos (no son costo; sobre CIF + derechos + estadística)": **IVA %**, **IVA adicional %**, **Percepción de ganancias %**, **Ingresos brutos %**. Además **Notas**.

En vista, cada valor muestra de dónde sale cuando no es propio: "de la categoría Notebooks", "general". En edición, cada campo vacío dice qué heredaría ("Vacío = hereda: 1,0 % (general).").

Debajo, la tabla **Costo estimado puesto en depósito**, una fila por variación: FOB, Flete y seguro, CIF, Derechos y tasas, Despachante y depósito, **Costo estimado**, Crédito fiscal (aparte), Último costo real y Costo promedio (estos dos salen de las facturas de compra y los despachos). Si falta el flete, avisa: "Falta el flete: cargalo acá, en la categoría del producto (Familias) o en los valores generales."

Al pie, la caja **Valores generales de importación** con su propio lápiz (la misma que en [Familias](/catalogo/familias)).

#### Pestaña Variaciones

- Si el producto no tiene variaciones: "Este producto no tiene variaciones: se maneja como uno solo (el SKU, el stock y el precio son los del producto)." Si es simple o kit, agrega que para tener variaciones hay que cambiar el tipo a «Con variaciones» en Datos.
- Si tiene variaciones, una tabla: SKU, Código de barras, Atributos, Título (en gris el armado solo), Descuento (en gris si es heredado), Costo FOB (en un kit, la suma de sus componentes), Estado (Activa / Pausada / Inactiva), lápiz y tacho.
- El lápiz convierte la fila en sus campos: **SKU**, **Código de barras**, **Atributos (nombre=valor; …)**, **Título propio (vacío = el del producto + atributos)**, **Descuento % (vacío = hereda)**, **Estado**, **Costo FOB** con moneda; botones **Guardar** y **Cancelar**.

#### Pestaña Atributos

Datos libres del producto (material, origen…): Nombre, Valor y Orden, con lápiz y tacho por fila. Los atributos de cada variación (color, talle) van en Variaciones, no acá.

#### Pestaña Fotos

- Caja **Fotos del producto** con el botón **📷 Subir fotos** (se pueden elegir varias a la vez). La primera foto es la principal.
- En un producto con variaciones, una caja por variación con **📷 Fotos propias**. Si una variación no tiene fotos propias, "usa las del producto".
- Cada foto tiene ◀ / ▶ para moverla un lugar antes o después y un tacho para borrarla.

#### Pestaña Cucardas

La tabla de cucardas activas (y las archivadas que el producto ya tenga): **Lleva** (caja para tildar), la cucarda con su color, **Desde** y **Hasta**. Se cambia con el lápiz y se graba con "Grabar". Si no hay cucardas creadas, avisa que se crean en [Cucardas](/catalogo/cucardas).

#### Pestaña Componentes del kit

- Tabla: SKU del componente (lleva a su ficha), Componente, Cantidad, Disponible; lápiz para cambiar la cantidad y tacho ("¿Sacar?").
- **+ Nuevo componente**: SKU del componente y cantidad, botón **Agregar componente**.
- Caja **Stock del kit por depósito**: cuántos kits completos se pueden armar en cada depósito activo.

#### Pestaña Precios

Una tabla por cada lista de precios activa: Variación, **Lista** (tachado si hay descuento), **Descuento**, **Venta**, **Desde** ("dd/mm/aaaa · cargado en ARS/USD"). El lápiz de la fila deja cargar un **Precio de lista nuevo** con su moneda. Los importes se ven en la moneda que elegiste arriba con el interruptor $ / US$.

#### Pestaña Stock

Disponible (lo que hay menos lo reservado) de cada variación en cada depósito activo, y el **Total** (en rojo si está debajo del stock mínimo). **Ver detalle** lleva a [Consulta de stock](/stock/consulta) de esa variación.

#### Pestaña Publicaciones

Arriba, un interruptor por cada web: **"Publicado en Web minorista"** y **"Publicado en Web mayorista"** (la web es un canal más). Prendido, el producto se ve en esa tienda (si tiene precio en la lista del canal); apagado, no. Prenderlo publica todas sus variaciones activas en ese canal; apagarlo las deja pausadas. No toca Mercado Libre.

Debajo, las publicaciones de las variaciones de este producto en cada canal (también las de la web, sin id externo): Canal, Variación, Id externo, Título, Tipo, Precio (con el tachado si está en campaña), Estado (y debajo, el estado en ML), Stock en ML, Última sincronización. En las de Mercado Libre, el **Id externo** (con "↗") y el **Título** abren la publicación en Mercado Libre, en otra pestaña. El botón **Ir a Publicaciones** lleva a [Publicaciones](/catalogo/publicaciones), y **Publicar en ML copiando otra** abre la pantalla para publicarlo en Mercado Libre (en el catálogo o copiando una publicación tuya).

Arriba de todo, el interruptor **No publicable (insumo o parte de otro)**: prendido, el producto no va a Mercado Libre ni a la web (sale de las tiendas y no se puede volver a prender "Publicado en Web"), no aparece en las alertas de "sin publicar" del tablero ni en esos filtros, y la ficha muestra la marca "No publicable" junto al título. Sus publicaciones de Mercado Libre, si tiene, no se tocan.

## Cómo se hace

### Crear un producto

1. En [Productos](/catalogo/productos), apretá **+ Nuevo producto**.
2. Completá **SKU base** y **Título** (obligatorios), elegí el **Tipo** (Simple, Con variaciones o Kit) y, si querés, la **Familia**.
3. Apretá **Crear**. Se abre la ficha con el aviso "Producto creado. Completá la ficha."
4. Completá el resto en la pestaña Datos (lápiz → Grabar).

Si falta el SKU o el título: "El producto necesita SKU base y título." El SKU base no se puede repetir dentro de la empresa.

### Editar los datos de un producto

1. Abrí la ficha y quedate en **Datos**.
2. Apretá el **lápiz** de arriba a la derecha.
3. Cambiá lo que haga falta y apretá **Grabar** (arriba a la derecha). **Cancelar** vuelve a la vista sin grabar.
4. Si grabó bien vuelve a la vista con "Guardado."; si hay un error, queda en edición con el motivo.

Errores típicos: "El descuento va de 0 a 100 %.", "El costo FOB no puede ser negativo.", y si querés pasar a Simple o Kit un producto que tiene más de una variación, el sistema no te deja (primero hay que borrar las variaciones que sobran).

### Agregar variaciones (color, talle…)

1. En Datos, cambiá el **Tipo** a **Con variaciones** y grabá. La variación única que tenía queda como una variación más.
2. En la pestaña **Variaciones**, apretá **+ Nueva variación**.
3. Cargá **SKU** (obligatorio), **Código de barras**, **Atributos** con el formato `color=rojo; talle=M` y, si querés, un **Título propio**.
4. Apretá **Agregar variación**.
5. Para completar su costo FOB, descuento o estado, usá el lápiz de su fila.

Errores típicos: "El atributo "…" va como nombre=valor (ej. color=rojo).", "El atributo "…" está dos veces.", "La variación necesita un SKU.", "Sólo un producto con variaciones puede tener más de una. Cambiá el tipo en Datos."

### Borrar una variación

Con el tacho de su fila, respondiendo **Sí**. Sólo se puede en un producto con variaciones que tenga más de una; la última no se borra ("Es la única variación del producto: no se puede borrar.").

### Armar un kit

1. Creá el producto con **Tipo** = **Kit** (o cambiá el tipo en Datos).
2. Entrá a la pestaña **Componentes del kit** y apretá **+ Nuevo componente**.
3. Escribí el **SKU del componente** (el de la variación) y la cantidad, y apretá **Agregar componente**.
4. Repetí con cada componente. Para cambiar una cantidad, lápiz de la fila → **Guardar**; para sacar uno, tacho → **Sí**.

Errores típicos: "No hay ninguna variación con el SKU "…".", "Un kit no puede llevarse a sí mismo.", "Ese componente es un kit que ya lleva a éste adentro: quedaría en círculo.", "La cantidad tiene que ser 1 o más.", "Este producto no es un kit. Cambiá el tipo en Datos."

### Subir fotos

1. Pestaña **Fotos** → **📷 Subir fotos** (o **📷 Fotos propias** en la caja de una variación).
2. Elegí una o varias imágenes. Mientras sube muestra "Subiendo 1 de 3…".
3. Para cambiar el orden usá ◀ / ▶; la primera es la principal. Para borrar, tacho → **Sí**.

Si elegís algo que no es una imagen: "Eso no es una imagen."

### Ponerle cucardas a un producto

1. Pestaña **Cucardas** → **lápiz**.
2. Tildá en **Lleva** las que correspondan y, si querés que rijan un tiempo, completá **Desde** y/o **Hasta**.
3. Apretá **Grabar**.

Si el "hasta" es anterior al "desde": "Una cucarda tiene el "hasta" antes del "desde"."

### Cargar el costo de importación

1. Pestaña **Costo** → **lápiz**.
2. Completá sólo lo que sea propio de este producto (NCM, alícuotas, flete…). Lo que dejes vacío lo hereda de su familia o de los valores generales.
3. **Grabar**. Mirá abajo la tabla "Costo estimado puesto en depósito".
4. El FOB no se carga acá: va en Datos (producto simple) o en cada variación.

### Cargar o cambiar un precio desde la ficha

1. Pestaña **Precios**, en la lista que corresponda, lápiz de la variación.
2. Escribí el **Precio de lista nuevo**, elegí la moneda y apretá **Guardar**. Rige desde hoy.

Si no hay tipo de cambio cargado para pasar a la otra moneda, avisa que lo cargues en [Tipo de cambio](/config/tipo-cambio).

### Duplicar un producto

Sirve para cargar un producto parecido a uno que ya existe (por ejemplo otra notebook): en la ficha, botón **Duplicar** (arriba a la derecha, al lado de "Pasar a Inactivo"). El sistema crea la copia y abre su ficha **en edición**, con el aviso "Copia creada, pausada". Después cambiás el SKU y lo que haga falta (título, atributos, fotos, precio…) y apretás **Grabar**.

- **La copia trae**: los datos de la ficha (descripción, familia, marca, medidas, garantía, categoría de Mercado Libre y sus atributos, planes de cuotas, IVA…), las variaciones con sus atributos y fotos, las fotos del producto, los atributos, las cucardas, el costo de importación, los componentes si es un kit y el **precio de hoy** de cada lista.
- **La copia no trae**: el stock (arranca en cero), el código de barras, los costos reales de compra (último y promedio), las publicaciones de la web y de Mercado Libre, ni las reglas de precio de ML. Eso se arma para el producto nuevo.
- **El SKU** de la copia es el del original más "-COPIA" ("-COPIA2" si ya había una). Las variaciones que empiezan con el SKU del original conservan el resto ("ABC-ROJO" pasa a "ABC-COPIA-ROJO"). Se cambia desde Datos como cualquier SKU.
- **Queda Pausada**: no se publica en ningún lado hasta que le pongas **Estado: Activo** en Datos.
- Las fotos copiadas son las mismas imágenes que las del original: si borrás una foto de la copia, la del original sigue ahí.

### Pasar un producto a Inactivo (o volver a Activo)

En la ficha, botón **Pasar a Inactivo** (arriba a la derecha). Avisa "Pasó a Inactivo: ya no aparece en los listados." Para revertirlo, **Volver a Activo**. También se puede cambiar el **Estado** desde Datos.

### Borrar un producto

Tacho de arriba a la derecha → "¿Borrar el producto entero?" → **Sí**. Se borra con sus variaciones, fotos, atributos, cucardas y precios. Si una de sus variaciones es componente de un kit, el sistema no deja borrarlo. Si sólo querés que no aparezca más, conviene **Pasar a Inactivo**.

## Criterios y reglas

**No publicable**
- Es para lo que no se vende solo: insumos o partes de otro producto, como la unidad "-U" que se vende sólo en pack. Se prende y apaga en la pestaña Publicaciones de la ficha.
- Al crearse esta marca (5/10) se prendió sola en todos los productos con SKU terminado en "-U" que no tenían ninguna publicación de Mercado Libre (ni vinculada ni con su SKU en ninguna cuenta, en ningún estado), y esos salieron de la web. Los "-U" que sí tienen alguna publicación quedaron como estaban: si tampoco se venden solos, prendé la marca a mano.

**Tipos de producto**
- **Simple**: una sola variación, creada sola con el SKU base y el código de barras del producto. Si cambiás el SKU base o el código de barras del producto, la variación única se actualiza sola.
- **Con variaciones**: varias variaciones, cada una con su SKU, código de barras, atributos, costo, descuento, estado y fotos propias. Al pasar de Simple/Kit a Con variaciones, la variación única queda como una variación más.
- **Kit**: un producto con una variación cuyo stock y costo salen de sus componentes.
- Un producto Simple o Kit no puede tener más de una variación: el sistema rechaza el cambio de tipo si tiene más.
- Si un kit deja de ser kit (cambiás el tipo), **sus componentes se borran** (si no, el stock se seguiría calculando desde ellos).

**Título de una variación**: el propio si lo tiene; si no, el título del producto + " — " + los valores de sus atributos separados por " / " (ej. "Remera — Rojo / M").

**Atributos de una variación**: se escriben `nombre=valor` separados por punto y coma (o uno por renglón). El nombre se guarda en minúsculas y no se puede repetir.

**Kits**
- Stock del kit en cada depósito = el menor de (disponible del componente ÷ cantidad que lleva), redondeado para abajo y nunca menos de 0. No se guarda: se calcula cada vez. Se admiten kits dentro de kits (hasta 5 niveles).
- Al mover stock de un kit (vender, ajustar), en realidad se mueve cada componente (cantidad × la del kit).
- Costo FOB del kit = suma de (costo FOB del componente × cantidad). Si los componentes tienen costos en monedas distintas, todo se pasa a dólares con el tipo de cambio del día; si no hay tipo de cambio, no se puede calcular. Si algún componente no tiene costo, avisa "Falta el costo FOB de …".
- Agregar un componente que ya estaba **suma** la cantidad a la existente. El componente se busca por SKU exacto (sin importar mayúsculas).
- Un kit no puede contenerse a sí mismo, ni directa ni indirectamente.
- "Kit en Virtual Seller (armar a mano)" es sólo una marca: la pone la importación de Virtual Seller cuando no pudo armar el kit sola (no encontró el SKU "-U" o el título no decía cuántas unidades). Sirve para filtrar y armarlos a mano.

**Descuento que rige para una variación** (el que convierte precio de lista en precio de venta): el de la variación → si está vacío, el del producto → si está vacío, el de su familia → si está vacío, el de la primera familia de más arriba que tenga uno → si no hay ninguno, 0 %. Va de 0 a 100 %.

**Umbral de pausa** (con ese disponible o menos, el canal pausa la publicación): el de la publicación → el del producto → el del canal → el general de la empresa → 1.

**Stock mínimo**: si el disponible total queda debajo, el total se pinta en rojo en la pestaña Stock y el panel avisa (sólo para productos activos y variaciones activas).

**Costo de importación estimado (sobre CIF)**, en la moneda del FOB:
- Flete = FOB × flete %. Seguro = FOB × seguro %.
- **CIF = FOB + flete + seguro.**
- Derechos, tasa de estadística y arancel/otros = CIF × su alícuota.
- Despachante = CIF × despachante % y depósito fiscal y otros = CIF × depósito % (de entrada 1 % + 2 % = 3 % del CIF).
- **Costo estimado = CIF + derechos + estadística + arancel/otros + despachante + depósito.**
- IVA, IVA adicional, percepción de ganancias e ingresos brutos se calculan sobre **CIF + derechos + estadística** y se muestran aparte como "Crédito fiscal": **no se suman al costo**.
- Lo que no está cargado en ningún nivel vale 0.
- El flete puede llegar hasta 500 % (flete aéreo caro); los demás porcentajes van de 0 a 100 %.
- La NCM se guarda sin espacios y en mayúsculas (máximo 20 caracteres).
- La vía (avión, barco, courier) es informativa por ahora: no cambia la cuenta.
- Es una **estimación**: el costo real (último y promedio) sale de las facturas de compra y los despachos de importación.

**Herencia del costo de importación**: cada valor (NCM, vía y cada porcentaje) se resuelve por separado. Si el producto tiene el suyo, rige ése; si no, el de su familia; si la familia no lo tiene, el de la familia padre, y así hacia arriba; si ninguna lo tiene, el valor general de la empresa. Los generales sólo existen para flete, vía, seguro, despachante y depósito, y de entrada valen: seguro 1 %, despachante 1 %, depósito fiscal y otros 2 % (flete y vía, sin valor). Por eso una alícuota como el derecho de importación o el IVA se carga en el producto o en su familia.

**Activo / Pausado / Inactivo**
- **Inactivo** no aparece en ningún listado ni buscador del panel salvo que se tilde "Mostrar inactivos" (o se filtre por estado Inactivo). Tampoco se vende en la tienda web.
- **Pausado** sigue apareciendo en los listados, pero no se muestra en la tienda web y no entra en el aviso de stock mínimo del panel.
- Lo mismo para las variaciones: sólo las **Activas** aparecen en la grilla de [Listas de precios](/catalogo/precios) y en la tienda.

**Precio en dólares**: si está tildado (en el producto), el precio se toma del importe en dólares y los pesos se recalculan **cada día** con el tipo de cambio de ese día, sin cargar precios nuevos. Si no hay tipo de cambio, quedan los pesos que se calcularon al cargar el precio. Ver [Listas de precios](/catalogo/precios).

**Precios**: un precio cargado rige desde hoy; si ya había uno cargado hoy en esa lista, lo pisa. La otra moneda se calcula con el tipo de cambio del día y queda fija. Precio de venta = precio de lista × (1 − descuento que rige).

**IVA**: sólo se aceptan las alícuotas de ARCA (21, 10,5, 27, 5, 2,5 y 0 %). Los precios se cargan con IVA incluido.

**Fotos**: la primera (la de orden más bajo) es la principal. Una variación sin fotos propias usa las del producto. Al borrar una foto también se borra el archivo guardado.

**Cucardas del producto**: sin fechas rigen siempre; con "Desde"/"Hasta", sólo esos días. Además, el producto hereda las cucardas de su familia y de las familias de más arriba. Se muestran en la tienda web (sólo las cucardas activas y vigentes hoy).

## Preguntas frecuentes

**¿Por qué mi producto dice "Variaciones (0)" si en la lista figura con 1?**
Porque un producto simple tiene una variación única que el sistema crea solo. La lista la cuenta; la pestaña no, porque no es una variación de verdad.

**¿Dónde cargo el costo FOB?**
En un producto simple, en Datos. En uno con variaciones, en cada variación (pestaña Variaciones, lápiz de la fila). En un kit no se carga: es la suma de sus componentes.

**¿Por qué no puedo cambiar el SKU de la variación de un producto simple?**
Porque lo manda el producto: cambiá el SKU base en Datos y la variación se actualiza sola.

**¿De dónde sale el stock de un kit?**
De sus componentes: cuántos kits completos se pueden armar en cada depósito. No se carga stock al kit.

**Dejé un porcentaje vacío en la pestaña Costo, ¿vale cero?**
No: hereda de la familia del producto, de las de más arriba o de los valores generales. Sólo vale cero si no está cargado en ningún nivel.

**¿El crédito fiscal se suma al costo?**
No. IVA, IVA adicional, percepción de ganancias e ingresos brutos se muestran aparte porque se recuperan.

**¿Qué diferencia hay entre Inactivo y borrar?**
Inactivo lo esconde de listados y buscadores pero conserva todo (podés volverlo a Activo). Borrar lo elimina con sus variaciones, fotos y precios, y no se puede deshacer.

**¿Cómo veo un producto inactivo?**
Tildá "Mostrar inactivos" en el buscador, o elegí Estado = Inactivo.

**¿Los cambios de la ficha se mandan solos a Mercado Libre?**
No desde esta pantalla. Lo que va a Mercado Libre se prepara en las pantallas de precios de ML y sale con un clic, por la cola de Mercado Libre.

## Relacionado

- [Familias](/catalogo/familias)
- [Listas de precios](/catalogo/precios)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Cucardas](/catalogo/cucardas)
- [Consulta de stock](/stock/consulta)
- [Tipo de cambio](/config/tipo-cambio)
- [Facturas de compra](/compras/facturas)
