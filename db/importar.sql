-- Cimiento (orden 136) · 6/6 · Importación desde Excel (Virtual Seller u otro).
--
-- Flujo: se sube el .xlsx (va a Supabase Storage, bucket `importaciones`), se
-- leen sus filas a `importacion_fila`, se mapean columnas → campos (el mapeo
-- se puede guardar con nombre), se previsualiza y se ejecuta. Cada fila queda
-- con su resultado: importada, o rechazada con el motivo.

create table if not exists importacion_mapeo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  destino          text not null check (destino in ('productos', 'clientes', 'ventas', 'stock')),
  -- { "campo del sistema": "columna del archivo", ... }
  mapeo            jsonb not null default '{}',
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, destino, nombre)
);
alter table importacion_mapeo enable row level security;
select erp_politica_org('importacion_mapeo');

create table if not exists importacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  destino          text not null check (destino in ('productos', 'clientes', 'ventas', 'stock')),
  archivo          text not null,
  ruta_storage     text,
  hoja             text,
  columnas         jsonb not null default '[]',
  mapeo            jsonb not null default '{}',
  estado           text not null default 'leido' check (estado in ('leido', 'ejecutando', 'terminado', 'con_errores')),
  filas_total      int not null default 0,
  filas_ok         int not null default 0,
  filas_error      int not null default 0,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  terminado_ts     timestamptz
);
create index if not exists importacion_org on importacion (organizacion_id, creado_ts desc);
alter table importacion enable row level security;
select erp_politica_org('importacion');

create table if not exists importacion_fila (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  importacion_id   bigint not null references importacion(id) on delete cascade,
  n                int not null,
  datos            jsonb not null,
  resultado        text check (resultado in ('ok', 'error')),
  motivo           text,
  primary key (importacion_id, n)
);
alter table importacion_fila enable row level security;
select erp_politica_org('importacion_fila');

-- Búsquedas del importador de clientes (lib/importar/ejecutar.ts): con
-- 100.000 filas, sin estos índices cada fila recorría la tabla entera.
-- Las expresiones tienen que ser IGUALES a las de las consultas.
create index if not exists cliente_cuit_digitos on cliente (organizacion_id, regexp_replace(coalesce(cuit, ''), '\D', '', 'g'));
create index if not exists cliente_documento_digitos on cliente (organizacion_id, regexp_replace(documento_numero, '\D', '', 'g'));
create index if not exists cliente_email_lower on cliente (organizacion_id, lower(email));
create index if not exists cliente_apodo_lower on cliente (organizacion_id, lower(apodo_ml));
create index if not exists proveedor_cuit_digitos on proveedor (organizacion_id, regexp_replace(coalesce(cuit, ''), '\D', '', 'g'));

-- Que una importación siga sola, sin la pestaña abierta: las tareas
-- periódicas (/api/erp/tareas) procesan las que tienen esto prendido.
alter table importacion add column if not exists segundo_plano boolean not null default false;
