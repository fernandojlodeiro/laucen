---
titulo: Etiquetas
menu: Stock › Etiquetas
ruta: /deposito/etiquetas
rutas: /deposito/etiquetas, /deposito/etiquetas/imprimir, /deposito/etiquetas/ubicaciones
permiso: etiquetas_ver
resumen: Imprimir etiquetas con código de barras para los productos (con o sin precio) y para las ubicaciones de las estanterías.
---

## Para qué sirve

Imprime etiquetas con código de barras:

- **De producto**: título, SKU, código de barras y, si se pide, el precio de una lista. Para pegar en los productos y después escanearlos en el picking y la recepción.
- **De ubicación**: el código de la ubicación bien grande con su código de barras. Para pegar en las estanterías y escanearlas en la recepción.

Se imprime en impresora térmica (una etiqueta de 50 × 25 mm por hoja) o en hoja A4 (grilla de 3 × 8, 24 etiquetas de 70 × 37 mm).

## Cómo se llega

- Menú **Stock › Etiquetas**.
- La pantalla tiene dos pestañas: **"Productos"** y **"Ubicaciones"**.

## Qué hay en la pantalla

### Pestaña "Productos"

- El buscador ("SKU, título o código de barras"), la caja **"Mostrar inactivos"** y el botón **"Buscar"**. El SKU y el título se buscan en cualquier parte del texto; el código de barras tiene que ser completo. Trae hasta 60 resultados. No aparecen los kits (un kit no tiene un código propio para pegar: se etiquetan sus componentes).
- La lista de productos encontrados: SKU, título, el código de barras (o "sin código de barras: va el SKU") y el campo **"Etiquetas"** con cuántas imprimir de cada uno. Si se encontró uno solo, viene con 1; si no, con 0.
- **"Formato"**: **"Térmica 50×25 mm"** o **"Hoja A4 (3×8)"**.
- La caja **"Con precio"** y el desplegable **"De la lista"** (las listas de precios activas). Si no hay listas activas, están deshabilitados y avisa "No hay listas de precios activas: las etiquetas van sin precio."
- Botón **"Ver para imprimir"**.

### Pestaña "Ubicaciones"

- Si hay varios depósitos, un desplegable con **"Ver"** para elegir el depósito (no aparecen los de Full). Si no hay depósitos activos, avisa y manda a crearlos.
- La lista de ubicaciones activas del depósito, cada una con su caja para tildar, su código y su descripción (la general dice "la general").
- **"Formato"**: igual que en productos.
- Botones **"Las tildadas"** y **"Todas (N)"**.

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

## Criterios y reglas

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
