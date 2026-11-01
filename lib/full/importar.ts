// Importar un envío a Full desde el PDF de Mercado Libre (Fer, 1/11): se carga el envío en Mercado Libre, se
// sube a Laucen el PDF «Inbound-<número>-preparation-instructions» y Laucen arma el envío solo (número de ML,
// productos y unidades), en vez de cargarlo dos veces.
//
// Lo que trae el PDF: «Envío #81136314», el total de unidades y, por producto, «Código ML: SAMK57535» (el código
// de inventario de Full), el código universal, «SKU: F412DA-NH77», el título y las unidades (en su propia
// columna, a la altura del producto). El producto se busca por SKU y, si no, por el código de inventario.

import { una, ErrorErp } from "@/lib/erp/base";
import { crearEnvio, guardarCabecera, agregarLinea, vaciarEnvio, cambiarLinea, envio as envioDe } from "@/lib/full/envios";

export type ProductoInbound = { codigo: string; sku: string | null; titulo: string; unidades: number };
export type Inbound = { numero: string; productos: ProductoInbound[]; total: number | null };

type Texto = { str: string; x: number; y: number; pagina: number };

/** Lee el PDF de Mercado Libre. Tira un error en criollo si no es ese PDF o no cierra el total. */
export async function leerInbound(bytes: Uint8Array): Promise<Inbound> {
  let textos: Texto[] = [];
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      for (const it of c.items as { str?: string; transform?: number[] }[]) {
        if (it.str?.trim() && it.transform) textos.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], pagina: i });
      }
    }
  } catch (e) {
    console.error("[full/importar] no se pudo leer el PDF:", e);
    throw new ErrorErp("No se pudo leer el archivo: tiene que ser el PDF del envío que baja Mercado Libre.");
  }
  textos = textos.sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  return interpretarInbound(textos);
}

/** La parte que no depende del PDF (se prueba sola): los textos, en orden de lectura, con su posición. */
export function interpretarInbound(textos: Texto[]): Inbound {
  const todo = textos.map((t) => t.str).join("\n");
  const numero = todo.match(/Env[ií]o\s*#\s*(\d{5,})/)?.[1];
  if (!numero) throw new ErrorErp("No es el PDF de un envío a Full de Mercado Libre (no dice «Envío #…»).");
  const total = Number(todo.match(/Total de unidades:\s*(\d+)/)?.[1] ?? NaN);

  // Cada producto empieza en «Código ML:»; su bloque llega hasta el próximo (o hasta «Etiquetado» / el encabezado).
  const inicios = textos.map((t, i) => (/C[oó]digo ML:/.test(t.str) ? i : -1)).filter((i) => i >= 0);
  // La columna de las unidades: debajo del encabezado «UNIDADES», sólo números.
  const columnas = textos.filter((t) => t.str === "UNIDADES");
  const productos: ProductoInbound[] = inicios.map((ini, k) => {
    const fin = inicios[k + 1] ?? textos.length;
    const bloque = textos.slice(ini, fin).filter((t) => t.x < (columnas.find((c) => c.pagina === textos[ini].pagina)?.x ?? Infinity) - 5);
    const corte = bloque.findIndex((t) => /^(Etiquetado|PRODUCTO\b)/.test(t.str));
    const lineas = (corte >= 0 ? bloque.slice(0, corte) : bloque).map((t) => t.str);
    const plano = lineas.join(" ");
    const codigo = plano.match(/C[oó]digo ML:\s*([A-Z0-9]+)/)?.[1] ?? "";
    const sku = plano.match(/SKU:\s*(\S+)/)?.[1] ?? null;
    // El título: lo que no es código, código universal ni SKU.
    const titulo = lineas.filter((l) => !/C[oó]digo ML:|SKU:/.test(l) && !/^\d{8,14}$/.test(l)).join(" ").replace(/\s+/g, " ").trim();
    // Las unidades: el número de la columna más cercano en altura al producto, en su página.
    const columna = columnas.find((c) => c.pagina === textos[ini].pagina);
    const candidatos = textos.filter((t) => t.pagina === textos[ini].pagina && /^\d+$/.test(t.str) && columna && Math.abs(t.x - columna.x) < 25 && t.y < columna.y);
    const u = candidatos.sort((a, b) => Math.abs(a.y - textos[ini].y) - Math.abs(b.y - textos[ini].y))[0];
    return { codigo, sku, titulo, unidades: u ? Number(u.str) : 0 };
  });
  if (!productos.length) throw new ErrorErp("El PDF no trae productos: ¿es el de las instrucciones de preparación del envío?");
  const sinUnidades = productos.filter((p) => !p.unidades);
  if (sinUnidades.length) throw new ErrorErp(`No se pudo leer cuántas unidades van de ${sinUnidades.map((p) => p.sku ?? p.codigo).join(", ")}.`);
  const suma = productos.reduce((s, p) => s + p.unidades, 0);
  if (Number.isFinite(total) && total !== suma) throw new ErrorErp(`El PDF dice ${total} unidades pero los productos suman ${suma}: no se importó nada.`);
  return { numero, productos, total: Number.isFinite(total) ? total : null };
}

type Encontrado = ProductoInbound & { variacion: number | null; item: string | null; variation: string | null; canal: number | null };

/** Busca cada producto: por SKU (con o sin «DE-») y, si no, por el código de inventario de Full de alguna publicación. */
async function buscar(org: string, p: ProductoInbound): Promise<Encontrado> {
  const porCodigo = await una<{ canal: number; item: string; variation: string | null; variacion: number | null }>(`
    select mi.canal_id::int canal, mi.item_id item, nullif(mi.variation_id, '') variation, pu.variacion_id::int variacion
      from meli_item mi left join publicacion pu on pu.canal_id = mi.canal_id and pu.id_externo = mi.item_id
     where mi.organizacion_id = $1 and mi.datos_externos #>> '{ml,inventory_id}' = $2
     order by (mi.logistica = 'fulfillment') desc, (mi.estado = 'active') desc limit 1`, [org, p.codigo]).catch(() => null);
  const porSku = p.sku ? await una<{ id: number }>(`
    select id::int from variacion where organizacion_id = $1 and estado <> 'archivada'
       and (upper(sku) = upper($2) or upper(sku) = upper('DE-' || $2) or upper('DE-' || sku) = upper($2))
     order by (upper(sku) = upper($2)) desc limit 1`, [org, p.sku]) : null;
  return { ...p, variacion: porSku?.id ?? porCodigo?.variacion ?? null, item: porCodigo?.item ?? null, variation: porCodigo?.variation ?? null, canal: porCodigo?.canal ?? null };
}

/** Arma (o rehace, si sigue en borrador) el envío a Full del PDF. Devuelve el envío y lo que hay que avisar. */
export async function importarInbound(org: string, usuario: string, bytes: Uint8Array, d: { canal: number | null; origen: number }): Promise<{ envio: number; aviso: string }> {
  const inb = await leerInbound(bytes);
  const productos = await Promise.all(inb.productos.map((p) => buscar(org, p)));
  const faltan = productos.filter((p) => !p.variacion);
  if (faltan.length) throw new ErrorErp(`No encontré en Laucen ${faltan.map((p) => `${p.sku ?? "sin SKU"} (${p.codigo})`).join(", ")}: cargá ese SKU en el producto y volvé a subir el PDF. No se importó nada.`);

  // La cuenta: la de la publicación con ese código de Full; si no se sabe, la elegida.
  const cuentas = [...new Set(productos.map((p) => p.canal).filter((c): c is number => c != null))];
  if (cuentas.length > 1) throw new ErrorErp("Los productos del PDF son de publicaciones de distintas cuentas de Mercado Libre: revisá el archivo.");
  const canal = cuentas[0] ?? d.canal;
  if (!canal) throw new ErrorErp("No pude saber de qué cuenta de Mercado Libre es el envío: elegila y volvé a subir el PDF.");
  if (d.canal && cuentas[0] && d.canal !== cuentas[0]) {
    const n = await una<{ nombre: string }>("select nombre from canal where id = $1", [cuentas[0]]);
    throw new ErrorErp(`El envío es de la cuenta ${n?.nombre ?? cuentas[0]}, no de la elegida: elegí esa (o «La del archivo») y volvé a subirlo.`);
  }

  // Si ya está importado: en borrador se rehace con lo del PDF; despachado o después, no se toca.
  const ya = await una<{ id: number; estado: string }>("select id::int, estado from full_envio where organizacion_id = $1 and trim(numero_ml) = $2 order by id desc limit 1", [org, inb.numero]);
  if (ya && ya.estado !== "borrador") throw new ErrorErp(`El envío ${inb.numero} de Mercado Libre ya está en Laucen (envío ${ya.id}) y ya salió: no se cambió nada.`);
  const id = ya?.id ?? await crearEnvio(org, usuario, canal, d.origen);
  if (ya) await vaciarEnvio(org, id);
  const e = await envioDe(org, id);
  await guardarCabecera(org, id, { numero_ml: inb.numero, fecha_entrega: e?.fecha_entrega ?? null, notas: e?.notas ?? "Importado del PDF de Mercado Libre." });

  const avisos: string[] = [];
  for (const p of productos) {
    const aviso = await agregarLinea(org, id, p.variacion!, p.unidades, usuario);
    if (aviso) avisos.push(aviso);
    // La línea va a la publicación de ese código de Full (no a la principal de la cuenta), si Laucen la conoce.
    if (p.item && p.canal === canal) {
      const l = await una<{ id: number; cantidad: number }>("select id::int, cantidad from full_envio_linea where envio_id = $1 and variacion_id = $2", [id, p.variacion]);
      if (l) await cambiarLinea(org, id, l.id, l.cantidad, { item: p.item, variacion: p.variation ?? "" }).catch(() => null);
    }
  }
  const unidades = productos.reduce((s, p) => s + p.unidades, 0);
  return {
    envio: id,
    aviso: `${ya ? "Envío rehecho" : "Envío importado"}: ${inb.numero} de Mercado Libre, ${productos.length} producto${productos.length === 1 ? "" : "s"} y ${unidades} unidades.${avisos.length ? ` ${avisos.join(" ")}` : ""}`,
  };
}

