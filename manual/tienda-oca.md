---
titulo: OCA (envíos con OCA ePak)
menu: Tienda web › Métodos de envío › Cuenta de OCA
ruta: /config/envios/oca
rutas: /config/envios/oca
permiso: tienda_config
resumen: Conectar la cuenta de OCA ePak para que la tienda cotice el envío por código postal (a domicilio o a sucursal), dar de alta el envío desde el pedido con su etiqueta, y que el seguimiento se actualice solo.
---

## Para qué sirve

Con la cuenta de OCA cargada:

- La **tienda web** cotiza el envío de OCA en el momento, con el código postal del comprador y el peso y las medidas de lo que compra. Puede ser **a domicilio** o **a sucursal** (el comprador elige la sucursal de OCA donde retira).
- Desde la **ficha del pedido** se lo da de alta en OCA con un botón, y sale la **etiqueta de OCA** para imprimir.
- El **seguimiento** se lee solo de OCA cada media hora: el pedido pasa a **Despachado** cuando OCA lo tiene en camino y a **Entregado** cuando OCA lo entrega.

## Cómo se llega

- [Métodos de envío](/config/envios) › botón **"Cuenta de OCA"** arriba a la derecha.

## Qué hay en la pantalla

Abre en vista. Arriba a la derecha, **"Probar con OCA"** y el lápiz; editando, **"Grabar"** y **"Cancelar"**. Si falta algo para dar de alta envíos, un aviso amarillo dice qué. La última prueba queda a la vista (verde si anduvo, rojo con lo que contestó OCA si no).

- **Cuenta**: **Usuario de ePak** (el mail con el que entrás a ePak), **Contraseña de ePak** (sólo dice "Cargada"; nunca se muestra; en edición, vacía deja la que estaba), **CUIT**, **Número de cuenta** (el de OCA, con la barra, ej. 111757/001), **Operativa a domicilio** y **Operativa a sucursal** (los números que te dio OCA para cada servicio; vacía = ese servicio no se ofrece).
- **De dónde sale**: la dirección de donde OCA retira (calle, número, piso, depto, código postal, localidad, provincia), **Contacto**, **Mail**, **Teléfono**, **Franja de retiro** (8 a 17, 8 a 12 o 14 a 17 h) y **Sucursal donde lo dejás** (si en vez de que OCA retire lo llevás vos a una sucursal: el número de esa sucursal; vacío = OCA retira).
- **Caja estándar**: **Peso (gramos)**, **Largo**, **Ancho** y **Alto (cm)**. De entrada 500 g y 20 × 15 × 10 cm.

## Cómo se hace

### Conectar OCA

1. En [Métodos de envío](/config/envios), apretá **"Cuenta de OCA"**.
2. Tocá el lápiz, cargá los datos que te dio OCA y la dirección de origen, y apretá **"Grabar"**.
3. Apretá **"Probar con OCA"**: cotiza una caja estándar a Córdoba capital (CP 5000) con cada operativa. Si anduvo, queda en verde con el precio.
4. En [Métodos de envío](/config/envios), creá **"OCA a domicilio"** y/o **"OCA a sucursal"** con **"Nuevo método de envío"** y prendelos.

### Despachar un pedido por OCA

1. Abrí el pedido en [Pedidos](/ventas/pedidos). En el recuadro **"Envío"**, apretá **"🚚 Despachar por OCA"** y confirmá con **"Sí"**.
2. Corre de fondo; al terminar aparece el cartel con el número de envío de OCA.
3. Apretá **"🖨 Etiqueta de OCA"** (abre el PDF en otra pestaña). También sale sola en **"Imprimir etiquetas y hojas"** de [Picking](/deposito/picking) y [Envíos](/ventas/envios), pegada a la hoja de preparación.
4. Mientras OCA no lo retiró, **"Anular en OCA"** lo anula (pregunta antes).

### Ver por dónde anda

En la ficha del pedido, debajo del número de envío, los últimos movimientos que informó OCA (el más nuevo arriba). **"↻ Actualizar seguimiento"** lo lee en el momento; si no, se lee solo cada media hora.

## Criterios y reglas

- **El precio**: lo que cotiza OCA (con IVA) para el código postal del comprador, más el **"Costo $"** del método de envío si tiene (por ejemplo, el embalaje). Si la compra llega al **"Gratis desde $"** del método, o una regla comercial bonifica el envío, es gratis. Si la tienda vende en dólares, se pasa al tipo de cambio del día.
- **El bulto**: todo el pedido va en una sola caja. El peso es la suma del peso de cada producto. El volumen es la suma de las medidas de cada producto. Los productos sin peso o sin medidas en su ficha cuentan como la **caja estándar**.
- **Sin código postal** la tienda muestra "Según código postal" y no deja confirmar hasta que el comprador lo pone.
- Si OCA no contesta o no cotiza ese código postal, la tienda le pide al comprador que lo revise o elija otra forma de entrega.
- **OCA a sucursal**: el comprador elige entre las sucursales de OCA que entregan paquetes en su código postal; la sucursal queda en el pedido.
- **El valor declarado** es el total de los productos (sin el envío).
- **Despachar por OCA** se ofrece en los pedidos que no son de Mercado Libre, tienen dirección con código postal y todavía no se despacharon. Si el pedido es «OCA a sucursal», usa la operativa a sucursal y la sucursal elegida; si no, la de domicilio.
- **Seguimiento automático**: cada media hora, todos los envíos de OCA de los últimos 60 días que no terminaron. Cuando OCA informa el primer movimiento, el envío pasa a **En camino** y el pedido a **Despachado** (se descuenta el stock). Si el pedido estaba Nuevo (sin pagar), no se mueve. Cuando OCA lo entrega, el pedido pasa a **Entregado**. Si OCA lo devuelve, el envío queda **Devuelto**; el pedido no se toca.
- **Anular** sólo se puede antes de que OCA lo tenga en camino.
- La contraseña de ePak no se muestra nunca.

## Preguntas frecuentes

**¿Dónde consigo las operativas y el número de cuenta?**
Te los da OCA al abrir la cuenta. Son los mismos que usa la tienda que tenías antes.

**La tienda no muestra el precio de OCA.**
Fijate que el comprador haya puesto el código postal, y que **"Probar con OCA"** dé verde.

**¿Por qué cobra más de lo que esperaba?**
Puede que haya productos sin peso o medidas: cuentan como la caja estándar. Cargales el peso y las medidas en su ficha.
