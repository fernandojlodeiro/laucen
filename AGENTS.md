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
- **Cron**: Vercel Cron Jobs nativo (`vercel.json`).
- **Login**: confirmado de punta a punta el 24/9 (Fer entra por `laucen.vercel.app`, con
  organización y rol Admin). Supabase tiene prendida la confirmación por mail.
- **Dominios**: `laucen.com.ar` (Nic.ar) y `laucen.com` (GoDaddy), agregados al proyecto de
  Vercel con los nameservers de Vercel. Al 24/9 no habían terminado de propagar (Nic.ar es
  lento): **antes de tocar nada de dominios, revisar si ya propagó**. Mientras tanto
  `laucen.com.ar` puede mostrar una landing vieja de CadaMes (Hostmar), y la pantalla de DNS
  de GoDaddy queda con datos viejos: es esperable, no perder tiempo ahí.

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

## Disciplina técnica (todo va a main)

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
- **No**: vocabulario, marca, WhatsApp como interfaz y todo lo de Meta (decisiones de producto
  de CadaMes); módulos desacoplables (arquitectura de CadaMes); login con Google, antibot del
  registro y aceptación de términos (no hacían falta para arrancar; el código de CadaMes sirve
  de modelo, detalle en `README.md`); accesibilidad medida con axe-core (no se pidió).

## Coordinación entre sesiones

- **Toda sesión, Code o Cowork, lee este archivo al arrancar.** Cowork lo lee de
  `coordinacion.documentos` (nombre `'AGENTS.md'`) con su conector de Supabase; Code, del repo.
  Cada deploy de producción lo publica solo ahí (`scripts/publicar-documentos.mjs`, paso del
  build), con el commit del build.
- **Bitácora y para probar**: Supabase, proyecto `laucen` (ref `pcltuzztybiovhuaheek`), esquema
  `coordinacion` (`db/coordinacion.sql`). En la app: `/admin/bitacora` y `/admin/para-probar`.
  Autores: `fer`, `code`, `cowork`; Cowork escribe como `cowork`, Code como `code`.
- **Un tema = un hilo.** La entrada raíz lleva tipo `orden` o `pregunta` y
  `pide_lectura = true`; las respuestas llevan `responde_a` = id de la raíz. Un hilo se cierra
  cuando alguien escribe "Tema cerrado". **Toda sesión lee las entradas nuevas de la bitácora
  antes de empezar.**
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
- **Cowork revisa la bitácora con una tarea programada** (entre 5 y 60 minutos según el tema)
  hasta que el hilo se cierra; si Fer avisa que lo vio, Cowork cancela la tarea y responde
  igual.
- **Archivos que Cowork le manda a Code**: `NNN-laucen-<tema>.md`, numeración correlativa
  compartida con CadaMes; antes de asignar un número se mira el último usado.
- **Softrade**: plataforma de datos de aduana a la que Fer accede con la cuenta de un amigo
  (Ariel). Sin API. Los Excel los exportan Fer o Cowork a mano y se dejan en
  `C:\Laucen\softrade\in\`. Code no navega Softrade.
