---
titulo: Cómo se usa el sistema
menu: (todas las pantallas)
ruta: /buscar
rutas: /buscar, /listas/[pantalla]/configurar
permiso: todos
resumen: El marco de Laucen (menú, barra de estado, modo celular), el camino, el buscador global y cómo funcionan en todas las pantallas las listas, las fichas, las altas, los borrados, las fechas y los números.
---

## Para qué sirve

Este capítulo explica lo que es **igual en todas las pantallas** de Laucen: dónde está el menú, qué muestra la barra de abajo, cómo se busca, cómo se ordena y se pagina una lista, cómo se baja a Excel, cómo se edita una ficha, cómo se da de alta algo y cómo se borra. Si un empleado pregunta "¿cómo edito esto?" o "¿cómo bajo esta lista a Excel?", la respuesta casi siempre está acá, porque todas las pantallas siguen las mismas reglas.

## Cómo se llega

- El marco (menú arriba, barra de estado abajo) aparece solo en todas las pantallas una vez que entraste con tu usuario. No aparece en las pantallas de entrada ([Entrar](/login), [Crear cuenta](/registro), etc.), ni en la tienda web.
- El buscador global está en la barra de arriba (en PC) o adentro de **"Menú"** (en el celular), y su pantalla es [Buscar](/buscar).
- La configuración de columnas de una lista se abre desde la misma lista, con **"⚙ Configurar…"** (Excel) o **"⚙ Configurar vistas…"** (vistas). Su dirección es `/listas/<pantalla>/configurar`.

## Qué hay en la pantalla

### En la PC: la barra de menú (arriba)

Una franja blanca fija arriba, al estilo de Excel:

- **"Laucen"** a la izquierda: vuelve a [Para hacer](/panel).
- Las **secciones del menú**: Dashboard (Para hacer y Relevamiento completo), Ventas, Catálogo (con las Cucardas), Stock, Compras, Administración, Informes, Sourcing, Tienda web, Configuración (con Depósitos y ubicaciones). Cada sección despliega sus opciones hacia abajo al hacer clic o al pasar el mouse. La sección donde estás queda subrayada en azul. Escape o un clic afuera cierra el desplegable.
- Una opción que todavía no existe se ve gris con la palabra **"próximamente"** (por ejemplo, **Sourcing › Búsqueda en China**). No se esconde: se muestra deshabilitada.
- Cada persona ve **sólo las opciones que su rol tiene permitidas** (lo decide [Usuarios y roles](/config/usuarios)). Si una sección queda sin ninguna opción permitida, no aparece.
- A la derecha, el cuadro **"Buscar producto, MLA, cliente, proveedor…"** (el buscador global: escribís y apretás Enter).
- El botón **"Salir"**, que cierra la sesión y vuelve a [Entrar](/login).

### En la PC: la barra de estado (abajo)

Una franja azul fija abajo de todo, siempre visible:

- **El interruptor de moneda** ("$" ↔ "US$"): un interruptor de verdad. Tocándolo cambiás si **vos** ves los importes en pesos o en dólares en todas las pantallas. Es una preferencia de cada usuario (y de cada organización): no cambia nada para los demás. De entrada se ve en pesos.
- **"Dólar oficial: $ …"**: el tipo de cambio oficial venta que rige hoy. Si pasás el mouse dice de qué fecha es y de dónde salió. Si no hay ninguno cargado dice **"sin cargar"** y es un enlace a [Tipo de cambio](/config/tipo-cambio).
- **Contadores** (cada uno es un enlace):
  - **"Pedidos sin preparar"** → [Pedidos](/ventas/pedidos?estado=pendientes) con el filtro Pendientes. Cuenta los pedidos nuevos y pagados, más los «A cobrar» que todavía no se entregaron (ver [Pedidos](/ventas/pedidos)).
  - **"Preguntas sin responder"** → [Preguntas y mensajes](/ventas/preguntas): las preguntas de Mercado Libre pendientes.
  - **"Mensajes sin leer"** → la pestaña Mensajes de [Preguntas y mensajes](/ventas/preguntas?ver=mensajes): la suma de mensajes de posventa sin leer.
  - Cuando un contador es mayor que cero, el número se resalta en blanco.
- A la derecha: **el nombre de la organización y el tuyo** (o tu mail), y la versión del sistema.

### En el celular: otro modo, no la misma pantalla achicada

- **Arriba**, una franja **fija** (no se va al bajar) con **"Laucen"** (vuelve a Para hacer), el **buscador global** y el interruptor de moneda.
- **Abajo**, una barra fija con **cuatro accesos directos** y el botón **"Menú"**:
  - Los cuatro botones son **los que elegís vos** en [Mis accesos del celular](/config/accesos) (sin elegir, quedan 🧾 Pedidos, 🧺 Picking, 📥 Recepción y 🔎 Stock; sólo los que tu rol puede ver).
  - ☰ **"Menú"**: abre el árbol completo del menú en pantalla entera, con el botón **"📱 Modo depósito"** ([Modo depósito](/deposito/celular)), el enlace para elegir los botones de la barra y el buscador global. Se cierra con **"Cerrar"** o al elegir una opción.
- En el celular no están la barra de estado (dólar, contadores) ni el botón "Salir".

### Lo último que viste (margen izquierdo)

En la PC, si la pantalla tiene lugar a la izquierda del contenido, aparece una lista **"Lo último que viste"** por fuera del panel: cada registro que abrís en **cualquier pantalla de altas, bajas y modificaciones** (producto, cliente, pedido, factura, despacho, reclamo, proveedor, cuenta de fondos, **cucarda, publicación, canal, familia**…; también cuando apretás el lápiz de una fila) queda anotado con su tipo y su nombre, **la última arriba**. Un mismo registro aparece **una sola vez**: si lo volvés a abrir (aunque sea de otra manera, tocando su nombre o con el lápiz), no se repite, sube arriba de todo. Tocándola volvés a esa ficha. Guarda las **últimas 15** (las más viejas se van pisando) y se anota sola; la **✕** de arriba borra la lista. Es **de cada usuario**: se guarda en su cuenta, así que la ve igual desde cualquier equipo o celular y no se mezcla con la de otra persona, aunque usen la misma computadora. No se anotan las pantallas de la tienda pública, las de administración interna (bitácora, para probar) ni las listas sueltas: solo los registros que abrís dentro de una pantalla del panel. Si la ventana es angosta y no hay lugar, no se muestra (no tapa nada).

### Botones que demoran

Un botón que lanza algo que tarda (por ejemplo **"↻ Actualizar"** en [Mercado Pago](/administracion/mercadopago)) no te deja esperando: el botón pasa a **"Trabajando…"** y podés seguir usando esa pantalla o irte a otra. Cuando termina, aparece un **cartel abajo a la derecha**, verde si salió bien (por ejemplo "Se leyeron 5 de 5 cuentas correctamente") o rojo con el motivo si no, y la pantalla que estés viendo se actualiza sola. Mientras corre, el mismo botón no se puede volver a apretar (y si otra persona lo lanzó, también dice "Trabajando…"). Funcionan así: "↻ Actualizar" de Mercado Pago, "Traer reclamos de ML" y "Actualizar desde ML" de un reclamo, "Traer preguntas ahora" y "Actualizar" de una conversación, "Traer facturación de ML", "Subir a ML las facturas que faltan", "Traer publicaciones de ML", "Traer pedidos y preguntas ahora" (en un canal), "Leer motivos de revisión", "Leer ahora de Mercado Libre" y "Traer historial de campañas" (Promociones), y los del Radar ("Leer tendencias ahora", "Releer el árbol").

### El recorrido (arriba de todo, con ↩)

Cuando vas pasando de una pantalla a otra por los enlaces (por ejemplo de **Cambios en publicaciones** a un producto, y de ahí a una publicación), arriba de todo, encima del camino, se va armando el **recorrido**: "↩ Cambios en publicaciones › SKU01485 Polea… › …". Cada parte se toca para **volver a esa pantalla tal como la dejaste**, con sus filtros, su búsqueda y su página.

- Si volvés a una pantalla que ya está en el recorrido, se corta ahí.
- Cambiar filtros o página en la misma pantalla no suma un paso.
- Entrar por el **menú de arriba** (o la barra del celular, o "Lo último que viste") arranca un recorrido nuevo.
- Es **de cada pestaña**: si abrís un enlace en una pestaña nueva (Ctrl + clic), esa pestaña arranca sin recorrido.
- Con una sola pantalla no se muestra (no hay adónde volver).

### El camino (arriba a la izquierda, sobre el título)

Encima del título de cada pantalla hay un "camino", por ejemplo **"Ventas ▾ › Pedidos › Pedido 1234"**:

- La **sección** ("Ventas ▾") se toca y despliega sus opciones, para saltar a otra pantalla de la misma sección.
- Cada parte siguiente se toca para volver a ese nivel (por ejemplo, "Pedidos" vuelve a la lista).
- La última parte (donde estás) no es un enlace.
- No hay links "← Volver" sueltos: para volver se usa el camino.

### El buscador global ([Buscar](/buscar))

Busca a la vez en **todos los datos del sistema**, como en Virtual Seller: lo que escribas, si está en algún lado (un domicilio, un teléfono, una nota, una observación, un mensaje, una pregunta), aparece. Se llega escribiendo en el cuadro de la barra de arriba y apretando Enter, o entrando directo a la pantalla. Ahí hay:

- El cuadro **"Cualquier dato: SKU, título, MLA, pedido, cliente, CUIT, teléfono, domicilio, mensaje…"**, la caja **"Mostrar inactivos"** y el botón **"Buscar"**.
- **Cómo busca lo que escribís** (la misma regla que todos los buscadores del panel):
  - Busca lo que escribiste **tal cual, entero** (con sus espacios), en cualquier parte de cada dato. Números y letras son lo mismo: "SKU02252" busca "SKU02252" y "Mini Elm" busca "Mini Elm" todo junto.
  - Con **?** pedís varias cosas **en un mismo dato**: "note?12gb" trae lo que en un mismo dato (por ejemplo el título) dice "note" y también "12gb".
  - Con **\*** pedís varias cosas **en el mismo registro**, aunque estén en datos distintos: "note\*F412" trae lo que dice "note" en un dato y "F412" en otro (por ejemplo, el título y el modelo del mismo producto; o "juan\*cordoba", el cliente que se llama Juan y vive en Córdoba). Se combinan: "note?12gb\*asus".
  - En los **CUIT, teléfonos y documentos** (que se guardan sólo con números) compara también lo escrito sin guiones, puntos ni espacios: "20-10225274-9" encuentra el CUIT 20102252749, y "11 4613-0698" el teléfono.
  - Lo mismo lo explica el globito **?** al lado del buscador de arriba (pasando el mouse) y la línea de ayuda debajo del cuadro en [Buscar](/buscar).
- Al lado del buscador de la barra de arriba hay una **cajita con el ícono 🗃** ("Incluir inactivos" al pasar el mouse): tildada, la búsqueda trae **siempre** también los productos inactivos. **Sin tildar**, los inactivos aparecen sólo cuando **lo único** que coincide es inactivo (arriba avisa "No hay nada activo con …: se muestran los inactivos que coinciden"); si hay cualquier cosa activa, los inactivos no salen y abajo del cuadro avisa "Hay N productos inactivos que coinciden". **Queda como la dejaste** (es de cada usuario). Lo mismo la caja "Mostrar inactivos" de la pantalla Buscar (son la misma elección).
- Los resultados, en secciones con su cantidad entre paréntesis; cada una aparece sólo si encontró algo y si tu rol puede ver esa pantalla. Cada fila lleva a su ficha o a su pantalla:
  - **Productos** (permiso Productos): número interno, SKU, título, descripción, marca, modelo, línea, garantía, categoría de Mercado Libre, código de barras, la familia, los atributos; de cada variación su SKU, título, código de barras y atributos; y los SKU viejos que lo nombran (equivalencias). Primero el de SKU exacto. Muestra la foto, y en "Variación encontrada" la variación que coincidió.
  - **Publicaciones** (permiso Publicaciones): código (MLA…), título, categoría, variación del canal, el SKU y título de la variación y del producto, y lo que trae Mercado Libre de ella (título, SKU, atributos, categoría, link). Lleva al producto.
  - **En Mercado Libre, sin vincular**: las publicaciones de Mercado Libre que todavía no están atadas a un producto, por los mismos datos. Lleva a [Vincular con Mercado Libre](/catalogo/publicaciones/ml).
  - **Pedidos** (permiso Pedidos): Nº, número externo (el de Mercado Libre), notas, código de seguimiento, medio de pago, la dirección de envío, el título y SKU de cada línea, **todos los datos del cliente** (nombre, razón social, apodo, mail, CUIT, documento, teléfonos y sus aclaraciones, notas), los pagos (número y detalle) y el envío (tracking, transportista, quién recibe, dirección).
  - **Clientes** (permiso Clientes): N.º, nombre, nombre de pila, apellido, razón social, apodo de Mercado Libre, mail, CUIT, documento, teléfonos y sus aclaraciones, notas; **todas sus direcciones** (etiqueta, calle y número, piso/depto, localidad, provincia, código postal, país, quién recibe, su teléfono, referencia); su número de comprador en cada canal y el mail de su cuenta de la tienda web. Muestra el CUIT con guiones, los teléfonos y la localidad.
  - **Proveedores** (permiso Proveedores): N.º, nombre, razón social, CUIT, país, mail, teléfonos y sus aclaraciones, contacto, domicilio (calle, localidad, provincia, código postal), condiciones de pago y notas. Lleva a su fila en [Proveedores](/compras/proveedores).
  - **Preguntas de Mercado Libre** (permiso Preguntas y mensajes): la pregunta, la respuesta, la respuesta que había propuesto la IA, el número de comprador y la publicación (código, título, SKU). Lleva a [Preguntas y mensajes](/ventas/preguntas).
  - **Mensajes de Mercado Libre** (mismo permiso): el texto de cada mensaje de posventa, el pack, el pedido y los datos del cliente. Muestra el último mensaje que coincide y lleva a esa conversación.
  - **WhatsApp** (permiso del módulo de mensajes): nombre y teléfono del chat, sus notas, el texto de cada mensaje, los casos (asunto, motivo, resolución) y los datos del cliente. Lleva a ese chat en [WhatsApp](/ventas/mensajes).
  - **Reclamos y devoluciones** (permiso Reclamos): número, número en Mercado Libre, orden, comprador, motivo, resolución, número y tracking de la devolución, notas, el texto de cada mensaje del reclamo, el pedido y el cliente.
  - **Envíos** (permiso Envíos): número, número externo, tracking, transportista, quién recibe, método, logística, la dirección de entrega dato por dato y el pedido.
  - **Facturas emitidas** (permiso Facturación): número (como "00002-00000123" o sólo el número), documento del receptor, su nombre y domicilio, CAE, observaciones, la descripción de cada línea, el pedido y el cliente. Lleva a la factura.
  - **Facturas de compra** (permiso Facturas de compra): número, CAE, notas, la descripción de cada línea y el proveedor (nombre, razón social, contacto, mail, CUIT).
  - **Despachos de importación** (permiso Despachos): número de despacho, notas, la descripción y el NCM de cada línea y el proveedor.
  - **Recepciones** (permiso Recepción): número, documento, nota, venta externa, el proveedor y el pedido.
  - **Movimientos de cuenta corriente** y **Recibos y órdenes de pago** (permiso Cuentas corrientes): la descripción del movimiento; el número, las notas y las retenciones del recibo; y en los dos, los datos del cliente o del proveedor. Llevan a su cuenta corriente.
  - **Tesorería** (permiso Tesorería): el concepto del movimiento de fondos y la descripción y referencia de la línea del extracto con que se concilió. Lleva a esa cuenta.
- No busca en importes ni fechas, ni en datos internos del sistema (estados, códigos técnicos).
- Cada sección muestra **hasta 20 resultados**; si hay más dice "Se muestran los primeros 20; afiná la búsqueda para ver otros."
- Acá la búsqueda es "en cualquier parte del texto" (no hay caja "Comienza por").
- Para usar el buscador global hace falta el permiso «Panel»; sin él, la pantalla devuelve al Panel.

## Cómo se hace

### Buscar en una lista (el buscador vivo)

Todas las listas tienen su buscador arriba:

1. Escribí en el cuadro. **Busca solo mientras tipeás**, desde la segunda letra (con una sola letra todavía no busca). No hay botón "Buscar".
2. Para borrar lo escrito, tocá la **X** que aparece adentro del cuadro.
3. La caja **"Comienza por"** viene tildada: busca lo que empieza con lo que escribiste. Destildala para buscar en cualquier parte del texto. Lo que escribís se busca **tal cual** (números y letras por igual, con espacios) en **todos los datos** de lo que lista esa pantalla; con **?** pedís varias cosas en un mismo dato y con **\*** varias cosas en el mismo registro aunque estén en datos distintos (por ejemplo note?12gb\*asus), igual que en el buscador de arriba (el globito **?** al lado del cuadro lo explica). Con "Comienza por", la primera condición de cada parte va al principio del dato. (Algunas listas, como Pedidos o Reclamos, buscan siempre en cualquier parte y no muestran esta caja.)
4. En las listas de productos aparece además **"Mostrar inactivos"**: un producto inactivo no sale en ninguna lista ni buscador salvo que la tildes.
5. Los desplegables de filtro que están al lado del buscador (estado, canal, tipo…) también filtran al momento de elegir.
6. **Toda búsqueda o filtro nuevo vuelve a la página 1.**

### Ordenar una lista

1. Tocá el **título de la columna**. La primera vez ordena por esa columna (los textos de la A a la Z; los números y las fechas, de mayor a menor).
2. Tocá otra vez el mismo título para invertir el orden. La columna elegida muestra ▲ (ascendente) o ▼ (descendente).
3. Sin tocar nada, la lista viene en su orden de siempre (cada pantalla dice cuál).

### Pasar de página

Las listas muestran **50 filas por página**. Abajo a la derecha está el paginador: **"1–50 de 4.509"** con los botones **"← Anterior"** y **"Siguiente →"**. Nunca hay topes del tipo "se muestran los primeros 300": todo se puede recorrer.

### Bajar una lista a Excel

Arriba a la derecha de cada lista, al lado de "Nuevo …":

1. Elegí en el desplegable **qué columnas** querés: **"Como en pantalla"** (las mismas que estás viendo) o una configuración guardada.
2. Apretá **"⬇ Descargar Excel"**.
3. Baja **lo mismo que ves**: con los mismos filtros, búsqueda, pestaña y orden. Pero baja **todas las filas**, no sólo la página que estás viendo, hasta un tope de 50.000. Si hay más, el Excel lo avisa al pie ("Sólo las primeras 50.000 filas: filtrá para bajar el resto").
4. Los importes y números van como números (se pueden sumar en Excel) y las fechas como fechas, en hora argentina.
5. La configuración elegida en el desplegable queda recordada en tu navegador para la próxima vez.

### Armar una configuración de Excel

1. En la lista, apretá **"⚙ Configurar…"** (al lado de "Descargar Excel").
2. Se abre la pantalla **"Excel de <lista>"**. La primera fila, **"Como en pantalla"** (marcada **"De siempre"**), no se puede tocar.
3. Apretá **"+ Nueva configuración"**.
4. Poné un **"Nombre"** (por ejemplo, "Para el contador"; hasta 60 letras).
5. En **"Otras columnas"** tildá las que querés: pasan a **"Columnas elegidas, en este orden"**. Con las flechas **↑** y **↓** cambiás el orden. Destildando una, sale.
6. Apretá **"Guardar"**. Vuelve a la lista con el aviso «Guardada "…": queda elegida para el Excel».
7. Para cambiarla después: el **lápiz** de su fila (cambiar nombre y columnas). Para borrarla: el **tacho**, que pregunta "¿Borrar?" con **"Sí"** / **"No"**.

Las configuraciones son **de la organización**: las ve todo el que usa esa lista.

### Elegir y armar una vista (qué columnas se ven en pantalla)

Algunas listas tienen **vistas configurables**: [Productos](/catalogo/productos), [Pedidos](/ventas/pedidos), [Clientes](/ventas/clientes), [Facturas de compra](/compras/facturas) y [Facturación](/administracion/facturacion).

1. Arriba de la tabla, a la derecha, está el selector **"Vista"**. **"Estándar"** es la de siempre.
2. Elegí otra vista y la tabla se redibuja con esas columnas, en ese orden. La última que elegiste queda recordada en tu navegador para esa pantalla.
3. Para armar una: **"⚙ Configurar vistas…"** → **"+ Nueva vista"** → nombre, columnas tildadas y ordenadas con ↑ ↓ → **"Guardar"**. Queda como la vista que se ve.
4. En estas listas, "Como en pantalla" del Excel baja las columnas de la vista que estás viendo.
5. En una vista se puede ordenar por cualquiera de sus columnas tocando el título.

### Ver y editar una ficha

Toda ficha (un cliente, un reclamo cargado a mano, un producto…) **abre en modo vista**:

1. Los datos se ven en los mismos recuadros que cuando se editan, pero con fondo gris claro y sin poder escribir. Un dato vacío muestra "—". Los números van a la derecha.
2. Para editar, tocá el **lápiz ✏️ arriba a la derecha**, a la altura del título.
3. Los recuadros pasan a ser campos editables, sin que nada se mueva de lugar. En el lugar del lápiz aparecen **"Grabar"** y **"Cancelar"**.
4. **"Grabar"** guarda: si sale bien, vuelve al modo vista con un aviso verde. Si algo falla, queda en edición con el error en rojo arriba, para corregir.
5. **"Cancelar"** vuelve a la vista **sin guardar** nada.
6. Nunca hay un botón "Guardar" al pie del formulario: **Nuevo, lápiz y Grabar están siempre arriba a la derecha**. Si la ficha tiene varias cajas que se graban por separado, cada caja tiene su lápiz en su propio título.

### Editar una fila de una tabla

En las tablas (por ejemplo, las direcciones de un cliente):

1. Tocá el **lápiz** de la fila.
2. Esa fila se convierte ahí mismo en sus campos editables (no se abre otra ventana).
3. Guardá con el botón de la fila (**"Guardar"**) o volvé con **"Cancelar"**.

### Dar de alta algo nuevo

1. Nada se crea sin apretar antes un botón **"+ Nuevo …"** ("Nuevo cliente", "Nuevo pedido", "Nuevo reclamo"…). Está **arriba a la derecha**, a la altura del título (o al lado del título de una sección).
2. Al apretarlo se abre el formulario de alta debajo del encabezado, con su botón **"Cancelar"** para cerrarlo.
3. Completá y apretá el botón de crear.
4. Si el alta falla, la pantalla vuelve con el error y **el formulario sigue abierto**, con lo que habías puesto, para corregir.

### Borrar algo (el tacho)

1. Tocá el **tacho 🗑**.
2. Ahí mismo, en el lugar del tacho, aparece la pregunta (por ejemplo "¿Borrar?") con **"Sí"** y **"No"**. No sale ninguna ventana del navegador.
3. **"Sí"** borra; **"No"** deja todo como estaba.
4. Si algo no se puede borrar (por ejemplo, un cliente con pedidos), en lugar del tacho aparece el motivo.

Algunas acciones delicadas que no son borrar (por ejemplo "Cancelar pedido" o devolver plata en un reclamo) preguntan igual, en el lugar, con **"Sí"** / **"No"**.

### Filtrar por fechas (desde / hasta)

Donde hay un filtro de fechas, se ve en un renglón:

1. Un desplegable de **atajos**: **Hoy**, **Ayer**, **Últimos 7 días**, **Este mes**, **Último mes**, **Último trimestre**, **Último año** (y, si la pantalla lo permite, una opción para ver sin fechas, por ejemplo **"Todas las fechas"**).
2. Al elegir un atajo se llenan las dos fechas y **la lista se filtra al momento**.
3. También podés tocar las fechas a mano (la de "desde" y la de "hasta"): filtra medio segundo después de que dejás de tocar, y el desplegable pasa a decir **"Personalizado"**.

### Escribir números

- Todo número se escribe y se ve **alineado a la derecha**.
- En precios (pesos o dólares), al salir del campo o al apretar Enter, el número se reescribe con **punto de miles** (por ejemplo, "70000" pasa a "70.000").
- Los porcentajes se muestran con **un decimal** ("10,0").
- Se acepta la coma o el punto como decimal: "7,1" y "7.1" valen lo mismo. Un punto que separa miles ("70.000") se toma como miles.
- **Enter en un campo de número no envía el formulario**: sólo acomoda el número.

## Criterios y reglas

- **Permisos**: cada opción del menú es una "función" con su permiso en el rol. Si tu rol no la tiene, no ves la opción y, si entrás igual por la dirección, el sistema te devuelve al Panel. Mientras el sistema está en desarrollo, una función que el rol no tiene configurada se considera permitida; un "no" explícito sí la cierra.
- **Moneda**: cada importe se guarda en pesos y en dólares a la vez (al cargarlo en una moneda, la otra se calcula con el dólar oficial venta del día y queda fija). El interruptor de la barra de estado sólo elige **cuál de las dos ves**; no recalcula nada.
- **Qué cambia con el interruptor de moneda** (5/10): **cada importe en pesos se guarda junto con el dólar de su día** (el oficial venta de la fecha del documento), así que en dólares se ve **a lo que valía el dólar ese día**, no al de hoy. Lo que ya guardaba los dos importes (pedidos, facturas de compra, recibos, cuentas corrientes, listas de precios, costos) sigue igual. Lo nuevo: facturación (las facturas y notas de crédito, con sus líneas), asientos, envíos, cargos y facturas de Mercado Libre, pagos, reclamos, y la comisión y el costo de envío de cada pedido llevan su "dólar del día", que se completó también para lo ya cargado. Por eso se ven en dólares exactos de su día: el Dashboard (ventas), Pedidos y su ficha, Clientes y Proveedores (totales), Facturas de compra, **Facturación (lista y ficha)**, Reclamos, Envíos, Rentabilidad (cada venta y su costo al dólar de su día), Cuentas corrientes, Productos (costos y precios por lista), **Libros de IVA** (cada comprobante al dólar de su día; los archivos para ARCA siguen en pesos), **Contabilidad** (libro diario, mayor, sumas y saldos y resultados: cada línea al dólar de su asiento), **Despachos** (los pesos al dólar de su cotización) y **Facturación de Mercado Libre**.
  - **Lo único que se convierte al dólar de hoy** son los precios actuales de las publicaciones de Mercado Libre (no son de un día: son el precio de ahora).
  - **Se quedan en la moneda propia**, aunque cambies el interruptor: **Caja y bancos** (cada cuenta está en su moneda: pesos o dólares), el **"A cobrar"** de los pedidos y del picking (es la plata que se cobra en pesos), lo que **se configura** en pesos (métodos de envío, Precios de Mercado Libre y sus reglas, tipo de cambio), la tienda pública, lo que se le contesta al cliente por WhatsApp y las herramientas internas.
  - **El Excel** baja siempre en pesos, y al lado de cada importe que tiene su dólar del día agrega una columna **"… (US$ al dólar del día)"**.
- **Dólar oficial**: es el oficial venta del día; si hoy no hay, rige el último cargado. Se levanta solo una vez por día y se puede cargar a mano en [Tipo de cambio](/config/tipo-cambio).
- **Contadores de la barra de estado**: se recalculan cada vez que cambiás de pantalla.
- **Buscadores**: con "Comienza por" tildada, coincide sólo el principio del texto; destildada, cualquier parte. No distingue mayúsculas de minúsculas.
- **Orden de las listas**: el orden por columna es seguro (sólo se puede ordenar por las columnas que la lista ofrece). Si dos filas empatan, desempata el orden de siempre de esa lista.
- **Paginado**: 50 filas por página, siempre.
- **Excel**: hasta 50.000 filas por descarga; mismos filtros que la pantalla; las columnas, según la configuración elegida o, si es "Como en pantalla", las de la pantalla (o de la vista elegida).
- **Configuraciones y vistas**: se guardan por organización y por lista. La que cada uno eligió se recuerda en su navegador (un año), así que en otra computadora puede verse otra.
- **Fechas**: los días se cuentan en hora argentina. "Último mes", "Último trimestre" y "Último año" son el período anterior **entero** (por ejemplo, el mes pasado completo), no los últimos 30, 90 o 365 días.
- **Errores**: los errores se muestran en castellano, en un recuadro rojo arriba de la pantalla; los avisos de que algo salió bien, en un recuadro verde.
- **Fotos de producto**: al lado de un producto en una lista aparece su foto principal si tiene; tocándola se abren todas (con las flechas del teclado se pasa de una a otra, Escape cierra).
- **Pestañas**: cada pestaña muestra entre paréntesis cuántas cosas tiene, también "(0)". Si no entran a lo ancho, se desplazan de costado.
- **Ubicaciones y familias**: donde hay que elegir una ubicación del depósito o una familia (categoría), se elige con un buscador (se escribe parte del código, nombre o camino, y se elige con las flechas y Enter), nunca con un desplegable, porque son cientos o miles.

## Preguntas frecuentes

**¿Cómo cambio para ver todo en dólares?**
Con el interruptor "$ / US$" de la barra de abajo (o de la franja de arriba en el celular). Sólo cambia lo que ves vos.

**No encuentro una opción del menú que usa un compañero.**
Tu rol no la tiene habilitada. Lo habilita quien administra [Usuarios y roles](/config/usuarios).

**¿Por qué el Excel trae más filas que la pantalla?**
Porque la pantalla muestra de a 50 y el Excel baja todas las que cumplen los filtros (hasta 50.000).

**¿Cómo hago para que el Excel traiga sólo algunas columnas?**
"⚙ Configurar…" al lado de "Descargar Excel", armá una configuración con las columnas que querés y elegila en el desplegable.

**Apreté Enter en un precio y no se grabó.**
Es a propósito: Enter en un número sólo lo acomoda. Para grabar, el botón "Grabar" (o el de crear).

**¿Cómo vuelvo a la lista desde una ficha?**
Con el camino de arriba a la izquierda (por ejemplo, tocando "Pedidos").

**¿Dónde está "Salir" en el celular?**
En el modo celular no hay botón "Salir"; se cierra la sesión desde una PC (o con una pantalla ancha).

**Busqué "123" y no aparece el producto.**
Fijate si está tildada "Comienza por" (busca sólo al principio) o si el producto está inactivo (tildá "Mostrar inactivos").

## Relacionado

- [Panel](/panel)
- [Buscar](/buscar)
- [Tipo de cambio](/config/tipo-cambio)
- [Usuarios y roles](/config/usuarios)
- [Pedidos](/ventas/pedidos)
- [Preguntas y mensajes](/ventas/preguntas)
