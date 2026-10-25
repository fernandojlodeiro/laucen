// Conciliar el comprobante de pago de un pedido con la cuenta de Mercado Pago de la tienda (Fer, 25/10;
// la misma lógica que ya anda en CadaMes). La regla: la IA lee el papel, la plata la dice Mercado Pago.
//
//   - Transferencia desde Mercado Pago: el comprobante trae el número de operación. Se busca ese pago en
//     la cuenta: si entró a esta cuenta, está aprobado, nadie lo usó y el importe es el del pedido, se
//     registra el pago solo.
//   - Desde un banco: el papel no trae un número que Mercado Pago conozca. Se buscan en la cuenta las
//     transferencias del mismo importe exacto, del día del comprobante (±1 día por la hora). Una sola y el
//     nombre de quien transfirió coincide con el cliente → se registra sola. Si no coincide el nombre o hay
//     varias del mismo importe → queda «a confirmar»: se muestra cada transferencia tal cual la informa
//     Mercado Pago y una persona dice «Sí, es de este cliente» o «No».
//   - No aparece todavía (la transferencia puede tardar): queda «sin encontrar» y se vuelve a buscar sola
//     cada media hora durante tres días, o con «Buscar de nuevo».
// Nunca se registra un pago que Mercado Pago no tenga: el importe que vale es el de Mercado Pago.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, jsonDe, hayClaude, type Contenido } from "@/lib/claude";
import { mpPedir, tokenDeConexion } from "@/lib/mercadopago/conexion";
import { confirmarPago } from "@/lib/tienda/pagos/confirmar";

export type Leido = { esComprobante: boolean; numeroOperacion: string; monto: number; fecha: string; quienPago: string; quienRecibio: string };

/** Una transferencia tal como la informa Mercado Pago, reducida a lo que se compara y se muestra. */
export type Movimiento = { id: string; monto: number; fecha: string | null; nombre: string | null; documento: string | null; desdeBanco: boolean };

export type Estado = "conciliado" | "a_confirmar" | "sin_encontrar" | "no_coincide" | "no_es";

const INSTRUCCIONES = `Estás leyendo un comprobante de pago o transferencia argentino (Mercado Pago, un banco, una billetera).
Extraé exactamente lo que está escrito y contestá SÓLO con un JSON:
{"esComprobante": bool, "numeroOperacion": "sólo dígitos o vacío", "monto": número, "fecha": "YYYY-MM-DD o vacío", "quienPago": "", "quienRecibio": ""}
Reglas:
- El número de operación es el dato más importante. En Mercado Pago figura como "Número de operación" o "N° de transacción". Sólo dígitos.
- El monto es el importe transferido. En Argentina el punto separa los miles y la coma los decimales: "$ 400.000,00" son cuatrocientos mil.
- Hay dos nombres y no son lo mismo. En quienPago va sólo quien SACÓ la plata (ordenante, originante, titular de la cuenta de débito).
  En quienRecibio, el destinatario o beneficiario. Si un nombre no figura, vacío: confundirlos le acredita el pago a otra persona.
- No completes nada que no esté. Si no es un comprobante de pago, esComprobante false y el resto vacío.`;

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Lee el comprobante con la IA. No consulta a Mercado Pago ni toca nada. */
export async function leerComprobante(datos: Buffer, tipo: string): Promise<Leido | null> {
  if (!hayClaude() || (tipo !== "application/pdf" && !IMAGENES.includes(tipo))) return null;
  const b64 = datos.toString("base64");
  const contenido: Contenido = [
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg", data: b64 } },
    { type: "text", text: INSTRUCCIONES },
  ];
  const r = await pedirClaude({ system: "Leés comprobantes de pago y devolvés JSON.", contenido, maxTokens: 800, modelo: "medio" });
  if ("error" in r) { console.error("[comprobante] lectura", r.error); return null; }
  const j = jsonDe<Partial<Leido>>(r.texto);
  if (!j) return null;
  return {
    esComprobante: !!j.esComprobante, numeroOperacion: String(j.numeroOperacion ?? "").replace(/\D/g, ""),
    monto: Number(j.monto) || 0, fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha ?? "")) ? String(j.fecha) : "",
    quienPago: String(j.quienPago ?? "").trim(), quienRecibio: String(j.quienRecibio ?? "").trim(),
  };
}

// ── La parte que decide: pura, para poder probarla sin llamar a nadie ──

const TOLERANCIA = 1; // pesos: redondeos de centavos
const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Las palabras de un nombre que sirven para comparar (sin «de», «la», iniciales ni «SA»/«SRL»). */
export function palabras(nombre: string): string[] {
  const fuera = new Set(["de", "del", "la", "las", "los", "san", "srl", "sas", "s.a", "sociedad", "anonima"]);
  return sinAcentos(nombre).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !fuera.has(p));
}

/** ¿El nombre (o el documento) de quien transfirió es el del cliente? Dos palabras en común, o una si el
 *  cliente tiene una sola que sirva (una razón social corta); o el mismo CUIT/DNI. */
export function coincideCliente(m: Pick<Movimiento, "nombre" | "documento">, cliente: { nombres: string[]; documentos: string[] }): boolean {
  const doc = m.documento?.replace(/\D/g, "");
  if (doc && doc.length >= 7 && cliente.documentos.some((d) => { const x = d.replace(/\D/g, ""); return x.length >= 7 && (x === doc || x.includes(doc) || doc.includes(x)); })) return true;
  if (!m.nombre) return false;
  const suyas = new Set(palabras(m.nombre));
  return cliente.nombres.some((n) => {
    const p = palabras(n);
    const comunes = p.filter((x) => suyas.has(x)).length;
    return comunes >= 2 || (comunes === 1 && p.length === 1);
  });
}

const cerca = (fecha: string | null, del: string) => {
  if (!fecha || !del) return true;
  return Math.abs(new Date(fecha).getTime() - new Date(`${del}T12:00:00-03:00`).getTime()) <= 36 * 3600_000;
};

export type Veredicto = { estado: Estado; detalle: string; elegido?: Movimiento; candidatos?: Movimiento[] };

/** Qué hacer con lo leído y lo que dijo Mercado Pago. `porNumero`: el pago que devolvió MP para el número
 *  leído (null si no hubo número o no lo encontró); `delDia`: las transferencias aprobadas cerca de la fecha
 *  que nadie usó todavía. */
export function decidir(x: { leido: Leido; total: number; porNumero: Movimiento | null; usadoPorOtro: boolean; delDia: Movimiento[];
  cliente: { nombres: string[]; documentos: string[] } }): Veredicto {
  const { leido, total } = x;
  if (!leido.esComprobante) return { estado: "no_es", detalle: "No parece un comprobante de pago." };
  if (x.porNumero) {
    if (x.usadoPorOtro) return { estado: "no_coincide", detalle: "Esa operación de Mercado Pago ya está registrada en otro pedido." };
    if (Math.abs(x.porNumero.monto - total) > TOLERANCIA) {
      return { estado: "a_confirmar", detalle: `La operación existe, pero es por ${pesos(x.porNumero.monto)} y el pedido es de ${pesos(total)}.`, candidatos: [x.porNumero] };
    }
    return { estado: "conciliado", detalle: `Operación ${x.porNumero.id} de Mercado Pago.`, elegido: x.porNumero };
  }
  if (leido.monto <= 0) return { estado: "sin_encontrar", detalle: "No se pudo leer el importe del comprobante." };
  const iguales = x.delDia.filter((m) => Math.abs(m.monto - leido.monto) <= TOLERANCIA && cerca(m.fecha, leido.fecha));
  if (!iguales.length) return { estado: "sin_encontrar", detalle: `Todavía no aparece en Mercado Pago una transferencia de ${pesos(leido.monto)}${leido.fecha ? ` del ${fechaCorta(leido.fecha)}` : ""}.` };
  const delCliente = iguales.filter((m) => coincideCliente(m, x.cliente));
  if (iguales.length === 1 && delCliente.length === 1 && Math.abs(leido.monto - total) <= TOLERANCIA) {
    return { estado: "conciliado", detalle: `Transferencia de ${iguales[0].nombre ?? "el cliente"} por el importe exacto.`, elegido: iguales[0] };
  }
  const motivo = Math.abs(leido.monto - total) > TOLERANCIA ? `El comprobante es por ${pesos(leido.monto)} y el pedido es de ${pesos(total)}.`
    : iguales.length > 1 ? `Hay ${iguales.length} transferencias de ${pesos(leido.monto)} ese día.`
    : "El nombre de quien transfirió no coincide con el del cliente.";
  return { estado: "a_confirmar", detalle: motivo, candidatos: (delCliente.length ? delCliente : iguales).slice(0, 5) };
}

const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => f.split("-").reverse().join("/");

// ── Mercado Pago ──

type PagoMp = {
  id: number; status?: string; transaction_amount?: number; date_approved?: string | null; date_created?: string; collector_id?: number;
  operation_type?: string; payment_type_id?: string;
  payer?: { first_name?: string | null; last_name?: string | null; identification?: { number?: string | null } | null };
  point_of_interaction?: { transaction_data?: { bank_info?: { payer?: { long_name?: string | null; identification?: { number?: string | null } | null } | null } | null } | null } | null;
};

/** Lo que importa de un pago de MP. Desde otra cuenta de MP llega como money_transfer; desde un banco, como
 *  account_fund / bank_transfer (verificado en CadaMes, 20/8). */
export function movimientoDe(p: PagoMp): Movimiento {
  const banco = p.point_of_interaction?.transaction_data?.bank_info?.payer ?? null;
  const nombre = banco?.long_name?.trim() || [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    id: String(p.id), monto: Number(p.transaction_amount) || 0, fecha: p.date_approved ?? p.date_created ?? null, nombre,
    documento: banco?.identification?.number ?? p.payer?.identification?.number ?? null,
    desdeBanco: p.operation_type === "account_fund" || p.payment_type_id === "bank_transfer",
  };
}
const esTransferencia = (p: PagoMp) => p.operation_type === "money_transfer" || p.operation_type === "account_fund" || p.payment_type_id === "bank_transfer";

/** La cuenta de Mercado Pago del canal del pedido (Configuración › Canales). */
async function cuentaDelPedido(org: string, pid: number) {
  return una<{ id: number; user_id: string }>(`
    select m.id::int, m.mp_user_id::text user_id from pedido p join canal_mp cm on cm.canal_id = p.canal_id join mp_conexion m on m.id = cm.conexion_id
     where p.id = $1 and p.organizacion_id = $2 and m.estado = 'activa' limit 1`, [pid, org]);
}

/** Los ids de MP que ya registró algún pedido (para no usar dos veces la misma transferencia). */
async function usados(org: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await consulta<{ id: string }>("select id_externo id from pago where organizacion_id = $1 and estado = 'aprobado' and id_externo = any($2::text[])", [org, ids]);
  return new Set(r.map((x) => x.id));
}

/** Concilia un comprobante ya subido: lo lee (si no estaba leído), busca en Mercado Pago, decide y, si
 *  cierra, registra el pago. Devuelve el estado en criollo. No tira por Mercado Pago: lo deja anotado. */
export async function conciliarComprobante(org: string, comprobanteId: number, quien: string, archivo?: { datos: Buffer; tipo: string }): Promise<Veredicto> {
  const c = await una<{ pedido_id: number; lectura: Leido | null; estado_pago: string; total: number; cliente: { nombres: string[]; documentos: string[] } }>(`
    select cp.pedido_id::int, cp.lectura, p.estado_pago, p.total_ars::float total,
           json_build_object('nombres', array_remove(array[cl.nombre, cl.razon_social, cl.nombre_pila, p.datos_externos #>> '{tienda,contacto,nombre}'], null),
                             'documentos', array_remove(array[cl.cuit, cl.documento_numero], null)) cliente
      from pedido_comprobante_pago cp join pedido p on p.id = cp.pedido_id left join cliente cl on cl.id = p.cliente_id
     where cp.id = $1 and cp.organizacion_id = $2`, [comprobanteId, org]);
  if (!c) throw new ErrorErp("El comprobante no existe.");
  const anotar = async (v: Veredicto, lectura: Leido | null) => {
    await consulta(`update pedido_comprobante_pago set estado = $3, detalle = $4, lectura = $5::jsonb, candidatos = $6::jsonb, mp_pago_id = $7, revisado_ts = now()
                     where id = $1 and organizacion_id = $2`,
      [comprobanteId, org, v.estado, v.detalle, lectura ? JSON.stringify(lectura) : null, v.candidatos ? JSON.stringify(v.candidatos) : null, v.elegido?.id ?? null]);
    return v;
  };
  if (c.estado_pago === "pagado") return anotar({ estado: "conciliado", detalle: "El pedido ya estaba pagado." }, c.lectura);

  let leido = c.lectura;
  if (!leido && archivo) leido = await leerComprobante(archivo.datos, archivo.tipo);
  if (!leido) return anotar({ estado: "sin_encontrar", detalle: "No se pudo leer el comprobante: revisalo a mano." }, null);
  const cuenta = await cuentaDelPedido(org, c.pedido_id);
  const token = cuenta ? await tokenDeConexion(cuenta.id) : null;
  if (!cuenta || !token) return anotar({ estado: "sin_encontrar", detalle: "El canal no tiene una cuenta de Mercado Pago conectada para buscar la transferencia." }, leido);

  // Por número de operación: el pago tiene que haber entrado a ESTA cuenta y estar aprobado.
  let porNumero: Movimiento | null = null;
  if (leido.numeroOperacion) {
    const r = await mpPedir<PagoMp>(token, "GET", `/v1/payments/${leido.numeroOperacion}`);
    if (r.status === 200 && String(r.datos.collector_id) === cuenta.user_id && r.datos.status === "approved") porNumero = movimientoDe(r.datos);
  }
  // Por importe y fecha: las transferencias aprobadas de esos días que nadie usó.
  let delDia: Movimiento[] = [];
  if (!porNumero && leido.monto > 0) {
    const centro = leido.fecha ? new Date(`${leido.fecha}T12:00:00-03:00`) : new Date();
    const desde = new Date(centro.getTime() - 2 * 86400_000).toISOString(), hasta = new Date(centro.getTime() + 2 * 86400_000).toISOString();
    const r = await mpPedir<{ results?: PagoMp[] }>(token, "GET",
      `/v1/payments/search?sort=date_created&criteria=desc&limit=100&status=approved&range=date_created&begin_date=${encodeURIComponent(desde)}&end_date=${encodeURIComponent(hasta)}`);
    const todos = (r.datos.results ?? []).filter((p) => esTransferencia(p) && String(p.collector_id) === cuenta.user_id).map(movimientoDe);
    const ya = await usados(org, todos.map((m) => m.id));
    delDia = todos.filter((m) => !ya.has(m.id));
  }
  const usadoPorOtro = porNumero ? (await usados(org, [porNumero.id])).has(porNumero.id) : false;
  const v = decidir({ leido, total: c.total, porNumero, usadoPorOtro, delDia, cliente: c.cliente });
  if (v.estado === "conciliado" && v.elegido) await registrar(org, c.pedido_id, v.elegido, quien);
  return anotar(v, leido);
}

async function registrar(org: string, pid: number, m: Movimiento, quien: string) {
  await confirmarPago(org, pid, {
    medio: "transferencia", idExterno: m.id, importe: m.monto,
    detalle: `Transferencia conciliada con el comprobante (Mercado Pago ${m.id}${m.nombre ? `, de ${m.nombre}` : ""})`, crudo: m,
  }, quien);
}

/** «Sí, es de este cliente»: la persona eligió una de las transferencias propuestas. */
export async function confirmarCandidato(org: string, comprobanteId: number, movimientoId: string, quien: string): Promise<string> {
  const c = await una<{ pedido_id: number; candidatos: Movimiento[] | null }>(
    "select pedido_id::int, candidatos from pedido_comprobante_pago where id = $1 and organizacion_id = $2", [comprobanteId, org]);
  const m = c?.candidatos?.find((x) => x.id === movimientoId);
  if (!c || !m) throw new ErrorErp("Esa transferencia ya no está para confirmar.");
  if ((await usados(org, [m.id])).has(m.id)) throw new ErrorErp("Esa transferencia ya está registrada en otro pedido.");
  await registrar(org, c.pedido_id, m, quien);
  await consulta(`update pedido_comprobante_pago set estado = 'conciliado', mp_pago_id = $3, detalle = $4, revisado_ts = now() where id = $1 and organizacion_id = $2`,
    [comprobanteId, org, m.id, `Confirmado a mano: Mercado Pago ${m.id}${m.nombre ? `, de ${m.nombre}` : ""}.`]);
  return "Listo: el pago quedó registrado.";
}

/** «No»: ninguna de las propuestas es de este cliente. */
export async function descartarCandidatos(org: string, comprobanteId: number): Promise<void> {
  await consulta(`update pedido_comprobante_pago set estado = 'no_coincide', candidatos = null, detalle = 'Ninguna transferencia de Mercado Pago es de este cliente: revisalo a mano.', revisado_ts = now()
                   where id = $1 and organizacion_id = $2`, [comprobanteId, org]);
}

/** Los que quedaron «sin encontrar» de los últimos tres días: se vuelven a buscar (la transferencia puede tardar). */
export async function reintentarComprobantes(org: string, hastaMs: number): Promise<{ conciliados: number }> {
  const filas = await consulta<{ id: number }>(`
    select cp.id::int from pedido_comprobante_pago cp join pedido p on p.id = cp.pedido_id
     where cp.organizacion_id = $1 and cp.estado = 'sin_encontrar' and cp.lectura is not null and p.estado_pago <> 'pagado'
       and cp.creado_ts > now() - interval '3 days' and coalesce(cp.revisado_ts, cp.creado_ts) < now() - interval '25 minutes' order by cp.id limit 20`, [org]);
  let conciliados = 0;
  for (const { id } of filas) {
    if (Date.now() > hastaMs) break;
    try { if ((await conciliarComprobante(org, id, "sistema")).estado === "conciliado") conciliados++; } catch (e) { console.error("[comprobante] reintento", id, e); }
  }
  return { conciliados };
}
