-- Configuraciones de las listas de los ABM (pedido de Fer, 3/10), por
-- organización y pantalla:
--   tipo 'excel': qué columnas (y en qué orden) baja "Descargar Excel".
--   tipo 'vista': qué columnas (y en qué orden) se ven en la pantalla.
-- `columnas` es la lista de claves del catálogo de campos de esa pantalla
-- (app/listas/registro.ts); una clave que ya no existe se ignora.
create table if not exists lista_config (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  pantalla         text not null check (pantalla ~ '^[a-z_]+$'),
  tipo             text not null check (tipo in ('excel', 'vista')),
  nombre           text not null check (length(trim(nombre)) > 0),
  columnas         jsonb not null default '[]' check (jsonb_typeof(columnas) = 'array'),
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, pantalla, tipo, nombre)
);
alter table lista_config enable row level security;
select erp_politica_org('lista_config');
