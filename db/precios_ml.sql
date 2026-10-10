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

-- Lo que Mercado Libre le muestra hoy al comprador en cada publicación (/items/{id}/sale_price): lo que paga, el
-- tachado y la campaña que rige. Se lee al llegar el aviso de cambio de precio u oferta de ML, después de mandar un
-- lote y en la lectura periódica; las pantallas lo muestran tal cual, con la hora en que se leyó.
create table if not exists ml_precio_comprador (
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  monto            numeric(14,2),
  regular          numeric(14,2),
  promocion_id     text,
  promocion_tipo   text,
  leido_ts         timestamptz not null default now(),
  error            text,
  primary key (canal_id, item_id)
);
alter table ml_precio_comprador enable row level security;
select erp_politica_org('ml_precio_comprador');

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

-- ── Promociones: campañas e historia (Fer, 5/10) ──────────────────────────
-- "Quiero controlar todas las promociones y que todo quede registrado en Laucen."
-- Antes sólo había una foto de las campañas de cada publicación, que se borraba y se
-- volvía a cargar. Ahora: la campaña misma (ml_promo_campana), más datos de cada
-- publicación en ella (fechas, % que pone ML y % que pone el vendedor, precio de lista)
-- y, sobre todo, la HISTORIA de cada cambio (ml_promo_historia): una campaña que
-- empieza o termina, una publicación que entra, sale o cambia de precio.
alter table ml_promo_item add column if not exists desde timestamptz;
alter table ml_promo_item add column if not exists limite timestamptz;
alter table ml_promo_item add column if not exists precio_original numeric(16, 2);
alter table ml_promo_item add column if not exists pct_meli numeric(6, 2);
alter table ml_promo_item add column if not exists pct_vendedor numeric(6, 2);
alter table ml_promo_item add column if not exists oferta_id text;
alter table ml_promo_item add column if not exists visto_ts timestamptz not null default now();
alter table ml_promo_item add column if not exists datos jsonb not null default '{}';
-- Cuándo apareció la fila por primera vez (la lectura la actualiza, pero no toca esto): la
-- sincronización automática recalcula las publicaciones a las que ML les ofreció una campaña
-- nueva (Fer, 7/10: las notebooks nuevas quedaban al tachado hasta la pasada de la noche).
-- Las filas de antes quedan sin fecha.
alter table ml_promo_item add column if not exists creado_ts timestamptz;
alter table ml_promo_item alter column creado_ts set default now();

create table if not exists ml_promo_campana (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  promocion_id     text not null,
  tipo             text not null,           -- DEAL, LIGHTNING, SMART, SELLER_CAMPAIGN, MARKETPLACE_CAMPAIGN…
  subtipo          text,
  nombre           text,
  estado           text,                    -- pending, started, finished, programmed…
  desde            timestamptz,
  hasta            timestamptz,
  limite           timestamptz,             -- hasta cuándo se puede entrar (deadline_date)
  pct_meli         numeric(6, 2),
  pct_vendedor     numeric(6, 2),
  datos            jsonb not null default '{}',   -- lo que contestó ML, entero
  visto_ts         timestamptz not null default now(),   -- la primera vez que Laucen la vio
  leido_ts         timestamptz not null default now(),
  primary key (canal_id, promocion_id)
);
alter table ml_promo_campana enable row level security;
select erp_politica_org('ml_promo_campana');

create table if not exists ml_promo_historia (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  promocion_id     text not null,
  -- null = cambio de la campaña; con valor = de esa publicación en la campaña.
  item_id          text,
  tipo             text,
  nombre           text,
  que              text not null check (que in ('campana_alta', 'campana_estado', 'campana_fechas', 'item_alta', 'item_estado', 'item_precio', 'item_baja')),
  antes            text,
  despues          text,
  precio_antes     numeric(16, 2),
  precio_despues   numeric(16, 2),
  fecha            timestamptz not null default now(),
  datos            jsonb not null default '{}'
);
create index if not exists ml_promo_historia_item on ml_promo_historia (canal_id, item_id, fecha desc);
create index if not exists ml_promo_historia_fecha on ml_promo_historia (organizacion_id, fecha desc);
create index if not exists ml_promo_historia_promo on ml_promo_historia (canal_id, promocion_id, fecha desc);
alter table ml_promo_historia enable row level security;
select erp_politica_org('ml_promo_historia');

-- ── Esquema de notebooks (Fer, 7/10) ──────────────────────────────────────
-- "Quién gana": en cada canal, la Clásica y cada plan pueden ir un % más caros
-- que el esquema (la cuenta que no gana ese plan, 3 %). La Clásica de la lista
-- es la del que gana; el tachado sale de ella, uno solo por modelo. Más
-- decimales para que el tachado (Clásica ÷ 0,55) y el ajuste den el peso justo.
alter table ml_regla_precio add column if not exists ajuste_pct numeric(9, 5) check (ajuste_pct between -50 and 100);
alter table ml_plan_config add column if not exists ajuste_pct numeric(9, 5) check (ajuste_pct between -50 and 100);
alter table ml_regla_precio alter column tachado_pct type numeric(10, 5);
alter table ml_plan_config alter column margen_pct type numeric(9, 5);

-- ── Planes de cuotas por grupo (Fer, 8/10) ────────────────────────────────
-- Configuración › Planes de cuotas: qué planes de cuotas se crean, cuántas
-- cuotas ve el comprador en cada uno (se carga a mano: ML no lo informa) y el
-- % extra sobre lo que deja la Clásica, por grupo de categorías. Vale para
-- todas las cuentas de ML. Un grupo con familias (y sus subfamilias) gana; el
-- grupo sin familias es "el resto". Los planes van desde la Clásica en que
-- ML empieza a dar envío gratis (ml_costos_envio_gratis_vigente; 33.000).
-- Reemplaza activo / mínimo / margen / cuotas de ml_plan_config (ahí queda
-- sólo "¿gana?", por cuenta).
create table if not exists ml_plan_grupo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  familias         bigint[] not null default '{}',
  orden            int not null default 0,
  actualizado_ts   timestamptz not null default now()
);
create unique index if not exists ml_plan_grupo_un on ml_plan_grupo (organizacion_id, lower(nombre));
alter table ml_plan_grupo enable row level security;
select erp_politica_org('ml_plan_grupo');

create table if not exists ml_plan_grupo_plan (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  grupo_id         bigint not null references ml_plan_grupo(id) on delete cascade,
  plan             text not null check (plan in ('premium', '3x_campaign', '9x_campaign', '12x_campaign')),
  usar             boolean not null default false,
  cuotas_visibles  int check (cuotas_visibles between 1 and 36),
  margen_pct       numeric(9, 5) check (margen_pct between -50 and 300),
  actualizado_ts   timestamptz not null default now(),
  unique (grupo_id, plan)
);
alter table ml_plan_grupo_plan enable row level security;
select erp_politica_org('ml_plan_grupo_plan');

-- El grupo de planes de un producto: el primero cuyas familias contienen la
-- del producto (o una de arriba); si ninguno, el grupo sin familias.
create or replace function ml_grupo_de_producto(p_org text, p_producto bigint) returns bigint
language sql stable as $$
  with recursive cadena(id, padre_id, n) as (
    select f.id, f.padre_id, 0 from producto p join familia f on f.id = p.familia_id where p.id = p_producto
    union all
    select f.id, f.padre_id, c.n + 1 from cadena c join familia f on f.id = c.padre_id where c.n < 30)
  select coalesce(
    (select g.id from ml_plan_grupo g where g.organizacion_id = p_org and g.familias && (select array_agg(id) from cadena) order by g.orden, g.id limit 1),
    (select g.id from ml_plan_grupo g where g.organizacion_id = p_org and g.familias = '{}' order by g.orden, g.id limit 1))
$$;

-- Quién gana, por grupo (Fer, 8/10): por cada publicación (clasica y cada plan) una cuenta fija (el id del
-- canal) o "rota" (los productos se reparten parejo entre las cuentas que no ganan fijo nada del grupo); las
-- que no ganan van ajuste_no_gana % más caras. Lo de Excepciones (por cuenta) manda sobre esto.
alter table ml_plan_grupo add column if not exists gana jsonb not null default '{}';
alter table ml_plan_grupo add column if not exists ajuste_no_gana numeric(6, 2) not null default 3 check (ajuste_no_gana between 0 and 50);

-- Desde qué Clásica va cada plan (Fer, 10/10): vacío = desde el envío gratis (ml_costos_envio_gratis_vigente);
-- 0 = siempre. Aparte, ningún plan se crea si su precio cae en la franja de 10 % abajo del envío gratis.
alter table ml_plan_grupo_plan add column if not exists desde_precio numeric(14, 2) check (desde_precio >= 0);

-- Creación automática de lo que falta en cada cuenta (Fer, 10/10; lib/mercadolibre/auto-altas.ts): lo que ML no
-- acepta o no se puede copiar queda acá, con su motivo, y no se vuelve a intentar hasta proximo_ts (30 min, 2 h,
-- 12 h y después cada día). Se descarga en Excel desde Precios en ML › Alertas.
create table if not exists ml_alta_colgada (
  organizacion_id  text not null,
  canal_id         bigint not null,
  sku              text not null,
  plan             text not null,
  motivo           text not null,
  intentos         int not null default 1,
  primer_ts        timestamptz not null default now(),
  ultimo_ts        timestamptz not null default now(),
  proximo_ts       timestamptz not null default now() + interval '30 minutes',
  primary key (organizacion_id, canal_id, sku, plan)
);
alter table ml_alta_colgada enable row level security;
select erp_politica_org('ml_alta_colgada');
