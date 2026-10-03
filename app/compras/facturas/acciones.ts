"use server";

// Acciones de Facturas de compra. La cabecera y las líneas se escriben acá
// mientras la factura es borrador; los totales los recalcula siempre
// recalcularFactura() y el registro (stock, costo, cuenta corriente) lo hace
// registrarFactura().

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id, tildado } from "@/lib/erp/acciones";
import { recalcularFactura, agregarLineaFactura, registrarFactura } from "@/lib/administracion/compras";
import { deLaOrg, tituloVariacion, LETRAS, ALICUOTAS } from "../comun";

const LISTA = "/compras/facturas";
const detalle = (fid: number) => `${LISTA}/${fid}`;
const r2 = (x: number) => Math.round(x * 100) / 100;
const esFecha = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** La factura tiene que ser de la organización y estar en borrador. */
async function borrador(org: string, fid: number) {
  const f = await una<{ estado: string }>("select estado from factura_compra where id = $1 and organizacion_id = $2", [fid, org]);
  if (!f) throw new ErrorErp("La factura no existe.");
  if (f.estado !== "borrador") throw new ErrorErp("La factura ya está registrada: no se cambia.");
}

/** Lee y valida la cabecera del formulario (alta y edición). */
async function cabecera(org: string, fd: FormData, fid = 0) {
  const proveedorId = await deLaOrg(org, "proveedor", id(fd, "proveedor"), "El proveedor");
  if (!proveedorId) throw new ErrorErp("Elegí el proveedor.");
  const letra = String(fd.get("letra") ?? "A");
  if (!(LETRAS as readonly string[]).includes(letra)) throw new ErrorErp("Elegí la letra de la factura.");
  const esNc = tildado(fd, "es_nota_credito");
  const puntoVenta = entero(fd, "punto_venta");
  const nro = entero(fd, "numero");
  if ((puntoVenta != null && puntoVenta < 0) || (nro != null && nro < 0)) throw new ErrorErp("El punto de venta y el número no pueden ser negativos.");
  const fecha = texto(fd, "fecha");
  if (!esFecha(fecha)) throw new ErrorErp("Poné la fecha de la factura.");
  const venc = texto(fd, "vencimiento");
  const moneda = fd.get("moneda") === "USD" ? "USD" : "ARS";
  const cot = moneda === "USD" ? numero(fd, "cotizacion") : 1;
  if (moneda === "USD" && !(cot && cot > 0)) throw new ErrorErp("Si la factura es en dólares, poné la cotización.");
  const depositoId = await deLaOrg(org, "deposito", id(fd, "deposito"), "El depósito");
  const recepcionId = await deLaOrg(org, "recepcion", id(fd, "recepcion"), "La recepción");
  const cuentaId = await deLaOrg(org, "plan_cuenta", id(fd, "cuenta_gasto"), "La cuenta contable");
  // El número repetido lo frena el índice único; acá se avisa en criollo.
  if (nro != null) {
    const otra = await una<{ id: number }>(`
      select id::int from factura_compra where organizacion_id = $1 and proveedor_id = $2 and letra = $3 and es_nota_credito = $4 and not es_nota_debito
         and punto_venta is not distinct from $5 and numero = $6 and estado <> 'anulada' and id <> $7`,
      [org, proveedorId, letra, esNc, puntoVenta, nro, fid]);
    if (otra) throw new ErrorErp(`Ese comprobante de ese proveedor ya está cargado (factura #${otra.id}).`);
  }
  return { proveedorId, letra, esNc, puntoVenta, nro, fecha: fecha!, venc: esFecha(venc) ? venc : null, moneda, cot: cot!, depositoId, recepcionId, cuentaId, notas: texto(fd, "notas") };
}

export async function accionCrearFactura(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(`${LISTA}/nueva`, async () => {
    const c = await cabecera(s.org.id, fd);
    const r = await una<{ id: number }>(`
      insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, punto_venta, numero, fecha, vencimiento, moneda, cotizacion,
                                  deposito_id, recepcion_id, cuenta_gasto_id, notas, usuario_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id::int`,
      [s.org.id, c.proveedorId, c.letra, c.esNc, c.puntoVenta, c.nro, c.fecha, c.venc, c.moneda, c.cot, c.depositoId, c.recepcionId, c.cuentaId, c.notas, s.usuario.id]);
    revalidatePath(LISTA);
    return { ir: `${detalle(r!.id)}?ok=${encodeURIComponent("Factura creada: cargale las líneas.")}` };
  });
}

export async function accionGuardarCabecera(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd);
  await intentar(detalle(fid), async () => {
    await borrador(s.org.id, fid);
    const c = await cabecera(s.org.id, fd, fid);
    const imp = (k: string) => {
      const n = numero(fd, k) ?? 0;
      if (n < 0) throw new ErrorErp("Las percepciones e impuestos no pueden ser negativos.");
      return n;
    };
    await consulta(`
      update factura_compra set proveedor_id = $3, letra = $4, es_nota_credito = $5, punto_venta = $6, numero = $7, fecha = $8, vencimiento = $9,
             moneda = $10, cotizacion = $11, deposito_id = $12, recepcion_id = $13, cuenta_gasto_id = $14, notas = $15,
             percepcion_iva = $16, percepcion_iibb = $17, otros_impuestos = $18, no_gravado = $19
       where id = $2 and organizacion_id = $1 and estado = 'borrador'`,
      [s.org.id, fid, c.proveedorId, c.letra, c.esNc, c.puntoVenta, c.nro, c.fecha, c.venc, c.moneda, c.cot, c.depositoId, c.recepcionId, c.cuentaId, c.notas,
        imp("percepcion_iva"), imp("percepcion_iibb"), imp("otros_impuestos"), imp("no_gravado")]);
    await recalcularFactura(s.org.id, fid);
    revalidatePath(detalle(fid));
    return "Cabecera guardada.";
  });
}

/** Cantidad, costo e IVA de una línea (alta y edición). */
function datosLinea(fd: FormData) {
  const cantidad = numero(fd, "cantidad");
  const costoUnit = numero(fd, "costo_unit");
  const ivaPct = Number(fd.get("iva_pct"));
  if (!(cantidad && cantidad > 0)) throw new ErrorErp("Poné una cantidad mayor a cero.");
  if (costoUnit == null || costoUnit < 0) throw new ErrorErp("Poné el costo unitario (neto, sin IVA).");
  if (!(ALICUOTAS as readonly number[]).includes(ivaPct)) throw new ErrorErp("Elegí la alícuota de IVA.");
  return { cantidad, costoUnit, ivaPct };
}

export async function accionAgregarLinea(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd, "factura");
  await intentar(detalle(fid), async () => {
    await borrador(s.org.id, fid);
    const variacionId = await deLaOrg(s.org.id, "variacion", id(fd, "variacion"), "El producto elegido");
    const descripcion = texto(fd, "descripcion") ?? (variacionId ? await tituloVariacion(s.org.id, variacionId) : null);
    if (!descripcion) throw new ErrorErp("Una línea sin producto necesita una descripción.");
    await agregarLineaFactura(s.org.id, fid, { variacionId, descripcion, ...datosLinea(fd) });
    revalidatePath(detalle(fid));
    return "Línea agregada.";
  });
}

export async function accionGuardarLinea(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd, "factura");
  await intentar(detalle(fid), async () => {
    await borrador(s.org.id, fid);
    const { cantidad, costoUnit, ivaPct } = datosLinea(fd);
    const descripcion = texto(fd, "descripcion");
    if (!descripcion) throw new ErrorErp("La línea necesita una descripción.");
    const neto = r2(cantidad * costoUnit);
    const r = await consulta(`
      update factura_compra_linea set descripcion = $4, cantidad = $5, costo_unit = $6, iva_pct = $7, neto = $8, iva = $9
       where id = $3 and factura_id = $2 and organizacion_id = $1 returning id`,
      [s.org.id, fid, id(fd), descripcion, cantidad, costoUnit, ivaPct, neto, r2(neto * ivaPct / 100)]);
    if (!r.length) throw new ErrorErp("La línea no existe.");
    await recalcularFactura(s.org.id, fid);
    revalidatePath(detalle(fid));
    return { ir: `${detalle(fid)}?ok=${encodeURIComponent("Línea guardada.")}` };
  });
}

export async function accionBorrarLinea(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd, "factura");
  await intentar(detalle(fid), async () => {
    await borrador(s.org.id, fid);
    await consulta("delete from factura_compra_linea where id = $3 and factura_id = $2 and organizacion_id = $1", [s.org.id, fid, id(fd)]);
    await recalcularFactura(s.org.id, fid);
    revalidatePath(detalle(fid));
    return "Línea borrada.";
  });
}

export async function accionBorrarFactura(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd);
  await intentar(detalle(fid), async () => {
    await borrador(s.org.id, fid);
    await consulta("delete from factura_compra where id = $2 and organizacion_id = $1 and estado = 'borrador'", [s.org.id, fid]);
    revalidatePath(LISTA);
    return { ir: `${LISTA}?ok=${encodeURIComponent("Borrador borrado.")}` };
  });
}

export async function accionRegistrarFactura(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd);
  await intentar(detalle(fid), async () => {
    await registrarFactura(s.org.id, fid, s.usuario.id);
    revalidatePath(LISTA);
    revalidatePath(detalle(fid));
    return "Factura registrada: entró el stock, se actualizó el costo y quedó la deuda en la cuenta corriente.";
  });
}
