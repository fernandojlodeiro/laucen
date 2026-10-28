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

- Debajo del título, cuántas publicaciones hay leídas, de cuántos vendedores y cuántas ya tenés.
- Arriba a la derecha:
  - **Rearmar el cruce**: vuelve a comparar todo lo leído con el catálogo (por ejemplo, después de dar de alta productos). Corre de fondo.
  - **Descargar Excel**: lo que se ve, con todas las filas.
  - **Excel para cotizar (N)**: sólo lo marcado **Cotizar**, para mandarle al proveedor (ver abajo).
  - **Nuevo vendedor**: abre el formulario para leer un vendedor nuevo.
- **Vendedores leídos (N)**: se despliega con cada vendedor, su estado (Leído, Leyendo…, Con error), cuántas publicaciones trajo, cuándo y cuánto costó. La ↗ abre su listado en Mercado Libre.
- Los filtros, en un renglón:
  - buscador (título, vendedor o número de publicación);
  - **Ver**: **Nuevos para vos** (de entrada: los que no tenés y no descartaste), **Para cotizar**, **Ya los tenés**, **Descartados** o **Todos**, cada uno con cuántos hay;
  - **Vendedor**: uno solo o todos;
  - **Sólo los que venden**, tildada de entrada: más de 500 vendidas, o desde $ 50.000 con más de 25 vendidas (las vendidas son las que informa Mercado Libre);
  - **Incluye marcas con derechos**: de entrada no se muestran las de marcas que no se pueden importar (Lego, Apple, Dewalt, Disney, Marvel, Nintendo, PlayStation…).
- La tabla, de la que más vendió a la que menos (se ordena tocando el título de cada columna):
  - **Publicación**: foto, título y número con ↗ a la publicación en Mercado Libre;
  - **Precio**, **Vendidas** y **Lo venden** (cuántos de los vendedores referentes venden lo mismo: el mismo producto de catálogo de Mercado Libre o el mismo título);
  - **Vendedor**;
  - **Tu producto**: tu producto más parecido, con su foto, SKU (lleva a la ficha) y el % de palabras en común;
  - **Cotizar**: caja para tildar, graba al momento; la fila se pinta de verde;
  - el **tacho** la descarta (pregunta ahí mismo **Sí / No**); en **Descartados**, **Volver a la lista** la devuelve.

## Cómo se hace

### Leer un vendedor nuevo

1. **Nuevo vendedor**, arriba a la derecha.
2. Pegá el link de su listado («…/_CustId_…») o de su tienda en Mercado Libre, o su número, y un nombre.
3. **Leer**. Lee hasta 1.000 publicaciones (hasta US$ 4 de Apify, del tope del mes de [Seguimiento de publicaciones](/config/seguimiento)). Tarda unos minutos; al terminar se suma a la lista y se rearma el cruce solo.

### Pedir cotización de productos nuevos

1. En **Ver: Nuevos para vos**, tildá **Cotizar** en lo que te interese (y descartá lo que no).
2. **Excel para cotizar (N)**: una fila por publicación marcada con **Foto**, **Producto** (el título de la publicación), **Publicación de referencia** (el link) y columnas vacías para que el proveedor complete **Precio US$**, **Peso (g)**, **Medidas de la caja (cm)** y **Observaciones**. No lleva SKU ni cantidad.

La foto del Excel va como fórmula de imagen: se ve en Excel de Microsoft 365.

## Criterios y reglas

- De cada vendedor se usa su última lectura buena. Una misma publicación se muestra una vez aunque la tengan varios.
- **Ya lo tenés**: se compara el título de la publicación con los de tu catálogo; si comparten al menos el 60 % de las palabras (en los dos sentidos), se toma como que ya lo tenés. Es por parecido del título, sin IA: conviene revisarlo.
- Las decisiones (cotizar o descartar) quedan guardadas aunque se vuelva a leer un vendedor o se rearme el cruce.
- No cambia nada del catálogo ni de Mercado Libre.

## Relacionado

- [Sugerencia de compra](/compras/sugerencia)
