// Configuraciones de una lista: las de "Descargar Excel" (?tipo=excel) o las
// vistas de la pantalla (?tipo=vista). Cada una = un nombre y qué columnas,
// en qué orden, del catálogo de la pantalla. La de siempre ("Como en
// pantalla" / "Estándar") no se toca.

import { notFound } from "next/navigation";
import { TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import { configsDe, esTipoConfig } from "@/lib/listas/config";
import { camposDe, ETIQUETA_DEFECTO } from "@/lib/listas/tipos";
import { LISTAS } from "@/app/listas/registro";
import EditorColumnas from "./EditorColumnas";
import { accionGuardarConfig, accionBorrarConfig } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { tipo?: string; editar?: string; volver?: string; ok?: string; error?: string };

export default async function Configurar({ params, searchParams }: { params: Promise<{ pantalla: string }>; searchParams: Promise<SP> }) {
  const { pantalla } = await params;
  const lista = Object.hasOwn(LISTAS, pantalla) ? LISTAS[pantalla] : null;
  if (!lista) notFound();
  const s = await entrarErp(lista.permiso);
  const sp = await searchParams;
  const tipo = esTipoConfig(sp.tipo) && (sp.tipo === "excel" || lista.vistas) ? sp.tipo : "excel";
  const volver = sp.volver && (sp.volver === lista.ruta || sp.volver.startsWith(`${lista.ruta}?`)) ? sp.volver : lista.ruta;
  const editar = Number(sp.editar) || 0;
  const [todos, configs] = await Promise.all([camposDe(lista, { org: s.org.id, moneda: s.moneda }), configsDe(s.org.id, pantalla, tipo)]);
  const catalogo = todos.map(({ clave, titulo }) => ({ clave, titulo }));
  const titulo = new Map(todos.map((c) => [c.clave, c.titulo]));
  const aqui = url(`/listas/${pantalla}/configurar`, { tipo, volver });
  const ocultos = (extra: Record<string, string>) => ({ pantalla, tipo, volver, aqui, ...extra });
  const columnasTexto = (claves: string[]) => claves.map((k) => titulo.get(k)).filter(Boolean).join(" · ") || "—";
  const nuevo = tipo === "excel" ? "Nueva configuración" : "Nueva vista";

  return (
    <Pantalla titulo={tipo === "excel" ? `Excel de ${lista.titulo}` : `Vistas de ${lista.titulo}`}
      subtitulo={tipo === "excel"
        ? "Qué columnas, y en qué orden, baja «Descargar Excel». Se elige en el desplegable al lado del botón."
        : "Qué columnas, y en qué orden, se ven en la pantalla. Se elige en «Vista», arriba de la tabla."}
      camino={[{ texto: lista.titulo, href: volver }, { texto: tipo === "excel" ? "Configurar Excel" : "Configurar vistas" }]}
      acciones={<BotonNuevo texto={nuevo} />} ancho="max-w-4xl">
      <Avisos sp={sp} />
      <AltaNueva texto={nuevo} sinBoton>
        <EditorColumnas catalogo={catalogo} elegidas={lista.enPantalla} nombre="" accion={accionGuardarConfig}
          ocultos={ocultos({})} cancelar={aqui} />
      </AltaNueva>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Nombre</th><th className={TH}>Columnas</th><th /></tr>
          </thead>
          <tbody>
            <tr className={TR}>
              <td className={`${TD} font-semibold whitespace-nowrap`}>{ETIQUETA_DEFECTO[tipo]} <Estado texto="De siempre" /></td>
              <td className={`${TD} text-[#5C6B76]`}>
                {tipo === "excel" && lista.vistas ? "Las de la vista que se está viendo" : columnasTexto(lista.enPantalla)}
              </td>
              <td />
            </tr>
            {configs.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={3} className={TD}>
                  <EditorColumnas catalogo={catalogo} elegidas={c.columnas} nombre={c.nombre} accion={accionGuardarConfig}
                    ocultos={ocultos({ id: String(c.id), aqui: url(`/listas/${pantalla}/configurar`, { tipo, volver, editar: c.id }) })} cancelar={aqui} />
                </td>
              </tr>
            ) : (
              <tr key={c.id} className={TR}>
                <td className={`${TD} font-semibold`}>{c.nombre}</td>
                <td className={`${TD} text-[#5C6B76]`}>{columnasTexto(c.columnas)}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(`/listas/${pantalla}/configurar`, { tipo, volver, editar: c.id })} etiqueta="Cambiar nombre y columnas" />
                    <TachoConfirmar accion={accionBorrarConfig} campos={ocultos({ id: String(c.id) })} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {configs.length === 0 && (
        <p className="text-[11px] text-[#5C6B76] mt-2">Todavía no hay ninguna guardada: armá la primera con «{nuevo}».</p>
      )}
    </Pantalla>
  );
}
