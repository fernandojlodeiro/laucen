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

import webpush from "web-push";
import { consulta, una } from "@/lib/erp/base";
import { membresiasDelUsuario } from "@/lib/tenancy";
import { rolesDeLaOrg, permisosEfectivos } from "@/lib/roles";
import { tienePermiso, todos, type Permisos, type PermisoKey } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { pendientesIa, marcasActuales, subirMarca, completarMarcas, prefsDe, type Marcas } from "@/lib/avisos";
import { TIPOS_AVISO, type AvisoIa } from "@/lib/avisos-tipos";

/** Las llaves para firmar los avisos (VAPID). La primera vez se generan y quedan en la base. */
export async function llavesPush(): Promise<{ publica: string; privada: string }> {
  const r = await una<{ publica: string; privada: string }>("select publica, privada from push_llave where id = 1");
  if (r) return r;
  const k = webpush.generateVAPIDKeys();
  await consulta("insert into push_llave (id, publica, privada) values (1, $1, $2) on conflict (id) do nothing", [k.publicKey, k.privateKey]);
  return (await una<{ publica: string; privada: string }>("select publica, privada from push_llave where id = 1"))!;
}

export type SuscripcionNavegador = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Esta computadora queda anotada para recibir avisos. Lo que ya estaba pendiente no se avisa. */
export async function suscribir(usuario: string, org: string, s: SuscripcionNavegador, equipo: string, puede: (p: PermisoKey) => boolean): Promise<void> {
  await consulta(`
    insert into push_suscripcion (organizacion_id, usuario_id, endpoint, p256dh, auth, equipo) values ($1, $2, $3, $4, $5, $6)
    on conflict (endpoint) do update set organizacion_id = excluded.organizacion_id, usuario_id = excluded.usuario_id,
      p256dh = excluded.p256dh, auth = excluded.auth, equipo = excluded.equipo`,
    [org, usuario, s.endpoint, s.keys.p256dh, s.keys.auth, equipo.slice(0, 120)]);
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, push_avisado) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set push_avisado = coalesce(usuario_preferencia.push_avisado, excluded.push_avisado)`,
    [usuario, org, JSON.stringify(await marcasActuales(org))]);
}

export async function desuscribir(usuario: string, endpoint: string): Promise<void> {
  await consulta("delete from push_suscripcion where usuario_id = $1 and endpoint = $2", [usuario, endpoint]);
}

export async function equiposDe(usuario: string, org: string): Promise<number> {
  const r = await una<{ n: number }>("select count(*)::int n from push_suscripcion where usuario_id = $1 and organizacion_id = $2", [usuario, org]);
  return r?.n ?? 0;
}

type Aviso = { titulo: string; texto: string; url: string };

/** Manda un aviso a todas las computadoras del usuario. Las que el navegador dio de baja se borran. */
async function mandar(usuario: string, org: string, aviso: Aviso): Promise<number> {
  const subs = await consulta<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    "select id::text, endpoint, p256dh, auth from push_suscripcion where usuario_id = $1 and organizacion_id = $2", [usuario, org]);
  if (!subs.length) return 0;
  const k = await llavesPush();
  const cuerpo = JSON.stringify(aviso);
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
        vapidDetails: { subject: urlPanel() || "https://laucen.com", publicKey: k.publica, privateKey: k.privada },
        TTL: 60 * 60 * 12, urgency: "high",
      });
      ok++;
      await consulta("update push_suscripcion set ultimo_ok_ts = now() where id = $1", [s.id]);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await consulta("delete from push_suscripcion where id = $1", [s.id]);
      else console.error("[avisos-push]", status, e instanceof Error ? e.message : e);
    }
  }
  return ok;
}

/** Un aviso de prueba, ya, sin límite (botón de Configuración › Mis avisos). */
export async function avisoDePrueba(usuario: string, org: string): Promise<number> {
  return mandar(usuario, org, { titulo: "Laucen: aviso de prueba", texto: "Así te llegan los avisos de lo que la IA no contestó.", url: "/config/avisos" });
}

function armar(items: AvisoIa[]): Aviso {
  if (items.length === 1) {
    const a = items[0];
    if (a.tipo === "pedidos") return { titulo: a.titulo, texto: [a.detalle, a.texto].filter(Boolean).join("\n"), url: a.href };
    return { titulo: `${a.titulo}: la IA no contestó`, texto: [a.texto, a.motivo].filter(Boolean).join("\n"), url: a.href };
  }
  if (items.every((a) => a.tipo === "pedidos")) {
    return { titulo: `Entraron ${items.length} pedidos nuevos`, texto: items.slice(0, 4).map((a) => `• ${a.titulo}: ${a.detalle}`.slice(0, 90)).join("\n"), url: "/ventas/pedidos?estado=pendientes" };
  }
  return {
    titulo: `${items.length} cosas te necesitan en Laucen`,
    texto: items.slice(0, 4).map((a) => `• ${a.titulo}: ${a.texto}`.slice(0, 90)).join("\n"),
    url: items.every((a) => a.tipo === "whatsapp") ? "/ventas/mensajes?filtro=en_espera" : "/ventas/preguntas",
  };
}

async function permisosDe(usuario: string, org: string): Promise<Permisos | null> {
  const m = (await membresiasDelUsuario(usuario)).find((f) => f.org.id === org);
  if (!m) return null;
  return m.membresia.superadmin ? todos(true) : permisosEfectivos(m.membresia, await rolesDeLaOrg(org));
}

/** La vuelta del job: a cada usuario con avisos activados le manda (como mucho) un aviso con lo nuevo. */
export async function vueltaPush(): Promise<{ usuarios: number; avisos: number }> {
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
    const tipos = prefsDe(f).ventana;
    const elegidos = items.filter((a) => tipos[a.tipo]);
    if (elegidos.length && await mandar(f.usuario_id, f.organizacion_id, armar(elegidos))) avisos++;
    const nuevas: Marcas = {};
    for (const a of items) nuevas[a.tipo] = Math.max(nuevas[a.tipo] ?? 0, a.marca);
    await subirTodas(f.usuario_id, f.organizacion_id, nuevas);
    if (elegidos.length) await consulta("update usuario_preferencia set push_ultimo_ts = now() where usuario_id = $1 and organizacion_id = $2", [f.usuario_id, f.organizacion_id]);
  }
  return { usuarios: filas.length, avisos };
}

async function subirTodas(usuario: string, org: string, marcas: Marcas) {
  for (const [t, m] of Object.entries(marcas)) await subirMarca(usuario, org, "push_avisado", t, m);
}
