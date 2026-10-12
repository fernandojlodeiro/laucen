---
titulo: Publicidad en Mercado Libre
menu: Ventas › Publicidad en Mercado Libre
ruta: /ventas/publicidad
rutas: /ventas/publicidad
permiso: publicidad_ver
resumen: Cuánto gasta y vende la publicidad de cada cuenta de Mercado Libre, producto por producto, y qué hacer con cada uno: SEGUIR, BAJAR, CORTAR o SUBIR.
---

## Para qué sirve

La publicidad de Mercado Libre (los anuncios patrocinados) cobra por cada clic, venda o no. Sin alguien mirando todos los días el gasto contra lo que vende cada producto, se puede gastar mucho sin vender. Esta pantalla hace ese control: lee de Mercado Libre lo que gastó y vendió cada anuncio, lo suma por producto y dice qué hacer, con la cuenta a la vista.

El sistema **no cambia nada** en la publicidad: las campañas se crean, pausan o modifican en el panel de publicidad de Mercado Libre. Cada campaña tiene su enlace **Abrir en Mercado Libre ↗**.

## Cómo se llega

Menú **Ventas › Publicidad en Mercado Libre**. Cuando un producto pasa a CORTAR, también aparece un cartel rojo arriba de [Para hacer](/panel) y llega un aviso de Windows (o del celular), según la configuración.

## Qué hay en la pantalla

Arriba, unos recuadros con cuántos productos hay en cada veredicto (CORTAR, BAJAR, SEGUIR, SUBIR; tocándolos se filtra la lista), cuántas campañas están activas y cuánto se gastó en los días que se miran. Si en alguna campaña activa Mercado Libre sube el presupuesto solo, sale un cartel rojo avisándolo.

Botón **Leer ahora de Mercado Libre** (arriba a la derecha): trae todo de nuevo sin esperar la lectura automática. Corre de fondo; al terminar aparece un cartel abajo a la derecha.

Pestañas:

- **Por producto**: un renglón por producto (por su SKU), sumando todas sus publicaciones en todas las cuentas. Columnas: veredicto, producto (con su foto), lo gastado, clics, ventas por publicidad, ventas totales del producto, publicidad por venta (en pesos y en % del precio), el tope y el porqué. Tocando el nombre del producto se abre debajo el detalle: precio promedio, costo del producto, tope por venta, lo gastado de más, el corte sin ventas, y una tabla con cada publicación (cuenta, estado, precio, gasto, clics, ventas directas e indirectas y el enlace a su campaña en Mercado Libre). Se busca por SKU, producto o número de publicación, y se filtra por veredicto y por cuenta. **Descargar Excel** baja lo mismo que se ve.
- **Campañas**: cada campaña de cada cuenta con su estado, el presupuesto diario cargado, el que usa Mercado Libre hoy (si es distinto, lo marca), si Mercado Libre sube el presupuesto solo, el ROAS objetivo, lo gastado y vendido en los días que se miran, cuántos anuncios tiene y el enlace para abrirla en Mercado Libre. Una campaña que se borró en el panel de Mercado Libre queda en la lista como «Eliminada», con lo que gastó. Debajo, las cuentas que nunca usaron publicidad.
- **Excepciones al tope**: el tope por venta se puede pisar para un producto o para una familia (vale para sus subfamilias). Botón **Nueva excepción**; se cambia con el lápiz y se borra con el tacho.
- **Configuración**: los valores con los que se decide (ver abajo). Se cambian con el lápiz de arriba a la derecha y **Grabar**.

## Cómo se hace

### Saber qué hacer con la publicidad hoy

1. Entrá a [Publicidad en Mercado Libre](/ventas/publicidad).
2. Mirá primero los rojos (CORTAR) y después los amarillos (BAJAR).
3. Tocá el producto para ver en qué cuentas y publicaciones gastó, y usá **Abrir en Mercado Libre ↗** para ir a su campaña.
4. En el panel de Mercado Libre pausá la campaña o sacá ese anuncio (CORTAR), bajá el presupuesto o subí el ROAS objetivo (BAJAR), o subí el presupuesto (SUBIR).

### Cambiar lo que se acepta pagar por venta

1. Pestaña **Configuración**, lápiz arriba a la derecha.
2. Cambiá **Publicidad por venta, tope (% del precio)** y lo que haga falta.
3. **Grabar**. Los veredictos se recalculan enseguida.

### Darle a un producto o familia otro tope

1. Pestaña **Excepciones al tope**, botón **Nueva excepción**.
2. Escribí el SKU del producto, o elegí la familia con el buscador.
3. Poné el tope en % del precio y, si querés, una nota. **Crear**.

## Criterios y reglas

- **Qué se lee**: por cada cuenta, su anunciante, sus campañas (presupuesto, objetivo, estado y si Mercado Libre ajusta el presupuesto solo) y lo que gastó y vendió cada campaña y cada anuncio, día por día. Se lee solo cada tantas horas (configurable) y cada lectura vuelve a leer los últimos días, porque Mercado Libre suma ventas atribuidas con demora.
- **Por producto**: el veredicto es del producto (SKU), sumando todas sus publicaciones en todas las cuentas. Una publicación que no está vinculada a un producto del sistema aparece sola, con su número.
- **Ventas que cuentan**: sólo las que Mercado Libre atribuye a la publicidad. *Directas* = el comprador compró lo que tocó en el anuncio; *indirectas* = tocó el anuncio y compró otra cosa del mismo vendedor. La configuración elige si cuentan sólo las directas o las dos. Las **ventas totales** del producto (de todos los canales, en el sistema) se muestran al lado para comparar, pero no entran en el veredicto.
- **Tope por venta** = el % que se acepta pagar × el precio de venta (el promedio de lo vendido por publicidad; si no vendió, el precio de sus anuncios). Gana la excepción del producto, si no la de su familia (o la familia más cercana hacia arriba), si no la general.
- **Publicidad por venta** = lo gastado ÷ las ventas. En % = lo gastado ÷ lo vendido por publicidad.
- **Gastado de más** = lo gastado − ventas × tope por venta.
- **CORTAR** (rojo): si lo gastado de más llega al **corte sin ventas** (el equivalente a N ventas, o el tope en pesos si se cargó; el que llegue primero). Vale aunque haya pocos datos, siempre que haya gastado al menos el piso «No cortar antes de gastar». También si, con datos suficientes, la publicidad por venta pasa el «CORTAR desde» (en % del tope).
- **BAJAR** (amarillo): con datos suficientes, la publicidad por venta pasa el tope pero no el «CORTAR desde».
- **SEGUIR** (verde): la publicidad por venta está dentro del tope. **SEGUIR amarillo**: todavía no vendió por publicidad pero no llegó al corte, o pasa el tope con pocos datos.
- **SUBIR** (verde): con datos suficientes, la publicidad por venta queda en el «SUBIR hasta» (en % del tope) o menos: rinde y se puede subir el presupuesto.
- **Datos suficientes** = al menos los días con gasto y los clics mínimos de la configuración.
- **Avisos**: cuando un producto pasa a CORTAR se avisa (aviso de Windows o del celular a quien tenga este permiso, cartel rojo en Para hacer, o las dos cosas). Mientras siga en CORTAR, el aviso se repite cada tantas horas (0 = sólo cuando pasa).
- **El sistema no frena la publicidad**: si nadie la pausa en el panel de Mercado Libre, sigue gastando.
- **Presupuesto que sube solo**: Mercado Libre puede subir el presupuesto de una campaña por su cuenta (ajuste periódico o por fechas especiales). La pestaña Campañas muestra lo que Mercado Libre informa como presupuesto automático y el presupuesto que usa hoy; los interruptores del panel no se informan por separado.

Valores de la configuración (todos se cambian):

| Valor | Para qué |
|---|---|
| Publicidad por venta, tope (% del precio) | Lo máximo que se acepta pagar de publicidad por venta. |
| Cortar sin ventas al gastar (ventas) | Gastado el equivalente a tantas ventas sin vender: CORTAR. |
| …o al gastar ($) | Tope fijo en pesos; 0 = no se usa. |
| No cortar antes de gastar ($) | Piso: un producto barato no pasa a CORTAR por unos pocos clics. |
| Días mínimos / Clics mínimos antes de juzgar | Antes de eso no dice SUBIR ni BAJAR. |
| SUBIR hasta / CORTAR desde (% del tope) | Los umbrales de los colores. |
| Días que se miran | Cuántos días hacia atrás suma el veredicto. |
| Qué ventas cuentan | Sólo directas, o directas e indirectas. |
| Leer de Mercado Libre cada (horas) / Releer los últimos (días) | Cada cuánto se lee y cuántos días se vuelven a leer. |
| Cómo avisar / Repetir el aviso cada (horas) | El aviso de CORTAR. |

## Preguntas frecuentes

- **¿Por qué una cuenta no aparece en Campañas?** Porque nunca usó publicidad (no tiene anunciante en Mercado Libre); figura debajo de la tabla.
- **¿Por qué el veredicto cambió de un día para el otro sin gastar más?** Porque Mercado Libre suma ventas atribuidas con unos días de demora, o porque los días más viejos salieron de la ventana que se mira.
- **¿Puedo pausar una campaña desde acá?** No: Mercado Libre sólo deja leer la publicidad por sistema. Se pausa en su panel, con el enlace de cada campaña.

## Relacionado

- [Para hacer](/panel)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Rentabilidad por venta](/informes/rentabilidad)
