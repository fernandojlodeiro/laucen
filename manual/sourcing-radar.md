---
titulo: Radar
menu: Sourcing › Radar
ruta: /radar
rutas: /radar, /radar/seguidas, /radar/historial, /radar/configuracion, /radar/ayuda
permiso: radar_ver
resumen: Tendencias de búsqueda de Mercado Libre por categoría, con las publicaciones de cada palabra (gratis o con Apify), categorías y palabras seguidas, gasto en Apify y procesos automáticos.
---

## Para qué sirve

El Radar muestra **qué está buscando la gente en Mercado Libre**, categoría por categoría, y cómo cambia de una semana a otra. Es una de las fuentes para decidir qué productos buscar en China para importar (la otra es [Importaciones ARCA](/importaciones)).

Con el Radar podés:

- Recorrer el árbol de categorías de Mercado Libre y ver las palabras más buscadas de cada una, separadas en dos rankings ("Más populares" y "Más deseadas").
- Ver qué palabras son nuevas, cuáles subieron o bajaron y cuáles salieron desde la lectura anterior.
- Abrir las publicaciones que aparecen al buscar una palabra: gratis (API oficial de Mercado Libre) o con más datos, incluida la cantidad vendida, pagando una búsqueda con Apify.
- Buscar palabras propias que no estén en las tendencias.
- Seguir categorías y palabras para que el sistema las lea solo todas las semanas.
- Controlar cuánto se gasta en Apify, con un tope semanal.

## Cómo se llega

- Menú **Sourcing › Radar**.
- Arriba hay una barra de pestañas: **Tendencias** ([/radar](/radar)), **Mis categorías seguidas** ([/radar/seguidas](/radar/seguidas)), **Historial** ([/radar/historial](/radar/historial)), **Configuración** ([/radar/configuracion](/radar/configuracion)) y **Ayuda** ([/radar/ayuda](/radar/ayuda)).
- Arriba a la izquierda está el botón **← Panel** para volver al panel.

Para entrar hace falta el permiso «Ver el Radar». Pedir búsquedas pagas y prender "Profundizar automático" pide además «Gastar en el Radar». Cambiar la configuración y correr los procesos a mano pide «Configurar el Radar». Sin «Ver el Radar», cada pestaña muestra "No tenés permiso para ver el Radar."

## Qué hay en la pantalla

### Pestaña Tendencias

- **Buscador de categorías** (arriba de todo): mientras escribís (desde 2 letras) busca categorías dentro de la categoría donde estás parado, o en todo el árbol si estás en la raíz. Elegir una te lleva a esa categoría.
- **Camino**: "Todo Mercado Libre › … › categoría actual". Cada parte se toca para volver a ese nivel. A la derecha dice "semana del dd/mm" (el lunes de la semana actual).
- **Columna SUBCATEGORÍAS** (izquierda): las hijas de la categoría actual, ordenadas por cantidad de publicaciones (Mercado Libre no informa cuánto factura cada categoría). Al lado de cada una:
  - la **estrella** ☆/★ para seguirla o dejar de seguirla sin entrar;
  - el número gris de publicaciones que tiene.
  Si no tiene hijas: "No tiene subcategorías."
- Debajo de las subcategorías (sólo si no estás en "Todo Mercado Libre"):
  - enlace **¿Qué hace seguir y profundizar?** (lleva a la Ayuda);
  - interruptor **Seguir esta categoría**;
  - interruptor **Profundizar automático**, con la ayuda "N por grupo con Apify los días del proceso · ~USD X". Está deshabilitado si no seguís la categoría o si no tenés «Gastar en el Radar».
- **✍ Buscar mis palabras**: un cuadro para escribir cualquier palabra (hasta 120 caracteres) y dos botones: **Ver publicaciones** (gratis) y **Con Apify ~USD 0,10** (o el costo de la fuente elegida; sólo aparece con «Gastar en el Radar»).
- **Pestañas de ranking**: **Más populares** y **Más deseadas**, cada una con la cantidad de palabras entre paréntesis y una **i** que, al pasar el mouse o tocarla, explica la regla del ranking.
- Debajo, una línea de ayuda con qué mide el ranking, "Leída el dd/mm" y, si es la primera vez que se lee esa categoría, "Primera lectura: todavía no hay semana anterior para comparar."
- **Lista de palabras** del ranking elegido, cada una con:
  - su lugar (1., 2., …) y la palabra;
  - la marca de cambio: **NUEVA**, **▲3** (subió 3 lugares), **▼2** (bajó 2), **=** (igual);
  - **ver en ML ↗** (abre la búsqueda en Mercado Libre);
  - **👁 vista dd/mm · quién** si alguien de tu organización ya miró sus publicaciones alguna vez (o "🤖 automática" si fue el proceso). La fila queda en gris. Tocarla abre el Historial filtrado por esa palabra;
  - botón **Ver publicaciones** (o **Cerrar** si ya está abierta);
  - botón **Mejorar con Apify ~USD 0,10** (sólo con «Gastar en el Radar» y si esta semana todavía no se buscó con Apify);
  - botón **Ver (Apify)** si ya hay búsqueda paga de esta semana.
- **Tabla de publicaciones** (al abrir una palabra): encabezado con la fuente ("API de Mercado Libre (catálogo, gratis)" o "Apify (karamelo)"), la fecha, el total de resultados y el costo en USD. Columnas: **#**, **Foto**, **Publicación** (con enlace), **Precio** (con el precio anterior tachado si había descuento), **Vendidos** (sólo en las de Apify, como "+100") y **Vendedor** ("(oficial)" si es tienda oficial). Se muestran 10; en Apify dice "Se muestran 10 de N guardadas."
- Al pie, si está prendido en Configuración: **Salieron de este grupo** desde la semana pasada: lista de palabras.

Avisos posibles en esta pestaña:
- "No se pudieron leer las tendencias. ¿Está conectada la cuenta de Mercado Libre?"
- "Mercado Libre no informa tendencias para esta categoría."
- "Se llegó al tope semanal de gasto de Apify. Se puede cambiar en Configuración."
- "Apify no pudo completar la búsqueda. Probá de nuevo en un rato."
- "Búsqueda del dd/mm. La lista de tendencias de abajo es la de esta semana." (cuando abrís desde el Historial una búsqueda de otra semana).

### Pestaña Mis categorías seguidas

- Tabla de categorías seguidas, **primero las que más cambiaron** (palabras nuevas + palabras que subieron). Columnas:
  - **Categoría**: "★ camino completo", enlace a sus Tendencias.
  - **Novedades de la semana**: "N nuevas · M ▲ · K salieron" y la lista de las nuevas (hasta 8) y de las que salieron (hasta 6). Si es la primera lectura: "Primera lectura (N palabras)." Si todavía no se leyó esta semana: "Sin lectura esta semana todavía."
  - **Profundizar**: interruptor; prendido muestra "~USD X" (lo que cuesta por corrida), apagado dice "apagado".
  - **Última lectura**: fecha.
  - **Tacho** 🗑: pregunta ahí mismo "¿Dejar de seguir?" **Sí** / **No**.
- Debajo: "Gasto estimado por corrida automática (profundizar + palabras seguidas): USD X · Gastado en Apify esta semana: USD Y de un tope de USD Z."
- Sección **✍ Mis palabras seguidas**: tabla con **Palabra** (★ palabra, enlace a su última búsqueda), **Categoría** (o "Todo Mercado Libre"), **Última búsqueda** (fecha · gratis/Apify) y el tacho "¿Dejar de seguir?".
- Si no seguís ninguna categoría: "Todavía no seguís ninguna categoría. En Tendencias, tocá la estrella ☆ de una subcategoría o prendé "Seguir esta categoría"."

### Pestaña Historial

- Cuadro **Buscar por palabra o categoría** y botón **Buscar**.
- Interruptor **Incluir automáticas** (muestra u oculta las búsquedas del proceso automático).
- Lista agrupada por día ("lunes 29/09"), lo más nuevo arriba. Cada fila: la estrella para seguir la categoría de esa búsqueda (en "Todo Mercado Libre" no se puede seguir), la hora, el camino de la categoría, la palabra entre comillas, "✍ palabra propia" si corresponde, el ranking en que estaba esa semana, la fuente (**Gratis** o **Apify (karamelo)**), cuántas publicaciones trajo, el costo en USD, "falló" o "corriendo" si corresponde, y quién la pidió (o "🤖 automática").
- Tocar una fila vuelve a Tendencias en esa categoría y ese ranking, con esas publicaciones abiertas.
- Muestra las últimas 200; si hay más: "Se muestran las últimas 200. Usá el buscador para encontrar anteriores."

### Pestaña Configuración

Abre en modo vista; el **lápiz** ✏️ arriba a la derecha la pasa a edición, y ahí quedan **Grabar** y **Cancelar**. Sin «Configurar el Radar» dice "No tenés permiso para cambiar la configuración."

Campos:
- **Tope de gasto en Apify**: USD por semana.
- **Leer tendencias**: cada N días/meses, comenzando el (fecha).
- **Actualizar el árbol de categorías**: cada N días/meses, comenzando el (fecha).
- **Profundizar**: cuántas palabras de cada grupo se buscan con Apify ("primeras de cada grupo (× 2 grupos: más deseadas y más populares)").
- **Fuente de Apify**: "karamelo (vendidos, posición) · ~USD 0,10 por palabra" o "devcake (vendidos, stock, ficha) · ~USD 0,19 por palabra".
- **Mostrar las que salieron**: caja **Mostrarlas**.

Sección **Procesos**:
- Estado del árbol: "✅ Árbol completo: N categorías, al dd/mm." (y si se está releyendo, cuántas faltan), o "Cargando el árbol: van N categorías, faltan leer M", o "El árbol de categorías todavía no se cargó."
- Botones (con «Configurar el Radar»): **Leer tendencias ahora**; **Releer el árbol ahora** (pregunta ahí mismo "¿Releer las N categorías? Casi nunca hace falta." **Sí** / **No**) o, si el árbol está incompleto, **Seguir cargando el árbol**.
- **Últimas corridas** (las 12 últimas): fecha y hora, tipo (**Árbol** o **Tendencias**, "(a mano)" si se corrió con el botón), estado (**completo**, **parcial (sigue mañana)**, **falló**, **corriendo**) y un resumen ("N categorías leídas · profundizar: hechas/pedidas · tope de gasto alcanzado", o para el árbol "N leídas · M pendientes de T").
- Al pie: "Semana actual: desde el lunes dd/mm."
- Si tu organización no tiene cuenta de Mercado Libre conectada: "Esta organización no tiene cuenta de Mercado Libre conectada; se usa la de otra organización si la hay."

### Pestaña Ayuda

Explicación escrita de cada símbolo, de seguir una categoría, de los dos rankings, de "Ver publicaciones" y "Mejorar con Apify", de "Buscar mis palabras", de lo que corre solo, del Historial y de dónde salen los datos.

## Cómo se hace

### Ver las tendencias de una categoría
1. Entrá a **Sourcing › Radar**.
2. Escribí parte del nombre en el buscador de categorías, o tocá una subcategoría de la columna izquierda.
3. Elegí la pestaña **Más populares** o **Más deseadas**.
4. Mirá las marcas: **NUEVA**, ▲, ▼, =. Tocá la **i** para recordar qué mide cada ranking.

La primera vez que alguien entra a una categoría en la semana, el sistema le pide la lista a Mercado Libre y la guarda; puede tardar un momento.

### Ver las publicaciones de una palabra (gratis)
1. En la lista de palabras, apretá **Ver publicaciones**.
2. Se abre la tabla debajo de la palabra. Trae productos de catálogo con su precio más bajo, vendedor y foto. **No trae cantidad vendida**.
3. **Cerrar** la oculta.

### Traer las publicaciones con vendidos (Apify, pago)
1. Apretá **Mejorar con Apify ~USD 0,10** al lado de la palabra.
2. El botón cambia a "Corriendo… ~1 min" y no se puede apretar dos veces.
3. Al terminar se abre la tabla con la columna **Vendidos**.
4. Si aparece "Se llegó al tope semanal…", no se puede gastar más hasta el lunes, salvo que alguien con «Configurar el Radar» suba el tope.

### Buscar una palabra propia
1. En **✍ Buscar mis palabras**, escribí la palabra (por ejemplo "maceta autorriego 30 cm").
2. Apretá **Ver publicaciones** (gratis) o **Con Apify** (pago).
3. Si estás dentro de una categoría, la búsqueda queda asociada a esa categoría; si estás en "Todo Mercado Libre", queda suelta.
4. Aparece un recuadro con la palabra y la marca "✍ palabra propia". Si la buscaste gratis, ahí mismo aparece **Mejorar con Apify** para traerla paga.

### Seguir una palabra propia
1. Después de buscarla, tocá la estrella ☆ del recuadro (dice "Seguir **esta palabra** (no la categoría)").
2. Queda en **Mis categorías seguidas → ✍ Mis palabras seguidas** y el proceso automático la vuelve a buscar con Apify en cada corrida.
3. Para dejar de seguirla: tacho 🗑 en esa lista → **Sí**, o volver a tocar la estrella.

### Seguir una categoría
- Desde la lista de subcategorías: tocá su ☆.
- Estando dentro de la categoría: prendé **Seguir esta categoría**.
- Desde el Historial: la ★ de la fila.
- Para dejar de seguirla: tacho en **Mis categorías seguidas** → **Sí**, o apagar el interruptor / tocar la ★.

### Prender "Profundizar automático"
1. Seguí la categoría (sin eso el interruptor está apagado y no se puede prender).
2. Prendé **Profundizar automático** (en Tendencias o en Mis categorías seguidas).
3. En cada corrida del proceso se buscan con Apify las primeras N palabras de cada ranking de esa categoría (3 por defecto, × 2 rankings). Pide «Gastar en el Radar».

### Cambiar el tope de gasto u otros parámetros
1. Entrá a **Configuración** y apretá el lápiz ✏️.
2. Cambiá los valores y apretá **Grabar** (arriba a la derecha). Aparece "Configuración guardada."
3. **Cancelar** vuelve a la vista sin grabar.

### Correr un proceso a mano
1. En **Configuración → Procesos**, apretá **Leer tendencias ahora** (o **Seguir cargando el árbol** / **Releer el árbol ahora**).
2. Espera hasta unos 4 minutos. Al terminar: "Proceso corrido. El resultado está abajo, en "Últimas corridas"."

### Volver a una búsqueda vieja
1. Entrá a **Historial**.
2. Buscá por palabra o categoría, o recorré los días.
3. Tocá la fila: se abre Tendencias con esas publicaciones.

## Criterios y reglas

**La semana.** Todo el Radar trabaja por semanas de lunes a domingo, en hora argentina (empieza el lunes a las 0:00).

**De dónde salen las tendencias.** Mercado Libre da, para cada categoría, una sola lista de hasta 50 palabras (en general 40) y la actualiza una vez por semana. El sistema la lee **una vez por categoría y por semana** y la guarda; no se pisa nada: cada semana queda como una lectura aparte. Si Mercado Libre responde que esa categoría no tiene tendencias, se guarda vacía para no volver a preguntar. "Todo Mercado Libre" también tiene su lista.

**Los dos rankings.** Se arman por la posición en la lista de Mercado Libre, igual que los muestra la página de cada categoría:
- **Más deseadas** = posiciones 1 a 20 ("Las búsquedas más deseadas"): lo que más gente buscó en la última semana. Mucho volumen y, en general, mucha competencia.
- **Más populares** = posiciones 21 en adelante ("Las tendencias más populares"): según Mercado Libre, mide el aumento de búsquedas contra dos semanas atrás. Sirve para detectar lo que empieza a pegar.
- La pestaña que abre por defecto es **Más populares**.

**Las marcas de cambio.** Se calculan al mostrar, comparando contra la **lectura anterior de esa misma categoría** (la última semana que se leyó, aunque no sea la inmediatamente anterior). El lugar se cuenta **dentro del ranking** (1 a 20 en cada uno). La comparación no distingue mayúsculas.
- **NUEVA**: no estaba en ese ranking en la lectura anterior.
- **▲n / ▼n**: subió o bajó n lugares.
- **=**: mismo lugar.
- Sin marca: es la primera lectura de esa categoría.
- "Salieron de este grupo": estaban en la lectura anterior y ya no (sólo si "Mostrar las que salieron" está tildado).

**Categorías seguidas vs. no seguidas.** Seguir una categoría hace tres cosas: (1) el proceso automático la lee todas las semanas, entres o no (las no seguidas se leen sólo las semanas en que alguien entra, y pueden tener huecos); (2) aparece en "Mis categorías seguidas" con el resumen de novedades; (3) habilita "Profundizar automático". En "Mis categorías seguidas" las novedades suman los dos rankings y el orden es por (nuevas + subieron), de mayor a menor.

**Ver publicaciones (gratis).** Pregunta a la API oficial de Mercado Libre por productos de catálogo que coinciden con la palabra, toma hasta 10 productos que tengan alguna oferta activa y, de cada uno, la oferta **más barata**, con el nombre del vendedor. No trae vendidos ni publicaciones fuera de catálogo. Cuesta USD 0.

**Mejorar con Apify (pago).** Lee la página de resultados de Mercado Libre como lo haría una persona. Trae hasta 48 publicaciones (se muestran 10) con precio, precio anterior, **vendidos** (en rangos, "+100"), opiniones, vendedor y foto; con la fuente devcake también el texto de stock. Costo aproximado por palabra: **karamelo USD 0,10** (por defecto) o **devcake USD 0,19**. Cada búsqueda tiene además un tope propio de USD 0,40. Una búsqueda manual espera hasta 3 minutos; una del proceso automático, hasta 2.

**No se paga dos veces lo mismo.** Si una palabra ya se buscó **esta semana** con la misma fuente (gratis o Apify con la misma fuente), se muestra lo guardado y no se vuelve a buscar ni a cobrar. La palabra se compara sin distinguir mayúsculas. Lo que se trae de Mercado Libre (árbol, tendencias y publicaciones) se guarda una sola vez y es compartido entre todas las organizaciones. Una búsqueda que quedó "corriendo" más de 10 minutos se considera colgada y se puede pedir de nuevo.

**Tope semanal de gasto en Apify.** Es por organización y por semana (de lunes a domingo). El gasto de la semana es la suma del costo de todas las búsquedas con Apify de la organización (manuales y automáticas); una búsqueda que todavía está corriendo cuenta con su costo estimado. Antes de cada búsqueda paga se verifica: si **lo gastado + el costo por palabra de la fuente supera el tope**, no se busca y aparece el aviso del tope. Por defecto el tope es **USD 5**; se acepta de 0 a 1.000 (un valor inválido vuelve a 5).

**Costo final.** Apify asienta el cobro definitivo un rato después de terminar. El sistema relee el costo final de las búsquedas de los últimos 8 días cada vez que se abre el Historial y en cada corrida del proceso diario, así que un costo puede cambiar levemente después.

**Costo estimado de profundizar.** Por categoría y por corrida: palabras a profundizar × 2 rankings × costo por palabra de la fuente. Con los valores por defecto: 3 × 2 × 0,10 = USD 0,60. El "Gasto estimado por corrida automática" de Mis categorías seguidas suma eso por cada categoría con Profundizar prendido, más el costo por palabra de cada palabra propia seguida.

**El proceso automático (cron diario).** Corre **todos los días a las 8:00** (hora argentina) y, para cada organización, decide qué le toca según su Configuración:
- **Leer tendencias** (gratis): toca si la fecha "comenzando el" ya llegó y pasaron "cada N días/meses" desde la última corrida **completa** (con 2 horas de margen); si nunca corrió completa, toca. También sigue si la última corrida de esta semana quedó parcial. Lee "Todo Mercado Libre" y todas las categorías seguidas. Por defecto: **cada 7 días**.
- **Profundizar** (pago, en la misma corrida): para cada categoría seguida con el interruptor prendido, busca con Apify las primeras N palabras de cada ranking (por defecto 3), de a 4 en paralelo, respetando el tope semanal.
- **Palabras seguidas** (pago, en la misma corrida): cada palabra propia con ★ se vuelve a buscar con Apify, respetando el mismo tope.
- **Árbol de categorías** (gratis): relee todas las categorías de Mercado Libre. Toca si a alguna organización le corresponde según su configuración (por defecto **cada 1 mes**), o si el último ciclo quedó incompleto. En cada corrida diaria usa como mucho unos 100 segundos, para no comerse la corrida.
- Si no le alcanza el tiempo, la corrida queda **parcial (sigue mañana)** y al día siguiente sigue donde quedó, sin repetir ni volver a pagar lo hecho. Si se llegó al tope de gasto, la corrida se da igual por **completa**.
- Valores aceptados en Configuración: "cada" entre 1 y 365; palabras a profundizar entre 1 y 20 (por defecto 3); una fecha inválida se reemplaza por la de hoy.

**Navegar con el árbol incompleto.** Si entrás a una categoría cuyas hijas todavía no se leyeron, el sistema las lee en el momento, así que se puede navegar aunque la carga completa no haya terminado.

**Cuenta de Mercado Libre.** Para leer, el Radar usa la cuenta de Mercado Libre conectada de tu organización; si no tiene, usa la de cualquier otra organización conectada. Sólo lee: el Radar nunca modifica nada en Mercado Libre.

**Qué es de cada organización.** Las categorías y palabras seguidas, la configuración, el historial y el gasto son de cada organización, y los ven todos sus usuarios con el nombre de quién hizo cada cosa. El Historial y la marca "👁 vista" sólo cuentan búsquedas pedidas por tu organización (si una palabra ya la había buscado otra organización esa semana, se muestra lo guardado y no queda una fila nueva en tu historial).

**Búsqueda en China.** El ítem **Sourcing › Búsqueda en China** figura en el menú como **próximamente**: todavía no existe la pantalla.

## Preguntas frecuentes

**¿Por qué "Ver publicaciones" no muestra cuánto vendió cada uno?**
Porque usa la API oficial gratuita, que no informa vendidos. Para eso está **Mejorar con Apify**, que cuesta unos USD 0,10 por palabra.

**Apreté "Mejorar con Apify" y dice que se llegó al tope. ¿Qué hago?**
El tope semanal de la organización ya se gastó. Se libera el lunes, o alguien con «Configurar el Radar» lo sube en **Configuración → Tope de gasto en Apify**.

**¿Si busco dos veces la misma palabra pago dos veces?**
No, dentro de la misma semana y con la misma fuente se muestra lo ya guardado. La semana siguiente sí se vuelve a buscar.

**¿Qué diferencia hay entre "Más populares" y "Más deseadas"?**
"Más deseadas" son las 20 palabras más buscadas de la semana (volumen). "Más populares" son las que más crecieron en búsquedas (lo que está empezando a pegar).

**Una palabra dice NUEVA pero ya la había visto. ¿Por qué?**
NUEVA es dentro de ese ranking y contra la lectura anterior de esa categoría. Pudo haber estado en el otro ranking, o en una lectura más vieja.

**¿Por qué no puedo prender "Profundizar automático"?**
Tenés que seguir la categoría primero, y tener el permiso «Gastar en el Radar».

**¿A qué hora se actualiza solo?**
Todos los días a las 8:00 corre el proceso; las tendencias se leen cada 7 días por defecto (Mercado Libre las cambia una vez por semana).

**¿Puedo seguir una palabra que no está en las tendencias?**
Sí: buscala en **✍ Buscar mis palabras** y tocá la ★ del recuadro. Se vuelve a buscar sola con Apify en cada corrida.

**¿Qué significa la fila gris con "👁 vista"?**
Que alguien de tu organización ya miró las publicaciones de esa palabra (alguna semana). Dice cuándo y quién.

**¿Dónde busco productos en China?**
La pantalla **Búsqueda en China** todavía no está hecha (figura como próximamente en el menú).

## Relacionado

- [Importaciones ARCA](/importaciones): qué se importa en Argentina, por NCM e importador.
- [Mis categorías seguidas](/radar/seguidas)
- [Historial](/radar/historial)
- [Configuración del Radar](/radar/configuracion)
- [Ayuda del Radar](/radar/ayuda)
- [Canales](/config/canales): conexión de la cuenta de Mercado Libre.
