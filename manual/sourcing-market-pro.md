---
titulo: Market Pro
menu: Sourcing › Market Pro
ruta: /market-pro
rutas: /market-pro, /market-pro/categorias, /market-pro/productos, /market-pro/productos/ver, /market-pro/vendedores, /market-pro/marcas, /market-pro/descarga
permiso: market_pro_ver
resumen: Ventas de Mercado Libre por categoría, producto, vendedor y marca (datos de Market Pro de Real Trends), cruzadas con tu catálogo y tus costos, para decidir qué comprar y contra quién se compite.
---

## Para qué sirve

Market Pro es un servicio pago de Real Trends que informa **cuánto vende cada publicación de Mercado Libre**: unidades, facturación, precio, visitas, conversión, tipo de envío, plan (Clásica o Premium), vendedor y su reputación. Lo da **por mes desde octubre de 2023** y **por día desde octubre de 2025**, sólo de las categorías que habilita la llave contratada.

El sistema baja esos datos solo y los muestra agrupados para contestar:

- **Qué se vende**: las categorías y los productos que más facturan, y cuánto crecen.
- **Contra quién se compite**: los vendedores de cada categoría o producto, cuánto se lleva cada uno, si usan Full, Premium o catálogo, su reputación y su provincia.
- **Qué conviene comprar**: el puntaje de oportunidad (mucha venta, creciendo, pocos vendedores y sin un líder que se lleve todo) y, para lo que ya tenés en tu catálogo, la ganancia estimada al precio de mercado.
- **Qué marcas mueven el mercado**.

## Cómo se llega

- Menú **Sourcing › Market Pro**.
- Pestañas: **Resumen** ([/market-pro](/market-pro)), **Categorías** ([/market-pro/categorias](/market-pro/categorias)), **Productos** ([/market-pro/productos](/market-pro/productos)), **Vendedores** ([/market-pro/vendedores](/market-pro/vendedores)), **Marcas** ([/market-pro/marcas](/market-pro/marcas)) y **Descarga y llave** ([/market-pro/descarga](/market-pro/descarga)).
- Tocando un producto se abre su ficha ([/market-pro/productos/ver](/market-pro/productos/ver)): quién lo vende, a cuánto y cómo vendió mes a mes.

Para ver hace falta el permiso «Ver Market Pro». Cargar la llave y elegir las categorías pide «Configurar Market Pro».

## Qué hay en la pantalla

Arriba de cada pestaña de análisis:

- **Categoría**: se escribe para buscar. Filtra esa categoría con todas sus subcategorías. Sin elegir, todas las bajadas.
- **Período**: último mes cerrado, 3, 6, 12 o 24 meses, o desde octubre de 2023. Siempre son **meses cerrados**: el mes en curso está incompleto y engañaría.
- **Buscador** (en las listas): busca en cualquier parte del texto.

**Resumen**: facturación, unidades y ticket del período; unidades de los últimos 12 meses contra los 12 anteriores; el gráfico de facturación mes a mes (al pasar el mouse por cada barra se ven unidades, vendedores y ticket; la barra clara es el mes en curso); y los 10 primeros de cada lista.

**Categorías, Productos, Vendedores y Marcas**: una fila por cada uno, ordenable tocando el título de la columna, de a 50 por página, con «Descargar Excel» (baja lo que se ve, todas las filas).

En **Productos**, «Tu catálogo» deja ver sólo los que no tenés o sólo los que ya tenés. La marca «lo tenés» lleva a tu producto. Desde **Vendedores** o **Marcas**, tocar un nombre muestra sus productos.

**Descarga y llave**: la llave de la API (con el lápiz se pega; nunca se vuelve a mostrar), el estado de la descarga, las categorías que se bajan con cuánto falta, y las tandas que dieron error.

## Cómo se hace

### Cargar la llave

1. Entrá a **Sourcing › Market Pro**, pestaña **Descarga y llave**.
2. Tocá el lápiz arriba a la derecha del recuadro «Llave de la API».
3. Pegá la llave y tocá **Grabar**. Antes de grabarla se prueba con Market Pro: si no sirve, dice por qué (llave inválida o vencida, o sin acceso por API habilitado, que se le pide al representante de Market Pro).
4. Al grabarla arranca sola la descarga.

### Seguir la descarga

La descarga corre sola de fondo, aunque se cierre la pantalla. En **Descarga y llave** se ve, por categoría, cuántos meses y tandas de días están bajados y cuántas filas hay. **Sumar lo nuevo ahora** agrega a la cola lo del día y el mes en curso (lo hace solo cada mañana). **Pausar la descarga** la frena; **Seguir bajando** la retoma y vuelve a probar las tandas con error.

### Sumar una categoría a mano

Las categorías que habilita la llave se encuentran solas. Si hace falta otra: **Nueva categoría** (arriba a la derecha), escribí su número de Mercado Libre (por ejemplo MLA1652) y **Sumar**.

### Encontrar qué comprar

1. Pestaña **Productos**, «Tu catálogo»: **Los que no tenés**.
2. Ordená por **Oport.** (puntaje de oportunidad) o por **Fact.**
3. Abrí el producto: mirá cuántos vendedores tiene, cuánto se lleva el primero, a qué precio vende cada uno y si viene creciendo mes a mes.

## Criterios y reglas

- **Qué se baja**: de cada categoría habilitada, cada mes desde octubre de 2023 (sólo las publicaciones que vendieron algo ese mes; los atributos, sólo del último mes cerrado), cuántas publicaciones hubo cada mes con y sin ventas, y las ventas por día de los últimos 90 días. Primero lo más nuevo. El mes en curso y los días nuevos se vuelven a bajar cada mañana.
- **Cómo se encuentran las categorías habilitadas**: se lee el árbol de categorías y se prueba cada categoría principal; de las que devuelven datos se prueban sus subcategorías, y cada subcategoría con datos queda para bajar.
- **Market Pro atiende una consulta por vez y devuelve de a 100 filas**: una categoría grande tarda horas. El sistema trabaja de a vueltas de unos 4 minutos, sigue solo y, si se corta, vuelve a arrancar a los 2 minutos.
- **Un producto** junta las publicaciones del mismo producto de catálogo de Mercado Libre; si no tiene, las del mismo EAN; si no, las de la misma marca y modelo (salvo marcas genéricas); si no, la publicación sola.
- **Facturación**: lo que informa Market Pro (precio × unidades). **Ticket** = facturación ÷ unidades. **Precio** de un producto = la mediana de los precios de sus publicaciones en los últimos 3 meses; **Mín.** = el más bajo.
- **Crecimiento** = unidades de los últimos 3 meses cerrados contra los 3 anteriores. Verde si crece 10 % o más; rojo si cae 10 % o más.
- **Líder** = qué parte de las unidades se lleva el vendedor que más vende. En **Vendedores**, **Parte** = su facturación sobre la de todos los vendedores de lo filtrado.
- **Full, Premium y catálogo** = qué parte de las unidades se vendió así.
- **Conversión** = ventas ÷ visitas, promediada según las visitas de cada publicación.
- **Puntaje de oportunidad (0 a 100)**: se compara dentro de la lista que se ve. Sube con la facturación por mes y con el crecimiento (hasta el doble), y baja con la cantidad de vendedores y cuando un solo vendedor se lleva casi todo. Con menos de 3 unidades vendidas da 0. Es para ordenar y mirar primero, no una recomendación de compra.
- **«Lo tenés»**: alguna publicación del producto es de tus cuentas de Mercado Libre, o su EAN es el código de barras de una variación tuya.
- **Tu ganancia** (sólo en lo que ya tenés, con costo cargado): precio de mercado sin IVA, menos la comisión Clásica de la categoría (sin IVA), menos el costo promedio sin IVA. Se muestra **sobre la venta** (ganancia ÷ precio sin IVA) y **sobre el costo** (ganancia ÷ costo). No descuenta envío, cargos fijos ni impuestos: sirve para comparar productos, no para fijar precios. Si no se conoce la comisión de esa categoría se supone 14,5 %.
- **Vendedores**: Mercado Libre obliga a Market Pro a mostrar el apodo ofuscado. «nosotros» marca los vendedores con publicaciones de tus cuentas. Si en Market Pro le pusiste un alias a un vendedor, se muestra el alias (el apodo ofuscado queda al pasar el mouse).
- La llave **nunca se muestra**, sólo si está cargada y desde cuándo.

## Preguntas frecuentes

**¿Por qué no aparece nada?** La descarga recién empezó o falta la llave: mirá **Descarga y llave**.

**¿Por qué el mes en curso no suma en los totales?** Está incompleto: los totales y el crecimiento usan sólo meses cerrados. En el gráfico se ve como barra clara.

**¿Puedo ver otras categorías?** Sólo las que habilita la llave contratada.

## Relacionado

- [Radar](/radar): qué busca la gente en Mercado Libre.
- [Importaciones ARCA](/importaciones): quién importa qué y a qué precio.
- [Vendedores referentes](/compras/referentes): lo que venden los competidores que se leyeron, para pedir cotización.
