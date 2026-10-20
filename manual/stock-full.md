---
titulo: Envíos a Full
menu: Stock › Envíos a Full
ruta: /stock/full
rutas: /stock/full, /stock/full/[id], /stock/full/stock
permiso: full_ver
resumen: Armar, despachar y seguir los envíos de mercadería a Full de una cuenta de Mercado Libre, cargar su flete y ver lo que hay en Full al lado de lo que dice el sistema.
---

## Para qué sirve

Para mandar mercadería del depósito propio a **Full** de una cuenta de Mercado Libre y seguirla hasta que llega, sin perder la cuenta del stock:

- Se arma el envío con los productos y las cantidades (a mano, o tildando los que convienen de una **sugerencia** según lo que vende cada producto).
- Al **despacharlo**, las unidades salen del depósito propio y quedan **«En camino a Full»**: desde ese momento no se venden por ningún canal.
- Cuando Mercado Libre las cuenta en Full, el sistema las **recibe solo** y pasan al depósito Full de esa cuenta.
- Las ventas Full de esa cuenta descuentan del depósito Full; el resto de los canales (las otras cuentas, la tienda, el local) sigue vendiendo lo que queda en el depósito propio.
- El **flete** del envío (un monto o la factura de gasto del transporte) se reparte entre los productos y se resta en la [Rentabilidad por venta](/informes/rentabilidad) de lo que se vende desde Full.

El envío también se crea en Mercado Libre, en la Central de vendedores (sección Full, enviar productos). Ahí Mercado Libre da el número del envío y el turno de entrega. Mercado Libre no deja crear el envío desde otro sistema.

## Cómo se llega

- Menú **Stock › Envíos a Full**.
- Arriba, dos pestañas: **Envíos** (la lista de envíos) y **Stock en Full** (lo que hay en Full de cada cuenta).

## Qué hay en la pantalla

### Pestaña Envíos

- Arriba a la derecha: **«Descargar Excel»** y **«Nuevo envío»**.
- Buscador **«Buscar por número, cuenta, Nº de ML o producto»** (busca mientras escribís, con «Comienza por») y el filtro **Estado**.
- Columnas (se ordenan tocando el título): **Envío** (número, abre la ficha), **Creado**, **Cuenta**, **Sale de**, **Nº en ML**, **Entrega en Full**, **Productos**, **Unidades**, **Recibidas**, **Flete** y **Estado**. Cada fila tiene el color de su cuenta.

### Ficha del envío

- Arriba a la derecha: **«Etiquetas»** (abre en otra pestaña el PDF con una etiqueta por unidad, con el Código ML de cada publicación), el lápiz, y según el estado **«Despachar»** y el tacho (borrador) o **«Leer Full ahora»** (en camino).
- **Datos del envío**: **Nº del envío en Mercado Libre**, **Entrega en Full (turno)** y **Notas**. Se cambian con el lápiz en cualquier estado.
- Recuadros: **Productos**, **Unidades**, **Recibidas en Full**, **Pendientes**, **Despachado** y **Recibido** (o **Cerrado**).
- Caja **Flete del envío** con su lápiz: **Monto (sin IVA)**, **Factura de gasto** (enlace a la factura) y **Cómo se reparte**. Debajo, cuánto da en promedio por unidad.
- Tabla **Productos** (con **«Vaciar el envío»** a la derecha del título, en borrador): foto y SKU (enlace a la ficha), la **Publicación** de la cuenta a la que va (su número abre el historial; la ↗ abre Mercado Libre; debajo, el plan, la marca de catálogo y cuánto vendió), el **Código ML**, **Vende/día en la cuenta**, **Vende/día en lo demás** (los otros canales), **En Full**, **En camino** (de otros envíos), **Disponible en** el depósito de origen (en rojo si no alcanza), **Cantidad**, y cuando ya salió, **Recibido** y **Faltante**; al final, el **Flete por unidad**.
  - En borrador, cada fila tiene el lápiz (cambia ahí mismo la cantidad y la publicación) y el tacho (lo saca del envío).
  - En camino, cada fila con unidades pendientes tiene **«Recibir…»**, para recibir a mano.
- En borrador, abajo: **Agregar productos** (buscador; cada resultado con su cantidad y **«Agregar»**) y **Sugeridos** con el botón **«Ver sugeridos»**. Abre la lista de sugeridos sin agregar nada: los tres números de días con **«Recalcular»**, y por producto una caja **Mandar** para tildar, la publicación a la que iría, lo que vende, lo que hay y la **Cantidad** sugerida (se puede cambiar). **«Agregar los tildados»** suma sólo los tildados; **«Cerrar sugeridos»** la esconde.
- En camino, abajo: **Cerrar el envío**, con **«Cerrar: lo que falta vuelve al depósito»** y **«Cerrar: lo que falta se perdió»**.

### Pestaña Stock en Full

- Arriba a la derecha: **«Leer Full ahora»**.
- Debajo de las pestañas, cuándo se leyó Full por última vez en cada cuenta.
- Buscador por SKU, título, Código ML o publicación.
- Columnas (ordenables): **Producto** (foto, SKU, título y la publicación), **Cuenta**, **Código ML**, **Disponible en ML**, **No disponible en ML** (con el detalle: en traslado, dañado, perdido, en retiro…), **En Full según el sistema**, **Diferencia**, **En camino**, **Vendidas** (últimos 60 días en esa cuenta), **Días que cubre** y **Lectura** (hora de la última lectura, o «Error» si Mercado Libre no contestó).

## Cómo se hace

### Armar un envío

1. Apretá **«Nuevo envío»**, elegí la **Cuenta de Mercado Libre** y el depósito de donde **Sale**, y apretá **«Crear»**. Si la cuenta todavía no tiene depósito Full, se crea solo («Full» y el nombre de la cuenta).
2. En la ficha, sumá productos:
   - con el buscador de **Agregar productos**: escribí, poné la cantidad y apretá **«Agregar»**;
   - o con **«Ver sugeridos»**: tildá en **Mandar** los que querés, corregí la cantidad si hace falta y apretá **«Agregar los tildados»**. Después, **«Cerrar sugeridos»** (ver «Criterios y reglas»).
3. Revisá cada fila con el lápiz: la cantidad y la **publicación** a la que va. Sacá lo que no va con el tacho, o todo junto con **«Vaciar el envío»**.

### Crear el envío en Mercado Libre y anotar el número

1. En la Central de vendedores de Mercado Libre, creá el envío a Full con los mismos productos y cantidades.
2. Volvé a la ficha del envío, apretá el lápiz y cargá el **Nº del envío en Mercado Libre** y la **Entrega en Full (turno)**. Apretá **«Grabar»**. El número queda de referencia: Mercado Libre no deja leer el contenido del envío desde otro sistema, así que los productos y cantidades se cargan en el sistema.

### Etiquetar y despachar

1. Apretá **«Etiquetas»**: abre el PDF con una etiqueta por unidad, en la impresora elegida la última vez en [Etiquetas › Full](/deposito/etiquetas/full).
2. Pegá cada etiqueta en su unidad y prepará las cajas.
3. Apretá **«Despachar»** y confirmá. Las unidades salen del depósito de origen y quedan «En camino a Full». Si de algún producto no alcanza el disponible, no se mueve nada y el sistema dice cuál y cuánto hay.

### Recibir

No hace falta hacer nada: cuando Mercado Libre cuenta las unidades en Full, el sistema las recibe solo (se lee cada media hora; para no esperar, **«Leer Full ahora»**). Si la lectura de Mercado Libre no anda, en cada fila apretá **«Recibir…»**, poné cuántas llegaron y **«Recibir»**.

### Cerrar un envío al que le faltan unidades

En **Cerrar el envío**, elegí:
- **«Cerrar: lo que falta vuelve al depósito»**: lo que no llegó vuelve al depósito de origen.
- **«Cerrar: lo que falta se perdió»**: lo que no llegó sale del stock como perdido.

### Cargar el flete

1. En la caja **Flete del envío**, apretá el lápiz.
2. Poné el **Monto** sin IVA, o elegí la **Factura de gasto** del transporte (cargada en [Facturas de compra](/compras/facturas)) y dejá el monto vacío para que lo tome de la factura.
3. Elegí **Cómo se reparte** y apretá **«Grabar»**.

Se puede cargar antes o después de despachar, y cambiar cuando llega la factura.

## Criterios y reglas

### Estados

- **Borrador**: se está armando. No mueve stock. Se puede borrar.
- **En camino**: despachado. Lo que salió está en el depósito «En camino a Full» (una ubicación por envío) y no se vende por ningún canal.
- **Recibido**: llegó todo a Full.
- **Cerrado con faltantes**: se cerró sin que llegara todo; lo que faltaba volvió al depósito o se dio por perdido.

### Qué se vende desde dónde

- El depósito Full de una cuenta queda asociado a esa cuenta, después del depósito propio. Las ventas **Full** de la cuenta salen del depósito Full; las demás ventas de la cuenta y de los otros canales salen del depósito propio.
- Lo que está en Full o en camino **no suma** al stock que se informa a Mercado Libre ni a la tienda: las publicaciones que no son Full siguen mostrando sólo lo del depósito propio. A las publicaciones Full el sistema no les manda stock (lo maneja Mercado Libre).

### La lectura de Full y cómo se iguala

- Cada media hora (y con **«Leer Full ahora»**) se le pregunta a Mercado Libre, por cada Código ML de la cuenta, cuántas unidades tiene en Full: **disponibles** (las que vende) y **no disponibles** (en traslado, dañadas, perdidas, en retiro…). Sólo se lee: no se cambia nada en Mercado Libre.
- Si lo disponible en Mercado Libre se queda **10 minutos sin cambiar** y no coincide con lo que el sistema tiene en Full:
  - si Mercado Libre tiene **más**, primero se reciben las unidades que estaban en camino (del envío más viejo al más nuevo) y lo que sobra entra con un ajuste;
  - si tiene **menos**, se ajusta para abajo.
  - La espera de 10 minutos evita tomar por faltante una venta que todavía no llegó al sistema.
- Cada ajuste queda en [Movimientos de stock](/stock/movimientos) con la nota «Igualado con Full de Mercado Libre» y lo que decía cada uno.
- Las unidades no disponibles no se cuentan en el depósito Full: se ven en la columna «No disponible en ML».

### A qué publicaciones va cada producto

En Full el stock no es del producto sino de cada **Código ML** (el de la etiqueta). Una publicación común y su gemela de catálogo sincronizada comparten el mismo código, y por lo tanto el mismo stock de Full. Pero cada plan de cuotas (Clásica, Premium, 3x…) tiene su propio código, aunque Mercado Libre lo muestre como una variante de la misma publicación: lo que se manda con el código de la Clásica sólo lo venden la Clásica y su gemela de catálogo; los demás planes del producto siguen vendiendo lo del depósito propio.

Por eso en el envío cada producto va a un **código de Full**, y se ven juntas las publicaciones que lo comparten (con su plan, la marca de catálogo y cuánto vendieron en los últimos 60 días). Viene elegido, en este orden: el que ya está en Full, el que más vendió, el que tiene catálogo, y el del plan más barato (Clásica). Se cambia con el lápiz de la fila. Tiene que ser el mismo que se elige en el envío de Mercado Libre: las etiquetas salen con ese código.

### La sugerencia

Para cada producto que la cuenta publica y vendió en los últimos días elegidos (60 de entrada), sin contar kits:

- **Necesita** = lo que la cuenta vende por día × días a cubrir en Full (30 de entrada), redondeado para arriba, menos lo que ya hay en Full y lo que está en camino.
- **Puede mandar** = el disponible en el depósito de origen menos lo que venden por día los demás canales × días a dejar en el depósito (30 de entrada).
- **Sugerido** = el menor de los dos (si da cero o menos, no se suma).

Muestra sólo productos que todavía no están en el envío, del que más vende al que menos, y no agrega nada hasta que se tildan y se aprieta «Agregar los tildados».

### El flete

- **Monto**: se carga a mano, o sale de la factura de gasto vinculada: neto + no gravado + otros impuestos, sin IVA (el IVA es crédito fiscal), a la cotización de la factura. Una nota de crédito resta.
- **Cómo se reparte** entre las líneas:
  - **Por volumen**: cantidad × largo × ancho × alto del paquete del producto.
  - **Por peso**: cantidad × peso.
  - **Por unidades**: lo mismo a cada unidad.
  - **Por valor**: cantidad × costo del producto.
  - Si a algún producto le falta el dato (medidas, peso o costo), se reparte por unidades y la caja dice a cuáles les falta.
- **Flete por unidad** = lo que le toca a la línea ÷ su cantidad. Se recalcula con cada cambio del flete o de las líneas.
- En la [Rentabilidad por venta](/informes/rentabilidad), cada unidad vendida desde el depósito Full resta el flete por unidad del último envío de ese producto a esa cuenta despachado hasta el día de la venta (si la venta es anterior a todos, el del primero).

## Preguntas frecuentes

**Cargué el número del envío de Mercado Libre y no trajo nada. ¿Está bien?**
Sí. Mercado Libre no deja leer el contenido de un envío desde otro sistema; el número queda de referencia. Los productos se cargan en el sistema (a mano o tildando los sugeridos), con las mismas cantidades que en Mercado Libre.

**¿A qué publicación conviene mandar?**
Al código de Full que más vende, que suele ser el de la Clásica con su gemela de catálogo (compite en la página del producto). Lo que mandás lo venden sólo las publicaciones de ese código; los otros planes del producto siguen saliendo del depósito propio.

**¿Tengo que crear el envío también en Mercado Libre?**
Sí. Mercado Libre no deja crearlo desde otro sistema. Armalo acá (con la sugerencia y las etiquetas) y copiá los productos y cantidades en la Central de vendedores.

**¿Por qué después de despachar no veo esas unidades en el depósito propio?**
Porque están «En camino a Full». Se ven en la [Consulta de stock](/stock/consulta), en el depósito «En camino a Full».

**¿Cuándo pasan a Full?**
Cuando Mercado Libre las cuenta en su depósito. Puede tardar unos días desde el turno de entrega.

**La pestaña Stock en Full muestra una diferencia.**
Se iguala sola en la próxima lectura si lo que dice Mercado Libre no cambia en 10 minutos. Si dice «Error» en Lectura, Mercado Libre no contestó para ese código.

**¿El flete afecta el costo del producto?**
No cambia el costo del producto: se resta aparte, como «Flete a Full», en la rentabilidad de lo que se vende desde Full.

## Relacionado

- [Etiquetas › Full](/deposito/etiquetas/full)
- [Consulta de stock](/stock/consulta)
- [Depósitos y ubicaciones](/stock/depositos)
- [Facturas de compra](/compras/facturas)
- [Rentabilidad por venta](/informes/rentabilidad)
- [Canales](/config/canales)
