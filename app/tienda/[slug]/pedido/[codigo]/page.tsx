// Página del pedido (por su código, sin cuenta): gracias, estado en criollo,
// detalle, cómo pagar según el medio (instrucciones de transferencia,
// reintentar Mercado Pago, tarjeta con Payway), seguimiento del envío y
// "creá tu cuenta en un clic". Sin pagar, se puede cambiar la forma de pago (lib/tienda/cambiar-medio.ts);
// el pedido se descarga en PDF. Abre también un pedido cargado a mano (el link de los avisos del seguimiento).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { planesDeLaCompra } from "@/lib/tienda/checkout";
import { financiacionTienda, marcasPermitidas } from "@/lib/tienda/financiacion";
import { cuentasDe } from "@/lib/tienda/medios";
import { MARCAS_PAYWAY } from "@/lib/tienda/pagos/payway";
import { rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { cargarTienda, estadoCriollo, linkWhatsapp } from "../../catalogo";
import { Aviso, AvisosUrl, BOTON, BOTON_SUAVE, CAMPO, ETIQUETA, IconoWhatsapp } from "../../piezas";
import { crearCuenta, reintentarMercadoPago, cambiarPago } from "../../acciones";
import { opcionesDePago } from "@/lib/tienda/cambiar-medio";
import { paywayPublico } from "../../pagos";
import PagoPayway from "./PagoPayway";
import Antibot from "../../Antibot";
import { marcaDeTiempo, turnstileDe } from "@/lib/tienda/antibot";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { enviarAMeta, fbcDe } from "@/lib/tienda/meta-capi";
import { deGalleta, GALLETA_ENTRADAS } from "@/lib/publicidad/atribucion";
import { datosComprador, etiquetasDelHost, idCatalogo, type Evento } from "@/lib/tienda/publicidad";
import { EventoPublicidad } from "../../Publicidad";
import Refrescar from "./Refrescar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

type Props = { params: Promise<{ slug: string; codigo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type Pedido = {
  id: number; fecha: string; estado: string; estado_pago: string; moneda: Moneda; total: string; costo_envio_ars: string;
  envio: { metodo?: string | null; a_convenir?: boolean; bonificado?: boolean; direccion?: Record<string, string | null> | null; sucursal_oca?: { id: string; nombre: string; direccion: string } | null };
  medio_pago: string | null; medio: string | null; cliente_id: number | null; email: string | null; nombre: string | null; telefono: string | null;
  metodo_tipo: string | null; descuentos: { nombre: string; importe: number }[] | null;
  subtotal: string | null; cuotas: number | null; debito: boolean | null; de_la_tienda: boolean;
};

async function cargarPedido(t: Tienda, codigo: string) {
  const org = t.organizacionId;
  const p = await una<Pedido>(`
    select p.id::int, to_char(p.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') fecha, p.estado, p.estado_pago, p.moneda,
           case when p.moneda = 'USD' then p.total_usd else p.total_ars end total, p.costo_envio_ars, p.envio, p.medio_pago,
           coalesce(p.datos_externos #>> '{tienda,medio}', (select medio from pago where pedido_id = p.id order by id desc limit 1),
                    case when p.medio_pago ilike 'transfer%' then 'transferencia' end) medio,
           p.cliente_id::int, coalesce(p.datos_externos #>> '{tienda,contacto,email}', cl.email) email,
           coalesce(p.datos_externos #>> '{tienda,contacto,nombre}', cl.nombre) nombre,
           coalesce(p.datos_externos #>> '{tienda,contacto,telefono}', cl.telefono_movil, cl.telefono) telefono, me.tipo metodo_tipo,
           p.datos_externos #> '{tienda,descuentos}' descuentos, p.datos_externos #>> '{tienda,subtotal}' subtotal,
           (p.datos_externos #>> '{tienda,cuotas}')::int cuotas, (p.datos_externos #>> '{tienda,debito}')::boolean debito,
           p.canal_id = $2 de_la_tienda
      from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id left join metodo_envio me on me.id = p.metodo_envio_id
     where p.organizacion_id = $1 and (p.canal_id = $2 or c.tipo in ('local', 'web_mayorista', 'otro')) and p.codigo_seguimiento = $3`, [org, t.canalId, codigo]);
  if (!p) return null;
  const [lineas, envios, medio, tieneCuenta] = await Promise.all([
    consulta<{ variacion_id: number | null; producto_id: number | null; titulo: string; cantidad: number; unit: string; foto: string | null; sku: string | null }>(`
      select l.variacion_id::int, v.producto_id::int, v.sku, l.titulo, l.cantidad, case when $2 = 'USD' then l.precio_unit_usd else l.precio_unit_ars end unit,
             coalesce((select url from variacion_foto where variacion_id = l.variacion_id order by orden limit 1),
                      (select url from producto_foto where producto_id = v.producto_id order by orden limit 1)) foto
        from pedido_linea l left join variacion v on v.id = l.variacion_id
       where l.pedido_id = $1 order by l.orden, l.id`, [p.id, p.moneda]),
    consulta<{ estado: string | null; tracking: string | null; transportista: string | null; entrega: string | null }>(`
      select estado, tracking, transportista, to_char(entrega_estimada at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') entrega
        from envio where pedido_id = $1 and organizacion_id = $2 order by id`, [p.id, org]),
    p.medio ? una<{ nombre: string; instrucciones: string | null; cuentas: unknown }>(`
      select nombre, instrucciones, cuentas from medio_pago where organizacion_id = $1 and (canal_id is null or canal_id = $2) and tipo = $3
       order by canal_id nulls last limit 1`, [org, t.canalId, p.medio]) : null,
    p.email ? una("select 1 from cliente_cuenta where organizacion_id = $1 and email = lower($2)", [org, p.email]) : null,
  ]);
  return { p, lineas, envios, medio, tieneCuenta: !!tieneCuenta };
}

const ESTADO_ENVIO: Record<string, string> = {
  pending: "Pendiente", handling: "En preparación", ready_to_ship: "Listo para despachar", shipped: "En camino", delivered: "Entregado",
  not_delivered: "No entregado", cancelled: "Cancelado", returned: "Devuelto",
};

export default async function PaginaPedido({ params, searchParams }: Props) {
  const { slug, codigo } = await params;
  const t = await cargarTienda(slug);
  const sp = await searchParams;
  const d = /^[\w-]{4,40}$/.test(codigo) ? await cargarPedido(t, codigo) : null;
  if (!d) notFound();
  const { p, lineas, envios, medio } = d;
  const m = p.moneda;
  const estado = estadoCriollo(p.estado, p.estado_pago, p.metodo_tipo);
  const pagado = p.estado_pago === "pagado";
  const pendiente = (p.estado_pago === "pendiente" || p.estado_pago === "a_cobrar") && p.estado !== "cancelado";
  const cuenta = await cuentaActual(t);
  const fallo = sp.pago === "fallo" && pendiente && p.medio === "mercadopago";
  const pagarConTarjeta = pendiente && p.medio === "payway";
  const pw = pagarConTarjeta ? await paywayPublico(t) : null;
  // Cuotas: las elegidas al comprar (esquema de cuotas: el interés ya está en el total) o, en un pedido sin elegir, los planes de la compra.
  const planes = !pagarConTarjeta || p.debito || p.cuotas ? []
    : await planesDeLaCompra(t, lineas.flatMap((l) => (l.variacion_id ? [l.variacion_id] : [])), "payway");
  // Las tarjetas que puede usar: con débito, sólo débito; en cuotas, Visa y Master de crédito; en un pago, las de crédito.
  const permitida = marcasPermitidas(financiacionTienda(t), !!p.debito, p.cuotas);
  const marcas = MARCAS_PAYWAY.filter((x) => permitida(x.id));
  const cambio = pendiente ? await opcionesDePago(t, codigo) : null;
  const wa = linkWhatsapp(t, `Hola, hice el pedido #${p.id}${pendiente && p.medio === "transferencia" ? " y ya transferí" : ""}.`);
  const direccion = p.envio?.direccion;
  // Los precios de las líneas ya tienen aplicados los descuentos: se muestran como ahorro.
  const ahorro = (p.descuentos ?? []).filter((x) => x.importe > 0);

  // Publicidad: la compra cuenta una sola vez por pedido (el id del pedido viaja a cada plataforma),
  // cuando el pago queda aprobado; transferencia y efectivo, al crear el pedido si así está configurado.
  const pub = await etiquetasDelHost((await headers()).get("host"));
  // Un pedido cargado a mano (abierto desde el link de los avisos) no es una venta de la tienda.
  const cuentaComoVenta = !!pub && p.de_la_tienda && p.estado !== "cancelado"
    && (pagado || (pub.contar_al_crear && (p.medio === "transferencia" || p.medio === "efectivo")));
  const compra: Evento | null = !cuentaComoVenta ? null : {
    tipo: "compra", moneda: m, pedido: String(p.id), valor: Math.round(lineas.reduce((s, l) => s + Number(l.unit) * l.cantidad, 0) * 100) / 100,
    ...(m === "ARS" ? { envio: Number(p.costo_envio_ars) || 0 } : {}),
    items: lineas.map((l) => ({ id: l.variacion_id ? idCatalogo(l.sku, l.variacion_id) : l.titulo, nombre: l.titulo, precio: Number(l.unit), cantidad: l.cantidad })),
  };

  // La misma compra a Meta desde el servidor (API de conversiones, lib/tienda/meta-capi.ts), una sola vez por pedido y
  // con el mismo id que el píxel: llega aunque el navegador corte el píxel.
  if (compra && pub?.meta) {
    const [h, c] = [await headers(), await cookies()];
    const host = h.get("host");
    const anuncio = deGalleta(c.get(GALLETA_ENTRADAS)?.value)?.anuncios.filter((a) => a.plataforma === "meta").at(-1);
    const datos = {
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null, navegador: h.get("user-agent"),
      fbp: c.get("_fbp")?.value ?? null, fbc: fbcDe(c.get("_fbc")?.value, anuncio?.clid, anuncio?.ts),
    };
    after(async () => {
      const libre = await una("update pedido set meta_capi_ts = now() where id = $1 and meta_capi_ts is null returning id", [p.id]).catch(() => null);
      if (!libre) return;
      const ok = await enviarAMeta(host, { nombre: "Purchase", id: `compra-${p.id}`, url: `https://${host}${rutaTienda(t, `/pedido/${codigo}`)}`,
        valor: compra.valor, moneda: compra.moneda, productos: compra.items.map((i) => i.id), pedido: String(p.id),
        email: pub.datos_comprador ? p.email : null, telefono: pub.datos_comprador ? p.telefono : null, ...datos });
      if (!ok) await consulta("update pedido set meta_capi_ts = null where id = $1", [p.id]).catch(() => {});
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AvisosUrl sp={sp} />
      {compra && <EventoPublicidad evento={compra} unaVez={`compra_${p.id}`} conversionGoogle={pub?.google?.enviarConversion}
        comprador={pub?.datos_comprador ? datosComprador(p.email, p.telefono) : undefined} />}
      {/* Volvió de Mercado Pago y el aviso del pago todavía no llegó: se actualiza sola un rato. */}
      {pendiente && p.medio === "mercadopago" && !fallo && <Refrescar />}
      <div className="space-y-2 text-center">
        {fallo ? <h1 className="text-2xl font-bold sm:text-3xl">El pago no se completó</h1>
          : <h1 className="text-2xl font-bold sm:text-3xl">{pagado || p.estado_pago === "a_convenir" || p.estado_pago === "a_cobrar" ? "¡Gracias por tu compra!" : "¡Recibimos tu pedido!"}</h1>}
        <p className="text-gray-500">Pedido <b className="text-gray-800">#{p.id}</b> · {p.fecha}</p>
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${estado.color}`}>{estado.texto}</span>
        {!fallo && p.email && (
          <p className="mx-auto max-w-md pt-1 text-sm text-gray-600">
            Te mandamos un mail a <b className="text-gray-800">{p.email}</b> con todos los datos de tu compra. Leelo para estar al tanto: ahí te vamos avisando cada novedad.
          </p>
        )}
      </div>

      {fallo && (
        <section className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-center sm:p-5">
          <p className="text-red-800">Tu pedido quedó guardado, pero el pago no se acreditó. Podés intentarlo de nuevo.</p>
          <form action={reintentarMercadoPago}>
            <input type="hidden" name="slug" value={t.slug} />
            <input type="hidden" name="codigo" value={codigo} />
            <button type="submit" className={`${BOTON} w-full sm:w-auto`}>Reintentar con Mercado Pago</button>
          </form>
        </section>
      )}

      {pendiente && p.medio === "mercadopago" && !fallo && (
        <Aviso>Si ya pagaste con Mercado Pago, en unos minutos lo vas a ver acreditado acá.
          <form action={reintentarMercadoPago} className="mt-2">
            <input type="hidden" name="slug" value={t.slug} />
            <input type="hidden" name="codigo" value={codigo} />
            <button type="submit" className="font-semibold underline">¿No llegaste a pagar? Pagá ahora</button>
          </form>
        </Aviso>
      )}

      {pendiente && (p.medio === "transferencia" || p.medio === "efectivo") && (
        <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h2 className="text-lg font-bold">{p.medio === "transferencia" ? "Cómo transferir" : "Cómo pagar"}</h2>
          <div className="rounded-md bg-white p-3 text-center">
            <p className="text-sm text-gray-600">Total a {p.medio === "transferencia" ? "transferir" : "pagar"}</p>
            <p className="text-3xl font-bold tracking-tight">{formatear(p.total, m)}</p>
          </div>
          {p.medio === "transferencia" && cuentasDe(medio?.cuentas).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {cuentasDe(medio?.cuentas).map((c, i) => (
                <div key={i} className="rounded-md bg-white p-3 text-sm">
                  <p className="font-semibold">{c.banco}</p>
                  {c.alias && <p className="mt-1">Alias: <b className="select-all font-mono text-base">{c.alias}</b></p>}
                  {c.cbu && <p>CBU/CVU: <span className="select-all font-mono">{c.cbu}</span></p>}
                  {(c.titular || c.cuit) && <p className="text-gray-600">{[c.titular, c.cuit && `CUIT ${c.cuit}`].filter(Boolean).join(" · ")}</p>}
                </div>
              ))}
            </div>
          )}
          {medio?.instrucciones && <div className="whitespace-pre-line rounded-md bg-white p-3 text-sm leading-relaxed">{medio.instrucciones}</div>}
          {p.medio === "transferencia" && wa && (
            <a href={wa} target="_blank" rel="noopener" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 font-semibold text-white hover:brightness-105 sm:w-auto">
              <IconoWhatsapp clase="h-5 w-5" /> Avisanos por WhatsApp cuando transfieras
            </a>
          )}
        </section>
      )}

      {pagarConTarjeta && (pw
        ? <PagoPayway slug={t.slug} codigo={codigo} publicKey={pw.publicKey} url={pw.url} total={Number(p.total)} moneda={m} marcas={marcas} planes={planes}
            fijas={p.debito ? 1 : p.cuotas} />
        : <Aviso tipo="error">El pago con tarjeta no está disponible ahora. Escribinos y lo resolvemos.</Aviso>)}

      {cambio && cambio.opciones.length > 1 && (
        <details className="rounded-md bg-white p-4 shadow-[0_1px_2px_0_rgba(0,0,0,.12)] sm:p-5" open={sp.cambiar === "1"}>
          <summary className={`${BOTON_SUAVE} cursor-pointer list-none`}>¿Querés pagar de otra forma?</summary>
          <form action={cambiarPago} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={t.slug} />
            <input type="hidden" name="codigo" value={codigo} />
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm text-gray-600">El total se recalcula con la forma que elijas (por ejemplo, con el descuento de contado o el interés de las cuotas).</legend>
              {cambio.opciones.map((o) => (
                <label key={o.tipo} className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-sm has-[:checked]:border-[var(--boton)]">
                  <input type="radio" name="medio" value={o.tipo} defaultChecked={o.actual} required className="mt-0.5" />
                  <span><b>{o.nombre}</b>{o.actual && <span className="text-gray-500"> (la que elegiste)</span>}
                    {o.descuento_pct > 0 && <span className="block text-green-700">{o.descuento_pct}% de descuento</span>}</span>
                </label>
              ))}
            </fieldset>
            {cambio.cuotas.length > 0 && (
              <label className="block text-sm">
                <span className={ETIQUETA}>Con tarjeta de crédito, en</span>
                <select name="cuotas" defaultValue={cambio.cuotasActuales ?? 1} className={CAMPO}>
                  {cambio.cuotas.map((c) => (
                    <option key={c.cuotas} value={c.cuotas}>{c.cuotas === 1 ? "1 pago" : `${c.cuotas} cuotas`}{c.interes_pct > 0 ? ` (con ${c.interes_pct}% de interés)` : c.cuotas > 1 ? " sin interés" : ""}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className={BOTON}>Elegir esta forma de pago</button>
          </form>
        </details>
      )}

      {envios.some((e) => e.estado || e.tracking) && (
        <section className="rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold">Seguimiento del envío</h2>
          <ul className="space-y-2 text-sm">
            {envios.map((e, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>{e.transportista ?? "Envío"} · <b>{e.estado ? ESTADO_ENVIO[e.estado] ?? e.estado : "Pendiente"}</b>{e.entrega ? ` · llega el ${e.entrega}` : ""}</span>
                {e.tracking && <span className="font-mono">Seguimiento: {e.tracking}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-bold">Detalle</h2>
        <ul className="divide-y divide-gray-100">
          {lineas.map((l, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-50">{l.foto && <img src={l.foto} alt="" className="h-full w-full object-contain p-0.5" />}</span>
              <span className="flex-1">
                {l.producto_id ? <Link href={rutaTienda(t, `/producto/${l.producto_id}`)} className="hover:text-[var(--boton)]">{l.titulo}</Link> : l.titulo}
                <span className="block text-xs text-gray-500">{l.cantidad} × {formatear(l.unit, m)}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatear(Number(l.unit) * l.cantidad, m)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
          {ahorro.length > 0 && (
            <div className="text-green-700">
              Ahorraste {formatear(ahorro.reduce((a, x) => a + x.importe, 0), m)} ({ahorro.map((x) => x.nombre).join(", ")}): ya está aplicado en los precios.
            </div>
          )}
          <div className="flex justify-between">
            <span>Envío{p.envio?.metodo ? ` (${p.envio.metodo})` : ""}</span>
            <span className="tabular-nums">{p.envio?.a_convenir ? "A convenir" : Number(p.costo_envio_ars) === 0 ? "Gratis" : formatear(p.costo_envio_ars, "ARS")}</span>
          </div>
          <div className="flex justify-between pt-1 text-lg font-bold"><span>Total</span><span className="tabular-nums">{formatear(p.total, m)}</span></div>
          {(medio?.nombre || p.medio_pago) && <div className="text-gray-500">Pago: {medio?.nombre ?? p.medio_pago}</div>}
          {p.envio?.sucursal_oca?.nombre && (
            <div className="text-gray-500">Retirás en la sucursal de OCA: {p.envio.sucursal_oca.nombre}{p.envio.sucursal_oca.direccion ? ` (${p.envio.sucursal_oca.direccion})` : ""}</div>
          )}
          {direccion?.calle && !p.envio?.sucursal_oca && (
            <div className="text-gray-500">
              Entrega en: {[direccion.calle, direccion.numero].filter(Boolean).join(" ")}{direccion.piso_depto ? `, ${direccion.piso_depto}` : ""}, {direccion.localidad}, {direccion.provincia}{direccion.codigo_postal ? ` (${direccion.codigo_postal})` : ""}
            </div>
          )}
        </div>
      </section>

      {!cuenta && !d.tieneCuenta && p.email && p.de_la_tienda && (
        <section className="rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] p-4 sm:p-5">
          <h2 className="text-lg font-bold">Creá tu cuenta en un clic</h2>
          <p className="mb-3 text-sm text-gray-600">Elegí una contraseña y listo: vas a poder ver tus pedidos y comprar más rápido. Tu mail: <b>{p.email}</b></p>
          <form action={crearCuenta} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="slug" value={t.slug} />
            <input type="hidden" name="codigo" value={codigo} />
            <div className="flex-1">
              <label htmlFor="clave" className={ETIQUETA}>Contraseña (8 caracteres o más)</label>
              <input id="clave" name="clave" type="password" minLength={8} required autoComplete="new-password" className={CAMPO} />
            </div>
            <Antibot marca={await marcaDeTiempo()} siteKey={await turnstileDe(t.organizacionId)} />
            <button type="submit" className={BOTON}>Crear mi cuenta</button>
          </form>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <a href={rutaTienda(t, `/pedido/${codigo}/pdf`)} className={BOTON_SUAVE}>Descargar en PDF</a>
        <Link href={rutaTienda(t)} className={BOTON_SUAVE}>Seguir comprando</Link>
        {wa && <a href={wa} target="_blank" rel="noopener" className={BOTON_SUAVE}>¿Dudas? Escribinos</a>}
      </div>
    </div>
  );
}

