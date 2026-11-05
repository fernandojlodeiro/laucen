"use server";

// Ficha del producto, pestaña Preventa (Fer, 5/11): si admite preventa en la web y en Mercado Libre (o lo general),
// su margen de seguridad y su descuento de preventa (vacíos: los de la orden; si no, los generales).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id, numero, entero } from "@/lib/erp/acciones";

const triestado = (v: FormDataEntryValue | null) => (v === "si" ? true : v === "no" ? false : null);

export async function accionGuardarPreventaProducto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  const volver = `/catalogo/productos/${pid}?seccion=preventa`;
  await intentar(volver, async () => {
    if (!(await una("select 1 from producto where id = $1 and organizacion_id = $2", [pid, s.org.id]))) throw new ErrorErp("Ese producto no existe.");
    const mu = entero(fd, "margen_unidades"), mp = numero(fd, "margen_pct"), d = numero(fd, "descuento_pct");
    const modo = fd.get("margen_modo");
    if (mu != null && mu < 0) throw new ErrorErp("El margen en unidades no puede ser negativo.");
    if (mp != null && !(mp >= 0 && mp <= 100)) throw new ErrorErp("El margen en % va de 0 a 100.");
    if (d != null && !(d >= 0 && d <= 90)) throw new ErrorErp("El descuento de preventa va de 0 % a 90 %.");
    await consulta(`update producto set preventa_web = $3, preventa_ml = $4, preventa_margen_unidades = $5, preventa_margen_pct = $6, preventa_margen_modo = $7,
                      preventa_descuento_pct = $8 where id = $1 and organizacion_id = $2`,
      [pid, s.org.id, triestado(fd.get("preventa_web")), triestado(fd.get("preventa_ml")), mu, mp, modo === "menor" || modo === "mayor" ? modo : null, d]);
    // La tienda y Mercado Libre vuelven a mirar si lo ofrecen en preventa.
    const vs = await consulta<{ id: number }>("select id::int from variacion where producto_id = $1", [pid]);
    await consulta("insert into precio_web_pendiente (variacion_id, organizacion_id) select unnest($2::bigint[]), $1 on conflict (variacion_id) do update set desde = clock_timestamp()", [s.org.id, vs.map((v) => v.id)]).catch(() => {});
    const { sincronizarStockMl } = await import("@/lib/mercadolibre/stock");
    await sincronizarStockMl(s.org.id, vs.map((v) => v.id)).catch(() => {});
    revalidatePath(volver);
    return { ir: `${volver}&ok=${encodeURIComponent("Grabado.")}` };
  });
}
