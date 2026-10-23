"use server";

// Acciones de Facturas de compra. La cabecera y las líneas se escriben acá
// mientras la factura es borrador; los totales los recalcula siempre
// recalcularFactura() y el registro (stock, costo, cuenta corriente) lo hace
// registrarFactura().

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp, motivoErp } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { detalleIibb, leerFacturaArchivo, aComprobante } from "@/lib/compras/factura-leer";
import { codigoJurisdiccion } from "@/lib/impuestos/jurisdicciones";
import { armarFactura } from "@/lib/administracion/arca-mc-leer";
import { proximoCodigoCuenta, crearCuenta } from "@/lib/administracion/contabilidad";
import { tienePermiso } from "@/lib/permisos";
import { intentar, texto, numero, entero, id, tildado } from "@/lib/erp/acciones";
import { recalcularFactura, agregarLineaFactura, registrarFactura, volverABorrador } from "@/lib/administracion/compras";
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
  const emisorId = await deLaOrg(org, "emisor", id(fd, "emisor"), "La razón social");
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
  return { emisorId, proveedorId, letra, esNc, puntoVenta, nro, fecha: fecha!, venc: esFecha(venc) ? venc : null, moneda, cot: cot!, depositoId, recepcionId, cuentaId, notas: texto(fd, "notas") };
}

export async function accionCrearFactura(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(`${LISTA}/nueva`, async () => {
    const c = await cabecera(s.org.id, fd);
    // Sin cuenta elegida, la del proveedor (si ya tiene una).
    if (!c.cuentaId) c.cuentaId = (await una<{ id: number | null }>("select cuenta_gasto_id::int id from proveedor where id = $1 and organizacion_id = $2", [c.proveedorId, s.org.id]))?.id ?? null;
    const r = await una<{ id: number }>(`
      insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, punto_venta, numero, fecha, vencimiento, moneda, cotizacion,
                                  deposito_id, recepcion_id, cuenta_gasto_id, notas, usuario_id, emisor_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning id::int`,
      [s.org.id, c.proveedorId, c.letra, c.esNc, c.puntoVenta, c.nro, c.fecha, c.venc, c.moneda, c.cot, c.depositoId, c.recepcionId, c.cuentaId, c.notas, s.usuario.id, c.emisorId]);
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
             percepcion_iva = $16, percepcion_iibb = $17, otros_impuestos = $18, no_gravado = $19, emisor_id = coalesce($20, emisor_id)
       where id = $2 and organizacion_id = $1 and estado = 'borrador'`,
      [s.org.id, fid, c.proveedorId, c.letra, c.esNc, c.puntoVenta, c.nro, c.fecha, c.venc, c.moneda, c.cot, c.depositoId, c.recepcionId, c.cuentaId, c.notas,
        imp("percepcion_iva"), imp("percepcion_iibb"), imp("otros_impuestos"), imp("no_gravado"), c.emisorId]);
    // La provincia de la percepción de IIBB (Fer, 23/10): elegida, queda en la factura y, si el proveedor no tenía, en él.
    const jur = codigoJurisdiccion(texto(fd, "iibb_jur"));
    const perc = imp("percepcion_iibb");
    if (jur && perc > 0) {
      await consulta("update factura_compra set percepcion_iibb_detalle = $3::jsonb where id = $2 and organizacion_id = $1", [s.org.id, fid, JSON.stringify([{ jur, importe: perc }])]);
      await consulta("update proveedor set iibb_jurisdiccion = $3 where id = $2 and organizacion_id = $1 and iibb_jurisdiccion is null", [s.org.id, c.proveedorId, jur]);
    } else if (!perc) await consulta("update factura_compra set percepcion_iibb_detalle = null where id = $2 and organizacion_id = $1", [s.org.id, fid]);
    await recalcularFactura(s.org.id, fid);
    // La cuenta de gasto elegida queda en el proveedor para las próximas (Fer, 23/10).
    if (c.cuentaId) await consulta("update proveedor set cuenta_gasto_id = $3 where id = $2 and organizacion_id = $1", [s.org.id, c.proveedorId, c.cuentaId]);
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

/** «Volver a borrador» (Fer, 23/10): deshace el registro (cuenta corriente y asientos) para corregirla. */
export async function accionVolverABorrador(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const fid = id(fd);
  await intentar(detalle(fid), async () => {
    await volverABorrador(s.org.id, fid);
    revalidatePath(LISTA);
    revalidatePath(detalle(fid));
    return "Volvió a borrador: se sacó de la cuenta corriente y se anularon sus asientos. Corregila y registrala de nuevo.";
  });
}

// ── Subir la factura (PDF o foto) y que la lea la IA (Fer, 23/10) ─────────

/** «Subir factura» desde la lista: el archivo ya está en Storage (bucket "importaciones"). La IA lo lee, se arma la
 *  factura como en la importación de ARCA (líneas por alícuota; en B y C el total a gasto), con su proveedor (por CUIT;
 *  si no existe, se crea) y a nombre de la razón social del CUIT receptor. Si el proveedor ya tiene cuenta de gasto,
 *  se registra sola; si no, queda en borrador para elegirla (y queda recordada en el proveedor). */
export async function accionSubirFactura(a: { ruta: string; archivo: string; tipo: string }): Promise<{ id: number; ok: string } | { motivo: string }> {
  const s = await entrarErp("compras_ver");
  try {
    if (!a.ruta?.startsWith(`${s.org.id}/`) || a.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(a.ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el archivo que subiste. Probá de nuevo.");
    const r = await leerFacturaArchivo(await data.arrayBuffer(), a.tipo);
    if ("error" in r) throw new ErrorErp(r.error);
    const x = aComprobante(r.lectura);
    if ("error" in x) throw new ErrorErp(x.error);
    const c = x.c;
    const armada = armarFactura(c);
    if (armada.error) throw new ErrorErp(`La factura leída no cierra: ${armada.error} Cargala a mano.`);
    // A nombre de qué razón social: la del CUIT receptor (si no figura, la principal).
    const receptor = String(r.lectura.cuit_receptor ?? "").replace(/\D/g, "");
    const emisor = receptor
      ? await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [s.org.id, receptor])
      : await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and es_principal", [s.org.id]);
    if (!emisor) throw new ErrorErp(`La factura está a nombre del CUIT ${receptor}, que no es de ninguna de tus razones sociales.`);
    let prov = await una<{ id: number; nombre: string; cuenta_gasto_id: number | null }>(
      "select id::int, nombre, cuenta_gasto_id::int from proveedor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2 order by (estado = 'activo') desc, id limit 1", [s.org.id, c.cuit]);
    if (!prov) {
      const cond = c.letra === "A" || c.letra === "M" ? "responsable_inscripto" : c.letra === "C" ? "monotributo" : null;
      prov = await una<{ id: number; nombre: string; cuenta_gasto_id: number | null }>(`insert into proveedor (organizacion_id, nombre, razon_social, cuit, condicion_iva, notas)
        values ($1, $2, $2, $3, $4, 'Creado al subir una factura') returning id::int, nombre, cuenta_gasto_id::int`, [s.org.id, c.denominacion.slice(0, 200), c.cuit, cond]);
    }
    const ya = await una<{ id: number }>(`select id::int from factura_compra where organizacion_id = $1 and proveedor_id = $2 and letra = $3 and es_nota_credito = $4
        and es_nota_debito = $5 and punto_venta is not distinct from $6 and numero = $7 and estado <> 'anulada'`, [s.org.id, prov!.id, c.letra, c.nc, c.nd, c.puntoVenta, c.numero]);
    if (ya) throw new ErrorErp(`Esa factura ya está cargada (factura de compra #${ya.id}).`);
    const venc = r.lectura.vencimiento && /^\d{4}-\d{2}-\d{2}$/.test(r.lectura.vencimiento) ? r.lectura.vencimiento : c.fecha;
    const estandar = [1, 2, 3, 6, 7, 8, 11, 12, 13, 51, 52, 53].includes(c.tipo);
    const fid = await enTransaccion(async (cx) => {
      const f = await cx.query<{ id: string }>(`
        insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, es_nota_debito, punto_venta, numero, fecha, vencimiento, moneda, cotizacion,
                                    percepcion_iva, percepcion_iibb, otros_impuestos, no_gravado, cuenta_gasto_id, notas, usuario_id, origen, cae, emisor_id, tipo_cbte, archivo)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pdf', $19, $20, $21, $22) returning id`,
        [s.org.id, prov!.id, c.letra, c.nc, c.nd, c.puntoVenta, c.numero, c.fecha, venc, c.moneda, c.moneda === "USD" ? c.cotizacion || null : 1,
          armada.percepcionIva, armada.percepcionIibb, armada.otrosImpuestos, armada.noGravado, prov!.cuenta_gasto_id,
          [`Subida desde el archivo «${a.archivo}» (${c.tipoTexto}).`, armada.aviso].filter(Boolean).join(" "), s.usuario.id, c.cae, emisor.id, estandar ? null : c.tipo, a.ruta]);
      const id = Number(f.rows[0].id);
      // Las percepciones de IIBB por provincia, si la factura las discrimina y suman lo mismo.
      const det = detalleIibb(r.lectura, armada.percepcionIibb);
      if (det) {
        await cx.query("update factura_compra set percepcion_iibb_detalle = $2::jsonb where id = $1", [id, JSON.stringify(det)]);
        if (det.length === 1) await cx.query("update proveedor set iibb_jurisdiccion = $2 where id = $1 and iibb_jurisdiccion is null", [prov!.id, det[0].jur]);
      }
      let orden = 0;
      for (const l of armada.lineas) {
        await cx.query(`insert into factura_compra_linea (organizacion_id, factura_id, descripcion, cantidad, costo_unit, iva_pct, neto, iva, orden)
                        values ($1, $2, $3, 1, $4, $5, $4, $6, $7)`, [s.org.id, id, l.descripcion, l.neto, l.ivaPct, l.iva, ++orden]);
      }
      return id;
    });
    const t = await recalcularFactura(s.org.id, fid);
    if (Math.abs(t.total - c.total) > 0.02) {
      revalidatePath(LISTA);
      return { id: fid, ok: `Quedó en borrador: el total armado (${t.total}) no coincide con el de la factura (${c.total}). Revisala.` };
    }
    revalidatePath(LISTA);
    if (!prov!.cuenta_gasto_id) return { id: fid, ok: `Leída. El proveedor ${prov!.nombre} todavía no tiene cuenta de gasto: elegila en la cabecera (queda recordada) y registrala.` };
    await registrarFactura(s.org.id, fid, s.usuario.id);
    return { id: fid, ok: "Leída y registrada con la cuenta de gasto del proveedor." };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

/** «+ Crear «…»» del buscador de cuenta de gasto (Fer, 23/10): una cuenta de egreso imputable con el próximo código libre. */
export async function accionCrearCuentaGasto(nombre: string): Promise<{ id: number; texto: string } | { error: string }> {
  const s = await entrarErp("compras_ver");
  try {
    if (!tienePermiso(s.permisos, "contabilidad_ver")) return { error: "Para crear cuentas contables hace falta el permiso de Contabilidad." };
    const { codigo } = await proximoCodigoCuenta(s.org.id, "egreso");
    const id = await crearCuenta(s.org.id, { codigo, nombre: nombre.trim(), tipo: "egreso", imputable: true });
    return { id, texto: `${codigo} ${nombre.trim()}` };
  } catch (e) {
    return { error: motivoErp(e) };
  }
}
