"use server";

// Sugerencia de compra: grabar los montos y criterios de «¿avión o barco?» (lib/compras/via.ts).

import { revalidatePath, revalidateTag } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, numero } from "@/lib/erp/acciones";
import { CAMPOS_VIA, guardarConfigVia, type ConfigVia } from "@/lib/compras/via";
import { pedirTanda } from "@/lib/compras/precio-mercado";
import { consulta, ErrorErp, una } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { after } from "next/server";
import { guardarPrecio, precioDe } from "@/lib/precios";
import { precioCambiadoAMano } from "@/lib/precios-ml/preparar";

const LISTA = "/compras/sugerencia";

export async function accionGuardarVia(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    const c = Object.fromEntries(CAMPOS_VIA.map(([k]) => [k, numero(fd, k) ?? -1])) as ConfigVia;
    await guardarConfigVia(s.org.id, c);
    revalidateTag(`sugerencia-compra-${s.org.id}`);
    revalidatePath(LISTA);
    return "Grabado.";
  });
}

/** Busca el precio de mercado (Mercado Libre, Apify) de los productos de la lista que se está viendo. */
export async function accionPrecioMercado(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const ids = String(fd.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return deFondo(s, "precio-mercado", "Precio de mercado", async () => {
    const productos = await consulta<{ id: number; titulo: string }>("select id::int, titulo from producto where organizacion_id = $1 and id = any($2::bigint[])", [s.org.id, ids]);
    const r = await pedirTanda(s.org.id, s.usuario.id, productos);
    revalidatePath(LISTA);
    return `Buscando ${r.total} productos en Mercado Libre (unos US$ ${r.usd.toFixed(2)}). Tarda unos ${Math.max(2, Math.ceil(r.total / 25) * 4)} minutos; la columna «Mercado» se va llenando.`;
  });
}

/** «El correcto es el del mercado» (Fer, 28/10): la Clásica de la variación pasa al precio de mercado (el más barato de los
 *  iguales), redondeado a pesos. Es un cambio de precio a mano: queda en el Historial de precios de lista y va a Mercado
 *  Libre en el acto, igual que al cambiarlo en Listas de precios. Un precio en dólares se guarda en dólares, en proporción. */
export async function accionClasicaAMercado(fd: FormData) {
  const s = await entrarErp("precios_ver");
  const variacion = Number(fd.get("variacion"));
  return deFondo(s, `clasica-mercado-${variacion}`, "Clásica al precio de mercado", async () => {
    const v = await una<{ producto_id: number; sku: string; lista: number | null }>(`
      select va.producto_id::int, va.sku,
             (select id::int from lista_precios where organizacion_id = $1
               order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1) lista
        from variacion va where va.organizacion_id = $1 and va.id = $2`, [s.org.id, variacion]);
    if (!v || v.lista == null) throw new ErrorErp("No se encontró el producto o la lista Clásica.");
    const m = await una<{ minimo: number | null }>("select minimo::float8 from precio_mercado where organizacion_id = $1 and producto_id = $2 and estado = 'ok'", [s.org.id, v.producto_id]);
    if (!m?.minimo) throw new ErrorErp(`${v.sku} no tiene precio de mercado.`);
    const nuevo = Math.round(m.minimo);
    const p = await precioDe(s.org.id, variacion, v.lista);
    const usd = p && p.monedaOrigen === "USD" && p.lista.ars > 0 ? (p.lista.usd * nuevo) / p.lista.ars : null;
    await guardarPrecio(s.org.id, { listaId: v.lista, variacionId: variacion, importe: usd ?? nuevo, moneda: usd != null ? "USD" : "ARS", usuarioId: s.usuario.id,
      motivo: "Sugerencia de compra: el correcto es el precio de mercado" });
    after(() => precioCambiadoAMano(s.org.id, variacion).catch((e) => console.error("[precios ml] en el acto", e instanceof Error ? e.message : e)));
    revalidateTag(`sugerencia-compra-${s.org.id}`);
    revalidatePath(LISTA);
    return `${v.sku}: la Clásica quedó en $ ${nuevo.toLocaleString("es-AR")}${p ? ` (antes $ ${Math.round(p.lista.ars).toLocaleString("es-AR")})` : ""}.`;
  });
}
