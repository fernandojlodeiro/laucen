-- Cimiento (orden 136) · 4/6 · Depósitos, ubicaciones y stock.
--
-- Reglas:
-- - Todo depósito tiene una ubicación "default" (código GENERAL), creada sola.
--   Si el depósito no usa ubicaciones es la única; si las usa, es donde queda
--   lo que todavía no se ubicó. Mismo criterio que la variación default: un
--   solo camino.
-- - Disponible = cantidad − reservado. Puede dar negativo (se vendió más de lo
--   que había): no se frena la venta, se ve en el panel.
-- - Toda variación de stock pasa por `mover_stock()`, nunca un UPDATE directo
--   a `stock`. Esa función inserta el movimiento y actualiza `stock` en la
--   misma transacción, resuelve kits y emite `stock_bajo_umbral`.

create table if not exists deposito (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  tipo             text not null default 'propio' check (tipo in ('propio', 'full_ml', 'tercerizado', 'caja_abierta')),
  usa_ubicaciones  boolean not null default false,
  direccion        text,
  estado           text not null default 'activo' check (estado in ('activo', 'archivado')),
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table deposito enable row level security;
select erp_politica_org('deposito');

create table if not exists ubicacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  deposito_id      bigint not null references deposito(id) on delete cascade,
  codigo           text not null,
  descripcion      text,
  orden_recorrido  int not null default 0,
  es_default       boolean not null default false,
  estado           text not null default 'activa' check (estado in ('activa', 'archivada')),
  creado_ts        timestamptz not null default now(),
  unique (deposito_id, codigo)
);
create unique index if not exists ubicacion_un_default on ubicacion (deposito_id) where es_default;
alter table ubicacion enable row level security;
select erp_politica_org('ubicacion');

create or replace function public.deposito_ubicacion_default() returns trigger
language plpgsql as $$
begin
  insert into ubicacion (organizacion_id, deposito_id, codigo, descripcion, orden_recorrido, es_default)
  values (new.organizacion_id, new.id, 'GENERAL', 'Ubicación general del depósito', 0, true);
  return null;
end $$;
create or replace trigger deposito_ubicacion_default after insert on deposito
  for each row execute function deposito_ubicacion_default();

create table if not exists stock (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  ubicacion_id     bigint not null references ubicacion(id) on delete cascade,
  cantidad         int not null default 0,
  reservado        int not null default 0 check (reservado >= 0),
  actualizado_ts   timestamptz not null default now(),
  primary key (variacion_id, ubicacion_id)
);
create index if not exists stock_ubicacion on stock (ubicacion_id);
alter table stock enable row level security;
select erp_politica_org('stock');

-- Qué hace cada tipo (o = ubicación origen, d = destino):
--   ingreso       d.cantidad += n                       (compra, stock inicial)
--   egreso        o.cantidad -= n                       (rotura, consumo)
--   transferencia o.cantidad -= n, d.cantidad += n
--   ajuste        d.cantidad += n  o bien  o.cantidad -= n  (uno solo de los dos)
--   reserva       o.reservado += n
--   liberacion    o.reservado -= n
--   venta         o.cantidad -= n, o.reservado -= n (lo que haya reservado)
--   devolucion    d.cantidad += n
create table if not exists movimiento_stock (
  id                    bigint generated always as identity primary key,
  organizacion_id       text not null references organizaciones(id) on delete cascade,
  variacion_id          bigint not null references variacion(id) on delete cascade,
  ubicacion_origen_id   bigint references ubicacion(id),
  ubicacion_destino_id  bigint references ubicacion(id),
  cantidad              int not null check (cantidad > 0),
  tipo                  text not null check (tipo in
                          ('ingreso', 'egreso', 'transferencia', 'ajuste', 'reserva', 'liberacion', 'venta', 'devolucion')),
  referencia_tipo       text,
  referencia_id         text,
  -- Si el movimiento sale de vender/reservar un kit: la variación del kit.
  kit_variacion_id      bigint references variacion(id),
  usuario_id            text,
  fecha                 timestamptz not null default now(),
  nota                  text
);
create index if not exists movimiento_variacion on movimiento_stock (variacion_id, fecha desc);
create index if not exists movimiento_referencia on movimiento_stock (organizacion_id, referencia_tipo, referencia_id);
alter table movimiento_stock enable row level security;
select erp_politica_org('movimiento_stock');

-- ── Cuánto hay disponible ─────────────────────────────────

/** ¿Es un kit? (tiene componentes) */
create or replace function public.es_kit(p_variacion bigint) returns boolean
language sql stable as $$ select exists (select 1 from kit_componente where variacion_kit_id = p_variacion) $$;

/** Disponible de una variación en un depósito. Kit: min(disponible del
 *  componente / cantidad), nunca menos de 0. */
create or replace function public.stock_disponible_deposito(p_org text, p_variacion bigint, p_deposito bigint, p_nivel int default 0)
returns int language plpgsql stable as $$
declare r int;
begin
  if p_nivel > 5 then return 0; end if;
  if es_kit(p_variacion) then
    select greatest(0, min(floor(stock_disponible_deposito(p_org, k.variacion_componente_id, p_deposito, p_nivel + 1)::numeric / k.cantidad)))::int
      into r from kit_componente k where k.variacion_kit_id = p_variacion and k.organizacion_id = p_org;
    return coalesce(r, 0);
  end if;
  select coalesce(sum(s.cantidad - s.reservado), 0)::int into r
    from stock s join ubicacion u on u.id = s.ubicacion_id
   where s.variacion_id = p_variacion and u.deposito_id = p_deposito and s.organizacion_id = p_org;
  return r;
end $$;

-- stock_disponible_canal() y umbral_pausa_de() están en ventas.sql (usan
-- canal y publicacion, que se crean ahí).

-- ── El único camino para mover stock ─────────────────────

/** Mueve stock: inserta el movimiento y actualiza `stock` en la misma
 *  transacción. Si la variación es un kit, mueve cada componente (cantidad ×
 *  la del kit) y no la del kit. Si el disponible de un canal cae al umbral de
 *  pausa, emite `stock_bajo_umbral`. Devuelve los ids de los movimientos. */
create or replace function public.mover_stock(
  p_org text, p_variacion bigint, p_tipo text, p_cantidad int,
  p_origen bigint default null, p_destino bigint default null,
  p_ref_tipo text default null, p_ref_id text default null,
  p_usuario text default null, p_nota text default null,
  p_kit bigint default null, p_nivel int default 0
) returns setof bigint language plpgsql as $$
declare
  k record;
  afectadas bigint[];
  canales bigint[];
  antes jsonb := '{}';
  v bigint; c bigint; disp int; umbral int; previo int;
  d_cant int := 0; d_res int := 0;
  mov_id bigint;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'la cantidad tiene que ser mayor que cero' using errcode = 'P0001';
  end if;
  if p_nivel > 5 then
    raise exception 'el kit tiene demasiados niveles (¿un kit que se contiene a sí mismo?)' using errcode = 'P0001';
  end if;
  if not exists (select 1 from variacion where id = p_variacion and organizacion_id = p_org) then
    raise exception 'la variación % no existe', p_variacion using errcode = 'P0001';
  end if;
  if p_origen is not null and not exists (select 1 from ubicacion where id = p_origen and organizacion_id = p_org) then
    raise exception 'la ubicación de origen no existe' using errcode = 'P0001';
  end if;
  if p_destino is not null and not exists (select 1 from ubicacion where id = p_destino and organizacion_id = p_org) then
    raise exception 'la ubicación de destino no existe' using errcode = 'P0001';
  end if;

  case p_tipo
    when 'ingreso', 'devolucion' then
      if p_destino is null or p_origen is not null then raise exception 'un % lleva sólo ubicación de destino', p_tipo using errcode = 'P0001'; end if;
    when 'egreso', 'venta', 'reserva', 'liberacion' then
      if p_origen is null or p_destino is not null then raise exception 'un movimiento de % lleva sólo ubicación de origen', p_tipo using errcode = 'P0001'; end if;
    when 'transferencia' then
      if p_origen is null or p_destino is null or p_origen = p_destino then raise exception 'una transferencia lleva origen y destino distintos' using errcode = 'P0001'; end if;
    when 'ajuste' then
      if (p_origen is null) = (p_destino is null) then raise exception 'un ajuste lleva destino (suma) u origen (resta), uno solo' using errcode = 'P0001'; end if;
    else
      raise exception 'tipo de movimiento desconocido: %', p_tipo using errcode = 'P0001';
  end case;

  -- Kit: se mueven los componentes.
  if es_kit(p_variacion) then
    for k in select variacion_componente_id, cantidad from kit_componente where variacion_kit_id = p_variacion loop
      return query select mover_stock(p_org, k.variacion_componente_id, p_tipo, p_cantidad * k.cantidad,
        p_origen, p_destino, p_ref_tipo, p_ref_id, p_usuario, p_nota, coalesce(p_kit, p_variacion), p_nivel + 1);
    end loop;
    return;
  end if;

  -- Lo que puede cruzar el umbral: esta variación y los kits que la usan, en
  -- los canales que venden desde los depósitos tocados.
  afectadas := array[p_variacion] || coalesce((select array_agg(distinct variacion_kit_id) from kit_componente where variacion_componente_id = p_variacion), '{}');
  select coalesce(array_agg(distinct cd.canal_id), '{}') into canales
    from canal_deposito cd join ubicacion u on u.deposito_id = cd.deposito_id
    join canal ca on ca.id = cd.canal_id and ca.estado = 'activo'
   where u.id in (p_origen, p_destino) and cd.organizacion_id = p_org;
  foreach v in array afectadas loop
    foreach c in array canales loop
      antes := antes || jsonb_build_object(v || ':' || c, stock_disponible_canal(p_org, v, c));
    end loop;
  end loop;

  -- Aplicar.
  if p_origen is not null then
    insert into stock (organizacion_id, variacion_id, ubicacion_id) values (p_org, p_variacion, p_origen) on conflict do nothing;
    d_cant := case when p_tipo in ('egreso', 'transferencia', 'ajuste', 'venta') then -p_cantidad else 0 end;
    if p_tipo = 'reserva' then d_res := p_cantidad;
    elsif p_tipo in ('liberacion', 'venta') then d_res := -p_cantidad;
    else d_res := 0; end if;
    update stock set cantidad = cantidad + d_cant, reservado = greatest(reservado + d_res, 0), actualizado_ts = now()
     where variacion_id = p_variacion and ubicacion_id = p_origen;
  end if;
  if p_destino is not null then
    insert into stock (organizacion_id, variacion_id, ubicacion_id, cantidad) values (p_org, p_variacion, p_destino, p_cantidad)
    on conflict (variacion_id, ubicacion_id) do update set cantidad = stock.cantidad + excluded.cantidad, actualizado_ts = now();
  end if;

  insert into movimiento_stock (organizacion_id, variacion_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, tipo,
                                referencia_tipo, referencia_id, kit_variacion_id, usuario_id, nota)
  values (p_org, p_variacion, p_origen, p_destino, p_cantidad, p_tipo, p_ref_tipo, p_ref_id, p_kit, p_usuario, p_nota)
  returning id into mov_id;

  -- ¿Alguno cayó al umbral? Sólo avisa al cruzarlo (estaba arriba y quedó en
  -- el umbral o abajo), no en cada movimiento mientras siga abajo.
  foreach v in array afectadas loop
    foreach c in array canales loop
      previo := (antes ->> (v || ':' || c))::int;
      disp := stock_disponible_canal(p_org, v, c);
      umbral := umbral_pausa_de(p_org, v, c);
      if previo > umbral and disp <= umbral then
        perform emitir_evento(p_org, 'stock_bajo_umbral', jsonb_build_object(
          'variacion_id', v, 'canal_id', c, 'disponible', disp, 'umbral', umbral,
          'publicacion_id', (select id from publicacion where variacion_id = v and canal_id = c and estado <> 'cerrada' order by id limit 1),
          'movimiento_id', mov_id));
      end if;
    end loop;
  end loop;

  return next mov_id;
end $$;
