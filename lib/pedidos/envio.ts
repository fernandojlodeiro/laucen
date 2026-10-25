// Agregarle un envío sin cargo a un pedido que retiraba (Fer, 25/10): el cliente eligió retirar y después
// pide que se lo mandemos. Lo hace el operador desde la ficha del pedido (el cliente no edita su compra).
// Cambia el método de entrega y la dirección; el total no se toca. Con dirección y código postal aparece
// «Despachar por OCA». Con cargo (cobrar el envío) queda para más adelante.

import { una, consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";

export type DireccionEnvio = { calle: string; numero: string; piso: string; localidad: string; provincia: string; codigo_postal: string; recibe: string; telefono: string };

const CERRADOS = ["presupuesto", "cancelado", "despachado", "entregado", "devuelto"];

/** ¿Se le puede agregar un envío? Un pedido que no es de Mercado Libre, que retira y que todavía no salió. */
export async function puedeAgregarEnvio(org: string, pid: number): Promise<boolean> {
  const p = await una<{ ok: boolean }>(`
    select (c.tipo <> 'mercadolibre' and not (p.estado = any($3::text[]))
            and (me.tipo = 'retiro' or p.envio ->> 'metodo' = 'Retira' or coalesce(p.envio #>> '{direccion,calle}', '') = '')
            and not exists (select 1 from envio e where e.pedido_id = p.id and e.logistica = 'oca' and coalesce(e.estado, '') <> 'cancelled')) ok
      from pedido p join canal c on c.id = p.canal_id left join metodo_envio me on me.id = p.metodo_envio_id
     where p.id = $1 and p.organizacion_id = $2`, [pid, org, CERRADOS]);
  return !!p?.ok;
}

/** Los métodos de envío con los que se puede mandar (los del canal del pedido y los generales; sin el retiro ni la
 *  sucursal de OCA, que pide elegir la sucursal). */
export async function metodosParaEnvio(org: string, pid: number) {
  return consulta<{ id: number; nombre: string }>(`
    select m.id::int, m.nombre from metodo_envio m join pedido p on p.id = $1
     where m.organizacion_id = $2 and m.tipo not in ('retiro', 'oca_sucursal') and (m.canal_id is null or m.canal_id = p.canal_id)
     order by m.activo desc, m.orden, m.id`, [pid, org]);
}

export async function agregarEnvioSinCargo(org: string, pid: number, quien: string, metodoId: number, d: DireccionEnvio): Promise<string> {
  if (!(await puedeAgregarEnvio(org, pid))) throw new ErrorErp("A este pedido ya no se le puede agregar un envío.");
  const dir = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v ?? "").trim()])) as DireccionEnvio;
  if (!dir.calle || !dir.numero || !dir.localidad || !dir.provincia) throw new ErrorErp("Completá la dirección: calle, número, localidad y provincia.");
  if (!dir.codigo_postal) throw new ErrorErp("Falta el código postal (sin él no se puede despachar por OCA).");
  const m = await una<{ nombre: string }>("select nombre from metodo_envio where id = $1 and organizacion_id = $2 and tipo not in ('retiro', 'oca_sucursal')", [metodoId, org]);
  if (!m) throw new ErrorErp("Elegí cómo se manda.");
  await enTransaccion(async (c) => {
    const p = (await c.query<{ estado: string }>("select estado from pedido where id = $1 and organizacion_id = $2 for update", [pid, org])).rows[0];
    await c.query(`update pedido set metodo_envio_id = $3,
                          envio = coalesce(envio, '{}'::jsonb) || jsonb_build_object('metodo', $4::text, 'direccion', $5::jsonb, 'agregado', $6::text)
                    where id = $1 and organizacion_id = $2`,
      [pid, org, metodoId, m.nombre, JSON.stringify({
        calle: dir.calle, numero: dir.numero, piso_depto: dir.piso || null, localidad: dir.localidad, provincia: dir.provincia,
        codigo_postal: dir.codigo_postal, recibe: dir.recibe || null, telefono: dir.telefono || null,
      }), "Sin cargo, agregado después de la compra"]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota) values ($1, $2, $3, $3, $4, $5)`,
      [org, pid, p.estado, quien, `Envío agregado sin cargo: ${m.nombre} a ${dir.calle} ${dir.numero}, ${dir.localidad}`]);
  });
  return `Listo: el pedido ahora se manda por ${m.nombre}, sin cargo.`;
}
