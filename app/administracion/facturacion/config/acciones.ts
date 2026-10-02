"use server";

// Configuración de facturación: datos del emisor, facturación automática y
// el certificado de ARCA (CSR → certificado → prueba de conexión).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero } from "@/lib/erp/acciones";
import { normalizarCuit } from "@/lib/clientes";
import { emisorDe } from "@/lib/arca/facturar";
import { generarCsr, guardarCertificado } from "@/lib/arca/credenciales";
import { ultimoAutorizado } from "@/lib/arca/wsfe";
import { ESTADOS_PEDIDO } from "@/lib/pedidos";

const VOLVER = "/administracion/facturacion/config";
const CONDICIONES = ["responsable_inscripto", "monotributo", "exento"];
const ESTADOS_AL = ["pagado", "preparado", "despachado"];

async function emisorRequerido(org: string) {
  const e = await emisorDe(org);
  if (!e) throw new ErrorErp("Primero guardá los datos del emisor (CUIT y razón social).");
  return e;
}

export async function accionGuardarEmisor(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const cuit = normalizarCuit(texto(fd, "cuit"));
    if (!cuit) throw new ErrorErp("El CUIT tiene que tener 11 dígitos.");
    const razon = texto(fd, "razon_social");
    if (!razon) throw new ErrorErp("Falta la razón social.");
    const condicion = CONDICIONES.includes(String(fd.get("condicion_iva"))) ? String(fd.get("condicion_iva")) : "responsable_inscripto";
    const pv = entero(fd, "punto_venta");
    if (!pv || pv < 1 || pv > 99998) throw new ErrorErp("El punto de venta es un número entre 1 y 99998.");
    const ambiente = fd.get("ambiente") === "produccion" ? "produccion" : "homologacion";
    const al = ESTADOS_AL.includes(String(fd.get("facturar_al"))) ? String(fd.get("facturar_al")) : "preparado";
    const inicio = texto(fd, "inicio_actividades");
    if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new ErrorErp("La fecha de inicio de actividades no se pudo leer.");
    await consulta(`
      insert into emisor (organizacion_id, cuit, razon_social, condicion_iva, domicilio, iibb, inicio_actividades, punto_venta, ambiente, facturar_al)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (organizacion_id) do update set cuit = excluded.cuit, razon_social = excluded.razon_social, condicion_iva = excluded.condicion_iva,
        domicilio = excluded.domicilio, iibb = excluded.iibb, inicio_actividades = excluded.inicio_actividades, punto_venta = excluded.punto_venta,
        ambiente = excluded.ambiente, facturar_al = excluded.facturar_al, actualizado_ts = now()`,
      [s.org.id, cuit, razon, condicion, texto(fd, "domicilio"), texto(fd, "iibb"), inicio, pv, ambiente, al]);
    revalidatePath(VOLVER);
    return "Guardado.";
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

export async function accionGenerarCsr() {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    await generarCsr(s.org.id, e.ambiente, e.cuit, e.razon_social);
    revalidatePath(VOLVER);
    return "Pedido de certificado generado. Seguí los pasos de abajo.";
  });
}

export async function accionGuardarCertificado(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    const pem = texto(fd, "certificado");
    if (!pem) throw new ErrorErp("Pegá el certificado (o elegí el archivo .crt).");
    const vence = await guardarCertificado(s.org.id, e.ambiente, pem);
    revalidatePath(VOLVER);
    return `Certificado guardado. Vale hasta el ${vence.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`;
  });
}

/** Pide a ARCA el último número autorizado: si contesta, el certificado, los
 *  servicios y el punto de venta están bien. */
export async function accionProbarConexion() {
  const s = await entrarErp("facturacion_ver");
  await intentar(VOLVER, async () => {
    const e = await emisorRequerido(s.org.id);
    const cred = await una("select 1 from arca_credencial where organizacion_id = $1 and ambiente = $2 and certificado is not null", [s.org.id, e.ambiente]);
    if (!cred) throw new ErrorErp("Todavía no hay certificado para este ambiente.");
    // Factura B si es responsable inscripto; C si es monotributo o exento (no emite B).
    const tipo = e.condicion_iva === "responsable_inscripto" ? 6 : 11;
    const n = await ultimoAutorizado(s.org.id, e.ambiente, e.cuit, e.punto_venta, tipo);
    return `Conecta: último número de factura ${tipo === 6 ? "B" : "C"} del punto de venta ${e.punto_venta}: ${n}.`;
  });
}
