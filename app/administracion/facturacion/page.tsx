// Facturación: los comprobantes emitidos (facturas y notas de crédito) con su
// estado en ARCA, filtros y reintento de los rechazados o con error.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { emisorDe, TIPOS_CBTE } from "@/lib/arca/facturar";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, url, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { ESTADOS_CBTE } from "./comun";
import { LISTA_FACTURACION, filtrosFacturacion } from "./lista";
import { accionReintentar } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { estado?: string; tipo?: string; desde?: string; hasta?: string; q?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Facturacion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const sp = await searchParams;
  const emisor = await emisorDe(s.org.id);

  const { q } = filtrosFacturacion(sp);
  const vista = await paginaDeVista(LISTA_FACTURACION, { org: s.org.id, moneda: s.moneda }, sp);
  const volver = url("/administracion/facturacion", { estado: sp.estado, tipo: sp.tipo, desde: sp.desde, hasta: sp.hasta, q: sp.q });
  const hayFiltro = !!(sp.estado || sp.tipo || sp.desde || sp.hasta || q);

  return (
    <Pantalla titulo="Facturación" subtitulo="Facturas y notas de crédito electrónicas de ARCA"
      acciones={<><AccionesExcel lista={LISTA_FACTURACION} org={s.org.id} vista={vista.activa?.id} /><Link href="/config/arca" className={SUAVE}>Configuración</Link></>}>
      <Avisos sp={sp} />
      {!emisor && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Todavía no están cargados los datos para facturar. <Link href="/config/arca" className="font-bold underline">Ir a Configuración</Link>
        </p>
      )}
      {emisor?.ambiente === "homologacion" && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF3F8] text-[#16577F]">Modo prueba contra ARCA: los comprobantes salen pero no tienen validez fiscal.</p>
      )}

      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_CBTE).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <select name="tipo" defaultValue={sp.tipo ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_CBTE).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select></label>
        <div><span className={ETIQUETA}>Fechas</span><RangoFechas desde={sp.desde ?? ""} hasta={sp.hasta ?? ""} vacio="Todas las fechas" etiqueta="" /></div>
        <label className="flex-1 min-w-48"><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Número, receptor, documento o CAE" className={`${CAMPO} w-full`} /></label>
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/administracion/facturacion" className={SUAVE}>Limpiar</Link>}
      </form>

      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_FACTURACION} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "Nada con esos filtros." : "Todavía no hay comprobantes."}
        acciones={(c) => (
          <>
            {c._estado === "autorizado" && <a href={`/administracion/facturacion/${c.id}/pdf`} target="_blank" rel="noopener" className={SUAVE}>PDF</a>}
            {(c._estado === "rechazado" || c._estado === "error") && (
              <form action={accionReintentar}>
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="volver" value={volver} />
                <BotonEnviar clase={SUAVE} corriendo="Mandando…">Reintentar</BotonEnviar>
              </form>
            )}
          </>
        )} />
    </Pantalla>
  );
}
