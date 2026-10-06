"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { condicionIva, normalizarCuit } from "@/lib/clientes";

const VOLVER = "/compras/proveedores";

function datos(fd: FormData) {
  const nombre = texto(fd, "nombre") ?? texto(fd, "razon_social");
  if (!nombre) throw new ErrorErp("El proveedor necesita un nombre.");
  const cuitTxt = texto(fd, "cuit");
  const cuit = normalizarCuit(cuitTxt);
  if (cuitTxt && !cuit && (texto(fd, "pais") ?? "AR") === "AR") throw new ErrorErp("El CUIT tiene que tener 11 dígitos.");
  return [nombre, texto(fd, "razon_social"), cuit ?? cuitTxt, condicionIva(texto(fd, "condicion_iva")), (texto(fd, "pais") ?? "AR").toUpperCase().slice(0, 2),
    texto(fd, "email"), texto(fd, "telefono"), texto(fd, "contacto"), texto(fd, "calle"), texto(fd, "localidad"), texto(fd, "provincia"),
    fd.get("moneda") === "USD" ? "USD" : "ARS", texto(fd, "condiciones_pago"), texto(fd, "notas"),
    texto(fd, "telefono_aclaracion"), texto(fd, "telefono_movil"), texto(fd, "telefono_movil_aclaracion")];
}

export async function accionCrearProveedor(fd: FormData) {
  const s = await entrarErp("proveedores_ver");
  await intentar(VOLVER, async () => {
    await consulta(`
      insert into proveedor (organizacion_id, nombre, razon_social, cuit, condicion_iva, pais, email, telefono, contacto, calle, localidad, provincia, moneda, condiciones_pago, notas,
                             telefono_aclaracion, telefono_movil, telefono_movil_aclaracion)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`, [s.org.id, ...datos(fd)]);
    revalidatePath(VOLVER);
    return "Proveedor creado.";
  });
}

export async function accionGuardarProveedor(fd: FormData) {
  const s = await entrarErp("proveedores_ver");
  await intentar(VOLVER, async () => {
    const r = await consulta(`
      update proveedor set nombre = $3, razon_social = $4, cuit = $5, condicion_iva = $6, pais = $7, email = $8, telefono = $9, contacto = $10,
             calle = $11, localidad = $12, provincia = $13, moneda = $14, condiciones_pago = $15, notas = $16,
             telefono_aclaracion = $17, telefono_movil = $18, telefono_movil_aclaracion = $19, estado = $20
       where id = $2 and organizacion_id = $1 returning id`,
      [s.org.id, id(fd), ...datos(fd), fd.get("estado") === "archivado" ? "archivado" : "activo"]);
    if (!r.length) throw new ErrorErp("El proveedor no existe.");
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

export async function accionBorrarProveedor(fd: FormData) {
  const s = await entrarErp("proveedores_ver");
  await intentar(VOLVER, async () => {
    await consulta("delete from proveedor where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(VOLVER);
    return "Borrado.";
  });
}
