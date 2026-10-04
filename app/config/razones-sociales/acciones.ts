"use server";

// Configuración → Razones sociales: los CUIT con los que opera la organización
// (tabla `emisor`). El stock, el catálogo, los clientes y los proveedores son
// de toda la organización; cada razón social lleva su ARCA, sus facturas, su
// libro de IVA, sus cuentas corrientes y sus fondos. La principal factura todo
// lo que no sale de una cuenta de Mercado Libre con razón social propia.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";
import { cuitDelFormulario } from "@/lib/cuit";

const VOLVER = "/config/razones-sociales";
const CONDICIONES = ["responsable_inscripto", "monotributo", "exento"];

function datos(fd: FormData) {
  const razon = texto(fd, "razon_social");
  if (!razon) throw new ErrorErp("Falta la razón social, como figura en ARCA.");
  const cuit = cuitDelFormulario(texto(fd, "cuit"));
  const condicion = CONDICIONES.includes(String(fd.get("condicion_iva"))) ? String(fd.get("condicion_iva")) : "responsable_inscripto";
  const pv = entero(fd, "punto_venta");
  if (!pv || pv < 1 || pv > 99998) throw new ErrorErp("El punto de venta es un número entre 1 y 99998.");
  const inicio = texto(fd, "inicio_actividades");
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new ErrorErp("La fecha de inicio de actividades no se pudo leer.");
  return { razon, cuit, condicion, pv, inicio, nombre: texto(fd, "nombre") ?? razon, domicilio: texto(fd, "domicilio"), iibb: texto(fd, "iibb") };
}

export async function accionCrearRazonSocial(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const d = datos(fd);
    const ya = await una("select 1 from emisor where organizacion_id = $1 and cuit = $2", [s.org.id, d.cuit]);
    if (ya) throw new ErrorErp("Ya hay una razón social con ese CUIT.");
    await enTransaccion(async (c) => {
      const hay = (await c.query("select 1 from emisor where organizacion_id = $1", [s.org.id])).rowCount;
      await c.query(`
        insert into emisor (organizacion_id, nombre, cuit, razon_social, condicion_iva, domicilio, iibb, inicio_actividades, punto_venta, es_principal)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [s.org.id, d.nombre, d.cuit, d.razon, d.condicion, d.domicilio, d.iibb, d.inicio, d.pv, !hay]);
      // La primera razón social toma lo que ya estaba cargado sin dueño (compras, cuentas, asientos…).
      if (!hay) {
        for (const t of TABLAS_CON_EMISOR) {
          await c.query(`update ${t} set emisor_id = emisor_principal(organizacion_id) where organizacion_id = $1 and emisor_id is null`, [s.org.id]);
        }
      }
    });
    revalidatePath(VOLVER);
    return "Razón social creada. Para facturar con ella, conectala con ARCA en Configuración → Facturación (ARCA).";
  });
}

export async function accionGuardarRazonSocial(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const d = datos(fd);
    const antes = await una<{ cuit: string }>("select cuit from emisor where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    if (!antes) throw new ErrorErp("La razón social no existe.");
    const otra = await una("select 1 from emisor where organizacion_id = $1 and cuit = $2 and id <> $3", [s.org.id, d.cuit, id(fd)]);
    if (otra) throw new ErrorErp("Ya hay otra razón social con ese CUIT.");
    await consulta(`
      update emisor set nombre = $3, cuit = $4, razon_social = $5, condicion_iva = $6, domicilio = $7, iibb = $8, inicio_actividades = $9,
             punto_venta = $10, actualizado_ts = now() where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), d.nombre, d.cuit, d.razon, d.condicion, d.domicilio, d.iibb, d.inicio, d.pv]);
    revalidatePath(VOLVER);
    // El permiso de ARCA es de un CUIT: si cambió y estaba conectado, avisar.
    if (antes.cuit.replace(/\D/g, "") !== d.cuit) {
      const conectado = await una("select 1 from arca_credencial where emisor_id = $1 and certificado is not null", [id(fd)]);
      if (conectado) return "Guardado. Ojo: cambiaste el CUIT y el permiso de ARCA es del anterior; hacé el trámite de nuevo en Configuración → Facturación (ARCA).";
    }
    return "Guardado.";
  });
}

/** Pasa la razón social a principal: la que factura lo que no es de una cuenta de ML con la suya. */
export async function accionHacerPrincipal(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    await enTransaccion(async (c) => {
      const e = await c.query("select 1 from emisor where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
      if (!e.rowCount) throw new ErrorErp("La razón social no existe.");
      await c.query("update emisor set es_principal = false where organizacion_id = $1 and es_principal", [s.org.id]);
      await c.query("update emisor set es_principal = true, actualizado_ts = now() where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    });
    revalidatePath(VOLVER);
    return "Listo: ahora es la principal. Lo que se factura de ahora en adelante por los canales sin razón social propia sale con ella.";
  });
}

const TABLAS_CON_EMISOR = ["comprobante", "factura_compra", "despacho_importacion", "cc_movimiento", "cuenta_fondos", "recibo", "asiento", "arca_mc_lote"];

export async function accionBorrarRazonSocial(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const e = await una<{ es_principal: boolean }>("select es_principal from emisor where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    if (!e) throw new ErrorErp("La razón social no existe.");
    if (e.es_principal) throw new ErrorErp("La principal no se borra: primero elegí otra como principal.");
    for (const t of TABLAS_CON_EMISOR) {
      const n = (await una<{ n: number }>(`select count(*)::int n from ${t} where emisor_id = $1`, [id(fd)]))?.n ?? 0;
      if (n > 0) throw new ErrorErp("Tiene facturas, compras, cuentas o asientos a su nombre: no se puede borrar.");
    }
    // Sus credenciales de ARCA se van con ella; los canales que la usaban vuelven a la principal.
    await consulta("delete from emisor where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(VOLVER);
    return "Razón social borrada.";
  });
}
