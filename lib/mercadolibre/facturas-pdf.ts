// Las facturas que Mercado Libre y Mercado Pago le hacen a cada cuenta, solas (Fer, 4/11): «las necesitamos porque ahí
// se discriminan bien las percepciones de Ingresos Brutos». La facturación de ML ya se lee todas las noches
// (lib/mercadolibre/facturacion.ts: ml_factura_documento, con el file_id de cada PDF); acá, por cada factura o nota de
// crédito que todavía no se procesó:
//   1. se baja el PDF por la API (GET /billing/integration/legal_document/{file_id}: sólo lectura);
//   2. se lee con la IA, como «Subir factura» (lib/compras/factura-leer.ts);
//   3. si ya estaba cargada (entró por el reporte de ARCA) se le suman el PDF y las percepciones de IIBB por provincia;
//      si no, se carga como factura de compra, registrada con la cuenta del proveedor (de fábrica, «Comisiones»);
//   4. el PDF queda en la carpeta de Mercado Libre del Drive si está conectado; si no, la factura lo pide a ML al abrirlo
//      (archivo «ml:<cuenta>:<file_id>», app/compras/facturas/[id]/pdf).
// Corre después de leer la facturación (de noche y con «Traer facturación de ML»). Un PDF que falló se reintenta al día.

import { consulta, una, motivoErp } from "@/lib/erp/base";
import { mlBinario, cuentaPorId } from "@/lib/mercadolibre/api";
import { leerFacturaArchivo, aComprobante } from "@/lib/compras/factura-leer";
import { cargarFacturaLeida } from "@/lib/compras/factura-cargar";
import { subirFacturaAlDrive } from "@/lib/compras/drive-facturas";

const ES_PDF = (b: ArrayBuffer) => { const x = new Uint8Array(b.slice(0, 4)); return x[0] === 0x25 && x[1] === 0x50 && x[2] === 0x44 && x[3] === 0x46; };

/** El file_id del PDF (ML puede dar dos: el del PDF y el del XML). */
export function archivoPdf(archivos: { file_id?: string }[] | null | undefined): string | null {
  const ids = (archivos ?? []).map((a) => String(a.file_id ?? "")).filter(Boolean);
  return ids.find((x) => /pdf/i.test(x)) ?? ids.find((x) => !/xml/i.test(x)) ?? null;
}

/** El PDF de una factura de ML (para mostrarlo desde la factura de compra). */
export async function bajarPdfMl(org: string, archivo: string): Promise<ArrayBuffer | null> {
  const m = /^ml:(\d+):(.+)$/.exec(archivo);
  if (!m) return null;
  const cuenta = await cuentaPorId(org, Number(m[1]));
  if (!cuenta) return null;
  const r = await mlBinario(cuenta, `/billing/integration/legal_document/${encodeURIComponent(m[2])}`);
  return r && ES_PDF(r.datos) ? r.datos : null;
}

export type ResultadoPdfMl = { procesadas: number; cargadas: number; completadas: number; errores: number };

export async function procesarFacturasMl(org: string | null, hastaMs: number): Promise<ResultadoPdfMl> {
  const res: ResultadoPdfMl = { procesadas: 0, cargadas: 0, completadas: 0, errores: 0 };
  const docs = await consulta<{ id: number; organizacion_id: string; cuenta_id: number; archivos: { file_id?: string }[]; numero: string | null }>(`
    select id::int, organizacion_id, cuenta_id::int, archivos, numero from ml_factura_documento
     where jsonb_array_length(coalesce(archivos, '[]'::jsonb)) > 0 and ($1::text is null or organizacion_id = $1)
       and (pdf_estado is null or (pdf_estado = 'error' and pdf_ts < now() - interval '1 day'))
     order by id limit 30`, [org]);
  for (const d of docs) {
    if (Date.now() > hastaMs - 25_000) break;
    res.procesadas++;
    const anotar = (estado: string, mensaje: string | null, facturaId: number | null = null) => consulta(
      "update ml_factura_documento set pdf_estado = $2, pdf_mensaje = $3, pdf_factura_id = $4, pdf_ts = now() where id = $1", [d.id, estado, mensaje?.slice(0, 500) ?? null, facturaId]);
    try {
      const fileId = archivoPdf(d.archivos);
      const cuenta = await cuentaPorId(d.organizacion_id, d.cuenta_id);
      if (!fileId || !cuenta) { await anotar("error", "sin archivo o sin la cuenta"); res.errores++; continue; }
      const archivo = `ml:${cuenta.id}:${fileId}`;
      const datos = await bajarPdfMl(d.organizacion_id, archivo);
      if (!datos) { await anotar("error", "Mercado Libre no dio el PDF"); res.errores++; continue; }
      const r = await leerFacturaArchivo(datos, "application/pdf");
      if ("error" in r) { await anotar("error", r.error); res.errores++; continue; }
      if (r.lectura.es_comprobante === false) { await anotar("otro", r.lectura.que_es ?? "no es una factura"); continue; }
      const x = aComprobante(r.lectura);
      if ("error" in x) { await anotar("error", x.error); res.errores++; continue; }
      const c = x.c;
      // El proveedor (Mercado Libre o Mercado Pago), con su cuenta de gasto: de fábrica, «Comisiones de canales».
      const comisiones = (await una<{ id: number }>("select id::int from plan_cuenta where organizacion_id = $1 and rol = 'comisiones'", [d.organizacion_id]))?.id ?? null;
      const prov = await una<{ id: number; cuenta: number | null }>(
        "select id::int, cuenta_gasto_id::int cuenta from proveedor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2 order by (estado = 'activo') desc, id limit 1", [d.organizacion_id, c.cuit]);
      if (prov && !prov.cuenta && comisiones) await consulta("update proveedor set cuenta_gasto_id = $2 where id = $1", [prov.id, comisiones]);
      if (!prov) await consulta(`insert into proveedor (organizacion_id, nombre, razon_social, cuit, condicion_iva, cuenta_gasto_id, notas)
        values ($1, $2, $2, $3, 'responsable_inscripto', $4, 'Creado al leer una factura de Mercado Libre')`, [d.organizacion_id, c.denominacion.slice(0, 200), c.cuit, comisiones]);
      // El PDF en la carpeta de Mercado Libre del Drive (si hay); si no, se le pide a ML al abrirlo.
      const receptor = String(r.lectura.cuit_receptor ?? "").replace(/\D/g, "");
      const emisor = (await una<{ nombre: string }>("select coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2",
        [d.organizacion_id, receptor]))?.nombre ?? "";
      const drive = await subirFacturaAlDrive(d.organizacion_id, Buffer.from(datos), "application/pdf",
        { emisor, cuitProveedor: c.cuit, proveedor: c.denominacion, fecha: c.fecha, tipoTexto: c.tipoTexto, pv: c.puntoVenta, numero: c.numero });
      const f = await cargarFacturaLeida(d.organizacion_id, "sistema", r.lectura, drive ? `drive:${drive.id}` : archivo, `${d.numero ?? fileId}.pdf`);
      await anotar(f.estado === "registrada" ? "cargada" : f.estado, f.mensaje, f.id);
      if (f.estado === "ya_estaba") res.completadas++; else res.cargadas++;
    } catch (e) {
      await anotar("error", motivoErp(e)).catch(() => {});
      res.errores++;
    }
  }
  return res;
}
