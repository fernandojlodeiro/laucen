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

-- ── Marcas (Fer, 10/10) ───────────────────────────────────
-- Una tabla, para que no se escriban mal y sirvan de filtro en los informes.
-- El producto guarda marca_id y, al lado, el nombre (producto.marca) que leen
-- todas las pantallas, la API y Mercado Libre: lo mantiene la base sola. Quien
-- escribe sólo el texto (importar de ML o de Virtual Seller) igual queda
-- enganchado: si la marca existe (sin importar mayúsculas) toma esa; si no, se
-- crea.
create table if not exists marca (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null check (trim(nombre) <> ''),
  creado_ts        timestamptz not null default now()
);
create unique index if not exists marca_nombre on marca (organizacion_id, lower(trim(nombre)));
alter table marca enable row level security;
select erp_politica_org('marca');
alter table producto add column if not exists marca_id bigint references marca(id) on delete set null;
create index if not exists producto_marca on producto (marca_id);

create or replace function producto_marca_sync() returns trigger
language plpgsql as $$
declare
  v_id bigint; v_nombre text;
begin
  if new.marca_id is not null and (tg_op = 'INSERT' or new.marca_id is distinct from old.marca_id) then
    select nombre into new.marca from marca where id = new.marca_id and organizacion_id = new.organizacion_id;
    if not found then new.marca_id := null; end if;
    return new;
  end if;
  if new.marca is null or trim(new.marca) = '' then
    new.marca := null; new.marca_id := null;
    return new;
  end if;
  select id, nombre into v_id, v_nombre from marca where organizacion_id = new.organizacion_id and lower(trim(nombre)) = lower(trim(new.marca));
  if not found then
    insert into marca (organizacion_id, nombre) values (new.organizacion_id, trim(new.marca))
    on conflict do nothing returning id, nombre into v_id, v_nombre;
    if v_id is null then
      select id, nombre into v_id, v_nombre from marca where organizacion_id = new.organizacion_id and lower(trim(nombre)) = lower(trim(new.marca));
    end if;
  end if;
  new.marca_id := v_id; new.marca := v_nombre;
  return new;
end $$;
create or replace trigger producto_marca_sync before insert or update of marca, marca_id on producto
  for each row execute function producto_marca_sync();
-- Los que tienen el texto y todavía no la marca (la primera vez, todos; después, ninguno).
update producto set marca = marca where marca is not null and marca_id is null;

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
-- Pieza que SOBRA al armar el kit (Fer, 7/10: la Asus de 12 GB se arma sacándole
-- una memoria de 4 GB y poniéndole una de 8; la de 4 vuelve al stock). No cuenta
-- para el disponible del kit, no se reserva ni se pickea: al venderse el kit,
-- entra al stock en la ubicación de donde salió el equipo (mover_stock).
alter table kit_componente add column if not exists sobrante boolean not null default false;

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
-- De dónde salió cada precio (Fer, 12/10: Historial de precios de lista). origen: null = a mano
-- (o anterior a esto) · 'seguimiento' (la regla de precio del seguimiento) · 'masivo' (carga masiva
-- por porcentaje) · 'copia' (al duplicar un producto) · 'ajuste' (un ajuste en lote pedido en el chat; el
-- motivo dice cuál). motivo: en palabras (ej. contra quién compitió la regla).
alter table precio add column if not exists origen text;
alter table precio add column if not exists motivo text;
create index if not exists precio_org_fecha on precio (organizacion_id, creado_ts desc);
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
-- Descuentos por lista (Fer, 7/10): el descuento de la variación, el producto o la
-- familia rige SÓLO en las listas que tienen "Aplica descuentos" tildado (la de la
-- tienda web). En las demás (Clásicas, la del Local…) precio de venta = precio de lista.
alter table lista_precios add column if not exists aplica_descuentos boolean not null default false;
-- Lista por defecto (Fer, 22/10): una por organización. La usa un pedido sólo cuando ni el cliente
-- ni el canal tienen lista (manda: la elegida en el pedido > la del cliente > la del canal > ésta).
-- Se marca en Catálogo › Listas de precios («Hacer por defecto»); de entrada, la Clásica.
alter table lista_precios add column if not exists por_defecto boolean not null default false;
create unique index if not exists lista_precios_una_por_defecto on lista_precios (organizacion_id) where por_defecto;
update lista_precios l set por_defecto = true
 where l.id = (select min(x.id) from lista_precios x where x.organizacion_id = l.organizacion_id and x.estado = 'activa'
                 and lower(x.nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica'))
   and not exists (select 1 from lista_precios o where o.organizacion_id = l.organizacion_id and o.por_defecto);
create or replace function lista_por_defecto(p_org text) returns bigint language sql stable as $$
  select id from lista_precios where organizacion_id = p_org and por_defecto
$$;

-- Precio en dólares (Fer, 3/10): un producto (o una variación, que pisa al
-- producto) marcado "precio en dólares" guarda su precio en USD y los pesos se
-- calculan cada día con el tipo de cambio de ESE día (tc_del_dia), sin
-- cargar filas nuevas. Sin tipo de cambio cargado, quedan los pesos
-- congelados al cargar el precio.
alter table producto add column if not exists precio_en_dolares boolean not null default false;
-- El video del producto (Fer, 24/10): se ve en la ficha de la tienda, después de la primera foto.
-- video_url es el link público (bucket videos_tienda) y video_ruta, el archivo (para borrarlo).
alter table producto add column if not exists video_url text;
alter table producto add column if not exists video_ruta text;
alter table variacion add column if not exists precio_en_dolares boolean;

-- Precio de la web contra Mercado Libre (Fer, 24/10). Una lista con precio_vs_ml
-- ({activo, objetivo_pct, costo_ref_pct, canal_tachado, comision_defecto_pct, bono_fijo_pct, bono_stock_min, bono_tope_pct}; activo = true) no usa los descuentos
-- por familia: su precio de venta es la Clásica menos lo justo para que, pagando con lo más
-- caro que se cobra al mismo precio (costo_ref_pct: 3 cuotas sin interés), quede objetivo_pct
-- de lo que queda vendiendo en la Clásica de ML (la comisión de la categoría de ML del
-- producto, ml_costos_comisiones, con IVA: se compara sin IVA porque se recupera). Y su precio
-- de lista (el tachado) es el de ML: la Clásica más el % de la regla de tachado del canal de ML
-- elegido (ml_regla_precio: producto → familia más cercana → general).
alter table lista_precios add column if not exists precio_vs_ml jsonb;

-- plpgsql: las tablas de ML se crean en otros .sql que corren después.
create or replace function public.comision_clasica_ml(p_variacion bigint, p_defecto numeric)
returns numeric language plpgsql stable as $$
declare r numeric;
begin
  -- La comisión vigente de la categoría se busca directo por su clave (categoria_id, desde): la vista
  -- ml_costos_comisiones_vigente recorría la tabla entera en cada llamada y esta función se llama por cada
  -- variación del catálogo de la tienda (25/10: 30 ms por variación, el listado tardaba un minuto).
  select c.clasica_pct into r
    from publicacion pu join variacion v on v.id = pu.variacion_id
    join variacion v2 on v2.producto_id = v.producto_id and v2.id = p_variacion
    cross join lateral (select m.clasica_pct from ml_costos_comisiones m where m.categoria_id = pu.categoria_externa order by m.desde desc limit 1) c
   where pu.id_externo is not null and pu.categoria_externa is not null and c.clasica_pct is not null
   order by (pu.variacion_id = p_variacion) desc, (pu.tipo_publicacion = 'gold_special') desc, (pu.estado = 'activa') desc, pu.id desc
   limit 1;
  return coalesce(r, p_defecto);
exception when undefined_table then return p_defecto;
end $$;

create or replace function public.descuento_vs_ml(p_org text, p_variacion bigint, p_cfg jsonb)
returns numeric language plpgsql stable as $$
declare
  obj numeric := coalesce((p_cfg ->> 'objetivo_pct')::numeric, 97) / 100;
  costo numeric := coalesce((p_cfg ->> 'costo_ref_pct')::numeric, 0) / 100;
  com numeric := comision_clasica_ml(p_variacion, coalesce((p_cfg ->> 'comision_defecto_pct')::numeric, 16.34224));
begin
  -- Lo que queda en ML (sin IVA de la comisión) × objetivo = lo que tiene que quedar en la web después del costo de cobro.
  return greatest(0, least(60, round(100 * (1 - obj * (1 - com / 121) / (1 - costo)), 2)));
end $$;

create or replace function public.tachado_ml(p_org text, p_variacion bigint, p_canal bigint)
returns numeric language plpgsql stable as $$
declare r numeric; v_prod bigint; v_fam bigint;
begin
  if p_canal is null then return 0; end if;
  select p.id, p.familia_id into v_prod, v_fam from variacion v join producto p on p.id = v.producto_id where v.id = p_variacion and v.organizacion_id = p_org;
  select tachado_pct into r from ml_regla_precio where canal_id = p_canal and nivel = 'producto' and producto_id = v_prod and tachado_pct is not null;
  if r is null then
    with recursive cad as (
      select f.id, f.padre_id, 0 n from familia f where f.id = v_fam
      union all select f.id, f.padre_id, cad.n + 1 from familia f join cad on f.id = cad.padre_id where cad.n < 20)
    select m.tachado_pct into r from cad join ml_regla_precio m on m.canal_id = p_canal and m.nivel = 'familia' and m.familia_id = cad.id
     where m.tachado_pct is not null order by cad.n limit 1;
  end if;
  if r is null then select tachado_pct into r from ml_regla_precio where canal_id = p_canal and nivel = 'general'; end if;
  return coalesce(r, 0);
exception when undefined_table then return 0;
end $$;

-- Lo que cobra ML por unidad en la Clásica a ese precio (el cargo fijo de los productos baratos:
-- ml_costos_cargo_fijo, sin envío); 0 si no hay datos.
create or replace function public.cargo_fijo_ml(p_precio numeric)
returns numeric language plpgsql stable as $$
declare r numeric;
begin
  select cargo_fijo into r from ml_costos_cargo_fijo_vigente
   where tipo = 'gold_special' and logistica = '-' order by (precio <= p_precio) desc, case when precio <= p_precio then -precio else precio end limit 1;
  return coalesce(r, 0);
exception when undefined_table then return 0;
end $$;

-- La promo web (bonificación) de una variación en una lista con precio_vs_ml: bono_fijo_pct % del
-- cargo fijo de ML a ese precio de la Clásica (p_clasica), en pesos, sólo si su stock en la tienda
-- de esa lista llega a bono_stock_min unidades (Fer, 24/10: que no la tengan todos), y nunca más de
-- bono_tope_pct % de la Clásica (Fer, 24/10: un diodo de $ 1.211 quedaba en $ 461). 0 si no va.
create or replace function public.bono_aplicable(p_org text, p_variacion bigint, p_lista bigint, p_clasica numeric)
returns numeric language plpgsql stable as $$
declare cfg jsonb; fijo numeric; v_canal bigint; stock numeric;
begin
  select precio_vs_ml into cfg from lista_precios where id = p_lista and organizacion_id = p_org;
  if not coalesce((cfg ->> 'activo')::boolean, false) or coalesce((cfg ->> 'bono_fijo_pct')::numeric, 0) <= 0 then return 0; end if;
  fijo := cargo_fijo_ml(p_clasica);
  if fijo <= 0 then return 0; end if;
  if coalesce((cfg ->> 'bono_stock_min')::numeric, 0) > 0 then
    select id into v_canal from canal where organizacion_id = p_org and lista_precios_id = p_lista and tipo = 'web_minorista' order by id limit 1;
    stock := case when v_canal is null then 0 else stock_disponible_canal(p_org, p_variacion, v_canal) end;
    if coalesce(stock, 0) < (cfg ->> 'bono_stock_min')::numeric then return 0; end if;
  end if;
  return round(least(fijo * (cfg ->> 'bono_fijo_pct')::numeric / 100,
                     case when coalesce((cfg ->> 'bono_tope_pct')::numeric, 0) > 0 then p_clasica * (cfg ->> 'bono_tope_pct')::numeric / 100 else fijo end), 0);
end $$;

-- La promo web de una variación para mostrarla (la cucarda): p_lista_ars es el tachado que devolvió
-- precio_de (de ahí se saca la Clásica).
create or replace function public.bono_web(p_org text, p_variacion bigint, p_lista bigint, p_lista_ars numeric)
returns numeric language sql stable as $$
  select coalesce((
    select bono_aplicable(p_org, p_variacion, p_lista, p_lista_ars / (1 + tachado_ml(p_org, p_variacion, (l.precio_vs_ml ->> 'canal_tachado')::bigint) / 100))
      from lista_precios l
     where l.id = p_lista and l.organizacion_id = p_org and coalesce((l.precio_vs_ml ->> 'activo')::boolean, false)
       and coalesce((l.precio_vs_ml ->> 'bono_fijo_pct')::numeric, 0) > 0), 0)
$$;

create or replace function public.precio_de(p_org text, p_variacion bigint, p_lista bigint, p_fecha date default current_date)
returns table (
  precio_id bigint, lista_ars numeric, lista_usd numeric, moneda_origen text, vigente_desde date,
  descuento_pct numeric, venta_ars numeric, venta_usd numeric
) language sql stable as $$
  with l as (select base_lista_id, coalesce(coeficiente, 1) coef, aplica_descuentos, precio_vs_ml from lista_precios where id = p_lista and organizacion_id = p_org),
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
  , vs as (select precio_vs_ml cfg from l where coalesce((precio_vs_ml ->> 'activo')::boolean, false))
  -- Con precio_vs_ml: venta = base × (1 − descuento contra ML) − bonificación web (bono_fijo_pct del cargo
  -- fijo de ML, en los baratos) y lista (tachado) = base × (1 + tachado de ML); el descuento que se informa
  -- es el de la venta contra ese tachado. k = venta ÷ base.
  select c.id, round(x.ars * (1 + t.pct / 100), 2), round(c.importe_usd * (1 + t.pct / 100), 2),
         case when u.si then 'USD' else c.moneda_origen end, c.vigente_desde,
         round(100 * (1 - k.k / (1 + t.pct / 100)), 2),
         round(x.ars * k.k, 2),
         round(c.importe_usd * k.k, 2)
    from c
    cross join lateral (select case when exists (select 1 from vs) then descuento_vs_ml(p_org, p_variacion, (select cfg from vs))
                                    when coalesce((select aplica_descuentos from l), false) then descuento_efectivo(p_org, p_variacion) else 0 end pct) d
    cross join lateral (select case when exists (select 1 from vs) then tachado_ml(p_org, p_variacion, ((select cfg from vs) ->> 'canal_tachado')::bigint) else 0 end pct) t
    left join usd u on true
    cross join lateral (select case when u.si and u.tc is not null then round(c.importe_usd * u.tc, 2) else c.importe_ars end ars) x
    cross join lateral (select case when exists (select 1 from vs) then bono_aplicable(p_org, p_variacion, p_lista, x.ars) else 0 end monto) b
    cross join lateral (select case when b.monto > 0 and x.ars > 0 then greatest(0, (x.ars * (1 - d.pct / 100) - b.monto) / x.ars)
                                    else 1 - d.pct / 100 end k) k
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

-- Datos técnicos para la IA (Fer, 23/10): lo que la IA usa para contestar preguntas técnicas de un
-- producto (slots de memoria libres, si es ampliable, bahía para otro disco…). No se publica en ningún
-- lado; cada producto (también cada kit) tiene los suyos.
alter table producto add column if not exists notas_ia text;

-- Datos de internet (Fer, 25/10): cada dato que la IA de preguntas, mensajes o WhatsApp buscó en internet porque no
-- estaba en la ficha (lib/datos-internet.ts). Lo encontrado pasa solo a los datos técnicos del producto (notas_ia);
-- esto queda como registro (Preguntas y mensajes › Datos de internet) para encontrarlo y corregirlo.
create table if not exists producto_dato_web (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  pregunta         text not null,
  dato             text not null,
  certeza          text not null check (certeza in ('seguro', 'duda', 'contradice')),
  fuentes          text[] not null default '{}',
  origen           text,
  creado_ts        timestamptz not null default now()
);
create index if not exists producto_dato_web_producto on producto_dato_web (producto_id);
alter table producto_dato_web enable row level security;
select erp_politica_org('producto_dato_web');
