---
titulo: Caja y bancos
menu: Administración › Caja y bancos
ruta: /administracion/tesoreria
rutas: /administracion/tesoreria, /administracion/tesoreria/[id], /administracion/tesoreria/[id]/conciliacion
permiso: tesoreria_ver
resumen: Las cuentas donde está la plata (caja, bancos, Mercado Pago) con su saldo; movimientos sueltos, transferencias y conciliación con el extracto.
---

## Para qué sirve

Lleva las cuentas de fondos de la empresa: cajas, cuentas bancarias, Mercado Pago u otras, en pesos o en dólares. Por cada cuenta se ve su saldo y sus movimientos, se cargan gastos o ingresos sueltos, se hacen transferencias entre cuentas propias y se concilia contra el extracto del banco.

**Las cuentas de Mercado Pago de Mercado Libre y de la tienda web se crean solas**: no hay una "Mercado Pago" general para crear. Cada cuenta de Mercado Libre conectada a un canal trae su propia cuenta de fondos "Mercado Pago — <apodo>", y el Mercado Pago conectado en el checkout de la tienda trae "Mercado Pago — Tienda web" (ver Criterios). Otra cuenta de Mercado Pago que no sea ninguna de ésas se crea a mano con tipo Mercado Pago.

**Lo que se cobra de los pedidos entra solo** en su cuenta de Mercado Pago, como un movimiento "Cobro del pedido …" con enlace al pedido.

Los cobros y pagos a clientes y proveedores no se cargan acá: se hacen con recibos y órdenes de pago en [Cuentas corrientes](/administracion/cuentas-corrientes), y sus movimientos aparecen solos en la cuenta elegida.

## Cómo se llega

- Menú **Administración › Caja y bancos**.
- Desde la lista, el nombre, el saldo o el número de "Sin conciliar" de una cuenta abren su detalle. La cuenta contable de cada cuenta de fondos lleva a su mayor en [Contabilidad](/administracion/contabilidad).

## Qué hay en la pantalla

### La lista de cuentas

- Arriba a la derecha: **"Descargar Excel"** (con sus configuraciones) y **"Nueva cuenta"**.
- **Total en pesos** (y **en dólares**, si hay cuentas en dólares): la suma de los saldos de las cuentas **activas**, sin importar lo que se esté buscando.
- Buscador **"Buscar por nombre, banco, CBU o alias"**, con la caja **"Comienza por"** y la X para borrar.
- Tabla, ordenable tocando el título:
  - **Cuenta**: el nombre (enlace a sus movimientos) y, debajo, "Cobra las ventas de <canal>" (enlace al canal) en las de Mercado Pago de una cuenta de ML o de la tienda, y "Saldo inicial $ … al dd/mm/aaaa" si tiene.
  - **Tipo**: Caja, Banco, Mercado Pago u Otra, y la moneda ($ o US$).
  - **Banco · CBU · Alias**.
  - **Cuenta contable**: la elegida (enlace a su mayor en Contabilidad) o "La de su tipo".
  - **Saldo**.
  - **Sin conciliar**: cuántos movimientos faltan conciliar (enlace a la cuenta).
  - **Activa**: un interruptor.
  - El **lápiz** (edita la fila ahí mismo, con **"Guardar"** y **"Cancelar"**) y el **tacho** (pregunta "¿Borrar?" con Sí / No).
- Al pie: "Una cuenta con movimientos no se borra: el tacho la desactiva."

### Campos de una cuenta (alta y edición)

**Nombre** (ej. Banco Galicia), **Tipo** (Caja, Banco, Mercado Pago, Otra), **Moneda** (Pesos / Dólares), **Banco**, **CBU**, **Alias**, **Saldo inicial**, **Al día** (fecha del saldo inicial) y **Cuenta contable** ("— La de su tipo —" o una cuenta imputable del plan). En el alta, el botón es **"Crear"**.

### El detalle de una cuenta

Arriba: "Caja y bancos › Nombre" (y "(desactivada)" si lo está), el **Saldo** y **Sin conciliar**. Dos pestañas: **Movimientos (N)** y **Conciliación (N)** (N = movimientos sin conciliar).

**Pestaña Movimientos**:
- Recuadro **Movimiento**: **Fecha**, **Entra** / **Sale** (por defecto Sale), **Importe** (en la moneda de la cuenta), **Concepto** (ej. "Comisión del banco"), **Cuenta contable (contrapartida)** y botón **"Cargar"**.
- Recuadro **Transferencia**: **Fecha**, **A la cuenta** (las otras cuentas activas), **Sale** (importe en la moneda de esta cuenta), **Entra (si es otra moneda)** (vacío = al tipo de cambio del día) y botón **"Transferir"**.
- Filtro de fechas desde/hasta con atajos ("Todas las fechas" si no se elige).
- Tabla: **Fecha**, **Concepto** (en el cobro de un pedido, enlace al pedido), **Importe** (verde con "+" si entra, rojo si sale), **Saldo** acumulado, **Conciliado** (✓) y el **tacho** en los movimientos sueltos y transferencias no conciliados. Muestra los últimos 500; para ver más atrás, usá el filtro de fechas.

**Pestaña Conciliación**:
- **Extracto (CSV)**: elegir el archivo y **"Subir extracto"**.
- **"Conciliar automático"**.
- **Extracto sin conciliar (N)**: cada línea del banco, y debajo dos acciones: un desplegable con los movimientos sin conciliar del mismo signo y el botón **"Unir"**; o un desplegable **"— Cuenta contable —"** y el botón **"Crear movimiento"**.
- **Movimientos sin conciliar (N)**: los de Laucen que todavía no se unieron con una línea del extracto. El cobro de un pedido muestra su concepto como enlace al pedido.
- **Ya conciliadas (N)**: línea del extracto, movimiento unido (el cobro de un pedido, con enlace al pedido), importe y el botón **"Desunir"**.

## Cómo se hace

### Dar de alta una cuenta

1. Apretá **"Nueva cuenta"** (arriba a la derecha).
2. Completá nombre, tipo y moneda; si es un banco, banco, CBU y alias.
3. Si la cuenta ya tenía plata, poné el **Saldo inicial** y la fecha en **Al día**.
4. Dejá **Cuenta contable** en "La de su tipo" salvo que el contador quiera otra. En una de tipo Mercado Pago, "La de su tipo" quiere decir que Laucen le crea su propia cuenta contable ("Mercado Pago — <nombre>", en Disponibilidades).
5. Apretá **"Crear"**.

### Cargar un gasto o un ingreso suelto

1. Abrí la cuenta (tocá su nombre).
2. En **Movimiento**, elegí **Sale** (gasto) o **Entra** (ingreso), la fecha, el importe y el concepto.
3. Elegí la **Cuenta contable (contrapartida)**: por ejemplo "Gastos bancarios" para una comisión, "Impuestos y tasas", "Fletes y envíos", etc.
4. Apretá **"Cargar"**.

### Transferir entre cuentas propias

1. Abrí la cuenta de donde sale la plata.
2. En **Transferencia**, elegí **A la cuenta**, la fecha y el importe que **Sale**.
3. Si las dos cuentas son de distinta moneda (por ejemplo, de pesos a dólares), poné en **Entra (si es otra moneda)** lo que efectivamente entró; si lo dejás vacío, se calcula al tipo de cambio del día.
4. Apretá **"Transferir"**. Se crean dos movimientos: "Transferencia a …" en la de origen y "Transferencia desde …" en la de destino.

### Borrar un movimiento

Tocá el **tacho** del movimiento y confirmá. En una transferencia pregunta "¿Borrar las dos patas?" y borra las dos. Sólo se pueden borrar movimientos sueltos y transferencias que **no estén conciliados**; los de un recibo u orden de pago se deshacen anulando el recibo en [Cuentas corrientes](/administracion/cuentas-corrientes), y el cobro de un pedido no se borra a mano: se va solo si el pedido deja de estar cobrado.

### Conciliar con el extracto del banco

1. Bajá del banco (o de Mercado Pago) el extracto en CSV.
2. En la pestaña **Conciliación**, elegí el archivo y apretá **"Subir extracto"**. Aviso: "Leídas N, nuevas M."
3. Apretá **"Conciliar automático"**: une solas las líneas que coinciden. Aviso: "Unidas N." o "No encontré ninguna para unir sola."
4. Para lo que quedó en **Extracto sin conciliar**:
   - Si el movimiento existe en Laucen pero con otra fecha o no se unió solo: elegilo en el desplegable y apretá **"Unir"**.
   - Si no existe (una comisión, el impuesto al cheque…): elegí la cuenta contable y apretá **"Crear movimiento"**. Laucen crea el movimiento con la fecha, importe y descripción de la línea y lo deja conciliado.
5. Si uniste algo mal, en **Ya conciliadas** apretá **"Desunir"**.

### Desactivar o borrar una cuenta

- El interruptor **Activa** la apaga o prende. Una cuenta desactivada no se ofrece en recibos, órdenes de pago ni transferencias.
- El **tacho**: si la cuenta no tiene movimientos, se borra ("Borrada."); si tiene, queda desactivada ("Tiene movimientos: no se borra, quedó desactivada.").

## Criterios y reglas

### Saldo

- **Saldo de una cuenta** = saldo inicial + la suma de todos sus movimientos, en la moneda de la cuenta.
- El saldo acumulado de la tabla de movimientos arranca del saldo inicial y suma en orden de fecha.
- Los totales de arriba suman sólo las cuentas **activas**, separados por moneda.

### Moneda y tipo de cambio

- Cada movimiento se guarda en la moneda de su cuenta, y además se congela su equivalente en pesos y en dólares con el **tipo de cambio del día del movimiento**. Si no hay tipo de cambio para esa fecha, no deja cargar: "No hay tipo de cambio para el dd/mm/aaaa." (se carga en [Tipo de cambio](/config/tipo-cambio)).
- La **moneda de una cuenta no se puede cambiar si ya tiene movimientos**: "La cuenta ya tiene movimientos: no se le puede cambiar la moneda."

### Movimientos sueltos

- El importe no puede ser cero y el concepto es obligatorio.
- La cuenta contable elegida tiene que ser una cuenta imputable del plan.
- Si no se elige contrapartida, el asiento la pone sola: **Gastos varios** si sale plata, **Otros ingresos** si entra.

### Transferencias

- Origen y destino no pueden ser la misma cuenta, y el importe tiene que ser mayor que cero.
- Misma moneda: entra lo mismo que sale.
- Distinta moneda: entra lo que se ponga en "Entra"; si se deja vacío, se convierte al tipo de cambio del día (de dólares a pesos multiplica; de pesos a dólares divide).
- En la contabilidad, si por la conversión los pesos de las dos patas no coinciden, la diferencia va a **Otros ingresos** o **Gastos varios** como "Diferencia de cotización".

### Cuenta contable de cada cuenta de fondos

Si no se elige una, los asientos usan la del tipo: Caja → "Caja", Banco → "Bancos", Otra → "Caja". Una de **Mercado Pago** nunca queda sin cuenta propia: al crearla (o al guardarla) sin cuenta contable, Laucen le crea "Mercado Pago — <nombre>" (si el nombre ya empieza con "Mercado Pago", con ese mismo nombre) con el próximo código libre en Disponibilidades.

### Mercado Pago de cada cuenta de Mercado Libre

- Al **conectar una cuenta de Mercado Libre a un canal** ([Canales](/config/canales)), y una vez para las que ya estaban conectadas, se crea sola la cuenta de fondos **"Mercado Pago — <apodo de la cuenta de ML>"**, tipo Mercado Pago, en pesos, con su cuenta contable propia y atada a ese canal. Si ya había una cuenta de Mercado Pago creada a mano con ese mismo nombre, se usa ésa.
- Si la cuenta de ML se pasa a otro canal, su cuenta de Mercado Pago pasa a cobrar las ventas del canal nuevo.
- Lo cobrado de cada venta de ese canal (total − comisión) se asienta en la cuenta contable de esa cuenta de Mercado Pago (ver [Contabilidad](/administracion/contabilidad)) y entra como movimiento en esta cuenta (ver "Cobros de pedidos", abajo).
- Si se borra (sin movimientos) una cuenta de Mercado Pago de una cuenta de ML que sigue conectada, se vuelve a crear sola.

### Mercado Pago de la tienda web

- Al cargar el **access token** del medio **Mercado Pago** en [Medios de pago](/config/medios-pago) (y una vez, si ya estaba cargado), se crea sola la cuenta de fondos **"Mercado Pago — Tienda web"** (si el medio tiene otro nombre que "Mercado Pago", ése), tipo Mercado Pago, en pesos, con su cuenta contable propia y atada a la tienda. Si ya había una cuenta de Mercado Pago creada a mano con ese mismo nombre (y que no es de una cuenta de ML), se usa ésa.
- Ahí entra lo cobrado de cada pedido de la tienda **pagado con Mercado Pago**. Los pedidos pagados por transferencia, efectivo o tarjeta (Payway) siguen como siempre: no entran a esta cuenta.

### Cobros de pedidos

- Cada pedido cobrado cuyo cobro se asienta en una cuenta de Mercado Pago (la de su cuenta de Mercado Libre o la de la tienda) deja **un movimiento de entrada** en esa cuenta: fecha y concepto del asiento ("Cobro del pedido <número> · <canal>"), importe = lo cobrado (total − comisión). Así el **saldo de la cuenta coincide con su mayor** en Contabilidad.
- Es uno solo por pedido y aparece cuando se genera el asiento de cobro (el pedido pagado y facturado; ver [Contabilidad](/administracion/contabilidad)). No genera otro asiento: es la parte de fondos del mismo asiento de cobro.
- El concepto es un enlace al pedido, en Movimientos y en Conciliación, para saber qué pedido es al conciliar con el extracto de Mercado Pago.
- No se borra a mano. Si el pedido deja de estar cobrado (por ejemplo, se reembolsó), el movimiento se borra solo y el asiento de cobro queda anulado; si ya estaba conciliado, primero hay que desunirlo (Contabilidad lo avisa al contabilizar).
- Los cobros que ya estaban asentados antes de esto recibieron su movimiento solos.

### Conciliación

- **Lectura del CSV**: acepta separador coma, punto y coma o tabulación; fechas dd/mm/aaaa (o dd/mm/aa) o aaaa-mm-dd; importes "1.234,56" o "1234.56", con signo menos o entre paréntesis para negativos. Busca las columnas por el nombre del encabezado: fecha; descripción / concepto / detalle / movimiento; importe / monto / valor neto; o débito y crédito por separado (débito / debe / egreso y crédito / haber / ingreso); y una referencia opcional (referencia / comprobante / id de operación). Si no encuentra fecha e importe (o débito y crédito): "No encuentro las columnas de fecha e importe (o débito y crédito)." Las filas sin fecha o con importe cero se saltean.
- Si el archivo no está en UTF-8, se lee como Latin-1 (como exportan muchos bancos). Tope: 4 MB.
- **No se duplican líneas**: si subís el mismo extracto dos veces, las líneas iguales (misma cuenta, fecha, importe, descripción y referencia) no se vuelven a cargar.
- **Conciliar automático**: une cada línea del extracto con un movimiento sin conciliar de la misma cuenta con **el mismo importe exacto** y fecha a **±5 días**, uno a uno, eligiendo el de fecha más cercana.
- **Unir a mano**: sólo ofrece movimientos del mismo signo (entrada con entrada, salida con salida). La línea y el movimiento tienen que ser de la misma cuenta y ninguno puede estar ya conciliado.
- Un movimiento conciliado no se puede borrar ni anular su recibo hasta desunirlo.

### Asientos contables

Los genera solos [Contabilidad](/administracion/contabilidad): un movimiento suelto, fondos contra la contrapartida elegida; una transferencia, fondos destino contra fondos origen. Al borrar un movimiento o una transferencia, su asiento queda anulado. El cobro de un pedido no tiene asiento propio: es parte del asiento "Cobro de pedido".

## Con más de una razón social

Cada **cuenta de fondos** (caja, banco, Mercado Pago) pertenece a **una razón social**: el banco es de un CUIT. Al crear o editar una cuenta hay un campo **"Razón social"** (sólo si hay más de una) y, arriba de la lista, un selector **"Razón social"** (**"Todas"** o una sola); la lista suma una columna con la razón social de cada cuenta.

- La cuenta de **Mercado Pago de cada cuenta de ML** es de la razón social con la que factura su canal.
- **No se puede cambiar la razón social de una cuenta que ya tiene movimientos.**
- **No hay transferencias entre cuentas de razones sociales distintas** ("Las dos cuentas son de razones sociales distintas…"): sería un préstamo entre empresas, que se asienta aparte.
- Los **recibos y órdenes de pago** usan cuentas de una sola razón social (ver [Cuentas corrientes](/administracion/cuentas-corrientes)).

## Preguntas frecuentes

**¿Dónde cargo un cobro de un cliente?**
En [Cuentas corrientes](/administracion/cuentas-corrientes), con "Nuevo recibo". El movimiento aparece solo en la cuenta elegida.

**¿Por qué no puedo borrar un movimiento?**
Porque está conciliado (desunilo primero en Conciliación), porque es parte de un recibo u orden de pago (anulá el recibo) o porque es el cobro de un pedido (se va solo si el pedido deja de estar cobrado).

**¿De dónde salen los movimientos "Cobro del pedido …" en Mercado Pago?**
De los pedidos cobrados por Mercado Libre o por el Mercado Pago de la tienda: entran solos por lo cobrado menos la comisión. Tocando el concepto vas al pedido.

**¿Por qué no puedo cambiar la moneda de una cuenta?**
Porque ya tiene movimientos en esa moneda.

**El banco me cobró una comisión que no tenía cargada.**
En Conciliación, en la línea del extracto, elegí la cuenta contable (ej. Gastos bancarios) y apretá "Crear movimiento".

**"Conciliar automático" no unió una línea que es igual.**
Une sólo si el importe es exactamente igual y la fecha está a 5 días o menos. Si no, unila a mano con "Unir".

**¿Qué formato tiene que tener el extracto?**
Un CSV con columnas de fecha, descripción e importe (o débito y crédito separados). La mayoría de los bancos y Mercado Pago lo exportan así.

**¿Qué pasa si borro una cuenta con movimientos?**
No se borra: queda desactivada, con toda su historia.

## Relacionado

- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Contabilidad](/administracion/contabilidad)
- [Medios de pago](/config/medios-pago)
- [Tipo de cambio](/config/tipo-cambio)
- [Razones sociales](/config/razones-sociales)
