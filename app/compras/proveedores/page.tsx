// Proveedores: tabla aparte de clientes (ver db/compras.sql). Se cargan a
// mano o desde el archivo "Clientes y proveedores" de Virtual Seller
// (Configuración → Importar datos). Las facturas de compra y los despachos
// los hace la sesión de Compras.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { CONDICIONES_IVA } from "@/app/ventas/formato";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { accionBorrarProveedor, accionCrearProveedor, accionGuardarProveedor } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; editar?: string; ok?: string; error?: string };
type Proveedor = {
  id: number; nombre: string; razon_social: string | null; cuit: string | null; condicion_iva: string | null; pais: string;
  email: string | null; telefono: string | null; contacto: string | null; calle: string | null; localidad: string | null;
  provincia: string | null; moneda: string; condiciones_pago: string | null; notas: string | null; estado: string;
};

/** Los campos del proveedor, para el alta y para la fila en edición. */
function Campos({ p }: { p?: Proveedor }) {
  const campo = (k: keyof Proveedor, etiqueta: string, ancho = "w-full") => (
    <label><span className={ETIQUETA}>{etiqueta}</span>
      <input name={k} defaultValue={(p?.[k] as string | null) ?? ""} className={`${CAMPO} ${ancho}`} /></label>
  );
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 items-start">
      {campo("nombre", "Nombre")}
      {campo("razon_social", "Razón social")}
      {campo("cuit", "CUIT")}
      <label><span className={ETIQUETA}>Condición IVA</span>
        <select name="condicion_iva" defaultValue={p?.condicion_iva ?? ""} className={`${CAMPO} w-full`}>
          <option value="">Sin cargar</option>
          {Object.entries(CONDICIONES_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      {campo("contacto", "Contacto")}
      {campo("email", "Mail")}
      {campo("telefono", "Teléfono")}
      {campo("pais", "País (AR, CN…)")}
      {campo("calle", "Dirección")}
      {campo("localidad", "Localidad")}
      {campo("provincia", "Provincia")}
      <label><span className={ETIQUETA}>Moneda habitual</span>
        <select name="moneda" defaultValue={p?.moneda ?? "ARS"} className={`${CAMPO} w-full`}>
          <option value="ARS">Pesos</option><option value="USD">Dólares</option>
        </select></label>
      <label className="col-span-2"><span className={ETIQUETA}>Condiciones de pago</span>
        <input name="condiciones_pago" defaultValue={p?.condiciones_pago ?? ""} placeholder="Ej. 30 % anticipo, saldo contra embarque" className={`${CAMPO} w-full`} /></label>
      <label className="col-span-2"><span className={ETIQUETA}>Notas</span>
        <input name="notas" defaultValue={p?.notas ?? ""} className={`${CAMPO} w-full`} /></label>
    </div>
  );
}

export default async function Proveedores({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("proveedores_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const editar = Number(sp.editar) || 0;
  const filas = await consulta<Proveedor>(`
    select id::int, nombre, razon_social, cuit, condicion_iva, pais, email, telefono, contacto, calle, localidad, provincia,
           moneda, condiciones_pago, notas, estado
      from proveedor
     where organizacion_id = $1
       and ($2 = '' or nombre ilike '%' || $2 || '%' or razon_social ilike '%' || $2 || '%' or email ilike '%' || $2 || '%'
            or regexp_replace(coalesce(cuit, ''), '\\D', '', 'g') like '%' || nullif(regexp_replace($2, '\\D', '', 'g'), '') || '%')
     order by estado, nombre limit 300`, [s.org.id, q]);
  const aqui = (extra: Record<string, string | number | null>) => url("/compras/proveedores", { q: q || null, ...extra });

  return (
    <Pantalla titulo="Proveedores" subtitulo="A quién le comprás. Se cargan a mano o desde el archivo de Virtual Seller (Configuración → Importar datos).">
      <Avisos sp={sp} />
      <form className="flex gap-2 mb-3">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, razón social, CUIT o mail" className={`${CAMPO} flex-1 max-w-md`} />
        <button className={SUAVE}>Buscar</button>
      </form>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Proveedor</th><th className={TH}>CUIT</th><th className={TH}>IVA</th><th className={TH}>Contacto</th><th className={TH}>Moneda</th><th className={TH}>Estado</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>{q ? "No hay proveedores con esa búsqueda." : "Todavía no hay proveedores."}</td></tr>}
            {filas.map((p) => editar === p.id ? (
              <tr key={p.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={7} className={TD}>
                  <form action={accionGuardarProveedor} className="grid gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Campos p={p} />
                    <div className="flex gap-2 items-center">
                      <select name="estado" defaultValue={p.estado} className={CAMPO} aria-label="Estado">
                        <option value="activo">Activo</option><option value="archivado">Archivado</option>
                      </select>
                      <button className={VERDE}>Guardar</button>
                      <Link href={aqui({})} className={SUAVE}>Cancelar</Link>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={p.id} className={TR}>
                <td className={TD}><b>{p.nombre}</b>{p.razon_social && p.razon_social !== p.nombre && <span className="block text-[11px] text-[#5C6B76]">{p.razon_social}</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>{p.cuit ?? "—"}{p.pais !== "AR" && <span className="text-[#5C6B76]"> · {p.pais}</span>}</td>
                <td className={TD}>{p.condicion_iva ? CONDICIONES_IVA[p.condicion_iva as keyof typeof CONDICIONES_IVA] ?? p.condicion_iva : "—"}</td>
                <td className={TD}>{[p.contacto, p.email, p.telefono].filter(Boolean).join(" · ") || "—"}</td>
                <td className={TD}>{p.moneda === "USD" ? "Dólares" : "Pesos"}</td>
                <td className={TD}><Estado texto={p.estado === "activo" ? "Activo" : "Archivado"} tono={p.estado === "activo" ? "verde" : "gris"} /></td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={aqui({ editar: p.id })} />
                    <TachoConfirmar accion={accionBorrarProveedor} campos={{ id: String(p.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className={`${CAJA} group`}>
        <summary className="cursor-pointer list-none text-sm font-bold flex items-center gap-2">
          <span className={PRIMARIO}>Proveedor nuevo</span>
        </summary>
        <form action={accionCrearProveedor} className="grid gap-2 mt-3">
          <Campos />
          <div><button className={VERDE}>Crear</button></div>
        </form>
      </details>
    </Pantalla>
  );
}
