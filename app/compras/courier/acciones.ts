"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero, texto } from "@/lib/erp/acciones";
import { grabarCostos, guardarParametros } from "@/lib/compras/courier";

export async function accionGuardarCompraCourier(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const cid = id(fd);
  await intentar(`/compras/courier/${cid}`, async () => {
    const ingreso = texto(fd, "ingreso");
    await guardarParametros(s.org.id, cid, {
      flete_usd_kg: numero(fd, "flete_usd_kg") ?? -1, courier_pct: numero(fd, "courier_pct") ?? -1,
      ingreso_ts: ingreso ? `${ingreso}:00-03:00` : null, proveedor: texto(fd, "proveedor"), notas: texto(fd, "notas"),
    });
    revalidatePath(`/compras/courier/${cid}`);
    return "Grabado.";
  });
}

export async function accionGrabarCostosCourier(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const cid = id(fd);
  await intentar(`/compras/courier/${cid}`, async () => {
    const r = await grabarCostos(s.org.id, cid);
    revalidatePath(`/compras/courier/${cid}`);
    return `Costos grabados en ${r.productos} productos.${r.sinProducto.length ? ` Sin producto en Laucen: ${r.sinProducto.join(", ")}.` : ""}`;
  });
}
