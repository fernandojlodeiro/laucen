---
titulo: Informes de stock
menu: Informes › Stock valorizado y Stock por ubicación
ruta: /informes/stock-valorizado
rutas: /informes/stock-valorizado, /informes/stock-por-ubicacion
permiso: informes_stock_ver
resumen: Stock valorizado (cada producto con su costo, su stock y el total en pesos y/o dólares) y stock por ubicación (qué hay adentro de cada estante), con descarga a Excel.
---

## Para qué sirve

Dos informes del inventario:

- **Stock valorizado**: cuánto vale la mercadería. Cada producto con su costo, su stock y el stock por el costo, y el total al final. Se puede ver en pesos, en dólares o en las dos, y con tres bases de costo distintas.
- **Stock por ubicación**: qué hay adentro de cada ubicación (una o todas), con el total de unidades de cada una. Sirve para controlar un estante o preparar un conteo.

Los dos tienen **"Descargar Excel"**, que baja exactamente lo mismo con los mismos filtros.

## Cómo se llega

- Menú **Informes › Stock valorizado**.
- Menú **Informes › Stock por ubicación**.

## Qué hay en la pantalla

### Stock valorizado

- Subtítulo: aclara que los kits no entran y con qué tipo de cambio se convierte ("Convertido con el tipo de cambio oficial de <fecha>: $ … por dólar"), o avisa que no hay tipo de cambio cargado.
- Arriba a la derecha: **"Descargar Excel"**.
- Filtros:
  - Buscador "SKU o descripción" (busca mientras escribís, con **"Comienza por"** y **"Mostrar inactivos"**).
  - **"Depósito"**: Todos o uno.
  - **"Costo"**: **"Costo FOB"** (el de entrada), **"Costo promedio (USD)"** o **"Último costo (USD)"**.
  - **"Moneda"**: **"Pesos"** (el de entrada), **"Dólares"** o **"Ambas"**.
  - Interruptor **"Sólo con stock"** (prendido de entrada): apagado, muestra también los productos con stock cero.
- Columnas: **Código** (enlace a la ficha del producto), **Descripción**, **Familia**, **Costo**, **Stock** y **Valorizado**. Con "Ambas", el costo y el valorizado van dos veces, en $ y en US$.
  - "sin costo" en ámbar: el producto no tiene ese costo cargado.
  - "sin TC": el costo está en la otra moneda y no hay tipo de cambio para convertirlo.
  - El stock negativo se pinta de rojo.
- Fila final **"Total stock valorizado"**, con el stock total y el valorizado total, y el aviso de cuántos productos no suman por no tener costo (o tipo de cambio).
- En pantalla se ven los primeros 500 productos; el total es siempre de todos y el Excel trae todos.

### Stock por ubicación

- Arriba a la derecha: **"Descargar Excel"**.
- Filtros:
  - **"Depósito"** (sólo si hay más de uno): Todos o uno. Al cambiarlo se borra la ubicación elegida.
  - **"Ubicación"**: con buscador; "Todas" o una (de los depósitos activos que usan ubicaciones, más la general de cada uno).
  - Buscador "Producto: SKU o descripción", con "Comienza por".
- La tabla, agrupada por ubicación en el orden de recorrido: una fila de título por ubicación (depósito si hay varios, código y descripción) con el total de unidades, y debajo cada producto con **Código** (enlace a la ficha), **Producto**, **Cantidad** y **Reservado**.
- Fila final **"Total (N ubicaciones)"** con el total de unidades.
- En pantalla, las primeras 2.000 filas; el total es de todas y el Excel trae todas.

## Cómo se hace

### Saber cuánto vale el stock en pesos

1. Entrá a **Informes › Stock valorizado**.
2. Dejá **"Costo"** en la base que quieras (por ejemplo **"Costo promedio (USD)"** para el costo puesto en depósito) y **"Moneda" = "Pesos"**.
3. Mirá la fila **"Total stock valorizado"**. Si avisa productos sin costo, esos no están sumados.

### Ver el valor de un solo depósito

Elegí el depósito en **"Depósito"**.

### Bajar el valorizado a Excel

Poné los filtros y apretá **"Descargar Excel"**. El Excel trae Código, Descripción, Familia, **Moneda del costo**, el costo (en la o las monedas elegidas), Stock y Valorizado, el total y, al pie, el tipo de cambio usado.

### Controlar un estante

1. Entrá a **Informes › Stock por ubicación**.
2. Elegí el depósito y la ubicación.
3. Compará con lo que hay físicamente. Si no coincide, corregí en [Ajustes de stock](/stock/ajustes).

### Ver en qué ubicaciones está un producto

En **Stock por ubicación**, dejá "Ubicación" en "Todas" y buscá el producto por SKU o descripción.

## Criterios y reglas

### Cómo se valoriza

- **Valorizado = costo × stock**, por producto (variación). El total es la suma de los valorizados de los productos que tienen costo.
- **Stock** = la cantidad física (sin descontar lo reservado) de los depósitos activos, o del depósito elegido. Un producto con stock negativo resta.
- **Los kits no entran**: su stock está en los componentes, que sí entran con su propio costo.
- Los productos archivados no entran salvo con "Mostrar inactivos"; las variaciones archivadas no entran nunca.

### Las tres bases de costo

- **Costo FOB**: el que se carga a mano en la ficha del producto, en dólares o en pesos (cada producto en su moneda).
- **Último costo (USD)**: el costo puesto en depósito de la última compra registrada, en dólares.
- **Costo promedio (USD)**: el promedio ponderado del costo puesto en depósito, en dólares. Se recalcula en cada compra: (stock que había × promedio anterior + cantidad comprada × costo nuevo) ÷ (stock que había + cantidad comprada). Si el stock que había era cero o negativo (o no había promedio), el promedio pasa a ser el costo de esa compra.
- El último y el promedio se actualizan **sólo** al registrar una [factura de compra](/compras/facturas) o un [despacho de importación](/compras/despachos). En el despacho, el costo de cada línea es su FOB más su parte (proporcional al FOB) del flete, el seguro y los gastos. Los ajustes, las recepciones y las devoluciones no cambian el costo.

### Conversión de moneda

- Cada costo se pasa a la otra moneda con el **tipo de cambio oficial (venta) de hoy** cargado en [Tipo de cambio](/config/tipo-cambio). Pesos = dólares × tipo de cambio; dólares = pesos ÷ tipo de cambio.
- Si no hay tipo de cambio, los costos que están en la otra moneda quedan sin convertir ("sin TC") y no suman en esa moneda.
- Redondeo: el costo convertido se guarda con 4 decimales y el valorizado con 2.

### Stock por ubicación

- Muestra cada producto en cada ubicación donde tenga cantidad o reservado distinto de cero, sólo de depósitos activos.
- Orden: depósito, la ubicación general primero, después por orden de recorrido y código, y dentro de cada ubicación por SKU.
- Los totales son de unidades físicas (cantidad), no del disponible.

## Preguntas frecuentes

**¿Por qué el total no coincide con la suma que hago a mano?**
Los productos sin costo (o sin tipo de cambio para convertir) no suman; el total avisa cuántos son. Además, la pantalla muestra sólo los primeros 500, pero el total es de todos.

**¿Qué costo conviene usar?**
Para saber cuánto vale lo que hay, el **promedio** (es el costo puesto en depósito de las compras). El **FOB** es el que se carga a mano en el producto.

**¿Por qué un producto dice "sin costo"?**
No tiene cargado el costo de esa base: el FOB se carga en la ficha del producto; el último y el promedio aparecen cuando se registra una compra o un despacho.

**¿Con qué tipo de cambio convierte?**
Con el oficial de venta de hoy, cargado en [Tipo de cambio](/config/tipo-cambio). La fecha y el valor se ven en el subtítulo.

**¿Por qué no aparecen los kits?**
Porque no tienen stock propio; su valor está en los componentes.

**¿El stock del informe descuenta lo reservado?**
No, es la cantidad física. Lo reservado se ve en [Stock por ubicación](/informes/stock-por-ubicacion) y en la [Consulta de stock](/stock/consulta).

## Relacionado

- [Consulta de stock](/stock/consulta)
- [Productos](/catalogo/productos) (costo FOB)
- [Facturas de compra](/compras/facturas) y [Despachos de importación](/compras/despachos) (costo promedio y último)
- [Tipo de cambio](/config/tipo-cambio)
- [Depósitos y ubicaciones](/stock/depositos)
- [Ajustes de stock](/stock/ajustes)
