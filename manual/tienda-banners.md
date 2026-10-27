---
titulo: Banners de la tienda
menu: Configuración › Tienda web › Banners de la tienda
ruta: /config/tienda/carrusel
rutas: /config/tienda/carrusel
permiso: tienda_config
resumen: Cargar las imágenes grandes de arriba de la portada de la tienda web, todas las que quieras, en dos familias (clara y oscura) que se turnan solas, con su link, la tienda donde se ven y, si querés, los días y las fechas en que salen.
---

## Para qué sirve

Arriba de la portada de la tienda pasan, una por una, imágenes grandes (banners). Acá cargás todas las que quieras, les ponés un link, elegís en qué tienda se ven y las repartís en dos familias, **Clara** y **Oscura**, que se turnan solas cada 12 horas.

## Cómo se llega

Menú **Configuración › Tienda web › Banners de la tienda**. Si hay más de una tienda web, arriba elegís cuál.

## Qué hay en la pantalla

- Un recuadro que dice **qué familia se ve ahora** y hasta cuándo.
- Dos pestañas, **Clara** y **Oscura**, con la cantidad de banners de cada una entre paréntesis. La que se está viendo en la tienda dice «al aire».
- **Se ven en**: filtra la lista por tienda (los de esa tienda más los que son para todas).
- La lista de la familia elegida, en el orden en que pasan: número, la imagen (al tocarla se abre entera), la imagen para el celular, en qué tienda se ve, el link, **Cuándo** (los días en que sale, «Todos los días» si no se eligieron, y las fechas; «Hoy no sale» si hoy no le toca) y el interruptor **Activo**. A la derecha, ▲ ▼ para cambiar el orden, el lápiz y el tacho.

## Cómo se hace

### Agregar banners
1. Apretá **Nuevo banner**, arriba a la derecha.
2. Tocá **Elegir imágenes** y elegí una o varias (cada imagen queda como un banner). Con **Sumar más imágenes** agregás otras; con la ✕ de una, la sacás antes de grabar.
3. Elegí la **pantalla** («Compu y celular», «Sólo compu» o «Sólo celular»), la **familia**, en qué tienda **se ve** («Todas las tiendas» o una en particular) y, si querés, el **link**. Vale para todas las imágenes que elegiste.
4. Apretá **Agregar banners**. Van al final de la familia.

### Traer los banners desde el Google Drive
Con el Google Drive conectado ([Google Drive](/config/google-drive)), cada tienda puede tener su carpeta de banners:
1. En el recuadro **«Desde el Google Drive»**, pegá el link de la carpeta de cada tienda («Todas las tiendas», la principal o una de otra marca).
2. Adentro de esa carpeta: una carpeta **«Escritorio»** (las de la compu) y otra **«Celulares»**. En el nombre de cada imagen, **«Clara»** u **«Oscura»** (por ejemplo «Envios_Clara_1920x420.png»); también sirven carpetas «Claros» y «Oscuros» adentro.
3. Apretá **«Leer Drive»**. Dice cuántos se sumaron, cuántos se reemplazaron y cuántos se borraron, y avisa si una imagen no dice si es Clara u Oscura.

Cada vez que cambies algo en el Drive, volvé a apretar «Leer Drive»: las imágenes nuevas se suman al final de su familia, las que cambiaste se reemplazan y las que sacaste se borran de la tienda. Los banners subidos a mano no se tocan. El orden, el link y el interruptor de cada banner se cambian en la lista, como los demás.

### Cambiar uno
Apretá el **lápiz** de su fila: ahí mismo podés cambiar la imagen, la pantalla, la tienda, la familia, el link y cuándo sale (las casillas de **Días** L M M J V S D y **Desde** / **Hasta**). **Grabar** lo guarda; **Cancelar** deja todo como estaba. Si lo pasás a la otra familia, va al final de esa.

### Ordenarlos, apagarlos o borrarlos
- Con ▲ ▼ lo subís o bajás un lugar dentro de su familia.
- Con el interruptor **Activo** lo apagás sin borrarlo (no se ve en la tienda hasta que lo prendas).
- Con el tacho lo borrás (pregunta «¿Borrar?» Sí / No ahí mismo).

## Criterios y reglas

- **Cuándo sale:** con días tildados, el banner sale sólo esos días (de 0 a 24, hora argentina); sin ninguno, todos los días. Con **Desde** / **Hasta**, sólo entre esas fechas. Fuera de eso es como si estuviera apagado (y cuenta así para «Nunca queda vacía»). Sirve para el banner de una promoción de ciertos días, por ejemplo la de [Reglas comerciales](/config/reglas) de miércoles y sábados.
- **Turnos:** el día se parte en dos, de 0 a 12 y de 12 a 24 (hora argentina). En un turno se ve una familia y en el otro, la otra.
- **Cada semana se invierte el orden:** si esta semana a la mañana va la Clara y a la tarde la Oscura, la semana siguiente es al revés. La semana cambia el lunes a las 0.
- **Nunca queda vacía:** si a la familia del turno no le queda ningún banner activo para esa tienda, se ve la otra. Sin ningún banner, la portada muestra una franja con el nombre y la bajada de la tienda.
- **No hace falta que las familias tengan la misma cantidad.**
- **Tienda donde se ve:** «Todas las tiendas» se ve en la tienda principal y en cada dominio de otra marca. Uno elegido para una tienda se ve sólo ahí, junto con los de todas, en el orden de la lista. Una tienda de otra marca que no tiene banners propios muestra los de la principal.
- **Link:** vacío, el banner no lleva a ningún lado. Si empieza con «/» lleva a una página de la tienda (por ejemplo «/buscar?ofertas=1»); si es la dirección de otro sitio (https://…), se abre en otra pestaña.
- **Pantalla:** cada banner es para **«Compu y celular»**, **«Sólo compu»** o **«Sólo celular»**. En la compu pasan los de compu y los de las dos; en el celular, los de celular y los de las dos. Si para una pantalla no hay ninguno (en la familia del turno ni en la otra), se usan los de la otra pantalla.
- **Medidas:** **1920 × 420** las de compu y **1200 × 400** las de celular. El banner va siempre a todo el ancho y toma el alto de la imagen (en la compu, hasta 420): con esas medidas se ve entero; una imagen más alta se recorta un poco arriba y abajo.
- **El último cuarto de abajo de cada imagen va sin texto** (sólo fondo): se funde con el fondo de la página y la primera fila de productos ("Destacados") sube encima, en la compu y en el celular. Lo importante (textos, precio, logos) va en los tres cuartos de arriba y separado de los bordes.
- Pasan solos cada 6 segundos; se frenan mientras el mouse está encima.

## Preguntas frecuentes

**Cargué un banner y no lo veo en la tienda.** Fijate que esté activo, que hoy le toque (columna «Cuándo»), que sea de la familia que está al aire (lo dice el recuadro de arriba) y que se vea en esa tienda.

## Relacionado

[Tienda web](/config/tienda) · [Portada de la tienda](/config/tienda/portada)
