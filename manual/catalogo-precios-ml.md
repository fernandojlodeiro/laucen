---
titulo: Precios en Mercado Libre
menu: Catálogo › Precios en Mercado Libre
ruta: /catalogo/precios-ml
rutas: /catalogo/precios-ml
permiso: precios_ml_ver
resumen: El esquema de precios de cada cuenta de Mercado Libre: de la Clásica salen el tachado, el precio de cada publicación de cuotas (con destacado al precio para ganar) y el descuento por volumen; los cambios salen a ML sólo con un clic.
---

## Para qué sirve

Es donde se definen **las reglas** con las que Laucen calcula el precio de cada publicación en Mercado Libre, cuenta por cuenta. La idea central:

- **El tachado es el único precio que se pone a mano** (Fer, 7/10). Es el precio de la variación en la lista de precios del canal (por ejemplo, la lista «Clásicas»): el precio que se publica en Mercado Libre. Se carga en [Listas de precios](/catalogo/precios) o en la ficha del producto.
- **Todo lo demás sale solo de ahí:** la Clásica (tachado ÷ (1 + Tachado %), lo que paga el comprador con la campaña), el precio de cada publicación de planes de cuotas (3, 6, 9 y 12 cuotas sin interés), cuál de ellas va "destacada" al precio para ganar, y el descuento por volumen.
- Las reglas valen **por cuenta (canal)** y, adentro de la cuenta, **general → categoría → producto**: gana lo más específico.

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

**Pestañas:** «Tachado y planes», «Excepciones (N)», «Descuento por volumen (N)», «Alertas (N)» y «Vista previa» (esta última lleva a la [Vista previa](/catalogo/precios-ml/vista-previa)).

### Pestaña «Tachado y planes»

Arriba a la derecha: el botón **«Vista previa»** y el **lápiz** para editar. En edición quedan **«Grabar»** y **«Cancelar»** en el mismo lugar.

Caja **«Tachado y planes de cuotas (general de la cuenta)»**:
- **Tachado %**: cuánto se infla la Clásica para mostrar el precio tachado. Al lado dice qué descuento ve el comprador: un tachado de 81,8 % = el comprador ve −45 % (descuento = Tachado ÷ (100 + Tachado)).
- **«¿Gana? (si no, +%)»**: una columna de la tabla, para la Clásica y para cada plan. Vacío o 0 = esta cuenta **gana** ese precio; 3 = **no gana** y va 3 % más cara (para que tus cuentas no compitan entre ellas). Se ve «Gana» o «no gana, +3 %».
- Tabla de planes, una fila por plan: «Clásica» (siempre activa), «Premium 6 cuotas sin interés», «3 cuotas sin interés», «9 cuotas sin interés», «12 cuotas sin interés». Columnas:
  - **Activo**: caja para tildar. Un plan sin tildar no se calcula ni se toca.
  - **Desde una Clásica de**: precio mínimo de Clásica para que el plan se use («sin mínimo» si está vacío).
  - **Margen extra**: % que se suma arriba del precio que "empata" con la Clásica (vacío = 0 %).
  - **Cuotas que ve el comprador**: cuántas cuotas muestra ML para ese plan (si está vacío, las del nombre del plan: 3, 6, 9 o 12).
  - **Comisión (promedio)**: la comisión promedio de las categorías relevadas (sólo informativa; el cálculo usa la de cada categoría).
  - **Con una Clásica de $ 10.000**: ejemplo de cuánto daría cada plan con esa Clásica y la comisión promedio.
- Debajo, un texto que resume la fórmula y cuántas categorías tiene relevadas Costos ML.

Caja **«Interruptores de la cuenta»** (tres interruptores):
- **«Sincronizar precios: Laucen manda solo los precios a esta cuenta»**. Arranca apagado.
- **«Leer el precio para ganar y las campañas»**. Arranca prendido (es sólo lectura).
- **«Descuento por volumen: un escalón sólo si hay stock para su cantidad»**. Arranca prendido.

### Pestaña «Excepciones»

Excepciones por **categoría** (vale también para sus subcategorías) o por **producto**. Arriba a la derecha: «Descargar Excel» y **«Nueva excepción»**. Buscador por categoría, producto, SKU o número.

Columnas: «Aplica a» (Categoría / Producto), «Categoría o producto» (con enlace), «Tachado» (con el descuento que ve el comprador y, si la tiene, «Clásica: gana / no gana, +3 %») y una columna por plan («6 cuotas», «3 cuotas», «9 cuotas», «12 cuotas») con un resumen: «hereda», o por ejemplo «activo · desde $ 30.000 · margen 2 %». Cada fila tiene el **lápiz** (se edita ahí mismo, con «Guardar» y «Cancelar») y el **tacho** (pregunta «¿Borrar? Vuelve a heredar» con Sí / No).

El formulario de excepción tiene: «Aplica a» (una categoría o un producto), «Categoría» (buscador) **o** «o el SKU del producto», «Tachado %», «Clásica: ¿gana? (si no, +%)» y, por cada plan, «Activo» (Hereda / Sí / No), «Desde Clásica», «Margen %» y «¿Gana? (si no, +%)». Todo lo que queda vacío **hereda**.

### Pestaña «Descuento por volumen»

Arriba a la derecha: «Descargar Excel» y **«Nuevo rango»**. Arriba de la tabla, el interruptor «Un escalón sólo si hay stock para su cantidad» y el botón **«Replicar en las demás cuentas»**.

Columnas: «Aplica a» (General / Categoría … / Producto …), «Clásica desde», «Clásica hasta» («sin tope»), «Escalones» (por ejemplo «3+ u. −5 % · 6+ u. −10 %», o «Sin descuento»), lápiz y tacho.

En Mercado Libre se llama «precio por cantidad». Cada escalón sale marcado para el canal Mercado Libre (ML lo exige: sin eso contestaba «Marketplace context is mandatory», 7/10). Antes de mandarlo, Laucen lee los precios que ya tiene la publicación y nombra el precio base, porque un precio que no se nombra ML lo borra; los escalones viejos se reemplazan por los nuevos.

El formulario: «Aplica a» (Toda la cuenta (general) / Una categoría (excepción) / Un producto (excepción)), «Categoría» o «o el SKU del producto», «Clásica desde», «Clásica hasta», la caja «Sin descuento por volumen» y cinco escalones, cada uno con «Desde u.» y «% off».

### Pestaña «Alertas»

La cuenta de la pestaña suma las dos cajas.

**«Campañas debajo del piso (N)»**: publicaciones que están en una campaña en curso que las deja **más baratas que el piso**. El piso es lo que da el esquema para esa publicación (la Clásica de la cuenta, o el precio de su plan). Columnas: «SKU», «Producto», «Publicación» (con su tipo: Clásica, 3 cuotas…), «Campaña» (nombre, y si es **propia** —oferta del día, campaña del vendedor: el precio lo pusiste vos— o **de ML** —«Potencia tus ventas»—), «Con la campaña», «Piso» y «Debajo» (cuánto % abajo).
- En una campaña propia cuenta su precio. En una de ML con descuento compartido cuenta **sólo lo que ponés vos**: precio sin descuento × (1 − tu %). La parte que pone ML no sale de tu bolsillo y no cuenta.
- Botón **«Sacar de la campaña»** en cada fila (pregunta «¿Preparar el lote?» Sí / No) y **«Sacar de todas»** arriba a la derecha de la caja: arman un **lote preparado** en la [cola de Mercado Libre](/config/canales/cola) que la saca de la campaña con tu clic en «Mandar a Mercado Libre». Nada sale solo.
- Por qué pasa: estando en campaña, Laucen no sube el precio (en campaña el precio sólo baja), y las campañas de ML las arma ML. Si después de sacarla ML la vuelve a meter, vuelve a aparecer acá.

**«Destacados que dejaron de ganar (N)»**: lista los **planes destacados que dejaron de ganar** en el recuadro de cuotas de Mercado Libre: «SKU», «Producto», «Plan destacado», «Publicación», «Precio elegido», «Qué pasa» y «Leído». Si no hay ninguno: «Sin alertas: los destacados siguen ganando (o todavía no hay destacados elegidos)». Abajo, un enlace a la vista previa filtrada por los destacados.

## Cómo se hace

### Cambiar el tachado o los planes generales de una cuenta
1. Elegí la **Cuenta** arriba.
2. En «Tachado y planes», apretá el **lápiz** (arriba a la derecha).
3. Cambiá «Tachado %» y, en cada plan, tildá «Activo», poné «Desde una Clásica de», «Margen extra» y, si hace falta, «Cuotas que ve el comprador».
4. Apretá **«Grabar»**. Vuelve a la vista con «Grabado.».
5. Mirá el resultado en la [Vista previa](/catalogo/precios-ml/vista-previa) y prepará los cambios.

Errores típicos: «El tachado tiene que ser un % entre 0 y 300.», «El margen tiene que estar entre -50 % y 300 %.», «Las cuotas que ve el comprador van de 1 a 24.», «El precio mínimo no puede ser negativo.».

### Poner una excepción para una categoría o un producto
1. Pestaña «Excepciones» → **«Nueva excepción»**.
2. En «Aplica a» elegí «Una categoría (y sus subcategorías)» y buscala, o «Un producto» y escribí su SKU.
3. Completá sólo lo que querés cambiar (tachado, o en un plan: Activo Sí/No, Desde Clásica, Margen %). Lo vacío sigue heredando.
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
En «Tachado y planes», interruptor **«Sincronizar precios…»**. Al prenderlo, Laucen hace una primera pasada **de fondo** (la pantalla queda libre) y, al terminar, el cartel de abajo a la derecha avisa cuántas variaciones revisó y cuántos cambios mandó a la cola. Al apagarlo, deja de mandar solo (lo que ya estaba preparado en lotes sigue esperando el clic).

### Revisar un destacado que dejó de ganar
Pestaña «Alertas» → mirá «Qué pasa» (trae el estado que informa ML y el precio para ganar nuevo) → abrí la vista previa con el enlace de abajo → **«Preparar cambios»** → mandá el lote desde la cola.

## Criterios y reglas

### 1. De dónde sale la Clásica
- El **precio de lista** de la variación es el **tachado** (lo que se publica en Mercado Libre); la **Clásica = tachado ÷ (1 + Tachado %)**. Con Tachado 0 % son el mismo precio. Ejemplo: lista $ 2.284.047 y tachado 81,81818 % → Clásica $ 1.256.226 (el tachado muestra 45 % de descuento).
- La lista es la de la cuenta: la que tiene asignada el canal en [Canales](/config/canales); si el canal no tiene, se usa la lista que se llame «Clásicas» (o «Clásica»).
- Es el precio vigente **hoy** (hora argentina). Si la lista es derivada (otra lista × coeficiente), es el de la lista base por el coeficiente, salvo que tenga un precio propio cargado.
- Si el producto está marcado **en dólares**, los pesos se recalculan **cada día** con el tipo de cambio del día.
- El **descuento %** propio del producto o la familia **no** se aplica en Mercado Libre.
- Si la variación no tiene precio en esa lista, no se calcula nada (aviso «Sin precio en la lista Clásicas (el tachado): no se calcula nada.»).

### 2. Cómo se hereda una regla
Para cada producto se busca el valor de cada dato por separado, del más específico al más general: **producto → su categoría → la categoría de arriba → … → general de la cuenta**. Se toma el primero que no esté vacío. Así, un producto puede tener su propio margen para 12 cuotas y heredar todo lo demás.
- En lo general: el tachado vacío vale 0 %; un plan sin tildar está **apagado**; margen vacío = 0 %.
- «Cuotas que ve el comprador» se pone **sólo en lo general** (las excepciones no lo tienen).
- El descuento por volumen se hereda distinto (ver punto 7).

### 3. El tachado
- **El tachado es el precio de la lista** (la Clásica = tachado ÷ (1 + Tachado %), redondeada a pesos). Es **uno solo por modelo**: el mismo en todas las cuentas y en todos sus planes (Fer, 7/10).
- La publicación (la Clásica y cada plan de cuotas) se publica **al tachado**, y una campaña de Mercado Libre la baja a su precio: el comprador ve el precio tachado y paga el de esa publicación.
- **En campaña el tachado no se toca y el precio sólo baja** (Fer, 7/10). Lo que paga hoy el comprador se toma del precio de la campaña en curso (no del precio de la publicación), así una publicación en campaña nunca se saca de la campaña por quedar «a su precio»: si una publicación ya está adentro de una campaña, su tachado queda el que tiene (aviso «En campaña: el tachado queda en …») y, si el esquema da un precio más alto que el que paga hoy el comprador, queda el de hoy (aviso «En campaña el precio sólo baja…»). Si da más bajo, sale de la campaña y vuelve a entrar al precio nuevo.
- Mercado Libre pide **al menos 5 % de descuento** para mostrar el tachado; eso es un tachado de 5,3 % o más (con 5 % justo el descuento visible da 4,8 %). Si el tachado es mayor a 0 pero da menos de 5 % de descuento, la vista previa avisa.
- Con tachado 0 % la publicación va directamente a la Clásica y sin campaña.

### 4. Las comisiones que usa el cálculo
- Las releva **Costos ML** todos los días (arranca 6:30 de la mañana y sigue en tandas cada 5 minutos hasta terminar), preguntándole a la API de Mercado Libre, **sólo para las categorías donde hay publicaciones activas**. Se guarda sólo lo que cambió.
- Por cada categoría: el % de la Clásica, el % de la Premium (6 cuotas) y lo que **suma** cada plan de 3, 9 y 12 cuotas al % de la Clásica.
- La categoría de cada producto es la de su publicación en ML; si no la tiene, la categoría de ML de su familia (o de una familia de más arriba).
- Si la categoría no está relevada (o le falta algún plan), se usa el **promedio** de las relevadas y la columna «Comisión estimada» de la vista previa queda en «sí». Si Costos ML todavía no corrió nunca, se usan valores de referencia: Clásica 14 %, 6 cuotas 19 %, 3 cuotas 17 %, 9 cuotas 24 %, 12 cuotas 27 %.
- **Sólo se usa el % de comisión.** El cargo fijo por unidad (debajo de $ 33.000) y el costo del envío gratis también los releva Costos ML, pero **no entran** en el cálculo del precio de los planes.

### 5. El precio de cada publicación de planes de cuotas (por coeficiente)
El criterio: **cada plan tiene que dejar, después de su comisión, lo mismo que deja la Clásica, más el margen extra.**

**Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + margen extra)**, redondeado a pesos enteros.

Paso a paso:
1. Neto de la Clásica = Clásica × (1 − comisión Clásica): lo que queda de vender a Clásica.
2. Se divide por (1 − comisión del plan): el precio que deja ese mismo neto pagando la comisión del plan.
3. Se multiplica por (1 + margen extra).

**Quién gana cada plan** (Fer, 7/10): en cada cuenta, la Clásica y cada plan pueden ir un % más caros que el esquema: la cuenta que **no gana** ese plan va **3 % más cara** («¿Gana?» en la vista previa: «Gana» o «+3 %»). La Clásica de esa cuenta = Clásica de la lista × 1,03; el plan = su precio por coeficiente (calculado con la Clásica de la lista) × 1,03. Se carga en «Tachado y planes» (lápiz, columna «¿Gana? (si no, +%)») para toda la cuenta, o en «Excepciones» para una categoría o un producto (gana lo más específico; se ve «gana» o «no gana: +3 %»). El botón «Publicar en todas las cuentas» de la ficha del producto lo reparte solo (ver [Publicar un producto en todas las cuentas](/catalogo/productos)).

Un plan **se usa** (queda "habilitado") sólo si está **activo** y la Clásica es **mayor o igual** a su «Desde una Clásica de». Si no, su publicación queda con papel «Plan apagado» y **no se toca** (aviso «El plan no está activo: no se toca.» o «Debajo del mínimo del plan (…): no se toca.»).

Si dos planes habilitados se le muestran al comprador con la misma cantidad de cuotas, la vista previa avisa que sobra uno («manda lo que ve el comprador»).

### 6. El plan destacado (precio para ganar)
En las publicaciones de **catálogo**, Mercado Libre informa el **precio para ganar** (el precio al que esa publicación ganaría el recuadro). Laucen lo lee (ver punto 10) y elige, por variación, **un plan destacado**:
- Candidatos: los planes habilitados que ya tienen publicación y precio para ganar leído.
- Para cada uno calcula la **holgura**: (precio para ganar × (1 − comisión del plan)) ÷ (Clásica × (1 − comisión Clásica)) − 1, en %, **menos su margen extra**. Si da 0 o más, "cierra": a ese precio deja al menos lo que la Clásica más el margen.
- Gana el de **mayor holgura**; si empatan, el que el comprador ve con más cuotas. Si ninguno cierra, no hay destacado (aviso «Ningún plan cierra al precio para ganar de ML…») y todos los planes quedan a su precio por coeficiente.
- El destacado se publica así: lo que paga el comprador = **el precio para ganar** (redondeado); el precio de la publicación = el tachado del modelo (si el tachado es 0, el mismo precio); y entra **en las mismas campañas que la Clásica**, para mostrarse con tachado en el recuadro «En cuotas».
- Los **demás planes** van a su precio por coeficiente: con tachado, publicados al tachado del modelo y bajados por campaña a su precio (si el tachado no deja al menos 5 % de descuento, a su precio y sin campaña); con tachado 0, a su precio y sin campaña.
- El destacado elegido se graba al preparar los cambios (o en cada pasada automática). Después se verifica cada hora; si deja de ganar queda la alerta (pestaña «Alertas»).

### 7. Descuento por volumen
- Se define **por rango de Clásica** («Clásica desde» incluido, «Clásica hasta» excluido), con hasta **5 escalones**: «desde N unidades, X % menos».
- Herencia: el nivel **más específico que tenga filas manda entero** (producto, si no la categoría más cercana, si no lo general). Si ese nivel tiene «Sin descuento», no hay descuento. Si ese nivel tiene rangos pero **ninguno contiene la Clásica**, tampoco hay descuento (no vuelve a buscar en lo general).
- El % se aplica sobre **lo que paga el comprador en esa publicación** (la Clásica en la Clásica, el precio para ganar en el destacado, el precio del plan en los demás) y se redondea a pesos.
- Con el interruptor «un escalón sólo si hay stock…» prendido, un escalón se manda sólo si el **stock disponible para el canal** alcanza su cantidad.
- Se limpia lo cargado: cantidades desde 2, % mayor que 0 y hasta 90, sin cantidades repetidas, ordenado, máximo 5.
- En ML va como "precio por cantidad" de cada publicación. Si una publicación tenía descuento por volumen y ya no le corresponde, Laucen **no lo saca**: avisa «sacalo a mano en ML».
- Es sólo para Mercado Libre: el de la tienda web va aparte (más adelante).
- **Hoy Mercado Libre sólo acepta precio por cantidad en neumáticos** (contesta "Price per quantity is available only for automotive tires"): en notebooks y el resto quedó cargado «Sin descuento por volumen».

### 8. Campañas (cómo se logra el tachado)
- Sólo se usan las campañas en las que se elige el precio con descuento (ofertas del día y campañas del vendedor).
- Una campaña sirve si su rango de precio aceptado (mínimo y máximo con descuento, que informa ML) incluye el precio a pagar.
- Para **cambiar el precio** de una publicación que está en campañas, primero **sale** de esas campañas (ML no deja cambiarlo adentro), cambia el precio y **vuelve a entrar** al precio nuevo.
- Si ninguna campaña acepta el precio, avisa: el comprador pagaría el tachado. Si todavía no se leyeron las campañas, idem «hasta que entre en una».
- Ojo: el rango de cada campaña lo calcula ML sobre el precio actual; si el precio cambia mucho, alguna puede rechazar la entrada (queda «Con error» en la cola).

### 9. Publicaciones nuevas de planes que faltan
Si un plan está habilitado para una variación y no tiene publicación, la vista previa lo muestra (papel «Nueva») con el aviso «Falta la publicación de …: se crea con «Publicar en todas las cuentas» (ficha del producto, pestaña Publicaciones)». Desde acá ya no se crea: colgarla del producto de ML de otra publicación daba error siempre (7/10); una publicación de cuotas es una publicación propia (Premium con la marca del plan) que copia todo de otra, y eso lo hace, para un producto, el botón **Publicar en todas las cuentas** de su ficha (pestaña Publicaciones), que crea en cada cuenta la Clásica y los planes que le tocan. **Las publicaciones nuevas nunca salen solas**: siempre van en lote y esperan el clic.

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
  - al grabar en esta pantalla el tachado y los planes, una excepción, un rango de volumen, o al borrar una excepción;
  - en cada barrido (cada 30 minutos), para las variaciones cuyo precio cambió en alguna lista;
  - en cada barrido, para las publicaciones a las que Mercado Libre les **ofreció una campaña nueva** con precio (una publicación recién creada o una campaña que apareció): así entran sin esperar a la noche. Mercado Libre las ofrece y Laucen las lee cada hora;
  - una **pasada entera por noche** (entre las 2 y las 4, hora argentina), que toma los cambios del tipo de cambio en productos en dólares y del stock en los escalones de volumen.
- Todo pasa por la cola: se manda con ritmo, se reintenta si ML corta o falla, y queda registrado qué se mandó, cuándo y con qué resultado. Un cambio automático que dio error no se vuelve a mandar igual durante 6 horas.
- Se considera que una publicación **cambia de precio** si el precio calculado difiere en $ 1 o más del que tiene en ML.

### 12. Redondeo
Todos los precios (tachado, planes, destacado, escalones de volumen) se redondean a **pesos enteros**.

### Ejemplo numérico completo
Cuenta con tachado general 10 %, los cuatro planes activos sin mínimo, margen 0 % salvo 12 cuotas con 3 %. Categoría con comisiones: Clásica 14 %, 3 cuotas 17 %, 6 cuotas 19 %, 9 cuotas 24 %, 12 cuotas 27 %. Precio del producto en la lista (el tachado): **$ 11.000**. Stock del canal: 4.

1. **Clásica** = 11.000 ÷ 1,10 = **$ 10.000**. La Clásica se publica a $ 11.000 (el tachado) y entra a campaña a $ 10.000 (descuento visible 9,1 %, más que el 5 % que pide ML).
2. **Neto de la Clásica** = 10.000 × (1 − 0,14) = $ 8.600.
3. **3 cuotas** = 8.600 ÷ 0,83 = 10.361,4 → **$ 10.361**.
4. **6 cuotas** = 8.600 ÷ 0,81 = 10.617,3 → **$ 10.617**.
5. **9 cuotas** = 8.600 ÷ 0,76 = 11.315,8 → **$ 11.316**.
6. **12 cuotas** = 8.600 ÷ 0,73 × 1,03 = 12.134,2 → **$ 12.134**.
7. **Destacado:** ML informa precio para ganar $ 10.800 en la de 6 cuotas y $ 11.900 en la de 12.
   - 6 cuotas: 10.800 × 0,81 = 8.748; 8.748 ÷ 8.600 − 1 = +1,72 %, menos margen 0 → cierra.
   - 12 cuotas: 11.900 × 0,73 = 8.687; 8.687 ÷ 8.600 − 1 = +1,01 %, menos margen 3 % = −1,99 % → no cierra.
   - Destacado: **6 cuotas**, el comprador paga **$ 10.800**; la publicación va al tachado del modelo, **$ 11.000**, y entra a las mismas campañas que la Clásica a $ 10.800. Las de 3 cuotas ($ 10.361) también van a $ 11.000 y por campaña a su precio; las de 9 y 12 ($ 11.316 y $ 12.134) quedan a su precio sin campaña, porque el tachado no les deja el 5 % de descuento.
8. **Volumen** (rango general sin tope: 3+ u. −5 %, 6+ u. −10 %): en la Clásica, 3+ u. a $ 9.500; el escalón de 6 no va porque el stock es 4 (con la regla de stock prendida). En la destacada: 3+ u. a 10.800 × 0,95 = $ 10.260.

## Preguntas frecuentes

**¿Con qué criterio se calcula el precio de las publicaciones de cuotas?**
Para que dejen, después de la comisión de Mercado Libre de su categoría, lo mismo que deja la Clásica más el margen extra del plan: Clásica × (1 − comisión Clásica) ÷ (1 − comisión del plan) × (1 + margen), redondeado a pesos. La que queda destacada va al precio para ganar de ML, si ese precio cierra.

**¿Dónde cambio el precio de un producto en Mercado Libre?**
Cambiando su Clásica (el precio en la lista del canal) en [Listas de precios](/catalogo/precios) o en la ficha del producto. Todo lo demás se recalcula solo. Después hay que preparar y mandar los cambios (salvo que la cuenta sincronice sola).

**Cambié una regla y en ML no cambió nada. ¿Por qué?**
Porque con «Sincronizar precios» apagado nada sale solo: andá a la [Vista previa](/catalogo/precios-ml/vista-previa), «Preparar cambios», y en la [Cola de Mercado Libre](/config/canales/cola) apretá «Mandar a Mercado Libre».

**¿Por qué un plan no tiene precio o dice «Plan apagado»?**
Porque no está activo (en lo general o en una excepción que le toca) o la Clásica está debajo de su «Desde una Clásica de».

**¿Qué pasa si la categoría no tiene la comisión relevada?**
Se usa el promedio de las categorías relevadas y la vista previa lo marca como «Comisión estimada».

**¿El cargo fijo o el envío gratis se suman al precio?**
No. El cálculo usa sólo el % de comisión de cada plan.

**¿Por qué el tachado tiene que ser 5,3 % o más?**
Porque Mercado Libre muestra el precio tachado sólo si el descuento es de al menos 5 %, y 1 − 1/1,053 ≈ 5 %.

**¿Una excepción de categoría vale para sus subcategorías?**
Sí. Y una excepción de producto le gana a la de su categoría.

**¿Las cuotas de esta pantalla son las mismas que las de la tienda web?**
No. Éstas son las publicaciones de cuotas de Mercado Libre. Las cuotas de la tienda web se configuran en [Cuotas](/config/cuotas).

**¿Laucen saca solo un descuento por volumen que ya no corresponde?**
No: lo avisa en la vista previa y hay que sacarlo a mano en Mercado Libre.

## Relacionado

- [Vista previa de precios en Mercado Libre](/catalogo/precios-ml/vista-previa)
- [Cola de Mercado Libre](/config/canales/cola)
- [Listas de precios](/catalogo/precios)
- [Canales](/config/canales)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Tipo de cambio](/config/tipo-cambio)
- [Cuotas de la tienda web](/config/cuotas)
