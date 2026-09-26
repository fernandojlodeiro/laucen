-- China: búsqueda de productos en 1688 / Alibaba.
--
-- Idempotente: lib/china/esquema.ts corre este archivo al arrancar la app.

-- Fotos subidas desde la pantalla de China (sacadas por el usuario). Los
-- buscadores por foto de Apify necesitan un link público: la foto se sirve en
-- /api/china/foto/<id>.jpg (el id es al azar, no se puede adivinar).
create table if not exists china_fotos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  text not null,
  tipo             text not null,                 -- image/jpeg
  datos            bytea not null,
  bytes            int not null,
  subida_el        timestamptz not null default now()
);
alter table china_fotos enable row level security;
