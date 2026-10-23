"use server";

// Libros de IVA › «Mandar al Drive» (Fer, 23/10): arma los TXT del Libro de IVA Digital del mes de la razón social y
// los sube, de fondo, a su carpeta de ese mes en el Drive (año › mes › carpeta, según la ruta cargada en Configuración ›
// Google Drive; lib/google/drive.ts). Si ya se habían mandado, los reemplaza.

import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { archivosLibroIvaDigital, rangoMes } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { subirAlDrive } from "@/lib/google/drive";
import { intentar } from "@/lib/erp/acciones";
import { leerLibroVentas, importarVentasExternas } from "@/lib/administracion/ventas-externas";

export async function accionMandarAlDrive(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const mes = String(fd.get("mes") ?? "");
  const rs = Number(fd.get("rs")) || 0;
  return deFondo(s, "drive-libro-iva", "Mandar el Libro de IVA al Drive", async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorErp("Elegí un mes entero.");
    const e = await una<{ nombre: string }>("select coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and id = $2", [s.org.id, rs]);
    if (!e) throw new ErrorErp("Elegí la razón social.");
    const { desde, hasta } = rangoMes(mes);
    const { ventas, compras } = await libroIvaPeriodo(s.org.id, desde, hasta, rs);
    const archivos = archivosLibroIvaDigital(mes.replace("-", ""), ventas, compras)
      .map((a) => ({ nombre: a.nombre, contenido: Buffer.from(a.contenido, "latin1"), tipo: "text/plain" }));
    const r = await subirAlDrive(s.org.id, rs, mes, archivos);
    return `Listo: ${r.cantidad} archivos del Libro de IVA de ${mes.split("-").reverse().join("/")} en ${r.donde}.`;
  });
}

// «Ventas de otro sistema» (Fer, 23/10): los dos TXT de ventas del Libro de IVA Digital que exportó el sistema anterior
// (Virtual Seller) quedan en venta_externa y el libro los suma como propios (lib/administracion/ventas-externas.ts).
export async function accionImportarVentasExternas(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const volver = String(fd.get("volver") ?? "/administracion/libros-iva");
  return intentar(volver.startsWith("/administracion/libros-iva") ? volver : "/administracion/libros-iva", async () => {
    const rs = Number(fd.get("rs")) || 0;
    const sistema = String(fd.get("sistema") ?? "").trim() || "Otro sistema";
    const cbte = fd.get("comprobantes"), alic = fd.get("alicuotas");
    if (!(cbte instanceof File) || !cbte.size) throw new ErrorErp("Elegí el TXT de comprobantes de ventas.");
    if (!(alic instanceof File) || !alic.size) throw new ErrorErp("Elegí el TXT de alícuotas de ventas.");
    const { cbtes, errores } = leerLibroVentas(await textoDe(cbte), await textoDe(alic));
    const graves = errores.filter((e) => !e.includes("sin ninguna alícuota"));
    if (graves.length) throw new ErrorErp(`${graves.slice(0, 3).join(" ")}${graves.length > 3 ? ` (y ${graves.length - 3} más)` : ""}`);
    const r = await importarVentasExternas(s.org.id, rs, sistema, cbte.name, cbtes);
    const f = (x: string) => x.split("-").reverse().join("/");
    return `Ventas de ${sistema} del ${f(r.desde)} al ${f(r.hasta)}: ${r.nuevos} nuevas, ${r.reemplazados} actualizadas${r.yaEnLaucen ? `, ${r.yaEnLaucen} salteadas porque ya están en Laucen` : ""}.${errores.length ? ` Ojo: ${errores.join(" ")}` : ""}`;
  });
}

async function textoDe(f: File) {
  const b = Buffer.from(await f.arrayBuffer());
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return b.toString("latin1"); }
}
