---
titulo: Cuotas
menu: Tienda web › Cuotas
ruta: /config/cuotas
rutas: /config/cuotas
permiso: reglas_ver
resumen: Los planes de cuotas de la tienda web (cuántas cuotas y con qué interés), cargados por familia o por producto, con herencia.
---

## Para qué sirve

Define **en cuántas cuotas se puede pagar en la tienda web** y si son sin interés o con interés. Los planes se cargan en una **familia** (y los heredan sus subfamilias y sus productos) o en un **producto** puntual.

Ojo: esto es sólo para la **tienda web**. Las publicaciones de cuotas de Mercado Libre (3, 6, 9 y 12 cuotas sin interés) y su precio se manejan en [Precios en Mercado Libre](/catalogo/precios-ml).

## Cómo se llega

- Menú **Tienda web › Cuotas**.
- Permiso «Reglas comerciales y cuotas».

## Qué hay en la pantalla

Dos tablas.

**«Por familia»**: todas las familias en forma de árbol (cada subfamilia con sangría debajo de su padre). Columnas:
- **Familia**.
- **Planes**: en negrita los planes propios (por ejemplo «3, 6 y 12 sin interés · 18 con 20 %»); en gris «Hereda de <familia>: …» si los toma de una familia de arriba; o «Sin cuotas (un pago)».
- El **lápiz** para editar esa fila.

**«Por producto»**: un buscador «Buscar por SKU o título» (busca en todos los datos del producto y en el SKU, título y código de barras de sus variaciones) con los botones «Buscar» y «Limpiar». Sin buscar, muestra los productos que tienen planes propios (hasta 100); buscando, hasta 40 resultados (primero los que tienen planes propios). Columnas: **SKU**, **Producto**, **Planes** (igual que arriba: propios, «Hereda de …» o «Sin cuotas (un pago)») y el **lápiz**.

**Al editar una fila** (se edita ahí mismo):
- Una fila por plan con **«Cuotas»** e **«Interés %»**, y el botón «Quitar».
- **«+ Agregar plan»**: agrega una fila sugiriendo la próxima cantidad de cuotas (3, 6, 9, 12, 18, 24).
- Ayuda: «Interés 0 = sin interés (lo absorbés vos).»
- Botones: **«Guardar»**, **«Sacar los propios (heredar)»** (sólo si tiene planes propios) y **«Cancelar»**.

## Cómo se hace

### Cargar planes en una familia
1. En «Por familia», apretá el **lápiz** de la familia.
2. **«+ Agregar plan»** por cada plan; poné «Cuotas» (1 a 24) e «Interés %» (0 = sin interés).
3. **«Guardar»**. Avisa «Planes guardados.». Todas sus subfamilias y productos sin planes propios pasan a heredarlos.

### Cargar planes en un producto puntual
1. En «Por producto», escribí el SKU o parte del título y apretá **«Buscar»**.
2. **Lápiz** en el producto → cargá los planes → **«Guardar»**.

### Que una familia o un producto vuelva a heredar
Lápiz → **«Sacar los propios (heredar)»**. También pasa si quitás todas las filas y guardás («Sin planes propios: ahora hereda.»).

Errores típicos: «Las cuotas van de 1 a 24.», «El interés va de 0 a 300 % (0 = sin interés).», «El plan de N cuotas está repetido.».

## Criterios y reglas

- **Herencia:** para cada producto valen **sus planes propios**; si no tiene, los de **su familia**; si tampoco, los de la familia de arriba, y así hasta la raíz. Se toma el primer nivel que tenga planes y se usa **entero** (no se mezclan planes de distintos niveles). Si nadie tiene, el producto se vende **en un pago**.
- **Forma de un plan:** cantidad de cuotas (1 a 24, sin repetir) e interés % (0 a 300). **Interés 0 = sin interés**: el costo lo absorbe el vendedor.
- **Qué muestra la tienda:**
  - En la tarjeta del producto y en su ficha: el **mejor plan sin interés** (el de más cuotas con interés 0), con el texto «Mismo precio en N cuotas de $ …». Si no hay ninguno sin interés, el de más cuotas, «en N cuotas de $ …».
  - En la ficha, además, la lista de todos los planes de más de una cuota, «sin interés» o «con interés», con el valor de cada cuota.
  - **Valor de la cuota = precio de venta × (1 + interés %) ÷ cuotas.**
- **En el carrito y el pago:** valen sólo los planes que **comparten todos los productos del carrito** (la misma cantidad de cuotas en todos); si un producto tiene esa cantidad con más interés que otro, se toma el **interés más alto**. La cantidad máxima de cuotas es la del plan más largo de ese resultado.
  - Con Payway: se rechaza una cantidad de cuotas que no esté entre esos planes («Esa cantidad de cuotas no está disponible para estos productos.»).
  - Con Mercado Pago: se limita la cantidad máxima de cuotas.
  - Al cobrar, Laucen manda el total del pedido y la cantidad de cuotas; el interés % que se carga acá se usa para mostrar el valor de la cuota.
- No tiene nada que ver con el precio ni con las publicaciones de cuotas de Mercado Libre.

## Preguntas frecuentes

**¿Cargo los planes en cada producto?**
No hace falta: cargalos en la familia y los heredan todos sus productos y subfamilias. En un producto sólo si es distinto.

**Una subfamilia tiene planes propios: ¿suma los de la familia padre?**
No. Si tiene propios, usa sólo los suyos.

**¿Qué significa interés 0?**
Cuotas sin interés: el cliente paga lo mismo que en un pago y el costo lo absorbe la empresa.

**¿Por qué en el carrito aparecen menos cuotas que en la ficha?**
Porque en el carrito valen sólo las cuotas que tienen todos los productos que hay en él.

**¿Esto cambia las cuotas de Mercado Libre?**
No. Las de Mercado Libre se manejan en [Precios en Mercado Libre](/catalogo/precios-ml).

**¿Cómo saco las cuotas de un producto que hereda de su familia?**
Hoy no hay un "sin cuotas" explícito: sin planes propios siempre hereda. Podés cargarle un único plan de 1 cuota, que no se muestra como cuotas.

## Relacionado

- [Reglas comerciales](/config/reglas)
- [Medios de pago](/config/medios-pago)
- [Tienda web](/config/tienda)
- [Familias](/catalogo/familias)
- [Precios en Mercado Libre](/catalogo/precios-ml)
