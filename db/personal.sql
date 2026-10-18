-- Espacio personal (pedido de Fer, 18/10): un lugar aparte de la empresa para conectar cuentas
-- PERSONALES (por ahora, Mercado Pago) y sacar su información. No se mezcla con los datos de
-- ninguna organización:
--   · todo vive en su propio esquema, "personal", sin organizacion_id: cada espacio es de una
--     persona (su dueño), no de una empresa;
--   · el rol de la base de los usuarios comunes (authenticated, el que usa el asistente para sus
--     consultas) y el anónimo no tienen ningún permiso sobre el esquema, y toda tabla lleva RLS
--     sin políticas: desde afuera del servidor no se ve nada;
--   · entra sólo el dueño (el superadministrador que creó una organización) y quien él autorice
--     (personal.acceso); el servidor lo controla en cada pantalla y acción (lib/personal/espacio.ts).

create schema if not exists personal;
revoke all on schema personal from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema personal from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema personal from authenticated'; end if;
end $$;

-- Un espacio por dueño.
create table if not exists personal.espacio (
  id                bigint generated always as identity primary key,
  dueno_usuario_id  text not null unique references usuarios(id) on delete cascade,
  creado_ts         timestamptz not null default now()
);
alter table personal.espacio enable row level security;

-- Quién más puede entrar (lo autoriza el dueño; sólo usuarios de Laucen).
create table if not exists personal.acceso (
  espacio_id      bigint not null references personal.espacio(id) on delete cascade,
  usuario_id      text not null references usuarios(id) on delete cascade,
  autorizado_por  text not null references usuarios(id),
  creado_ts       timestamptz not null default now(),
  primary key (espacio_id, usuario_id)
);
alter table personal.acceso enable row level security;

-- Cuentas de Mercado Pago personales conectadas (OAuth con la aplicación de Laucen). La llave nunca se muestra.
create table if not exists personal.mp_conexion (
  id               bigint generated always as identity primary key,
  espacio_id       bigint not null references personal.espacio(id) on delete cascade,
  mp_user_id       bigint not null,
  nombre           text,
  email            text,
  access_token     text not null,
  refresh_token    text,
  expira_el        timestamptz not null,
  estado           text not null default 'activa' check (estado in ('activa', 'desconectada')),
  ultimo_error     text,
  conectada_por    text references usuarios(id),
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now(),
  unique (espacio_id, mp_user_id)
);
alter table personal.mp_conexion enable row level security;

-- Lo mismo que la exportación de la empresa (db/mp_export.sql), pero de las cuentas personales.
create table if not exists personal.mp_sonda (
  id           bigint generated always as identity primary key,
  conexion_id  bigint not null references personal.mp_conexion(id) on delete cascade,
  ts           timestamptz not null default now(),
  datos        jsonb not null
);
alter table personal.mp_sonda enable row level security;

create table if not exists personal.mp_paso (
  id           bigint generated always as identity primary key,
  conexion_id  bigint not null references personal.mp_conexion(id) on delete cascade,
  ts           timestamptz not null default now(),
  paso         text not null,
  status       int,
  datos        jsonb
);
create index if not exists mp_paso_conexion on personal.mp_paso (conexion_id, ts desc);
alter table personal.mp_paso enable row level security;

create table if not exists personal.mp_archivo (
  id           bigint generated always as identity primary key,
  conexion_id  bigint not null references personal.mp_conexion(id) on delete cascade,
  fuente       text not null,
  nombre       text not null,
  desde        timestamptz,
  hasta        timestamptz,
  sha256       text not null,
  bytes        int not null,
  contenido    bytea not null,
  bajado_ts    timestamptz not null default now(),
  unique (conexion_id, fuente, nombre, sha256)
);
alter table personal.mp_archivo enable row level security;

-- Lo que se está haciendo de fondo en el espacio (inventario, muestra de un mes): la pantalla se
-- actualiza sola mientras haya uno corriendo. Aparte de las tareas de la empresa, para que nadie
-- de la organización vea que existe.
create table if not exists personal.trabajo (
  id            bigint generated always as identity primary key,
  espacio_id    bigint not null references personal.espacio(id) on delete cascade,
  usuario_id    text not null references usuarios(id) on delete cascade,
  titulo        text not null,
  estado        text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'error')),
  mensaje       text,
  creado_ts     timestamptz not null default now(),
  terminado_ts  timestamptz
);
alter table personal.trabajo enable row level security;

-- La cola de la exportación de las cuentas personales (igual que mp_export_item de la empresa).
create table if not exists personal.mp_item (
  id               bigint generated always as identity primary key,
  conexion_id      bigint not null references personal.mp_conexion(id) on delete cascade,
  fuente           text not null,
  desde            timestamptz,
  hasta            timestamptz,
  etiqueta         text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'pedido', 'listo', 'vacio', 'error')),
  intentos         int not null default 0,
  proximo_ts       timestamptz not null default now(),
  pedido_ts        timestamptz,
  antes            text[],
  archivos         text[],
  mensaje          text,
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now()
);
create unique index if not exists mp_item_unico on personal.mp_item (conexion_id, fuente, coalesce(desde, 'epoch'), coalesce(hasta, 'epoch'));
alter table personal.mp_item enable row level security;

-- Movimientos normalizados y pagos de la API de las cuentas personales (igual que mp_export_mov / mp_export_pago).
alter table personal.mp_archivo add column if not exists procesado boolean not null default false;
create table if not exists personal.mp_mov (
  id                        bigint generated always as identity primary key,
  conexion_id               bigint not null references personal.mp_conexion(id) on delete cascade,
  clave                     text not null,
  archivo_id                bigint references personal.mp_archivo(id) on delete set null,
  archivo                   text not null,
  fila                      int not null,
  extraido                  timestamptz not null,
  movimiento_id             text,
  referencia_externa        text,
  tipo_original             text not null,
  fecha_operacion           timestamptz,
  fecha_operacion_original  text,
  fecha_saldo               timestamptz,
  fecha_liberacion          timestamptz,
  moneda                    text,
  importe_bruto             numeric,
  comision                  numeric,
  impuestos                 numeric,
  cupon                     numeric,
  importe_neto              numeric,
  medio_pago                text,
  tipo_medio                text,
  descripcion               text,
  unique (conexion_id, clave)
);
create index if not exists mp_mov_fecha on personal.mp_mov (conexion_id, fecha_saldo);
alter table personal.mp_mov enable row level security;

create table if not exists personal.mp_pago (
  conexion_id       bigint not null references personal.mp_conexion(id) on delete cascade,
  pago_id           text not null,
  tipo              text,
  estado            text,
  descripcion       text,
  cobrador_id       text,
  pagador_id        text,
  importe           numeric,
  pagado            numeric,
  tipo_medio        text,
  medio             text,
  creado            timestamptz,
  actualizado       timestamptz,
  primary key (conexion_id, pago_id)
);
alter table personal.mp_pago enable row level security;

-- Clasificación de los gastos personales (igual que mp_gasto_marca / mp_gasto_regla de la empresa).
create table if not exists personal.gasto_marca (
  conexion_id      bigint not null references personal.mp_conexion(id) on delete cascade,
  clave            text not null,
  categoria        text,
  ambito_gasto     text,
  recurrencia      text,
  nota             text,
  usuario_id       text,
  actualizado_ts   timestamptz not null default now(),
  primary key (conexion_id, clave)
);
alter table personal.gasto_marca enable row level security;
create table if not exists personal.gasto_regla (
  id               bigint generated always as identity primary key,
  espacio_id       bigint not null references personal.espacio(id) on delete cascade,
  campo            text not null check (campo in ('contraparte', 'texto')),
  valor            text not null,
  categoria        text,
  ambito_gasto     text,
  recurrencia      text,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (espacio_id, campo, valor)
);
alter table personal.gasto_regla enable row level security;

-- La vuelta de la exportación de Mercado Pago (empresa y personal): cada 2 minutos, sólo si hay algo
-- en la cola por pedir o por bajar, o archivos bajados sin pasar a movimientos. La clave se lee de erp_llave al correr. Sin pg_cron, no pasa nada.
do $$
declare
  j record;
  cmd text := $cmd$
  select net.http_get(
    url := 'https://laucen.com/api/mercadopago/exportacion?accion=vuelta&clave=' || (select clave from public.erp_llave where id = 1),
    timeout_milliseconds := 300000
  ) where exists (select 1 from public.mp_export_item where estado in ('pendiente', 'pedido') and proximo_ts <= now())
       or exists (select 1 from personal.mp_item where estado in ('pendiente', 'pedido') and proximo_ts <= now())
       or exists (select 1 from public.mp_export_archivo where not procesado)
       or exists (select 1 from personal.mp_archivo where not procesado)
$cmd$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'mp-export';
  if not found then perform cron.schedule('mp-export', '*/2 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar mp-export (%)', sqlerrm;
end $$;
