// La cola de salida a Mercado Libre (AGENTS.md → "Cambios en Mercado Libre:
// siempre por un clic de Fer"). Todo lo que se manda a ML pasa por acá:
//   · `encolar`: lo automático (stock, pausas, reactivar) y lo de la barrida
//     nocturna entra 'pendiente'. Una pendiente nueva de la misma publicación
//     y tipo reemplaza a la anterior (sólo importa el último stock o precio).
//   · `encolarLoteConBoton`: lo que pide Fer (o se prepara desde el chat)
//     queda 'preparado' en un lote, y sale recién con `mandarLote` (su clic
//     en "Mandar a Mercado Libre").
//   · `procesarCola`: el trabajador. Toma las pendientes por prioridad (pausar
//     por stock = 100, lo primero) y antigüedad, una cuenta por vez cada
//     trabajador (turno en ml_cola_canal; las cuentas van en paralelo), con un
//     ritmo prudente por cuenta, y reintenta con espera creciente lo que ML
//     corta (429) o falla de su lado (5xx). Registra qué se mandó, cuándo y
//     con qué resultado. Las llaves no se guardan ni se muestran nunca.

import { after } from "next/server";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";
import type { SubirArchivo } from "@/lib/mercadolibre/facturas";

export type TipoCambio = "stock" | "estado" | "precio" | "descuento" | "campana" | "atributos" | "crear" | "factura" | "reclamo" | "otro";
export type OrigenCambio = "automatico" | "boton" | "barrida";
/** `seguirSiFalla`: si ML lo rechaza, se sigue con el próximo pedido (ej.
 *  finalizar una publicación que ya estaba finalizada, antes de eliminarla). */
export type PedidoMl = { metodo: "PUT" | "POST" | "DELETE"; ruta: string; cuerpo?: unknown; seguirSiFalla?: boolean };

/** Lo que se graba en Laucen cuando ML acepta el cambio. */
export type Efecto = {
  publicacion?: { id: number; estado?: "activa" | "pausada" | "cerrada"; pausada_por_stock?: boolean; pausada_manual?: boolean; cantidad_publicada?: number; precio_canal?: number };
  /** Una acción sobre un reclamo (lib/mercadolibre/reclamos.ts): queda en su historia. */
  reclamo?: { id: number; descripcion: string };
};

export type CambioMl = {
  canalId: number;
  itemId: string;
  variationId?: string | null;
  publicacionId?: number | null;
  tipo: TipoCambio;
  /** stock: {cantidad?, estado?: 'paused'|'active'}; estado: {estado}; precio: {precio};
   *  atributos: {cuerpo}; cualquiera: {pedidos: PedidoMl[]} manda eso tal cual. */
  payload: Record<string, unknown>;
  antes?: Record<string, unknown> | null;
  efecto?: Efecto | null;
  prioridad?: number;
};

export const PRIORIDAD = { pausa: 100, reactivar: 50, boton: 30, normal: 10 } as const;

/** Ritmo por cuenta: como mucho un pedido cada RITMO_MS (≈200 por minuto).
 *  ML no publica un tope fijo por vendedor; esto queda muy por debajo de lo
 *  que corta, y con 5 cuentas en paralelo son ~1.000 cambios por minuto. */
export const RITMO_MS = 300;
export const MAX_INTENTOS = 6;
/** Espera antes del reintento n (1, 2, …): 30 s, 1 min, 2 min, 4 min… tope 1 h. */
export const esperaReintento = (intentos: number) => Math.min(30_000 * 2 ** Math.max(0, intentos - 1), 3_600_000);

const clave = (c: CambioMl) => `${c.canalId}|${c.itemId}|${c.variationId ?? ""}|${c.tipo}`;

export type ResultadoEncolar = { encoladas: number; reemplazadas: number; sinCambios: number };

/** Mete cambios en la cola. Sin `loteId` entran 'pendiente' (los manda el
 *  trabajador); con lote, 'preparado' (esperan el clic). Si ya hay una
 *  pendiente igual, no se duplica; si hay una distinta de la misma
 *  publicación y tipo, se reemplaza. Lo automático que ya dio error con el
 *  mismo pedido en las últimas 6 horas no se vuelve a encolar (lo retoma la
 *  barrida nocturna). */
export async function encolar(org: string, cambios: CambioMl[], opts: { origen: OrigenCambio; usuarioId?: string | null; loteId?: number | null }): Promise<ResultadoEncolar> {
  const res: ResultadoEncolar = { encoladas: 0, reemplazadas: 0, sinCambios: 0 };
  // Dentro de una misma tanda gana el último de cada publicación y tipo.
  const unicos = opts.loteId ? cambios : [...new Map(cambios.map((c) => [clave(c), c])).values()];
  for (let i = 0; i < unicos.length; i += 500) {
    const tanda = unicos.slice(i, i + 500).map((c) => ({
      canal_id: c.canalId, item_id: c.itemId, variation_id: c.variationId ?? "", publicacion_id: c.publicacionId ?? null,
      tipo: c.tipo, payload: c.payload, antes: c.antes ?? null, efecto: c.efecto ?? null,
      prioridad: c.prioridad ?? (opts.origen === "boton" ? PRIORIDAD.boton : PRIORIDAD.normal),
    }));
    const filas = await consulta<{ nuevo: boolean }>(`
      insert into ml_cola (organizacion_id, canal_id, item_id, variation_id, publicacion_id, tipo, payload, antes, efecto, prioridad,
                           estado, origen, usuario_id, lote_id)
      select $1, x.canal_id, x.item_id, x.variation_id, x.publicacion_id, x.tipo, x.payload, x.antes, x.efecto, x.prioridad,
             case when $5::bigint is null then 'pendiente' else 'preparado' end, $2, $3, $5
        from jsonb_to_recordset($4::jsonb) as x(canal_id bigint, item_id text, variation_id text, publicacion_id bigint, tipo text,
                                                 payload jsonb, antes jsonb, efecto jsonb, prioridad int)
        join canal c on c.id = x.canal_id and c.organizacion_id = $1
       where ($2 <> 'automatico' or not exists (
               select 1 from ml_cola e where e.canal_id = x.canal_id and e.item_id = x.item_id and e.variation_id = x.variation_id
                  and e.tipo = x.tipo and e.estado = 'error' and e.payload = x.payload and e.creado_ts > now() - interval '6 hours'))
         -- Lo mismo que se está mandando o se acaba de mandar (el último de esa publicación y tipo, hace
         -- menos de 2 minutos) no se repite: dos avisos de stock casi juntos lo duplicaban (Fer, 6/10).
         and ($5::bigint is not null or not exists (
               select 1 from (select e.payload, e.estado, coalesce(e.enviado_ts, e.creado_ts) ts from ml_cola e
                               where e.canal_id = x.canal_id and e.item_id = x.item_id and e.variation_id = x.variation_id and e.tipo = x.tipo
                                 and e.lote_id is null and e.estado <> 'pendiente'
                               order by e.id desc limit 1) u
                where u.payload = x.payload and u.estado in ('enviando', 'ok') and u.ts > now() - interval '2 minutes'))
      on conflict (canal_id, item_id, variation_id, tipo) where estado = 'pendiente' and lote_id is null
      do update set payload = excluded.payload, efecto = excluded.efecto, prioridad = excluded.prioridad, origen = excluded.origen,
                    usuario_id = excluded.usuario_id, publicacion_id = coalesce(excluded.publicacion_id, ml_cola.publicacion_id),
                    intentos = 0, proximo_intento_ts = now(), ultimo_error = null, reemplazos = ml_cola.reemplazos + 1
       where ml_cola.payload is distinct from excluded.payload or ml_cola.prioridad <> excluded.prioridad
      returning (xmax = 0) nuevo`,
      [org, opts.origen, opts.usuarioId ?? null, JSON.stringify(tanda), opts.loteId ?? null]);
    const nuevas = filas.filter((f) => f.nuevo).length;
    res.encoladas += nuevas;
    res.reemplazadas += filas.length - nuevas;
    res.sinCambios += tanda.length - filas.length;
  }
  if (res.encoladas + res.reemplazadas > 0 && !opts.loteId) arrancarCola();
  return res;
}

/** Lo que entra a la cola sale enseguida, sin esperar al proceso programado
 *  (Fer, 3/10): se manda después de contestar la página o el aviso (`after`).
 *  Fuera de un pedido (tests, scripts) `after` no existe y no pasa nada: lo
 *  levanta el cron de /api/erp/tareas. */
export function arrancarCola() {
  try {
    after(() => procesarCola(Date.now() + 45_000).then(() => undefined).catch((e) => console.error("[cola ML]", e instanceof Error ? e.message : e)));
  } catch { /* sin pedido en curso */ }
}

// ── Lotes con botón ─────────────────────────────────────────

/** Prepara un lote de cambios que espera el clic de Fer ("Preparado, falta
 *  tu clic"). Nada sale a ML hasta `mandarLote`. Devuelve el id del lote. */
export async function encolarLoteConBoton(org: string, canal: number | null, cambios: CambioMl[], descripcion: string, usuario: string | null): Promise<number> {
  if (!cambios.length) throw new ErrorErp("El lote no tiene ningún cambio.");
  const lote = await una<{ id: string }>(
    "insert into ml_lote (organizacion_id, canal_id, descripcion, creado_por) values ($1, $2, $3, $4) returning id",
    [org, canal, descripcion.trim() || "Cambios en Mercado Libre", usuario]);
  const id = Number(lote!.id);
  await encolar(org, cambios, { origen: "boton", usuarioId: usuario, loteId: id });
  return id;
}

/** El clic de Fer: el lote pasa a la cola ('pendiente') y lo manda el trabajador. */
export async function mandarLote(org: string, loteId: number, usuario: string | null): Promise<number> {
  const n = await enTransaccion(async (c) => {
    const l = await c.query("update ml_lote set estado = 'enviado', enviado_por = $3, enviado_ts = now() where id = $2 and organizacion_id = $1 and estado = 'preparado' returning id",
      [org, loteId, usuario]);
    if (!l.rowCount) throw new ErrorErp("Ese lote ya no está preparado (se mandó o se descartó).");
    const r = await c.query("update ml_cola set estado = 'pendiente', proximo_intento_ts = now() where lote_id = $1 and estado = 'preparado'", [loteId]);
    return r.rowCount ?? 0;
  });
  if (n) arrancarCola();
  return n;
}

export async function descartarLote(org: string, loteId: number): Promise<void> {
  await enTransaccion(async (c) => {
    const l = await c.query("update ml_lote set estado = 'descartado' where id = $2 and organizacion_id = $1 and estado = 'preparado' returning id", [org, loteId]);
    if (!l.rowCount) throw new ErrorErp("Ese lote ya no está preparado.");
    await c.query("update ml_cola set estado = 'descartado', ultimo_error = 'Descartado antes de mandarlo' where lote_id = $1 and estado = 'preparado'", [loteId]);
  });
}

/** Vuelve a la cola las que quedaron con error (de un canal, o todas). */
export async function reintentarErrores(org: string, canal?: number | null, ids?: number[]): Promise<number> {
  const filtro = [org, canal ?? null, ids?.length ? ids : null];
  // De cada publicación y tipo, la última con error; si ya hay una pendiente
  // más nueva de la misma publicación, manda ésa y la vieja se descarta.
  const r = await consulta(`
    with cand as (
      select distinct on (canal_id, item_id, variation_id, tipo, coalesce(lote_id, 0)) id, lote_id, canal_id, item_id, variation_id, tipo
        from ml_cola
       where organizacion_id = $1 and estado = 'error' and ($2::bigint is null or canal_id = $2) and ($3::bigint[] is null or id = any($3::bigint[]))
       order by canal_id, item_id, variation_id, tipo, coalesce(lote_id, 0), id desc)
    update ml_cola m set estado = 'pendiente', intentos = 0, proximo_intento_ts = now()
      from cand
     where m.id = cand.id
       and (cand.lote_id is not null or not exists (
             select 1 from ml_cola o where o.canal_id = cand.canal_id and o.item_id = cand.item_id and o.variation_id = cand.variation_id
                and o.tipo = cand.tipo and o.estado = 'pendiente' and o.lote_id is null))
    returning m.id`, filtro);
  await consulta(`
    update ml_cola set estado = 'descartado', ultimo_error = 'Hay un cambio más nuevo de la misma publicación'
     where organizacion_id = $1 and estado = 'error' and ($2::bigint is null or canal_id = $2) and ($3::bigint[] is null or id = any($3::bigint[]))`,
    filtro);
  return r.length;
}

/** Descarta pendientes o con error (no se mandan). */
/** Saca un cambio de un lote que todavía espera el clic (el tacho de la
 *  fila): queda descartado y no sale. Si el lote se queda sin nada, se
 *  descarta entero. Devuelve cuántos quedan en el lote. */
export async function sacarDelLote(org: string, colaId: number): Promise<number> {
  return enTransaccion(async (c) => {
    const r = await c.query<{ lote_id: string }>(`
      update ml_cola q set estado = 'descartado', ultimo_error = 'Sacado del lote a mano'
       where q.organizacion_id = $1 and q.id = $2 and q.estado = 'preparado'
         and exists (select 1 from ml_lote l where l.id = q.lote_id and l.estado = 'preparado')
      returning q.lote_id`, [org, colaId]);
    if (!r.rowCount) throw new ErrorErp("Ese cambio ya no está en un lote preparado (se mandó o se descartó).");
    const lote = r.rows[0].lote_id;
    const quedan = Number((await c.query<{ n: string }>("select count(*) n from ml_cola where lote_id = $1 and estado = 'preparado'", [lote])).rows[0].n);
    if (!quedan) await c.query("update ml_lote set estado = 'descartado' where id = $1 and estado = 'preparado'", [lote]);
    return quedan;
  });
}

export async function descartar(org: string, ids: number[]): Promise<number> {
  const r = await consulta(`update ml_cola set estado = 'descartado', ultimo_error = coalesce(ultimo_error, 'Descartado a mano')
     where organizacion_id = $1 and id = any($2::bigint[]) and estado in ('pendiente', 'error') returning id`, [org, ids]);
  return r.length;
}

// ── El trabajador ───────────────────────────────────────────

type FilaCola = {
  id: string; organizacion_id: string; canal_id: string; item_id: string; variation_id: string; tipo: TipoCambio;
  payload: Record<string, unknown>; efecto: Efecto | null; intentos: number;
};

/** Cómo se manda: por defecto, la API de ML. Los tests pasan otro. */
export type Enviar = (cuenta: CuentaMl, metodo: PedidoMl["metodo"], ruta: string, cuerpo?: unknown) => Promise<RespuestaMl>;

/** Los pedidos HTTP de un cambio, en orden. */
export function pedidosDe(f: { item_id: string; variation_id: string; tipo: TipoCambio; payload: Record<string, unknown> }): PedidoMl[] {
  const p = f.payload;
  if (Array.isArray(p.pedidos)) {
    return (p.pedidos as PedidoMl[]).map((x) => {
      if (!["PUT", "POST", "DELETE"].includes(x.metodo) || typeof x.ruta !== "string" || !x.ruta.startsWith("/") || x.ruta.includes("..")) {
        throw new ErrorErp("El cambio tiene un pedido mal armado.");
      }
      return x;
    });
  }
  const ruta = `/items/${f.item_id}`;
  const variacion = f.variation_id ? Number(f.variation_id) : null;
  const salida: PedidoMl[] = [];
  switch (f.tipo) {
    case "stock": {
      const cantidad = (seguir: boolean): PedidoMl => {
        const n = Math.max(0, Math.trunc(Number(p.cantidad)));
        return { metodo: "PUT", ruta, cuerpo: variacion ? { variations: [{ id: variacion, available_quantity: n }] } : { available_quantity: n }, ...(seguir ? { seguirSiFalla: true } : {}) };
      };
      if (p.estado === "paused") {
        // Pausar: primero la pausa (lo que importa) y enseguida la cantidad; si ML rechaza la
        // cantidad (ej. 0 en una pausada), la pausa ya quedó.
        salida.push({ metodo: "PUT", ruta, cuerpo: { status: p.estado } });
        if (p.cantidad != null) salida.push(cantidad(true));
      } else {
        // Reactivar: primero la cantidad (para que tenga stock) y después el estado.
        if (p.cantidad != null) salida.push(cantidad(false));
        if (p.estado) salida.push({ metodo: "PUT", ruta, cuerpo: { status: p.estado } });
      }
      break;
    }
    case "estado":
      salida.push({ metodo: "PUT", ruta, cuerpo: { status: p.estado } });
      break;
    case "precio":
      salida.push({ metodo: "PUT", ruta, cuerpo: variacion ? { variations: [{ id: variacion, price: Number(p.precio) }] } : { price: Number(p.precio) } });
      break;
    case "atributos":
      if (p.cuerpo) salida.push({ metodo: "PUT", ruta, cuerpo: p.cuerpo });
      break;
    default:
      break;
  }
  if (!salida.length) throw new ErrorErp("El cambio no dice qué mandar.");
  return salida;
}

/** Lo que contestó ML, en criollo, para la pantalla. */
export function errorLegible(status: number, datos: unknown): string {
  const d = datos as { message?: string; error?: string; cause?: { message?: string }[] } | string;
  const detalle = typeof d === "string" ? d.slice(0, 200)
    : [d?.message, ...(Array.isArray(d?.cause) ? d.cause.map((c) => c?.message) : [])].filter(Boolean).join(" · ").slice(0, 300);
  const queEs = status === 401 ? "La cuenta está desconectada (hay que volver a conectarla)"
    : status === 403 ? "Mercado Libre no deja hacer esto con esta cuenta"
    : status === 404 ? "Mercado Libre no encuentra la publicación"
    : status === 429 ? "Mercado Libre pidió que vayamos más despacio; se reintenta solo"
    : status === 0 ? "Mercado Libre no respondió; se reintenta solo"
    : status >= 500 ? `Mercado Libre tuvo un problema de su lado (${status}); se reintenta solo`
    : `Mercado Libre no lo aceptó (${status})`;
  return `${queEs}${detalle && status !== 0 ? `: ${detalle}` : ""}`;
}

/** Lo que se guarda de la respuesta: corto y sin nada sensible. */
function resumen(r: RespuestaMl): unknown {
  const d = r.datos as Record<string, unknown> | string;
  if (typeof d === "string") return { status: r.status, texto: d.slice(0, 300) };
  if (!d || typeof d !== "object") return { status: r.status };
  const { id, ids, otras, status, available_quantity, price, message, error, cause } = d as Record<string, unknown>;
  return { status: r.status, id, ids, otras, estado: status, cantidad: available_quantity, precio: price, message, error, cause };
}

async function aplicarEfecto(org: string, e: Efecto | null) {
  if (e?.reclamo?.id) await anotarEnReclamo(org, e.reclamo, true);
  const p = e?.publicacion;
  if (!p?.id) return;
  await consulta(`
    update publicacion set estado = coalesce($3, estado), pausada_por_stock = coalesce($4, pausada_por_stock), pausada_manual = coalesce($7, pausada_manual),
           cantidad_publicada = coalesce($5, cantidad_publicada), precio_canal = coalesce($6, precio_canal), ultima_sincronizacion_ts = now()
     where id = $2 and organizacion_id = $1`,
    [org, p.id, p.estado ?? null, p.pausada_por_stock ?? null, p.cantidad_publicada ?? null, p.precio_canal ?? null, p.pausada_manual ?? null]);
}

/** Lo que pasó con una acción sobre un reclamo, en su historia. Si salió,
 *  el reclamo se vuelve a leer de ML en el próximo barrido (o al tocar
 *  "Actualizar"): se borra su marca de última actualización. */
async function anotarEnReclamo(org: string, r: { id: number; descripcion: string }, ok: boolean, error?: string) {
  await consulta(`insert into reclamo_evento (organizacion_id, reclamo_id, tipo, detalle)
                  select $1, id, $3, $4 from reclamo where id = $2 and organizacion_id = $1`,
    [org, r.id, ok ? "accion_ok" : "accion_error", ok ? `Mercado Libre aceptó: ${r.descripcion}` : `${r.descripcion}: ${error ?? "con error"}`]);
  if (ok) await consulta("update reclamo set ml_actualizado = null, actualizado_ts = now() where id = $1 and organizacion_id = $2", [r.id, org]);
}

export type ResultadoCola = { canales: number; enviadas: number; ok: number; reintentos: number; errores: number; frenadas: number };

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Manda lo pendiente hasta `hastaMs`. Cada canal (cuenta) con pendientes va
 *  en paralelo, pero con un solo trabajador a la vez por canal (turno) y su
 *  ritmo. Se puede llamar desde varios lados a la vez sin pisarse. */
export async function procesarCola(hastaMs: number, opts: { enviar?: Enviar; subir?: SubirArchivo; ritmoMs?: number; org?: string } = {}): Promise<ResultadoCola> {
  const enviar: Enviar = opts.enviar ?? ((c, m, r, b) => ml(c, m, r, b));
  const ritmo = opts.ritmoMs ?? RITMO_MS;
  const res: ResultadoCola = { canales: 0, enviadas: 0, ok: 0, reintentos: 0, errores: 0, frenadas: 0 };
  // Las que quedaron "enviando" de un trabajador que se cortó vuelven a la cola.
  await consulta("update ml_cola set estado = 'pendiente' where estado = 'enviando' and tomado_ts < now() - interval '5 minutes'");
  const canales = await consulta<{ canal_id: string; organizacion_id: string }>(`
    select distinct canal_id, organizacion_id from ml_cola
     where estado = 'pendiente' and proximo_intento_ts <= now() and ($1::text is null or organizacion_id = $1)`, [opts.org ?? null]);
  await Promise.all(canales.map(async ({ canal_id, organizacion_id }) => {
    const canal = Number(canal_id);
    // El turno del canal: nadie más lo toma hasta que termine (o venza).
    const turno = await una(`
      insert into ml_cola_canal (canal_id, organizacion_id, ocupado_hasta) values ($1, $2, to_timestamp($3 / 1000.0) + interval '30 seconds')
      on conflict (canal_id) do update set ocupado_hasta = excluded.ocupado_hasta
       where ml_cola_canal.ocupado_hasta < now() and (ml_cola_canal.frenado_hasta is null or ml_cola_canal.frenado_hasta < now())
      returning canal_id`, [canal, organizacion_id, hastaMs]);
    if (!turno) return;
    res.canales++;
    let cuenta: CuentaMl | null | undefined;
    let ultimo = 0;
    try {
      while (Date.now() < hastaMs - 2_000) {
        const fila = await una<FilaCola>(`
          update ml_cola set estado = 'enviando', tomado_ts = now(), intentos = intentos + 1
           where id = (select id from ml_cola where canal_id = $1 and estado = 'pendiente' and proximo_intento_ts <= now()
                        order by prioridad desc, creado_ts, id for update skip locked limit 1)
          returning id, organizacion_id, canal_id, item_id, variation_id, tipo, payload, efecto, intentos`, [canal]);
        if (!fila) break;
        if (cuenta === undefined) cuenta = await cuentaDelCanal(organizacion_id, canal);
        let status = 0, datos: unknown = null, frenar = 0, mensajeError: string | undefined;
        let creada: string | null = null, notaCreada: string | null = null;
        if (!cuenta || cuenta.estado !== "activa") {
          status = 401; datos = { message: "la cuenta de Mercado Libre del canal no está conectada" }; frenar = 300_000;
        } else if (fila.tipo === "factura") {
          // Subir el PDF de un comprobante a la venta (lib/mercadolibre/facturas.ts).
          const { enviarFactura } = await import("@/lib/mercadolibre/facturas");
          const espera = ultimo + ritmo - Date.now();
          if (espera > 0) await dormir(espera);
          const x = await enviarFactura(fila.organizacion_id, fila.payload, cuenta, opts.subir);
          if (x.tipo === "esperar") {
            // Carrito en espera: vuelve a la cola sin contar el intento.
            await consulta("update ml_cola set estado = 'pendiente', intentos = greatest(intentos - 1, 0), proximo_intento_ts = now() + ($2 || ' milliseconds')::interval where id = $1",
              [fila.id, String(x.ms)]);
            continue;
          }
          if (x.tipo === "error") {
            await consulta("update ml_cola set estado = 'error', ultimo_error = $2, enviado_ts = now() where id = $1", [fila.id, x.mensaje]);
            res.errores++;
            continue;
          }
          if (x.enviado) { ultimo = Date.now(); res.enviadas++; }
          status = x.r.status; datos = x.r.datos; mensajeError = x.mensajeError;
          if (status === 429) frenar = 60_000;
          else if (status === 401) frenar = 300_000;
        } else {
          let pedidos: PedidoMl[];
          try {
            pedidos = pedidosDe(fila);
          } catch (e) {
            await consulta("update ml_cola set estado = 'error', ultimo_error = $2 where id = $1", [fila.id, (e as Error).message]);
            res.errores++;
            continue;
          }
          let r: RespuestaMl = { status: 200, datos: null };
          // El producto de ML (user product) del alta: las publicaciones de planes de cuotas se cuelgan de él ("{up}").
          let up: string | null = null;
          const otras: string[] = [], fallos: string[] = [];
          let cortado = false;
          for (const p of pedidos) {
            // Un alta (POST /items) devuelve el id nuevo: los pedidos que siguen lo usan en "{id}" (y su user product en "{up}").
            const ruta = p.ruta.replace("{id}", creada ?? "{id}").replace("{up}", up ?? "{up}");
            if (ruta.includes("{id}")) { r = { status: 400, datos: { message: "falta el id de la publicación recién creada" } }; cortado = true; break; }
            if (ruta.includes("{up}")) { r = { status: 400, datos: { message: "Mercado Libre no devolvió el producto (user product) de la publicación recién creada" } }; cortado = true; break; }
            const espera = ultimo + ritmo - Date.now();
            if (espera > 0) await dormir(espera);
            ultimo = Date.now();
            res.enviadas++;
            let cuerpo = p.cuerpo;
            // El id de la recién creada también en el cuerpo (ej. entrar al catálogo: {"item_id": "{id}"}).
            if (creada && cuerpo != null && JSON.stringify(cuerpo).includes("{id}")) cuerpo = JSON.parse(JSON.stringify(cuerpo).replaceAll("{id}", creada));
            else if (cuerpo != null && JSON.stringify(cuerpo).includes("\"{id}\"")) { r = { status: 400, datos: { message: "falta el id de la publicación recién creada" } }; cortado = true; break; }
            // Precios por cantidad: se nombran los precios base que ya tiene (si no, ML los borra).
            if (p.metodo === "POST" && /\/prices\/standard\/quantity$/.test(ruta)) {
              const actuales = await ml<{ prices?: { id?: string; type?: string; conditions?: { min_purchase_unit?: number } }[] }>(cuenta, "GET", ruta.replace(/\/standard\/quantity$/, ""));
              if (actuales.status !== 200) { r = actuales; cortado = true; break; }
              const { tablaVolumen } = await import("@/lib/precios-ml/motor");
              cuerpo = { prices: tablaVolumen(actuales.datos?.prices ?? [], (p.cuerpo as { prices?: unknown[] } | null)?.prices ?? []) };
            }
            r = await enviar(cuenta, p.metodo, ruta, cuerpo);
            if (fila.tipo === "crear" && p.metodo === "POST" && r.status >= 200 && r.status < 300) {
              const d = r.datos as { id?: string; user_product_id?: string } | null;
              if (p.ruta === "/items") { creada ??= d?.id ?? null; up ??= d?.user_product_id ?? null; }
              // Otra publicación sobre el mismo producto de ML (un plan de cuotas, o la de catálogo de una común): también es un alta.
              else if ((/^\/user-products\/[^/]+\/items$/.test(p.ruta) || p.ruta === "/items/catalog_listings") && d?.id) { if (creada) otras.push(d.id); else creada = d.id; }
            }
            if ((r.status < 200 || r.status >= 300) && !(p.seguirSiFalla && r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 401)) { cortado = true; break; }
            // Un paso que falló pero se sigue (ej. la descripción, o un plan de cuotas): que quede anotado.
            if (r.status < 200 || r.status >= 300) fallos.push(`${p.metodo} ${ruta}: ${errorLegible(r.status, r.datos)}`);
          }
          status = r.status; datos = r.datos;
          // Una publicación creada NUNCA se reintenta (saldría duplicada): si un paso posterior falló
          // (ej. la descripción), queda como enviada con el aviso, y se trae a Laucen igual.
          if (creada) {
            if (cortado) fallos.push(errorLegible(status, datos));
            if (fallos.length) notaCreada = `Se creó ${[creada, ...otras].join(", ")}, pero falló: ${[...new Set(fallos)].join(" · ")}`;
            status = 200; datos = { id: creada, ...(otras.length ? { otras } : {}) };
            for (const id of [creada, ...otras]) {
              try { await (await import("@/lib/mercadolibre/publicaciones")).importarItem(cuenta, id); } catch { /* la barrida la trae */ }
            }
          }
          if (status === 429) frenar = 60_000;
          else if (status === 401) frenar = 300_000;
        }
        if (status >= 200 && status < 300) {
          await consulta("update ml_cola set estado = 'ok', enviado_ts = now(), ultimo_error = $3, respuesta = $2::jsonb where id = $1",
            [fila.id, JSON.stringify(resumen({ status, datos })), notaCreada]);
          await aplicarEfecto(fila.organizacion_id, fila.efecto);
          // Un cambio de precio o de campañas: se vuelven a leer sus campañas en el momento (Fer, 9/10), así
          // las pantallas muestran ya el precio con campaña nuevo y no el de la última lectura.
          if ((fila.tipo === "precio" || fila.tipo === "campana") && cuenta && fila.item_id && !fila.item_id.includes(":")) {
            try {
              const { leerPromosItem } = await import("@/lib/precios-ml/lectura");
              const c = cuenta;
              await leerPromosItem(fila.organizacion_id, Number(fila.canal_id), fila.item_id, false, (ruta) => ml(c, "GET", ruta));
            } catch { /* la lectura periódica la trae */ }
          }
          res.ok++;
          continue;
        }
        // ¿Se reintenta? Lo que es de ML (429, 5xx, sin respuesta) o de la llave, sí; un rechazo (400, 403, 404…), no.
        const transitorio = status === 0 || status === 429 || status === 401 || status >= 500;
        const final = !transitorio || fila.intentos >= MAX_INTENTOS;
        await consulta(`
          update ml_cola set estado = $2, ultimo_error = $3, respuesta = $4::jsonb,
                 proximo_intento_ts = now() + ($5 || ' milliseconds')::interval, enviado_ts = case when $2 = 'error' then now() else enviado_ts end
           where id = $1`,
          [fila.id, final ? "error" : "pendiente", mensajeError ?? errorLegible(status, datos), JSON.stringify(resumen({ status, datos })), String(esperaReintento(fila.intentos))]);
        if (final) res.errores++; else res.reintentos++;
        if (final && fila.efecto?.reclamo?.id) await anotarEnReclamo(fila.organizacion_id, fila.efecto.reclamo, false, mensajeError ?? errorLegible(status, datos));
        if (frenar) {
          await consulta("update ml_cola_canal set frenado_hasta = now() + ($2 || ' milliseconds')::interval, motivo_freno = $3 where canal_id = $1",
            [canal, String(frenar), errorLegible(status, datos)]);
          res.frenadas++;
          break;
        }
      }
    } finally {
      await consulta("update ml_cola_canal set ocupado_hasta = now(), ultimo_envio_ts = case when $2::boolean then now() else ultimo_envio_ts end where canal_id = $1",
        [canal, ultimo > 0]);
    }
  }));
  return res;
}

/** ¿Hay algo para mandar ya? (para decidir si se llama al trabajador). */
export async function hayPendientes(): Promise<boolean> {
  return !!(await una("select 1 from ml_cola where estado = 'pendiente' and proximo_intento_ts <= now() limit 1"));
}

/** El resumen de un canal para su ficha: pendientes, con error y la última barrida. */
export async function estadoColaCanal(canal: number) {
  return una<{ pendientes: number; errores: number; preparados: number; barrida_ts: Date | null; barrida_fase: string | null; barrida_diferencias: number | null; barrida_revisadas: number | null }>(`
    select (select count(*) from ml_cola where canal_id = $1 and estado in ('pendiente', 'enviando'))::int pendientes,
           (select count(*) from ml_cola where canal_id = $1 and estado = 'error')::int errores,
           (select count(*) from ml_cola where canal_id = $1 and estado = 'preparado')::int preparados,
           b.terminada_ts barrida_ts, b.fase barrida_fase, b.diferencias barrida_diferencias, b.revisadas barrida_revisadas
      from (select 1) x left join lateral (select * from ml_barrida where canal_id = $1 order by noche desc limit 1) b on true`, [canal]);
}
