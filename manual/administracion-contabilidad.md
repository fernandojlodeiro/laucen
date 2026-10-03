---
titulo: Contabilidad
menu: Administración › Contabilidad
ruta: /administracion/contabilidad
rutas: /administracion/contabilidad
permiso: contabilidad_ver
resumen: Plan de cuentas, asientos automáticos y manuales, libro diario, mayores, sumas y saldos y estado de resultados, todo en pesos.
---

## Para qué sirve

Es la contabilidad de la empresa. Los asientos **se generan solos** a partir de las ventas facturadas, las compras, los despachos de importación, los recibos y órdenes de pago, los movimientos de caja y bancos y los ajustes de stock. Acá se miran los libros (diario, mayor, sumas y saldos, resultados), se cargan los ajustes del contador o el asiento de apertura, y se mantiene el plan de cuentas.

Todo va **en pesos**, aunque el usuario tenga elegida otra moneda de vista.

## Cómo se llega

- Menú **Administración › Contabilidad**.
- Desde [Caja y bancos](/administracion/tesoreria), la cuenta contable de una cuenta de fondos abre su **Mayor**.

## Qué hay en la pantalla

Título "Contabilidad" y la aclaración: "Los asientos se generan solos desde las ventas, compras, despachos, recibos, movimientos de fondos y ajustes de stock; acá se ven los libros y se cargan los ajustes del contador."

### Pestañas

- **Libro diario (N)**: N = asientos vigentes del período elegido.
- **Asiento manual (N)**: N = asientos manuales vigentes del período (sin contar los de apertura).
- **Mayor**
- **Sumas y saldos**
- **Resultados**
- **Plan de cuentas (N)**: N = cuentas del plan.

### Período

En Libro diario, Mayor, Sumas y saldos y Resultados hay un filtro **Período** desde/hasta con atajos (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año). Si no se elige, va **del 1.º del mes actual a hoy**. Cambiar de pestaña conserva el período.

### Libro diario

- Botón **"Contabilizar ahora"**: genera en el momento los asientos que falten (normalmente lo hace solo el sistema).
- Cada asiento: encabezado con **"Asiento N"**, fecha, concepto y una etiqueta con su origen (Venta, Nota de crédito, Costo de venta, Cobro de pedido, Compra, Despacho, Recibo, Orden de pago, Movimiento, Transferencia, Ajuste de stock, Manual, Apertura). Los anulados se ven tachados con la etiqueta "Anulado".
- Debajo, sus renglones: **Código**, **Cuenta** (las del haber, con sangría), **Debe**, **Haber**, **Detalle**.
- Los asientos **Manual** y **Apertura** vigentes tienen el botón **"Anular"** (pregunta "¿Anular el asiento N?").
- Al pie: **Totales del período (sin anulados)**; si debe y haber no coinciden, la marca "No coinciden".

### Asiento manual

Aclaración: "Para ajustes del contador o el asiento de apertura. Cada renglón lleva debe o haber (no los dos), y el total del debe tiene que dar igual al del haber."

Formulario: **Fecha**, **Concepto**, la caja **"Es el asiento de apertura"** y 10 renglones con **Cuenta** (sólo cuentas imputables y activas), **Debe**, **Haber** y **Detalle**. Al pie, los **Totales** que se van sumando y la leyenda "Balancea" o "No balancea: diferencia $ …". Botón **"Grabar asiento"**.

### Mayor

Desplegable **Cuenta** ("Elegí una cuenta…", sólo cuentas imputables; las inactivas dicen "(inactiva)"). Muestra **Saldo anterior al** (fecha desde), y cada movimiento del período: **Fecha**, **Asiento** (enlace que abre el diario en ese día, en ese asiento), **Concepto** (y el detalle del renglón), **Debe**, **Haber**, **Saldo** acumulado. Al pie, los totales del período y el saldo final.

### Sumas y saldos

Aclaración: "Debe y haber son los del período; el saldo es el acumulado al (fecha hasta)." Columnas: **Código**, **Cuenta**, **Debe**, **Haber**, **Saldo deudor**, **Saldo acreedor**. Al pie, los totales con la marca "Coinciden" (verde) o "No coinciden" (rojo).

### Resultados

Estado de resultados del período: bloque **Ingresos** (cada cuenta de ingreso con su importe y el total), bloque **Egresos** (ídem) y al pie **Ganancia del período** (verde) o **Pérdida del período** (rojo).

### Plan de cuentas

- Botón **"Nueva cuenta"** arriba a la derecha: abre el formulario con **Código** (viene sugerido el próximo libre de egreso, ej. 5.2.06), **Nombre**, **Tipo** (Activo, Pasivo, Patrimonio neto, Ingreso, Egreso), la caja **Imputable** (tildada de entrada) y el botón **"Crear"**.
- Buscador **"Buscar cuenta por código o nombre"** con "Comienza por".
- Aclaración: "Las imputables reciben asientos; las otras son títulos que agrupan. Las marcadas "automática" las usan los asientos que se generan solos: se pueden renombrar o recodificar, no borrar. Las "ventas del canal …" y las de Mercado Pago de cada cuenta de Mercado Libre se crean solas."
- Tabla: **Código** y **Cuenta** (con sangría según el nivel; los títulos en negrita; las automáticas con la etiqueta "automática: <rol>"; las que se crearon solas para un canal, con "ventas del canal <nombre>" o "de Mercado Pago — <cuenta>"), **Tipo**, **Imputable** (Sí / Título), **Estado** (Activa / Inactiva), el **lápiz** y el **tacho**.
- El lápiz abre la fila para editar **código**, **nombre** y el interruptor **Activa**, con **"Guardar"** y **"Cancelar"**. El tipo y si es imputable no se cambian.
- El tacho sólo aparece en cuentas que no son automáticas, no son la cuenta de ventas de un canal ni de una cuenta de fondos, y no se usaron nunca.

## Cómo se hace

### Ver los asientos de un mes

1. Pestaña **Libro diario**.
2. En **Período**, elegí el atajo (por ejemplo "Último mes") o las fechas.

### Generar ya los asientos que faltan

Apretá **"Contabilizar ahora"** en el Libro diario. Aviso: "Se generaron N asientos." o "No había nada pendiente de contabilizar." Si alguno no se pudo, el aviso sale en rojo con el documento y el motivo, por ejemplo "Compra #12: no se pudo asentar (puede faltar una cuenta del plan o un dato del documento)" (muestra hasta 5).

### Cargar un ajuste del contador

1. Pestaña **Asiento manual**.
2. Poné fecha y concepto.
3. En cada renglón elegí la cuenta y poné el importe en **Debe** o en **Haber** (uno solo por renglón).
4. Mirá que al pie diga "Balancea".
5. Apretá **"Grabar asiento"**. Te lleva al diario de esa fecha con el aviso "Asiento N grabado."

Errores típicos: "Un asiento lleva al menos dos líneas.", "El asiento no balancea: el debe y el haber difieren en …", "Poné un concepto.", "El renglón N tiene importe pero no tiene cuenta.", "El renglón N tiene debe y haber a la vez: va uno solo.", "El renglón N tiene un importe negativo.", "Alguna cuenta no existe o es un título (no imputable)."

### Cargar el asiento de apertura

Igual que un ajuste, tildando **"Es el asiento de apertura"**. Queda con la etiqueta "Apertura".

### Anular un asiento manual

En el Libro diario, en el encabezado del asiento, **"Anular"** y confirmá. Sólo los manuales y de apertura. Un asiento automático no se anula desde acá: "Es un asiento automático: se anula anulando el documento que lo generó."

### Ver el mayor de una cuenta

Pestaña **Mayor**, elegí la cuenta y el período. Tocando el número de asiento vas a ese asiento en el diario.

### Agregar una cuenta al plan

1. Pestaña **Plan de cuentas** → **"Nueva cuenta"**.
2. El **Código** viene sugerido (el próximo libre de egreso, porque el tipo viene en Egreso); cambialo si querés otro o si es de otro tipo. Va con números separados por puntos (ej. 5.2.06). Poné el nombre y el tipo. Dejá **Imputable** tildado si va a recibir asientos; destildalo si es un título que agrupa.
3. **"Crear"**.

Errores típicos: "La cuenta necesita un código.", "El código va con números separados por puntos (ej. 5.2.06).", "La cuenta necesita un nombre.", "Elegí el tipo de cuenta.", "Ya hay una cuenta con el código 5.2.06 (Publicidad)."

Las cuentas de gasto también se pueden crear sin venir acá, desde la vista previa de la importación de ARCA en [Facturas de compra](/compras/facturas) (botón "Nueva cuenta" de la tabla de cuentas de gasto), con las mismas reglas.

### Renombrar, recodificar o desactivar una cuenta

Lápiz en la fila, cambiá código o nombre, o apagá **Activa**, y **"Guardar"**. Una cuenta inactiva deja de ofrecerse para asientos manuales, movimientos de caja y bancos y cuentas de fondos.

## Criterios y reglas

### El código que se sugiere para una cuenta nueva

- Se busca la cuenta **imputable** del tipo (egreso, por defecto) con el código **más alto** y se le suma uno a la última parte, con sus ceros: después de 5.2.05 "Gastos varios" viene **5.2.06**; después de 5.2.09, 5.2.10; después de 5.2.99, 5.2.100. Los códigos se comparan parte por parte como números (5.2.10 va después de 5.2.9).
- Si ese código ya lo tiene otra cuenta (un título o una de otro tipo), sigue con el próximo.
- Si todavía no hay ninguna cuenta imputable de ese tipo, sugiere la primera bajo su título (con el título 5 "EGRESOS", 5.01).
- La cuenta madre sale del código: una cuenta cuelga del código más cercano que existe acortándolo de a una parte (5.2.06 cuelga de 5.2 si existe; si no, de 5).

### Cuándo se generan los asientos automáticos

- Un proceso periódico de Laucen los genera solos (cuando hay algo pendiente y, como red de seguridad, a los minutos 1 y 31 de cada hora), además del botón "Contabilizar ahora".
- Hay **un asiento por documento**: si el documento ya tiene su asiento vigente, no se repite.
- En cada vuelta se procesan hasta 500 documentos de cada tipo (200 despachos); lo que queda sigue en la vuelta siguiente.
- La fecha del asiento es la del documento.
- Si a un asiento le falta o le sobra hasta 5 centavos por redondeo, se ajusta el renglón más grande; si la diferencia es mayor, no se graba y queda como error.
- Los renglones de la misma cuenta y lado se juntan; los de cero se descartan.
- La numeración de asientos es correlativa por empresa.

### Qué asienta cada documento (y con qué cuentas)

| Documento | Debe | Haber |
|---|---|---|
| **Venta** (factura autorizada por ARCA) | Deudores por ventas (total) | Ventas del canal del pedido, o Ventas general (neto) + IVA débito fiscal (IVA) |
| **Nota de crédito de venta** | Al revés que la venta | |
| **Costo de venta** (por cada factura) | Costo de mercaderías vendidas | Mercaderías |
| **Cobro de pedido** | Mercado Pago de la cuenta de ML del canal, o Cobros de canales a liquidar (total − comisión) + Comisiones de canales (comisión) | Deudores por ventas (total) |
| **Compra** (factura de compra registrada) | Mercaderías (neto de líneas con producto) + gasto (neto de líneas sin producto + no gravado) + IVA crédito fiscal + Percepciones de IVA + Percepciones de IIBB + Impuestos y tasas (otros impuestos) | Proveedores (total) |
| **Nota de crédito de compra** | Al revés que la compra | |
| **Despacho de importación** (registrado) | Mercaderías (costo puesto en depósito) + cada impuesto del despacho a su cuenta | Importaciones en curso |
| **Recibo** (cobro a cliente) | La cuenta de cada medio de cobro + Retenciones sufridas y anticipos | Deudores por ventas (total del recibo) |
| **Orden de pago** | Proveedores (total) | La cuenta de cada medio de pago + Retenciones a depositar |
| **Movimiento suelto** de caja o banco | Cuenta de fondos (si entra) | Contrapartida elegida (al revés si sale) |
| **Transferencia** | Cuenta de fondos destino | Cuenta de fondos origen (+ diferencia de cotización si la hay) |
| **Ajuste de stock** | Mercaderías (si suma) | Diferencias de inventario (al revés si resta) |

Detalles de cada uno:
- **Venta / nota de crédito**: se toma del comprobante el total y el IVA; neto = total − IVA. El neto va a la cuenta **"Ventas — <canal>"** del canal del pedido (si la factura es de un pedido y esa cuenta está activa); si no, a la **Ventas** general. La nota de crédito usa la misma cuenta, al revés. Si el comprobante fuera en otra moneda, se pasa a pesos con su cotización.
- **Costo de venta**: cantidad × costo promedio en pesos de cada producto (si no tiene, el último costo en pesos). Sólo para facturas (no notas de crédito) que tengan al menos un producto con costo. **Las notas de crédito no revierten el costo**: si la mercadería vuelve, vuelve por un ajuste de stock.
- **Cobro de pedido**: para pedidos con pago "Pagado" cuyo cliente **no** tiene cuenta corriente y que tienen comprobante autorizado (Mercado Libre, tienda…). El total es lo facturado menos las notas de crédito; la comisión es la del pedido (nunca más que el total). Si el total da cero o negativo, no se asienta. En un canal de **Mercado Libre**, lo cobrado (total − comisión) va a la cuenta contable de **Mercado Pago de la cuenta de ML de ese canal** (la de la cuenta conectada hoy, si hubo más de una); en los demás canales, o si no tiene, a **Cobros de canales a liquidar**. Los clientes con cuenta corriente, en cambio, cancelan Deudores con sus recibos.
- **Compra**: si es en dólares, todo se pasa a pesos con la cotización de la factura. El gasto va a la cuenta de gasto elegida en la factura; si no tiene, a **Importaciones en curso** si es una factura E (del exterior) o a **Gastos varios** si no.
- **Despacho**: cada impuesto va a su cuenta según su nombre: "adicional" o "percepción IVA" → Percepciones de IVA; otro con "IVA" → IVA crédito fiscal; "ganancias" → Retenciones sufridas y anticipos; "IIBB" o "brutos" → Percepciones de IIBB; cualquier otro → Impuestos y tasas. "Importaciones en curso" se cancela con la factura del exterior y las del despachante.
- **Recibo / orden de pago**: la cuenta de cada medio es la cuenta contable de la cuenta de fondos o, si no tiene, la de su tipo (Caja, Bancos; "Otra" va a Caja). Las de Mercado Pago tienen siempre su cuenta propia (ver [Caja y bancos](/administracion/tesoreria)). Al anular el recibo, su asiento queda anulado.
- **Movimiento suelto**: si no se eligió contrapartida, **Gastos varios** si sale plata y **Otros ingresos** si entra. Al borrar el movimiento, su asiento queda anulado.
- **Transferencia**: si las dos patas en pesos no dan igual (distinta moneda), la diferencia va a **Otros ingresos** o **Gastos varios** como "Diferencia de cotización". Al borrarla, su asiento queda anulado.
- **Ajuste de stock**: cantidad × costo promedio en pesos (o último costo en pesos). Sólo si el producto tiene costo.

### El plan de cuentas por defecto

La primera vez Laucen carga este plan (y si después falta alguna cuenta automática, la agrega):

- **1 ACTIVO** › 1.1 Disponibilidades: 1.1.01 Caja, 1.1.02 Bancos, 1.1.04 Cobros de canales a liquidar · 1.2 Créditos: 1.2.01 Deudores por ventas, 1.2.02 IVA crédito fiscal, 1.2.03 Percepciones de IVA, 1.2.04 Percepciones de IIBB, 1.2.05 Retenciones sufridas y anticipos · 1.3 Bienes de cambio: 1.3.01 Mercaderías, 1.3.02 Importaciones en curso.
- **2 PASIVO** › 2.1 Deudas comerciales: 2.1.01 Proveedores · 2.2 Deudas fiscales: 2.2.01 IVA débito fiscal, 2.2.02 Retenciones a depositar.
- **3 PATRIMONIO NETO** › 3.1.01 Capital, 3.1.02 Resultados acumulados.
- **4 INGRESOS** › 4.1.01 Ventas, 4.1.02 Otros ingresos.
- **5 EGRESOS** › 5.1.01 Costo de mercaderías vendidas, 5.1.02 Diferencias de inventario, 5.2.01 Comisiones de canales, 5.2.02 Fletes y envíos, 5.2.03 Gastos bancarios, 5.2.04 Impuestos y tasas, 5.2.05 Gastos varios.

No hay una "Mercado Pago" general: como cada cuenta de Mercado Libre tiene su propio Mercado Pago, esas cuentas se crean solas (ver abajo). En las empresas que ya tenían la "1.1.03 Mercado Pago" del plan viejo, se borró si nunca se había usado; si se usó, queda con su historia.

Todas las de último nivel son **automáticas**: los asientos las buscan por su función, no por su código ni su nombre. Por eso **se pueden renombrar y recodificar sin romper nada**, pero no borrar.

### Cuentas que se crean solas: ventas de cada canal y Mercado Pago de cada cuenta de ML

- **Ventas de cada canal**: al crear un canal (y, una vez, para los que ya estaban) Laucen agrega una cuenta imputable de ingresos **"Ventas — <nombre del canal>"** con el próximo código libre bajo Ventas (por ejemplo 4.1.03, 4.1.04…). Si después se renombra el canal, la cuenta **no** se renombra sola: se la puede renombrar a mano con el lápiz.
- **Mercado Pago de cada cuenta de Mercado Libre**: al conectar una cuenta de ML a un canal (y, una vez, para las que ya estaban conectadas) Laucen agrega una cuenta imputable de activo **"Mercado Pago — <apodo de la cuenta de ML>"** con el próximo código libre bajo Disponibilidades (por ejemplo 1.1.05) y la cuenta de fondos del mismo nombre en [Caja y bancos](/administracion/tesoreria), atada a esa cuenta contable y a ese canal. Si la cuenta de ML se pasa a otro canal, su Mercado Pago la sigue.
- "Próximo código libre" es el que sigue al más alto que ya hay bajo esa madre; un código borrado no se vuelve a usar.
- Si ya había una cuenta con exactamente ese nombre y tipo, sin usar por otro canal ni otra cuenta de fondos, se usa ésa en vez de crear otra.
- La cuenta de ventas de un canal no se puede borrar (sí renombrar, recodificar o desactivar: "Es la cuenta de ventas de un canal: no se puede borrar…"). Desactivada, los asientos nuevos de ese canal vuelven a la Ventas general.
- Los asientos ya grabados no cambian: las cuentas propias valen para los asientos que se generen de ahí en adelante.

### Reglas del plan de cuentas

- El código va con números separados por puntos ("El código va con números separados por puntos (ej. 5.2.06).").
- Una cuenta se puede borrar sólo si no es automática y no está usada: sin asientos, y sin que la nombre una cuenta de fondos o un movimiento de caja y bancos. Si no: "Está usada (asientos o cuentas de fondos): no se puede borrar. Desactivala."
- Las cuentas se ordenan por código numérico (1, 1.1, 1.1.01, 1.2…).

### Cómo se calculan los libros

- Sólo cuentan los asientos **vigentes** (los anulados se ven en el diario, tachados, pero no suman).
- **Mayor**: saldo anterior = debe − haber de todos los asientos anteriores al "desde"; después, cada movimiento suma debe y resta haber.
- **Sumas y saldos**: debe y haber del período; saldo = debe − haber acumulado desde el principio hasta el "hasta". Positivo = deudor; negativo = acreedor.
- **Resultados**: sólo cuentas de ingreso y egreso, del período. Ingresos = haber − debe; egresos = debe − haber. Resultado = ingresos − egresos (ganancia si da positivo, pérdida si da negativo).
- El diario muestra hasta 2.000 asientos por período, y el mayor hasta 3.000 movimientos.

## Preguntas frecuentes

**¿Tengo que cargar los asientos de las ventas?**
No. Se generan solos cuando la factura queda autorizada por ARCA. Si no querés esperar, "Contabilizar ahora".

**Anulé una factura con nota de crédito, ¿qué pasa con el asiento?**
La nota de crédito genera su propio asiento al revés. El costo de venta no se revierte: si la mercadería volvió, se hace un ajuste de stock.

**¿Puedo borrar un asiento automático?**
No. Se anula anulando el documento que lo generó (por ejemplo, el recibo o el movimiento de caja).

**¿Puedo cambiarle el nombre a "Mercaderías"?**
Sí, y el código también. Los asientos automáticos la siguen encontrando.

**El diario dice "No coinciden", ¿qué hago?**
Avisá al contador: los asientos se graban siempre balanceados, así que puede ser un caso raro de datos. Revisá el mayor de las cuentas involucradas.

**"Contabilizar ahora" dio error en una compra.**
El motivo aparece en el aviso. Lo más común es que falte un dato del documento (por ejemplo la cotización de una factura en dólares).

**¿Por qué el costo de venta de una factura no aparece?**
Porque ninguno de sus productos tiene costo cargado. Se asienta cuando el producto tenga costo.

**¿Cómo cargo los saldos con que arranca la empresa?**
Con un asiento manual tildando "Es el asiento de apertura".

## Relacionado

- [Facturación](/administracion/facturacion)
- [Facturas de compra](/compras/facturas)
- [Despachos de importación](/compras/despachos)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Caja y bancos](/administracion/tesoreria)
- [Ajustes de stock](/stock/ajustes)
- [Libros de IVA](/administracion/libros-iva)
