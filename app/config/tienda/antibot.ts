"use server";

// Claves de Cloudflare Turnstile del antibot de la tienda (tienda_antibot, lib/tienda/antibot.ts).
// La secreta nunca vuelve a la pantalla: vacía = queda la que estaba.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";

export async function accionGuardarTurnstile(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar("/config/tienda", async () => {
    const quitar = fd.get("quitar") === "1";
    const site = texto(fd, "site_key"), secreta = texto(fd, "secret_key");
    if (quitar) {
      await consulta("update tienda_antibot set site_key = null, secret_key = null, actualizado_ts = now() where organizacion_id = $1", [s.org.id]);
      revalidatePath("/config/tienda");
      return "Turnstile apagado: siguen el campo trampa, el tiempo mínimo y el límite por conexión.";
    }
    if (!site || !/^[\w-]{10,100}$/.test(site)) throw new ErrorErp("Pegá la clave del sitio (Site Key) tal cual la da Cloudflare.");
    if (secreta && !/^[\w-]{10,200}$/.test(secreta)) throw new ErrorErp("La clave secreta no parece bien copiada.");
    await consulta(`insert into tienda_antibot (organizacion_id, site_key, secret_key) values ($1, $2, $3)
                    on conflict (organizacion_id) do update set site_key = excluded.site_key,
                      secret_key = coalesce(excluded.secret_key, tienda_antibot.secret_key), actualizado_ts = now()`, [s.org.id, site, secreta]);
    revalidatePath("/config/tienda");
    return "Claves de Turnstile grabadas.";
  });
}
