"use server";

// Guardar y borrar las configuraciones de una lista (Excel o vista).

import { cookies } from "next/headers";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { cookieDe, esTipoConfig } from "@/lib/listas/config";
import { camposDe } from "@/lib/listas/tipos";
import { LISTAS } from "@/app/listas/registro";

function leer(fd: FormData) {
  const pantalla = String(fd.get("pantalla") ?? "");
  const lista = Object.hasOwn(LISTAS, pantalla) ? LISTAS[pantalla] : null;
  if (!lista) throw new Error("lista desconocida");
  const tipo = fd.get("tipo");
  if (!esTipoConfig(tipo) || (tipo === "vista" && !lista.vistas)) throw new Error("tipo desconocido");
  // A dónde se vuelve: sólo a la pantalla de esta lista (o a la configuración).
  const interna = (v: string | null, defecto: string) => (v && (v.startsWith(`${lista.ruta}?`) || v === lista.ruta || v.startsWith(`/listas/${pantalla}/`)) ? v : defecto);
  const aqui = interna(texto(fd, "aqui"), `/listas/${pantalla}/configurar?tipo=${tipo}`);
  return { lista, tipo, aqui, volver: interna(texto(fd, "volver"), lista.ruta) };
}

const conOk = (destino: string, ok: string) => {
  const [base, query = ""] = destino.split("?");
  const p = new URLSearchParams(query);
  p.delete("error");
  p.set("ok", ok);
  return `${base}?${p}`;
};

export async function accionGuardarConfig(fd: FormData) {
  const { lista, tipo, aqui, volver } = leer(fd);
  const s = await entrarErp(lista.permiso);
  await intentar(aqui, async () => {
    const nombre = texto(fd, "nombre")?.slice(0, 60);
    if (!nombre) throw new ErrorErp("Ponele un nombre.");
    const catalogo = new Set((await camposDe(lista, { org: s.org.id, moneda: s.moneda })).map((c) => c.clave));
    let columnas: unknown;
    try { columnas = JSON.parse(String(fd.get("columnas") ?? "[]")); } catch { columnas = []; }
    const elegidas = Array.isArray(columnas) ? [...new Set(columnas.filter((c): c is string => typeof c === "string" && catalogo.has(c)))] : [];
    if (!elegidas.length) throw new ErrorErp("Tildá al menos una columna.");
    const cual = id(fd);
    let guardada: number;
    if (cual) {
      const r = await una<{ id: number }>(`
        update lista_config set nombre = $5, columnas = $6::jsonb
         where id = $4 and organizacion_id = $1 and pantalla = $2 and tipo = $3 returning id::int`,
        [s.org.id, lista.pantalla, tipo, cual, nombre, JSON.stringify(elegidas)]);
      if (!r) throw new ErrorErp("Esa configuración ya no existe.");
      guardada = r.id;
    } else {
      const r = await una<{ id: number }>(`
        insert into lista_config (organizacion_id, pantalla, tipo, nombre, columnas) values ($1, $2, $3, $4, $5::jsonb) returning id::int`,
        [s.org.id, lista.pantalla, tipo, nombre, JSON.stringify(elegidas)]);
      guardada = r!.id;
    }
    // Queda elegida en la pantalla.
    (await cookies()).set(cookieDe(tipo, lista.pantalla), String(guardada), { path: lista.ruta, maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return { ir: conOk(volver, `Guardada «${nombre}»${tipo === "vista" ? ": es la vista que se ve" : ": queda elegida para el Excel"}.`) };
  });
}

export async function accionBorrarConfig(fd: FormData) {
  const { lista, tipo, aqui } = leer(fd);
  const s = await entrarErp(lista.permiso);
  await intentar(aqui, async () => {
    await consulta("delete from lista_config where id = $4 and organizacion_id = $1 and pantalla = $2 and tipo = $3",
      [s.org.id, lista.pantalla, tipo, id(fd)]);
    return "Borrada.";
  });
}
