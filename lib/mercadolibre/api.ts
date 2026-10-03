// La API de Mercado Libre, por cuenta (meli_cuenta). Renueva la llave sola
// (lib/meli.ts → tokenDeCuenta) y reintenta lo que ML corta por exceso de
// pedidos (429) o errores suyos (5xx).

import { API, tokenDeCuenta } from "@/lib/meli";
import { consulta, una, ErrorErp } from "@/lib/erp/base";

export type CuentaMl = { id: number; organizacionId: string; canalId: number | null; meliUserId: number; nickname: string | null; estado: string };

type FilaCuenta = { id: string; organizacion_id: string; canal_id: string | null; meli_user_id: string; nickname: string | null; estado: string };
const aCuenta = (f: FilaCuenta): CuentaMl => ({
  id: Number(f.id), organizacionId: f.organizacion_id, canalId: f.canal_id ? Number(f.canal_id) : null,
  meliUserId: Number(f.meli_user_id), nickname: f.nickname, estado: f.estado,
});
const COLS = "id, organizacion_id, canal_id, meli_user_id, nickname, estado";

export async function cuentasDe(org: string): Promise<CuentaMl[]> {
  return (await consulta<FilaCuenta>(`select ${COLS} from meli_cuenta where organizacion_id = $1 order by id`, [org])).map(aCuenta);
}
/** Las cuentas activas que tienen canal (las que venden por Laucen), de todas las organizaciones. */
export async function cuentasActivas(): Promise<CuentaMl[]> {
  return (await consulta<FilaCuenta>(`select ${COLS} from meli_cuenta where estado = 'activa' and canal_id is not null order by id`)).map(aCuenta);
}
export async function cuentaPorUsuario(meliUserId: number): Promise<CuentaMl | null> {
  const f = await una<FilaCuenta>(`select ${COLS} from meli_cuenta where meli_user_id = $1 and canal_id is not null order by id limit 1`, [meliUserId]);
  return f ? aCuenta(f) : null;
}
export async function cuentaDelCanal(org: string, canalId: number): Promise<CuentaMl | null> {
  const f = await una<FilaCuenta>(`select ${COLS} from meli_cuenta where organizacion_id = $1 and canal_id = $2`, [org, canalId]);
  return f ? aCuenta(f) : null;
}

export type RespuestaMl<T = unknown> = { status: number; datos: T };

/** Un pedido a la API con la llave de la cuenta. Nunca tira por HTTP:
 *  devuelve status y cuerpo (status 0 = no hubo respuesta). */
export async function ml<T = unknown>(cuenta: CuentaMl, metodo: "GET" | "POST" | "PUT" | "DELETE", ruta: string,
  cuerpo?: unknown, encabezados: Record<string, string> = {}): Promise<RespuestaMl<T>> {
  const token = await tokenDeCuenta(cuenta.id);
  if (!token) return { status: 401, datos: { message: "la cuenta de Mercado Libre está desconectada" } as T };
  for (let intento = 0; ; intento++) {
    try {
      const r = await fetch(`${API}${ruta}`, {
        method: metodo,
        headers: {
          accept: "application/json", authorization: `Bearer ${token}`,
          ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}), ...encabezados,
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if ((r.status === 429 || r.status >= 500) && intento < 2) {
        await new Promise((ok) => setTimeout(ok, 1000 * (intento + 1)));
        continue;
      }
      const texto = await r.text();
      let datos: unknown = texto;
      try { datos = JSON.parse(texto); } catch { /* queda como texto */ }
      return { status: r.status, datos: datos as T };
    } catch (e) {
      if (intento < 2) continue;
      return { status: 0, datos: { message: String(e) } as T };
    }
  }
}

/** Igual que `ml`, pero tira ErrorErp en criollo si ML no contesta 2xx. */
export async function mlOk<T = unknown>(cuenta: CuentaMl, metodo: "GET" | "POST" | "PUT" | "DELETE", ruta: string,
  cuerpo?: unknown, encabezados?: Record<string, string>): Promise<T> {
  const r = await ml<T>(cuenta, metodo, ruta, cuerpo, encabezados);
  if (r.status >= 200 && r.status < 300) return r.datos;
  const d = r.datos as { message?: string; error?: string; cause?: { message?: string }[] } | string;
  const detalle = typeof d === "string" ? d.slice(0, 200)
    : [d?.message, ...(Array.isArray(d?.cause) ? d.cause.map((c) => c?.message) : [])].filter(Boolean).join(" · ").slice(0, 300);
  const queEs = r.status === 401 ? "la cuenta está desconectada (hay que volver a conectarla)"
    : r.status === 403 ? "Mercado Libre no deja hacer esto con esta cuenta" : r.status === 404 ? "Mercado Libre no lo encuentra"
    : r.status === 0 ? "Mercado Libre no respondió" : `Mercado Libre contestó ${r.status}`;
  throw new ErrorErp(`${queEs}${detalle ? `: ${detalle}` : ""}`);
}

/** Un archivo para mandar a ML (ej. el PDF de una factura). */
export type ArchivoMl = { nombre: string; tipo: string; datos: Uint8Array };

/** El cuerpo multipart/form-data con un solo archivo en el campo `campo`.
 *  fetch le pone solo el content-type con su boundary. */
export function armarMultipart(campo: string, archivo: ArchivoMl): FormData {
  const fd = new FormData();
  fd.append(campo, new Blob([Buffer.from(archivo.datos)], { type: archivo.tipo }), archivo.nombre);
  return fd;
}

/** Como `ml`, pero manda un archivo como multipart/form-data (POST). Mismos
 *  ritmo; la llave va sólo en el encabezado y no se registra nunca. */
export async function mlArchivo<T = unknown>(cuenta: CuentaMl, ruta: string, campo: string, archivo: ArchivoMl): Promise<RespuestaMl<T>> {
  const token = await tokenDeCuenta(cuenta.id);
  if (!token) return { status: 401, datos: { message: "la cuenta de Mercado Libre está desconectada" } as T };
  for (let intento = 0; ; intento++) {
    try {
      const r = await fetch(`${API}${ruta}`, {
        method: "POST",
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        body: armarMultipart(campo, archivo),
        cache: "no-store",
        signal: AbortSignal.timeout(40_000),
      });
      // Sólo se reintenta acá lo que ML cortó sin procesar (429): un 5xx o
      // un corte pudo haber subido el archivo, y eso lo decide la cola.
      if (r.status === 429 && intento < 2) {
        await new Promise((ok) => setTimeout(ok, 1000 * (intento + 1)));
        continue;
      }
      const texto = await r.text();
      let datos: unknown = texto;
      try { datos = JSON.parse(texto); } catch { /* queda como texto */ }
      return { status: r.status, datos: datos as T };
    } catch (e) {
      return { status: 0, datos: { message: String(e) } as T };
    }
  }
}
