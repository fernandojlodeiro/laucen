// Productos: el listado con buscador y filtros, y el alta mínima (SKU base,
// título, tipo, familia) que lleva a la ficha. Un producto simple o kit nace
// con su variación default (la crea sola la base).

import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { accionCrearProducto } from "./acciones";
import { opcionesFamilias, TIPOS_PRODUCTO, ESTADOS_PRODUCTO } from "./comun";
import { LISTA_PRODUCTOS, filtrosProductos } from "./lista";
import { verInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

type SP = { q?: string; estado?: string; familia?: string; tipo?: string; inactivos?: string; kitvs?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Productos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  const { q, comienza, estado, tipo, familia, kitVs } = filtrosProductos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [familias, vista] = await Promise.all([opcionesFamilias(s.org.id), paginaDeVista(LISTA_PRODUCTOS, ctx, sp)]);

  const hayFiltro = q || estado || tipo || familia || verInactivos(sp) || kitVs;
  return (
    <Pantalla titulo="Productos" subtitulo="Cada producto con sus variaciones, kits, fotos, cucardas, precios y stock"
      acciones={<><AccionesExcel lista={LISTA_PRODUCTOS} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo producto" /></>}>
      <Avisos sp={sp} />

      <AltaNueva texto="Nuevo producto" sinBoton>
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

      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_PRODUCTOS} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos."}
        claseFila={(p) => `hover:bg-[#FAFBFC] ${p._estado === "archivado" ? "opacity-60 text-[#5C6B76]" : ""}`} />
    </Pantalla>
  );
}
