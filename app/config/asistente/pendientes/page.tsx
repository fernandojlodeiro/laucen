// Configuración → Asistente → Pedidos sin resolver (pedido de Fer, 3/10): lo
// que le pidieron HACER al asistente y no está entre sus acciones. Lo decide
// el superadministrador: "Mandar a programar" lo deja como orden en la
// bitácora para una sesión de Code; "Descartar" lo saca de la lista.

import Link from "next/link";
import { redirect } from "next/navigation";
import { consultaPaginada } from "@/lib/lista";
import { sosVos } from "@/lib/admin";
import { Paginado } from "@/app/componentes/Lista";
import { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { PRIMARIO, APAGAR } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, CAMPO } from "@/app/componentes/erp";
import { PestanasAsistente } from "../comun";
import { accionMandarAProgramar, accionDescartarPendiente } from "../acciones";

export const dynamic = "force-dynamic";

type SP = { estado?: string; p?: string; ok?: string; error?: string };
const ESTADOS = { nuevo: ["Nuevo", "amarillo"], mandado: ["Mandado a programar", "azul"], descartado: ["Descartado", "gris"] } as const;
type Fila = { id: number; creado: string; persona: string; pedido: string; estado: keyof typeof ESTADOS; conversacion_id: number | null; bitacora_id: number | null };

export default async function PendientesAsistente({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("asistente_config");
  const esFer = await sosVos();
  if (!s.superadmin && !esFer) redirect("/config/asistente");
  const sp = await searchParams;
  const estado = sp.estado && Object.hasOwn(ESTADOS, sp.estado) ? sp.estado : sp.estado === "todos" ? "" : "nuevo";
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `p.id::int, to_char(p.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado,
             coalesce(nullif(u.nombre, ''), u.email) persona, p.pedido, p.estado, p.conversacion_id::int, p.bitacora_id::int`,
    desde: "asistente_pendiente p join usuarios u on u.id = p.usuario_id",
    donde: "p.organizacion_id = $1 and ($2 = '' or p.estado = $2)",
    orden: "p.creado_ts desc, p.id desc",
  }, [s.org.id, estado], sp);

  return (
    <Pantalla titulo="Asistente" subtitulo="Lo que le pidieron hacer al asistente y todavía no sabe: decidí qué se programa" ancho="max-w-6xl">
      <Avisos sp={sp} />
      <PestanasAsistente org={s.org.id} permisos={s.permisos} superadmin activa="pendientes" />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <FiltroVivo parametro="estado" valor={estado || "todos"} etiqueta="Estado" limpiar={["p"]}>
          <option value="nuevo">Nuevos</option>
          <option value="mandado">Mandados a programar</option>
          <option value="descartado">Descartados</option>
          <option value="todos">Todos</option>
        </FiltroVivo>
        <p className="text-[11px] text-[#5C6B76]">«Mandar a programar» lo deja como orden en la bitácora para que una sesión de Code le enseñe al asistente a hacerlo.</p>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={`${TH} text-right`}>Fecha</th><th className={TH}>Persona</th><th className={TH}>Qué pidió</th><th className={TH}>Estado</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>{estado === "nuevo" ? "No hay pedidos nuevos." : "No hay pedidos."}</td></tr>}
            {filas.map((f) => {
              const [texto, tono] = ESTADOS[f.estado];
              return (
                <tr key={f.id} className={TR}>
                  <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>{f.creado}</td>
                  <td className={TD}>{f.persona}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>
                    {f.pedido}
                    {f.conversacion_id && <Link href={url("/config/asistente/historial", { id: f.conversacion_id })} className="ml-1 text-[11px] text-[#16577F] hover:underline">ver la conversación</Link>}
                  </td>
                  <td className={TD}>
                    <Estado texto={texto} tono={tono} />
                    {f.bitacora_id && <div className="text-[10px] text-[#5C6B76]">Orden N.º {f.bitacora_id} en la bitácora</div>}
                  </td>
                  <td className={`${TD} text-right`}>
                    {f.estado === "nuevo" && (
                      <span className="inline-flex flex-wrap justify-end items-center gap-1">
                        <form action={accionMandarAProgramar} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={f.id} />
                          <input name="nota" placeholder="Nota (opcional)" aria-label="Nota para quien lo programe" className={`${CAMPO} w-40`} />
                          <button className={PRIMARIO}>Mandar a programar</button>
                        </form>
                        <BotonConfirmar accion={accionDescartarPendiente} campos={{ id: String(f.id) }} clase={APAGAR} texto="Descartar" pregunta="¿Descartar?" corriendo="Descartando…" />
                      </span>
                    )}
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
