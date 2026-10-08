---
titulo: Cómo funcionan los precios (guía conceptual)
menu: Catálogo › Listas de precios y Precios en ML (guía conceptual)
ruta: /catalogo/precios-ml
rutas: /catalogo/precios, /catalogo/precios-ml, /catalogo/precios-ml/vista-previa
permiso: precios_ml_ver
resumen: El sistema de precios entero, en conceptos: un solo precio cargado a mano por producto (la lista Clásicas) y de ahí, por reglas, el de cada canal, cada cuenta de Mercado Libre, cada plan de cuotas (por grupo de categorías), el tachado, las campañas con su piso, quién gana entre las cuentas, la web y el local; qué se configura, qué es fijo y qué sale solo.
---

## Para qué sirve

Para entender **de dónde sale cada precio** que ve un comprador, en cualquier canal, sin entrar en el detalle de cada pantalla. El detalle (campos, botones, fórmulas completas) está en [Listas de precios](/catalogo/precios) y [Precios en Mercado Libre](/catalogo/precios-ml).

## Cómo se llega

Las pantallas son [Catálogo › Listas de precios](/catalogo/precios), [Catálogo › Precios en Mercado Libre](/catalogo/precios-ml) (con su [Vista previa](/catalogo/precios-ml/vista-previa)), [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas) y la pestaña **Precios** de la ficha de cada producto.

## Criterios y reglas

### 1. La idea: un solo precio a mano

Por cada variación se carga **un precio**: el de la lista **Clásicas**. Todo lo demás se calcula con reglas:

| Dónde se vende | De dónde sale el precio |
|---|---|
| Mercado Libre (las 5 cuentas) | La lista Clásicas (ver punto 4 en adelante) |
| Web minorista | Clásicas × 1 (lista derivada), **con** el descuento % del producto |
| Local | Clásicas × 1 (lista derivada), **sin** descuentos |
| Web mayorista | Su propia lista (hoy vacía) |

Cambiar el precio en Clásicas cambia todos los canales. Cada canal dice con qué lista vende en [Configuración › Canales](/config/canales).

### 2. Las listas de precios

- Una lista puede tener **precios propios** (cargados a mano, con fecha: rige el más reciente) o **calcularse desde otra** con un coeficiente (Web = Clásicas × 0,90, por ejemplo). Un precio propio siempre gana sobre el calculado.
- Cada precio se guarda en pesos y en dólares. Un producto con **Precio en dólares** recalcula los pesos **todos los días** con el tipo de cambio del día: no hace falta tocar nada cuando sube el dólar.
- Se guarda la historia: un precio nuevo rige desde hoy.

### 3. El descuento % (sólo donde la lista lo permite)

- Se hereda: variación → producto → familia → familia de arriba → 0 %.
- Se aplica **sólo en las listas con «Aplica descuentos»** (hoy la Web minorista). En Mercado Libre **nunca**: ahí el descuento se logra con el tachado y las campañas.

### 4. Mercado Libre: el tachado y la Clásica

- El precio de la lista Clásicas es la **Clásica**: lo que paga el comprador en la publicación Clásica de la cuenta que gana.
- **Tachado = Clásica ÷ (1 − descuento que ve el comprador)**: el precio "de antes" que ve el comprador tachado. Vos decidís la Clásica y el **descuento que ve el comprador** (por ejemplo 45 %), y el sistema calcula el tachado.
- **Descuento 0 %** (lo normal): tachado y Clásica son lo mismo; la publicación va a ese precio y no necesita campaña.
- **Con descuento**: la publicación se publica **al tachado** y una **campaña** de Mercado Libre la baja a la Clásica; así se ve "X % OFF". Ejemplo de las notebooks: con descuento 45 %, el comprador ve el tachado y **−45 %**. Mercado Libre pide al menos 5 % de descuento para mostrarlo.
- El tachado es **uno solo por modelo**: el mismo en todas las cuentas y en todos sus planes.

### 5. Los planes de cuotas: una publicación por plan

En Mercado Libre, las cuotas sin interés son **publicaciones aparte**, además de la Clásica: Premium común, Premium 3x, Premium 9x y Premium 12x. Cuántas cuotas ve el comprador en cada una **depende de la categoría** (y cambia en fechas especiales): Mercado Libre no lo informa, así que se carga a mano. Cada plan tiene su precio:

**Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + % extra)**

O sea: cada plan deja, después de su comisión, **lo mismo que la Clásica más un % extra**. Las comisiones son las reales de la categoría de cada producto (las releva Costos ML todos los días).

**Qué planes lleva cada producto: por grupo de categorías.** En [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), para todas las cuentas a la vez, cada grupo de categorías (por ejemplo «Notebooks» y «Resto») dice qué planes usa, cuántas cuotas ve el comprador en cada uno y su % extra. Un producto lleva los planes de su grupo **sólo si su Clásica es de $ 33.000 o más** (desde ahí Mercado Libre da envío gratis); debajo, sale sólo con la Clásica.

### 6. Quién gana entre tus cuentas

Tus cuentas venden los mismos productos. Si todas tuvieran el mismo precio, competirían entre ellas en Mercado Libre. Por eso, **en cada tipo de publicación (la Clásica y cada plan de cuotas) una sola cuenta tiene el precio más bajo: ésa gana**; las demás van un % más caras (por ejemplo, **3 %**).
- Se decide **por grupo de categorías, para todas las cuentas a la vez**, en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas): en la columna «Quién gana», la Clásica y cada plan llevan una **cuenta fija** o **«Rota»**; debajo, «Las cuentas que no ganan van X % más caras».
- **«Rota»** reparte los productos parejo entre las cuentas que no ganan nada fijo en ese grupo. Cada producto cae siempre en la misma cuenta: lo decide el producto, no cambia de un día para otro.
- No se carga nada producto por producto.
- Ejemplo: **Notebooks**: Clásica → ML .BAIRES, Premium común → Rota, Premium 3x → Rota, Premium 12x → ML .BAIRES. **Resto**: Clásica → ML .BAIRES, Premium común → Rota, Premium 9x → ML .BAIRES. Las que no ganan, +3 %.
- Para forzar algo distinto: en [Precios en ML](/catalogo/precios-ml), columna «¿Gana? (si no, +%)» para toda una cuenta, o «Excepciones» para una categoría o un producto (0 = gana; 3 = no gana; vacío = según el grupo). Manda lo más específico: producto → su categoría → las de arriba → general de la cuenta → «Quién gana» del grupo.

### 7. Campañas y el piso

- **El piso** de cada publicación es el precio que le da el esquema (la Clásica de la cuenta, o el precio de su plan). Laucen **nunca** la mete en una campaña por debajo del piso.
- Entra a una campaña **sólo si el rango de precios que acepta la campaña incluye nuestro precio**; si no la acepta, no entra.
- **Campaña propia** («Promociones Daitom», una por cuenta, se crea en [Precios en ML](/catalogo/precios-ml), pestaña «Descuento y quién gana»): si ninguna campaña de Mercado Libre acepta el precio, la publicación entra a la propia, así se ve el descuento. Cuando Mercado Libre le ofrece una suya que lo acepta, pasa a la de Mercado Libre.
- **En campaña, el tachado no se toca**; para cambiar el precio (subir o bajar) la publicación sale de la campaña y vuelve a entrar al precio nuevo.
- Campañas que se superponen: entra en todas las que acepten el precio; el comprador paga la más baja de las propias.
- Las campañas que arma Mercado Libre con descuento compartido («Potencia tus ventas») **no** se usan para calcular. Si una campaña (propia o de ML) deja una publicación por debajo del piso —en las de ML cuenta sólo la parte que ponés vos—, aparece en [Precios en ML › Alertas](/catalogo/precios-ml) con el botón **Sacar de la campaña**.
- Una publicación con tachado necesita campaña para cobrar la Clásica: sin campaña, el comprador pagaría el tachado. Laucen la mete sola en cuanto ML le ofrece una (lee las ofertas cada hora), si la cuenta tiene «Sincronizar precios» prendido.
- **Una publicación con tachado que pierde su campaña sigue al precio tachado: nunca se baja a la Clásica**, porque después de una venta a ese precio Mercado Libre puede no dejar volver a subirlo y se perdería el descuento. A las 24 horas sin campaña aparece en [Precios en ML › Alertas](/catalogo/precios-ml) («Sin campaña hace más de 24 horas»).

### 8. El plan destacado (catálogo)

En las publicaciones de catálogo, Mercado Libre informa el **precio para ganar** el recuadro. Laucen elige el plan que mejor cierra a ese precio (que deje al menos lo de la Clásica más su % extra) y lo pone ahí; si deja de ganar, avisa en Alertas.

### 9. Descuento por volumen

Se puede definir por rango de Clásica ("desde 3 unidades, −5 %"), pero **hoy Mercado Libre sólo lo permite en neumáticos**: en el resto de las categorías (notebooks incluidas) está apagado.

### 10. Qué es configurable y qué es fijo

- **Se configura** en [Precios en ML](/catalogo/precios-ml), por cuenta y con excepciones por categoría o producto: el descuento que ve el comprador, «¿Gana?» (para forzar quién gana en una cuenta, categoría o producto), descuento por volumen y los interruptores de cada cuenta. En [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), por grupo de categorías y para todas las cuentas: qué planes se usan, cuántas cuotas ve el comprador, el % extra de cada plan, **quién gana** la Clásica y cada plan (una cuenta o «Rota») y cuánto más caras van las que no ganan. En [Listas de precios](/catalogo/precios): las listas, sus bases y coeficientes y «Aplica descuentos».
- **Fijo**: el mínimo de 5 % de descuento que pide ML; la barrera de $ 33.000 para los planes (sale de los costos de Mercado Libre y se ajusta sola); las comisiones (salen de Costos ML); el redondeo a pesos enteros; una publicación con tachado nunca se baja a la Clásica; un cambio automático que dio error no se reintenta igual por 6 horas.

### 11. Qué sale solo y qué espera tu clic

- **Ningún cambio a Mercado Libre sale por un pedido en el chat**: se prepara y queda un **lote** en la [Cola de Mercado Libre](/config/canales/cola) esperando **Mandar a Mercado Libre**.
- Sale solo **sólo** en las cuentas con «Sincronizar precios» prendido (prenderlo es tu clic): cuando cambia un precio de la lista, cuando cambia una regla, cuando ML ofrece una campaña nueva y en una pasada por noche. Nunca crea publicaciones.
- La web y el local no pasan por la cola: toman el precio de su lista en el momento.

### Ejemplo: una notebook en las 5 cuentas

Lista Clásicas (la Clásica) **$ 1.256.226**, descuento 45 % (el comprador ve −45 %):
1. Tachado = 1.256.226 ÷ 0,55 = **$ 2.284.047** (lo calcula el sistema).
2. **.BAIRES** (gana la Clásica): publica al tachado, $ 2.284.047, y por campaña cobra **$ 1.256.226**.
3. **Las otras 4 cuentas** (no ganan la Clásica): 1.256.226 × 1,03 = **$ 1.293.913**.
4. Los planes del grupo Notebooks salen de la Clásica del esquema por la fórmula del punto 5, más el 3 % en las cuentas que no los ganan (según «Quién gana» del grupo), y también se publican al tachado y bajan por campaña.
5. La Web minorista muestra $ 1.256.226 tachado y cobra 17 % menos (el descuento de la familia): $ 1.042.668. El Local cobra $ 1.256.226.

## Preguntas frecuentes

**Si no hay ninguna campaña, ¿qué paga el comprador?** Con tachado, el tachado (por eso Laucen la mete en una apenas ML la ofrece). Sin tachado, la Clásica.

**¿Laucen puede vender por debajo de lo que corresponde?** Por su cuenta no: nunca entra a una campaña debajo del piso. Puede pasar con una campaña que arma ML o una que cargaste a mano; aparece en Alertas para sacarla.

**¿Dónde veo los números de un producto antes de mandarlos?** En la [Vista previa](/catalogo/precios-ml/vista-previa), buscando su SKU.

## Relacionado

- [Listas de precios](/catalogo/precios)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Vista previa de precios](/catalogo/precios-ml/vista-previa)
- [Productos](/catalogo/productos)
