// Pasa los archivos bajados de Mercado Pago a las tablas de movimientos y de
// pagos (lib/mercadopago/normalizar.ts), de a poco, en la vuelta de la
// exportación. Cada archivo se procesa una vez (columna procesado); la misma
// fila en otro archivo no se repite (clave única por cuenta). Así los tableros
// y la exportación leen de tablas y no vuelven a leer cientos de archivos.

import { consulta } from "@/lib/erp/base";
import { leerArchivo, filasDeSettlement, pagosDeArchivo } from "@/lib/mercadopago/normalizar";
import type { Destino } from "@/lib/mercadopago/exportacion";

/** Procesa hasta `tope` archivos pendientes de la cuenta. Devuelve cuántos procesó. */
export async function procesarArchivos(d: Destino, tope = 15): Promise<number> {
  const { archivo, mov, pago } = d.tablas;
  const pendientes = await consulta<{ id: number; fuente: string; nombre: string; bajado_ts: Date; contenido: Buffer }>(
    `select id::int, fuente, nombre, bajado_ts, contenido from ${archivo} where conexion_id = $1 and not procesado order by id limit $2`, [d.conexionId, tope]);
  for (const a of pendientes) {
    try {
      if (a.fuente === "settlement_report") {
        const t = await leerArchivo({ id: a.id, fuente: a.fuente, nombre: a.nombre, desde: null, hasta: null, bajado: a.bajado_ts, contenido: a.contenido });
        if (t && t.cab.includes("SOURCE_ID") && t.cab.includes("TRANSACTION_TYPE")) {
          const filas = filasDeSettlement(d.mpUserId, { nombre: a.nombre, bajado: a.bajado_ts }, t);
          for (let i = 0; i < filas.length; i += 500) {
            await consulta(`
              insert into ${mov} (${d.org ? "organizacion_id, " : ""}conexion_id, clave, archivo_id, archivo, fila, extraido, movimiento_id, referencia_externa, tipo_original,
                fecha_operacion, fecha_operacion_original, fecha_saldo, fecha_liberacion, moneda, importe_bruto, comision, impuestos, cupon, importe_neto, medio_pago, tipo_medio, descripcion, destino)
              select ${d.org ? "$4, " : ""}$1, x.clave, $2, x.archivo, x.fila, x.extraido, x.movimiento_id, x.referencia_externa, x.tipo_original,
                x.fecha_operacion, x.fecha_operacion_original, x.fecha_saldo, x.fecha_liberacion, x.moneda, x.importe_bruto, x.comision, x.impuestos, x.cupon, x.importe_neto, x.medio_pago, x.tipo_medio, x.descripcion, x.destino
                from jsonb_to_recordset($3::jsonb) x(clave text, archivo text, fila int, extraido timestamptz, movimiento_id text, referencia_externa text, tipo_original text,
                  fecha_operacion timestamptz, fecha_operacion_original text, fecha_saldo timestamptz, fecha_liberacion timestamptz, moneda text, importe_bruto numeric, comision numeric,
                  impuestos numeric, cupon numeric, importe_neto numeric, medio_pago text, tipo_medio text, descripcion text, destino text)
              -- La misma fila en otro archivo no se repite; pero si este trae columnas que el otro no tenía, se completan.
              on conflict (conexion_id, clave) do update set
                fecha_liberacion = coalesce(${mov}.fecha_liberacion, excluded.fecha_liberacion), descripcion = coalesce(${mov}.descripcion, excluded.descripcion),
                impuestos = coalesce(${mov}.impuestos, excluded.impuestos), medio_pago = coalesce(${mov}.medio_pago, excluded.medio_pago),
                tipo_medio = coalesce(${mov}.tipo_medio, excluded.tipo_medio), referencia_externa = coalesce(${mov}.referencia_externa, excluded.referencia_externa), destino = coalesce(${mov}.destino, excluded.destino)`,
              d.org ? [d.conexionId, a.id, JSON.stringify(filas.slice(i, i + 500)), d.org] : [d.conexionId, a.id, JSON.stringify(filas.slice(i, i + 500))]);
          }
        } else await d.anotar("pasar a movimientos", null, { archivo: a.nombre, motivo: "formato no reconocido (sin SOURCE_ID / TRANSACTION_TYPE)" });
      } else if (a.fuente.startsWith("payments")) {
        // Uno por id (el último del archivo): el mismo pago dos veces en un lote no se puede actualizar.
        const pagos = [...new Map(pagosDeArchivo(a.contenido).map((x) => [x.pago_id, x])).values()];
        for (let i = 0; i < pagos.length; i += 500) {
          await consulta(`
            insert into ${pago} (${d.org ? "organizacion_id, " : ""}conexion_id, pago_id, tipo, estado, descripcion, cobrador_id, pagador_id, importe, pagado, tipo_medio, medio, creado, actualizado)
            select ${d.org ? "$3, " : ""}$1, x.pago_id, x.tipo, x.estado, x.descripcion, x.cobrador_id, x.pagador_id, x.importe, x.pagado, x.tipo_medio, x.medio, x.creado, x.actualizado
              from jsonb_to_recordset($2::jsonb) x(pago_id text, tipo text, estado text, descripcion text, cobrador_id text, pagador_id text, importe numeric, pagado numeric,
                tipo_medio text, medio text, creado timestamptz, actualizado timestamptz)
            on conflict (conexion_id, pago_id) do update set tipo = excluded.tipo, estado = excluded.estado, descripcion = excluded.descripcion,
              cobrador_id = excluded.cobrador_id, pagador_id = excluded.pagador_id, importe = excluded.importe, pagado = excluded.pagado,
              tipo_medio = excluded.tipo_medio, medio = excluded.medio, creado = excluded.creado, actualizado = excluded.actualizado
            where ${pago}.actualizado is null or excluded.actualizado >= ${pago}.actualizado`,
            d.org ? [d.conexionId, JSON.stringify(pagos.slice(i, i + 500)), d.org] : [d.conexionId, JSON.stringify(pagos.slice(i, i + 500))]);
        }
      }
    } catch (e) {
      await d.anotar("pasar a movimientos", null, { archivo: a.nombre, motivo: String(e instanceof Error ? e.message : e).slice(0, 300) });
    }
    await consulta(`update ${archivo} set procesado = true where id = $1`, [a.id]);
  }
  return pendientes.length;
}
