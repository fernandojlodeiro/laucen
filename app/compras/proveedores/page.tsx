// Proveedores: tabla aparte de clientes (ver db/compras.sql). Se cargan a
// mano o desde el archivo "Clientes y proveedores" de Virtual Seller
// (Configuración → Importar datos). Las facturas de compra y los despachos
// los hace la sesión de Compras.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { CONDICIONES_IVA } from "@/app/ventas/formato";
import { cuitLegible } from "@/lib/cuit";
import { telefonoConAclaracion, telefonoLegible } from "@/lib/telefono";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_PROVEEDORES, FACTURAS_PROVEEDOR } from "./lista";
import { accionBorrarProveedor, accionCrearProveedor, accionGuardarProveedor } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; editar?: string; id?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Proveedor = {
  id: number; nombre: string; razon_social: string | null; cuit: string | null; condicion_iva: string | null; pais: string;
  email: string | null; telefono: string | null; telefono_aclaracion: string | null; telefono_movil: string | null;
  telefono_movil_aclaracion: string | null; contacto: string | null; calle: string | null; localidad: string | null;
  provincia: string | null; moneda: string; condiciones_pago: string | null; notas: string | null; estado: string; facturas?: number;
};

/** Los campos del proveedor, para el alta y para la fila en edición. */
function Campos({ p }: { p?: Proveedor }) {
  const campo = (k: keyof Proveedor, etiqueta: string, ancho = "w-full") => (
    <label><span className={ETIQUETA}>{etiqueta}</span>
      <input name={k} defaultValue={k === "cuit" ? cuitLegible(p?.cuit) : k === "telefono" || k === "telefono_movil" ? telefonoLegible(p?.[k]) : (p?.[k] as string | null) ?? ""} className={`${CAMPO} ${ancho}`} autoFocus={k === "nombre"} /></label>
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
      {campo("telefono_aclaracion", "Interno / aclaración")}
      {campo("telefono_movil", "Celular")}
      {campo("telefono_movil_aclaracion", "Interno / aclaración del celular")}
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
  const comienza = sp.contiene !== "1";
  const editar = Number(sp.editar) || 0;
  // ?id= muestra un solo proveedor (a donde llevan los enlaces de otras pantallas).
  const soloId = Number(sp.id) || 0;
  const FACTURAS = FACTURAS_PROVEEDOR;
  const base = await LISTA_PROVEEDORES.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<Proveedor>({
    campos: `pr.id::int, pr.nombre, pr.razon_social, pr.cuit, pr.condicion_iva, pr.pais, pr.email, pr.telefono, pr.telefono_aclaracion, pr.telefono_movil, pr.telefono_movil_aclaracion, pr.contacto, pr.calle,
             pr.localidad, pr.provincia, pr.moneda, pr.condiciones_pago, pr.notas, pr.estado, ${FACTURAS}::int facturas`,
    desde: base.desde,
    donde: base.donde,
    orden: leerOrden(sp, {
      id: "pr.id", nombre: "pr.nombre", cuit: "pr.cuit", iva: "pr.condicion_iva", contacto: "pr.contacto", moneda: "pr.moneda",
      facturas: FACTURAS, estado: "pr.estado",
    }, base.orden),
  }, base.valores, sp);
  const aqui = (extra: Record<string, string | number | null>) => url("/compras/proveedores", { q: q || null, contiene: comienza ? null : "1", id: soloId || null, p: sp.p, orden: sp.orden, dir: sp.dir, ...extra });

  return (
    <Pantalla titulo="Proveedores" subtitulo="A quién le comprás. Se cargan a mano o desde el archivo de Virtual Seller (Configuración → Importar datos)."
      acciones={<><AccionesExcel lista={LISTA_PROVEEDORES} org={s.org.id} /><BotonNuevo texto="Nuevo proveedor" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo proveedor" sinBoton>
        <form action={accionCrearProveedor} className="grid gap-2">
          <Campos />
          <div><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar en todos los datos del proveedor" limpiar={["editar", "id"]} />
        {soloId > 0 && <Link href="/compras/proveedores" className="text-xs text-[#16577F] hover:underline">Ver todos los proveedores</Link>}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n desc={false}>N.º</ThOrden><ThOrden col="nombre">Proveedor</ThOrden><ThOrden col="cuit">CUIT</ThOrden><ThOrden col="iva">IVA</ThOrden>
              <ThOrden col="contacto">Contacto</ThOrden><ThOrden col="moneda">Moneda</ThOrden><ThOrden col="facturas" n>Facturas</ThOrden><ThOrden col="estado" porDefecto>Estado</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{q ? "No hay proveedores con esa búsqueda." : "Todavía no hay proveedores."}</td></tr>}
            {filas.map((p) => editar === p.id ? (
              <tr key={p.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={9} className={TD}>
                  <form action={accionGuardarProveedor} className="grid gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <span className="text-[11px] font-semibold text-[#5C6B76]">Proveedor N.º {p.id}</span>
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
                <td className={`${TDN} text-[#5C6B76]`}><Link href={aqui({ id: p.id, q: null, p: null })} className="hover:underline">{p.id}</Link></td>
                <td className={TD}><Link href={aqui({ id: p.id, q: null, p: null })} className="font-semibold text-[#16577F] hover:underline">{p.nombre}</Link>{p.razon_social && p.razon_social !== p.nombre && <span className="block text-[11px] text-[#5C6B76]">{p.razon_social}</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>{p.cuit ? cuitLegible(p.cuit) : "—"}{p.pais !== "AR" && <span className="text-[#5C6B76]"> · {p.pais}</span>}</td>
                <td className={TD}>{p.condicion_iva ? CONDICIONES_IVA[p.condicion_iva as keyof typeof CONDICIONES_IVA] ?? p.condicion_iva : "—"}</td>
                <td className={TD}>{[p.contacto, telefonoConAclaracion(p.telefono, p.telefono_aclaracion), telefonoConAclaracion(p.telefono_movil, p.telefono_movil_aclaracion)].filter(Boolean).join(" · ")}{p.email && <>{p.contacto || p.telefono || p.telefono_movil ? " · " : ""}<a href={`mailto:${p.email}`} className="hover:text-[#16577F] hover:underline">{p.email}</a></>}{!p.contacto && !p.email && !p.telefono && !p.telefono_movil && "—"}</td>
                <td className={TD}>{p.moneda === "USD" ? "Dólares" : "Pesos"}</td>
                <td className={TDN}>{p.facturas ? <Link href={url("/compras/facturas", { proveedor: p.id })} className="text-[#16577F] hover:underline">{p.facturas}</Link> : 0}</td>
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
      <Paginado total={total} />
    </Pantalla>
  );
}
