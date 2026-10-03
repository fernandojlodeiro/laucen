// Piezas comunes de las pantallas del cimiento del ERP (orden 136): la
// entrada (sesión + permiso + tablas), el encabezado de pantalla, las clases
// de tablas y campos, y los avisos de error/ok que llegan por la dirección.
// Todo sin JavaScript en el navegador; los que lo necesitan están en
// app/radar/Cliente.tsx (TachoConfirmar, BotonEnviar, Pestanas) y
// app/componentes/CampoNumero.tsx.

import Link from "next/link";
import { redirect } from "next/navigation";
import { sesionRequerida, type Sesion } from "@/lib/tenancy";
import { tienePermiso, type PermisoKey } from "@/lib/permisos";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { monedaVista, type Moneda } from "@/lib/moneda";
import Camino, { type Paso } from "@/app/componentes/Camino";
import { VERDE, SUAVE } from "@/app/botones";

/** Entrada común a toda pantalla del ERP: tablas aseguradas, sesión, permiso
 *  de la función (si falta, vuelve al panel) y la moneda en que ve el usuario. */
export async function entrarErp(permiso: PermisoKey): Promise<Sesion & { moneda: Moneda }> {
  await asegurarEsquemaErp();
  const sesion = await sesionRequerida();
  if (!tienePermiso(sesion.permisos, permiso)) redirect("/panel");
  const moneda = await monedaVista(sesion.usuario.id, sesion.org.id);
  return { ...sesion, moneda };
}

/** El encabezado de toda pantalla: el camino arriba a la izquierda (sección ›
 *  pantalla, de lib/menu.ts; una ficha suma sus partes en `camino`), el
 *  título, y a la derecha las acciones (el botón "Nuevo …" va acá). */
export function Pantalla({ titulo, subtitulo, acciones, camino, children, ancho = "max-w-6xl" }: {
  titulo: React.ReactNode; subtitulo?: React.ReactNode; acciones?: React.ReactNode; camino?: Paso[]; children: React.ReactNode; ancho?: string;
}) {
  return (
    <main className={`${ancho} mx-auto p-4 sm:p-6`}>
      <header className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <Camino extra={camino} />
          <h1 className="text-lg font-bold">{titulo}</h1>
          {subtitulo && <p className="text-xs text-[#5C6B76]">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </header>
      {children}
    </main>
  );
}

/** Los avisos que dejan las acciones en la dirección (?ok=… / ?error=…). */
export function Avisos({ sp }: { sp: { ok?: string; error?: string } }) {
  return (
    <>
      {sp.error && <p role="alert" className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FDF1EF] text-[#C03420]">{sp.error}</p>}
      {sp.ok && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF7F1] text-[#1F6E4A]">{sp.ok}</p>}
    </>
  );
}

export const TABLA = "w-full text-xs";
export const CAJA_TABLA = "bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto";
export const THEAD = "text-[#5C6B76] bg-[#FAFBFC] border-b border-[#E3E9F0]";
export const TH = "py-1.5 px-2 text-left whitespace-nowrap font-semibold";
export const THN = "py-1.5 px-2 text-right whitespace-nowrap font-semibold";
export const TR = "border-t border-[#E3E9F0] align-middle";
export const TD = "py-1.5 px-2";
export const TDN = "py-1.5 px-2 text-right whitespace-nowrap tabular-nums";
export const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
export const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
export const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
/** El lápiz de editar (AGENTS.md: editar es un lápiz, nunca la palabra). */
export const LAPIZ = "inline-block text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F]";

export function Lapiz({ href, etiqueta = "Editar" }: { href: string; etiqueta?: string }) {
  return <Link href={href} className={LAPIZ} aria-label={etiqueta} title={etiqueta} scroll={false}>✏️</Link>;
}

/** Las fichas abren en modo vista (AGENTS.md): se edita con `?editar=ficha`
 *  (no un número: en la misma pantalla, `?editar=<id>` es el lápiz de una fila). */
export const EDITAR_FICHA = "ficha";
export const editandoFicha = (sp: { editar?: string }, clave: string = EDITAR_FICHA) => sp.editar === clave;

/** El título de una sección de ficha con sus botones (lápiz / Grabar) a la derecha. */
export function TituloSeccion({ titulo, children }: { titulo: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h2 className="text-sm font-bold">{titulo}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Los botones de una ficha, arriba a la derecha (en `acciones` de Pantalla,
 *  al lado de "Nuevo …"): en vista, el lápiz; editando, "Grabar" —que manda
 *  el formulario de la ficha desde el encabezado con el atributo `form`— y
 *  "Cancelar", que vuelve a la vista sin grabar. */
export function BotonesFicha({ editando, ver, editar, form = "ficha" }: { editando: boolean; ver: string; editar: string; form?: string }) {
  if (!editando) return <Lapiz href={editar} />;
  return (
    <>
      <button type="submit" form={form} className={VERDE}>Grabar</button>
      <Link href={ver} className={SUAVE} scroll={false}>Cancelar</Link>
    </>
  );
}

/** Un dato de una ficha en modo vista: la etiqueta y el valor (sin campos).
 *  Vacío, una raya. Los números, a la derecha. */
export function Dato({ etiqueta, children, numero = false, ayuda, className = "" }: {
  etiqueta: React.ReactNode; children?: React.ReactNode; numero?: boolean; ayuda?: React.ReactNode; className?: string;
}) {
  const vacio = children == null || children === "" || children === false;
  return (
    <div className={className}>
      <span className={ETIQUETA}>{etiqueta}</span>
      <div className={`text-xs py-1.5 min-h-[30px] break-words ${numero ? "text-right tabular-nums" : ""}`}>
        {vacio ? <span className="text-[#5C6B76]">—</span> : children}
      </div>
      {ayuda && <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayuda}</span>}
    </div>
  );
}

/** Un estado dibujado como etiqueta (no se clickea). */
export function Estado({ texto, tono = "gris" }: { texto: string; tono?: "verde" | "gris" | "amarillo" | "rojo" | "azul" }) {
  const colores = {
    verde: "bg-[#EEF7F1] text-[#1F6E4A]", gris: "bg-[#EEF1F4] text-[#5C6B76]", amarillo: "bg-[#FFF8E5] text-[#8a6100]",
    rojo: "bg-[#FDF1EF] text-[#C03420]", azul: "bg-[#EEF3F8] text-[#16577F]",
  };
  return <span className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap ${colores[tono]}`}>{texto}</span>;
}

/** Arma una dirección con parámetros (los vacíos no van). */
export function url(base: string, params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Patrón ILIKE del buscador (BuscadorVivo): `q` al principio del texto, o en
 *  cualquier parte si "Comienza por" está destildada. Sin texto, null. */
export function patronBusqueda(q: string, comienza: boolean): string | null {
  return q ? `${comienza ? "" : "%"}${q.replace(/[\\%_]/g, "\\$&")}%` : null;
}

/** Lo mismo que patronBusqueda pero en memoria (listas que ya se traen enteras, como un árbol). */
export function coincideBusqueda(texto: string | null | undefined, q: string, comienza: boolean): boolean {
  if (!q) return true;
  const t = (texto ?? "").toLowerCase(), b = q.toLowerCase();
  return comienza ? t.startsWith(b) : t.includes(b);
}
