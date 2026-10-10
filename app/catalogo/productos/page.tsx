// Productos: el listado con buscador y filtros, y el alta mínima (SKU base,
// título, tipo, familia) que lleva a la ficha. Un producto simple o kit nace
// con su variación default (la crea sola la base).

import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { accionCrearProducto } from "./acciones";
import { siguienteSku } from "@/lib/catalogo/sku";
import { TIPOS_PRODUCTO, ESTADOS_PRODUCTO } from "./comun";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { caminoDeFamilia } from "@/lib/erp/familias";
import { LISTA_PRODUCTOS, filtrosProductos } from "./lista";
import { verInactivos } from "@/app/componentes/Inactivos";
import { una } from "@/lib/erp/base";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import FamiliaConLupa from "./FamiliaConLupa";
import { opcionesMarcas } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

type SP = { q?: string; estado?: string; familia?: string; marca?: string; tipo?: string; inactivos?: string; kitvs?: string; sinpublicar?: string; sinpubcanal?: string; webcanal?: string; webver?: string; sinfotos?: string; sincanal?: string; nopub?: string; pub?: string; encuentas?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Productos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  const { q, comienza, estado, tipo, familia, marca, kitVs, sinPublicar, sinFotos, sinPublicarEn, sinCanal, webCanal, webVer, noPublicable, publicables, enCuentas } = filtrosProductos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [caminoFamilia, vista, cuentas, marcas] = await Promise.all([caminoDeFamilia(s.org.id, familia), paginaDeVista(LISTA_PRODUCTOS, ctx, sp),
    una<{ n: number }>("select count(*)::int n from canal where organizacion_id = $1 and tipo = 'mercadolibre' and estado = 'activo'", [s.org.id]),
    opcionesMarcas(s.org.id).catch(() => [])]);
  const cuentasMl = cuentas?.n ?? 0;

  // El SKU que sigue al más alto (lib/catalogo/sku.ts), para el alta.
  const skuSugerido = await siguienteSku(s.org.id).catch(() => "");
  const hayFiltro = q || estado || tipo || familia || marca || verInactivos(sp) || kitVs || sinPublicar || sinFotos || sinPublicarEn || sinCanal || noPublicable || publicables || enCuentas != null;
  return (
    <Pantalla titulo="Productos" subtitulo="Cada producto con sus variaciones, kits, fotos, cucardas, precios y stock"
      acciones={<><AccionesExcel lista={LISTA_PRODUCTOS} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo producto" /></>}>
      <Avisos sp={sp} />

      <AltaNueva texto="Nuevo producto" sinBoton>
        <form action={accionCrearProducto} className="flex flex-wrap items-end gap-2">
          <label title="Sugerido: el que sigue al SKU más alto. Lo podés cambiar; no puede repetir uno que ya exista."><span className={ETIQUETA}>SKU base</span><input name="sku_base" defaultValue={skuSugerido} className={`${CAMPO} w-32`} autoFocus /></label>
          <label className="flex-1 min-w-48"><span className={ETIQUETA}>Título</span><input name="titulo" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Tipo</span>
            <select name="tipo" className={CAMPO} defaultValue="simple">
              {Object.entries(TIPOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <div className="w-80"><span className={ETIQUETA}>Familia</span><FamiliaConLupa name="familia_id" valor={null} etiqueta={null} /></div>
          <button className={PRIMARIO}>Crear</button>
          <span className="text-[11px] text-[#5C6B76] self-center">Al crearlo se abre su ficha. Sin familia, toma la que sugiere Mercado Libre para el título.</span>
        </form>
      </AltaNueva>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} inactivos={verInactivos(sp)} placeholder="Buscar por SKU, título, marca o código de barras" />
        <FiltroVivo parametro="estado" valor={estado} etiqueta="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </FiltroVivo>
        <ElegirFamilia parametro="familia" valor={familia || null} etiqueta={caminoFamilia} vacio="Todas las familias" className="w-72" />
        <ElegirDeLista parametro="marca" opciones={marcas} valor={marca || null} vacio="Todas las marcas" placeholder="Buscá la marca…" etiqueta="Marca" className="w-48" />
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </FiltroVivo>
        <CasillaViva parametro="kitvs" activo={kitVs} etiqueta="Kits de Virtual Seller" />
        <CasillaViva parametro="sinpublicar" activo={sinPublicar} etiqueta="Con stock y sin publicación activa en ML" />
        {sinPublicarEn > 0 && (
          <span className="text-xs bg-[#EEF3F8] rounded-md px-2 py-1">
            Con stock y sin publicar en una cuenta de ML <a href="/catalogo/productos" className="ml-1 text-[#16577F] font-bold" title="Quitar este filtro">✕</a>
          </span>
        )}
        {webCanal > 0 && webVer && (
          <span className="text-xs bg-[#EEF3F8] rounded-md px-2 py-1">
            {webVer === "activa" ? "Publicados en la web" : webVer === "apagado" ? "Con \"Publicado en Web\" apagado" : "Con stock y \"Publicado en Web\" apagado"}
            <a href="/catalogo/productos" className="ml-1 text-[#16577F] font-bold" title="Quitar este filtro">✕</a>
          </span>
        )}
        <CasillaViva parametro="sinfotos" activo={sinFotos} etiqueta="De la web, sin fotos" />
        <CasillaViva parametro="sincanal" activo={sinCanal} etiqueta="Sin publicar en ningún canal" />
        <CasillaViva parametro="pub" activo={publicables} etiqueta="Publicables" />
        <CasillaViva parametro="nopub" activo={noPublicable} etiqueta="No publicables" />
        {/* En cuántas cuentas de ML está publicado (activa o pausada), como la columna Publicaciones. */}
        <FiltroVivo parametro="encuentas" valor={enCuentas == null ? "" : String(enCuentas)} etiqueta="Cuentas de ML">
          <option value="">En cualquier cantidad de cuentas de ML</option>
          {Array.from({ length: cuentasMl + 1 }, (_, n) => (
            <option key={n} value={n}>{n === 0 ? "En ninguna cuenta de ML" : n === cuentasMl ? `En las ${n} cuentas de ML` : `En ${n} cuenta${n > 1 ? "s" : ""} de ML`}</option>
          ))}
        </FiltroVivo>
      </div>

      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_PRODUCTOS} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos."}
        claseFila={(p) => `hover:bg-[#FAFBFC] ${p._estado === "archivado" ? "opacity-60 text-[#5C6B76]" : ""}`} />
    </Pantalla>
  );
}
