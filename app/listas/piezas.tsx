// Piezas de servidor de las listas configurables (lib/listas/tipos.ts): el
// botón "Descargar Excel" con sus configuraciones, y para las pantallas con
// vistas, la consulta de la página con las columnas de la vista elegida y la
// tabla que se dibuja desde el catálogo.

import type { ReactNode } from "react";
import { consultaPaginada } from "@/lib/lista";
import { formatear, enMoneda, tcParaVista, type Moneda } from "@/lib/moneda";
import { sesionActual } from "@/lib/tenancy";
import { formatearNumero } from "@/lib/numeros";
import { elegida } from "@/lib/listas/config";
import {
  alaDerecha, camposDe, elegir, ordenDe, seleccion, valorDe, type Campo, type Ctx, type CtxCelda, type Fila, type Lista, type SP,
} from "@/lib/listas/tipos";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import DescargarExcel from "@/app/componentes/DescargarExcel";
import SelectorVista from "@/app/componentes/SelectorVista";
import { CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN } from "@/app/componentes/erp";
import { fecha, fechaHora } from "@/app/ventas/formato";

/** "Descargar Excel" + el desplegable de configuraciones + "Configurar…". */
export async function AccionesExcel({ lista, org, vista, extra }: {
  lista: Lista; org: string; vista?: number | null; extra?: Record<string, string>;
}) {
  const { todas, activa } = await elegida(org, lista.pantalla, "excel");
  return (
    <DescargarExcel pantalla={lista.pantalla} ruta={lista.ruta} configs={todas.map(({ id, nombre }) => ({ id, nombre }))}
      inicial={activa?.id ?? null} vista={vista} extra={extra} />
  );
}

/** La vista elegida (la de la cookie o "Estándar") y sus columnas. */
export async function vistaDe(lista: Lista, ctx: Ctx) {
  const todos = await camposDe(lista, ctx);
  const { todas, activa } = await elegida(ctx.org, lista.pantalla, "vista");
  const campos = elegir(lista, todos, activa?.columnas);
  const selector = (
    <SelectorVista pantalla={lista.pantalla} ruta={lista.ruta} vistas={todas.map(({ id, nombre }) => ({ id, nombre }))} activa={activa?.id ?? null} />
  );
  return { todos, campos, activa, selector };
}

/** La página de una lista con vistas: las columnas de la vista elegida, los
 *  filtros de la pantalla y el orden por cualquier columna del catálogo. */
export async function paginaDeVista(lista: Lista, ctx: Ctx, sp: SP) {
  const v = await vistaDe(lista, ctx);
  const c = await lista.consulta!(ctx, sp);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: seleccion(v.campos, v.todos, lista.siempre), desde: c.desde, donde: c.donde, orden: ordenDe(v.todos, sp, c.orden),
  }, c.valores, sp);
  return { ...v, filas, total };
}

const dd = (s: string) => s.split("-").reverse().join("/");

/** Una celda sin dibujo propio: el valor según su formato. */
export function textoCampo(c: Campo, f: Fila, moneda: Moneda = "ARS", tc: number | null = null): string {
  const v = valorDe(c, f);
  if (v == null || v === "") return "—";
  switch (c.formato) {
    case "entero": return Number(v).toLocaleString("es-AR");
    case "pesos": {
      // En dólares: el importe en dólares de su día si la base lo guarda; si no, al tipo de cambio de hoy. Lo fiscal queda en pesos.
      if (moneda === "USD" && !c.fiscal) {
        const usd = f[`${c.clave}__usd`];
        return usd != null ? formatear(Number(usd), "USD") : enMoneda(v as number, moneda, tc);
      }
      return formatear(v as number, "ARS");
    }
    case "usd": return formatear(v as number, "USD");
    case "decimal": return formatearNumero(Number(v), "decimal");
    case "pct": return `${formatearNumero(Number(v), "pct")} %`;
    case "fecha": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dd(v) : fecha(v as Date);
    case "fechahora": {
      const m = typeof v === "string" ? v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/) : null;
      return m ? `${dd(m[1])} ${m[2]}` : fechaHora(v as Date);
    }
    case "sino": return v ? "Sí" : "No";
    default: return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

/** La tabla de una lista con vistas, dibujada desde el catálogo. Las
 *  acciones de la fila (lápiz, tacho…) van en la última columna; una fila en
 *  edición la dibuja `fila` (ocupa todo el ancho). */
export async function TablaVista({ lista, campos, filas, total, ctx, vacio, acciones, claseFila, fila, clave = "id" }: {
  lista: Lista; campos: Campo[]; filas: Fila[]; total: number; ctx: CtxCelda; vacio: ReactNode;
  acciones?: (f: Fila) => ReactNode; claseFila?: (f: Fila) => string;
  /** Reemplaza la fila entera (ej. la fila en edición): recibe cuántas columnas ocupa. */
  fila?: (f: Fila, columnas: number) => ReactNode | null;
  clave?: string;
}) {
  const org = ctx.moneda === "USD" ? (await sesionActual())?.org.id : null;
  const tc = org ? await tcParaVista(org, ctx.moneda) : null;
  ctx = { ...ctx, tc };
  const columnas = campos.length + (acciones ? 1 : 0);
  const ordenable = (c: Campo) => c.orden !== false && !!(c.orden || c.sql);
  return (
    <>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              {campos.map((c) => ordenable(c)
                ? <ThOrden key={c.clave} col={c.clave} n={alaDerecha(c)} desc={c.desc ?? alaDerecha(c)} porDefecto={lista.porDefecto === c.clave}>{c.titulo}</ThOrden>
                : <th key={c.clave} className={`${TH} ${alaDerecha(c) ? "text-right" : ""}`}>{c.titulo}</th>)}
              {acciones && <th />}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={columnas} className={`${TD} text-[#5C6B76]`}>{vacio}</td></tr>}
            {filas.map((f) => fila?.(f, columnas) ?? (
              <tr key={String(f[clave])} className={`${TR} ${claseFila?.(f) ?? ""}`}>
                {campos.map((c) => (
                  <td key={c.clave} className={alaDerecha(c) ? TDN : TD}>{c.celda ? c.celda(f, ctx) : textoCampo(c, f, ctx.moneda, tc)}</td>
                ))}
                {acciones && <td className={`${TD} text-right whitespace-nowrap`}>{acciones(f)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </>
  );
}
