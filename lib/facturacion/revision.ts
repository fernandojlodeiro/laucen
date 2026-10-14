// Revisión antes de facturar (pedido de Fer, 13/10). La factura automática no sale
// a ciegas: antes se lee lo que el comprador escribió (mensajes de Mercado Libre del
// pedido y WhatsApp del cliente) y las notas del pedido y del cliente, por si
// pidió algo para la factura.
// - Nada sobre la factura → se factura como siempre (sin texto, ni se llama a la IA).
// - Pedido claro → se aplica: la leyenda va a "Observaciones" de la factura; un
//   CUIT (o «factura A») se busca en el padrón de ARCA y pasa a la ficha del
//   cliente (razón social, condición de IVA, domicilio fiscal), de donde sale la factura.
// - Duda → no se factura: el pedido queda con «Factura retenida» y su motivo, y
//   avisa (barra de estado, ventana, Windows). Lo destraba una persona.
// Si el pedido llega con la factura ya hecha, se hace lo mismo y, si hay que
// cambiarla, se refactura: nota de crédito idéntica (anula la original) y factura
// nueva con los datos actuales, las dos con la fecha del día (refacturar()).

import { createHash } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, jsonDe, hayClaude } from "@/lib/claude";
import { cuitCierra, cuitLegible } from "@/lib/cuit";
import { padronAlCliente, CONDICIONES_IVA_TEXTO } from "@/lib/arca/padron-cliente";
import { prepararFactura, prepararNotaCredito, emitir, envioPagadoPorElCompradorDe, TIPOS_CBTE } from "@/lib/arca/facturar";

/** Lo que devuelve la IA. */
export type Lectura = {
  decision: "nada" | "aplicar" | "duda"; leyenda: string | null; cuit: string | null; factura_a: boolean; incluir_envio?: boolean;
  razon_social: string | null; domicilio: string | null; motivo: string;
};
export type Decision =
  | { accion: "facturar"; leyenda: string | null; cuit: string | null; facturaA: boolean; incluirEnvio: boolean; motivo: string }
  | { accion: "retener"; motivo: string };

export const LARGO_LEYENDA = 500;
const digitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** De la lectura de la IA a qué se hace, con reglas fijas (la IA no decide sola lo delicado). Pura. */
export function decidir(l: Lectura | null, cliente: { cuit: string | null }): Decision {
  if (!l || !["nada", "aplicar", "duda"].includes(l.decision)) return { accion: "retener", motivo: "No se pudo leer qué pidió el comprador: mirá los mensajes y las notas antes de facturar." };
  const motivo = (l.motivo ?? "").trim();
  if (l.decision === "duda") return { accion: "retener", motivo: motivo || "Pidió algo sobre la factura que no está claro." };
  if (l.decision === "nada") return { accion: "facturar", leyenda: null, cuit: null, facturaA: false, incluirEnvio: false, motivo };
  const cuit = l.cuit ? digitos(l.cuit) : null;
  if (l.cuit && (cuit!.length !== 11 || !cuitCierra(cuit!))) return { accion: "retener", motivo: `Dio un CUIT que no es válido (${l.cuit}). ${motivo}`.trim() };
  if ((l.razon_social || l.domicilio) && !cuit) return { accion: "retener", motivo: `Pide otra razón social o domicilio sin dar el CUIT. ${motivo}`.trim() };
  if (l.factura_a && !cuit && digitos(cliente.cuit).length !== 11) return { accion: "retener", motivo: `Pide factura A pero no dio el CUIT. ${motivo}`.trim() };
  const leyenda = (l.leyenda ?? "").trim().replace(/^["«“']+|["»”']+$/g, "").slice(0, LARGO_LEYENDA) || null;
  return { accion: "facturar", leyenda, cuit, facturaA: !!l.factura_a, incluirEnvio: !!l.incluir_envio, motivo };
}

/** La huella de lo que escribió el comprador y de las notas: con la misma, no se vuelve a leer. Pura. */
export function firmaDe(textos: { quien: string; texto: string }[]): string {
  const delComprador = textos.filter((t) => t.quien !== "Vendedor").map((t) => `${t.quien}:${t.texto.trim()}`);
  return createHash("sha1").update(JSON.stringify(delComprador)).digest("hex");
}

const INSTRUCCIONES = `Antes de emitir la factura electrónica de un pedido de una tienda argentina, revisás lo que escribió el comprador (mensajes de Mercado Libre o WhatsApp) y las notas que cargó la tienda en el pedido o en el cliente, para ver si pidieron algo sobre la factura.
Devolvé SÓLO un JSON: {"decision": "nada" | "aplicar" | "duda", "leyenda": texto o null, "cuit": texto o null, "factura_a": true o false, "incluir_envio": true o false, "razon_social": texto o null, "domicilio": texto o null, "motivo": una oración en castellano rioplatense}
- "nada": no pidieron nada sobre la factura (preguntas del envío, agradecimientos, consultas del producto…), o lo que pidieron ya está en los datos actuales.
- "aplicar": pidieron algo claro que se resuelve con una o las dos cosas de acá:
  · una leyenda u observación que tiene que figurar en la factura (un número de subsidio, expediente, orden de compra, proyecto…): va en "leyenda", textual, sin comillas;
  · que se facture el envío (o el flete) que pagó, o que la factura incluya el costo del envío: "incluir_envio" es true (ya está resuelto: se le corrige la factura sumando el envío);
  · factura A, o facturar a un CUIT: el CUIT va en "cuit" y "factura_a" es true si pidió A. Con el CUIT, la razón social, la condición de IVA y el domicilio salen del padrón de ARCA; si además dio razón social o domicilio, ponelos en esos campos igual.
- "duda": cualquier otra cosa sobre la factura, algo que no se entiende, o pedidos que se contradicen. Por ejemplo: otra razón social o domicilio sin CUIT, facturar a nombre de otra persona sin CUIT, partir la factura, otro importe que no sea el envío, otra fecha, otra descripción de los productos, factura sin IVA, o una leyenda de la que no está claro el texto.
Los mensajes del vendedor son sólo contexto; lo que vale es lo que pidió el comprador o lo que dicen las notas.
Una dirección, un nombre o un DNI para un envío o un reenvío NO son datos de la factura: eso es "nada", salvo que diga que es para la factura.
Si te paso una FACTURA YA HECHA, "aplicar" sólo si lo pedido es distinto de lo que ya tiene; si ya coincide, "nada".
"motivo": qué pidió y qué se va a hacer, o por qué hay duda (para la persona que lo revise).`;

type Contexto = {
  pedido: { id: number; cliente_id: number | null; notas: string | null; leyenda: string | null; retenida: string | null; revision: { firma?: string } | null;
    nombre: string | null; razon_social: string | null; cuit: string | null; condicion_iva: string | null; cliente_notas: string | null; domicilio: string | null; con_envio: boolean };
  textos: { cuando: Date | null; donde: string; quien: string; texto: string }[];
};

/** Lo escrito sobre el pedido: mensajes de ML (los dos lados), WhatsApp del cliente desde el pedido, y las notas. */
async function contexto(org: string, pid: number): Promise<Contexto | null> {
  const pedido = await una<Contexto["pedido"] & { creado: Date }>(`
    select p.id::int, p.cliente_id::int, p.notas, p.factura_leyenda leyenda, p.factura_con_envio con_envio, p.factura_retenida retenida, p.factura_revision revision, p.creado_ts creado,
           cl.nombre, cl.razon_social, cl.cuit, cl.condicion_iva, cl.notas cliente_notas,
           (select concat_ws(', ', concat_ws(' ', d.calle, d.numero), d.localidad, d.provincia) from cliente_direccion d
             where d.cliente_id = cl.id order by (d.etiqueta = 'Fiscal') desc, d.principal desc, d.id limit 1) domicilio
      from pedido p left join cliente cl on cl.id = p.cliente_id where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!pedido) return null;
  const [ml, wa] = await Promise.all([
    consulta<{ fecha: Date; de_vendedor: boolean; texto: string }>(
      "select fecha, de_vendedor, texto from meli_mensaje where organizacion_id = $1 and pedido_id = $2 and coalesce(texto, '') <> '' order by fecha", [org, pid]),
    pedido.cliente_id ? consulta<{ ts: Date; direccion: string; texto: string }>(`
      select m.ts, m.direccion, m.texto from chat_mensaje m join chat c on c.id = m.chat_id
       where c.organizacion_id = $1 and c.cliente_id = $2 and m.ts >= $3::timestamptz - interval '2 days' and coalesce(m.texto, '') <> ''
       order by m.ts desc limit 40`, [org, pedido.cliente_id, pedido.creado]) : Promise.resolve([]),
  ]);
  const textos: Contexto["textos"] = [
    ...ml.map((m) => ({ cuando: m.fecha, donde: "Mercado Libre", quien: m.de_vendedor ? "Vendedor" : "Comprador", texto: m.texto })),
    ...wa.reverse().map((m) => ({ cuando: m.ts, donde: "WhatsApp", quien: m.direccion === "entrante" ? "Comprador" : "Vendedor", texto: m.texto })),
  ];
  if (pedido.notas?.trim()) textos.push({ cuando: null, donde: "Notas del pedido", quien: "Nota", texto: pedido.notas.trim() });
  if (pedido.cliente_notas?.trim()) textos.push({ cuando: null, donde: "Notas del cliente", quien: "Nota", texto: pedido.cliente_notas.trim() });
  return { pedido, textos };
}

type Facturada = { tipo_cbte: number; receptor_nombre: string | null; doc_tipo: number; doc_nro: string; leyenda: string | null };

async function leerConIa(c: Contexto, facturada: Facturada | null): Promise<Lectura | null> {
  const p = c.pedido;
  const fecha = (d: Date | null) => (d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "");
  const datos = [
    `Cliente: ${p.nombre ?? "—"}`, `Razón social: ${p.razon_social ?? "—"}`, `CUIT: ${p.cuit ? cuitLegible(p.cuit) : "—"}`,
    `Condición de IVA: ${CONDICIONES_IVA_TEXTO[p.condicion_iva ?? "consumidor_final"] ?? p.condicion_iva}`, `Domicilio: ${p.domicilio ?? "—"}`,
    `Leyenda prevista para la factura: ${p.leyenda ?? "(ninguna)"}`,
  ].join("\n");
  const hecha = facturada
    ? `\n\nFACTURA YA HECHA:\n${TIPOS_CBTE[facturada.tipo_cbte]?.nombre ?? "Factura"} a ${facturada.receptor_nombre ?? "—"} (doc ${facturada.doc_tipo === 99 ? "consumidor final" : facturada.doc_nro}), leyenda: ${facturada.leyenda ?? "(ninguna)"}` : "";
  const r = await pedirClaude({
    system: INSTRUCCIONES, modelo: "medio", maxTokens: 500,
    contenido: `DATOS ACTUALES:\n${datos}${hecha}\n\nLO ESCRITO:\n${c.textos.map((t) => `[${t.donde}${t.cuando ? ` ${fecha(t.cuando)}` : ""}] ${t.quien}: ${t.texto}`).join("\n")}`,
  });
  if ("error" in r) return null;
  return jsonDe<Lectura>(r.texto);
}

async function retener(org: string, pid: number, motivo: string, revision: object) {
  await consulta(`update pedido set factura_retenida = $3, factura_retenida_ts = now(), factura_revision = $4::jsonb where id = $1 and organizacion_id = $2`,
    [pid, org, motivo.slice(0, 1000), JSON.stringify(revision)]);
}

export type Resultado = { retenida: boolean; motivo?: string; cambio: boolean };

/** La revisión de un pedido antes de su factura (o, con `facturada`, después). No tira. */
export async function revisarPedido(org: string, pid: number, facturada: Facturada | null = null): Promise<Resultado> {
  const c = await contexto(org, pid);
  if (!c) return { retenida: false, cambio: false };
  if (c.pedido.retenida) return { retenida: true, motivo: c.pedido.retenida, cambio: false };
  // Sin nada escrito por el comprador ni notas, no hay nada que leer.
  if (!c.textos.some((t) => t.quien !== "Vendedor")) return { retenida: false, cambio: false };
  const firma = firmaDe(c.textos);
  if (c.pedido.revision?.firma === firma) return { retenida: false, cambio: false };
  const base = { firma, ts: new Date().toISOString() };
  if (!hayClaude()) {
    const motivo = "Hay mensajes o notas en el pedido y la IA no está disponible para leerlos: mirálos antes de facturar.";
    await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
    return { retenida: true, motivo, cambio: false };
  }
  const d = decidir(await leerConIa(c, facturada), { cuit: c.pedido.cuit });
  if (d.accion === "retener") {
    const motivo = facturada ? `Pide cambiar la factura ya hecha: ${d.motivo}` : d.motivo;
    await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
    return { retenida: true, motivo, cambio: false };
  }
  const aplicado: string[] = [];
  let cambio = false;
  if (d.leyenda && d.leyenda !== (c.pedido.leyenda ?? "")) {
    await consulta("update pedido set factura_leyenda = $3 where id = $1 and organizacion_id = $2", [pid, org, d.leyenda]);
    aplicado.push(`leyenda «${d.leyenda}»`);
    cambio = true;
  }
  if (facturada && d.leyenda && d.leyenda !== (facturada.leyenda ?? "")) cambio = true;
  // El comprador pidió que se le facture el envío: se marca el pedido y, si ya estaba facturado, se refactura (sólo si pagó envío).
  if (d.incluirEnvio && !c.pedido.con_envio) {
    if (await envioPagadoPorElCompradorDe(pid) > 0) {
      await consulta("update pedido set factura_con_envio = true where id = $1 and organizacion_id = $2", [pid, org]);
      aplicado.push("el envío que pagó el comprador va en la factura");
      cambio = true;
    } else aplicado.push("pidió el envío en la factura, pero no pagó envío: no hay nada que sumar");
  }
  const cuit = d.cuit ?? (d.facturaA ? digitos(c.pedido.cuit) : null);
  if (cuit) {
    if (!c.pedido.cliente_id) {
      const motivo = `Pide facturar al CUIT ${cuitLegible(cuit)} pero el pedido no tiene cliente.`;
      await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
      return { retenida: true, motivo, cambio: false };
    }
    try {
      const { persona, cambios } = await padronAlCliente(org, c.pedido.cliente_id, cuit);
      if (persona.estado && persona.estado !== "ACTIVO") throw new ErrorErp(`en ARCA el CUIT ${persona.cuit} figura ${persona.estado.toLowerCase()}`);
      if (d.facturaA && !["responsable_inscripto", "monotributo"].includes(persona.condicionIva)) {
        throw new ErrorErp(`pide factura A, pero en ARCA ${persona.razonSocial} figura como ${CONDICIONES_IVA_TEXTO[persona.condicionIva].toLowerCase()}: le corresponde B`);
      }
      if (cambios.length) { aplicado.push(`datos de ARCA en el cliente (${cambios.join(", ")})`); cambio = true; }
      if (facturada && digitos(facturada.doc_nro) !== cuit) cambio = true;
    } catch (e) {
      const motivo = `No se pudo usar el CUIT ${cuitLegible(cuit)}: ${e instanceof Error ? e.message : String(e)}`;
      await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
      return { retenida: true, motivo, cambio: false };
    }
  }
  const motivo = [d.motivo, aplicado.length ? `Se aplicó: ${aplicado.join("; ")}.` : ""].filter(Boolean).join(" ");
  await consulta("update pedido set factura_revision = $3::jsonb where id = $1 and organizacion_id = $2",
    [pid, org, JSON.stringify({ ...base, decision: aplicado.length ? "aplicar" : "nada", motivo })]);
  return { retenida: false, motivo, cambio };
}

/** SQL: la factura del pedido que sigue vigente (autorizada y sin nota de crédito autorizada). Alias del comprobante `cb`. */
export const sqlFacturaVigente = (cb = "cb") => `(${cb}.tipo_cbte in (1, 6, 11) and ${cb}.estado = 'autorizado'
  and not exists (select 1 from comprobante nc where nc.comprobante_asociado_id = ${cb}.id and nc.estado = 'autorizado'))`;

/** Refacturar con los datos actuales: nota de crédito idéntica a la factura vigente (la anula) y factura
 *  nueva con lo que hoy tiene la ficha del cliente y la leyenda del pedido; las dos con la fecha del día. */
export async function refacturar(org: string, pid: number, usuario: string | null): Promise<string> {
  const f = await una<{ id: number; tipo_cbte: number }>(`
    select cb.id::int, cb.tipo_cbte from comprobante cb where cb.organizacion_id = $1 and cb.pedido_id = $2 and ${sqlFacturaVigente("cb")}
     order by cb.id desc limit 1`, [org, pid]);
  if (!f) throw new ErrorErp("El pedido no tiene una factura vigente para refacturar.");
  // Una nota de crédito que quedó a medio camino (pendiente o con error) se reintenta; si no, se arma.
  const previa = await una<{ id: number }>("select id::int from comprobante where comprobante_asociado_id = $1 and estado in ('pendiente', 'error') order by id desc limit 1", [f.id]);
  const nc = previa?.id ?? await prepararNotaCredito(org, f.id, usuario);
  const r1 = await emitir(org, nc);
  if (r1.estado !== "autorizado") throw new ErrorErp(`La nota de crédito no salió: ${r1.mensaje}`);
  const nueva = await prepararFactura(org, pid, usuario);
  // Si la anterior estaba subida a Mercado Libre, la nueva la reemplaza ahí (se borra la vieja y se sube ésta,
  // lib/mercadolibre/facturas.ts). Se marca antes de emitir: al autorizarse, entra a la cola.
  await consulta(`update comprobante set ml_reemplaza = exists (select 1 from comprobante o where o.pedido_id = $3 and o.id <> $1 and o.ml_subida_ts is not null)
                   where id = $1 and organizacion_id = $2`, [nueva, org, pid]);
  const r2 = await emitir(org, nueva);
  await consulta("update pedido set factura_retenida = null, factura_retenida_ts = null where id = $1 and organizacion_id = $2", [pid, org]);
  if (r2.estado !== "autorizado") throw new ErrorErp(`Se anuló la factura (${r1.mensaje}) pero la nueva no salió: ${r2.mensaje}`);
  return `Refacturado. ${r1.mensaje} ${r2.mensaje}`;
}

/** Destraba el pedido: la persona ya lo miró (factura o deja la factura como está). */
export async function liberarFactura(org: string, pid: number): Promise<void> {
  await consulta("update pedido set factura_retenida = null, factura_retenida_ts = null where id = $1 and organizacion_id = $2", [pid, org]);
}

/** Los pedidos ya facturados a los que el comprador les escribió después de la factura (o desde la
 *  última lectura): se leen y, si pidió un cambio claro, se refactura solo; si hay duda, se retiene y avisa. */
export async function revisarFacturadas(org: string, hastaMs: number): Promise<{ refacturadas: number; retenidas: number; errores: string[] }> {
  const res = { refacturadas: 0, retenidas: 0, errores: [] as string[] };
  const candidatos = await consulta<Facturada & { pedido_id: number }>(`
    select p.id::int pedido_id, cb.tipo_cbte, cb.receptor_nombre, cb.doc_tipo, cb.doc_nro, cb.leyenda
      from comprobante cb join pedido p on p.id = cb.pedido_id
      join lateral (select greatest(
              (select max(m.fecha) from meli_mensaje m where m.pedido_id = p.id and not m.de_vendedor),
              (select max(x.ts) from chat_mensaje x join chat c on c.id = x.chat_id where c.cliente_id = p.cliente_id and x.direccion = 'entrante' and x.ts >= p.creado_ts)) ultimo) u on true
     where cb.organizacion_id = $1 and ${sqlFacturaVigente("cb")} and cb.autorizado_ts > now() - interval '60 days' and p.factura_retenida is null
       and u.ultimo > cb.autorizado_ts and u.ultimo > coalesce((p.factura_revision ->> 'ts')::timestamptz, '-infinity')
     order by u.ultimo limit 10`, [org]);
  for (const x of candidatos) {
    if (Date.now() > hastaMs) break;
    try {
      const r = await revisarPedido(org, x.pedido_id, x);
      if (r.retenida) res.retenidas++;
      else if (r.cambio) { await refacturar(org, x.pedido_id, "sistema"); res.refacturadas++; }
    } catch (e) {
      // Si la refacturación falla, queda retenida con el motivo para que una persona la mire.
      const motivo = `No se pudo refacturar solo: ${e instanceof Error ? e.message : String(e)}`;
      await consulta("update pedido set factura_retenida = $3, factura_retenida_ts = now() where id = $1 and organizacion_id = $2", [x.pedido_id, org, motivo.slice(0, 1000)]).catch(() => {});
      res.errores.push(`pedido ${x.pedido_id}: ${motivo}`);
    }
  }
  return res;
}
