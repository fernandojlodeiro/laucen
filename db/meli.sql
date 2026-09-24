-- Conexión con Mercado Libre: la llave (access/refresh token) que da la
-- aplicación de ML de la organización cuando un usuario de ML la autoriza.
-- Una fila por organización. RLS prendido, sin políticas: sólo entra Drizzle.

create table if not exists meli_cuentas (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  meli_user_id     bigint not null,
  meli_nickname    text,
  access_token     text not null,
  refresh_token    text not null,
  expira_el        timestamptz not null,
  actualizado_el   timestamptz not null default now()
);

alter table meli_cuentas enable row level security;

-- Resultados crudos de las pruebas contra la API de ML (pantalla
-- /admin/meli). Quedan guardados para poder leerlos después sin capturas.
create table if not exists meli_pruebas (
  id               bigint generated always as identity primary key,
  ts               timestamptz not null default now(),
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  consulta         text not null,
  resultados       jsonb not null
);

alter table meli_pruebas enable row level security;
