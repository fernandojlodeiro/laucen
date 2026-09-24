# Laucen — arranque portado de CadaMes

Dos cosas portadas de CadaMes, con su lógica real (no descripciones):

1. **Login multi-cliente** (usuarios · organizaciones · roles · membresías),
   igual en diseño al de CadaMes: Supabase Auth + roles como datos por
   organización + permisos como checkboxes.
2. **Bitácora + Para probar**, las herramientas internas de coordinación.

La base de Supabase del proyecto (`laucen`, región `sa-east-1`, misma cuenta
que CadaMes) ya tiene las dos partes de schema aplicadas. El proyecto de
Vercel (`laucen`, mismo equipo) también está creado. Lo que falta es el
código Next.js alrededor — esto es ese código.

## Qué incluye

**Login / tenancy** (portado de CadaMes: `src/db/schema.ts`, `src/lib/tenancy.ts`,
`src/lib/permisos.ts`, `src/lib/roles.ts`, `src/lib/supabase.ts`, `src/app/auth-actions.ts`,
`middleware.ts`):
- `db/tenancy.sql` — la migración (ya corrida contra la base de Laucen).
- `db/tenancy.ts` — el esquema de Drizzle.
- `lib/supabase.ts` — cliente de Supabase Auth.
- `lib/tenancy.ts` — resolución de sesión (`sesionActual`, `puede`, etc.).
- `lib/permisos.ts` / `lib/roles.ts` — permisos como checkboxes, roles como
  datos por organización, candado anti-encierro (nunca dejar una
  organización sin nadie que pueda administrarla).
- `app/auth-actions.ts` — login, registro (cuenta + organización + rol Admin
  en un solo paso), logout, olvidé mi contraseña.
- `app/auth/callback/route.ts` — canje del link de reset de contraseña.
- `middleware.ts` + `lib/rutas-publicas.ts` — protección de rutas.
- `lib/admin.ts` — el portón de las herramientas internas (bitácora, para
  probar): sólo vos, no un cliente de una organización.
- `app/login/page.tsx`, `app/registro/page.tsx` — pantallas mínimas.

**Coordinación** (portado de CadaMes: `src/db/coordinacion.ts`, `src/lib/coordinacion.ts`,
`src/lib/para-probar.ts`, y las dos pantallas):
- `db/coordinacion.sql` — la migración (ya corrida).
- `db/coordinacion.ts`, `lib/coordinacion.ts`, `lib/para-probar.ts`.
- `app/coordinacion-actions.ts`.
- `app/admin/bitacora/page.tsx`, `app/admin/para-probar/page.tsx`.

**Compartido**: `app/botones.ts` (clases de botones — "si se puede clickear,
parece un botón"), `app/Vacio.tsx` (estado vacío con salida).

## Cómo arrancarlo

1. `npx create-next-app@latest` (App Router, TypeScript, Tailwind) en este
   mismo repo, y copiar estos archivos a las rutas que ya tienen (son las que
   asumen los imports `@/db`, `@/lib`, `@/app`).
2. Instalar: `drizzle-orm`, `drizzle-kit`, `pg`, `@supabase/ssr`, `@supabase/supabase-js`.
3. Variables de entorno (Vercel → Settings → Environment Variables, proyecto `laucen`):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://pcltuzztybiovhuaheek.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave publishable del proyecto `laucen` en Supabase
   - `DATABASE_URL` = connection string de Drizzle (Supabase → Settings → Database)
   - `ADMIN_EMAILS` = tu mail, para entrar a `/admin/bitacora` y `/admin/para-probar`
4. `db/index.ts` (no incluido, es una línea): el cliente de Drizzle sobre `DATABASE_URL`,
   igual que `src/db/index.ts` de CadaMes.
5. Agregar los dos botones de entrada a bitácora/para-probar donde vaya el
   panel de administración de Laucen (ver el README anterior de este paquete
   si lo tenés, o simplemente dos `<Link>` a `/admin/bitacora` y `/admin/para-probar`).
6. Conectar el repo de GitHub al proyecto de Vercel `laucen` (Vercel →
   Settings → Git) para que cada push a `main` despliegue solo.

## Lo que se dejó afuera a propósito (agregar si hace falta)

- **Login con Google**: CadaMes lo tiene (`accionEntrarConGoogle`); acá no,
  para no sumar la config de OAuth sin necesidad. El código de CadaMes sirve
  de modelo si se necesita.
- **Antibot del registro** (honeypot, límite por IP, Turnstile): CadaMes lo
  tiene contra registros falsos masivos; para empezar no hace falta.
- **Aceptación de términos**: CadaMes la sella en el registro; se agrega
  cuando haya términos que aceptar.
- Las pantallas `/olvide` y `/reset` (las acciones ya existen en
  `auth-actions.ts`, faltan sus formularios — son iguales en forma a
  `login/page.tsx`).

## Ajustar

- `lib/permisos.ts` → `PermisoKey` y `PERMISOS`: dejé cuatro de arranque
  (`gestionar_busquedas`, `ver_resultados`, `ver_config`, `gestionar_equipo`).
  Cámbialos por los reales en cuanto haya pantallas.
- `db/tenancy.ts` → `organizaciones`: sólo tiene `nombre`. Ahí van los campos
  propios del negocio a medida que aparezcan (igual que en CadaMes, que tiene
  decenas de columnas ahí — no se portaron, son de facturación/plan/asistente
  de CadaMes).
- La semilla de autores de `db/coordinacion.sql` trae `fer`, `code` y
  `cowork` — sacá lo que no corresponda.
