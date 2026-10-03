"use server";

// Acciones de Productos: alta, ficha (datos, variaciones, atributos, fotos,
// cucardas, kit y precios). Todo id que llega del formulario se verifica
// contra la organización antes de tocar nada.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp, motivoErp, type Consultor } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id, tildado } from "@/lib/erp/acciones";
import { guardarPrecio } from "@/lib/precios";
import { esMoneda } from "@/lib/moneda";
import { supabaseServer } from "@/lib/supabase";

const LISTADO = "/catalogo/productos";
const SECCIONES = ["datos", "costo", "variaciones", "atributos", "fotos", "cucardas", "kit", "precios", "stock", "publicaciones"];
const TIPOS = ["simple", "con_variaciones", "kit"];

/** Vuelta a la ficha, en la sección de donde vino el formulario. */
function ficha(pid: number, fd: FormData) {
  const sec = String(fd.get("seccion") ?? "");
  return `${LISTADO}/${pid}${SECCIONES.includes(sec) && sec !== "datos" ? `?seccion=${sec}` : ""}`;
}

/** El producto, si es de la organización. */
async function productoDe(org: string, pid: number) {
  const p = pid ? await una<{ id: number; tipo: string; sku_base: string }>(
    "select id::int, tipo, sku_base from producto where id = $2 and organizacion_id = $1", [org, pid]) : null;
  if (!p) throw new ErrorErp("Ese producto no existe.");
  return p;
}

/** La variación, si es de ese producto (y de la organización). */
async function variacionDe(org: string, pid: number, vid: number) {
  const v = vid ? await una<{ id: number; es_default: boolean }>(
    "select id::int, es_default from variacion where id = $3 and producto_id = $2 and organizacion_id = $1", [org, pid, vid]) : null;
  if (!v) throw new ErrorErp("Esa variación no existe.");
  return v;
}

/** Costo FOB y su moneda (campos costo_fob y costo_moneda del formulario). */
function costoFob(fd: FormData): [number | null, "ARS" | "USD"] {
  const n = numero(fd, "costo_fob");
  if (n != null && n < 0) throw new ErrorErp("El costo FOB no puede ser negativo.");
  return [n, fd.get("costo_moneda") === "ARS" ? "ARS" : "USD"];
}

const CONDICIONES = ["nuevo", "usado", "reacondicionado"];

const pct = (fd: FormData, k: string) => {
  const n = numero(fd, k);
  if (n != null && (n < 0 || n > 100)) throw new ErrorErp("El descuento va de 0 a 100 %.");
  return n;
};

/** "color=rojo; talle=M" (o uno por renglón) → [[color, rojo], [talle, M]]. */
function leerAtributos(t: string | null): [string, string][] {
  if (!t) return [];
  const vistos = new Set<string>();
  const salida: [string, string][] = [];
  for (const parte of t.split(/[;\n]+/)) {
    const s = parte.trim();
    if (!s) continue;
    const i = s.indexOf("=");
    if (i <= 0 || !s.slice(i + 1).trim()) throw new ErrorErp(`El atributo "${s}" va como nombre=valor (ej. color=rojo).`);
    const nombre = s.slice(0, i).trim().toLowerCase();
    if (vistos.has(nombre)) throw new ErrorErp(`El atributo "${nombre}" está dos veces.`);
    vistos.add(nombre);
    salida.push([nombre, s.slice(i + 1).trim()]);
  }
  return salida;
}

async function guardarAtributosVariacion(c: Consultor, org: string, vid: number, attrs: [string, string][]) {
  await c.query("delete from variacion_atributo where variacion_id = $1 and organizacion_id = $2", [vid, org]);
  for (const [i, [nombre, valor]] of attrs.entries()) {
    await c.query("insert into variacion_atributo (organizacion_id, variacion_id, nombre, valor, orden) values ($1, $2, $3, $4, $5)",
      [org, vid, nombre, valor, i]);
  }
}

// ── Alta y datos ──────────────────────────────────────────

export async function accionCrearProducto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(LISTADO, async () => {
    const sku = texto(fd, "sku_base");
    const titulo = texto(fd, "titulo");
    if (!sku || !titulo) throw new ErrorErp("El producto necesita SKU base y título.");
    const tipo = TIPOS.includes(String(fd.get("tipo"))) ? String(fd.get("tipo")) : "simple";
    const familia = await familiaValida(s.org.id, id(fd, "familia_id"));
    const r = await una<{ id: number }>(
      "insert into producto (organizacion_id, sku_base, titulo, tipo, familia_id) values ($1, $2, $3, $4, $5) returning id::int",
      [s.org.id, sku, titulo, tipo, familia]);
    revalidatePath(LISTADO);
    return { ir: `${LISTADO}/${r!.id}?ok=${encodeURIComponent("Producto creado. Completá la ficha.")}` };
  });
}

async function familiaValida(org: string, fid: number) {
  if (!fid) return null;
  const f = await una("select 1 from familia where id = $2 and organizacion_id = $1", [org, fid]);
  if (!f) throw new ErrorErp("Esa familia no existe.");
  return fid;
}

export async function accionGuardarDatos(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const p = await productoDe(s.org.id, pid);
    const sku = texto(fd, "sku_base");
    const titulo = texto(fd, "titulo");
    if (!sku || !titulo) throw new ErrorErp("El producto necesita SKU base y título.");
    const tipo = TIPOS.includes(String(fd.get("tipo"))) ? String(fd.get("tipo")) : p.tipo;
    const estado = ["activo", "pausado", "archivado"].includes(String(fd.get("estado"))) ? String(fd.get("estado")) : "activo";
    const familia = await familiaValida(s.org.id, id(fd, "familia_id"));
    const valores = [
      s.org.id, pid, sku, titulo, texto(fd, "descripcion"), familia, texto(fd, "marca"), tipo, estado,
      tipo === "con_variaciones" ? null : texto(fd, "codigo_barras"),
      entero(fd, "peso_g"), numero(fd, "largo_cm"), numero(fd, "ancho_cm"), numero(fd, "alto_cm"),
      pct(fd, "descuento_pct"), entero(fd, "umbral_pausa"), entero(fd, "stock_minimo"),
      // IVA: sólo las alícuotas de ARCA; cualquier otra cosa deja la que tenía.
      [0, 2.5, 5, 10.5, 21, 27].includes(Number(fd.get("iva_pct"))) && fd.get("iva_pct") !== "" ? Number(fd.get("iva_pct")) : null,
      texto(fd, "modelo"), texto(fd, "linea"), texto(fd, "garantia"),
      CONDICIONES.includes(String(fd.get("condicion"))) ? String(fd.get("condicion")) : null,
      tildado(fd, "kit_vs"),
    ];
    // El costo FOB de un simple/kit va en su variación default (el campo sólo
    // viene en el formulario cuando el producto no tiene variaciones).
    const costo = fd.get("con_costo") === "1" ? costoFob(fd) : null;
    await enTransaccion(async (c) => {
      // Si deja de ser kit, sus componentes se van: si no, el stock se seguiría
      // calculando desde ellos.
      if (p.tipo === "kit" && tipo !== "kit") {
        await c.query(`delete from kit_componente where organizacion_id = $1 and variacion_kit_id in
                         (select id from variacion where producto_id = $2)`, [s.org.id, pid]);
      }
      // El disparador de la base cuida la variación default (y tira el error
      // en criollo si pasa a simple/kit con más de una variación).
      await c.query(`
        update producto set sku_base = $3, titulo = $4, descripcion = $5, familia_id = $6, marca = $7, tipo = $8, estado = $9,
               codigo_barras = $10, peso_g = $11, largo_cm = $12, ancho_cm = $13, alto_cm = $14,
               descuento_pct = $15, umbral_pausa = $16, stock_minimo = $17, iva_pct = coalesce($18, iva_pct),
               modelo = $19, linea = $20, garantia = $21, condicion = $22, kit_vs = $23, actualizado_ts = now()
         where id = $2 and organizacion_id = $1`, valores);
      // Un kit no graba costo FOB: es la suma de sus componentes.
      if (costo && tipo !== "con_variaciones" && tipo !== "kit") {
        await c.query(`update variacion set costo_fob = $3, costo_moneda = $4
                        where producto_id = $2 and organizacion_id = $1 and es_default and not es_kit(id)`,
          [s.org.id, pid, costo[0], costo[1]]);
      }
    });
    revalidatePath(`${LISTADO}/${pid}`);
    return "Guardado.";
  });
}

/** Pasar a Inactivo (archivado) o volver a Activo, desde la cabecera de la ficha. */
export async function accionCambiarEstadoProducto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const estado = fd.get("estado") === "archivado" ? "archivado" : "activo";
    await consulta("update producto set estado = $3, actualizado_ts = now() where id = $2 and organizacion_id = $1", [s.org.id, pid, estado]);
    revalidatePath(`${LISTADO}/${pid}`);
    revalidatePath(LISTADO);
    return estado === "archivado" ? "Pasó a Inactivo: ya no aparece en los listados." : "Volvió a Activo.";
  });
}

export async function accionBorrarProducto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    await consulta("delete from producto where id = $2 and organizacion_id = $1", [s.org.id, pid]);
    revalidatePath(LISTADO);
    return { ir: `${LISTADO}?ok=${encodeURIComponent("Producto borrado.")}` };
  });
}

// ── Variaciones ───────────────────────────────────────────

export async function accionCrearVariacion(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const p = await productoDe(s.org.id, pid);
    if (p.tipo !== "con_variaciones") throw new ErrorErp("Sólo un producto con variaciones puede tener más de una. Cambiá el tipo en Datos.");
    const sku = texto(fd, "sku");
    if (!sku) throw new ErrorErp("La variación necesita un SKU.");
    const attrs = leerAtributos(texto(fd, "atributos"));
    await enTransaccion(async (c) => {
      const r = await c.query<{ id: number }>(`
        insert into variacion (organizacion_id, producto_id, sku, codigo_barras, titulo, descuento_pct, orden)
        values ($1, $2, $3, $4, $5, $6, (select coalesce(max(orden), 0) + 1 from variacion where producto_id = $2)) returning id::int`,
        [s.org.id, pid, sku, texto(fd, "codigo_barras"), texto(fd, "titulo"), pct(fd, "descuento_pct")]);
      await guardarAtributosVariacion(c, s.org.id, r.rows[0].id, attrs);
    });
    revalidatePath(`${LISTADO}/${pid}`);
    return "Variación agregada.";
  });
}

export async function accionGuardarVariacion(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const p = await productoDe(s.org.id, pid);
    const v = await variacionDe(s.org.id, pid, id(fd));
    const attrs = leerAtributos(texto(fd, "atributos"));
    const estado = ["activa", "pausada", "archivada"].includes(String(fd.get("estado"))) ? String(fd.get("estado")) : "activa";
    const [costo, monedaCosto] = costoFob(fd);
    await enTransaccion(async (c) => {
      // Un kit (por tipo o con componentes) no graba costo FOB: se calcula.
      if (p.tipo !== "kit") {
        await c.query("update variacion set costo_fob = $3, costo_moneda = $4 where id = $2 and organizacion_id = $1 and not es_kit(id)",
          [s.org.id, v.id, costo, monedaCosto]);
      }
      if (v.es_default && p.tipo !== "con_variaciones") {
        // La default de un simple/kit: el SKU y el código los manda el producto.
        await c.query("update variacion set titulo = $3, descuento_pct = $4, estado = $5 where id = $2 and organizacion_id = $1",
          [s.org.id, v.id, texto(fd, "titulo"), pct(fd, "descuento_pct"), estado]);
      } else {
        const sku = texto(fd, "sku");
        if (!sku) throw new ErrorErp("La variación necesita un SKU.");
        await c.query(`update variacion set sku = $3, codigo_barras = $4, titulo = $5, descuento_pct = $6, estado = $7
                        where id = $2 and organizacion_id = $1`,
          [s.org.id, v.id, sku, texto(fd, "codigo_barras"), texto(fd, "titulo"), pct(fd, "descuento_pct"), estado]);
      }
      await guardarAtributosVariacion(c, s.org.id, v.id, attrs);
    });
    revalidatePath(`${LISTADO}/${pid}`);
    return "Guardado.";
  });
}

export async function accionBorrarVariacion(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const p = await productoDe(s.org.id, pid);
    const v = await variacionDe(s.org.id, pid, id(fd));
    if (p.tipo !== "con_variaciones" || v.es_default) throw new ErrorErp("La variación única de un producto no se borra: borrá el producto.");
    const n = await una<{ n: number }>("select count(*)::int n from variacion where producto_id = $1", [pid]);
    if ((n?.n ?? 0) <= 1) throw new ErrorErp("Es la única variación del producto: no se puede borrar.");
    await consulta("delete from variacion where id = $2 and organizacion_id = $1", [s.org.id, v.id]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Variación borrada.";
  });
}

// ── Atributos genéricos del producto ──────────────────────

export async function accionCrearAtributo(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const nombre = texto(fd, "nombre"), valor = texto(fd, "valor");
    if (!nombre || !valor) throw new ErrorErp("El atributo necesita nombre y valor.");
    await consulta(`insert into producto_atributo (organizacion_id, producto_id, nombre, valor, orden)
                    values ($1, $2, $3, $4, (select coalesce(max(orden), 0) + 1 from producto_atributo where producto_id = $2))`,
      [s.org.id, pid, nombre, valor]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Atributo agregado.";
  });
}

export async function accionGuardarAtributo(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const nombre = texto(fd, "nombre"), valor = texto(fd, "valor");
    if (!nombre || !valor) throw new ErrorErp("El atributo necesita nombre y valor.");
    await consulta(`update producto_atributo set nombre = $4, valor = $5, orden = $6
                     where id = $3 and producto_id = $2 and organizacion_id = $1`,
      [s.org.id, pid, id(fd), nombre, valor, entero(fd, "orden") ?? 0]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Guardado.";
  });
}

export async function accionBorrarAtributo(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await consulta("delete from producto_atributo where id = $3 and producto_id = $2 and organizacion_id = $1", [s.org.id, pid, id(fd)]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Borrado.";
  });
}

// ── Fotos ─────────────────────────────────────────────────
// El archivo lo sube el navegador a Supabase Storage (SubirFoto.tsx); acá se
// guarda la fila. Con `variacion_id` es una foto propia de esa variación.

/** La llama SubirFoto.tsx después de subir cada archivo. No redirige:
 *  devuelve el motivo si falló, y el navegador refresca la pantalla al final. */
export async function guardarFotoSubida(fd: FormData): Promise<{ motivo?: string }> {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  try {
    await productoDe(s.org.id, pid);
    const url = texto(fd, "url"), ruta = texto(fd, "ruta");
    if (!url || !/^https:\/\//.test(url) || !ruta || !ruta.startsWith(`${s.org.id}/`)) throw new ErrorErp("No llegó bien la foto. Probá de nuevo.");
    const vid = id(fd, "variacion_id");
    if (vid) {
      await variacionDe(s.org.id, pid, vid);
      await consulta(`insert into variacion_foto (organizacion_id, variacion_id, url, ruta_storage, orden)
                      values ($1, $2, $3, $4, (select coalesce(max(orden), 0) + 1 from variacion_foto where variacion_id = $2))`,
        [s.org.id, vid, url, ruta]);
    } else {
      await consulta(`insert into producto_foto (organizacion_id, producto_id, url, ruta_storage, orden)
                      values ($1, $2, $3, $4, (select coalesce(max(orden), 0) + 1 from producto_foto where producto_id = $2))`,
        [s.org.id, pid, url, ruta]);
    }
    revalidatePath(`${LISTADO}/${pid}`);
    return {};
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

/** Sube o baja una foto un lugar (intercambia el orden con la vecina). */
export async function accionMoverFoto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const deVariacion = fd.get("de") === "variacion";
    const tabla = deVariacion ? "variacion_foto" : "producto_foto";
    const padre = deVariacion ? "variacion_id" : "producto_id";
    const fid = id(fd);
    const subir = fd.get("hacia") === "arriba";
    await enTransaccion(async (c) => {
      // Primero se numeran de corrido (por si había órdenes repetidos).
      const f = await c.query<{ padre: string }>(
        `select ${padre} padre from ${tabla} where id = $2 and organizacion_id = $1
            ${deVariacion ? "and variacion_id in (select id from variacion where producto_id = $3)" : "and producto_id = $3"}`,
        [s.org.id, fid, pid]);
      if (!f.rowCount) throw new ErrorErp("Esa foto no existe.");
      const todas = (await c.query<{ id: string }>(`select id from ${tabla} where ${padre} = $1 order by orden, id`, [f.rows[0].padre])).rows.map((r) => Number(r.id));
      const i = todas.indexOf(fid);
      const j = subir ? i - 1 : i + 1;
      if (j < 0 || j >= todas.length) return;
      [todas[i], todas[j]] = [todas[j], todas[i]];
      for (const [k, x] of todas.entries()) await c.query(`update ${tabla} set orden = $2 where id = $1`, [x, k]);
    });
    revalidatePath(`${LISTADO}/${pid}`);
  });
}

export async function accionBorrarFoto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const deVariacion = fd.get("de") === "variacion";
    const r = deVariacion
      ? await una<{ ruta_storage: string | null }>(`delete from variacion_foto where id = $2 and organizacion_id = $1
           and variacion_id in (select id from variacion where producto_id = $3) returning ruta_storage`, [s.org.id, id(fd), pid])
      : await una<{ ruta_storage: string | null }>(`delete from producto_foto where id = $2 and organizacion_id = $1 and producto_id = $3
           returning ruta_storage`, [s.org.id, id(fd), pid]);
    // El archivo, si se puede; si no, queda huérfano en Storage (no molesta).
    if (r?.ruta_storage?.startsWith(`${s.org.id}/`)) {
      try { await (await supabaseServer()).storage.from("productos").remove([r.ruta_storage]); } catch { /* queda huérfano */ }
    }
    revalidatePath(`${LISTADO}/${pid}`);
    return "Foto borrada.";
  });
}

// ── Cucardas ──────────────────────────────────────────────

export async function accionGuardarCucardas(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const cucardas = await consulta<{ id: number }>("select id::int from cucarda where organizacion_id = $1", [s.org.id]);
    await enTransaccion(async (c) => {
      for (const { id: cid } of cucardas) {
        if (tildado(fd, `c${cid}`)) {
          const desde = fecha(fd, `desde${cid}`), hasta = fecha(fd, `hasta${cid}`);
          if (desde && hasta && hasta < desde) throw new ErrorErp("Una cucarda tiene el \"hasta\" antes del \"desde\".");
          await c.query(`insert into producto_cucarda (organizacion_id, producto_id, cucarda_id, desde, hasta) values ($1, $2, $3, $4, $5)
                         on conflict (producto_id, cucarda_id) do update set desde = excluded.desde, hasta = excluded.hasta`,
            [s.org.id, pid, cid, desde, hasta]);
        } else {
          await c.query("delete from producto_cucarda where producto_id = $1 and cucarda_id = $2 and organizacion_id = $3", [pid, cid, s.org.id]);
        }
      }
    });
    revalidatePath(`${LISTADO}/${pid}`);
    return "Cucardas guardadas.";
  });
}

// ── Costo de importación ──────────────────────────────────

const PCT_COSTO = [
  ["derecho_pct", "derecho de importación"], ["tasa_estadistica_pct", "tasa de estadística"], ["arancel_otros_pct", "arancel / otros"],
  ["iva_pct", "IVA"], ["iva_adicional_pct", "IVA adicional"], ["percepcion_ganancias_pct", "percepción de ganancias"], ["ingresos_brutos_pct", "ingresos brutos"],
] as const;

/** Pestaña Costo: NCM, alícuotas del despacho y notas (una fila por producto). */
export async function accionGuardarCosto(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const pcts = PCT_COSTO.map(([k, t]) => {
      const n = numero(fd, k);
      if (n != null && (n < 0 || n > 100)) throw new ErrorErp(`El ${t} va de 0 a 100 %.`);
      return n;
    });
    const ncm = texto(fd, "ncm")?.toUpperCase().replace(/\s+/g, "") ?? null;
    if (ncm && ncm.length > 20) throw new ErrorErp("La posición arancelaria es muy larga (ej. 8516.79.90.990X).");
    await consulta(`
      insert into producto_costo (producto_id, organizacion_id, ncm, ${PCT_COSTO.map(([k]) => k).join(", ")}, notas, actualizado_ts)
      values ($1, $2, $3, ${PCT_COSTO.map((_, i) => `$${i + 4}`).join(", ")}, $${PCT_COSTO.length + 4}, now())
      on conflict (producto_id) do update set ncm = excluded.ncm, ${PCT_COSTO.map(([k]) => `${k} = excluded.${k}`).join(", ")},
        notas = excluded.notas, actualizado_ts = now()`,
      [pid, s.org.id, ncm, ...pcts, texto(fd, "notas")]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Costo de importación guardado.";
  });
}

const fecha = (fd: FormData, k: string) => {
  const t = texto(fd, k);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

// ── Kit ───────────────────────────────────────────────────

async function varianteKit(org: string, pid: number) {
  const p = await productoDe(org, pid);
  if (p.tipo !== "kit") throw new ErrorErp("Este producto no es un kit. Cambiá el tipo en Datos.");
  const v = await una<{ id: number }>("select id::int from variacion where producto_id = $1 and es_default", [pid]);
  if (!v) throw new ErrorErp("El kit no tiene su variación. Guardá los datos de nuevo.");
  return v.id;
}

export async function accionAgregarComponente(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const kit = await varianteKit(s.org.id, pid);
    const sku = texto(fd, "sku");
    const cantidad = entero(fd, "cantidad") ?? 1;
    if (!sku) throw new ErrorErp("Escribí el SKU del componente.");
    if (cantidad < 1) throw new ErrorErp("La cantidad tiene que ser 1 o más.");
    const comp = await una<{ id: number }>("select id::int from variacion where organizacion_id = $1 and lower(sku) = lower($2)", [s.org.id, sku]);
    if (!comp) throw new ErrorErp(`No hay ninguna variación con el SKU "${sku}".`);
    if (comp.id === kit) throw new ErrorErp("Un kit no puede llevarse a sí mismo.");
    // Tampoco un kit que (en algún nivel) ya lleva a éste: sería un círculo.
    const circulo = await una(`
      with recursive dentro as (
        select variacion_componente_id v, 0 nivel from kit_componente where variacion_kit_id = $1
        union all
        select k.variacion_componente_id, d.nivel + 1 from kit_componente k join dentro d on k.variacion_kit_id = d.v where d.nivel < 10
      ) select 1 from dentro where v = $2 limit 1`, [comp.id, kit]);
    if (circulo) throw new ErrorErp("Ese componente es un kit que ya lleva a éste adentro: quedaría en círculo.");
    await consulta(`insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, $4)
                    on conflict (variacion_kit_id, variacion_componente_id) do update set cantidad = kit_componente.cantidad + excluded.cantidad`,
      [s.org.id, kit, comp.id, cantidad]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Componente agregado.";
  });
}

export async function accionGuardarComponente(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const kit = await varianteKit(s.org.id, pid);
    const cantidad = entero(fd, "cantidad");
    if (!cantidad || cantidad < 1) throw new ErrorErp("La cantidad tiene que ser 1 o más.");
    await consulta("update kit_componente set cantidad = $4 where id = $3 and variacion_kit_id = $2 and organizacion_id = $1",
      [s.org.id, kit, id(fd), cantidad]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Guardado.";
  });
}

export async function accionBorrarComponente(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    const kit = await varianteKit(s.org.id, pid);
    await consulta("delete from kit_componente where id = $3 and variacion_kit_id = $2 and organizacion_id = $1", [s.org.id, kit, id(fd)]);
    revalidatePath(`${LISTADO}/${pid}`);
    return "Componente sacado.";
  });
}

// ── Precios ───────────────────────────────────────────────

export async function accionGuardarPrecio(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(ficha(pid, fd), async () => {
    await productoDe(s.org.id, pid);
    const v = await variacionDe(s.org.id, pid, id(fd, "variacion_id"));
    const importe = numero(fd, "importe");
    if (importe == null) throw new ErrorErp("Escribí el precio.");
    const moneda = fd.get("moneda");
    // guardarPrecio verifica la lista contra la organización y tira ErrorErp
    // en criollo si no hay tipo de cambio cargado.
    await guardarPrecio(s.org.id, {
      listaId: id(fd, "lista_id"), variacionId: v.id, importe, moneda: esMoneda(moneda) ? moneda : s.moneda, usuarioId: s.usuario.id,
    });
    revalidatePath(`${LISTADO}/${pid}`);
    return "Precio guardado.";
  });
}
