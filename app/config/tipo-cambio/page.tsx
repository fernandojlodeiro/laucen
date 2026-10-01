// Tipo de cambio: el oficial del día (lo levanta el cron), su historia, la
// fuente, y la carga a mano (para una organización, gana al del cron ese día).

import { consulta } from "@/lib/erp/base";
import { formatear, tcDelDia } from "@/lib/moneda";
import { fuenteElegida, FUENTES } from "@/lib/tipo-cambio";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonEnviar, TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { accionBorrarManual, accionCargarAMano, accionCargarHistoria, accionElegirFuente, accionLevantarAhora } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = { ok?: string; error?: string };
const dia = (f: string) => f.split("-").reverse().join("/");

export default async function TipoCambio({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tipo_cambio_ver");
  const sp = await searchParams;
  const [hoy, fuente, filas, resumen] = await Promise.all([
    tcDelDia(s.org.id),
    fuenteElegida(),
    consulta<{ id: number; fecha: string; compra: string | null; venta: string; origen: string; propio: boolean }>(`
      select id::int, to_char(fecha, 'YYYY-MM-DD') fecha, compra, venta, origen, organizacion_id is not null propio
        from tipo_cambio where (organizacion_id = $1 or organizacion_id is null) and tipo = 'oficial'
       order by fecha desc, organizacion_id nulls last limit 40`, [s.org.id]),
    consulta<{ desde: string | null; dias: number }>(
      "select to_char(min(fecha), 'YYYY-MM-DD') desde, count(*)::int dias from tipo_cambio where organizacion_id is null and tipo = 'oficial'"),
  ]);

  return (
    <Pantalla titulo="Tipo de cambio" subtitulo="Dólar oficial (venta): con éste se calcula la otra moneda al cargar un precio o un pedido" ancho="max-w-4xl">
      <Avisos sp={sp} />
      <div className="grid gap-3 md:grid-cols-3 mb-4">
        <section className={CAJA}>
          <h2 className="text-xs font-bold text-[#5C6B76]">Hoy rige</h2>
          {hoy ? (
            <>
              <p className="text-2xl font-bold tabular-nums">{formatear(hoy.venta, "ARS")}</p>
              <p className="text-[11px] text-[#5C6B76]">del {dia(hoy.fecha)} · {hoy.origen}</p>
            </>
          ) : <p className="text-sm text-[#C03420] mt-1">Todavía no hay ninguno cargado.</p>}
          <form action={accionLevantarAhora} className="mt-2">
            <BotonEnviar clase={PRIMARIO} corriendo="Levantando…">Levantar ahora</BotonEnviar>
          </form>
        </section>
        <section className={CAJA}>
          <h2 className="text-xs font-bold text-[#5C6B76] mb-1">Fuente</h2>
          <form action={accionElegirFuente} className="flex flex-wrap gap-2 items-center">
            <select name="fuente" defaultValue={fuente} className={CAMPO}>
              {Object.entries(FUENTES).map(([k, f]) => <option key={k} value={k}>{f.nombre}</option>)}
            </select>
            <button className={SUAVE}>Usar ésta</button>
          </form>
          <p className="text-[11px] text-[#5C6B76] mt-2">El cron la consulta todos los días a las 16:15. Si falla, prueba con la otra y, si fallan las dos, lo anota en la bitácora.</p>
        </section>
        <section className={CAJA}>
          <h2 className="text-xs font-bold text-[#5C6B76] mb-1">Historia</h2>
          <p className="text-xs">{resumen[0]?.dias ? <>Desde el {dia(resumen[0].desde!)} · {resumen[0].dias.toLocaleString("es-AR")} días</> : "Sin historia cargada."}</p>
          <p className="text-[11px] text-[#5C6B76] my-1">Hace falta para convertir las ventas viejas de Virtual Seller con el dólar de su fecha.</p>
          <form action={accionCargarHistoria}>
            <BotonEnviar clase={SUAVE} corriendo="Cargando…">Cargar historia (desde 2011)</BotonEnviar>
          </form>
        </section>
      </div>

      <section className={`${CAJA} mb-4`}>
        <h2 className="text-sm font-bold mb-2">Cargar a mano</h2>
        <form action={accionCargarAMano} className="flex flex-wrap items-end gap-2">
          <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })} className={CAMPO} /></label>
          <label><span className={ETIQUETA}>Compra</span><CampoNumero name="compra" valor={null} tipo="pesos" className={`${CAMPO} w-28`} /></label>
          <label><span className={ETIQUETA}>Venta</span><CampoNumero name="venta" valor={null} tipo="pesos" className={`${CAMPO} w-28`} /></label>
          <button className={VERDE}>Guardar</button>
        </form>
        <p className="text-[11px] text-[#5C6B76] mt-2">Vale sólo para tu organización y ese día gana al que levanta el cron.</p>
      </section>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={THN}>Compra</th><th className={THN}>Venta</th><th className={TH}>Origen</th><th /></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Sin datos.</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={TD}>{dia(f.fecha)}</td>
                <td className={TDN}>{f.compra ? formatear(f.compra, "ARS") : "—"}</td>
                <td className={`${TDN} font-bold`}>{formatear(f.venta, "ARS")}</td>
                <td className={TD}>{f.propio ? <Estado texto="A mano (tu organización)" tono="amarillo" /> : <span className="text-[#5C6B76]">{f.origen}</span>}</td>
                <td className={`${TD} text-right`}>{f.propio && <TachoConfirmar accion={accionBorrarManual} campos={{ id: String(f.id) }} pregunta="¿Borrar?" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
