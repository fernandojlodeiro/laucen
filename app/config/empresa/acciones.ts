"use server";

// Configuración → Empresa: los datos generales (tabla `empresa`) y los
// fiscales de quien factura (tabla `emisor`). El ambiente de ARCA y la
// facturación automática se manejan en Configuración → Facturación (ARCA).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero } from "@/lib/erp/acciones";
import { cuitDelFormulario } from "@/lib/cuit";

const VOLVER = "/config/empresa";
const CONDICIONES = ["responsable_inscripto", "monotributo", "exento"];
const CLAVES = ["nombre_fantasia", "logo", "email", "telefono", "whatsapp", "web", "direccion", "localidad", "provincia", "codigo_postal"] as const;

export async function accionGuardarEmpresa(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const v: Record<string, string | null> = {};
    for (const k of CLAVES) v[k] = texto(fd, k);
    if (v.logo && !/^https:\/\//.test(v.logo)) v.logo = null;
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new ErrorErp("El mail no parece válido.");
    if (v.whatsapp) {
      v.whatsapp = v.whatsapp.replace(/\D/g, "");
      if (v.whatsapp.length < 10 || v.whatsapp.length > 15) throw new ErrorErp("El WhatsApp va en formato internacional, sólo números (ej. 5493511234567).");
    }
    if (v.web && !/^https?:\/\//i.test(v.web)) v.web = `https://${v.web}`;
    await consulta(`
      insert into empresa (organizacion_id, ${CLAVES.join(", ")}) values ($1, ${CLAVES.map((_, i) => `$${i + 2}`).join(", ")})
      on conflict (organizacion_id) do update set ${CLAVES.map((k) => `${k} = excluded.${k}`).join(", ")}, actualizado_ts = now()`,
      [s.org.id, ...CLAVES.map((k) => v[k])]);
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

/** Datos fiscales del emisor. No toca el ambiente ni la facturación automática. */
export async function accionGuardarFiscal(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const cuit = cuitDelFormulario(texto(fd, "cuit"));
    const razon = texto(fd, "razon_social");
    if (!razon) throw new ErrorErp("Falta la razón social.");
    const condicion = CONDICIONES.includes(String(fd.get("condicion_iva"))) ? String(fd.get("condicion_iva")) : "responsable_inscripto";
    const pv = entero(fd, "punto_venta");
    if (!pv || pv < 1 || pv > 99998) throw new ErrorErp("El punto de venta es un número entre 1 y 99998.");
    const inicio = texto(fd, "inicio_actividades");
    if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new ErrorErp("La fecha de inicio de actividades no se pudo leer.");
    const antes = await una<{ cuit: string; ambiente: string }>("select cuit, ambiente from emisor where organizacion_id = $1", [s.org.id]);
    await consulta(`
      insert into emisor (organizacion_id, cuit, razon_social, condicion_iva, domicilio, iibb, inicio_actividades, punto_venta)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (organizacion_id) do update set cuit = excluded.cuit, razon_social = excluded.razon_social, condicion_iva = excluded.condicion_iva,
        domicilio = excluded.domicilio, iibb = excluded.iibb, inicio_actividades = excluded.inicio_actividades, punto_venta = excluded.punto_venta,
        actualizado_ts = now()`,
      [s.org.id, cuit, razon, condicion, texto(fd, "domicilio"), texto(fd, "iibb"), inicio, pv]);
    revalidatePath(VOLVER);
    // El permiso de ARCA es de un CUIT: si cambió y estaba conectado, avisar.
    if (antes && antes.cuit.replace(/\D/g, "") !== cuit) {
      const conectado = await una("select 1 from arca_credencial where organizacion_id = $1 and ambiente = $2 and certificado is not null", [s.org.id, antes.ambiente]);
      if (conectado) return "Guardado. Ojo: cambiaste el CUIT y el permiso de ARCA es del anterior; hacé el trámite de nuevo en Configuración → Facturación (ARCA).";
    }
    return "Guardado.";
  });
}
