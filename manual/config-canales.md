---
titulo: Canales y Cola de Mercado Libre
menu: Configuración › Canales
ruta: /config/canales
rutas: /config/canales, /config/canales/cola
permiso: canales_ver
resumen: Los canales de venta (Mercado Libre, tienda web, local…), con su lista de precios y sus depósitos, la cuenta de Mercado Libre y sus interruptores, la llave API, y la Cola por la que sale todo lo que se manda a Mercado Libre.
---

## Para qué sirve

Un **canal** es un lugar por donde se vende: una cuenta de Mercado Libre, la tienda web, el local, la venta mayorista, el histórico de Virtual Seller… Cada pedido pertenece a un canal. Cada canal define:

- **Con qué lista de precios vende** (de ahí sale el precio de sus productos).
- **Desde qué depósitos vende**: el stock disponible del canal es la suma de esos depósitos.
- **Su umbral de pausa**: con cuánto stock disponible o menos se pausan sus publicaciones.
- Si es de Mercado Libre: **qué cuenta de ML tiene conectada** y sus **interruptores** (si Laucen manda el stock y pausa, si sube las facturas).
- Su **llave API**, para que otro sistema cargue pedidos o lea el catálogo.
- Su **cuenta de ventas** en la contabilidad ("Ventas — <canal>") y, si es de Mercado Libre, la **cuenta de Mercado Pago** de su cuenta de ML: las dos se crean solas (ver Criterios).

La **Cola de Mercado Libre** ([/config/canales/cola](/config/canales/cola)) es por donde sale TODO lo que Laucen le manda a Mercado Libre: cambios de stock, pausas y reactivaciones, precios, facturas, acciones sobre reclamos. Ahí se ve qué está esperando, qué se mandó, qué dio error, los lotes que esperan tu clic y el resumen de la barrida nocturna.

## Cómo se llega

- Menú **Configuración › Canales** y **Configuración › Cola de Mercado Libre**.
- Desde [Tienda web](/config/tienda), los enlaces "Cambiarlo en Canales" / "Cambiarla en Configuración → Canales" abren el canal de la tienda.
- Desde la ficha de un canal de ML, los números de la cola ("Cola: N pendientes", "N con error", "N preparados esperando tu clic", "Última barrida…") llevan a la Cola ya filtrada.
- Desde [Facturación](/administracion/facturacion), "Subir a ML las facturas que faltan" prepara un lote y te lleva a la Cola.
- Las dos pantallas piden el permiso «Canales».

## Qué hay en la pantalla

### Canales: arriba a la derecha

- **"Descargar Excel"** (con sus configuraciones y "Configurar…"): baja la lista de canales con la búsqueda puesta. Además de las columnas de pantalla, puede traer la cantidad de **Publicaciones** y de **Pedidos** de cada canal. La llave API nunca sale: sólo "sí/no".
- **"Nuevo canal"**: abre el formulario de alta debajo del título.

### Aviso de datos de ejemplo

La primera vez que una organización sin ningún canal abre la pantalla, el sistema crea datos de ejemplo y muestra un cartel amarillo: "Son datos de ejemplo (un canal por tipo, con sus listas y un depósito propio): borralos o cambialos. No se vuelven a crear." (ver Criterios).

### Buscador y lista

- **"Buscar canal"**: busca mientras tipeás, con la caja "Comienza por", en todos los datos del canal: N.º, nombre, tipo, estado y lista de precios.
- Columnas (se ordenan tocando el título): **Canal** (el nombre; tocarlo abre sus detalles abajo), **Tipo**, **Lista de precios** (enlace a esa lista; en rojo "sin lista" si no tiene), **Vende desde** (los depósitos, en orden de prioridad; en rojo "ningún depósito"), **Estado** (Activo / Pausado / Archivado), **Mercado Libre** (sólo para canales de ML: "Conectada" en verde o "Desconectada" en rojo, **seguido del apodo (nick) de la cuenta de ML conectada**; para el resto, "—"), **Factura con** (aparece apenas hay una razón social cargada: con cuál se factura lo que vende el canal; en rojo "sin razón social" si falta elegirla), **Umbral de pausa** ("hereda" si está vacío), **Stock a ML**, **Precios a ML** y **Facturas a ML** (sólo en las cuentas de Mercado Libre: los interruptores "Laucen manda el stock a ML y pausa al llegar al umbral", "Laucen manda los precios a ML solo" —el mismo que "Sincronizar precios" de Precios en ML; apagado, ningún precio sale salvo lo que mandes vos con tu clic; al prenderlo, la primera pasada corre de fondo y avisa con el cartel de abajo a la derecha— y "Subir facturas a Mercado Libre", ahí mismo; al tocarlos preguntan "Sí" / "No" antes de cambiar; para el resto de los canales, "—"), **Llave API** ("Tiene" o "sin llave").
- Al final de cada fila, el **lápiz** (editar la fila ahí mismo) y el **tacho** (borrar, pregunta "¿Borrar el canal?" Sí / No).
- Cada fila lleva de fondo el **color** de su canal (ver "Color del canal" en Criterios).
- Abajo, el paginador de 50 en 50 y dos ayudas: qué es el umbral de pausa y qué es la llave API.

### Detalle de un canal (al tocar su nombre)

Debajo de la lista aparecen las cajas del canal elegido (su fila queda resaltada):

1. **Depósitos de "…"**: la tabla **Depósito / Prioridad**, con el botón **"Agregar depósito"** (si quedan depósitos activos que el canal no usa). Cada fila tiene el lápiz "Cambiar la prioridad" y el tacho ("¿Quitar?"). Un depósito archivado se marca "Archivado: no suma". Si no quedan depósitos para agregar, el enlace "Crear uno" lleva a [Depósitos y ubicaciones](/stock/depositos).
2. **Cuenta de Mercado Libre** (sólo canales tipo Mercado Libre). Ver más abajo.
3. **Cuenta de Mercado Pago** (en todos los canales). Ver más abajo.
4. **Llave API**: si tiene, "Tiene llave (no se muestra)." con los botones **"Generar otro"** y **"Revocar"**; si no tiene, "Sin llave: nadie puede usar la API con este canal." y el botón **"Generar llave"**.

### Caja "Cuenta de Mercado Pago"

Toda cuenta de Mercado Pago que se conecta a Laucen va con un canal (de Mercado Libre, la tienda web minorista o mayorista, etc.). Una misma cuenta puede ir en varios canales: por ejemplo, la que cobra en la web y la de una cuenta de Mercado Libre.

- Sin cuenta: el botón **"Conectar Mercado Pago"** (Mercado Pago pide entrar con la cuenta que querés conectar y aprobar a Laucen; al volver queda conectada) y, si hay cuentas ya conectadas en otros canales, **"Usar la ya conectada: …"**. Mercado Pago conecta la cuenta con la que estés logueado en el navegador: para conectar otra, cerrá antes esa sesión o usá una ventana privada.
- Con cuenta: su nombre, "Conectada" en verde (o "Desconectada" en rojo con **"Volver a conectar"**), **"Sacarla del canal"** (pregunta Sí / No; si la cuenta no queda en ningún otro canal, se borra la conexión), en qué otros canales está y el enlace a sus números en [Mercado Pago](/administracion/mercadopago).
- Laucen sólo **lee** (saldos, cobros, liberaciones): no mueve plata. La llave de la cuenta nunca se ve y se renueva sola.

### Caja "Cuenta de Mercado Libre"

Sin cuenta:
- Texto: "Este canal todavía no tiene una cuenta de ML. Al conectarla empiezan a entrar sus pedidos, envíos y preguntas."
- **"Conectar una cuenta de Mercado Libre"**: te lleva a Mercado Libre a autorizar.
- **"Usar la ya conectada: …"**: un botón por cada cuenta de ML ya conectada que no está colgada de ningún canal.
- Aviso: para conectar otra cuenta, cerrá antes la sesión de ML en el navegador (o usá una ventana privada), porque ML conecta la cuenta con la que estés logueado.

Con cuenta:
- El apodo de la cuenta y su estado: "Conectada" o "Desconectada: volvé a conectarla" (con el botón **"Volver a conectar"**).
- **"Sacarla del canal"** (pregunta "¿Dejan de entrar sus pedidos?").
- "Último problema: …" si ML devolvió un error.
- Un renglón con: cuántas publicaciones vinculadas y sin vincular, preguntas sin responder y "pedidos al día hasta el …".
- El renglón de la cola: "Cola: N pendientes", "N con error" (en rojo si hay), "N preparados esperando tu clic" y la última barrida nocturna (fecha, revisadas y diferencias; o "Barrida de esta noche en curso" / "Todavía no hubo barrida nocturna"). Cada parte lleva a la Cola filtrada.
- **"Traer publicaciones de ML"**: trae (o actualiza) las publicaciones de esa cuenta de Mercado Libre y vincula solas las que coinciden por SKU. Trabaja hasta unos 4 minutos; si no llegó a traer todas, avisa que se apriete de nuevo y sigue desde donde quedó. Apretarlo de más no duplica nada. Es el mismo botón que está en [Vincular con Mercado Libre](/catalogo/publicaciones/ml).
- **"Traer pedidos y preguntas ahora"**: no espera el barrido automático.
- **"Vincular publicaciones"**: lleva a [Vincular con Mercado Libre](/catalogo/publicaciones/ml) con este canal.
- Interruptor **"Laucen manda el stock a ML y pausa al llegar al umbral"**.
- Interruptor **"Subir facturas a Mercado Libre"**.

### Cola de Mercado Libre

Arriba a la derecha, **"Descargar Excel"** (en las pestañas de la cola, no en Lotes ni Barridas). Pestañas, cada una con su cantidad entre paréntesis:

- **Pendientes**: lo que espera salir (y lo que se está mandando en este momento). Ordenado en el orden en que va a salir.
- **Enviados**: lo que Mercado Libre aceptó.
- **Con error**: lo que ML rechazó o falló después de todos los reintentos.
- **Descartados**: lo que se decidió no mandar.
- **Lotes preparados**: los paquetes de cambios que esperan tu clic.
- **Barridas nocturnas**: el resumen de cada noche.

En las cuatro primeras pestañas:
- Filtros: buscador **"Buscar por publicación (MLA…) o SKU"** (busca en todos los datos del envío: N.º, publicación, variación, tipo, estado, origen, el problema, la cuenta y el SKU), **Canal** ("Todas las cuentas" o una), **Tipo** (Stock, Estado, Precio, Descuento, Campaña, Atributos, Publicación nueva, Factura, Reclamo, Otro) y **Origen** (Automático, Botón, Barrida nocturna).
- Columnas: **N.º**, **Creado**, **Canal**, **Publicación** (el MLA, enlace a la publicación; o "Comprobante N" que lleva a la factura; o "Reclamo N"), **SKU** (enlace al producto), **Tipo** (y "lote N" si vino en un lote), **Antes → después** (ej. "activa, 3 u. → Cantidad 0"; con la marca roja "Urgente" si es una pausa por stock; y "reemplazó N cambios anteriores" si corresponde), **Origen**, **Estado**, **Intentos**, **Sale** (en Pendientes: la hora del próximo intento o "ya") o **Enviado** (en las otras), y **Problema** (el error en criollo).
- Por fila: **"Reintentar"** (sólo con error) y **"Descartar"** (pendiente o con error). Los dos preguntan antes.
- En **Con error**, arriba a la derecha: **"Reintentar errores"** (o "Reintentar los errores de esta cuenta" si filtraste por canal).

En **Lotes preparados**: la lista de lotes (N.º, Qué cambia, Canal o "Varias cuentas", Cambios, Estado: "Preparado, falta tu clic" / "Mandado" / "Descartado", Preparado, Mandado). Se muestran los preparados y los de los últimos 30 días. Al elegir uno se ve su detalle, arriba de la lista, (Publicación, SKU, Tipo, Antes, Después, Estado, Problema) y, si sigue preparado, los botones **"Descartar lote"** y **"Mandar a Mercado Libre"**. En un lote ya mandado, cada fila que sigue pendiente o con error tiene su botón **"Descartar"** (pregunta "¿No mandarlo?"), para frenar la que no termina de salir.

En **Barridas nocturnas**: una tarjeta por cuenta con la última noche (estado: Leyendo la lista, Leyendo publicaciones, Comparando, Terminada o "No pudo terminar"; revisadas, diferencias, encoladas, pausas y errores) y abajo la historia completa.

## Cómo se hace

### Crear un canal

1. Apretá **"Nuevo canal"** (arriba a la derecha).
2. Escribí el **Nombre** (ej. "Mercado Libre cuenta 2"), elegí el **Tipo** (Mercado Libre, Web minorista, Web mayorista, Local, Histórico, Otro) y la **Lista de precios** (o "Sin lista").
3. Apretá **"Crear"**. Aparece "Canal creado. Ahora elegí desde qué depósitos vende." y se abre el detalle del canal nuevo. En el plan de cuentas aparece sola su cuenta **"Ventas — <nombre>"**.
4. Agregale al menos un depósito (siguiente tarea). Sin depósitos, el canal no tiene stock.

Si falta el nombre: "El canal necesita un nombre." El nombre no se puede repetir dentro de la organización.

### Elegir desde qué depósitos vende un canal

1. Tocá el nombre del canal en la lista.
2. En la caja **Depósitos de "…"**, apretá **"Agregar depósito"**.
3. Elegí el depósito y la prioridad (propone el siguiente número) y apretá **"Agregar"**.
4. Para cambiar la prioridad: lápiz de la fila → nuevo número → **"Guardar"**.
5. Para que deje de vender desde un depósito: tacho de la fila → "Sí".

### Cambiar la lista de precios, el estado o el umbral de un canal

1. Apretá el **lápiz** de la fila del canal. La fila se convierte en campos.
2. Cambiá **Nombre**, **Tipo**, **Lista de precios** (de ahí sale el precio con que vende el canal), **Factura con** (la razón social, obligatoria), **Estado** (Activo / Pausado / Archivado), **Umbral de pausa** (vacío = "hereda") o **Color** (tocá uno de los cuadraditos de la paleta).
3. **"Guardar"** (o "Cancelar").
4. En una cuenta de Mercado Libre, debajo de los campos están también los interruptores **Stock a ML**, **Precios a ML** y **Facturas a ML**: se prenden o apagan ahí mismo (con su "Sí" / "No"), sin tocar "Guardar".

### Borrar un canal

Tacho de la fila → "Sí". Si el canal tiene pedidos, no se puede: "El canal tiene N pedido(s): no se puede borrar. Archivalo con el lápiz." En ese caso, lápiz → Estado "Archivado".

### Conectar una cuenta de Mercado Libre a un canal

1. Abrí el canal (tiene que ser de tipo Mercado Libre).
2. En **Cuenta de Mercado Libre**, apretá **"Conectar una cuenta de Mercado Libre"**.
3. Mercado Libre te pide autorizar Laucen con la cuenta con la que estás logueado en ese navegador. Si querés conectar otra cuenta, cerrá antes la sesión de ML o usá una ventana privada.
4. Al volver, la cuenta queda colgada del canal y empiezan a entrar sus pedidos, envíos y preguntas. En [Caja y bancos](/administracion/tesoreria) aparece sola la cuenta **"Mercado Pago — <apodo>"** (con su cuenta contable propia), si no estaba.

Si la cuenta ya estaba conectada (por ejemplo desde otra pantalla) y no tiene canal, usá **"Usar la ya conectada: …"**: "Cuenta asignada al canal. Desde ahora entran sus pedidos y preguntas."

### Prender que Laucen mande el stock a Mercado Libre

1. Antes: que el stock de Laucen esté cargado y las publicaciones vinculadas ([Vincular con Mercado Libre](/catalogo/publicaciones/ml)). Si no, las pausaría a todas por falta de stock.
2. En la caja de la cuenta, prendé **"Laucen manda el stock a ML y pausa al llegar al umbral"**.
3. Al prenderlo hace una primera pasada y avisa: "Prendido. Primera pasada: N publicaciones revisadas; quedaron en la cola para mandar a ML N cantidades, N pausas y N reactivaciones… Salen solas en los próximos minutos."
4. Lo que encoló se ve en la [Cola de Mercado Libre](/config/canales/cola), pestaña Pendientes.

Apagarlo: "Laucen ya no toca el stock ni las pausas en Mercado Libre."

### Prender que las facturas se suban solas a Mercado Libre

1. Prendé **"Subir facturas a Mercado Libre"** en la caja de la cuenta.
2. Desde ahí, cada factura o nota de crédito de una venta de ese canal que ARCA autorice entra a la cola y se sube como PDF a esa venta.
3. Las facturas que ya estaban se suben con "Subir a ML las facturas que faltan" en [Facturación](/administracion/facturacion).

Apagado, igual se puede subir una factura con el botón de su ficha.

### Traer ya los pedidos y preguntas de ML

En la caja de la cuenta, **"Traer pedidos y preguntas ahora"**. Avisa "Listo: N pedidos revisados, N preguntas sin responder."

### Generar, cambiar o revocar la llave API de un canal

1. Abrí el canal. En la caja **Llave API**:
   - Sin llave: **"Generar llave"**.
   - Con llave: **"Generar otro"** (pregunta "¿Reemplazarlo? El actual deja de andar.") o **"Revocar"** (pregunta "¿Revocar la llave?").
2. Al generarla aparece una sola vez, completa, en un cartel amarillo: "Llave nueva (copiala ahora, en un minuto deja de mostrarse)". Copiala en ese momento: después nunca más se muestra, ni en partes.
3. El otro sistema la manda como autorización ("Bearer") a la API de pedidos o de catálogo; la llave dice de qué canal es.

### Revisar qué se mandó a Mercado Libre

1. Abrí la [Cola de Mercado Libre](/config/canales/cola).
2. Pestaña **Enviados** (lo aceptado) o **Con error** (lo rechazado). Filtrá por canal, tipo u origen, o buscá por MLA o SKU.
3. En cada fila ves qué había antes, qué se pidió, cuándo salió y, si falló, el problema en criollo.

### Reintentar o descartar lo que dio error

- Uno solo: en **Con error**, botón **"Reintentar"** de la fila (o **"Descartar"**).
- Todos: **"Reintentar errores"** arriba a la derecha (con un canal filtrado, sólo los de esa cuenta).
- Avisa "Vuelven a la cola N cambios: salen en los próximos minutos." o "No había nada para reintentar (o ya hay un cambio más nuevo esperando)."

### Mandar un lote preparado

1. Pestaña **Lotes preparados**. Elegí el lote ("Preparado, falta tu clic").
2. Revisá en el detalle qué cambia en cada publicación (Antes / Después).
3. Apretá **"Mandar a Mercado Libre"** (pregunta "¿Mandar los N cambios a Mercado Libre?"). Los cambios pasan a Pendientes y salen solos en los próximos minutos; el resultado de cada uno queda en Enviados o Con error. Después de mandar (o descartar) un lote, la pantalla pasa sola al próximo lote que espera tu clic, si hay: fijate en el título cuál es antes de volver a apretar.
4. Si no querés mandarlo: **"Descartar lote"** ("Lote descartado: no se mandó nada.").
   - O, para mandar sólo algunas: en el detalle del lote, el **tacho** de cada fila saca esa publicación del lote (pregunta "¿Sacarlo del lote?" Sí / No ahí mismo). Queda "Descartado" y no sale; el resto sí, con "Mandar a Mercado Libre". Si sacás todas, el lote queda descartado.

### Con qué razón social se factura cada canal

Una vez cargadas las razones sociales (ver [Razones sociales](/config/razones-sociales)), tocá el canal (su nombre) y, en la caja **"Cuenta de Mercado Libre"**, elegí **"Este canal factura con (razón social)"** y apretá **"Guardar"**. La columna **"Factura con"** de la lista muestra con cuál factura cada canal, y también se cambia con el **lápiz** de su fila (desplegable **"Factura con"**). Elegís la razón social con la que se emiten las facturas de lo que vende ese canal (por ejemplo, tres cuentas de Mercado Libre con una razón social y dos con la otra). **No hay "principal"**: cada canal (Mercado Libre, tienda web, local, mayorista) tiene que tener elegida su razón social; al crear un canal se elige ahí mismo, y el lápiz no deja guardar sin ella.

- Cambiarlo afecta a las facturas **nuevas**; las ya emitidas no se mueven.
- La cuenta de fondos "Mercado Pago — <apodo>" de la cuenta de ML pasa a ser de la nueva razón social.
- Los asientos ya hechos quedan con la razón social con la que se hicieron.

## Criterios y reglas

- **Corte de pedidos de Mercado Libre.** Los pedidos que se crearon en Mercado Libre antes del **momento de corte** (la fecha y hora desde la que la empresa gestiona sus ventas en Laucen; lo anterior queda en el sistema que usaba antes) **no entran nunca** a Laucen: ni cuando Mercado Libre avisa un cambio (una entrega, un reclamo), ni en el barrido de cada media hora, ni al conectar una cuenta nueva. Todas las cuentas, incluidas las que se conecten después, usan el mismo corte. Si un carrito tiene alguna orden anterior al corte, no entra entero. Sólo entran los pedidos creados desde ese momento. **Lo mismo con las preguntas y los mensajes**: una pregunta hecha antes del corte no entra, y una conversación con el comprador sólo entra si tiene algún mensaje posterior al corte (en ese caso entra entera, para contestar con la historia a la vista).

- **Pausar y activar van con la cantidad, en el mismo envío.** Cuando el stock llega al umbral, Laucen manda a Mercado Libre la pausa y enseguida la cantidad disponible, juntas: primero la pausa (así nunca queda activa sin stock) y después la cantidad (con umbral 1 y 1 disponible, queda pausada con 1). Cuando vuelve a haber stock, manda la cantidad y la activación juntas: primero la cantidad y después "activa". Si una publicación estaba en 0 y pasa a tener stock, además de la cantidad se manda que se active. Las publicaciones con variaciones no se pausan enteras: a la variación sin stock se le informa 0.

### Canales

- **Tipos**: Mercado Libre, Web minorista (la tienda web), Web mayorista, Local, Histórico, Otro. Sólo los de tipo Mercado Libre pueden tener cuenta de ML y sus interruptores. Un canal Web minorista es una tienda web (se configura en [Tienda web](/config/tienda)).
- **Estados**: Activo, Pausado, Archivado.
  - La sincronización de stock con ML sólo corre en canales **Activos**.
  - Una tienda web toma pedidos sólo si su canal está **Activo**; pausada muestra "La tienda no está tomando pedidos en este momento."
  - Un canal **Archivado** no puede usar la API (su llave deja de valer) y no aparece en Tienda web.
- **Nombre único** por organización.
- **Borrar**: sólo si el canal no tiene ningún pedido. Al borrarlo se van con él sus depósitos asignados, sus publicaciones y las identidades de clientes de ese canal.
- **Stock disponible del canal** = la suma de lo disponible en sus depósitos **activos**. Un depósito archivado sigue en la lista pero no suma.
- **Prioridad de los depósitos**: el de número menor se usa primero. Cuando un pedido de ese canal tiene que reservar stock y no tiene depósito asignado, reserva en el depósito activo de menor prioridad del canal (si el canal no tiene ninguno, en el primer depósito propio activo). Las ventas de ML con logística Full salen del depósito tipo Full del canal (el de menor prioridad).
- **Umbral de pausa**: con ese stock disponible **o menos**, la publicación se pausa. Se toma, en este orden, el primero que esté cargado: el de la **publicación** → el del **producto** → el del **canal** (el de esta pantalla) → el de la **organización** → **1**. No puede ser negativo.
- **Color del canal**: cada canal tiene un color de fondo suave, distinto para cada uno, que se elige con el lápiz de su fila (paleta de cuadraditos). Un canal nuevo recibe solo el primer color libre. Toda pantalla que muestra datos de un canal pinta su fila (o su columna) con ese color, para distinguir las cuentas de un vistazo: [Publicaciones](/catalogo/publicaciones), la pestaña Publicaciones de la ficha del [producto](/catalogo/productos), [Pedidos](/ventas/pedidos), [Reclamos](/ventas/reclamos), [Envíos](/ventas/envios), [Facturación](/administracion/facturacion), la [Cola de Mercado Libre](/config/canales/cola), los informes de [Promociones](/informes/promociones), [Cambios en publicaciones](/informes/cambios-publicaciones) y [Rentabilidad](/informes/rentabilidad), la ficha del [cliente](/ventas/clientes), la [Vista previa de precios en Mercado Libre](/catalogo/precios-ml/vista-previa) y «Publicar en todas las cuentas» de la ficha del producto.
- **Datos de ejemplo**: la primera vez que una organización sin canales abre la pantalla, se crean cuatro listas de precios (Mercado Libre, Web minorista, Mayorista, Local), un "Depósito propio" (sólo si no había ningún depósito activo) y cinco canales (Mercado Libre, Web minorista, Web mayorista, Local, Otro), cada uno vendiendo desde ese depósito con prioridad 1. Queda marcado: borrarlos no los vuelve a crear. El cartel amarillo se ve mientras quede algún canal de ejemplo con su nombre original.

### Cuentas contables del canal (se crean solas)

- **Ventas**: cada canal tiene su cuenta de ingresos **"Ventas — <nombre del canal>"** en el plan de cuentas, creada al crear el canal. El neto de las facturas de los pedidos del canal va ahí; sin canal, a la Ventas general. **Si se renombra el canal, la cuenta no cambia de nombre**: se la renombra a mano en [Contabilidad](/administracion/contabilidad) si se quiere.
- **Mercado Pago**: cada cuenta de Mercado Libre colgada de un canal tiene su cuenta de fondos y contable **"Mercado Pago — <apodo>"**, creada al conectarla (o al usar "Usar la ya conectada"). Lo cobrado de las ventas del canal (menos la comisión) se asienta ahí en vez de en "Cobros de canales a liquidar", y entra también como movimiento "Cobro del pedido …" en esa cuenta de [Caja y bancos](/administracion/tesoreria), así su saldo coincide con la contabilidad. Sacar la cuenta del canal no la borra.
- **Tienda web**: lo que la tienda cobra con Mercado Pago va a la cuenta **"Mercado Pago — Tienda web"**, que se crea sola al cargar el access token en [Medios de pago](/config/medios-pago).
- Valen para los asientos nuevos; los ya grabados no cambian.

### Cuenta de Mercado Libre del canal

- **Una cuenta por canal**. "Usar la ya conectada" saca cualquier otra cuenta que tuviera el canal y cuelga la elegida.
- **"Sacarla del canal"** no desconecta la cuenta de ML: sólo la deja sin canal; dejan de entrar sus pedidos.
- Los pedidos y preguntas de ML entran solos con un barrido automático de cada pocos minutos; "Traer pedidos y preguntas ahora" lo hace en el momento.
- **Cambios en Mercado Libre, siempre por un clic en el panel**: nada modifica Mercado Libre "por su cuenta", ni siquiera lo que se le pide al asistente. Lo que se pide se prepara como un lote y sale recién con **"Mandar a Mercado Libre"**. Lo automático sólo corre si alguien prendió el interruptor del canal (prenderlo es ese clic). Leer de ML sí se puede siempre.

### Interruptor "Laucen manda el stock a ML y pausa al llegar al umbral"

Apagado (como nace): no se toca nada en ML. Prendido, para cada publicación vinculada del canal (que no esté cerrada):

- Si el **disponible del canal es menor o igual al umbral** y la publicación está activa → se **pausa**. Es lo más urgente de la cola. (Si la publicación es una variación de ML, que no se puede pausar sola, se le informa cantidad 0.)
- Si la publicación está **pausada** (por Laucen o por quien sea) y vuelve a haber stock por encima del umbral → se **reactiva** con la cantidad disponible. Tener el precio y lo demás al día al reactivar es responsabilidad de quien la pausó a mano.
- Si está activa y la cantidad informada a ML no coincide con el disponible → se manda la **cantidad** nueva.
- Las publicaciones de **Full** no se tocan (el stock lo maneja ML).
- Si ML pausó la publicación por una infracción, rechaza la reactivación: queda "Con error" y lo automático no lo vuelve a intentar con el mismo pedido durante 6 horas (lo retoma la barrida nocturna).
- Para un **kit**, si cambia el stock de un componente también se revisa la publicación del kit.
- **Cuándo se revisa**: al instante, en cada cambio de stock; y como red de seguridad, en las tareas periódicas (cada media hora) y en la barrida nocturna.
- Lo que se graba en Laucen (pausada, cantidad informada) se graba recién cuando ML acepta el cambio.

### Interruptor "Subir facturas a Mercado Libre"

Prendido: cada factura y nota de crédito de una venta de ese canal, al autorizarla ARCA, entra a la cola (tipo Factura) y se sube como PDF a la venta de ML. Apagado no sube nada solo.

### Precios en Mercado Libre

El interruptor de que los precios sigan a la publicación Clásica ("sincronizar precios") y el de leer el precio para ganar no están en esta pantalla: están en [Precios en Mercado Libre](/catalogo/precios-ml). Qué planes de cuotas se crean, para todas las cuentas, se decide en [Configuración › Planes de cuotas](/config/planes-cuotas).

### Llave API

- Una llave por canal, de 64 caracteres, generada al azar. Se muestra completa **una sola vez**, durante un minuto, al generarla; después la pantalla sólo dice si hay o no.
- "Generar otro" reemplaza la anterior: la vieja deja de andar en ese momento. "Revocar" la borra: nadie puede usar la API con ese canal.
- La llave sirve para la API de pedidos (cargar pedidos en ese canal) y la de catálogo.

### Cola de Mercado Libre: cómo sale cada cambio

- **Todo lo que va a ML pasa por la cola**: se reintenta, respeta los límites de ML y queda registrado qué se mandó, cuándo y con qué resultado.
- **Orígenes**: **Automático** (stock, pausas, reactivaciones, facturas), **Botón** (lo que se preparó en un lote y se mandó con el clic) y **Barrida nocturna**.
- **Estados**: Preparado, falta tu clic → Pendiente → Enviando → Enviado; o Con error; o Descartado.
- **Prioridades** (sale primero el número más alto): pausar por stock = 100 (lo marcado "Urgente"), reactivar = 50, lo que viene de un botón = 30, el resto = 10. A igual prioridad, por orden de llegada.
- **Reemplazo**: si llega un cambio nuevo de la misma publicación y del mismo tipo mientras el anterior sigue pendiente, lo reemplaza (sólo importa el último stock o precio); la fila muestra "reemplazó N cambios anteriores". Un cambio idéntico al que ya espera no se repite. Esto no aplica a los lotes.
- **Ritmo**: como mucho un pedido a ML cada 0,3 segundos por cuenta (unos 200 por minuto); las distintas cuentas salen en paralelo.
- **Reintentos**: lo que es de ML o pasajero se reintenta solo, cada vez más espaciado: 30 segundos, 1 minuto, 2, 4… con tope de 1 hora entre intentos. Después de **6 intentos** queda "Con error". Se reintenta solo cuando ML no respondió, pidió ir más despacio (429), tuvo un problema de su lado (error 500 o más) o la cuenta está desconectada (401). Un rechazo de ML (400, 403, 404…) va directo a "Con error", sin reintentos.
- **Frenos**: si ML pide ir más despacio, esa cuenta se frena 1 minuto; si la cuenta está desconectada, 5 minutos.
- **Cuándo sale**: lo que entra a la cola sale enseguida; además, las tareas periódicas del servidor la vuelven a revisar. Un envío que quedó colgado más de 5 minutos en "Enviando" vuelve a Pendiente.
- **Mensajes de error en criollo**: "La cuenta está desconectada (hay que volver a conectarla)", "Mercado Libre no deja hacer esto con esta cuenta", "Mercado Libre no encuentra la publicación", "Mercado Libre pidió que vayamos más despacio; se reintenta solo", "Mercado Libre no respondió; se reintenta solo", "Mercado Libre tuvo un problema de su lado (N); se reintenta solo", "Mercado Libre no lo aceptó (N)", seguidos del detalle que mandó ML.
- **Reintentar errores**: de cada publicación y tipo vuelve a la cola sólo el último con error (con los intentos en cero). Si ya hay un cambio pendiente más nuevo de esa publicación, el viejo no se reintenta y queda "Descartado" con "Hay un cambio más nuevo de la misma publicación".
- **Descartar**: sólo lo pendiente o con error; queda "Descartado" ("Descartado a mano").
- **Lotes**: un lote nace "Preparado, falta tu clic" y nada sale hasta "Mandar a Mercado Libre". Al mandarlo, sus cambios pasan a Pendientes con prioridad 30. "Descartar lote" deja todos sus cambios descartados ("Descartado antes de mandarlo"). Un lote ya mandado o descartado no se puede volver a mandar.
- **Facturas en espera**: si la venta de ML todavía no admite la factura (por ejemplo un carrito en espera), la subida vuelve a la cola sin contar el intento.

### Barrida nocturna

Todas las noches, de 2 a 5 (hora argentina), para cada cuenta con "Laucen manda el stock" prendido (de a una cuenta por vez): lee de ML todas sus publicaciones, refresca lo que Laucen sabe de cada una, lo compara con lo que debería ser (stock disponible del canal, umbral, estado) y encola las diferencias con origen "Barrida nocturna" (las pausas primero). Sólo lee de ML; lo que haya que cambiar sale por la cola. Si una noche no termina en una corrida, sigue en la siguiente dentro de la ventana.

## Preguntas frecuentes

**¿Por qué un producto tiene stock pero en Mercado Libre aparece pausado?**
Porque el disponible **del canal** (la suma de sus depósitos) es menor o igual al umbral de pausa. Revisá desde qué depósitos vende el canal y el umbral (publicación → producto → canal → organización → 0, que pausa sólo sin stock).

**Prendí "Laucen manda el stock" y no cambió nada en ML. ¿Por qué?**
Los cambios salen por la cola en los próximos minutos. Mirá la [Cola de Mercado Libre](/config/canales/cola): Pendientes, Enviados o Con error. Además, el canal tiene que estar Activo, con la cuenta conectada y las publicaciones vinculadas.

**¿Qué significa "Preparado, falta tu clic"?**
Es un cambio en Mercado Libre que alguien preparó pero que no sale hasta que se aprieta "Mandar a Mercado Libre" en Lotes preparados.

**¿Puedo cambiar un precio o un stock en ML directamente desde el chat?**
No. Se prepara y queda un botón en el panel para mandarlo con un clic; así nada sale por un malentendido.

**¿Por qué no puedo borrar un canal?**
Porque tiene pedidos. Archivalo con el lápiz (Estado: Archivado).

**Perdí la llave API, ¿cómo la veo?**
No se puede ver de nuevo. Generá otra con "Generar otro" (la anterior deja de andar) y pasásela al otro sistema.

**¿Qué hace la prioridad de los depósitos?**
El de número menor se usa primero: por ejemplo, para elegir en qué depósito reserva el stock un pedido del canal.

**¿Qué es la barrida nocturna?**
Una revisión de 2 a 5 de la mañana que compara cada publicación de ML con lo que dice Laucen y encola las diferencias, por si algún aviso se perdió durante el día.

**Un cambio quedó "Con error" con "Mercado Libre no encuentra la publicación". ¿Qué hago?**
La publicación ya no existe o el MLA está mal vinculado. Revisá la vinculación en [Publicaciones](/catalogo/publicaciones) y descartá el cambio.

**¿Cómo conecto una segunda cuenta de ML?**
Creá un canal nuevo tipo Mercado Libre y conectá la cuenta desde su caja, habiendo cerrado antes la sesión de ML en el navegador (o en una ventana privada).

## Relacionado

- [Listas de precios](/catalogo/precios)
- [Depósitos y ubicaciones](/stock/depositos)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Facturación](/administracion/facturacion)
- [Tienda web](/config/tienda)
- [Pedidos](/ventas/pedidos)
- [Razones sociales](/config/razones-sociales)
