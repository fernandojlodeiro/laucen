---
titulo: Envíos
menu: Ventas › Envíos
ruta: /ventas/envios
rutas: /ventas/envios
permiso: envios_ver
resumen: Los envíos de los pedidos (hoy, los de Mercado Envíos): qué hay que despachar y para cuándo, qué está en camino y qué se entregó; impresión de etiquetas y hojas de preparación.
---

## Para qué sirve

Muestra los **envíos de los pedidos** —hoy, los de **Mercado Envíos** (las ventas de Mercado Libre)— para saber **qué hay que despachar y hasta cuándo**, qué está en camino y qué ya se entregó. Desde acá se imprimen, de los envíos que tildes, las **etiquetas** de Mercado Libre junto con la **hoja de preparación** de cada pedido, o sólo las etiquetas (en PDF o para la impresora térmica).

## Cómo se llega

- Menú **Ventas › Envíos**.
- La tarjeta **"Envíos para despachar"** del [Panel](/panel) (cualquiera de sus renglones).

## Qué hay en la pantalla

**Arriba a la derecha**: el desplegable de columnas del Excel, **"⬇ Descargar Excel"** y **"⚙ Configurar…"**.

**Pestañas** (cada una con su cantidad entre paréntesis):

| Pestaña | Qué muestra |
|---|---|
| **Para despachar** (la de entrada) | envíos "Etiqueta lista" o "En preparación", **sin los de Full** |
| **En camino** | envíos "En camino" |
| **Entregados** | envíos entregados |
| **Todos** | todos |

**Filtros**: **"Buscar"** ("Nº de pedido, tracking o cliente": busca en el tracking, el id del envío, el id externo del pedido, el nombre del cliente o de quien recibe y, si es un número, el Nº de pedido) y **"Canal"**. Acá se aplican con el botón **"Filtrar"**; **"Limpiar"** los saca.

**Columnas**:

| Columna | Qué muestra |
|---|---|
| (casilla) | para tildar los envíos a imprimir; sólo en los que tienen etiqueta (no en los de Full) |
| **Pedido** | Nº de pedido (enlace a la ficha), su id externo debajo y, si es un carrito en espera, "Carrito: esperando · faltan N min" |
| **Fecha** | la del pedido |
| **Cliente** | el cliente (enlace a su ficha) o, si no hay, quien recibe |
| **Canal** | tocándolo filtra por ese canal |
| **Logística** | Full, Flex, Colecta, Despacho en correo/punto, A convenir |
| **Método** | el método de envío que informa Mercado Libre |
| **Estado** | Pendiente, En preparación, Etiqueta lista, En camino, Entregado, No entregado, Cancelado; debajo, el subestado ("Etiqueta lista para imprimir", "Etiqueta impresa") |
| **Despachar antes de** | fecha y hora límite para despacharlo; **en rojo** si vence hoy o ya venció |
| **Tracking** | el número de seguimiento |
| **Etiqueta impresa** | cuándo se imprimió la etiqueta desde Laucen |

Todas las columnas se ordenan tocando el título. Abajo, el paginador de 50 por página.

**Debajo de la tabla**, los botones de impresión (actúan sobre los tildados):
- **"🖨 Imprimir etiquetas y hojas"** (el principal).
- **"Papel"**: **"10 × 15 cm (térmica)"** o **"A4"** (queda recordado).
- **"Sólo etiquetas (PDF)"**.
- **"Etiquetas térmicas (ZPL)"**.

Los botones están deshabilitados si en la página no hay ningún envío imprimible.

## Cómo se hace

### Ver qué hay que despachar hoy

1. Abrí **Envíos**: entra en **"Para despachar"**, ordenado por **"Despachar antes de"**, lo más urgente primero.
2. Los que tienen la fecha en rojo vencen hoy o ya están atrasados.

### Imprimir etiqueta + hoja de preparación

1. En **"Para despachar"**, tildá los envíos.
2. Elegí el **"Papel"** (10 × 15 para la térmica, o A4).
3. Apretá **"🖨 Imprimir etiquetas y hojas"**. Se abre en otra pestaña un PDF con, por cada pedido, su etiqueta de Mercado Libre y su hoja de preparación (en A4, las dos juntas en una sola hoja por pedido: la etiqueta arriba a la izquierda, los datos al costado y los productos abajo; ver [Picking](/deposito/picking)).
4. Los pedidos que todavía no estaban en preparación **entran en un lote de [Picking](/deposito/picking)**.
5. Queda marcada la etiqueta como impresa; si se vuelve a imprimir, la hoja sale con "REIMPRESIÓN".

### Imprimir sólo las etiquetas

1. Tildá los envíos (**de una misma cuenta** de Mercado Libre; si tenés varias, filtrá por canal).
2. Apretá **"Sólo etiquetas (PDF)"** (se abre en otra pestaña) o **"Etiquetas térmicas (ZPL)"** (se baja un archivo para mandar a la impresora térmica).
3. Quedan marcadas como impresas (columna "Etiqueta impresa").

Errores típicos (se ven como texto en la pestaña nueva):
- "No tildaste ningún envío. Volvé a la pantalla de envíos y elegí cuáles imprimir."
- "Tildaste envíos de varias cuentas de Mercado Libre. Imprimí de a una cuenta por vez (filtrá por canal)."
- "Ninguno de esos envíos tiene etiqueta para imprimir (los de Full no llevan)."
- El mensaje de carrito en espera, si alguno de los pedidos es un carrito de Mercado Libre que todavía está esperando.

### Buscar un envío

1. Escribí en **"Buscar"** el Nº de pedido, el tracking o el nombre del cliente.
2. Si querés, elegí el **"Canal"**.
3. Apretá **"Filtrar"**. Para sacar los filtros, **"Limpiar"**.

## Criterios y reglas

- **"Etiqueta lista" no quiere decir que el pedido esté preparado.** Es el estado del envío en Mercado Libre: lo pone ML solo cuando el pago está aprobado y la etiqueta ya está generada (en general, a los pocos segundos de pagar). Si el pedido todavía figura como **Pagado**, falta prepararlo: el avance de armado lo dice el estado del pedido (Pagado → En preparación → Preparado), no el del envío.

- **De dónde salen los envíos**: de Mercado Envíos. Se crean y actualizan solos cuando Mercado Libre avisa un cambio en un envío o en una venta. Los pedidos cargados a mano o de la tienda web con envío propio **no** aparecen acá (sus datos de entrega se ven en la ficha del pedido).
- **"Para despachar"** = envíos "Etiqueta lista" o "En preparación" que **no son Full**. Los de **Full** los despacha Mercado Libre desde su depósito: no llevan etiqueta ni se tildan.
- **Orden**: en "Para despachar", por la hora límite de despacho (lo más urgente arriba; los que no tienen hora, al final). En las demás pestañas, por fecha del pedido, lo más nuevo primero.
- **En rojo**: la hora límite se pinta de rojo si el envío todavía no salió y su día límite es hoy o ya pasó (día argentino).
- **Imprimibles**: sólo envíos con id de Mercado Envíos y que no sean de Full.
- **Carritos en espera**: un carrito de Mercado Libre que recibió un cambio hace menos de 10 minutos no se puede etiquetar (su casilla está deshabilitada): puede que todavía le falte llegar otra orden. Ver [Pedidos](/ventas/pedidos).
- **"Sólo etiquetas"** pide etiquetas de una sola cuenta de Mercado Libre por vez. **"Imprimir etiquetas y hojas"** arma un PDF por pedido con etiqueta + hoja.
- **Al imprimir**, se anota la fecha y hora en "Etiqueta impresa". Imprimir no cambia el estado del envío en Mercado Libre: lo cambia Mercado Libre cuando el envío sale.
- **Estados del pedido**: cuando Mercado Envíos marca el envío **en camino**, el pedido pasa solo a **Despachado** (y el stock reservado se da por vendido); cuando lo marca **entregado**, el pedido pasa a **Entregado**.
- **Excel**: baja la pestaña, filtros y orden de la pantalla; además de las columnas de pantalla ofrece Pedido (id externo), Recibe, Subestado, Entrega estimada, Transportista, Costo $, Dirección e Id del envío (ML).

## Preguntas frecuentes

**¿Por qué no puedo tildar un envío?**
Porque es de Full (no lleva etiqueta), o porque el pedido es un carrito de Mercado Libre en espera (esperá unos minutos).

**Tengo dos cuentas de Mercado Libre y "Sólo etiquetas" me da error.**
Imprimí de a una cuenta: filtrá por "Canal" y tildá sólo los de esa cuenta.

**¿Qué diferencia hay entre "Imprimir etiquetas y hojas" y "Sólo etiquetas"?**
La primera agrega la hoja de preparación de cada pedido y mete en picking los que faltaba preparar. La segunda baja sólo las etiquetas.

**¿Para qué sirve ZPL?**
Es el formato de las impresoras térmicas de etiquetas: se baja un archivo para mandarle a la impresora.

**Un envío de la tienda web no aparece.**
Esta pantalla muestra los envíos de Mercado Envíos. Los datos de entrega de otros pedidos están en la ficha del pedido.

**Imprimí la etiqueta pero el envío sigue "Etiqueta lista".**
Es normal: cambia a "En camino" cuando Mercado Libre registra que salió.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Picking](/deposito/picking)
- [Etiquetas](/deposito/etiquetas)
- [Panel](/panel)
