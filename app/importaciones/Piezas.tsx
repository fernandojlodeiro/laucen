// Piezas de pantalla de Importaciones (sin JavaScript en el navegador).

import Link from "next/link";
import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso, type PermisoKey } from "@/lib/permisos";
import { asegurarEsquemaArca } from "@/lib/arca/esquema";
import { PRIMARIO, SUAVE } from "@/app/botones";

/** Entrada común: tablas creadas, sesión y permiso. */
export async function entrar(permiso: PermisoKey = "importaciones_ver") {
  await asegurarEsquemaArca();
  const sesion = await sesionRequerida();
  if (!tienePermiso(sesion.permisos, permiso)) redirect("/panel");
  return sesion;
}

const fmt0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export const usd = (v: number | null | undefined) => (v == null ? "—" : `${fmt0.format(v)}`);
export const usd2 = (v: number | null | undefined) => (v == null ? "—" : fmt2.format(v));
export const cant = (v: number | null | undefined) => (v == null ? "—" : fmt2.format(v));
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${fmt2.format(v * 100)}%`);
export const variacion = (v: number | null | undefined) =>
  v == null ? <span className="text-[#9AA7B3]">nuevo</span>
    : <span className={v >= 0 ? "text-[#1F6E4A]" : "text-[#C03420]"}>{v >= 0 ? "▲" : "▼"}{fmt0.format(Math.abs(v * 100))}%</span>;

/** Encabezado de columna que ordena la tabla (link que cambia `o`). */
export function Col({ texto, clave, orden, href, derecha = true }: {
  texto: string; clave?: string; orden?: string; href?: (o: string) => string; derecha?: boolean;
}) {
  const clase = `py-1.5 px-2 whitespace-nowrap ${derecha ? "text-right" : "text-left"}`;
  if (!clave || !href) return <th className={clase}>{texto}</th>;
  return (
    <th className={clase}>
      <Link href={href(clave)} className={`underline decoration-dotted ${orden === clave ? "text-[#16577F] font-bold" : ""}`}>
        {texto}{orden === clave ? " ▼" : ""}
      </Link>
    </th>
  );
}

export const TABLA = "w-full text-xs";
export const CAJA_TABLA = "bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto";
export const THEAD = "text-[#5C6B76] bg-[#FAFBFC] border-b border-[#E3E9F0]";
export const TR = "border-t border-[#E3E9F0] align-top";
export const TD = "py-1.5 px-2";
export const TDN = "py-1.5 px-2 text-right whitespace-nowrap tabular-nums";
export const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
export const ETIQUETA = "flex flex-col gap-1 text-[11px] text-[#5C6B76]";

export function LinkNcm({ ncm }: { ncm: string }) {
  return <Link href={`/importaciones/ncm?c=${encodeURIComponent(ncm)}`} className="text-[#16577F] underline whitespace-nowrap">{ncm}</Link>;
}

export function LinkImportador({ nombre }: { nombre: string }) {
  return <Link href={`/importaciones/importador?n=${encodeURIComponent(nombre)}`} className="text-[#16577F] underline">{nombre}</Link>;
}

/** Botón (link) de exportar a CSV. */
export function BotonCsv({ href }: { href: string }) {
  return <a href={href} className={SUAVE} download>⬇ Exportar CSV</a>;
}

/** Cuando todavía no se cargó nada de ARCA. */
export function SinDatos() {
  return (
    <section className="bg-white border border-[#E3E9F0] rounded-2xl px-4 py-10 text-center">
      <div className="text-2xl">🚢</div>
      <div className="text-sm font-semibold mt-2">Todavía no hay meses de ARCA cargados</div>
      <p className="text-xs text-[#5C6B76] mt-1 max-w-sm mx-auto">
        Los datos se cargan desde la PC donde están los ZIP. En la pestaña Cargas está qué hay y cómo se carga.
      </p>
      <div className="mt-4"><Link href="/importaciones/cargas" className={PRIMARIO}>Ver cargas</Link></div>
    </section>
  );
}
