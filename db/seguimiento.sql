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

-- La regla de precio de cada producto (Fer, 11/10): mirando lo que se sigue,
-- baja el precio de la lista Clásicas del producto (desde ahí el esquema de
-- precios lo lleva a todas las cuentas y planes). Nunca toca Mercado Libre
-- directo. modo: apagada · propuesta (queda esperando el clic de «Aplicar») ·
-- automatico (cambia la lista sola). contra: el más barato de los que se
-- siguen, o uno elegido. como: igual · pesos (X pesos menos) · pct (X % menos).
-- piso: la Clásica nunca baja de ahí.
create table if not exists seguimiento_regla (
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  producto_id       bigint not null references producto(id) on delete cascade,
  modo              text not null default 'apagada' check (modo in ('apagada', 'propuesta', 'automatico')),
  contra            text not null default 'mas_barato' check (contra in ('mas_barato', 'una')),
  seguimiento_id    bigint references seguimiento_pub(id) on delete set null,
  como              text not null default 'pesos' check (como in ('igual', 'pesos', 'pct')),
  diferencia        numeric(16, 2) not null default 0 check (diferencia >= 0),
  piso              numeric(16, 2) check (piso > 0),
  revisada_ts       timestamptz,
  resultado         text,
  actualizado_ts    timestamptz not null default now(),
  primary key (organizacion_id, producto_id)
);
-- También subir (Fer, 12/10): si el competidor sube, la Clásica sube hasta el objetivo, nunca por encima del techo.
alter table seguimiento_regla add column if not exists subir boolean not null default false;
alter table seguimiento_regla add column if not exists techo numeric(16, 2) check (techo > 0);
alter table seguimiento_regla enable row level security;
select erp_politica_org('seguimiento_regla');

-- Lo que hizo (o propuso) la regla: una fila por variación y vez.
-- estado: propuesto (espera «Aplicar») · aplicado · descartado · reemplazado.
create table if not exists seguimiento_ajuste (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  producto_id       bigint not null references producto(id) on delete cascade,
  variacion_id      bigint not null references variacion(id) on delete cascade,
  lista_id          bigint not null references lista_precios(id) on delete cascade,
  ts                timestamptz not null default now(),
  antes_ars         numeric(16, 2) not null,
  nuevo_ars         numeric(16, 2) not null,
  referencia        text,
  modo              text not null check (modo in ('propuesta', 'automatico')),
  estado            text not null default 'propuesto' check (estado in ('propuesto', 'aplicado', 'descartado', 'reemplazado')),
  resuelto_ts       timestamptz,
  usuario_id        text
);
create index if not exists seguimiento_ajuste_producto on seguimiento_ajuste (organizacion_id, producto_id, ts desc);
alter table seguimiento_ajuste enable row level security;
select erp_politica_org('seguimiento_ajuste');

-- Los vendedores de un catálogo pegado en «Agregar por número» (Fer, 12/10): el
-- link de la página del catálogo (…/p/MLA…) trae, por la API y gratis, a todos
-- los que compiten, para elegir a cuáles seguir. Uno por catálogo y producto;
-- se vuelve a armar si se pega de nuevo, y se cierra con su tacho.
create table if not exists seguimiento_catalogo (
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  producto_id       bigint not null references producto(id) on delete cascade,
  catalogo_id       text not null,
  titulo            text,
  ts                timestamptz not null default now(),
  resultados        jsonb not null default '[]',
  primary key (organizacion_id, producto_id, catalogo_id)
);
alter table seguimiento_catalogo enable row level security;
select erp_politica_org('seguimiento_catalogo');

-- Internacionales y excluidas de la regla (Fer, 12/10): una publicación de un
-- vendedor de afuera (o con entrega internacional) no se compara (le faltan los
-- impuestos); y Fer puede seguir una sin que cuente para la regla de precio.
alter table seguimiento_pub add column if not exists internacional boolean;
alter table seguimiento_pub add column if not exists excluido boolean not null default false;

-- Seguimiento automático (Fer, 13/10): la búsqueda de precio de mercado sigue sola
-- las publicaciones que la IA juzga comparables con el producto (origen 'auto').
-- Esas quedan sin confirmar hasta que una persona las revisa (confirmada); las que
-- agrega una persona nacen confirmadas. La regla de precio sólo mira las
-- confirmadas. motivo_ia: por qué la IA la juzgó comparable.
alter table seguimiento_pub add column if not exists confirmada boolean not null default true;
alter table seguimiento_pub add column if not exists confirmada_ts timestamptz;
alter table seguimiento_pub add column if not exists confirmada_por text;
alter table seguimiento_pub add column if not exists motivo_ia text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'seguimiento_pub_origen_auto') then
    alter table seguimiento_pub drop constraint if exists seguimiento_pub_origen_check;
    alter table seguimiento_pub add constraint seguimiento_pub_origen_auto check (origen in ('busqueda', 'manual', 'importado', 'auto'));
  end if;
end $$;

-- Importar los seguimientos de Virtual Seller (Fer, 14/10): el informe «Seguimientos
-- totales» trae, por cada seguimiento, el producto nuestro (en el ID del seguimiento) y
-- las publicaciones de la competencia con su último precio y estado. Entran revisadas
-- (las eligió una persona en Virtual Seller), con origen 'importado' y de dónde vienen
-- en origen_detalle. La primera lectura queda con fuente 'importado'.
alter table seguimiento_pub add column if not exists origen_detalle text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'seguimiento_lectura_fuente_imp') then
    alter table seguimiento_lectura drop constraint if exists seguimiento_lectura_fuente_check;
    alter table seguimiento_lectura add constraint seguimiento_lectura_fuente_imp check (fuente in ('api', 'apify', 'busqueda', 'importado'));
  end if;
end $$;
create table if not exists seguimiento_importacion (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  archivo           text not null,
  usuario_id        text,
  ts                timestamptz not null default now(),
  estado            text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'error')),
  resumen           jsonb not null default '{}',
  error             text
);
create index if not exists seguimiento_importacion_org on seguimiento_importacion (organizacion_id, id desc);
alter table seguimiento_importacion enable row level security;
select erp_politica_org('seguimiento_importacion');
-- Dónde quedó el archivo en Storage, para «Volver a importar» (Fer, 22/10: se mejoró cómo se lee el ID del seguimiento).
alter table seguimiento_importacion add column if not exists ruta text;

-- Desde cuándo está pausada la publicación de la competencia (Fer, 22/10): se relee cada «pausadas_dias» y, pasados
-- «pausadas_meses», deja de releerse sola hasta «Reanudar» (que la vuelve a poner en hoy). La pone el disparador al
-- cambiar el estado; vuelve a null cuando deja de estar pausada.
alter table seguimiento_pub add column if not exists pausada_desde timestamptz;
create or replace function seguimiento_pub_pausada_desde() returns trigger language plpgsql as $$
begin
  if new.estado = 'pausada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'pausada' then new.pausada_desde := coalesce(new.pausada_desde, new.leido_ts, now()); end if;
  else
    new.pausada_desde := null;
  end if;
  return new;
end $$;
drop trigger if exists seguimiento_pub_pausada_desde on seguimiento_pub;
create trigger seguimiento_pub_pausada_desde before insert or update of estado, pausada_desde on seguimiento_pub
  for each row execute function seguimiento_pub_pausada_desde();
update seguimiento_pub set pausada_desde = coalesce(leido_ts, creado_ts) where estado = 'pausada' and pausada_desde is null;

-- Stock y vendidos de la publicación de la competencia (Fer, 22/10), como los muestra Mercado Libre (lo trae la lectura
-- con Apify): exacto cuando son pocas; si son muchas, redondeado («26» = más de 25, «51» = más de 50).
alter table seguimiento_pub add column if not exists disponible int;
alter table seguimiento_pub add column if not exists vendidos int;
