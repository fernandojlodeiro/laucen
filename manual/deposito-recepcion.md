---
titulo: Recepción
menu: Stock › Recepción
ruta: /deposito/recepcion
rutas: /deposito/recepcion, /deposito/recepcion/[id]
permiso: recepcion_ver
resumen: Recibir mercadería (compras, devoluciones u otras entradas) escaneando cada producto y eligiendo la ubicación; cada línea suma stock al momento.
---

## Para qué sirve

Es la pantalla del depósito para hacer entrar mercadería al stock: lo que llega de un proveedor, lo que devuelve un cliente o cualquier otra entrada. Se arma una **recepción**, se escanea cada producto, se dice cuántos y en qué ubicación se guardan, y cada línea suma stock en el momento. Al terminar se cierra la recepción.

Está pensada para usarse desde el celular, con la cámara o con una pistola lectora.

## Cómo se llega

- Menú **Stock › Recepción**.
- En el celular, el acceso **"Recepción"** (📥) de la barra de abajo.
- Cada recepción se abre tocando su tarjeta en la lista.

## Qué hay en la pantalla

### La lista (Recepción)

- Arriba a la derecha: **"Descargar Excel"** (con sus configuraciones de columnas; baja todas las recepciones) y **"Nueva recepción"**.
- El formulario de **"Nueva recepción"** (se abre sólo con ese botón):
  - **"Qué entra"**: **"Compra a proveedor"**, **"Devolución de un pedido"** u **"Otra entrada"**.
  - **"Depósito"**: los depósitos activos (no aparecen los de Full).
  - **"Proveedor (opcional)"**.
  - **"Nº de pedido (si es una devolución: el nuestro o el de Mercado Libre)"**.
  - **"Nº de remito o factura"**.
  - **"Nota"**.
  - Botón **"Crear"**.
- **Abiertas (N)**: las recepciones que todavía se están cargando.
- **Últimas cerradas**: las últimas 15 cerradas.

Cada tarjeta muestra "Recepción #N", el tipo (Compra a proveedor / Devolución de un pedido / Otra entrada), el depósito, el proveedor, el pedido y el remito, cuántas unidades en cuántas líneas, y desde cuándo está abierta o cuándo se cerró.

### Una recepción (Recepción #N)

- Subtítulo con el tipo, el depósito, el proveedor, el remito y la fecha. Si tiene nota, se ve debajo.
- **"Se espera que vuelva — pedido #N"** (sólo si la recepción tiene un pedido): las líneas de ese pedido con lo recibido sobre lo pedido; las completas se pintan de verde.
- **La zona de trabajo** (sólo si está abierta):
  - El lector **"Escaneá el producto"** (pistola, escribir y Enter, o **"📷 Cámara"**).
  - Al leer un producto aparece una caja con su foto, SKU y título, y:
    - **"Cantidad"**, con los botones **"−1"**, **"+1"** y **"+10"** (Enter en la cantidad también recibe).
    - **"Ubicación"**: muestra la elegida ("general" si no se eligió ninguna). Se elige escaneando la etiqueta de la estantería en **"Escaneá la etiqueta de la ubicación"** o con el buscador de ubicaciones de abajo ("General" o cualquiera de las del depósito).
    - En una devolución: **"¿Vuelve a la venta como nuevo o va a caja abierta?"** con **"Como nuevo"** y **"Caja abierta"**. Con caja abierta no se elige ubicación: avisa "Va a la ubicación general del depósito de caja abierta."
    - Botones **"Recibir N"** y **"Descartar"**.
- **"Recibido: N unidades en N líneas"**: la tabla de lo recibido, lo último primero, con Producto (enlace a la ficha), Ubicación (con la marca "caja abierta · depósito" si corresponde), Cant. y Hora.
- **"Cerrar recepción"** (sólo si está abierta), que pregunta antes. En una devolución avisa que el pedido queda "devuelto".
- Si está cerrada, la marca **"Cerrada"** y no se puede recibir más.

## Cómo se hace

### Recibir una compra a un proveedor

1. Apretá **"Nueva recepción"**.
2. En **"Qué entra"** dejá **"Compra a proveedor"**, elegí el **"Depósito"**, el **"Proveedor"** y anotá el **"Nº de remito o factura"**.
3. Apretá **"Crear"**. Se abre la recepción.
4. Escaneá el primer producto. Aparece su caja con cantidad 1.
5. Ajustá la cantidad: escaneando el mismo producto otra vez suma 1, o usá **"+1"**, **"+10"**, **"−1"** o escribila.
6. Elegí la ubicación: escaneá la etiqueta de la estantería o buscala en la lista. Si no elegís nada, va a la ubicación general.
7. Apretá **"Recibir N"** (o Enter en la cantidad). Suena el pitido de OK, aparece "Recibido: N × SKU en UBICACIÓN" y la línea se suma a la tabla. El stock ya entró.
8. Repetí con cada producto.
9. Al terminar, apretá **"Cerrar recepción"** y confirmá.

Después, cuando llega la factura, se carga en [Facturas de compra](/compras/facturas) vinculándola a esta recepción: así la factura pone el costo sin volver a sumar el stock.

### Recibir una devolución de un cliente

1. Apretá **"Nueva recepción"** y elegí **"Devolución de un pedido"**.
2. En **"Nº de pedido"** poné el número del pedido: sirve el nuestro o el de Mercado Libre (o de la tienda). Es obligatorio en una devolución.
3. Apretá **"Crear"**. Arriba aparece **"Se espera que vuelva"** con las líneas del pedido.
4. Escaneá cada producto que vuelve. Elegí **"Como nuevo"** (vuelve a la venta, a la ubicación que elijas) o **"Caja abierta"** (va a la ubicación general del depósito de caja abierta).
5. Apretá **"Recibir"**.
6. Al terminar, **"Cerrar recepción"**: pregunta "El pedido #N queda "devuelto". ¿Cerrar?" y, al confirmar, el pedido pasa a "devuelto".

### Otra entrada

Para cualquier entrada que no sea compra ni devolución (por ejemplo, mercadería que aparece o stock inicial): **"Qué entra" = "Otra entrada"**, y se recibe igual que una compra.

### Errores típicos

- "No hay ningún pedido con el número N." — revisá el número; sirve el nuestro o el externo.
- "En una devolución poné el número del pedido que vuelve."
- "No hay ningún producto con el código X." — el código de barras o el SKU no está cargado en ningún producto.
- "X es un kit: se recibe por sus componentes." — escaneá cada componente.
- "El depósito no tiene la ubicación X." — esa etiqueta es de otro depósito o la ubicación está archivada.
- "No hay ningún depósito de caja abierta: crealo en Stock → Depósitos." — hay que crear en [Depósitos y ubicaciones](/stock/depositos) un depósito de tipo "Caja abierta".
- "Esa recepción ya está cerrada."

## Criterios y reglas

- **Cada línea mueve stock al momento**, no al cerrar. En una compra u otra entrada, el movimiento es un **ingreso**; en una devolución, una **devolución**. Los dos quedan en [Movimientos de stock](/stock/movimientos) con la referencia "recepcion #N".
- **Ubicación**: la elegida, o la ubicación general del depósito si no se elige ninguna. Sólo se ofrecen las ubicaciones activas del depósito de la recepción.
- **Caja abierta**: en una devolución, lo que vuelve como "Caja abierta" va siempre a la ubicación general del primer depósito activo de tipo "Caja abierta" (no al depósito de la recepción), con la nota "caja abierta".
- **Kits**: no se reciben como kit; se reciben sus componentes. En la guía "Se espera que vuelva" la línea de un kit no se completa sola.
- **Producto**: se reconoce por código de barras o por SKU (sin importar mayúsculas). Si un código coincide con el código de barras de uno y el SKU de otro, gana el código de barras.
- **Cerrar** sólo cambia el estado de la recepción (y no se puede volver a abrir). En una devolución con pedido, además el pedido pasa a **"devuelto"** (salvo que ya estuviera devuelto o cancelado); eso libera lo que el pedido todavía tuviera reservado.
- **No cambia el costo**: la recepción sólo suma stock. El costo de cada producto (último y promedio) se actualiza al registrar la [factura de compra](/compras/facturas) o el [despacho de importación](/compras/despachos). Si la factura se vincula a la recepción, no vuelve a sumar stock.
- **Si llegó distinto de lo facturado**: al registrar la factura vinculada, la diferencia de unidades (las que faltaron o sobraron) se valoriza al costo de la factura y se asienta sola en "Diferencias en recepciones de stock" contra Mercaderías. Se ve en la ficha de la factura. El detalle, en [Facturas de compra](/compras/facturas).
- **Mercado Libre**: cada línea recibida avisa enseguida a Mercado Libre y a la tienda web el nuevo disponible (si el canal tiene prendida la sincronización de stock); si una publicación estaba pausada por falta de stock y ahora hay más que el umbral, se reactiva. El detalle está en [Consulta de stock](/stock/consulta).
- No se puede borrar una línea ya recibida. Para corregir un error, hacé un [ajuste](/stock/ajustes) con el motivo.

## Preguntas frecuentes

**¿El stock entra cuando cierro la recepción?**
No, entra en cada "Recibir". Cerrar sólo da por terminada la recepción (y en una devolución marca el pedido como devuelto).

**Me equivoqué de cantidad o de ubicación, ¿cómo lo corrijo?**
Las líneas no se borran. Hacé un ajuste (restar o transferir) en [Ajustes de stock](/stock/ajustes) con el motivo.

**¿Dónde va lo que vuelve con la caja abierta?**
A la ubicación general del depósito de tipo "Caja abierta". Si no existe, hay que crearlo.

**¿Puedo poner el número de pedido de Mercado Libre?**
Sí, sirve el nuestro o el de Mercado Libre / la tienda.

**¿Esto carga el costo del producto?**
No. El costo sale de la factura de compra o del despacho de importación.

**Escaneo la etiqueta del estante y dice que no existe.**
La ubicación tiene que ser del mismo depósito de la recepción y estar activa. Revisala en [Depósitos y ubicaciones](/stock/depositos).

**¿Cómo imprimo las etiquetas de los estantes?**
En [Etiquetas](/deposito/etiquetas/ubicaciones), pestaña "Ubicaciones".

## Relacionado

- [Facturas de compra](/compras/facturas)
- [Despachos de importación](/compras/despachos)
- [Pedidos](/ventas/pedidos) y [Reclamos y devoluciones](/ventas/reclamos)
- [Depósitos y ubicaciones](/stock/depositos)
- [Etiquetas](/deposito/etiquetas)
- [Movimientos de stock](/stock/movimientos)
