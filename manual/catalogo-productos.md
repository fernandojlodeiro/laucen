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
- Buscador **"Buscar por SKU, título, marca o código de barras"**: busca en todos los datos de texto del producto (SKU, título, descripción, marca, código de barras, modelo, línea, garantía, condición, categoría de ML y número) y en el SKU, título, código de barras y número de cualquiera de sus variaciones. Con la caja **"Comienza por"** tildada (viene así) busca al principio del texto; destildada, en cualquier parte. Si con algo escrito ningún producto activo coincide pero sí alguno inactivo, se muestran los inactivos igual. La X adentro del cuadro borra lo escrito.
- **Mostrar inactivos**: sin tildar, los productos inactivos no aparecen.
- **Estado**: Todos los estados / Activo / Pausado / Inactivo. Elegir "Inactivo" los muestra aunque no esté tildado "Mostrar inactivos".
- **Familia**: buscador de familias (tipeás parte del nombre o del camino, ej. "Electrónica › Componentes"). Incluye las subfamilias de la elegida.
- **Marca**: desplegable con buscador (de [Marcas](/catalogo/marcas)); "Todas las marcas" saca el filtro.
- **Proveedor preferido**: desplegable con buscador (de [Proveedores](/compras/proveedores)); "Todos los proveedores" saca el filtro. La columna **Proveedor preferido** se puede sumar a la vista; tocando el nombre filtra por ese proveedor.
- **Tipo**: Todos los tipos / Simple / Con variaciones / Kit.
- **Precio de mercado**: Cualquier precio de mercado / Precio de mercado confirmado / Monitoreado sin confirmar / Sin seguimiento (ver «La marca del precio de mercado», más abajo).
- **Kits de Virtual Seller**: sólo los marcados como kit que vino de Virtual Seller y hay que armar a mano.
- **Sin publicar en ningún canal**: productos que no tienen ninguna publicación activa en ningún canal (ninguna cuenta de Mercado Libre ni la web). Los **No publicables** no aparecen.
- **Publicables**: sólo los que NO están marcados como No publicable (los no publicables ni se ven).
- **No publicables**: sólo los marcados como No publicable (insumos o partes de otro, como la unidad "-U" que se vende sólo en pack).
- **Cuentas de ML** (desplegable): en cuántas cuentas de Mercado Libre está publicado el producto: en ninguna, en 1, 2, 3, 4 o en todas. Cuenta igual que la columna **Publicaciones**: una publicación activa o pausada de cualquiera de sus variaciones, una vez por cuenta (las cerradas y la web no cuentan).
- **Con stock y sin publicación activa en ML** y **De la web, sin fotos**: las dos alertas del [Tablero de Mercado Libre](/mercadolibre) (productos activos con stock que no se están vendiendo por ML; productos de la tienda web sin ninguna foto). Con el filtro **Con stock y sin publicación activa en ML**, cada fila tiene el botón **Buscar en ML**, que abre **Publicar en Mercado Libre** para ese producto. Los **No publicables** no aparecen en estas dos alertas.

Arriba de la tabla, el selector **Vista** ("Estándar" o una vista guardada) elige qué columnas se ven y en qué orden; la última elegida queda recordada.

Columnas de la vista Estándar (todas se ordenan tocando el título):
- **SKU base**: lleva a la ficha. Al lado se ve la **foto principal** del producto (si no tiene fotos, no aparece); al tocarla se abren todas, del mismo tamaño; tocando una se ve grande (tocándola de nuevo, o con las flechas ◀ ▶ del teclado, se vuelve o se pasa a otra).
- **Título**: lleva a la ficha. Si es un kit de Virtual Seller, muestra la marca "Kit VS"; si está marcado como No publicable, "No publicable"; si no, la marca **"ML n/5"**: en cuántas de las cuentas de Mercado Libre está publicado (verde si está en todas, amarillo si en algunas, gris si en ninguna).
- **Familia**: filtra la lista por esa familia.
- **Tipo**: filtra la lista por ese tipo.
- **Variaciones**: cuántas variaciones tiene (un producto simple cuenta 1, su variación única). Lleva a la ficha.
- **Publicaciones**: en cuántas cuentas de Mercado Libre distintas está publicado (0 a 5). Cuenta una cuenta si tiene ahí al menos una publicación **activa o pausada** de cualquiera de sus variaciones; no cuenta las cerradas, ni cuántas publicaciones tiene en la misma cuenta (cuotas, variaciones), ni la web. Se ordena tocando el título de la columna. Lleva a [Publicaciones](/catalogo/publicaciones) buscando ese SKU.
- **Vendidos ML**: unidades vendidas en Mercado Libre, sumando lo que informa Mercado Libre de cada publicación del producto (todas las cuentas, también pausadas o cerradas; en una con variaciones, lo de cada variación). Sin ventas, 0. Se ordena tocando el título. Lleva a la pestaña Publicaciones de su ficha.
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
- **SKU base**, **Título**, **Familia** (buscador, con la lupa 🔍 al lado; ver abajo), **Marca** (desplegable con buscador, de la lista de [Marcas](/catalogo/marcas); si no está, el botón **«+ Crear «…»»** al final de la lista la crea), **Proveedor preferido** (desplegable con buscador, de [Proveedores](/compras/proveedores); se completa solo con el proveedor del último [invoice de compra](/compras/invoices) confirmado que trae el producto, y se puede cambiar a mano), **Tipo** (Simple / Con variaciones / Kit; ayuda: "A simple o kit, sólo con una variación."), **Estado** (Activo / Pausado / Inactivo).
- **Código de barras**: en un producto con variaciones dice "Va en cada variación."
- **Modelo**, **Línea**, **Garantía** (ej. "6 meses"), **Condición** (Sin indicar / Nuevo / Usado / Reacondicionado).
- **Costo FOB** con su moneda (USD o ARS). Debajo, en gris, el costo "Puesto en depósito: promedio … · último … — sale de compras" (o "Sin costo en depósito todavía (sale de compras)."). En un producto con variaciones dice "Va en cada variación."; en un kit no se carga: muestra la suma de sus componentes.
- Casilla **Kit en Virtual Seller (armar a mano)**.
- Casilla **Precio en dólares (los pesos siguen al tipo de cambio del día)**.
- Los números van **juntos en una fila**, cada uno en un cuadro chico: **Peso (g)**, **Largo (cm)**, **Ancho (cm)**, **Alto (cm)**, **Stock mínimo**, **Descuento %**, **Umbral de pausa** e **IVA**; sus ayudas, en un renglón debajo de la fila.
- **Stock mínimo**: debajo de esto, avisa el panel.
- **Descuento %**: vacío hereda de la familia (la ayuda muestra cuánto heredaría y cuál rige).
- **Umbral de pausa**: vacío = el del canal o el general (la ayuda muestra el general).
- **IVA**: 21 %, 10,5 %, 27 %, 5 %, 2,5 % o 0 %. "Los precios se cargan con IVA; al facturar se discrimina con esta alícuota."
- **Descripción larga**, a todo lo ancho y bien alta (si el texto es más largo, se desplaza adentro del cuadro; en edición, el cuadro se puede estirar desde la esquina de abajo).
- **Datos técnicos para la IA**: lo que la tienda sabe del equipo y no siempre está en la descripción (por ejemplo, cuántos slots de memoria libres tiene, si la memoria viene soldada, hasta cuánto se amplía, si admite un segundo disco). No se publica en ningún lado: la IA lo usa para contestar preguntas técnicas de ese producto en Mercado Libre (preguntas y mensajes después de la compra) y en WhatsApp, y manda sobre lo que diga la descripción. Cada producto tiene los suyos, también los kits (un equipo con más memoria es otro producto y lleva sus propios datos).

Debajo, en modo vista, un desplegable **Atributos de Mercado Libre** con la categoría de ML y los atributos que trajo la publicación. Es sólo para mirar.

#### Recuadro «Según packing list» (pestaña Datos)

Si el producto vino en alguna compra con packing list cargado, debajo de los datos aparece el recuadro **Según packing list**: el peso y el volumen **por unidad** sacados de las cajas, con la parte de cartón y embalaje que le toca a cada unidad. No cambia el peso de la ficha: es un dato aparte. Por cada packing list en que aparece el producto (y por variación, si tiene):

- **Exacto** (verde): venía en cajas con un solo producto; peso y volumen de las cajas ÷ unidades.
- **Aproximado** (ámbar): venía en una caja mezclada; el peso y el volumen de la caja se reparten por partes iguales entre todas sus unidades.
- **Peso por unidad** y **volumen por unidad** (en cm³), el **peso volumétrico por avión** (volumen × 167 kg por m³) y el **cobrable por avión** (el mayor de los dos; en rojo si el volumétrico supera en 50 % al real: por avión paga sobre todo aire).
- De qué packing list salió (número, fecha y vía), cuántas unidades y en qué cajas.

Rige (★) el dato exacto antes que el aproximado y, entre dos iguales, el del packing list más nuevo.

Debajo, con el dato que rige y el FOB de la ficha: el **flete por avión** por unidad (y qué % del FOB es; en rojo si pasa el umbral, porque conviene barco), el **flete por barco** y el **costo final** por cada vía: por avión, courier (FOB + flete + un % del FOB por todo concepto); por barco, despacho con impuestos e IVA. Los montos y la categoría contra el precio de la Clásica están en [Sugerencia de compra](/compras/sugerencia), recuadro «¿Avión o barco?».

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

- En la pestaña **Datos** se ven arriba hasta 6 fotos, todas del mismo tamaño ("+N más" si hay otras); tocando cualquiera se abren todas.
- Caja **Fotos del producto** con el botón **📷 Subir fotos** (se pueden elegir varias a la vez). La primera foto es la principal.
- En un producto con variaciones, una caja por variación con **📷 Fotos propias**. Si una variación no tiene fotos propias, "usa las del producto".
- Cada foto tiene ◀ / ▶ para moverla un lugar antes o después y un tacho para borrarla.

#### Pestaña Cucardas

La tabla de cucardas activas (y las archivadas que el producto ya tenga): **Lleva** (caja para tildar), la cucarda con su color, **Desde** y **Hasta**. Se cambia con el lápiz y se graba con "Grabar". Si no hay cucardas creadas, avisa que se crean en [Cucardas](/catalogo/cucardas).

#### Pestaña Componentes del kit

- Tabla: SKU del componente (lleva a su ficha), Componente, Cantidad, Disponible; lápiz para cambiar la cantidad y tacho ("¿Sacar?").
- **+ Nuevo componente**: SKU del componente y cantidad, la caja **"Sobra al armarlo (entra al stock al vender el kit)"** y el botón **Agregar componente**.
- **Pieza que sobra al armarlo**: la que se le saca al equipo para armar el kit. Ejemplo: la Asus de 12 GB se arma sacándole una memoria de 4 GB y poniéndole una de 8; el kit es "equipo + memoria de 8 GB" y la de 4 GB (SODIMM-4DDR4) va tildada como que sobra. No es una cantidad negativa: es una marca. La fila dice "Sobra al armarlo: entra al stock cuando se vende el kit", con la cantidad en "+1" y sin disponible.
  - No cuenta para el disponible del kit, no se reserva y no aparece en el picking.
  - Cuando el kit se vende (sale del depósito), entra al stock en la misma ubicación de donde salió el equipo, con el movimiento "sobra al armar el kit: entra al venderlo".
  - En el costo FOB del kit, resta.
- Caja **Stock del kit por depósito**: cuántos kits completos se pueden armar en cada depósito activo.

#### Pestaña Precios

Una tabla por cada lista de precios activa: Variación, **Lista** (tachado si hay descuento), **Descuento**, **Venta**, **Desde** ("dd/mm/aaaa · cargado en ARS/USD"). El lápiz de la fila deja cargar un **Precio de lista nuevo** con su moneda. Los importes se ven en la moneda que elegiste arriba con el interruptor $ / US$.

#### Pestaña Stock

Disponible (lo que hay menos lo reservado) de cada variación en cada depósito activo, y el **Total** (en rojo si está debajo del stock mínimo). **Ver detalle** lleva a [Consulta de stock](/stock/consulta) de esa variación.

#### Pestaña Compras

El historial de compras del producto, sólo para estadística (no mueve stock ni costos): los renglones de los [invoices de compra](/compras/invoices) confirmados y de las [compras por courier](/compras/courier). Una fila por compra, de la más nueva a la más vieja: **Fecha** (la del invoice), **Llegada estimada** (fecha + la demora de la vía), **Documento** (lleva al invoice o a la compra por courier), **Proveedor**, **Vía** (Avión, Barco o Courier), **Variación**, **Cantidad**, **Precio unit.** y **Total** en dólares (vacíos si el invoice está marcado «No tomar el precio») y **Se vendió**: en cuántos días se terminó de vender esa compra (del día que empezó al que se terminó), o cuántas unidades le quedaban sin vender. Arriba, cuántos días tardó en venderse cada compra en promedio.

Para «Se vendió», cada compra empieza a venderse el día que llega, o el día después de que se terminó la compra anterior si todavía quedaba de ella, y se termina el día que las ventas de todos los canales (también las de los kits que llevan el producto) desde ahí suman su cantidad; entre paréntesis, del día que empezó al que se terminó. Si hubo compras que no están registradas, esa compra puede figurar vendida más rápido de lo real.

#### Pestaña Publicaciones

Arriba, un interruptor por cada web: **"Publicado en Web minorista"** y **"Publicado en Web mayorista"** (la web es un canal más). Prendido, el producto se ve en esa tienda (si tiene precio en la lista del canal); apagado, no. Prenderlo publica todas sus variaciones activas en ese canal; apagarlo las deja pausadas. No toca Mercado Libre. **En la Web minorista se publica solo**: toda variación activa de un producto publicable que todavía no tiene publicación en la web aparece en la tienda apenas tiene precio de lista mayor que cero y stock disponible en ese canal (al cargar el precio o al entrar el stock). Si la apagás a mano con el interruptor, queda apagada: el sistema no la vuelve a prender.

Debajo, el filtro **Canal** («Todos los canales (N)» de entrada, o uno, con cuántas tiene cada uno), la caja **Con disponible** (tildada, muestra sólo las publicaciones **activas que tienen stock**: en Mercado Libre, lo que la publicación tiene cargado; en la web, lo disponible para ese canal) y las publicaciones de las variaciones de este producto en cada canal (también las de la web, sin id externo): **Plan** (Clásica, Premium o Premium 3x / 9x / 12x, el nombre que usa Mercado Libre por dentro para la campaña de cuotas; ver [Publicaciones](/catalogo/publicaciones)), Canal, Variación, Id externo, Título, Precio (como en Mercado Libre: **grande lo que paga el cliente** con su plan —si está en una campaña en curso, el precio de la campaña—, arriba **chico y tachado el precio de lista**, al lado el **"% OFF"** en verde y debajo, chiquito, el nombre de la campaña, entero al pasar el mouse; es lo que informa Mercado Libre que ve hoy el comprador, con la leyenda **«según ML, hace N min»**, igual que en [Publicaciones](/catalogo/publicaciones)), Estado (y debajo, el estado en ML; en la web, una publicación activa sin stock disponible para ese canal dice **Sin stock**, y con el interruptor apagado, **Pausada**; si está en revisión en ML, el motivo que informa Mercado Libre y la marca **Por precio** si es por el precio), **Stock** (lo que la publicación tiene cargado en Mercado Libre), **Ventas** (lo vendido que informa Mercado Libre de esa publicación; 0 si no vendió; en la web, "—"). **Se ordena tocando el título de cada columna** (▲ / ▼; tocándolo otra vez, al revés). Sin tocar ningún título, el orden es: primero la tienda web; después Mercado Libre **por plan**, del más barato al más caro: **Clásica, Premium 3x, Premium común, Premium 9x, Premium 12x**; y adentro de cada plan, las cuentas de la más barata a la más cara. En cada plan, la publicación activa más barata lleva **«★ gana el plan»** con el precio en verde: es la que el comprador ve primero. Para ver todos los productos así, en un cuadro de planes por cuentas, está [Monitoreo de precios y publicaciones](/informes/monitoreo-publicaciones). Las publicaciones de catálogo llevan la marca **«📖 Catálogo»**, bien visible, debajo del plan, y debajo del nombre del plan dice «el comprador ve N cuotas» según lo cargado para el grupo de categorías del producto en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas). Cada fila lleva de fondo el **color suave de su canal** (se elige en [Canales](/config/canales)). Arriba, el total: **Vendidos en Mercado Libre: N**. En las de Mercado Libre, el **Id externo** (con "↗") y el **Título** abren la publicación en Mercado Libre, en otra pestaña. El botón **Ir a Publicaciones** lleva a [Publicaciones](/catalogo/publicaciones), **Publicar en ML copiando otra** abre la pantalla para publicarlo en Mercado Libre (en el catálogo o copiando una publicación tuya), **Nueva desde Laucen con IA** abre directo la publicación nueva armada con los datos del producto y lo que propone la IA, y **Publicar en todas las cuentas** crea de una vez, copiando la que ya tiene, la Clásica y los planes de cuotas que le tocan en cada cuenta de Mercado Libre (pestaña «Todas las cuentas» de la pantalla Publicar en Mercado Libre).

Arriba de todo, el interruptor **No publicable (insumo o parte de otro)**: prendido, el producto no va a Mercado Libre ni a la web (sale de las tiendas y no se puede volver a prender "Publicado en Web"), no aparece en las alertas de "sin publicar" del tablero ni en esos filtros, y la ficha muestra la marca "No publicable" junto al título. Sus publicaciones de Mercado Libre, si tiene, no se tocan.

## Cómo se hace

### Crear un producto

1. En [Productos](/catalogo/productos), apretá **+ Nuevo producto**.
2. El **SKU base** ya viene sugerido: el que sigue al SKU más alto de la empresa (por ejemplo, si el más alto es SKU03554, propone SKU03555). Lo podés cambiar. Completá el **Título** (los dos son obligatorios), elegí el **Tipo** (Simple, Con variaciones o Kit) y, si querés, la **Familia** (con la lupa 🔍 de al lado, Mercado Libre te sugiere cuál, según el título escrito).
3. Apretá **Crear**. Se abre la ficha con el aviso "Producto creado. Completá la ficha." Si no elegiste familia, el sistema le pone la que sugiere Mercado Libre para el título y lo dice en el aviso ("…en la familia que sugiere Mercado Libre: …"); si Mercado Libre no contesta, queda sin familia.
4. Completá el resto en la pestaña Datos (lápiz → Grabar).

Si falta el SKU o el título: "El producto necesita SKU base y título." **Ningún SKU se puede repetir** dentro de la empresa, ni entre productos ni con el de una variación de otro producto, y sin importar mayúsculas: si ya existe, avisa "El SKU … ya existe: elegí otro." y no graba (lo mismo al cambiar el SKU de un producto o de una variación).

**Cambiar el SKU de algo que está publicado en Mercado Libre**: al grabar, el SKU cambia en Laucen y queda **preparado un lote** con el cambio de SKU en cada una de sus publicaciones de Mercado Libre. Se abre la [Cola de Mercado Libre](/config/canales/cola) en ese lote: nada sale hasta apretar **«Mandar a Mercado Libre»**. Así el SKU queda igual en Laucen y en todas las cuentas.

**SKU sugerido**: el formato de la casa es «SKU» seguido de un número de 5 cifras (6 cuando pasa de 99999). Se busca el número más alto entre todos los SKU con ese formato (los de las variaciones también, y los que siguen con un agregado, como «SKU03542-BC») y se propone el siguiente. Los SKU con otro formato no cuentan.

### La marca del precio de mercado

Al lado del título en la ficha, en la columna **Precio de mercado** de la lista de productos, junto al precio en [Listas de precios](/catalogo/precios) y junto a la Clásica en [Sugerencia de compra](/compras/sugerencia) hay un circulito que dice cómo está controlado el precio contra la competencia (al pasar el mouse lo explica; tocándolo abre la pestaña Seguimiento):
- **✓ verde — Precio de mercado confirmado**: el producto sigue al menos una publicación de la competencia que **una persona agregó o revisó**.
- **? ámbar — Monitoreado sin confirmar**: sólo sigue publicaciones que **eligió sola la búsqueda de precio de mercado** y nadie revisó todavía.
- **○ gris — Sin seguimiento**: no sigue ninguna.
No cuentan las publicaciones excluidas de la regla. Para ver los que falta revisar: [Seguimientos](/catalogo/seguimientos).

### Seguir publicaciones de la competencia (pestaña Seguimiento)

La pestaña **Seguimiento (N)** de la ficha guarda las publicaciones de otros vendedores que querés vigilar, con lo último que se leyó de cada una: foto, título (con ↗ a Mercado Libre), número, si es de catálogo, **vendedor** (y si es tienda oficial; debajo, cuántas unidades tiene a la venta y cuántas vendió según la última lectura, en ámbar si tiene 5 o menos; si son muchas, Mercado Libre muestra un aproximado: «más de 25»), **precio** (con el precio tachado si tiene descuento, y ▼/▲ con cuánto cambió desde la lectura anterior), **tipo** de publicación (Clásica, Premium…) y cuotas, **entrega** (en cuántos días llega a Capital Federal, en rojo si tarda más de lo que compite, y si el envío es gratis), **estado** (Activa, Pausada, Terminada, "No figura en el catálogo" o "Sin leer todavía") y cuándo se **leyó**. Ordenadas de la más barata a la más cara.

Arriba de todo, un recuadro dice si el producto está **Por revisar** (con el botón **✓ Producto revisado**) o **✓ Revisado por … el …** (con **Desmarcar**; si después entraron publicaciones nuevas, lo avisa y ofrece **✓ Revisado de nuevo**). Ver [Seguimientos](/catalogo/seguimientos).

En la tabla de las que seguís, arriba se ven sólo las que están a la venta (el número del título cuenta ésas). **Las pausadas o que ya no figuran en el catálogo van aparte**: debajo de la tabla, el botón **▸ Pausadas (N)** las muestra en otra tabla igual (tocándolo de nuevo se esconde). Mientras tanto, la regla de precio no la usa. Debajo del estado de cada pausada dice cada cuánto se relee y hasta cuándo («Se relee cada 30 días hasta el dd/mm»); si el vendedor la vuelve a activar, vuelve sola a la tabla de arriba. Pasados los meses que diga [Seguimiento de publicaciones](/config/seguimiento), deja de releerse sola y dice **«⏸ No se relee: pausada hace más de N meses»**, con el botón **Reanudar** debajo: la lee en el momento (de fondo; el cartel avisa abajo a la derecha) y la vuelve a releer por otros N meses. Si una lectura encuentra una publicación terminada, se deja de seguir sola (desaparece de la lista).

Para elegir cuáles seguir:
1. En el recuadro **Buscar en Mercado Libre para seguir**, el texto ya viene con el título del producto (se puede cambiar).
2. Apretá **🔍 Buscar en Mercado Libre**: pregunta "¿Buscar? Cuesta unos US$ 0,10"; con **Sí** busca de fondo (uno o dos minutos) y avisa abajo a la derecha al terminar.
3. Aparecen las publicaciones encontradas, de entrada **en el mismo orden que las muestra el buscador de Mercado Libre** (más relevantes), con foto, título, vendedor, precio, tipo de publicación y cuotas, y envío. Cuando lo encontrado es un **producto de catálogo** de Mercado Libre, se muestra **cada vendedor que compite en ese catálogo** (con su vendedor, precio, tipo y envío reales), marcados **📖 Catálogo**; las de publicidad también están marcadas. En un producto de catálogo, el título que se ve es el del catálogo: es el mismo que ve el comprador. El desplegable **Ordenar** cambia el orden: **Como en Mercado Libre**, **Precio, de menor a mayor** o **Parecido al título del producto**.
En un producto de catálogo, Mercado Libre muestra el título del catálogo para todos los vendedores que compiten en él, aunque cada uno haya publicado con otro título: por eso esos renglones dicen «el título es el del catálogo».
4. De entrada **no se muestran los packs ni las de varias unidades** («Pack de 2», «5 X…», «x10», «kit», «combo», «lote», «10 unidades»), salvo que el producto también sea un pack, **ni las nuestras** (se reconocen por el número de publicación y por la cuenta). Tampoco **las internacionales** (vendedor de afuera o entrega internacional: su precio no se compara porque le faltan los impuestos; llevan la marca **🌐 Internacional**) ni **las que tardan en llegar más de lo que compite** (ver [Seguimiento de publicaciones](/config/seguimiento)). Las cajas **Mostrar también packs y varias unidades (N)**, **Mostrar también las nuestras (N)** y **Mostrar también las que tardan más de N días (N)** y **Mostrar también las internacionales (N)** las agregan; las nuestras dicen **Nuestra**.
5. La columna **IA** dice si la inteligencia artificial juzga que es **el mismo producto** que el nuestro: **✓ Comparable** (en verde) o **✗ No**, con el motivo corto («mismo modelo, 5 lentes y LED», «es otro modelo», «Es nuestra», «Pack o varias unidades»…). Sirve para elegir rápido; no sigue nada sola.
6. Al lado de cada una, **+ Seguir** la agrega (sin costo).
7. **Excluir**: tildada, esa publicación no la querés seguir nunca en este producto. Deja de aparecer en la lista (también en las búsquedas siguientes) y la búsqueda de precio de mercado no la sigue sola ni la cuenta. La caja **Mostrar las excluidas (N)** las vuelve a mostrar, para destildar alguna.

En la lista de la búsqueda no aparecen las que ya seguís (están arriba), ni las de un vendedor que también tiene esa publicación en Clásica (si el vendedor tiene Clásica y Premium, sólo se ofrece la Clásica) o con número MLA (si además tiene una MLAU, que no se puede leer).

La última búsqueda queda guardada: volver a la pestaña no cuesta; buscar de nuevo, sí.

Para agregar publicaciones que ya conocés: **+ Agregar por número**, pegá los links o números (MLA…), uno por renglón, y **Agregar**. **Se leen enseguida, de fondo**: el botón **Leer ahora** queda en «Trabajando…» y en un minuto aparecen con sus datos (mientras tanto dicen «Sin leer todavía»). Si la publicación compite en un **catálogo**, a partir de ahí se lee gratis por el catálogo y muestra el vendedor, el tipo y el título que ve el comprador.

**El link de un catálogo.** En Mercado Libre, la página de un producto de catálogo tiene la dirección `…/p/MLA…` y el recuadro «Otras opciones de compra» con todos los vendedores. Si pegás en **+ Agregar por número**:
- el link del catálogo solo (`…/p/MLA2081953349`): aparece, debajo de las que seguís, la caja **Vendedores del catálogo «…» (N)** con todos los que compiten (vendedor, precio, tipo, entrega; de la más barata a la más cara), cada uno con **+ Seguir**. Se lee gratis. El tacho de la caja saca la lista (lo que ya seguís queda). Pegar el mismo catálogo de nuevo la vuelve a leer;
- el link con un vendedor elegido (`…/p/MLA2090682290?pdp_filters=item_id:MLA3756369652`, el que queda al tocar un vendedor de ese recuadro): sigue directamente esa publicación y la lee gratis por su catálogo.

Las publicaciones **MLAU…** («producto de vendedor») se leen sólo si compiten en un catálogo; si no, Mercado Libre no deja leer su precio y la fila lo dice en rojo: en ese caso conviene seguir su número **MLA…**.

**Leer ahora** relee las de este producto en el momento (pregunta antes, porque las comunes cuestan). Además se releen solas cada tantos días (ver [Seguimiento de publicaciones](/config/seguimiento)), pero las comunes sólo si el producto está a la venta (con publicación activa en Mercado Libre y stock disponible); si no lo está, arriba de la tabla lo dice y quedan de referencia hasta que apretés **Leer ahora**. El tacho deja de seguir una.

Debajo del precio de cada publicación que seguís está **su último cambio**: ▲ (verde) o ▼ (rojo), cuánto en pesos y en %, y la fecha desde la que tiene el precio de hoy; si nunca cambió, «igual desde el comienzo (dd/mm)», con la fecha en que se empezó a seguir. **La fila se pinta de amarillo si cambió en la última lectura**, y **de rosa si además es la referencia de la regla de precio**. La que usa la regla para comparar lleva la marca **🎯 Referencia de la regla** (la elegida, o la más barata de las activas si la regla compara contra la más barata).

**Seguidas solas por la búsqueda de precio de mercado.** La búsqueda de precio de mercado ([Sugerencia de compra](/compras/sugerencia)) guarda lo que encontró como la última búsqueda del producto (se ve en **Buscar en Mercado Libre para seguir**, con la columna IA) y **sigue sola las publicaciones que la IA juzga iguales** (las más baratas, hasta lo que diga [Seguimiento de publicaciones](/config/seguimiento)). Esas llevan la marca **🤖 Automática · sin revisar** (al pasar el mouse, el motivo de la IA) y **no cuentan para la regla de precio** hasta que una persona las revisa:
- la caja **Revisada** de su fila la confirma (o la vuelve a dejar sin confirmar); al confirmarla pasa a **🤖 Automática · revisada** (al pasar el mouse, quién y cuándo);
- **✓ Confirmar todas (N)**, arriba a la derecha de la caja, confirma de una vez todas las sin revisar del producto.
Las que agrega una persona (con **+ Seguir**, por número, desde una planilla importada o importadas de Virtual Seller en [Importar seguimientos de Virtual Seller](/catalogo/seguimientos/importar)) ya nacen revisadas. Debajo de la caja **Revisada** dice de dónde sale: «por …» (quién la tildó y cuándo), «con «+ Seguir»», «por número», «desde planilla» o «desde Virtual Seller», con la fecha; al pasar el mouse, el detalle (en las de Virtual Seller, el ID del seguimiento).

En cada fila de las que seguís:
- **El tacho, a la derecha de la fila**, deja de seguirla (pregunta ahí mismo «Sí» / «No»).
- **Fuera de la regla — Excluir**: tildada, la seguís y ves su precio, pero **la regla de precio no la tiene en cuenta** (por ejemplo, un vendedor que a veces pone un precio puntual muy bajo). Graba al tocarla y la regla se vuelve a revisar enseguida.
- **🌐 Internacional**: tampoco cuenta para la regla.

**Lo repetido de un mismo vendedor se deja de seguir solo**: si un vendedor tiene la publicación en Clásica y en otro tipo (Premium…), se sigue sólo la Clásica; si la publica como MLAU y como MLA, sólo la MLA. Si un vendedor sólo tiene Premium, se sigue la Premium.

**📈 Historial (N)**, a la derecha de cada publicación que seguís, abre debajo de ella **sólo las veces que cambió algo** —el precio, el estado o el tipo de publicación— (N es cuántos cambios hubo), de la más nueva a la más vieja: desde cuándo, precio (con el tachado si tenía descuento), **cuánto cambió** (▼ en rojo si bajó, ▲ en verde si subió, en pesos y en %), tipo y estado. El último renglón es el **Comienzo del seguimiento**. Las lecturas que encontraron todo igual no se muestran; al pie dice cuándo fue la última lectura. Tocándolo de nuevo se cierra.

### Regla de precio (pestaña Seguimiento)

Arriba de la caja de la regla hay un **cuadro con lo más importante, en letra grande**:
- **Con la regla prendida**: a cuánto llevaría hoy cada Clásica, **en verde si sube y en rojo si baja**, con cuánto en pesos y en %; o «Se queda en …» y por qué (ya está en el objetivo, en el piso, en el techo…).
- **Con la regla apagada**: **cuántos pesos y qué % estás más arriba (en rojo) o más abajo (en verde)** que la referencia; «igual que la referencia» sólo si es el mismo precio.
En los dos casos dice cuál es la referencia (la más barata de las que seguís, sin las excluidas ni las internacionales, o la elegida) y a cuánto está.

Debajo de las publicaciones que seguís está la caja **Regla de precio**: mirando lo que cobran esas publicaciones, **baja (y, si querés, sube) el precio de la lista Clásicas** de este producto. No toca Mercado Libre directo: desde la lista, el esquema de precios lo lleva a todas las cuentas y todos los planes (ver [Cómo funcionan los precios](/catalogo/precios-ml)).

Se configura con el **lápiz** del título de la caja (en edición quedan **Grabar** y **Cancelar**). **Mientras editás, al lado de los campos se ve qué haría el sistema** con lo que vas eligiendo (el precio nuevo de cada Clásica, en verde si sube y en rojo si baja), antes de grabar:

- **Qué hace**: **Apagada**; **Proponer el cambio y esperar mi clic** (deja el cambio propuesto con los botones **Aplicar** y **Descartar**); o **Automático: cambiar la lista sola**. Se elige producto por producto, según cuánto confiás en los que seguís.
- **Contra quién**: **el más barato de los que sigo** o una publicación puntual de las que seguís. Si la elegida deja de estar activa (el vendedor la pausa o la termina) o la excluís, la regla sigue sola contra **la más barata de las que quedan** y el resultado lo dice («la elegida no está activa: se usa la más barata que sigue»); cuando vuelve a estar activa, se compara otra vez contra ella.
- **Cómo**: **Igualar su precio**, **Quedar X pesos abajo** o **Quedar X % abajo** (X va en el campo de al lado).
- **Piso**: la Clásica nunca baja de ese precio. Es obligatorio para prender la regla.
- **También subir** y **Techo**: tildada, si la publicación que seguís sube su precio (o el más barato pasa a ser uno más caro), la Clásica sube hasta el objetivo, nunca por encima del techo. El techo es obligatorio si está tildada y tiene que ser mayor que el piso.

Criterios:

- **Baja** si tu Clásica está por encima del objetivo; si el objetivo queda por debajo del piso, baja hasta el piso.
- **Sube sólo con «También subir»**, si tu Clásica está por debajo del objetivo; si el objetivo queda por encima del techo, sube hasta el techo. Sin esa caja, si ya estás más barato no hace nada.
- Compara contra las seguidas **activas**, **revisadas** y con precio leído (las pausadas o que no figuran en el catálogo no cuentan: si la que era la referencia se pausa, pasa sola a la siguiente más barata), sin las **excluidas** ni las **internacionales**. El precio de la referencia es el que paga el comprador.
- El objetivo se redondea a pesos enteros, hacia abajo. Si el producto tiene varias variaciones, se revisa cada una con su propia Clásica.
- Un producto con precio en dólares sigue en dólares: se baja en la misma proporción.
- **Cuándo se revisa**: sola, después de cada lectura de las seguidas (la vuelta automática o **Leer ahora**); al grabar la regla; y con **Revisar ahora**, que la recalcula en el momento con los precios ya leídos (no vuelve a leer ni gasta): si la Clásica tiene que cambiar, deja una propuesta nueva para **Aplicar** (en automático, la cambia); si no, anota en «Última revisión» que no hace falta.
- **Contra quién**, en una regla nueva, viene en **el más barato de los que sigo**. El **piso** y el **techo** no se completan solos: los carga quien arma la regla.
- Lo propuesto que no se aplicó se reemplaza por lo de la revisión siguiente.

Todos los cambios de la lista (los de la regla y los hechos a mano, con quién) se ven en [Historial de precios de lista](/catalogo/precios/historial).

La caja muestra **tu Clásica hoy**, la **referencia** (quién y a cuánto) y a cuánto quedarías, la última revisión con su resultado y, al desplegar **Lo que hizo la regla (N)**, cada cambio: cuándo, SKU, antes, después, contra quién y su estado (**Espera tu clic**, **Aplicado**, **Descartado** o **Reemplazado**).

### Ver cómo se viene vendiendo (pestaña Ventas)

La pestaña **Ventas (N)** de la ficha (N = renglones vendidos en toda la historia) muestra, en una tabla, para **Últimos 7 días**, **Último mes**, **Últimos 3 meses**, **Último año** y **Toda la historia**: cuántas **ventas** (compras distintas: un pedido o una venta de Mercado Libre), cuántas **unidades**, el **monto** que pagaron los compradores y las **unidades por día**. Debajo, la fecha de la última venta.

**Ver detalle**, arriba a la derecha de la caja, abre **Venta por venta**, de la más nueva a la más vieja, de a 50: fecha, la venta (el **pedido**, que lleva a su ficha; si no tiene pedido, el número de **Mercado Libre** con ↗; o el número del historial anterior), el **canal** (cada fila con el color de su canal), el **cliente** (lleva a su ficha si está cargado), la cantidad, el precio por unidad y el total. **Ocultar detalle** lo cierra.

Cuenta todos los canales —Mercado Libre, la tienda web, el local y el historial de ventas importado—, sin las canceladas: es lo mismo que mira [Sugerencia de compra](/compras/sugerencia).

### Comprobar la familia con Mercado Libre (la lupa 🔍)

Al lado del buscador de **Familia** (en el alta y en la ficha, en edición) está la lupa **🔍**. Al pasar el mouse explica qué hace. Al apretarla:

1. Se le pregunta a Mercado Libre en qué categoría pondría un producto con el **título que está escrito** en el formulario (no hace falta grabar antes).
2. Se abre un globo con hasta tres categorías sugeridas (la primera es la más probable), con su camino completo, y si la familia elegida **coincide** ("✓ Coincide con la que sugiere Mercado Libre"), si **está entre las sugeridas pero no es la primera**, o si **no coincide** ("⚠ No coincide").
3. **«Usar ésta»** pone esa familia en el campo. Si todavía no existía en el árbol de familias, se crea con todo su camino. Se graba con el resto de la ficha (**Grabar**).

Las familias son las categorías de Mercado Libre: elegir bien la familia es elegir la categoría con la que se publica. Al cambiar la familia de un producto, la categoría para publicarlo en Mercado Libre pasa a ser la de la familia nueva.

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

### Ver los cambios de precio (pestaña Cambios de precio)

La pestaña **Cambios de precio (N)**, al lado de **Precios**, muestra cada precio de lista de este producto (N es cuántos cambios hubo): cuándo, desde qué día rige, la lista, antes y después, cuánto cambió (▲ verde si subió, ▼ rojo si bajó, **Nuevo** si fue el primero) y **quién** lo cambió: la persona, **Regla de seguimiento (automática)**, «… (aplicó la regla de seguimiento)», carga masiva o copia al duplicar. Los de la regla dicen en **Motivo** contra quién comparó. **Ver con filtros en el Historial** abre [Historial de precios de lista](/catalogo/precios/historial) con este producto, para filtrar por fechas, subieron o bajaron, o quién.

### Duplicar un producto

Sirve para cargar un producto parecido a uno que ya existe (por ejemplo otra notebook): en la ficha, botón **Duplicar** (arriba a la derecha, al lado de "Pasar a Inactivo"). El sistema crea la copia con el **SKU sugerido** (el que sigue al más alto, como en el alta) y abre su ficha **en edición**, con el aviso "Copia creada con el SKU …". Después cambiás lo que haga falta (título, atributos, fotos, precio…) y apretás **Grabar**.

- **La copia trae**: los datos de la ficha (descripción, familia, marca, medidas, garantía, categoría de Mercado Libre y sus atributos, planes de cuotas, IVA…), las variaciones con sus atributos y fotos, las fotos del producto, los atributos, las cucardas, el costo de importación, los componentes si es un kit y el **precio de hoy** de cada lista.
- **La copia no trae**: el stock (arranca en cero), el código de barras, los costos reales de compra (último y promedio), las publicaciones de la web y de Mercado Libre, ni las reglas de precio de ML. Eso se arma para el producto nuevo.
- **El SKU** de la copia es el sugerido (el que sigue al más alto). Las variaciones que empiezan con el SKU del original conservan el resto ("SKU00010-ROJO" pasa a "SKU00011-ROJO"); las demás quedan con el SKU nuevo y su número de variación ("SKU00011-2"). Si el sugerido estuviera ocupado, la copia lleva el del original más "-COPIA". Se cambia desde Datos como cualquier SKU.
- **Queda Pausada**: no se publica en ningún lado hasta que le pongas **Estado: Activo** en Datos.
- Las fotos copiadas son las mismas imágenes que las del original: si borrás una foto de la copia, la del original sigue ahí.

### Pasar un producto a Inactivo (o volver a Activo)

En la ficha, botón **Pasar a Inactivo** (arriba a la derecha). Avisa "Pasó a Inactivo: ya no aparece en los listados." Para revertirlo, **Volver a Activo**. También se puede cambiar el **Estado** desde Datos.

### Borrar un producto

Tacho de arriba a la derecha → "¿Borrar el producto entero?" → **Sí**. Se borra con sus variaciones, fotos, atributos, cucardas y precios. Si una de sus variaciones es componente de un kit, el sistema no deja borrarlo. Si sólo querés que no aparezca más, conviene **Pasar a Inactivo**.

## Criterios y reglas

**No publicable**
- Es para lo que no se vende solo: insumos o partes de otro producto, como la unidad "-U" que se vende sólo en pack. Se prende y apaga en la pestaña Publicaciones de la ficha.
- Un producto marcado No publicable sale de la web. La marca se prende a mano en cada producto que no se vende solo (por ejemplo, las unidades "-U" de un pack).

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

**Descuento que rige para una variación** (el que convierte precio de lista en precio de venta): el de la variación → si está vacío, el del producto → si está vacío, el de su familia → si está vacío, el de la primera familia de más arriba que tenga uno → si no hay ninguno, 0 %. Va de 0 a 100 %. Rige **sólo en las listas con «Aplica descuentos»** (hoy, la Web minorista: tienda web y WhatsApp); en Clásicas (Mercado Libre) y en la del Local no se aplica.

**Umbral de pausa** (con ese disponible o menos, el canal pausa la publicación): el de la publicación → el del producto → el del canal → el general de la empresa → 0 (sin nada cargado, se pausa sólo cuando no queda stock).

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
