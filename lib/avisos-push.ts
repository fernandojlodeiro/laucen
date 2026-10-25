// Avisos de Windows con Laucen cerrado (pedido de Fer, 10/10): notificaciones
// push del navegador. Cada computadora o celular donde el usuario las activó
// queda en push_suscripcion; el navegador las recibe con su "portero"
// (public/sw-avisos.js) aunque no haya ninguna pestaña de Laucen abierta.
// El servidor no le habla directo a la PC: le manda el aviso al servicio de
// avisos del navegador (Google para Chrome, Microsoft para Edge), firmado con
// las llaves de push_llave (las genera la app la primera vez).
//
// Qué avisa: lo mismo que la ventana de prepo (lo que la IA no contestó, ver
// lib/avisos.ts), agrupado en un solo aviso. Lo corre cada minuto el job de
// pg_cron 'avisos-push' (db/moneda.sql). No avisa si el usuario tiene Laucen a
// la vista (ahí avisa la pantalla) ni más de una vez cada `aviso_cada_min`.
// Los equipos «sólo derivaciones» (el celular: Fer, 25/10) van aparte: avisan
// siempre lo derivado a una persona, con sus propias marcas, salvo que estén
// silenciados (pausado_hasta).

import webpush from "web-push";
import { consulta, una } from "@/lib/erp/base";
import { membresiasDelUsuario } from "@/lib/tenancy";
import { rolesDeLaOrg, permisosEfectivos } from "@/lib/roles";
import { tienePermiso, todos, type Permisos, type PermisoKey } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { pendientesIa, marcasActuales, subirMarca, completarMarcas, prefsDe, type Marcas } from "@/lib/avisos";
import { TIPOS_AVISO, esDerivacion, type AvisoIa } from "@/lib/avisos-tipos";

/** Las llaves para firmar los avisos (VAPID). La primera vez se generan y quedan en la base. */
export async function llavesPush(): Promise<{ publica: string; privada: string }> {
  const r = await una<{ publica: string; privada: string }>("select publica, privada from push_llave where id = 1");
  if (r) return r;
  const k = webpush.generateVAPIDKeys();
  await consulta("insert into push_llave (id, publica, privada) values (1, $1, $2) on conflict (id) do nothing", [k.publicKey, k.privateKey]);
  return (await una<{ publica: string; privada: string }>("select publica, privada from push_llave where id = 1"))!;
}

export type SuscripcionNavegador = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Este equipo queda anotado para recibir avisos. Lo que ya estaba pendiente no se avisa. Un celular nace recibiendo
 *  sólo las derivaciones (Fer, 25/10); si ya estaba anotado, conserva lo que se eligió. */
export async function suscribir(usuario: string, org: string, s: SuscripcionNavegador, equipo: string, puede: (p: PermisoKey) => boolean): Promise<void> {
  await consulta(`
    insert into push_suscripcion (organizacion_id, usuario_id, endpoint, p256dh, auth, equipo, solo_derivaciones, marcas) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    on conflict (endpoint) do update set organizacion_id = excluded.organizacion_id, usuario_id = excluded.usuario_id,
      p256dh = excluded.p256dh, auth = excluded.auth, equipo = excluded.equipo, marcas = coalesce(push_suscripcion.marcas, excluded.marcas)`,
    [org, usuario, s.endpoint, s.keys.p256dh, s.keys.auth, equipo.slice(0, 120), /Android|iPhone/.test(equipo), JSON.stringify(await marcasActuales(org))]);
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, push_avisado) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set push_avisado = coalesce(usuario_preferencia.push_avisado, excluded.push_avisado)`,
    [usuario, org, JSON.stringify(await marcasActuales(org))]);
}

/** Qué recibe este equipo: todo, o sólo lo derivado a una persona. */
export async function modoEquipo(usuario: string, endpoint: string): Promise<boolean | null> {
  const r = await una<{ solo: boolean }>("select solo_derivaciones solo from push_suscripcion where usuario_id = $1 and endpoint = $2", [usuario, endpoint]);
  return r ? r.solo : null;
}

export async function cambiarModoEquipo(usuario: string, endpoint: string, solo: boolean): Promise<void> {
  const r = await una<{ id: number }>("select id::int from push_suscripcion where usuario_id = $1 and endpoint = $2", [usuario, endpoint]);
  if (r) await cambiarEquipo(usuario, r.id, { solo });
}

export type EquipoPush = { id: number; equipo: string; solo: boolean; apagado: boolean; silenciado_hasta: Date | null; creado_ts: Date; ultimo_ok_ts: Date | null };

/** Los equipos del usuario con los avisos activados (Configuración › Mis avisos). */
export async function equiposDelUsuario(usuario: string, org: string): Promise<EquipoPush[]> {
  return consulta<EquipoPush>(`
    select id::int, equipo, solo_derivaciones solo, coalesce(pausado_hasta = 'infinity', false) apagado,
           case when pausado_hasta > now() and pausado_hasta <> 'infinity' then pausado_hasta end silenciado_hasta, creado_ts, ultimo_ok_ts
      from push_suscripcion where usuario_id = $1 and organizacion_id = $2 order by creado_ts`, [usuario, org]);
}

/** Cambia un equipo: recibir todo o sólo derivaciones, y silenciarlo (`pausa`: hasta cuándo; null = que vuelva a
 *  avisar; Infinity = apagado). Al pasar a «sólo derivaciones» o volver a avisar, arranca desde ahora: lo que pasó
 *  mientras tanto no se avisa de golpe. */
export async function cambiarEquipo(usuario: string, id: number, c: { solo?: boolean; pausa?: Date | null | "apagado" }): Promise<void> {
  const r = await una<{ organizacion_id: string }>("select organizacion_id from push_suscripcion where id = $1 and usuario_id = $2", [id, usuario]);
  if (!r) return;
  const marcas = JSON.stringify(await marcasActuales(r.organizacion_id));
  if (c.solo !== undefined) {
    await consulta("update push_suscripcion set solo_derivaciones = $3, marcas = case when $3 then $4::jsonb else marcas end where id = $1 and usuario_id = $2", [id, usuario, c.solo, marcas]);
  }
  if (c.pausa !== undefined) {
    const hasta = c.pausa === "apagado" ? "infinity" : c.pausa ? c.pausa.toISOString() : null;
    await consulta(`update push_suscripcion set pausado_hasta = $3::timestamptz, marcas = case when $3::timestamptz is null then $4::jsonb else marcas end
                     where id = $1 and usuario_id = $2`, [id, usuario, hasta, marcas]);
  }
}

export async function desuscribir(usuario: string, endpoint: string): Promise<void> {
  await consulta("delete from push_suscripcion where usuario_id = $1 and endpoint = $2", [usuario, endpoint]);
}

export async function equiposDe(usuario: string, org: string): Promise<number> {
  const r = await una<{ n: number }>("select count(*)::int n from push_suscripcion where usuario_id = $1 and organizacion_id = $2", [usuario, org]);
  return r?.n ?? 0;
}

type Aviso = { titulo: string; texto: string; url: string };

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; solo: boolean; pausado: boolean };

/** Manda un aviso a un equipo. Si el navegador lo dio de baja, se borra. */
async function enviarA(s: Sub, aviso: Aviso): Promise<boolean> {
  const k = await llavesPush();
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), {
      vapidDetails: { subject: urlPanel() || "https://laucen.com", publicKey: k.publica, privateKey: k.privada },
      TTL: 60 * 60 * 12, urgency: "high",
    });
    await consulta("update push_suscripcion set ultimo_ok_ts = now() where id = $1", [s.id]);
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await consulta("delete from push_suscripcion where id = $1", [s.id]);
    else console.error("[avisos-push]", status, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Manda un aviso a los equipos del usuario que reciben todo y no están silenciados (`todos`: también a los
 *  «sólo derivaciones» y silenciados, para la prueba). */
async function mandar(usuario: string, org: string, aviso: Aviso, todos = false): Promise<number> {
  const subs = await consulta<Sub>(
    `select id::text, endpoint, p256dh, auth, solo_derivaciones solo, coalesce(pausado_hasta > now(), false) pausado
       from push_suscripcion where usuario_id = $1 and organizacion_id = $2`, [usuario, org]);
  let ok = 0;
  for (const s of subs) if ((todos || (!s.solo && !s.pausado)) && await enviarA(s, aviso)) ok++;
  return ok;
}

/** Un aviso de prueba, ya, sin límite (botón de Configuración › Mis avisos). */
export async function avisoDePrueba(usuario: string, org: string): Promise<number> {
  return mandar(usuario, org, { titulo: "Laucen: aviso de prueba", texto: "Así te llegan los avisos de lo que la IA no contestó.", url: "/config/avisos" }, true);
}

function armar(items: AvisoIa[]): Aviso {
  if (items.length === 1) {
    const a = items[0];
    if (a.tipo === "pedidos") return { titulo: a.titulo, texto: [a.detalle, a.texto].filter(Boolean).join("\n"), url: a.href };
    if (a.tipo === "reclamos") return { titulo: `${a.titulo}: para atender`, texto: [a.detalle, a.texto, a.motivo].filter(Boolean).join("\n"), url: a.href };
    if (a.derivada) return { titulo: `${a.titulo}: espera a una persona`, texto: [a.texto, a.motivo].filter(Boolean).join("\n"), url: a.href };
    if (a.tipo === "whatsapp") return { titulo: `${a.titulo}: espera a una persona`, texto: [a.detalle, a.texto].filter(Boolean).join("\n"), url: a.href };
    return { titulo: `${a.titulo}: la IA no contestó`, texto: [a.texto, a.motivo].filter(Boolean).join("\n"), url: a.href };
  }
  if (items.every((a) => a.tipo === "pedidos")) {
    return { titulo: `Entraron ${items.length} pedidos nuevos`, texto: items.slice(0, 4).map((a) => `• ${a.titulo}: ${a.detalle}`.slice(0, 90)).join("\n"), url: "/ventas/pedidos?estado=pendientes" };
  }
  if (items.every(esDerivacion)) {
    return {
      titulo: `${items.length} casos esperan a una persona`,
      texto: items.slice(0, 4).map((a) => `• ${a.titulo}: ${a.texto}`.slice(0, 90)).join("\n"),
      url: "/ventas/mensajes",
    };
  }
  return {
    titulo: `${items.length} cosas te necesitan en Laucen`,
    texto: items.slice(0, 4).map((a) => `• ${a.titulo}: ${a.texto}`.slice(0, 90)).join("\n"),
    url: items.every((a) => a.tipo === "whatsapp") ? "/ventas/mensajes?filtro=en_espera"
      : items.every((a) => a.tipo === "reclamos") ? "/ventas/reclamos" : "/ventas/mensajes",
  };
}

async function permisosDe(usuario: string, org: string): Promise<Permisos | null> {
  const m = (await membresiasDelUsuario(usuario)).find((f) => f.org.id === org);
  if (!m) return null;
  return m.membresia.superadmin ? todos(true) : permisosEfectivos(m.membresia, await rolesDeLaOrg(org));
}

/** Un aviso a todos los usuarios de la organización que tienen el permiso y avisos de Windows activados
 *  (ej. publicidad: un producto pasó a CORTAR). Devuelve a cuántas computadoras llegó. */
export async function avisarOrg(org: string, permiso: PermisoKey, aviso: Aviso): Promise<number> {
  const usuarios = await consulta<{ usuario_id: string }>("select distinct usuario_id from push_suscripcion where organizacion_id = $1", [org]);
  let n = 0;
  for (const u of usuarios) {
    const permisos = await permisosDe(u.usuario_id, org).catch(() => null);
    // Los equipos que reciben sólo derivaciones, no.
    if (permisos && tienePermiso(permisos, permiso)) n += await mandar(u.usuario_id, org, aviso);
  }
  return n;
}

/** La vuelta del job: a cada usuario con avisos activados le manda (como mucho) un aviso con lo nuevo; y a cada
 *  equipo «sólo derivaciones», lo derivado nuevo. */
export async function vueltaPush(): Promise<{ usuarios: number; avisos: number }> {
  const r = await vueltaGeneral();
  return { usuarios: r.usuarios, avisos: r.avisos + await vueltaDerivaciones().catch((e) => { console.error("[avisos-push] derivaciones", e); return 0; }) };
}

/** Los equipos «sólo derivaciones» (Fer, 25/10): avisan lo derivado a una persona aunque el usuario tenga Laucen a la
 *  vista en otro lado, cada uno con sus marcas. Uno silenciado no avisa ni junta lo de mientras tanto. */
async function vueltaDerivaciones(): Promise<number> {
  const subs = await consulta<Sub & { usuario_id: string; organizacion_id: string; marcas: Marcas | null }>(`
    select id::text, endpoint, p256dh, auth, true solo, false pausado, usuario_id, organizacion_id, marcas
      from push_suscripcion where solo_derivaciones and (pausado_hasta is null or pausado_hasta <= now())`);
  let n = 0;
  const permisosDeUsuario = new Map<string, Permisos | null>();
  for (const s of subs) {
    const llave = `${s.usuario_id}|${s.organizacion_id}`;
    if (!permisosDeUsuario.has(llave)) permisosDeUsuario.set(llave, await permisosDe(s.usuario_id, s.organizacion_id).catch(() => null));
    const permisos = permisosDeUsuario.get(llave);
    if (!permisos) continue;
    if (!s.marcas) {
      await consulta("update push_suscripcion set marcas = $2::jsonb where id = $1", [s.id, JSON.stringify(await marcasActuales(s.organizacion_id))]);
      continue;
    }
    // Un tipo que todavía no tenía marca arranca desde ahora.
    const marcas: Marcas = { ...await marcasActuales(s.organizacion_id), ...s.marcas };
    const items = await pendientesIa(s.organizacion_id, (p) => tienePermiso(permisos, p), marcas);
    if (!items.length) continue;
    const derivados = items.filter(esDerivacion);
    if (derivados.length && await enviarA(s, armar(derivados))) n++;
    // Lo que no es derivación tampoco se vuelve a mirar en este equipo.
    const nuevas: Marcas = { ...s.marcas };
    for (const a of items) nuevas[a.tipo] = Math.max(Number(nuevas[a.tipo] ?? 0), a.marca);
    await consulta("update push_suscripcion set marcas = $2::jsonb where id = $1", [s.id, JSON.stringify(nuevas)]);
  }
  return n;
}

async function vueltaGeneral(): Promise<{ usuarios: number; avisos: number }> {
  const filas = await consulta<Parameters<typeof prefsDe>[0] & { usuario_id: string; organizacion_id: string; listo: boolean; avisado: Marcas | null; push_avisado: Marcas | null }>(`
    select s.usuario_id, s.organizacion_id,
           (coalesce(p.vistazo_ts, '-infinity') < now() - interval '45 seconds'
            and coalesce(p.push_ultimo_ts, '-infinity') < now() - make_interval(mins => greatest(coalesce(p.aviso_cada_min, 1), 1)) + interval '5 seconds') listo,
           p.avisado, p.push_avisado, coalesce(p.aviso_sonido, true) aviso_sonido, coalesce(p.aviso_ventana, true) aviso_ventana,
           p.aviso_ventana_tipos, coalesce(p.aviso_cada_min, 1) aviso_cada_min
      from (select distinct usuario_id, organizacion_id from push_suscripcion) s
      left join usuario_preferencia p on p.usuario_id = s.usuario_id and p.organizacion_id = s.organizacion_id`);
  let avisos = 0;
  for (const f of filas) {
    if (!f.listo) continue;
    const permisos = await permisosDe(f.usuario_id, f.organizacion_id).catch(() => null);
    if (!permisos) continue;
    const puede = (p: PermisoKey) => tienePermiso(permisos, p);
    if (!f.push_avisado) {
      await subirTodas(f.usuario_id, f.organizacion_id, await marcasActuales(f.organizacion_id));
      continue;
    }
    // Lo que ya vio en la ventana de la pantalla tampoco se avisa por Windows.
    const push = await completarMarcas(f.usuario_id, f.organizacion_id, "push_avisado", f.push_avisado);
    const marcas: Marcas = {};
    for (const t of TIPOS_AVISO) marcas[t] = Math.max(Number(f.avisado?.[t] ?? 0), Number(push[t] ?? 0));
    const items = await pendientesIa(f.organizacion_id, puede, marcas);
    if (!items.length) continue;
    // Sólo los tipos que eligió en Mis avisos; los demás quedan como avisados igual.
    // Sólo los tipos que eligió en Mis avisos (los equipos «sólo derivaciones» van aparte: vueltaDerivaciones).
    const tipos = prefsDe(f).ventana;
    const elegidos = items.filter((a) => tipos[a.tipo]);
    const enviados = elegidos.length ? await mandar(f.usuario_id, f.organizacion_id, armar(elegidos)) : 0;
    if (enviados) avisos++;
    const nuevas: Marcas = {};
    for (const a of items) nuevas[a.tipo] = Math.max(nuevas[a.tipo] ?? 0, a.marca);
    await subirTodas(f.usuario_id, f.organizacion_id, nuevas);
    if (enviados) await consulta("update usuario_preferencia set push_ultimo_ts = now() where usuario_id = $1 and organizacion_id = $2", [f.usuario_id, f.organizacion_id]);
  }
  return { usuarios: filas.length, avisos };
}

async function subirTodas(usuario: string, org: string, marcas: Marcas) {
  for (const [t, m] of Object.entries(marcas)) await subirMarca(usuario, org, "push_avisado", t, m);
}
