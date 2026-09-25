-- Radar: tendencias de Mercado Libre.
--
-- Datos de Mercado Libre (árbol, tendencias, publicaciones) = GLOBALES: se
-- guardan una vez y los comparten todas las organizaciones (es interno, el
-- usuario no lo ve como "compartido"). Lo de cada organización (qué sigue,
-- su configuración, quién pidió qué) lleva organizacion_id.
--
-- Idempotente: lib/radar/esquema.ts corre este mismo archivo al arrancar la
-- app (create ... if not exists), así la tabla existe antes de que el código
-- la use aunque nadie la haya aplicado a mano.

-- El árbol de categorías de Mercado Libre Argentina.
create table if not exists meli_categorias (
  id               text primary key,             -- MLA11034
  nombre           text not null,
  padre_id         text,                          -- null = primer nivel
  nivel            int not null,                  -- 1 = rubro grande
  ruta             text not null,                 -- "Hogar › Jardín › Macetas"
  publicaciones    int,                           -- total_items_in_this_category
  es_hoja          boolean not null default false,
  leida_el         timestamptz not null default now(),
  hijos_leidos_el  timestamptz                    -- null = falta leer sus hijas
);
create index if not exists meli_categorias_padre_idx on meli_categorias (padre_id);
create index if not exists meli_categorias_pendientes_idx on meli_categorias (hijos_leidos_el) where hijos_leidos_el is null;
alter table meli_categorias enable row level security;

-- Cada lectura de tendencias: una por categoría por semana.
-- categoria_id 'MLA' = todo Mercado Libre Argentina (sin filtro).
create table if not exists meli_tendencias_lecturas (
  id           bigint generated always as identity primary key,
  categoria_id text not null,
  semana       date not null,                     -- el lunes de esa semana
  leida_el     timestamptz not null default now(),
  respuesta    jsonb not null,                    -- lo que devolvió ML, tal cual
  unique (categoria_id, semana)
);
alter table meli_tendencias_lecturas enable row level security;

-- Cada palabra de una lectura.
create table if not exists meli_tendencias (
  lectura_id bigint not null references meli_tendencias_lecturas(id) on delete cascade,
  posicion   int not null,
  palabra    text not null,
  url        text,
  grupo      text not null check (grupo in ('crecimiento', 'buscadas', 'populares')),
  primary key (lectura_id, posicion)
);
alter table meli_tendencias enable row level security;

-- Cada vez que se "hace clic por dentro" en una palabra.
create table if not exists meli_busquedas (
  id               bigint generated always as identity primary key,
  palabra          text not null,
  categoria_id     text,
  fuente           text not null,                 -- 'api' | 'apify:karamelo' | 'apify:devcake'
  origen           text not null default 'manual' check (origen in ('manual', 'cron')),
  organizacion_id  text references organizaciones(id) on delete set null,
  usuario_id       text,
  estado           text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'fallo')),
  error            text,
  total_resultados text,
  costo_usd        double precision,
  run_id           text,
  pedida_el        timestamptz not null default now(),
  terminada_el     timestamptz
);
create index if not exists meli_busquedas_palabra_idx on meli_busquedas (lower(palabra), fuente, pedida_el desc);
create index if not exists meli_busquedas_org_idx on meli_busquedas (organizacion_id, pedida_el desc);
alter table meli_busquedas enable row level security;

-- Lo que trajo cada búsqueda.
create table if not exists meli_publicaciones (
  busqueda_id     bigint not null references meli_busquedas(id) on delete cascade,
  posicion        int not null,
  item_id         text,
  producto_id     text,
  titulo          text not null,
  url             text,
  foto            text,
  precio          double precision,
  precio_anterior double precision,
  moneda          text,
  vendidos        int,                            -- piso del rango ("+100" → 100)
  vendidos_texto  text,
  stock_texto     text,
  vendedor        text,
  tienda_oficial  boolean,
  envio_gratis    boolean,
  envio_full      boolean,
  estrellas       double precision,
  opiniones       int,
  datos           jsonb,                          -- todo lo demás, tal cual
  primary key (busqueda_id, posicion)
);
alter table meli_publicaciones enable row level security;

-- Las categorías que sigue cada organización.
create table if not exists radar_seguidas (
  organizacion_id text not null references organizaciones(id) on delete cascade,
  categoria_id    text not null,
  profundizar     boolean not null default false,
  desde           timestamptz not null default now(),
  creado_por      text,
  primary key (organizacion_id, categoria_id)
);
alter table radar_seguidas enable row level security;

-- La configuración del Radar de cada organización (una fila).
create table if not exists radar_config (
  organizacion_id         text primary key references organizaciones(id) on delete cascade,
  tope_semanal_usd        double precision not null default 5,
  tendencias_cada         int not null default 7,
  tendencias_unidad       text not null default 'dias' check (tendencias_unidad in ('dias', 'meses')),
  tendencias_desde        date not null default current_date,
  arbol_cada              int not null default 1,
  arbol_unidad            text not null default 'meses' check (arbol_unidad in ('dias', 'meses')),
  arbol_desde             date not null default current_date,
  palabras_a_profundizar  int not null default 3,
  fuente_apify            text not null default 'karamelo' check (fuente_apify in ('karamelo', 'devcake')),
  mostrar_salieron        boolean not null default true,
  actualizado_el          timestamptz not null default now()
);
alter table radar_config enable row level security;

-- Registro de cada corrida de los procesos automáticos (y manuales).
create table if not exists radar_procesos (
  id        bigint generated always as identity primary key,
  tipo      text not null,                        -- 'tendencias' | 'arbol'
  organizacion_id text references organizaciones(id) on delete cascade, -- null = global (árbol)
  origen    text not null default 'cron',         -- 'cron' | 'manual'
  empezo    timestamptz not null default now(),
  termino   timestamptz,
  estado    text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'parcial', 'fallo')),
  detalle   jsonb
);
create index if not exists radar_procesos_tipo_idx on radar_procesos (tipo, empezo desc);
alter table radar_procesos enable row level security;

-- Permisos nuevos del Radar: nacen apagados para los roles existentes
-- (lib/permisos.ts). Decisión explícita: se los damos a los roles protegidos
-- (el Admin de cada organización). El resto, cuando existan los roles, lo
-- decide cada organización con sus checkboxes.
update roles
   set permisos = permisos || '{"radar_ver": true, "radar_gastar": true, "radar_configurar": true}'::jsonb
 where protegido
   and not (permisos ? 'radar_ver');
