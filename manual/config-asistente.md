---
titulo: Asistente
menu: Configuración › Asistente
ruta: /config/asistente
rutas: /config/asistente, /config/asistente/historial, /config/asistente/pendientes, /config/asistente/conversacion/[id]
permiso: asistente_config
resumen: El asistente del sistema (la carita de abajo a la derecha): cómo usarlo, pedirle que haga cosas, su nombre, la carita, las preguntas fuera del sistema, el tope de gasto, el historial y los pedidos sin resolver.
---

## Para qué sirve

El asistente es la carita que aparece abajo a la derecha en todas las pantallas. Se le pregunta en lenguaje común cómo se hace algo, dónde está una opción, con qué criterio calcula algo el sistema o un dato ("¿cuántos pedidos entraron hoy?"), y contesta ahí mismo.

En esta pantalla se configura (nombre, carita, preguntas fuera del sistema, tope de gasto) y, en la pestaña Historial, se ven las preguntas que le hizo cada persona.

## Cómo se llega

- Para usarlo: tocá la carita (o el signo de pregunta) de abajo a la derecha, en cualquier pantalla.
- Para configurarlo: menú **Configuración › Asistente** ([Asistente](/config/asistente)). Pide el permiso «Configurar el asistente».
- El historial: pestaña **Historial** ([Historial del asistente](/config/asistente/historial)). Pide el permiso «Ver el historial del asistente».
- Los pedidos sin resolver: pestaña **Pedidos sin resolver** ([Pedidos sin resolver](/config/asistente/pendientes)). Sólo la ven los superadministradores.

## Qué hay en la pantalla

**El chat** (al tocar la carita):
- Arriba: el nombre del asistente, **"Nueva"** (empieza otra conversación) y **✕** (cierra; la conversación sigue si lo volvés a abrir).
- Las preguntas y respuestas. Debajo de cada respuesta, **👍** (me sirvió) y **👎** (no me sirvió).
- Abajo: el **📎** para mandarle archivos, el cuadro para escribir, el **🎤** para dictar la pregunta (si el navegador lo permite; anda en Chrome y Edge) y **"Enviar"**. Enter envía; Mayúscula+Enter hace un renglón nuevo.
- **Archivos**: fotos, PDF, Excel y CSV, hasta 20 por vez y de hasta 20 MB cada uno. Se eligen con el **📎**, se arrastran sobre el chat o se pega una captura en el cuadro de escribir. Antes de mandar, quedan arriba del cuadro con su **✕** para sacarlos. El asistente los mira y los interpreta («¿qué dice esta etiqueta?», «¿este remito coincide con el pedido?»); en la conversación se ven arriba de la pregunta. Se pueden mandar sin escribir nada.

**Configuración**: Nombre, Cómo se ve (carita o signo de pregunta), Tope de gasto por mes (US$) con lo gastado en el mes, y Preguntas fuera del sistema. Se edita con el lápiz de arriba a la derecha y se graba con **"Grabar"**.

**Pedidos sin resolver** (sólo superadministradores): lo que le pidieron hacer al asistente y no sabe hacer todavía, con fecha, persona y "ver la conversación". Filtro de estado (Nuevos, Mandados a programar, Descartados, Todos). En cada nuevo: una **Nota** opcional, **"Mandar a programar"** y **"Descartar"** (pregunta Sí/No).

**Historial**: buscador (por N.º, pregunta, respuesta, pantalla o persona), rango de fechas, **"Sólo con 👎"**, y la lista de conversaciones con Última pregunta, Persona, Primera pregunta, Preguntas, 👍, 👎 y Costo US$. Tocando la pregunta se abre la conversación entera abajo, con qué usó para contestar cada respuesta (manual, datos, código, internet) y lo que costó. **"Descargar Excel"** arriba a la derecha.

## Cómo se hace

### Preguntarle algo
1. Tocá la carita de abajo a la derecha.
2. Escribí (o dictá con 🎤) la pregunta y apretá **"Enviar"**.
3. Mientras trabaja muestra qué está haciendo ("Buscando en el manual…", "Consultando los datos…"). Los lugares que nombra son enlaces: tocándolos vas directo.

### Cargar facturas de gasto
Con el permiso de **Facturas de compra** (no hace falta otro):
1. Mandale las facturas (PDF o fotos, varias a la vez) con el **📎** y escribí, por ejemplo, «cargá estas facturas».
2. Las lee y te cuenta cada una: proveedor, CUIT, tipo y número, fecha, total y a nombre de qué razón social está. Te avisa si alguna **ya estaba cargada** (entonces sólo se le suma el archivo) o si **no es una factura** (un comprobante de pago, una boleta de impuestos), que no se carga.
3. Si una factura **está a nombre de otra persona o empresa** (por ejemplo, un servicio del local que viene a nombre del dueño), se carga igual como gasto de la empresa: si hay más de una razón social, te pregunta de cuál es. Queda como comprobante **X**: el gasto entero a su cuenta, sin IVA y fuera del Libro de IVA, con su PDF y una nota de a nombre de quién está.
4. Si un proveedor **no tiene cuenta de gasto**, te pregunta cuál usar y te sugiere una; la que elijas queda guardada en el proveedor para la próxima. Si no sabés, decíselo: esa factura se carga igual y queda **en borrador**.
5. Te muestra la tarjeta **"Para confirmar"** con lo que va a pasar; apretá **"Confirmar"**.
6. Cada factura queda:
   - **en el Drive**, si está conectado y su carpeta de facturas cargada ([Google Drive](/config/google-drive)): en la carpeta de gastos de su razón social y su mes (la del mes se crea si falta), con un nombre prolijo («2026-11-03 Edenor Factura A 00004-00012345.pdf»); las de Mercado Libre, en su carpeta. Si no, el archivo queda guardado en Laucen;
   - **cargada** en [Facturas de compra](/compras/facturas), registrada si su proveedor tiene cuenta de gasto, con el comprobante a un clic desde la factura. La búsqueda de facturas en el Drive no la vuelve a cargar.

### Importar el reporte de ARCA
Con el mismo permiso:
1. Bajá de ARCA «Mis Comprobantes – Recibidos» del mes (.csv o .xlsx), mandáselo con el **📎** y pedile que lo importe.
2. Si la organización tiene más de una razón social y el nombre del archivo no trae el CUIT, te pregunta de cuál es.
3. Te cuenta cuántas facturas son nuevas, cuántas ya estaban, las que tienen diferencias (ésas se corrigen a mano en la vista previa, que te deja enlazada) y los proveedores sin cuenta de gasto: para cada uno te pregunta la cuenta con una sugerida; si de alguno no sabés, sus facturas quedan sin importar por ahora (se importan cuando vuelvas a mandar el archivo).
4. **"Confirmar"** en la tarjeta: importa lo nuevo (registrado) y marca como validadas con ARCA las que ya estaban. Al terminar te dice **qué facturas siguen sin su comprobante** (PDF), para conseguirlas y mandárselas.

### Pedirle que haga algo
Si tu rol tiene el permiso «Pedirle al asistente que haga cosas», le podés pedir:
- **Facturar pedidos**: uno o varios (hasta 50), por ejemplo "facturá los pedidos preparados que no tienen factura".
- **Crear un cliente**: por ejemplo el que está en el mostrador ("creá el cliente Juan Pérez, DNI 30.123.456").
- **Crear un pedido a mano**: canal, cliente (o consumidor final), productos por SKU y cantidades, cómo paga y si retira o se envía.
- **Cambiar el estado de pedidos** que no son de Mercado Libre ("pasá a despachados los pedidos 120, 121 y 125").

1. Pedíselo en el chat. Si le falta algo (qué pedidos, qué producto, cómo paga), te lo pregunta o lo busca.
2. Te muestra una tarjeta **"Para confirmar"** con lo que va a hacer, renglón por renglón.
3. Apretá **"Confirmar"** para que lo haga, o **"Cancelar"**. Recién ahí se hace; la tarjeta muestra el resultado (con enlaces a lo creado).

### Pedirle otros cambios en los datos (sólo superadministradores)
Un superadministrador le puede pedir también cambios que no están en esa lista, siempre en los datos de Laucen (por ejemplo "subile 10 % al precio de lista de los productos de la familia Cables" o "corregí el mail de todos los clientes que dicen gmial.com"). El asistente arma el cambio, lo **ensaya sin grabar** y muestra la tarjeta con cuántas filas cambian y cómo quedan; recién con **"Confirmar"** se hace.
- Nunca toca Mercado Libre, canales, usuarios y permisos, llaves, ni lo que tiene su propio circuito: el stock (va por un ajuste), los asientos, los comprobantes de ARCA, las cuentas corrientes, la caja ni el estado de los pedidos.
- Sólo ve y toca los datos de su organización.
- De a una tabla y hasta 1.000 filas por vez. Si al confirmar cambió la cantidad de filas, no hace nada y avisa.
- Si el cambio es en precios o productos y en un canal de Mercado Libre está prendido el interruptor de precios o de stock, la tarjeta avisa que se va a reflejar en Mercado Libre.
- Revisá bien la tarjeta antes de confirmar: la instrucción la arma el asistente en el momento.

### Consultas libres y listados en Excel
Con el permiso «Consultas libres al asistente» (o siendo superadministrador) le podés preguntar cualquier dato, aunque no esté en una lista de pantalla: "¿cuántas publicaciones de Mercado Libre están para revisar?", "haceme un listado de los productos sin foto con stock". Contesta el número o la tabla, y para un listado largo deja un botón **"⬇ Descargar Excel"** con todas las filas (hasta 50.000).
- Es sólo lectura: nunca cambia nada.
- Sólo ve los datos de tu organización y, si no sos superadministrador, sólo los de las pantallas que tu rol tiene (sin «Contabilidad» no ve asientos; sin «Caja y bancos», los movimientos de fondos). Si preguntás por algo de otra pantalla, te dice que lo maneja otro rol.
- Nadie consulta llaves ni credenciales. Algunos datos compartidos del sistema (el Radar, las importaciones de ARCA) todavía no se consultan desde el chat: se ven en su pantalla.
- El Excel lo baja sólo quien hizo la pregunta, y se arma con los datos y permisos del momento en que se baja.

### Mandar a programar algo que no sabe hacer
Si le piden hacer algo que no está entre sus acciones, explica cómo se hace a mano y lo anota. El superadministrador lo ve en **Pedidos sin resolver**:
1. Si conviene que el asistente aprenda a hacerlo, escribí una **Nota** si querés y apretá **"Mandar a programar"**: queda como orden en la bitácora del proyecto para que se programe.
2. Si no, **"Descartar"** y confirmá con **Sí**.

### Cambiarle el nombre o la carita
1. En [Asistente](/config/asistente), apretá el lápiz.
2. Cambiá el **Nombre** o el interruptor **Carita** (apagado, se ve un signo de pregunta).
3. Apretá **"Grabar"**.

### Dejar que conteste preguntas generales
Tocá el interruptor **Preguntas fuera del sistema**: se prende (o se apaga) con un clic, sin el lápiz. Lo mismo el de la **Carita**. Prendido, contesta también cosas que no son del sistema (impuestos, comercio, Mercado Libre en general) y busca en internet si hace falta. Apagado, a eso contesta que sólo sabe del sistema.

### Imprimir una conversación o guardarla en PDF
1. En el chat, apretá **"PDF"** (arriba, al lado de "Nueva"); o en el **Historial**, abrí la conversación y apretá **"🖨 Imprimir o PDF"**.
2. Se abre la conversación con el mismo formato del chat: preguntas, respuestas con sus tablas y las tarjetas de las acciones con su resultado.
3. Apretá **"🖨 Imprimir o guardar en PDF"** y, en la ventana del navegador, elegí **"Guardar como PDF"** como impresora (o una impresora de verdad).
Una conversación la puede ver quien la tuvo, o quien tiene «Ver el historial del asistente».

### Ver qué le preguntan
Entrá a la pestaña **Historial**. Con **"Sólo con 👎"** ves las respuestas que no sirvieron: sirven para mejorar el manual o una pantalla confusa.

## Criterios y reglas

- **De dónde saca lo que sabe**: primero del manual del sistema; para datos, de las mismas listas que ves en las pantallas (con sus filtros); y si el manual no alcanza para explicar un criterio, revisa cómo funciona el sistema por dentro. Contesta siempre en palabras, sin mostrar nada técnico.
- **Respeta los permisos**: a cada persona le explica sólo las pantallas y los datos que su rol le deja ver. Si pregunta por otra cosa, le dice que eso lo maneja otro rol y que lo pida al administrador.
- **Nunca hace nada solo**: para hacer algo prepara la acción y espera que la persona apriete **Confirmar**. Usa las mismas funciones que las pantallas (la factura sale igual que con el botón "Facturar"). Con "Cancelar", no se hace nada. Una propuesta que pasó más de una hora sin confirmar vence: hay que pedirla de nuevo.
- **Doble permiso**: hace falta «Pedirle al asistente que haga cosas» y además el permiso de la pantalla (facturar: «Facturación»; clientes: «Clientes»; pedidos: «Pedidos»). Sólo confirma quien lo pidió.
- **Mercado Libre, nunca**: no cambia precios, stock, publicaciones ni el estado de los pedidos de Mercado Libre (esos se mueven solos desde Mercado Libre).
- Sin el permiso de acciones, no hace nada: explica cómo hacerlo y dónde.
- **Tope de gasto**: cada respuesta cuesta unos centavos de dólar (más si consulta muchos datos o busca en internet). Cuando lo gastado en el mes llega al tope, deja de contestar hasta el mes siguiente y avisa que se terminó el cupo. 0 lo apaga.
- **Historial**: cada pregunta y respuesta queda guardada, con la persona, la pantalla desde la que preguntó, qué usó para contestar, lo que costó y el 👍/👎. El chat lo avisa abajo.
- La conversación sigue mientras cambiás de pantalla y al recargar la página; **"Nueva"** empieza otra.
- Quién lo usa: todas las personas cuyo rol tiene el permiso «Asistente» (viene prendido).

## Preguntas frecuentes

**¿El asistente puede hacer el cambio por mí?** Si tu rol tiene «Pedirle al asistente que haga cosas»: facturar pedidos, crear un cliente, crear un pedido o cambiar estados, siempre con tu Confirmar. Lo demás te lo explica y queda anotado para que se programe.

**¿Qué pasa si confirmo y algo falla?** La tarjeta dice qué se hizo y qué no (por ejemplo, "Facturados 10 de 12" y el motivo de los 2).

**¿Por qué me dice que eso lo maneja otro rol?** Porque tu rol no tiene permiso para esa pantalla o esos datos.

**¿Por qué dice que se terminó el cupo?** Se llegó al tope de gasto del mes. Quien administra la organización lo puede subir acá.

**¿Por qué no aparece el micrófono?** Tu navegador no tiene dictado (anda en Chrome y Edge, en PC y en celular).

**¿Lo que le pregunto lo ve alguien?** Sí: queda en el historial y lo ve quien tiene el permiso «Ver el historial del asistente».

**¿Puede equivocarse?** Puede. Si una respuesta no te sirvió, marcala con 👎: así se revisa.

## Relacionado

- [Usuarios y roles](/config/usuarios): los permisos «Asistente», «Configurar el asistente» y «Ver el historial del asistente».
