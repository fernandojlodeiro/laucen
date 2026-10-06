---
titulo: Movimientos de stock
menu: Stock › Movimientos de stock
ruta: /stock/movimientos
rutas: /stock/movimientos
permiso: stock_ver
resumen: El historial de cada entrada, salida, reserva y transferencia de stock, con filtros y descarga a Excel.
---

## Para qué sirve

Es el historial completo del stock: cada vez que algo entra, sale, se reserva, se libera o cambia de lugar, queda un movimiento con la fecha, el producto, de dónde a dónde, la cantidad, qué lo originó (un pedido, una recepción, un ajuste…), una nota y quién lo hizo. Sirve para responder "¿por qué este producto tiene este stock?" o "¿quién movió esto?".

## Cómo se llega

- Menú **Stock › Movimientos de stock**.
- Desde [Consulta de stock](/stock/consulta): abriendo un producto, el botón **"Ver todos los movimientos"** entra ya filtrado por ese producto.

## Qué hay en la pantalla

### Arriba a la derecha

- **"Consulta de stock"**: vuelve a la consulta (con el producto abierto, si estabas filtrando uno).
- **"Descargar Excel"**: baja los movimientos con los mismos filtros de la pantalla.

### Filtros

- **Producto**: un buscador ("Producto: SKU o descripción") que busca mientras escribís, con la caja **"Comienza por"** (tildada de entrada) y la X para borrar. Busca en el SKU, en el título, en el SKU del kit y en los datos del movimiento (número, tipo, referencia y nota). Si entraste desde la Consulta con un producto, en lugar del buscador aparece "Producto: SKU · título" con una **"×"** para sacar ese filtro.
- **Fechas**: el selector de rango con atajos (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año) y las dos fechas; de entrada, **"Todas las fechas"**. Los días se toman en hora argentina y la fecha "hasta" se incluye entera.
- **"Tipo"**: Todos los tipos, Ingreso, Egreso, Transferencia, Ajuste, Reserva, Liberación, Venta, Devolución.
- **"Usuario"**: todos los que alguna vez movieron stock, incluido "Sistema".
- **"Depósito"** (sólo si hay más de uno): deja los movimientos que salen o entran a ese depósito.

### La tabla

Columnas: **Fecha** (día y hora), **Tipo**, **SKU** (enlace a la ficha del producto; si el movimiento salió de vender o reservar un kit, debajo dice "del kit …"), **Producto**, **Origen**, **Destino** (como "Depósito · ubicación", la general como "General"), **Cantidad**, **Referencia** (por ejemplo "pedido #123", "recepcion #8", "factura compra #5", "despacho #2", "ajuste manual #…"), **Nota** y **Usuario**.

Se ven de a 50, los más nuevos primero, con **"← Anterior"** y **"Siguiente →"** abajo y el número de página.

## Cómo se hace

### Ver por qué un producto tiene el stock que tiene

1. En [Consulta de stock](/stock/consulta), abrí el producto y apretá **"Ver todos los movimientos"**.
2. Recorré los movimientos de los más nuevos a los más viejos. Las cantidades se leen con el tipo: un ingreso suma, un egreso o una venta resta, etc. (ver la tabla de abajo).

### Ver qué hizo una persona

Elegí su nombre en **"Usuario"** y, si querés, un rango de fechas.

### Ver todos los ajustes de un mes

Elegí **"Tipo" = Ajuste** y en las fechas el atajo **"Último mes"** (o "Este mes").

### Bajar los movimientos a Excel

Poné los filtros que quieras y apretá **"Descargar Excel"**. Trae las mismas columnas (más una columna **Kit**) con todas las filas, no sólo la página que se ve, hasta 50.000; si hay más, al pie dice "Sólo los 50.000 más nuevos: afiná las fechas para bajar el resto."

## Criterios y reglas

### Qué hace cada tipo de movimiento

La **Cantidad** siempre se muestra positiva; el efecto depende del tipo:

- **Ingreso**: suma en el destino. Lo generan las compras (factura de compra, despacho de importación) y las recepciones de compra u otra entrada.
- **Egreso**: resta del origen (consumo, baja).
- **Transferencia**: resta del origen y suma en el destino.
- **Ajuste**: suma en el destino o resta del origen (tiene uno solo de los dos). Se carga en [Ajustes de stock](/stock/ajustes), con motivo.
- **Reserva**: no cambia la cantidad; suma al reservado del origen. La genera un pedido al pasar a pagado (o al crearse, si es «A cobrar» o a convenir).
- **Liberación**: resta del reservado del origen. La genera un pedido cancelado o devuelto que todavía tenía reserva.
- **Venta**: resta del origen la cantidad y la reserva. La genera el pedido al despacharse.
- **Devolución**: suma en el destino. La genera la recepción de una devolución.

### Otros criterios

- **Kits**: un kit no tiene movimientos propios; al reservarlo o venderlo se mueven sus componentes y cada movimiento lleva "del kit …". Filtrando por un kit (desde la Consulta) se ven los movimientos de sus componentes.
- **Usuario "Sistema"**: lo hizo un proceso automático (por ejemplo, un pedido que entró de Mercado Libre y se reservó solo).
- **Referencia**: dice qué documento originó el movimiento y su número; sirve para buscar ese pedido, recepción o factura.
- Un movimiento no se borra ni se edita. Para corregir, se hace un ajuste.
- El filtro de depósito toma tanto los movimientos que salen como los que entran a ese depósito.

## Preguntas frecuentes

**¿Por qué una reserva no cambia la cantidad?**
Porque la mercadería sigue en el estante; sólo queda apartada para un pedido. Cambia el disponible, no la cantidad.

**¿Qué significa "del kit X" debajo del SKU?**
Que ese componente se movió porque se vendió o reservó el kit X.

**¿Puedo borrar un movimiento equivocado?**
No. Hacé un ajuste en sentido contrario en [Ajustes de stock](/stock/ajustes).

**¿El Excel trae sólo la página que veo?**
No, trae todas las filas que pasan los filtros (hasta 50.000).

**¿Qué es "Sistema" en Usuario?**
Un movimiento automático, sin una persona detrás (por ejemplo, la reserva de una venta de Mercado Libre).

**¿Dónde veo cuánto queda después de un movimiento?**
Esta pantalla no muestra saldos; el saldo actual está en [Consulta de stock](/stock/consulta).

## Relacionado

- [Consulta de stock](/stock/consulta)
- [Ajustes de stock](/stock/ajustes)
- [Recepción](/deposito/recepcion)
- [Pedidos](/ventas/pedidos)
- [Facturas de compra](/compras/facturas) y [Despachos de importación](/compras/despachos)
