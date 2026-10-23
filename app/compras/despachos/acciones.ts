"use server";

// Acciones de Despachos de importación. Mientras es borrador se escriben
// acá la cabecera, los gastos e impuestos (listas jsonb) y las líneas; el
// FOB total se mantiene como suma de las líneas. El prorrateo y el registro
// (costo, stock) los hacen calcularDespacho() y registrarDespacho().

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { leerDespachoPdf, aDespacho, type LecturaDespacho } from "@/lib/compras/despacho-leer";
import { intentar, texto, numero, entero, id } from "@/lib/erp/acciones";
import { registrarDespacho, despachoABorrador } from "@/lib/administracion/compras";
import { deLaOrg, tituloVariacion } from "../comun";

const LISTA = "/compras/despachos";
const detalle = (did: number) => `${LISTA}/${did}`;
const esFecha = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

type Item = { concepto: string; importe_ars: number };
type Lista = "gastos" | "impuestos";
const lista = (fd: FormData): Lista => (fd.get("lista") === "impuestos" ? "impuestos" : "gastos");

/** El despacho tiene que ser de la organización y estar en borrador. */
async function borrador(org: string, did: number) {
  const d = await una<{ estado: string; gastos: Item[]; impuestos: Item[] }>(
    "select estado, gastos, impuestos from despacho_importacion where id = $1 and organizacion_id = $2", [did, org]);
  if (!d) throw new ErrorErp("El despacho no existe.");
  if (d.estado !== "borrador") throw new ErrorErp("El despacho ya está registrado: no se cambia.");
  return d;
}

/** El FOB de la cabecera = suma de las líneas. */
const sincronizarFob = (org: string, did: number) => consulta(`
  update despacho_importacion set fob_usd = (select coalesce(round(sum(cantidad * fob_unit_usd), 2), 0) from despacho_linea where despacho_id = $1)
   where id = $1 and organizacion_id = $2`, [did, org]);

async function cabecera(org: string, fd: FormData) {
  const fecha = texto(fd, "fecha");
  if (!esFecha(fecha)) throw new ErrorErp("Poné la fecha del despacho.");
  const cot = numero(fd, "cotizacion");
  if (!(cot && cot > 0)) throw new ErrorErp("Poné la cotización del dólar del despacho.");
  const flete = numero(fd, "flete_usd") ?? 0;
  const seguro = numero(fd, "seguro_usd") ?? 0;
  if (flete < 0 || seguro < 0) throw new ErrorErp("El flete y el seguro no pueden ser negativos.");
  return {
    emisorId: await deLaOrg(org, "emisor", id(fd, "emisor"), "La razón social"),
    numero: texto(fd, "numero"), proveedorId: await deLaOrg(org, "proveedor", id(fd, "proveedor"), "El proveedor"),
    fecha: fecha!, cot, flete, seguro, depositoId: await deLaOrg(org, "deposito", id(fd, "deposito"), "El depósito"), notas: texto(fd, "notas"),
  };
}

export async function accionCrearDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  await intentar(`${LISTA}/nuevo`, async () => {
    const c = await cabecera(s.org.id, fd);
    const r = await una<{ id: number }>(`
      insert into despacho_importacion (organizacion_id, numero, proveedor_id, fecha, cotizacion, flete_usd, seguro_usd, deposito_id, notas, usuario_id, emisor_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id::int`,
      [s.org.id, c.numero, c.proveedorId, c.fecha, c.cot, c.flete, c.seguro, c.depositoId, c.notas, s.usuario.id, c.emisorId]);
    revalidatePath(LISTA);
    return { ir: `${detalle(r!.id)}?ok=${encodeURIComponent("Despacho creado: cargale las líneas y los gastos.")}` };
  });
}

export async function accionGuardarDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd);
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const c = await cabecera(s.org.id, fd);
    await consulta(`
      update despacho_importacion set numero = $3, proveedor_id = $4, fecha = $5, cotizacion = $6, flete_usd = $7, seguro_usd = $8, deposito_id = $9, notas = $10, emisor_id = coalesce($11, emisor_id)
       where id = $2 and organizacion_id = $1 and estado = 'borrador'`,
      [s.org.id, did, c.numero, c.proveedorId, c.fecha, c.cot, c.flete, c.seguro, c.depositoId, c.notas, c.emisorId]);
    revalidatePath(detalle(did));
    return "Cabecera guardada.";
  });
}

// ── Gastos e impuestos (listas jsonb [{concepto, importe_ars}]) ──

function item(fd: FormData): Item {
  const concepto = texto(fd, "concepto");
  const importe = numero(fd, "importe_ars");
  if (!concepto) throw new ErrorErp("Poné el concepto.");
  if (importe == null || importe < 0) throw new ErrorErp("Poné el importe en pesos.");
  return { concepto, importe_ars: Math.round(importe * 100) / 100 };
}

async function guardarLista(org: string, did: number, cual: Lista, items: Item[]) {
  await consulta(`update despacho_importacion set ${cual} = $3::jsonb where id = $2 and organizacion_id = $1 and estado = 'borrador'`,
    [org, did, JSON.stringify(items)]);
}

export async function accionAgregarItem(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    const d = await borrador(s.org.id, did);
    const cual = lista(fd);
    await guardarLista(s.org.id, did, cual, [...(d[cual] ?? []), item(fd)]);
    revalidatePath(detalle(did));
    return cual === "gastos" ? "Gasto agregado." : "Impuesto agregado.";
  });
}

export async function accionGuardarItem(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    const d = await borrador(s.org.id, did);
    const cual = lista(fd);
    const items = [...(d[cual] ?? [])];
    const i = Number(fd.get("indice"));
    if (!Number.isInteger(i) || i < 0 || i >= items.length) throw new ErrorErp("Ese renglón ya no está: recargá la pantalla.");
    items[i] = item(fd);
    await guardarLista(s.org.id, did, cual, items);
    revalidatePath(detalle(did));
    return "Guardado.";
  });
}

export async function accionBorrarItem(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    const d = await borrador(s.org.id, did);
    const cual = lista(fd);
    const i = Number(fd.get("indice"));
    await guardarLista(s.org.id, did, cual, (d[cual] ?? []).filter((_, k) => k !== i));
    revalidatePath(detalle(did));
    return "Borrado.";
  });
}

// ── Líneas ──

function datosLinea(fd: FormData) {
  const cantidad = entero(fd, "cantidad");
  const fob = numero(fd, "fob_unit_usd");
  if (!(cantidad && cantidad > 0)) throw new ErrorErp("Poné una cantidad entera mayor a cero.");
  if (fob == null || fob < 0) throw new ErrorErp("Poné el FOB unitario en dólares.");
  return { cantidad, fob, ncm: texto(fd, "ncm") };
}

export async function accionAgregarLineaDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const variacionId = await deLaOrg(s.org.id, "variacion", id(fd, "variacion"), "El producto elegido");
    const descripcion = texto(fd, "descripcion") ?? (variacionId ? await tituloVariacion(s.org.id, variacionId) : null);
    if (!descripcion) throw new ErrorErp("Una línea sin producto necesita una descripción.");
    const l = datosLinea(fd);
    await consulta(`
      insert into despacho_linea (organizacion_id, despacho_id, variacion_id, descripcion, ncm, cantidad, fob_unit_usd, orden)
      values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(orden), 0) + 1 from despacho_linea where despacho_id = $2))`,
      [s.org.id, did, variacionId, descripcion, l.ncm, l.cantidad, l.fob]);
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return "Línea agregada.";
  });
}

export async function accionGuardarLineaDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const descripcion = texto(fd, "descripcion");
    if (!descripcion) throw new ErrorErp("La línea necesita una descripción.");
    const l = datosLinea(fd);
    const r = await consulta(`
      update despacho_linea set descripcion = $4, ncm = $5, cantidad = $6, fob_unit_usd = $7
       where id = $3 and despacho_id = $2 and organizacion_id = $1 returning id`,
      [s.org.id, did, id(fd), descripcion, l.ncm, l.cantidad, l.fob]);
    if (!r.length) throw new ErrorErp("La línea no existe.");
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return "Línea guardada.";
  });
}

export async function accionBorrarLineaDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    await consulta("delete from despacho_linea where id = $3 and despacho_id = $2 and organizacion_id = $1", [s.org.id, did, id(fd)]);
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return "Línea borrada.";
  });
}

export async function accionBorrarDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd);
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    await consulta("delete from despacho_importacion where id = $2 and organizacion_id = $1 and estado = 'borrador'", [s.org.id, did]);
    revalidatePath(LISTA);
    return { ir: `${LISTA}?ok=${encodeURIComponent("Borrador borrado.")}` };
  });
}

export async function accionRegistrarDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd);
  await intentar(detalle(did), async () => {
    await registrarDespacho(s.org.id, did, s.usuario.id);
    revalidatePath(LISTA);
    revalidatePath(detalle(did));
    return "Despacho registrado: entró el stock y quedó el costo puesto en depósito de cada producto.";
  });
}

/** «Volver a borrador» (Fer, 23/10): anula su asiento para corregirlo (o borrarlo) y registrarlo de nuevo. */
export async function accionDespachoABorrador(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd);
  await intentar(detalle(did), async () => {
    await despachoABorrador(s.org.id, did);
    revalidatePath(LISTA);
    revalidatePath(detalle(did));
    return "Volvió a borrador: se anuló su asiento. Corregilo (o borralo con el tacho) y registralo de nuevo.";
  });
}

// ── Leer el PDF del despacho con la IA y la mercadería (Fer, 23/10) ─────────

/** El PDF ya subido a Storage (bucket "importaciones"): la IA lo lee y carga la cabecera, los gastos y los impuestos
 *  del borrador (en pesos, con el dólar del despacho). Lo que el borrador ya tenía con otro concepto (ej. el
 *  despachante) queda. La mercadería leída queda guardada para usarla como líneas si no hay invoices. */
export async function accionLeerDespachoPdf(a: { despachoId: number; ruta: string; archivo: string }): Promise<{ ok: string } | { motivo: string }> {
  const s = await entrarErp("despachos_ver");
  try {
    if (!a.ruta?.startsWith(`${s.org.id}/`) || a.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const d = await borrador(s.org.id, a.despachoId);
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(a.ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el PDF que subiste. Probá de nuevo.");
    const r = await leerDespachoPdf(await data.arrayBuffer());
    if ("error" in r) throw new ErrorErp(r.error);
    const l = r.lectura;
    const x = aDespacho(l);
    const cuit = String(l.cuit_importador ?? "").replace(/\D/g, "");
    const emisor = cuit ? await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [s.org.id, cuit]) : null;
    const prov = l.vendedor ? await una<{ id: number }>(
      "select id::int from proveedor where organizacion_id = $1 and estado = 'activo' and lower(nombre) = lower($2) order by id limit 1", [s.org.id, l.vendedor.trim()]) : null;
    // Lo leído pisa el mismo concepto; lo demás del borrador queda.
    const juntar = (antes: Item[], nuevos: Item[]) => [...antes.filter((i) => !nuevos.some((n) => n.concepto === i.concepto)), ...nuevos];
    const fecha = esFecha(l.fecha) ? l.fecha : null;
    await consulta(`
      update despacho_importacion set numero = coalesce($3, numero), fecha = coalesce($4::date, fecha), cotizacion = coalesce($5, cotizacion),
             flete_usd = coalesce($6, flete_usd), seguro_usd = coalesce($7, seguro_usd), gastos = $8::jsonb, impuestos = $9::jsonb,
             emisor_id = coalesce($10, emisor_id), proveedor_id = coalesce(proveedor_id, $11), archivo = $12, lectura = $13::jsonb,
             deposito_id = coalesce(deposito_id, (select id from deposito where organizacion_id = $1 and estado = 'activo' and tipo not in ('full_ml', 'transito') order by id limit 1))
       where id = $2 and organizacion_id = $1`,
      [s.org.id, a.despachoId, l.numero?.replace(/\s+/g, "") || null, fecha, Number(l.cotizacion) > 0 ? Number(l.cotizacion) : null,
        l.flete_usd ?? null, l.seguro_usd ?? null, JSON.stringify(juntar(d.gastos, x.gastos)), JSON.stringify(juntar(d.impuestos, x.impuestos)),
        emisor?.id ?? null, prov?.id ?? null, a.ruta, JSON.stringify(l)]);
    revalidatePath(detalle(a.despachoId));
    const partes = [`Leído: ${x.gastos.length} gasto${x.gastos.length === 1 ? "" : "s"} y ${x.impuestos.length} impuesto${x.impuestos.length === 1 ? "" : "s"}`,
      l.items.length ? `${l.items.length} renglón${l.items.length === 1 ? "" : "es"} de mercadería` : null].filter(Boolean).join(", ");
    return { ok: `${partes}. Revisalo antes de registrar.${x.avisos.length ? " Ojo: " + x.avisos.join(" ") : ""}` };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

/** Sin invoices: la mercadería que leyó la IA del despacho pasa a ser las líneas (sin producto: no entran al stock). */
export async function accionUsarMercaderiaDespacho(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const d = await una<{ lectura: LecturaDespacho | null; n: number }>(
      "select lectura, (select count(*)::int from despacho_linea where despacho_id = $1) n from despacho_importacion where id = $1 and organizacion_id = $2", [did, s.org.id]);
    const items = (d?.lectura?.items ?? []).filter((i) => Number(i.cantidad) > 0);
    if (!items.length) throw new ErrorErp("No hay mercadería leída del despacho.");
    if (d!.n) throw new ErrorErp("El despacho ya tiene líneas: borralas antes de usar la mercadería del despacho.");
    for (const [k, i] of items.entries()) {
      await consulta(`insert into despacho_linea (organizacion_id, despacho_id, descripcion, ncm, cantidad, fob_unit_usd, orden) values ($1, $2, $3, $4, $5, $6, $7)`,
        [s.org.id, did, i.descripcion.slice(0, 300), i.ncm, Math.round(Number(i.cantidad)), Number(i.fob_unit_usd) || 0, k + 1]);
    }
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return `Se cargaron ${items.length} líneas del despacho (sin producto: no entran al stock).`;
  });
}

/** Asigna un invoice del proveedor al despacho: sus renglones pasan a ser líneas (con su producto, cantidad y precio FOB). */
export async function accionAsignarInvoice(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const iid = id(fd, "invoice");
    const inv = await una<{ despacho_id: number | null; numero: string | null; archivo: string }>(
      "select despacho_id::int, numero, archivo from compra_invoice where id = $1 and organizacion_id = $2", [iid, s.org.id]);
    if (!inv) throw new ErrorErp("Elegí el invoice.");
    if (inv.despacho_id && inv.despacho_id !== did) throw new ErrorErp(`Ese invoice ya está asignado al despacho #${inv.despacho_id}.`);
    if (inv.despacho_id === did) throw new ErrorErp("Ese invoice ya está asignado a este despacho.");
    const ls = await consulta<{ id: number; variacion_id: number | null; sku: string | null; descripcion: string | null; cantidad: string; precio_usd: string | null }>(
      "select id::int, variacion_id::int, sku, descripcion, cantidad, precio_usd from compra_invoice_linea where invoice_id = $1 and organizacion_id = $2 order by fila, id", [iid, s.org.id]);
    if (!ls.length) throw new ErrorErp("El invoice no tiene renglones: cargalos en su ficha (Compras › Invoices).");
    const sinPrecio = ls.filter((l) => l.precio_usd == null).length;
    if (sinPrecio) throw new ErrorErp(`${sinPrecio} renglón${sinPrecio === 1 ? "" : "es"} del invoice no tiene${sinPrecio === 1 ? "" : "n"} precio: completalo${sinPrecio === 1 ? "" : "s"} en su ficha.`);
    for (const l of ls) {
      const cant = Math.round(Number(l.cantidad));
      if (!(cant > 0)) continue;
      const desc = [l.sku, l.descripcion].filter(Boolean).join(" · ") || (l.variacion_id ? await tituloVariacion(s.org.id, l.variacion_id) : null) || "Sin descripción";
      await consulta(`insert into despacho_linea (organizacion_id, despacho_id, variacion_id, descripcion, cantidad, fob_unit_usd, invoice_linea_id, orden)
                      values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(orden), 0) + 1 from despacho_linea where despacho_id = $2))`,
        [s.org.id, did, l.variacion_id, desc.slice(0, 300), cant, Number(l.precio_usd), l.id]);
    }
    await consulta("update compra_invoice set despacho_id = $3 where id = $1 and organizacion_id = $2", [iid, s.org.id, did]);
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return `Invoice ${inv.numero ?? inv.archivo} asignado: ${ls.length} renglones pasaron a las líneas.`;
  });
}

/** Saca un invoice del despacho: se borran las líneas que trajo. */
export async function accionQuitarInvoice(fd: FormData) {
  const s = await entrarErp("despachos_ver");
  const did = id(fd, "despacho");
  await intentar(detalle(did), async () => {
    await borrador(s.org.id, did);
    const iid = id(fd, "invoice");
    await consulta(`delete from despacho_linea where despacho_id = $2 and organizacion_id = $1
                      and invoice_linea_id in (select id from compra_invoice_linea where invoice_id = $3)`, [s.org.id, did, iid]);
    await consulta("update compra_invoice set despacho_id = null where id = $1 and organizacion_id = $2 and despacho_id = $3", [iid, s.org.id, did]);
    await sincronizarFob(s.org.id, did);
    revalidatePath(detalle(did));
    return "Invoice quitado del despacho, con sus líneas.";
  });
}
