-- Compras · Proveedores (2/10). Tabla aparte de clientes: en Virtual Seller
-- clientes y proveedores comparten tabla (campo Tipo); acá se separan porque
-- un proveedor lleva cosas que un cliente no (condiciones de pago, moneda
-- habitual, y después sus compras e importaciones). Un mismo CUIT puede ser
-- cliente y proveedor a la vez: son dos filas, una en cada tabla.
-- El resto de Compras (facturas de compra, despachos) lo hace su sesión.

create table if not exists proveedor (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  razon_social     text,
  cuit             text,
  condicion_iva    text check (condicion_iva in ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_responsable')),
  pais             text not null default 'AR',
  email            text,
  telefono         text,
  telefono_movil   text,
  contacto         text,
  calle            text,
  localidad        text,
  provincia        text,
  codigo_postal    text,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  condiciones_pago text,
  notas            text,
  estado           text not null default 'activo' check (estado in ('activo', 'archivado')),
  -- El dato crudo de cada origen ({"virtual_seller": {...}}): nada se pierde.
  datos_externos   jsonb not null default '{}',
  creado_ts        timestamptz not null default now()
);
create index if not exists proveedor_cuit on proveedor (organizacion_id, cuit) where cuit is not null;
alter table proveedor enable row level security;
select erp_politica_org('proveedor');
