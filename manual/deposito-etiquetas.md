---
titulo: Etiquetas
menu: Stock › Etiquetas
ruta: /deposito/etiquetas
rutas: /deposito/etiquetas, /deposito/etiquetas/imprimir, /deposito/etiquetas/ubicaciones, /deposito/etiquetas/full
permiso: etiquetas_ver
resumen: Imprimir etiquetas con código de barras para los productos (con o sin precio), para las ubicaciones de las estanterías y las de Full de Mercado Libre (para mandar mercadería a Full).
---

## Para qué sirve

Imprime etiquetas con código de barras:

- **De producto**: título, SKU, código de barras y, si se pide, el precio de una lista. Para pegar en los productos y después escanearlos en el picking y la recepción.
- **De ubicación**: el código de la ubicación bien grande con su código de barras. Para pegar en las estanterías y escanearlas en la recepción.
- **De Full de Mercado Libre**: la etiqueta que Mercado Libre pide en cada unidad (o en cada pack, si la publicación se vende por pack) que se manda a Full. Es igual a la que se baja de la Central de vendedores ("Descargá las etiquetas para tus productos"), pero sin tener que bajarla en cada envío.

Se imprime en impresora térmica (una etiqueta de 50 × 25 mm por hoja) o en hoja A4 (grilla de 3 × 8, 24 etiquetas de 70 × 37 mm).

## Cómo se llega

- Menú **Stock › Etiquetas**.
- La pantalla tiene tres pestañas: **"Productos"**, **"Ubicaciones"** y **"Full de Mercado Libre"**.

## Qué hay en la pantalla

### Pestaña "Productos"

- El buscador ("SKU, título o código de barras"), la caja **"Mostrar inactivos"** y el botón **"Buscar"**. El SKU, el título y los demás datos del producto (marca, modelo, descripción, número…) se buscan en cualquier parte del texto; el código de barras tiene que ser completo. Trae hasta 60 resultados. No aparecen los kits (un kit no tiene un código propio para pegar: se etiquetan sus componentes).
- La lista de productos encontrados: SKU, título, el código de barras (o "sin código de barras: va el SKU") y el campo **"Etiquetas"** con cuántas imprimir de cada uno. Si se encontró uno solo, viene con 1; si no, con 0.
- **"Formato"**: **"Térmica 50×25 mm"** o **"Hoja A4 (3×8)"**.
- La caja **"Con precio"** y el desplegable **"De la lista"** (las listas de precios activas). Si no hay listas activas, están deshabilitados y avisa "No hay listas de precios activas: las etiquetas van sin precio."
- Botón **"Ver para imprimir"**.

### Pestaña "Ubicaciones"

- Si hay varios depósitos, un desplegable con **"Ver"** para elegir el depósito (no aparecen los de Full). Si no hay depósitos activos, avisa y manda a crearlos.
- La lista de ubicaciones activas del depósito, cada una con su caja para tildar, su código y su descripción (la general dice "la general").
- **"Formato"**: igual que en productos.
- Botones **"Las tildadas"** y **"Todas (N)"**.

### Pestaña "Full de Mercado Libre"

- Si hay más de una cuenta de Mercado Libre, el desplegable para elegirla (cambiarla vacía la lista).
- El buscador "SKU, título o Código ML" (busca mientras se escribe, desde la segunda letra; la X lo borra; la caja **"Comienza por"**). Busca por nuestro SKU, el SKU de Mercado Libre, el título de la publicación, el número de publicación (MLA…) o de variante, los atributos, la categoría o el Código ML. Cada resultado muestra el **Código ML** (o "sin Código ML guardado"), el título de Mercado Libre, el SKU, el número de publicación, la variante si tiene, "en Full" si ya está en Full, y el botón **"Agregar"**.
- **"Para imprimir (N)"**: lo agregado, en el orden en que se cargó. Cada renglón muestra el Código ML y el título que van a salir en la etiqueta, el campo **"Etiquetas"** (cuántas, viene en 1; agregar de nuevo la misma suma 1) y el tacho para sacarla (pregunta "Sí" / "No" ahí mismo). Si la publicación no tiene Código ML, el renglón lo dice en rojo ("Sin Código ML: no se imprime").
- **"Impresora"**: **"Térmica 50×25"**, **"A4 (impresora común)"** o **"Térmica ZPL (próximamente)"**, todavía deshabilitada. Queda recordada para la próxima. Con A4 aparece **"Empezar en la etiqueta N.º"** (1 a 30), para aprovechar una hoja ya empezada.
- Botón **"🖨 Imprimir N etiquetas"**: abre el PDF en otra pestaña.

### La página para imprimir

Se abre en otra pestaña. Arriba: **"🖨 Imprimir"** (abre el diálogo de impresión del navegador), **"Volver"**, cuántas etiquetas son y en qué formato (y cuántas hojas A4). Con térmica, recuerda: "En el diálogo de impresión elegí la impresora térmica, tamaño 50×25 mm y márgenes "ninguno"." Debajo, la vista previa de las etiquetas. Al imprimir, sólo salen las etiquetas (el resto de la pantalla se esconde).

## Cómo se hace

### Imprimir etiquetas de producto

1. Entrá a **Stock › Etiquetas** (pestaña **"Productos"**).
2. Escribí el SKU, parte del título o el código de barras y apretá **"Buscar"**.
3. En cada producto, poné en **"Etiquetas"** cuántas querés.
4. Elegí el **"Formato"**.
5. Si querés el precio, tildá **"Con precio"** y elegí la lista en **"De la lista"**.
6. Apretá **"Ver para imprimir"**. Se abre la vista previa en otra pestaña.
7. Apretá **"🖨 Imprimir"** y, en el diálogo, elegí la impresora (con térmica: tamaño 50 × 25 mm y márgenes "ninguno").

### Imprimir etiquetas de ubicación

1. Pestaña **"Ubicaciones"**.
2. Si hay varios depósitos, elegilo y apretá **"Ver"**.
3. Tildá las ubicaciones y apretá **"Las tildadas"**, o apretá **"Todas (N)"** para todas las del depósito.
4. En la vista previa, **"🖨 Imprimir"**.

### Imprimir etiquetas de Full

1. Pestaña **"Full de Mercado Libre"**.
2. Buscá cada producto por SKU, título o Código ML y apretá **"Agregar"**.
3. Poné en **"Etiquetas"** cuántas de cada uno (una por unidad o por pack que mandás a Full).
4. Elegí la **"Impresora"**: térmica de rollo o A4. Con A4, si la hoja ya está usada, poné en qué etiqueta empezar.
5. Apretá **"🖨 Imprimir"** e imprimí el PDF a escala 100 % (en la térmica: tamaño 50 × 25 mm, sin márgenes).

## Criterios y reglas

- **Etiqueta de Full**: lleva el **Código ML** de la publicación (lo que Mercado Libre llama inventory_id, por ejemplo YVCG00146) como código de barras Code 128, debajo el código en negrita, el título de la publicación **de Mercado Libre** (no el de nuestro catálogo) en hasta dos renglones y, si es una variante, sus datos en negrita (por ejemplo "Color: Negro"). Mide 50 × 25 mm, con la misma disposición que la de Mercado Libre.
- **El Código ML es fijo** por publicación (o por variante): no cambia de un envío a Full a otro, así que se pueden imprimir antes de armar el envío. Cada cuenta de Mercado Libre tiene los suyos.
- **De dónde sale el Código ML**: Laucen lo tiene guardado de lo que trae de Mercado Libre. Si no lo tiene, al apretar "Agregar" se lo pide a Mercado Libre (sólo lee, no cambia nada) y lo guarda. Si Mercado Libre tampoco lo da (la publicación nunca estuvo en Full, o la cuenta está desconectada), esa etiqueta no se imprime.
- **A4**: 30 por hoja (3 columnas × 10 filas), de 50 × 25 mm con una línea fina para cortar; la primera a 12,6 mm del borde izquierdo y 3,9 mm del de arriba.
- **Tope**: 1.000 etiquetas de Full por vez.

- **Qué código lleva**: el código de barras del producto; si no tiene, el SKU. En las ubicaciones, el código de la ubicación.
- **Tipo de código de barras**: si el código es un EAN-13 válido (13 dígitos con su dígito verificador correcto), se dibuja como EAN-13; cualquier otro, como Code 128. El número va escrito debajo.
- **Precio**: es el precio de venta del producto en la lista elegida, con el descuento que tenga el producto aplicado, en la moneda base de esa lista. Si el producto no tiene precio en esa lista, la etiqueta dice "sin precio".
- **Tope**: como mucho 1.000 etiquetas por vez; si pedís más, avisa "Son N etiquetas: van las primeras 1000."
- **Orden**: las de producto salen ordenadas por SKU; las de ubicación, por orden de recorrido y código.
- **Formatos**: térmica = una etiqueta de 50 × 25 mm por página; A4 = 24 por hoja (3 columnas × 8 filas, de 70 × 37 mm).
- Una cantidad vacía o en cero no imprime ese producto. Si no elegiste ninguna, la vista previa dice "No elegiste ninguna etiqueta. Volvé y poné cuántas querés."
- Las etiquetas de envío y las hojas de preparación de los pedidos no salen de acá: salen del [Picking](/deposito/picking) o de [Envíos](/ventas/envios).

## Preguntas frecuentes

**El producto no tiene código de barras, ¿qué etiqueta sale?**
Sale con el SKU como código de barras; se puede escanear igual en el picking y la recepción, que aceptan el SKU.

**¿Por qué no encuentro un kit?**
Los kits no se etiquetan: se etiquetan sus componentes.

**¿El precio incluye el descuento del producto?**
Sí, es el precio de venta de esa lista con el descuento aplicado.

**La etiqueta térmica sale cortada o en varias hojas.**
En el diálogo de impresión elegí el tamaño 50 × 25 mm y márgenes "ninguno".

**¿Para qué sirven las etiquetas de ubicación?**
Para escanear el estante al recibir mercadería en [Recepción](/deposito/recepcion) y no tener que buscar la ubicación a mano.

**¿Por qué no aparece la ubicación que busco?**
Sólo aparecen las ubicaciones activas. Revisala en [Depósitos y ubicaciones](/stock/depositos).

## Relacionado

- [Productos](/catalogo/productos)
- [Listas de precios](/catalogo/precios)
- [Depósitos y ubicaciones](/stock/depositos)
- [Recepción](/deposito/recepcion)
- [Picking](/deposito/picking)
