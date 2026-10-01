-- Cimiento (orden 136) · 2/6 · Cola de eventos.
--
-- Va antes que el catálogo (y no al final, como sugería la orden) porque los
-- disparadores de precios, productos, stock y pedidos escriben acá.
--
-- Cola simple para que las sesiones que vienen (Mercado Libre, Tienda,
-- Depósito) reaccionen a lo que pasa en el cimiento sin acoplarse. El cimiento
-- sólo emite; nadie consume todavía. Quien consuma marca `procesado_ts` y
-- `procesado_por` (p. ej. 'meli'). Tipos de hoy:
--   stock_bajo_umbral       {variacion_id, canal_id, publicacion_id, disponible, umbral}
--   pedido_estado_cambiado  {pedido_id, canal_id, anterior, nuevo, quien}
--   precio_cambiado         {precio_id, lista_id, variacion_id, importe_ars, importe_usd}
--   producto_cambiado       {producto_id, variacion_id, que}
create table if not exists evento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tipo             text not null check (tipo ~ '^[a-z_]+$'),
  payload          jsonb not null default '{}',
  fecha            timestamptz not null default now(),
  procesado_ts     timestamptz,
  procesado_por    text
);
create index if not exists evento_pendientes on evento (organizacion_id, tipo, id) where procesado_ts is null;
alter table evento enable row level security;
select erp_politica_org('evento');

create or replace function public.emitir_evento(p_org text, p_tipo text, p_payload jsonb)
returns void language sql as $$
  insert into evento (organizacion_id, tipo, payload) values (p_org, p_tipo, p_payload)
$$;
