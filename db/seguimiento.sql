-- Seguimiento de publicaciones de la competencia (pedido de Fer, 10/10;
-- lib/seguimiento/). En cada producto, las publicaciones de otros vendedores
-- que se siguen: lo último que se leyó de cada una y su historial. Más
-- adelante, las reglas de precio las usan para seguir al más barato.
-- Cómo se lee: las de catálogo por la API de ML (gratis); las comunes con
-- Apify (la API no deja leer publicaciones ajenas). Configuración general en
-- config_org, clave 'seguimiento' ({frecuencia_dias, tope_usd}).

create table if not exists seguimiento_pub (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  producto_id       bigint not null references producto(id) on delete cascade,
  item_id           text not null,                 -- la publicación de ML (MLA…)
  catalogo_id       text,                          -- si compite en un producto de catálogo (MLA… de 8 dígitos)
  titulo            text,
  foto              text,
  permalink         text,
  vendedor          text,
  vendedor_id       bigint,
  tienda_oficial    boolean,
  precio            numeric(16, 2),
  precio_original   numeric(16, 2),                -- el tachado, si tiene descuento
  moneda            text,
  estado            text,                          -- activa, pausada, cerrada, sin_dato
  tipo_publicacion  text,                          -- gold_special (Clásica), gold_pro (Premium)…, o lo que diga la página
  cuotas            text,
  envio_gratis      boolean,
  origen            text not null default 'manual' check (origen in ('busqueda', 'manual', 'importado')),
  leido_ts          timestamptz,                   -- última lectura que salió bien
  intento_ts        timestamptz,                   -- último intento (salga o no)
  error             text,
  creado_ts         timestamptz not null default now(),
  unique (organizacion_id, producto_id, item_id)
);
-- En cuántos días llega (opciones de envío de ML a un código postal de Capital): si tarda mucho, no compite.
alter table seguimiento_pub add column if not exists entrega_dias int;
create index if not exists seguimiento_pub_producto on seguimiento_pub (producto_id);
create index if not exists seguimiento_pub_lectura on seguimiento_pub (organizacion_id, leido_ts);
alter table seguimiento_pub enable row level security;
select erp_politica_org('seguimiento_pub');

-- Cada lectura de una publicación seguida (el historial de precio y estado).
create table if not exists seguimiento_lectura (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  seguimiento_id    bigint not null references seguimiento_pub(id) on delete cascade,
  ts                timestamptz not null default now(),
  fuente            text not null check (fuente in ('api', 'apify', 'busqueda')),
  precio            numeric(16, 2),
  precio_original   numeric(16, 2),
  estado            text,
  tipo_publicacion  text,
  datos             jsonb not null default '{}'
);
create index if not exists seguimiento_lectura_pub on seguimiento_lectura (seguimiento_id, ts desc);
alter table seguimiento_lectura enable row level security;
select erp_politica_org('seguimiento_lectura');

-- Cada corrida paga de Apify del seguimiento (búsquedas y lecturas), para el tope mensual.
create table if not exists seguimiento_corrida (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  tipo              text not null check (tipo in ('busqueda', 'lectura')),
  producto_id       bigint references producto(id) on delete set null,
  ts                timestamptz not null default now(),
  run_id            text,
  costo_usd         numeric(10, 4),
  publicaciones     int not null default 0,
  error             text
);
create index if not exists seguimiento_corrida_mes on seguimiento_corrida (organizacion_id, ts);
alter table seguimiento_corrida enable row level security;
select erp_politica_org('seguimiento_corrida');

-- La última búsqueda de cada producto (para no pagar dos veces si se vuelve a abrir la pestaña).
create table if not exists seguimiento_busqueda (
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  producto_id       bigint not null references producto(id) on delete cascade,
  texto             text not null,
  ts                timestamptz not null default now(),
  resultados        jsonb not null default '[]',
  primary key (organizacion_id, producto_id)
);
alter table seguimiento_busqueda enable row level security;
select erp_politica_org('seguimiento_busqueda');
