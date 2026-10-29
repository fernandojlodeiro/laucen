---
titulo: Vendedores referentes
menu: Compras › Vendedores referentes
ruta: /compras/referentes
rutas: /compras/referentes
permiso: compras_ver
resumen: Lo que venden los vendedores de la competencia en Mercado Libre, cruzado con el catálogo, para elegir productos nuevos y pedirle cotización al proveedor.
---

## Para qué sirve

Para encontrar productos que venden otros vendedores de Mercado Libre y vos no tenés, y armar con ellos un pedido de cotización para el proveedor. Se leen los listados enteros de los vendedores que se eligen como referencia y se cruzan con el catálogo.

## Cómo se llega

Menú **Compras › Vendedores referentes**.

## Qué hay en la pantalla

- Debajo del título, cuántos productos hay, de cuántos vendedores, cuántos ya tenés y cómo va la IA (lo que le falta agrupar o comparar y cuánto lleva gastado), o cuándo ordenó la lista por última vez.
- Arriba a la derecha:
  - **Rearmar el cruce**: vuelve a juntar todo lo leído de los vendedores. Corre de fondo.
  - **Ordenar con IA**: la IA junta las publicaciones que son el mismo producto y compara cada producto con tu catálogo. Sólo trabaja lo que falta (lo ya ordenado no se repite); pregunta ahí mismo antes de arrancar. Tiene un tope de US$ 15 de IA por vez; corre de fondo, en unos minutos, y el avance se ve debajo del título.
  - **Volver a comparar con mi catálogo**: vuelve a comparar todos los productos con tu catálogo (por ejemplo, después de dar de alta productos). Los grupos no se rearman.
  - **Descargar Excel**: lo que se ve, con todas las filas.
  - **Excel para cotizar (N)**: sólo lo marcado **Cotizar**, para mandarle al proveedor (ver abajo).
  - **Nuevo vendedor**: abre el formulario para leer un vendedor nuevo.
- **Vendedores leídos (N)**: se despliega con cada vendedor, su estado (Leído, Leyendo…, Con error), cuántas publicaciones trajo, cuándo y cuánto costó. La ↗ abre su listado en Mercado Libre.
- Los filtros, en un renglón:
  - buscador (el título y el vendedor de cualquiera de sus publicaciones, el número de publicación o tu SKU);
  - **Ver**: **Nuevos para vos** (de entrada: los que no tenés ni activos ni archivados, y no descartaste), **Para cotizar**, **Los tenés activos**, **Los tenés archivados** (para volver a comprarlos o reactivarlos), **Descartados** o **Todos**, cada uno con cuántos hay;
  - **Vendedor**: los productos que vende ese vendedor, o todos;
  - **Sólo los que venden**, tildada de entrada: alguna de sus publicaciones tiene más de 500 vendidas, o desde $ 50.000 con más de 25 vendidas (las vendidas son las que informa Mercado Libre);
  - **Incluye marcas con derechos**: de entrada no se muestran las de marcas que no se pueden importar (Lego, Apple, Dewalt, Disney, Marvel, Nintendo, PlayStation…).
- La tabla, una fila por producto, del que más vendió al que menos (se ordena tocando el título de cada columna):
  - **Producto**: foto, título y número de su publicación más vendida, con ↗ a Mercado Libre;
  - **Precio**: el más barato de los que lo venden y, debajo, el más caro;
  - **Vendidas**: la suma de todas sus publicaciones;
  - **Lo venden**: cuántos vendedores lo tienen; tocándolo se despliega cada publicación con su vendedor, precio, vendidas y ↗;
  - **Tu producto**: el tuyo que es el mismo, con su foto, SKU (lleva a la ficha) y la marca **Archivado** si lo está; al pasar el mouse, por qué. «No lo tenés» si la IA no encontró ninguno. Lo que la IA todavía no ordenó dice «sin IA» y el % de palabras del título en común;
  - **Cotizar**: caja para tildar, graba al momento (para todas las publicaciones del producto); la fila se pinta de verde;
  - el **tacho** la descarta (pregunta ahí mismo **Sí / No**); en **Descartados**, **Volver a la lista** la devuelve.

## Cómo se hace

### Leer un vendedor nuevo

1. **Nuevo vendedor**, arriba a la derecha.
2. Pegá el link de su listado («…/_CustId_…») o de su tienda en Mercado Libre, o su número, y un nombre.
3. **Leer**. Lee hasta 1.000 publicaciones (hasta US$ 4 de Apify, del tope del mes de [Seguimiento de publicaciones](/config/seguimiento)). Tarda unos minutos; al terminar se suma a la lista y se rearma el cruce solo.

### Pedir cotización de productos nuevos

1. En **Ver: Nuevos para vos**, tildá **Cotizar** en lo que te interese (y descartá lo que no).
2. **Excel para cotizar (N)**: una fila por producto marcado con **Foto**, **Producto** (el título de su publicación más vendida), **Publicación de referencia** (el link a ésa) y columnas vacías para que el proveedor complete **Precio US$**, **Peso (g)**, **Medidas de la caja (cm)** y **Observaciones**. No lleva SKU ni cantidad.

La foto del Excel va como fórmula de imagen: se ve en Excel de Microsoft 365.

## Criterios y reglas

- De cada vendedor se usa su última lectura buena.
- **El mismo producto entre vendedores**: la IA junta las publicaciones que un comprador elegiría indistintamente: misma función, mismo modelo o especificaciones (medidas, potencia, voltaje, cantidad de canales…) y la misma cantidad de unidades. Otro modelo, una versión superior o inferior, un accesorio, un kit o un pack de otra cantidad van aparte. La marca genérica, el color o cómo está escrito el título no importan.
- **Lo tenés**: la IA compara cada producto con **todos** tus productos, activos y archivados, mirando el título, la marca, el modelo, las variaciones y los títulos de tus publicaciones, con el mismo criterio. Sólo le muestra los tuyos que comparten palabras poco comunes del título; si no hay ninguno, queda como que no lo tenés.
- Mientras la IA no lo ordenó, cada publicación va sola y «Tu producto» es por parecido del título: si comparten al menos el 60 % de las palabras (en los dos sentidos). Conviene revisarlo.
- Después de leer un vendedor nuevo, la IA ordena lo nuevo sola.
- Las decisiones (cotizar o descartar) quedan guardadas aunque se vuelva a leer un vendedor o se rearme el cruce.
- No cambia nada del catálogo ni de Mercado Libre.

## Relacionado

- [Sugerencia de compra](/compras/sugerencia)
