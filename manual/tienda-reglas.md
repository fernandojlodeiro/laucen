---
titulo: Reglas comerciales
menu: Tienda web › Reglas comerciales
ruta: /config/reglas
rutas: /config/reglas
permiso: reglas_ver
resumen: Promociones de la tienda web: descuentos por cantidad, por monto, por medio de pago y envío gratis, con vigencia, prioridad y si se acumulan.
---

## Para qué sirve

Acá se cargan las **promociones de la tienda web**: cada regla es **condición → acción**, por ejemplo «3 o más de Familia Placas → 10 % de descuento» o «Compras desde $ 100.000 → Envío gratis». Se aplican solas en el carrito, el checkout y el pedido que se crea.

No afectan a Mercado Libre (allá el descuento por volumen está en [Precios en Mercado Libre](/catalogo/precios-ml)).

## Cómo se llega

- Menú **Tienda web › Reglas comerciales**.
- Permiso «Reglas comerciales y cuotas».

## Qué hay en la pantalla

**Arriba a la derecha:** «Descargar Excel» y **«Nueva regla»**.

**Buscador** «Buscar regla» (por nombre, con la caja «Comienza por»).

**Tabla** (de a 50, se ordena tocando el título; de entrada, por prioridad):
- **Regla**: el nombre.
- **Qué hace**: la regla en criollo («3 o más de PL-001 (Placa…) → 10 % de descuento»), con enlace «ver producto» o «ver familia».
- **Activa**: un interruptor para prenderla o apagarla.
- **Vigencia**: «Siempre», «Desde el …», «Hasta el …» o «… al …». Marca «Vencida» si ya pasó y «Todavía no» si no empezó.
- **Acumulable**: «Se suma» / «No se suma».
- **Prioridad**: número.
- El **lápiz** (edita en la misma fila, con «Guardar» y «Cancelar») y el **tacho** (pregunta «¿Borrar?» con Sí / No).

Abajo: «Mayor prioridad = se aplica primero. Una regla no acumulable que se cumple corta las demás de descuento.»

**El formulario** (alta y edición):
- **Nombre** (obligatorio, por ejemplo «3 placas 10 % off»).
- **Condición**:
  - «Comprando N o más unidades de un producto» → «Unidades (N)» y «SKU del producto».
  - «Comprando N o más unidades de una familia» → «Unidades (N)» y «Familia» (buscador).
  - «Comprando N o más unidades (de cualquier producto)» → «Unidades (N)».
  - «Compras desde $ X» → «Desde $».
  - «Pagando con un medio» → «Medio de pago» (Mercado Pago, Payway, transferencia, efectivo, cuenta corriente, con el nombre que tengan en [Medios de pago](/config/medios-pago)).
- **Acción**: «% de descuento» (con «Descuento %»), «$ de descuento» (con «Descuento $») o «Envío gratis».
- **Vale desde** y **Hasta** (fechas, opcionales).
- **Prioridad** (número, 0 de entrada).
- Caja **«Acumulable: se suma con otras promociones»** (tildada de entrada).

## Cómo se hace

### Crear una promoción
1. **«Nueva regla»**.
2. Poné el **Nombre**, elegí la **Condición** y completá sus datos.
3. Elegí la **Acción** y el valor.
4. Si es por tiempo limitado, poné **Vale desde** / **Hasta**.
5. Ajustá **Prioridad** y **Acumulable**.
6. **«Crear»**. Queda **activa** («Regla creada (activa).»).

Errores típicos: «Ponele un nombre a la regla…», «Poné cuántas unidades hay que comprar.», «No encontré ningún producto con el SKU …», «Elegí la familia.», «Poné desde qué monto vale.», «Poné cuánto se descuenta.», «El descuento no puede pasar de 100 %.», «La vigencia termina antes de empezar.».

### Pausar una promoción sin borrarla
Apagá el interruptor de **Activa** en su fila. Para volver a usarla, prendelo.

### Cambiar o borrar una regla
**Lápiz** → cambiar → **«Guardar»**. **Tacho** → «Sí» para borrarla.

## Criterios y reglas

Las reglas las aplica el cálculo del carrito de la tienda (el mismo para carrito, checkout y pedido). En orden:

1. **Precio de partida:** cada línea arranca en su **precio de venta** de la lista de la tienda (ya con el descuento propio del producto o la familia, si tiene).
2. **Qué reglas entran:** las **activas** y **vigentes hoy** (desde ≤ hoy ≤ hasta; las fechas vacías no limitan). Se recorren de **mayor a menor prioridad**; a igual prioridad, la creada primero.
3. **Cuándo se cumple cada condición:**
   - Por cantidad: se suman las unidades del carrito **del producto**, **de la familia** (incluye sus subfamilias) o **de todo**, según la regla, y tiene que llegar a N.
   - Por monto: se compara con lo que **va quedando** del carrito después de los descuentos de las reglas anteriores (antes del descuento del medio de pago y sin envío).
   - Por medio de pago: si el cliente eligió ese medio.
4. **Envío gratis:** si se cumple, el envío queda bonificado. Esta acción **siempre** se aplica cuando se cumple la condición, sin importar «acumulable» ni otras reglas.
5. **Descuentos y acumulación:**
   - Una regla **no acumulable** se saltea si ya se aplicó antes algún descuento; y si se aplica, **corta** todas las reglas de descuento que vienen después.
   - Una regla acumulable se aplica salvo que una no acumulable ya haya cortado.
6. **Sobre qué se descuenta:**
   - Reglas por cantidad: **sólo sobre las líneas que cuentan** para la condición (ese producto, esa familia, o todo).
   - Reglas por monto y por medio de pago: sobre **todo el carrito**.
   - Siempre sobre lo que va quedando después de las reglas anteriores (los descuentos se encadenan, no se suman sobre el precio original).
   - «% de descuento»: ese % de la base (tope 100 %). «$ de descuento»: ese importe, sin pasar la base. El descuento se reparte entre las líneas en proporción a su importe. Se redondea a centavos.
7. **Después de las reglas**, se aplica el **descuento (o recargo) del medio de pago** que se cargó en [Medios de pago](/config/medios-pago), sobre lo que quedó. Esto no depende de las reglas ni de «acumulable».
8. **Envío:** se cobra según el método de envío elegido ([Métodos de envío](/config/envios)), salvo que una regla lo bonifique o el total de productos llegue al «gratis desde» del método.
9. Cada descuento aparece en el carrito con el **nombre de la regla** y su importe; el precio final de cada línea es el que queda en el pedido.

Las reglas valen para la tienda web (las que se crean en esta pantalla aplican a todas las tiendas de la organización). No se usan en Mercado Libre ni en los pedidos cargados a mano.

**Ejemplo:** carrito con 3 placas a $ 10.000 y un cable a $ 5.000 (total $ 35.000). Reglas: «3 o más de Familia Placas → 10 %» (prioridad 10, acumulable), «Compras desde $ 30.000 → $ 2.000 de descuento» (prioridad 5, acumulable), «Compras desde $ 30.000 → Envío gratis».
1. Placas: 10 % sobre $ 30.000 = $ 3.000. Quedan $ 32.000.
2. Monto: $ 32.000 ≥ $ 30.000 → $ 2.000 repartidos entre todas las líneas. Quedan $ 30.000.
3. Envío gratis: se cumple → envío $ 0.
Si la regla de placas fuera **no acumulable**, la de $ 2.000 no se aplicaría (el envío gratis sí).

## Preguntas frecuentes

**¿Qué regla se aplica primero?**
La de mayor prioridad. A igual prioridad, la más vieja.

**¿Qué hace "no acumulable"?**
Si ya hubo otro descuento antes, esa regla no se aplica; y si se aplica, ya no entra ninguna otra regla de descuento después. El envío gratis y el descuento del medio de pago igual se aplican.

**¿El descuento por cantidad se aplica a todo el carrito?**
No, sólo a las unidades del producto o la familia de la regla (o a todo si la regla es "de cualquier producto").

**¿El "compras desde $ X" mira el total con o sin descuentos?**
Lo que va quedando después de las reglas de mayor prioridad, sin el descuento del medio de pago y sin el envío.

**¿Por qué una regla no se aplica?**
Revisá que esté activa, que esté en fecha (no «Vencida» ni «Todavía no»), su prioridad y si una no acumulable de más prioridad la cortó.

**¿Sirve para Mercado Libre?**
No. Para Mercado Libre está el descuento por volumen en [Precios en Mercado Libre](/catalogo/precios-ml).

**¿Dónde pongo el descuento por pagar con transferencia?**
Puede ser una regla «Pagando con un medio», o el descuento propio del medio en [Medios de pago](/config/medios-pago). Si cargás los dos, se suman (primero la regla, después el del medio).

## Relacionado

- [Cuotas](/config/cuotas)
- [Medios de pago](/config/medios-pago)
- [Métodos de envío](/config/envios)
- [Tienda web](/config/tienda)
- [Listas de precios](/catalogo/precios)
