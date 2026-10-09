---
titulo: Precios en Mercado Libre
menu: Catálogo › Precios en Mercado Libre
ruta: /catalogo/precios-ml
rutas: /catalogo/precios-ml
permiso: precios_ml_ver
resumen: El esquema de precios de cada cuenta de Mercado Libre: descuento que ve el comprador, quién gana cada precio, excepciones, descuento por volumen y alertas; de la Clásica sale todo lo demás y los cambios salen a ML sólo con un clic.
---

## Para qué sirve

Es donde se definen **las reglas** con las que Laucen calcula el precio de cada publicación en Mercado Libre, cuenta por cuenta. La idea central:

- **La Clásica es el único precio que se pone a mano** . Es el precio de la variación en la lista de precios del canal (la lista «Clásicas»): lo que paga el comprador en la Clásica de la cuenta que gana. Se carga en [Listas de precios](/catalogo/precios) o en la ficha del producto.
- **Todo lo demás sale solo de ahí:** el precio tachado (Clásica ÷ (1 − descuento que ve el comprador)), la Clásica de las cuentas que no ganan, el precio de cada publicación de planes de cuotas (Premium común, Premium 3x, Premium 9x y Premium 12x), cuál de ellas va "destacada" al precio para ganar, y el descuento por volumen.
- Las reglas de esta pantalla (descuento que ve el comprador, quién gana y descuento por volumen) valen **por cuenta (canal)** y, adentro de la cuenta, **general → categoría → producto**: gana lo más específico.
- **Quién gana** entre tus cuentas se decide, para todas las cuentas a la vez, en la columna «Quién gana» de cada grupo de [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas). Acá, en «Excepciones», sólo se fuerza algo distinto para una categoría o un producto.
- **Qué planes de cuotas lleva cada producto**, cuántas cuotas ve el comprador y cuánto más tiene que dejar cada plan se deciden para todas las cuentas a la vez, por grupo de categorías, en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas).

Desde acá **no sale nada** a Mercado Libre. Los precios que resultan se miran en la [Vista previa](/catalogo/precios-ml/vista-previa), y de ahí se preparan lotes que esperan el clic en «Mandar a Mercado Libre» en la [Cola de Mercado Libre](/config/canales/cola). La única excepción es si se prende el interruptor «Sincronizar precios» de la cuenta (ver más abajo).

## Cómo se llega

- Menú **Catálogo › Precios en Mercado Libre**.
- Desde la [Vista previa](/catalogo/precios-ml/vista-previa), con las pestañas de arriba.
- Hace falta el permiso «Precios en Mercado Libre».
- Si todavía no hay ningún canal de Mercado Libre, la pantalla avisa que hay que crearlo en [Canales](/config/canales) y conectarle la cuenta.

## Qué hay en la pantalla

**Arriba de todo:**
- **Cuenta**: desplegable para elegir la cuenta (canal) de Mercado Libre. Todo lo que se ve y se graba es de esa cuenta.
- Al lado, un texto: «Clásica: lista …» (qué lista de precios da la Clásica de esa cuenta; si dice «sin lista», hay que cargarla en [Canales](/config/canales)) y si la cuenta «sincroniza precios solo» o «los cambios esperan tu clic».

**Pestañas:** «Descuento», «Excepciones (N)», «Descuento por volumen (N)», «Alertas (N)» y «Vista previa» (esta última lleva a la [Vista previa](/catalogo/precios-ml/vista-previa)).

### Pestaña «Descuento»

Arriba a la derecha: el botón **«Vista previa»** y el **lápiz** para editar. En edición quedan **«Grabar»** y **«Cancelar»** en el mismo lugar.

Caja **«Descuento que ve el comprador (general de la cuenta)»**:
- **Descuento que ve el comprador %**: el «% OFF» que muestra la publicación en Mercado Libre (por ejemplo 45). Es lo que se decide; el sistema calcula solo cuánto más alto se publica (el tachado) para que, con la campaña bajándola a su precio, se vea ese descuento. 0 = sin descuento; Mercado Libre lo muestra desde 5 %.
- Debajo, un texto: una categoría o un producto puede tener otro descuento en «Excepciones»; qué planes lleva cada producto y **quién gana** entre tus cuentas se configuran para todas las cuentas a la vez en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas).

Caja **«Campaña propia «Promociones Daitom»»**: la campaña del vendedor de esta cuenta. Dice desde y hasta cuándo está vigente, o «Esta cuenta todavía no tiene campaña propia». Botones arriba a la derecha de la caja: **«Crear en esta cuenta»** (o **«Renovar ahora»** si ya tiene) y **«Crear en todas las cuentas»**; los dos preguntan antes y crean la campaña en Mercado Libre con ese clic.
- Para qué sirve: una publicación con descuento (publicada al tachado) que no está en ninguna campaña de Mercado Libre entra a la campaña propia a su precio, así el comprador ve el descuento.
- Cuando Mercado Libre le ofrece una campaña suya que acepta ese precio, sale de la propia y pasa a la de Mercado Libre (las de Mercado Libre la exponen más).
- Las publicaciones entran y salen como cualquier cambio de precio: con «Preparar cambios» en la vista previa, o solas si la cuenta tiene «Sincronizar precios» prendido.
- Dura 30 días. Con «Sincronizar precios» prendido, se renueva sola unos días antes de vencer; si no, se renueva con el botón.

Caja **«Interruptores de la cuenta»** (tres interruptores):
- **«Sincronizar precios: Laucen manda solo los precios a esta cuenta»**. Arranca apagado.
- **«Leer el precio para ganar y las campañas»**. Arranca prendido (es sólo lectura).
- **«Descuento por volumen: un escalón sólo si hay stock para su cantidad»**. Arranca prendido.

### Pestaña «Excepciones»

Excepciones por **categoría** (vale también para sus subcategorías) o por **producto**. Arriba a la derecha: «Descargar Excel» y **«Nueva excepción»**. Buscador por categoría, producto, SKU o número.

Columnas: «Aplica a» (Categoría / Producto), «Categoría o producto» (con enlace), «Descuento» (el descuento que ve el comprador y, si la tiene, «Clásica: gana / no gana, +3 %») y una columna por plan («Premium», «3x», «9x», «12x») con «gana», por ejemplo «no gana: +3 %», o, si está vacío, **lo que hereda y de dónde**: «hereda: 40 % (de la categoría Sensores)». En «¿gana?», vacío muestra lo que le toca y de dónde sale: «hereda: gana» o «hereda: no gana: +3 %», «(de Quién gana del grupo)», o de una categoría si ahí hay algo cargado. El descuento vacío en lo general de la cuenta quiere decir **sin descuento**. Cada fila tiene el **lápiz** (se edita ahí mismo, con «Guardar» y «Cancelar») y el **tacho** (pregunta «¿Borrar? Vuelve a heredar» con Sí / No).

El formulario de excepción tiene: «Aplica a» (una categoría o un producto), «Categoría» (buscador) **o** «o el SKU del producto», «Descuento que ve el comprador %», «Clásica: ¿gana? (si no, +%)» y, por cada plan, «… : ¿gana? (si no, +%)». Todo lo que queda vacío **hereda**.

### Pestaña «Descuento por volumen»

Arriba a la derecha: «Descargar Excel» y **«Nuevo rango»**. Arriba de la tabla, el interruptor «Un escalón sólo si hay stock para su cantidad» y el botón **«Replicar en las demás cuentas»**.

Columnas: «Aplica a» (General / Categoría … / Producto …), «Clásica desde», «Clásica hasta» («sin tope»), «Escalones» (por ejemplo «3+ u. −5 % · 6+ u. −10 %», o «Sin descuento»), lápiz y tacho.

En Mercado Libre se llama «precio por cantidad». Cada escalón sale marcado para el canal Mercado Libre (ML lo exige). Antes de mandarlo, Laucen lee los precios que ya tiene la publicación y nombra el precio base, porque un precio que no se nombra ML lo borra; los escalones viejos se reemplazan por los nuevos.

El formulario: «Aplica a» (Toda la cuenta (general) / Una categoría (excepción) / Un producto (excepción)), «Categoría» o «o el SKU del producto», «Clásica desde», «Clásica hasta», la caja «Sin descuento por volumen» y cinco escalones, cada uno con «Desde u.» y «% off».

### Pestaña «Alertas»

La cuenta de la pestaña suma las tres cajas.

**«Campañas debajo del piso (N)»**: publicaciones que están en una campaña en curso que las deja **más baratas que el piso**. El piso es lo que da el esquema para esa publicación (la Clásica de la cuenta, o el precio de su plan). Columnas: «SKU», «Producto», «Publicación» (con su tipo: Clásica, Premium 3x…), «Campaña» (nombre, y si es **propia** —oferta del día, campaña del vendedor: el precio lo pusiste vos— o **de ML** —«Potencia tus ventas»—), «Con la campaña», «Piso» y «Debajo» (cuánto % abajo).
- En una campaña propia cuenta su precio. En una de ML con descuento compartido cuenta **sólo lo que ponés vos**: precio sin descuento × (1 − tu %). La parte que pone ML no sale de tu bolsillo y no cuenta.
- Botón **«Sacar de la campaña»** en cada fila (pregunta «¿Preparar el lote?» Sí / No) y **«Sacar de todas»** arriba a la derecha de la caja: arman un **lote preparado** en la [cola de Mercado Libre](/config/canales/cola) que la saca de la campaña con tu clic en «Mandar a Mercado Libre». Nada sale solo.
- Por qué pasa: las campañas de ML las arma ML, con el precio que decide ML. Si después de sacarla ML la vuelve a meter, vuelve a aparecer acá.

**«Sin campaña hace más de 24 horas (N)»**: publicaciones que ya están publicadas al precio tachado y hace más de 24 horas no están en ninguna campaña (las que todavía están a su precio normal no aparecen: no dependen de una campaña). Columnas: «SKU», «Producto», «Publicación» (con su plan), «Publicada a», «Sin campaña desde» y «Hace» (en rojo desde los 3 días).
- Siguen publicadas al precio tachado: el sistema **nunca** las baja a la Clásica, porque después de una venta a ese precio Mercado Libre puede no dejar volver a subirlo y se perdería el descuento. Pero así casi no venden.
- El sistema lee cada hora las campañas que ofrece Mercado Libre y, si la cuenta tiene «Sincronizar precios» prendido, mete la publicación sola en la primera campaña que acepte su precio. Si no, prepará los cambios desde la [Vista previa](/catalogo/precios-ml/vista-previa).

**«Destacados que dejaron de ganar (N)»**: lista los **planes destacados que dejaron de ganar** en el recuadro de cuotas de Mercado Libre: «SKU», «Producto», «Plan destacado», «Publicación», «Precio elegido», «Qué pasa» y «Leído». Si no hay ninguno: «Sin alertas: los destacados siguen ganando (o todavía no hay destacados elegidos)». Abajo, un enlace a la vista previa filtrada por los destacados.

## Cómo se hace

### Cambiar el descuento de una cuenta
1. Elegí la **Cuenta** arriba.
2. En la pestaña «Descuento», apretá el **lápiz** (arriba a la derecha).
3. Cambiá «Descuento que ve el comprador %».
4. Apretá **«Grabar»**. Vuelve a la vista con «Grabado.».
5. Mirá el resultado en la [Vista previa](/catalogo/precios-ml/vista-previa) y prepará los cambios.

Errores típicos: «El descuento que ve el comprador tiene que estar entre 0 % y 75 %.», «Mercado Libre muestra el descuento sólo desde 5 %: poné 0 (sin descuento) o 5 % o más.».

Para cambiar quién gana: columna «Quién gana» de cada grupo en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas) (todos los productos del grupo, en todas las cuentas), o una excepción de categoría o producto en «Excepciones».

Para cambiar qué planes se usan, sus cuotas o su % extra: [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas).

### Poner una excepción para una categoría o un producto
1. Pestaña «Excepciones» → **«Nueva excepción»**.
2. En «Aplica a» elegí «Una categoría (y sus subcategorías)» y buscala, o «Un producto» y escribí su SKU.
3. Completá sólo lo que querés cambiar (descuento que ve el comprador, o «¿gana?» de la Clásica o de un plan). Lo vacío sigue heredando.
4. Apretá **«Crear»**.

Para modificarla, el **lápiz** de su fila; para que vuelva a heredar todo, el **tacho**. Errores típicos: «Elegí una categoría.», «Escribí el SKU del producto.», «No hay ningún producto con el SKU …».

### Cargar un descuento por volumen
1. Pestaña «Descuento por volumen» → **«Nuevo rango»**.
2. Elegí a qué aplica (general, una categoría o un producto).
3. Poné el rango de Clásica («Clásica desde» / «Clásica hasta»; hasta vacío = sin tope).
4. Cargá hasta cinco escalones: «Desde u.» (2 o más) y «% off» (más de 0 y hasta 90). O tildá «Sin descuento por volumen» para que esa categoría o producto no tenga descuento.
5. **«Crear»**.

Errores típicos: «Cada escalón lleva una cantidad desde 2 y un % entre 0 y 90.», «Ese rango de precios se pisa con otro del mismo nivel.», «El «hasta» tiene que ser mayor que el «desde».», «Cargá al menos un escalón … o tildá «sin descuento».».

### Copiar el descuento por volumen a las otras cuentas
En «Descuento por volumen», **«Replicar en las demás cuentas»** → confirmar. Copia la tabla entera de esta cuenta (todos los niveles) a cada una de las otras cuentas de Mercado Libre, **reemplazando** la que tenían.

### Prender la sincronización automática
En la pestaña «Descuento», interruptor **«Sincronizar precios…»**. Al prenderlo, Laucen hace una primera pasada **de fondo** (la pantalla queda libre) y, al terminar, el cartel de abajo a la derecha avisa cuántas variaciones revisó y cuántos cambios mandó a la cola. Al apagarlo, deja de mandar solo (lo que ya estaba preparado en lotes sigue esperando el clic).

### Revisar un destacado que dejó de ganar
Pestaña «Alertas» → mirá «Qué pasa» (trae el estado que informa ML y el precio para ganar nuevo) → abrí la vista previa con el enlace de abajo → **«Preparar cambios»** → mandá el lote desde la cola.

## Criterios y reglas

**Sólo publicaciones activas.** Los precios, las campañas, las alertas y las publicaciones de planes que faltan se calculan sólo con las publicaciones activas de cada cuenta. Las pausadas no se muestran ni se tocan.

### 1. De dónde sale la Clásica
- El **precio de lista** de la variación es la **Clásica**; el **tachado = Clásica ÷ (1 − descuento que ve el comprador)**, redondeado a pesos. Sin descuento son el mismo precio. Ejemplo: lista $ 1.256.226 y descuento 45 % → tachado $ 2.284.047.
- La lista es la de la cuenta: la que tiene asignada el canal en [Canales](/config/canales); si el canal no tiene, se usa la lista que se llame «Clásicas» (o «Clásica»).
- Es el precio vigente **hoy** (hora argentina). Si la lista es derivada (otra lista × coeficiente), es el de la lista base por el coeficiente, salvo que tenga un precio propio cargado.
- Si el producto está marcado **en dólares**, los pesos se recalculan **cada día** con el tipo de cambio del día.
- El **descuento %** propio del producto o la familia **no** se aplica en Mercado Libre.
- Si la variación no tiene precio en esa lista, no se calcula nada (aviso «Sin precio en la lista Clásicas: no se calcula nada.»).

### 2. Cómo se hereda una regla
Para cada producto se busca el valor de cada dato por separado, del más específico al más general: **producto → su categoría → la categoría de arriba → … → general de la cuenta**. Se toma el primero que no esté vacío. Así, un producto puede tener su propio «¿gana?» para un plan y heredar todo lo demás.
- **«¿Gana?»**: si todo eso está vacío, decide **«Quién gana» del grupo** del producto en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas) (una cuenta fija o «Rota»), con el % del grupo para las que no ganan. Orden completo: **producto → su categoría → las categorías de arriba → «Quién gana» del grupo**.
- **Descuento**: si todo está vacío, vale 0 % (sin tachado).
- Qué planes se usan, su % extra y las cuotas que ve el comprador no se heredan por cuenta: salen del grupo de categorías del producto en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), igual para todas las cuentas.
- El descuento por volumen se hereda distinto (ver punto 7).

### 3. El tachado
- **El tachado sale de la Clásica de la lista** (tachado = Clásica ÷ (1 − descuento que ve el comprador), redondeado a pesos). Es **uno solo por modelo**: el mismo en todas las cuentas y en todos sus planes.
- La publicación (la Clásica y cada plan de cuotas) se publica **al tachado**, y una campaña de Mercado Libre la baja a su precio: el comprador ve el precio tachado y paga el de esa publicación.
- **Una publicación con descuento que se queda sin campaña sigue al tachado**: el sistema nunca la baja a la Clásica, porque después de una venta a ese precio Mercado Libre puede no dejar volver a subirlo y se perdería el descuento. A las 24 horas sin campaña aparece en la pestaña «Alertas».
- **En campaña, el tachado y el precio van al esquema saliendo y volviendo a entrar**. Lo que paga hoy el comprador se toma del precio de la campaña en curso (no del precio de la publicación). Mercado Libre no deja cambiar el precio de una publicación que está en una campaña: si el esquema da otro tachado u otro precio, la publicación sale de la campaña, cambia su precio publicado y vuelve a entrar al precio nuevo (avisos «En campaña: el tachado pasa de … a …» y «En campaña sube de … a …»). Si la campaña no acepta el precio nuevo, entra a la campaña propia de la cuenta; si no hay, queda afuera al tachado hasta entrar en otra. Una publicación **sin descuento** en el esquema que está en una campaña puesta a mano no se toca: queda al precio de la campaña.
- Mercado Libre pide **al menos 5 % de descuento** para mostrar el tachado: por eso el descuento que ve el comprador es 0 (sin descuento) o 5 % o más. Si en una publicación el precio que paga el comprador queda a menos de 5 % del tachado, la vista previa avisa.
- Con descuento 0 % no hay tachado: la publicación va directamente a la Clásica y sin campaña.

### 4. Las comisiones que usa el cálculo
- Las releva **Costos ML** todos los días (arranca 6:30 de la mañana y sigue en tandas cada 5 minutos hasta terminar), preguntándole a la API de Mercado Libre, **sólo para las categorías donde hay publicaciones activas**. Se guarda sólo lo que cambió.
- Por cada categoría: el % de la Clásica, el % de la Premium común y lo que **suma** cada plan (Premium 3x, 9x y 12x) al % de la Clásica.
- La categoría de cada producto es la de su publicación en ML; si no la tiene, la categoría de ML de su familia (o de una familia de más arriba).
- Si la categoría no está relevada (o le falta algún plan), se usa el **promedio** de las relevadas y la columna «Comisión estimada» de la vista previa queda en «sí». Si Costos ML todavía no corrió nunca, se usan valores de referencia: Clásica 14 %, Premium común 19 %, Premium 3x 17 %, Premium 9x 24 %, Premium 12x 27 %.
- **Sólo se usa el % de comisión.** El cargo fijo por unidad (debajo de $ 33.000) y el costo del envío gratis también los releva Costos ML, pero **no entran** en el cálculo del precio de los planes.

### 5. El precio de cada publicación de planes de cuotas (por coeficiente)
El criterio: **cada plan tiene que dejar, después de su comisión, lo mismo que deja la Clásica, más el % extra del plan** (el «% extra sobre la Clásica» del grupo del producto, en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas)).

**Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + % extra)**, redondeado a pesos enteros.

Paso a paso:
1. Neto de la Clásica = Clásica × (1 − comisión Clásica): lo que queda de vender a Clásica.
2. Se divide por (1 − comisión del plan): el precio que deja ese mismo neto pagando la comisión del plan.
3. Se multiplica por (1 + % extra).

**Quién gana cada plan**: tus cuentas venden los mismos productos; para que no compitan entre ellas, en la Clásica y en cada plan **una sola cuenta tiene el precio más bajo** (gana) y las demás van un % más caras (por ejemplo, **3 %**; «¿Gana?» en la vista previa: «Gana» o «+3 %»). La Clásica de una cuenta que no gana = Clásica de la lista × 1,03; el plan = su precio por coeficiente (calculado con la Clásica de la lista) × 1,03. Quién gana y el % se deciden **por grupo de categorías, para todas las cuentas**, en la columna «Quién gana» de [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas): una cuenta fija o «Rota» (los productos se reparten parejo entre las cuentas que no ganan nada fijo en el grupo; cada producto cae siempre en la misma). Para forzar otra cosa: «Excepciones», para una categoría o un producto (gana lo más específico; se ve «gana» o «no gana: +3 %»).

Un plan **se usa** (queda "habilitado") sólo si tiene «Usar» tildado en el grupo del producto y la Clásica es de **$ 33.000 o más** (desde ahí Mercado Libre da envío gratis; ver [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas)). Si no, su publicación queda con papel «Plan apagado» y **no se toca**.

Si dos planes habilitados se le muestran al comprador con la misma cantidad de cuotas, la vista previa avisa que sobra uno («manda lo que ve el comprador»).

### 6. El plan destacado (precio para ganar)
En las publicaciones de **catálogo**, Mercado Libre informa el **precio para ganar** (el precio al que esa publicación ganaría el recuadro). Laucen lo lee (ver punto 10) y elige, por variación, **un plan destacado**:
- Candidatos: los planes habilitados que ya tienen publicación y precio para ganar leído.
- Para cada uno calcula la **holgura**: (precio para ganar × (1 − comisión del plan)) ÷ (Clásica × (1 − comisión Clásica)) − 1, en %, **menos su % extra**. Si da 0 o más, "cierra": a ese precio deja al menos lo que la Clásica más el % extra.
- Gana el de **mayor holgura**; si empatan, el que el comprador ve con más cuotas. Si ninguno cierra, no hay destacado (aviso «Ningún plan cierra al precio para ganar de ML…») y todos los planes quedan a su precio por coeficiente.
- El destacado se publica así: lo que paga el comprador = **el precio para ganar** (redondeado); el precio de la publicación = el tachado del modelo (sin descuento, el mismo precio); y entra **en las mismas campañas que la Clásica**, para mostrarse con tachado en el recuadro «En cuotas».
- Los **demás planes** van a su precio por coeficiente: con tachado, publicados al tachado del modelo y bajados por campaña a su precio (si el tachado no deja al menos 5 % de descuento, a su precio y sin campaña); sin descuento, a su precio y sin campaña.
- El destacado elegido se graba al preparar los cambios (o en cada pasada automática). Después se verifica cada hora; si deja de ganar queda la alerta (pestaña «Alertas»).

### 7. Descuento por volumen
- Se define **por rango de Clásica** («Clásica desde» incluido, «Clásica hasta» excluido), con hasta **5 escalones**: «desde N unidades, X % menos».
- Herencia: el nivel **más específico que tenga filas manda entero** (producto, si no la categoría más cercana, si no lo general). Si ese nivel tiene «Sin descuento», no hay descuento. Si ese nivel tiene rangos pero **ninguno contiene la Clásica**, tampoco hay descuento (no vuelve a buscar en lo general).
- El % se aplica sobre **lo que paga el comprador en esa publicación** (la Clásica en la Clásica, el precio para ganar en el destacado, el precio del plan en los demás) y se redondea a pesos.
- Con el interruptor «un escalón sólo si hay stock…» prendido, un escalón se manda sólo si el **stock disponible para el canal** alcanza su cantidad.
- Se limpia lo cargado: cantidades desde 2, % mayor que 0 y hasta 90, sin cantidades repetidas, ordenado, máximo 5.
- En ML va como "precio por cantidad" de cada publicación. Si una publicación tenía descuento por volumen y ya no le corresponde, Laucen **no lo saca**: avisa «sacalo a mano en ML».
- Es sólo para Mercado Libre: el de la tienda web va aparte (más adelante).
- **Hoy Mercado Libre sólo acepta precio por cantidad en neumáticos** (contesta "Price per quantity is available only for automotive tires"): en las demás categorías se carga «Sin descuento por volumen».

### 8. Campañas (cómo se logra el tachado)
- Sólo se usan las campañas en las que se elige el precio con descuento (ofertas del día y campañas del vendedor).
- Una campaña sirve si su rango de precio aceptado (mínimo y máximo con descuento, que informa ML) incluye el precio a pagar.
- Para **cambiar el precio** de una publicación que está en campañas, primero **sale** de esas campañas (ML no deja cambiarlo adentro), cambia el precio y **vuelve a entrar** al precio nuevo.
- Si ninguna campaña acepta el precio, avisa: el comprador pagaría el tachado. Si todavía no se leyeron las campañas, idem «hasta que entre en una».
- Ojo: el rango de cada campaña lo calcula ML sobre el precio actual; si el precio cambia mucho, alguna puede rechazar la entrada (queda «Con error» en la cola).

### 9. Publicaciones nuevas de planes que faltan
Si un plan está habilitado para una variación y no tiene publicación, la vista previa lo muestra (papel «Nueva») con el aviso «Falta la publicación de …: se crea con «Publicar en todas las cuentas» (ficha del producto, pestaña Publicaciones)». Desde acá no se crea: una publicación de cuotas es una publicación propia (Premium con la marca del plan) que copia todo de otra, y eso lo hace, para un producto, el botón **Publicar en todas las cuentas** de su ficha (pestaña Publicaciones), que crea en cada cuenta la Clásica y los planes que le tocan. **Las publicaciones nuevas nunca salen solas**: siempre van en lote y esperan el clic.

### 10. Qué lee Laucen de Mercado Libre y cuándo (sólo lectura)
Con «Leer el precio para ganar y las campañas» prendido, en cada barrido de Mercado Libre (cada 30 minutos):
- **Precio para ganar** de las publicaciones de catálogo activas: cada 6 horas; las destacadas, cada hora.
- **Campañas** de cada publicación activa (en las que está y a las que puede entrar, con su rango): cada 12 horas.
- Verifica los destacados y arma las alertas.
- Va despacio (un pedido cada 150 milisegundos por cuenta) para respetar los límites de ML.

### 11. Qué sale a Mercado Libre y cómo
Regla de la casa: **ningún precio sale a Mercado Libre sin un clic**.
- **Camino normal (interruptor apagado):** en la [Vista previa](/catalogo/precios-ml/vista-previa), «Preparar cambios» arma hasta dos **lotes** («Precios y campañas» y «Descuento por volumen»), que quedan «Preparado, falta tu clic» en la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados». Salen recién cuando se aprieta **«Mandar a Mercado Libre»** (o se tiran con «Descartar lote»).
- **Con «Sincronizar precios» prendido** (prenderlo es el clic): Laucen recalcula y manda a la cola **sin esperar**, sólo precios, campañas y volumen (nunca publicaciones nuevas):
  - al prender el interruptor (primera pasada);
  - al grabar en esta pantalla el descuento y quién gana, una excepción, un rango de volumen, o al borrar una excepción;
  - en cada barrido (cada 30 minutos), para las variaciones cuyo precio cambió en alguna lista;
  - en cada barrido, para las publicaciones a las que Mercado Libre les **ofreció una campaña nueva** con precio (una publicación recién creada o una campaña que apareció): así entran sin esperar a la noche. Mercado Libre las ofrece y Laucen las lee cada hora;
  - una **pasada entera por noche** (entre las 2 y las 4, hora argentina), que toma los cambios del tipo de cambio en productos en dólares y del stock en los escalones de volumen.
- Todo pasa por la cola: se manda con ritmo, se reintenta si ML corta o falla, y queda registrado qué se mandó, cuándo y con qué resultado. Un cambio automático que dio error no se vuelve a mandar igual durante 6 horas.
- Se considera que una publicación **cambia de precio** si el precio calculado difiere en $ 1 o más del que tiene en ML.

### 12. Redondeo
Todos los precios (tachado, planes, destacado, escalones de volumen) se redondean a **pesos enteros**.

### Ejemplo numérico completo
Cuenta con descuento que ve el comprador general 10 %; en el grupo del producto, los cuatro planes en uso, con % extra 0 % salvo Premium 12x con 3 %. Categoría con comisiones: Clásica 14 %, Premium 3x 17 %, Premium común 19 %, Premium 9x 24 %, Premium 12x 27 %. Precio del producto en la lista (la Clásica): **$ 100.000** (por encima de la barrera de $ 33.000, así que lleva planes). Stock del canal: 4.

1. **Tachado** = 100.000 ÷ (1 − 0,10) = 111.111,1 → **$ 111.111**. La Clásica se publica a $ 111.111 (el tachado) y entra a campaña a $ 100.000: el comprador ve 10 % OFF, más que el 5 % que pide ML.
2. **Neto de la Clásica** = 100.000 × (1 − 0,14) = $ 86.000.
3. **Premium 3x** = 86.000 ÷ 0,83 = 103.614,5 → **$ 103.614**.
4. **Premium común** = 86.000 ÷ 0,81 = 106.172,8 → **$ 106.173**.
5. **Premium 9x** = 86.000 ÷ 0,76 = 113.157,9 → **$ 113.158**.
6. **Premium 12x** = 86.000 ÷ 0,73 × 1,03 = 121.342,5 → **$ 121.342**.
7. **Destacado:** ML informa precio para ganar $ 108.000 en la Premium común y $ 119.000 en la Premium 12x.
   - Premium común: 108.000 × 0,81 = 87.480; 87.480 ÷ 86.000 − 1 = +1,72 %, menos % extra 0 → cierra.
   - Premium 12x: 119.000 × 0,73 = 86.870; 86.870 ÷ 86.000 − 1 = +1,01 %, menos % extra 3 % = −1,99 % → no cierra.
   - Destacado: **Premium común**, el comprador paga **$ 108.000**; la publicación va al tachado del modelo, **$ 111.111**, y entra a las mismas campañas que la Clásica a $ 108.000. La Premium 3x ($ 103.614) también va a $ 111.111 y por campaña a su precio; la 9x y la 12x ($ 113.158 y $ 121.342) quedan a su precio sin campaña, porque el tachado no les deja el 5 % de descuento.
8. **Volumen** (rango general sin tope: 3+ u. −5 %, 6+ u. −10 %): en la Clásica, 3+ u. a $ 95.000; el escalón de 6 no va porque el stock es 4 (con la regla de stock prendida). En la destacada: 3+ u. a 108.000 × 0,95 = $ 102.600.

## Preguntas frecuentes

**¿Con qué criterio se calcula el precio de las publicaciones de cuotas?**
Para que dejen, después de la comisión de Mercado Libre de su categoría, lo mismo que deja la Clásica más el % extra del plan: Clásica × (1 − comisión Clásica) ÷ (1 − comisión del plan) × (1 + % extra), redondeado a pesos. El % extra se pone en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas). La que queda destacada va al precio para ganar de ML, si ese precio cierra.

**¿Dónde cambio el precio de un producto en Mercado Libre?**
Cambiando su Clásica (el precio en la lista del canal) en [Listas de precios](/catalogo/precios) o en la ficha del producto. Todo lo demás se recalcula solo. Después hay que preparar y mandar los cambios (salvo que la cuenta sincronice sola).

**Cambié una regla y en ML no cambió nada. ¿Por qué?**
Porque con «Sincronizar precios» apagado nada sale solo: andá a la [Vista previa](/catalogo/precios-ml/vista-previa), «Preparar cambios», y en la [Cola de Mercado Libre](/config/canales/cola) apretá «Mandar a Mercado Libre».

**¿Por qué un plan no tiene precio o dice «Plan apagado»?**
Porque en el grupo del producto ese plan no tiene «Usar» tildado, o porque la Clásica está debajo de $ 33.000. Se revisa en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas).

**¿Por qué una publicación con descuento sigue al precio tachado si no está en ninguna campaña?**
Porque el sistema nunca la baja a la Clásica: después de una venta a ese precio Mercado Libre puede no dejar volver a subirlo. Aparece en «Alertas» › «Sin campaña hace más de 24 horas» hasta que entre en una campaña.

**¿Qué pasa si la categoría no tiene la comisión relevada?**
Se usa el promedio de las categorías relevadas y la vista previa lo marca como «Comisión estimada».

**¿El cargo fijo o el envío gratis se suman al precio?**
No. El cálculo usa sólo el % de comisión de cada plan.

**¿Por qué el descuento que ve el comprador tiene que ser 0 o 5 % o más?**
Porque Mercado Libre muestra el precio tachado sólo si el descuento es de al menos 5 %. Con 0 no hay tachado y la publicación va a la Clásica sin campaña.

**¿Una excepción de categoría vale para sus subcategorías?**
Sí. Y una excepción de producto le gana a la de su categoría.

**¿Las cuotas de esta pantalla son las mismas que las de la tienda web?**
No. Éstas son las publicaciones de cuotas de Mercado Libre. Las cuotas de la tienda web se configuran en [Cuotas](/config/cuotas).

**¿Laucen saca solo un descuento por volumen que ya no corresponde?**
No: lo avisa en la vista previa y hay que sacarlo a mano en Mercado Libre.

## Relacionado

- [Vista previa de precios en Mercado Libre](/catalogo/precios-ml/vista-previa)
- [Planes de cuotas](/catalogo/precios-ml/planes-cuotas)
- [Cola de Mercado Libre](/config/canales/cola)
- [Listas de precios](/catalogo/precios)
- [Canales](/config/canales)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Tipo de cambio](/config/tipo-cambio)
- [Cuotas de la tienda web](/config/cuotas)
