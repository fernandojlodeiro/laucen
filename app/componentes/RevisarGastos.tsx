// La lista para revisar y clasificar los gastos de Mercado Pago (lib/mercadopago/gastos.ts):
// la usan el espacio personal y Administración › Mercado Pago › Gastos. Cada
// movimiento con su tipo de gasto, a quién corresponde y por qué; el lápiz
// convierte la fila en sus campos (tipo de gasto, a quién corresponde,
// recurrencia y, si se quiere, guardarlo como regla para ese destinatario o
// texto). Filtros: qué ver, mes y buscador.

import Link from "next/link";
import { formatear } from "@/lib/moneda";
import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, Estado, url } from "@/app/componentes/erp";
import { LAPIZ } from "@/app/componentes/erp";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { Paginado } from "@/app/componentes/Lista";
import { paginarEnMemoria } from "@/lib/lista";
import { coincideBusqueda } from "@/lib/busqueda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { CATEGORIAS, NO_GASTO, AMBITOS, RECURRENCIAS, mesAr, type Clasificado } from "@/lib/mercadopago/gastos";

export type SpRevisar = { ver?: string; mes?: string; q?: string; contiene?: string; p?: string; editar?: string; ok?: string; error?: string };
export const OPCIONES_CATEGORIA = [...CATEGORIAS, ...NO_GASTO].map((texto, i) => ({ id: i + 1, texto }));

const plata = (n: number) => formatear(n, "ARS");
const fecha = (d: Date | null) => (d ? new Date(d).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export default function RevisarGastos({ filas, sp, base, accion, empresa }: {
  filas: Clasificado[]; sp: SpRevisar; base: string; accion: (fd: FormData) => Promise<void>; empresa: boolean;
}) {
  const ver = sp.ver ?? (empresa ? "candidatos" : "sin");
  const q = sp.q ?? "", comienza = sp.contiene !== "1";
  const meses = [...new Set(filas.map((f) => mesAr(f.fecha)))].sort().reverse();
  const elegidas = filas
    .filter((f) => ver === "todos" ? true : ver === "gastos" ? f.es_gasto : ver === "no-gasto" ? !f.es_gasto : ver === "candidatos" ? !!f.posible_personal : ver === "personales" ? f.es_gasto && f.ambito_gasto === "personal" : f.es_gasto && f.categoria === "Sin clasificar")
    .filter((f) => !sp.mes || mesAr(f.fecha) === sp.mes)
    .filter((f) => !q || coincideBusqueda([f.api_descripcion, f.descripcion, f.contraparte, f.categoria, f.cuenta, f.movimiento_id], q, comienza))
    .sort((a, b) => +(b.fecha ?? 0) - +(a.fecha ?? 0));
  const pagina = paginarEnMemoria(elegidas, sp);
  const aqui = (extra: Record<string, string | null>) => url(base, { ver, mes: sp.mes ?? null, q: q || null, contiene: sp.contiene ?? null, p: sp.p ?? null, ...extra });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <FiltroVivo parametro="ver" valor={ver} etiqueta="Qué ver" limpiar={["p", "editar"]}>
          <option value="sin">Gastos sin clasificar</option>
          {empresa && <option value="candidatos">Posibles gastos personales</option>}
          {empresa && <option value="personales">Marcados como personales</option>}
          <option value="gastos">Todos los gastos</option>
          <option value="no-gasto">Lo que no es gasto</option>
          <option value="todos">Todos los movimientos</option>
        </FiltroVivo>
        <FiltroVivo parametro="mes" valor={sp.mes ?? ""} etiqueta="Mes" limpiar={["p", "editar"]}>
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{m}</option>)}
        </FiltroVivo>
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar descripción, destinatario, categoría…" limpiar={["p", "editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <th className={TH}>Fecha</th><th className={TH}>Cuenta</th><th className={TH}>Descripción</th><th className={THN}>Importe</th>
            <th className={TH}>Tipo de gasto</th><th className={TH}>A quién corresponde</th><th className={TH}>Recurrencia</th><th className={TH}>Por qué</th><th className={TH} />
          </tr></thead>
          <tbody>
            {pagina.map((f) => {
              const id = `${f.conexion_id}:${f.clave}`;
              const desc = f.api_descripcion || f.descripcion || f.tipo_original;
              if (sp.editar === id) {
                return (
                  <tr key={id} className={`${TR} bg-[#F7FAFC]`}>
                    <td className={TD}>{fecha(f.fecha)}</td><td className={TD}>{f.cuenta}</td>
                    <td className={TD}>{desc}{f.contraparte && <span className="block text-[11px] text-[#5C6B76]">cuenta {f.contraparte}</span>}</td>
                    <td className={TDN}>{plata(f.importe_neto)}</td>
                    <td className={TD} colSpan={5}>
                      <form action={accion} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="conexion" value={f.conexion_id} /><input type="hidden" name="clave" value={f.clave} />
                        <input type="hidden" name="volver" value={aqui({ editar: null })} />
                        <input type="hidden" name="contraparte" value={f.contraparte ?? ""} /><input type="hidden" name="lado" value={f.ambito_cuenta} />
                        <ElegirDeLista name="categoria" opciones={OPCIONES_CATEGORIA} valor={OPCIONES_CATEGORIA.find((o) => o.texto === f.categoria)?.id ?? null} etiqueta="Tipo de gasto" className="w-60" />
                        <select name="ambito" defaultValue={f.ambito_gasto} className={CAMPO} aria-label="A quién corresponde">
                          {AMBITOS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select name="recurrencia" defaultValue={f.recurrencia} className={CAMPO} aria-label="Recurrencia">
                          {RECURRENCIAS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="regla" value="1" />
                          {f.contraparte ? "Aplicar a todo lo de este destinatario" : "Aplicar a todo lo que diga:"}
                        </label>
                        {!f.contraparte && <input name="texto" defaultValue={(f.api_descripcion || f.descripcion || "").slice(0, 30)} className={`${CAMPO} w-48`} aria-label="Texto de la regla" />}
                        <button className={PRIMARIO}>Grabar</button>
                        <Link href={aqui({ editar: null })} className={SUAVE}>Cancelar</Link>
                      </form>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={id} className={TR}>
                  <td className={TD}>{fecha(f.fecha)}</td><td className={TD}>{f.cuenta}</td>
                  <td className={TD}>{desc}{f.contraparte && <span className="block text-[11px] text-[#5C6B76]">cuenta {f.contraparte}</span>}</td>
                  <td className={TDN}>{plata(f.importe_neto)}</td>
                  <td className={TD}>{f.categoria === "Sin clasificar" ? <Estado texto="Sin clasificar" tono="amarillo" /> : f.categoria}</td>
                  <td className={TD}>{f.ambito_gasto}{f.posible_personal && <span className="block text-[11px] text-[#8a5a00]">¿personal? {f.posible_personal}</span>}</td>
                  <td className={TD}>{f.recurrencia}</td>
                  <td className={`${TD} text-[11px] text-[#5C6B76]`}>{f.origen}</td>
                  <td className={TD}><Link href={aqui({ editar: id })} scroll={false} className={LAPIZ} aria-label="Clasificar" title="Clasificar">✎</Link></td>
                </tr>
              );
            })}
            {!pagina.length && <tr className={TR}><td className={TD} colSpan={9}>No hay movimientos con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginado total={elegidas.length} />
    </div>
  );
}
