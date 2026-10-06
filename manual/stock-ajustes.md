---
titulo: Ajustes de stock
menu: Stock › Ajustes
ruta: /stock/ajustes
rutas: /stock/ajustes
permiso: stock_ajustar
resumen: Corregir el stock a mano (sumar o restar con motivo obligatorio) o pasarlo de una ubicación a otra.
---

## Para qué sirve

Para corregir el stock cuando no coincide con lo que hay de verdad (un conteo, una rotura, algo que apareció) y para mover mercadería de una ubicación o depósito a otro. Cada ajuste y cada transferencia queda registrado con quién lo hizo, cuándo y por qué.

## Cómo se llega

- Menú **Stock › Ajustes**.
- Desde [Consulta de stock](/stock/consulta): abriendo un producto, el botón **"Ajustar"** trae el SKU ya cargado en los dos formularios.

## Qué hay en la pantalla

Dos cajas, una al lado de la otra (una debajo de la otra en el celular). Los campos tienen borde grueso y oscuro y letra más grande, para que se vean bien.

### Ajuste

- **"Producto"**: se busca mientras se escribe (desde la segunda letra) por SKU, código de barras o **descripción**: lo escrito se busca tal cual, entero, en cualquier parte (con **?** se piden varias condiciones a la vez), y primero salen los que empiezan igual. Cada resultado muestra su foto, el SKU y el título. Al elegir el producto, abajo aparecen **las ubicaciones donde está**: si está en una sola, queda elegida sola; si está en varias, se toca la que corresponde.
- **"Depósito · ubicación"**: se elige con buscador (se escribe y filtra por depósito, código o descripción de la ubicación, en cualquier parte). Se muestra como "Depósito · código" o "Depósito · General". Se puede elegir cualquiera, también una donde el producto todavía no tiene stock (para sumarle).
- **"Sumar o restar"**: **"Sumar (+)"** o **"Restar (−)"**.
- **"Cantidad"**.
- **"Motivo (obligatorio)"** (por ejemplo: conteo físico, rotura, apareció en otro estante).
- Botón **"Ajustar"**.

### Transferencia

- **"Producto"**: igual que en el ajuste; **"Desde"** se completa con la ubicación donde está.
- **"Cantidad"**.
- **"Desde"** y **"Hacia"**: depósito y ubicación, con buscador.
- **"Nota (opcional)"**.
- Botón **"Transferir"**.

Debajo, la aclaración "Los kits no se ajustan: su stock se mueve con el de sus componentes."

### Últimos ajustes y transferencias

Los últimos 30 ajustes y transferencias de toda la empresa, con Fecha, Tipo, SKU (enlace a la [Consulta de stock](/stock/consulta) de ese producto), Desde, Hacia, Cantidad (los ajustes que restan con "−" en rojo, los que suman con "+"), Motivo / nota y Usuario.

Si todavía no hay ningún depósito, en lugar de los formularios aparece "Primero hace falta un depósito" con el enlace a [Depósitos y ubicaciones](/stock/depositos).

## Cómo se hace

### Corregir el stock después de un conteo

1. Contá lo que hay en la ubicación y mirá en [Consulta de stock](/stock/consulta) cuánto dice el sistema.
2. En la caja **Ajuste**, escribí el SKU o escaneá el código de barras.
3. Elegí el depósito y la ubicación donde está la diferencia.
4. Elegí **"Sumar (+)"** si hay más de lo que dice el sistema, o **"Restar (−)"** si hay menos.
5. Poné la **diferencia** en **"Cantidad"** (no el total contado: la cantidad a sumar o restar).
6. Escribí el **"Motivo"**, por ejemplo "conteo físico".
7. Apretá **"Ajustar"**. Aparece "Listo: +N de SKU. En Depósito · ubicación quedan N."

### Dar de baja mercadería rota

Igual que el anterior, con **"Restar (−)"** y motivo "rotura" (o el que corresponda).

### Pasar mercadería de una ubicación a otra

1. En la caja **Transferencia**, escribí el SKU o código de barras y la cantidad.
2. Elegí **"Desde"** y **"Hacia"** (pueden ser ubicaciones del mismo depósito o de depósitos distintos).
3. Si querés, poné una nota.
4. Apretá **"Transferir"**. Aparece "Listo: N de SKU pasaron de … a …".

### Errores típicos

- "Falta el SKU o el código de barras."
- "No hay ninguna variación con SKU o código de barras “X”." — hay que elegir el producto de la lista que aparece al escribir (o escribir el SKU exacto).
- "Es un kit: el stock de un kit se mueve con sus componentes. Ajustá cada componente."
- "Elegí el depósito y la ubicación."
- "La cantidad tiene que ser un entero mayor que cero."
- "Contá el motivo del ajuste (ej. conteo físico, rotura)." — el motivo es obligatorio en un ajuste.
- "El origen y el destino tienen que ser distintos."

## Criterios y reglas

- **Un ajuste mueve una sola ubicación**: sumar agrega a esa ubicación; restar le quita. Queda como movimiento de tipo **Ajuste** con el motivo como nota y la referencia "ajuste manual".
- **Una transferencia** resta del origen y suma al destino en el mismo paso. Queda como movimiento de tipo **Transferencia** con la referencia "transferencia manual". El total de la empresa no cambia, pero si la transferencia es entre depósitos sí cambia el disponible de los canales que venden desde cada uno.
- **No hay control de saldo**: el sistema deja restar o transferir más de lo que hay en la ubicación; la ubicación puede quedar en negativo. Revisá antes en la [Consulta de stock](/stock/consulta).
- **Lo reservado no se mueve**: la transferencia mueve cantidad, no reservas. Si pasás mercadería reservada para un pedido a otra ubicación, la reserva sigue en la ubicación original.
- **Qué ubicaciones se ofrecen**: las activas de los depósitos activos. De un depósito que no usa ubicaciones, sólo su ubicación General.
- **Kits**: no se ajustan ni se transfieren; se hace con cada componente.
- **Cantidad**: sólo enteros mayores que cero.
- **Mercado Libre y tienda**: apenas se graba el ajuste o la transferencia, el disponible nuevo sale para Mercado Libre (si el canal tiene prendida la sincronización de stock) y para la tienda web. Si con un ajuste el disponible del canal llega al umbral de pausa, la publicación se pausa; si sube por encima, se reactiva. Ver el detalle en [Consulta de stock](/stock/consulta).
- **Costo**: los ajustes no cambian el costo del producto. El costo sale sólo de las compras y los despachos.
- Todo queda en [Movimientos de stock](/stock/movimientos), con el usuario que lo hizo. Un ajuste no se borra: para deshacerlo, se hace otro ajuste al revés.

## Preguntas frecuentes

**¿Pongo lo que conté o la diferencia?**
La diferencia. Si el sistema dice 10 y contaste 8, es "Restar (−)" 2.

**¿Puedo deshacer un ajuste?**
No se borra; hacé otro ajuste en sentido contrario, con el motivo.

**¿Por qué no puedo ajustar un kit?**
Porque el kit no tiene stock propio: se ajusta cada componente.

**¿Quién puede hacer ajustes?**
Quien tenga el permiso «Ajustes de stock» en su rol.

**¿El ajuste se refleja en Mercado Libre?**
Sí, enseguida, si el canal tiene prendida la sincronización de stock.

**¿Dónde veo todos los ajustes viejos?**
En [Movimientos de stock](/stock/movimientos), filtrando el tipo "Ajuste" o "Transferencia".

**¿El motivo es obligatorio en la transferencia?**
No; en la transferencia la nota es opcional. En el ajuste el motivo es obligatorio.

## Relacionado

- [Consulta de stock](/stock/consulta)
- [Movimientos de stock](/stock/movimientos)
- [Depósitos y ubicaciones](/stock/depositos)
- [Recepción](/deposito/recepcion)
