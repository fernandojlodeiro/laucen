-- Publicidad en Mercado Libre (Product Ads; orden 596, Fer 12/10; lib/publicidad/).
-- Laucen lee todos los días, por cuenta, las campañas y los anuncios con sus
-- métricas (gasto, impresiones, clics, ventas atribuidas) y guarda la historia
-- de cada día. Con eso, y con el tope que se acepta pagar de publicidad por
-- venta (config_org clave 'publicidad' + excepciones por producto o familia),
-- da un veredicto por producto: SEGUIR, BAJAR, CORTAR o SUBIR.
-- La API de publicidad sólo se LEE: los cambios los hace Fer en el panel de ML.

-- El anunciante de cada cuenta (GET /advertising/advertisers?product_id=PADS).
-- Sin anunciante = la cuenta nunca usó publicidad.
create table if not exists pub_anunciante (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null,
  cuenta_id        bigint not null,
  anunciante_id    bigint,
  nombre           text,
  leido_ts         timestamptz,
  error            text,
  primary key (organizacion_id, canal_id)
);
alter table pub_anunciante enable row level security;
select erp_politica_org('pub_anunciante');

-- Cada campaña, como la devolvió ML la última vez.
create table if not exists pub_campana (
  organizacion_id         text not null references organizaciones(id) on delete cascade,
  campana_id              bigint not null,
  canal_id                bigint not null,
  anunciante_id           bigint not null,
  nombre                  text,
  estado                  text,                -- active, paused, …
  estrategia              text,                -- PROFITABILITY, …
  roas_objetivo           numeric(10, 2),
  acos_objetivo           numeric(10, 2),
  presupuesto             numeric(16, 2),      -- el presupuesto que cargó el vendedor
  presupuesto_diario      numeric(16, 2),      -- el que usa ML hoy (puede diferir si ML lo ajusta)
  presupuesto_automatico  boolean,             -- automatic_budget de ML
  creada_ts               timestamptz,
  actualizada_ts          timestamptz,
  leido_ts                timestamptz not null default now(),
  crudo                   jsonb,
  primary key (organizacion_id, campana_id)
);
alter table pub_campana enable row level security;
select erp_politica_org('pub_campana');

-- Métricas por campaña y día (las relee unos días hacia atrás: ML atribuye ventas tarde).
create table if not exists pub_campana_dia (
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  campana_id           bigint not null,
  fecha                date not null,
  clics                int not null default 0,
  impresiones          int not null default 0,
  costo                numeric(16, 2) not null default 0,
  monto_directo        numeric(16, 2) not null default 0,
  monto_indirecto      numeric(16, 2) not null default 0,
  unidades_directas    int not null default 0,
  unidades_indirectas  int not null default 0,
  leido_ts             timestamptz not null default now(),
  primary key (organizacion_id, campana_id, fecha)
);
alter table pub_campana_dia enable row level security;
select erp_politica_org('pub_campana_dia');

-- Cada anuncio (una publicación dentro de una campaña).
create table if not exists pub_anuncio (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  item_id          text not null,
  canal_id         bigint not null,
  campana_id       bigint,
  estado           text,
  titulo           text,
  precio           numeric(16, 2),
  permalink        text,
  foto             text,
  leido_ts         timestamptz not null default now(),
  primary key (organizacion_id, item_id)
);
alter table pub_anuncio enable row level security;
select erp_politica_org('pub_anuncio');

-- Métricas por anuncio y día.
create table if not exists pub_anuncio_dia (
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  item_id              text not null,
  fecha                date not null,
  campana_id           bigint,
  canal_id             bigint not null,
  clics                int not null default 0,
  impresiones          int not null default 0,
  costo                numeric(16, 2) not null default 0,
  monto_directo        numeric(16, 2) not null default 0,
  monto_indirecto      numeric(16, 2) not null default 0,
  unidades_directas    int not null default 0,
  unidades_indirectas  int not null default 0,
  leido_ts             timestamptz not null default now(),
  primary key (organizacion_id, item_id, fecha)
);
create index if not exists pub_anuncio_dia_fecha on pub_anuncio_dia (organizacion_id, fecha);
alter table pub_anuncio_dia enable row level security;
select erp_politica_org('pub_anuncio_dia');

-- Excepciones al tope general: por producto o por familia (incluye sus subfamilias).
create table if not exists pub_tope (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint references producto(id) on delete cascade,
  familia_id       bigint references familia(id) on delete cascade,
  pct_max          numeric(6, 2) not null check (pct_max >= 0),
  nota             text,
  creado_ts        timestamptz not null default now(),
  check ((producto_id is null) <> (familia_id is null))
);
create unique index if not exists pub_tope_producto on pub_tope (organizacion_id, producto_id) where producto_id is not null;
create unique index if not exists pub_tope_familia on pub_tope (organizacion_id, familia_id) where familia_id is not null;
alter table pub_tope enable row level security;
select erp_politica_org('pub_tope');

-- El último veredicto de cada producto (para avisar sólo cuando pasa a CORTAR, o repetir según la config).
create table if not exists pub_veredicto (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  clave            text not null,              -- el SKU, o el MLA si la publicación no está vinculada
  veredicto        text not null,              -- subir, seguir, bajar, cortar, esperar
  motivo           text,
  desde_ts         timestamptz not null default now(),
  avisado_ts       timestamptz,
  actualizado_ts   timestamptz not null default now(),
  primary key (organizacion_id, clave)
);
alter table pub_veredicto enable row level security;
select erp_politica_org('pub_veredicto');

-- Cada lectura (cuándo, qué trajo, si falló).
create table if not exists pub_lectura (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  inicio_ts        timestamptz not null default now(),
  fin_ts           timestamptz,
  informe          jsonb,
  error            text
);
create index if not exists pub_lectura_org on pub_lectura (organizacion_id, inicio_ts desc);
alter table pub_lectura enable row level security;
select erp_politica_org('pub_lectura');
