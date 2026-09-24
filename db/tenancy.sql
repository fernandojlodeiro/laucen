-- Sistema de login multi-cliente, portado de CadaMes: usuarios · organizaciones
-- · roles · membresías. Es el mismo diseño (multi-tenancy con roles como datos
-- por organización, permisos como checkboxes), recortado de los campos de
-- negocio que sólo tiene CadaMes (facturación, planes de CadaMes, WhatsApp,
-- vocabulario del cliente, etc.) — eso se agrega cuando haga falta.
--
-- RLS prendido en las cuatro tablas, sin políticas: Drizzle entra por la
-- conexión directa (no sujeta a RLS), así que alcanza con el interruptor.

create extension if not exists pgcrypto;

create type estado_membresia as enum ('INVITADO', 'ACTIVO', 'SUSPENDIDO');

-- Identidad global del login. El vínculo con organizaciones vive en `membresias`.
create table if not exists usuarios (
  id                    text primary key default gen_random_uuid()::text,
  email                 text not null unique,
  -- El id de Supabase Auth. No cambia aunque cambie el email (a diferencia de
  -- `email`), así que es el vínculo estable para encontrar la sesión.
  auth_id               text,
  nombre                text not null,
  telefono              text,
  creado_el             timestamp not null default now()
);

create unique index if not exists usuarios_auth_id_unico
  on usuarios (auth_id) where auth_id is not null;

-- Cada organización se arma sus propios roles: el nombre lo pone el admin y
-- los permisos son checkboxes (AGENTS.md: "quién puede hacer qué no lo
-- decidimos nosotros"). Los presets de fábrica se siembran una vez y desde
-- ahí no tienen nada de especial: se renombran, editan y borran.
--
-- Excepción: el rol marcado `protegido` (el Admin inicial) no se puede borrar
-- ni dejar sin el permiso de gestionar el equipo — evita que una organización
-- se quede sin nadie que pueda administrarla.
create table if not exists organizaciones (
  id          text primary key default gen_random_uuid()::text,
  nombre      text not null,
  creada_el   timestamp not null default now()
);

create table if not exists roles (
  id                text primary key default gen_random_uuid()::text,
  organizacion_id   text not null references organizaciones(id),
  nombre            text not null,
  permisos          jsonb not null default '{}',
  protegido         boolean not null default false,
  creado_el         timestamp not null default now(),
  unique (organizacion_id, nombre)
);

create index if not exists rol_org_idx on roles (organizacion_id);

-- Membresía N:M usuario ↔ organización. Si tiene rol, valen los permisos DEL
-- ROL (cambiar el rol cambia a todos los que lo tienen); `permisos` es para
-- quien tiene permisos a medida sin rol asignado.
create table if not exists membresias (
  id                text primary key default gen_random_uuid()::text,
  usuario_id        text not null references usuarios(id),
  organizacion_id   text not null references organizaciones(id),
  rol_id            text references roles(id),
  permisos          jsonb not null default '{}',
  estado            estado_membresia not null default 'ACTIVO',
  invitado_por      text,
  creada_el         timestamp not null default now(),
  unique (usuario_id, organizacion_id)
);

create index if not exists membresia_org_idx on membresias (organizacion_id);

alter table usuarios enable row level security;
alter table organizaciones enable row level security;
alter table roles enable row level security;
alter table membresias enable row level security;
