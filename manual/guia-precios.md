---
titulo: Cómo funcionan los precios (guía conceptual)
menu: Catálogo › Listas de precios y Precios en ML (guía conceptual)
ruta: /catalogo/precios-ml
rutas: /catalogo/precios, /catalogo/precios-ml, /catalogo/precios-ml/vista-previa
permiso: precios_ml_ver
resumen: El sistema de precios entero, en conceptos: un solo precio cargado a mano por producto (la lista Clásicas) y de ahí, por reglas, el de cada canal, cada cuenta de Mercado Libre, cada plan de cuotas, el tachado, las campañas con su piso, quién gana entre las cuentas, la web y el local; qué se configura, qué es fijo y qué sale solo.
---

## Para qué sirve

Para entender **de dónde sale cada precio** que ve un comprador, en cualquier canal, sin entrar en el detalle de cada pantalla. El detalle (campos, botones, fórmulas completas) está en [Listas de precios](/catalogo/precios) y [Precios en Mercado Libre](/catalogo/precios-ml).

## Cómo se llega

Las pantallas son [Catálogo › Listas de precios](/catalogo/precios), [Catálogo › Precios en Mercado Libre](/catalogo/precios-ml) (con su [Vista previa](/catalogo/precios-ml/vista-previa)) y la pestaña **Precios** de la ficha de cada producto.

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

- El precio de la lista Clásicas es la **Clásica**: lo que paga el comprador en la publicación Clásica de la cuenta que gana (Fer, 8/10).
- **Tachado = Clásica ÷ (1 − Descuento %)**: el precio "de antes" que ve el comprador tachado. Vos decidís el **descuento que ve el comprador** (por ejemplo 45 %) y el sistema calcula el tachado.
- **Tachado 0 %** (lo normal): tachado y Clásica son lo mismo; la publicación va a ese precio y no necesita campaña.
- **Con tachado**: la publicación se publica **al tachado** y una **campaña** de Mercado Libre la baja a la Clásica; así se ve "X % OFF". El descuento que ve el comprador = Tachado ÷ (100 + Tachado). Ejemplo de las notebooks: Tachado 81,8 % → el comprador ve **−45 %**. Mercado Libre pide al menos 5 % de descuento para mostrarlo.
- El tachado es **uno solo por modelo**: el mismo en todas las cuentas y en todos sus planes.

### 5. Los planes de cuotas: una publicación por plan

En Mercado Libre, las cuotas sin interés son **publicaciones aparte** (Premium con la marca del plan): la de 3 cuotas (el comprador la ve "6 cuotas") y la de 12 cuotas, además de la Clásica. Cada una tiene su precio:

**Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + margen extra)**

O sea: cada plan deja, después de su comisión, **lo mismo que la Clásica más un margen**. Las comisiones son las reales de la categoría (las releva Costos ML todos los días).

**Qué planes lleva cada producto: por montos.** En cada cuenta, cada plan tiene **Activo** y **«Desde una Clásica de»**: un producto lleva el plan sólo si su Clásica llega a ese monto. Un producto barato sale sólo con la Clásica; uno caro, con todos.

### 6. Quién gana entre tus cuentas

Las 5 cuentas venden lo mismo; para no competir entre ellas, **una sola gana cada precio** (la Clásica y cada plan) y las demás van **3 % más caras**:
- **.BAIRES** gana la Clásica y la de 12 cuotas.
- La de 3 cuotas se reparte entre las otras cuentas (el botón **Publicar en todas las cuentas** la da a la que menos gana).
- Se configura en [Precios en ML](/catalogo/precios-ml): columna «¿Gana? (si no, +%)» para toda la cuenta, o por categoría o producto en «Excepciones» (0 = gana; 3 = no gana).

### 7. Campañas y el piso

- **El piso** de cada publicación es el precio que le da el esquema (la Clásica de la cuenta, o el precio de su plan). Laucen **nunca** la mete en una campaña por debajo del piso.
- Entra a una campaña **sólo si el rango de precios que acepta la campaña incluye nuestro precio**; si no la acepta, no entra.
- **En campaña, el tachado no se toca y el precio sólo baja** (para cambiar el precio hay que salir de la campaña y volver a entrar).
- Campañas que se superponen: entra en todas las que acepten el precio; el comprador paga la más baja de las propias.
- Las campañas que arma Mercado Libre con descuento compartido («Potencia tus ventas») **no** se usan para calcular. Si una campaña (propia o de ML) deja una publicación por debajo del piso —en las de ML cuenta sólo la parte que ponés vos—, aparece en [Precios en ML › Alertas](/catalogo/precios-ml) con el botón **Sacar de la campaña**.
- Una publicación con tachado necesita campaña para cobrar la Clásica: sin campaña, el comprador pagaría el tachado. Laucen la mete sola en cuanto ML le ofrece una (lee las ofertas cada hora), si la cuenta tiene «Sincronizar precios» prendido.

### 8. El plan destacado (catálogo)

En las publicaciones de catálogo, Mercado Libre informa el **precio para ganar** el recuadro. Laucen elige el plan que mejor cierra a ese precio (que deje al menos lo de la Clásica más su margen) y lo pone ahí; si deja de ganar, avisa en Alertas.

### 9. Descuento por volumen

Se puede definir por rango de Clásica ("desde 3 unidades, −5 %"), pero **hoy Mercado Libre sólo lo permite en neumáticos**: en el resto de las categorías (notebooks incluidas) está apagado.

### 10. Qué es configurable y qué es fijo

- **Se configura** (en [Precios en ML](/catalogo/precios-ml), por cuenta y con excepciones por categoría o producto): el descuento que ve el comprador, planes activos, «Desde una Clásica de», margen extra, cuotas que ve el comprador, «¿Gana?», descuento por volumen y los interruptores de cada cuenta. En [Listas de precios](/catalogo/precios): las listas, sus bases y coeficientes y «Aplica descuentos».
- **Fijo**: el mínimo de 5 % de descuento que pide ML; las comisiones (salen de Costos ML); el redondeo a pesos enteros; el reparto del botón «Publicar en todas las cuentas» (.BAIRES gana Clásica y 12 cuotas, 3 % para la que no gana); un cambio automático que dio error no se reintenta igual por 6 horas.

### 11. Qué sale solo y qué espera tu clic

- **Ningún cambio a Mercado Libre sale por un pedido en el chat**: se prepara y queda un **lote** en la [Cola de Mercado Libre](/config/canales/cola) esperando **Mandar a Mercado Libre**.
- Sale solo **sólo** en las cuentas con «Sincronizar precios» prendido (prenderlo es tu clic): cuando cambia un precio de la lista, cuando cambia una regla, cuando ML ofrece una campaña nueva y en una pasada por noche. Nunca crea publicaciones.
- La web y el local no pasan por la cola: toman el precio de su lista en el momento.

### Ejemplo: una notebook en las 5 cuentas

Lista Clásicas (la Clásica) **$ 1.256.226**, Tachado 81,8 % (el comprador ve −45 %):
1. Tachado = 1.256.226 × 1,818 = **$ 2.284.047** (lo calcula el sistema).
2. **.BAIRES** (gana la Clásica): publica al tachado, $ 2.284.047, y por campaña cobra **$ 1.256.226**.
3. **Las otras 4 cuentas** (no ganan la Clásica): 1.256.226 × 1,03 = **$ 1.293.913**.
4. Los planes de 3 y 12 cuotas salen de la Clásica del esquema por la fórmula del punto 5, más el 3 % en las cuentas que no los ganan, y también se publican al tachado y bajan por campaña.
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
