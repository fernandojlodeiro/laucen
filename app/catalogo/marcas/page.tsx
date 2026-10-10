// Catálogo › Marcas (pedido de Fer, 10/10): la tabla de marcas, para que no se
// escriban mal y sirvan de filtro (lib/catalogo/marcas.ts). Cambiarle el nombre
// a una por el de otra que ya existe las une.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, Lapiz, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, url } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_MARCAS, PRODUCTOS_MARCA } from "./lista";
import { accionBorrarMarca, accionCrearMarca, accionGuardarMarca } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string; nuevo?: string };

export default async function Marcas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const c = await LISTA_MARCAS.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<{ id: number; nombre: string; productos: number }>({
    campos: `m.id::int, m.nombre, ${PRODUCTOS_MARCA}::int productos`,
    desde: c.desde, donde: c.donde,
    orden: leerOrden(sp, { id: "m.id", nombre: "lower(m.nombre)", productos: PRODUCTOS_MARCA }, c.orden),
  }, c.valores, sp);

  return (
    <Pantalla titulo="Marcas" subtitulo="Las marcas de los productos: se eligen de esta lista, así no se escriben mal" ancho="max-w-3xl"
      acciones={<><AccionesExcel lista={LISTA_MARCAS} org={s.org.id} /><BotonNuevo texto="Nueva marca" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva marca" sinBoton>
        <form action={accionCrearMarca} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre (ej. Sonoff)" maxLength={60} className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar marca" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><ThOrden col="id" n>N.º</ThOrden><ThOrden col="nombre" porDefecto>Marca</ThOrden><ThOrden col="productos" n>Productos</ThOrden><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna marca coincide." : "Todavía no hay marcas."}</td></tr>}
            {filas.map((m) => editar === m.id ? (
              <tr key={m.id} className={`${TR} bg-[#FAFBFC]`}>
                <td className={TDN}>{m.id}</td>
                <td colSpan={3} className={TD}>
                  <form action={accionGuardarMarca} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="nombre" defaultValue={m.nombre} maxLength={60} className={`${CAMPO} flex-1 min-w-40`} autoFocus />
                    <button className={VERDE}>Guardar</button>
                    <Link href={url("/catalogo/marcas", filtros)} className={SUAVE}>Cancelar</Link>
                    <span className="w-full text-[10px] text-[#5C6B76]">Si le ponés el nombre de otra marca que ya existe, se unen: sus productos pasan a esa.</span>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={m.id} className={TR}>
                <td className={TDN}>{m.id}</td>
                <td className={TD}>{m.nombre}</td>
                <td className={TDN}>
                  {m.productos ? <Link href={url("/catalogo/productos", { marca: m.id })} className="text-[#16577F] hover:underline">{m.productos}</Link> : 0}
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url("/catalogo/marcas", { ...filtros, editar: m.id })} />
                    <TachoConfirmar accion={accionBorrarMarca} campos={{ id: String(m.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
