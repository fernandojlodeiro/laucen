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
