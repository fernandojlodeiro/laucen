---
titulo: Embudo de publicidad
menu: Informes › Embudo de publicidad
ruta: /informes/embudo
rutas: /informes/embudo
permiso: publicidad_ver
resumen: De lo invertido en anuncios a lo vendido, por canal (cada cuenta de Mercado Libre, Meta, Google y TikTok): cuántos vieron, hicieron clic, escribieron y compraron, cuánto costó cada venta y cuánto volvió por cada peso. Y los anuncios de Meta y Google uno por uno.
---

## Para qué sirve

Para ver en un solo lugar si la publicidad vende, en todos los canales a la vez: cuánto se invirtió, cuántas veces se vio, cuántos hicieron clic, cuántos escribieron, cuántos compraron y cuánto se vendió. Con eso se ve **cuánto costó cada venta** y **cuántos pesos volvieron por cada peso invertido**, canal por canal y anuncio por anuncio.

## Cómo se llega

Menú **Informes › Embudo de publicidad** ([Embudo de publicidad](/informes/embudo)).

## Qué hay en la pantalla

- Arriba, el período (**Hoy, Ayer, Últimos 7 días, Este mes, Último mes…** o dos fechas a mano; de entrada, este mes) y el total invertido y vendido con publicidad. Arriba a la derecha, **"Conectar anuncios de Meta"** y **"Conectar Google Ads"** (mientras no estén conectados) y **"Leer los anuncios ahora"** (cuando hay alguno conectado).
- **Por canal**: una fila por cada cuenta de Mercado Libre con publicidad, **Meta (Facebook e Instagram)**, **Google**, **TikTok**, **Otras campañas** (si hubo ventas desde links con utm de otra cosa) y **Tienda web sin anuncio** (para comparar). Columnas: **Invertido**, **Vieron** (veces que se vio un anuncio), **Clics**, **Escrib.** (chats de WhatsApp o Instagram que empezaron desde un anuncio), **Ventas**, **Vendido**, **Costo/venta** (invertido ÷ ventas) y **Retorno** (vendido ÷ invertido: «3,5 x» quiere decir que volvieron $ 3,50 por cada peso). Al pasar el mouse por el título de cada columna, qué cuenta.
- **Anuncios de Meta y Google (N)**: cada anuncio (con «Meta» o «Google» adelante) con su campaña y las mismas columnas, de a 50.
- **Conexiones**: las cuentas de anuncios de Meta y de Google Ads conectadas, cada una con su caja **Leer** (destildala si es de otro negocio que administra la misma persona: deja de leerse y su gasto sale del embudo; al volver a tildarla se lee de nuevo), cuándo se leyeron, **"Volver a conectar"** y **"Desconectar"** (que pregunta ahí mismo), lo que hay que poner en los anuncios para saber de cuál vino cada venta, y el estado de TikTok.
- **«La app de Google de Laucen»** (sólo la ve el dueño del sistema): el cliente de Google (ID de cliente y secreto) por el que se conecta Google Ads de cada organización, con el lápiz para cargarlo.

## Cómo se hace

### Conectar los anuncios de Meta
1. Apretá **"Conectar anuncios de Meta"** (arriba a la derecha).
2. Se abre Facebook: entrá con quien administra el negocio en Meta y tildá la **cuenta publicitaria** del negocio. El permiso es sólo para **leer** el gasto: Laucen no cambia nada en los anuncios.
3. Volvés con el aviso "¡Anuncios de Meta conectados!": ya se leyó el gasto de los últimos 30 días, y se vuelve a leer solo cada 3 horas (o con **"Leer Meta ahora"**).

### Conectar Google Ads
1. Apretá **"Conectar Google Ads"** (arriba a la derecha).
2. Se abre Google: entrá con la cuenta de Google que administra los anuncios y aceptá el permiso. Es sólo para **leer**: Laucen no cambia nada en las campañas.
3. Volvés con el aviso "¡Google Ads conectado!". Si la cuenta es administradora de otras, se leen todas las de abajo. Se vuelve a leer solo cada 3 horas.

Si vuelve con «Google todavía no deja leer cuentas reales»: el proyecto de Google Cloud de la app de Google de Laucen tiene que tener el **nivel de acceso «Explorador»** o más (en la consola de Google Cloud, en la Google Ads API). En «Prueba» sólo deja leer cuentas de prueba.

### Que cada venta de la web sepa de qué anuncio vino
En cada anuncio de Meta, en **«Parámetros de URL»** (al armar el anuncio, en «Seguimiento»), pegá el texto que muestra la pantalla en **Conexiones**. Así, cuando alguien entra a la tienda desde ese anuncio y compra, el pedido queda con el anuncio. Sin eso, la venta igual cuenta para Meta (por el código que Meta agrega a los links), pero no para un anuncio en particular.

En **Google Ads**, lo mismo con el texto de Google que muestra la pantalla, en la cuenta (o en cada campaña) › Configuración › **«Opciones de URL de la campaña»** › **«Sufijo de URL final»**. Sin eso, la venta cuenta para Google por el código que Google agrega a los links.

## Criterios y reglas

- **Mercado Libre**: el gasto, las veces que se vio, los clics y lo vendido salen de la publicidad de cada cuenta (ver [Publicidad en Mercado Libre](/ventas/campanas-ml)). Las **ventas son unidades** que Mercado Libre atribuye a la publicidad (las del producto anunciado y las de otros productos que compró quien entró por el anuncio).
- **Meta**: el gasto, las veces que se vio y los clics, de la cuenta publicitaria conectada, anuncio por anuncio. **Escribieron** = chats de WhatsApp o Instagram que empezaron desde un anuncio «Enviar mensaje» (Meta lo dice en el primer mensaje). **Ventas** = pedidos de la tienda web que llegaron desde un anuncio de Meta, sin cancelados ni devueltos; **Vendido** = su total.
- **De qué anuncio vino una compra de la web**: el último anuncio desde el que entró a la tienda en los últimos 30 días, aunque compre otro día.
- **Google**: el gasto, las veces que se vio y los clics de las cuentas de Google Ads conectadas, anuncio por anuncio; las campañas de **máximo rendimiento** (Performance Max), que no tienen anuncios sueltos, van como una sola fila con el nombre de la campaña. **Ventas** = pedidos de la tienda web que llegaron desde un anuncio de Google.
- **TikTok**: el gasto todavía no se lee (próximamente); las ventas de la web que llegan desde sus anuncios ya se cuentan.
- **Fechas**: cada cosa por su propia fecha (el gasto por el día del anuncio, el chat por cuándo empezó, el pedido por su fecha).
- **Montos**: en pesos de cada momento; un gasto en dólares se pasa a pesos con el dólar de ese día. «—» quiere decir que ese dato no se puede saber (por ejemplo, el gasto de un canal sin conectar), no que sea cero.

## Relacionado

- [Publicidad en Mercado Libre](/ventas/campanas-ml)
- [Publicidad de la tienda web](/config/tienda/medicion)
- [Ventas por canal](/informes/ventas-canal)
- [Mensajes](/ventas/mensajes)
