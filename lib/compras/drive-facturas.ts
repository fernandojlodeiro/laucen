// Facturas de compra leídas de las carpetas del Drive (pedido de Fer, 23/10 y 24/10): cada organización carga en
// Configuración › Google Drive las carpetas donde deja los comprobantes de gastos y servicios y las facturas de Mercado
// Libre, ordenadas por año y mes adentro ("Servicios y Gastos Deirolab › 2026 › 10 Octubre", con o sin subcarpetas por
// cuenta). Se recorren los meses pedidos, cada archivo nuevo se lee con la IA y se carga como factura de compra
// (lib/compras/factura-cargar.ts): a nombre de la razón social del CUIT receptor, registrada si el proveedor ya tiene
// cuenta de gasto, en borrador si no. Lo que no es una factura (pagos, cedulones, boletas de Rentas) se anota y se saltea.
// Cada archivo se lee una sola vez (drive_archivo_leido), salvo que cambie o que haya dado error.

import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { archivosDe, bajarDelDrive, carpetaDelMes, carpetasDe, tokenDeAcceso } from "@/lib/google/drive";
import { parsearRutaBase, type Segmento } from "@/lib/google/ruta";
import { leerFacturaArchivo } from "@/lib/compras/factura-leer";
import { cargarFacturaLeida } from "@/lib/compras/factura-cargar";
import { ultimosMeses } from "@/lib/impuestos/drive-ddjj";
import { hoyArgentina } from "@/lib/rango-fechas";

export type CarpetaFacturas = { texto: string; segmentos: Segmento[] };
export type ResultadoFacturasDrive = { registradas: number; borradores: number; yaEstaban: number; otros: number; errores: string[]; carpetas: number; cortado: boolean };

export async function carpetasFacturas(org: string): Promise<CarpetaFacturas[]> {
  return (await una<{ c: CarpetaFacturas[] | null }>("select rutas_facturas c from google_drive where organizacion_id = $1", [org]))?.c ?? [];
}

/** Suma una carpeta (comprueba que exista hasta la parte fija). */
export async function agregarCarpetaFacturas(org: string, texto: string) {
  const p = parsearRutaBase(texto);
  if ("error" in p) throw new ErrorErp(p.error);
  const token = await tokenDeAcceso(org);
  let padre = "root";
  for (const seg of p.segmentos) {
    if (seg.tipo !== "fijo") break;
    const hijo = (await carpetasDe(token, padre)).find((c) => c.name.trim().toLowerCase() === seg.nombre.trim().toLowerCase());
    if (!hijo) throw new ErrorErp(`No encontré la carpeta «${seg.nombre}» en el Drive. Revisá la ruta.`);
    padre = hijo.id;
  }
  const actuales = await carpetasFacturas(org);
  if (actuales.some((c) => c.texto.trim() === texto.trim())) throw new ErrorErp("Esa carpeta ya está.");
  await consulta("update google_drive set rutas_facturas = $2::jsonb, actualizado_ts = now() where organizacion_id = $1",
    [org, JSON.stringify([...actuales, { texto: texto.trim(), segmentos: p.segmentos }])]);
}

export async function quitarCarpetaFacturas(org: string, indice: number) {
  const actuales = await carpetasFacturas(org);
  await consulta("update google_drive set rutas_facturas = $2::jsonb, actualizado_ts = now() where organizacion_id = $1",
    [org, JSON.stringify(actuales.filter((_, i) => i !== indice))]);
}

/** El tipo por el contenido y no por lo que dice el Drive: hay fotos guardadas como PDF y PDF sin extensión. */
function tipoReal(datos: ArrayBuffer, declarado: string) {
  const b = new Uint8Array(datos.slice(0, 8));
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  return declarado;
}

/** Los PDF e imágenes de la carpeta del mes y de sus subcarpetas (hasta dos niveles: una por cuenta de Mercado Libre, por ejemplo). */
async function archivosDelMes(token: string, carpeta: string, nombre: string, nivel = 0): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string; size?: string; donde: string }[]> {
  const propios = (await archivosDe(token, carpeta)).map((f) => ({ ...f, donde: nombre }));
  if (nivel >= 2) return propios;
  const subs = await carpetasDe(token, carpeta);
  for (const s of subs) propios.push(...(await archivosDelMes(token, s.id, `${nombre} › ${s.name}`, nivel + 1)));
  return propios;
}

export async function leerFacturasDelDrive(org: string, usuarioId: string, opts: { meses?: number; hastaMs?: number } = {}): Promise<ResultadoFacturasDrive> {
  const hasta = opts.hastaMs ?? Date.now() + 45_000;
  const res: ResultadoFacturasDrive = { registradas: 0, borradores: 0, yaEstaban: 0, otros: 0, errores: [], carpetas: 0, cortado: false };
  const carpetas = await carpetasFacturas(org);
  if (!carpetas.length) throw new ErrorErp("Falta cargar las carpetas de facturas: Configuración › Google Drive.");
  const token = await tokenDeAcceso(org);
  // Del mes más viejo al más nuevo: así, si corta, lo que queda es lo último.
  const meses = ultimosMeses(hoyArgentina(), opts.meses ?? 2).reverse();
  fuera: for (const c of carpetas) {
    for (const { año, mes } of meses) {
      const carpetaMes = await carpetaDelMes(token, c.segmentos, año, mes);
      if (!carpetaMes) continue;
      res.carpetas++;
      const base = `${c.texto.split(/[\\/]+/).filter(Boolean).at(-1)} › ${String(mes).padStart(2, "0")}/${año}`;
      for (const f of await archivosDelMes(token, carpetaMes, base)) {
        const ya = await una<{ modificado: string | null }>("select modificado from drive_archivo_leido where organizacion_id = $1 and archivo_id = $2", [org, f.id]);
        if (ya && ya.modificado === f.modifiedTime) continue;
        if (Date.now() > hasta) { res.cortado = true; break fuera; }
        const anotar = (estado: string, mensaje: string | null, facturaId: number | null = null, reintentar = false) => consulta(`
          insert into drive_archivo_leido (organizacion_id, archivo_id, nombre, modificado, carpeta, estado, mensaje, factura_id) values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict (organizacion_id, archivo_id) do update set nombre = excluded.nombre, modificado = excluded.modificado, carpeta = excluded.carpeta,
            estado = excluded.estado, mensaje = excluded.mensaje, factura_id = excluded.factura_id, leido_ts = now()`,
          // Un error pasajero (la IA no respondió) queda sin fecha: se vuelve a probar en la próxima vuelta. Uno del papel
          // (no cierra, es de otro CUIT) no: se reintenta sólo si el archivo cambia.
          [org, f.id, f.name, reintentar ? null : f.modifiedTime, f.donde, estado, mensaje, facturaId]);
        try {
          if (Number(f.size ?? 0) > 20_000_000) throw new Error("es muy grande para leerlo");
          const datos = await bajarDelDrive(token, f.id);
          const l = await leerFacturaArchivo(datos, tipoReal(datos, f.mimeType));
          if ("error" in l) throw new Error(l.error); // pasajero: se reintenta
          // Una factura bonificada (total cero) no suma nada al libro ni a la cuenta corriente.
          if (l.lectura.es_comprobante !== false && Number(l.lectura.total) === 0) {
            await anotar("otro", "comprobante con total cero (bonificado): no se carga");
            res.otros++;
            continue;
          }
          if (l.lectura.es_comprobante === false) {
            await anotar("otro", l.lectura.que_es ?? "no es una factura");
            res.otros++;
            continue;
          }
          const r = await cargarFacturaLeida(org, usuarioId, l.lectura, `drive:${f.id}`, f.name);
          await anotar(r.estado === "ya_estaba" ? "ya_estaba" : r.estado === "registrada" ? "factura" : "borrador", r.mensaje, r.id);
          if (r.estado === "ya_estaba") res.yaEstaban++; else if (r.estado === "registrada") res.registradas++; else res.borradores++;
        } catch (e) {
          const m = e instanceof Error && !(e as { code?: string }).code ? e.message : motivoErp(e);
          await anotar("error", m, null, !(e instanceof ErrorErp));
          res.errores.push(`${f.donde} › ${f.name}: ${m}`);
        }
      }
    }
  }
  await consulta("update google_drive set facturas_leido_ts = now(), facturas_resultado = $2 where organizacion_id = $1", [org, textoResultadoFacturas(res)]);
  return res;
}

export function textoResultadoFacturas(r: ResultadoFacturasDrive) {
  const partes = [`${r.registradas} registrada${r.registradas === 1 ? "" : "s"}`];
  if (r.borradores) partes.push(`${r.borradores} en borrador (falta la cuenta de gasto o revisar el total)`);
  if (r.yaEstaban) partes.push(`${r.yaEstaban} ya estaba${r.yaEstaban === 1 ? "" : "n"} cargada${r.yaEstaban === 1 ? "" : "s"}`);
  if (r.otros) partes.push(`${r.otros} papel${r.otros === 1 ? "" : "es"} que no son facturas (pagos, cedulones)`);
  if (r.errores.length) partes.push(`${r.errores.length} con error`);
  return `${partes.join(", ")}${r.carpetas ? "" : " (no encontré la carpeta de esos meses)"}${r.cortado ? ". Quedaron archivos sin leer: apretá de nuevo y sigue" : ""}.`;
}

/** Para la tarea de la noche: las organizaciones con carpetas de facturas y sin leer en las últimas 20 horas. */
export async function organizacionesParaLeerFacturas() {
  return (await consulta<{ organizacion_id: string }>(`select organizacion_id from google_drive
     where refresh_token is not null and jsonb_array_length(coalesce(rutas_facturas, '[]'::jsonb)) > 0
       and (facturas_leido_ts is null or facturas_leido_ts < now() - interval '20 hours')`)).map((x) => x.organizacion_id);
}
