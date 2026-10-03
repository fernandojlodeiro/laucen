-- Precios en Mercado Libre (Fer, 3/10): el esquema de precios de cada canal de
-- ML. La Clásica es el ÚNICO precio que pone Fer (lista del canal, precio_de);
-- de ella salen el tachado, el precio de cada plan de cuotas y el descuento
-- por volumen. Todo es por canal y, adentro del canal, general → categoría
-- (familia, heredando por el árbol) → producto: gana lo más específico.
-- El motor está en lib/precios-ml/; nada sale a ML sin pasar por la cola
-- (lib/mercadolibre/cola.ts) y, salvo el interruptor del canal, sin el clic
-- de Fer en un lote preparado.

-- Tachado: el % que se le suma a la Clásica para publicar "inflado" (la
-- campaña lo baja a la Clásica). Una fila por canal y nivel.
create table if not exists ml_regla_precio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  nivel            text not null check (nivel in ('general', 'familia', 'producto')),
  familia_id       bigint references familia(id) on delete cascade,
  producto_id      bigint references producto(id) on delete cascade,
  tachado_pct      numeric(6, 2) check (tachado_pct between 0 and 300),
  actualizado_ts   timestamptz not null default now(),
  check ((nivel = 'general' and familia_id is null and producto_id is null)
      or (nivel = 'familia' and familia_id is not null and producto_id is null)
      or (nivel = 'producto' and producto_id is not null and familia_id is null))
);
create unique index if not exists ml_regla_precio_un on ml_regla_precio (canal_id, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0));
alter table ml_regla_precio enable row level security;
select erp_politica_org('ml_regla_precio');

-- Planes de cuotas: cuáles están activos, desde qué Clásica (precio mínimo),
-- el margen extra y cuántas cuotas ve el comprador ("lo que ve el comprador
-- manda"). Lo vacío hereda del nivel de arriba.
create table if not exists ml_plan_config (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  plan             text not null check (plan in ('premium', '3x_campaign', '9x_campaign', '12x_campaign')),
  nivel            text not null check (nivel in ('general', 'familia', 'producto')),
  familia_id       bigint references familia(id) on delete cascade,
  producto_id      bigint references producto(id) on delete cascade,
  activo           boolean,
  precio_minimo    numeric(16, 2) check (precio_minimo >= 0),
  margen_pct       numeric(6, 2) check (margen_pct between -50 and 300),
  cuotas_visibles  int check (cuotas_visibles between 1 and 24),
  actualizado_ts   timestamptz not null default now(),
  check ((nivel = 'general' and familia_id is null and producto_id is null)
      or (nivel = 'familia' and familia_id is not null and producto_id is null)
      or (nivel = 'producto' and producto_id is not null and familia_id is null))
);
create unique index if not exists ml_plan_config_un on ml_plan_config (canal_id, plan, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0));
alter table ml_plan_config enable row level security;
select erp_politica_org('ml_plan_config');

-- Descuento por volumen: por rango de Clásica, hasta 5 escalones
-- [{cantidad, pct}]. Una excepción de categoría o producto tiene sus propios
-- rangos (o "sin descuento"); el nivel más específico con filas gana entero.
create table if not exists ml_volumen_escala (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  nivel            text not null check (nivel in ('general', 'familia', 'producto')),
  familia_id       bigint references familia(id) on delete cascade,
  producto_id      bigint references producto(id) on delete cascade,
  desde_precio     numeric(16, 2) not null default 0 check (desde_precio >= 0),
  hasta_precio     numeric(16, 2) check (hasta_precio is null or hasta_precio > desde_precio),
  escalones        jsonb not null default '[]' check (jsonb_typeof(escalones) = 'array'),
  sin_descuento    boolean not null default false,
  actualizado_ts   timestamptz not null default now(),
  check ((nivel = 'general' and familia_id is null and producto_id is null)
      or (nivel = 'familia' and familia_id is not null and producto_id is null)
      or (nivel = 'producto' and producto_id is not null and familia_id is null))
);
create index if not exists ml_volumen_escala_canal on ml_volumen_escala (canal_id, nivel);
alter table ml_volumen_escala enable row level security;
select erp_politica_org('ml_volumen_escala');

-- Lo que contestó ML a "precio para ganar" (GET /items/{id}/price_to_win,
-- sólo lectura) de cada publicación de catálogo.
create table if not exists ml_price_to_win (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  precio           numeric(16, 2),          -- price_to_win
  precio_actual    numeric(16, 2),          -- current_price
  estado           text,                    -- winning, competing, sharing_first_place, listed…
  ganador_precio   numeric(16, 2),
  error            text,
  leido_ts         timestamptz not null default now(),
  primary key (canal_id, item_id)
);
alter table ml_price_to_win enable row level security;
select erp_politica_org('ml_price_to_win');

-- Las campañas de cada publicación (GET /seller-promotions/items/{id}, sólo
-- lectura): en las que está y a las que puede entrar, con el precio mínimo y
-- máximo con descuento que acepta ML.
create table if not exists ml_promo_item (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  promocion_id     text not null,
  tipo             text not null,           -- DEAL, SELLER_CAMPAIGN, MARKETPLACE_CAMPAIGN…
  estado           text,                    -- candidate, started, pending…
  nombre           text,
  precio           numeric(16, 2),          -- el precio con descuento si ya está adentro
  min_precio       numeric(16, 2),
  max_precio       numeric(16, 2),
  hasta            timestamptz,
  leido_ts         timestamptz not null default now(),
  primary key (canal_id, item_id, promocion_id)
);
alter table ml_promo_item enable row level security;
select erp_politica_org('ml_promo_item');

-- Cuándo se leyeron por última vez las campañas de cada publicación (aunque
-- no tenga ninguna).
create table if not exists ml_promo_leida (
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  leido_ts         timestamptz not null default now(),
  error            text,
  primary key (canal_id, item_id)
);
alter table ml_promo_leida enable row level security;
select erp_politica_org('ml_promo_leida');

-- El plan destacado de cada variación en cada canal (el que va al precio
-- para ganar, en el recuadro "En cuotas"), elegido al preparar los cambios.
-- La lectura periódica marca si dejó de ganar (alerta).
create table if not exists ml_plan_destacado (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  plan             text not null,
  item_id          text not null,
  precio           numeric(16, 2) not null,
  elegido_ts       timestamptz not null default now(),
  verificado_ts    timestamptz,
  gana             boolean,
  alerta           text,
  primary key (canal_id, variacion_id)
);
alter table ml_plan_destacado enable row level security;
select erp_politica_org('ml_plan_destacado');
