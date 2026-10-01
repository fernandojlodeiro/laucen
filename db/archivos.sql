-- Cimiento (orden 136) · Archivos en Supabase Storage.
--   productos      (público)  fotos de productos y variaciones
--   importaciones  (privado)  los Excel que se suben a /importar
-- Cada archivo va bajo una carpeta con el id de la organización
-- ("<organizacion_id>/…"), y las políticas sólo dejan tocar las de las
-- organizaciones de quien está logueado. Fuera de Supabase (base de prueba)
-- no hay esquema storage y esto no hace nada. Se crea sólo lo que falta (no
-- se reponen las políticas en cada arranque: tocar storage.objects pide un
-- candado que puede hacer esperar).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit) values
    ('productos', 'productos', true, 10485760),
    ('importaciones', 'importaciones', false, 52428800)
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp archivos insertar') then
    create policy "erp archivos insertar" on storage.objects for insert to authenticated
      with check (bucket_id in ('productos', 'importaciones') and (storage.foldername(name))[1] in (select public.mis_organizaciones()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp archivos leer') then
    create policy "erp archivos leer" on storage.objects for select to authenticated
      using (bucket_id in ('productos', 'importaciones') and (storage.foldername(name))[1] in (select public.mis_organizaciones()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp archivos borrar') then
    create policy "erp archivos borrar" on storage.objects for delete to authenticated
      using (bucket_id in ('productos', 'importaciones') and (storage.foldername(name))[1] in (select public.mis_organizaciones()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp archivos cambiar') then
    create policy "erp archivos cambiar" on storage.objects for update to authenticated
      using (bucket_id in ('productos', 'importaciones') and (storage.foldername(name))[1] in (select public.mis_organizaciones()));
  end if;
end $$;
