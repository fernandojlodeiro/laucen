// Ficha de un cliente: datos (sobre todo los fiscales, que es lo que más se
// corrige), direcciones, identidades por canal y sus pedidos.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { listasDePrecios } from "@/lib/precios";
import { enVista } from "@/lib/moneda";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { VERDE, SUAVE, PRIMARIO, DESPLEGABLE, FLECHA } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, TIPOS_CLIENTE, CONDICIONES_IVA, DOCUMENTOS, etiqueta } from "@/app/ventas/formato";
import {
  accionGuardarCliente, accionBorrarCliente, accionAgregarDireccion, accionGuardarDireccion,
  accionDireccionPrincipal, accionBorrarDireccion, accionQuitarIdentidad, accionValidarPadron, accionCuentaCorriente,
} from "../acciones";
import { emisorDe } from "@/lib/arca/facturar";
import { estadoCredencial } from "@/lib/arca/credenciales";


export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };

type Cliente = {
  id: number; nombre: string; tipo: string; email: string | null; telefono: string | null; documento_tipo: string | null;
  documento_numero: string | null; condicion_iva: string | null; lista_precios_id: number | null; notas: string | null; creado_ts: Date;
  razon_social: string | null; cuit: string | null; apodo_ml: string | null; telefono_movil: string | null;
  nombre_pila: string | null; apellido: string | null; datos_externos: Record<string, Record<string, unknown>>;
  cuenta_corriente: boolean;
};
type Direccion = {
  id: number; etiqueta: string | null; calle: string | null; numero: string | null; piso_depto: string | null; localidad: string | null;
  provincia: string | null; codigo_postal: string | null; pais: string; principal: boolean;
  receptor: string | null; receptor_telefono: string | null; referencia: string | null;
};

const CAMPOS_DIR = [
  ["etiqueta", "Etiqueta", "w-24"], ["calle", "Calle", "w-40"], ["numero", "Nº", "w-16"], ["piso_depto", "Piso/depto", "w-20"],
  ["localidad", "Localidad", "w-32"], ["provincia", "Provincia", "w-28"], ["codigo_postal", "CP", "w-16"], ["pais", "País", "w-12"],
] as const;

export default async function FichaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("clientes_ver");
  const { id } = await params;
  const sp = await searchParams;
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  const c = await una<Cliente>(`
    select id::int, nombre, tipo, email, telefono, documento_tipo, documento_numero, condicion_iva, lista_precios_id::int, notas, creado_ts,
           razon_social, cuit, apodo_ml, telefono_movil, nombre_pila, apellido, datos_externos, cuenta_corriente
      from cliente where id = $1 and organizacion_id = $2`, [cid, s.org.id]);
  if (!c) notFound();
  const editar = Number(sp.editar) || 0;
  // ¿Se puede consultar el padrón de ARCA? Hace falta emisor con certificado.
  const emisor = c.cuit ? await emisorDe(s.org.id) : null;
  const conPadron = !!emisor && !!(await estadoCredencial(s.org.id, emisor.ambiente))?.tiene_certificado;

  const [direcciones, identidades, pedidos, listas] = await Promise.all([
    consulta<Direccion>(`
      select id::int, etiqueta, calle, numero, piso_depto, localidad, provincia, codigo_postal, pais, principal,
             receptor, receptor_telefono, referencia
        from cliente_direccion where cliente_id = $1 and organizacion_id = $2 order by principal desc, id`, [cid, s.org.id]),
    consulta<{ id: number; canal: string; id_externo: string }>(`
      select i.id::int, ca.nombre canal, i.id_externo from cliente_identidad i join canal ca on ca.id = i.canal_id
       where i.cliente_id = $1 and i.organizacion_id = $2 order by ca.nombre, i.id_externo`, [cid, s.org.id]),
    consulta<{ id: number; id_externo: string | null; fecha: Date; canal: string; estado: EstadoPedido; total_ars: number; total_usd: number }>(`
      select p.id::int, p.id_externo, p.fecha, ca.nombre canal, p.estado, p.total_ars::float, p.total_usd::float
        from pedido p join canal ca on ca.id = p.canal_id
       where p.cliente_id = $1 and p.organizacion_id = $2 order by p.fecha desc, p.id desc`, [cid, s.org.id]),
    listasDePrecios(s.org.id),
  ]);
  const volver = `/ventas/clientes/${cid}`;
  const direccionTexto = (d: Direccion) =>
    [[d.calle, d.numero].filter(Boolean).join(" "), d.piso_depto, d.localidad, d.provincia, d.codigo_postal && `CP ${d.codigo_postal}`, d.pais !== "AR" ? d.pais : null]
      .filter(Boolean).join(", ") || "—";
  const extrasDireccion = (d: Direccion) =>
    [d.receptor && `Recibe: ${d.receptor}${d.receptor_telefono ? ` (${d.receptor_telefono})` : ""}`, d.referencia && `Referencia: ${d.referencia}`].filter(Boolean).join(" · ");
  const ORIGENES: Record<string, string> = { virtual_seller: "Virtual Seller", ml: "Mercado Libre" };

  return (
    <Pantalla titulo={c.nombre} subtitulo={<><Link href="/ventas/clientes" className="text-[#16577F] hover:underline">← Clientes</Link> · cliente desde el {fecha(c.creado_ts)}</>}
      acciones={pedidos.length > 0
        ? <span className="text-xs text-[#5C6B76] self-center">No se puede borrar: tiene {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"}.</span>
        : <TachoConfirmar accion={accionBorrarCliente} campos={{ id: String(cid) }} pregunta="¿Borrar el cliente?" />}>
      <Avisos sp={sp} />

      <form action={accionGuardarCliente} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4`}>
        <input type="hidden" name="id" value={cid} />
        <label className="sm:col-span-2"><span className={ETIQUETA}>Nombre (como se lo conoce)</span>
          <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <select name="tipo" defaultValue={c.tipo} className={`${CAMPO} w-full`}>
            {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Razón social (para facturar)</span>
          <input name="razon_social" defaultValue={c.razon_social ?? ""} className={`${CAMPO} w-full`} /></label>
        <div><label><span className={ETIQUETA}>CUIT</span>
          <input name="cuit" defaultValue={c.cuit ?? ""} placeholder="20-12345678-9" className={`${CAMPO} w-full`} /></label>
          {conPadron && (
            <span className="block mt-1">
              {/* Botón del mismo formulario (manda el id del cliente) pero con su propia acción. */}
              <button formAction={accionValidarPadron} className={SUAVE}>Validar en el padrón de ARCA</button>
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">Trae razón social, condición IVA y domicilio fiscal del CUIT guardado.</span>
            </span>
          )}</div>
        <label><span className={ETIQUETA}>Apellido</span>
          <input name="apellido" defaultValue={c.apellido ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Nombre de pila</span>
          <input name="nombre_pila" defaultValue={c.nombre_pila ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Apodo en Mercado Libre</span>
          <input name="apodo_ml" defaultValue={c.apodo_ml ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Mail</span>
          <input name="email" type="email" defaultValue={c.email ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Teléfono</span>
          <input name="telefono" defaultValue={c.telefono ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Celular</span>
          <input name="telefono_movil" defaultValue={c.telefono_movil ?? ""} className={`${CAMPO} w-full`} /></label>
        <div><span className={ETIQUETA}>Documento</span>
          <div className="flex gap-1">
            <select name="documento_tipo" defaultValue={c.documento_tipo ?? ""} className={CAMPO} aria-label="Tipo de documento">
              <option value="">—</option>
              {DOCUMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input name="documento_numero" defaultValue={c.documento_numero ?? ""} className={`${CAMPO} flex-1 min-w-0`} aria-label="Número de documento" />
          </div></div>
        <label><span className={ETIQUETA}>Condición IVA</span>
          <select name="condicion_iva" defaultValue={c.condicion_iva ?? ""} className={`${CAMPO} w-full`}>
            <option value="">Sin cargar</option>
            {Object.entries(CONDICIONES_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Lista de precios propia</span>
          <select name="lista_precios_id" defaultValue={c.lista_precios_id ?? ""} className={`${CAMPO} w-full`}>
            <option value="">La del canal</option>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.estado === "archivada" ? " (archivada)" : ""}</option>)}
          </select>
          <span className="block text-[10px] text-[#5C6B76] mt-0.5">Para mayoristas. Vacío = la del canal.</span></label>
        <label className="sm:col-span-3"><span className={ETIQUETA}>Notas</span>
          <textarea name="notas" defaultValue={c.notas ?? ""} rows={2} className={`${CAMPO} w-full`} /></label>
        <div className="sm:col-span-3"><button className={VERDE}>Guardar</button></div>
      </form>

      <form action={accionCuentaCorriente} className={`${CAJA} flex flex-wrap items-center gap-3 mb-4`}>
        <input type="hidden" name="id" value={cid} />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="cuenta_corriente" defaultChecked={c.cuenta_corriente} className="h-4 w-4" />
          Puede comprar en cuenta corriente / a convenir
        </label>
        <button className={SUAVE}>Guardar</button>
        <span className="text-[11px] text-[#5C6B76] basis-full">En la tienda web le aparece el medio &quot;Cuenta corriente&quot; (si está prendido en Medios de pago).</span>
      </form>

      {Object.keys(c.datos_externos ?? {}).length > 0 && (
        <details className="mb-4 group">
          <summary className={DESPLEGABLE}>Datos originales (tal como llegaron) <span className={FLECHA}>▾</span></summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-2">
            {Object.entries(c.datos_externos).map(([origen, datos]) => (
              <section key={origen} className={CAJA}>
                <h3 className="text-xs font-bold mb-1">{ORIGENES[origen] ?? origen}</h3>
                <dl className="text-[11px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  {Object.entries(datos ?? {}).flatMap(([k, v]) => [
                    <dt key={`k${k}`} className="text-[#5C6B76]">{k}</dt>,
                    <dd key={`v${k}`} className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>,
                  ])}
                </dl>
              </section>
            ))}
          </div>
        </details>
      )}

      <h2 className="text-sm font-bold mb-2">Direcciones</h2>
      <div className={`${CAJA_TABLA} mb-2`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Etiqueta</th><th className={TH}>Dirección</th><th className={TH} /><th /></tr></thead>
          <tbody>
            {direcciones.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Sin direcciones.</td></tr>}
            {direcciones.map((d) => editar === d.id ? (
              <tr key={d.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={4} className={TD}>
                  <form action={accionGuardarDireccion} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="cliente_id" value={cid} />
                    {CAMPOS_DIR.map(([k, ph, w]) => <input key={k} name={k} placeholder={ph} aria-label={ph} defaultValue={d[k] ?? ""} className={`${CAMPO} ${w}`} />)}
                    <button className={VERDE}>Guardar</button>
                    <Link href={volver} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={d.id} className={TR}>
                <td className={TD}>{d.etiqueta ?? "—"}</td>
                <td className={TD}>{direccionTexto(d)}{extrasDireccion(d) && <span className="block text-[11px] text-[#5C6B76]">{extrasDireccion(d)}</span>}</td>
                <td className={TD}>
                  {d.principal ? <Estado texto="Principal" tono="verde" /> : (
                    <form action={accionDireccionPrincipal}>
                      <input type="hidden" name="id" value={d.id} /><input type="hidden" name="cliente_id" value={cid} />
                      <button className={SUAVE}>Hacer principal</button>
                    </form>
                  )}
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={`${volver}?editar=${d.id}`} />
                    <TachoConfirmar accion={accionBorrarDireccion} campos={{ id: String(d.id), cliente_id: String(cid) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AltaNueva texto="Nueva dirección" className="mb-5">
      <form action={accionAgregarDireccion} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="cliente_id" value={cid} />
        {CAMPOS_DIR.map(([k, ph, w], i) => <input key={k} name={k} placeholder={ph} aria-label={ph} defaultValue={k === "pais" ? "AR" : ""} className={`${CAMPO} ${w}`} autoFocus={i === 0} />)}
        <button className={PRIMARIO}>Crear</button>
      </form>
      </AltaNueva>

      <h2 className="text-sm font-bold mb-2">Identidades por canal</h2>
      <p className="text-[11px] text-[#5C6B76] mb-2">El id del cliente en cada canal (ej. su usuario de Mercado Libre). Las crean los pedidos.</p>
      <div className={`${CAJA_TABLA} mb-5 max-w-xl`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Canal</th><th className={TH}>Id en el canal</th><th /></tr></thead>
          <tbody>
            {identidades.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Sin identidades.</td></tr>}
            {identidades.map((i) => (
              <tr key={i.id} className={TR}>
                <td className={TD}>{i.canal}</td>
                <td className={`${TD} font-mono`}>{i.id_externo}</td>
                <td className={`${TD} text-right`}>
                  <TachoConfirmar accion={accionQuitarIdentidad} campos={{ id: String(i.id), cliente_id: String(cid) }} pregunta="¿Quitar?" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">Pedidos</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={THN}>Nº</th><th className={THN}>Fecha</th><th className={TH}>Canal</th><th className={TH}>Id externo</th><th className={TH}>Estado</th><th className={THN}>Total</th></tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Sin pedidos.</td></tr>}
            {pedidos.map((p) => (
              <tr key={p.id} className={TR}>
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.id}</Link></td>
                <td className={TDN}>{fecha(p.fecha)}</td>
                <td className={TD}>{p.canal}</td>
                <td className={`${TD} font-mono`}>{p.id_externo ?? "—"}</td>
                <td className={TD}><Estado texto={etiqueta(ESTADOS_PEDIDO, p.estado)} tono={TONO_ESTADO[p.estado] ?? "gris"} /></td>
                <td className={TDN}>{enVista({ ars: p.total_ars, usd: p.total_usd }, s.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
