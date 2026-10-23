// Las declaraciones que el contador deja en el Drive (Fer, 23/10): en la carpeta de cada mes de cada razón social (la
// ruta de Configuración › Google Drive, lib/google/ruta.ts), las subcarpetas «IVA», «Ingresos Brutos / IIBB» y
// «Comercio e Industria» (y los archivos sueltos en la carpeta del mes). Cada PDF (o foto) nuevo o cambiado se lee con la IA (lib/impuestos/ddjj-leer.ts): si es una
// declaración se carga (a la razón social de su CUIT); un cedulón, VEP o comprobante de pago se saltea. Cada archivo
// leído queda anotado (drive_archivo_leido) para no pasarlo dos veces por la IA. Una declaración que ya estaba cargada
// (mismo impuesto, mes y rectificativa) no se pisa: puede tener correcciones a mano.
//
// Corre con el botón «Buscar en el Drive» de Impuestos y, solo, una vez por noche (app/api/erp/tareas).

import { consulta, una, motivoErp } from "@/lib/erp/base";
import { archivosDe, bajarDelDrive, carpetaDelMes, carpetasDe, rutasDe, tokenDeAcceso } from "@/lib/google/drive";
import { aDdjj, leerDdjjArchivo, IMPUESTOS, type Impuesto } from "@/lib/impuestos/ddjj-leer";
import { grabarDdjj } from "@/lib/impuestos/ddjj";
import { hoyArgentina } from "@/lib/rango-fechas";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** De qué impuesto son las declaraciones de una subcarpeta del mes, por su nombre (null: no se mira). Pura. */
export function impuestoDeCarpeta(nombre: string): Impuesto | null {
  const t = normal(nombre);
  if (/\biibb\b|ingresos brutos|convenio/.test(t)) return "iibb";
  if (/comercio|industria|municipal/.test(t)) return "municipal";
  if (/\biva\b/.test(t) && !/digital|libro/.test(t)) return "iva";
  return null;
}

/** Los últimos `n` meses (AAAA, MM), del actual para atrás. Pura. */
export function ultimosMeses(hoy: string, n: number) {
  const [a, m] = hoy.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(a, m - 1 - i, 1)); return { año: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }; });
}

export type ResultadoDrive = { cargadas: number; yaEstaban: number; otros: number; errores: string[]; carpetas: number; cortado: boolean };

export async function leerDdjjDelDrive(org: string, usuarioId: string, opts: { meses?: number; hastaMs?: number } = {}): Promise<ResultadoDrive> {
  const hasta = opts.hastaMs ?? Date.now() + 45_000;
  const res: ResultadoDrive = { cargadas: 0, yaEstaban: 0, otros: 0, errores: [], carpetas: 0, cortado: false };
  const rutas = await rutasDe(org);
  if (!Object.keys(rutas).length) throw new Error("Falta la ruta de las carpetas de cada mes: cargala en Configuración › Google Drive.");
  const token = await tokenDeAcceso(org);
  const emisores = await consulta<{ id: number; cuit: string }>("select id::int, regexp_replace(cuit, '\\D', '', 'g') cuit from emisor where organizacion_id = $1", [org]);
  const vistas = new Set<string>();
  fuera: for (const [emisorTxt, ruta] of Object.entries(rutas)) {
    for (const { año, mes } of ultimosMeses(hoyArgentina(), opts.meses ?? 3)) {
      const carpetaMes = await carpetaDelMes(token, ruta.segmentos, año, mes);
      if (!carpetaMes || vistas.has(carpetaMes)) continue;
      vistas.add(carpetaMes);
      // Las subcarpetas de cada impuesto y, por si están sueltos, los archivos de la carpeta del mes misma.
      const subs = [...(await carpetasDe(token, carpetaMes)).filter((c) => impuestoDeCarpeta(c.name)), { id: carpetaMes, name: "(en la carpeta del mes)" }];
      for (const sub of subs) {
        res.carpetas++;
        for (const f of await archivosDe(token, sub.id)) {
          const ya = await una<{ modificado: string | null }>("select modificado from drive_archivo_leido where organizacion_id = $1 and archivo_id = $2", [org, f.id]);
          if (ya && ya.modificado === f.modifiedTime) continue;
          if (Date.now() > hasta) { res.cortado = true; break fuera; }
          const donde = `${String(mes).padStart(2, "0")}/${año} › ${sub.name} › ${f.name}`;
          const anotar = (estado: string, mensaje: string | null, ddjjId: number | null = null) => consulta(`
            insert into drive_archivo_leido (organizacion_id, archivo_id, nombre, modificado, carpeta, estado, mensaje, ddjj_id) values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict (organizacion_id, archivo_id) do update set nombre = excluded.nombre, modificado = excluded.modificado, carpeta = excluded.carpeta,
              estado = excluded.estado, mensaje = excluded.mensaje, ddjj_id = excluded.ddjj_id, leido_ts = now()`,
            // Un error queda sin fecha: se vuelve a probar en la próxima vuelta (puede ser una falla pasajera de la IA).
            [org, f.id, f.name, estado === "error" ? null : f.modifiedTime, `${String(mes).padStart(2, "0")}/${año} › ${sub.name}`, estado, mensaje, ddjjId]);
          try {
            if (Number(f.size ?? 0) > 20_000_000) throw new Error("es muy grande para leerlo");
            const l = await leerDdjjArchivo(await bajarDelDrive(token, f.id), f.mimeType);
            if ("error" in l) throw new Error(l.error);
            if (String(l.lectura.impuesto ?? "").toLowerCase() === "no_es_ddjj") {
              await anotar("otro", l.lectura.que_es ?? "no es una declaración");
              res.otros++;
              continue;
            }
            const x = aDdjj(l.lectura);
            if ("error" in x) throw new Error(x.error);
            const emisor = x.cuit ? emisores.find((e) => e.cuit === x.cuit) : emisores.find((e) => e.id === Number(emisorTxt));
            if (!emisor) throw new Error(`es del CUIT ${x.cuit}, que no es de ninguna de tus razones sociales`);
            const existe = await una<{ id: number }>("select id::int from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = $3 and periodo = $4 and rectificativa = $5",
              [org, emisor.id, x.impuesto, x.periodo, x.rectificativa]);
            if (existe) {
              await anotar("ya_estaba", `${IMPUESTOS[x.impuesto]} ${x.periodo} ya estaba cargada`, existe.id);
              res.yaEstaban++;
              continue;
            }
            const g = await grabarDdjj(org, { emisorId: emisor.id, impuesto: x.impuesto, periodo: x.periodo, rectificativa: x.rectificativa, fecha: x.fecha,
              datos: x.datos, lectura: l.lectura, archivo: `drive:${f.id}`, archivoNombre: f.name, usuarioId });
            await anotar("ddjj", `${IMPUESTOS[x.impuesto]} ${x.periodo}`, g.id);
            res.cargadas++;
          } catch (e) {
            const m = e instanceof Error && !(e as { code?: string }).code ? e.message : motivoErp(e);
            await anotar("error", m);
            res.errores.push(`${donde}: ${m}`);
          }
        }
      }
    }
  }
  await consulta("update google_drive set ddjj_leido_ts = now(), ddjj_resultado = $2 where organizacion_id = $1", [org, textoResultado(res)]);
  return res;
}

export function textoResultado(r: ResultadoDrive) {
  const partes = [`${r.cargadas} declaración${r.cargadas === 1 ? "" : "es"} nueva${r.cargadas === 1 ? "" : "s"}`];
  if (r.yaEstaban) partes.push(`${r.yaEstaban} ya estaba${r.yaEstaban === 1 ? "" : "n"}`);
  if (r.otros) partes.push(`${r.otros} papel${r.otros === 1 ? "" : "es"} que no son declaraciones (pagos, cedulones)`);
  if (r.errores.length) partes.push(`${r.errores.length} con error`);
  return `${partes.join(", ")}${r.carpetas ? "" : " (no encontré carpetas de IVA, Ingresos Brutos o Comercio e Industria en los últimos meses)"}${r.cortado ? ". Quedaron archivos sin leer: se siguen en la próxima vuelta" : ""}.`;
}

/** Para la tarea de la noche: las organizaciones con el Drive conectado, alguna ruta y sin leer en las últimas 20 horas. */
export async function organizacionesParaLeerDrive() {
  return (await consulta<{ organizacion_id: string }>(`select organizacion_id from google_drive
    where refresh_token is not null and rutas <> '{}'::jsonb and (ddjj_leido_ts is null or ddjj_leido_ts < now() - interval '20 hours')`)).map((x) => x.organizacion_id);
}
