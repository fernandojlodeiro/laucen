// Autenticación de la API del cimiento (orden 136, §8.3): cada canal tiene su
// token en canal.config->>'token' (se genera en Configuración → Canales). El
// que llama manda `Authorization: Bearer <token>`. La tienda web es otro
// deploy de Vercel: no comparte sesión con este backend.

import { timingSafeEqual } from "node:crypto";
import { una, motivoErp, ErrorErp } from "@/lib/erp/base";

export type CanalApi = { id: number; organizacionId: string; nombre: string; tipo: string; listaPreciosId: number | null };

export async function canalDelPedido(req: Request): Promise<CanalApi | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length < 20) return null;
  const r = await una<{ id: string; organizacion_id: string; nombre: string; tipo: string; lista_precios_id: string | null; token: string }>(`
    select id, organizacion_id, nombre, tipo, lista_precios_id, config->>'token' token
      from canal where config->>'token' = $1 and estado <> 'archivado'`, [token]);
  if (!r || !timingSafeEqual(Buffer.from(r.token), Buffer.from(token))) return null;
  return { id: Number(r.id), organizacionId: r.organizacion_id, nombre: r.nombre, tipo: r.tipo, listaPreciosId: r.lista_precios_id ? Number(r.lista_precios_id) : null };
}

export const noAutorizado = () =>
  Response.json({ error: "Falta el token del canal o no es válido (Authorization: Bearer <token>)." }, { status: 401 });

/** Respuesta de error: los de negocio (en criollo) con 422; el resto, 500 sin detalles. */
export function respuestaError(e: unknown) {
  const err = e as { code?: string };
  const negocio = e instanceof ErrorErp || err?.code === "P0001";
  return Response.json({ error: motivoErp(e) }, { status: negocio ? 422 : 500 });
}
