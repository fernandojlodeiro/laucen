-- Cimiento (orden 136) · 3/6 · Catálogo: familias, productos, variaciones,
-- kits, cucardas y listas de precios.
--
-- Regla de las tres capas: familia → producto → variación. Un producto simple
-- (o un kit) es un producto con exactamente UNA variación "default", creada
-- sola por el disparador de abajo. Todo el resto del sistema (stock, precios,
-- publicaciones, líneas de pedido) apunta siempre a `variacion_id`, nunca a
-- `producto_id`: un solo camino.

-- ── Cucardas ("nuevo", "novedad", "última unidad"…) ───────
create table if not exists cucarda (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  color            text not null default '#16577F',
  orden            int not null default 0,
  estado           text not null default 'activa' check (estado in ('activa', 'archivada')),
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table cucarda enable row level security;
select erp_politica_org('cucarda');

-- ── Familias (jerárquicas) ────────────────────────────────
-- Portan valores por defecto que heredan sus productos (y sus subfamilias) si
-- no los sobreescriben: descuento sobre precio de lista, planes de cuotas
-- (los usa la sesión Tienda; la columna queda preparada) y cucardas.
create table if not exists familia (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  padre_id         bigint references familia(id) on delete set null,
  nombre           text not null,
  descripcion      text,
  descuento_pct    numeric(5, 2) check (descuento_pct between 0 and 100),
  planes_cuotas    jsonb,
  creado_ts        timestamptz not null default now(),
  check (padre_id is distinct from id)
);
create index if not exists familia_org on familia (organizacion_id, padre_id);
alter table familia enable row level security;
select erp_politica_org('familia');

create table if not exists familia_cucarda (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  familia_id       bigint not null references familia(id) on delete cascade,
  cucarda_id       bigint not null references cucarda(id) on delete cascade,
  desde            date,
  hasta            date,
  unique (familia_id, cucarda_id)
);
alter table familia_cucarda enable row level security;
select erp_politica_org('familia_cucarda');

-- ── Producto (padre) ──────────────────────────────────────
create table if not exists producto (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  sku_base         text not null,
  titulo           text not null,
  descripcion      text,
  familia_id       bigint references familia(id) on delete set null,
  marca            text,
  tipo             text not null default 'simple' check (tipo in ('simple', 'con_variaciones', 'kit')),
  estado           text not null default 'activo' check (estado in ('activo', 'pausado', 'archivado')),
  codigo_barras    text,
  peso_g           int check (peso_g >= 0),
  largo_cm         numeric(8, 1) check (largo_cm >= 0),
  ancho_cm         numeric(8, 1) check (ancho_cm >= 0),
  alto_cm          numeric(8, 1) check (alto_cm >= 0),
  descuento_pct    numeric(5, 2) check (descuento_pct between 0 and 100),
  planes_cuotas    jsonb,
  umbral_pausa     int check (umbral_pausa >= 0),
  stock_minimo     int check (stock_minimo >= 0),
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now(),
  unique (organizacion_id, sku_base)
);
create index if not exists producto_familia on producto (familia_id);
alter table producto enable row level security;
select erp_politica_org('producto');

create table if not exists producto_foto (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  orden            int not null default 0,
  url              text not null,
  ruta_storage     text,
  creado_ts        timestamptz not null default now()
);
create index if not exists producto_foto_producto on producto_foto (producto_id, orden);
alter table producto_foto enable row level security;
select erp_politica_org('producto_foto');

create table if not exists producto_cucarda (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  cucarda_id       bigint not null references cucarda(id) on delete cascade,
  desde            date,
  hasta            date,
  unique (producto_id, cucarda_id)
);
alter table producto_cucarda enable row level security;
select erp_politica_org('producto_cucarda');

create table if not exists producto_atributo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  nombre           text not null,
  valor            text not null,
  orden            int not null default 0
);
create index if not exists producto_atributo_producto on producto_atributo (producto_id, orden);
alter table producto_atributo enable row level security;
select erp_politica_org('producto_atributo');

-- ── Variaciones ───────────────────────────────────────────
create table if not exists variacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  sku              text not null,
  codigo_barras    text,
  titulo           text,
  descuento_pct    numeric(5, 2) check (descuento_pct between 0 and 100),
  estado           text not null default 'activa' check (estado in ('activa', 'pausada', 'archivada')),
  es_default       boolean not null default false,
  orden            int not null default 0,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, sku)
);
create index if not exists variacion_producto on variacion (producto_id, orden);
create unique index if not exists variacion_un_default on variacion (producto_id) where es_default;
create index if not exists variacion_codigo_barras on variacion (organizacion_id, codigo_barras) where codigo_barras is not null;
alter table variacion enable row level security;
select erp_politica_org('variacion');

create table if not exists variacion_atributo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  nombre           text not null,
  valor            text not null,
  orden            int not null default 0,
  unique (variacion_id, nombre)
);
alter table variacion_atributo enable row level security;
select erp_politica_org('variacion_atributo');

create table if not exists variacion_foto (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  orden            int not null default 0,
  url              text not null,
  ruta_storage     text,
  creado_ts        timestamptz not null default now()
);
create index if not exists variacion_foto_variacion on variacion_foto (variacion_id, orden);
alter table variacion_foto enable row level security;
select erp_politica_org('variacion_foto');

-- ── Kits ──────────────────────────────────────────────────
-- Un kit es un producto tipo 'kit' con su variación default. Su stock no se
-- guarda: se calcula como min(stock_componente / cantidad) por depósito.
create table if not exists kit_componente (
  id                       bigint generated always as identity primary key,
  organizacion_id          text not null references organizaciones(id) on delete cascade,
  variacion_kit_id         bigint not null references variacion(id) on delete cascade,
  variacion_componente_id  bigint not null references variacion(id) on delete restrict,
  cantidad                 int not null check (cantidad > 0),
  unique (variacion_kit_id, variacion_componente_id),
  check (variacion_kit_id <> variacion_componente_id)
);
alter table kit_componente enable row level security;
select erp_politica_org('kit_componente');

-- ── La variación default, sola ────────────────────────────
-- Producto simple o kit → exactamente una variación default (con el SKU base).
-- Al pasar a 'con_variaciones', la default queda como una variación más.
create or replace function public.producto_variacion_default() returns trigger
language plpgsql as $$
declare cuantas int;
begin
  if new.tipo in ('simple', 'kit') then
    if not exists (select 1 from variacion where producto_id = new.id and es_default) then
      select count(*) into cuantas from variacion where producto_id = new.id;
      if cuantas = 0 then
        insert into variacion (organizacion_id, producto_id, sku, codigo_barras, es_default)
        values (new.organizacion_id, new.id, new.sku_base, new.codigo_barras, true);
      elsif cuantas = 1 then
        update variacion set es_default = true where producto_id = new.id;
      else
        raise exception 'un producto % tiene una sola variación; éste tiene %', new.tipo, cuantas
          using errcode = 'P0001', hint = 'demasiadas_variaciones';
      end if;
    elsif tg_op = 'UPDATE' and (new.sku_base is distinct from old.sku_base or new.codigo_barras is distinct from old.codigo_barras) then
      update variacion set sku = new.sku_base, codigo_barras = new.codigo_barras
       where producto_id = new.id and es_default;
    end if;
  elsif tg_op = 'UPDATE' and old.tipo in ('simple', 'kit') then
    update variacion set es_default = false where producto_id = new.id and es_default;
  end if;
  return null;
end $$;
create or replace trigger producto_variacion_default
  after insert or update of tipo, sku_base, codigo_barras on producto
  for each row execute function producto_variacion_default();

-- ── Eventos de catálogo ───────────────────────────────────
create or replace function public.producto_emitir_cambio() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'producto' then
    perform emitir_evento(new.organizacion_id, 'producto_cambiado',
      jsonb_build_object('producto_id', new.id, 'variacion_id', null, 'que', lower(tg_op)));
  else
    perform emitir_evento(new.organizacion_id, 'producto_cambiado',
      jsonb_build_object('producto_id', new.producto_id, 'variacion_id', new.id, 'que', lower(tg_op)));
  end if;
  return null;
end $$;
create or replace trigger producto_emitir_cambio after insert or update on producto
  for each row execute function producto_emitir_cambio();
create or replace trigger variacion_emitir_cambio after insert or update on variacion
  for each row execute function producto_emitir_cambio();

-- ── Listas de precios ─────────────────────────────────────
create table if not exists lista_precios (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  moneda_base      text not null default 'ARS' check (moneda_base in ('ARS', 'USD')),
  estado           text not null default 'activa' check (estado in ('activa', 'archivada')),
  orden            int not null default 0,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table lista_precios enable row level security;
select erp_politica_org('lista_precios');

-- Precio de LISTA (el que se muestra tachado), con historia: un precio nuevo
-- es una fila nueva con su `vigente_desde`; el mismo día pisa la fila del día.
-- La otra moneda se calcula al cargar con el tipo de cambio del día y queda
-- congelada (no se recalcula sola después).
create table if not exists precio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  lista_id         bigint not null references lista_precios(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  importe_ars      numeric(16, 2) not null check (importe_ars >= 0),
  importe_usd      numeric(16, 2) not null check (importe_usd >= 0),
  moneda_origen    text not null check (moneda_origen in ('ARS', 'USD')),
  vigente_desde    date not null default current_date,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (lista_id, variacion_id, vigente_desde)
);
create index if not exists precio_variacion on precio (variacion_id, lista_id, vigente_desde desc);
alter table precio enable row level security;
select erp_politica_org('precio');

create or replace function public.precio_emitir_cambio() returns trigger
language plpgsql as $$
begin
  perform emitir_evento(new.organizacion_id, 'precio_cambiado', jsonb_build_object(
    'precio_id', new.id, 'lista_id', new.lista_id, 'variacion_id', new.variacion_id,
    'importe_ars', new.importe_ars, 'importe_usd', new.importe_usd, 'vigente_desde', new.vigente_desde));
  return null;
end $$;
create or replace trigger precio_emitir_cambio after insert or update on precio
  for each row execute function precio_emitir_cambio();

/** Descuento que rige para una variación: el suyo → el del producto → el de
 *  su familia (o la primera familia de más arriba que tenga uno) → 0. */
create or replace function public.descuento_efectivo(p_org text, p_variacion bigint)
returns numeric language sql stable as $$
  with recursive v as (
    select v.descuento_pct dv, p.descuento_pct dp, p.familia_id
      from variacion v join producto p on p.id = v.producto_id
     where v.id = p_variacion and v.organizacion_id = p_org
  ), cadena as (
    select f.id, f.padre_id, f.descuento_pct, 0 nivel from familia f join v on f.id = v.familia_id
    union all
    select f.id, f.padre_id, f.descuento_pct, c.nivel + 1 from familia f join cadena c on f.id = c.padre_id
     where c.nivel < 20
  )
  select coalesce(
    (select dv from v), (select dp from v),
    (select descuento_pct from cadena where descuento_pct is not null order by nivel limit 1),
    0)
$$;

/** El precio de una variación en una lista, un día dado: lista (tachado),
 *  descuento efectivo y venta, en las dos monedas. Es la ÚNICA forma de
 *  obtener un precio en todo el sistema (lib/precios/ la envuelve). Sin fila
 *  si la variación no tiene precio cargado en esa lista. */
-- Lista derivada (Fer, 2/10): "Web = Clásicas × coeficiente". Si la lista
-- tiene base, el precio de una variación es el de la base por el
-- coeficiente, salvo que la lista tenga un precio propio cargado para esa
-- variación (ése gana).
alter table lista_precios add column if not exists base_lista_id bigint references lista_precios(id) on delete set null;
alter table lista_precios add column if not exists coeficiente numeric(8, 4) check (coeficiente > 0);

-- Precio en dólares (Fer, 3/10): un producto (o una variación, que pisa al
-- producto) marcado "precio en dólares" guarda su precio en USD y los pesos se
-- calculan cada día con el tipo de cambio de ESE día (tc_del_dia), sin
-- cargar filas nuevas. Sin tipo de cambio cargado, quedan los pesos
-- congelados al cargar el precio.
alter table producto add column if not exists precio_en_dolares boolean not null default false;
alter table variacion add column if not exists precio_en_dolares boolean;

create or replace function public.precio_de(p_org text, p_variacion bigint, p_lista bigint, p_fecha date default current_date)
returns table (
  precio_id bigint, lista_ars numeric, lista_usd numeric, moneda_origen text, vigente_desde date,
  descuento_pct numeric, venta_ars numeric, venta_usd numeric
) language sql stable as $$
  with l as (select base_lista_id, coalesce(coeficiente, 1) coef from lista_precios where id = p_lista and organizacion_id = p_org),
  c as (
    select pr.id, pr.importe_ars, pr.importe_usd, pr.moneda_origen, pr.vigente_desde, 0 prio
      from precio pr
     where pr.organizacion_id = p_org and pr.variacion_id = p_variacion and pr.lista_id = p_lista and pr.vigente_desde <= p_fecha
    union all
    select pr.id, round(pr.importe_ars * l.coef, 2), round(pr.importe_usd * l.coef, 2), pr.moneda_origen, pr.vigente_desde, 1
      from precio pr cross join l
     where l.base_lista_id is not null and pr.organizacion_id = p_org and pr.variacion_id = p_variacion
       and pr.lista_id = l.base_lista_id and pr.vigente_desde <= p_fecha)
  , usd as (
    select coalesce(v.precio_en_dolares, p.precio_en_dolares, false) si, tc_del_dia(p_org, p_fecha) tc
      from variacion v join producto p on p.id = v.producto_id where v.id = p_variacion and v.organizacion_id = p_org)
  select c.id, x.ars, c.importe_usd, case when u.si then 'USD' else c.moneda_origen end, c.vigente_desde, d.pct,
         round(x.ars * (1 - d.pct / 100), 2),
         round(c.importe_usd * (1 - d.pct / 100), 2)
    from c
    cross join lateral (select descuento_efectivo(p_org, p_variacion) pct) d
    left join usd u on true
    cross join lateral (select case when u.si and u.tc is not null then round(c.importe_usd * u.tc, 2) else c.importe_ars end ars) x
   order by c.prio, c.vigente_desde desc
   limit 1
$$;

/** Título de una variación: el propio, o "título del padre + atributos". */
create or replace function public.titulo_variacion(p_variacion bigint)
returns text language sql stable as $$
  select coalesce(v.titulo,
    p.titulo || coalesce(' — ' || (
      select string_agg(a.valor, ' / ' order by a.orden, a.nombre)
        from variacion_atributo a where a.variacion_id = v.id), ''))
    from variacion v join producto p on p.id = v.producto_id
   where v.id = p_variacion
$$;

-- Costo de importación estimado de cada producto (pestaña "Costo" de la
-- ficha): la posición arancelaria y las alícuotas del despacho. Con el FOB de
-- la variación da el costo puesto en depósito estimado (sobre CIF: ver más
-- abajo, familia_costo). IVA, IVA adicional, percepción de
-- ganancias e ingresos brutos son crédito fiscal: se muestran aparte y NO se
-- suman al costo (igual que en despacho_importacion, db/administracion.sql).
create table if not exists producto_costo (
  producto_id               bigint primary key references producto(id) on delete cascade,
  organizacion_id           text not null references organizaciones(id) on delete cascade,
  ncm                       text,                                  -- posición arancelaria (ej. 8516.79.90.990X)
  derecho_pct               numeric(6, 2) check (derecho_pct between 0 and 100),
  tasa_estadistica_pct      numeric(6, 2) check (tasa_estadistica_pct between 0 and 100),
  arancel_otros_pct         numeric(6, 2) check (arancel_otros_pct between 0 and 100),
  iva_pct                   numeric(6, 2) check (iva_pct between 0 and 100),
  iva_adicional_pct         numeric(6, 2) check (iva_adicional_pct between 0 and 100),
  percepcion_ganancias_pct  numeric(6, 2) check (percepcion_ganancias_pct between 0 and 100),
  ingresos_brutos_pct       numeric(6, 2) check (ingresos_brutos_pct between 0 and 100),
  notas                     text,
  actualizado_ts            timestamptz not null default now()
);
create index if not exists producto_costo_org on producto_costo (organizacion_id);
alter table producto_costo enable row level security;
select erp_politica_org('producto_costo');

-- Costo puesto sobre CIF (Fer, 3/10; misma cuenta que lib/piloto/costo.ts):
--   CIF = FOB + flete (% del FOB) + seguro (% del FOB, 1% de entrada)
--   derechos, estadística y arancel/otros = CIF × su alícuota
--   despachante (1% del CIF) y depósito fiscal y otros (2% del CIF)
--   costo puesto = CIF + derechos + estadística + otros + despachante + depósito
-- Cada valor vacío hereda: producto → su familia → la familia padre → ... →
-- valores generales de la organización (config_org, clave 'costo_importacion').
-- La vía (avión / barco / courier) es informativa por ahora.
alter table producto_costo add column if not exists flete_pct numeric(6, 2) check (flete_pct between 0 and 500);
alter table producto_costo add column if not exists via text check (via in ('avion', 'barco', 'courier'));
alter table producto_costo add column if not exists seguro_pct numeric(6, 2) check (seguro_pct between 0 and 100);
alter table producto_costo add column if not exists despachante_pct numeric(6, 2) check (despachante_pct between 0 and 100);
alter table producto_costo add column if not exists deposito_pct numeric(6, 2) check (deposito_pct between 0 and 100);

-- Los mismos valores por familia (propia o de Mercado Libre: de una categoría
-- de ML no se cambia el nombre ni el árbol, pero sí sus costos). Los heredan
-- sus productos y subfamilias si no los cambian.
create table if not exists familia_costo (
  familia_id                bigint primary key references familia(id) on delete cascade,
  organizacion_id           text not null references organizaciones(id) on delete cascade,
  ncm                       text,
  flete_pct                 numeric(6, 2) check (flete_pct between 0 and 500),
  via                       text check (via in ('avion', 'barco', 'courier')),
  seguro_pct                numeric(6, 2) check (seguro_pct between 0 and 100),
  derecho_pct               numeric(6, 2) check (derecho_pct between 0 and 100),
  tasa_estadistica_pct      numeric(6, 2) check (tasa_estadistica_pct between 0 and 100),
  arancel_otros_pct         numeric(6, 2) check (arancel_otros_pct between 0 and 100),
  despachante_pct           numeric(6, 2) check (despachante_pct between 0 and 100),
  deposito_pct              numeric(6, 2) check (deposito_pct between 0 and 100),
  iva_pct                   numeric(6, 2) check (iva_pct between 0 and 100),
  iva_adicional_pct         numeric(6, 2) check (iva_adicional_pct between 0 and 100),
  percepcion_ganancias_pct  numeric(6, 2) check (percepcion_ganancias_pct between 0 and 100),
  ingresos_brutos_pct       numeric(6, 2) check (ingresos_brutos_pct between 0 and 100),
  actualizado_ts            timestamptz not null default now()
);
create index if not exists familia_costo_org on familia_costo (organizacion_id);
alter table familia_costo enable row level security;
select erp_politica_org('familia_costo');

-- La web es un canal más (Fer, 4/10): un producto está publicado en la Web
-- minorista o mayorista si tiene una publicación propia (sin id externo) en
-- ese canal. Una por variación y canal.
create unique index if not exists publicacion_canal_variacion_propia on publicacion (canal_id, variacion_id) where id_externo is null;
