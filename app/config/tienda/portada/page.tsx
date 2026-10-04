// Portada de la tienda: elegís a mano qué productos van en "Destacados" (los
// primeros que se ven) y en "Novedades", y en qué orden. El resto de la portada
// (Ofertas, Más vendidos, Destacados por categoría) se arma solo.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { entrarErp, Pantalla, Avisos, TituloSeccion, CAJA, TABLA, TD, TDN } from "@/app/componentes/erp";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { productosDe, LISTAS_PORTADA, MAX_PORTADA, type ListaPortada } from "@/lib/tienda/portada";
import Buscador from "./Buscador";
import { accionMoverPortada, accionQuitarPortada } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; nuevo?: string; ok?: string; error?: string };
const FLECHA = "inline-block text-xs leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F] disabled:opacity-30";

export default async function PortadaTienda({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const tiendas = await consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado' order by id", [s.org.id]);
  const tienda = tiendas.find((t) => t.id === Number(sp.canal)) ?? tiendas[0];
  const LISTAS: ListaPortada[] = ["destacados", "novedades"];
  const cargadas = tienda ? await Promise.all(LISTAS.map((l) => productosDe(s.org.id, tienda.id, l))) : [];

  return (
    <Pantalla titulo="Portada de la tienda" subtitulo="Elegí los productos de Destacados y de Novedades, y en qué orden salen" ancho="max-w-4xl">
      <Avisos sp={sp} />
      {!tienda ? (
        <div className={CAJA}><p className="text-xs">Todavía no hay una tienda web. Creala en <Link href="/config/tienda" className="text-[#16577F] underline">Configuración → Tienda web</Link>.</p></div>
      ) : (
        <>
          {tiendas.length > 1 && (
            <div className="flex gap-2 mb-3 text-xs">
              {tiendas.map((t) => <Link key={t.id} href={`/config/tienda/portada?canal=${t.id}`} className={`rounded-lg border px-3 py-1.5 ${t.id === tienda.id ? "bg-[#16577F] text-white border-[#16577F]" : "bg-white border-[#E3E9F0]"}`}>{t.nombre}</Link>)}
            </div>
          )}
          <p className="text-xs text-[#5C6B76] mb-4">
            Lo que sigue se arma solo: <b>Ofertas</b> (mayor descuento), <b>Más vendidos</b> (ventas de todos los canales) y <b>Destacados en cada categoría</b>. Sólo se muestran los productos con stock.
          </p>
          {LISTAS.map((lista, k) => {
            const info = LISTAS_PORTADA[lista];
            const filas = cargadas[k];
            const clave = `agregar-${lista}`;
            return (
              <section key={lista} className="mb-8">
                <TituloSeccion titulo={`${info.titulo} (${filas.length})`}>
                  {filas.length < MAX_PORTADA && <BotonNuevo texto="Agregar producto" clave={clave} />}
                </TituloSeccion>
                <p className="text-[11px] text-[#5C6B76] mb-2">{info.ayuda} Hasta {MAX_PORTADA}; lo ideal son 10 a 12: en la PC se ven unos 5 por pantalla, en el celular 2, y el resto se desliza.</p>
                <AltaNueva texto="Agregar producto" clave={clave} sinBoton>
                  <Buscador canalId={tienda.id} lista={lista} />
                </AltaNueva>
                <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto">
                  <table className={TABLA}>
                    <tbody>
                      {filas.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>{info.vacia}</td></tr>}
                      {filas.map((p, i) => (
                        <tr key={p.id} className="border-t border-[#EEF1F4] first:border-t-0">
                          <td className={`${TDN} w-8 text-[#5C6B76]`}>{i + 1}</td>
                          <td className={`${TD} w-12`}>{p.foto ? <img src={p.foto} alt="" className="h-9 w-9 rounded object-contain border border-[#E3E9F0] bg-white" /> : <span className="block h-9 w-9 rounded bg-[#F3F6F9] border border-[#E3E9F0]" title="Sin foto" />}</td>
                          <td className={`${TD} font-mono whitespace-nowrap`}><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F] font-semibold">{p.sku}</Link></td>
                          <td className={TD}>{p.titulo}{p.stock <= 0 && <span className="ml-2 text-[11px] text-[#C03420]">sin stock: no se muestra</span>}{p.archivado && <span className="ml-2 text-[11px] text-[#C03420]">archivado: no se muestra</span>}</td>
                          <td className={`${TD} text-right whitespace-nowrap`}>
                            <span className="inline-flex items-center gap-1">
                              {(["-1", "1"] as const).map((paso) => (
                                <form key={paso} action={accionMoverPortada} className="inline">
                                  <input type="hidden" name="canal_id" value={tienda.id} /><input type="hidden" name="lista" value={lista} />
                                  <input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="paso" value={paso} />
                                  <button className={FLECHA} disabled={paso === "-1" ? i === 0 : i === filas.length - 1} aria-label={paso === "-1" ? "Subir" : "Bajar"} title={paso === "-1" ? "Subir un lugar" : "Bajar un lugar"}>{paso === "-1" ? "▲" : "▼"}</button>
                                </form>
                              ))}
                              <TachoConfirmar accion={accionQuitarPortada} campos={{ canal_id: String(tienda.id), lista, producto_id: String(p.id) }} pregunta="¿Sacar?" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </Pantalla>
  );
}
