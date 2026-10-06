// Imprime etiqueta + hoja de preparación de cada pedido, en un solo PDF
// (lib/deposito/hojas.ts). Lo abren en otra pestaña:
//   - Picking: ?p=<pedido,…>  (los tildados; entran en un lote nuevo)
//   - Ventas → Envíos: ?desde=envios&ids=<envío,…>
//   - La pantalla de un lote: ?lote=<id> (reimprimir; con &p=… sólo esos)
//   - Empacar: ?lote=<id>&p=<pedido>&solo=etiqueta (sólo su etiqueta)
// y &tam=10x15|a4 (queda en una cookie). Imprimir marca la etiqueta impresa
// y, la segunda vez, la hoja sale con "REIMPRESIÓN". Los errores van en
// texto llano (es lo que se ve en esa pestaña).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta, motivoErp } from "@/lib/erp/base";
import { exigirCarritoLibre } from "@/lib/pedidos";
import { prepararImpresion, marcarImpreso } from "@/lib/deposito/picking";
import { etiquetaOca } from "@/lib/oca/envios";
import { datosHojas, armarPdf, bajarEtiquetaMlDe, esTamHoja, COOKIE_TAM } from "@/lib/deposito/hojas";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const numeros = (p: URLSearchParams, k: string) =>
  [...new Set(p.getAll(k).flatMap((x) => x.split(",")).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

export async function GET(req: Request) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para imprimir.", 401);
  if (!tienePermiso(sesion.permisos, "picking_ver") && !tienePermiso(sesion.permisos, "envios_ver")) return texto("No tenés permiso para imprimir etiquetas.", 403);
  const org = sesion.org.id;
  const p = new URL(req.url).searchParams;
  const tam = esTamHoja(p.get("tam")) ? p.get("tam")! as "10x15" | "a4" : "10x15";
  const lote = Number(p.get("lote")) || 0;
  const soloEtiqueta = p.get("solo") === "etiqueta";

  try {
    let pedidos: number[];
    if (lote) {
      const delLote = (await consulta<{ pedido_id: number }>("select pedido_id::int from picking_pedido where lote_id = $1 and organizacion_id = $2", [lote, org])).map((x) => x.pedido_id);
      const elegidos = numeros(p, "p");
      pedidos = elegidos.length ? delLote.filter((x) => elegidos.includes(x)) : delLote;
      if (!pedidos.length) return texto("Ese lote no tiene esos pedidos.", 400);
      try { await exigirCarritoLibre(org, pedidos); } catch (e) { return texto(motivoErp(e), 409); }
    } else {
      if (p.get("desde") === "envios") {
        const envios = numeros(p, "ids");
        if (!envios.length) return texto("No tildaste ningún envío. Volvé a la pantalla de envíos y elegí cuáles imprimir.", 400);
        pedidos = [...new Set((await consulta<{ pedido_id: number | null }>(
          "select pedido_id::int from envio where organizacion_id = $1 and id = any($2::bigint[]) and coalesce(logistica, '') <> 'fulfillment'", [org, envios]))
          .map((e) => e.pedido_id).filter((x): x is number => !!x))];
        if (!pedidos.length) return texto("Esos envíos no tienen pedido (o son de Full, que no lleva etiqueta).", 400);
      } else {
        pedidos = numeros(p, "p");
        if (!pedidos.length) return texto("No tildaste ningún pedido. Volvé a la pantalla y elegí cuáles imprimir.", 400);
      }
      // Los que todavía no están en un lote entran en uno (en preparación).
      try { await prepararImpresion(org, pedidos, sesion.usuario.id); } catch (e) { return texto(motivoErp(e), 409); }
    }

    const hojas = await datosHojas(org, pedidos);
    const { pdf } = await armarPdf(hojas, { tam, soloEtiqueta, bajarEtiquetaMl: bajarEtiquetaMlDe(org), bajarEtiquetaOca: (envioId) => etiquetaOca(org, envioId) });
    await marcarImpreso(org, pedidos);

    const nombre = `${soloEtiqueta ? "etiqueta" : "etiquetas-y-hojas"}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${nombre}"`,
        "cache-control": "no-store",
        // El tamaño elegido queda para la próxima.
        "set-cookie": `${COOKIE_TAM}=${tam}; Path=/; Max-Age=31536000; SameSite=Lax`,
      },
    });
  } catch (e) {
    return texto(motivoErp(e), 500);
  }
}
