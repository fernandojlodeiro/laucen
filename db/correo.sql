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
  tipo             text not null,
  nota             text,
  intentos         int not null default 0,
  hecho_ts         timestamptz,
  creado_ts        timestamptz not null default now(),
  unique (pedido_id, tipo)
);
create index if not exists correo_cola_pendiente on correo_cola (creado_ts) where hecho_ts is null;
alter table correo_cola enable row level security;
-- El mismo aviso por WhatsApp (lib/mensajes/avisos-pedido.ts), con su propio estado y sus reintentos.
alter table correo_cola add column if not exists wa_estado text;
alter table correo_cola add column if not exists wa_detalle text;
alter table correo_cola add column if not exists wa_intentos int not null default 0;
alter table correo_cola add column if not exists wa_intento_ts timestamptz;
alter table correo_cola add column if not exists wa_hecho_ts timestamptz;

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
  ) where exists (select 1 from public.correo_cola where (hecho_ts is null and intentos < 5)
       or (wa_hecho_ts is null and wa_intentos < 300 and creado_ts > now() - interval '3 days' and (wa_intento_ts is null or wa_intento_ts < now() - interval '10 minutes')))
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

-- El seguimiento de los pedidos sin pagar (Fer, 25/10, lib/pedidos/seguimiento.ts): los avisos de la reserva
-- van por la misma cola, por mail y por WhatsApp (éstos, aunque el cliente no haya tildado WhatsApp).
alter table correo_cola drop constraint if exists correo_cola_tipo_check;
alter table correo_cola add constraint correo_cola_tipo_check check (tipo in ('pagado', 'despachado', 'listo_retirar',
  'recibido', 'pago_incompleto', 'recordatorio', 'ultimo_dia', 'reserva_anulada'));

-- ¿El pedido está en seguimiento? Nuevo, sin pagar, con reserva, de un canal donde se carga a mano o de la
-- tienda (no Mercado Libre), de un cliente que no compra a cuenta corriente, y con avisos_reserva (los
-- pedidos de antes de que esto existiera no reciben avisos de golpe).
create or replace function public.pedido_en_seguimiento(p_pedido bigint) returns boolean language sql stable as $$
  select exists (
    select 1 from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
     where p.id = p_pedido and p.estado = 'nuevo' and p.estado_pago in ('pendiente', 'a_cobrar') and p.reserva_hasta is not null
       and c.tipo in ('web_minorista', 'web_mayorista', 'local', 'otro') and not coalesce(cl.cuenta_corriente, false)
       and p.avisos_reserva)
$$;

create index if not exists pedido_sin_pagar on pedido (fecha) where estado = 'nuevo' and estado_pago in ('pendiente', 'a_cobrar');

-- Lo que toca mandar ahora (pg_cron 'pedido-seguimiento', cada 5 minutos).
create or replace function public.pedido_seguimiento_encolar() returns int language plpgsql as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hora int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::int;
  n int := 0; k int;
begin
  -- Tarjeta o Mercado Pago sin completar, a los 10 minutos: el aviso, y la reserva pasa a 24 horas desde ahora.
  with nuevos as (
    insert into correo_cola (organizacion_id, pedido_id, tipo)
    select p.organizacion_id, p.id, 'pago_incompleto' from pedido p join canal c on c.id = p.canal_id
     where p.estado = 'nuevo' and p.estado_pago in ('pendiente', 'a_cobrar') and c.tipo = 'web_minorista' and p.fecha < now() - interval '10 minutes'
       and p.datos_externos #>> '{tienda,medio}' in ('payway', 'mercadopago') and p.reserva_vence_ts is null
       and pedido_en_seguimiento(p.id)
    on conflict (pedido_id, tipo) do nothing
    returning pedido_id
  )
  update pedido set reserva_vence_ts = now() + interval '24 hours',
                    reserva_hasta = ((now() + interval '24 hours') at time zone 'America/Argentina/Buenos_Aires')::date
   where id in (select pedido_id from nuevos);
  get diagnostics k = row_count; n := n + k;
  -- A los 2 días, si todavía falta para el último día.
  insert into correo_cola (organizacion_id, pedido_id, tipo)
  select p.organizacion_id, p.id, 'recordatorio' from pedido p
   where p.estado = 'nuevo' and p.estado_pago in ('pendiente', 'a_cobrar') and p.fecha <= now() - interval '48 hours' and p.reserva_vence_ts is null and p.reserva_hasta > v_hoy
     and pedido_en_seguimiento(p.id)
  on conflict (pedido_id, tipo) do nothing;
  get diagnostics k = row_count; n := n + k;
  -- El último día de la reserva, desde las 9 de la mañana (si el pedido no es de hoy).
  if v_hora >= 9 then
    insert into correo_cola (organizacion_id, pedido_id, tipo)
    select p.organizacion_id, p.id, 'ultimo_dia' from pedido p
     where p.estado = 'nuevo' and p.estado_pago in ('pendiente', 'a_cobrar') and p.reserva_vence_ts is null and p.reserva_hasta = v_hoy
       and (p.fecha at time zone 'America/Argentina/Buenos_Aires')::date < v_hoy and pedido_en_seguimiento(p.id)
    on conflict (pedido_id, tipo) do nothing;
    get diagnostics k = row_count; n := n + k;
  end if;
  return n;
end $$;

do $$
declare j record; cmd text := 'select public.pedido_seguimiento_encolar()';
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'pedido-seguimiento';
  if not found then perform cron.schedule('pedido-seguimiento', '*/5 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar pedido-seguimiento (%)', sqlerrm;
end $$;
