// Publicidad: después de cada lectura se guarda el veredicto de cada producto
// (pub_veredicto) y, si alguno pasó a CORTAR, se avisa de una forma que no se
// pase por alto: aviso de Windows (o del celular) a quien tenga el permiso, y
// cartel rojo arriba de Dashboard › Para hacer (según la config). Mientras
// siga en CORTAR, el aviso se repite cada `avisoRepetirHoras` (0 = no).

import { consulta } from "@/lib/erp/base";
import { configPublicidad } from "@/lib/publicidad/config";
import { veredictos, type FilaProducto } from "@/lib/publicidad/veredicto";
import { avisarOrg } from "@/lib/avisos-push";

export const PANTALLA = "/ventas/publicidad";

export async function guardarYAvisar(org: string): Promise<{ productos: number; cortar: number; avisados: number }> {
  const cfg = await configPublicidad(org);
  const filas = await veredictos(org, cfg);
  const previos = new Map((await consulta<{ clave: string; veredicto: string; avisado_ts: Date | null }>(
    "select clave, veredicto, avisado_ts from pub_veredicto where organizacion_id = $1", [org])).map((f) => [f.clave, f]));
  const avisar: FilaProducto[] = [];
  for (const f of filas) {
    const p = previos.get(f.clave);
    const cambio = !p || p.veredicto !== f.veredicto;
    if (f.veredicto === "cortar") {
      const ultimo = p?.avisado_ts ? new Date(p.avisado_ts).getTime() : 0;
      if (cambio || !ultimo || (cfg.avisoRepetirHoras > 0 && Date.now() - ultimo >= cfg.avisoRepetirHoras * 3600_000)) avisar.push(f);
    }
    await consulta(`insert into pub_veredicto (organizacion_id, clave, veredicto, motivo, desde_ts, actualizado_ts) values ($1, $2, $3, $4, now(), now())
                    on conflict (organizacion_id, clave) do update set motivo = excluded.motivo, actualizado_ts = now(),
                      desde_ts = case when pub_veredicto.veredicto = excluded.veredicto then pub_veredicto.desde_ts else now() end,
                      avisado_ts = case when pub_veredicto.veredicto = excluded.veredicto then pub_veredicto.avisado_ts else null end,
                      veredicto = excluded.veredicto`, [org, f.clave, f.veredicto, f.motivo]);
  }
  // Los que ya no tienen gasto en la ventana: dejan de estar en CORTAR.
  await consulta("delete from pub_veredicto where organizacion_id = $1 and not (clave = any($2::text[]))", [org, filas.map((f) => f.clave)]);
  let avisados = 0;
  if (avisar.length) {
    if (cfg.avisoCanal !== "panel") {
      const uno = avisar[0];
      avisados = await avisarOrg(org, "publicidad_ver", avisar.length === 1
        ? { titulo: `Publicidad: CORTAR ${uno.sku ?? ""} ${uno.titulo}`.slice(0, 90), texto: uno.motivo.slice(0, 200), url: `${PANTALLA}?q=${encodeURIComponent(uno.clave)}` }
        : { titulo: `Publicidad: ${avisar.length} productos para CORTAR`, texto: avisar.slice(0, 4).map((f) => `• ${f.sku ?? ""} ${f.titulo}`.slice(0, 80)).join("\n"), url: `${PANTALLA}?veredicto=cortar` });
    }
    await consulta("update pub_veredicto set avisado_ts = now() where organizacion_id = $1 and clave = any($2::text[])", [org, avisar.map((f) => f.clave)]);
  }
  return { productos: filas.length, cortar: filas.filter((f) => f.veredicto === "cortar").length, avisados };
}

/** Los productos en CORTAR, para el cartel de Para hacer (si la config lo pide). */
export async function enCortar(org: string): Promise<{ clave: string; motivo: string | null; desde: Date }[]> {
  const cfg = await configPublicidad(org);
  if (cfg.avisoCanal === "windows") return [];
  return (await consulta<{ clave: string; motivo: string | null; desde_ts: Date }>(
    "select clave, motivo, desde_ts from pub_veredicto where organizacion_id = $1 and veredicto = 'cortar' order by desde_ts", [org]).catch(() => []))
    .map((f) => ({ clave: f.clave, motivo: f.motivo, desde: f.desde_ts }));
}
