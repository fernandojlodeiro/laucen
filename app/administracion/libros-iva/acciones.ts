"use server";

// Libros de IVA › «Mandar al Drive del contador» (Fer, 23/10): arma los TXT del Libro de IVA Digital del mes de la
// razón social y los sube, de fondo, a la carpeta del contador en Google Drive (lib/google/drive.ts), en la subcarpeta
// "AAAA-MM · razón social". Si ya se habían mandado, los reemplaza.

import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { archivosLibroIvaDigital, rangoMes } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { subirAlDrive } from "@/lib/google/drive";

export async function accionMandarAlDrive(fd: FormData) {
  const s = await entrarErp("libros_iva_ver");
  const mes = String(fd.get("mes") ?? "");
  const rs = Number(fd.get("rs")) || 0;
  return deFondo(s, "drive-libro-iva", "Mandar el Libro de IVA al Drive del contador", async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorErp("Elegí un mes entero.");
    const e = await una<{ nombre: string }>("select coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and id = $2", [s.org.id, rs]);
    if (!e) throw new ErrorErp("Elegí la razón social.");
    const { desde, hasta } = rangoMes(mes);
    const { ventas, compras } = await libroIvaPeriodo(s.org.id, desde, hasta, rs);
    const archivos = archivosLibroIvaDigital(mes.replace("-", ""), ventas, compras)
      .map((a) => ({ nombre: a.nombre, contenido: Buffer.from(a.contenido, "latin1"), tipo: "text/plain" }));
    const n = await subirAlDrive(s.org.id, `${mes} · ${e.nombre}`, archivos);
    return `Listo: ${n} archivos del Libro de IVA de ${mes.split("-").reverse().join("/")} en el Drive del contador.`;
  });
}
