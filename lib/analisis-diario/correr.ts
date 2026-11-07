// El análisis diario: la corrida. La dispara el cron de las 9 (hora argentina; vercel.json → /api/analisis-diario/cron)
// y el botón «Volver a analizar» de la pantalla. Calcula (calcular.ts), le pide a la IA un resumen en criollo con lo que
// conviene hacer, lo guarda (una fila por día: la de hoy se pisa) y, si hay algo para hacer y la configuración lo pide,
// manda un aviso al celular a quien tenga el permiso. Nada sale a Mercado Libre desde acá.

import { consulta, una } from "@/lib/erp/base";
import { pedirClaude, hayClaude } from "@/lib/claude";
import { avisarOrg } from "@/lib/avisos-push";
import { calcularAnalisis, hoyAr, type Analisis } from "@/lib/analisis-diario/calcular";
import { configAnalisis } from "@/lib/analisis-diario/config";

export const PANTALLA = "/informes/analisis-diario";

const SISTEMA = `Sos el analista comercial de una empresa argentina que vende notebooks, impresoras 3D y otros productos en Mercado Libre (varias cuentas) y en su tienda web, con publicidad en Mercado Libre, Google Ads y Meta.
Te paso, en JSON, el análisis automático de hoy. Escribile al dueño un resumen corto, en castellano rioplatense con voseo, directo y sin vueltas. Sabe de números y de su negocio; no le expliques lo obvio.
Formato: texto plano con estos títulos en una línea propia, en este orden, y debajo viñetas con «- »: «Lo urgente», «Campañas de Mercado Libre», «Publicidad», «Visitas de la tienda», «Qué haría hoy». Si una sección no tiene nada que decir, una sola viñeta «Nada para hacer.».
Reglas:
- Usá sólo los datos que te paso. No inventes cifras ni causas; si algo no se puede saber con estos datos, decilo.
- Montos en pesos con punto de miles («$ 1.250.000»). Un porcentaje siempre dice sobre qué es («baja 3 % sobre el precio del esquema», «el retorno es 4,2 veces lo invertido»); nunca un % suelto.
- Compará los últimos 7 días contra los 7 anteriores cuando haya datos de los dos.
- Nombrá productos por su SKU y publicaciones por su número (MLA…).
- Nada se manda solo a Mercado Libre: lo que proponés lo aprieta el dueño en la pantalla. Decí qué botón: «Entrar a las ofertas que cumplen» (relámpago y compartidas) o «Preparar lote de campañas» (publicaciones sin campaña).
- Si una fuente de datos está vieja o sin gasto, avisalo: puede ser que la lectura no ande o que la campaña esté sin entrega.
- Las ofertas relámpago y compartidas van en «Campañas de Mercado Libre», no en «Publicidad» («Publicidad» es lo invertido en anuncios de ML, Google y Meta).
- Revisá cada cifra contra el JSON antes de escribirla; nunca te corrijas en el texto («… en realidad …»).
- Máximo unas 25 viñetas en total.`;

/** Lo que va a la IA: el análisis con las listas recortadas (no hace falta todo para resumir). */
function paraIa(a: Analisis) {
  return {
    ...a,
    campanas: { ...a.campanas, filas: a.campanas.filas.slice(0, 60).map(({ productoId: _p, canalId: _c, ...f }) => f) },
    ofertas: a.ofertas.slice(0, 40).map(({ productoId: _p, canalId: _c, ...f }) => f),
    publicidad: { ...a.publicidad, mlAds: a.publicidad.mlAds.slice(0, 15), campanas: a.publicidad.campanas.slice(0, 20) },
  };
}

export async function resumenIa(a: Analisis): Promise<{ resumen: string | null; error: string | null }> {
  if (!hayClaude()) return { resumen: null, error: "Falta la llave de la IA." };
  const r = await pedirClaude({ system: SISTEMA, contenido: JSON.stringify(paraIa(a)), maxTokens: 3000, effort: "low", modelo: "medio" });
  if ("error" in r) return { resumen: null, error: r.error };
  return { resumen: r.texto.trim(), error: null };
}

export type ResultadoAnalisis = { fecha: string; urgentes: number; avisados: number; resumen: boolean };

/** Analiza hoy para una organización, lo guarda y avisa. `avisar`: false en una corrida a mano (ya está mirando). */
export async function correrAnalisis(org: string, opts: { avisar?: boolean } = {}): Promise<ResultadoAnalisis> {
  const hoy = hoyAr();
  const a = await calcularAnalisis(org, hoy);
  // Los datos se guardan antes del resumen: si la IA tarda o falla, la pantalla ya los muestra.
  await consulta(`
    insert into analisis_diario (organizacion_id, fecha, datos, resumen, resumen_error, urgentes) values ($1, $2::date, $3::jsonb, null, 'escribiendo', $4)
    on conflict (organizacion_id, fecha) do update set datos = excluded.datos, resumen = null, resumen_error = 'escribiendo',
      urgentes = excluded.urgentes, creado_ts = now()`,
    [org, hoy, JSON.stringify(a), a.urgentes.length]);
  // La IA, con tope de 90 segundos (el resto de la corrida no la espera más).
  const ia = await Promise.race([
    resumenIa(a),
    new Promise<{ resumen: null; error: string }>((r) => setTimeout(() => r({ resumen: null, error: "La IA tardó demasiado." }), 90_000)),
  ]);
  await consulta("update analisis_diario set resumen = $3, resumen_error = $4 where organizacion_id = $1 and fecha = $2::date", [org, hoy, ia.resumen, ia.error]);
  let avisados = 0;
  const cfg = await configAnalisis(org);
  if (opts.avisar !== false && cfg.avisar && a.urgentes.length) {
    const ya = await una<{ avisado_ts: Date | null }>("select avisado_ts from analisis_diario where organizacion_id = $1 and fecha = $2::date", [org, hoy]);
    if (!ya?.avisado_ts) {
      avisados = await avisarOrg(org, "analisis_diario_ver", {
        titulo: `Análisis diario: ${a.urgentes.length === 1 ? "1 cosa para mirar" : `${a.urgentes.length} cosas para mirar`}`,
        texto: a.urgentes.slice(0, 4).map((u) => `• ${u}`).join("\n").slice(0, 300),
        url: PANTALLA,
      }).catch(() => 0);
      await consulta("update analisis_diario set avisado_ts = now() where organizacion_id = $1 and fecha = $2::date", [org, hoy]);
    }
  }
  return { fecha: hoy, urgentes: a.urgentes.length, avisados, resumen: !!ia.resumen };
}

/** Las organizaciones que se analizan: las que tienen alguna cuenta de Mercado Libre activa. */
export async function organizacionesAnalisis(): Promise<string[]> {
  return (await consulta<{ organizacion_id: string }>(
    "select distinct organizacion_id from canal where tipo = 'mercadolibre' and estado = 'activo'")).map((x) => x.organizacion_id);
}

export type FilaAnalisis = { fecha: string; datos: Analisis; resumen: string | null; resumen_error: string | null; urgentes: number; creado_ts: Date };

export async function analisisDe(org: string, fecha: string | null): Promise<FilaAnalisis | null> {
  return una<FilaAnalisis>(`
    select fecha::text, datos, resumen, resumen_error, urgentes, creado_ts from analisis_diario
     where organizacion_id = $1 and ($2::date is null or fecha = $2::date) order by fecha desc limit 1`, [org, fecha]);
}

/** Los días que tienen análisis (para moverse entre días). */
export async function diasConAnalisis(org: string): Promise<string[]> {
  return (await consulta<{ fecha: string }>("select fecha::text from analisis_diario where organizacion_id = $1 order by fecha desc limit 400", [org])).map((x) => x.fecha);
}

/** Lo urgente del análisis de hoy (para el cartel de Para hacer), si la configuración pide avisar. */
export async function urgentesHoy(org: string): Promise<string[]> {
  const cfg = await configAnalisis(org).catch(() => null);
  if (!cfg?.avisar) return [];
  const f = await una<{ datos: Analisis }>("select datos from analisis_diario where organizacion_id = $1 and fecha = $2::date", [org, hoyAr()]).catch(() => null);
  return f?.datos?.urgentes ?? [];
}
