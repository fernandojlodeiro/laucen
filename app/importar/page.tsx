// Importar datos desde Excel (orden 136, §10): subir, mapear columnas,
// previsualizar, ejecutar e informe. Acá: subir y la lista de las anteriores.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { DESTINOS, ESTADOS_IMPORTACION, esDestino } from "@/lib/importar/campos";
import Subir from "./Subir";
import { accionBorrarImportacion } from "./acciones";

export const dynamic = "force-dynamic";
// Leer un Excel de decenas de miles de filas puede tardar.
export const maxDuration = 300;

export default async function Importar({ searchParams }: { searchParams: Promise<{ p?: string; orden?: string; dir?: string; ok?: string; error?: string }> }) {
  const s = await entrarErp("importar_ver");
  const sp = await searchParams;
  const { filas, total } = await consultaPaginada<{
    id: number; creado_ts: Date; archivo: string; hoja: string | null; destino: string; estado: keyof typeof ESTADOS_IMPORTACION;
    filas_total: number; filas_ok: number; filas_error: number;
  }>({
    campos: "id::int, creado_ts, archivo, hoja, destino, estado, filas_total, filas_ok, filas_error",
    desde: "importacion", donde: "organizacion_id = $1",
    orden: leerOrden(sp, {
      fecha: "creado_ts", archivo: "archivo", destino: "destino", estado: "estado", total: "filas_total", ok: "filas_ok", error: "filas_error",
    }, "creado_ts desc, id desc"),
  }, [s.org.id], sp);

  return (
    <Pantalla titulo="Importar datos" subtitulo="Productos, clientes, ventas históricas y stock inicial desde un Excel" ancho="max-w-5xl">
      <Avisos sp={sp} />
      <Link href="/importar/virtualseller" className="block mb-3 rounded-xl border border-[#16577F] bg-[#EEF3F8] px-3 py-2 text-xs text-[#16577F] hover:underline">
        <b>Productos desde Virtual Seller + Mercado Libre</b>: stock, maestro y lista de precios de VS cruzados con tus publicaciones →
      </Link>
      <Subir organizacionId={s.org.id} destinos={Object.entries(DESTINOS).map(([clave, d]) => ({ clave, nombre: d.nombre }))} />
      <p className="text-[11px] text-[#5C6B76] mt-2 mb-5">
        La primera fila del Excel tiene que tener los nombres de las columnas. Después de subirlo elegís qué columna va a cada campo, mirás cómo queda y lo ejecutás.
      </p>

      <h2 className="text-sm font-bold mb-2">Importaciones anteriores</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" n porDefecto>Fecha</ThOrden><ThOrden col="archivo">Archivo</ThOrden><ThOrden col="destino">Qué</ThOrden><ThOrden col="estado">Estado</ThOrden>
              <ThOrden col="total" n>Filas</ThOrden><ThOrden col="ok" n>Importadas</ThOrden><ThOrden col="error" n>Rechazadas</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Todavía no se importó nada.</td></tr>}
            {filas.map((f) => {
              const [texto, tono] = ESTADOS_IMPORTACION[f.estado] ?? [f.estado, "gris"];
              return (
                <tr key={f.id} className={TR}>
                  <td className={TDN}><Link href={`/importar/${f.id}`} className="hover:underline">{fechaHora(f.creado_ts)}</Link></td>
                  <td className={TD}>
                    <Link href={`/importar/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.archivo}</Link>
                    {f.hoja && <span className="text-[#5C6B76]"> · {f.hoja}</span>}
                  </td>
                  <td className={TD}>{esDestino(f.destino) ? DESTINOS[f.destino].nombre : f.destino}</td>
                  <td className={TD}><Estado texto={texto} tono={tono} /></td>
                  <td className={TDN}>{f.filas_total.toLocaleString("es-AR")}</td>
                  <td className={TDN}>{f.filas_ok.toLocaleString("es-AR")}</td>
                  <td className={TDN}>{f.filas_error.toLocaleString("es-AR")}</td>
                  <td className={`${TD} text-right`}>
                    <TachoConfirmar accion={accionBorrarImportacion} campos={{ id: String(f.id) }} pregunta="¿Borrar el registro? (lo importado queda)" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
