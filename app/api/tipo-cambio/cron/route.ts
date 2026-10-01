// Tipo de cambio oficial del día (lib/tipo-cambio.ts). Vercel Cron
// (vercel.json), una vez por día a las 16:15 hora argentina (19:15 UTC), con
// el de cierre del día (Vercel en el plan gratis permite un cron por día). El
// botón "Levantar ahora" de Configuración → Tipo de cambio hace lo mismo. Queda
// una fila por día: con eso cualquier importe se convierte con el dólar de su
// fecha (un fin de semana o feriado usa el último día hábil anterior). Si CRON_SECRET está cargada en Vercel, se exige
// (como en el Radar). Si fallan todas las fuentes, deja un 'bloqueo' en la
// bitácora (una vez por día) para que se vea.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { cargarHistoria, levantarTipoCambio } from "@/lib/tipo-cambio";
import { pool } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("no autorizado", { status: 401 });
  }
  await asegurarEsquemaErp();
  // Primero completa los días que falten de la historia (desde 2011; la
  // primera vez carga todo, después sólo los huecos), así siempre hay un
  // dólar por día para convertir cualquier fecha.
  const historia = await cargarHistoria().catch((e) => { console.error("[tipo-cambio] historia", e); return null; });
  const r = await levantarTipoCambio();
  if (!r.ok) {
    const titulo = `Tipo de cambio: no se pudo levantar el oficial del ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
    await pool.query(`
      insert into coordinacion.bitacora (autor, tipo, titulo, detalle, pendientes)
      select 'code', 'bloqueo', $1::text, $2::text, 'pending: el cron lo vuelve a intentar en la próxima corrida; mientras tanto se usa el último cargado.'
       where not exists (select 1 from coordinacion.bitacora where titulo = $1::text)`,
      [titulo, r.errores.join("\n")]).catch((e) => console.error("[tipo-cambio] bitácora", e));
    return Response.json(r, { status: 502 });
  }
  return Response.json({ ...r, historia_agregados: historia });
}
