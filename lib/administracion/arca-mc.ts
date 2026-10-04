// Importar "Mis Comprobantes – Recibidos" de ARCA: el archivo que Fer baja
// cada mes (lib/administracion/arca-mc-leer.ts lo lee). Tres pasos:
//   1. guardarLote: los comprobantes leídos quedan en arca_mc_lote;
//   2. vistaPrevia: cada uno con su proveedor (por CUIT; "nuevo" si no está),
//      su estado contra lo ya cargado (nueva / ya cargada / cargada a mano
//      distinta / error) y la cuenta de gasto de cada proveedor (la que tiene
//      recordada, o "Gastos varios"; Mercado Libre, "Comisiones de canales");
//   3. importarLote: crea los proveedores nuevos, recuerda la cuenta elegida
//      en cada proveedor y registra las facturas nuevas (registrarFactura:
//      cuenta corriente; el asiento lo hace contabilizarPendientes). Las que
//      ya estaban no se tocan: importar dos veces el mismo archivo no duplica.
// Las facturas de Mercado Libre y Mercado Pago entran por acá como cualquier
// otra; la facturación de ML por API (lib/mercadolibre/facturacion.ts) no
// registra facturas, sólo las compara con éstas.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { registrarFactura, recalcularFactura } from "@/lib/administracion/compras";
import { asegurarPlan, contabilizarPendientes } from "@/lib/administracion/contabilidad";
import { armarFactura, type CbteArca, type LecturaArca } from "@/lib/administracion/arca-mc-leer";

/** CUIT de MercadoLibre S.R.L. (factura los cargos de Mercado Libre y de Mercado Pago). */
export const CUITS_MERCADO_LIBRE = ["30703088534"];
export const esMercadoLibre = (cuit: string | null | undefined, nombre?: string | null) =>
  CUITS_MERCADO_LIBRE.includes(String(cuit ?? "").replace(/\D/g, "")) || /mercado\s*libre|mercadolibre|mercado\s*pago/i.test(nombre ?? "");

export type EstadoCbte = "nueva" | "ya_cargada" | "distinta" | "repetida" | "error";
export const ESTADOS_CBTE: Record<EstadoCbte, { texto: string; tono: "verde" | "gris" | "amarillo" | "rojo" | "azul" }> = {
  nueva: { texto: "Nueva", tono: "azul" },
  ya_cargada: { texto: "Ya cargada", tono: "gris" },
  distinta: { texto: "Cargada a mano distinta", tono: "amarillo" },
  repetida: { texto: "Repetida en el archivo", tono: "gris" },
  error: { texto: "Con error", tono: "rojo" },
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** El lote es de una razón social (`emisorId`): Mis Comprobantes se baja de ARCA con el CUIT de cada una. */
export async function guardarLote(org: string, archivo: string, l: LecturaArca, usuarioId: string, emisorId: number | null = null): Promise<number> {
  if (!l.comprobantes.length) throw new ErrorErp(l.errores[0] ?? "El archivo no tiene comprobantes.");
  const r = await una<{ id: number }>(`insert into arca_mc_lote (organizacion_id, archivo, version, comprobantes, errores, usuario_id, emisor_id)
    values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7) returning id::int`, [org, archivo.slice(0, 200), l.version, JSON.stringify(l.comprobantes), JSON.stringify(l.errores), usuarioId, emisorId]);
  return r!.id;
}

export type FilaPrevia = {
  c: CbteArca; estado: EstadoCbte; motivo: string | null; facturaId: number | null; proveedorId: number | null; proveedor: string; aviso: string | null;
  armada: ReturnType<typeof armarFactura>;
};
export type ProveedorPrevio = { cuit: string; nombre: string; proveedorId: number | null; cuentaId: number; nuevas: number; mercadoLibre: boolean };

const clave = (c: { cuit: string; letra: string; nc: boolean; nd: boolean; puntoVenta: number; numero: number }) =>
  `${c.cuit}|${c.letra}|${c.nc ? 1 : 0}|${c.nd ? 1 : 0}|${c.puntoVenta}|${c.numero}`;

/** Los comprobantes del lote con su estado de hoy y los proveedores con su cuenta. */
export async function vistaPrevia(org: string, loteId: number) {
  const lote = await una<{ id: number; archivo: string; version: string | null; comprobantes: CbteArca[]; errores: string[]; estado: string;
    resultado: Resultado | null; creado_ts: Date; emisor_id: number | null; emisor: string | null }>(
    `select id::int, archivo, version, comprobantes, errores, estado, resultado, creado_ts, emisor_id::int,
            (select coalesce(e.nombre, e.razon_social) from emisor e where e.id = arca_mc_lote.emisor_id) emisor
       from arca_mc_lote where id = $1 and organizacion_id = $2`, [loteId, org]);
  if (!lote) return null;
  await asegurarPlan(org);
  const cbtes = lote.comprobantes;
  const cuits = [...new Set(cbtes.map((c) => c.cuit))];
  const provs = await consulta<{ id: number; cuit: string; nombre: string; cuenta_gasto_id: number | null }>(`
    select distinct on (regexp_replace(cuit, '\\D', '', 'g')) id::int, regexp_replace(cuit, '\\D', '', 'g') cuit, nombre, cuenta_gasto_id::int
      from proveedor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = any($2::text[])
     order by regexp_replace(cuit, '\\D', '', 'g'), (estado = 'activo') desc, id`, [org, cuits]);
  const porCuit = new Map(provs.map((p) => [p.cuit, p]));
  const ya = await consulta<{ id: number; cuit: string; letra: string; es_nota_credito: boolean; es_nota_debito: boolean; punto_venta: number; numero: string;
    total: string; moneda: string; estado: string }>(`
    select f.id::int, regexp_replace(p.cuit, '\\D', '', 'g') cuit, f.letra, f.es_nota_credito, f.es_nota_debito, f.punto_venta, f.numero::text, f.total, f.moneda, f.estado
      from factura_compra f join proveedor p on p.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado <> 'anulada' and regexp_replace(p.cuit, '\\D', '', 'g') = any($2::text[])
       and f.numero = any($3::bigint[]) and f.emisor_id is not distinct from $4`, [org, cuits, [...new Set(cbtes.map((c) => c.numero))], lote.emisor_id]);
  const existentes = new Map(ya.map((f) => [clave({ cuit: f.cuit, letra: f.letra, nc: f.es_nota_credito, nd: f.es_nota_debito, puntoVenta: f.punto_venta, numero: Number(f.numero) }), f]));
  const roles = Object.fromEntries((await consulta<{ rol: string; id: number }>(
    "select rol, id::int from plan_cuenta where organizacion_id = $1 and rol in ('gastos_varios', 'comisiones')", [org])).map((r) => [r.rol, r.id]));

  const vistos = new Set<string>();
  const filas: FilaPrevia[] = cbtes.map((c) => {
    const p = porCuit.get(c.cuit);
    const armada = armarFactura(c);
    const k = clave(c);
    const ex = existentes.get(k);
    let estado: EstadoCbte = "nueva", motivo: string | null = null;
    if (vistos.has(k)) { estado = "repetida"; motivo = "El mismo comprobante aparece dos veces en el archivo."; }
    else if (ex) {
      const igual = ex.estado === "registrada" && ex.moneda === c.moneda && Math.abs(Number(ex.total) - c.total) <= 1;
      estado = igual ? "ya_cargada" : "distinta";
      motivo = igual ? null : ex.estado !== "registrada" ? "Está cargada a mano y sigue en borrador: registrala o borrala."
        : `Está cargada con otro total (${Number(ex.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })} ${ex.moneda === "USD" ? "US$" : "$"}): revisala.`;
    } else if (armada.error) { estado = "error"; motivo = armada.error; }
    else if (c.moneda === "USD" && !(c.cotizacion > 0)) { estado = "error"; motivo = "Está en dólares y no trae el tipo de cambio."; }
    vistos.add(k);
    return { c, estado, motivo, facturaId: ex?.id ?? null, proveedorId: p?.id ?? null, proveedor: p?.nombre ?? c.denominacion, aviso: armada.aviso, armada };
  });
  const proveedores: ProveedorPrevio[] = cuits.map((cuit) => {
    const p = porCuit.get(cuit);
    const c = cbtes.find((x) => x.cuit === cuit)!;
    const ml = esMercadoLibre(cuit, p?.nombre ?? c.denominacion);
    return {
      cuit, nombre: p?.nombre ?? c.denominacion, proveedorId: p?.id ?? null, mercadoLibre: ml,
      cuentaId: p?.cuenta_gasto_id ?? (ml ? roles.comisiones : roles.gastos_varios),
      nuevas: filas.filter((f) => f.c.cuit === cuit && f.estado === "nueva").length,
    };
  }).sort((a, b) => b.nuevas - a.nuevas || a.nombre.localeCompare(b.nombre, "es"));
  return { lote, filas, proveedores };
}

export type Resultado = { cargadas: number; yaEstaban: number; distintas: number; errores: string[]; proveedoresNuevos: number; ts: string };

/** Condición de IVA probable del emisor, por la letra que factura. */
const condicionPorLetra = (l: string) => (l === "A" || l === "M" ? "responsable_inscripto" : l === "C" ? "monotributo" : null);

/** Importa lo nuevo del lote. `cuentas`: CUIT → cuenta de gasto elegida (se
 *  recuerda en el proveedor). Devuelve el resumen (queda también en el lote). */
export async function importarLote(org: string, loteId: number, cuentas: Record<string, number | null>, usuarioId: string, opts: { contabilizar?: boolean } = {}): Promise<Resultado> {
  const v = await vistaPrevia(org, loteId);
  if (!v) throw new ErrorErp("Ese archivo ya no está: subilo de nuevo.");
  const validas = new Set((await consulta<{ id: number }>("select id::int from plan_cuenta where organizacion_id = $1 and imputable", [org])).map((x) => x.id));
  const res: Resultado = { cargadas: 0, yaEstaban: 0, distintas: 0, errores: [], proveedoresNuevos: 0, ts: new Date().toISOString() };
  // Proveedores: los nuevos se crean; a todos se les recuerda la cuenta.
  const provId = new Map<string, number>();
  for (const p of v.proveedores) {
    const elegida = cuentas[p.cuit] && validas.has(Number(cuentas[p.cuit])) ? Number(cuentas[p.cuit]) : p.cuentaId;
    if (p.proveedorId) {
      provId.set(p.cuit, p.proveedorId);
      await consulta("update proveedor set cuenta_gasto_id = $3 where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [org, p.cuit, elegida ?? null]);
    } else if (p.nuevas > 0) {
      const letra = v.filas.find((f) => f.c.cuit === p.cuit)?.c.letra ?? "";
      const r = await una<{ id: number }>(`insert into proveedor (organizacion_id, nombre, razon_social, cuit, condicion_iva, cuenta_gasto_id, notas)
        values ($1, $2, $2, $3, $4, $5, 'Creado al importar Mis Comprobantes de ARCA') returning id::int`, [org, p.nombre.slice(0, 200), p.cuit, condicionPorLetra(letra), elegida ?? null]);
      provId.set(p.cuit, r!.id);
      res.proveedoresNuevos++;
    }
    if (elegida) cuentas[p.cuit] = elegida;
  }
  for (const f of v.filas) {
    if (f.estado === "ya_cargada" || f.estado === "repetida") { res.yaEstaban++; continue; }
    if (f.estado === "distinta") { res.distintas++; continue; }
    const nro = `${f.c.tipoTexto} ${String(f.c.puntoVenta).padStart(5, "0")}-${String(f.c.numero).padStart(8, "0")} de ${f.proveedor}`;
    if (f.estado === "error") { res.errores.push(`${nro}: ${f.motivo}`); continue; }
    const pid = provId.get(f.c.cuit)!;
    const a = f.armada;
    let fid = 0;
    try {
      const notas = ["Importada de ARCA (Mis Comprobantes).", f.c.numeroHasta ? `Números ${f.c.numero} a ${f.c.numeroHasta}.` : null, a.aviso].filter(Boolean).join(" ");
      const r = await una<{ id: number }>(`
        insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, es_nota_debito, punto_venta, numero, fecha, vencimiento, moneda, cotizacion,
                                    percepcion_iva, percepcion_iibb, otros_impuestos, no_gravado, cuenta_gasto_id, notas, usuario_id, origen, cae, emisor_id)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'arca_mc', $18, $19) returning id::int`,
        [org, pid, f.c.letra, f.c.nc, f.c.nd, f.c.puntoVenta, f.c.numero, f.c.fecha, f.c.moneda, f.c.moneda === "USD" ? f.c.cotizacion : 1,
          a.percepcionIva, a.percepcionIibb, a.otrosImpuestos, a.noGravado, cuentas[f.c.cuit] ?? null, notas, usuarioId, f.c.cae, v.lote.emisor_id]);
      fid = r!.id;
      let orden = 0;
      for (const l of a.lineas) {
        await consulta(`insert into factura_compra_linea (organizacion_id, factura_id, descripcion, cantidad, costo_unit, iva_pct, neto, iva, orden)
                        values ($1, $2, $3, 1, $4, $5, $4, $6, $7)`, [org, fid, l.descripcion, l.neto, l.ivaPct, l.iva, ++orden]);
      }
      const t = await recalcularFactura(org, fid);
      if (Math.abs(t.total - f.c.total) > 0.02) throw new ErrorErp(`el total armado (${t.total}) no coincide con el de ARCA (${f.c.total})`);
      await registrarFactura(org, fid, usuarioId);
      res.cargadas++;
    } catch (e) {
      if (fid) await consulta("delete from factura_compra where id = $1 and organizacion_id = $2 and estado = 'borrador'", [fid, org]).catch(() => {});
      const err = e as { code?: string; message?: string };
      if (err.code === "23505") { res.yaEstaban++; continue; }
      res.errores.push(`${nro}: ${e instanceof ErrorErp ? e.message : err.message ?? String(e)}`);
    }
  }
  await consulta("update arca_mc_lote set estado = 'importado', resultado = $3::jsonb, importado_ts = now() where id = $1 and organizacion_id = $2",
    [loteId, org, JSON.stringify(res)]);
  // El asiento de cada una (también lo hacen las tareas periódicas).
  if (opts.contabilizar !== false && res.cargadas) await contabilizarPendientes(org, Date.now() + 20_000).catch(() => {});
  return res;
}

/** Los totales de la vista previa, por estado (para el encabezado). */
export function contarEstados(filas: FilaPrevia[]) {
  const n = Object.fromEntries(Object.keys(ESTADOS_CBTE).map((k) => [k, 0])) as Record<EstadoCbte, number>;
  for (const f of filas) n[f.estado]++;
  const totalNuevas = r2(filas.filter((f) => f.estado === "nueva").reduce((s, f) => s + (f.c.nc ? -1 : 1) * f.c.total * (f.c.moneda === "USD" ? f.c.cotizacion : 1), 0));
  return { ...n, totalNuevas };
}
