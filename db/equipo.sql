-- Superadministrador y dueño de cada organización (pedido de Fer, 3/10).
-- Idempotente: lo corre lib/erp/esquema.ts al primer uso tras cada arranque.
--
--   · membresias.superadmin: tiene todos los permisos siempre, sin importar
--     el rol. Sólo otro superadministrador lo nombra o se lo saca.
--   · organizaciones.dueno_usuario_id: el que creó la organización. Es
--     superadministrador y nadie se lo saca ni lo suspende; así la
--     organización nunca queda sin superadministrador.

alter table membresias add column if not exists superadmin boolean not null default false;
alter table organizaciones add column if not exists dueno_usuario_id text references usuarios(id);

-- Las organizaciones que ya existían: el dueño es la primera persona activa
-- con el rol de fábrica (Admin), o si no la primera activa.
update organizaciones o set dueno_usuario_id = (
  select m.usuario_id from membresias m left join roles r on r.id = m.rol_id
   where m.organizacion_id = o.id and m.estado = 'ACTIVO'
   order by (r.protegido is true) desc, m.creada_el limit 1)
 where o.dueno_usuario_id is null;

-- El dueño siempre es superadministrador.
update membresias m set superadmin = true
  from organizaciones o
 where o.id = m.organizacion_id and o.dueno_usuario_id = m.usuario_id and not m.superadmin;

-- Permisos nuevos (3/10): el rol de fábrica (Admin, "acceso total") los
-- recibe una sola vez; los demás roles nacen sin ellos. Si después alguien
-- se los saca, la clave queda en false y esto no la vuelve a prender.
update roles set permisos = permisos || '{"roles_administrar": true, "asistente_config": true, "asistente_historial_ver": true}'::jsonb
 where protegido and not (permisos ? 'roles_administrar');

-- «Pedirle al asistente que haga cosas» (3/10): también va una vez al Admin de fábrica.
update roles set permisos = permisos || '{"asistente_acciones": true}'::jsonb
 where protegido and not (permisos ? 'asistente_acciones');

-- «Preparar sin escanear» (3/10, provisorio mientras no todo tiene etiqueta): una vez al Admin de fábrica.
update roles set permisos = permisos || '{"picking_sin_escanear": true}'::jsonb
 where protegido and not (permisos ? 'picking_sin_escanear');
