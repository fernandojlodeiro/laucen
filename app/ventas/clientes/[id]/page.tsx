// Ficha de un cliente: datos (sobre todo los fiscales, que es lo que más se
// corrige), direcciones, identidades por canal y sus pedidos.

import { cuitLegible } from "@/lib/cuit";
import { telefonoLegible } from "@/lib/telefono";
import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { listasDePrecios } from "@/lib/precios";
import { enVista } from "@/lib/moneda";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { VERDE, SUAVE, PRIMARIO, DESPLEGABLE, FLECHA } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, Dato, BotonesFicha, editandoFicha, EDITAR_FICHA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, TIPOS_CLIENTE, CONDICIONES_IVA, DOCUMENTOS, etiqueta } from "@/app/ventas/formato";
import {
  accionGuardarCliente, accionBorrarCliente, accionAgregarDireccion, accionGuardarDireccion,
  accionDireccionPrincipal, accionBorrarDireccion, accionQuitarIdentidad, accionValidarPadron,
} from "../acciones";
import { emisorConPadron } from "@/lib/arca/facturar";
import { situacionCc } from "@/lib/administracion/credito";
import { tienePermiso } from "@/lib/permisos";
import { formatear } from "@/lib/moneda";
import CampoNumero from "@/app/componentes/CampoNumero";


export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };

type Cliente = {
  id: number; nombre: string; tipo: string; email: string | null; telefono: string | null; documento_tipo: string | null;
  documento_numero: string | null; condicion_iva: string | null; lista_precios_id: number | null; notas: string | null; creado_ts: Date;
  razon_social: string | null; cuit: string | null; apodo_ml: string | null; telefono_movil: string | null;
  telefono_aclaracion: string | null; telefono_movil_aclaracion: string | null;
  nombre_pila: string | null; apellido: string | null; datos_externos: Record<string, Record<string, unknown>>;
  cuenta_corriente: boolean; limite_cc: string | null;
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
           razon_social, cuit, apodo_ml, telefono_movil, telefono_aclaracion, telefono_movil_aclaracion, nombre_pila, apellido, datos_externos, cuenta_corriente, limite_cc
      from cliente where id = $1 and organizacion_id = $2`, [cid, s.org.id]);
  if (!c) notFound();
  // La ficha abre en vista; ?editar=ficha la edita (?editar=<id> es el lápiz de una dirección).
  const editando = editandoFicha(sp);
  const editar = Number(sp.editar) || 0;
  // ¿Se puede consultar el padrón de ARCA? Hace falta una razón social conectada.
  const conPadron = c.cuit ? !!(await emisorConPadron(s.org.id)) : false;
  // Cuenta corriente (Fer, 7/10): habilitarla y su límite, sólo con el permiso «cc_asignar».
  const puedeCc = tienePermiso(s.permisos, "cc_asignar");
  const cc = c.cuenta_corriente || c.limite_cc != null ? await situacionCc(s.org.id, cid) : null;
  const pesos = (n: number) => formatear(n, "ARS");

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
    [d.receptor && `Recibe: ${d.receptor}${d.receptor_telefono ? ` (${telefonoLegible(d.receptor_telefono)})` : ""}`, d.referencia && `Referencia: ${d.referencia}`].filter(Boolean).join(" · ");
  const ORIGENES: Record<string, string> = { virtual_seller: "Virtual Seller", ml: "Mercado Libre" };

  return (
    <Pantalla titulo={c.nombre} camino={[{ texto: `N.º ${c.id}` }]} subtitulo={<>Cliente N.º {c.id} · cliente desde el {fecha(c.creado_ts)}</>}
      acciones={
        <>
          <BotonesFicha editando={editando} ver={volver} editar={`${volver}?editar=${EDITAR_FICHA}`} />
          {!editando && (pedidos.length > 0
            ? <span className="text-xs text-[#5C6B76] self-center">No se puede borrar: tiene {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"}.</span>
            : <TachoConfirmar accion={accionBorrarCliente} campos={{ id: String(cid) }} pregunta="¿Borrar el cliente?" />)}
        </>
      }>
      <Avisos sp={sp} />

      {editando ? (
      <form id="ficha" action={accionGuardarCliente} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4`}>
        <input type="hidden" name="id" value={cid} />
        <label className="sm:col-span-2"><span className={ETIQUETA}>Nombre (como se lo conoce)</span>
          <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <select name="tipo" defaultValue={c.tipo} className={`${CAMPO} w-full`}>
            {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Razón social (para facturar)</span>
          <input name="razon_social" defaultValue={c.razon_social ?? ""} className={`${CAMPO} w-full`} /></label>
        <div><label><span className={ETIQUETA}>CUIT</span>
          <input name="cuit" defaultValue={cuitLegible(c.cuit)} placeholder="20-12345678-9" className={`${CAMPO} w-full`} /></label>
</div>
        <label><span className={ETIQUETA}>Apellido</span>
          <input name="apellido" defaultValue={c.apellido ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Nombre de pila</span>
          <input name="nombre_pila" defaultValue={c.nombre_pila ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Apodo en Mercado Libre</span>
          <input name="apodo_ml" defaultValue={c.apodo_ml ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Mail</span>
          <input name="email" type="email" defaultValue={c.email ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Teléfono</span>
          <input name="telefono" defaultValue={telefonoLegible(c.telefono)} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Interno / aclaración</span>
          <input name="telefono_aclaracion" defaultValue={c.telefono_aclaracion ?? ""} placeholder="Ej. INT 32" className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Celular</span>
          <input name="telefono_movil" defaultValue={telefonoLegible(c.telefono_movil)} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Interno / aclaración del celular</span>
          <input name="telefono_movil_aclaracion" defaultValue={c.telefono_movil_aclaracion ?? ""} className={`${CAMPO} w-full`} /></label>
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
        {puedeCc ? (
          <>
            <input type="hidden" name="con_cc" value="1" />
            <label className="sm:col-span-2 flex items-center gap-1.5 text-xs self-end pb-1.5">
              <input type="checkbox" name="cuenta_corriente" defaultChecked={c.cuenta_corriente} className="h-4 w-4" />
              Puede comprar en cuenta corriente / a convenir
              <span className="text-[11px] text-[#5C6B76]">(en la tienda web le aparece el medio &quot;Cuenta corriente&quot;, si está prendido en Medios de pago)</span>
            </label>
            <label><span className={ETIQUETA}>Límite de crédito ($)</span>
              <CampoNumero name="limite_cc" valor={c.limite_cc == null ? null : Number(c.limite_cc)} tipo="pesos" className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">Vacío = sin límite cargado: sus pedidos a cuenta no se preparan.</span></label>
          </>
        ) : (
          <p className="sm:col-span-3 text-[11px] text-[#5C6B76]">La cuenta corriente y el límite de crédito los cambia quien tiene el permiso «Asignar cuenta corriente y límite».</p>
        )}
      </form>
      ) : (
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4`}>
          <Dato etiqueta="Nombre (como se lo conoce)" className="sm:col-span-2">{c.nombre}</Dato>
          <Dato etiqueta="Tipo">{etiqueta(TIPOS_CLIENTE, c.tipo)}</Dato>
          <Dato etiqueta="Razón social (para facturar)" className="sm:col-span-2">{c.razon_social}</Dato>
          <div>
            <Dato etiqueta="CUIT">{c.cuit ? cuitLegible(c.cuit) : null}</Dato>
            {conPadron && (
              <form action={accionValidarPadron} className="mt-1">
                <input type="hidden" name="id" value={cid} />
                <button className={SUAVE}>Validar en el padrón de ARCA</button>
                <span className="block text-[10px] text-[#5C6B76] mt-0.5">Trae razón social, condición IVA y domicilio fiscal del CUIT guardado.</span>
              </form>
            )}
          </div>
          <Dato etiqueta="Apellido">{c.apellido}</Dato>
          <Dato etiqueta="Nombre de pila">{c.nombre_pila}</Dato>
          <Dato etiqueta="Apodo en Mercado Libre">{c.apodo_ml}</Dato>
          <Dato etiqueta="Mail">{c.email}</Dato>
          <Dato etiqueta="Teléfono">{c.telefono ? telefonoLegible(c.telefono) : null}</Dato>
          <Dato etiqueta="Interno / aclaración">{c.telefono_aclaracion}</Dato>
          <Dato etiqueta="Celular">{c.telefono_movil ? telefonoLegible(c.telefono_movil) : null}</Dato>
          <Dato etiqueta="Interno / aclaración del celular">{c.telefono_movil_aclaracion}</Dato>
          <Dato etiqueta="Documento">{[c.documento_tipo, c.documento_numero].filter(Boolean).join(" ")}</Dato>
          <Dato etiqueta="Condición IVA">{c.condicion_iva ? etiqueta(CONDICIONES_IVA, c.condicion_iva) : null}</Dato>
          <Dato etiqueta="Lista de precios propia" ayuda="Para mayoristas. Vacío = la del canal.">
            {c.lista_precios_id ? listas.find((l) => l.id === c.lista_precios_id)?.nombre ?? null : "La del canal"}
          </Dato>
          <Dato etiqueta="Notas" className="sm:col-span-3" largo>{c.notas}</Dato>
          <Dato etiqueta="Cuenta corriente" className="sm:col-span-2">
            {c.cuenta_corriente ? "Puede comprar en cuenta corriente / a convenir" : "No compra en cuenta corriente"}
          </Dato>
          <Dato etiqueta="Límite de crédito" numero ayuda={c.cuenta_corriente && c.limite_cc == null ? "Sin límite cargado: sus pedidos a cuenta no se preparan." : undefined}>
            {c.limite_cc == null ? null : pesos(Number(c.limite_cc))}
          </Dato>
          {cc && (
            <>
              <Dato etiqueta="Saldo de la cuenta" numero>
                <Link href={`/administracion/cuentas-corrientes?id=${cid}`} className="hover:underline">{pesos(cc.saldo)}</Link>
              </Dato>
              <Dato etiqueta="Pedidos a cuenta sin facturar" numero>{pesos(cc.pedidos)}</Dato>
              <Dato etiqueta="Disponible" numero>
                {cc.disponible == null ? null : <span className={cc.disponible < 0 ? "text-[#C03420] font-semibold" : ""}>{pesos(cc.disponible)}</span>}
              </Dato>
            </>
          )}
        </div>
      )}

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

      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold">Direcciones</h2>
        <BotonNuevo texto="Nueva dirección" />
      </div>
      <AltaNueva texto="Nueva dirección" sinBoton className="mb-2">
        <form action={accionAgregarDireccion} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="cliente_id" value={cid} />
          {CAMPOS_DIR.map(([k, ph, w], i) => <input key={k} name={k} placeholder={ph} aria-label={ph} defaultValue={k === "pais" ? "AR" : ""} className={`${CAMPO} ${w}`} autoFocus={i === 0} />)}
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className={`${CAJA_TABLA} mb-5`}>
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
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="hover:underline">{fecha(p.fecha)}</Link></td>
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
