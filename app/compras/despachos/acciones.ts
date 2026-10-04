"use server";

// Acciones de Despachos de importación. Mientras es borrador se escriben
// acá la cabecera, los gastos e impuestos (listas jsonb) y las líneas; el
// FOB total se mantiene como suma de las líneas. El prorrateo y el registro
// (costo, stock) los hacen calcularDespacho() y registrarDespacho().

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id } from "@/lib/erp/acciones";
import { registrarDespacho } from "@/lib/administracion/compras";
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
