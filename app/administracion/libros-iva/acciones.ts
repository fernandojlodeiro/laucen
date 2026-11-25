"use server";

// Libros de IVA › «Mandar al Drive» (Fer, 23/10 y 25/11): arma los TXT del Libro de IVA Digital del mes de la razón
// social y las ventas por provincia (Excel), y los sube, de fondo, a su carpeta de ese mes en el Drive (año › mes › carpeta, según la ruta cargada en Configuración ›
// Google Drive; lib/google/drive.ts). Si ya se habían mandado, los reemplaza.

import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una } from "@/lib/erp/base";
import { leerArchivoArca } from "@/lib/administracion/arca-mc-archivo";
import { deMisComprobantes, importarComprasExternas, type CompraExterna } from "@/lib/administracion/compras-externas";
import { deFondo } from "@/lib/tareas-fondo";
import { mandarLibroAlDrive } from "@/lib/administracion/libro-iva-drive";
import { intentar } from "@/lib/erp/acciones";
import { leerLibroVentas, importarVentasExternas } from "@/lib/administracion/ventas-externas";
import { leerMisRetenciones, importarRetenciones } from "@/lib/impuestos/retenciones";
import { esXlsViejo, tablaDeXlsViejo } from "@/lib/xls-viejo";
import { tablaDeExcel } from "@/lib/administracion/arca-mc-archivo";

export async function accionMandarAlDrive(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const mes = String(fd.get("mes") ?? "");
  const rs = Number(fd.get("rs")) || 0;
  return deFondo(s, "drive-libro-iva", "Mandar el Libro de IVA al Drive", async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorErp("Elegí un mes entero.");
    const e = await una<{ nombre: string }>("select coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and id = $2", [s.org.id, rs]);
    if (!e) throw new ErrorErp("Elegí la razón social.");
    // Los 5 TXT y las ventas por provincia; queda en el registro de subidas (lib/administracion/libro-iva-drive.ts).
    const r = await mandarLibroAlDrive(s.org.id, rs, mes, "todo", "manual", s.usuario.id);
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
    return `Ventas de ${sistema} del ${f(r.desde)} al ${f(r.hasta)}: ${r.nuevos} nuevas, ${r.reemplazados} actualizadas${r.yaEnLaucen ? `, ${r.yaEnLaucen} salteadas porque ya están en Laucen` : ""}${r.liquidados ? `, ${r.liquidados} salteadas porque su mes ya está liquidado` : ""}.${errores.length ? ` Ojo: ${errores.join(" ")}` : ""}`;
  });
}

async function textoDe(f: File) {
  const b = Buffer.from(await f.arrayBuffer());
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return b.toString("latin1"); }
}

// Compras de períodos anteriores a Laucen (Fer, 24/10): "Mis Comprobantes – Recibidos" de ARCA → compra_externa
// (lib/administracion/compras-externas.ts). Sólo para el libro: no son facturas de compra.
export async function accionImportarComprasExternas(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const volver = String(fd.get("volver") ?? "/administracion/libros-iva");
  return intentar(volver.startsWith("/administracion/libros-iva") ? volver : "/administracion/libros-iva", async () => {
    const rs = Number(fd.get("rs")) || 0;
    const archivos = fd.getAll("archivo").filter((a): a is File => a instanceof File && a.size > 0);
    if (!archivos.length) throw new ErrorErp("Elegí el archivo de Mis Comprobantes – Recibidos (.xlsx o .csv).");
    const e = await una<{ cuit: string }>("select regexp_replace(cuit, '\\D', '', 'g') cuit from emisor where organizacion_id = $1 and id = $2", [s.org.id, rs]);
    if (!e) throw new ErrorErp("Elegí la razón social.");
    const cbtes: CompraExterna[] = [];
    const errores: string[] = [];
    for (const a of archivos) {
      // ARCA le pone el CUIT al nombre del archivo: si es de la otra razón social, se avisa en vez de mezclar.
      const cuit = a.name.match(/CUIT[_ ]?(\d{11})/i)?.[1];
      if (cuit && cuit !== e.cuit) throw new ErrorErp(`«${a.name}» es del CUIT ${cuit}, no de la razón social elegida.`);
      const l = await leerArchivoArca(await a.arrayBuffer(), /\.xlsx$/i.test(a.name));
      errores.push(...l.errores);
      for (const c of l.comprobantes) {
        const x = deMisComprobantes(c);
        if ("error" in x) errores.push(x.error); else cbtes.push(x);
      }
    }
    const r = await importarComprasExternas(s.org.id, rs, "Mis Comprobantes", archivos.map((a) => a.name).join(", ").slice(0, 200), cbtes);
    const f = (x: string) => x.split("-").reverse().join("/");
    return `Compras del ${f(r.desde)} al ${f(r.hasta)}: ${r.nuevos} nuevas, ${r.reemplazados} actualizadas${r.yaEnLaucen ? `, ${r.yaEnLaucen} salteadas porque ya están cargadas como facturas de compra` : ""}${r.liquidados ? `, ${r.liquidados} salteadas porque su mes ya está liquidado` : ""}.${errores.length ? ` No entraron: ${errores.slice(0, 3).join(" ")}${errores.length > 3 ? ` (y ${errores.length - 3} más)` : ""}` : ""}`;
  });
}

// Percepciones y retenciones sufridas, de «Mis Retenciones» de ARCA (Fer, 25/11): los pagos a cuenta de IVA de la
// declaración simulada (lib/impuestos/retenciones.ts). ARCA lo baja como .xls viejo (lib/xls-viejo.ts).
export async function accionImportarRetenciones(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const volver = String(fd.get("volver") ?? "/administracion/libros-iva");
  return intentar(volver.startsWith("/administracion/libros-iva") ? volver : "/administracion/libros-iva", async () => {
    const rs = Number(fd.get("rs")) || 0;
    const a = fd.get("archivo");
    if (!(a instanceof File) || !a.size) throw new ErrorErp("Elegí el archivo de «Mis Retenciones» de ARCA (.xls o .xlsx).");
    const buf = new Uint8Array(await a.arrayBuffer());
    let tabla: (string | number | null)[][];
    try { tabla = esXlsViejo(buf) ? tablaDeXlsViejo(buf) : await tablaDeExcel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer); }
    catch (e) { if (e instanceof ErrorErp) throw e; throw new ErrorErp("No se pudo leer el archivo: bajalo de nuevo de «Mis Retenciones» de ARCA, en Excel."); }
    const { filas, errores } = leerMisRetenciones(tabla);
    const r = await importarRetenciones(s.org.id, rs, a.name.slice(0, 200), filas);
    const f = (x: string) => x.split("-").reverse().join("/");
    return `Percepciones y retenciones del ${f(r.desde)} al ${f(r.hasta)}: ${r.nuevas} nuevas${r.yaEstaban ? `, ${r.yaEstaban} ya estaban` : ""}${r.liquidadas ? `, ${r.liquidadas} salteadas porque su mes ya está liquidado` : ""}.${errores.length ? ` No entraron: ${errores.slice(0, 3).join(" ")}` : ""}`;
  });
}
