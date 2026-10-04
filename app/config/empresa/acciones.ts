"use server";

// Configuración → Empresa: los datos generales (tabla `empresa`). Los fiscales
// de cada CUIT (tabla `emisor`) se cargan en Configuración → Razones sociales;
// el ambiente de ARCA y la facturación automática, en Configuración → Facturación (ARCA).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";

const VOLVER = "/config/empresa";
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
