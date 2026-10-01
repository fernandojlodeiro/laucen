-- Cimiento (orden 136) · 5/6 · Canales, publicaciones, clientes y pedidos.

-- ── Canales ───────────────────────────────────────────────
-- `config` guarda credenciales e ids que carga la sesión de cada canal, y el
-- token de la API de este backend: config->>'token' (ver app/api/pedidos).
create table if not exists canal (
  id                    bigint generated always as identity primary key,
  organizacion_id       text not null references organizaciones(id) on delete cascade,
  nombre                text not null,
  tipo                  text not null check (tipo in ('mercadolibre', 'web_minorista', 'web_mayorista', 'local', 'historico', 'otro')),
  lista_precios_id      bigint references lista_precios(id) on delete set null,
  estado                text not null default 'activo' check (estado in ('activo', 'pausado', 'archivado')),
  config                jsonb not null default '{}',
  umbral_pausa_default  int check (umbral_pausa_default >= 0),
  creado_ts             timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
create unique index if not exists canal_token on canal ((config ->> 'token')) where config ? 'token';
alter table canal enable row level security;
select erp_politica_org('canal');

-- Desde qué depósitos vende cada canal (ej. una cuenta de ML que vende desde
-- el depósito propio y desde Full). Prioridad: menor = primero.
create table if not exists canal_deposito (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  deposito_id      bigint not null references deposito(id) on delete cascade,
  prioridad        int not null default 0,
  primary key (canal_id, deposito_id)
);
alter table canal_deposito enable row level security;
select erp_politica_org('canal_deposito');

-- ── Publicaciones (capa canal) ────────────────────────────
-- Esta sesión crea la tabla y el ABM mínimo; sincronizar con Mercado Libre lo
-- hace la sesión 2. `umbral_pausa` NULL = usa el del producto → canal →
-- organización → 1 (ver umbral_pausa_de()).
create table if not exists publicacion (
  id                        bigint generated always as identity primary key,
  organizacion_id           text not null references organizaciones(id) on delete cascade,
  variacion_id              bigint not null references variacion(id) on delete cascade,
  canal_id                  bigint not null references canal(id) on delete cascade,
  id_externo                text,
  titulo                    text,
  categoria_externa         text,
  tipo_publicacion          text,
  atributos_externos        jsonb not null default '{}',
  estado                    text not null default 'activa' check (estado in ('activa', 'pausada', 'cerrada')),
  ultima_sincronizacion_ts  timestamptz,
  umbral_pausa              int check (umbral_pausa >= 0),
  creado_ts                 timestamptz not null default now()
);
create unique index if not exists publicacion_externa on publicacion (canal_id, id_externo) where id_externo is not null;
create index if not exists publicacion_variacion on publicacion (variacion_id, canal_id);
alter table publicacion enable row level security;
select erp_politica_org('publicacion');

/** Disponible para un canal = suma de lo disponible en sus depósitos. */
create or replace function public.stock_disponible_canal(p_org text, p_variacion bigint, p_canal bigint)
returns int language sql stable as $$
  select coalesce(sum(stock_disponible_deposito(p_org, p_variacion, cd.deposito_id)), 0)::int
    from canal_deposito cd join deposito d on d.id = cd.deposito_id and d.estado = 'activo'
   where cd.canal_id = p_canal and cd.organizacion_id = p_org
$$;

/** Umbral de pausa de una variación en un canal: el de su publicación → el del
 *  producto → el del canal → el de la organización → 1. */
create or replace function public.umbral_pausa_de(p_org text, p_variacion bigint, p_canal bigint)
returns int language sql stable as $$
  select coalesce(
    (select umbral_pausa from publicacion
      where variacion_id = p_variacion and canal_id = p_canal and estado <> 'cerrada' and umbral_pausa is not null
      order by id limit 1),
    (select p.umbral_pausa from variacion v join producto p on p.id = v.producto_id where v.id = p_variacion),
    (select umbral_pausa_default from canal where id = p_canal),
    (config_de(p_org, 'umbral_pausa', '1'))::int,
    1)
$$;

-- ── Clientes ──────────────────────────────────────────────
-- Nadie los carga a mano en operación normal: los crean los pedidos. El ABM
-- existe para corregir datos (sobre todo fiscales).
create table if not exists cliente (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  nombre            text not null,
  tipo              text not null default 'consumidor_final' check (tipo in ('consumidor_final', 'mayorista')),
  email             text,
  telefono          text,
  documento_tipo    text check (documento_tipo in ('DNI', 'CUIT', 'CUIL', 'PASAPORTE', 'OTRO')),
  documento_numero  text,
  condicion_iva     text check (condicion_iva in ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_responsable')),
  lista_precios_id  bigint references lista_precios(id) on delete set null,
  usuario_id        text references usuarios(id) on delete set null,
  notas             text,
  creado_ts         timestamptz not null default now()
);
create index if not exists cliente_documento on cliente (organizacion_id, documento_numero) where documento_numero is not null;
create index if not exists cliente_email on cliente (organizacion_id, lower(email)) where email is not null;
alter table cliente enable row level security;
select erp_politica_org('cliente');

create table if not exists cliente_direccion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cliente_id       bigint not null references cliente(id) on delete cascade,
  etiqueta         text,
  calle            text,
  numero           text,
  piso_depto       text,
  localidad        text,
  provincia        text,
  codigo_postal    text,
  pais             text not null default 'AR',
  principal        boolean not null default false,
  creado_ts        timestamptz not null default now()
);
create index if not exists cliente_direccion_cliente on cliente_direccion (cliente_id);
alter table cliente_direccion enable row level security;
select erp_politica_org('cliente_direccion');

-- El id del cliente en cada canal (ej. el comprador de ML): enlaza al mismo
-- cliente que compra en dos cuentas de Mercado Libre.
create table if not exists cliente_identidad (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cliente_id       bigint not null references cliente(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  id_externo       text not null,
  unique (canal_id, id_externo)
);
create index if not exists cliente_identidad_cliente on cliente_identidad (cliente_id);
alter table cliente_identidad enable row level security;
select erp_politica_org('cliente_identidad');

-- ── Pedidos ───────────────────────────────────────────────
-- Estados: nuevo → pagado → en_preparacion → preparado → despachado →
-- entregado, más cancelado y devuelto desde cualquiera. Se cambia SÓLO con
-- cambiar_estado() (lib/pedidos/ la envuelve).
create table if not exists pedido (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id),
  cliente_id       bigint references cliente(id) on delete set null,
  id_externo       text,
  fecha            timestamptz not null default now(),
  estado           text not null default 'nuevo' check (estado in
                     ('nuevo', 'pagado', 'en_preparacion', 'preparado', 'despachado', 'entregado', 'cancelado', 'devuelto')),
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  total_ars        numeric(16, 2) not null default 0,
  total_usd        numeric(16, 2) not null default 0,
  medio_pago       text,
  estado_pago      text not null default 'pendiente' check (estado_pago in ('pendiente', 'pagado', 'a_convenir', 'reembolsado')),
  deposito_id      bigint references deposito(id),
  envio            jsonb not null default '{}',
  notas            text,
  -- false en las ventas históricas importadas: no reservan ni descuentan stock.
  afecta_stock     boolean not null default true,
  creado_ts        timestamptz not null default now()
);
create unique index if not exists pedido_externo on pedido (canal_id, id_externo) where id_externo is not null;
create index if not exists pedido_org_estado on pedido (organizacion_id, estado, fecha desc);
create index if not exists pedido_cliente on pedido (cliente_id);
alter table pedido enable row level security;
select erp_politica_org('pedido');

create table if not exists pedido_linea (
  id                 bigint generated always as identity primary key,
  organizacion_id    text not null references organizaciones(id) on delete cascade,
  pedido_id          bigint not null references pedido(id) on delete cascade,
  variacion_id       bigint references variacion(id) on delete set null,
  cantidad           int not null check (cantidad > 0),
  precio_lista_ars   numeric(16, 2),
  precio_lista_usd   numeric(16, 2),
  descuento_pct      numeric(5, 2) not null default 0,
  precio_unit_ars    numeric(16, 2) not null,
  precio_unit_usd    numeric(16, 2) not null,
  -- Título tal como se vendió (congelado: no cambia si después cambia el producto).
  titulo             text not null,
  sku                text,
  orden              int not null default 0
);
create index if not exists pedido_linea_pedido on pedido_linea (pedido_id, orden);
create index if not exists pedido_linea_variacion on pedido_linea (variacion_id);
alter table pedido_linea enable row level security;
select erp_politica_org('pedido_linea');

create table if not exists pedido_estado_historial (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  pedido_id        bigint not null references pedido(id) on delete cascade,
  estado_anterior  text,
  estado_nuevo     text not null,
  -- El id del usuario que lo cambió, o 'sistema'.
  quien            text not null,
  nota             text,
  fecha            timestamptz not null default now()
);
create index if not exists pedido_historial_pedido on pedido_estado_historial (pedido_id, fecha);
alter table pedido_estado_historial enable row level security;
select erp_politica_org('pedido_estado_historial');

-- ── Efectos de stock de los pedidos ───────────────────────

/** Reserva n unidades de una variación en un depósito: primero en las
 *  ubicaciones con disponible (por orden de recorrido) y lo que falte en la
 *  ubicación general (queda disponible negativo: se vendió sin stock). Un kit
 *  se reserva componente por componente. */
create or replace function public.reservar_en_deposito(
  p_org text, p_variacion bigint, p_deposito bigint, p_cantidad int,
  p_ref_tipo text, p_ref_id text, p_usuario text, p_kit bigint default null, p_nivel int default 0
) returns void language plpgsql as $$
declare k record; u record; resta int := p_cantidad; toma int; general bigint;
begin
  if p_nivel > 5 then raise exception 'el kit tiene demasiados niveles' using errcode = 'P0001'; end if;
  if es_kit(p_variacion) then
    for k in select variacion_componente_id, cantidad from kit_componente where variacion_kit_id = p_variacion loop
      perform reservar_en_deposito(p_org, k.variacion_componente_id, p_deposito, p_cantidad * k.cantidad,
        p_ref_tipo, p_ref_id, p_usuario, coalesce(p_kit, p_variacion), p_nivel + 1);
    end loop;
    return;
  end if;
  for u in
    select ub.id, s.cantidad - s.reservado disp
      from ubicacion ub join stock s on s.ubicacion_id = ub.id and s.variacion_id = p_variacion
     where ub.deposito_id = p_deposito and ub.estado = 'activa' and s.cantidad - s.reservado > 0
     order by ub.orden_recorrido, ub.codigo
  loop
    exit when resta <= 0;
    toma := least(resta, u.disp);
    perform mover_stock(p_org, p_variacion, 'reserva', toma, u.id, null, p_ref_tipo, p_ref_id, p_usuario, null, p_kit);
    resta := resta - toma;
  end loop;
  if resta > 0 then
    select id into general from ubicacion where deposito_id = p_deposito and es_default;
    perform mover_stock(p_org, p_variacion, 'reserva', resta, general, null, p_ref_tipo, p_ref_id, p_usuario, 'sin stock suficiente', p_kit);
  end if;
end $$;

/** Lo que sigue reservado para una referencia (ej. un pedido), por variación y ubicación. */
create or replace function public.reservado_de(p_org text, p_ref_tipo text, p_ref_id text)
returns table (variacion_id bigint, ubicacion_id bigint, kit_variacion_id bigint, cantidad int)
language sql stable as $$
  select m.variacion_id, m.ubicacion_origen_id, m.kit_variacion_id,
         sum(case m.tipo when 'reserva' then m.cantidad else -m.cantidad end)::int
    from movimiento_stock m
   where m.organizacion_id = p_org and m.referencia_tipo = p_ref_tipo and m.referencia_id = p_ref_id
     and m.tipo in ('reserva', 'liberacion', 'venta')
   group by 1, 2, 3
  having sum(case m.tipo when 'reserva' then m.cantidad else -m.cantidad end) > 0
$$;

create or replace function public.estado_pedido_orden(p_estado text) returns int
language sql immutable as $$
  select case p_estado when 'nuevo' then 1 when 'pagado' then 2 when 'en_preparacion' then 3
    when 'preparado' then 4 when 'despachado' then 5 when 'entregado' then 6 else null end
$$;

/** El único camino para cambiar el estado de un pedido. Valida la transición
 *  (sólo para adelante; cancelado y devuelto desde cualquiera que no esté
 *  cerrado), escribe el historial, emite `pedido_estado_cambiado` y dispara
 *  los efectos de stock:
 *    al pasar a pagado (o saltearlo)  → reserva en el depósito asignado
 *    al llegar a despachado           → la reserva se convierte en venta
 *    cancelado / devuelto             → libera lo que siga reservado
 *  `p_quien`: id del usuario o 'sistema'. Devuelve el estado anterior (igual
 *  al nuevo si ya estaba ahí: repetir no hace nada). */
create or replace function public.cambiar_estado(p_org text, p_pedido bigint, p_nuevo text, p_quien text, p_nota text default null)
returns text language plpgsql as $$
declare
  p pedido%rowtype;
  o_actual int; o_nuevo int;
  l record; r record;
  dep bigint;
  ref text := p_pedido::text;
begin
  select * into p from pedido where id = p_pedido and organizacion_id = p_org for update;
  if not found then raise exception 'el pedido % no existe', p_pedido using errcode = 'P0001'; end if;
  if p_nuevo not in ('nuevo', 'pagado', 'en_preparacion', 'preparado', 'despachado', 'entregado', 'cancelado', 'devuelto') then
    raise exception 'estado desconocido: %', p_nuevo using errcode = 'P0001';
  end if;
  if p.estado = p_nuevo then return p.estado; end if;
  if p.estado in ('cancelado', 'devuelto') then
    raise exception 'el pedido está %; no cambia más de estado', p.estado using errcode = 'P0001', hint = 'transicion_invalida';
  end if;
  o_actual := estado_pedido_orden(p.estado);
  o_nuevo := estado_pedido_orden(p_nuevo);
  if o_nuevo is not null and o_nuevo < o_actual then
    raise exception 'un pedido % no puede volver a %', p.estado, p_nuevo using errcode = 'P0001', hint = 'transicion_invalida';
  end if;

  if p.afecta_stock then
    -- Reservar al pasar por pagado.
    if o_actual < 2 and o_nuevo is not null and o_nuevo >= 2 then
      dep := coalesce(p.deposito_id,
        (select cd.deposito_id from canal_deposito cd join deposito d on d.id = cd.deposito_id and d.estado = 'activo'
          where cd.canal_id = p.canal_id order by cd.prioridad, cd.deposito_id limit 1),
        (select id from deposito where organizacion_id = p_org and estado = 'activo' order by (tipo = 'propio') desc, id limit 1));
      if dep is null then
        raise exception 'no hay ningún depósito donde reservar el stock' using errcode = 'P0001', hint = 'sin_deposito';
      end if;
      if p.deposito_id is null then update pedido set deposito_id = dep where id = p.id; end if;
      for l in select variacion_id, cantidad from pedido_linea where pedido_id = p.id and variacion_id is not null loop
        perform reservar_en_deposito(p_org, l.variacion_id, dep, l.cantidad, 'pedido', ref, p_quien);
      end loop;
    end if;
    -- Vender al llegar a despachado.
    if o_actual < 5 and o_nuevo is not null and o_nuevo >= 5 then
      for r in select * from reservado_de(p_org, 'pedido', ref) loop
        perform mover_stock(p_org, r.variacion_id, 'venta', r.cantidad, r.ubicacion_id, null, 'pedido', ref, p_quien, null, r.kit_variacion_id);
      end loop;
    end if;
    -- Liberar al cancelar o devolver.
    if p_nuevo in ('cancelado', 'devuelto') then
      for r in select * from reservado_de(p_org, 'pedido', ref) loop
        perform mover_stock(p_org, r.variacion_id, 'liberacion', r.cantidad, r.ubicacion_id, null, 'pedido', ref, p_quien, null, r.kit_variacion_id);
      end loop;
    end if;
  end if;

  update pedido set estado = p_nuevo where id = p.id;
  insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
  values (p_org, p.id, p.estado, p_nuevo, p_quien, p_nota);
  perform emitir_evento(p_org, 'pedido_estado_cambiado', jsonb_build_object(
    'pedido_id', p.id, 'canal_id', p.canal_id, 'anterior', p.estado, 'nuevo', p_nuevo, 'quien', p_quien));
  return p.estado;
end $$;
