---
titulo: Cuentas corrientes
menu: Administración › Cuentas corrientes
ruta: /administracion/cuentas-corrientes
rutas: /administracion/cuentas-corrientes, /administracion/cuentas-corrientes/proveedores
permiso: cuentas_corrientes_ver
resumen: Saldos de clientes y proveedores, estado de cuenta, recibos de cobro, órdenes de pago, imputaciones y saldo inicial.
---

## Para qué sirve

Muestra lo que nos deben los clientes y lo que les debemos a los proveedores, en pesos. Por cada cliente o proveedor se ve su estado de cuenta (facturas, notas de crédito, cobros, pagos) con el saldo acumulado, y desde ahí se emiten **recibos** (cobros a clientes) y **órdenes de pago** (pagos a proveedores), se imputa a mano un pago contra una deuda y se carga el saldo con que arranca la cuenta.

## Cómo se llega

- Menú **Administración › Cuentas corrientes**. Abre la pestaña **Clientes**.
- La pestaña **Proveedores** está en la misma pantalla.
- Desde otras pantallas, un enlace puede abrir directamente la cuenta de un cliente o proveedor.

## Qué hay en la pantalla

Título "Cuentas corrientes" y la aclaración "Lo que nos deben los clientes y lo que les debemos a los proveedores (en pesos)".

### Pestañas

- **Clientes (N)** y **Proveedores (N)**: el número es cuántos clientes o proveedores tienen algún movimiento en cuenta corriente.

### La lista de saldos (sin nadie elegido)

- **"Descargar Excel"** con sus configuraciones (columnas: N.º, Cliente/Proveedor, Saldo $, Vencido $, Último movimiento).
- **"Nos deben"** (clientes) o **"Les debemos"** (proveedores): la suma de todos los saldos.
- **"Vencido"**: la suma de lo vencido (en rojo si hay).
- **"Abrir la cuenta de otro cliente/proveedor"**: un cuadro para escribir el nombre y el botón **"Buscar"**. Muestra hasta 20 coincidencias como enlaces; tocando uno se abre su cuenta (aunque todavía no tenga movimientos).
- Tabla, ordenable tocando el título: **Cliente/Proveedor** (enlace a su cuenta), **Saldo**, **Vencido**, **Último movimiento**. De a 50 filas con paginador.

### El estado de cuenta (con un cliente o proveedor elegido)

- Arriba: "Clientes › Nombre" (o "Proveedores › Nombre"), el **Saldo** con la leyenda "nos debe" o "le debemos", y el **Vencido** si hay.
- Botones: **"Nuevo recibo"** (clientes) o **"Nueva orden de pago"** (proveedores), y **"Saldo inicial"**. Cada uno abre su formulario debajo; tocándolo de nuevo se cierra.
- Tabla de movimientos: **Fecha**, **Vence** (en rojo si está vencido y pendiente), **Concepto** (si es una factura de venta o de compra, enlace al documento), **Importe** (en pesos; si el documento es en dólares, debajo el importe en US$), **Pendiente** (lo que falta cancelar de ese renglón, en su moneda; "—" si está saldado) y **Saldo** acumulado.
- **"Imputar a mano"**: aparece sólo si hay a la vez deudas y créditos pendientes. Campos **Deuda pendiente**, **Crédito pendiente**, **Importe** y botón **"Imputar"**.
- Tabla **Recibos** (u **Órdenes de pago**): Número ("Recibo 12"), Fecha, Total, Estado (Emitido / Anulado), Notas y el botón **"Anular"**, que pregunta ahí mismo "¿Anular?".

### Formulario de recibo u orden de pago

- **Fecha** (hoy por defecto) y **Notas**.
- **Medios**: hasta 4 renglones, cada uno con la cuenta de fondos ("a qué cuenta entra" en un recibo, "de qué cuenta sale" en una orden de pago) y el importe. Al lado se ve si la cuenta es en $ o US$.
- **Retenciones**: hasta 3 renglones con **Concepto** (ej. "Ret. IIBB") e importe en pesos. En un recibo son "Retenciones que nos hicieron"; en una orden de pago, "Retenciones que practicamos".
- **Total**: se va sumando en pesos mientras escribís. Si un medio es en dólares y no hay tipo de cambio del día, avisa "no hay tipo de cambio de hoy".
- Botón **"Emitir recibo"** o **"Emitir orden de pago"**.
- Si no hay cuentas de fondos activas: "No hay cuentas de fondos activas: cargalas en Caja y bancos."

### Formulario de saldo inicial

**Fecha**, **Importe (pesos)**, la opción **Nos debe** / **Le debemos** y el botón **"Cargar saldo inicial"**.

## Cómo se hace

### Cobrarle a un cliente (recibo)

1. Pestaña **Clientes**, tocá el cliente (o buscalo en "Abrir la cuenta de otro cliente").
2. Apretá **"Nuevo recibo"**.
3. Poné la fecha, y en **Medios** elegí la cuenta donde entra la plata (caja, banco, Mercado Pago…) y el importe. Si pagó con varios medios, usá un renglón por cada uno.
4. Si te hicieron retenciones, cargalas con su concepto e importe.
5. Apretá **"Emitir recibo"**. Aviso: "Recibo N emitido."

El recibo entra como crédito en la cuenta del cliente, se imputa solo contra sus deudas más viejas y cada medio deja su movimiento en [Caja y bancos](/administracion/tesoreria).

### Pagarle a un proveedor (orden de pago)

Igual que el recibo, en la pestaña **Proveedores**, con **"Nueva orden de pago"** y **"Emitir orden de pago"**. Los medios dicen de qué cuenta sale la plata; las retenciones son las que le practicamos al proveedor.

### Anular un recibo u orden de pago

1. En la tabla de **Recibos** (u **Órdenes de pago**) de la cuenta, apretá **"Anular"** y confirmá con **"Sí"**.
2. Se borran sus movimientos de fondos, su crédito de la cuenta corriente (devolviendo lo que había cancelado) y se anula su asiento contable.

Si alguno de sus movimientos ya está conciliado con el extracto del banco, no deja: "Tiene movimientos ya conciliados con el extracto: desconciliálos primero." (se desconcilia en la pestaña Conciliación de la cuenta, en [Caja y bancos](/administracion/tesoreria)).

### Imputar a mano

Sirve cuando querés que un pago cancele una factura en particular y no la más vieja.

1. En **"Imputar a mano"**, elegí la **Deuda pendiente** y el **Crédito pendiente**.
2. Poné el **Importe** y apretá **"Imputar"**.

Errores: "El importe a imputar tiene que ser mayor que cero.", "El importe pasa lo que queda pendiente.", "Esos movimientos no son de la misma cuenta."

### Cargar el saldo con que arranca una cuenta

1. Abrí la cuenta y apretá **"Saldo inicial"**.
2. Poné la fecha, el importe en pesos y elegí **Nos debe** o **Le debemos**.
3. Apretá **"Cargar saldo inicial"**.

Hace falta que haya tipo de cambio cargado para esa fecha; si no: "No hay tipo de cambio para el dd/mm/aaaa." (se carga en [Tipo de cambio](/config/tipo-cambio)).

## Criterios y reglas

### Qué entra solo a la cuenta corriente

- **Clientes**: las facturas y notas de crédito de venta **autorizadas por ARCA** de clientes que tienen tildado **"Cuenta corriente"** en su ficha, o de pedidos con pago **«a convenir»**. Las pasa un proceso periódico de Laucen (hasta cada 2 minutos si hay algo pendiente, y como red de seguridad a los minutos 1 y 31 de cada hora). La factura suma deuda; la nota de crédito, crédito. Vencimiento: la fecha del comprobante.
  - Los clientes sin cuenta corriente (por ejemplo, las ventas de Mercado Libre ya cobradas) **no** pasan por acá.
- **Proveedores**: cada factura, nota de débito o nota de crédito de compra, en el momento en que se **registra** en [Facturas de compra](/compras/facturas). Vencimiento: el que tiene la factura, o su fecha si no tiene. Si la factura es en dólares, el renglón queda en dólares (con su equivalente en pesos al tipo de cambio de la factura).
- **Recibos y órdenes de pago**: al emitirlos.
- **Saldo inicial**: cuando se carga.

### Signos

En las dos pestañas, **un saldo positivo es lo "normal"**: en clientes, que nos deben; en proveedores, que les debemos. Un saldo negativo es al revés (le debemos a un cliente, o un proveedor nos debe, por ejemplo por un pago adelantado).

### Cómo se imputa solo

Cada vez que entra un documento, Laucen cancela los créditos pendientes de esa cuenta contra las deudas pendientes **de la más vieja a la más nueva** (ordenadas por vencimiento, o por fecha si no tienen), y los créditos también del más viejo al más nuevo. Lo que queda sin cancelar se ve en la columna **Pendiente**. La imputación a mano permite elegir otra.

### Saldo y vencido

- **Saldo** = la suma en pesos de todos los renglones de la cuenta.
- **Vencido** = lo pendiente de las deudas cuyo vencimiento (o fecha, si no tiene) ya pasó, llevado a pesos con la misma proporción del documento.
- En la lista aparecen las cuentas con saldo distinto de cero **o** con algún movimiento en los últimos 90 días. Ordenadas de mayor a menor saldo.

### Recibo y orden de pago

- Hace falta **al menos un medio con importe** ("Cargá al menos un medio con importe."). Cada medio con importe necesita su cuenta ("Elegí la cuenta de cada medio con importe."); cada retención con importe necesita su concepto ("Poné el concepto de cada retención.").
- Sólo se ofrecen cuentas de fondos **activas**.
- **Todo se lleva a pesos**: un medio en una cuenta en dólares suma su importe × el tipo de cambio de la fecha del recibo. Las retenciones van en pesos y suman al total.
- Total del recibo = medios (en pesos) + retenciones.
- Se necesita tipo de cambio de la fecha del recibo (también para guardar el equivalente en dólares).
- **Numeración**: correlativa, una para recibos y otra para órdenes de pago, empezando en 1.
- Cada medio deja un movimiento en su cuenta de fondos (entra en un recibo, sale en una orden de pago) con el concepto "Recibo N · Cliente" u "Orden de pago N · Proveedor". Esos movimientos no se borran sueltos desde Caja y bancos: se anula el recibo.
- El asiento contable lo genera solo [Contabilidad](/administracion/contabilidad): en un recibo, fondos + retenciones sufridas contra Deudores por ventas; en una orden de pago, Proveedores contra fondos + Retenciones a depositar.

### Saldo inicial

Se guarda en pesos, con vencimiento en su misma fecha, y se imputa como cualquier otro renglón.

## Preguntas frecuentes

**¿Por qué un cliente no aparece en cuenta corriente?**
Sus ventas entran solas sólo si tiene tildado "Cuenta corriente" en su ficha o el pedido fue «a convenir», y la factura está autorizada. Si no, igual podés abrir su cuenta con "Abrir la cuenta de otro cliente" y cargarle un saldo inicial o un recibo.

**Un cliente me pagó una factura en particular, no la más vieja.**
Ojo: al emitir el recibo, Laucen ya lo imputa solo contra la deuda más vieja, y hoy no hay forma de deshacer una imputación. "Imputar a mano" sirve para lo que quedó pendiente (por ejemplo, un crédito que sobró después de la imputación automática).

**¿Puedo cobrar en dólares?**
Sí, eligiendo una cuenta de fondos en dólares como medio: el recibo suma su equivalente en pesos al tipo de cambio de la fecha.

**¿Cómo cargo lo que me debían antes de usar Laucen?**
Con "Saldo inicial" en la cuenta de cada cliente o proveedor.

**Me equivoqué en un recibo.**
Anulalo con "Anular" y emitilo de nuevo. Si ya está conciliado con el banco, primero desconcilialo.

**¿Por qué no deja emitir un recibo con fecha de otro día?**
Probablemente no hay tipo de cambio cargado para esa fecha. Cargalo en Tipo de cambio.

**¿Las ventas de Mercado Libre van a cuenta corriente?**
No, salvo que el cliente tenga cuenta corriente habilitada. Su cobro se registra solo en la contabilidad.

## Relacionado

- [Caja y bancos](/administracion/tesoreria)
- [Facturación](/administracion/facturacion)
- [Facturas de compra](/compras/facturas)
- [Clientes](/ventas/clientes)
- [Proveedores](/compras/proveedores)
- [Contabilidad](/administracion/contabilidad)
- [Tipo de cambio](/config/tipo-cambio)
