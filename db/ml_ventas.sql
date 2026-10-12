-- Ventas de Mercado Libre (pedido de Fer, 12/10; lib/mercadolibre/ventas.ts).
-- TODAS las ventas de ML, viejas y nuevas: un renglón por artículo vendido
-- (orden + publicación + variación de ML). Es para estadística y consulta:
-- nada que mueva stock, facture, imprima, conteste o avise lee esta tabla.
--   · Las nuevas (desde el corte de pedidos de cada cuenta) tienen además su
--     pedido en `pedido`, y acá quedan enganchadas (pedido_id).
--   · Las viejas (los 12 meses que deja leer ML) entran por una carga única y
--     quedan SIN pedido: nunca generan un pedido ni nada.
-- Las estadísticas leen la vista venta_estadistica: ML desde esta tabla y el
-- resto de los canales desde `pedido` (así nada se cuenta dos veces).

create table if not exists ml_venta (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  canal_id          bigint not null references canal(id) on delete cascade,
  order_id          bigint not null,
  pack_id           bigint,
  item_id           text not null,
  variation_id      text not null default '',
  variacion_id      bigint references variacion(id) on delete set null,
  sku               text,
  titulo            text,
  cantidad          int not null,
  precio_unit       numeric(16, 2) not null,
  moneda            text not null default 'ARS',
  comision          numeric(16, 2),                 -- cargo por venta de ML (sale_fee × cantidad)
  tipo_publicacion  text,                           -- gold_special (Clásica), gold_pro (Premium)…
  estado            text not null,                  -- paid, cancelled… (el de la orden)
  fecha             timestamptz not null,           -- cuándo se compró
  fecha_cierre      timestamptz,
  comprador_id      bigint,
  comprador         text,                           -- apodo
  envio_id          bigint,
  costo_envio       numeric(16, 2),                 -- lo que pagó el vendedor por el envío (se completa de a poco)
  tags              text[],
  reclamo           boolean not null default false, -- tuvo mediación / reclamo
  pedido_id         bigint references pedido(id) on delete set null,
  leido_ts          timestamptz not null default now(),
  unique (canal_id, order_id, item_id, variation_id)
);
create index if not exists ml_venta_fecha on ml_venta (organizacion_id, fecha);
create index if not exists ml_venta_variacion on ml_venta (variacion_id, fecha);
create index if not exists ml_venta_comprador on ml_venta (comprador_id);
create index if not exists ml_venta_pack on ml_venta (pack_id);
create index if not exists ml_venta_pedido on ml_venta (pedido_id);
alter table ml_venta enable row level security;
select erp_politica_org('ml_venta');

-- La carga de los 12 meses, por cuenta: hasta dónde llegó (de lo más viejo a lo más nuevo).
create table if not exists ml_venta_carga (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  desde            timestamptz not null,           -- lo que falta leer arranca acá
  hasta            timestamptz not null,           -- hasta dónde se lee (el momento en que se pidió la carga)
  leidas           int not null default 0,
  terminada_ts     timestamptz,
  error            text,
  actualizado_ts   timestamptz not null default now(),
  primary key (organizacion_id, canal_id)
);
alter table ml_venta_carga enable row level security;
select erp_politica_org('ml_venta_carga');

-- Historial de ventas de Virtual Seller (pedido de Fer, 12/10; lib/importar/ventas-vs.ts). Lo que se vendió
-- en todos los canales desde 2016, importado del informe "Ventas por producto" de VS. Igual que las ventas
-- viejas de ML: sólo estadística y consulta, NUNCA un pedido, ni stock, ni clientes nuevos.
-- Un renglón por producto vendido. `clave` lo identifica para que volver a subir no duplique:
-- pedido de VS | SKU | venta de ML | n.º de repetición de esos tres dentro del pedido.
create table if not exists venta_historica (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  clave             text not null,
  pedido_vs         text not null,                  -- PED-149945
  canal_nombre      text not null,                  -- el canal como lo llama VS ("Mercadolibre (Baires)")
  ml_order_id       bigint,                         -- n.º de venta de ML, si fue por ML
  fecha             timestamptz not null,           -- VS da sólo el día: mediodía argentino
  variacion_id      bigint references variacion(id) on delete set null,
  sku               text not null,
  titulo            text,
  cantidad          int not null,
  precio_unit       numeric(16, 2),
  descuento         numeric(16, 2),
  total             numeric(16, 2) not null,        -- lo cobrado (subtotal de VS)
  cliente_nombre    text,
  documento         text,
  cuit              text,
  cliente_id        bigint references cliente(id) on delete set null,  -- sólo si ya existía (por CUIT o documento)
  importacion_id    bigint references importacion(id) on delete set null,
  creado_ts         timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index if not exists venta_historica_fecha on venta_historica (organizacion_id, fecha);
create index if not exists venta_historica_ml on venta_historica (ml_order_id) where ml_order_id is not null;
create index if not exists venta_historica_variacion on venta_historica (variacion_id, fecha);
create index if not exists venta_historica_cliente on venta_historica (cliente_id) where cliente_id is not null;
alter table venta_historica enable row level security;
select erp_politica_org('venta_historica');

-- A qué canal del sistema corresponde cada nombre de canal de VS. Sin canal = "canal histórico" (una cuenta
-- de ML que ya no está, por ejemplo): se muestra con el nombre de VS. Se llena solo al importar (mismo nombre,
-- o la cuenta de ML de sus ventas ya leídas) y se cambia en la pantalla de la importación.
create table if not exists venta_vs_canal (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre_vs        text not null,
  canal_id         bigint references canal(id) on delete set null,
  elegido_a_mano   boolean not null default false,
  primary key (organizacion_id, nombre_vs)
);
alter table venta_vs_canal enable row level security;
select erp_politica_org('venta_vs_canal');

create index if not exists ml_venta_orden on ml_venta (order_id);
-- El primer pedido de cada canal (corte del historial de VS en la vista).
create index if not exists pedido_canal_fecha on pedido (canal_id, fecha);

-- ¿Es una notebook? Por el nombre del producto (sirve también para lo vendido hace años, que no está en el catálogo):
-- empieza con notebook/netbook/laptop…, o nombra un procesador y una capacidad (los modelos que se publicaban como
-- "HP Core i5… 256GB SSD"), sin ser un accesorio, una tablet o una PC. Lo usa el ranking de clientes.
create or replace function es_notebook(t text) returns boolean language sql immutable as $$
  select coalesce(t ~* '^\W*(notebook|netbook|ultrabook|laptop|chromebook|macbook\s+(air|pro)\M)'
    or (t ~* '(core|ryzen|celeron|pentium|athlon|a\d+-\d{4})' and t ~* '\d+\s*(gb|tb)'
        and not t ~* '^\W*(tablet|celular|smartphone|bater|cargador|cable|all in one|aio|pc\M|kit|memoria|disco|placa|mother|procesador|monitor|cpu|mini pc|gabinete|raspberry)'), false)
$$;

-- Todas las ventas de todos los canales, para estadística: ML desde ml_venta (con o sin pedido) y los demás
-- canales desde pedido (sin presupuestos ni cancelados). Una fila por artículo vendido.
create or replace view venta_estadistica with (security_invoker = true) as
  select v.organizacion_id, v.canal_id, 'ml'::text origen, v.fecha, v.variacion_id, v.sku, v.titulo, v.cantidad,
         v.precio_unit, v.precio_unit * v.cantidad total, v.comision, v.costo_envio, v.estado,
         v.pedido_id, v.order_id, v.comprador_id ml_comprador_id, null::bigint cliente_id, v.id ml_venta_id,
         null::text canal_nombre, null::text pedido_vs, null::bigint venta_historica_id
    from ml_venta v
  union all
  select p.organizacion_id, p.canal_id, c.tipo, p.fecha, l.variacion_id, l.sku, l.titulo, l.cantidad,
         l.precio_unit_ars, l.precio_unit_ars * l.cantidad, null, null, p.estado,
         p.id, null, null, p.cliente_id, null, null, null, null
    from pedido p join pedido_linea l on l.pedido_id = p.id join canal c on c.id = p.canal_id
   where c.tipo <> 'mercadolibre' and p.estado not in ('presupuesto', 'cancelado')
  union all
  -- Virtual Seller: lo que el sistema no tiene por otro lado. Una venta de ML ya leída (por su número) no
  -- se repite; sin número de ML, cuenta sólo lo anterior al primer pedido del sistema en ese canal.
  select h.organizacion_id, m.canal_id, 'vs', h.fecha, h.variacion_id, h.sku, h.titulo, h.cantidad,
         h.precio_unit, h.total, null, null, 'entregado',
         null, h.ml_order_id, null, h.cliente_id, null, h.canal_nombre, h.pedido_vs, h.id
    from venta_historica h
    left join venta_vs_canal m on m.organizacion_id = h.organizacion_id and m.nombre_vs = h.canal_nombre
   where (h.ml_order_id is null or not exists (select 1 from ml_venta x where x.order_id = h.ml_order_id and x.organizacion_id = h.organizacion_id))
     and (h.ml_order_id is not null or m.canal_id is null
          or h.fecha < coalesce((select min(p.fecha) from pedido p where p.canal_id = m.canal_id), 'infinity'));
