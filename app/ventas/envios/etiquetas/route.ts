// Baja las etiquetas de los envíos tildados (PDF o ZPL para la térmica) y
// las marca como impresas. Lo abre en otra pestaña el formulario de
// /ventas/envios: ?ids=<envio.id,…>&formato=pdf|zpl2. Los errores van en
// texto llano (es lo que se ve en esa pestaña).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta, motivoErp } from "@/lib/erp/base";
import { exigirCarritoLibre } from "@/lib/pedidos";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { bajarEtiquetas } from "@/lib/mercadolibre/envios";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para imprimir etiquetas.", 401);
  if (!tienePermiso(sesion.permisos, "envios_ver")) return texto("No tenés permiso para ver envíos.", 403);
  const org = sesion.org.id;

  const p = new URL(req.url).searchParams;
  // Llegan como ?ids=1,2,3 o como ?ids=1&ids=2 (las casillas del formulario).
  const ids = [...new Set(p.getAll("ids").flatMap((x) => x.split(",")).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const formato = p.get("formato") === "zpl2" ? "zpl2" : "pdf";
  if (ids.length === 0) return texto("No tildaste ningún envío. Volvé a la pantalla de envíos y elegí cuáles imprimir.", 400);

  try {
    const envios = await consulta<{ id: string; canal_id: string | null; id_externo: string | null; logistica: string | null; pedido_id: string | null }>(
      "select id, canal_id, id_externo, logistica, pedido_id from envio where organizacion_id = $1 and id = any($2::bigint[])", [org, ids]);
    // Un carrito de ML en espera (le puede llegar otro ítem) no se etiqueta todavía.
    const pedidos = [...new Set(envios.map((e) => Number(e.pedido_id)).filter((n) => n > 0))];
    try { await exigirCarritoLibre(org, pedidos); } catch (e) { return texto(motivoErp(e), 409); }
    const conEtiqueta = envios.filter((e) => e.id_externo && e.logistica !== "fulfillment" && e.canal_id);
    if (conEtiqueta.length === 0) return texto("Ninguno de esos envíos tiene etiqueta para imprimir (los de Full no llevan).", 400);
    const canales = [...new Set(conEtiqueta.map((e) => e.canal_id!))];
    if (canales.length > 1) {
      return texto("Tildaste envíos de varias cuentas de Mercado Libre. Imprimí de a una cuenta por vez (filtrá por canal).", 400);
    }
    const cuenta = await cuentaDelCanal(org, Number(canales[0]));
    if (!cuenta) return texto("Ese canal no tiene una cuenta de Mercado Libre conectada.", 400);

    const r = await bajarEtiquetas(cuenta, conEtiqueta.map((e) => e.id_externo!), formato);
    if (!r.ok) return texto(r.motivo, 422);

    await consulta("update envio set etiqueta_impresa_ts = now(), actualizado_ts = now() where organizacion_id = $1 and id = any($2::bigint[])",
      [org, conEtiqueta.map((e) => Number(e.id))]);

    const esPdf = r.tipo.includes("pdf");
    const nombre = `etiquetas-${new Date().toISOString().slice(0, 10)}.${esPdf ? "pdf" : r.tipo.includes("zip") ? "zip" : "txt"}`;
    return new Response(r.datos, {
      headers: {
        "content-type": r.tipo,
        // El PDF se abre en la pestaña; el ZPL se baja para mandarlo a la térmica.
        "content-disposition": `${esPdf ? "inline" : "attachment"}; filename="${nombre}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return texto(motivoErp(e), 500);
  }
}
