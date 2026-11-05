// Sourcing › Market Pro › Descarga y llave (Fer, 5/11): la llave de la API, qué categorías se bajan y cómo va la
// descarga (lib/marketpro/motor.ts).

import { PRIMARIO, SUAVE } from "@/app/botones";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { Avisos, BotonesFicha, CAJA, CAJA_TABLA, CAMPO, Dato, ETIQUETA, Estado, Pantalla, TABLA, TD, TDN, TH, THEAD, THN, TR, TituloSeccion, editandoFicha, entrarErp } from "@/app/componentes/erp";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { avance } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { PRIMER_DIA, PRIMER_MES } from "@/lib/marketpro/motor";
import { tienePermiso } from "@/lib/permisos";
import { BarraMarketPro, entero } from "../piezas";
import { avanceVendedores } from "@/lib/marketpro/vendedores";
import { accionVendedores, accionActualizar, accionBorrarLlave, accionGrabarLlave, accionPausar, accionQuitarCategoria, accionSumarCategoria } from "./acciones";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function DescargaMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const puede = tienePermiso(s.permisos, "market_pro_config");
  const editando = puede && editandoFicha(sp, "llave");
  const [estado, a, vend] = await Promise.all([estadoMarketPro(s.org.id), avance(s.org.id), avanceVendedores(s.org.id)]);
  const estadoMotor = !estado ? { texto: "Sin llave", tono: "gris" as const }
    : estado.pausado ? { texto: estado.error ? "Frenada por la llave" : "En pausa", tono: "rojo" as const }
    : estado.trabajando ? { texto: "Bajando…", tono: "azul" as const }
    : a.cola.pendientes ? { texto: "Esperando la próxima vuelta", tono: "ambar" as const }
    : { texto: "Al día", tono: "verde" as const };

  return (
    <Pantalla titulo="Market Pro: descarga y llave" ancho="max-w-6xl"
      subtitulo={`Market Pro (Real Trends) da las ventas de Mercado Libre por publicación: por mes desde ${PRIMER_MES.slice(4)}/${PRIMER_MES.slice(0, 4)} y por día desde ${PRIMER_DIA.split("-").reverse().join("/")}, de las categorías que habilita la llave.`}
      acciones={puede ? <BotonNuevo texto="Nueva categoría" /> : undefined}>
      <BarraMarketPro activa="descarga" sp={sp} />
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva categoría" sinBoton>
        <form action={accionSumarCategoria} className="flex flex-wrap items-end gap-3">
          <label className="w-64"><span className={ETIQUETA}>Número de la categoría de Mercado Libre</span>
            <input name="categoria" required className={`${CAMPO} w-full`} placeholder="MLA1652" /></label>
          <button className={PRIMARIO}>Sumar</button>
          <p className="basis-full text-[11px] text-[#5C6B76]">Las que habilita la llave se encuentran solas al cargarla; esto es por si hace falta otra. Si la llave no la habilita, Market Pro no devuelve nada.</p>
        </form>
      </AltaNueva>

      <section className={`${CAJA} mb-4`}>
        <TituloSeccion titulo="Llave de la API">
          {puede && <BotonesFicha editando={editando} ver="/market-pro/descarga" editar="/market-pro/descarga?editar=llave" form="llave" />}
          {puede && estado && !editando && <TachoConfirmar accion={accionBorrarLlave} campos={{}} pregunta="¿Borrar la llave? Lo ya bajado queda" />}
        </TituloSeccion>
        {editando ? (
          <form id="llave" action={accionGrabarLlave} className="max-w-xl">
            <label><span className={ETIQUETA}>Llave (X-API-Key)</span>
              <input name="llave" type="password" autoComplete="off" spellCheck={false} required className={`${CAMPO} w-full font-mono`}
                placeholder={estado ? "Ya hay una cargada: pegá otra sólo para cambiarla" : "Pegá la llave que te dio Market Pro"} /></label>
            <p className="text-[11px] text-[#5C6B76] mt-1">Antes de grabarla se prueba con Market Pro. No se vuelve a mostrar nunca.</p>
          </form>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Dato etiqueta="Llave">{estado ? `Cargada el ${estado.cargada}` : null}</Dato>
            <Dato etiqueta="Descarga"><Estado texto={estadoMotor.texto} tono={estadoMotor.tono} />{estado?.ultimoLatido ? <span className="ml-2 text-[#5C6B76]">última vuelta {estado.ultimoLatido}</span> : null}</Dato>
            <Dato etiqueta="Pedidos hechos a Market Pro" numero>{entero(a.cola.pedidos)}</Dato>
          </div>
        )}
        {estado?.error && <p className="text-xs mt-2 rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">Último error ({estado.errorTs}): {estado.error}</p>}
        {estado && puede && !editando && (
          <div className="flex flex-wrap gap-2 mt-3">
            <BotonTarea accion={accionActualizar} tipo="marketpro-actualizar" clase={SUAVE} texto="Sumar lo nuevo ahora" />
            <BotonTarea accion={accionVendedores} tipo="marketpro-vendedores" clase={SUAVE} texto="Descubrir vendedores ahora" />
            <form action={accionPausar}><input type="hidden" name="pausar" value={estado.pausado ? "0" : "1"} />
              <button className={SUAVE}>{estado.pausado ? "Seguir bajando" : "Pausar la descarga"}</button></form>
          </div>
        )}
      </section>

      <p className="text-xs mb-4">
        <b>Vendedores identificados:</b> {entero(vend.ok)} de {entero(vend.total)}{vend.trabajando ? " (buscando…)" : ""}, cruzando {entero(vend.catalogos_leidos)} catálogos leídos de Mercado Libre.
        {" "}{entero(vend.sin_catalogo)} no tienen publicaciones de catálogo y Mercado Libre no deja saber quiénes son por otra vía: para ésos sirve el alias que les pongas en Market Pro.
        {vend.no_encontrado > 0 && ` ${entero(vend.no_encontrado)} venden en catálogo pero todavía no alcanza para asegurar quiénes son (mejora a medida que se leen más catálogos).`}
      </p>

      <TituloSeccion titulo={`Categorías que se bajan (${a.categorias.length})`} />
      {a.cola.arbol && <p className="text-xs mb-2">Leyendo el árbol de categorías de Mercado Libre: {a.cola.arbol}.</p>}
      {a.cola.probando > 0 && <p className="text-xs mb-2">Probando qué categorías habilita la llave: faltan {entero(a.cola.probando)}.</p>}
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <th className={TH}>Categoría</th><th className={TH}>Habilitada</th><th className={THN} title="Publicaciones del último mes cerrado, con o sin ventas">Pubs. último mes</th>
            <th className={THN}>Meses bajados</th><th className={THN} title="Tandas de 30 días">Días bajados</th><th className={THN}>Filas</th><th className={THN}>En cola</th><th className={THN}>Con error</th><th className={TH}></th>
          </tr></thead>
          <tbody>
            {a.categorias.map((c) => (
              <tr key={c.category_id} className={TR}>
                <td className={TD}>{c.ruta ?? "—"} <span className="text-[#5C6B76]">(MLA{c.category_id})</span></td>
                <td className={TD}><Estado texto={c.habilitada ? "Sí" : c.habilitada === false ? "No" : "Sin probar"} tono={c.habilitada ? "verde" : c.habilitada === false ? "rojo" : "gris"} /></td>
                <td className={TDN}>{entero(c.publicaciones)}</td>
                <td className={TDN}>{c.meses_listos} de {c.meses_total}</td><td className={TDN}>{c.dias_listos} de {c.dias_total}</td>
                <td className={TDN}>{entero(c.filas)}</td><td className={TDN}>{entero(c.pendientes)}</td><td className={TDN}>{entero(c.errores)}</td>
                <td className={TD}>{puede && <TachoConfirmar accion={accionQuitarCategoria} campos={{ categoria: String(c.category_id) }} pregunta="¿Dejar de bajarla?" />}</td>
              </tr>
            ))}
            {!a.categorias.length && <tr className={TR}><td className={TD} colSpan={9}>{estado ? "Todavía ninguna: se encuentran solas después de leer el árbol de categorías." : "Cargá la llave para empezar."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-4">
        En total: {entero(a.venta.filas)} filas de ventas de {entero(a.venta.pubs)} publicaciones; {entero(a.cola.pendientes)} tandas en cola.
        Market Pro atiende una consulta por vez y devuelve de a 100 filas: lo grande tarda horas y sigue solo de fondo, aunque cierres la pantalla.
        Cada mañana se suma lo del día anterior y el mes en curso.
      </p>

      {a.errores.length > 0 && (
        <>
          <TituloSeccion titulo={`Tandas con error (${a.errores.length})`} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Tanda</th><th className={TH}>Motivo</th></tr></thead>
              <tbody>{a.errores.map((e) => <tr key={e.id} className={TR}><td className={TD}>{e.clave}</td><td className={TD}>{e.error ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-1">«Pausar» y después «Seguir bajando» las vuelve a probar.</p>
        </>
      )}
    </Pantalla>
  );
}
