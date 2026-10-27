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
- **Por canal**: una fila por cada cuenta de Mercado Libre con publicidad, **Meta (Facebook e Instagram)**, **Google**, **TikTok**, **Otras campañas** (si hubo ventas desde links con utm de otra cosa) y **Tienda web sin anuncio** (para comparar). Columnas: **Invertido**, **Vieron** (veces que se vio un anuncio), **Clics**, **Escrib.** (chats de WhatsApp o Instagram que empezaron desde un anuncio, o desde el botón de WhatsApp de la tienda: ver «De dónde vino cada consulta de WhatsApp»), **Ventas**, **Vendido**, **Costo/venta** (invertido ÷ ventas) y **Retorno** (vendido ÷ invertido: «3,5 x» quiere decir que volvieron $ 3,50 por cada peso). Al pasar el mouse por el título de cada columna, qué cuenta.
- **Anuncios de Meta y Google (N)**: cada anuncio (con «Meta» o «Google» adelante) con su campaña y las mismas columnas, de a 50.
- **Conexiones**: las cuentas de anuncios de Meta y de Google Ads conectadas, cada una con su caja **Leer** (destildala si es de otro negocio que administra la misma persona: deja de leerse y su gasto sale del embudo; al volver a tildarla se lee de nuevo), cuándo se leyeron, **"Volver a conectar"** y **"Desconectar"** (que pregunta ahí mismo), lo que hay que poner en los anuncios para saber de cuál vino cada venta, y el estado de TikTok.
- **Robots que pasaron por la tienda (últimos 7 días)**: los programas de Google, Meta y otros que recorren la tienda (para mostrarla en los buscadores, revisar los anuncios o armar la vista previa de un link compartido), con cuántas veces pasó cada uno, cuándo fue la última y por qué página. No cuentan como visitas ni como consultas.
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

### De dónde vino cada consulta de WhatsApp
El botón de WhatsApp de la tienda web agrega al final del mensaje un código **que no se ve**. Laucen anota a quién se le acredita esa visita (ver «A qué anuncio se le acredita») y en qué página tocó el botón. Cuando entra el mensaje, la conversación queda con ese origen y cuenta en **Escrib.**: en Meta o Google si se le acredita a un anuncio, o en **Tienda web sin anuncio** si no. Si escribe sin pasar por el botón, queda como «directo». Funciona aunque el navegador del visitante corte Google y Meta.

### Bajar las listas para volver a mostrarles anuncios
Abajo, en **«Listas para volver a mostrarles anuncios»**, **"Bajar la lista para Google"** y **"Bajar la lista para Meta"** bajan un archivo con el teléfono y el mail de quienes escribieron por WhatsApp o cancelaron un pedido de la tienda en los últimos 90 días y no compraron después. Se sube en Google Ads (Herramientas › Administrador de públicos › lista de clientes) y en Meta (Públicos › Crear público personalizado › Lista de clientes).

## Criterios y reglas

- **A qué anuncio se le acredita** una venta de la tienda o una consulta desde su botón de WhatsApp: si en los **30 días anteriores** el visitante entró desde un anuncio, al **último anuncio** de esos 30 días, aunque después haya vuelto por un buscador, por Mercado Libre o escribiendo la dirección. Si no hubo anuncio, a por dónde entró la última vez. Se guarda también por dónde entró la primera vez. Cada navegador lleva sus entradas; en otro navegador o con las galletas borradas, empieza de cero.
- **El registro propio de visitantes**: cada visita, producto mirado, carrito, compra empezada, clic en WhatsApp y compra queda anotado en Laucen con un número anónimo del navegador; cuando el visitante compra o escribe desde el botón, se une a su ficha de cliente o a su conversación.

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
