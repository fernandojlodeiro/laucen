-- Canal de coordinación: bitácora + cola de "para probar".
-- Portado de CadaMes (drizzle/0053, 0060, 0069, 0151, 0152, 0153), consolidado
-- en una sola migración porque acá no hay una historia previa que arrastrar
-- (esas seis migraciones de CadaMes son parches sucesivos sobre una tabla que
-- ya estaba en producción; acá arrancamos limpio con la forma final).
--
-- Idempotente. RLS prendido en las dos tablas nuevas, como manda la regla de
-- "todo va a main" de CadaMes: Drizzle entra por la conexión directa (no
-- sujeta a RLS), así que no hace falta ninguna política para que el server
-- siga funcionando.

create schema if not exists coordinacion;

-- Quién puede escribir. Es una tabla y no un CHECK para que sumar un
-- colaborador o un agente nuevo sea insertar una fila, no una migración.
--
-- AJUSTAR: esta semilla trae los tres autores de CadaMes (fer/code/cowork).
-- Dejalos si van a trabajar este proyecto también, sacá o agregá los que no.
create table if not exists coordinacion.autores (
  slug       text primary key,
  nombre     text not null,
  tipo       text not null check (tipo in ('humano', 'agente')),
  color      text not null default '#5C6B76',
  activo     boolean not null default true,
  creado_ts  timestamptz not null default now()
);

insert into coordinacion.autores (slug, nombre, tipo, color) values
  ('fer',    'Fer',    'humano', '#16577F'),
  ('code',   'Code',   'agente', '#167655'),
  ('cowork', 'Cowork', 'agente', '#8a6100')
on conflict (slug) do nothing;

-- El log en orden. `motivo` es la mitad que sirve: el detalle se lee del
-- diff, el porqué no. `pendientes` va en la misma fila y no en una nota al
-- pie. `pide_lectura` marca las pocas entradas que tienen que llegar a todos.
create table if not exists coordinacion.bitacora (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  autor       text not null references coordinacion.autores(slug),
  tipo        text not null check (tipo in
                ('entrega', 'avance', 'orden', 'decision',
                 'pregunta', 'respuesta', 'bloqueo', 'nota')),
  titulo      text not null,
  detalle     text,
  motivo      text,
  pendientes  text,
  ref_doc     text,
  responde_a  bigint references coordinacion.bitacora(id),
  visto_fer   timestamptz,
  pide_lectura boolean not null default false
);

create index if not exists bitacora_ts_idx on coordinacion.bitacora (ts desc);

-- Quién leyó qué, de las entradas que piden lectura.
create table if not exists coordinacion.lecturas (
  bitacora_id bigint not null references coordinacion.bitacora(id) on delete cascade,
  autor text not null references coordinacion.autores(slug),
  ts timestamptz not null default now(),
  primary key (bitacora_id, autor)
);

create index if not exists lecturas_bitacora_idx on coordinacion.lecturas (bitacora_id);

-- Los huecos con vida propia: los que van a seguir abiertos la semana que
-- viene. Los otros mueren en el `pendientes` de su entrada y está bien.
create table if not exists coordinacion.pendientes (
  id               bigint generated always as identity primary key,
  creado_ts        timestamptz not null default now(),
  autor            text not null references coordinacion.autores(slug),
  titulo           text not null,
  detalle          text,
  por_que_quedo    text,
  prioridad        text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado           text not null default 'abierto' check (estado in
                     ('abierto', 'en_curso', 'resuelto', 'descartado')),
  ref_doc          text,
  bitacora_id      bigint references coordinacion.bitacora(id),
  resuelto_ts      timestamptz,
  resuelto_por     text,
  nota_resolucion  text
);

create index if not exists pendientes_estado_idx on coordinacion.pendientes (estado, prioridad);

alter table coordinacion.bitacora enable row level security;
alter table coordinacion.pendientes enable row level security;
alter table coordinacion.lecturas enable row level security;
alter table coordinacion.autores enable row level security;

-- La cola de lo que hay que ir a probar. Aparte de la bitácora a propósito:
-- la bitácora es decisiones y huecos, esto es trabajo pendiente con
-- prioridad y con resultado. Cada fila es un hilo: lo que pasa después
-- cuelga como "vueltas" con letra (1a, 1b, 1c), nunca una fila nueva.
create table if not exists coordinacion.para_probar (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null default now(),
  autor        text not null references coordinacion.autores(slug),
  pedido_por   text references coordinacion.autores(slug),
  -- Qué sesión lo hizo. Con varias sesiones de la misma herramienta a la
  -- vez, "code" solo no dice a cuál volver si algo falla.
  sesion       text,
  titulo       text not null,
  detalle      text,
  -- Qué partes del sistema toca. El vocabulario vive en código
  -- (lib/para-probar.ts), no en un CHECK, para que sumar un área sea una
  -- línea y no una migración.
  areas        text[] not null default '{}',
  prioridad    text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado       text not null default 'por_probar' check (estado in
                 ('por_probar', 'ok', 'con_fallas', 'observado')),
  -- El commit que lo trajo, en corto: lo que diría el pie de página de la app.
  version      text,
  constraint para_probar_agente_con_sesion
    check (autor = 'fer' or (sesion is not null and length(trim(sesion)) > 0))
);

create index if not exists para_probar_estado_idx
  on coordinacion.para_probar (estado, prioridad, ts desc);

-- Las vueltas de un hilo: 1a, 1b, 1c. Alguien marca que falló, la sesión
-- cuelga el arreglo, se vuelve a "por probar", alguien marca de nuevo.
create table if not exists coordinacion.para_probar_vueltas (
  id              bigint generated always as identity primary key,
  para_probar_id  bigint not null references coordinacion.para_probar(id) on delete cascade,
  ts              timestamptz not null default now(),
  autor           text not null references coordinacion.autores(slug),
  sesion          text,
  tipo            text not null check (tipo in ('falla', 'observado', 'arreglo', 'ok', 'nota')),
  texto           text,
  version         text,
  constraint para_probar_vueltas_agente_con_sesion
    check (autor = 'fer' or (sesion is not null and length(trim(sesion)) > 0))
);

create index if not exists para_probar_vueltas_hilo_idx
  on coordinacion.para_probar_vueltas (para_probar_id, ts, id);

alter table coordinacion.para_probar enable row level security;
alter table coordinacion.para_probar_vueltas enable row level security;
