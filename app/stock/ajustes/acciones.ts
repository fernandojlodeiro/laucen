"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";
import { moverStock } from "@/lib/stock";

const BASE = "/stock/ajustes";

/** La variación por SKU o código de barras; los kits no (su stock es el de
 *  sus componentes). */
async function variacionDe(org: string, fd: FormData) {
  const sku = texto(fd, "sku");
  if (!sku) throw new ErrorErp("Falta el SKU o el código de barras.");
  const v = await una<{ id: number; sku: string; kit: boolean }>(`
    select v.id::int, v.sku, es_kit(v.id) kit from variacion v
     where v.organizacion_id = $1 and (v.sku = $2 or v.codigo_barras = $2) order by (v.sku = $2) desc limit 1`, [org, sku]);
  if (!v) throw new ErrorErp(`No hay ninguna variación con SKU o código de barras “${sku}”.`);
  if (v.kit) throw new ErrorErp("Es un kit: el stock de un kit se mueve con sus componentes. Ajustá cada componente.");
  return v;
}

/** Una ubicación activa de un depósito activo de la organización. */
async function ubicacionDe(org: string, fd: FormData, k: string) {
  const u = await una<{ id: number; nombre: string }>(`
    select u.id::int, d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end nombre
      from ubicacion u join deposito d on d.id = u.deposito_id
     where u.id = $2 and u.organizacion_id = $1 and u.estado = 'activa' and d.estado = 'activo'`, [org, id(fd, k)]);
  if (!u) throw new ErrorErp("Elegí el depósito y la ubicación.");
  return u;
}

const cantidadDe = (fd: FormData) => {
  const n = entero(fd, "cantidad");
  if (n == null || n <= 0) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  return n;
};

/** Lo que queda en la ubicación después del movimiento, para el aviso. */
async function queda(org: string, variacion: number, ubicacion: number) {
  const r = await una<{ n: number }>("select coalesce(sum(cantidad), 0)::int n from stock where organizacion_id = $1 and variacion_id = $2 and ubicacion_id = $3",
    [org, variacion, ubicacion]);
  return r?.n ?? 0;
}

export async function accionAjustar(fd: FormData) {
  const s = await entrarErp("stock_ajustar");
  await intentar(BASE, async () => {
    const v = await variacionDe(s.org.id, fd);
    const u = await ubicacionDe(s.org.id, fd, "ubicacion");
    const cantidad = cantidadDe(fd);
    const motivo = texto(fd, "motivo");
    if (!motivo) throw new ErrorErp("Contá el motivo del ajuste (ej. conteo físico, rotura).");
    const sumar = fd.get("sentido") !== "restar";
    await moverStock(s.org.id, {
      variacionId: v.id, tipo: "ajuste", cantidad,
      destinoId: sumar ? u.id : null, origenId: sumar ? null : u.id,
      referencia: { tipo: "ajuste_manual", id: randomUUID().slice(0, 8) },
      usuarioId: s.usuario.id, nota: motivo,
    });
    revalidatePath(BASE);
    return `Listo: ${sumar ? "+" : "−"}${cantidad} de ${v.sku}. En ${u.nombre} quedan ${await queda(s.org.id, v.id, u.id)}.`;
  });
}

export async function accionTransferir(fd: FormData) {
  const s = await entrarErp("stock_ajustar");
  await intentar(BASE, async () => {
    const v = await variacionDe(s.org.id, fd);
    const o = await ubicacionDe(s.org.id, fd, "origen");
    const d = await ubicacionDe(s.org.id, fd, "destino");
    if (o.id === d.id) throw new ErrorErp("El origen y el destino tienen que ser distintos.");
    const cantidad = cantidadDe(fd);
    await moverStock(s.org.id, {
      variacionId: v.id, tipo: "transferencia", cantidad, origenId: o.id, destinoId: d.id,
      referencia: { tipo: "transferencia_manual", id: randomUUID().slice(0, 8) },
      usuarioId: s.usuario.id, nota: texto(fd, "nota"),
    });
    revalidatePath(BASE);
    return `Listo: ${cantidad} de ${v.sku} pasaron de ${o.nombre} a ${d.nombre}.`;
  });
}
