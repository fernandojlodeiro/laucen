// Informes › Monitoreo de precios y publicaciones (pedido de Fer, 12/10;
// lib/monitoreo/publicaciones.ts): de cada producto, sus publicaciones activas de
// Mercado Libre en un cuadro — planes en filas, cuentas en columnas —, quién gana
// cada plan, a qué precio y con qué % OFF (la cucarda). Sólo para mirar.

import Link from "next/link";
import { paginarEnMemoria } from "@/lib/lista";
import { formatear } from "@/lib/moneda";
import { caminoDeFamilia } from "@/lib/erp/familias";
import { monitoreo, nombrePlan, type Bloque, type Celda } from "@/lib/monitoreo/publicaciones";
import { Paginado } from "@/app/componentes/Lista";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, Avisos, CAJA, url } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { MarcaCatalogo } from "@/app/catalogo/publicaciones/lista";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { LISTA_MONITOREO, filtrosMonitoreo, TEXTO_RECUADRO } from "./lista";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; familia?: string; canal?: string; raro?: string; p?: string; ok?: string; error?: string };

const $ = (n: number | null) => (n == null ? "—" : formatear(n, "ARS"));

export default async function Monitoreo({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_publicaciones_ver");
  const sp = await searchParams;
  const f = filtrosMonitoreo(sp);
  const [{ bloques, cuentas }, camino] = await Promise.all([monitoreo(s.org.id, f), caminoDeFamilia(s.org.id, f.familia ?? null)]);
  const pagina = paginarEnMemoria(bloques, sp);
  const columnas = f.canal ? cuentas.filter((c) => c.id === f.canal) : cuentas;
  const nombre = new Map(cuentas.map((c) => [c.id, c.nombre]));

  return (
    <Pantalla titulo="Monitoreo de precios y publicaciones"
      subtitulo="De cada producto, sus publicaciones activas en Mercado Libre: en cada plan, qué cuenta gana, a qué precio y con qué % OFF"
      acciones={<AccionesExcel lista={LISTA_MONITOREO} org={s.org.id} />}>
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q ?? ""} comienza={f.contiene !== false} placeholder="Buscar SKU, título o publicación" limpiar={["p"]} />
        <ElegirFamilia parametro="familia" valor={f.familia ?? null} etiqueta={camino} vacio="Todas las familias" className="w-72" />
        <FiltroVivo parametro="canal" valor={f.canal ? String(f.canal) : ""} etiqueta="Cuenta" limpiar={["p"]}>
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <CasillaViva parametro="raro" activo={!!f.raro} etiqueta="Sólo los que tienen algo para mirar"
          ayuda="Gana una cuenta que no es la del esquema, o en un mismo plan unas publicaciones tienen % OFF y otras no" />
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-3">
        <span className="inline-block rounded px-1 bg-[#E3F4EA] text-[#1F6E4A] font-semibold">★ gana</span> = la más barata del plan (la que el comprador ve primero).
        La cucarda es el <b>% OFF</b> que ve el comprador por la campaña. ⚠ = según el esquema de precios tendría que ganar otra cuenta.
        Sólo publicaciones activas. {bloques.length} producto{bloques.length === 1 ? "" : "s"}.
      </p>
      {pagina.length === 0 && <div className={`${CAJA} text-xs text-[#5C6B76]`}>No hay publicaciones activas con esos filtros.</div>}
      <div className="grid gap-3">
        {pagina.map((b) => <Cuadro key={b.variacionId} b={b} columnas={columnas} nombre={nombre} />)}
      </div>
      <Paginado total={bloques.length} />
    </Pantalla>
  );
}

function Cuadro({ b, columnas, nombre }: { b: Bloque; columnas: { id: number; nombre: string }[]; nombre: Map<number, string> }) {
  return (
    <section className={`${CAJA} !p-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[#E3E9F0] bg-[#F7F9FB]">
        <span className="flex items-center gap-2 min-w-0">
          <FotosProducto fotos={b.foto ? [b.foto] : []} titulo={b.sku} />
          <Link href={url(`/catalogo/productos/${b.productoId}`, { seccion: "publicaciones" })} className="font-mono text-xs text-[#16577F] hover:underline">{b.sku}</Link>
          <span className="text-xs truncate">{b.titulo}</span>
        </span>
        <span className="text-xs">Clásica de la lista: <b>{$(b.clasica)}</b></span>
      </div>
      {b.raro.length > 0 && <div className="px-3 py-1 text-[11px] text-[#8a6100] bg-[#FFF8E5]">⚠ {b.raro.join(" · ")}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#5C6B76]">
              <th className="text-left px-3 py-1.5 font-semibold w-28">Plan</th>
              {columnas.map((c) => <th key={c.id} data-canal={c.id} className="text-right px-3 py-1.5 font-semibold whitespace-nowrap">{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {b.planes.map((pl) => (
              <tr key={pl.plan} className="border-t border-[#E3E9F0] align-top">
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                  {nombrePlan(pl.plan)}
                  {pl.deberia && !pl.conExcepcion && pl.ganador != null && pl.ganador !== pl.deberia && pl.celdas[pl.deberia] && (
                    <span className="block text-[10px] font-normal text-[#8a6100]" title="Según Precios en ML › Planes de cuotas">⚠ tendría que ganar {nombre.get(pl.deberia)}</span>
                  )}
                </td>
                {columnas.map((c) => (
                  <td key={c.id} data-canal={c.id} className="px-3 py-1.5 text-right">
                    {(pl.celdas[c.id] ?? []).length === 0 ? <span className="text-[#C9D3DD]">—</span>
                      : pl.celdas[c.id].map((x) => <Casillero key={x.pubId} c={x} />)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Casillero({ c }: { c: Celda }) {
  return (
    <div className={`inline-block rounded px-1.5 py-0.5 ${c.gana ? "bg-[#E3F4EA] ring-1 ring-[#1F6E4A]" : ""}`}>
      <span className="whitespace-nowrap">
        {c.gana && <span className="text-[#1F6E4A] mr-0.5" title="Gana: la más barata del plan">★</span>}
        <b className={c.gana ? "text-[#1F6E4A]" : ""}>{$(c.precio)}</b>
      </span>
      <span className="block text-[10px] whitespace-nowrap">
        {c.off != null
          ? <span className="rounded px-1 bg-[#00A650] text-white font-semibold" title={`Tachado ${$(c.tachado)}`}>{c.off}% OFF</span>
          : <span className="text-[#5C6B76]">sin % OFF</span>}
      </span>
      <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap">
        <Link href={historialPublicacion(c.itemId)} className="font-mono hover:underline">{c.itemId}</Link>{" "}
        <a href={enlaceMl(c.itemId)} target="_blank" rel="noopener noreferrer" className="hover:underline">↗</a>
      </span>
      {c.catalogo && (
        <span className="block text-[10px] whitespace-nowrap"><MarcaCatalogo /> {c.recuadro && <span className="text-[#5C6B76]">{TEXTO_RECUADRO[c.recuadro] ?? c.recuadro}</span>}</span>
      )}
    </div>
  );
}
