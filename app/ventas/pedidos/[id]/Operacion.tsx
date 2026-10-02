// Bloque "Operación" del detalle de un pedido que no es de Mercado Libre (los
// de ML los mueve ML): confirmar el pago, pasarlo al estado siguiente, avisar
// al cliente por WhatsApp. Y los pagos del pedido (de cualquier canal).

import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { tiendaDelCanal, nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import type { EstadoPedido } from "@/lib/pedidos";
import { PRIMARIO, SUAVE, VERDE, BORRAR } from "@/app/botones";
import { BotonEnviar, BotonConfirmar } from "@/app/radar/Cliente";
import { Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { origen } from "@/app/config/tienda/origen";
import { TIPOS_MEDIO } from "@/app/config/medios-pago/comun";
import { accionConfirmarPago, accionCambiarEstadoPedido } from "./acciones";

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

function mensaje(estado: EstadoPedido, d: { nombre: string | null; pedido: number; tienda: string; seguimiento: string | null; despacho: string | null; pagoPendiente: boolean }) {
  const hola = `¡Hola${d.nombre ? ` ${d.nombre.split(" ")[0]}` : ""}!`;
  const n = `tu pedido #${d.pedido}`;
  const cuerpo: Record<EstadoPedido, string> = {
    nuevo: d.pagoPendiente ? `Recibimos ${n} en ${d.tienda}. Apenas se acredite el pago lo preparamos.` : `Recibimos ${n} en ${d.tienda}.`,
    pagado: `Confirmamos el pago de ${n}. Ya lo estamos preparando.`,
    en_preparacion: `Estamos preparando ${n}.`,
    preparado: `${n.charAt(0).toUpperCase() + n.slice(1)} ya está listo.`,
    despachado: `${n.charAt(0).toUpperCase() + n.slice(1)} ya salió.${d.despacho ? ` Seguimiento: ${d.despacho}.` : ""}`,
    entregado: `${n.charAt(0).toUpperCase() + n.slice(1)} figura entregado. ¡Gracias por tu compra!`,
    cancelado: `${n.charAt(0).toUpperCase() + n.slice(1)} quedó cancelado. Cualquier duda, escribinos.`,
    devuelto: `Registramos la devolución de ${n}.`,
  };
  return [hola, cuerpo[estado], d.seguimiento ? `Podés seguirlo acá: ${d.seguimiento}` : null].filter(Boolean).join(" ");
}

/** Los botones de estado siguiente según el actual (Cancelar va aparte). */
const SIGUIENTES: Partial<Record<EstadoPedido, { estado: EstadoPedido; texto: string; nota?: boolean }[]>> = {
  pagado: [{ estado: "en_preparacion", texto: "En preparación" }, { estado: "preparado", texto: "Preparado" }],
  en_preparacion: [{ estado: "preparado", texto: "Preparado" }],
  preparado: [{ estado: "despachado", texto: "Despachado", nota: true }, { estado: "entregado", texto: "Entregado (retiro)" }],
  despachado: [{ estado: "entregado", texto: "Entregado" }],
};
const CERRADOS: EstadoPedido[] = ["entregado", "cancelado", "devuelto"];

export default async function Operacion({ org, pid, sp }: { org: string; pid: number; sp: { ok?: string; error?: string; b?: string } }) {
  const p = await una<{
    estado: EstadoPedido; estado_pago: string; total_ars: number; medio_pago: string | null; codigo: string | null; canal_id: number; canal_tipo: string;
    cliente: string | null; telefono: string | null; movil: string | null; envio: string | null; envio_tipo: string | null;
  }>(`
    select p.estado, p.estado_pago, p.total_ars::float, p.medio_pago, p.codigo_seguimiento codigo, p.canal_id::int, c.tipo canal_tipo,
           cl.nombre cliente, cl.telefono, cl.telefono_movil movil, me.nombre envio, me.tipo envio_tipo
      from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join metodo_envio me on me.id = p.metodo_envio_id
     where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!p) return null;
  const pagos = await consulta<{ id: number; medio: string; estado: string; importe: number; cuotas: number; detalle: string | null; fecha: Date }>(`
    select id::int, medio, estado, importe_ars::float importe, cuotas, detalle, creado_ts fecha from pago
     where pedido_id = $1 and organizacion_id = $2 order by creado_ts, id`, [pid, org]);
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
    return pagos.length ? <><h2 className="text-sm font-bold mb-2">Pagos</h2><div className="mb-4">{TablaPagos}</div></> : null;
  }

  // Medio para confirmar: el del pago pendiente, o el del pedido; si no, se elige.
  const pendiente = [...pagos].reverse().find((x) => x.estado === "pendiente");
  const medioSugerido = pendiente?.medio ?? p.medio_pago ?? "";
  const activos = await consulta<{ tipo: string; nombre: string }>(
    "select tipo, nombre from medio_pago where organizacion_id = $1 and canal_id is null order by activo desc, orden, id", [org]);
  const opcionesMedio = activos.length ? activos : Object.entries(TIPOS_MEDIO).map(([tipo, t]) => ({ tipo, nombre: t.nombre }));
  if (medioSugerido && !opcionesMedio.some((m) => m.tipo === medioSugerido)) opcionesMedio.unshift({ tipo: medioSugerido, nombre: nombreMedio(medioSugerido) });
  const pagoPendiente = ["pendiente", "a_convenir"].includes(p.estado_pago) && !CERRADOS.includes(p.estado);

  // WhatsApp: con el link de seguimiento si es un pedido de la tienda.
  const tel = telefonoWhatsapp(p.movil) ?? telefonoWhatsapp(p.telefono);
  let wa: string | null = null;
  if (tel) {
    const t = p.canal_tipo === "web_minorista" ? await tiendaDelCanal(org, p.canal_id) : null;
    const seguimiento = t && p.codigo ? `${await origen()}${rutaTienda(t, `/pedido/${p.codigo}`)}` : null;
    const despacho = p.estado === "despachado"
      ? (await una<{ nota: string | null }>("select nota from pedido_estado_historial where pedido_id = $1 and estado_nuevo = 'despachado' order by fecha desc, id desc limit 1", [pid]))?.nota ?? null
      : null;
    const texto = mensaje(p.estado, { nombre: p.cliente, pedido: pid, tienda: t ? nombreTienda(t) : "nuestra tienda", seguimiento, despacho, pagoPendiente: pagoPendiente });
    wa = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  }
  const siguientes = SIGUIENTES[p.estado] ?? [];

  return (
    <>
      <h2 className="text-sm font-bold mb-2">Operación</h2>
      {sp.b === "op" && (sp.ok || sp.error) && (
        <p role={sp.error ? "alert" : undefined} className={`text-xs rounded-lg px-3 py-2 mb-2 ${sp.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>{sp.error ?? sp.ok}</p>
      )}
      <div className={`${CAJA} mb-4 grid gap-3`}>
        {p.envio && <p className="text-xs"><span className="text-[#5C6B76]">Entrega:</span> {p.envio}</p>}
        {pagoPendiente && (
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
            {!CERRADOS.includes(p.estado) && (
              <BotonConfirmar accion={accionCambiarEstadoPedido} campos={{ pedido_id: String(pid), estado: "cancelado" }} clase={BORRAR}
                texto="Cancelar pedido" pregunta="¿Cancelar el pedido? Libera el stock reservado." corriendo="Cancelando…" />
            )}
          </div>
        )}
        {p.estado === "nuevo" && pagoPendiente && <p className="text-[11px] text-[#5C6B76]">Al confirmar el pago pasa a Pagado y se reserva el stock.</p>}
        <div>
          {wa
            ? <a href={wa} target="_blank" rel="noopener" className={SUAVE}>Avisar por WhatsApp</a>
            : <span className="text-[11px] text-[#5C6B76]">El cliente no tiene teléfono cargado: no se le puede avisar por WhatsApp.</span>}
        </div>
      </div>
      {pagos.length > 0 && <><h2 className="text-sm font-bold mb-2">Pagos</h2><div className="mb-4">{TablaPagos}</div></>}
    </>
  );
}
