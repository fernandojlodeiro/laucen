// El registro propio de cada visitante de la tienda (Fer, 26/10; db/publicidad.sql: visitante, visitante_evento):
// visitas, productos vistos, carrito, checkout empezado, clic en WhatsApp y compra, por el id anónimo de su navegador
// (galleta lc_visitante, la pone el middleware). Cuando compra se une al cliente; cuando escribe desde el botón de
// WhatsApp, al chat. Nunca tira: si algo falla, va al log y la tienda sigue.

import { cookies } from "next/headers";
import { consulta } from "@/lib/erp/base";
import { credito, deGalleta, GALLETA_ENTRADAS, GALLETA_VISITANTE, type Entradas } from "@/lib/publicidad/atribucion";

export type TipoEvento = "visita" | "producto" | "carrito" | "checkout" | "whatsapp" | "compra";

/** El visitante de este pedido (de la tienda) y su sello de entradas. */
export async function visitaActual(): Promise<{ visitante: string | null; entradas: Entradas | null }> {
  const c = await cookies();
  const v = c.get(GALLETA_VISITANTE)?.value ?? null;
  return { visitante: v && /^[\w-]{8,64}$/.test(v) ? v : null, entradas: deGalleta(c.get(GALLETA_ENTRADAS)?.value) };
}

export async function registrarEvento(org: string, tipo: TipoEvento, o: { productoId?: number | null; pedidoId?: number | null; pagina?: string | null } = {}): Promise<void> {
  try {
    const { visitante, entradas } = await visitaActual();
    if (!visitante) return;
    await consulta(`
      insert into visitante (organizacion_id, id, primera) values ($1, $2, $3::jsonb)
      on conflict (organizacion_id, id) do update set ultimo_ts = now(), primera = coalesce(visitante.primera, excluded.primera)`,
    [org, visitante, entradas ? JSON.stringify(entradas.primera) : null]);
    await consulta(`
      insert into visitante_evento (organizacion_id, visitante, tipo, producto_id, pedido_id, pagina, entrada) values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [org, visitante, tipo, o.productoId ?? null, o.pedidoId ?? null, o.pagina?.slice(0, 300) ?? null, entradas ? JSON.stringify(credito(entradas)) : null]);
  } catch (e) { console.error("[visitantes]", tipo, e); }
}

/** Se identificó: compró (cliente) o escribió desde el botón de WhatsApp (chat). */
export async function unirVisitante(org: string, visitante: string | null, a: { clienteId?: number | null; chatId?: number | null }): Promise<void> {
  if (!visitante) return;
  await consulta(`
    update visitante set cliente_id = coalesce($3, cliente_id), chat_id = coalesce($4, chat_id), ultimo_ts = now()
     where organizacion_id = $1 and id = $2`, [org, visitante, a.clienteId ?? null, a.chatId ?? null]).catch((e) => console.error("[visitantes] unir", e));
}
