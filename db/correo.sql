-- Correo de Laucen (Fer, 24/10): los mails a los clientes salen por el SMTP de Google
-- Workspace (como CadaMes: por Resend caían en spam), con remitente por marca
-- (hola@daitom.com.ar, hola@tiendavirtual.com.ar, hola@deirolab.com) y las respuestas a
-- la casilla de "Responder a". lib/correo/.

-- La cuenta de envío de la organización (la contraseña de aplicación nunca se muestra). Sin políticas.
create table if not exists correo_config (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  smtp_usuario     text,
  smtp_clave       text,
  responder_a      text,
  activo           boolean not null default true,
  actualizado_ts   timestamptz not null default now()
);
alter table correo_config enable row level security;

-- Cada mail que sale (salga bien o mal): para saber qué se mandó cuando alguien dice "no me llegó".
-- clave: lo que no se repite (ej. "pedido:123:pagado", "factura:45"). Sin políticas.
create table if not exists correo_enviado (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  clave            text,
  tipo             text not null,
  para             text not null,
  remitente        text,
  asunto           text not null,
  salio            boolean not null,
  motivo           text,
  pedido_id        bigint,
  comprobante_id   bigint,
  creado_ts        timestamptz not null default now()
);
create unique index if not exists correo_enviado_clave on correo_enviado (organizacion_id, clave) where clave is not null and salio;
create index if not exists correo_enviado_org on correo_enviado (organizacion_id, creado_ts desc);
alter table correo_enviado enable row level security;

-- Los avisos de cambio de estado de los pedidos de la tienda web (pagado, despachado, listo para
-- retirar) entran solos a esta cola (trigger de pedido_estado_historial) y los manda
-- /api/correo/cola (pg_cron cada minuto, sólo si hay algo). Sin políticas.
create table if not exists correo_cola (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  pedido_id        bigint not null,
  tipo             text not null check (tipo in ('pagado', 'despachado', 'listo_retirar')),
  nota             text,
  intentos         int not null default 0,
  hecho_ts         timestamptz,
  creado_ts        timestamptz not null default now(),
  unique (pedido_id, tipo)
);
create index if not exists correo_cola_pendiente on correo_cola (creado_ts) where hecho_ts is null;
alter table correo_cola enable row level security;

create or replace function public.correo_encolar_estado() returns trigger language plpgsql as $$
declare v_tipo text;
begin
  if not exists (select 1 from pedido p join canal c on c.id = p.canal_id where p.id = new.pedido_id and c.tipo = 'web_minorista') then return new; end if;
  v_tipo := case
    when new.estado_nuevo = 'pagado' then 'pagado'
    when new.estado_nuevo = 'despachado' then 'despachado'
    when new.estado_nuevo = 'preparado' and exists (select 1 from pedido p join metodo_envio m on m.id = p.metodo_envio_id
                                                    where p.id = new.pedido_id and m.tipo = 'retiro') then 'listo_retirar'
  end;
  if v_tipo is not null then
    insert into correo_cola (organizacion_id, pedido_id, tipo, nota) values (new.organizacion_id, new.pedido_id, v_tipo, new.nota)
    on conflict (pedido_id, tipo) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'correo_encolar_estado: %', sqlerrm;  -- un aviso por mail nunca frena un cambio de estado
  return new;
end $$;

create or replace trigger pedido_estado_correo after insert on pedido_estado_historial
  for each row execute function correo_encolar_estado();

-- pg_cron 'correo-cola': cada minuto, sólo si hay algo en la cola.
do $$
declare
  j record;
  cmd text := $cmd$
  select net.http_get(
    url := 'https://laucen.vercel.app/api/correo/cola?clave=' || (select clave from public.erp_llave where id = 1),
    timeout_milliseconds := 60000
  ) where exists (select 1 from public.correo_cola where hecho_ts is null and intentos < 5)
$cmd$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'correo-cola';
  if not found then perform cron.schedule('correo-cola', '* * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar correo-cola (%)', sqlerrm;
end $$;
