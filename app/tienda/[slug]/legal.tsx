// Lo común de las páginas institucionales y legales de la tienda (Sobre
// nosotros, Términos y condiciones, Privacidad, Arrepentimiento): los datos
// del proveedor salen de la razón social principal y de lo cargado en
// Configuración → Tienda web; nada inventado.

import { una } from "@/lib/erp/base";
import { nombreTienda, type Tienda } from "@/lib/tienda/tienda";
import { CAJA } from "./piezas";

export type Proveedor = {
  nombre: string; razonSocial: string; cuit: string | null; domicilio: string | null; email: string | null; telefono: string | null;
};

const cuitLegible = (v: string) => (/^\d{11}$/.test(v) ? `${v.slice(0, 2)}-${v.slice(2, 10)}-${v.slice(10)}` : v);

/** Quién vende: la razón social principal de la organización más lo de la tienda. */
export async function proveedorDe(t: Tienda): Promise<Proveedor> {
  const e = await una<{ razon_social: string; cuit: string; domicilio: string | null }>(
    "select razon_social, cuit, domicilio from emisor where organizacion_id = $1 and es_principal", [t.organizacionId]);
  const nombre = nombreTienda(t);
  return {
    nombre, razonSocial: e?.razon_social ?? nombre, cuit: e ? cuitLegible(e.cuit) : null,
    domicilio: t.config.direccion || e?.domicilio || null, email: t.config.email || null, telefono: t.config.whatsapp || null,
  };
}

export const CONSUMIDOR_URL = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";

export function PaginaLegal({ titulo, ultima, children }: { titulo: string; ultima?: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <article className={`${CAJA} space-y-4 p-5 text-[var(--texto)] sm:p-8 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5`}>
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        {children}
        {ultima && <p className="pt-4 text-xs text-[var(--texto-2)]">Última actualización: {new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" })}.</p>}
      </article>
    </div>
  );
}

/** Los datos del proveedor, en una línea por dato. */
export function DatosProveedor({ p }: { p: Proveedor }) {
  return (
    <ul>
      <li><b>Razón social:</b> {p.razonSocial}</li>
      {p.cuit && <li><b>CUIT:</b> {p.cuit}</li>}
      {p.domicilio && <li><b>Domicilio:</b> {p.domicilio}</li>}
      {p.email && <li><b>Mail:</b> <a href={`mailto:${p.email}`} className="text-[var(--boton)] hover:underline">{p.email}</a></li>}
    </ul>
  );
}
