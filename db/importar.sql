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

-- Importación de productos desde Virtual Seller + Mercado Libre (Fer, 2/10).
-- Lo que trae ML de cada producto y no tiene columna propia en el catálogo.
alter table producto add column if not exists modelo text;
alter table producto add column if not exists linea text;
alter table producto add column if not exists garantia text;
alter table producto add column if not exists condicion text;
alter table producto add column if not exists categoria_ml text;
alter table producto add column if not exists atributos_ml jsonb not null default '[]';
-- "Kit" según Virtual Seller (packs y combinaciones): sólo una marca para
-- filtrarlos y armarlos a mano; no es un kit del sistema (sin componentes).
alter table producto add column if not exists kit_vs boolean not null default false;
-- Costo de cada producto: FOB, en la moneda que se elija (por ahora USD).
-- El costo puesto en depósito sale de compras/despachos (costo_ultimo/promedio).
alter table variacion add column if not exists costo_fob numeric(16, 4);
alter table variacion add column if not exists costo_moneda text not null default 'USD' check (costo_moneda in ('ARS', 'USD'));
-- Precio tachado de ML (campañas): el precio de la publicación es el de venta.
alter table publicacion add column if not exists precio_tachado numeric(16, 2);
-- Familias = categorías de Mercado Libre: el id de la categoría, para no duplicarlas.
alter table familia add column if not exists ml_categoria text;
create unique index if not exists familia_ml_categoria on familia (organizacion_id, ml_categoria) where ml_categoria is not null;

-- Una corrida de la importación desde Virtual Seller: los tres archivos ya
-- leídos (jsonb por SKU), el análisis (resumen y diferencias) y el avance.
create table if not exists importacion_vs (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  estado           text not null default 'cargando' check (estado in ('cargando', 'analizado', 'importando', 'terminado', 'error')),
  archivos         jsonb not null default '{}',     -- {stock: nombre, maestro: nombre, precios: nombre}
  resumen          jsonb not null default '{}',
  error            text,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  terminado_ts     timestamptz
);
alter table importacion_vs enable row level security;
select erp_politica_org('importacion_vs');

-- Un renglón por SKU: lo que se juntó de los tres archivos y de ML, y qué se hizo.
create table if not exists importacion_vs_sku (
  importacion_id   bigint not null references importacion_vs(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  sku              text not null,
  stock            jsonb not null default '[]',     -- [{ubicacion, cantidad}]
  maestro          jsonb,                           -- la fila del maestro
  precio           numeric(16, 2),                  -- Lista_000
  ml_items         jsonb not null default '[]',     -- números de publicación (MLA…) de ese SKU
  destino          text,                            -- activo, inactivo, descartado
  iva_vs           numeric(5, 2),
  iva_ml           numeric(5, 2),
  resultado        text,                            -- ok / error
  motivo           text,
  primary key (importacion_id, sku)
);
-- Kits (Fer, 2/10): el "-U" que lo forma y cuántos (sacado del título).
alter table importacion_vs_sku add column if not exists kit_componente text;
alter table importacion_vs_sku add column if not exists kit_cantidad int;
create index if not exists importacion_vs_sku_pend on importacion_vs_sku (importacion_id) where resultado is null;
alter table importacion_vs_sku enable row level security;
select erp_politica_org('importacion_vs_sku');
