// Los mails a los clientes (Fer, 24/10), con remitente por marca: el del pedido
// sale de la marca por donde compró (pedido.datos_externos.tienda.dominio →
// conMarca: hola@tiendavirtual.com.ar, hola@deirolab.com…); el resto, de la
// tienda principal. Las respuestas van a la casilla de Configuración › Correo.
//
//   - pedido recibido (al comprar), pagado, despachado y listo para retirar
//     (los tres últimos por la cola: correo_cola, /api/correo/cola)
//   - bienvenida al crear la cuenta en la tienda
//   - la factura en PDF, al autorizarse, a los clientes con «Factura por mail» tildado

import { consulta, una } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { nombreTienda, tiendaDelCanal, type Tienda } from "@/lib/tienda/tienda";
import { conMarca, urlTienda } from "@/lib/tienda/dominios-tienda";
import { enviarMail, escapar, plantilla, type Resultado } from "@/lib/correo/mailer";
import { cuentasDe, type CuentaTransferencia } from "@/lib/tienda/medios";
import { esSeguimiento, sigueCorrespondiendo, reservaLegible, type TipoSeguimiento } from "@/lib/pedidos/seguimiento";

const marcaDe = async (t: Tienda) => ({ nombre: nombreTienda(t), web: await urlTienda(t), color: t.config.color_boton ?? null, whatsapp: t.config.whatsapp ?? null });
const remitenteDe = (t: Tienda) => ({ nombre: nombreTienda(t), email: t.config.email ?? null });
const saludo = (nombre: string | null) => { const n = (nombre ?? "").trim().split(/[ ,]/)[0]; return n ? `Hola ${escapar(n)},` : "Hola,"; };

/** La tienda con la marca del pedido (si es de la tienda web), o la tienda web principal de la organización. */
export async function tiendaParaPedido(org: string, pedidoId: number | null): Promise<Tienda | null> {
  if (pedidoId) {
    const p = await una<{ canal_id: number; tipo: string; dominio: string | null }>(`
      select p.canal_id::int, c.tipo, p.datos_externos #>> '{tienda,dominio}' dominio from pedido p join canal c on c.id = p.canal_id
       where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
    if (p?.tipo === "web_minorista") {
      const t = await tiendaDelCanal(org, p.canal_id);
      if (t) return conMarca(t, p.dominio);
    }
  }
  const c = await una<{ id: number }>("select id::int from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado' order by id limit 1", [org]);
  return c ? tiendaDelCanal(org, c.id) : null;
}

type DatosPedido = {
  id: number; codigo: string | null; moneda: Moneda; total: string; email: string | null; nombre: string | null; medio: string | null;
  metodo: string | null; metodo_tipo: string | null; costo_envio: string; envio: { direccion?: Record<string, string | null> | null; sucursal_oca?: { nombre: string; direccion: string } | null } | null;
  /** Los descuentos del carrito de la tienda, con su nombre y % («Descuento del 10 % por pagar con Transferencia»). */
  descuentos: { nombre: string; importe: number }[] | null;
};

async function datosPedido(org: string, pedidoId: number) {
  const p = await una<DatosPedido>(`
    select p.id::int, p.codigo_seguimiento codigo, p.moneda, case when p.moneda = 'USD' then p.total_usd else p.total_ars end total,
           coalesce(p.datos_externos #>> '{tienda,contacto,email}', cl.email) email,
           coalesce(p.datos_externos #>> '{tienda,contacto,nombre}', cl.nombre_pila, cl.nombre) nombre,
           -- Un pedido cargado a mano no tiene el medio de la tienda: «Transferencia» cuenta como transferencia.
           coalesce(p.datos_externos #>> '{tienda,medio}', case when p.medio_pago ilike 'transfer%' then 'transferencia' end) medio,
           me.nombre metodo, me.tipo metodo_tipo, p.costo_envio_ars costo_envio, p.envio, p.datos_externos #> '{tienda,descuentos}' descuentos
      from pedido p left join cliente cl on cl.id = p.cliente_id left join metodo_envio me on me.id = p.metodo_envio_id
     where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p) return null;
  // unit: el precio antes de los descuentos del carrito (si la tienda lo guardó), para mostrar abajo cada descuento como en el checkout.
  const lineas = await consulta<{ titulo: string; cantidad: number; unit: string; antes: boolean }>(`
    select titulo, cantidad::int, datos_externos #> '{tienda,precio_venta}' is not null antes, coalesce((datos_externos #>> '{tienda,precio_venta}')::numeric, case when $2 = 'USD' then precio_unit_usd else precio_unit_ars end) unit
      from pedido_linea where pedido_id = $1 order by orden, id`, [pedidoId, p.moneda]);
  return { p, lineas };
}

function tablaLineas(lineas: { titulo: string; cantidad: number; unit: string; antes?: boolean }[], p: DatosPedido) {
  const filas = lineas.map((l) => `<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid #eee;overflow-wrap:anywhere">${l.cantidad} × ${escapar(l.titulo)}</td>
    <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatear(Number(l.unit) * l.cantidad, p.moneda)}</td></tr>`).join("");
  // Los descuentos (y el interés de las cuotas, en negativo), como en el resumen del checkout.
  // Sólo si las líneas vienen con el precio de antes del descuento (si no, ya lo tienen aplicado).
  const descuentos = (lineas.some((l) => l.antes) ? p.descuentos ?? [] : []).filter((x) => Number(x.importe) !== 0).map((x) => `<tr><td style="padding:6px 0;color:#167655">${escapar(x.nombre)}</td>
    <td style="padding:6px 0;text-align:right;white-space:nowrap;color:#167655">${Number(x.importe) > 0 ? "−" : "+"} ${formatear(Math.abs(Number(x.importe)), p.moneda)}</td></tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">${filas}${descuentos}
    ${Number(p.costo_envio) > 0 ? `<tr><td style="padding:6px 0">Envío</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${formatear(Number(p.costo_envio), "ARS")}</td></tr>` : ""}
    <tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;white-space:nowrap">${formatear(Number(p.total), p.moneda)}</td></tr></table>`;
}

/** Los avisos del pedido: recibido, pagado, despachado o listo para retirar, y los del seguimiento de un pedido
 *  sin pagar (lib/pedidos/seguimiento.ts): pago sin completar, recordatorio, último día y reserva anulada. */
export async function mailPedido(org: string, pedidoId: number, tipo: "pagado" | "despachado" | "listo_retirar" | TipoSeguimiento, nota?: string | null): Promise<Resultado> {
  const d = await datosPedido(org, pedidoId);
  if (!d?.p.email) return { ok: false, motivo: "sin_mail" };
  const t = await tiendaParaPedido(org, pedidoId);
  if (!t) return { ok: false, motivo: "sin_tienda" };
  const { p, lineas } = d;
  const marca = await marcaDe(t);
  const seguimiento = p.codigo ? await urlTienda(t, `/pedido/${p.codigo}`) : null;
  let boton = seguimiento ? { texto: "Ver mi pedido", url: seguimiento } : undefined;
  let asunto: string, titulo: string, cuerpo: string;
  const medioDe = async () => p.medio ? una<{ nombre: string; instrucciones: string | null; cuentas: unknown }>(
    "select nombre, instrucciones, cuentas from medio_pago where organizacion_id = $1 and (canal_id is null or canal_id = $2) and tipo = $3 order by canal_id nulls last limit 1",
    [org, t.canalId, p.medio]) : null;
  const tarjeta = p.medio === "payway" || p.medio === "mercadopago";
  if (tipo === "recibido") {
    const medio = await medioDe();
    const reserva = tarjeta ? null : await reservaLegible(p.id);
    asunto = `Recibimos tu pedido #${p.id}`;
    titulo = "¡Recibimos tu pedido!";
    cuerpo = `<p>${saludo(p.nombre)} gracias por tu compra en ${escapar(marca.nombre)}. Este es tu pedido <b>#${p.id}</b>:</p>${tablaLineas(lineas, p)}
      ${medio ? `<p>Medio de pago: <b>${escapar(medio.nombre)}</b>.</p>` : ""}
      ${reserva ? `<p>Te guardamos los productos hasta <b>${escapar(reserva)}</b>.</p>` : ""}
      ${p.medio === "transferencia" ? bloqueTransferencia(Number(p.total), p.moneda, cuentasDe(medio?.cuentas), medio?.instrucciones ?? null, marca.color) : ""}
      ${p.metodo ? `<p>Entrega: <b>${escapar(p.metodo)}</b>.</p>` : ""}
      <p>Con el botón de abajo ves lo que compraste, cómo pagarlo y cómo recibirlo. Te vamos a avisar por acá cada novedad.</p>`;
  } else if (tipo === "pago_incompleto") {
    const reserva = await reservaLegible(p.id);
    asunto = `Tu pedido #${p.id}: el pago no se completó`;
    titulo = "El pago no se completó";
    cuerpo = `<p>${saludo(p.nombre)} recibimos tu pedido <b>#${p.id}</b>, pero el pago no llegó a completarse. Te guardamos los productos por 24 horas${reserva ? ` (hasta ${escapar(reserva)})` : ""}.</p>
      ${tablaLineas(lineas, p)}
      <p>Con el botón de abajo podés volver a intentarlo o elegir otra forma de pago. Si preferís pagar de una forma que no viste en la página, respondé este mail o escribinos por WhatsApp y lo vemos juntos.</p>`;
    if (boton) boton = { ...boton, texto: "Elegir cómo pagar" };
  } else if (tipo === "recordatorio") {
    const medio = await medioDe();
    const reserva = await reservaLegible(p.id);
    asunto = `Todavía no nos llegó el pago de tu pedido #${p.id}`;
    titulo = "Todavía no nos llegó el pago";
    cuerpo = `<p>${saludo(p.nombre)} todavía no nos llegó el pago de tu pedido <b>#${p.id}</b>. Te seguimos guardando los productos${reserva ? ` hasta <b>${escapar(reserva)}</b>` : ""}.</p>
      ${p.medio === "transferencia" ? bloqueTransferencia(Number(p.total), p.moneda, cuentasDe(medio?.cuentas), medio?.instrucciones ?? null, marca.color) : ""}
      <p>Si ya pagaste, respondé este mail con el comprobante. Si necesitás otra forma de pago, escribinos y te ayudamos.</p>`;
  } else if (tipo === "ultimo_dia") {
    const medio = await medioDe();
    asunto = `Hoy es el último día de la reserva de tu pedido #${p.id}`;
    titulo = "Hoy es el último día de tu reserva";
    cuerpo = `<p>${saludo(p.nombre)} hoy es el último día de la reserva de tu pedido <b>#${p.id}</b>. Si no recibimos el pago, mañana se liberan los productos.</p>
      ${p.medio === "transferencia" ? bloqueTransferencia(Number(p.total), p.moneda, cuentasDe(medio?.cuentas), medio?.instrucciones ?? null, marca.color) : ""}
      <p>Si ya pagaste, respondé este mail con el comprobante y lo confirmamos enseguida.</p>`;
  } else if (tipo === "reserva_anulada") {
    asunto = `Liberamos la reserva de tu pedido #${p.id}`;
    titulo = "Liberamos tu reserva";
    cuerpo = `<p>${saludo(p.nombre)} como no recibimos el pago, liberamos la reserva de tu pedido <b>#${p.id}</b>.</p>
      ${tablaLineas(lineas, p)}
      <p>Si todavía lo querés, respondé este mail o escribinos por WhatsApp y te ayudamos a armarlo de nuevo.</p>`;
    boton = undefined;
  } else if (tipo === "pagado") {
    asunto = `Tu pago del pedido #${p.id} está confirmado`;
    titulo = "¡Pago confirmado!";
    cuerpo = `<p>${saludo(p.nombre)} ya tenemos el pago de tu pedido <b>#${p.id}</b> por ${formatear(Number(p.total), p.moneda)}. Ya lo estamos preparando.</p>`;
  } else if (tipo === "despachado") {
    asunto = `Tu pedido #${p.id} está en camino`;
    titulo = "¡Tu pedido está en camino!";
    cuerpo = `<p>${saludo(p.nombre)} despachamos tu pedido <b>#${p.id}</b>${p.metodo ? ` (${escapar(p.metodo)})` : ""}.</p>
      ${nota ? `<p>${escapar(nota)}</p>` : ""}<p>En el link de abajo podés seguirlo.</p>`;
  } else {
    const suc = p.envio?.sucursal_oca;
    asunto = `Tu pedido #${p.id} está listo para retirar`;
    titulo = "¡Tu pedido está listo para retirar!";
    cuerpo = `<p>${saludo(p.nombre)} tu pedido <b>#${p.id}</b> ya está listo${p.metodo ? ` para retirar en <b>${escapar(p.metodo)}</b>` : ""}.</p>
      ${suc ? `<p>${escapar(suc.nombre)} — ${escapar(suc.direccion)}</p>` : ""}
      ${t.config.horario ? `<p>Horario: ${escapar(t.config.horario)}.</p>` : ""}
      ${t.config.direccion ? `<p>Dirección: ${escapar(t.config.direccion)}.</p>` : ""}`;
  }
  return enviarMail(org, {
    para: p.email!, asunto, html: plantilla(marca, titulo, cuerpo, boton), remitente: remitenteDe(t),
    tipo: `pedido_${tipo}`, clave: `pedido:${p.id}:${tipo}`, pedidoId: p.id,
  });
}

/** Cómo pagar por transferencia (Fer, 24/10): el total bien grande y cada cuenta con su alias destacado,
 *  para que el comprador transfiera el monto justo apenas compra. Debajo, las instrucciones del medio. */
export function bloqueTransferencia(total: number, moneda: Moneda, cuentas: CuentaTransferencia[], instrucciones: string | null, color?: string | null) {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#3483FA";
  // Cada dato en dos renglones (el nombre chico arriba, el valor abajo) y los números largos pueden
  // cortarse: así entra en el ancho de un celular sin achicar ni partir el total.
  const dato = (k: string, v: string, grande = false) =>
    `<div style="margin-top:8px"><div style="color:#777;font-size:12px">${k}</div><div style="font-family:monospace;font-size:${grande ? "18px;font-weight:700" : "14px"};color:#222;word-break:break-all">${escapar(v)}</div></div>`;
  return `<div style="margin:20px 0;border:2px solid ${c};border-radius:12px;padding:14px 10px;text-align:center">
      <div style="font-size:14px;color:#555">Total a transferir</div>
      <div style="font-size:28px;font-weight:800;color:#222;margin-top:4px;white-space:nowrap">${escapar(formatear(total, moneda))}</div>
    </div>
    ${cuentas.length ? `<p style="margin-bottom:8px">Transferí ese monto a ${cuentas.length > 1 ? "cualquiera de estas cuentas" : "esta cuenta"}:</p>
    ${cuentas.map((x) => `<div style="background:#f6f6f6;border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="font-weight:700;font-size:15px">${escapar(x.banco)}</div>
      ${x.alias ? dato("Alias", x.alias, true) : ""}${x.cbu ? dato("CBU/CVU", x.cbu) : ""}${x.titular ? dato("Titular", x.titular) : ""}${x.cuit ? dato("CUIT", x.cuit) : ""}
    </div>`).join("")}` : ""}
    ${instrucciones ? `<p style="white-space:pre-line">${escapar(instrucciones)}</p>` : ""}
    <p>Cuando transfieras, respondé este mail con el comprobante y lo acreditamos.</p>`;
}

/** Bienvenida al crear la cuenta en la tienda. */
export async function mailBienvenida(t: Tienda, email: string, nombre: string | null): Promise<Resultado> {
  const marca = await marcaDe(t);
  return enviarMail(t.organizacionId, {
    para: email, asunto: `Bienvenido a ${marca.nombre}`, remitente: remitenteDe(t), tipo: "bienvenida", clave: `bienvenida:${t.canalId}:${email.toLowerCase()}`,
    html: plantilla(marca, `¡Bienvenido a ${marca.nombre}!`,
      `<p>${saludo(nombre)} ya tenés tu cuenta. Desde ahí ves tus pedidos y comprás más rápido la próxima vez: tus datos y tu dirección quedan guardados.</p>
       <p>Entrás con este mail (<b>${escapar(email)}</b>) y la contraseña que elegiste.</p>`,
      { texto: "Ir a mi cuenta", url: await urlTienda(t, "/cuenta") }),
  });
}

/** Confirmar el mail de una cuenta nueva (Fer, 25/10): el link crea la cuenta (vale 24 horas). */
export async function mailConfirmarCuenta(t: Tienda, email: string, nombre: string | null, codigo: string): Promise<Resultado> {
  const marca = await marcaDe(t);
  return enviarMail(t.organizacionId, {
    para: email, asunto: `Confirmá tu mail para crear tu cuenta en ${marca.nombre}`, remitente: remitenteDe(t), tipo: "cuenta_confirmar", clave: null,
    html: plantilla(marca, null,
      `<p>${saludo(nombre)}</p><p>Para terminar de crear tu cuenta en ${escapar(marca.nombre)}, confirmá tu mail con el botón. El link vale 24 horas.</p>
       <p style="font-size:13px;color:#777">Si no fuiste vos, ignorá este mail: sin confirmar, no se crea nada.</p>`,
      { texto: "Confirmar mi mail", url: await urlTienda(t, `/cuenta/confirmar?c=${encodeURIComponent(codigo)}`) }),
  });
}

/** Cambiar la contraseña olvidada (vale una hora). `yaTenia`: pidió crear una cuenta con un mail que ya tenía. */
export async function mailRecuperarClave(t: Tienda, email: string, codigo: string, yaTenia: boolean): Promise<Resultado> {
  const marca = await marcaDe(t);
  return enviarMail(t.organizacionId, {
    para: email, asunto: `Cambiá tu contraseña de ${marca.nombre}`, remitente: remitenteDe(t), tipo: "cuenta_recuperar", clave: null,
    html: plantilla(marca, null,
      `<p>Hola,</p><p>${yaTenia ? `Ya tenés una cuenta en ${escapar(marca.nombre)} con este mail. Si no te acordás la contraseña, cambiala con el botón.`
        : "Pediste cambiar la contraseña de tu cuenta. Elegí una nueva con el botón."} El link vale una hora.</p>
       <p style="font-size:13px;color:#777">Si no fuiste vos, ignorá este mail: tu contraseña sigue igual.</p>`,
      { texto: "Elegir una contraseña nueva", url: await urlTienda(t, `/cuenta/clave?c=${encodeURIComponent(codigo)}`) }),
  });
}

/** La factura en PDF, a los clientes con «Factura por mail» tildado y mail cargado (no las de ventas de
 *  Mercado Libre, que van a ML). Con `manual`, aunque no tenga el tilde. Sin nota de crédito. */
export async function mailFactura(org: string, comprobanteId: number, o: { manual?: boolean } = {}): Promise<Resultado> {
  const c = await una<{ tipo_cbte: number; punto_venta: number; numero: string | null; estado: string; pedido_id: number | null; email: string | null; nombre: string | null;
    por_mail: boolean | null; canal_tipo: string | null }>(`
    select cb.tipo_cbte, cb.punto_venta, cb.numero::text, cb.estado, cb.pedido_id::int,
           coalesce(p.datos_externos #>> '{tienda,contacto,email}', cl.email) email, coalesce(p.datos_externos #>> '{tienda,contacto,nombre}', cl.nombre_pila, cl.nombre) nombre, coalesce((p.datos_externos #>> '{tienda,contacto,factura_mail}')::boolean, cl.factura_por_mail) por_mail, ca.tipo canal_tipo
      from comprobante cb left join pedido p on p.id = cb.pedido_id left join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = coalesce(cb.cliente_id, p.cliente_id)
     where cb.id = $1 and cb.organizacion_id = $2`, [comprobanteId, org]);
  if (!c || c.estado !== "autorizado") return { ok: false, motivo: "sin_autorizar" };
  const { TIPOS_CBTE } = await import("@/lib/arca/facturar");
  const tipo = TIPOS_CBTE[c.tipo_cbte];
  if (tipo?.nc && !o.manual) return { ok: false, motivo: "nota_credito" };
  if (!c.email) return { ok: false, motivo: "sin_mail" };
  if (!o.manual && c.por_mail !== true) return { ok: false, motivo: "sin_tilde" };
  // Una venta de Mercado Libre: la factura va a Mercado Libre (el mail del comprador es de ML), salvo a mano.
  if (!o.manual && c.canal_tipo === "mercadolibre") return { ok: false, motivo: "venta_ml" };
  const t = await tiendaParaPedido(org, c.pedido_id);
  if (!t) return { ok: false, motivo: "sin_tienda" };
  const { pdfComprobante } = await import("@/lib/arca/pdf");
  const nombreCbte = `${tipo?.nombre ?? "Factura"} ${String(c.punto_venta).padStart(5, "0")}-${String(c.numero ?? "").padStart(8, "0")}`;
  const marca = await marcaDe(t);
  return enviarMail(org, {
    para: c.email, asunto: `Tu ${nombreCbte}`, remitente: remitenteDe(t), tipo: "factura", clave: o.manual ? null : `factura:${comprobanteId}`,
    comprobanteId, pedidoId: c.pedido_id,
    // Un mail normal, sin título grande (Fer, 25/10).
    html: plantilla(marca, null,
      `<p>${saludo(c.nombre)}</p>
       <p>Te mandamos la factura${c.pedido_id ? ` correspondiente a tu pedido <b>#${c.pedido_id}</b>` : ""}, adjunta en PDF (${escapar(nombreCbte)}).</p>
       <p>¡Muchas gracias por tu compra!</p>`),
    adjuntos: [{ nombre: `${nombreCbte.replace(/\s+/g, "-")}.pdf`, datos: await pdfComprobante(org, comprobanteId), tipo: "application/pdf" }],
  });
}

/** Recién autorizada (lo llama `emitir`): si le corresponde, sale por mail. No tira. */
export async function alAutorizarMail(org: string, comprobanteId: number): Promise<void> {
  try {
    const r = await mailFactura(org, comprobanteId);
    if (!r.ok && !["sin_tilde", "sin_mail", "nota_credito", "sin_configurar", "venta_ml"].includes(r.motivo ?? "")) console.warn("[factura por mail]", comprobanteId, r.motivo);
  } catch (e) {
    console.error("[factura por mail]", comprobanteId, e instanceof Error ? e.message : e);
  }
}

/** Lo que dejó la cola de cambios de estado (correo_cola): hasta 20 por vuelta. Cada aviso sale por mail y,
 *  si el cliente eligió WhatsApp, también por WhatsApp (lib/mensajes/avisos-pedido.ts); cada canal con sus
 *  reintentos: el mail hasta 5, el WhatsApp cada 10 minutos durante 3 días (plantilla en aprobación). */
export async function procesarCola(org: string | null, hastaMs: number): Promise<{ enviados: number; fallidos: number }> {
  const filas = await consulta<{ id: number; organizacion_id: string; pedido_id: number; tipo: "pagado" | "despachado" | "listo_retirar" | TipoSeguimiento; nota: string | null;
    falta_mail: boolean; falta_wa: boolean }>(`
    select id::int, organizacion_id, pedido_id::int, tipo, nota, ${SQL_FALTA_MAIL} falta_mail, ${SQL_FALTA_WA} falta_wa from correo_cola
     where (${SQL_FALTA_MAIL} or ${SQL_FALTA_WA}) and ($1::text is null or organizacion_id = $1) order by id limit 20`, [org]);
  let enviados = 0, fallidos = 0;
  const { avisarPorWhatsapp } = await import("@/lib/mensajes/avisos-pedido");
  for (const f of filas) {
    if (Date.now() > hastaMs) break;
    // Un aviso del seguimiento que ya no hace falta (el pedido se pagó o cambió) no sale por ningún lado.
    if (esSeguimiento(f.tipo) && !(await sigueCorrespondiendo(f.pedido_id, f.tipo))) {
      await consulta(`update correo_cola set hecho_ts = coalesce(hecho_ts, now()), wa_hecho_ts = coalesce(wa_hecho_ts, now()),
                             wa_estado = coalesce(wa_estado, 'no_corresponde'), wa_detalle = coalesce(wa_detalle, 'El pedido ya se pagó o cambió.') where id = $1`, [f.id]);
      continue;
    }
    if (f.falta_mail) {
      const r = await mailPedido(f.organizacion_id, f.pedido_id, f.tipo, f.nota).catch((e) => ({ ok: false, motivo: e instanceof Error ? e.message : String(e) }) as Resultado);
      // Sin mail del cliente no hay nada que reintentar; sin configurar, se reintenta después (hasta 5).
      const terminado = r.ok || r.motivo === "sin_mail" || r.motivo === "dominio_sin_correo" || r.motivo === "mail_invalido";
      await consulta(`update correo_cola set intentos = intentos + 1, hecho_ts = case when $2 then now() end where id = $1`, [f.id, terminado]);
      if (r.ok) enviados++; else if (!terminado) fallidos++;
    }
    if (f.falta_wa) {
      const w = await avisarPorWhatsapp(f.organizacion_id, f.pedido_id, f.tipo, f.nota)
        .catch((e) => ({ estado: "pendiente" as const, detalle: e instanceof Error ? e.message : String(e) }));
      await consulta(`update correo_cola set wa_intentos = wa_intentos + 1, wa_intento_ts = now(), wa_estado = $2, wa_detalle = $3,
                             wa_hecho_ts = case when $2 <> 'pendiente' then now() end where id = $1`, [f.id, w.estado, w.detalle.slice(0, 300)]);
    }
  }
  return { enviados, fallidos };
}

const SQL_FALTA_MAIL = "(hecho_ts is null and intentos < 5)";
const SQL_FALTA_WA = "(wa_hecho_ts is null and wa_intentos < 300 and creado_ts > now() - interval '3 days' and (wa_intento_ts is null or wa_intento_ts < now() - interval '10 minutes'))";
