---
titulo: Promociones de ML
menu: Informes › Promociones de ML
ruta: /informes/promociones
rutas: /informes/promociones
permiso: informes_publicaciones_ver
resumen: Las campañas de promociones de Mercado Libre de cada cuenta, qué publicaciones están adentro y a qué precio, y la historia de cada cambio.
---

## Para qué sirve

Controlar todas las promociones de Mercado Libre y tener todo registrado en Laucen: qué campañas hay en cada cuenta, cuándo empiezan y terminan, cuánto del descuento pone Mercado Libre y cuánto el vendedor, qué publicaciones están adentro (o pueden entrar) y a qué precio, y **la historia de cada cambio**. Esa historia es lo que explica por qué un precio cambió solo.

## Cómo se llega

Menú **Informes › Promociones de ML**.

## Qué hay en la pantalla

Tres pestañas, cada una con su buscador, filtros y **Descargar Excel**:

- **Historia**: cada cambio anotado, lo más nuevo arriba: campaña nueva, campaña que cambió de estado (por ejemplo, de "Por empezar" a "En curso" o "Terminada") o de fechas, publicación que apareció en una campaña, que cambió de estado o de precio dentro de ella, o que salió. Se filtra por fechas (los últimos 7 días de entrada), cuenta, tipo de campaña y "Ver": todo, sólo cambios de campañas, sólo de publicaciones o sólo cambios de precio. Tocando el nombre de una campaña se ve toda su historia.
- **Publicaciones en promoción**: las publicaciones que están adentro de una campaña (en curso o por empezar), con el precio de hoy en ML, el precio en la campaña, el descuento, lo mínimo y máximo que acepta ML, el % que pone ML y el que ponés vos, y desde cuándo y hasta cuándo. El filtro "Estado" también muestra las que **pueden entrar** y todas.
- **Campañas**: cada campaña de cada cuenta, con su tipo, estado, fechas, hasta cuándo se puede entrar, el % de ML y del vendedor, cuántas publicaciones tiene adentro y cuántas pueden entrar. Por defecto las que están en curso o por empezar; también las terminadas.

Arriba a la derecha: **"Leer ahora de Mercado Libre"** (trae las campañas y las publicaciones en curso al momento, sin esperar a la lectura de cada hora) y **"Traer historial de campañas"** (pide además las ya terminadas y las programadas que Mercado Libre todavía devuelva; sirve para la carga inicial).

## Criterios y reglas

- **Todo es sólo lectura**: Laucen lee de Mercado Libre y anota; esta pantalla no cambia ninguna promoción ni ningún precio en Mercado Libre. Cambiar precios o entrar y salir de campañas se hace desde Precios ML, con tu clic.
- **Cuándo se lee**: sola, cada hora, desde el barrido de Mercado Libre (la lista de campañas de cada cuenta y las publicaciones que están adentro de las que están en curso); y cada 12 horas, las campañas a las que puede entrar cada publicación. También con los botones de arriba.
- **Qué se anota en la historia**: una campaña nueva, que cambie de estado o de fechas; una publicación que aparece en una campaña, que cambia de estado (por ejemplo de "Puede entrar" a "En curso") o de precio, o que sale. La primera vez que se lee una publicación no se anotan las campañas a las que sólo "puede entrar" (serían miles de filas), sólo las que ya tiene.
- **La historia arranca el 5/10/2026**: de antes sólo hay lo que Mercado Libre devuelva con "Traer historial de campañas"; Mercado Libre puede no guardar campañas muy viejas.
- **Estados**: "Puede entrar" (candidata), "Por empezar" (la publicación ya aceptó y la campaña no arrancó), "En curso", "Terminada", "Programada".
- **El precio de la publicación y el de la campaña son distintos**: en Mercado Libre una publicación puede seguir con su precio de lista y vender a otro mientras dure la campaña. Por eso la pestaña muestra los dos.
- **Posible causa de un cambio de precio**: en [Cambios en publicaciones](/informes/cambios-publicaciones), la columna "Posible causa (campañas de ML)" muestra las campañas que empezaron, terminaron o cambiaron de precio la publicación en las 1,5 horas anteriores al cambio. Es una pista, no una prueba: si está vacía, el cambio no coincide con ninguna campaña anotada.

## Preguntas frecuentes

**¿Por qué una campaña no tiene fechas o porcentajes?** Mercado Libre no devuelve esos datos en todos los tipos de campaña; Laucen guarda lo que llega y deja lo demás vacío.

**¿Por qué una publicación no aparece en la pestaña "Publicaciones en promoción"?** Sólo aparecen las que están adentro de una campaña en curso o por empezar. Las que pueden entrar se ven cambiando el filtro "Estado".

## Relacionado

- [Cambios en publicaciones](/informes/cambios-publicaciones)
- [Precios en Mercado Libre](/catalogo/precios-ml)
