-- Market Pro de Real Trends (Fer, 5/11): datos de ventas de Mercado Libre por publicación, por mes (desde
-- octubre de 2023) y por día (desde octubre de 2025), sólo de las categorías que habilita la llave. La API corre
-- una consulta por vez por llave y devuelve de a 100 filas: lo baja de a poco el motor (lib/marketpro/motor.ts),
-- que se reanuda solo (pg_cron, abajo). Prefijo mpro_ (mp_ es Mercado Pago).

-- La llave de cada organización (nunca se muestra). token protege la ruta del motor; motor_hasta es el turno: una
-- sola vuelta a la vez (la API contesta 429 a la segunda consulta simultánea).
create table if not exists mpro_llave (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  llave            text not null,
  pais             text not null default 'ar',
  cargada_ts       timestamptz not null default now(),
  usuario_id       text,
  token            uuid not null default gen_random_uuid(),
  motor_hasta      timestamptz,
  motor_ts         timestamptz,
  pausado          boolean not null default false,
  ultimo_error     text,
  ultimo_error_ts  timestamptz
);
alter table mpro_llave enable row level security;

-- El árbol de categorías del país (igual para todos: no es dato de nadie). id = el número de ML sin «MLA».
create table if not exists mpro_categoria (
  pais         text not null,
  category_id  int not null,
  nombre       text,
  ruta         text,
  padres       int[] not null default '{}',
  hoja         boolean,
  nivel        int,
  leida_ts     timestamptz not null default now(),
  primary key (pais, category_id)
);
create index if not exists mpro_categoria_padres on mpro_categoria using gin (padres);
alter table mpro_categoria enable row level security;

-- Las categorías que la organización baja (las que habilita su llave). habilitada: null = sin probar.
create table if not exists mpro_seguida (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  category_id      int not null,
  ruta             text,
  habilitada       boolean,
  publicaciones    int,                 -- publicaciones del último mes cerrado (con o sin ventas), al probarla
  agregada_ts      timestamptz not null default now(),
  primary key (organizacion_id, category_id)
);
alter table mpro_seguida enable row level security;

-- Cola de descargas. tipo: categorias (el árbol), probar (si la llave ve una categoría), conteo (cuántas
-- publicaciones hubo en el mes, con o sin ventas: una consulta de 1 fila), mes y dia (las filas, sólo con ventas).
create table if not exists mpro_descarga (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  clave            text not null,
  tipo             text not null check (tipo in ('categorias', 'probar', 'conteo', 'mes', 'dia')),
  category_id      int,
  mes              text,                -- YYYYMM
  desde            date,
  hasta            date,
  filtros          jsonb not null default '{}',
  atributos        boolean not null default false,
  prioridad        int not null default 100,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'corriendo', 'terminada', 'error')),
  desplazamiento   int not null default 0,
  total            int,
  filas            int not null default 0,
  pedidos          int not null default 0,
  intentos         int not null default 0,
  error            text,
  creada_ts        timestamptz not null default now(),
  empezada_ts      timestamptz,
  terminada_ts     timestamptz,
  unique (organizacion_id, clave)
);
create index if not exists mpro_descarga_cola on mpro_descarga (organizacion_id, prioridad, id) where estado in ('pendiente', 'corriendo');
alter table mpro_descarga enable row level security;

-- Lo fijo de cada publicación (lo último leído). producto = la clave que junta publicaciones del mismo producto:
-- c:<catálogo>, si no e:<EAN>, si no m:<marca|modelo>, si no i:<publicación>.
create table if not exists mpro_publicacion (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  item_id          text not null,
  cat              int,
  categoria        text,
  titulo           text,
  marca            text,
  modelo           text,
  ean              text,
  catalogo         text,
  foto             text,
  vendedor         text,
  alias            text,                -- el alias que la organización le puso al vendedor en Market Pro
  reputacion       text,
  provincia        text,
  ciudad           text,
  dominio          text,
  sku              text,
  condicion        text,
  producto         text not null,
  visto_periodo    date,                -- de qué período es lo fijo guardado (gana el más nuevo)
  visto_ts         timestamptz not null default now(),
  primary key (organizacion_id, item_id)
);
create index if not exists mpro_publicacion_producto on mpro_publicacion (organizacion_id, producto);
create index if not exists mpro_publicacion_vendedor on mpro_publicacion (organizacion_id, vendedor);
create index if not exists mpro_publicacion_cat on mpro_publicacion (organizacion_id, cat);
alter table mpro_publicacion add column if not exists alias text;
alter table mpro_publicacion enable row level security;

-- Lo de cada período: grano m (mes, periodo = día 1) o d (día).
create table if not exists mpro_venta (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  grano            char(1) not null check (grano in ('m', 'd')),
  periodo          date not null,
  item_id          text not null,
  vendidas         int,
  precio           numeric(14, 2),
  gmv              numeric(16, 2),
  descuento        numeric(6, 4),
  tipo             text,
  cuotas           text,
  envio            text,
  envio_gratis     boolean,
  catalogo         boolean,
  dias_activa      int,
  visitas_dia      numeric(12, 2),
  conversion       numeric(10, 6),
  preguntas_dia    numeric(10, 3),
  fotos            smallint,
  visitas_total    int,
  preguntas_total  int,
  ventas_total     int,
  canceladas       int,
  reputacion       text,
  primary key (organizacion_id, grano, periodo, item_id)
);
create index if not exists mpro_venta_item on mpro_venta (organizacion_id, item_id);
create index if not exists mpro_venta_producto on mpro_venta (organizacion_id, producto, periodo) where grano = 'm';
alter table mpro_venta add column if not exists envio_tipo text;
-- Lo fijo que más se usa al agrupar, también en cada fila (Fer, 7/11: cruzar con mpro_publicacion tardaba 46 s por consulta).
alter table mpro_venta add column if not exists cat int;
alter table mpro_venta add column if not exists producto text;
alter table mpro_venta add column if not exists vendedor text;
alter table mpro_venta add column if not exists marca text;   -- shipping_mode_type (se guarda desde el 6/11)
alter table mpro_venta enable row level security;

-- Atributos de la publicación (sólo se piden en el último mes cerrado: pesan).
create table if not exists mpro_atributos (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  item_id          text not null,
  atributos        jsonb,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, item_id)
);
alter table mpro_atributos enable row level security;

-- Cuántas publicaciones hubo en cada mes en una categoría seguida (con o sin ventas).
create table if not exists mpro_conteo (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  category_id      int not null,
  mes              date not null,
  publicaciones    int,
  con_ventas       int,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, category_id, mes)
);
alter table mpro_conteo enable row level security;

-- Reanudador: si quedó algo por bajar y no hay una vuelta trabajando, cada 2 minutos la base llama al motor.
do $$
declare j record; cmd text := $c$select net.http_get('https://laucen.com/api/marketpro?org=' || l.organizacion_id || '&token=' || l.token) from public.mpro_llave l where not l.pausado and (l.motor_hasta is null or l.motor_hasta < now()) and exists (select 1 from public.mpro_descarga d where d.organizacion_id = l.organizacion_id and d.estado in ('pendiente', 'corriendo'))$c$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'marketpro';
  if not found then perform cron.schedule('marketpro', '*/2 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar marketpro (%)', sqlerrm;
end $$;

-- Cada mañana (6 h de Argentina) se suma lo del día anterior y el mes que corre.
do $$
declare j record; cmd text := $c$select net.http_get('https://laucen.com/api/marketpro?plan=1&org=' || l.organizacion_id || '&token=' || l.token) from public.mpro_llave l where not l.pausado$c$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'marketpro-diario';
  if not found then perform cron.schedule('marketpro-diario', '0 9 * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar marketpro-diario (%)', sqlerrm;
end $$;

-- Quién es cada vendedor (Fer, 5/11). Market Pro cifra el número de publicación y ofusca el vendedor («PALABRA.PALABRA.PALABRA»),
-- pero da el producto de catálogo. De Mercado Libre se leen las ofertas de cada catálogo (GET /products/{id}/items: el
-- seller_id de cada una; la ficha de una publicación ajena da 403) y a cada apodo se le asigna el vendedor que está en los
-- mismos catálogos (lib/marketpro/vendedores.ts). estado: ok, sin_catalogo (no vende nada de catálogo: no hay forma por
-- API) o no_encontrado (todavía no alcanza para asegurarlo).
create table if not exists mpro_vendedor (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  apodo            text not null,
  estado           text not null check (estado in ('ok', 'sin_catalogo', 'no_encontrado')),
  seller_id        bigint,
  nombre           text,
  ciudad           text,
  provincia        text,
  medalla          text,
  nivel            text,
  ventas           int,
  item_id          text,
  intentos         int not null default 1,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, apodo)
);
alter table mpro_vendedor add column if not exists coincidencias int;   -- catálogos en común con el vendedor elegido
alter table mpro_vendedor add column if not exists de int;              -- catálogos del apodo ya leídos
alter table mpro_vendedor enable row level security;

-- Las ofertas de cada catálogo leídas de Mercado Libre (quién vende en él).
create table if not exists mpro_catalogo_oferta (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  catalogo         text not null,          -- sin «MLA», como lo da Market Pro
  seller_id        bigint not null,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, catalogo, seller_id)
);
create index if not exists mpro_catalogo_oferta_seller on mpro_catalogo_oferta (organizacion_id, seller_id);
alter table mpro_catalogo_oferta enable row level security;
create table if not exists mpro_catalogo_leido (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  catalogo         text not null,
  ofertas          int,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, catalogo)
);
alter table mpro_catalogo_leido enable row level security;
drop table if exists mpro_item_vendedor;
alter table mpro_llave add column if not exists vendedores_hasta timestamptz;
-- Cómo se identificó (catalogos: sólo por catálogos en común; provincia: desempate por provincia y medalla) y la ficha
-- pública de cada vendedor de ML leída (para desempatar sin volver a pedirla).
alter table mpro_vendedor add column if not exists metodo text;
create table if not exists mpro_vendedor_ml (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  seller_id        bigint not null,
  nombre           text,
  ciudad           text,
  provincia        text,
  medalla          text,
  nivel            text,
  ventas           int,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, seller_id)
);
alter table mpro_vendedor_ml enable row level security;

-- Una vez (6/11): la pausa que dejó la prueba de países (sin error de la llave) se levanta al publicar este cambio;
-- pasada la fecha, esta línea ya no hace nada (no pisa una pausa manual futura).
update mpro_llave set pausado = false where pausado and ultimo_error is null and now() < '2026-11-07 12:00+00';

-- El informe de cada categoría (Fer, 7/11; /market-pro/informe): lo que escribió la IA después de explorar los datos
-- (lib/marketpro/informe-ia.ts). cat 0 = todas las bajadas. datos_hasta: el último mes cerrado que tenía al escribirlo
-- (cuando cierra otro mes, se vuelve a escribir solo).
create table if not exists mpro_informe (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cat              int not null,
  texto            text,
  estado           text not null default 'trabajando' check (estado in ('trabajando', 'listo', 'error')),
  error            text,
  costo_usd        numeric(8, 4),
  consultas        int,
  datos_hasta      date,
  pedido_por       text,
  empezado_ts      timestamptz not null default now(),
  generado_ts      timestamptz,
  primary key (organizacion_id, cat)
);
alter table mpro_informe enable row level security;

-- Lo que se agregó a mano al informe desde el asistente («Agregar al informe»).
create table if not exists mpro_informe_extra (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cat              int not null,
  pregunta         text,
  texto            text not null,
  usuario_id       text,
  creado_ts        timestamptz not null default now()
);
create index if not exists mpro_informe_extra_cat on mpro_informe_extra (organizacion_id, cat, id);
alter table mpro_informe_extra enable row level security;

-- Políticas de fila: el asistente (consultas libres) y la IA del informe consultan como el usuario, y sin política
-- no verían nada. La llave (mpro_llave) queda sin política: no la consulta nadie. El árbol de categorías es de todos.
do $$
declare t text;
begin
  foreach t in array array['mpro_seguida', 'mpro_descarga', 'mpro_publicacion', 'mpro_venta', 'mpro_atributos', 'mpro_conteo',
                           'mpro_vendedor', 'mpro_catalogo_oferta', 'mpro_catalogo_leido', 'mpro_vendedor_ml', 'mpro_informe', 'mpro_informe_extra'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_org') then
      perform erp_politica_org(t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mpro_categoria' and policyname = 'mpro_categoria_leer') then
    create policy mpro_categoria_leer on mpro_categoria for select to authenticated using (true);
  end if;
end $$;

-- Costeos de importación (Fer, 10/11; /market-pro/importar): una lista de precios de proveedor, el monto a importar y lo
-- que salió (cada modelo cruzado con Market Pro, su costo nacionalizado, su ganancia y la cantidad propuesta).
create table if not exists mpro_costeo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  titulo           text,
  lista            text not null,
  monto_usd        numeric(14, 2),
  dolar            numeric(14, 4),
  estado           text not null default 'trabajando' check (estado in ('trabajando', 'listo', 'error')),
  error            text,
  items            jsonb,
  resultado        jsonb,
  costo_ia_usd     numeric(8, 4),
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  terminado_ts     timestamptz
);
create index if not exists mpro_costeo_org on mpro_costeo (organizacion_id, id desc);
alter table mpro_costeo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mpro_costeo' and policyname = 'mpro_costeo_org') then
    perform erp_politica_org('mpro_costeo');
  end if;
end $$;

-- Las cuentas de las pantallas ya hechas (Fer, 11/11: tardaban más de un minuto; lib/marketpro/analisis.ts). version:
-- la de los datos de meses cerrados con que se calcularon; si cambió, se recalculan.
create table if not exists mpro_cache (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  clave            text not null,
  version          text not null,
  datos            jsonb not null,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, clave)
);
alter table mpro_cache enable row level security;

-- Cada 10 minutos, si las cuentas de las pantallas quedaron viejas, se recalculan de fondo (?calentar=1).
do $$
declare j record; cmd text := $c$select net.http_get('https://laucen.com/api/marketpro?calentar=1&org=' || l.organizacion_id || '&token=' || l.token) from public.mpro_llave l$c$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'marketpro-calentar';
  if not found then perform cron.schedule('marketpro-calentar', '*/10 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar marketpro-calentar (%)', sqlerrm;
end $$;
