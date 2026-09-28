-- Piloto: rastrillaje de Mercado Libre → China → juez.
--
-- Una corrida = un piloto con sus parámetros (categorías, rango de precio,
-- flete). Cada producto de Mercado Libre elegido es una fila de
-- piloto_productos que avanza por etapas: ml → caja → china → juez → listo.
-- Idempotente: lib/piloto/esquema.ts corre este archivo al arrancar la app.

create table if not exists piloto_corridas (
  id               serial primary key,
  organizacion_id  text not null,
  creada_el        timestamptz not null default now(),
  parametros       jsonb not null,                 -- ver lib/piloto/tipos.ts
  estado           text not null default 'ml',     -- ml | productos | listo
  avance           jsonb not null default '{}',    -- por categoría: listados, cruces, errores
  costos           jsonb not null default '{}',    -- apify_usd, claude_tokens_in/out, por etapa
  trabajando_desde timestamptz                     -- candado: una sola tanda a la vez
);
alter table piloto_corridas enable row level security;

create table if not exists piloto_productos (
  id              serial primary key,
  corrida_id      int not null references piloto_corridas(id) on delete cascade,
  categoria_id    text not null,
  lado            text not null,                   -- buscado (tendencias, gratis) | vendido (listado, Apify)
  palabra         text,                            -- la tendencia que lo trajo (lado buscado)
  campeon         boolean not null default false,  -- aparece en los dos lados
  item_id         text,
  producto_id     text,
  titulo          text not null,
  url             text,
  foto            text,
  precio          double precision,
  vendidos        int,
  vendidos_texto  text,
  opiniones       int,
  caja            jsonb,                           -- {largo, ancho, alto, kg, fuente}
  flete_pct       double precision,
  pasa_flete      boolean,
  china           jsonb,                           -- {en, zh, candidatos[], corridas[]}
  juicio          jsonb,                           -- {veredictos[], elegido, motivo}
  revision        text,                            -- acerto | no_acerto
  comentario      text,
  etapa           text not null default 'caja',    -- caja | china | juez | ficha | listo
  error           text
);
create index if not exists piloto_productos_corrida_idx on piloto_productos (corrida_id);
alter table piloto_productos enable row level security;

-- 27/9: modo barco/avión con zona gris (reemplaza a pasa_flete, que queda sin uso).
alter table piloto_productos add column if not exists franja text;        -- seguro | gris | fuera
alter table piloto_productos add column if not exists flete_usd double precision;

-- 27/9: texto de Mercado Libre (atributos de medidas + descripción) para la
-- caja y el juez; y "automático" para que avance solo, sin la página abierta.
alter table piloto_productos add column if not exists datos_ml text;
alter table piloto_corridas add column if not exists automatico boolean not null default false;

-- Llave del llamado automático (/api/piloto/tanda), que hace la base cada
-- 5 minutos con pg_cron + pg_net. Una sola fila.
create table if not exists piloto_llave (id int primary key default 1 check (id = 1), clave text not null);
alter table piloto_llave enable row level security;

-- 28/9: costo puesto en Argentina. NCM validada con sus tasas y la comisión y
-- el envío Full de Mercado Libre (lib/piloto/costo.ts); la cuenta se hace al mostrar.
alter table piloto_productos add column if not exists costo jsonb;

-- 28/9: registro de NCM por producto de China. Se clasifica una sola vez en la
-- vida (modelo grande, con la ficha y las aperturas del nomenclador); si Fer
-- la corrige con el lápiz, queda la de Fer (fuente = 'fer').
create table if not exists ncm_clasificaciones (
  clave        text primary key,          -- 'alibaba:1601164688606' (o la dirección)
  titulo       text,
  ncm          text not null,             -- '3926.90.90'
  sim          text,                      -- apertura: '3926.90.90.900C'
  arancel      numeric,
  alternativa  text,
  material     text,
  motivo       text,
  fuente       text not null default 'claude',  -- claude | fer
  modelo       text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
alter table ncm_clasificaciones enable row level security;
