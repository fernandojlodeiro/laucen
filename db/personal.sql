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
