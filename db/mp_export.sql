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
