---
titulo: Herramientas internas
menu: Coordinación › Bitácora · Para probar · Mercado Libre · Costos ML · Ventas ML por categoría · China — pruebas · Piloto · Diagnóstico · Limpieza de datos · Creaciones en ML
ruta: /admin/bitacora
rutas: /admin/bitacora, /admin/para-probar, /admin/meli, /admin/meli/apify, /admin/mercadopago, /admin/costos-ml, /admin/ventas-ml, /admin/china, /admin/piloto, /admin/piloto/[id], /admin/piloto/[id]/revision, /admin/piloto/[id]/validacion, /admin/diagnostico, /admin/limpieza, /admin/limpieza/ajustes, /admin/creaciones
permiso: fer
resumen: Herramientas internas sólo de Fer: bitácora y "para probar" (coordinación con las sesiones de Claude), conexión y bancos de prueba de Mercado Libre y Apify, costos de vender en ML, ventas por categoría, pruebas de búsqueda en China, el piloto ML → China → juez y el diagnóstico de la base.
---

## Para qué sirve

La sección **Coordinación** del menú agrupa las herramientas internas del proyecto. No son funciones del sistema de gestión: son de uso exclusivo de Fer (el dueño de Laucen), para coordinar el trabajo con las sesiones de Claude (Code y Cowork), probar las conexiones con Mercado Libre, Apify y los sitios de China, y revisar la base de datos.

- **Bitácora**: el canal de coordinación entre Fer y las sesiones (órdenes, decisiones, preguntas, por qué se hizo cada cosa y qué quedó pendiente).
- **Para probar**: la cola de cosas nuevas que hay que ir a mirar en la app, con su resultado.
- **Mercado Libre**: conectar la cuenta y ver qué devuelve la API de Mercado Libre; desde ahí, el banco de **Apify**.
- **Costos ML**: lo que cuesta vender en Mercado Libre (comisiones, cargo fijo, envío gratis), leído todos los días.
- **Ventas ML por categoría**: las ventas pagadas de la cuenta, agrupadas por categoría.
- **China — pruebas**: banco de pruebas de buscadores de 1688, Alibaba y AliExpress.
- **Piloto**: rastrillaje experimental Mercado Libre → China → juez, con el costo puesto en Argentina.
- **Diagnóstico**: revisa la conexión a la base de datos.
- **Limpieza de datos**: tareas de una sola vez para dejar la base lista tras la carga de Virtual Seller (ver más abajo).

La pantalla definitiva de **Búsqueda en China** (menú Sourcing) todavía no existe: figura como **próximamente**. El Piloto y China — pruebas son los ensayos previos.

## Cómo se llega

- Menú **Coordinación** (sólo le aparece a Fer): **Bitácora**, **Para probar**, **Mercado Libre**, **Costos ML**, **Ventas ML por categoría**, **China — pruebas**, **Piloto**, **Diagnóstico**.
- El banco de Apify ([/admin/meli/apify](/admin/meli/apify)) se abre desde [Mercado Libre](/admin/meli), botón **Probar con Apify →**.
- Cada piloto ([/admin/piloto](/admin/piloto) → **#número**) tiene tres pestañas: **Mercado Libre**, **Revisión** y **Validación**.
- Desde la Bitácora hay un botón **🧪 Para probar**.
- Cada pantalla tiene arriba a la izquierda **← Panel** (o **← Mercado Libre**, **← Pilotos**) para volver.

Quién entra: sólo las direcciones de mail cargadas como dueño de Laucen (hoy, la de Fer). Cualquier otro usuario que abra una de estas direcciones vuelve al panel (o al inicio, en Bitácora y Para probar), aunque sea Admin de su organización. No dependen de los roles.

## Qué hay en la pantalla

### Bitácora

- Título y explicación: "El canal de coordinación de este proyecto…".
- Botones de filtro: **Para vos (N)** (lo que todavía no marcaste como visto; se resalta si hay algo), **Ver archivadas** / **Con archivadas**, y **🧪 Para probar**.
- **Documentos publicados para Cowork**: los documentos que cada despliegue sube solo a la base para que Cowork los lea (por ejemplo el de convenciones del proyecto), con el commit, la fecha y el largo. Dice "(el de este deploy ✓)" si coincide con la versión en producción, o "no coincide" en rojo.
- Desplegable **＋ Anotar una entrada**: **Tipo** (Entrega, Avance, Orden, Decisión, Pregunta, Respuesta, Bloqueo, Nota), **Título** (obligatorio), **Detalle**, **Por qué así y no de otra forma**, **Huecos que deja**, **Documento (opcional)** y el botón **Anotar**.
- Filtros por tipo: **Todo** y uno por cada tipo.
- Los **hilos**: cada entrada raíz con sus respuestas colgadas debajo (en orden). Cada entrada muestra: autor (fer, code, cowork), la sesión que la escribió (con el título que le puso Fer; si es una sesión de Code, tocarla la abre), el tipo, fecha y hora, **#número**, el documento si lo hay y la etiqueta **nuevo** si no la viste. Debajo: el detalle, "**Por qué:** …" y "**Huecos que deja:** …".
- Si la entrada pide confirmación de lectura: un recuadro "Pide confirmación de lectura. Falta que la lean: …" o "La leyeron todos."
- Botones por entrada: **✓ La leí** (si pide lectura y no la confirmaste), **✓ Visto** (o "Visto el dd/mm hh:mm"), y el desplegable **↩ Responder** con **Qué es** (Respuesta, Repregunta, Decisión, Orden, Nota), **En una línea**, **Lo que quieras agregar** y el botón **Responder**.
- Columna **Huecos** (pendientes): **Abiertos (N)** / **Cerrados**. Cada pendiente con su prioridad (Alta, Media, Baja), estado (Abierto, En curso, Resuelto, Descartado), autor, detalle, "Por qué quedó", la nota de resolución, y un formulario **Estado** + **Guardar** con el desplegable **✎ Cómo se resolvió**.

### Para probar

- Cinco contadores: **Por probar**, **De alta**, **Con fallas**, **Observados**, **Chequeadas** (y, si hay filtros, los mismos "Con los filtros puestos").
- Desplegable **＋ Cargar algo para probar**: **Qué se hizo** (obligatorio), **Prioridad**, **Qué probar y dónde**, **Qué parte toca** (cajas: Búsqueda, Parámetros de búsqueda, Resultados, Cron, Panel, Importaciones, Por dentro), **Sesión** (opcional), **Por pedido de** y el botón **Cargar**.
- Filtros: **Por probar** (el de entrada), **Con fallas**, **Observados**, **Anda**, **Todo**; **Prioridad** (Todas, Alta, Media, Baja); **Lo hizo** (Todos o cada autor); **Área** (desplegable con la cantidad de cada una) + **Ver**.
- Cada hilo: **#número**, prioridad, estado, áreas, título, qué probar, "Lo hizo …", la sesión, "por pedido de …", fecha y versión ("build …"). Debajo, las **vueltas** numeradas **1a, 1b, 1c…** (Falló, Observado, Arreglado, Anda, Nota) con autor, sesión y fecha. Las vueltas escritas por Fer tienen **✎ Editar** (cambiar el texto y **Guardar**, o **🗑 Borrar esta vuelta**).
- Botones del hilo: si está por probar, **✓ Anda**, **✗ Falló** (pide "Qué pasó") y **👀 Observado** (pide "Qué observaste"); si no, **↩ Volver a probar**. Siempre **💬 Nota**. Si el hilo lo cargó Fer, **🗑 Borrar**.
- Recién marcado, el hilo muestra la etiqueta **Listo**.

### Mercado Libre

Título "Mercado Libre — qué trae la API". Cinco bloques:
1. **Conexión**: "Conectada como *apodo*." o "Todavía no hay cuenta conectada.", la dirección de redirección exacta que tiene que estar cargada en la aplicación de Mercado Libre, y el botón **Conectar con Mercado Libre** (o **Reconectar**).
2. **Probar una búsqueda**: un texto (ej. "auriculares bluetooth") y **Probar**.
3. **Scrapers de Apify**: botón **Probar con Apify →**.
4. **Seguimiento de competencia**: pegar publicaciones (links o códigos MLA…, una por renglón: una tuya y las de la competencia) y **Probar**.
5. **Leer la página con Apify**: hasta 5 links o códigos (MLA… / MLAU…), uno por renglón, y el botón **Leer** ("Leyendo… (uno o dos minutos)"). Debajo, la tabla de las últimas corridas: **Corrida**, **Páginas**, **Costo final USD**, **Por página**, y el desglose del cobro.

Abajo de todo, el resultado: una línea por cada consulta a la API, con el código de respuesta (verde si salió bien, rojo si no) y el contenido desplegable.

### Aplicación de Mercado Pago (/admin/mercadopago)

En el menú de herramientas internas, **"Aplicación de Mercado Pago"**. La aplicación de Mercado Pago de Laucen, una sola para todo el sistema: con ella cada organización conecta sus cuentas de Mercado Pago desde [Canales](/config/canales) ("Conectar Mercado Pago"). Muestra si está cargada y la **URL de redireccionamiento** que hay que poner en la aplicación de Mercado Pago (en developers de Mercado Pago), y dos campos: **Client ID** y **Client Secret**, que se graban con **"Grabar"** (arriba a la derecha) y nunca se vuelven a mostrar.

### Apify — scrapers de Mercado Libre

- Un texto a buscar y el botón **Correr** ("Corriendo… (hasta 4 min)").
- Cajas para elegir los actores (tres scrapers de Mercado Libre; vienen todos tildados).
- Aclaración: 20 resultados por actor (uno trae 48 como mínimo), tope de USD 0,25 por actor; recargar la página no vuelve a correr nada.
- La última prueba: "Prueba #N · "texto" · fecha · costo final total USD …" y, por actor, cuántos resultados trajo, los segundos, el costo, los cobros, la entrada que se armó y el primer resultado crudo.

### Costos ML

"Costos de vender en Mercado Libre". Pestañas:
- **Cambios**: lo que Mercado Libre cambió desde la primera lectura (28/09/26), agrupado por día: **Qué**, **Detalle**, **Antes**, **Ahora** (hasta los últimos 300).
- **Comisiones (N)**: buscador de categoría + **Buscar**; por cada categoría donde tenés publicaciones activas (las que más tienen, arriba): **Publ.**, **Clásica**, **Clásica interés bajo**, **Premium 3x**, **Premium (6)**, **Premium 9x**, **Premium 12x**, **Desde** (y cuántos cambios tuvo).
- **Cargo fijo (N)**: grilla de precios de venta (de $1.000 a $40.000) por peso del paquete (de 0,3 a 30 kg), más la columna **Sin peso**.
- **Envío gratis (vendedor) (N)**: dos grillas, **Colecta / punto de despacho** y **Full**, de peso (0,3 a 70 kg) por precio (de $33.000 a $500.000).
- **Corridas (N)**: botón **Correr ahora** y la tabla **Fecha**, **Empezó**, **Terminó**, **Tus categorías**, **Cambios guardados**, **Sin respuesta**, **Partes** (Referencias, Cargo fijo, Envío gratis, Comisiones; en verde las terminadas).

### Ventas ML por categoría

- **Últimos N días** + **Ver**.
- Camino **Todas › categoría › …** (cada parte se toca).
- Tabla **Categoría** (con "(última)" si no tiene más niveles), **Monto**, **Publicaciones**, **Unidades** y la fila **Total**. En el último nivel, la tabla pasa a ser de publicaciones: **Publicación** (con su código), **Monto**, **Unidades**.
- Al pie: "N ventas pagadas en D días. Monto = precio de venta × unidades, antes de comisiones y envío."

### China — pruebas

- **Qué buscar (en castellano)**.
- **Inglés, para Alibaba** y **Chino, para 1688** ("se completa solo; tocalo sólo para corregir").
- **Foto**: pegar el link de una imagen o elegir un archivo (muestra la miniatura).
- **Actores**: once buscadores (AliExpress, 1688 y Alibaba por texto; dos de 1688 por foto), con su plataforma y tipo. Los de texto vienen tildados; los de foto, no. Campo **Otro actor (usuario/nombre, opcional)**.
- Botones: **Traducir con Claude**, **Probar la foto (no gasta)** y **Correr en Apify** ("Corriendo… (hasta 4 min)").
- Resultado: "Prueba #N · fecha · EN "…" · ZH "…" (claude / a mano) · costo final total USD …" y, por actor, cuántos resultados trajo, plataforma, "por texto"/"por foto", segundos y costo; adentro, una tabla con foto, título traducido al castellano (y el original abajo), **Precio** y **Pedido mín.**, más la entrada armada y el primer resultado crudo.

### Piloto

**Lista** ([/admin/piloto](/admin/piloto)):
- Tabla **Pilotos**: **#** (enlace), **Categorías**, **Estado** (Mercado Libre / Caja, China y juez / Terminado), **Productos** (listos/total), **Costo** (US$ de Apify + IA).
- **Nuevo piloto**: el explorador para elegir categorías y los campos:
  - *Mercado Libre*: **Precio de venta desde ($)**, **Precio de venta hasta ($)**, **Productos por categoría**, **Publicaciones a leer del listado de cada categoría**, **Ventas mínimas en Mercado Libre**.
  - **Tipo de transporte**: **Marítimo**, **Aéreo**, **Courier (próximamente)** (deshabilitado).
  - **Marítimo: flete por m³ (US$)**, **Aéreo: flete por kilo (US$)**, **Dólar ($)**, **Entra seguro (% del precio)**, **Zona gris (% del precio)**.
  - *China y juez*: **Yuanes por dólar**, **Pedido mínimo razonable (unidades)**, **Tope de gasto de Apify (US$)**.
  - Cajas **Doble modelo** (la segunda mirada la hace Anthropic) y **Procesar solo, sin dejar la página abierta (avanza cada minuto)**.
  - Botón **Crear piloto**.

**Un piloto** (/admin/piloto/número):
- Encabezado "Piloto #N" con los parámetros, el **Avance** (categorías de Mercado Libre hechas; productos en caja, China, juez, fichas y listos), la **IA** usada, y el **Costo** (Apify con su tope, IA con los tokens, y el total).
- Botones **Ver el listado en Mercado Libre ↗** (el listado exacto que se usó).
- **Procesar** (o **Detener (termina la tanda en curso)** mientras corre) y un registro de lo que hizo cada tanda. Si es automático: "Se procesa solo cada minuto, aunque cierres la página."
- Pestaña **Mercado Libre**: por categoría, la dirección del listado, qué trajo cada scraper y su costo, cuántas publicaciones tienen el dato de vendidos, las que no se buscaron en China y por qué, y los primeros 10 del listado con la marca **elegido**.
- Pestaña **Revisión**: interruptores **Sólo campeones** y **Ocultar los descartados por flete**; una tarjeta por producto con la publicación de Mercado Libre (precio, caja, flete y franja), el **cuadro de costo** (con **Ver la cuenta** y la NCM con su **lápiz** ✏️), el **Candidato del juez** (sitio, proveedor, precio del pedido mínimo y tramos, variante a pedir), los avisos, **Ver los N resultados de China con el veredicto**, y al final **¿El juez acertó?** **Acertó** / **No acertó** + **Comentario** + **Guardar comentario**.
- Pestaña **Validación**: **Resumen** (cuántos entran seguro, en zona gris, descartados por flete, sin caja; cuántos revisaste y en cuántos acertó el juez) y la tabla **Producto**, **Franja**, **Venta**, **FOB candidato**, **Flete**, **Flete / FOB**, **Veces**, **Juez** (zona gris remarcada).

### Diagnóstico

"Diagnóstico de la base": una tabla con la forma de la conexión (esquema, host, puerto, usuario, contraseña —sólo cuántos caracteres tiene, nunca la contraseña—, base), cada dato con ✓ o ✗ y una nota si algo está mal, y abajo el resultado de una conexión de prueba ("Conecta bien (usuario …)." o el error exacto).

## Cómo se hace

### Bitácora: anotar algo
1. Abrí **＋ Anotar una entrada**.
2. Elegí el **Tipo**, escribí el **Título** y, si hace falta, **Detalle**, **Por qué así…** y **Huecos que deja**.
3. Apretá **Anotar**. Aparece "Listo, quedó anotada." Si falta el título: "Falta el título, o el tipo no es de los de la lista…".

### Bitácora: ponerse al día
1. Apretá **Para vos (N)**: quedan sólo las entradas de otros que todavía no marcaste.
2. En cada una, **✓ Visto** (o respondela: contestar también la da por vista). Si pide lectura, **✓ La leí**.
3. Cuando no queda nada: "Estás al día: no quedó nada sin leer."

### Bitácora: responder en un hilo
1. En la entrada, abrí **↩ Responder**.
2. Elegí **Qué es**, escribí **En una línea** y, si querés, el detalle.
3. Apretá **Responder**. La respuesta queda colgada del hilo.

### Bitácora: cerrar un pendiente
1. En la columna de huecos, cambiá **Estado** a Resuelto o Descartado.
2. Opcional: **✎ Cómo se resolvió**.
3. Apretá **Guardar**.

### Para probar: marcar una prueba
1. Abrí el hilo (por defecto se ven los "Por probar", lo último que se movió arriba).
2. Probá lo que dice **Qué probar y dónde**.
3. Apretá **✓ Anda**; o **✗ Falló** / **👀 Observado**, escribí qué pasó y **Guardar**. Sin texto: "Para marcar #N hay que escribir qué pasó."
4. Para reabrirlo: **↩ Volver a probar**.

### Conectar la cuenta de Mercado Libre
1. Entrá a **Mercado Libre**.
2. Verificá que la dirección de redirección que muestra la pantalla esté cargada igual en la aplicación de Mercado Libre.
3. Apretá **Conectar con Mercado Libre** (o **Reconectar**), aprobá en Mercado Libre y volvés con "Cuenta conectada."
4. Errores: "La vuelta de Mercado Libre no coincidió con el pedido…", "Se perdió la sesión en el medio…", "Mercado Libre no aceptó el código." → conectar de nuevo.

### Leer publicaciones ajenas con Apify
1. En **Mercado Libre → 5. Leer la página con Apify**, pegá hasta 5 links o códigos.
2. Apretá **Leer** y esperá uno o dos minutos.
3. Recargar la página no vuelve a correr ni a cobrar.

### Comparar scrapers de Mercado Libre
1. **Probar con Apify →**, escribí la búsqueda, tildá los actores y apretá **Correr**.
2. Si ya hay una corrida en marcha de hace menos de 5 minutos, te lleva a verla en lugar de arrancar otra.

### Actualizar los costos de Mercado Libre
1. **Costos ML → Corridas → Correr ahora**.
2. Si hoy ya corrió, sigue lo que falte; lo que no entra sigue solo.

### Ver ventas por categoría
1. **Ventas ML por categoría**, poné los días y apretá **Ver**.
2. Tocá una categoría para bajar un nivel; en la última aparecen las publicaciones.

### Probar una búsqueda en China
1. Escribí **Qué buscar (en castellano)**.
2. Opcional: **Traducir con Claude** para ver y corregir el inglés y el chino antes de gastar.
3. Para búsqueda por foto: pegá el link o elegí un archivo, apretá **Probar la foto (no gasta)** y tildá los actores de foto.
4. Apretá **Correr en Apify**. Los títulos se traducen al castellano la primera vez que se mira la prueba.

### Crear y correr un piloto
1. En **Piloto → Nuevo piloto**, elegí una o más categorías (hasta 20).
2. Revisá los parámetros (vienen los del último piloto) y elegí **Marítimo** o **Aéreo**.
3. Tildá **Procesar solo…** si no vas a dejar la página abierta.
4. Apretá **Crear piloto**. Errores: "Elegí al menos una categoría." o "Los yuanes por dólar tienen que estar entre 3 y 15 (hoy rondan 7,1). ¿Pusiste 71 en vez de 7,1?".
5. En la pantalla del piloto, apretá **Procesar** (si no es automático). Trabaja por tandas mientras la página esté abierta; si la cerrás, retoma donde quedó.

### Revisar los resultados de un piloto
1. Pestaña **Revisión**: mirá cada producto, su candidato y el cuadro de costo.
2. Marcá **Acertó** o **No acertó**, dejá un comentario y **Guardar comentario**.
3. Si la NCM está mal, tocá el lápiz ✏️, escribí la correcta (al menos 8 dígitos, ej. 3926.90.90) y **Guardar**.
4. Pestaña **Validación** para ver el resumen y la cuenta gruesa ("Veces").

### Revisar la conexión a la base
1. Entrá a **Diagnóstico**. Si algo de la base falla, es lo primero que hay que mirar.

## Criterios y reglas

### Acceso
Estas herramientas no son funciones con permiso en el rol: las abre sólo la dirección de mail del dueño de Laucen. Si esa lista no está cargada, no entra nadie (falla cerrado).

### Bitácora
- Fer escribe siempre como **fer**; el autor no se elige.
- **Un tema = un hilo**: la entrada raíz y sus respuestas, colgadas debajo en orden de número, sin importar cuántos niveles de respuesta haya.
- **Para vos** = entradas de otros autores que todavía no marcaste como vistas. Responder una entrada también la marca vista.
- La confirmación de lectura dice qué autores activos (distintos del que la escribió) todavía no la confirmaron.
- Se muestran las últimas 60 entradas **no archivadas**; con **Ver archivadas**, hasta 300 incluyendo las archivadas. Lo archivado ya está resumido en un hilo "Resumen".
- Un pendiente que pasa a Resuelto o Descartado guarda quién y cuándo; si vuelve a Abierto, eso se borra.

### Para probar
- Orden: por la última actividad del hilo (la fila o su última vuelta), lo más reciente arriba. Se cargan hasta 300 filas.
- Marcar **Anda** pasa el estado a "Anda" y agrega la vuelta "Anda". **Falló** y **Observado** exigen texto y pasan a "Con fallas" / "Observado". **Nota** exige texto y no cambia el estado. **Volver a probar** lo pasa a "Por probar" con la nota "Vuelve a por probar." si no escribiste otra.
- "Observado" no es una falla: un detalle chico; no cuenta entre lo que falló.
- El arreglo de algo que falló no es una fila nueva: es una vuelta del mismo número (1a, 1b…).
- Sólo se pueden editar o borrar las vueltas y los hilos escritos por Fer.

### Mercado Libre y Apify
- La conexión guarda la llave de Mercado Libre de la organización; el sistema la renueva sola. Esta pantalla sólo **lee** de Mercado Libre: no cambia nada en las publicaciones.
- **Probar una búsqueda** y **Seguimiento de competencia** corren al abrir la página con esos datos (son consultas gratuitas a la API) y cada corrida queda guardada.
- **Leer la página con Apify** (pago) corre sólo con el botón, guarda el resultado y vuelve a la pantalla con él: recargar no repite ni cobra.
- El costo final de Apify se asienta un rato después de terminar; la tabla lo relee (las últimas 8 corridas).
- Banco de Apify: 20 resultados por actor, tope USD 0,25 por actor; no arranca una corrida si hay otra de hace menos de 5 minutos.

### Costos ML
- Todos los días a las **6:30** (hora argentina) se le pregunta a la API de Mercado Libre, con la cuenta de Fer, cuánto cuesta vender, y se guarda **sólo lo que cambió**, con la fecha desde la que vale.
- La corrida va en partes: Referencias, Cargo fijo, Envío gratis y Comisiones. Si no termina en un turno, la base la sigue cada 5 minutos hasta completarla.
- **Comisiones**: sólo de las categorías donde Fer tiene publicaciones activas. El % no depende del precio. Las columnas de cuotas (interés bajo, 3x, 9x, 12x) muestran el total: Clásica + el cargo de esa opción de cuotas.
- **Cargo fijo**: por unidad vendida en publicación clásica, además del %; se cobra debajo del precio de envío gratis; depende del precio y, si se informa, del peso.
- **Envío gratis**: lo que paga el vendedor, obligatorio desde $ 33.000, igual a todo el país, ya con la bonificación de MercadoLíder. Con caja voluminosa, Mercado Libre cobra por peso volumétrico (largo × ancho × alto ÷ 4.000).
- "Cambios guardados": filas nuevas porque algo cambió (la primera vez, todo). "Sin respuesta": consultas que Mercado Libre no contestó; queda el último valor conocido.

### Ventas ML por categoría
- Se lee **en vivo** de Mercado Libre, con la cuenta conectada: sólo órdenes **pagadas** de los últimos N días (por defecto 90, máximo 730), hasta 10.000 órdenes.
- **Monto** = precio de venta × unidades, antes de comisiones y envío. **Publicaciones** = cuántas publicaciones distintas vendieron. Ordenado por monto, de mayor a menor.
- Cada publicación se ubica en la rama de categorías de Mercado Libre de su artículo.

### China — pruebas
- A cada sitio se le busca en su idioma: **1688** en chino (si no hay chino, en inglés o castellano); **Alibaba** y **AliExpress** en inglés (si no hay, en castellano). AliExpress se consulta para Argentina y en dólares.
- Si dejás vacíos el inglés o el chino, al correr los traduce Claude; lo que escribas a mano se respeta ("a mano").
- 20 resultados por actor, tope USD 0,25 por actor. No arranca una corrida si hay otra de hace menos de 5 minutos. Recargar no vuelve a correr.
- La foto subida se achica a 1.600 px en JPG antes de enviarla. Un link de foto de Mercado Libre en formato .webp se cambia a .jpg (los buscadores de China no siempre aceptan .webp). **Probar la foto** verifica que el link se pueda bajar, sin gastar.
- Un actor escrito a mano se clasifica por su nombre: si dice "alibaba" es de Alibaba; si dice "image", "photo" o "foto", es por foto; si no, se toma como 1688 por texto.

### Piloto
**Cómo avanza.** El trabajo va por tandas (cada una, hasta unos 4 minutos y medio) y queda todo guardado entre tanda y tanda. Hay un candado: si otra tanda empezó hace menos de 5 minutos, la nueva espera. **Procesar** repite tandas mientras la página esté abierta; si una tanda está ocupada o falla, espera 20 segundos; con 3 tandas seguidas con problemas se frena ("Avisale a Code"). Con **Procesar solo**, la base lo avanza cada minuto aunque cierres la página.

**Etapas, en orden:**
1. **Mercado Libre** (de a 3 categorías): lee con Apify el listado de cada categoría, en el rango de precio, sólo con envío local y sin publicidad. Saca lo que no se importa (semillas, plantines, plantas vivas, fertilizantes, agroquímicos, alimentos, bebidas, sustratos, medicamentos, productos veterinarios, suplementos) y lo que vendió menos que **Ventas mínimas** (por defecto 50; si la publicación no trae el dato de ventas, entra). Toma los primeros **Productos por categoría** (por defecto 3).
2. **Caja y flete**: primero el peso y las medidas que da Mercado Libre; si faltan, se buscan en la web con IA. Con la caja se calcula el **flete aéreo** = el mayor entre el peso real y el volumétrico (cm³ ÷ 6.000) × **flete por kilo**, y se expresa como **% del precio de venta en dólares** (precio ÷ dólar).
3. **Franja**:
   - **Marítimo**: si el flete aéreo es ≥ "Entra seguro" (por defecto 20 %) → **entra seguro** (el avión sale caro); entre "Zona gris" (15 %) y el seguro → **zona gris**; por debajo de la zona gris → **fuera** (conviene traerlo en avión).
   - **Aéreo**: al revés: ≤ seguro → seguro; ≤ gris → gris; más caro → fuera.
   - Lo que queda **fuera** no se busca en China ni pasa por el juez. Sin caja estimada, se busca igual.
4. **China**: busca en Alibaba (los pilotos nuevos), de a 4 productos, respetando el **Tope de gasto de Apify** de todo el piloto (por defecto US$ 10).
5. **Juez**: la IA (Gemini en los pilotos nuevos) marca cada candidato como "equiparable", "dudoso" o "no es", y elige uno. Si ninguno es el mismo producto, **se replantea la búsqueda una vez** con otras palabras.
6. **Fichas**: de los "equiparables" (hasta 5, los más baratos según la búsqueda) se lee la publicación por dentro (precios por cantidad, variantes y caja). Una segunda mirada confirma si es el mismo producto (con **Doble modelo**, la hace Anthropic). Se descartan los de pedido mínimo mayor al **Pedido mínimo razonable** (por defecto 500). Gana el más barato, prefiriendo los que tienen precio claro (precios por cantidad, precio de la variante, precio estimado por la posición de la variante o precio por medida). El costo = unidades necesarias × precio + accesorios que falten. Si ninguno pasa la segunda mirada, se replantea la búsqueda una vez.
7. **NCM y costo**: la NCM se clasifica **una sola vez por tipo de mercadería**; si Fer la corrige con el lápiz, queda la de Fer para todo ese tipo de mercadería de ahí en adelante.

**Control de coherencia.** Si el costo puesto en Argentina contra la venta en Mercado Libre da **menos de 50 % sobre el costo**, se considera que se comparó otro producto: se replantea la búsqueda una vez; si la nueva no encuentra otro, queda el anterior marcado "⚠ Comparación dudosa, revisar".

**La cuenta del costo** (en dólares, por unidad del producto de Mercado Libre):
- **FOB**: el costo de armarlo en China.
- **Seguro**: 1 % del FOB.
- **Flete**: marítimo = volumen de la caja (m³) × flete por m³ × unidades; aéreo = kg cobrables (real o volumétrico ÷ 6.000, el mayor) × flete por kilo × unidades. Manda la caja de la publicación de China (por las unidades necesarias); si no hay, la de Mercado Libre.
- **CIF** = FOB + seguro + flete.
- **Derechos** = arancel de la NCM × CIF. **Tasa de estadística** = % de estadística × CIF.
- **Base imponible** = CIF + derechos + estadística. **IVA** = % de IVA × base (si no hay despachos de esa NCM para deducirlo, se asume 21 %).
- **Despachante, depósito y otros** = 3 % del CIF.
- **Costo puesto en Argentina** = base + IVA + gastos.
- **Venta** = precio de Mercado Libre ÷ dólar. **Comisión** (publicación clásica) y **envío Full** se le preguntan en el momento a Mercado Libre con la caja real.
- **Neto de ML** = venta − comisión − envío.
- Porcentajes: bruta sobre el costo y sobre la venta; neto sobre el costo y **neto sobre la venta** (el número principal). Colores del neto sobre la venta: 30 % o más, verde fuerte; 20 % o más, verde; 10 % o más, ámbar; 5 % o más, naranja; menos de 5 %, rojo.
- Si la publicación de China tiene precios por volumen, el cuadro agrega la columna **Por volumen** con el precio del último tramo.
- Avisos: si la NCM alternativa tiene otro arancel, o si el arancel varía según la apertura, se marca "⚠ Revisar la NCM".

**Validación.** "Veces" = precio de venta ÷ (FOB del candidato + flete). Es una cuenta gruesa: no incluye derechos, impuestos, comisión del agente ni los costos de vender en Mercado Libre. "Flete / FOB" = flete ÷ FOB.

**Otras reglas del formulario.** Hasta 20 categorías por piloto. Los yuanes por dólar tienen que estar entre 3 y 15. Los valores se precargan con los del último piloto (un yuan fuera de rango no se precarga). Por defecto: 3 productos por categoría, 50 publicaciones del listado, 50 ventas mínimas, marítimo, flete US$ 140/m³ y US$ 8/kg, dólar $ 1.500, seguro 20 %, gris 15 %, 7,1 yuanes por dólar, pedido mínimo 500, tope de Apify US$ 10. Courier figura como próximamente.

### Diagnóstico
Muestra la forma de la conexión y prueba conectarse. Nunca muestra la contraseña, sólo cuántos caracteres tiene. La conexión tiene que ir por el "pooler" de Supabase (la conexión directa no llega desde el hosting).

## Preguntas frecuentes

**¿Por qué no veo la sección Coordinación en el menú?**
Es sólo para el dueño de Laucen (por su mail). No se habilita con roles ni permisos.

**¿Qué diferencia hay entre "✓ Visto" y "✓ La leí"?**
"Visto" saca la entrada de "Para vos". "La leí" es la confirmación de lectura que piden algunas entradas importantes, para que las otras partes sepan que la leíste.

**Marqué "Falló" y no pasó nada.**
Falló y Observado necesitan que escribas qué pasó; sin texto aparece "Para marcar #N hay que escribir qué pasó."

**¿Desde acá se cambia algo en Mercado Libre?**
No. Estas herramientas sólo leen de Mercado Libre.

**¿Recargar la página vuelve a cobrar Apify?**
No. Las corridas pagas (leer páginas, banco de Apify, China, piloto) se disparan sólo con su botón.

**¿Cada cuánto se actualizan los costos de Mercado Libre?**
Todos los días a las 6:30; con **Correr ahora** se fuerza.

**¿El monto de Ventas ML por categoría es lo que me queda?**
No: es precio × unidades, antes de comisiones y envío.

**¿Por qué un producto del piloto dice "descartado por flete"?**
Porque el flete aéreo, como % del precio, quedó fuera de la franja del modo elegido: en marítimo, conviene traerlo en avión; en aéreo, el avión sale demasiado caro. No se buscó en China.

**¿Puedo cerrar la página mientras procesa un piloto?**
Si lo creaste con **Procesar solo…**, sí. Si no, se frena al cerrar y retoma donde quedó cuando volvés a apretar **Procesar**.

**¿Dónde está la búsqueda en China definitiva?**
Todavía no existe: figura como próximamente en el menú Sourcing. El Piloto y China — pruebas son los ensayos previos.

## Relacionado

- [Bitácora](/admin/bitacora)
- [Para probar](/admin/para-probar)
- [Mercado Libre](/admin/meli) y [Apify](/admin/meli/apify)
- [Costos ML](/admin/costos-ml)
- [Ventas ML por categoría](/admin/ventas-ml)
- [China — pruebas](/admin/china)
- [Piloto](/admin/piloto)
- [Diagnóstico](/admin/diagnostico)
- [Canales](/config/canales): conexión de Mercado Libre para el sistema de gestión.
- [Radar](/radar) e [Importaciones ARCA](/importaciones)

## Limpieza de datos

Pantalla [Limpieza de datos](/admin/limpieza) (menú **Coordinación**). Tareas de una sola vez. Las tarjetas que ya se usaron (pruebas, categorías, familias y basura de Virtual Seller, publicaciones fantasma, recuperar pausadas, productos sin publicación) se sacaron el 7/10; quedan dos:

**Para revisar el lunes: ajustes de la carga de stock.** El botón **Ver ajustes a revisar** abre [Ajustes de la carga de stock](/admin/limpieza/ajustes). El archivo de stock de Virtual Seller del 3/10 no traía ubicaciones: para llevar cada producto a su cantidad, la carga sacó unidades primero de GENERAL y de A UBICAR y, cuando no alcanzaba, de ubicaciones reales de la estantería. La pantalla lista esos renglones (SKU, producto, ubicación, cuántas había, cuántas se sacaron y cuántas quedan) para cotejarlos con las estanterías. No cambia nada: si una unidad estaba en otra ubicación, se corrige con un movimiento de stock.

**Descripciones de Mercado Libre que faltan en los productos.** La descripción larga de una publicación no viene en la copia que Laucen guarda de cada publicación de Mercado Libre: se pide aparte. **Traer descripciones de ML** (de fondo) toma cada producto **activo** sin descripción que tenga publicaciones vinculadas y le pone la descripción de una de ellas (primero las comunes, después las de catálogo; la primera que tenga texto). Sólo lee de Mercado Libre y nunca pisa una descripción ya cargada. La tarjeta dice cuántos productos hay así; el cartel al terminar, cuántas se trajeron y cuántos no tienen descripción en ninguna publicación.

**Notebooks: eliminar todas salvo las de la lista.** Se conservan sólo los SKU 81VS0001US, S532FA-SB77, F412DA-NH77, F412DA-NH77-1 (la de 12 GB, que en Laucen es F412DA-NH77-12GB), 15-EF0022NR, 14-DK1022WM, 15-DK0056WM, G3-3500, 15-DK0056WM-1, G3-3500-1 y la Lenovo 3 81WE011UUS (se vendió el 5/10 y queda activa en Laucen). Es notebook la de la categoría de Mercado Libre Notebooks o con título que empieza con "Notebook". El SKU se compara sin mayúsculas ni el "DE-" de las cuentas DEIROLAB, y vale cualquiera de la publicación (el suyo, el de sus variaciones o el del producto de Laucen al que está vinculada).

1. **En Mercado Libre**, una fila por cuenta con lo que Laucen tiene guardado (cuántas para eliminar, cuántas de la lista y, en rojo, las activas que no son de la lista).
   - **Revisar en ML (sólo lectura)**, primero: lee la cuenta entera en Mercado Libre por la API, de fondo, y deja en la fila la última revisión con su fecha: cuántas publicaciones tiene la cuenta, cuántas notebooks se eliminarían (por estado), cuántas son de la lista, cuántas activas quedan fuera de la lista, y **"Ver el detalle"**: cada publicación con su número (abre Mercado Libre ↗), estado, SKU, título y qué pasaría con ella. **No cambia nada** ni en Mercado Libre ni en Laucen.
   - **Preparar eliminación en ML** lee la cuenta entera en Mercado Libre, de fondo (la pantalla queda libre y al terminar aparece el cartel), y deja preparado **un lote** que finaliza y elimina cada notebook que no es de la lista, en cualquier estado. **Las activas que no son de la lista no se tocan**: el cartel las nombra. Las ya eliminadas en ML se saltean y las que ya tienen pedida su eliminación no se repiten. **No sale nada** hasta que se revisa el lote en la [Cola de Mercado Libre](/config/canales/cola) y se aprieta **Mandar a Mercado Libre**; eliminar no tiene vuelta atrás. Cada renglón del lote dice el estado y el SKU (o "sin SKU"). Cuando Mercado Libre la elimina, la publicación desaparece también de Laucen. Si no alcanza el tiempo, el cartel dice cuántas quedan y se aprieta de nuevo (se suma al mismo lote).
2. **En Laucen**: la lista de notebooks que no son de la lista, con su stock y qué va a pasar con cada una. **Limpiar N notebooks de Laucen** (pregunta **¿Seguro? Sí / No**) borra las que no tienen historia y **archiva** las que tienen ventas, picking, recepciones, compras o son parte de un kit, para no romper esa historia.

## Creaciones en ML

Pantalla [Creaciones en ML](/admin/creaciones) (menú **Coordinación**), lo contrario de Limpieza: publicaciones que se crean en Mercado Libre por tandas. Muestra antes todo lo que se va a crear y el botón deja los lotes en la [Cola de Mercado Libre](/config/canales/cola) esperando el clic en «Mandar a Mercado Libre». Nada sale solo.

**Prueba de planes de cuotas en cada cuenta.** Mercado Libre no le muestra al comprador las cuotas del nombre del plan y depende del vendedor: en .BAIRES la Premium 3x se ve «Mismo precio en 6 cuotas» y la Premium 12x «18 cuotas». Para saber qué muestra cada cuenta, en cada una de las otras cuatro se publica una notebook distinta con los tres planes que más convienen (Clásica, Premium 3x y Premium 12x):

- ML PUNTO: F412DA-NH77 (ya tiene la Clásica: se crean la 3x y la 12x).
- DEIROLAB SA: S532FA-SB77.
- DEIROLAB SAS: 15-EF0022NR.
- TIENDAVIRTUAL S: G3-3500.

La tabla muestra, por cuenta y plan: SKU, plan, precio, comisión, stock disponible para la cuenta, de qué publicación se copia y si ya existe o se crea.

Criterios:
- Cada alta copia nuestra publicación común (no de catálogo) de .BAIRES del mismo SKU: título, fotos, características, garantía y descripción. Sale a precio normal, sin campaña ni tachado, con el stock disponible para esa cuenta.
- Precio de la Clásica: el piso del esquema de notebooks (competencia × 90 % en las Asus, × 80 % en la HP; la G3, al precio que tiene hoy en .BAIRES). Precio de cada plan: deja, después de su comisión, lo mismo que la Clásica, más 2 % en la 3x y 4 % en la 12x.
- Las de cuotas se cuelgan del mismo producto de Mercado Libre que la Clásica (comparten el stock): la Clásica y sus planes van juntos en un mismo pedido de la cola, uno detrás del otro.
- El botón **Preparar N publicaciones** corre de fondo: comprueba cada Clásica con Mercado Libre (no publica nada) y arma un lote por cuenta. Lo que Mercado Libre rechaza no entra y lo dice. Si ya hay un lote de esta prueba esperando en la cola, esa cuenta no se vuelve a preparar.
- Abajo, cómo quedó cada lote en la cola: preparado, en la cola, creada (con los números de las publicaciones nuevas) o con error (con el motivo).
- Después de mandarlas, mirá en cada publicación cuántas cuotas muestra Mercado Libre y anotalo en [Precios en Mercado Libre](/catalogo/precios-ml) (cuotas que ve el comprador).

