// Bloque "Operación" del detalle de un pedido que no es de Mercado Libre (los
// de ML los mueve ML): confirmar el pago, pasarlo al estado siguiente, avisar
// al cliente por WhatsApp. Y los pagos del pedido (de cualquier canal).

import { SQL_ML_RETIRA } from "@/lib/pedidos/retiro";
import { motivoFrenoCc } from "@/lib/administracion/credito";
import { vencimientoDe } from "@/lib/pedidos/reserva";
import { queArrastraCancelar, motivoNoCancelable } from "@/lib/pedidos/cancelar";
import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { esMedioEfectivo, sqlEstadoPago, sqlSinEsperarPago, type EstadoPedido } from "@/lib/pedidos";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { TIPOS_MEDIO } from "@/app/config/medios-pago/comun";
import { accionConfirmarPago, accionCambiarEstadoPedido, accionClientePresente, accionVigenciaPresupuesto, accionBorrarComprobantePago, accionBorrarConformeRetiro, accionConciliarComprobante, accionConfirmarTransferencia, accionDescartarTransferencias } from "./acciones";
import SubirArchivo from "./SubirArchivo";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { supabaseServer } from "@/lib/supabase";

const ESTADO_PAGO: Record<string, { texto: string; tono: "verde" | "amarillo" | "rojo" | "gris" }> = {
  pendiente: { texto: "Pendiente", tono: "amarillo" }, aprobado: { texto: "Aprobado", tono: "verde" }, rechazado: { texto: "Rechazado", tono: "rojo" },
  cancelado: { texto: "Cancelado", tono: "gris" }, reembolsado: { texto: "Reembolsado", tono: "rojo" },
};

/** Teléfono argentino a formato de WhatsApp (549 + característica + número,
 *  sin 0 ni 15). Si no tiene pinta de argentino, los dígitos como vinieron. */
export function telefonoWhatsapp(tel: string | null | undefined): string | null {
  let n = (tel ?? "").replace(/\D/g, "");
  if (!n) return null;
  if (n.startsWith("00")) n = n.slice(2);
  const conPais = n.startsWith("54");
  if (conPais) { n = n.slice(2); if (n.startsWith("9")) n = n.slice(1); }
  if (n.startsWith("0")) n = n.slice(1);
  // El 15 después de la característica (de 2, 3 o 4 cifras) sobra.
  if (n.length === 12) for (const a of [2, 3, 4]) if (n.slice(a, a + 2) === "15") { n = n.slice(0, a) + n.slice(a + 2); break; }
  if (n.length === 10) return `549${n}`;
  return conPais ? `54${n}` : n.length >= 8 ? n : null;
}

export function mensaje(estado: EstadoPedido, d: { nombre: string | null; pedido: number; tienda: string; seguimiento: string | null; despacho: string | null; pagoPendiente: boolean; aCobrar: boolean }) {
  const hola = `¡Hola${d.nombre ? ` ${d.nombre.split(" ")[0]}` : ""}!`;
  const n = `tu pedido #${d.pedido}`;
  const cuerpo: Record<EstadoPedido, string> = {
    presupuesto: `Te pasamos el presupuesto #${d.pedido} de ${d.tienda}. Cualquier duda, escribinos.`,
    nuevo: d.aCobrar ? `Recibimos ${n} en ${d.tienda}. Ya lo estamos preparando; lo pagás al retirarlo.`
      : d.pagoPendiente ? `Recibimos ${n} en ${d.tienda}. Apenas se acredite el pago lo preparamos.` : `Recibimos ${n} en ${d.tienda}.`,
    pagado: `Confirmamos el pago de ${n}. Ya lo estamos preparando.`,
    en_preparacion: `Estamos preparando ${n}.`,
    preparado: `${n.charAt(0).toUpperCase() + n.slice(1)} ya está listo.${d.aCobrar ? " Lo pagás al retirarlo." : ""}`,
    despachado: `${n.charAt(0).toUpperCase() + n.slice(1)} ya salió.${d.despacho ? ` Seguimiento: ${d.despacho}.` : ""}`,
    entregado: `${n.charAt(0).toUpperCase() + n.slice(1)} figura entregado. ¡Gracias por tu compra!`,
    cancelado: `${n.charAt(0).toUpperCase() + n.slice(1)} quedó cancelado. Cualquier duda, escribinos.`,
    devuelto: `Registramos la devolución de ${n}.`,
  };
  return [hola, cuerpo[estado], d.seguimiento ? `Podés seguirlo acá: ${d.seguimiento}` : null].filter(Boolean).join(" ");
}

/** Los botones de estado siguiente según el actual (Cancelar va aparte). */
const SIGUIENTES: Partial<Record<EstadoPedido, { estado: EstadoPedido; texto: string; nota?: boolean }[]>> = {
  // Sólo un nuevo que no espera el pago («A cobrar» o a convenir): ya tiene su stock reservado.
  nuevo: [{ estado: "en_preparacion", texto: "En preparación" }, { estado: "preparado", texto: "Preparado" }],
  pagado: [{ estado: "en_preparacion", texto: "En preparación" }, { estado: "preparado", texto: "Preparado" }],
  en_preparacion: [{ estado: "preparado", texto: "Preparado" }],
  preparado: [{ estado: "despachado", texto: "Despachado", nota: true }, { estado: "entregado", texto: "Entregado" }],
  despachado: [{ estado: "entregado", texto: "Entregado" }],
};
const ESTADO_CONCILIACION: Record<string, string> = {
  conciliado: "Pago encontrado", a_confirmar: "A confirmar", sin_encontrar: "Todavía no aparece", no_coincide: "No coincide", no_es: "No es un comprobante",
};
const CERRADOS: EstadoPedido[] = ["entregado", "cancelado", "devuelto"];

export default async function Operacion({ org, pid, sp }: { org: string; pid: number; sp: { ok?: string; error?: string; b?: string } }) {
  const p = await una<{
    estado: EstadoPedido; estado_pago: string; total_ars: number; id_externo: string | null; medio_pago: string | null; codigo: string | null; canal_id: number; canal_tipo: string;
    cliente: string | null; telefono: string | null; movil: string | null; envio: string | null; envio_tipo: string | null;
    sin_esperar: boolean; retiro: boolean; ml_retira: boolean; seguimiento: string | null; vigencia: string | null;
  }>(`
    select p.estado, p.id_externo, ${sqlEstadoPago("p")} estado_pago, ${sqlSinEsperarPago("p")} sin_esperar,
           (me.tipo = 'retiro' or p.envio ->> 'metodo' = 'Retira') is true retiro, ${SQL_ML_RETIRA} ml_retira, p.total_ars::float, p.medio_pago, p.codigo_seguimiento codigo, p.canal_id::int, c.tipo canal_tipo,
           cl.nombre cliente, cl.telefono, cl.whatsapp movil, me.nombre envio, me.tipo envio_tipo, me.seguimiento, to_char(p.vigencia, 'YYYY-MM-DD') vigencia
      from pedido p join canal c on c.id = p.canal_id join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join metodo_envio me on me.id = p.metodo_envio_id
     where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!p) return null;
  const vence = await vencimientoDe(org, pid);
  const frenoCc = p.estado_pago === "a_convenir" ? await motivoFrenoCc(pid) : null;
  const pagos = await consulta<{ id: number; medio: string; estado: string; importe: number; cuotas: number; detalle: string | null; fecha: Date }>(`
    select id::int, medio, estado, importe_ars::float importe, cuotas, detalle, creado_ts fecha from pago
     where pedido_id = $1 and organizacion_id = $2 order by creado_ts, id`, [pid, org]);
  // Los comprobantes de pago y el conforme de retiro, con un link firmado por una hora (el bucket es privado).
  const archivosDe = async (tabla: "pedido_comprobante_pago" | "pedido_conforme_retiro") => {
    const filas = await consulta<{ id: number; ruta: string; nombre: string | null; creado: Date; estado: string | null; detalle: string | null;
      candidatos: { id: string; monto: number; fecha: string | null; nombre: string | null; documento: string | null; desdeBanco: boolean }[] | null }>(
      `select id::int, ruta, nombre, creado_ts creado, ${tabla === "pedido_comprobante_pago" ? "estado, detalle, candidatos" : "null estado, null detalle, null candidatos"}
         from ${tabla} where pedido_id = $1 and organizacion_id = $2 order by id`, [pid, org]);
    const sb = filas.length ? await supabaseServer() : null;
    return Promise.all(filas.map(async (c) => ({
      ...c, url: (await sb!.storage.from("comprobantes").createSignedUrl(c.ruta, 3600).catch(() => null))?.data?.signedUrl ?? null })));
  };
  const [comprobantes, conformes] = await Promise.all([archivosDe("pedido_comprobante_pago"), archivosDe("pedido_conforme_retiro")]);
  const Archivos = ({ filas, borrar, titulo }: { filas: typeof comprobantes; borrar: (fd: FormData) => Promise<void>; titulo: string }) => filas.map((c) => (
    <span key={c.id} className="inline-flex items-center gap-1 rounded-lg border border-[#E3E9F0] bg-white px-2 py-1">
      {c.url ? <a href={c.url} target="_blank" rel="noopener" className="text-[#16577F] underline">{c.nombre ?? titulo}</a> : <span>{c.nombre ?? titulo}</span>}
      <span className="text-[#5C6B76]">· {fechaHora(c.creado)}</span>
      <TachoConfirmar accion={borrar} campos={{ pedido_id: String(pid), id: String(c.id) }} pregunta="¿Borrar?" />
    </span>
  ));
  // El conforme de retiro (Fer, 25/10): cuando no lo lleva ningún transporte; la firma de quien retira y, si hace falta, su DNI.
  const sinTransporte = p.canal_tipo === "mercadolibre" ? p.ml_retira : p.retiro;
  const BloqueConforme = sinTransporte && (p.estado !== "cancelado" || conformes.length > 0) && (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {p.estado !== "cancelado" && <SubirArchivo orgId={org} pedidoId={pid} clase="retiro" />}
      {conformes.length > 0 && <span className="text-[#5C6B76]">Conforme de retiro:</span>}
      <Archivos filas={conformes} borrar={accionBorrarConformeRetiro} titulo="Conforme" />
      {p.estado !== "cancelado" && conformes.length === 0 && <span className="text-[11px] text-[#5C6B76]">La firma de quien retira (el cliente o un comisionista) y, si hace falta, la foto de su DNI. Con el pedido preparado, al subirla queda entregado, como «Cliente presente: retira».</span>}
    </div>
  );
  // Lo que arrastra cancelar (OCA, Payway, la factura), para las preguntas del botón.
  const cancelar = p.canal_tipo !== "mercadolibre" && !CERRADOS.includes(p.estado) ? await queArrastraCancelar(org, pid) : null;
  const nombreMedio = (m: string) => (Object.hasOwn(TIPOS_MEDIO, m) ? TIPOS_MEDIO[m as keyof typeof TIPOS_MEDIO].nombre : m);
  const esMl = p.canal_tipo === "mercadolibre";

  const TablaPagos = pagos.length > 0 && (
    <div className={`${CAJA_TABLA} mt-2`}>
      <table className={TABLA}>
        <thead className={THEAD}><tr><th className={THN}>Fecha</th><th className={TH}>Medio</th><th className={TH}>Estado</th><th className={THN}>Importe</th><th className={TH}>Detalle</th></tr></thead>
        <tbody>
          {pagos.map((x) => {
            const e = ESTADO_PAGO[x.estado] ?? { texto: x.estado, tono: "gris" as const };
            return (
              <tr key={x.id} className={TR}>
                <td className={TDN}>{fechaHora(x.fecha)}</td>
                <td className={TD}>{nombreMedio(x.medio)}{x.cuotas > 1 && <span className="text-[#5C6B76]"> · {x.cuotas} cuotas</span>}</td>
                <td className={TD}><Estado texto={e.texto} tono={e.tono} /></td>
                <td className={TDN}>{formatear(x.importe, "ARS")}</td>
                <td className={`${TD} text-[#5C6B76]`}>{x.detalle ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (esMl) {
    // El aviso a ML de que lo retiró (sale solo por la cola con el botón): cómo le fue, acá mismo.
    const avisos = p.ml_retira ? await consulta<{ estado: string; error: string | null; enviado: Date | null }>(`
      select estado, ultimo_error error, enviado_ts enviado from ml_cola
       where organizacion_id = $1 and canal_id = $2 and tipo = 'otro' and item_id like 'orden %' and payload ->> 'descripcion' like $3
       order by id`, [org, p.canal_id, `%(pedido ${pid})`]) : [];
    // «Cancelar pedido» de ML va arriba (AccionesPedido). Una venta sin envío que retira en el local (Fer, 22/10):
    // «Cliente presente: retira» la entrega, la factura si falta y le avisa a ML que se concretó.
    return (
      <>
        {((p.ml_retira && p.estado === "preparado") || BloqueConforme) && (
          <>
            <h2 className="text-sm font-bold mb-2">Operación</h2>
            {sp.b === "op" && (sp.ok || sp.error) && (
              <p role={sp.error ? "alert" : undefined} className={`text-xs rounded-lg px-3 py-2 mb-2 ${sp.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>{sp.error ?? sp.ok}</p>
            )}
            <div className={`${CAJA} mb-4 grid gap-3`}>
              {p.ml_retira && p.estado === "preparado" && (
                <form action={accionClientePresente} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="pedido_id" value={pid} />
                  <BotonEnviar clase={VERDE} corriendo="Entregando y avisando…">Cliente presente: retira</BotonEnviar>
                  <span className="text-[11px] text-[#5C6B76]">Queda entregado, se factura si falta (la factura se sube a Mercado Libre) y se le avisa solo a Mercado Libre que el comprador ya lo tiene.</span>
                </form>
              )}
              {BloqueConforme}
            </div>
          </>
        )}
        {avisos.length > 0 && (
          <p className="text-xs mb-4">
            <span className="text-[#5C6B76]">Aviso a Mercado Libre de que lo retiró: </span>
            {avisos.every((a) => a.estado === "ok") ? <Estado texto={`Recibido${avisos[0].enviado ? ` el ${fechaHora(avisos[0].enviado)}` : ""}`} tono="verde" />
              : avisos.some((a) => a.estado === "error") ? <><Estado texto="Falló" tono="rojo" /> <span className="text-[#C03420]">{avisos.find((a) => a.estado === "error")?.error}</span></>
              : <Estado texto="Mandándose…" tono="amarillo" />}
          </p>
        )}
        {pagos.length > 0 && <><h2 className="text-sm font-bold mb-2">Pagos</h2><div className="mb-4">{TablaPagos}</div></>}
      </>
    );
  }

  // Un presupuesto (Fer, 7/10): no reserva stock; se imprime, se pasa a pedido o se cancela.
  if (p.estado === "presupuesto") {
    const vencido = p.vigencia != null && p.vigencia < new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    return (
      <>
        <h2 className="text-sm font-bold mb-2">Presupuesto</h2>
        {sp.b === "op" && (sp.ok || sp.error) && (
          <p role={sp.error ? "alert" : undefined} className={`text-xs rounded-lg px-3 py-2 mb-2 ${sp.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>{sp.error ?? sp.ok}</p>
        )}
        <div className={`${CAJA} mb-4 grid gap-3`}>
          <p className="text-xs text-[#5C6B76]">Es un presupuesto: <b>no reserva stock</b>. Al pasarlo a pedido (botón de arriba) queda con el pago pendiente y reserva el stock.</p>
          <form action={accionVigenciaPresupuesto} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="pedido_id" value={pid} />
            <label><span className={ETIQUETA}>Válido hasta</span>
              <input type="date" name="vigencia" defaultValue={p.vigencia ?? ""} className={CAMPO} required /></label>
            <BotonEnviar clase={SUAVE} corriendo="Guardando…">Cambiar</BotonEnviar>
            {vencido && <Estado texto="Vencido" tono="rojo" />}
          </form>
        </div>
      </>
    );
  }

  // Medio para confirmar: el del pago pendiente, o el del pedido; si no, se elige.
  const pendiente = [...pagos].reverse().find((x) => x.estado === "pendiente");
  const medioSugerido = pendiente?.medio ?? (esMedioEfectivo(p.medio_pago) ? "efectivo" : p.medio_pago) ?? "";
  const activos = await consulta<{ tipo: string; nombre: string }>(
    "select tipo, nombre from medio_pago where organizacion_id = $1 and canal_id is null order by activo desc, orden, id", [org]);
  const opcionesMedio = activos.length ? activos : Object.entries(TIPOS_MEDIO).map(([tipo, t]) => ({ tipo, nombre: t.nombre }));
  if (medioSugerido && !opcionesMedio.some((m) => m.tipo === medioSugerido)) opcionesMedio.unshift({ tipo: medioSugerido, nombre: nombreMedio(medioSugerido) });
  const pagoPendiente = ["pendiente", "a_convenir", "a_cobrar"].includes(p.estado_pago) && !CERRADOS.includes(p.estado);
  const aCobrar = p.estado_pago === "a_cobrar" && !CERRADOS.includes(p.estado);
  // Retiro ya preparado (Fer, 7/10): «Cliente presente: retira» cobra si hace falta, entrega y factura en un clic.
  const clientePresente = p.retiro && p.estado === "preparado";
  // Sin pagar y no a cuenta corriente: al retirar se elige con qué pagó (clientePresenteRetira lo exige).
  const pideMedio = clientePresente && !["pagado", "a_convenir"].includes(p.estado_pago);
  // Seguimiento automático (OCA): despachado y entregado los marca el transportista, sin botones.
  const automatico = p.seguimiento === "automatico";

  // Un nuevo sólo avanza solo si no espera el pago; un «A cobrar» que retira se entrega con «Entregado y cobrado».
  const siguientes = (p.estado === "nuevo" && !p.sin_esperar ? [] : SIGUIENTES[p.estado] ?? [])
    .filter((x) => !(clientePresente && (x.estado === "entregado" || x.estado === "despachado")))
    .filter((x) => !(automatico && (x.estado === "despachado" || x.estado === "entregado")));

  return (
    <>
      <h2 className="text-sm font-bold mb-2">Operación</h2>
      {sp.b === "op" && (sp.ok || sp.error) && (
        <p role={sp.error ? "alert" : undefined} className={`text-xs rounded-lg px-3 py-2 mb-2 ${sp.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>{sp.error ?? sp.ok}</p>
      )}
      <div className={`${CAJA} mb-4 grid gap-3`}>
        {p.envio && <p className="text-xs"><span className="text-[#5C6B76]">Entrega:</span> {p.envio}</p>}
        {aCobrar && (
          <p className="text-sm rounded-lg px-3 py-2 bg-[#FDE7B0] text-[#3D2600] border-2 border-[#C98A00]">
            <b>A COBRAR {formatear(p.total_ars, "ARS")}</b>{p.retiro ? " al retirar" : " al entregar"}.
          </p>
        )}
        {clientePresente && (
          <form action={accionClientePresente} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="pedido_id" value={pid} />
            {pideMedio && (
              <label><span className={ETIQUETA}>Cobró con</span>
                <select name="medio" defaultValue={medioSugerido} className={CAMPO} required>
                  {!medioSugerido && <option value="">Elegí…</option>}
                  {opcionesMedio.map((m) => <option key={m.tipo} value={m.tipo}>{m.nombre}</option>)}
                </select></label>
            )}
            <BotonEnviar clase={VERDE} corriendo="Entregando y facturando…">
              {pideMedio ? `Cliente presente: retira y paga ${formatear(p.total_ars, "ARS")}` : "Cliente presente: retira"}
            </BotonEnviar>
            <span className="text-[11px] text-[#5C6B76]">Queda entregado y, si no tiene factura, se factura en el momento.</span>
          </form>
        )}
        {automatico && ["preparado", "despachado"].includes(p.estado) && (
          <p className="text-[11px] text-[#5C6B76]">El envío lo sigue el transportista: el pedido pasa solo a «Despachado» cuando lo retiran y a «Entregado» cuando lo entregan.</p>
        )}
        {/* El comprobante de pago: mientras el cobro no está registrado (después, los que lleguen por mail o WhatsApp). */}
        {(pagoPendiente || comprobantes.length > 0) && (
          <div className="grid gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {pagoPendiente && <SubirArchivo orgId={org} pedidoId={pid} clase="pago" />}
              {comprobantes.length > 0 && <span className="text-[#5C6B76]">Comprobante de pago:</span>}
              <Archivos filas={comprobantes} borrar={accionBorrarComprobantePago} titulo="Comprobante" />
            </div>
            {/* Cómo quedó la conciliación con Mercado Pago de cada comprobante (lib/pagos/comprobante.ts). */}
            {comprobantes.filter((c) => c.estado).map((c) => (
              <div key={c.id} className={`rounded-lg border px-3 py-2 grid gap-2 ${c.estado === "conciliado" ? "border-[#BFE3CC] bg-[#EEF7F1]" : c.estado === "a_confirmar" ? "border-[#F2D27A] bg-[#FFF8E5]" : "border-[#E3E9F0] bg-[#FAFBFC]"}`}>
                <span>
                  <Estado texto={ESTADO_CONCILIACION[c.estado!] ?? c.estado!} tono={c.estado === "conciliado" ? "verde" : c.estado === "a_confirmar" ? "amarillo" : c.estado === "no_coincide" || c.estado === "no_es" ? "rojo" : "gris"} />
                  {c.detalle && <span className="ml-2">{c.detalle}</span>}
                </span>
                {c.estado === "a_confirmar" && pagoPendiente && (c.candidatos ?? []).map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-[#E3E9F0] px-2 py-1.5">
                    <span>
                      <b className="tabular-nums">{formatear(m.monto, "ARS")}</b>
                      {m.fecha && <> · {fechaHora(new Date(m.fecha))}</>}
                      {" · "}{m.nombre ?? "sin nombre"}{m.documento && <span className="text-[#5C6B76]"> ({m.documento})</span>}
                      <span className="text-[#5C6B76]"> · {m.desdeBanco ? "desde un banco" : "desde Mercado Pago"} · operación {m.id}</span>
                    </span>
                    <span className="font-semibold">¿Es de este cliente?</span>
                    <form action={accionConfirmarTransferencia}>
                      <input type="hidden" name="pedido_id" value={pid} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="movimiento" value={m.id} />
                      <BotonEnviar clase={VERDE} corriendo="Registrando…">Sí</BotonEnviar>
                    </form>
                  </div>
                ))}
                {c.estado === "a_confirmar" && pagoPendiente && (
                  <form action={accionDescartarTransferencias}>
                    <input type="hidden" name="pedido_id" value={pid} /><input type="hidden" name="id" value={c.id} />
                    <BotonEnviar clase={SUAVE} corriendo="Un momento…">{(c.candidatos ?? []).length > 1 ? "No es ninguna" : "No"}</BotonEnviar>
                  </form>
                )}
                {pagoPendiente && ["sin_encontrar", "no_coincide"].includes(c.estado!) && (
                  <form action={accionConciliarComprobante}>
                    <input type="hidden" name="pedido_id" value={pid} /><input type="hidden" name="id" value={c.id} />
                    <BotonEnviar clase={SUAVE} corriendo="Buscando…">Buscar de nuevo en Mercado Pago</BotonEnviar>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        {BloqueConforme}
        {pagoPendiente && !pideMedio && (
          <form action={accionConfirmarPago} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="pedido_id" value={pid} />
            <label><span className={ETIQUETA}>Pagó con</span>
              <select name="medio" defaultValue={medioSugerido} className={CAMPO} required>
                {!medioSugerido && <option value="">Elegí…</option>}
                {opcionesMedio.map((m) => <option key={m.tipo} value={m.tipo}>{m.nombre}</option>)}
              </select></label>
            <BotonEnviar clase={VERDE} corriendo="Confirmando…">Confirmar pago de {formatear(p.total_ars, "ARS")}</BotonEnviar>
          </form>
        )}
        {(siguientes.length > 0 || !CERRADOS.includes(p.estado)) && (
          <div className="flex flex-wrap items-end gap-2">
            {siguientes.map((x) => x.nota ? (
              <form key={x.estado} action={accionCambiarEstadoPedido} className="flex flex-wrap items-end gap-1">
                <input type="hidden" name="pedido_id" value={pid} /><input type="hidden" name="estado" value={x.estado} />
                <label><span className={ETIQUETA}>Seguimiento / nota</span>
                  <input name="nota" placeholder="Ej. OCA 1234567890" className={`${CAMPO} w-48`} /></label>
                <BotonEnviar clase={PRIMARIO} corriendo="Guardando…">{x.texto}</BotonEnviar>
              </form>
            ) : (
              <form key={x.estado} action={accionCambiarEstadoPedido}>
                <input type="hidden" name="pedido_id" value={pid} /><input type="hidden" name="estado" value={x.estado} />
                <BotonEnviar clase={PRIMARIO} corriendo="Guardando…">{x.texto}</BotonEnviar>
              </form>
            ))}
            {cancelar && motivoNoCancelable(p.estado, cancelar) && (
              <span className="text-xs text-[#5C6B76]">{motivoNoCancelable(p.estado, cancelar)}</span>
            )}
          </div>
        )}
        {p.estado === "nuevo" && pagoPendiente && !p.sin_esperar && <p className="text-[11px] text-[#5C6B76]">El stock ya está reservado. Al confirmar el pago pasa a «A preparar» y entra en picking.</p>}
        {/* A cuenta corriente sin crédito suficiente: no entra en picking (lib/administracion/credito.ts). */}
        {frenoCc && (
          <p className="text-xs mt-1 text-[#C03420] font-semibold">
            Frenado por la cuenta corriente: {frenoCc}. No entra en picking hasta que haya crédito (cobrando, o subiendo el límite en la ficha del cliente).
          </p>
        )}
        {/* Sin pagar: hasta cuándo se guarda el stock (lib/pedidos/reserva.ts); en rojo si vence hoy o mañana. */}
        {vence && (
          <p className={`text-xs mt-1 ${vence.faltan <= 1 ? "text-[#C03420] font-semibold" : "text-[#5C6B76]"}`}>
            Stock reservado hasta el {vence.hasta.split("-").reverse().join("/")} ({vence.faltan <= 0 ? "vence hoy" : vence.faltan === 1 ? "vence mañana" : `faltan ${vence.faltan} días`}).
            Si al terminar ese día sigue sin pagar, se cancela solo.
          </p>
        )}
        {aCobrar && <p className="text-[11px] text-[#5C6B76]">El stock ya está reservado y el pedido entra en picking sin esperar el pago. Se factura cuando confirmás el cobro.</p>}
      </div>
      {pagos.length > 0 && <><h2 className="text-sm font-bold mb-2">Pagos</h2><div className="mb-4">{TablaPagos}</div></>}
    </>
  );
}
