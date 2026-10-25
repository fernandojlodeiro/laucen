"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { agregarBanners, guardarBanner, activarBanner, borrarBanner, moverBanner, esFamilia } from "@/lib/tienda/banners";

/** Vuelve a la pantalla como estaba (tienda, familia y filtro), sin la edición abierta. */
const volver = (fd: FormData) => {
  const p = new URLSearchParams();
  for (const k of ["canal", "familia", "donde"]) { const v = texto(fd, `_${k}`); if (v) p.set(k, v); }
  const s = p.toString();
  return `/config/tienda/banners${s ? `?${s}` : ""}`;
};
const familiaDe = (fd: FormData) => { const f = fd.get("familia"); if (!esFamilia(f)) throw new ErrorErp("Elegí la familia: clara u oscura."); return f; };
const dominioDe = (fd: FormData) => id(fd, "dominio_id") || null;
const listo = () => { revalidatePath("/config/tienda/banners"); revalidatePath("/tienda", "layout"); };

export async function accionAgregarBanners(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(volver(fd), async () => {
    const n = await agregarBanners(s.org.id, id(fd, "canal_id"), {
      imagenes: fd.getAll("imagen").map(String), familia: familiaDe(fd), dominioId: dominioDe(fd), link: texto(fd, "link"),
    });
    listo();
    return n === 1 ? "Listo: banner agregado." : `Listo: ${n} banners agregados.`;
  });
}

export async function accionGuardarBanner(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(volver(fd), async () => {
    await guardarBanner(s.org.id, id(fd), {
      imagen: texto(fd, "imagen"), imagenCelular: texto(fd, "imagen_celular"), familia: familiaDe(fd), dominioId: dominioDe(fd), link: texto(fd, "link"),
    });
    listo();
  });
}

export async function accionActivarBanner(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(volver(fd), async () => { await activarBanner(s.org.id, id(fd), fd.get("valor") === "1"); listo(); });
}

export async function accionBorrarBanner(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(volver(fd), async () => { await borrarBanner(s.org.id, id(fd)); listo(); });
}

export async function accionMoverBanner(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(volver(fd), async () => { await moverBanner(s.org.id, id(fd), fd.get("paso") === "-1" ? -1 : 1); listo(); });
}
