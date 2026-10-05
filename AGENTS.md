# Laucen — convenciones para toda sesión (Code y Cowork)

**Este archivo es de convenciones generales. Un detalle de un módulo va en la bitácora, nunca
acá.** Tampoco en un documento aparte del repo: Cowork no ve el repo, y lo que no está en la
bitácora no lo sabe (ver "Coordinación entre sesiones").

Existe para que no le preguntes a Fer cosas que ya se saben. Leelo entero antes de preguntar
nada. Sólo preguntale lo que es específico de la tarea: qué sitios de China buscar, con qué
parámetros, qué hacer con lo que encuentra, etc. Todo lo demás ya está decidido acá abajo.

Toda sesión lee este archivo al arrancar (ver "Coordinación entre sesiones").

## Qué es esto

Búsqueda de productos con determinadas características en sitios de venta de China (Alibaba,
1688, AliExpress u otros), para importar, cruzada con lo que se vende e importa en Argentina.
Hoy lo usa sólo Fer, pero el login está armado multi-cliente desde el arranque —igual que
CadaMes: usuarios, organizaciones, roles como datos por organización, permisos como
checkboxes— por si más adelante hay más de una organización usándolo. La búsqueda en China nace de un cron
que dispara búsquedas periódicas y guarda resultados; el panel para mirarlos es la parte final,
no la primera.

## Módulos (una línea cada uno; el detalle, en la bitácora)

- **Radar** (`/radar`): tendencias de Mercado Libre.
- **Importaciones** (`/importaciones`): despachos de importación argentinos de ARCA +
  enriquecimiento con Softrade. La orden original de Cowork está en
  `docs/orden-arca-importaciones.md`; los pasos de carga para Code, en `scripts/arca/LEEME.md`.
- **Cimiento del ERP** (orden 136, `docs/136-laucen-cimiento.md`): el sistema de gestión que
  reemplaza a Virtual Seller — menú (`lib/menu.ts`), catálogo, precios, stock, canales,
  clientes, pedidos, API (`/api/pedidos`, `/api/catalogo`), tipo de cambio, importar. El contrato
  de la API y de las funciones únicas está en la bitácora, hilo "136 — Cimiento".
- **Asistente** (la carita de abajo a la derecha; `/config/asistente`): contesta en lenguaje
  natural cómo se hace cada cosa, dónde está, criterios y datos (`lib/asistente/`). Lee el
  manual del sistema (`manual/*.md`, formato en `manual/LEEME.md`).
- **WhatsApp** (`/ventas/mensajes`; orden #290): la carpeta de mensajes tipo WhatsApp Web copiada de
  la Bandeja de CadaMes (`lib/mensajes/`). Los contesta la IA de la tienda (Sonnet) y deriva a una
  persona lo que no sabe. Número conectado con coexistencia por el alta embebida de la app de Meta
  de CadaMes (`META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID`, cargadas por Fer el 3/10), cada
  cuenta con su propia dirección de entrega (`override_callback_uri` → `/api/whatsapp/webhook`).
- **Coordinación** (`/admin/bitacora`, `/admin/para-probar`): bitácora y "para probar", sólo
  Fer. → sección "Coordinación entre sesiones" de este archivo
- **Falta**: la búsqueda en China (Alibaba/1688) y el cruce con Mercado Libre.

## Infraestructura (ya creada y andando — no preguntar, no rehacer)

- **Repo**: `fernandojlodeiro/laucen` en GitHub. App Next.js 15 (App Router, TypeScript,
  Tailwind). Conectado a Vercel: cada push a `main` despliega solo.
- **Base de datos**: Supabase, proyecto `laucen` (ref `pcltuzztybiovhuaheek`, región
  `sa-east-1`), misma cuenta que CadaMes pero base separada. No se comparte ninguna tabla con
  CadaMes.
- **Hosting**: Vercel, proyecto `laucen`, equipo CadaMes. Variables de entorno cargadas:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`
  (`fernandojlodeiro@gmail.com`), `NEXT_PUBLIC_SITE_URL` y `DATABASE_URL` (la cargó Fer; nadie
  más la tiene). Ojo: `DATABASE_URL` tiene **sólo la contraseña** de la base;
  `lib/database-url.ts` arma la dirección contra el pooler `aws-0-sa-east-1` (la conexión
  directa `db.…` es sólo IPv6 y Vercel no llega). Si algo de la base falla, mirar primero
  `/admin/diagnostico`.
  También: `MELI_APP_ID`, `MELI_CLIENT_SECRET` (Mercado Libre), `APIFY_TOKEN` (Apify) y
  `ANTHROPIC_API_KEY` (Claude; tiene que ser una llave creada adentro de un workspace, o si no
  hace falta `ANTHROPIC_WORKSPACE_ID`) y `VERCEL_TOKEN` (API de Vercel, alcance equipo CadaMes:
  agrega y saca los dominios de las tiendas; la cargó Fer el 3/10). **Después de que Fer cambia una variable, se despliega
  con un push a main, nunca con el botón "Redeploy" de Vercel**: ese botón vuelve a desplegar
  un commit viejo y deja producción atrasada.
- **Cron**: Vercel Cron Jobs nativo (`vercel.json`).
- **Login**: confirmado de punta a punta el 24/9 (Fer entra por `laucen.vercel.app`, con
  organización y rol Admin). Supabase tiene prendida la confirmación por mail.
- **Dominios** (Fer, 3/10, bitácora #275/#281): **el panel es `laucen.com`**; `laucen.com.ar`,
  `www.laucen.com` y `www.laucen.com.ar` redirigen (308) a `laucen.com`. `laucen.vercel.app` sigue
  andando, pero ningún link sale con ella: los que salen del sistema usan `urlPanel()`
  (`lib/tienda/dominios.ts`). `laucen.*` tienen el DNS en Cloudflare (cuenta de Fer).
  **Los dominios de las tiendas no van en el código**: los carga cada organización en
  Configuración › Tienda web › Dominios (tabla `tienda_dominio`; Laucen los agrega al proyecto de
  Vercel por API con `VERCEL_TOKEN`, `lib/tienda/vercel.ts`), y el middleware (en Node) resuelve
  host → tienda desde la base; un dominio desconocido muestra "dominio no configurado". Hoy:
  `daitom.com.ar` = tienda pública (marca Daitom); `www.daitom.com.ar`, `tiendavirtual.com(.ar)` y
  sus www redirigen a daitom; DNS de daitom y tiendavirtual en Cloudflare. App de Mercado Libre:
  redirect `https://laucen.com/admin/meli/callback`, notificaciones
  `https://laucen.com/api/meli/notificaciones`.

## Cómo hablarle a Fer

Fer programa desde 1986 —COBOL, Clipper, bases de datos— y vivió diez años de eso antes de
volverse comerciante e importador. Entiende lógica de programación (variable, bucle, `if`), no
conoce los lenguajes y frameworks nuevos. Hablale en criollo: no le expliques como si no supiera
nada, pero no asumas que conoce una librería o framework puntual sin decir qué hace.

Contestale corto y concreto. Primero la respuesta, después el porqué si lo pide. Si hay más de
un camino, dáselo en opciones numeradas con una recomendada, y esperá el sí — no elijas por él.

**Todo lo que la sesión pueda hacer sola, la sesión lo hace sola — no se le delega a Fer.** Nada
de pedirle que instale algo, corra un comando, edite una variable de entorno. Si hay duda de
quién debería hacerlo, se le ofrece elegir: *"¿querés hacerlo vos o lo hago yo?"*.

## Convenciones de interfaz

Cada cosa se dibuja como lo que es — no se mezclan:
- Un botón se dibuja como un botón (fondo, borde, padding), nunca texto suelto que resulta ser
  una acción.
- Una pestaña se dibuja como una pestaña.
- Un interruptor se dibuja como un interruptor.
- Un checkbox se dibuja como una caja para tildar, nunca un botón que se pinta cuando está
  elegido.

Editar y borrar en una lista o tabla:
- **Editar es un lápiz**, nunca la palabra "Editar".
- **Borrar es un tacho**, y al apretarlo pregunta ahí mismo, en el lugar del tacho: "Sí" / "No"
  — nunca una alerta del navegador ni un cartel aparte.
- En una grilla o tabla, la edición pasa **adentro de la fila** — el lápiz convierte esa fila en
  sus campos editables ahí mismo, nunca un panel aparte ni una ventana.

Fichas (pedido de Fer, 3/10): **toda ficha abre en modo vista** — los datos a la vista, sin
campos editables, pero **en modo vista los datos se ven en los mismos marcos que en edición**
(mismo borde, alto, relleno y alineación —números a la derecha—, fondo gris claro, sin cursor):
pasar de vista a edición no mueve nada. Vacío, "—" adentro del marco; un texto largo, en un marco
como el del textarea, con sus saltos de línea y desplazamiento si es muy largo (`Dato … largo`).
Un valor suelto fuera de `Dato`, con `ValorVista`; una caja para tildar, deshabilitada. Se edita apretando el **lápiz arriba a la derecha**, al lado de "Nuevo …"; en edición, en
ese mismo lugar quedan **"Grabar"** y "Cancelar" (vuelve a la vista sin grabar). Nunca un "Guardar"
al pie del formulario: **Nuevo, Lápiz y Grabar viven siempre arriba a la derecha** (en `acciones`
de `Pantalla`; si la ficha tiene varias cajas que se graban por separado, en el título de cada caja,
alineados a la derecha, `TituloSeccion`). El modo va en la dirección (`?editar=ficha`, o el nombre
de la caja), así anda del lado del servidor; "Grabar" manda el formulario desde el encabezado con
el atributo `form` (`<button form="ficha">`). Grabar bien vuelve a la vista; si falla, sigue en
edición con el error. Piezas: `BotonesFicha`, `Dato`, `TituloSeccion` y `editandoFicha()` de
`app/componentes/erp.tsx`. Las grillas con lápiz por fila siguen como están (la fila se edita ahí
mismo), y un documento que se está escribiendo (borrador de factura o despacho) no se bloquea:
sólo su acción final ("Registrar") va arriba a la derecha.

Pestañas (pedido de Fer, 3/10): **una sola barra de pestañas para todo el panel**
(`app/componentes/Pestanas.tsx`; la que se prende sola según la ruta, `Pestanas` de
`app/radar/Cliente.tsx`, dibuja con ésa). Las no elegidas se ven como pestañas igual (degradé gris
suave, tipo Excel, esquinas de arriba redondeadas); la elegida, blanca, con texto y raya azul, unida
al contenido. **Cada pestaña muestra entre paréntesis cuántas cosas tiene**: "Variaciones (2)",
"Fotos (0)" — el cero también. Sin cuenta sólo las que no cuentan cosas (pantallas de navegación,
informes, un formulario como "Datos"). La barra nunca muestra una barra de desplazamiento vertical;
si no entran a lo ancho, se desplaza de costado.

Altas (pedido de Fer, 2/10): **ningún ABM da de alta algo sin apretar antes un botón "Nuevo …"**.
El formulario de alta queda escondido hasta ese botón (`app/componentes/AltaNueva.tsx`); nunca un
campo suelto que parece un buscador y al dar Enter crea un registro. **El botón va arriba a la
derecha, a la altura del título** (`BotonNuevo` en `acciones` de `Pantalla`; en una sección, al
lado de su título) y el formulario se abre debajo del encabezado (`<AltaNueva … sinBoton>`; se
emparejan por el texto, el estado va en `?nuevo=`). Lo mismo los "Nueva factura" que llevan a otra
pantalla. Si el alta falla, vuelve con el error y el formulario abierto (`intentar()` de
`lib/erp/acciones.ts` conserva el `?nuevo=` de la pantalla de origen).

Listas de los ABM (pedido de Fer, 3/10):
- **De a una página** (50 filas) con el paginador abajo: "1–50 de 4.509", Anterior / Siguiente
  (`?p=`). Nada de topes fijos tipo "se muestran los primeros 300". Buscar o filtrar vuelve a la
  página 1. Piezas: `consultaPaginada()` / `paginarEnMemoria()` de `lib/lista.ts` y `<Paginado>`
  de `app/componentes/Lista.tsx`.
- **Se ordena tocando el título de la columna** (`<ThOrden>`, ▲/▼, `?orden=&dir=`). El SQL sale
  de una lista blanca columna → expresión (`leerOrden()`): lo que llega por la dirección nunca se
  pega en el SQL. Sin elegir, el orden de siempre.
- **Todo dato tiene su enlace**: el SKU o código del producto → su ficha; el cliente → su ficha;
  el proveedor → su fila (`/compras/proveedores?id=`); el número de pedido → el pedido. Un número
  que cuenta cosas (productos de una familia, ubicaciones de un depósito, unidades) → la lista de
  esas cosas filtrada, sólo las activas salvo que se pida.
- **Al lado de un producto, su foto principal** (no un ícono; `app/componentes/FotosProducto.tsx`,
  pedido de Fer 5/10): al tocarla abre todas; si no tiene fotos no aparece. Vale también en el
  buscador general y en la ficha (Datos muestra la principal).
- **Clientes y proveedores muestran su "N.º"** (el id interno): primera columna y en la ficha.
- **Todo ABM tiene "Descargar Excel" con configuraciones** (pedido de Fer, 3/10): arriba a la
  derecha, al lado de "Nuevo …" (`<AccionesExcel>` de `app/listas/piezas.tsx`). Baja lo que se ve
  (filtros, búsqueda y orden de la pantalla) pero todas las filas (tope 50.000), con las columnas
  de la configuración elegida en su desplegable: "Como en pantalla" o una guardada (nombre +
  columnas en orden, por organización, en `lista_config`; se arman en "Configurar…").
- **Vistas configurables** (qué columnas se ven y en qué orden; selector "Vista" arriba de la
  tabla, "Estándar" = la de siempre, la última elegida queda en una cookie) en productos, pedidos,
  clientes, facturas de compra y facturación. La tabla se dibuja desde el catálogo
  (`<TablaVista>`).
- Una pantalla con lista declara **una sola vez** su catálogo de campos y su consulta en un
  `lista.tsx` al lado de la página (`lib/listas/tipos.ts`: clave, título, SQL, formato y, si va
  en pantalla, la celda) y se suma a `app/listas/registro.ts`. La pantalla usa esa misma consulta
  para que el Excel tenga sus mismos filtros; el orden por columna sale del catálogo (lista blanca).

Camino (pedido de Fer, 3/10): **arriba a la izquierda, sobre el título**, "Stock › Depósitos y
ubicaciones › A127-26"; cada parte se toca para volver a ese nivel. Sección y pantalla salen
solas de `lib/menu.ts` (`Pantalla` dibuja `app/componentes/Camino.tsx`); una ficha suma sus
partes con `camino={[…]}`. Nada de links "← Volver" sueltos arriba.

Llaves y tokens: **nunca se muestran** en una pantalla (ni pedazos): sólo si hay o no. La llave
API de un canal se ve completa una sola vez, al generarla.

Buscadores (pedido de Fer, 2/10):
- **Todo ABM tiene su buscador.**
- **Donde se pide una ubicación, se elige con buscador** (`app/componentes/ElegirUbicacion.tsx`),
  nunca un desplegable: son cientos.
- **Donde se elige una categoría (familia), con buscador (`app/componentes/ElegirFamilia.tsx`),
  nunca desplegable**: son miles (el árbol de Mercado Libre). Busca en el servidor mientras se
  tipea, por nombre o camino ("Electrónica › Componentes"), y muestra el camino. Sirve para un
  formulario (`name`), para un filtro de lista (`parametro`) y para elegir padre (`propias`,
  `excluir`). El filtro por familia incluye sus subfamilias.
- Busca mientras se tipea (desde la segunda letra), sin botón "Buscar" ni "Limpiar": una X
  adentro del cuadro borra lo escrito. Con la caja **"Comienza por"**, tildada de entrada
  (coincidencia al principio del texto; destildada, en cualquier parte). Componente:
  `app/componentes/BuscadorVivo.tsx`.

Fechas desde/hasta (pedido de Fer, 3/10): **RangoFechas con atajos**
(`app/componentes/RangoFechas.tsx`) en todo filtro "desde / hasta": en un renglón, un desplegable
de atajos (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año;
"Personalizado" si se tocan las fechas a mano) y las dos fechas chicas. Elegir un atajo llena las
dos fechas y filtra al momento (cambia la dirección, como el buscador); días en hora argentina
(`lib/rango-fechas.ts`). Mes, trimestre y año "último" son el anterior entero.

Campos numéricos (pedido de Fer, 27/9): usar `app/componentes/CampoNumero.tsx` y leer con
`leerNumero()` de `lib/numeros.ts`.
- Todo número va **alineado a la derecha**.
- Precios (pesos o dólares): al salir del campo o con Enter se reescriben con **punto de
  miles**. Porcentajes: **un decimal**. Enter en un campo no envía el formulario.
- Se acepta "7,1" y "7.1" (un punto que no separa miles es la coma decimal).
- Campos de una misma fila, alineados aunque una ayuda ocupe dos renglones.
- Una opción que todavía no se usa se muestra deshabilitada ("próximamente"), no se esconde.

"Nada de la cocina en las pantallas": un error técnico (de Supabase, de la base) se traduce a
criollo, nunca se muestra crudo (`motivoLegible()` en `app/auth-actions.ts`).

## Permisos mientras Laucen lo usa sólo Fer

- **Función = cada botón del menú inicial (el panel).** Las herramientas internas (bitácora,
  para probar, Mercado Libre) no cuentan: esas son sólo de Fer por mail (`lib/admin.ts`).
- **Cada función tiene su permiso en el rol, y el botón aparece sólo si el rol lo tiene en
  `true`.** El gate funciona de verdad: un `false` explícito esconde el botón y cierra la
  pantalla.
- **Mientras no exista la pantalla de roles y usuarios, un permiso de función que el rol no
  tiene cargado vale `true`.** Está en el código: la lista `FUNCIONES` de `lib/permisos.ts` y
  `tienePermiso()`. Una función nueva agrega ahí su permiso y queda visible sin que nadie tenga
  que prenderlo. Los demás permisos (los que no son de un botón del menú) siguen como antes: si
  faltan, valen `false`.
- Esto vale mientras el proyecto esté en desarrollo y lo use sólo Fer; cambia cuando Fer lo
  diga explícitamente.
- **Superadministrador** (pedido de Fer, 3/10): marcado en la membresía, tiene todos los permisos
  sin importar el rol; sólo otro superadministrador lo nombra o lo saca. El dueño (quien creó la
  organización) lo es siempre y nadie lo suspende. Nadie da un permiso que no tiene. Un permiso
  nuevo que no es de un botón del menú decide en `db/equipo.sql` a qué rol existente se le da.

## Cambios en Mercado Libre: siempre por un clic de Fer (pedido de Fer, 3/10)

- **Ninguna sesión modifica Mercado Libre por su cuenta** (precios, stock, estados, campañas,
  atributos, publicaciones nuevas), aunque Fer lo pida en el chat. Lo que se pida se **prepara**
  (se calcula, se muestra qué va a cambiar en cada publicación) y se deja **un botón en el panel**
  para que Fer lo mande. Así nada sale por un malentendido en el chat. Leer de Mercado Libre sí
  se puede.
- Lo automático (stock que llega al umbral → pausar, reactivar, precios que siguen a la Clásica)
  sólo corre en un canal si Fer prendió su interruptor (`canal.config`); prenderlo es su clic.
- Todo lo que va a Mercado Libre pasa por la cola (`lib/mercadolibre/cola.ts`): se reintenta,
  respeta los límites de la API y queda registrado qué se mandó, cuándo y con qué resultado.

## Disciplina técnica (todo va a main)

- **Manual del sistema (pedido de Fer, 3/10): toda pantalla nueva o cambiada actualiza su página
  en `manual/` en el mismo commit** — qué es, dónde está, cómo se hace y, sobre todo, los
  criterios (fórmulas, estados, automatismos), en criollo y sin nada técnico. Lo lee el
  asistente para contestarle a la gente. `tests/manual.test.ts` falla si una página
  (`app/**/page.tsx`) no está en las `rutas` de ningún archivo o si un enlace del manual va a una
  dirección que no existe. Formato: `manual/LEEME.md`.

- No hay rama de integración que esperar: lo terminado y verificado se mergea a main.
- **Toda migración que crea una tabla agrega, en el mismo archivo, `ALTER TABLE ... ENABLE ROW
  LEVEL SECURITY`.** Sin excepción, tenga política o no.
- Las tablas de cada módulo se crean solas: un `db/<módulo>.sql` idempotente (`if not exists`)
  que corre `lib/<módulo>/esquema.ts` al primer uso tras cada arranque. Una migración nueva va
  en ese mismo archivo.
- Orden de migraciones y deploy: agregar una columna nueva se aplica a la base **antes o en el
  mismo paso** que el push a main que la usa. Borrar una columna es al revés: se saca del
  schema del código → se mergea → se espera el deploy → recién ahí el `DROP COLUMN`.
- Repo clonado en profundidad 1: un merge entre ramas puede fallar con "refusing to merge
  unrelated histories" — hace falta `git fetch --unshallow`.

## Tests en paralelo

Si los tests corren en paralelo contra la misma base: lo que es compartido se pide por turno
(un candado), no se borra al terminar. Nadie vacía una tabla entera sin filtrar.

## Datos de prueba

Es un proyecto personal en fase de prueba. Lo que haya cargado se puede romper, cambiar o
borrar sin pedir permiso ni advertir qué se pierde — no hay nada real todavía. Cuando eso
cambie, Fer lo va a decir explícitamente.

## Qué se lleva de CadaMes y qué no

- **Sí**: el login multi-cliente entero (usuarios · organizaciones · roles · membresías,
  permisos como checkboxes, candado anti-encierro: nunca dejar una organización sin nadie que
  pueda administrarla) — `db/tenancy.ts`, `lib/tenancy.ts`, `lib/permisos.ts`, `lib/roles.ts`,
  `app/auth-actions.ts`. Y la coordinación (bitácora + para probar).
- **También** (Fer, 3/10): la Bandeja de mensajes con sus reglas y la conexión con Meta (WhatsApp
  con coexistencia) — ver el módulo WhatsApp arriba.
- **No**: vocabulario, marca y WhatsApp como interfaz del usuario del sistema (decisiones de producto
  de CadaMes); módulos desacoplables (arquitectura de CadaMes); login con Google, antibot del
  registro y aceptación de términos (no hacían falta para arrancar; el código de CadaMes sirve
  de modelo, detalle en `README.md`); accesibilidad medida con axe-core (no se pidió).

## Coordinación entre sesiones

- **Toda sesión, Code o Cowork, lee este archivo al arrancar.** Cowork lo lee de
  `coordinacion.documentos` (nombre `'AGENTS.md'`) con su conector de Supabase; Code, del repo.
  Cada deploy de producción lo publica solo ahí (`scripts/publicar-documentos.mjs`, paso del
  build), con el commit del build.
- **Cowork NUNCA edita `AGENTS.md` en la base** (`coordinacion.documentos`): es una copia, el
  próximo deploy la pisa y el cambio se pierde. El original está en el repo y lo cambia sólo
  Code. Si Cowork necesita asentar algo en `AGENTS.md`, anota en la bitácora una entrada tipo
  `orden` ("agregar a AGENTS.md: …", con el texto); la sesión de Code que la tome cambia el
  archivo, lo sube a main (el deploy lo vuelve a publicar en la base) y responde en el hilo.
- **Bitácora y para probar**: Supabase, proyecto `laucen` (ref `pcltuzztybiovhuaheek`), esquema
  `coordinacion` (`db/coordinacion.sql`). En la app: `/admin/bitacora` y `/admin/para-probar`.
  Autores: `fer`, `code`, `cowork`; Cowork escribe como `cowork`, Code como `code`.
- **Nombre de la sesión**: toda entrada de bitácora y fila de para probar lleva en `sesion` el
  id de la sesión que la escribió, y esa sesión mantiene su título en `coordinacion.sesiones`
  (`id`, `titulo`, `autor`): antes de escribir, un upsert con el título actual. El título es el
  que Fer le pone a la sesión en el panel de Claude (Code lo lee con `get_session`, sin
  `session_id`; Cowork usa el nombre de su conversación). Las pantallas muestran el título, no
  el id.
- **La bitácora es el vínculo de coordinación entre Fer y las sesiones de Code y de Cowork.**
  **Toda sesión lee las entradas nuevas de la bitácora antes de empezar.**
- **Para ahorrar lectura (pedido de Fer, 3/10): al arrancar se lee SÓLO lo no archivado**
  (`where not archivada`): el último hilo **"Resumen"** (tipo `entrega`, título que empieza con
  "Resumen") y lo que se anotó después. Lo archivado (`archivada = true`) ya está resumido ahí; se
  consulta sólo si hace falta profundizar en un tema puntual (buscando por palabra, no leyendo
  todo). En la app, "Ver archivadas" en `/admin/bitacora`.
- **Al cerrar una sesión larga** (o cuando Fer lo pide), esa sesión escribe un hilo "Resumen — …"
  con lo hecho y lo que quedó pendiente (con los ids de los hilos abiertos que siguen vivos), y
  marca `archivada = true` todo lo anterior a ese resumen. Un hilo que sigue abierto (una orden
  sin "Terminado", una pregunta sin respuesta) se nombra en el resumen para que no se pierda.
- **Un tema = un hilo.** La entrada raíz lleva tipo `orden` o `pregunta` y
  `pide_lectura = true`; las respuestas llevan `responde_a` = id de la raíz.
- **Anotar sin esperar respuesta**: si una sesión hizo algo que no necesita respuesta de nadie,
  lo anota y listo. Sin seguimiento.
- **Pedidos de una sesión a otra** (Cowork → Code o Code → Cowork): el título lo dice de entrada,
  "Para Code: …" o "Para Cowork: …". Enseguida de anotarlo, **quien pidió programa una revisión
  de la bitácora** para dentro de 5 a 60 minutos (a su criterio, según lo que tarde la tarea),
  para ver si ya está hecho y si hay alguna repregunta.
- **El seguimiento no se corta hasta que el tema se cierra**: en cada revisión, si el tema sigue
  abierto, se programa la próxima. Sin novedades, se repite cada 60 minutos. Si pasan **24 horas
  desde la última respuesta en el hilo** sin nada nuevo, se deja de revisar; y antes de parar,
  la sesión que pidió le escribe a Fer **en el chat de esa sesión**: "Fer, el tema '…' (#id)
  quedó colgado".
- **Cierre**: un tema entre sesiones se cierra cuando **las dos partes** escribieron "Tema
  cerrado"; con una sola no alcanza. **Fer puede cerrarlo solo**: si Fer escribe "Tema cerrado",
  se terminó — nadie programa más revisiones y se cancelan las que haya.
- **Si Fer interviene** y le dice a la sesión que pidió "fijate, ya está", esa sesión cancela la
  revisión programada, lee la bitácora y responde igual.
- Si una sesión no tiene cómo programar revisiones, lo anota en el hilo ("no puedo hacer el
  seguimiento") y Fer decide.
- **Tomar una tarea: primero se avisa, después se hace.** Fer suele tener varias sesiones de
  Code y de Cowork abiertas a la vez. Para que dos no hagan lo mismo:
  1. Antes de tomar una orden de la bitácora, leer su hilo entero: si alguien ya escribió
     "Me encargo yo" y todavía no escribió "Terminado", esa tarea es de esa sesión — no se toca.
  2. Si nadie la tomó: **lo primero** es responder en el hilo "Me encargo yo" (con el link o id
     de la sesión). Recién después se empieza a trabajar.
  3. Enseguida de anotarlo, releer el hilo: si otra sesión escribió "Me encargo yo" antes (id
     más bajo), gana esa; la segunda escribe "La deja, la toma #<id>" y no la hace.
  4. Al terminar, responder en el hilo "Terminado" (con qué se hizo, en pocas líneas), para
     que ninguna otra sesión la intente. Si se abandona a mitad, escribir "La suelto" y por qué.
- **Todo lo nuevo se anota en la bitácora, aunque nadie lo haya pedido.** Cada cosa que una
  sesión hace, decide o descubre (una función nueva, un cambio de criterio, un detalle de cómo
  anda un módulo, un hueco que queda abierto) va a la bitácora: qué es, para qué, y qué queda
  pendiente. Así Fer, Code, Cowork y las sesiones futuras están todos al tanto y se arma el ida
  y vuelta solo. La bitácora es la memoria compartida del proyecto: lo que no está ahí, para
  Cowork no existe.
- Lo que NO va: el parte de trabajo con la lista de archivos tocados y las pruebas que pasaron
  (eso ya está en el commit).
- **"Para probar"**: una fila por cada cosa distinta que haya que probar, con qué abrir, qué
  hacer y qué tiene que pasar, en pocas frases. Se inserta en el mismo paso que el push. El
  arreglo de algo que falló no es una fila nueva: es una vuelta colgada de la misma fila.
- **Órdenes que llegan desde Laucen** (autor `laucen`, pedido de un usuario al asistente que un
  superadministrador mandó a programar; `pedido_por_usuario` dice quién): **ninguna sesión las
  programa sola**. Fer las repasa desde el chat ("¿qué hay pendiente de Laucen en la bitácora?")
  y decide cuáles se hacen; recién con su sí se toman como cualquier orden.
- **Archivos que Cowork le manda a Code**: `NNN-laucen-<tema>.md`, numeración correlativa
  compartida con CadaMes; antes de asignar un número se mira el último usado.
- **Softrade**: plataforma de datos de aduana a la que Fer accede con la cuenta de un amigo
  (Ariel). Sin API. Los Excel los exportan Fer o Cowork a mano y se dejan en
  `C:\Laucen\softrade\in\`. Code no navega Softrade.
