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

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ver?: string; ok?: string; error?: string };

const TONO: Record<CatalogoAuto["situacion"], string> = {
  gana: "text-[#167655]", comparte: "text-[#167655]", contra_otro: "text-[#C03420] font-bold", contra_nosotros: "text-[#167655]", en_revision: "text-[#5C6B76]", sin_listar: "text-[#5C6B76]",
};
const VEREDICTO: Record<string, string> = { mismo: "Mismo producto", parecido: "Parecido", distinto: "Otro producto" };

export default async function CatalogosMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const todos = await catalogosAuto(s.org.id);
  const revisar = todos.filter(pideAtencion);
  const ver = sp.ver === "todos" ? "todos" : "revisar";
  const q = sp.q ?? "";
  const filtradas = (ver === "todos" ? todos : revisar)
    .filter((c) => coincideBusqueda([c.sku, c.titulo, c.item_id, c.cuenta, c.catalogo_id, c.catalogo_nombre, c.marca], q, sp.contiene !== "1"));
  const ordenadas = ordenarEnMemoria(filtradas, sp, {
    sku: (c) => c.sku, cuenta: (c) => c.cuenta, situacion: (c) => TEXTO_SITUACION[c.situacion], precio: (c) => c.precio, ptw: (c) => c.ptw,
    ganador: (c) => c.ganador, baja: (c) => bajaPct(c), visto: (c) => new Date(c.visto_ts).getTime(),
  });
  const filas = paginarEnMemoria(ordenadas, sp);
  const pesos = (x: number | null) => (x == null ? "—" : formatearNumero(x, "entero"));

  return (
    <Pantalla titulo="Catálogos que armó ML" ancho="max-w-[99rem]"
      subtitulo="Publicaciones de catálogo que Mercado Libre creó solo en tus cuentas: si el catálogo es el mismo producto, cómo les va y qué conviene hacer.">
      <Avisos sp={sp} />
      <Pestanas items={[
        { clave: "revisar", texto: "Para revisar", href: "/catalogo/catalogos-ml", activa: ver === "revisar", cuenta: revisar.length },
        { clave: "todos", texto: "Todos", href: "/catalogo/catalogos-ml?ver=todos", activa: ver === "todos", cuenta: todos.length },
      ]} />
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
    </Pantalla>
  );
}
