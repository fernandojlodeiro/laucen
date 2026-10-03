---
titulo: Panel
menu: Panel
ruta: /panel
rutas: /panel
permiso: panel_ver
resumen: La pantalla de inicio: tarjetas con lo pendiente (pedidos abiertos, stock bajo el mínimo, vendido sin stock, preguntas, envíos, ventas sin vincular y reclamos).
---

## Para qué sirve

Es la **pantalla de inicio** de Laucen: de un vistazo muestra lo que hay que atender hoy. Cada tarjeta resume un tema (pedidos, stock, preguntas, envíos, reclamos) y cada renglón lleva a la pantalla donde se resuelve.

## Cómo se llega

- Es a donde vas después de entrar al sistema.
- **"Panel"**, primera opción de la barra de menú, o tocando **"Laucen"** arriba a la izquierda (en la PC y en el celular).

## Qué hay en la pantalla

Un título **"Panel"** y una grilla de tarjetas (tres por fila en pantallas anchas, una por fila en el celular). Cada tarjeta tiene:

- Su título y, a la derecha, un botón **"Ver"** que lleva a la pantalla completa del tema.
- Renglones con un texto a la izquierda y un número (o dato) a la derecha. Si el renglón es un enlace, tocándolo vas a esa lista ya filtrada.
- Los números que piden atención se ven **en rojo**.
- Una tarjeta que todavía no se calcula se ve gris, con borde punteado, y dice **"Próximamente"**.
- Si una tarjeta no se pudo calcular, muestra el error en rojo adentro de la tarjeta; las demás se ven igual.

**Cada persona ve sólo las tarjetas de lo que su rol puede ver** (por ejemplo, sin el permiso «Envíos», no aparece la tarjeta de envíos).

Las tarjetas, en orden:

1. **Pedidos abiertos** (permiso «Pedidos»; "Ver" → [Pedidos](/ventas/pedidos)).
2. **Productos bajo el stock mínimo** (permiso «Consulta de stock»).
3. **Vendido sin stock (disponible negativo)** (permiso «Consulta de stock»).
4. **Preguntas sin responder** (permiso «Preguntas y mensajes»).
5. **Facturas pendientes**: **próximamente** (todavía no se calcula).
6. **Envíos para despachar** (permiso «Envíos»).
7. **Ventas de artículos sin vincular** (permiso «Publicaciones»).
8. **Reclamos y devoluciones** (permiso «Reclamos y devoluciones»).

## Cómo se hace

### Ver los pedidos que hay que preparar

1. En la tarjeta **"Pedidos abiertos"**, mirá el renglón **"Pagados (sin preparar)"**.
2. Tocalo: abre [Pedidos](/ventas/pedidos) filtrado por estado Pagado.

### Ver qué productos reponer

1. En **"Productos bajo el stock mínimo"**, cada renglón es un SKU con su título y "disponible / mínimo".
2. Tocá el renglón para abrir esa variación en [Consulta de stock](/stock/consulta), o **"Ver"** para la lista completa filtrada por "bajo mínimo".

### Ver qué se vendió sin tener stock

1. En **"Vendido sin stock (disponible negativo)"**, cada renglón es un SKU con su disponible (negativo).
2. Tocalo para ver la variación en [Consulta de stock](/stock/consulta), o **"Ver"** para la lista filtrada.

### Responder las preguntas atrasadas

1. En **"Preguntas sin responder"**, cada renglón muestra la pregunta, el título de la publicación y hace cuánto llegó ("recién", "3 h", "2 d").
2. Tocá cualquiera para ir a [Preguntas y mensajes](/ventas/preguntas).

## Criterios y reglas

De dónde sale cada número (se calcula en el momento, cada vez que abrís el Panel):

### Pedidos abiertos

Cuenta los pedidos de la organización por estado, de todos los canales:

| Renglón | Qué cuenta | Lleva a |
|---|---|---|
| **Nuevos** | pedidos en estado Nuevo | Pedidos filtrados por Nuevo |
| **Pagados (sin preparar)** | en estado Pagado | Pedidos filtrados por Pagado |
| **En preparación** | en estado En preparación | Pedidos filtrados por En preparación |
| **Preparados (sin despachar)** | en estado Preparado | Pedidos filtrados por Preparado |
| **Despachados** | en estado Despachado | Pedidos filtrados por Despachado |

- **En rojo**: "Pagados (sin preparar)" y "Preparados (sin despachar)" cuando son más que cero (son los que alguien tiene que mover).
- Ojo: acá cuenta por el estado del pedido. Un pedido «A cobrar» (efectivo al retirar) está en estado Nuevo hasta que se prepara, así que cuenta en "Nuevos". El contador "Pedidos sin preparar" de la barra de estado usa otro criterio (nuevos + pagados + «A cobrar» sin entregar), por eso los números pueden no coincidir.

### Productos bajo el stock mínimo

- Mira las variaciones **activas** de productos **activos** que tienen **stock mínimo cargado** en el producto, y que **no son kits**.
- El disponible es la suma, en todos los depósitos y ubicaciones, de lo que hay menos lo reservado.
- Aparece si el disponible es **menor** que el stock mínimo. Se muestran las 8 con menos disponible, como "disponible / mínimo", todas en rojo.
- Si no hay ninguna: "Ninguno (los productos sin stock mínimo cargado no cuentan)".

### Vendido sin stock (disponible negativo)

- Las variaciones cuyo disponible total (cantidad menos reservado, sumando todo) es **menor que cero**: se reservó o vendió más de lo que había. Pasa cuando entra una venta sin stock suficiente: la reserva se hace igual y queda negativa en la ubicación general del depósito.
- Las 8 más negativas, en rojo. Si no hay: "Nada".

### Preguntas sin responder

- Las preguntas de Mercado Libre en estado sin responder, **las más viejas primero**, hasta 6.
- El dato de la derecha es hace cuánto llegó: menos de 1 hora "recién", menos de 24 h en horas, si no en días.
- **En rojo** las que tienen más de 1 hora.
- Si no hay: "Ninguna".

### Envíos para despachar

Mira los envíos (hoy, los de Mercado Envíos) en estado "Listo para despachar" o "En preparación", **sin contar los de Full** (esos los despacha Mercado Libre):

| Renglón | Qué cuenta |
|---|---|
| **Para despachar** | todos esos envíos |
| **Vencen hoy** | los que hay que despachar antes de una hora de hoy (día argentino); en rojo si hay alguno |
| **Atrasados** | los que ya pasaron su hora límite de despacho; en rojo si hay alguno |
| **Etiquetas sin imprimir** | los que todavía no tienen la etiqueta impresa |

Todos llevan a [Envíos](/ventas/envios).

### Ventas de artículos sin vincular

- Cuenta los pedidos **abiertos** (no cancelados ni entregados) que tienen al menos una línea de un artículo de Mercado Libre que **no está vinculado a un producto** de Laucen. Esas líneas **no descuentan stock**.
- En rojo si hay alguno. "Ver" lleva a [Vincular con Mercado Libre](/catalogo/publicaciones/ml), donde se vinculan.

### Reclamos y devoluciones

Sobre los reclamos no resueltos:

| Renglón | Qué cuenta | Lleva a |
|---|---|---|
| **Reclamos por responder** | los de Mercado Libre que esperan tu respuesta (tienen una acción obligatoria) más los de la web o el local en estado Abierto | Reclamos |
| **Vencen en menos de 24 h** | los que esperan tu respuesta y vencen en las próximas 24 horas | Reclamos |
| **En mediación** | los que están en la etapa de mediación de Mercado Libre | Reclamos, pestaña En mediación |
| **Devoluciones en camino** | los que tienen el producto volviendo (etiqueta generada o en camino) | Reclamos, pestaña Devoluciones en camino |

"Reclamos por responder" y "Vencen en menos de 24 h" se ponen en rojo cuando hay alguno que vence en menos de 24 h; "En mediación", cuando hay alguno.

### Otras reglas

- Si tu rol no tiene el permiso «Panel», al entrar vas a [Radar](/radar) en lugar del Panel.
- El Panel no se actualiza solo: refleja el momento en que lo abriste. Para ver lo último, volvé a abrirlo.

## Preguntas frecuentes

**¿Por qué "Pedidos sin preparar" de la barra de abajo no coincide con la tarjeta de pedidos?**
Porque cuentan distinto: la barra suma nuevos, pagados y los «A cobrar» sin entregar; la tarjeta cuenta cada estado por separado.

**Un producto está sin stock pero no aparece en "bajo el stock mínimo".**
Sólo cuentan los productos con stock mínimo cargado en su ficha. Si es un kit, tampoco cuenta.

**¿Qué significa un número negativo en "Vendido sin stock"?**
Que se vendieron (o reservaron) más unidades de las que había. Hay que reponer o corregir el stock.

**La tarjeta "Facturas pendientes" dice "Próximamente".**
Todavía no está hecha.

**¿Por qué no veo la tarjeta de envíos?**
Tu rol no tiene el permiso «Envíos».

**Los envíos de Full no aparecen en "Para despachar".**
Es a propósito: los despacha Mercado Libre desde su depósito.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Envíos](/ventas/envios)
- [Preguntas y mensajes](/ventas/preguntas)
- [Reclamos y devoluciones](/ventas/reclamos)
- [Consulta de stock](/stock/consulta)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
