---
titulo: Pedidos y presupuestos
menu: Ventas › Pedidos y presupuestos
ruta: /ventas/pedidos
rutas: /ventas/pedidos, /ventas/pedidos/[id]
permiso: pedidos_ver
resumen: Los pedidos de todos los canales (Mercado Libre, tienda web, local, mayorista) y los presupuestos del local: lista con filtros, alta a mano de pedidos y presupuestos, ficha con estado, pago, reserva de stock, envío, cargos de Mercado Libre, facturación, pasar de presupuesto a pedido y al revés, e imprimir el presupuesto en PDF.
---

## Para qué sirve

Es **la lista única de ventas** de Laucen: acá están los pedidos de todos los canales —Mercado Libre, la tienda web, el local, los mayoristas y los que entran por otros sistemas— con su estado, su pago, su envío y su factura. Desde acá:

- Se ve qué hay que preparar, despachar, cobrar o facturar.
- Se carga un pedido a mano (venta del local, de WhatsApp, de un mayorista).
- Se abre la ficha de un pedido para confirmar el pago, cambiarle el estado, cancelarlo, facturarlo o avisarle al cliente por WhatsApp.

Los pedidos de Mercado Libre **entran solos** y se mueven solos según lo que pasa en Mercado Libre.

## Cómo se llega

- Menú **Ventas › Pedidos y presupuestos** (o 🧾 **Pedidos** en la barra de abajo del celular).
- Contador **"Pedidos"** de la barra de estado (abre la lista con el filtro Pendientes).
- Tarjeta **"Pedidos abiertos"** del [Panel](/panel): cada renglón abre la lista filtrada por ese estado.
- El [buscador global](/buscar): por Nº de pedido o por id externo (número de venta de Mercado Libre).
- Desde la ficha de un cliente (su lista de pedidos), desde [Envíos](/ventas/envios), [Reclamos](/ventas/reclamos), [Preguntas y mensajes](/ventas/preguntas) y [Facturación](/administracion/facturacion): el número de pedido es un enlace a su ficha.
- En la lista de [Clientes](/ventas/clientes), el número de la columna "Pedidos" abre esta lista filtrada por ese cliente.

## Qué hay en la pantalla

### La lista ([Pedidos](/ventas/pedidos))

**Arriba a la derecha**: el desplegable de columnas del Excel, **"⬇ Descargar Excel"**, **"⚙ Configurar…"** y **"+ Nuevo pedido"**.

**Filtros** (todos aplican al momento, sin botón "Filtrar"):

- **"Buscar"** (cuadro "Nº, cliente, producto, canal, factura…"): busca en todo lo que se ve en la pantalla —Nº, id externo, canal, estado, los productos (título y SKU), el número de la factura— y además en el medio de pago, el código de seguimiento, las notas y todos los datos del cliente (N.º, nombre, razón social, mail, apodo de ML, documento, CUIT, teléfonos, notas). Busca en cualquier parte del texto (no tiene "Comienza por"). **Si escribís el número de un pedido** (el de Laucen, con o sin "#", o el número de venta de Mercado Libre), ese pedido aparece siempre, aunque los filtros lo dejarían afuera.
- **"Estado"**: **"Todos"** (de entrada), **"Pendientes (nuevo + a preparar)"**, **"Con la factura retenida"** (los que no se facturaron solos o piden cambiar la factura; lo abre el contador **"Facturas"** de la barra) o un estado puntual (Nuevo, **A preparar**, En preparación, Preparado, Despachado, Entregado, Cancelado, Devuelto).
- **"Canal"**: todos o uno.
- **"Pago"**: Pendiente, Pagado, A cobrar, A convenir, Reembolsado.
- **"Fechas"**: rango con atajos (Hoy, Ayer, Últimos 7 días…) o **"Todas las fechas"**. **De entrada, la última semana** ("Últimos 7 días"). Si se entra con un estado elegido (por ejemplo desde el contador "Pedidos") o desde un cliente, sin fechas: todas.
- **"Con algo pendiente"** (caja para tildar): sólo los pedidos que todavía no terminaron: los que no están entregados, o están entregados pero sin cobrar o sin facturar. Los cancelados y devueltos nunca entran.
- **"Incluye canceladas"** (caja para tildar): de entrada **los cancelados no se muestran**; tildándola, sí. Si elegís el estado "Cancelado", se muestran igual.
- **"Reservados sin pagar"** (caja para tildar): sólo los pedidos **Nuevos sin pagar que tienen el stock apartado** (ver "Reserva de un pedido sin pagar"), sin importar la fecha, del que vence antes al último. Es adonde lleva la fila "Reservados sin pagar" de [Para hacer](/panel).
- **"Limpiar filtros"**: aparece cuando hay algún filtro puesto; vuelve a la lista de entrada (todos los estados, última semana, sin cancelados).

**"Vista"** (arriba de la tabla, a la derecha): elegí qué columnas ver; **"⚙ Configurar vistas…"** para armar otras.

**Columnas de la vista "Estándar"**, en este orden:

| Columna | Qué muestra |
|---|---|
| **Nº** | el número del pedido en Laucen (enlace a la ficha) |
| **Fecha** | fecha y hora en que entró (enlace a la ficha) |
| **Cliente** | enlace a la ficha del cliente |
| **Cant.** · **Producto** · **Precio** | lo que se vendió, **un renglón por producto** (un carrito con tres productos ocupa tres renglones, bien juntos): la cantidad, el producto con su foto (tocándola se ven todas; el nombre abre la ficha del producto) y el precio unitario |
| **Total** | en la moneda que estés viendo |
| **Canal** | el canal; tocándolo filtra la lista por ese canal |
| **Estado** | el estado del pedido; si es un carrito de Mercado Libre en espera, al lado dice **"Carrito en espera · faltan N min"**; si es un pedido sin pagar con stock apartado, al lado dice **"reserva hasta DD/MM"** (en rojo si vence hoy o mañana) |
| **Pago** | un **✓ verde** si está pagado; si no, una **✗ roja** (al pasar el mouse dice cuál: Pendiente, A cobrar, A convenir, Reembolsado) |
| **Factura** | si está facturado, la letra y el número de la factura, corto (ej. "B 1234"; al pasar el mouse, el número completo), con enlace para verla; si no, "—". En el Excel va completo ("Factura B 00002-00001234") |

**Otras columnas** que se pueden sumar en una vista o en el Excel: Id externo, Fecha y hora, Documento del cliente, Mail del cliente, Teléfono del cliente, **Estado del pago** (el texto), Medio de pago, Total US$, Costo de envío, Comisión del canal, **Cargos ML**, **Neto ML**, Unidades, Líneas, Código de seguimiento, Notas y **Factura en ML** (sólo en ventas de Mercado Libre: "✓ Subida", "⏳ Pendiente", "⚠ Error" u "○ Falta"). En el Excel, los productos de un carrito van en una misma celda separados por " | ".

**Orden**: con el filtro Pendientes, **del más viejo al más nuevo** (se preparan en orden de llegada). Con cualquier otro filtro, del más nuevo al más viejo. Se puede ordenar tocando el título de cualquier columna (salvo Notas, Cant., Producto, Precio y Factura).

### El formulario "Nuevo pedido o presupuesto"

Se abre con **"+ Nuevo pedido o presupuesto"**, debajo del encabezado. Sirve para los canales de tipo **local, web minorista, web mayorista u otro** que estén activos (nunca Mercado Libre). Campos:

- **"¿Qué es?"**: **"Pedido"** (reserva stock; de entrada) o **"Presupuesto"** (no reserva stock; **sólo en el canal local**: al elegirlo, el desplegable de canales muestra sólo los locales). Con Presupuesto no se pide el pago: en su lugar aparece **"Válido hasta"** (de entrada, dentro de 7 días), y el botón dice **"Crear presupuesto"**.
- **"Moneda"**: **"Pesos"** o **"Dólares"**: en qué moneda se arma (de entrada, la de la lista del canal). Los precios sugeridos se muestran en esa moneda y **queda grabada en el pedido**: en la ficha dice "hecho en dólares" (o pesos) y en la lista, al lado del total, una marca verde **"US$"**, aunque después lo mires en pesos.
- **"Lista de precios"**: **"La del cliente o del canal"** (de entrada; si ninguno de los dos tiene, la [lista por defecto](/catalogo/precios)) o cualquier lista activa (por ejemplo la mayorista). Los precios de las líneas se recalculan al cambiarla, y la lista elegida queda en el pedido (la ficha la muestra).
- **"Canal"**: desplegable con esos canales (el del local primero).
- **"Cliente"**: **"Un cliente"** (de entrada) o **"Consumidor final"**. Con "Un cliente" aparece un buscador ("Nombre, documento, CUIT, mail o N.º"; busca en todos los datos del cliente, rápido aunque haya más de 100.000 clientes) con su caja "Comienza por"; al elegir uno se muestra "N.º … · nombre · documento" (y "con cuenta corriente" si la tiene) con el botón **"Cambiar"**. Si el cliente no es consumidor final y no tiene CUIT (o su CUIT no es válido), debajo aparece en amarillo **"Faltan datos para facturar: …"** con el enlace **"Completar en la ficha"** (se abre aparte); después, "Cambiar" y volver a elegirlo. Para dar de alta un cliente está **"+ Cliente nuevo"**, al lado de "Un cliente" (no hace falta buscarlo antes) y también debajo del buscador: pide **"Razón social"** (viene con lo que escribiste; si buscaste un número, ese número va al CUIT si tiene 11 cifras o al DNI si no), **"Tipo"** (Minorista o Mayorista), **"CUIT / CUIL"**, **"DNI"**, **"Condición IVA"** (se sugiere sola: con CUIT, Responsable inscripto; sin CUIT y con DNI, Consumidor final; se puede cambiar y, una vez elegida a mano, no se toca; es obligatoria y, si no es Consumidor final, pide el CUIT), **"Mail"**, **"Teléfono"**, **"WhatsApp"** y **la dirección** (obligatoria: **"Calle"**, **"Número"** y **"Localidad"**; **"Piso / depto"** y **"CP"** opcionales; **"Provincia"** de las 24, escribiendo un par de letras, con Córdoba de entrada), que queda como su dirección principal; con **"Grabar y elegir"** se crea y queda elegido en el pedido, sin salir de la pantalla. Mientras escribís el CUIT, si el último número no corresponde (dígito verificador) avisa en rojo "No es válido" y no deja grabar. Si ya está cargado, avisa: con el mismo **CUIT o DNI** no deja crear otro y muestra el que está, con **"Elegir éste"**; con la misma **razón social** muestra los que hay ("¿Es el mismo?") con **"Elegir éste"**, o **"Es otro cliente: grabarlo igual"**. También hay un enlace para cargarlo con todos los datos en la pantalla de [Clientes](/ventas/clientes) (se abre aparte, y después volvés y lo buscás).
- **"Productos"**: arriba, los que ya elegiste; **abajo, siempre a mano, el buscador** "SKU, título o código de barras". **Todo se hace con el teclado**: con las **flechas ↓ ↑** te movés por los resultados (el marcado se ve celeste) y con **Enter** lo sumás; el cursor salta a su **cantidad** (seleccionada: si tipeás 2, queda 2, no 12). **Enter** (o Tab) pasa de la cantidad al **precio**, del precio al **descuento** y del descuento vuelve al buscador para el siguiente producto. Si un producto no tiene precio (vacío o cero), debajo dice en rojo **"Ojo, no tiene precio"**; si escribiste un precio distinto al de la lista, el campo se pinta de ámbar y abajo dice "Lista: $ …" (busca desde la segunda letra, con "Comienza por"). Cada resultado muestra SKU, título, precio de lista (o "sin precio" en rojo) y lo disponible para el canal ("N disp.", en rojo si es 0 o menos). Al elegir uno (clic o Enter sobre el primero) se suma una línea.
- **Tabla de líneas**: SKU, Producto (con avisos "Sin stock disponible en el canal" o "Sin precio en la lista: escribilo"), **Cantidad** (arranca en 1), **Precio** (el de la lista, editable), **Descuento %**, Subtotal y el tacho (pregunta **"¿Sacar?"** **"Sí"** / **"No"**).
- **"Pago"**: **"A cobrar (a convenir)"** (marcado de entrada), **"Pagado"** o **"Cuenta corriente"**. Debajo, **"Medio de pago"**: Efectivo, Transferencia, Tarjeta de débito, Tarjeta de crédito, Mercado Pago, Cheque, Otro (con "A cobrar" es opcional, "si ya se sabe"; con "Pagado" es obligatorio; con "Cuenta corriente" no se pide).
- **"Entrega"**: **"Retira"** o **"Envío"**. Con Envío aparecen Calle, Número, Piso/depto, Localidad, Provincia, CP, Referencia y **"Costo del envío"**. Si elegiste un cliente con dirección, se completa sola (primero la que tiene etiqueta "Envío", si no la principal).
- **"Notas"**.
- Abajo, el **"Total"** (se recalcula mientras escribís) y el botón **"Crear pedido"**.

### La ficha del pedido ([Pedido](/ventas/pedidos))

Título "Pedido 1234 · id externo", con el canal y la fecha y hora debajo. Bloques, de arriba hacia abajo:

1. **Cabecera**: Estado (y la marca de carrito en espera, con un recuadro que explica desde qué hora se puede tocar), Pago (con el medio), el cartel **"A COBRAR $ …"** si corresponde, Total (y "cargado en dólares/pesos" si se cargó en la otra moneda), Depósito (o "no mueve stock"), Cliente (con documento y mail, el botón **"Cambiar cliente"** y, si se cambió, **"Original: …"** con el cliente que tenía), Canal, Fecha, Unidades y Notas.
2. **"Líneas"**: SKU (enlace al producto, con su foto si tiene), Título (en un carrito de Mercado Libre con varias órdenes, debajo dice "Orden ML …"), Cantidad, **Garantía** (la que tenía lo vendido en el momento de la venta), Lista, Descuento, Unitario, Subtotal y el Total.
3. **"Envío"**: si es de Mercado Envíos, Logística (Full, Flex, Colecta, Despacho en correo, A convenir), Estado del envío, "Despachar antes de", "Entrega estimada", las fechas del envío según Mercado Libre (**"Etiqueta impresa"**, **"Lista para preparar"**, **"En camino"**, **"Recibido por el cliente"**: en verde con la fecha y hora cuando pasó, **"Pendiente"** en amarillo mientras no; "No entregado", "Devuelto" o "Cancelado" en rojo si pasó). "Despachar antes de" es el plazo que figura en la etiqueta (en azul; en rojo si ya venció sin despachar), "Recibe", "Seguimiento" y "Dirección". Si no, los datos de entrega cargados ("Sin datos de envío." si no hay). En los pedidos que no son de Mercado Libre y tienen dirección con código postal, el botón **"🚚 Despachar por OCA"**; ya dado de alta en OCA, el número de envío, **"🖨 Etiqueta de OCA"**, **"↻ Actualizar seguimiento"**, **"Anular en OCA"** (mientras no salió) y los últimos movimientos que informó OCA. Ver [OCA](/config/envios/oca). Debajo, la **"Comisión de Mercado Libre"** (y el número de carrito) y, en rojo, el aviso si tiene artículos sin vincular.
4. **"Historial de estados"**: fecha, cambio ("Pagado → **En preparación**"; "Sin cambio de estado" cuando lo que cambió fue el cliente), quién (o "Sistema") y nota (por ejemplo "Cliente cambiado: A → B").
5. **"Mensajes"** (sólo si hay): la conversación del pedido, como un chat. Trae los mensajes de Mercado Libre de la venta y el WhatsApp del cliente desde que se hizo el pedido. Los del comprador salen a la izquierda y los nuestros a la derecha, con quién lo escribió (el comprador, nosotros o la IA), dónde y cuándo.
5. **"Cargos de Mercado Libre"** (sólo si ya están): la venta, cada cargo restado por tipo y el **"Neto de Mercado Libre"**; aparte, las retenciones y percepciones.
6. **"Operación"** (sólo pedidos que **no** son de Mercado Libre): ver más abajo.
7. **"Pagos"**: los pagos registrados (Fecha, Medio, Estado, Importe, Detalle). En los de Mercado Libre aparece sólo si hay alguno.
8. **"Facturación"**: los comprobantes del pedido (tipo y número, estado, **"PDF"** si está autorizado, y si es de Mercado Libre, "En ML: …") y los botones **"Facturar"** y **"Subir factura a Mercado Libre"**.
9. **"Movimientos de stock"**: cada reserva, venta o liberación que generó el pedido (fecha, tipo, SKU, producto —o "del kit …"—, cantidad, desde, hacia, nota).

### Los botones de arriba a la derecha

En la ficha, arriba a la derecha (donde va "Nuevo" en otras pantallas):

- **Presupuesto**: **"🖨 Imprimir"**, **"Pasar a pedido"**, **"Cancelar presupuesto"** (pregunta "¿Cancelar el presupuesto?" y aclara que no toca el stock, porque un presupuesto no reserva), **"WhatsApp ↗"** y el **lápiz**.
- **Pedido** (que no es de Mercado Libre): **"🖨 Imprimir"** (el mismo PDF del presupuesto, con el título "PEDIDO" y sin la vigencia), **"Pasar a presupuesto"** (sólo si se puede, ver Presupuestos), **"Cancelar pedido"**, **"WhatsApp ↗"** (gris si el cliente no tiene teléfono) y el **lápiz** si se puede editar.
- **Venta de Mercado Libre**: **"🖨 Imprimir"** y **"Cancelar pedido"** (explica que se cancela desde Mercado Libre).
- **Eliminar (el tacho 🗑, sólo superadministradores)**: en un **presupuesto** o en un **pedido cancelado**, pregunta "¿Eliminar … del todo? No queda nada." con Sí / No. Borra el pedido o presupuesto entero, sin dejar rastros (líneas, historial, pagos sin cobrar, envíos anulados, los movimientos de reserva y liberación de stock). **No se puede** si es de Mercado Libre, si tuvo factura o nota de crédito, un cobro (contabilizado, en Caja y bancos o un pago cobrado), si vendió stock, si tiene un reclamo o una devolución, o un envío sin anular: en esos casos dice por qué.

### Editar (el lápiz)

El lápiz abre el mismo formulario del alta con los datos cargados: cliente, moneda, lista de precios, productos (cantidad, precio, descuento; se pueden sacar y sumar), entrega, envío, notas y, en un presupuesto, "Válido hasta". El canal no se cambia. **"Grabar"** y **"Cancelar"** quedan arriba a la derecha.

- **Un presupuesto se edita siempre** (mientras no esté cancelado).
- **Un pedido, sólo si todavía no se tocó**: no es de Mercado Libre, **no está pagado**, está Nuevo o A preparar (cuenta corriente), no entró en picking y no tiene factura. Vale también para los de la tienda web sin pagar. **Si está pagado, no se edita** (no aparece el lápiz).
- Al grabar, **lo que sacás libera su stock reservado y lo que sumás lo reserva** (si el pedido ya reservaba; un presupuesto no reserva nada). El total se recalcula con los productos y el envío. Los precios de los productos que ya estaban se respetan tal cual; los que sumás vienen de la lista.

### El bloque "Operación"

**Comprobante de pago y conforme de retiro**, dos botones distintos:

- **"📎 Subir comprobante de pago"**: sólo mientras el cobro **no está registrado** (pago pendiente, a cobrar o a convenir). Foto o PDF. Lo subido queda como "Comprobante de pago:" con su link y su tacho, aunque después el pago se confirme.
- **"✍ Subir conforme de retiro"**: sólo cuando el pedido **no va por ningún transporte** (retira en el local; en Mercado Libre, las ventas que retiran). Es la firma de quien retira —el cliente o un comisionista— y, si hace falta, la foto de su DNI (por ejemplo, cuando pagó con tarjeta de crédito). Se pueden elegir varias fotos a la vez. Sólo queda guardado como "Conforme de retiro:": no cambia el estado ni el pago.

Los dos se guardan en un lugar privado: sólo los ven los usuarios del sistema.

Aparece en los pedidos que no son de Mercado Libre. Según el estado y el pago muestra:

- **"Entrega: …"** (el método de envío, si tiene).
- El cartel **"A COBRAR $ … al retirar"** (o "al entregar").
- **"Confirmar pago de $ …"** con el desplegable **"Pagó con"**: cuando el pago está Pendiente, A convenir o A cobrar y el pedido no está cerrado.
- **"Cliente presente: retira"**: cuando el pedido **retira** en el local y ya está **Preparado**. Si se paga al retirar («A cobrar»), dice **"Cliente presente: retira y paga $ …"** con **"Cobró con"**. Ver "El cliente retira en el local".
- Si el método de envío tiene el **seguimiento automático** (OCA), no hay botones de "Despachado" ni "Entregado": dice "El envío lo sigue el transportista: el pedido pasa solo a «Despachado» cuando lo retiran y a «Entregado» cuando lo entregan."
- Los botones del **estado siguiente** (ver la tabla de "Criterios").
- **"Cancelar pedido"** (arriba a la derecha): pregunta ahí mismo "¿Cancelar el pedido?" y dice qué más va a hacer (liberar el stock, anular el envío de OCA, anular o devolver el pago de Payway), con **"Sí"** / **"No"**. Si el pedido tiene factura, pregunta aparte "¿Emitir la nota de crédito…?". No aparece en pedidos entregados, cancelados o devueltos. **Un pedido Despachado, o con el envío de OCA ya en camino, no se cancela**: en su lugar dice "Ya salió: no se cancela. Si la mercadería vuelve, hacé la devolución." (así no se devuelve el pago ni se anula la factura de algo que está viajando). **En una venta de Mercado Libre**, "Cancelar pedido" no cancela: explica que las ventas de Mercado Libre se cancelan desde Mercado Libre, que Laucen lee el cambio enseguida (el pedido queda cancelado y el stock vuelve) y deja el botón **"Abrir la venta en Mercado Libre ↗"**.
- **"Avisar por WhatsApp"**: abre WhatsApp con un mensaje armado para el cliente según el estado. Si el cliente no tiene teléfono: "El cliente no tiene teléfono cargado: no se le puede avisar por WhatsApp."

## Cómo se hace

### Ver qué hay que preparar

1. Abrí [Pedidos](/ventas/pedidos): entra con el filtro **Pendientes**, del más viejo al más nuevo.
2. Los «A cobrar» se ven con el pago en ámbar.
3. La preparación en sí (juntar las unidades) se hace en [Picking](/deposito/picking); al armar el lote, los pedidos pasan solos a "En preparación" y al terminar a "Preparado".

### Cargar un pedido a mano (local, WhatsApp, mayorista)

1. Apretá **"+ Nuevo pedido"**.
2. Elegí el **"Canal"**.
3. En **"Cliente"**: buscá el cliente (viene marcado **"Un cliente"**), cargalo con **"+ Cliente nuevo"** o marcá **"Consumidor final"**. Si el cliente tiene una lista de precios propia, los precios cambian a los de esa lista.
4. En **"Productos"**, buscá cada producto y elegilo. Ajustá **Cantidad**, **Precio** y **Descuento %** si hace falta.
5. Elegí el **"Pago"**:
   - **"A cobrar (a convenir)"**: el cliente paga después (por ejemplo, en efectivo al retirar).
   - **"Pagado"**: ya pagó; elegí el **"Medio de pago"**.
   - **"Cuenta corriente"**: se le carga a la cuenta del cliente (hace falta un cliente, no consumidor final).
6. Elegí la **"Entrega"**: **"Retira"** o **"Envío"** (con Envío completá al menos calle y localidad; el **"Costo del envío"** se suma al total).
7. Si querés, escribí **"Notas"**.
8. Apretá **"Crear pedido"**. Si sale bien, vas a la ficha del pedido nuevo con el aviso "Pedido N creado.". Si algo falla, el error aparece arriba del formulario y lo cargado queda como estaba.

Errores típicos: "Elegí el cliente (o marcá «Consumidor final»).", "Línea N: falta el precio.", "Línea N: la cantidad tiene que ser un entero mayor que cero.", "Elegí con qué pagó.", "La cuenta corriente necesita un cliente (no consumidor final).", "Para el envío completá al menos la calle y la localidad.", "Los pedidos de Mercado Libre entran solos: no se cargan a mano.". Si no hay canales para cargar a mano, el formulario dice "No hay canales para cargar pedidos a mano (local, web, mayorista u otro). Crealos en Configuración → Canales."

### Confirmar el pago de un pedido

1. Abrí la ficha del pedido.
2. En **"Operación"**, elegí en **"Pagó con"** el medio.
3. Apretá **"Confirmar pago de $ …"**. Aviso: "Pago confirmado: el pedido quedó pagado."
4. Si el pedido estaba Nuevo, pasa a **A preparar** (pagado) y entra en picking (el stock ya estaba reservado desde que nació). Si era «A cobrar» y ya venía avanzando (en preparación, preparado…), el estado no cambia: sólo el pago queda Pagado, y desde ahí se puede facturar.

### El cliente retira en el local

1. Cuando el pedido está **Preparado** y el cliente viene a buscarlo, en **"Operación"** apretá **"Cliente presente: retira"**.
2. Si lo paga al retirar («A cobrar»), el botón dice **"Cliente presente: retira y paga $ …"**: elegí antes en **"Cobró con"** con qué pagó.
   Si es **a cuenta corriente**, no se cobra: queda entregado y la factura se carga a su cuenta.
3. En un solo paso: se confirma el cobro (si hacía falta), el pedido queda **Entregado** (es el estado de "ya lo retiró"; el stock reservado pasa a vendido) y, **si todavía no tiene factura, se factura en el momento** (y si el cliente tiene WhatsApp y la casilla "Enviarle la factura por WhatsApp", se le manda). Aviso: "Entregado · Factura B … emitida." Si la factura no sale (por ejemplo, ARCA no responde), el pedido queda entregado igual y el aviso dice qué falló: se reintenta desde la factura.

**Ventas de Mercado Libre sin envío** (las que en el picking dicen «Retira por el local»): cuando están **Preparadas**, también tienen **"Cliente presente: retira"**. En un solo paso, el pedido queda **Entregado**; si todavía no tiene factura, se revisa lo que pidió el comprador y se factura (la factura se sube sola a Mercado Libre); y se le avisa a Mercado Libre que la venta se concretó (el comprador ya tiene el producto): la venta pasa a entregada en Mercado Libre y a él le piden que lo confirme. El aviso sale solo con ese botón, no hay que confirmarlo en otro lado; en el mismo pedido queda la línea **"Aviso a Mercado Libre de que lo retiró"**: «Mandándose…», «Recibido» con la fecha, o «Falló» con el motivo.

### Avanzar el estado a mano (pedidos que no son de Mercado Libre)

1. En **"Operación"**, apretá el botón del estado siguiente (por ejemplo **"Preparado"**, **"Despachado"**, **"Entregado"**).
2. Para **"Despachado"** podés escribir en **"Seguimiento / nota"** el número de seguimiento (por ejemplo "OCA 1234567890"); queda en el historial y se usa en el mensaje de WhatsApp.

### Cancelar un pedido

1. En **"Operación"**, apretá **"Cancelar pedido"**. Pregunta "¿Cancelar el pedido?" y dice qué más va a pasar. Confirmá con **"Sí"**.
2. Si el pedido tiene una factura autorizada, pregunta aparte **"¿Emitir la nota de crédito de la Factura …?"**: **"Sí, cancelar con nota de crédito"**, **"No, cancelar sin nota de crédito"** o **"No cancelar"**.
3. Corre de fondo (el botón dice "Trabajando…") y al terminar aparece el cartel abajo a la derecha con lo que se hizo. En orden:
   - El pedido queda **Cancelado** y se libera el stock que tenía reservado (las publicaciones de Mercado Libre que se habían pausado por falta de stock se reactivan solas).
   - Si tiene un **envío de OCA** que todavía no salió, se **anula en OCA**. Si ya salió, avisa que no se pudo.
   - Si se pagó con **Payway**, se le pide a Payway la devolución total: si el pago es **del mismo día** (antes del cierre de lote) Payway lo toma como **anulación**; si es de **otro día**, como **devolución** (el dinero vuelve al resumen de la tarjeta). El pago queda "Reembolsado".
   - Si elegiste la nota de crédito, se emite por el total de la factura.
4. Si algún paso falla (por ejemplo OCA o Payway no responden), el cartel sale en rojo diciendo cuál. El pedido queda cancelado igual; lo que falló se hace a mano: "Anular en OCA" en el pedido, la devolución en el panel de Payway, o "Anular con nota de crédito" en la factura.

Un pedido cancelado no cambia más de estado, salvo que se lo **levante** (abajo).

### Levantar un pedido cancelado

Para cuando el cliente se arrepiente o se canceló por error (no para las ventas de Mercado Libre: esas las maneja Mercado Libre).

1. En la ficha del pedido cancelado, arriba a la derecha, apretá **"Levantar pedido"**. Pregunta "¿Levantar el pedido? Vuelve a Nuevo y reserva el stock otra vez (si falta algo, te aviso)." Confirmá.
2. Corre de fondo. El pedido vuelve a **Nuevo** y **reserva el stock otra vez**. Si el pago había quedado "Reembolsado", vuelve a "Pendiente". Si no está pago, la reserva tiene otra vez sus días completos (los de [Empresa](/config/empresa)).
3. El cartel dice "Pedido N levantado…". **Si de algún producto ya no alcanza el stock**, el cartel avisa **"OJO: no alcanza el stock de …"** con los SKU: el pedido se levanta igual y lo que falta queda reservado en negativo (como un pedido que entró sin stock); hay que reponerlo o sacarlo del pedido con el lápiz.
4. En el historial queda "pedido levantado (se volvió a reservar el stock)".

### Facturar un pedido

1. Abrí la ficha. En el bloque **"Facturación"**, apretá **"Facturar"** (hace falta el permiso «Facturación»).
2. Laucen arma la factura y la manda a ARCA. Si queda autorizada, aparece el comprobante con su número y el botón **"PDF"**, y un aviso verde con el CAE.
3. Si ARCA la rechaza o falta un dato, el aviso rojo explica por qué; si el problema es del cliente (por ejemplo, falta el CUIT para una factura A), al lado aparece **"Corregir en la ficha del cliente"**.

Al facturar a mano no se hace la revisión de mensajes (ver abajo): sale con los datos de hoy de la ficha del cliente y las **Observaciones de la factura** del pedido.

El botón **no aparece** si el pedido está Nuevo o Cancelado, o si ya tiene una factura autorizada (que no esté anulada con una nota de crédito). Está **deshabilitado** si el pedido es «A cobrar» ("Primero confirmá el cobro: el pedido está «A cobrar» y se factura cuando se cobra.") o si es un carrito de Mercado Libre en espera.

### Observaciones de la factura

Debajo de «Facturación», la caja **"Observaciones de la factura"**: un texto que sale en **"Observaciones"** de la próxima factura del pedido, en la pantalla de la factura y en su PDF (por ejemplo, el número de un subsidio que el comprador tiene que rendir). Se edita con el lápiz de la caja y se graba con **Grabar**. Si el comprador lo pide por mensaje, lo carga solo la revisión antes de facturar. Abajo dice qué leyó la última revisión.

### Revisión antes de facturar (y factura retenida)

Antes de que salga sola una factura (la facturación automática de [Facturación (ARCA)](/config/arca)), Laucen lee lo que escribió el comprador —los mensajes de Mercado Libre del pedido y los WhatsApp del cliente desde el pedido— y las **notas del pedido** y las **notas del cliente**:

- **Si no hay nada escrito**, o lo escrito no tiene que ver con la factura, factura como siempre.
- **Si pidió algo claro para la factura**, lo aplica y factura:
  - una **leyenda** (un número de subsidio, de expediente, de orden de compra…) → va a "Observaciones de la factura";
  - **factura A** o **facturar a un CUIT** → pasa el CUIT (y la razón social, si la dio) a la ficha del cliente, sin consultar el padrón de ARCA. Quien da un CUIT o pide factura A queda como **Responsable Inscripto**, salvo que diga expresamente otra cosa (monotributista, exento…). Si la ficha ya tenía una condición de IVA distinta de consumidor final, no se pisa a menos que el comprador la diga. Con Responsable Inscripto, la factura sale A.
- **Si hay duda** (otra razón social o domicilio sin CUIT, pide A sin dar el CUIT, un CUIT que no es válido o que en ARCA no corresponde a A, partir la factura, otro importe, algo que no se entiende…), **no factura**: el pedido queda con **"⚠ Factura retenida: no se facturó sola"** y el motivo, arriba del bloque «Facturación», y avisa en la barra de estado (**"Facturas"**), en la ventana y en el aviso de Windows (ver [Mis avisos](/config/avisos)). Corregí lo que haga falta en la ficha del cliente y en las Observaciones de la factura, y apretá **"Facturar"**.

Con los mismos datos no se vuelve a leer: sólo cuando el comprador escribe algo nuevo o cambian las notas.

### Cambiar el cliente del pedido

Para corregir un pedido cargado a nombre de otro (por ejemplo, con la razón social equivocada y la factura rechazada). Vale para cualquier pedido no cancelado, **pagado o no y también los de Mercado Libre**.

1. En la cabecera, debajo del cliente, **"Cambiar cliente"**. Se abre ahí mismo el buscador de clientes (el mismo de «Nuevo pedido») con **"+ Cliente nuevo"** para darlo de alta.
2. Elegido el cliente, si le faltan datos para facturar lo avisa en amarillo con **"Completar en la ficha (se abre aparte)"**.
3. **Sin factura**: **"Cambiar el cliente"**. Después, **"Facturar"** sale con el cliente nuevo.
4. **Con factura**: **"Cambiar y refacturar"** hace una **nota de crédito idéntica** de la factura actual y una **factura nueva** a nombre del cliente nuevo (como "Refacturar con datos actuales"). Hace falta poder facturar.
5. El cartel verde dice **"Listo: el cliente ahora es …"** ahí mismo.

Queda registro: en la cabecera, **"Original: …"** con el primer cliente que tuvo el pedido (y su CUIT o documento y el mail que había escrito el comprador en la tienda), y una línea en el historial "Cliente cambiado: A → B". Los avisos y la factura por mail o WhatsApp van a los datos del cliente nuevo.

No se puede (lo dice en lugar del botón): si el pedido **ya está en una cuenta corriente**, o si hay una factura **a medio salir** (pendiente o con error: primero terminarla con «Facturar»).

### Refacturar (cambiar una factura ya hecha)

- **A mano**: si el pedido tiene una factura vigente, en el bloque «Facturación» está **"Refacturar con datos actuales"**. Hace una **nota de crédito idéntica** a la factura (del mismo tipo: a una B, una nota de crédito B) que la anula, y una **factura nueva** con los datos de hoy de la ficha del cliente y las Observaciones de la factura. Las dos salen con la fecha del día. Sirve, por ejemplo, cuando el cliente pidió por teléfono factura A: cargá su CUIT en la ficha del cliente (con «Validar en ARCA») y apretá el botón.
- **El envío**: nunca va solo en la factura. Sólo si el comprador lo pidió por mensaje (la IA lo marca en el pedido), la factura lleva una línea «Envío» con lo que pagó.
- **Venta de Mercado Libre refacturada**: la factura nueva se sube sola a la venta (reemplaza a la anterior) y, cuando queda subida, Laucen le manda al comprador un mensaje avisándole que ya tiene la factura corregida.
- **Sola**: si el comprador escribe **después** de la factura pidiendo un cambio claro (factura A con su CUIT, una leyenda), Laucen refactura sola de la misma manera. Si el pedido no está claro, queda **"⚠ Revisar la factura"** con el motivo y el aviso **"Facturas"**: refacturá con el botón o apretá **"Dejar la factura como está"**.
- **En Mercado Libre** (acepta un solo documento fiscal por venta): la nota de crédito no se sube. Si la factura anterior estaba subida a la venta, la nueva **la reemplaza**: se borra la anterior y se sube la nueva. Pasa solo en las cuentas con «Subir facturas a Mercado Libre» prendido ([Canales](/config/canales)); en las demás, con el botón «Subir factura a Mercado Libre». Si el comprador había escrito por la mensajería de esa venta, se le avisa ahí: «¡Hola! Ya cargamos en tu compra la factura corregida (…)».
- **Por WhatsApp**: si al cliente le corresponde (ver abajo), la factura nueva le llega sola, con el texto «factura corregida».

### Mandarle la factura al cliente por WhatsApp

Cuando una factura queda autorizada, le llega sola por WhatsApp al cliente si:
- el cliente tiene **WhatsApp** cargado en su ficha y la casilla **"Enviarle la factura por WhatsApp"** tildada ([Clientes](/ventas/clientes)), y
- el pedido **no es una venta de Mercado Libre**, o lo es pero el cliente nos escribió por WhatsApp por esa compra (la factura de una venta de Mercado Libre va a Mercado Libre).

Dentro de las 24 horas del último mensaje del cliente le llega el PDF. Pasadas las 24 horas, WhatsApp sólo deja mandar un mensaje con **plantilla**: le llega «Hola …, te enviamos la Factura B … de tu compra» con el botón **"Ver la factura"**, que abre el PDF. La plantilla la pide Laucen sola a Meta la primera vez; hasta que Meta la aprueba, la factura queda pendiente y sale sola cuando se aprueba (se reintenta durante 3 días).

En el bloque «Facturación» del pedido, al lado de cada factura dice **"WhatsApp: enviada el … (a …)"**, o pendiente o el error con el motivo. El botón **"Mandar por WhatsApp"** la manda en el momento (por ejemplo, si el cliente la pide de nuevo o si se tildó la casilla después). Hace falta una línea de WhatsApp conectada ([WhatsApp](/ventas/mensajes)). El envío queda también en el chat del cliente.

### Subir la factura a la venta de Mercado Libre

1. En la ficha de un pedido de Mercado Libre con factura autorizada que todavía no está en Mercado Libre, apretá **"Subir factura a Mercado Libre"**.
2. La factura (y la nota de crédito, si la hay) va a la cola de Mercado Libre y sale en un momento. El estado se ve en "En ML: …" y en la columna "Factura en ML" de la lista.

### Avisarle al cliente por WhatsApp

1. En **"Operación"**, apretá **"Avisar por WhatsApp"**.
2. Se abre WhatsApp con un mensaje listo según el estado (por ejemplo "¡Hola Juan! Confirmamos el pago de tu pedido #1234. Ya lo estamos preparando."). Revisalo y mandalo desde WhatsApp.

### Ver cuánto quedó neto de una venta de Mercado Libre

1. Abrí la ficha: el bloque **"Cargos de Mercado Libre"** muestra la venta, cada cargo y el **"Neto de Mercado Libre"**.
2. En la lista, sumá a tu vista las columnas **"Cargos ML"** y **"Neto ML"**.

## Criterios y reglas

- **La lista se actualiza sola**: estando en Pedidos (por ejemplo con el filtro Pendientes, al que se llega desde la barra de estado), cada 15 segundos se fija si cambió la cantidad de pendientes. Si entró un pedido o si otro operador (o vos en otra pestaña) resolvió uno, la lista se actualiza y desaparecen los que ya no están pendientes. Si estás escribiendo en un campo, espera a que termines.

### Canales: de dónde vienen los pedidos

| Canal | Cómo entra el pedido |
|---|---|
| **Mercado Libre** | solo: Mercado Libre avisa cada venta al instante y, por si se perdió un aviso, cada 30 minutos se revisan las órdenes que cambiaron (la primera vez, los últimos 3 días; después, desde la última revisión con 1 hora de margen) |
| **Tienda web** | solo, cuando el comprador termina la compra en la tienda |
| **Local, web mayorista, otro** | a mano con **"Nuevo pedido"**, o por la conexión con otros sistemas (planilla mayorista, WhatsApp) |
| **Ventas históricas** | por la importación de datos: nacen Entregadas y **no mueven stock** |

Un mismo pedido nunca se duplica: si llega dos veces con el mismo id externo en el mismo canal, se devuelve el que ya existe.

### Estados del pedido y cómo pasan

El estado «pagado y esperando que lo preparen» se muestra como **A preparar**, en naranja (distinto del amarillo de En preparación y Preparado). Que esté pago se ve aparte, en la columna Pago (✓).

Los estados, en orden: **Nuevo → Pagado → En preparación → Preparado → Despachado → Entregado**. Aparte: **Cancelado** y **Devuelto**.

- **Sólo se avanza**, nunca se vuelve atrás (por ejemplo, un Despachado no puede volver a Pagado). Se puede saltar estados hacia adelante.
- **Cancelado** y **Devuelto** se pueden poner desde cualquier estado que no esté cerrado. Un pedido cancelado o devuelto **no cambia más**.
- Repetir el mismo estado no hace nada.
- Todo cambio queda en el **"Historial de estados"** con quién lo hizo (una persona o "Sistema") y su nota.

**Quién mueve cada estado:**

| Paso | Pedido de Mercado Libre | Otros canales |
|---|---|---|
| → **A preparar** (pagado) | solo, cuando Mercado Libre informa que todas las órdenes del carrito que siguen en pie están pagas | al confirmar el pago (**"Confirmar pago"**, o el pago online de la tienda); con **"Cuenta corriente"** pasa a A preparar al crearse |
| → **En preparación** | [Picking](/deposito/picking), al armar el lote | Picking, o el botón **"En preparación"** |
| → **Preparado** | Picking, al terminar | Picking, o el botón **"Preparado"** |
| → **Despachado** | solo, cuando Mercado Envíos marca el envío "en camino" | botón **"Despachado"** |
| → **Entregado** | solo, cuando Mercado Envíos u OCA marcan el envío entregado | botón **"Entregado"** o **"Cliente presente: retira"** |
| → **Cancelado** | solo, cuando se cancelan **todas** las órdenes del carrito | botón **"Cancelar pedido"** |
| → **Devuelto** | al cerrar la recepción de la devolución en el depósito | igual |

Los pedidos de Mercado Libre **no tienen botones de estado** en la ficha: los mueve Mercado Libre. Si en Laucen ya están más adelante (por ejemplo, Preparado por el picking), lo que llega de Mercado Libre no los hace retroceder.

**Botones de estado siguiente en "Operación"** (pedidos que no son de Mercado Libre):

| Estado actual | Botones |
|---|---|
| Nuevo esperando el pago | ninguno (sólo "Confirmar pago" y "Cancelar pedido") |
| Nuevo «A cobrar» o a convenir | "En preparación", "Preparado" |
| Pagado | "En preparación", "Preparado" |
| En preparación | "Preparado" |
| Preparado | "Despachado" (con "Seguimiento / nota") y "Entregado" si el envío es manual (cadetería, envío propio); "Cliente presente: retira" si retira en el local; ninguno si el seguimiento es automático (OCA) |
| Despachado | "Entregado" |

### Presupuestos

Un **presupuesto** es igual a un pedido (cliente, productos, precios, envío, total) pero **no reserva stock**: es una cotización. Se reconoce porque su estado dice **"Presupuesto"** (en violeta) y su ficha se titula "Presupuesto N".

- **Se crea sólo en el canal local**, con "+ Nuevo pedido o presupuesto" eligiendo **"Presupuesto"**. Tiene una fecha **"Válido hasta"** (de entrada, 7 días); se cambia en su ficha.
- **No pide pago, no reserva stock, no entra en picking, no se factura** y no cuenta como venta (ni en Rentabilidad, ni en el total comprado del cliente, ni en las ventas del tablero).
- En su ficha, en vez de "Operación", el bloque **"Presupuesto"** con **"Válido hasta"** (con **"Cambiar"**; dice **"Vencido"** en rojo si ya pasó). Los botones (**"🖨 Imprimir"**, **"Pasar a pedido"**, **"Cancelar presupuesto"**, **"WhatsApp ↗"** y el lápiz) van arriba a la derecha.
- **"Pasar a pedido"** (pregunta antes): queda **Nuevo**, con el **pago pendiente**, y **reserva el stock** en ese momento. Desde ahí sigue como cualquier pedido (confirmar pago, preparar, facturar…). Corre de fondo y avisa con un cartel.
- **"Pasar a presupuesto"** (arriba a la derecha en un pedido, pregunta antes): **libera el stock reservado** y el pedido vuelve a ser presupuesto, con el pago pendiente. Sólo se puede si el pedido **todavía no se tocó**: está Nuevo o A preparar (por ejemplo, de la web en cuenta corriente, para pagar en el local o por transferencia), **no está pagado**, **no entró en un lote de picking**, **no tiene factura** y **no es de Mercado Libre**. Si ya está en preparación, preparado o más adelante, no se puede: la mercadería ya salió de su ubicación y hay que devolverla a mano. Un pedido pagado tampoco: primero hay que devolver el pago.
- **El PDF** ("🖨 Imprimir presupuesto", se abre en otra pestaña para ver e imprimir): A4, con el logo y los datos de la empresa (nombre, razón social, CUIT, condición de IVA, dirección, teléfono, WhatsApp, mail y web), **"PRESUPUESTO"**, su número, la fecha y **"Válido hasta"**, los datos del cliente, cada producto **con su foto**, cantidad, descripción, SKU, precio unitario y subtotal, el subtotal, el envío y el **TOTAL**, el **total en letras** ("Son pesos … con 50/100.") y al pie las condiciones (vigencia, sujeto a disponibilidad de stock, precios con IVA, "no es válido como factura"). **Sale en la moneda en que estás mirando el panel** (el interruptor $ / US$ de la barra de abajo): en pesos dice "Son pesos…"; en dólares, "Son dólares estadounidenses…". **Si algún producto tiene descuento**, el PDF muestra las columnas igual que la pantalla: Lista, Descuento (%), Unitario (ya con el descuento) y Subtotal; si ninguno tiene, queda con una sola columna de precio. El nombre que sale debajo del logo es el **Nombre de fantasía** de [Configuración › Empresa](/config/empresa) (si está vacío, la razón social). **Si el cliente es Responsable Inscripto** (y la empresa también), sale como una factura A: los precios unitarios y subtotales **sin IVA**, y abajo el subtotal neto, el envío sin IVA, **el IVA de cada alícuota** (21 %, 10,5 %…, la de cada producto) y el total.

### Reservas de stock: cuándo se aparta y cuándo se descuenta

- **Todo pedido reserva su stock al nacer**, entre por donde entre (tienda web, carga a mano, API) y **esté pago o no**: lo aparta para que no se venda dos veces. El disponible baja, pero las unidades siguen en el estante. **Lo único que no reserva es un presupuesto.** Que no esté pago no lo manda a preparar: un pedido sin pagar (por ejemplo, transferencia o Mercado Pago pendiente) tiene su stock apartado pero entra en picking recién cuando se confirma el pago (los «A cobrar» y a convenir entran sin esperarlo).
- **Mercado Libre**: sus ventas reservan al pasar a pagado (llegan pagas casi siempre).

### Reserva de un pedido sin pagar (vencimiento)

- Un pedido **Nuevo sin pagar** (pago pendiente o «A cobrar», de la tienda web o cargado a mano) guarda su stock **una cantidad de días**: los que dice **"Días de reserva sin pagar"** en [Configuración › Empresa](/config/empresa) (**7 de entrada**). Se cuentan desde que nace el pedido (o desde que un presupuesto pasa a pedido, o desde que se levanta un cancelado).
- En la ficha, en "Operación", dice **"Stock reservado hasta el DD/MM (faltan N días)"**; en rojo si vence hoy o mañana.
- **El último día vale entero**: al terminar ese día, si sigue Nuevo y sin pagar y no entró en un lote de picking, **se cancela solo** (Laucen lo revisa cada media hora) y libera el stock. En el historial queda "venció la reserva (sin pagar hasta el DD/MM)". No pasa a presupuesto: queda **Cancelado**, y se puede **levantar** si el cliente vuelve.
- Al pagarse, la reserva deja de vencer: el stock queda apartado hasta que se despacha.
- Las ventas de Mercado Libre y los pedidos ya pagos no vencen.
- Cambiar los días en Empresa vale para los pedidos nuevos; los que ya estaban siguen con su fecha.
- Laucen no le avisa al cliente por WhatsApp ni por mail que su reserva está por vencer.
- **Al llegar a Despachado** (o directamente a Entregado), la reserva se convierte en **venta**: ahí sale del stock.
- **Al cancelar o devolver**, se **libera** lo que siga reservado (vuelve a estar disponible). Lo que ya se había vendido (un pedido despachado) no vuelve solo: la mercadería que regresa entra por la recepción de la devolución.
- **De qué depósito sale**: el que tenga el pedido; si no tiene, el primer depósito activo asignado al canal (por prioridad); si el canal no tiene, el primer depósito activo de la organización (los propios primero). Las ventas de Mercado Libre por **Full** salen del depósito Full del canal.
- **De qué ubicación**: primero de las ubicaciones que tienen disponible, en el orden de recorrido del depósito. Si no alcanza, lo que falta se reserva igual en la ubicación general y queda **disponible negativo** (se vendió sin stock: aparece en el Panel, en "Vendido sin stock").
- Un **kit** reserva cada uno de sus componentes.
- Una línea **sin vincular** (artículo de Mercado Libre que no está atado a un producto de Laucen) **no reserva ni descuenta** nada.
- Un pedido marcado "no mueve stock" (las ventas históricas) nunca toca el stock.
- Después de reservar o vender, Laucen avisa el stock nuevo a Mercado Libre (en los canales que tienen prendida la sincronización de stock).
- Cada reserva, venta y liberación queda en **"Movimientos de stock"** de la ficha.

### «A cobrar» y «A convenir»: pedidos que no esperan el pago

- **«A cobrar»** es un pedido que se paga **en efectivo al retirar o al entregar**. No espera el pago: **reserva el stock apenas se crea** y **entra en picking estando Nuevo**. El pago queda «A cobrar» hasta que se confirma el cobro.
- Un pedido cargado a mano con **"A cobrar (a convenir)"** queda «A cobrar». También queda «A cobrar» cualquier pedido nuevo (que no sea de Mercado Libre) con pago pendiente y medio **efectivo**.
- **Se factura recién cuando se cobra**: mientras esté «A cobrar», el botón "Facturar" está deshabilitado y la facturación automática no lo toma. Al confirmar el cobro, si el pedido ya llegó al estado en que se factura, la facturación automática lo factura.
- **«A convenir»** (cuenta corriente): los pedidos de la tienda con "Cuenta corriente / a convenir" y los cargados a mano con **"Cuenta corriente"**. También reservan y entran en picking sin esperar el pago, pero **se facturan como siempre** (la cuenta corriente se arma con la factura). **Entran en picking sólo si el límite de crédito del cliente lo cubre** (ver [Clientes](/ventas/clientes), "Límite de crédito"); si no, quedan **frenados**: en la lista, al lado del estado dice **"frenado por cuenta corriente"** (en rojo) y en la ficha, en "Operación", **"Frenado por la cuenta corriente: …"** con el motivo.
- En la ficha, un «A cobrar» muestra el cartel ámbar **"A COBRAR $ …"** con el total en pesos.
- El filtro **Pendientes** y el contador "Pedidos" incluyen los Nuevos, los Pagados y los «A cobrar» que todavía no se entregaron (aunque estén en preparación, preparados o despachados).

### Precios de un pedido

- **Lista de precios**: la del **cliente** si tiene una propia (en su ficha); si no, la del **canal**. La moneda del pedido es la de esa lista (si el canal no tiene lista, pesos).
- En **"Nuevo pedido"**, el precio que aparece es el de esa lista y se puede cambiar. Si se deja igual, la línea guarda el precio de lista y su descuento; si se cambia, guarda el precio escrito.
- **Descuento %**: se aplica sobre el precio de la línea. Si la lista ya tenía un descuento, **se acumulan**: 10 % de la lista + 10 % extra = 19 % (no 20 %).
- Cada importe se guarda en pesos y en dólares con el dólar oficial del día del pedido.
- **Total** = suma de (precio unitario × cantidad) de todas las líneas + costo de envío que paga el comprador. Redondeado a centavos.
- Las ventas de Mercado Libre entran con el precio al que se vendieron en Mercado Libre.

### Clientes de los pedidos

Cuando entra un pedido, Laucen busca al cliente en este orden: el id del comprador en ese canal → el CUIT → el número de documento → el apodo de Mercado Libre → el mail. Si lo encuentra, **completa los datos que le falten** (nunca pisa uno ya cargado). Si no, crea un cliente nuevo. Las direcciones nuevas se suman sin repetir las que ya tiene. Un pedido a mano como "Consumidor final" queda sin cliente.

### Mercado Libre: el carrito es UN pedido

- Un **carrito** de Mercado Libre (varias órdenes compradas juntas, con un solo envío) es **un solo pedido** en Laucen, con las líneas de todas sus órdenes. Su id externo es el número del carrito; cada línea dice de qué orden vino ("Orden ML …").
- Si una orden del carrito **llega después**, sus líneas **se suman** al mismo pedido (con su reserva de stock si el pedido ya estaba pagado, y como venta si ya había salido). Si el pedido ya estaba facturado, el historial lo avisa: "(el pedido ya estaba facturado: revisar la factura)".
- Si **se cancela una orden** y las otras siguen, sus líneas **salen** del pedido y se libera su reserva (salvo que el pedido ya esté despachado o entregado). Si se cancelan **todas**, el pedido queda Cancelado.
- El pago queda Pagado cuando **todas** las órdenes que siguen en pie están pagas.

### La espera de 10 minutos de los carritos

Como las órdenes de un carrito pueden llegar con minutos de diferencia, para que nadie prepare ni facture un carrito al que todavía le falta un ítem:

- Mientras un pedido es carrito de Mercado Libre, **nadie lo puede tocar hasta que pasen 10 minutos desde su último cambio** (llegó una orden, una cambió de estado o se canceló, se sumaron o sacaron líneas). Cada cambio nuevo vuelve a arrancar los 10 minutos.
- Durante la espera **no se puede**: cambiarle el estado a mano, meterlo en picking, facturarlo (ni a mano ni automáticamente), imprimir su etiqueta ni operarlo desde la ficha. Lo que manda Mercado Libre sí entra.
- Se ve con la marca ámbar **"Carrito en espera · faltan N min"** en la lista, en la ficha (con el texto "se puede tocar desde las HH:MM") y en Envíos ("Carrito: esperando"). El botón "Facturar" se ve deshabilitado con ese texto.
- Pasada la espera, la marca desaparece sola y todo vuelve a andar (la facturación automática lo toma en su próxima vuelta).
- Un carrito que entra tarde (por la revisión de cada 30 minutos) cuenta la espera desde su orden más reciente, así que puede no esperar nada.

- **Garantía de cada línea** (uso interno, no sale en ningún comprobante): al entrar la venta queda grabada en la línea la garantía que tenía en ese momento y no cambia después aunque cambie la publicación o la ficha. Si se vendió por **Mercado Libre**, es la que tenía la publicación en Mercado Libre (por ejemplo "Garantía del vendedor · 12 meses"); si no se pudo leer en ese momento, la última que Laucen tenía guardada de esa publicación. Si se vendió por cualquier otro canal (local, web, mayorista), es la que dice la ficha del producto. Si no hay ningún dato, la línea muestra "—".

### Artículos sin vincular

Si una venta de Mercado Libre trae un artículo que no está vinculado a un producto de Laucen, Laucen lo busca por SKU (el SKU de la publicación igual al SKU de una variación) y, si lo encuentra, deja la publicación vinculada. Si no, la línea entra igual con su título, SKU y precio, **sin tocar stock**, y el pedido queda marcado: la ficha lo avisa en rojo y el [Panel](/panel) lo cuenta. Se arregla en [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

### Facturación

- **Cuándo se puede**: un pedido que no esté Nuevo ni Cancelado, sin factura autorizada, que no sea «A cobrar» y que no sea un carrito en espera.
- **Qué tipo de factura**: si la empresa no es Responsable Inscripta, **C**. Si es Responsable Inscripta: **A** si el cliente es Responsable Inscripto o Monotributista (y entonces el cliente **necesita CUIT**), **B** para el resto (consumidor final, exento…). Un cliente sin condición de IVA cargada se toma como consumidor final.
- **Documento del receptor**: el CUIT si tiene 11 dígitos; si no, el DNI (7 u 8 dígitos); si no hay ninguno, consumidor final sin identificar.
- **Líneas**: las del pedido, con el IVA de cada producto (21 % si el producto no tiene otro). El **costo de envío** que pagó el comprador va como una línea más "Envío", con IVA 21 %. En una factura C no se discrimina IVA.
- **Facturación automática**: si está prendida en [Facturación (ARCA)](/config/arca), cada pedido se factura solo al llegar al estado elegido ahí (**Pagado**, que en la lista se ve como «A preparar»; **Preparado** o **Despachado**). Al prenderla no se facturan los pedidos que ya habían pasado. Los «A cobrar» esperan al cobro.
- Un comprobante que quedó con error se reintenta solo, hasta 5 veces.
- **Subida a Mercado Libre**: la factura de una venta de Mercado Libre se sube sola a la venta si el canal tiene prendido "Subir facturas a Mercado Libre" (prenderlo es tu clic en la configuración del canal); si no, con el botón **"Subir factura a Mercado Libre"** de la ficha. Todo sale por la [cola de Mercado Libre](/config/canales/cola). Una factura ya subida no se vuelve a subir.
- Estados de "Factura en ML": **Subida a ML** (✓), **Pendiente de subir**, **Subiendo** o **Preparada, falta tu clic** (⏳), **Con error** (⚠), **Falta subirla** o **No se subió (descartada)** (○).

### Comisión, cargos de Mercado Libre y neto

- **"Comisión del canal"** (y "Comisión de Mercado Libre" en la ficha): la comisión por venta que informa Mercado Libre en cada orden, apenas entra la venta. En pesos.
- **"Cargos ML"**: lo que Mercado Libre realmente facturó por esa venta, leído de su facturación mensual: comisión por venta, envíos, cargo fijo, publicidad, bonificaciones y otros cargos. **No incluye** los impuestos (percepciones y retenciones de IVA, Ingresos Brutos, Ganancias), que no son costo: se toman a cuenta de impuestos y se muestran aparte en la ficha.
- **"Neto ML"** = Total del pedido − Cargos ML. Se muestra "—" mientras todavía no hay cargos de la facturación para esa venta.
- Los cargos están tal como los factura Mercado Libre (con IVA). Se traen una vez por noche y con el botón de [Facturación de Mercado Libre](/administracion/facturacion-ml).

### WhatsApp

- Usa el celular del cliente y, si no tiene, el teléfono. Lo pasa al formato de WhatsApp (549 + característica + número, sin 0 ni 15).
- El mensaje depende del estado (recibido, pago confirmado, preparando, listo, salió con su seguimiento, entregado, cancelado, devolución). En los pedidos de la tienda web suma el link de seguimiento del pedido.
- Laucen no manda nada solo: abre WhatsApp con el texto y lo mandás vos.

## Preguntas frecuentes

**¿Por qué no veo un pedido viejo?**
Porque la lista abre con la última semana. Elegí otras fechas o "Todas las fechas" en "Fechas", o escribí su número en "Buscar" (por número aparece siempre).

**¿Dónde están los cancelados?**
De entrada no se muestran: tildá "Incluye canceladas" o elegí "Cancelado" en "Estado".

**¿Puedo cargar a mano un pedido de Mercado Libre?**
No: entran solos. El canal de Mercado Libre ni aparece en "Nuevo pedido".

**¿Por qué no puedo facturar un pedido «A cobrar»?**
Porque se factura cuando se cobra. Confirmá el pago (o usá "Cliente presente: retira y paga", que también factura) y después facturá.

**Un pedido de Mercado Libre dice "Carrito en espera". ¿Qué hago?**
Esperá los minutos que indica: puede que todavía falte llegar otra orden del mismo carrito. Después se puede preparar y facturar normalmente.

**¿Por qué un pedido de Mercado Libre no tiene botones de estado?**
Porque lo mueve Mercado Libre (pago, envío, entrega). La preparación la marca el Picking.

**Cancelé un pedido despachado y el stock no volvió.**
Al despachar el stock ya se descontó como vendido. La mercadería que vuelve entra por la recepción de la devolución en el depósito.

**¿Qué es el disponible negativo?**
Que se reservó más de lo que había: el pedido entró sin stock suficiente.

**¿Por qué el "Neto ML" dice "—"?**
Porque Mercado Libre todavía no facturó los cargos de esa venta (se leen de su facturación mensual, una vez por noche).

**El cliente tiene una lista de precios especial, ¿se aplica sola?**
Sí: al elegirlo en "Nuevo pedido", los precios pasan a los de su lista.

**¿Qué factura sale para un monotributista?**
Si la empresa es Responsable Inscripta, una factura A (el cliente tiene que tener CUIT cargado).

## Relacionado

- [Clientes](/ventas/clientes)
- [Envíos](/ventas/envios)
- [Reclamos y devoluciones](/ventas/reclamos)
- [Picking](/deposito/picking)
- [Recepción](/deposito/recepcion)
- [Facturación](/administracion/facturacion)
- [Facturación (ARCA)](/config/arca)
- [Facturación de Mercado Libre](/administracion/facturacion-ml)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Canales](/config/canales)
- [Cola de Mercado Libre](/config/canales/cola)
- [Listas de precios](/catalogo/precios)
