---
titulo: Vista previa de precios en Mercado Libre
menu: Catálogo › Precios en Mercado Libre › Vista previa
ruta: /catalogo/precios-ml/vista-previa
rutas: /catalogo/precios-ml/vista-previa
permiso: precios_ml_ver
resumen: Qué precio tendría cada publicación de una cuenta de Mercado Libre con sus reglas, qué cambiaría en ML, y el botón para preparar los lotes que salen con tu clic.
---

## Para qué sirve

Muestra, publicación por publicación de una cuenta de Mercado Libre, **qué precio le corresponde** según las reglas de [Precios en Mercado Libre](/catalogo/precios-ml) y de [Planes de cuotas](/catalogo/precios-ml/planes-cuotas) (Clásica, tachado, planes de cuotas, destacado, volumen), **qué tiene hoy en ML** y **qué cambiaría**. También muestra las publicaciones de planes de cuotas que faltan y se podrían crear.

Nada sale de acá: el botón «Preparar cambios» arma lotes que esperan tu clic en la [Cola de Mercado Libre](/config/canales/cola).

## Cómo se llega

- Desde [Precios en Mercado Libre](/catalogo/precios-ml): botón **«Vista previa»** (arriba a la derecha) o pestaña **«Vista previa»**.
- Desde la pestaña «Alertas» de esa pantalla, con el enlace a la vista previa filtrada por los destacados.
- Permiso «Precios en Mercado Libre».

## Qué hay en la pantalla

**Arriba a la derecha:** «Descargar Excel» (baja lo mismo que se ve, con filtros y orden, todas las filas) y **«Preparar cambios»**.

**Arriba:** el desplegable **Cuenta**, el texto «Clásica: lista …» y la barra de pestañas de Precios en Mercado Libre.

**Filtros** (filtran al momento):
- Buscador «Buscar por SKU, producto o publicación», con la caja «Comienza por».
- Buscador de categoría («Todas las categorías»): incluye sus subcategorías.
- **Papel**: «Todos los papeles», «Clásica», «Destacado», «Plan», «Plan apagado», «Sin tocar», «Nueva».
- Caja **«Sólo las que cambian (y las nuevas)»**, tildada de entrada: se ven sólo las publicaciones a las que les cambiaría algo y las de planes que faltan. Destildándola se ven todas las activas.
- Caja **«Todas las cuentas»**, al lado del selector «Cuenta»: muestra las publicaciones de todas las cuentas juntas (ordenadas por SKU y cuenta; el selector dice «Todas las cuentas»). Es más lenta: calcula cada cuenta. Con la caja tildada, «Preparar cambios» arma los lotes de cada cuenta.

Un renglón de resumen: cuántas filas, cuántas **con cambios** (y cuántas son publicaciones nuevas de planes) y cuántas con avisos.

**Columnas** (se ordena tocando el título; de a 50 filas con paginador):
- **Publicación**: el número de ML (enlace a [Publicaciones](/catalogo/publicaciones)) o «nueva».
- **SKU** (enlace a la ficha del producto, con su foto si tiene) y **Producto**.
- **Plan**: como en [Publicaciones](/catalogo/publicaciones): el nombre que usa ML (Clásica, Premium 3x, Premium 12x…) y debajo «el comprador ve N cuotas».
- **Papel**: qué rol tiene esa publicación (ver «Criterios y reglas»).
- **Clásica**: el precio base.
- **Cuenta**: de qué cuenta es la publicación (útil con «Todas las cuentas» tildado). Cada fila lleva de fondo el color de su cuenta (se elige en [Canales](/config/canales)).
- **Descuento**: el «% OFF» que ve el comprador («sin descuento» si no tiene) y, al pasar el mouse, de dónde viene la regla («general», «de la categoría …», «del producto»).
- **Campañas**: una línea por campaña de la publicación: «● En curso» (con su precio; «(de ML)» si la armó Mercado Libre), «○ Programada», «→ Entraría» y «← Saldría» (lo que haría Laucen al preparar los cambios); «ninguna» si no tiene.
- **Según Laucen**: el precio que le corresponde, dibujado como lo ve el comprador en ML (igual que en Publicaciones): **grande lo que paga** (la Clásica, el precio para ganar o el precio del plan), arriba **chico y tachado el precio publicado** (el tachado) y al lado el **% OFF**.
- **Precio para ganar**: lo que informó ML, con su estado debajo («gana», «compite», «comparte el 1.º», «listada»).
- **Hoy en ML**: lo mismo pero con lo que tiene hoy la publicación en ML: grande lo que paga hoy el comprador (con la campaña en curso), el publicado tachado, el % OFF y, chiquito, el nombre de la campaña (entero al pasar el mouse).
- **Diferencia**: precio publicado según Laucen − precio publicado hoy en ML; verde si sube, rojo si baja, «—» si es igual.
- **Qué cambiaría** (a lo ancho, en un renglón debajo de cada publicación, junto con sus **avisos**): una frase por cada cosa, por ejemplo «Precio publicado (tachado): $ 20.000 → $ 22.000», «Paga el comprador: $ 11.000 → $ 11.880», «Sale de «Día de la Madre» y vuelve a entrar a $ 11.880», «Entra a «Oferta del día» a $ 11.880», «Descuento por volumen: 3+ $ 10.260»; «Publicación nueva» en las que faltan; o «Nada».
- **Avisos**: advertencias del cálculo (en amarillo).
- Además, en el Excel: «Precio calculado» (el publicado según Laucen), «Paga el comprador», «Precio en ML», «Paga hoy en ML», «Estado en catálogo», «Stock del canal» y «Comisión estimada».

Las filas con cambios se ven con fondo amarillo clarito. Abajo hay una nota sobre cómo salen los lotes.

## Cómo se hace

### Ver qué cambiaría en una cuenta
1. Elegí la **Cuenta**.
2. Con **«Sólo las que cambian»** tildada (así arranca) se ve sólo lo que se mandaría.
3. Revisá «Qué cambiaría» y «Avisos».

### Preparar los cambios para mandarlos a Mercado Libre
1. Si querés mandar sólo una parte, filtrá por **categoría** o con el **buscador** (esos dos filtros se respetan al preparar).
2. Apretá **«Preparar cambios»**. Pregunta «¿Preparar los cambios de N publicaciones…? No sale nada hasta tu clic.» → confirmá.
3. Te lleva a la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados», con el aviso «Preparado, falta tu clic: …».
4. Revisá cada lote y apretá **«Mandar a Mercado Libre»** (o «Descartar lote»).
   Para mandar sólo algunas publicaciones: «Preparar cambios» toma sólo lo que muestra el filtro (búsqueda por SKU, producto o número de publicación, y categoría), y en el lote podés sacar las que no quieras con el tacho de su fila antes de mandarlo.

Si no hay nada para cambiar, avisa «No hay nada para cambiar: todo está como tiene que estar.».

### Ver sólo los destacados, o los planes que faltan
Elegí en **Papel** «Destacado» o «Nueva».

### Publicar en la cuenta los productos que se venden en otras cuentas y en ésta no
Con una cuenta elegida (no con «Todas las cuentas»), si hay productos activos en otra cuenta de Mercado Libre que en ésta no están publicados (ni activos ni pausados), arriba a la derecha aparece **«Publicar lo que falta en esta cuenta (N)»**.
1. Apretá el botón y confirmá con «Sí». Corre de fondo: podés seguir trabajando; al terminar, el cartel de abajo a la derecha dice qué lote quedó.
2. Para cada producto se arma la **Clásica** y cada **plan de cuotas** que le toca por su grupo en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), al precio del esquema de esta cuenta (con descuento, al precio tachado; la campaña lo baja después), y quién gana como en el resto del esquema.
3. Cada publicación es una copia de la publicación común del producto en otra cuenta (título, fotos, características, garantía y descripción): la de la cuenta que va primero en **«Orden para copiar»** de [Canales](/config/canales). Si se conoce el producto de catálogo, pide además entrar a competir ahí. Antes de armarla se comprueba con Mercado Libre que la acepte.
4. Queda **un lote** en la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados»: revisalo y apretá **«Mandar a Mercado Libre»**.

Para probar antes de publicar todo, al lado está **«Probar con 10»**: arma el mismo lote con sólo 10 productos (los primeros por SKU). Después, «Publicar lo que falta en esta cuenta» sigue con el resto (los que ya están en la cola no se repiten).

Un producto sin stock para esta cuenta no se publica, y uno que no tiene ninguna publicación común para copiar tampoco: el cartel los nombra. Lo que ya está en un lote o en la cola no se vuelve a armar: si el cartel dice que faltaron por tiempo, se aprieta el botón otra vez y sigue con los que faltan.

### Crear las publicaciones de planes que le faltan a la cuenta
Con una cuenta elegida (no con «Todas las cuentas»), si hay filas «Nueva», arriba a la derecha aparece **«Crear los planes que faltan (N)»**.
1. Si querés sólo una parte, filtrá por categoría o con el buscador: se respeta.
2. Apretá el botón y confirmá con «Sí». Corre de fondo: podés seguir trabajando; al terminar, el cartel de abajo a la derecha dice qué lote quedó.
3. Cada publicación nueva es una copia de la publicación común que el producto ya tiene **en esa misma cuenta** (título, fotos, características, garantía y descripción), con el plan que le toca según [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas) y su precio (con descuento, al precio tachado; la campaña la baja después). Antes de armarla se comprueba con Mercado Libre que la acepte.
4. Queda **un lote** en la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados»: revisalo y apretá **«Mandar a Mercado Libre»**.

Un producto que no tiene ninguna publicación común en esa cuenta no se puede copiar: el cartel lo nombra. Lo que ya está en un lote o en la cola no se vuelve a armar, así que si el cartel dice que faltaron por tiempo, se aprieta el botón otra vez y sigue con las que faltan.

## Criterios y reglas

- **Qué publicaciones aparecen:** sólo las **activas** de la cuenta vinculadas a un producto, con número de ML. Las pausadas no aparecen y no se tocan nunca (ni su precio ni sus campañas); un plan que la cuenta tiene sólo en una publicación pausada tampoco se vuelve a crear. Una fila por publicación, más una fila por cada plan habilitado que no tiene publicación (papel «Nueva»). Orden de siempre: por SKU.
- **Papeles:**
  - **Clásica**: la publicación Clásica. Va al tachado y entra a campaña a la Clásica.
  - **Destacado**: el plan de cuotas elegido para ir al precio para ganar; va con tachado y en las mismas campañas que la Clásica.
  - **Plan**: un plan habilitado no destacado; va a su precio por coeficiente, sin campaña.
  - **Plan apagado**: un plan que el grupo de categorías del producto no usa en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), o un producto con la Clásica debajo de $ 33.000 (el mínimo para los planes); **no se toca**.
  - **Sin tocar**: no se calcula (falta la Clásica, tipo de publicación desconocido).
  - **Nueva**: un plan habilitado sin publicación; se puede crear.
- Las fórmulas (tachado, precio de cada plan, elección del destacado, volumen, campañas) están explicadas paso a paso, con un ejemplo, en [Precios en Mercado Libre](/catalogo/precios-ml).
- **Cuándo hay cambio:** si el precio calculado difiere en $ 1 o más del de ML, si tiene que salir o entrar a campañas, o si los escalones de volumen no son los que se mandaron la última vez con éxito.
- **Los lotes que arma «Preparar cambios»** (sólo los que tengan algo):
  1. «Precios y campañas»: por publicación, primero sale de las campañas a otro precio, cambia el precio y vuelve a entrar con el precio nuevo.
  2. «Descuento por volumen»: los precios por cantidad de cada publicación.
  Las filas «Nueva» (planes que faltan) no van en estos lotes ni se cuentan en la pregunta: se crean con «Crear los planes que faltan». La pregunta lo aclara cuando hay alguna.
  Al preparar, además, se graba el plan destacado de cada variación (para las alertas).
- **Respeta** el filtro de categoría y el buscador; **no** respeta «Papel» ni «Sólo las que cambian» (lo que no cambia no genera nada igual).
- Los cálculos se hacen en el momento con las reglas, la Clásica de hoy, las comisiones vigentes y lo último leído de ML (precio para ganar cada 6 horas, campañas cada 12 horas).
- Si la cuenta tiene «Sincronizar precios» prendido, los cambios de precio, campañas y volumen ya salen solos; las publicaciones nuevas igual hay que prepararlas acá.

**Avisos que pueden aparecer:**
- «Sin precio en la lista de la Clásica: no se calcula nada.»
- «El tachado da X % de descuento: ML pide al menos 5 % para mostrarlo.»
- «El comprador ve N cuotas en … y …: sobra uno (manda lo que ve el comprador).»
- «Ningún plan cierra al precio para ganar de ML: no hay destacado…»
- «Ninguna campaña acepta ese precio: el comprador pagaría el tachado.» / «Sin campañas leídas: el comprador pagaría el tachado hasta que entre en una.»
- «El plan no está activo: no se toca.» (el grupo del producto no lo usa) / «Debajo del mínimo del plan (…): no se toca.» (la Clásica no llega a $ 33.000)
- «Tenía descuento por volumen y ya no le corresponde: sacalo a mano en ML.»
- «No se puede crear: ninguna publicación de esta variación tiene el user product de ML.»
- «Tipo de publicación desconocido: no se toca.»

## Preguntas frecuentes

**¿Apretar «Preparar cambios» ya cambia los precios en Mercado Libre?**
No. Arma lotes que salen recién cuando apretás «Mandar a Mercado Libre» en la cola.

**¿Por qué en «Según Laucen» hay un precio tachado y otro grande?**
Porque en la Clásica y en el destacado la publicación va al precio tachado y una campaña lo baja a lo que paga el comprador.

**¿Por qué no aparece una publicación?**
Porque no está vinculada a un producto de Laucen (ver [Vincular con Mercado Libre](/catalogo/publicaciones/ml)) o está cerrada.

**¿Por qué no hay precio para ganar?**
ML lo informa sólo para publicaciones de catálogo, y Laucen lo lee cada 6 horas si el interruptor «Leer el precio para ganar y las campañas» está prendido.

**Filtré por Papel «Destacado» y preparé: ¿se preparan sólo los destacados?**
No. El filtro de papel no se aplica al preparar; para acotar usá la categoría o el buscador.

**¿Qué significa «Comisión estimada: sí» en el Excel?**
Que la categoría no tiene la comisión relevada (o le falta algún plan) y se usó el promedio.

**Mandé un lote y una publicación quedó «Con error». ¿Qué pasó?**
Lo más común: la campaña no aceptó el precio nuevo (su rango lo calcula ML sobre el precio anterior). Mirá el error en la [Cola de Mercado Libre](/config/canales/cola).

## Relacionado

- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Cola de Mercado Libre](/config/canales/cola)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Listas de precios](/catalogo/precios)
