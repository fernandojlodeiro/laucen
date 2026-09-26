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
  etapa           text not null default 'caja',    -- caja | china | juez | listo
  error           text
);
create index if not exists piloto_productos_corrida_idx on piloto_productos (corrida_id);
alter table piloto_productos enable row level security;

-- 27/9: modo barco/avión con zona gris (reemplaza a pasa_flete, que queda sin uso).
alter table piloto_productos add column if not exists franja text;        -- seguro | gris | fuera
alter table piloto_productos add column if not exists flete_usd double precision;
