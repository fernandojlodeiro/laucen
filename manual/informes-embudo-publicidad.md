---
titulo: Embudo de publicidad
menu: Informes › Embudo de publicidad
ruta: /informes/embudo-publicidad
rutas: /informes/embudo-publicidad
permiso: publicidad_ver
resumen: De lo invertido en anuncios a lo vendido, por canal (cada cuenta de Mercado Libre, Meta, Google y TikTok): cuántos vieron, hicieron clic, escribieron y compraron, cuánto costó cada venta y cuánto volvió por cada peso. Y los anuncios de Meta uno por uno.
---

## Para qué sirve

Para ver en un solo lugar si la publicidad vende, en todos los canales a la vez: cuánto se invirtió, cuántas veces se vio, cuántos hicieron clic, cuántos escribieron, cuántos compraron y cuánto se vendió. Con eso se ve **cuánto costó cada venta** y **cuántos pesos volvieron por cada peso invertido**, canal por canal y anuncio por anuncio.

## Cómo se llega

Menú **Informes › Embudo de publicidad** ([Embudo de publicidad](/informes/embudo-publicidad)).

## Qué hay en la pantalla

- Arriba, el período (**Hoy, Ayer, Últimos 7 días, Este mes, Último mes…** o dos fechas a mano; de entrada, este mes) y el total invertido y vendido con publicidad. Arriba a la derecha, **"Conectar anuncios de Meta"** o, si ya está conectada, **"Leer Meta ahora"**.
- **Por canal**: una fila por cada cuenta de Mercado Libre con publicidad, **Meta (Facebook e Instagram)**, **Google**, **TikTok**, **Otras campañas** (si hubo ventas desde links con utm de otra cosa) y **Tienda web sin anuncio** (para comparar). Columnas: **Invertido**, **Vieron** (veces que se vio un anuncio), **Clics**, **Escrib.** (chats de WhatsApp o Instagram que empezaron desde un anuncio), **Ventas**, **Vendido**, **Costo/venta** (invertido ÷ ventas) y **Retorno** (vendido ÷ invertido: «3,5 x» quiere decir que volvieron $ 3,50 por cada peso). Al pasar el mouse por el título de cada columna, qué cuenta.
- **Anuncios de Meta (N)**: cada anuncio con su campaña y las mismas columnas, de a 50.
- **Conexiones**: la cuenta de anuncios de Meta conectada (con **"Volver a conectar"** y **"Desconectar"**, que pregunta ahí mismo), lo que hay que poner en los anuncios para saber de cuál vino cada venta, y el estado de Google y TikTok.

## Cómo se hace

### Conectar los anuncios de Meta
1. Apretá **"Conectar anuncios de Meta"** (arriba a la derecha).
2. Se abre Facebook: entrá con quien administra el negocio en Meta y tildá la **cuenta publicitaria** del negocio. El permiso es sólo para **leer** el gasto: Laucen no cambia nada en los anuncios.
3. Volvés con el aviso "¡Anuncios de Meta conectados!": ya se leyó el gasto de los últimos 30 días, y se vuelve a leer solo cada 3 horas (o con **"Leer Meta ahora"**).

### Que cada venta de la web sepa de qué anuncio vino
En cada anuncio de Meta, en **«Parámetros de URL»** (al armar el anuncio, en «Seguimiento»), pegá el texto que muestra la pantalla en **Conexiones**. Así, cuando alguien entra a la tienda desde ese anuncio y compra, el pedido queda con el anuncio. Sin eso, la venta igual cuenta para Meta (por el código que Meta agrega a los links), pero no para un anuncio en particular.

## Criterios y reglas

- **Mercado Libre**: el gasto, las veces que se vio, los clics y lo vendido salen de la publicidad de cada cuenta (ver [Publicidad en Mercado Libre](/ventas/publicidad)). Las **ventas son unidades** que Mercado Libre atribuye a la publicidad (las del producto anunciado y las de otros productos que compró quien entró por el anuncio).
- **Meta**: el gasto, las veces que se vio y los clics, de la cuenta publicitaria conectada, anuncio por anuncio. **Escribieron** = chats de WhatsApp o Instagram que empezaron desde un anuncio «Enviar mensaje» (Meta lo dice en el primer mensaje). **Ventas** = pedidos de la tienda web que llegaron desde un anuncio de Meta, sin cancelados ni devueltos; **Vendido** = su total.
- **De qué anuncio vino una compra de la web**: el último anuncio desde el que entró a la tienda en los últimos 30 días, aunque compre otro día.
- **Google y TikTok**: el gasto todavía no se lee (próximamente); las ventas de la web que llegan desde sus anuncios ya se cuentan.
- **Fechas**: cada cosa por su propia fecha (el gasto por el día del anuncio, el chat por cuándo empezó, el pedido por su fecha).
- **Montos**: en pesos de cada momento; un gasto en dólares se pasa a pesos con el dólar de ese día. «—» quiere decir que ese dato no se puede saber (por ejemplo, el gasto de un canal sin conectar), no que sea cero.

## Relacionado

- [Publicidad en Mercado Libre](/ventas/publicidad)
- [Publicidad de la tienda web](/config/tienda/publicidad)
- [Ventas por canal](/informes/ventas-canal)
- [Mensajes](/ventas/mensajes)
