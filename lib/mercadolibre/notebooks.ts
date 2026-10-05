// Notebooks que no están activas en Mercado Libre (Fer, 5/10: "todas las notebook que no
// estén activas en ML quiero borrarlas", sin traerlas antes a Laucen). Se lee toda la cuenta
// en ML (también lo que Laucen no guarda) y se prepara UN lote para eliminarlas: cada una se
// finaliza (si no estaba finalizada) y se elimina. Sale recién con el clic de Fer en
// "Mandar a Mercado Libre" (lib/mercadolibre/cola.ts). Las activas no se tocan.

import { consulta, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { idsEnMl } from "@/lib/mercadolibre/fantasmas";
import { esNotebook, hayQueEliminar } from "@/lib/mercadolibre/es-notebook";

export { esNotebook, hayQueEliminar };

export type PreparacionNotebooks = {
  loteId: number | null; preparadas: number; revisadas: number; quedan: number; porEstado: Record<string, number>; activas: number;
};

type ItemCorto = { id: string; title?: string; status?: string; sub_status?: string[]; category_id?: string };

/** Lee la cuenta en ML y prepara el lote que elimina sus notebooks no activas. Si no alcanza
 *  el tiempo (`hastaMs`), lo leído queda en el lote y `quedan` dice cuántas faltan revisar:
 *  se vuelve a apretar (lo ya preparado no se repite). */
export async function prepararEliminarNotebooks(org: string, canalId: number, usuarioId: string, hastaMs: number): Promise<PreparacionNotebooks> {
  const cuenta: CuentaMl | null = await cuentaDelCanal(org, canalId);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("Esa cuenta de Mercado Libre no está conectada.");
  const lectura = await idsEnMl(cuenta, hastaMs);
  if (!lectura.completo || !lectura.ids.size) throw new ErrorErp("La lectura de Mercado Libre no terminó: probá de nuevo.");

  // Lo que Laucen ya sabe: lo que se sabe que NO es notebook no hace falta volver a pedirlo.
  const conocidas = new Map((await consulta<{ item_id: string; titulo: string | null; categoria: string | null }>(
    "select distinct on (item_id) item_id, titulo, categoria from meli_item where organizacion_id = $1 and canal_id = $2 order by item_id", [org, canalId]))
    .map((f) => [f.item_id, f]));
  // Lo que ya tiene pedida su eliminación (en un lote preparado, en la cola o ya enviado): no se repite.
  const yaPedidas = new Set((await consulta<{ item_id: string }>(
    `select distinct item_id from ml_cola where canal_id = $1 and tipo = 'otro' and estado in ('preparado', 'pendiente', 'enviando', 'ok')
        and payload::text like '%"deleted"%'`, [canalId])).map((f) => f.item_id));

  const aRevisar = [...lectura.ids].filter((i) => {
    if (yaPedidas.has(i)) return false;
    const c = conocidas.get(i);
    return !c || esNotebook(c.titulo, c.categoria);
  }).sort();

  const cambios: CambioMl[] = [];
  const porEstado: Record<string, number> = {};
  let activas = 0, revisadas = 0, quedan = 0;
  for (let i = 0; i < aRevisar.length; i += 20) {
    if (Date.now() > hastaMs - 4_000) { quedan = aRevisar.length - i; break; }
    const r = await ml<{ code: number; body: ItemCorto }[]>(cuenta, "GET", `/items?ids=${aRevisar.slice(i, i + 20).join(",")}&attributes=id,title,status,sub_status,category_id`);
    if (r.status !== 200 || !Array.isArray(r.datos)) throw new ErrorErp("Mercado Libre no contestó: probá de nuevo (lo ya preparado no se pierde).");
    revisadas += Math.min(20, aRevisar.length - i);
    for (const x of r.datos) {
      const it = x.body;
      if (x.code !== 200 || !it?.id || !esNotebook(it.title, it.category_id)) continue;
      if (it.status === "active") { activas++; continue; }
      if (!hayQueEliminar(it.status, it.sub_status)) continue;
      porEstado[it.status!] = (porEstado[it.status!] ?? 0) + 1;
      cambios.push({
        canalId, itemId: it.id, tipo: "otro", antes: { titulo: it.title, estado: it.status },
        payload: {
          marca: "eliminar_notebook",
          descripcion: `${it.status === "closed" ? "Eliminar" : "Finalizar y eliminar"} en ML (${it.status}): ${it.title ?? it.id}`,
          pedidos: [
            ...(it.status === "closed" ? [] : [{ metodo: "PUT" as const, ruta: `/items/${it.id}`, cuerpo: { status: "closed" }, seguirSiFalla: true }]),
            { metodo: "PUT" as const, ruta: `/items/${it.id}`, cuerpo: { deleted: "true" } },
          ],
        },
      });
    }
  }
  if (!cambios.length) return { loteId: null, preparadas: 0, revisadas, quedan, porEstado, activas };
  // Un solo lote preparado por cuenta: si ya hay uno de una vuelta anterior, se suma a ése.
  const previo = (await consulta<{ id: string }>(
    "select id from ml_lote where organizacion_id = $1 and canal_id = $2 and estado = 'preparado' and descripcion like 'Eliminar en Mercado Libre notebooks no activas%' order by id desc limit 1", [org, canalId]))[0];
  let loteId: number;
  if (previo) { loteId = Number(previo.id); await encolar(org, cambios, { origen: "boton", usuarioId, loteId }); }
  else loteId = await encolarLoteConBoton(org, canalId, cambios, "Eliminar en Mercado Libre notebooks no activas (pausadas, finalizadas, en revisión…)", usuarioId);
  return { loteId, preparadas: cambios.length, revisadas, quedan, porEstado, activas };
}
