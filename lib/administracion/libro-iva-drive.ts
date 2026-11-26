// El Libro de IVA al Drive (Fer, 23/10 y 25/11): lo que se sube a la carpeta del mes de cada razón social, el registro de
// cada subida (libro_iva_envio, db/impuestos.sql) y la vuelta de cada noche (la corre app/api/erp/tareas):
//
//   · «todo»: los 5 TXT del Libro de IVA Digital + las ventas por provincia (Excel). Lo sube el botón «Mandar al Drive»
//     y, solo, el día 1 de cada mes el del mes que terminó (si esa noche falla, se reintenta la siguiente).
//   · «compras»: los 3 TXT de compras. Cada noche, de cada mes todavía sin liquidar (sin declaración jurada de IVA),
//     se arman y se suben sólo si cambiaron desde la última subida (se compara su huella). Un mes liquidado ya no cambia
//     (la traba de la base, db/impuestos.sql) y deja de subirse.

import { createHash } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { archivosLibroIvaDigital, rangoMes } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { ventasPorProvincia, excelProvincias, nombreArchivoProvincias } from "@/lib/administracion/ventas-provincia";
import { subirAlDrive, rutasDe } from "@/lib/google/drive";
import { hoyArgentina } from "@/lib/rango-fechas";

export type QueSube = "todo" | "compras";
type Archivo = { nombre: string; contenido: Buffer; tipo: string };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const mesAr = (mes: string) => mes.split("-").reverse().join("/");

/** Los archivos del mes de una razón social y la huella de los de compras. */
export async function archivosDelMes(org: string, emisorId: number, mes: string, que: QueSube) {
  const { desde, hasta } = rangoMes(mes);
  const periodo = mes.replace("-", "");
  const { ventas, compras } = await libroIvaPeriodo(org, desde, hasta, emisorId);
  const txt = archivosLibroIvaDigital(periodo, ventas, compras);
  const deCompras = txt.filter((a) => /_(COMPRAS|IMPORTACIONES)_/.test(a.nombre));
  const huella = createHash("sha256").update(deCompras.map((a) => `${a.nombre}\n${a.contenido}`).join("\n\n")).digest("hex");
  const archivos: Archivo[] = (que === "todo" ? txt : deCompras).map((a) => ({ nombre: a.nombre, contenido: Buffer.from(a.contenido, "latin1"), tipo: "text/plain" }));
  if (que === "todo") {
    const filas = await ventasPorProvincia(org, ventas);
    archivos.push({ nombre: nombreArchivoProvincias(periodo), contenido: await excelProvincias(filas, `Ventas por provincia ${mesAr(mes)}`), tipo: XLSX });
  }
  return { archivos, huella, comprasVacias: compras.length === 0 };
}

/** Sube y deja el registro (salga bien o mal). Si falla, el error sigue de largo después de anotarlo. */
export async function mandarLibroAlDrive(org: string, emisorId: number, mes: string, que: QueSube, origen: "automatico" | "manual", usuarioId: string | null = null) {
  let huella: string | null = null;
  try {
    const a = await archivosDelMes(org, emisorId, mes, que);
    huella = a.huella;
    const r = await subirAlDrive(org, emisorId, mes, a.archivos);
    await consulta(`insert into libro_iva_envio (organizacion_id, emisor_id, periodo, que, origen, ok, archivos, donde, huella_compras, usuario_id)
      values ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)`, [org, emisorId, mes, que, origen, a.archivos.map((x) => x.nombre), r.donde, huella, usuarioId]);
    return { ...r, archivos: a.archivos.map((x) => x.nombre) };
  } catch (e) {
    const motivo = e instanceof ErrorErp ? e.message : `No se pudo subir: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    await consulta(`insert into libro_iva_envio (organizacion_id, emisor_id, periodo, que, origen, ok, huella_compras, error, usuario_id)
      values ($1, $2, $3, $4, $5, false, $6, $7, $8)`, [org, emisorId, mes, que, origen, huella, motivo, usuarioId]).catch(() => {});
    throw e;
  }
}

export type EnvioLibro = { id: number; periodo: string; que: QueSube; origen: "automatico" | "manual"; ok: boolean; archivos: string[] | null; donde: string | null; error: string | null; ts: string };

/** Las subidas de un mes de una razón social, de la más nueva a la más vieja. */
export function enviosDelMes(org: string, emisorId: number, mes: string) {
  return consulta<EnvioLibro>(`select id::int, periodo, que, origen, ok, archivos, donde, error, ts::text from libro_iva_envio
    where organizacion_id = $1 and emisor_id = $2 and periodo = $3 order by ts desc limit 60`, [org, emisorId, mes]);
}

/** Si el mes está liquidado: la declaración de IVA que lo traba (la de rectificativa más alta). */
export function liquidacionDelMes(org: string, emisorId: number, mes: string) {
  return una<{ id: number; rectificativa: number; fecha_presentacion: string | null; creado_ts: string }>(`
    select id::int, rectificativa, to_char(fecha_presentacion, 'YYYY-MM-DD') fecha_presentacion, creado_ts::text from ddjj
     where organizacion_id = $1 and emisor_id = $2 and impuesto = 'iva' and periodo = $3 order by rectificativa desc, id desc limit 1`, [org, emisorId, mes]);
}

const mesMas = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Para la tarea de la noche (app/api/erp/tareas, entre las 3 y las 5, después de leer las declaraciones del Drive):
 *  las organizaciones con el Drive conectado, alguna ruta y sin vuelta del libro en las últimas 20 horas. */
export async function organizacionesParaLibroIva() {
  return (await consulta<{ organizacion_id: string }>(`select organizacion_id from google_drive
    where refresh_token is not null and rutas <> '{}'::jsonb and (libro_iva_ts is null or libro_iva_ts < now() - interval '20 hours')`)).map((x) => x.organizacion_id);
}

/** La vuelta de cada noche, de una organización (o de todas las que tienen el Drive conectado). Al terminar deja la
 *  marca de la noche (google_drive.libro_iva_ts) y lo hecho (libro_iva_resultado). Devuelve qué hizo. */
export async function vueltaLibrosIva(hoy = hoyArgentina(), soloOrg: string | null = null) {
  const mesActual = hoy.slice(0, 7);
  const mesPasado = mesMas(mesActual, -1);
  const hecho: string[] = [];
  const orgs = await consulta<{ organizacion_id: string }>("select organizacion_id from google_drive where refresh_token is not null and ($1::text is null or organizacion_id = $1)", [soloOrg]);
  for (const { organizacion_id: org } of orgs) {
    const rutas = await rutasDe(org);
    const emisores = await consulta<{ id: number; nombre: string }>("select id::int, coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 order by id", [org]);
    for (const e of emisores.filter((x) => rutas[String(x.id)])) {
      // Ventas: todo el mes que terminó, una vez (si no salió bien, se reintenta la noche siguiente).
      const ya = await una("select 1 from libro_iva_envio where organizacion_id = $1 and emisor_id = $2 and periodo = $3 and que = 'todo' and origen = 'automatico' and ok",
        [org, e.id, mesPasado]);
      if (!ya) {
        try { await mandarLibroAlDrive(org, e.id, mesPasado, "todo", "automatico"); hecho.push(`${e.nombre} ${mesPasado}: libro entero`); }
        catch (x) { hecho.push(`${e.nombre} ${mesPasado}: error ${x instanceof Error ? x.message : x}`); }
      }
      // Compras: cada mes sin liquidar desde el último liquidado (hasta 3 meses para atrás), si cambiaron.
      const ultimo = await una<{ periodo: string }>("select max(periodo) periodo from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = 'iva'", [org, e.id]);
      let mes = ultimo?.periodo ? mesMas(ultimo.periodo, 1) : mesPasado;
      if (mes < mesMas(mesActual, -3)) mes = mesMas(mesActual, -3);
      for (; mes <= mesActual; mes = mesMas(mes, 1)) {
        if (await una("select 1 from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = 'iva' and periodo = $3", [org, e.id, mes])) continue;
        try {
          const { huella, comprasVacias } = await archivosDelMes(org, e.id, mes, "compras");
          const antes = await una<{ huella_compras: string | null }>(`select huella_compras from libro_iva_envio
            where organizacion_id = $1 and emisor_id = $2 and periodo = $3 and ok order by ts desc limit 1`, [org, e.id, mes]);
          if (antes?.huella_compras === huella || (!antes && comprasVacias)) continue;
          await mandarLibroAlDrive(org, e.id, mes, "compras", "automatico");
          hecho.push(`${e.nombre} ${mes}: compras`);
        } catch (x) { hecho.push(`${e.nombre} ${mes}: error ${x instanceof Error ? x.message : x}`); }
      }
    }
    await consulta("update google_drive set libro_iva_ts = now(), libro_iva_resultado = $2 where organizacion_id = $1",
      [org, (hecho.join(" · ") || "Nada para subir.").slice(0, 2000)]);
  }
  return hecho;
}
