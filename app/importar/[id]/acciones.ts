"use server";

// Una importación: mapear columnas (y guardar o cargar un mapeo con nombre)
// y ejecutar de a lotes.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { DESTINOS, esDestino } from "@/lib/importar/campos";
import { ejecutarImportacion } from "@/lib/importar/ejecutar";

const volver = (n: number) => `/importar/${n}`;

/** La importación, si es de la organización y todavía no se ejecutó nada. */
async function editable(org: string, importacionId: number) {
  const imp = await una<{ destino: string; columnas: string[]; empezada: boolean }>(`
    select destino, columnas, exists (select 1 from importacion_fila f where f.importacion_id = i.id and f.resultado is not null) empezada
      from importacion i where id = $1 and organizacion_id = $2`, [importacionId, org]);
  if (!imp || !esDestino(imp.destino)) throw new ErrorErp("La importación no existe.");
  if (imp.empezada) throw new ErrorErp("Ya se empezó a ejecutar: el mapeo no se puede cambiar. Subí el archivo de nuevo si hace falta.");
  return { ...imp, destino: imp.destino };
}

export async function accionGuardarMapeo(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    const imp = await editable(s.org.id, iid);
    const mapeo: Record<string, string> = {};
    for (const c of DESTINOS[imp.destino].campos) {
      const col = texto(fd, `campo_${c.clave}`);
      if (col && imp.columnas.includes(col)) mapeo[c.clave] = col;
    }
    await consulta("update importacion set mapeo = $3::jsonb where id = $1 and organizacion_id = $2", [iid, s.org.id, JSON.stringify(mapeo)]);
    const nombre = texto(fd, "nombre_mapeo");
    if (fd.get("guardar") === "con_nombre") {
      if (!nombre) throw new ErrorErp("Poné un nombre para guardar el mapeo.");
      await consulta(`
        insert into importacion_mapeo (organizacion_id, nombre, destino, mapeo) values ($1, $2, $3, $4::jsonb)
        on conflict (organizacion_id, destino, nombre) do update set mapeo = excluded.mapeo`,
        [s.org.id, nombre, imp.destino, JSON.stringify(mapeo)]);
      revalidatePath(volver(iid));
      return `Mapeo guardado como "${nombre}".`;
    }
    revalidatePath(volver(iid));
    return "Mapeo aplicado: mirá la vista previa.";
  });
}

export async function accionCargarMapeo(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    const imp = await editable(s.org.id, iid);
    const m = await una<{ nombre: string; mapeo: Record<string, string> }>(
      "select nombre, mapeo from importacion_mapeo where id = $1 and organizacion_id = $2 and destino = $3", [id(fd, "mapeo_id"), s.org.id, imp.destino]);
    if (!m) throw new ErrorErp("Ese mapeo no existe.");
    // Sólo las columnas que este archivo tiene.
    const mapeo = Object.fromEntries(Object.entries(m.mapeo).filter(([, col]) => imp.columnas.includes(col)));
    await consulta("update importacion set mapeo = $3::jsonb where id = $1 and organizacion_id = $2", [iid, s.org.id, JSON.stringify(mapeo)]);
    const faltan = Object.keys(m.mapeo).length - Object.keys(mapeo).length;
    revalidatePath(volver(iid));
    return `Mapeo "${m.nombre}" cargado.${faltan ? ` ${faltan} columna${faltan === 1 ? "" : "s"} del mapeo no está${faltan === 1 ? "" : "n"} en este archivo.` : ""}`;
  });
}

export async function accionBorrarMapeo(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    await consulta("delete from importacion_mapeo where id = $1 and organizacion_id = $2", [id(fd, "mapeo_id"), s.org.id]);
    revalidatePath(volver(iid));
    return "Mapeo guardado borrado.";
  });
}

/** Ejecuta (o sigue) la importación hasta terminar o hasta el tope de tiempo. */
export async function accionEjecutar(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    const r = await ejecutarImportacion(s.org.id, iid, s.usuario.id);
    revalidatePath(volver(iid));
    revalidatePath("/importar");
    if (r.pendientes) {
      const msg = `Se procesaron ${r.procesadas.toLocaleString("es-AR")} filas; quedan ${r.pendientes.toLocaleString("es-AR")}.`;
      // Con "seguir", la pantalla vuelve a mandar el formulario sola (SeguirSolo).
      return fd.get("seguir") === "1"
        ? { ir: `${volver(iid)}?seguir=1&ok=${encodeURIComponent(msg + " Sigue solo…")}` }
        : `${msg} Tocá "Seguir".`;
    }
    return "Listo: se procesaron todas las filas.";
  });
}
