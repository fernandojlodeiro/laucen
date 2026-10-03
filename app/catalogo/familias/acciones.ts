"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id, tildado } from "@/lib/erp/acciones";
import { TODOS_PCT, CLAVES_GENERAL, CLAVE_CONFIG, esVia, leerPctsCosto, leerNcm, type ClavePct } from "@/lib/costo-importacion";

const VOLVER = "/catalogo/familias";
const DE_ML = "Es una categoría de Mercado Libre: no se cambia ni se borra.";

function leerDescuento(fd: FormData) {
  const n = numero(fd, "descuento_pct");
  if (n != null && (n < 0 || n > 100)) throw new ErrorErp("El descuento va de 0 a 100 %.");
  return n;
}

/** El padre elegido, verificado: que sea de la organización, que sea propio
 *  (ni él ni ninguno de arriba viene de Mercado Libre: una familia propia
 *  cuelga sólo de una raíz propia) y que la familia no quede como su propia
 *  ancestra (subiendo desde el padre no tiene que aparecer ella). */
async function padreValido(org: string, padre: number, familia: number | null) {
  if (!padre) return null;
  if (padre === familia) throw new ErrorErp("Una familia no puede ser su propio padre.");
  const ok = await una("select 1 from familia where id = $2 and organizacion_id = $1", [org, padre]);
  if (!ok) throw new ErrorErp("La familia padre no existe.");
  const deMl = await una(`
    with recursive arriba as (
      select id, padre_id, ml_categoria, 0 nivel from familia where id = $2 and organizacion_id = $1
      union all
      select f.id, f.padre_id, f.ml_categoria, a.nivel + 1 from familia f join arriba a on f.id = a.padre_id where a.nivel < 50
    ) select 1 from arriba where ml_categoria is not null limit 1`, [org, padre]);
  if (deMl) throw new ErrorErp("Las categorías de Mercado Libre no se tocan: una familia propia va arriba de todo o dentro de otra propia.");
  if (familia) {
    const circulo = await una(`
      with recursive arriba as (
        select id, padre_id, 0 nivel from familia where id = $2 and organizacion_id = $1
        union all
        select f.id, f.padre_id, a.nivel + 1 from familia f join arriba a on f.id = a.padre_id where a.nivel < 50
      ) select 1 from arriba where id = $3 limit 1`, [org, padre, familia]);
    if (circulo) throw new ErrorErp("Esa familia padre está adentro de ésta: quedaría en círculo.");
  }
  return padre;
}

export async function accionCrearFamilia(fd: FormData) {
  const s = await entrarErp("familias_ver");
  await intentar(VOLVER, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La familia necesita un nombre.");
    const padre = await padreValido(s.org.id, id(fd, "padre_id"), null);
    await consulta("insert into familia (organizacion_id, nombre, padre_id, descuento_pct) values ($1, $2, $3, $4)",
      [s.org.id, nombre, padre, leerDescuento(fd)]);
    revalidatePath(VOLVER);
    return "Familia creada.";
  });
}

export async function accionGuardarFamilia(fd: FormData) {
  const s = await entrarErp("familias_ver");
  await intentar(VOLVER, async () => {
    const fid = id(fd);
    const existe = await una<{ ml_categoria: string | null }>("select ml_categoria from familia where id = $2 and organizacion_id = $1", [s.org.id, fid]);
    if (!existe) throw new ErrorErp("Esa familia no existe.");
    if (existe.ml_categoria) throw new ErrorErp(DE_ML);
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La familia necesita un nombre.");
    const padre = await padreValido(s.org.id, id(fd, "padre_id"), fid);
    const descuento = leerDescuento(fd);
    const cucardas = await consulta<{ id: number }>("select id::int from cucarda where organizacion_id = $1", [s.org.id]);
    await enTransaccion(async (c) => {
      await c.query("update familia set nombre = $3, padre_id = $4, descuento_pct = $5 where id = $2 and organizacion_id = $1",
        [s.org.id, fid, nombre, padre, descuento]);
      // Cucardas de la familia: las tildadas se cargan (con su vigencia), las
      // destildadas se sacan.
      for (const { id: cid } of cucardas) {
        if (tildado(fd, `c${cid}`)) {
          const desde = fecha(fd, `desde${cid}`), hasta = fecha(fd, `hasta${cid}`);
          if (desde && hasta && hasta < desde) throw new ErrorErp("Una cucarda tiene el \"hasta\" antes del \"desde\".");
          await c.query(`insert into familia_cucarda (organizacion_id, familia_id, cucarda_id, desde, hasta) values ($1, $2, $3, $4, $5)
                         on conflict (familia_id, cucarda_id) do update set desde = excluded.desde, hasta = excluded.hasta`,
            [s.org.id, fid, cid, desde, hasta]);
        } else {
          await c.query("delete from familia_cucarda where familia_id = $1 and cucarda_id = $2 and organizacion_id = $3", [fid, cid, s.org.id]);
        }
      }
    });
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

const fecha = (fd: FormData, k: string) => {
  const t = texto(fd, k);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

/** Sus productos quedan sin familia y sus subfamilias, arriba de todo (lo
 *  hace el `on delete set null` de la base). */
export async function accionBorrarFamilia(fd: FormData) {
  const s = await entrarErp("familias_ver");
  await intentar(VOLVER, async () => {
    const f = await una<{ ml_categoria: string | null }>("select ml_categoria from familia where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    if (!f) throw new ErrorErp("Esa familia no existe.");
    if (f.ml_categoria) throw new ErrorErp(DE_ML);
    await consulta("delete from familia where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(VOLVER);
    return "Familia borrada.";
  });
}

/** A dónde volver después de guardar costos (sólo dentro del catálogo). */
const volverCatalogo = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith("/catalogo/") ? v : VOLVER;
};

/** Costos de importación de una familia (propia o de Mercado Libre: de una
 *  categoría de ML no se toca el nombre ni el árbol, pero sí sus costos).
 *  Todo vacío = la familia no tiene costos propios y hereda todo. */
export async function accionGuardarCostoFamilia(fd: FormData) {
  const s = await entrarErp("familias_ver");
  await intentar(volverCatalogo(fd), async () => {
    const fid = id(fd);
    const existe = await una("select 1 from familia where id = $2 and organizacion_id = $1", [s.org.id, fid]);
    if (!existe) throw new ErrorErp("Esa familia no existe.");
    const cols = TODOS_PCT.map(([k]) => k);
    const pcts = leerPctsCosto(fd, cols);
    const via = texto(fd, "via");
    const ncm = leerNcm(fd);
    if (ncm == null && !esVia(via) && pcts.every((n) => n == null)) {
      await consulta("delete from familia_costo where familia_id = $2 and organizacion_id = $1", [s.org.id, fid]);
    } else {
      await consulta(`
        insert into familia_costo (familia_id, organizacion_id, ncm, via, ${cols.join(", ")}, actualizado_ts)
        values ($1, $2, $3, $4, ${cols.map((_, i) => `$${i + 5}`).join(", ")}, now())
        on conflict (familia_id) do update set ncm = excluded.ncm, via = excluded.via,
          ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}, actualizado_ts = now()`,
        [fid, s.org.id, ncm, esVia(via) ? via : null, ...pcts]);
    }
    revalidatePath(VOLVER);
    return "Costos de la familia guardados.";
  });
}

/** Valores generales de importación de la organización (config_org): flete,
 *  vía, seguro, despachante y depósito. Un campo vacío vuelve al de entrada. */
export async function accionGuardarCostoGeneral(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(volverCatalogo(fd), async () => {
    const claves = CLAVES_GENERAL.filter((k): k is ClavePct => k !== "via" && k !== "ncm");
    const pcts = leerPctsCosto(fd, claves);
    const valor: Record<string, number | string> = {};
    claves.forEach((k, i) => { if (pcts[i] != null) valor[k] = pcts[i]!; });
    const via = texto(fd, "via");
    if (esVia(via)) valor.via = via;
    await consulta(`
      insert into config_org (organizacion_id, clave, valor) values ($1, $2, $3::jsonb)
      on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
      [s.org.id, CLAVE_CONFIG, JSON.stringify(valor)]);
    revalidatePath(VOLVER);
    revalidatePath("/catalogo/productos", "layout");
    return "Valores generales de importación guardados.";
  });
}
