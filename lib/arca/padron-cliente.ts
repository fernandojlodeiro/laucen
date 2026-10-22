// Pasar al cliente lo que dice el padrón de ARCA de un CUIT: razón social,
// condición frente al IVA y domicilio fiscal (la dirección va con etiqueta
// "Fiscal": si ya hay una, se actualiza). Lo usan «Validar en ARCA» de la
// ficha del cliente y la revisión antes de facturar (lib/facturacion/revision.ts).

import { una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { emisoresConPadron } from "@/lib/arca/facturar";
import { consultarCuit, type Persona } from "@/lib/arca/padron";

export const CONDICIONES_IVA_TEXTO: Record<string, string> = {
  responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento", consumidor_final: "Consumidor final",
};

/** Consulta el padrón y pisa los datos del cliente. Devuelve lo que dijo ARCA y qué cambió. */
export async function padronAlCliente(org: string, clienteId: number, cuit: string): Promise<{ persona: Persona; cambios: string[] }> {
  const c = await una<{ razon_social: string | null; condicion_iva: string | null; cuit: string | null }>(
    "select razon_social, condicion_iva, cuit from cliente where id = $1 and organizacion_id = $2", [clienteId, org]);
  if (!c) throw new ErrorErp("El cliente no existe.");
  // Cualquier razón social conectada con ARCA sirve para consultar el padrón: se prueba con cada una hasta que alguna conteste.
  const emisores = await emisoresConPadron(org);
  if (!emisores.length) throw new ErrorErp("Para consultar el padrón hace falta una razón social conectada con ARCA (Configuración → Facturación (ARCA)).");
  let p: Persona | null = null;
  const fallas: string[] = [];
  for (const e of emisores) {
    try { p = await consultarCuit(e.id, e.ambiente, e.cuit, cuit); break; }
    catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // El CUIT consultado no existe o no está en el padrón: con otra razón social daría lo mismo.
      if (!/no autorizado a acceder al servicio|certificado|login|no responde/i.test(m)) throw err;
      fallas.push(/no autorizado a acceder al servicio/i.test(m) ? `${e.razon_social}: el certificado no tiene habilitado el servicio de consulta de padrón` : `${e.razon_social}: ${m}`);
    }
  }
  if (!p) {
    throw new ErrorErp(`No se pudo consultar el padrón de ARCA (${fallas.join("; ")}). Para habilitarlo: en ARCA, Administrador de Relaciones de Clave Fiscal, asociar al certificado de Laucen el servicio «ws_sr_constancia_inscripcion» (Consulta de Constancia de Inscripción).`);
  }
  const cambios: string[] = [];
  if ((c.cuit ?? "").replace(/\D/g, "") !== p.cuit.replace(/\D/g, "")) cambios.push(`CUIT: ${p.cuit}`);
  if (p.razonSocial !== c.razon_social) cambios.push(`razón social: ${p.razonSocial}`);
  if (p.condicionIva !== c.condicion_iva) cambios.push(`condición IVA: ${CONDICIONES_IVA_TEXTO[p.condicionIva]}`);
  await enTransaccion(async (cx) => {
    await cx.query("update cliente set razon_social = $3, condicion_iva = $4, cuit = $5 where id = $1 and organizacion_id = $2",
      [clienteId, org, p.razonSocial, p.condicionIva, p.cuit]);
    if (!p.domicilio && !p.localidad) return;
    const fiscal = await cx.query<{ id: string; calle: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null }>(
      "select id, calle, localidad, provincia, codigo_postal from cliente_direccion where cliente_id = $1 and organizacion_id = $2 and etiqueta = 'Fiscal' order by id limit 1",
      [clienteId, org]);
    const d = fiscal.rows[0];
    if (d) {
      if (d.calle !== p.domicilio || d.localidad !== p.localidad || d.provincia !== p.provincia || d.codigo_postal !== p.codigoPostal) {
        // El domicilio de ARCA viene en un solo texto (calle y número juntos).
        await cx.query(`update cliente_direccion set calle = $3, numero = null, piso_depto = null, localidad = $4, provincia = $5, codigo_postal = $6, pais = 'AR'
                         where id = $1 and organizacion_id = $2`, [d.id, org, p.domicilio, p.localidad, p.provincia, p.codigoPostal]);
        cambios.push("domicilio fiscal actualizado");
      }
    } else {
      await cx.query(`
        insert into cliente_direccion (organizacion_id, cliente_id, etiqueta, calle, localidad, provincia, codigo_postal, pais, principal)
        values ($1, $2, 'Fiscal', $3, $4, $5, $6, 'AR', not exists (select 1 from cliente_direccion where cliente_id = $2))`,
        [org, clienteId, p.domicilio, p.localidad, p.provincia, p.codigoPostal]);
      cambios.push("domicilio fiscal agregado");
    }
  });
  return { persona: p, cambios };
}
