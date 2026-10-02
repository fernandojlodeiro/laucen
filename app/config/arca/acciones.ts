"use server";

// Facturación electrónica (ARCA): el trámite del permiso (Laucen genera la
// clave y el pedido CSR → se lleva a ARCA → se trae el certificado), la
// prueba de conexión y la facturación automática. Los datos fiscales del
// emisor se cargan en Configuración → Empresa.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero } from "@/lib/erp/acciones";
import { cuitDelFormulario } from "@/lib/cuit";
import { emisorDe } from "@/lib/arca/facturar";
import { generarCsr, guardarCertificado, type Ambiente } from "@/lib/arca/credenciales";
import { ultimoAutorizado } from "@/lib/arca/wsfe";
import { ESTADOS_PEDIDO } from "@/lib/pedidos";

const VOLVER = "/config/arca";
const ESTADOS_AL = ["pagado", "preparado", "despachado"];
const fechaAR = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

async function emisorRequerido(org: string) {
  const e = await emisorDe(org);
  if (!e) throw new ErrorErp("Primero cargá los datos fiscales (CUIT y razón social) en Configuración → Empresa.");
  return e;
}

const ambienteDe = (fd: FormData): Ambiente => fd.get("ambiente") === "homologacion" ? "homologacion" : "produccion";

/** Paso 1: con razón social, CUIT y punto de venta (los del emisor, o los que
 *  se cargan acá si todavía no hay emisor) genera la clave y el pedido. La
 *  clave queda en el servidor; lo que se baja es sólo el pedido. */
export async function accionPrepararTramite(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const ambiente = ambienteDe(fd);
    const razon = texto(fd, "razon_social");
    if (!razon) throw new ErrorErp("Falta la razón social, como figura en ARCA.");
    const cuit = cuitDelFormulario(texto(fd, "cuit"));
    const pv = entero(fd, "punto_venta");
    if (!pv || pv < 1 || pv > 99998) throw new ErrorErp("El punto de venta es un número entre 1 y 99998, el que te asignó ARCA.");
    // Si no hay emisor, nace en el ambiente del trámite. Si ya hay, se corrigen
    // los tres datos pero el ambiente no se toca hasta conectar (lo que ya
    // factura sigue facturando mientras se hace el trámite).
    await consulta(`
      insert into emisor (organizacion_id, cuit, razon_social, punto_venta, ambiente) values ($1, $2, $3, $4, $5)
      on conflict (organizacion_id) do update set cuit = excluded.cuit, razon_social = excluded.razon_social,
        punto_venta = excluded.punto_venta, actualizado_ts = now()`,
      [s.org.id, cuit, razon, pv, ambiente]);
    await generarCsr(s.org.id, ambiente, cuit, razon);
    revalidatePath(VOLVER);
    return "Listo, ya tenés el archivo del trámite. Seguí los pasos.";
  });
}

/** Paso 3: el certificado que devolvió ARCA. El emisor queda en el ambiente del trámite. */
export async function accionConectar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    await emisorRequerido(s.org.id);
    const ambiente = ambienteDe(fd);
    const pem = texto(fd, "certificado");
    if (!pem) throw new ErrorErp("Falta el permiso de ARCA: elegí el archivo que te devolvieron o pegá su contenido.");
    const vence = await guardarCertificado(s.org.id, ambiente, pem);
    await consulta("update emisor set ambiente = $2, actualizado_ts = now() where organizacion_id = $1 and ambiente <> $2", [s.org.id, ambiente]);
    revalidatePath(VOLVER);
    return `Listo, quedó conectado. El permiso vale hasta el ${fechaAR(vence)}.`;
  });
}

/** Borra la clave y el certificado del ambiente en uso. Los comprobantes ya
 *  emitidos quedan; la facturación automática se apaga. */
export async function accionDesconectar() {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    await enTransaccion(async (c) => {
      await c.query("delete from arca_credencial where organizacion_id = $1 and ambiente = $2", [s.org.id, e.ambiente]);
      await c.query("delete from arca_ticket where organizacion_id = $1 and ambiente = $2", [s.org.id, e.ambiente]);
      await c.query("update emisor set facturar_automatico = false, actualizado_ts = now() where organizacion_id = $1", [s.org.id]);
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
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    const prender = fd.get("valor") === "1";
    if (!prender) {
      await consulta("update emisor set facturar_automatico = false, actualizado_ts = now() where organizacion_id = $1", [s.org.id]);
      revalidatePath(VOLVER);
      return "Facturación automática apagada.";
    }
    const viejos = await enTransaccion(async (c) => {
      await c.query("update emisor set facturar_automatico = true, actualizado_ts = now() where organizacion_id = $1", [s.org.id]);
      const r = await c.query(`update evento set procesado_ts = now(), procesado_por = 'facturacion'
                                where organizacion_id = $1 and tipo = 'pedido_estado_cambiado' and procesado_ts is null`, [s.org.id]);
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
  await intentar(VOLVER, async () => {
    await emisorRequerido(s.org.id);
    const al = String(fd.get("facturar_al"));
    if (!ESTADOS_AL.includes(al)) throw new ErrorErp("Elegí en qué estado del pedido se factura.");
    await consulta("update emisor set facturar_al = $2, actualizado_ts = now() where organizacion_id = $1", [s.org.id, al]);
    revalidatePath(VOLVER);
    return `Guardado: se factura al llegar el pedido a "${ESTADOS_PEDIDO[al as keyof typeof ESTADOS_PEDIDO] ?? al}".`;
  });
}

/** Pide a ARCA el último número autorizado: si contesta, el certificado, los
 *  servicios y el punto de venta están bien. */
export async function accionProbarConexion() {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    const cred = await una("select 1 from arca_credencial where organizacion_id = $1 and ambiente = $2 and certificado is not null", [s.org.id, e.ambiente]);
    if (!cred) throw new ErrorErp("Todavía no está conectado: falta el permiso de ARCA.");
    // Factura B si es responsable inscripto; C si es monotributo o exento (no emite B).
    const tipo = e.condicion_iva === "responsable_inscripto" ? 6 : 11;
    const n = await ultimoAutorizado(s.org.id, e.ambiente, e.cuit, e.punto_venta, tipo);
    return `ARCA contesta: el último número de factura ${tipo === 6 ? "B" : "C"} del punto de venta ${e.punto_venta} es ${n}.`;
  });
}
