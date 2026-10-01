"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id, tildado } from "@/lib/erp/acciones";

const VOLVER = "/catalogo/familias";

function leerDescuento(fd: FormData) {
  const n = numero(fd, "descuento_pct");
  if (n != null && (n < 0 || n > 100)) throw new ErrorErp("El descuento va de 0 a 100 %.");
  return n;
}

/** El padre elegido, verificado: que sea de la organización y que la familia
 *  no quede como su propia ancestra (subiendo desde el padre no tiene que
 *  aparecer ella). */
async function padreValido(org: string, padre: number, familia: number | null) {
  if (!padre) return null;
  if (padre === familia) throw new ErrorErp("Una familia no puede ser su propio padre.");
  const ok = await una("select 1 from familia where id = $2 and organizacion_id = $1", [org, padre]);
  if (!ok) throw new ErrorErp("La familia padre no existe.");
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
    await consulta("insert into familia (organizacion_id, nombre, descripcion, padre_id, descuento_pct) values ($1, $2, $3, $4, $5)",
      [s.org.id, nombre, texto(fd, "descripcion"), padre, leerDescuento(fd)]);
    revalidatePath(VOLVER);
    return "Familia creada.";
  });
}

export async function accionGuardarFamilia(fd: FormData) {
  const s = await entrarErp("familias_ver");
  await intentar(VOLVER, async () => {
    const fid = id(fd);
    const existe = await una("select 1 from familia where id = $2 and organizacion_id = $1", [s.org.id, fid]);
    if (!existe) throw new ErrorErp("Esa familia no existe.");
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La familia necesita un nombre.");
    const padre = await padreValido(s.org.id, id(fd, "padre_id"), fid);
    const descuento = leerDescuento(fd);
    const cucardas = await consulta<{ id: number }>("select id::int from cucarda where organizacion_id = $1", [s.org.id]);
    await enTransaccion(async (c) => {
      await c.query("update familia set nombre = $3, descripcion = $4, padre_id = $5, descuento_pct = $6 where id = $2 and organizacion_id = $1",
        [s.org.id, fid, nombre, texto(fd, "descripcion"), padre, descuento]);
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
    await consulta("delete from familia where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(VOLVER);
    return "Familia borrada.";
  });
}
