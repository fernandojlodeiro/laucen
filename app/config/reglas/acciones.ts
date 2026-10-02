"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id, tildado } from "@/lib/erp/acciones";
import { CONDICIONES, ACCIONES, type Condicion, type Accion } from "./comun";

const VOLVER = "/config/reglas";
const MEDIOS = ["mercadopago", "payway", "transferencia", "efectivo", "cuenta_corriente"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Lee la regla del formulario y la arma como la guarda la base. */
async function leer(org: string, fd: FormData) {
  const nombre = texto(fd, "nombre");
  if (!nombre) throw new ErrorErp("Ponele un nombre a la regla (ej. 3x Placas 10 %).");
  const forma = String(fd.get("forma") ?? "");
  if (!Object.hasOwn(CONDICIONES, forma)) throw new ErrorErp("Elegí la condición.");
  let condicion: Condicion;
  if (forma.startsWith("cantidad_")) {
    const cantidad = entero(fd, "cantidad");
    if (!cantidad || cantidad < 1) throw new ErrorErp("Poné cuántas unidades hay que comprar.");
    condicion = { tipo: "cantidad_minima", cantidad };
    if (forma === "cantidad_producto") {
      const sku = texto(fd, "sku");
      if (!sku) throw new ErrorErp("Poné el SKU del producto.");
      const p = await una<{ id: number }>(`
        select p.id::int from producto p
         where p.organizacion_id = $1 and (upper(p.sku_base) = upper($2) or exists (select 1 from variacion v where v.producto_id = p.id and upper(v.sku) = upper($2)))
         order by (upper(p.sku_base) = upper($2)) desc limit 1`, [org, sku]);
      if (!p) throw new ErrorErp(`No encontré ningún producto con el SKU ${sku}.`);
      condicion.producto_id = p.id;
    } else if (forma === "cantidad_familia") {
      const f = await una<{ id: number }>("select id::int from familia where id = $1 and organizacion_id = $2", [id(fd, "familia_id"), org]);
      if (!f) throw new ErrorErp("Elegí la familia.");
      condicion.familia_id = f.id;
    }
  } else if (forma === "monto_minimo") {
    const monto = numero(fd, "monto");
    if (!monto || monto <= 0) throw new ErrorErp("Poné desde qué monto vale.");
    condicion = { tipo: "monto_minimo", monto };
  } else {
    const medio = String(fd.get("medio") ?? "");
    if (!MEDIOS.includes(medio)) throw new ErrorErp("Elegí el medio de pago.");
    condicion = { tipo: "medio_pago", medio };
  }

  const tipoAccion = String(fd.get("accion") ?? "");
  if (!Object.hasOwn(ACCIONES, tipoAccion)) throw new ErrorErp("Elegí qué hace la regla.");
  const accion: Accion = { tipo: tipoAccion };
  if (tipoAccion !== "envio_bonificado") {
    const valor = numero(fd, "valor");
    if (!valor || valor <= 0) throw new ErrorErp("Poné cuánto se descuenta.");
    if (tipoAccion === "descuento_pct" && valor > 100) throw new ErrorErp("El descuento no puede pasar de 100 %.");
    accion.valor = valor;
  }

  const desde = texto(fd, "desde"), hasta = texto(fd, "hasta");
  if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) throw new ErrorErp("Revisá las fechas de vigencia.");
  if (desde && hasta && hasta < desde) throw new ErrorErp("La vigencia termina antes de empezar.");
  return { nombre, condicion, accion, desde, hasta, acumulable: tildado(fd, "acumulable"), prioridad: entero(fd, "prioridad") ?? 0 };
}

export async function accionCrearRegla(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(VOLVER, async () => {
    const r = await leer(s.org.id, fd);
    await consulta(`insert into regla_comercial (organizacion_id, canal_id, nombre, activa, condicion, accion, desde, hasta, acumulable, prioridad)
                    values ($1, null, $2, true, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
      [s.org.id, r.nombre, JSON.stringify(r.condicion), JSON.stringify(r.accion), r.desde, r.hasta, r.acumulable, r.prioridad]);
    revalidatePath(VOLVER);
    return "Regla creada (activa).";
  });
}

export async function accionGuardarRegla(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(VOLVER, async () => {
    const r = await leer(s.org.id, fd);
    const filas = await consulta(`
      update regla_comercial set nombre = $3, condicion = $4::jsonb, accion = $5::jsonb, desde = $6, hasta = $7, acumulable = $8, prioridad = $9
       where id = $1 and organizacion_id = $2 returning id`,
      [id(fd), s.org.id, r.nombre, JSON.stringify(r.condicion), JSON.stringify(r.accion), r.desde, r.hasta, r.acumulable, r.prioridad]);
    if (!filas.length) throw new ErrorErp("Esa regla no existe.");
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

export async function accionActivarRegla(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(VOLVER, async () => {
    const prender = fd.get("valor") === "1";
    await consulta("update regla_comercial set activa = $3 where id = $1 and organizacion_id = $2", [id(fd), s.org.id, prender]);
    revalidatePath(VOLVER);
    return prender ? "Regla prendida." : "Regla apagada.";
  });
}

export async function accionBorrarRegla(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(VOLVER, async () => {
    await consulta("delete from regla_comercial where id = $1 and organizacion_id = $2", [id(fd), s.org.id]);
    revalidatePath(VOLVER);
    return "Borrada.";
  });
}
