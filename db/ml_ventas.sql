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

-- Todas las ventas de todos los canales, para estadística: ML desde ml_venta (con o sin pedido) y los demás
-- canales desde pedido (sin presupuestos ni cancelados). Una fila por artículo vendido.
create or replace view venta_estadistica with (security_invoker = true) as
  select v.organizacion_id, v.canal_id, 'ml'::text origen, v.fecha, v.variacion_id, v.sku, v.titulo, v.cantidad,
         v.precio_unit, v.precio_unit * v.cantidad total, v.comision, v.costo_envio, v.estado,
         v.pedido_id, v.order_id, v.comprador_id ml_comprador_id, null::bigint cliente_id, v.id ml_venta_id
    from ml_venta v
  union all
  select p.organizacion_id, p.canal_id, c.tipo, p.fecha, l.variacion_id, l.sku, l.titulo, l.cantidad,
         l.precio_unit_ars, l.precio_unit_ars * l.cantidad, null, null, p.estado,
         p.id, null, null, p.cliente_id, null
    from pedido p join pedido_linea l on l.pedido_id = p.id join canal c on c.id = p.canal_id
   where c.tipo <> 'mercadolibre' and p.estado not in ('presupuesto', 'cancelado');
