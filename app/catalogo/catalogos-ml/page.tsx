// Catálogo › Catálogos que armó ML (Fer, 4/11): las publicaciones de catálogo que Mercado Libre creó solo en
// nuestras cuentas (lib/precios-ml/catalogo-auto.ts), con si el catálogo es el mismo producto, su marca, cómo
// le va (precio para ganar) y qué conviene hacer. Sólo lectura: los precios se cambian en Precios en Mercado Libre.

import Link from "next/link";
import { paginarEnMemoria, ordenarEnMemoria } from "@/lib/lista";
import { coincideBusqueda } from "@/lib/busqueda";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import Pestanas from "@/app/componentes/Pestanas";
import { entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { catalogosAuto, queHacer, pideAtencion, bajaPct, TEXTO_SITUACION, TOPE_BAJA_PCT, type CatalogoAuto } from "@/lib/precios-ml/catalogo-auto";
import { catalogosPerdidos, netoDe, type CatalogoPerdido } from "@/lib/precios-ml/catalogo-ganar";
import { VERDE, SUAVE } from "@/app/botones";
import { accionGanar, accionSoltar } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ver?: string; ok?: string; error?: string };

const TONO: Record<CatalogoAuto["situacion"], string> = {
  gana: "text-[#167655]", comparte: "text-[#167655]", contra_otro: "text-[#C03420] font-bold", contra_nosotros: "text-[#167655]", en_revision: "text-[#5C6B76]", sin_listar: "text-[#5C6B76]",
};
const VEREDICTO: Record<string, string> = { mismo: "Mismo producto", parecido: "Parecido", distinto: "Otro producto" };

export default async function CatalogosMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const [todos, perdidos] = await Promise.all([catalogosAuto(s.org.id), catalogosPerdidos(s.org.id)]);
  const revisar = todos.filter(pideAtencion);
  const ver = sp.ver === "todos" ? "todos" : sp.ver === "revisar" ? "revisar" : sp.ver === "paginas" ? "paginas" : "perdemos";
  const catalogos = perdidos.filter((c) => !c.flex), paginas = perdidos.filter((c) => c.flex);
  const q = sp.q ?? "";
  const filtradas = (ver === "todos" ? todos : revisar)
    .filter((c) => coincideBusqueda([c.sku, c.titulo, c.item_id, c.cuenta, c.catalogo_id, c.catalogo_nombre, c.marca], q, sp.contiene !== "1"));
  const ordenadas = ordenarEnMemoria(filtradas, sp, {
    sku: (c) => c.sku, cuenta: (c) => c.cuenta, situacion: (c) => TEXTO_SITUACION[c.situacion], precio: (c) => c.precio, ptw: (c) => c.ptw,
    ganador: (c) => c.ganador, baja: (c) => bajaPct(c), visto: (c) => new Date(c.visto_ts).getTime(),
  });
  const filas = paginarEnMemoria(ordenadas, sp);

  return (
    <Pantalla titulo="Catálogos que armó ML" ancho="max-w-[99rem]"
      subtitulo="Publicaciones de catálogo que Mercado Libre creó solo en tus cuentas: si el catálogo es el mismo producto, cómo les va y qué conviene hacer.">
      <Avisos sp={sp} />
      <Pestanas items={[
        { clave: "perdemos", texto: "Perdemos", href: "/catalogo/catalogos-ml", activa: ver === "perdemos", cuenta: catalogos.length },
        { clave: "paginas", texto: "Páginas armadas por ML", href: "/catalogo/catalogos-ml?ver=paginas", activa: ver === "paginas", cuenta: paginas.length },
        { clave: "revisar", texto: "Armados por ML: para revisar", href: "/catalogo/catalogos-ml?ver=revisar", activa: ver === "revisar", cuenta: revisar.length },
        { clave: "todos", texto: "Armados por ML: todos", href: "/catalogo/catalogos-ml?ver=todos", activa: ver === "todos", cuenta: todos.length },
      ]} />
      {ver === "perdemos" || ver === "paginas" ? <Perdemos lista={ver === "paginas" ? paginas : catalogos} paginas={ver === "paginas"} q={q} comienza={sp.contiene !== "1"} sp={sp} /> : <>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Se revisa solo con cada lectura de Mercado Libre. El precio para ganar se actualiza cada 6 horas. Para bajar un precio o hacer entrar una publicación a la campaña,
        usá <Link href="/catalogo/precios-ml" className="text-[#16577F] underline">Precios en Mercado Libre</Link> › «Preparar cambios»: nada se cambia desde acá.
      </p>
      <div className="mb-3"><BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Buscar por SKU, título, publicación, cuenta o catálogo" limpiar={["p"]} /></div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="sku" porDefecto>Producto</ThOrden><ThOrden col="cuenta">Cuenta</ThOrden><ThOrden col="situacion">Situación</ThOrden>
              <ThOrden col="precio" n title="Precio publicado de la publicación de catálogo">Precio</ThOrden>
              <ThOrden col="ptw" n title="Precio para ganar, según Mercado Libre">P/ganar</ThOrden>
              <ThOrden col="ganador" n title="Precio del que gana hoy">Ganador</ThOrden>
              <ThOrden col="baja" n title={`Cuánto abajo de la Clásica queda el precio para ganar (sólo Clásicas). Más del ${TOPE_BAJA_PCT} % no conviene.`}>% Clás.</ThOrden>
              <th className="py-1.5 px-2 text-left font-semibold">Qué hacer</th>
              <th className="py-1.5 px-2 text-left font-semibold" title="El producto de catálogo de Mercado Libre, su marca y si es el mismo que el nuestro">Catálogo</th>
              <ThOrden col="visto" n title="Cuándo lo vio Laucen">Visto</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{q ? "Nada con esa búsqueda." : ver === "revisar" ? "Nada para revisar." : "Mercado Libre no armó catálogos nuevos en los últimos días."}</td></tr>}
            {filas.map((c) => {
              const b = bajaPct(c);
              return (
                <tr key={`${c.canal_id}:${c.item_id}`} className={TR} data-canal={c.canal_id}>
                  <td className={`${TD} min-w-56 max-w-80`}>
                    <div className="flex items-start gap-2">
                      <FotosProducto fotos={c.fotos} titulo={c.titulo ?? ""} />
                      <div className="min-w-0">
                        {c.producto_id ? <Link href={`/catalogo/productos/${c.producto_id}`} className="font-mono text-[#16577F] hover:underline">{c.sku}</Link> : <span className="text-[#8a6100]">Sin producto en Laucen</span>}
                        <TituloCorto titulo={c.titulo} />
                        <span className="block font-mono text-[10px]"><Link href={historialPublicacion(c.item_id)} className="text-[#16577F] hover:underline">{c.item_id}</Link> <a href={enlaceMl(c.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a>
                          {c.estado_ml && c.estado_ml !== "active" && <span className="ml-1 text-[#8a6100]">({c.estado_ml === "under_review" ? "en revisión" : c.estado_ml === "paused" ? "pausada" : c.estado_ml})</span>}</span>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>{c.cuenta}</td>
                  <td className={`${TD} whitespace-nowrap ${TONO[c.situacion]}`}>{TEXTO_SITUACION[c.situacion]}</td>
                  <td className={TDN}>{pesos(c.precio)}</td>
                  <td className={TDN}>{pesos(c.ptw)}</td>
                  <td className={TDN}>{pesos(c.ganador)}</td>
                  <td className={`${TDN} ${b != null && b > TOPE_BAJA_PCT ? "text-[#C03420] font-bold" : ""}`}>{b == null ? "—" : formatearNumero(b, "decimal")}</td>
                  <td className={`${TD} min-w-64 max-w-96 text-[11px]`}>{queHacer(c) ?? <span className="text-[#5C6B76]">Nada</span>}</td>
                  <td className={`${TD} min-w-48 max-w-72 text-[11px]`}>
                    {c.catalogo_id
                      ? <a href={`https://www.mercadolibre.com.ar/p/${c.catalogo_id}`} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{c.catalogo_nombre ?? c.catalogo_id} ↗</a>
                      : "—"}
                    <span className="block text-[#5C6B76]">
                      {c.marca ? `Marca ${c.marca}` : "Sin marca"}{c.marca_ok === false && <b className="text-[#C03420]"> · de otro vendedor</b>}
                      {" · "}{c.veredicto ? <span className={c.veredicto === "distinto" ? "text-[#C03420] font-bold" : ""} title={c.motivo ?? undefined}>{VEREDICTO[c.veredicto] ?? c.veredicto}</span> : c.juzgado ? "sin controlar" : "controlando…"}
                    </span>
                  </td>
                  <td className={`${TDN} text-[11px] whitespace-nowrap`}>{fechaHora(c.visto_ts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={ordenadas.length} />
      </>}
    </Pantalla>
  );
}

const pesos = (x: number | null | undefined) => (x == null ? "—" : formatearNumero(x, "entero"));

/** Los catálogos donde gana un vendedor que no es ninguna de nuestras cuentas, con todas nuestras publicaciones de
 *  cada uno y el botón «Ganar» (lib/precios-ml/catalogo-ganar.ts). */
function Perdemos({ lista, paginas, q, comienza, sp }: { lista: CatalogoPerdido[]; paginas: boolean; q: string; comienza: boolean; sp: SP }) {
  const filtradas = lista.filter((c) => coincideBusqueda([c.sku, c.titulo, c.catalogo_id, c.catalogo_nombre, ...c.pubs.map((p) => p.item_id), ...c.pubs.map((p) => p.cuenta)], q, comienza));
  const filas = paginarEnMemoria(filtradas, sp);
  return (
    <>
      {paginas && (
        <p className="text-[11px] text-[#8a6100] mb-2 font-semibold">
          Páginas que armó Mercado Libre juntando publicaciones parecidas. Acá la API de Mercado Libre no dice bien quién gana: el orden de vendedores va por precio
          y el precio para ganar puede ser absurdo. Lo que vale es lo que ve el comprador: mirá la página (enlace en cada producto). No hay botón «Ganar».
        </p>
      )}
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Catálogos donde el botón de compra lo tiene un vendedor que no es ninguna de tus cuentas. Por cada publicación nuestra: a cuánto se vende hoy,
        el precio para ganar que da Mercado Libre (lo mínimo que hay que bajar), cuánto es eso y cuánto queda neto (después de la comisión y el envío, si se conoce).
        «Ganar» manda en el momento ese precio a Mercado Libre, fuera de las campañas, y el motor de precios no la vuelve a tocar hasta que la sueltes.
      </p>
      <div className="mb-3"><BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por SKU, título, publicación, cuenta o catálogo" limpiar={["p"]} /></div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className="py-1.5 px-2 text-left font-semibold">Producto</th>
              <th className="py-1.5 px-2 text-left font-semibold" title="Quién gana hoy el catálogo y a cuánto">Gana</th>
              <th className="py-1.5 px-2 text-left font-semibold">Cuenta</th>
              <th className="py-1.5 px-2 text-left font-semibold">Publicación</th>
              <th className="py-1.5 px-2 text-right font-semibold" title="El precio de hoy, con la campaña en curso (debajo, tachado, el publicado)">Hoy</th>
              <th className="py-1.5 px-2 text-right font-semibold" title="El precio para ganar que da Mercado Libre para esta publicación: el objetivo">Objetivo</th>
              <th className="py-1.5 px-2 text-right font-semibold" title="Cuánto hay que bajar desde el precio de hoy para llegar al objetivo">Bajar</th>
              <th className="py-1.5 px-2 text-right font-semibold" title="Lo que queda hoy, después de la comisión y el envío (si se conoce)">Neto hoy</th>
              <th className="py-1.5 px-2 text-right font-semibold" title="Lo que quedaría ganando, después de la comisión y el envío (si se conoce)">Neto ganando</th>
              <th className="py-1.5 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{q ? "Nada con esa búsqueda." : "Ganamos o compartimos todos los catálogos."}</td></tr>}
            {filas.map((c) => c.pubs.map((p, i) => {
              const baja$ = p.venta && p.ptw && !p.no_compite ? p.venta - p.ptw : null;
              const bajar = baja$ != null && p.venta ? Math.round((baja$ / p.venta) * 1000) / 10 : null;
              const puedeGanar = !p.no_compite && baja$ != null && baja$ >= 1 && p.estado_ptw !== "winning";
              const conEnvio = p.envio != null;
              return (
                <tr key={`${c.catalogo_id}:${p.canal_id}:${p.item_id}`} className={`${TR} ${i === 0 ? "border-t-2 border-[#C9D3DD]" : ""}`} data-canal={p.canal_id}>
                  {i === 0 && <>
                    <td rowSpan={c.pubs.length} className={`${TD} min-w-56 max-w-80 align-top bg-white`}>
                      <div className="flex items-start gap-2">
                        <FotosProducto fotos={c.fotos} titulo={c.titulo} />
                        <div className="min-w-0">
                          <Link href={`/catalogo/productos/${c.producto_id}`} className="font-mono text-[#16577F] hover:underline">{c.sku}</Link>
                          <TituloCorto titulo={c.titulo} />
                          <a href={`https://www.mercadolibre.com.ar/p/${c.catalogo_id}`} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-[#16577F] hover:underline">Catálogo {c.catalogo_id} ↗</a>
                          {c.clasica != null && <span className="block text-[10px] text-[#5C6B76]">Clásica (lista) $ {pesos(c.clasica)}</span>}
                        </div>
                      </div>
                    </td>
                    <td rowSpan={c.pubs.length} className={`${TD} align-top bg-white whitespace-nowrap`}>
                      <b>$ {pesos(c.ganador_precio)}</b>
                      {c.ganador_item && <span className="block font-mono text-[10px]"><a href={enlaceMl(c.ganador_item)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{c.ganador_item} ↗</a></span>}
                      <span className="block text-[10px] text-[#5C6B76]">otro vendedor · {fechaHora(c.leido_ts)}</span>
                    </td>
                  </>}
                  <td className={TD}>{p.cuenta}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <Link href={historialPublicacion(p.item_id)} className="font-mono text-[#16577F] hover:underline">{p.item_id}</Link> <a href={enlaceMl(p.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a>
                    <span className="block text-[10px] text-[#5C6B76]">{p.plan}{p.estado_ptw === "winning" ? " · gana" : p.estado_ptw === "sharing_first_place" ? " · comparte" : ""}</span>
                  </td>
                  <td className={TDN}>{pesos(p.venta)}{p.publicado && p.venta && p.publicado > p.venta + 1 ? <span className="block text-[10px] text-[#5C6B76] line-through">{pesos(p.publicado)}</span> : null}</td>
                  {p.no_compite ? (
                    <td colSpan={2} className={`${TD} text-[11px] text-[#C03420]`}>No compite: {p.no_compite}. Bajar el precio no sirve.</td>
                  ) : <>
                    <td className={`${TDN} font-bold`}>{pesos(p.ptw)}</td>
                    <td className={TDN}>{baja$ == null ? "—" : baja$ < 1 ? <span className="text-[11px] text-[#5C6B76]" title="El precio de hoy ya alcanza: pierde por otra cosa (envío, cuotas, reputación)">ya alcanza</span>
                      : <>{pesos(baja$)}<span className="block text-[10px] text-[#5C6B76]">{formatearNumero(bajar ?? 0, "decimal")} %</span></>}</td>
                  </>}
                  <td className={TDN} title={conEnvio ? undefined : "Sin el envío: no se conoce"}>{pesos(netoDe(p.venta, p))}{!conEnvio && "*"}</td>
                  <td className={TDN} title={conEnvio ? undefined : "Sin el envío: no se conoce"}>{puedeGanar ? <>{pesos(netoDe(p.ptw, p))}{!conEnvio && "*"}</> : "—"}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {p.fijada != null ? (
                      <form action={accionSoltar} className="flex items-center gap-2">
                        <input type="hidden" name="canal" value={p.canal_id} /><input type="hidden" name="item" value={p.item_id} />
                        <span className={`text-[11px] font-bold ${p.ganar_estado === "error" ? "text-[#C03420]" : "text-[#167655]"}`}
                          title={p.ganar_error ?? undefined}>
                          {p.ganar_estado === "error" ? `ML no lo aceptó: ${p.ganar_error ?? "sin motivo"}` : p.ganar_estado === "ok" ? `Fijada a $ ${pesos(p.fijada)}` : `Mandando $ ${pesos(p.fijada)}…`}
                        </span>
                        <button className={SUAVE} title="Vuelve al motor de precios (tachado y campañas)">Soltar</button>
                      </form>
                    ) : puedeGanar && !paginas ? (
                      <form action={accionGanar}>
                        <input type="hidden" name="canal" value={p.canal_id} /><input type="hidden" name="item" value={p.item_id} />
                        <button className={VERDE} title="Pone ya el precio para ganar que da Mercado Libre en este momento, fuera de las campañas">Ganar</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-1">* Sin el envío: todavía no se leyó de Mercado Libre cuánto cobra por el envío de esa publicación.</p>
      <Paginado total={filtradas.length} />
    </>
  );
}
