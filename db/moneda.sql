-- Cimiento (orden 136) · 1/6 · Moneda, tipo de cambio y piezas comunes.
--
-- Idempotente: lo corre lib/erp/esquema.ts al primer uso tras cada arranque,
-- antes que catalogo.sql, stock.sql, ventas.sql, eventos.sql e importar.sql
-- (en ese orden, porque cada uno usa tablas del anterior).
--
-- Reglas de la orden 136 que valen para todas las tablas del cimiento:
-- - toda tabla lleva `organizacion_id` y RLS prendido en el mismo archivo;
-- - las políticas filtran por organización (para quien entre con la llave
--   pública de Supabase; la app entra por la conexión directa y no las usa);
-- - todo importe de precio o costo va en tres columnas: `importe_ars`,
--   `importe_usd`, `moneda_origen`.

-- ── Piezas para las políticas ─────────────────────────────

-- Fuera de Supabase (la base de prueba local) no existen `auth.uid()` ni el
-- rol `authenticated`: se crean de mentira para que el archivo corra igual.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  end if;
end $$;

/** Las organizaciones de quien está logueado (por su id de Supabase Auth). */
create or replace function public.mis_organizaciones() returns setof text
language sql stable security definer set search_path = public as $$
  select m.organizacion_id
    from membresias m join usuarios u on u.id = m.usuario_id
   where u.auth_id = auth.uid()::text and m.estado <> 'SUSPENDIDO'
$$;

/** Pone (o repone) la política "sólo las filas de mis organizaciones" en una
 *  tabla. `admite_global`: las filas con organizacion_id NULL (datos de todos,
 *  como el tipo de cambio) se pueden leer, pero no escribir. */
create or replace function public.erp_politica_org(tabla text, admite_global boolean default false)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', tabla || '_org', tabla);
  execute format('drop policy if exists %I on public.%I', tabla || '_org_global', tabla);
  execute format(
    'create policy %I on public.%I for all to authenticated
       using (organizacion_id in (select public.mis_organizaciones()))
       with check (organizacion_id in (select public.mis_organizaciones()))',
    tabla || '_org', tabla);
  if admite_global then
    execute format(
      'create policy %I on public.%I for select to authenticated using (organizacion_id is null)',
      tabla || '_org_global', tabla);
  end if;
end $$;

-- ── Configuración por organización (clave → valor) ────────
-- organizacion_id NULL = valor global (vale para todas las que no tengan el
-- suyo). Ej.: 'umbral_pausa' (por defecto 0), 'tipo_cambio_fuente'.
create table if not exists config_org (
  id               bigint generated always as identity primary key,
  organizacion_id  text references organizaciones(id) on delete cascade,
  clave            text not null,
  valor            jsonb not null,
  actualizado_ts   timestamptz not null default now()
);
create unique index if not exists config_org_clave on config_org (coalesce(organizacion_id, ''), clave);
alter table config_org enable row level security;
select erp_politica_org('config_org', true);

/** Valor de configuración: el de la organización, si no el global, si no el default. */
create or replace function public.config_de(p_org text, p_clave text, p_default jsonb default null)
returns jsonb language sql stable as $$
  select coalesce(
    (select valor from config_org where organizacion_id = p_org and clave = p_clave),
    (select valor from config_org where organizacion_id is null and clave = p_clave),
    p_default)
$$;

-- ── Tipo de cambio ────────────────────────────────────────
-- Una fila por día y tipo. organizacion_id NULL = el que levanta el cron para
-- todos; una organización puede cargar el suyo y pisa al global.
create table if not exists tipo_cambio (
  id               bigint generated always as identity primary key,
  organizacion_id  text references organizaciones(id) on delete cascade,
  fecha            date not null,
  tipo             text not null default 'oficial' check (tipo ~ '^[a-z_]+$'),
  compra           numeric(14, 4),
  venta            numeric(14, 4) not null check (venta > 0),
  origen           text not null,
  creado_ts        timestamptz not null default now()
);
create unique index if not exists tipo_cambio_dia on tipo_cambio (coalesce(organizacion_id, ''), fecha, tipo);
alter table tipo_cambio enable row level security;
select erp_politica_org('tipo_cambio', true);

/** El tipo de cambio (venta) que rige un día: el último cargado hasta esa
 *  fecha; el de la organización gana al global del mismo día. NULL si no hay
 *  ninguno. */
create or replace function public.tc_del_dia(p_org text, p_fecha date default current_date, p_tipo text default 'oficial')
returns numeric language sql stable as $$
  select venta from tipo_cambio
   where (organizacion_id = p_org or organizacion_id is null)
     and tipo = p_tipo and fecha <= p_fecha
   order by fecha desc, (organizacion_id is null) asc
   limit 1
$$;

/** Convierte entre pesos y dólares con el tipo de cambio del día. Si no hay
 *  tipo de cambio cargado, tira un error en criollo (no inventa un número). */
create or replace function public.convertir(p_org text, p_importe numeric, p_de text, p_a text, p_fecha date default current_date)
returns numeric language plpgsql stable as $$
declare tc numeric;
begin
  if p_importe is null then return null; end if;
  if p_de = p_a then return p_importe; end if;
  if p_de not in ('ARS', 'USD') or p_a not in ('ARS', 'USD') then
    raise exception 'moneda desconocida: % → %', p_de, p_a using errcode = 'P0001';
  end if;
  tc := tc_del_dia(p_org, p_fecha);
  if tc is null then
    raise exception 'no hay tipo de cambio cargado para el %', to_char(p_fecha, 'DD/MM/YYYY') using errcode = 'P0001', hint = 'sin_tipo_de_cambio';
  end if;
  return round(case when p_a = 'USD' then p_importe / tc else p_importe * tc end, 2);
end $$;

-- ── Preferencias de pantalla por usuario ─────────────────
-- Hoy sólo "ver en pesos / ver en dólares", que respetan todas las pantallas.
create table if not exists usuario_preferencia (
  usuario_id       text not null references usuarios(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  moneda_vista     text not null default 'ARS' check (moneda_vista in ('ARS', 'USD')),
  actualizado_ts   timestamptz not null default now(),
  primary key (usuario_id, organizacion_id)
);
alter table usuario_preferencia enable row level security;
select erp_politica_org('usuario_preferencia');

-- Los accesos directos de la barra de abajo del celular, a elección de cada
-- usuario (4/10): lista de direcciones del menú, hasta cuatro. Vacío = los de siempre.
alter table usuario_preferencia add column if not exists accesos_celular jsonb;

-- "Lo último que viste" (4/10): las últimas fichas que abrió cada usuario
-- (lista de {href, titulo, tipo}, la última primero). Es de cada usuario, no del navegador.
alter table usuario_preferencia add column if not exists historial jsonb;

-- El buscador de arriba incluye los inactivos (Fer, 6/10): la caja queda como la dejó cada usuario.
alter table usuario_preferencia add column if not exists buscar_inactivos boolean not null default false;

-- Avisos de la barra de estado (Fer, 10/10), de cada usuario:
-- - aviso_sonido: suena cuando entra algo nuevo (pedido, pregunta, mensaje, WhatsApp en espera).
-- - aviso_ventana: se abre sola una ventana con lo que la IA no contestó (le falta un dato o piden una persona).
-- - visto: hasta dónde vio cada contador ({clave: marca}); lo que pasa esa marca se pinta distinto.
-- - avisado: hasta dónde ya le mostró la ventana ({clave: marca}), para no repetirla.
alter table usuario_preferencia add column if not exists aviso_sonido boolean not null default false;
alter table usuario_preferencia add column if not exists aviso_ventana boolean not null default true;
alter table usuario_preferencia add column if not exists visto jsonb not null default '{}';
alter table usuario_preferencia add column if not exists avisado jsonb;
-- Cada cuántos minutos, como mucho, suena o llega un aviso de Windows (Fer, 10/10; de 1 a 60).
alter table usuario_preferencia add column if not exists aviso_cada_min int not null default 1;
-- De entrada, todo prendido (Fer, 10/10; a los que ya existían se les prendió una vez a mano).
alter table usuario_preferencia alter column aviso_sonido set default true;
-- Avisos de Windows con Laucen cerrado (push): hasta dónde ya se mandó ({clave: marca}), cuándo
-- se mandó el último (para el límite de arriba) y cuándo tuvo Laucen a la vista por última vez
-- (con Laucen a la vista avisa la pantalla, no Windows).
alter table usuario_preferencia add column if not exists push_avisado jsonb;
alter table usuario_preferencia add column if not exists push_ultimo_ts timestamptz;
alter table usuario_preferencia add column if not exists vistazo_ts timestamptz;

-- Cada computadora o celular donde el usuario activó los avisos de Windows (push del navegador).
create table if not exists push_suscripcion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  usuario_id       text not null references usuarios(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  equipo           text not null default '',
  creado_ts        timestamptz not null default now(),
  ultimo_ok_ts     timestamptz
);
create index if not exists push_suscripcion_usuario on push_suscripcion (usuario_id, organizacion_id);
alter table push_suscripcion enable row level security;

-- Las llaves con que Laucen firma los avisos push (VAPID). Las genera la app la primera vez. Una sola fila.
create table if not exists push_llave (
  id       int primary key check (id = 1),
  publica  text not null,
  privada  text not null
);
alter table push_llave enable row level security;

-- El job de pg_cron 'avisos-push' (cada minuto) llama a /api/avisos/push sólo si alguien activó
-- los avisos de Windows y hay algo reciente que la IA no contestó (la última hora: el límite de
-- avisos llega a 60 minutos). La clave se lee de erp_llave al correr. Sin pg_cron, no pasa nada.
do $$
declare
  j record;
  cmd text := $cmd$
  select net.http_get(
    url := 'https://laucen.vercel.app/api/avisos/push?clave=' || (select clave from public.erp_llave where id = 1),
    timeout_milliseconds := 60000
  ) where exists (select 1 from public.push_suscripcion)
      and (exists (select 1 from public.meli_pregunta where estado = 'UNANSWERED' and ia_estado in ('falta_dato', 'persona')
                     and sugerencia_ts > now() - interval '61 minutes')
        or exists (select 1 from public.meli_conversacion where sin_leer > 0 and ia_estado in ('falta_dato', 'persona')
                     and sugerencia_ts > now() - interval '61 minutes')
        or exists (select 1 from public.chat_caso where resuelto_ts is null and abierto_ts > now() - interval '61 minutes'))
$cmd$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'avisos-push';
  if not found then perform cron.schedule('avisos-push', '* * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar avisos-push (%)', sqlerrm;
end $$;

-- Tareas que corren de fondo (Fer, 6/10): un botón que demora no deja la
-- pantalla esperando: lanza la tarea, el botón dice "Trabajando…" y, al
-- terminar, aparece un cartel (verde si salió bien) y la pantalla se
-- actualiza sola, aunque la persona esté en otra pantalla.
create table if not exists tarea_fondo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  usuario_id       text not null,
  tipo             text not null,
  titulo           text not null,
  estado           text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'error')),
  mensaje          text,
  creado_ts        timestamptz not null default now(),
  terminado_ts     timestamptz,
  avisado          boolean not null default false
);
create index if not exists tarea_fondo_usuario on tarea_fondo (usuario_id, avisado, creado_ts desc);
alter table tarea_fondo enable row level security;
