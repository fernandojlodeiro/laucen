# Para la sesión que arranca este proyecto

Este documento existe para que no le preguntes a Fer cosas que ya se sabían de otro proyecto
(CadaMes). Léelo entero antes de preguntar nada. Sólo preguntale lo que es específico de
**este** proyecto: qué sitios de China buscar, con qué parámetros, qué hacer con lo que
encuentra, etc. Todo lo demás ya está decidido acá abajo.

## Qué es esto

Búsqueda de productos con determinadas características en sitios de venta de China (Alibaba,
1688, AliExpress u otros), para importar. Hoy lo usa sólo Fer, pero el login está armado
multi-cliente desde el arranque —igual que CadaMes: usuarios, organizaciones, roles como datos
por organización, permisos como checkboxes— por si más adelante hay más de una organización
usándolo. Nace de un cron que dispara búsquedas periódicas y guarda resultados; un panel simple
para mirarlos es la parte final, no la primera.

## Infraestructura (ya creada, no preguntar — ya está andando)

- **Repo**: `fernandojlodeiro/laucen` en GitHub, ya con el código de arranque adentro (ver
  `README.md`: qué hay y qué falta conectar).
- **Base de datos**: Supabase, proyecto `laucen` (ref `pcltuzztybiovhuaheek`, región
  `sa-east-1`), misma cuenta que CadaMes pero base separada. Ya tiene corridas las migraciones
  de `db/tenancy.sql` (login multi-cliente) y `db/coordinacion.sql` (bitácora + para probar). No
  se comparte ninguna tabla con CadaMes.
- **Hosting**: Vercel, proyecto `laucen`, mismo equipo (CadaMes) que administra Fer. Todavía no
  tiene el repo de Git conectado — eso es lo primero para hacer andar los deploys automáticos.
- **Cron**: Vercel Cron Jobs, nativo — no hace falta un servicio externo.
- **Dominio**: Fer tiene `laucen.com` (GoDaddy) y `laucen.com.ar` (Nic.ar) comprados, todavía sin
  conectar a Vercel. El DNS probablemente se administra en Cloudflare, no en el registrador —
  confirmar con Fer antes de pedirle que toque algo ahí.

Lo que falta para tener el proyecto corriendo (en `README.md` del repo, con el detalle): crear
la app de Next.js alrededor del código ya portado, cargar las variables de entorno en Vercel,
conectar el repo de Git al proyecto de Vercel, y armar `db/index.ts` (el cliente de Drizzle).

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

## Convenciones de interfaz (si este proyecto llega a tener panel)

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

## Disciplina técnica (todo va a main)

- No hay rama de integración que esperar: lo terminado y verificado se mergea a main.
- **Toda migración que crea una tabla agrega, en el mismo archivo, `ALTER TABLE ... ENABLE ROW
  LEVEL SECURITY`.** Sin excepción, tenga política o no.
- Orden de migraciones y deploy: agregar una columna nueva se aplica a la base **antes o en el
  mismo paso** que el push a main que la usa. Borrar una columna es al revés: se saca del
  schema del código → se mergea → se espera el deploy → recién ahí el `DROP COLUMN`.
- Repo clonado en profundidad 1: un merge entre ramas puede fallar con "unrefusing to merge
  unrelated histories" — hace falta `git fetch --unshallow`.

## Tests en paralelo

Si los tests corren en paralelo contra la misma base: lo que es compartido se pide por turno
(un candado), no se borra al terminar. Nadie vacía una tabla entera sin filtrar.

## Datos de prueba

Es un proyecto personal en fase de prueba. Lo que haya cargado se puede romper, cambiar o
borrar sin pedir permiso ni advertir qué se pierde — no hay nada real todavía. Cuando eso
cambie, Fer lo va a decir explícitamente.

## Qué SÍ se lleva de CadaMes (además de lo de arriba)

- **El login multi-cliente entero**: usuarios · organizaciones · roles · membresías, permisos
  como checkboxes, candado anti-encierro (nunca dejar una organización sin nadie que pueda
  administrarla). Ya está portado y corrido contra la base — ver `db/tenancy.ts`,
  `lib/tenancy.ts`, `lib/permisos.ts`, `lib/roles.ts`, `app/auth-actions.ts` en el repo.
- **"Nada de la cocina en las pantallas"** — al tener login real con gente entrando (aunque hoy
  sea sólo Fer), las pantallas de `/login` y `/registro` sí son de cara a un usuario: un error
  de Supabase se traduce a criollo (`motivoLegible()` en `app/auth-actions.ts`), nunca se
  muestra crudo. Las de `/admin/bitacora` y `/admin/para-probar` son internas (sólo Fer) y ahí
  es menos crítico, pero seguir la misma disciplina no cuesta nada.

## Qué NO se lleva de CadaMes (y por qué)

- Vocabulario del cliente, marca, WhatsApp como única interfaz, todo lo de Meta: son decisiones
  de producto específicas de CadaMes como negocio a vender.
- Módulos desacoplables (asistente/agenda separados del core): es arquitectura de CadaMes, no
  aplica acá.
- Login con Google, antibot del registro, aceptación de términos: CadaMes los tiene; acá no
  hacían falta para arrancar. El código de CadaMes sirve de modelo si en algún momento hacen
  falta (detalle en `README.md`).
- Accesibilidad medida con axe-core: no se pidió para este proyecto. Si en algún momento
  interesa, se agrega entonces.

## Coordinación

Ya está armada y corrida contra la base de este proyecto (no la de CadaMes): bitácora +
"para probar", en el esquema `coordinacion`. Ver `db/coordinacion.sql`, `lib/coordinacion.ts`,
`lib/para-probar.ts` y las pantallas en `app/admin/bitacora` y `app/admin/para-probar`.

- **La bitácora**: se anota un tema nuevo o un hueco que quedó abierto — no un parte de trabajo
  con la lista de archivos tocados ni las pruebas que pasaron (eso ya está en el commit). Una
  entrada al abrir un tema, una al cerrarlo, nada en el medio.
- **"Para probar"**: una fila por cada cosa distinta que haya que probar, con qué abrir, qué
  hacer y qué tiene que pasar, en pocas frases. Se inserta en el mismo paso que el push. El
  arreglo de algo que falló no es una fila nueva: es una vuelta colgada de la misma fila.

La semilla de `coordinacion.autores` trae `fer`, `code` y `cowork` (los mismos slugs que
CadaMes). Sacá el que no vaya a tocar este proyecto, o dejalos: no molestan si no se usan.
