// Mercado Pago del espacio personal (db/personal.sql): se conecta con la
// misma aplicación de Mercado Pago de Laucen (OAuth), pero la cuenta, su
// llave y todo lo que se baja quedan en el esquema "personal", nunca en las
// tablas de la empresa. Sólo lee de Mercado Pago y le pide reportes.

import { after } from "next/server";
import { consulta, una, enTransaccion, motivoErp } from "@/lib/erp/base";
import { API_MP, appMp, pedirToken } from "@/lib/mercadopago/conexion";
import { sondearConLlave, muestraMes, bajarReportes, reportesDelMes, colaEnTabla, type Destino } from "@/lib/mercadopago/exportacion";

/** Canjea el código que vuelve de Mercado Pago y guarda la cuenta en el espacio. */
export async function canjearCodigoPersonal(espacioId: number, usuarioId: string, code: string, redirectUri: string): Promise<string> {
  const app = await appMp();
  if (!app) throw new Error("Falta configurar la aplicación de Mercado Pago de Laucen.");
  const t = await pedirToken({ grant_type: "authorization_code", client_id: app.clientId, client_secret: app.secreto, code, redirect_uri: redirectUri });
  const yo = await fetch(`${API_MP}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` }, cache: "no-store" })
    .then((r) => r.json()).catch(() => null) as { id?: number; nickname?: string; email?: string; first_name?: string; last_name?: string } | null;
  const nombre = [yo?.first_name, yo?.last_name].filter(Boolean).join(" ") || yo?.nickname || null;
  const userId = Number(t.user_id ?? yo?.id);
  await consulta(`
    insert into personal.mp_conexion (espacio_id, mp_user_id, nombre, email, access_token, refresh_token, expira_el, conectada_por)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (espacio_id, mp_user_id) do update set
      nombre = coalesce(excluded.nombre, personal.mp_conexion.nombre), email = coalesce(excluded.email, personal.mp_conexion.email),
      access_token = excluded.access_token, refresh_token = coalesce(excluded.refresh_token, personal.mp_conexion.refresh_token),
      expira_el = excluded.expira_el, estado = 'activa', ultimo_error = null, actualizado_ts = now()`,
    [espacioId, userId, nombre, yo?.email ?? null, t.access_token, t.refresh_token ?? null, new Date(Date.now() + (Number(t.expires_in) - 300) * 1000), usuarioId]);
  return nombre ?? yo?.email ?? `cuenta ${userId}`;
}

/** La llave vigente; si venció, la renueva (con la fila bloqueada). null si quedó desconectada. */
async function tokenPersonal(conexionId: number): Promise<string | null> {
  const app = await appMp();
  return enTransaccion(async (c) => {
    const r = await c.query<{ access_token: string; refresh_token: string | null; expira_el: Date; estado: string }>(
      "select access_token, refresh_token, expira_el, estado from personal.mp_conexion where id = $1 for update", [conexionId]);
    const x = r.rows[0];
    if (!x || x.estado !== "activa") return null;
    if (new Date(x.expira_el).getTime() > Date.now()) return x.access_token;
    if (!x.refresh_token || !app) {
      await c.query("update personal.mp_conexion set estado = 'desconectada', ultimo_error = 'La llave venció: volvé a conectarla' where id = $1", [conexionId]);
      return null;
    }
    try {
      const t = await pedirToken({ grant_type: "refresh_token", client_id: app.clientId, client_secret: app.secreto, refresh_token: x.refresh_token });
      await c.query(`update personal.mp_conexion set access_token = $2, refresh_token = coalesce($3, refresh_token), expira_el = $4, ultimo_error = null, actualizado_ts = now() where id = $1`,
        [conexionId, t.access_token, t.refresh_token ?? null, new Date(Date.now() + (Number(t.expires_in) - 300) * 1000)]);
      return t.access_token;
    } catch (e) {
      await c.query("update personal.mp_conexion set estado = 'desconectada', ultimo_error = $2 where id = $1", [conexionId, `No se pudo renovar la llave: ${String(e).slice(0, 200)}`]);
      return null;
    }
  });
}

export function destinoPersonal(conexionId: number, mpUserId: number): Destino {
  return {
    token: () => tokenPersonal(conexionId),
    mpUserId,
    anotar: async (paso, status, datos) => {
      await consulta("insert into personal.mp_paso (conexion_id, paso, status, datos) values ($1, $2, $3, $4)", [conexionId, paso, status, JSON.stringify(datos ?? null)]);
    },
    guardar: async (fuente, nombre, desde, hasta, bytes, sha) => {
      await consulta(`insert into personal.mp_archivo (conexion_id, fuente, nombre, desde, hasta, sha256, bytes, contenido)
                      values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (conexion_id, fuente, nombre, sha256) do nothing`,
        [conexionId, fuente, nombre, desde, hasta, sha, bytes.length, bytes]);
    },
    bajados: async () => new Set((await consulta<{ nombre: string }>("select distinct nombre from personal.mp_archivo where conexion_id = $1", [conexionId])).map((x) => x.nombre)),
    cola: colaEnTabla("personal.mp_item", conexionId, null),
  };
}

export type CuentaPersonal = {
  id: number; mpUserId: number; nombre: string | null; email: string | null; estado: string; ultimoError: string | null; conectada: string;
  ultimaSonda: string | null; archivos: number;
};

export async function cuentasDelEspacio(espacioId: number): Promise<CuentaPersonal[]> {
  return consulta<CuentaPersonal>(`
    select c.id::int, c.mp_user_id::bigint "mpUserId", c.nombre, c.email, c.estado, c.ultimo_error "ultimoError",
           to_char(c.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') conectada,
           (select to_char(max(ts) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') from personal.mp_sonda s where s.conexion_id = c.id) "ultimaSonda",
           (select count(*)::int from personal.mp_archivo a where a.conexion_id = c.id) archivos
      from personal.mp_conexion c where c.espacio_id = $1 order by c.id`, [espacioId]);
}

/** La cuenta, si es del espacio (nunca de otro). */
async function cuentaDelEspacio(espacioId: number, conexionId: number) {
  return una<{ id: number; mp_user_id: string }>("select id::int, mp_user_id from personal.mp_conexion where id = $1 and espacio_id = $2", [conexionId, espacioId]);
}

export async function desconectar(espacioId: number, conexionId: number) {
  await consulta("delete from personal.mp_conexion where id = $1 and espacio_id = $2", [conexionId, espacioId]);
}

export type Trabajo = { id: number; titulo: string; estado: "corriendo" | "ok" | "error"; mensaje: string | null; cuando: string };

export async function trabajosDelEspacio(espacioId: number): Promise<Trabajo[]> {
  await consulta(`update personal.trabajo set estado = 'error', mensaje = 'No terminó (se cortó): probá de nuevo.', terminado_ts = now()
                   where espacio_id = $1 and estado = 'corriendo' and creado_ts < now() - interval '10 minutes'`, [espacioId]);
  return consulta<Trabajo>(`select id::int, titulo, estado, mensaje, to_char(creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') cuando
                              from personal.trabajo where espacio_id = $1 order by id desc limit 8`, [espacioId]);
}

/** Corre algo de fondo en el espacio (la pantalla se actualiza sola mientras corre). */
async function deFondo(espacioId: number, usuarioId: string, titulo: string, trabajo: () => Promise<string>) {
  const ya = await una("select 1 from personal.trabajo where espacio_id = $1 and estado = 'corriendo' and creado_ts > now() - interval '10 minutes'", [espacioId]);
  if (ya) throw new Error("Ya hay algo corriendo: esperá a que termine.");
  const f = await una<{ id: number }>("insert into personal.trabajo (espacio_id, usuario_id, titulo) values ($1, $2, $3) returning id::int", [espacioId, usuarioId, titulo]);
  after(async () => {
    try {
      const mensaje = await trabajo();
      await consulta("update personal.trabajo set estado = 'ok', mensaje = $2, terminado_ts = now() where id = $1", [f!.id, mensaje]);
    } catch (e) {
      console.error("[personal]", e);
      await consulta("update personal.trabajo set estado = 'error', mensaje = $2, terminado_ts = now() where id = $1", [f!.id, motivoErp(e)]).catch(() => {});
    }
  });
}

/** Qué fuentes da la cuenta y desde cuándo (sólo lee). */
export async function lanzarInventario(espacioId: number, usuarioId: string, conexionId: number) {
  const c = await cuentaDelEspacio(espacioId, conexionId);
  if (!c) throw new Error("Esa cuenta no es de este espacio.");
  await deFondo(espacioId, usuarioId, "Inventario de la cuenta de Mercado Pago", async () => {
    const token = await tokenPersonal(c.id);
    if (!token) throw new Error("La cuenta quedó desconectada: volvé a conectarla.");
    const datos = await sondearConLlave(token);
    await consulta("insert into personal.mp_sonda (conexion_id, datos) values ($1, $2)", [c.id, JSON.stringify(datos)]);
    return "Inventario listo.";
  });
}

/** Pide los reportes de un mes y baja los pagos; los reportes se bajan con «Bajar reportes del mes» unos minutos después. */
export async function lanzarMes(espacioId: number, usuarioId: string, conexionId: number, mes: string, soloBajar: boolean) {
  const c = await cuentaDelEspacio(espacioId, conexionId);
  if (!c) throw new Error("Esa cuenta no es de este espacio.");
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Elegí el mes.");
  const d = destinoPersonal(c.id, Number(c.mp_user_id));
  await deFondo(espacioId, usuarioId, soloBajar ? `Bajar los reportes de ${mes}` : `Pedir y bajar los reportes y pagos de ${mes}`, async () => {
    if (soloBajar) {
      const r = await bajarReportes(d, mes);
      if ("error" in r && r.error) throw new Error(String(r.error));
      return "Reportes bajados (los que Mercado Pago ya tenía armados).";
    }
    // Pide los reportes y espera (hasta unos 3 minutos) a que Mercado Pago los arme, para bajarlos
    // en la misma pasada: aparece en su lista un archivo del mes que antes no estaba.
    const antes = await reportesDelMes(d, mes);
    const r = await muestraMes(d, mes);
    if ("error" in r && r.error) throw new Error(String(r.error));
    let faltan = ["settlement_report", "release_report"];
    for (let i = 0; i < 9 && faltan.length; i++) {
      await new Promise((ok) => setTimeout(ok, 20_000));
      const ahora = await reportesDelMes(d, mes);
      faltan = faltan.filter((f) => ![...ahora[f]].some((n) => !antes[f].has(n)));
    }
    await bajarReportes(d, mes);
    const nombres: Record<string, string> = { settlement_report: "Todas las transacciones", release_report: "Liquidaciones" };
    return faltan.length
      ? `Pagos bajados. Mercado Pago todavía no armó ${faltan.map((f) => nombres[f]).join(" ni ")}: en unos minutos apretá «Bajar reportes del mes».`
      : "Listo: reportes y pagos del mes bajados.";
  });
}

export type PasoVista = { cuando: string; paso: string; status: number | null; resumen: string };

export async function ultimosPasos(espacioId: number): Promise<PasoVista[]> {
  return consulta<PasoVista>(`
    select to_char(p.ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') cuando, p.paso, p.status, left(coalesce(p.datos::text, ''), 220) resumen
      from personal.mp_paso p join personal.mp_conexion c on c.id = p.conexion_id where c.espacio_id = $1 order by p.id desc limit 20`, [espacioId]);
}

export type ArchivoVista = { id: number; fuente: string; nombre: string; bytes: number; bajado: string; sha: string };

export async function archivosDelEspacio(espacioId: number): Promise<ArchivoVista[]> {
  return consulta<ArchivoVista>(`
    select a.id::int, a.fuente, a.nombre, a.bytes, to_char(a.bajado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') bajado, left(a.sha256, 12) sha
      from personal.mp_archivo a join personal.mp_conexion c on c.id = a.conexion_id where c.espacio_id = $1 order by a.id desc limit 200`, [espacioId]);
}

/** Un archivo original, sólo si es de una cuenta del espacio. */
export async function archivoDelEspacio(espacioId: number, archivoId: number) {
  return una<{ nombre: string; contenido: Buffer }>(`
    select a.nombre, a.contenido from personal.mp_archivo a join personal.mp_conexion c on c.id = a.conexion_id
     where a.id = $1 and c.espacio_id = $2`, [archivoId, espacioId]);
}

export type SondaVista = { conexionId: number; datos: Record<string, unknown> };

export async function ultimasSondas(espacioId: number): Promise<SondaVista[]> {
  return consulta<SondaVista>(`
    select distinct on (s.conexion_id) s.conexion_id::int "conexionId", s.datos
      from personal.mp_sonda s join personal.mp_conexion c on c.id = s.conexion_id where c.espacio_id = $1 order by s.conexion_id, s.ts desc`, [espacioId]);
}

/** Pone en la cola el año pedido (meses cerrados de desde a hasta y el mes en curso hasta hoy) de una cuenta del espacio. */
export async function exportarAnio(espacioId: number, conexionId: number, desdeMes: string, hastaMes: string) {
  const c = await cuentaDelEspacio(espacioId, conexionId);
  if (!c) throw new Error("Esa cuenta no es de este espacio.");
  const { encolar } = await import("@/lib/mercadopago/cola-export");
  return encolar(destinoPersonal(c.id, Number(c.mp_user_id)), desdeMes, hastaMes, true);
}

export type ItemVista = { conexionId: number; fuente: string; etiqueta: string; estado: string; intentos: number; mensaje: string | null; actualizado: string };

/** Cómo va la cola de la exportación de las cuentas del espacio. */
export async function colaDelEspacio(espacioId: number): Promise<ItemVista[]> {
  return consulta<ItemVista>(`
    select i.conexion_id::int "conexionId", i.fuente, i.etiqueta, i.estado, i.intentos, i.mensaje,
           to_char(i.actualizado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') actualizado
      from personal.mp_item i join personal.mp_conexion c on c.id = i.conexion_id
     where c.espacio_id = $1 order by i.conexion_id, i.desde nulls first, i.id`, [espacioId]);
}
