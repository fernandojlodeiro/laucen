-- Mercadería entrante y preventa (pedido de Fer, 5/11; bitácora #1106). Va al final del esquema
-- porque usa las órdenes de compra (compras.sql), la recepción (deposito.sql) y los pedidos (ventas.sql).

-- La recepción de una orden de compra al exterior: se reciben sus cajas (lib/deposito/recepcion.ts).
alter table recepcion add column if not exists orden_compra_id bigint references orden_compra(id) on delete set null;
create index if not exists recepcion_orden on recepcion (orden_compra_id) where orden_compra_id is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orden_compra_caja_ubicacion_fk') then
    alter table orden_compra_caja add constraint orden_compra_caja_ubicacion_fk foreign key (ubicacion_id) references ubicacion(id) on delete set null;
  end if;
end $$;

-- Lo que una orden en camino todavía tiene que traer de cada variación: lo pedido en sus renglones
-- menos lo que ya entró por sus recepciones (nunca negativo).
create or replace view orden_compra_pendiente as
  with pedido as (
    select o.organizacion_id, o.id orden_id, l.variacion_id, sum(l.cantidad)::int cantidad
      from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id
     where o.estado = 'en_camino' and l.variacion_id is not null
     group by 1, 2, 3),
  recibido as (
    select r.orden_compra_id orden_id, rl.variacion_id, sum(rl.cantidad)::int cantidad
      from recepcion r join recepcion_linea rl on rl.recepcion_id = r.id
     where r.orden_compra_id is not null
     group by 1, 2)
  select p.organizacion_id, p.orden_id, p.variacion_id, p.cantidad pedido, coalesce(r.cantidad, 0) recibido,
         greatest(0, p.cantidad - coalesce(r.cantidad, 0)) pendiente
    from pedido p left join recibido r on r.orden_id = p.orden_id and r.variacion_id = p.variacion_id;

-- ── Preventa ─────────────────────────────────────────────
-- Un pedido en preventa sale entero de UNA orden de compra (nunca mezcla físico con entrante ni dos
-- órdenes: regla de Fer). preventa_orden_id = de qué orden; preventa_llegada = la fecha que se le
-- prometió (la de la web o la de ML, según el canal); preventa_cubierto_ts = cuando llegó la orden y
-- se le reservó el stock físico (desde ahí es un pedido común).
alter table pedido add column if not exists preventa_orden_id bigint references orden_compra(id) on delete set null;
alter table pedido add column if not exists preventa_llegada date;
alter table pedido add column if not exists preventa_cubierto_ts timestamptz;
-- Seña: lo que se pidió de seña (en pesos) y hasta cuándo tiene para pagar el saldo una vez que llegó.
alter table pedido add column if not exists preventa_sena_ars numeric(16, 2);
alter table pedido add column if not exists preventa_saldo_hasta date;
create index if not exists pedido_preventa on pedido (preventa_orden_id) where preventa_orden_id is not null;

-- La reserva de entrante (lo contrario de la reservada: lo que va a entrar y ya está vendido): una fila
-- por pedido y variación (un kit, por sus componentes). orden_id null = «en espera sin orden» (la
-- próxima orden de ese SKU la cubre primero, por orden de compra).
--   activa   → descuenta del cupo de su orden
--   cubierta → llegó la orden y pasó a ser una reserva física del pedido
--   liberada → se canceló o se resolvió de otra forma
create table if not exists preventa_reserva (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  orden_id         bigint references orden_compra(id) on delete set null,
  pedido_id        bigint not null references pedido(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  cantidad         int not null check (cantidad > 0),
  estado           text not null default 'activa' check (estado in ('activa', 'cubierta', 'liberada')),
  creado_ts        timestamptz not null default now(),
  cerrado_ts       timestamptz,
  nota             text
);
create index if not exists preventa_reserva_orden on preventa_reserva (orden_id, variacion_id) where estado = 'activa';
create index if not exists preventa_reserva_pedido on preventa_reserva (pedido_id);
create index if not exists preventa_reserva_espera on preventa_reserva (organizacion_id, variacion_id) where estado = 'activa' and orden_id is null;
alter table preventa_reserva enable row level security;
select erp_politica_org('preventa_reserva');

-- La mercadería entrante de cada variación, con sus tres datos (Fer, 5/11): llegando (lo que las
-- órdenes en camino todavía tienen que traer), prevendido (lo vendido en preventa contra esas
-- órdenes) y saldo (llegando − prevendido). Y la próxima llegada con su orden.
create or replace view entrante_variacion as
  with pend as (
    select organizacion_id, variacion_id, orden_id, pendiente from orden_compra_pendiente where pendiente > 0),
  pre as (
    select r.orden_id, r.variacion_id, sum(r.cantidad)::int cantidad
      from preventa_reserva r join orden_compra o on o.id = r.orden_id and o.estado = 'en_camino'
     where r.estado = 'activa' group by 1, 2)
  select p.organizacion_id, p.variacion_id,
         sum(p.pendiente)::int llegando,
         coalesce(sum(pre.cantidad), 0)::int prevendido,
         (sum(p.pendiente) - coalesce(sum(pre.cantidad), 0))::int saldo,
         min(o.llegada) proxima_llegada,
         (array_agg(o.codigo order by o.llegada nulls last, o.id))[1] proxima_orden,
         (array_agg(o.id order by o.llegada nulls last, o.id))[1] proxima_orden_id,
         count(*)::int ordenes
    from pend p join orden_compra o on o.id = p.orden_id
    left join pre on pre.orden_id = p.orden_id and pre.variacion_id = p.variacion_id
   group by 1, 2;

-- Por producto (Fer, 5/11): si admite preventa en la web y en Mercado Libre (null = lo general de la organización),
-- y su margen de seguridad y su descuento de preventa (null = el de la orden, si no el general).
alter table producto add column if not exists preventa_web boolean;
alter table producto add column if not exists preventa_ml boolean;
alter table producto add column if not exists preventa_margen_unidades int check (preventa_margen_unidades >= 0);
alter table producto add column if not exists preventa_margen_pct numeric(6, 2) check (preventa_margen_pct between 0 and 100);
alter table producto add column if not exists preventa_margen_modo text check (preventa_margen_modo in ('menor', 'mayor'));
alter table producto add column if not exists preventa_descuento_pct numeric(6, 2) check (preventa_descuento_pct between 0 and 90);

-- Mercado Libre: la publicación que Laucen pasó a preventa (entrega diferida, «disponible N días después de la
-- compra»): de qué orden y con cuántos días se mandó. Null = publicación normal.
alter table publicacion add column if not exists preventa_orden_id bigint references orden_compra(id) on delete set null;
alter table publicacion add column if not exists preventa_dias int;
