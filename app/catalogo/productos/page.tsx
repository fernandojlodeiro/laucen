// Productos: el listado con buscador y filtros, y el alta mínima (SKU base,
// título, tipo, familia) que lleva a la ficha. Un producto simple o kit nace
// con su variación default (la crea sola la base).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import AltaNueva from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, patronBusqueda,
} from "@/app/componentes/erp";
import { accionCrearProducto } from "./acciones";
import { opcionesFamilias, EstadoProducto, TIPOS_PRODUCTO, ESTADOS_PRODUCTO } from "./comun";
import { verInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

type SP = { q?: string; estado?: string; familia?: string; tipo?: string; inactivos?: string; kitvs?: string; contiene?: string; ok?: string; error?: string };

export default async function Productos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const estado = sp.estado && Object.hasOwn(ESTADOS_PRODUCTO, sp.estado) ? sp.estado : "";
  const tipo = sp.tipo && Object.hasOwn(TIPOS_PRODUCTO, sp.tipo) ? sp.tipo : "";
  const familia = Number(sp.familia) || 0;
  // Los inactivos (archivados) sólo con la caja tildada, o si se los pide por estado.
  const inactivos = verInactivos(sp) || estado === "archivado";
  const kitVs = sp.kitvs === "1";
  const familias = await opcionesFamilias(s.org.id);

  // Stock disponible total = suma, por variación y depósito activo, de
  // stock_disponible_deposito (un kit se calcula desde sus componentes).
  const filas = await consulta<{
    id: number; sku_base: string; titulo: string; familia: string | null; tipo: string; estado: string; kit_vs: boolean; variaciones: number; disponible: number;
  }>(`
    select p.id::int, p.sku_base, p.titulo, f.nombre familia, p.tipo, p.estado, p.kit_vs,
           (select count(*) from variacion v where v.producto_id = p.id)::int variaciones,
           (select coalesce(sum(stock_disponible_deposito(p.organizacion_id, v.id, d.id)), 0)
              from variacion v cross join deposito d
             where v.producto_id = p.id and d.organizacion_id = p.organizacion_id and d.estado = 'activo')::int disponible
      from producto p left join familia f on f.id = p.familia_id
     where p.organizacion_id = $1
       and ($2::text is null or p.sku_base ilike $2 or p.titulo ilike $2 or p.marca ilike $2 or p.codigo_barras ilike $2
            or exists (select 1 from variacion v where v.producto_id = p.id and (v.sku ilike $2 or v.codigo_barras ilike $2)))
       and ($3 = '' or p.estado = $3)
       and ($4 = '' or p.tipo = $4)
       and ($5 = 0 or p.familia_id = $5)
       and ($6 or p.estado <> 'archivado')
       and (not $7 or p.kit_vs)
     order by p.titulo
     limit 300`, [s.org.id, patronBusqueda(q, comienza), estado, tipo, familia, inactivos, kitVs]);

  const hayFiltro = q || estado || tipo || familia || verInactivos(sp) || kitVs;
  return (
    <Pantalla titulo="Productos" subtitulo="Cada producto con sus variaciones, kits, fotos, cucardas, precios y stock">
      <Avisos sp={sp} />

      <AltaNueva texto="Nuevo producto" className="mb-4">
        <form action={accionCrearProducto} className="flex flex-wrap items-end gap-2">
          <label><span className={ETIQUETA}>SKU base</span><input name="sku_base" className={`${CAMPO} w-32`} autoFocus /></label>
          <label className="flex-1 min-w-48"><span className={ETIQUETA}>Título</span><input name="titulo" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Tipo</span>
            <select name="tipo" className={CAMPO} defaultValue="simple">
              {Object.entries(TIPOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <label><span className={ETIQUETA}>Familia</span>
            <select name="familia_id" className={CAMPO} defaultValue="">
              <option value="">Sin familia</option>
              {familias.map((f) => <option key={f.id} value={f.id}>{f.etiqueta}</option>)}
            </select>
          </label>
          <button className={PRIMARIO}>Crear</button>
          <span className="text-[11px] text-[#5C6B76] self-center">Al crearlo se abre su ficha.</span>
        </form>
      </AltaNueva>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} inactivos={verInactivos(sp)} placeholder="Buscar por SKU, título, marca o código de barras" />
        <FiltroVivo parametro="estado" valor={estado} etiqueta="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="familia" valor={familia ? String(familia) : ""} etiqueta="Familia">
          <option value="">Todas las familias</option>
          {familias.map((f) => <option key={f.id} value={f.id}>{f.etiqueta}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </FiltroVivo>
        <CasillaViva parametro="kitvs" activo={kitVs} etiqueta="Kits de Virtual Seller" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>SKU base</th><th className={TH}>Título</th><th className={TH}>Familia</th><th className={TH}>Tipo</th>
              <th className={THN}>Variaciones</th><th className={THN}>Disponible</th><th className={TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos."}</td></tr>
            )}
            {filas.map((p) => (
              <tr key={p.id} className={`${TR} hover:bg-[#FAFBFC] ${p.estado === "archivado" ? "opacity-60 text-[#5C6B76]" : ""}`}>
                <td className={`${TD} font-mono whitespace-nowrap`}><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F] font-semibold">{p.sku_base}</Link></td>
                <td className={TD}><Link href={`/catalogo/productos/${p.id}`} className="hover:underline">{p.titulo}</Link>
                  {p.kit_vs && <span className="ml-1.5"><Estado texto="Kit VS" tono="azul" /></span>}</td>
                <td className={`${TD} text-[#5C6B76]`}>{p.familia ?? "—"}</td>
                <td className={TD}>{TIPOS_PRODUCTO[p.tipo] ?? p.tipo}</td>
                <td className={TDN}>{p.variaciones}</td>
                <td className={`${TDN} ${p.disponible < 0 ? "text-[#C03420]" : ""}`}>{p.disponible.toLocaleString("es-AR")}</td>
                <td className={TD}><EstadoProducto estado={p.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 300 && <p className="text-xs text-[#5C6B76] mt-2">Se muestran los primeros 300. Afiná la búsqueda para ver el resto.</p>}
    </Pantalla>
  );
}
