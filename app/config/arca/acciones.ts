"use server";

// Facturación electrónica (ARCA): el trámite del permiso (Laucen genera la
// clave y el pedido CSR → se lleva a ARCA → se trae el certificado), la
// prueba de conexión y la facturación automática, de cada razón social (`rs`;
// sin elegir, la principal). Los datos fiscales se cargan en Configuración → Razones sociales.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero } from "@/lib/erp/acciones";
import { cuitDelFormulario } from "@/lib/cuit";
import { emisorDe, sqlEmisorDePedido } from "@/lib/arca/facturar";
import { generarCsr, guardarCertificado, type Ambiente } from "@/lib/arca/credenciales";
import { ultimoAutorizado } from "@/lib/arca/wsfe";
import { ESTADOS_PEDIDO } from "@/lib/pedidos";

const VOLVER = "/config/arca";
const ESTADOS_AL = ["pagado", "preparado", "despachado"];
const fechaAR = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

/** La razón social sobre la que se hace el trámite: la del formulario (`rs`) o, sin elegir, la principal. */
async function emisorRequerido(org: string, fd?: FormData) {
  const rs = fd ? Number(fd.get("rs")) || null : null;
  const e = await emisorDe(org, rs);
  if (!e) throw new ErrorErp("Primero cargá la razón social (CUIT, condición de IVA y punto de venta) en Configuración → Razones sociales.");
  return e;
}
const volverA = (fd: FormData) => { const rs = Number(fd.get("rs")); return rs ? `${VOLVER}?rs=${rs}` : VOLVER; };

const ambienteDe = (fd: FormData): Ambiente => fd.get("ambiente") === "homologacion" ? "homologacion" : "produccion";

/** Paso 1: con la razón social, el CUIT y el punto de venta de la razón social
 *  genera la clave y el pedido. La clave queda en el servidor; lo que se baja
 *  es sólo el pedido. Los datos fiscales se corrigen en Razones sociales. */
export async function accionPrepararTramite(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    await generarCsr(e.id, ambienteDe(fd), e.cuit, e.razon_social);
    revalidatePath(VOLVER);
    return "Listo, ya tenés el archivo del trámite. Seguí los pasos.";
  });
}

/** Paso 3: el certificado que devolvió ARCA. El emisor queda en el ambiente del trámite. */
export async function accionConectar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    const ambiente = ambienteDe(fd);
    const pem = texto(fd, "certificado");
    if (!pem) throw new ErrorErp("Falta el permiso de ARCA: elegí el archivo que te devolvieron o pegá su contenido.");
    const vence = await guardarCertificado(e.id, ambiente, pem);
    await consulta("update emisor set ambiente = $2, actualizado_ts = now() where id = $1 and ambiente <> $2", [e.id, ambiente]);
    revalidatePath(VOLVER);
    return `Listo, quedó conectado. El permiso vale hasta el ${fechaAR(vence)}.`;
  });
}

/** Borra la clave y el certificado del ambiente en uso. Los comprobantes ya
 *  emitidos quedan; la facturación automática se apaga. */
export async function accionDesconectar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    await enTransaccion(async (c) => {
      await c.query("delete from arca_credencial where emisor_id = $1 and ambiente = $2", [e.id, e.ambiente]);
      await c.query("delete from arca_ticket where emisor_id = $1 and ambiente = $2", [e.id, e.ambiente]);
      await c.query("update emisor set facturar_automatico = false, actualizado_ts = now() where id = $1", [e.id]);
    });
    revalidatePath(VOLVER);
    return "Listo, se desconectó. Los comprobantes que ya emitiste siguen donde estaban.";
  });
}

/** Prende o apaga la facturación automática. Al prenderla, los cambios de
 *  estado que ya habían pasado se marcan como vistos: sólo se factura lo que
 *  llegue de ahora en adelante (si no, saldrían de golpe facturas de pedidos viejos). */
export async function accionFacturarAutomatico(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    const prender = fd.get("valor") === "1";
    if (!prender) {
      await consulta("update emisor set facturar_automatico = false, actualizado_ts = now() where id = $1", [e.id]);
      revalidatePath(VOLVER);
      return "Facturación automática apagada.";
    }
    const viejos = await enTransaccion(async (c) => {
      await c.query("update emisor set facturar_automatico = true, actualizado_ts = now() where id = $1", [e.id]);
      // Sólo los eventos de pedidos que esta razón social atiende (los de otra no se tocan).
      const r = await c.query(`update evento set procesado_ts = now(), procesado_por = 'facturacion'
                                where organizacion_id = $1 and tipo = 'pedido_estado_cambiado' and procesado_ts is null
                                  and exists (select 1 from pedido pe where pe.id = (evento.payload ->> 'pedido_id')::bigint and ${sqlEmisorDePedido("pe")} = $2)`,
        [s.org.id, e.id]);
      return r.rowCount ?? 0;
    });
    revalidatePath(VOLVER);
    const estado = ESTADOS_PEDIDO[e.facturar_al as keyof typeof ESTADOS_PEDIDO] ?? e.facturar_al;
    return `Facturación automática prendida: se facturan los pedidos que lleguen a "${estado}" de ahora en adelante.` +
      (viejos ? ` Los ${viejos} cambios de estado anteriores quedaron como vistos (los pedidos viejos no se facturan solos).` : "");
  });
}

export async function accionFacturarAl(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    const al = String(fd.get("facturar_al"));
    if (!ESTADOS_AL.includes(al)) throw new ErrorErp("Elegí en qué estado del pedido se factura.");
    await consulta("update emisor set facturar_al = $2, actualizado_ts = now() where id = $1", [e.id, al]);
    revalidatePath(VOLVER);
    return `Guardado: se factura al llegar el pedido a "${ESTADOS_PEDIDO[al as keyof typeof ESTADOS_PEDIDO] ?? al}".`;
  });
}

/** Pide a ARCA el último número autorizado: si contesta, el certificado, los
 *  servicios y el punto de venta están bien. */
export async function accionProbarConexion(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(volverA(fd), async () => {
    const e = await emisorRequerido(s.org.id, fd);
    const cred = await una("select 1 from arca_credencial where emisor_id = $1 and ambiente = $2 and certificado is not null", [e.id, e.ambiente]);
    if (!cred) throw new ErrorErp("Todavía no está conectado: falta el permiso de ARCA.");
    // Factura B si es responsable inscripto; C si es monotributo o exento (no emite B).
    const tipo = e.condicion_iva === "responsable_inscripto" ? 6 : 11;
    const n = await ultimoAutorizado(e.id, e.ambiente, e.cuit, e.punto_venta, tipo);
    return `ARCA contesta: el último número de factura ${tipo === 6 ? "B" : "C"} del punto de venta ${e.punto_venta} es ${n}.`;
  });
}
