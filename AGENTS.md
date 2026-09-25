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

## Qué hay construido y qué falta

- **Radar** (`/radar`, botón "📡 Radar" en el panel): tendencias de Mercado Libre. Árbol de
  categorías completo (se carga en tandas y se refresca según configuración), tendencias por
  categoría separadas en tres grupos (crecimiento / más buscadas / populares — **deducidos por
  el tramo de la lista, 1–10 / 11–30 / 31–50, supuesto sin confirmar**, ver `lib/radar/base.ts`),
  comparación contra la semana anterior, categorías seguidas (estrella + interruptor),
  "Ver publicaciones" (API gratis, catálogo) y "Mejorar con Apify" (paga, con tope semanal),
  pestaña Configuración con todos los parámetros. Código en `lib/radar/`, `app/radar/`, tablas
  en `db/radar.sql`.
- **Las tablas del Radar se crean solas**: `lib/radar/esquema.ts` corre `db/radar.sql`
  (idempotente) al primer uso tras cada arranque. Una migración nueva del Radar va en ese mismo
  archivo, siempre con `if not exists`.
- **Cron**: `vercel.json` llama `/api/radar/cron` todos los días a las 11:00 UTC (8:00 AR); qué
  corre lo decide la configuración de cada organización. Si se carga `CRON_SECRET` en Vercel, se
  exige; sin ella la ruta es pública pero inofensiva (no repite nada de la semana, tope de gasto).
- **Importaciones** (`/importaciones`, botón "🚢 Importaciones" en el panel): despachos de
  importación argentinos de ARCA (2017 en adelante, todos los países) + enriquecimiento con los
  Excel de Softrade. Orden completa en `docs/orden-arca-importaciones.md`. Tablas en
  `db/arca.sql` (se crean solas igual que las del Radar, vía `lib/arca/esquema.ts`). Pestañas
  Buscar (filtros + importadores/NCM/países/serie/ítems + CSV), Descubrir (NCM que crecen,
  importadores nuevos, nichos, marítimo/aéreo), Rubros, Cargas; fichas de NCM e importador.
  **Los datos NO se cargan desde la nube**: los ZIP y Excel están en la PC de Fer
  (`C:\Laucen\...`) y se cargan con `scripts/arca/` desde una sesión local — paso a paso en
  `scripts/arca/LEEME.md`. El panel usa los resúmenes `agg_*` salvo filtros finos (procedencia,
  aduana, FOB unitario, cantidad, marca), que van a la tabla grande. Los impuestos por concepto
  van en el jsonb `arca_impo_items.impuestos` (no hay tabla aparte); `derechos_usd` queda en null
  hasta que Fer confirme qué concepto es (`arca_parametros.concepto_derechos`, no adivinar).
- **Falta**: la búsqueda en China (Alibaba/1688) y el cruce con Mercado Libre.

## Infraestructura (ya creada y andando — no preguntar, no rehacer)

- **Repo**: `fernandojlodeiro/laucen` en GitHub. Tiene la app de Next.js 15 (App Router,
  TypeScript, Tailwind) completa y funcionando — no un esqueleto, la app real. Compila limpio
  (`npm run build` verificado). Conectado a Vercel: cada push a `main` despliega solo.
- **Base de datos**: Supabase, proyecto `laucen` (ref `pcltuzztybiovhuaheek`, región
  `sa-east-1`), misma cuenta que CadaMes pero base separada. Migraciones ya corridas:
  `db/tenancy.sql` (login multi-cliente) y `db/coordinacion.sql` (bitácora + para probar). No
  se comparte ninguna tabla con CadaMes.
- **Hosting**: Vercel, proyecto `laucen`, mismo equipo (CadaMes). Git conectado, deploy de
  producción ya salió **READY** al menos una vez. Variables de entorno ya cargadas:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`
  (`fernandojlodeiro@gmail.com`), `NEXT_PUBLIC_SITE_URL`, y `DATABASE_URL` (la cargó Fer mismo — nadie más la tiene). Ojo:
  `DATABASE_URL` tiene **sólo la contraseña** de la base, no la dirección; `lib/database-url.ts`
  arma la dirección contra el pooler `aws-0-sa-east-1` (la conexión directa `db.…` es sólo IPv6
  y Vercel no llega). Si algo de la base falla, mirar primero `/admin/diagnostico`.
- **Cron**: Vercel Cron Jobs, nativo — ver "Qué hay construido" arriba.
- **Dominios**: `laucen.com.ar` (Nic.ar) y `laucen.com` (GoDaddy), los dos agregados al proyecto
  de Vercel y con sus nameservers ya cambiados a los de Vercel (`ns1`/`ns2.vercel-dns.com`).
  **Al 24/9 a la tarde ninguno de los dos había terminado de propagar todavía** — Nic.ar es
  particularmente lento (pasa por un trámite de "Trámites a Distancia", no es instantáneo como
  otros registradores; puede tardar horas o hasta el otro día hábil), GoDaddy debería ser más
  rápido (minutos a un par de horas). **Antes de tocar nada de dominios, revisar primero si ya
  propagó** — puede que para cuando se lea esto ya esté listo.
  - En el medio, `laucen.com.ar` mostraba una landing vieja de CadaMes (de cuando ese dominio se
    usaba de ejemplo antes de que CadaMes tuviera el suyo, hosteada en una empresa vieja,
    Hostmar) — es esperable que siga viéndose así hasta que la propagación termine. No es un
    bug de esta app.
  - En GoDaddy, la pestaña "Registros DNS" y un reenvío viejo a `tiendevirtual.com` quedaron
    con errores/datos viejos después del cambio de nameservers — es normal e inofensivo (GoDaddy
    ya no controla el DNS real, esa pantalla quedó de adorno). No perder tiempo arreglándolo.

**Punta a punta confirmado el 24/9**: Fer entró por `laucen.vercel.app` y quedó con usuario,
organización y rol Admin en la base. Supabase tiene prendida la confirmación por mail; el registro
ya lo contempla (muestra "Revisá tu mail").

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

## Permisos mientras Laucen lo usa sólo Fer

Mientras el proyecto esté en esta etapa (desarrollo, y en uso sólo por Fer), **toda función nueva
lleva su permiso (gate) en el rol, pero ese permiso nace ENCENDIDO**: por defecto `true`. La
pantalla de roles y usuarios todavía no está construida, así que un permiso que nace apagado
esconde la función y no hay dónde prenderlo (pasó con el botón de Importaciones). El gate se
pone igual, para que ya esté cuando haya más usuarios, pero siempre en `true`. Esto cambia
cuando Fer lo diga explícitamente; hasta entonces pisa lo que dice `lib/permisos.ts` sobre que
un permiso nuevo "nace apagado".

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
