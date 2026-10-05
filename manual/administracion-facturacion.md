---
titulo: Facturación
menu: Administración › Facturación
ruta: /administracion/facturacion
rutas: /administracion/facturacion, /administracion/facturacion/[id], /administracion/facturacion/config
permiso: facturacion_ver
resumen: Las facturas y notas de crédito electrónicas emitidas a ARCA: su estado, CAE, PDF, reintento, anulación y subida de la factura a la venta de Mercado Libre.
---

## Para qué sirve

Es el listado de todos los comprobantes electrónicos que Laucen emitió contra ARCA: facturas A, B y C y notas de crédito A, B y C. Desde acá se ve si cada uno quedó autorizado (con su CAE), se baja el PDF, se reintenta uno rechazado o con error, se anula una factura con una nota de crédito y se sube la factura a la venta de Mercado Libre.

Las facturas no se cargan desde esta pantalla: nacen de un pedido (con el botón **"Facturar"** del pedido, o solas si está prendida la facturación automática). Esta pantalla es para mirarlas y operarlas después.

## Cómo se llega

- Menú **Administración › Facturación**.
- Desde la ficha de un pedido ([Pedidos](/ventas/pedidos)): el número de la factura lleva a su detalle, y el botón **"PDF"** abre el PDF.
- Desde [Configuración › Facturación (ARCA)](/config/arca), con el enlace **"Ver facturas"**.
- Desde el estado de cuenta de un cliente en [Cuentas corrientes](/administracion/cuentas-corrientes): el concepto "Factura 00003-…" lleva al comprobante.
- La dirección vieja /administracion/facturacion/config ya no tiene pantalla: lleva sola a [Configuración › Facturación (ARCA)](/config/arca).

## Qué hay en la pantalla

### Arriba a la derecha

- **"Subir a ML las facturas que faltan"**: prepara, en la cola de Mercado Libre, un lote con todas las facturas autorizadas de ventas de Mercado Libre que todavía no están subidas (ver "Criterios y reglas"). No manda nada: te lleva a la [Cola de Mercado Libre](/config/canales/cola) para que revises y aprietes **"Mandar a Mercado Libre"**.
- **"Descargar Excel"** con su desplegable de configuraciones ("Como en pantalla" o una guardada) y **"Configurar…"**: baja todos los comprobantes con los filtros que tenés puestos.
- **"Configuración"**: lleva a [Configuración › Facturación (ARCA)](/config/arca).

### Avisos

- Si todavía no se cargaron los datos para facturar, un cartel amarillo dice "Todavía no están cargados los datos para facturar" con el enlace **"Ir a Configuración"**.
- Si se está en modo prueba contra ARCA (homologación), un cartel azul avisa: "Modo prueba contra ARCA: los comprobantes salen pero no tienen validez fiscal."

### Filtros

- **Estado**: Todos, Autorizado, Pendiente, Rechazado, Error.
- **Tipo**: Todos, Factura A, Factura B, Factura C, Nota de crédito A, Nota de crédito B, Nota de crédito C.
- **Fechas**: desde/hasta con atajos (Hoy, Ayer, Últimos 7 días, Este mes, etc.). Sin fechas, "Todas las fechas".
- **Buscar**: por número (por ejemplo "00003-00000042" o sólo "42"), nombre del receptor, número de documento o CAE.
- **"Filtrar"** aplica los filtros y **"Limpiar"** (aparece si hay alguno puesto) los saca.

### Selector "Vista"

Arriba de la tabla, a la derecha: elegís qué columnas se ven ("Estándar" es la de siempre). La última vista elegida queda recordada.

### Columnas (vista estándar)

- **Fecha** (enlace al detalle).
- **Tipo** (Factura B, Nota de crédito A…; si es de prueba dice "(prueba)").
- **Número**: punto de venta y número, "00003-00000042" (enlace al detalle). Si todavía no tiene número, "00003-…".
- **Receptor**: el nombre o razón social; si está atado a un cliente, enlace a su ficha.
- **Documento**: CUIT, CUIL o DNI y su número, o "Consumidor final".
- **Total**.
- **Estado**: Autorizado (verde), Pendiente (gris), Rechazado (rojo), Error (amarillo). Si está rechazado o con error, debajo se ve lo que contestó ARCA.
- **CAE**.
- **Pedido**: enlace al pedido que se facturó.
- **Factura en ML**: sólo para comprobantes autorizados de ventas de Mercado Libre: "Subida a ML", "Preparada, falta tu clic", "Pendiente de subir", "Subiendo", "Con error", "No se subió (descartada)" o "Falta subirla". En las que no son de ML, "—".

Otras columnas que se pueden sumar en una vista o en el Excel: Punto de venta, Tipo de documento, Condición IVA del receptor, Domicilio del receptor, Neto, IVA, Total (NC en negativo), Observaciones de ARCA, Vencimiento del CAE, Pedido (id externo), Ambiente (Prueba / Producción) y Autorizado el. En **Neto**, **IVA** y **Total (NC en negativo)** las notas de crédito van en negativo; en **Total**, en positivo.

### Botones de cada fila

- **"PDF"**: sólo en los autorizados. Abre el PDF en otra pestaña.
- **"Reintentar"**: sólo en los rechazados o con error. Lo vuelve a mandar a ARCA.

### El detalle de un comprobante

Al tocar la fecha o el número se abre su ficha. Título: tipo y número ("Factura B 00003-00000042"); debajo la fecha y, si es de prueba, "homologación (prueba, sin validez fiscal)".

Arriba a la derecha, según el caso:
- **"PDF"** (autorizado).
- **"Reintentar"** (rechazado o con error).
- **"Subir factura a Mercado Libre"** (autorizado, de una venta de ML, y todavía no subido ni en camino).
- **"Anular con nota de crédito"** (factura autorizada que todavía no tiene una nota de crédito viva). Pregunta ahí mismo: "¿Anular? Se emite una nota de crédito por el total."

Datos de la ficha: Estado (y cuántos intentos, si fue más de uno), CAE y su vencimiento, Total, Pedido, Receptor y su domicilio, Documento, Condición IVA, Creado / autorizado (fecha y hora), **En Mercado Libre** (estado de la subida y enlace "ver en la cola"), **Anula a** (si es una nota de crédito, la factura que anula) y **Notas de crédito** (si es una factura que tiene NC, cada una con su estado).

Si ARCA contestó algo (un rechazo, un error o una observación), aparece en un recuadro "ARCA: …".

Más abajo:
- **Líneas**: Descripción, Cantidad, Unitario (con IVA), y si discrimina IVA: IVA (alícuota), Neto, IVA $; y Total.
- **IVA por alícuota**: neto gravado e IVA de cada alícuota. En un comprobante C dice "Comprobante C: no discrimina IVA."
- Totales: Neto, IVA, Total.
- **"Lo que se mandó y lo que contestó ARCA (XML)"**: desplegable con el pedido enviado y la respuesta recibida, con el token y la firma de acceso ocultos.

## Cómo se hace

### Facturar un pedido a mano

1. Abrí el pedido en [Pedidos](/ventas/pedidos).
2. Apretá **"Facturar"**. Laucen arma el comprobante y lo manda a ARCA en el momento.
3. Si ARCA lo autoriza, ves "Autorizado: Factura B 00003-00000042, CAE …". Si lo rechaza, ves el motivo y el comprobante queda "Rechazado" para reintentarlo después de corregir.

El botón no aparece si el pedido está "Nuevo" o "Cancelado", o si ya tiene factura autorizada. Si el pedido está «A cobrar», el botón aparece apagado: primero hay que confirmar el cobro. Si es un carrito de Mercado Libre que recibió un cambio hace menos de 10 minutos, hay que esperar.

### Reintentar un comprobante rechazado o con error

1. En el listado, filtrá **Estado** = Rechazado o Error (o abrí el comprobante).
2. Leé el motivo que dio ARCA (debajo del estado o en el recuadro "ARCA:").
3. Corregí lo que haga falta (por ejemplo el CUIT del cliente en su ficha, o la conexión en [Configuración › Facturación (ARCA)](/config/arca)).
4. Apretá **"Reintentar"**.

Ojo: el reintento vuelve a mandar el mismo comprobante tal como se armó (mismo tipo, receptor, documento e importes). Si el problema era un dato del cliente o del pedido (CUIT, condición de IVA, precios), "Reintentar" no lo toma. En ese caso, con un comprobante **rechazado**, corregí el dato y apretá de nuevo **"Facturar"** en el pedido: se arma un comprobante nuevo con los datos actuales (el rechazado queda en la lista como historia). Con uno en **Error** o **Pendiente**, "Facturar" vuelve a mandar ese mismo.

### Anular una factura

1. Abrí la factura autorizada.
2. Apretá **"Anular con nota de crédito"** y confirmá con **"Sí"**.
3. Laucen arma una nota de crédito por el total (misma letra, mismo receptor, mismas líneas), la manda a ARCA y te lleva a la ficha de la nota de crédito, con el resultado arriba (verde si salió, rojo si no). Si no salió, se reintenta desde ahí.

### Bajar o ver el PDF

Apretá **"PDF"** en la fila o en la ficha. Se abre en otra pestaña con el nombre "Factura-B-00003-00000042.pdf" o "Nota-de-credito-B-…pdf". Lleva el logo de la empresa (si está cargado en [Empresa](/config/empresa)), el CAE y el código QR de ARCA.

### Subir una factura a la venta de Mercado Libre

- **Una sola**: en la ficha del comprobante (o del pedido), **"Subir factura a Mercado Libre"**. Queda en la cola y sale en un momento: "La factura quedó en la cola para subirse a Mercado Libre; sale en un momento."
- **Todas las que faltan**: en el listado, **"Subir a ML las facturas que faltan"**. Se prepara un lote por cuenta de Mercado Libre y te lleva a la cola con el aviso "Preparado: N facturas para subir a Mercado Libre. Revisalas y apretá «Mandar a Mercado Libre»". Recién cuando apretás **"Mandar a Mercado Libre"** en la [Cola de Mercado Libre](/config/canales/cola) se suben.

Mensajes típicos si no se puede:
- "No falta subir ninguna factura: todas las de Mercado Libre ya están subidas o en la cola."
- "El comprobante no es de una venta de Mercado Libre."
- "Esa factura ya está subida a Mercado Libre." / "Esa factura ya está en la cola para subirse."
- "El carrito de Mercado Libre todavía está en espera: probá de nuevo en unos minutos."

## Criterios y reglas

### Qué tipo de comprobante sale (A, B o C)

- Si la empresa **no** es Responsable Inscripto (monotributo o exento): siempre **Factura C** (no discrimina IVA).
- Si es Responsable Inscripto:
  - Cliente Responsable Inscripto o Monotributista → **Factura A**.
  - Cualquier otro (consumidor final, exento, no alcanzado, o sin condición cargada) → **Factura B**.
- La condición de IVA del cliente sale de su ficha; si no tiene, se toma "Consumidor final".
- La condición de IVA de la empresa se carga en [Empresa](/config/empresa).

### Qué documento del receptor va

- Si el cliente tiene CUIT de 11 dígitos → CUIT.
- Si no, si tiene DNI de 7 u 8 dígitos → DNI.
- Si el "DNI" cargado tiene 11 dígitos → se manda como CUIT.
- Si no hay nada → "Consumidor final" (sin documento).
- Una **Factura A exige CUIT**: si falta, el error es "Para una factura A el cliente necesita CUIT: corregilo en la ficha del cliente."
- Nombre del receptor: razón social del cliente, si no su nombre, si no "Consumidor final". Domicilio: el de la dirección con etiqueta "Fiscal" del cliente, si no la principal.

### Cómo se calculan los importes

- Los precios del pedido son **con IVA**. Cada línea: total = precio unitario × cantidad (redondeado a centavos).
- La alícuota de cada producto es la de su ficha; si no tiene, 21 %. El **envío que pagó el comprador** se agrega como una línea más, "Envío", al 21 %.
- En A y B: se agrupan las líneas por alícuota y, para cada una, neto = total ÷ (1 + alícuota) e IVA = total − neto, redondeados a centavos. El IVA total es total − neto.
- En C: neto = total, IVA = 0.
- La fecha del comprobante es siempre **el día en que sale a ARCA** (hora argentina), aunque se haya armado antes.

### Cuándo NO se puede facturar un pedido

- Pedido cancelado: "Un pedido cancelado no se factura."
- Pedido nuevo (sin pagar): "Un pedido nuevo no se factura."
- Pedido «A cobrar» (efectivo al retirar): "Primero confirmá el cobro: el pedido está «A cobrar» y se factura cuando se cobra."
- Carrito de Mercado Libre al que le llegó un ítem o un cambio hace menos de 10 minutos (puede faltar llegar alguna orden del mismo carrito).
- Pedido sin líneas.
- Pedido ya facturado: "Ese pedido ya está facturado."
- Si el pedido ya tiene una factura pendiente o con error, no se arma otra: se reintenta esa misma.
- Si faltan los datos de facturación, el error remite a cargarlos.

### Numeración y doble envío

- El número es **"último autorizado en ARCA + 1"**, preguntado a ARCA en el momento, con un candado por punto de venta y tipo para que dos facturas simultáneas no choquen.
- Si un envío se cortó y no se supo la respuesta, al reintentar Laucen **primero le pregunta a ARCA** si ese número ya quedó autorizado con el mismo total y documento; si es así, lo da por autorizado y no emite otra factura.
- Si ARCA **no responde** (ni siquiera para decir el último número), la factura pasa a **"Error"** con el motivo y Laucen la reintenta sola en la revisión periódica, hasta 5 veces; después queda el botón "Reintentar".
- Si ARCA **rechaza**, el número queda libre (se borra del comprobante) y el estado pasa a "Rechazado" con el motivo.
- Si hay un **error de comunicación** (ARCA no contestó, se cortó), el estado pasa a "Error" con el detalle.

### Estados de un comprobante

- **Pendiente**: armado, todavía no se mandó o no se terminó de mandar.
- **Autorizado**: ARCA dio el CAE. Ya no se puede reintentar ni modificar; sólo anular con nota de crédito.
- **Rechazado**: ARCA lo rechazó. Se reintenta a mano con "Reintentar". Los rechazados **no** se reintentan solos.
- **Error**: falló la comunicación. Se reintenta a mano, y también solo (ver abajo).

### Facturación automática

- Se prende en [Configuración › Facturación (ARCA)](/config/arca) con **"Facturar automáticamente"** y se elige el estado: **Pagado**, **Preparado** o **Despachado** ("Facturar al llegar el pedido a").
- Un proceso periódico revisa cada 2 minutos si hay algo para facturar. Factura cada pedido que **pasa justo a ese estado** y no tiene factura autorizada.
- Al prenderla, los cambios de estado anteriores se dan por vistos: **los pedidos viejos no se facturan solos**, sólo los que lleguen al estado de ahí en adelante.
- Los pedidos «A cobrar» se saltean cuando llegan al estado; cuando se confirma el cobro, se facturan si el pedido ya está en el estado elegido o más adelante.
- Los carritos de Mercado Libre en espera (menos de 10 minutos desde su último cambio) se dejan para la vuelta siguiente.
- La facturación automática la hace el "sistema", no un usuario.
- Si falla, el error queda en el comprobante (estado Error o Rechazado) y se ve en esta pantalla.

### Reintento automático de los que dieron error

En esa misma revisión periódica se reintentan solos los comprobantes en estado **Error** que tengan menos de 5 intentos (hasta 20 por vuelta, salteando carritos en espera). Esto pasa aunque la facturación automática esté apagada. Los **Rechazados** no se reintentan solos.

### Nota de crédito (anulación)

- Sólo se anula una **factura autorizada**. La nota de crédito es **por el total**: copia receptor, importes, IVA y líneas de la factura, con la misma letra (A→NC A, B→NC B, C→NC C), y va asociada a la factura en ARCA.
- Una factura con una nota de crédito autorizada, pendiente o con error no se puede volver a anular ("Esa factura ya tiene una nota de crédito."). Si la NC fue rechazada, se puede intentar de nuevo.
- No hay notas de crédito parciales.

### Subida de la factura a Mercado Libre

Mercado Libre le pide al vendedor que adjunte la factura de cada venta. Laucen sube **el PDF del comprobante** a la venta (al carrito, si es un carrito). Se pueden subir la factura y, si la hay, su nota de crédito.

Todo lo que va a Mercado Libre pasa por la cola, y siempre sale por un clic de una persona o por un interruptor que prendió alguien:
- **Sola, al autorizarse**: si la cuenta de Mercado Libre tiene prendido el interruptor **"Subir facturas a Mercado Libre"** en [Canales](/config/canales), cada factura de una venta de ML entra a la cola apenas ARCA la autoriza.
- **Con el botón** "Subir factura a Mercado Libre" (ficha del comprobante o del pedido): entra a la cola **aunque el interruptor esté apagado**.
- **En lote**, "Subir a ML las facturas que faltan": queda preparado y sale con "Mandar a Mercado Libre".

Qué entra: comprobantes autorizados, de pedidos de una cuenta de Mercado Libre con número de venta, que no estén subidos ni ya en la cola (preparados, pendientes o subiendo), y que no sean un carrito en espera. Una factura ya subida **no se vuelve a subir**. Si Mercado Libre contesta que esa venta ya tenía el documento, se da por subida. La cola reintenta sola los errores pasajeros (Mercado Libre no respondió, pidió ir más despacio, error de su lado).

### Ambiente de prueba

Si la conexión con ARCA está en modo prueba ("homologación"), los comprobantes salen igual pero **no tienen validez fiscal**; se marcan "(prueba)" en el listado y el ambiente queda guardado en cada comprobante.

### Contabilidad y cuenta corriente

- Cada comprobante autorizado genera solo su asiento contable (ver [Contabilidad](/administracion/contabilidad)).
- Si el cliente tiene habilitada la cuenta corriente (o el pedido es «a convenir»), la factura entra sola a su [cuenta corriente](/administracion/cuentas-corrientes) como deuda; la nota de crédito, como crédito.

## Con más de una razón social

Cada comprobante lo emite **una razón social**, con su CUIT, su punto de venta y su propia numeración de ARCA:

- Un pedido se factura con la razón social de su canal (la que se eligió en **"Factura con"** del canal, para las cuentas de Mercado Libre) o, si el canal no tiene una elegida —tienda web, local, mayorista—, con la **principal**. Ver [Razones sociales](/config/razones-sociales).
- Una nota de crédito sale siempre con la razón social de la factura que anula.
- El PDF lleva los datos de la razón social que emitió.
- La lista tiene un selector **"Razón social"** (**"Todas"** o una) y se puede sumar la columna **"Razón social"** en la vista.
- La **facturación automática** y el estado en que se factura se configuran por razón social en [Facturación (ARCA)](/config/arca); el aviso de "Modo prueba" lo muestra cada una.

## Preguntas frecuentes

**¿Por qué un pedido no se facturó solo?**
Revisá: que la facturación automática esté prendida, que el pedido haya pasado exactamente al estado elegido después de prenderla, que no sea «A cobrar» sin cobrar, y que no sea un carrito de ML en espera. Si salió con error, aparece acá con estado "Error" o "Rechazado".

**ARCA rechazó una factura, ¿qué hago?**
Leé el motivo en la fila o en la ficha, corregí el dato y apretá "Reintentar". El número no se pierde: un rechazado libera su número.

**¿Puedo editar una factura autorizada?**
No. Se anula con "Anular con nota de crédito" y se vuelve a facturar el pedido.

**¿Por qué salió Factura B y no A?**
Porque el cliente no figura como Responsable Inscripto o Monotributista en su ficha. Corregí su condición de IVA y su CUIT antes de facturar.

**¿Puedo hacer una nota de crédito parcial?**
No, hoy sólo hay anulación por el total.

**¿La factura se sube sola a Mercado Libre?**
Sólo si la cuenta tiene prendido "Subir facturas a Mercado Libre" en Canales. Si no, con el botón de la ficha o con "Subir a ML las facturas que faltan" y después "Mandar a Mercado Libre" en la cola.

**¿Qué significa "Preparada, falta tu clic"?**
Que está en un lote de la cola esperando que alguien apriete "Mandar a Mercado Libre".

**¿Qué fecha lleva la factura?**
La del día en que se manda a ARCA (hora argentina), aunque el pedido sea de otro día.

**¿Los comprobantes de prueba cuentan?**
No: en modo prueba contra ARCA salen pero no tienen validez fiscal.

## Relacionado

- [Configuración › Facturación (ARCA)](/config/arca)
- [Empresa](/config/empresa)
- [Pedidos](/ventas/pedidos)
- [Clientes](/ventas/clientes)
- [Cola de Mercado Libre](/config/canales/cola)
- [Canales](/config/canales)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Contabilidad](/administracion/contabilidad)
- [Libros de IVA](/administracion/libros-iva)
- [Razones sociales](/config/razones-sociales)
