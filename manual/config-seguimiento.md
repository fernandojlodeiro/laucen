---
titulo: Seguimiento de publicaciones (configuración)
menu: Configuración › Seguimiento de publicaciones
ruta: /config/seguimiento
rutas: /config/seguimiento
permiso: empresa_config
resumen: Cada cuántos días se vuelven a leer las publicaciones de la competencia que se siguen y el tope de gasto del mes.
---

## Para qué sirve

En la ficha de cada producto, la pestaña **Seguimiento** guarda las publicaciones de la competencia que querés vigilar. Acá se elige, para toda la empresa, **cada cuántos días se vuelven a leer** y **cuánto se puede gastar por mes** en leerlas.

## Cómo se llega

Menú **Configuración › Seguimiento de publicaciones**.

## Qué hay en la pantalla

- **Leer cada (días)**: de entrada, 7.
- **Tope de gasto por mes (US$)**: de entrada, 30.
- **No compite si tarda más de (días)**: de entrada, 10.
- **Seguir solas por producto**: de entrada, 8. Cuántas publicaciones que la IA juzga iguales al producto sigue sola, en cada producto, la búsqueda de precio de mercado (0 = ninguna).
- **Pausadas: leer cada (días)**: de entrada, 30. Cada cuánto se relee una publicación de la competencia que está pausada.
- **Pausadas: dejar de leer después de (meses)**: de entrada, 3. Cuando una publicación de la competencia lleva pausada más que eso, deja de releerse sola (0 = nunca deja).
- Abajo: **Gastado este mes**, **Queda del tope**, **Publicaciones seguidas** y cuántas son **De catálogo (gratis)**.

## Cómo se hace

1. Apretá el **lápiz** arriba a la derecha.
2. Cambiá los días (de 1 a 90), el tope (de 0 a 1.000 dólares), cuántas seguir solas (de 0 a 30), cada cuánto leer las pausadas (de 1 a 365 días) o después de cuántos meses dejar de leerlas (de 0 a 36).
3. Apretá **Grabar**.

## Criterios y reglas

- **Cuándo se lee cada una**: la primera lectura es al agregarla (si la elegiste de la búsqueda, lo que trajo la búsqueda ya vale como primera lectura). Después, se vuelve a leer cuando pasaron los días elegidos desde su última lectura, en la vuelta automática de la madrugada.
- **Qué se relee solo**: las de catálogo, siempre (es gratis). Las comunes, que cuestan, **sólo si el producto está a la venta**: con al menos una publicación activa en Mercado Libre y stock disponible. Las de un producto pausado o sin stock quedan de referencia con su último precio y se leen sólo a pedido, con **Leer ahora** en la pestaña Seguimiento del producto.
- **Las pausadas de la competencia**: una publicación de otro vendedor que está pausada se relee cada **Pausadas: leer cada** días (no cada **Leer cada**), por si la reactiva. Cuando lleva pausada más de los meses elegidos, **deja de releerse sola**: en la pestaña Seguimiento del producto dice «⏸ No se relee: pausada hace más de N meses» con el botón **Reanudar**, que la lee en el momento y vuelve a contar los meses desde ese día. Si en una lectura aparece activa otra vez, vuelve a leerse como las demás. Los meses se cuentan desde la primera lectura en que figuró pausada.
- **Las terminadas se dejan de seguir solas**: si al leer una publicación de la competencia Mercado Libre dice que está terminada, se borra del seguimiento (una publicación terminada no se reactiva).
- **Qué cuesta y qué no**: las publicaciones que compiten en un **producto de catálogo** de Mercado Libre se leen **gratis**. Las **comunes** y las **búsquedas** se leen con un servicio externo que cobra: unos US$ 0,10 por búsqueda de 50 resultados y menos de un centavo de dólar por publicación leída.
- **El tope**: al llegar al tope del mes, se dejan de leer las comunes y de buscar hasta el mes siguiente (las de catálogo se siguen leyendo). El mes se cuenta en hora argentina.
- **Tiempo de entrega**: de cada publicación ajena se calcula en cuántos días llega a un código postal de Capital Federal (la opción de envío más rápida, como la informa Mercado Libre; sin costo). Si tarda más que los días elegidos, **no compite**: en la búsqueda queda escondida (con una caja para mostrarla) y en las seguidas el plazo se ve en rojo. Sirve para separar, por ejemplo, las que se traen por encargo y tardan semanas.
- Si una lectura falla, se reintenta al día siguiente.
- **Seguir solas**: la búsqueda de precio de mercado ([Sugerencia de compra](/compras/sugerencia)) sigue, en cada producto, las publicaciones más baratas de las que la IA juzga iguales, hasta la cantidad elegida. Quedan **sin confirmar** (no cuentan para la regla de precio) hasta que una persona las revisa en la pestaña Seguimiento del producto. Las que ya se seguían no se tocan. Para ver lo que falta revisar: [Seguimientos](/catalogo/seguimientos).

## Relacionado

- [Productos](/catalogo/productos) (pestaña Seguimiento de cada producto)
