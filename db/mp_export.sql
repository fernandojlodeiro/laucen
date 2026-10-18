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

-- La cola de la exportación (lo que hay que pedirle y bajarle a Mercado Pago, cuenta por cuenta y
-- mes por mes). La avanza la vuelta /api/mercadopago/exportacion?accion=vuelta (pg_cron 'mp-export'):
-- pendiente → pedido (Mercado Pago lo está armando) → listo / vacio / error. Reintenta con espera y
-- retoma donde quedó; repetir un período no duplica (los archivos van por su suma de comprobación).
create table if not exists mp_export_item (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conexion_id      bigint not null references mp_conexion(id) on delete cascade,
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
create unique index if not exists mp_export_item_unico on mp_export_item (conexion_id, fuente, coalesce(desde, 'epoch'), coalesce(hasta, 'epoch'));
alter table mp_export_item enable row level security;

-- Los movimientos normalizados (lib/mercadopago/normalizar.ts), uno por fila de «Todas las transacciones»,
-- sin duplicados: la clave es el contenido de la fila (+ #n si el mismo reporte la trae n veces), así un
-- archivo que se pisa con otro no repite. Se llenan solos al bajar cada archivo (columna procesado).
alter table mp_export_archivo add column if not exists procesado boolean not null default false;
create table if not exists mp_export_mov (
  id                        bigint generated always as identity primary key,
  organizacion_id           text not null references organizaciones(id) on delete cascade,
  conexion_id               bigint not null references mp_conexion(id) on delete cascade,
  clave                     text not null,
  archivo_id                bigint references mp_export_archivo(id) on delete set null,
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
create index if not exists mp_export_mov_fecha on mp_export_mov (conexion_id, fecha_saldo);
alter table mp_export_mov enable row level security;

-- Los pagos de la API (el último dato de cada uno), para saber tipo, estado, descripción y contraparte.
create table if not exists mp_export_pago (
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  conexion_id       bigint not null references mp_conexion(id) on delete cascade,
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
alter table mp_export_pago enable row level security;
