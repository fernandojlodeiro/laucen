-- Exportación histórica y mensual de Mercado Pago (orden de Fer del 17/10, bitácora #681).
-- Sólo lee de Mercado Pago y pide reportes; nunca mueve plata ni cambia permisos.

-- Inventario: qué devuelve cada fuente de Mercado Pago para cada cuenta conectada
-- (identidad, reportes disponibles, primera fecha que se puede leer, qué contesta cada consulta).
create table if not exists mp_export_sonda (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conexion_id      bigint not null references mp_conexion(id) on delete cascade,
  ts               timestamptz not null default now(),
  datos            jsonb not null
);
create index if not exists mp_export_sonda_conexion on mp_export_sonda (conexion_id, ts desc);
alter table mp_export_sonda enable row level security;

-- Los archivos originales que se bajan de Mercado Pago, sin tocar: por cuenta, fuente y período,
-- con la fecha en que se bajaron y su suma de comprobación (sha256). Bajar dos veces el mismo
-- archivo sin cambios no duplica (misma suma); si Mercado Pago lo rearmó distinto, queda la versión nueva al lado.
create table if not exists mp_export_archivo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conexion_id      bigint not null references mp_conexion(id) on delete cascade,
  fuente           text not null,
  nombre           text not null,
  desde            timestamptz,
  hasta            timestamptz,
  sha256           text not null,
  bytes            int not null,
  contenido        bytea not null,
  bajado_ts        timestamptz not null default now(),
  unique (conexion_id, fuente, nombre, sha256)
);
alter table mp_export_archivo enable row level security;

-- Cada paso que se le pide a Mercado Pago para la exportación (configurar, pedir un reporte, bajarlo), con lo que contestó.
create table if not exists mp_export_paso (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conexion_id      bigint not null references mp_conexion(id) on delete cascade,
  ts               timestamptz not null default now(),
  paso             text not null,
  status           int,
  datos            jsonb
);
create index if not exists mp_export_paso_conexion on mp_export_paso (conexion_id, ts desc);
alter table mp_export_paso enable row level security;
