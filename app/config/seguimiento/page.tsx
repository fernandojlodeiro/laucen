// Configuración › Seguimiento de publicaciones (pedido de Fer, 10/10): cada
// cuántos días se releen las publicaciones de la competencia que se siguen y
// el tope de gasto del mes en Apify (lib/seguimiento/). Las pausadas de la competencia tienen su propia frecuencia y
// un límite de meses (Fer, 22/10).

import { una } from "@/lib/erp/base";
import { configSeguimiento, gastoDelMes } from "@/lib/seguimiento";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, BotonesFicha, Dato, editandoFicha, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { accionGuardarConfigSeguimiento } from "./acciones";

export const dynamic = "force-dynamic";

const VOLVER = "/config/seguimiento";

export default async function ConfigSeguimiento({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; editar?: string }> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const editando = editandoFicha(sp);
  const [c, gasto, n] = await Promise.all([
    configSeguimiento(s.org.id), gastoDelMes(s.org.id).catch(() => 0),
    una<{ total: number; productos: number; catalogo: number }>(`select count(*)::int total, count(distinct producto_id)::int productos, count(catalogo_id)::int catalogo
                                                                  from seguimiento_pub where organizacion_id = $1`, [s.org.id]).catch(() => null),
  ]);
  const usd = (v: number) => `US$ ${formatearNumero(v, "decimal")}`;
  return (
    <Pantalla titulo="Seguimiento de publicaciones" subtitulo="Cada cuánto se leen las publicaciones de la competencia que seguís y cuánto se puede gastar por mes" ancho="max-w-xl"
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} />}>
      <Avisos sp={sp} />
      <form id="ficha" action={accionGuardarConfigSeguimiento} className={`${CAJA} flex flex-wrap gap-4 items-start`}>
        {editando ? (
          <>
            <label className="w-40"><span className={ETIQUETA}>Leer cada (días)</span>
              <CampoNumero name="frecuencia_dias" valor={c.frecuenciaDias} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>Tope de gasto por mes (US$)</span>
              <CampoNumero name="tope_usd" valor={c.topeUsd} tipo="decimal" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>No compite si tarda más de (días)</span>
              <CampoNumero name="demora_dias" valor={c.demoraDias} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>Seguir solas por producto</span>
              <CampoNumero name="auto_max" valor={c.autoMax} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>Pausadas: leer cada (días)</span>
              <CampoNumero name="pausadas_dias" valor={c.pausadasDias} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>Pausadas: dejar de leer después de (meses)</span>
              <CampoNumero name="pausadas_meses" valor={c.pausadasMeses} tipo="entero" className={`${CAMPO} w-full`} /></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Leer cada (días)" numero className="w-40">{String(c.frecuenciaDias)}</Dato>
            <Dato etiqueta="Tope de gasto por mes (US$)" numero className="w-40">{formatearNumero(c.topeUsd, "decimal")}</Dato>
            <Dato etiqueta="No compite si tarda más de (días)" numero className="w-40">{String(c.demoraDias)}</Dato>
            <Dato etiqueta="Seguir solas por producto" numero className="w-40">{String(c.autoMax)}</Dato>
            <Dato etiqueta="Pausadas: leer cada (días)" numero className="w-40">{String(c.pausadasDias)}</Dato>
            <Dato etiqueta="Pausadas: dejar de leer después de (meses)" numero className="w-40">{String(c.pausadasMeses)}</Dato>
          </>
        )}
        <p className="w-full text-[11px] text-[#5C6B76]">
          Cada publicación seguida se vuelve a leer cuando pasaron esos días desde su última lectura (la primera es al agregarla), en la
          vuelta de la madrugada. Las de catálogo se leen gratis; las comunes y las búsquedas se pagan (Apify) y, al llegar al tope del mes,
          se dejan de leer hasta el mes siguiente. Una publicación que tarda en llegar más de los días elegidos (a un código postal de
          Capital Federal, como lo informa Mercado Libre) no compite: en la búsqueda queda escondida y en las seguidas se marca en rojo.
          La búsqueda de precio de mercado (Compras › Sugerencia de compra) sigue sola, en cada producto, hasta esa cantidad de
          publicaciones que la IA juzga iguales al producto (las más baratas); quedan «sin confirmar» hasta que una persona las revisa
          (0 = no seguir ninguna sola).
        </p>
        <p className="w-full text-[11px] text-[#5C6B76]">
          Solas se releen las comunes sólo de productos a la venta (con publicación activa en Mercado Libre y stock disponible); las
          de un producto pausado o sin stock quedan de referencia y se leen con «Leer ahora». Una publicación de la competencia que
          está pausada se relee cada «Pausadas: leer cada» días y, cuando lleva pausada más de los meses elegidos, deja de leerse sola
          hasta que se toca «Reanudar» en la pestaña Seguimiento del producto (0 meses = no deja nunca). Las terminadas no se releen
          (Mercado Libre no las reactiva).
        </p>
      </form>
      <div className={`${CAJA} mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
        <Dato etiqueta="Gastado este mes" numero>{usd(gasto)}</Dato>
        <Dato etiqueta="Queda del tope" numero>{usd(Math.max(0, c.topeUsd - gasto))}</Dato>
        <Dato etiqueta="Publicaciones seguidas" numero>{String(n?.total ?? 0)}</Dato>
        <Dato etiqueta="De catálogo (gratis)" numero>{String(n?.catalogo ?? 0)}</Dato>
      </div>
    </Pantalla>
  );
}
