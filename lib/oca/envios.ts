// OCA en Laucen (Fer, 6/10): la configuración de la cuenta, la cotización
// del carrito de la tienda, el alta del envío desde el pedido (con su
// etiqueta) y el seguimiento, que corre solo en el barrido de cada media hora.
//
// El envío de OCA es una fila de `envio` con logistica = 'oca' (sin
// id_externo: ése es de Mercado Libre); el número de envío va en tracking y
// lo demás en datos_externos.oca: orden_retiro, numero_envio, operativa,
// alta, en_camino, entregado, devuelto, historial. El estado usa los mismos
// códigos que Mercado Envíos (ready_to_ship, shipped, delivered, cancelled,
// returned) para que las pantallas de envíos lo muestren igual.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import * as api from "@/lib/oca/api";

export type CajaStd = { largo: number; ancho: number; alto: number };
export type OrigenOca = { calle: string; numero: string; piso: string; depto: string; cp: string; localidad: string; provincia: string; contacto: string; email: string; telefono: string };
export type ConfigOca = {
  usuario: string | null; tieneClave: boolean; cuit: string | null; nroCuenta: string | null;
  operativaDomicilio: string | null; operativaSucursal: string | null; origen: OrigenOca; centroOrigen: string | null; franja: number;
  pesoStdG: number; caja: CajaStd; ultimaPrueba: { ts: string; ok: boolean; texto: string } | null;
};

export const FRANJAS: [number, string][] = [[1, "De 8 a 17 h"], [2, "De 8 a 12 h"], [3, "De 14 a 17 h"]];
const ORIGEN_VACIO: OrigenOca = { calle: "", numero: "", piso: "", depto: "", cp: "", localidad: "", provincia: "", contacto: "", email: "", telefono: "" };

type Fila = { usuario: string | null; clave: string | null; cuit: string | null; nro_cuenta: string | null; operativa_domicilio: string | null; operativa_sucursal: string | null;
  origen: Partial<OrigenOca> | null; centro_origen: string | null; franja: number; peso_std_g: number; caja_std: Partial<CajaStd> | null; ultima_prueba: ConfigOca["ultimaPrueba"] };

async function fila(org: string): Promise<Fila | null> {
  return una<Fila>("select usuario, clave, cuit, nro_cuenta, operativa_domicilio, operativa_sucursal, origen, centro_origen, franja, peso_std_g, caja_std, ultima_prueba from oca_config where organizacion_id = $1", [org]);
}

/** La configuración para mostrar (la contraseña, sólo si hay o no). */
export async function configOca(org: string): Promise<ConfigOca | null> {
  const f = await fila(org);
  if (!f) return null;
  return {
    usuario: f.usuario, tieneClave: !!f.clave, cuit: f.cuit, nroCuenta: f.nro_cuenta, operativaDomicilio: f.operativa_domicilio, operativaSucursal: f.operativa_sucursal,
    origen: { ...ORIGEN_VACIO, ...(f.origen ?? {}) }, centroOrigen: f.centro_origen, franja: f.franja, pesoStdG: f.peso_std_g,
    caja: { largo: Number(f.caja_std?.largo ?? 20), ancho: Number(f.caja_std?.ancho ?? 15), alto: Number(f.caja_std?.alto ?? 10) }, ultimaPrueba: f.ultima_prueba,
  };
}

export type GuardarOca = Omit<ConfigOca, "tieneClave" | "ultimaPrueba"> & { clave: string | null };

/** Graba la configuración. Una contraseña vacía deja la que había. */
export async function guardarConfigOca(org: string, c: GuardarOca) {
  await consulta(`
    insert into oca_config (organizacion_id, usuario, clave, cuit, nro_cuenta, operativa_domicilio, operativa_sucursal, origen, centro_origen, franja, peso_std_g, caja_std, actualizado_ts)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
    on conflict (organizacion_id) do update set usuario = excluded.usuario, clave = coalesce(excluded.clave, oca_config.clave), cuit = excluded.cuit,
      nro_cuenta = excluded.nro_cuenta, operativa_domicilio = excluded.operativa_domicilio, operativa_sucursal = excluded.operativa_sucursal,
      origen = excluded.origen, centro_origen = excluded.centro_origen, franja = excluded.franja, peso_std_g = excluded.peso_std_g,
      caja_std = excluded.caja_std, actualizado_ts = now()`,
    [org, c.usuario, c.clave, c.cuit, c.nroCuenta, c.operativaDomicilio, c.operativaSucursal, JSON.stringify(c.origen), c.centroOrigen, c.franja, c.pesoStdG, JSON.stringify(c.caja)]);
}

/** Qué falta para cotizar o para dar de alta (null = nada). */
export function faltaParaOca(c: ConfigOca | null, para: "cotizar" | "alta", modalidad: "domicilio" | "sucursal"): string | null {
  if (!c) return "Falta configurar la cuenta de OCA (Configuración › Métodos de envío › OCA).";
  const faltan: string[] = [];
  if (!c.cuit) faltan.push("el CUIT");
  if (modalidad === "domicilio" ? !c.operativaDomicilio : !c.operativaSucursal) faltan.push(`la operativa ${modalidad === "domicilio" ? "a domicilio" : "a sucursal"}`);
  if (!c.origen.cp) faltan.push("el código postal de origen");
  if (para === "alta") {
    if (!c.usuario || !c.tieneClave) faltan.push("el usuario y la contraseña de ePak");
    if (!c.nroCuenta) faltan.push("el número de cuenta");
    if (!c.origen.calle || !c.origen.localidad || !c.origen.provincia) faltan.push("la dirección de origen");
  }
  return faltan.length ? `Falta cargar en la configuración de OCA: ${faltan.join(", ")}.` : null;
}

export const modalidadDe = (tipo: string | null | undefined): "domicilio" | "sucursal" => (tipo === "oca_sucursal" ? "sucursal" : "domicilio");

// ── El bulto ─────────────────────────────────────────────

export type Bulto = { pesoKg: number; volumenM3: number; largoCm: number; anchoCm: number; altoCm: number; estandar: number };

/** Un solo bulto con todo: el peso y el volumen se suman; lo que no tiene
 *  peso o medidas cargadas va con el peso y la caja estándar. */
export async function bultoDe(org: string, items: { variacionId: number; cantidad: number }[], c: Pick<ConfigOca, "pesoStdG" | "caja">): Promise<Bulto> {
  const filas = items.length ? await consulta<{ id: number; peso_g: number | null; largo: number | null; ancho: number | null; alto: number | null }>(`
    select v.id::int, p.peso_g, p.largo_cm::float largo, p.ancho_cm::float ancho, p.alto_cm::float alto
      from variacion v join producto p on p.id = v.producto_id where v.organizacion_id = $1 and v.id = any($2::bigint[])`,
    [org, items.map((i) => i.variacionId)]) : [];
  const porId = new Map(filas.map((f) => [f.id, f]));
  let pesoG = 0, volCm3 = 0, estandar = 0, largo = 0, ancho = 0;
  for (const i of items) {
    const f = porId.get(i.variacionId);
    const conPeso = !!f?.peso_g && f.peso_g > 0;
    const conMedidas = !!(f?.largo && f.ancho && f.alto);
    if (!conPeso || !conMedidas) estandar += i.cantidad;
    pesoG += (conPeso ? f!.peso_g! : c.pesoStdG) * i.cantidad;
    const [l, a, h] = conMedidas ? [f!.largo!, f!.ancho!, f!.alto!] : [c.caja.largo, c.caja.ancho, c.caja.alto];
    volCm3 += l * a * h * i.cantidad;
    // La caja: el largo y el ancho del más grande; el alto, lo que haga falta para el volumen.
    const [x, y] = [l, a, h].sort((p, q) => q - p);
    largo = Math.max(largo, x); ancho = Math.max(ancho, y);
  }
  if (!pesoG) { pesoG = c.pesoStdG; volCm3 = c.caja.largo * c.caja.ancho * c.caja.alto; largo = c.caja.largo; ancho = c.caja.ancho; }
  const alto = Math.max(1, Math.ceil(volCm3 / (largo * ancho)));
  return { pesoKg: Math.max(0.01, pesoG / 1000), volumenM3: volCm3 / 1_000_000, largoCm: Math.ceil(largo), anchoCm: Math.ceil(ancho), altoCm: alto, estandar };
}

// ── Cotizar ──────────────────────────────────────────────

const cache = new Map<string, { ts: number; r: api.Resultado<api.Tarifa> }>();

/** Lo que cobra OCA por llevar esos productos a ese código postal (en pesos, con IVA). */
export async function cotizarOca(org: string, tipo: string, items: { variacionId: number; cantidad: number }[], cpDestino: string, valor: number): Promise<api.Resultado<api.Tarifa>> {
  const c = await configOca(org);
  const modalidad = modalidadDe(tipo);
  const falta = faltaParaOca(c, "cotizar", modalidad);
  if (falta) return { ok: false, motivo: falta };
  const cp = api.soloCp(cpDestino);
  if (cp.length !== 4) return { ok: false, motivo: "Poné un código postal válido para calcular el envío." };
  const b = await bultoDe(org, items, c!);
  const operativa = (modalidad === "domicilio" ? c!.operativaDomicilio : c!.operativaSucursal)!;
  const clave = [org, operativa, cp, b.pesoKg.toFixed(2), b.volumenM3.toFixed(4), Math.round(valor / 1000)].join("|");
  const ya = cache.get(clave);
  if (ya && Date.now() - ya.ts < 10 * 60_000) return ya.r;
  const r = await api.tarifar({ pesoKg: b.pesoKg, volumenM3: b.volumenM3, cpOrigen: c!.origen.cp, cpDestino: cp, paquetes: 1, valor, cuit: c!.cuit!, operativa });
  if (r.ok) { cache.set(clave, { ts: Date.now(), r }); if (cache.size > 500) cache.delete(cache.keys().next().value!); }
  return r;
}

/** "Probar conexión" de la configuración: cotiza un bulto estándar a Córdoba capital. */
export async function probarOca(org: string, cpDestino = "5000"): Promise<string> {
  const c = await configOca(org);
  const ops: [string, string | null][] = [["a domicilio", c?.operativaDomicilio ?? null], ["a sucursal", c?.operativaSucursal ?? null]];
  const falta = faltaParaOca(c, "cotizar", c?.operativaDomicilio ? "domicilio" : "sucursal");
  if (falta) throw new ErrorErp(falta);
  const partes: string[] = [];
  let ok = true;
  for (const [nombre, op] of ops) {
    if (!op) continue;
    const r = await api.tarifar({ pesoKg: c!.pesoStdG / 1000, volumenM3: (c!.caja.largo * c!.caja.ancho * c!.caja.alto) / 1_000_000, cpOrigen: c!.origen.cp,
      cpDestino, paquetes: 1, valor: 10000, cuit: c!.cuit!, operativa: op });
    if (r.ok) partes.push(`${nombre}: $ ${r.datos.total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${r.datos.plazoDias ? ` (${r.datos.plazoDias} días)` : ""}`);
    else { ok = false; partes.push(`${nombre}: ${r.motivo}`); }
  }
  const texto = `Caja estándar de ${c!.origen.cp} a ${cpDestino} — ${partes.join(" · ")}`;
  await consulta("update oca_config set ultima_prueba = $2 where organizacion_id = $1", [org, JSON.stringify({ ts: new Date().toISOString(), ok, texto })]);
  if (!ok) throw new ErrorErp(texto);
  return texto;
}

export async function sucursalesOca(cp: string, org?: string): Promise<api.Sucursal[]> {
  const r = await api.sucursales(cp);
  const todas = r.ok ? r.datos : [];
  // Para revisar qué contestó OCA cuando no salió ninguna (no se muestra en pantalla).
  if (!todas.length && org) {
    await consulta("update oca_config set diagnostico = $2 where organizacion_id = $1",
      [org, JSON.stringify({ ts: new Date().toISOString(), cp, motivo: r.ok ? "sin sucursales" : r.motivo, crudo: (r.crudo ?? "").slice(0, 3000) })]).catch(() => {});
  }
  // Las que entregan paquetes; si OCA describe los servicios de otra forma y no queda ninguna, todas.
  const entregan = todas.filter((s) => s.entrega);
  return entregan.length ? entregan : todas;
}

// ── Alta del envío desde el pedido ───────────────────────

type DatosPedido = {
  id: number; canal_id: number; estado: string; total_ars: number; costo_envio_ars: number; envio: Record<string, unknown> | null; metodo_tipo: string | null; metodo_nombre: string | null;
  cliente: string | null; email: string | null; telefono: string | null; movil: string | null;
};

/** El envío de OCA vigente del pedido (no anulado), si hay. */
export async function envioOcaDe(org: string, pedidoId: number) {
  return una<{ id: number; estado: string | null; tracking: string | null; datos: Record<string, unknown> }>(`
    select id::int, estado, tracking, coalesce(datos_externos -> 'oca', '{}') datos from envio
     where organizacion_id = $1 and pedido_id = $2 and logistica = 'oca' and coalesce(estado, '') <> 'cancelled' order by id desc limit 1`, [org, pedidoId]);
}

const partirNombre = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? { nombre: p.slice(0, -1).join(" "), apellido: p[p.length - 1] } : { nombre: "", apellido: p[0] ?? "" };
};
const hoyAr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()).replace(/-/g, "");

/** Da de alta el envío en OCA y lo deja en el pedido. Devuelve el número de envío. */
export async function altaOca(org: string, pedidoId: number): Promise<string> {
  const ya = await envioOcaDe(org, pedidoId);
  if (ya) throw new ErrorErp(`Este pedido ya tiene el envío de OCA ${ya.tracking ?? ""}.`);
  const p = await una<DatosPedido>(`
    select p.id::int, p.canal_id::int, p.estado, p.total_ars::float, p.costo_envio_ars::float, p.envio, me.tipo metodo_tipo, me.nombre metodo_nombre,
           cl.nombre cliente, cl.email, cl.telefono, cl.telefono_movil movil
      from pedido p left join metodo_envio me on me.id = p.metodo_envio_id left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.id = $2`, [org, pedidoId]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (["cancelado", "devuelto"].includes(p.estado)) throw new ErrorErp(`El pedido está ${p.estado}.`);
  const c = await configOca(org);
  const modalidad = modalidadDe(p.metodo_tipo);
  const falta = faltaParaOca(c, "alta", modalidad);
  if (falta) throw new ErrorErp(falta);
  const env = (p.envio ?? {}) as { direccion?: Record<string, string | null> | null; sucursal_oca?: { id?: string; nombre?: string } | null };
  const d = env.direccion ?? {};
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
  if (!s("codigo_postal") || (modalidad === "domicilio" && (!s("calle") || !s("localidad") || !s("provincia")))) {
    throw new ErrorErp("Al pedido le falta la dirección de entrega (calle, localidad, provincia y código postal).");
  }
  const idci = modalidad === "sucursal" ? env.sucursal_oca?.id ?? null : null;
  if (modalidad === "sucursal" && !idci) throw new ErrorErp("El pedido es «OCA a sucursal» pero no tiene la sucursal elegida.");
  const lineas = await consulta<{ variacionId: number; cantidad: number }>(
    `select variacion_id::int "variacionId", cantidad::int from pedido_linea where organizacion_id = $1 and pedido_id = $2 and variacion_id is not null`, [org, pedidoId]);
  const b = await bultoDe(org, lineas, c!);
  const receptor = (typeof d.receptor === "string" && d.receptor) || p.cliente || "";
  const n = partirNombre(receptor);
  const [piso, depto] = (s("piso_depto") || "").split(/\s*[\/,]\s*|\s+/, 2);
  const valor = Math.max(1, Number(p.total_ars) - Number(p.costo_envio_ars || 0));
  const xml = api.xmlAlta({
    nroCuenta: c!.nroCuenta!, operativa: (modalidad === "domicilio" ? c!.operativaDomicilio : c!.operativaSucursal)!, remito: `Pedido ${pedidoId}`, fecha: hoyAr(),
    franja: c!.franja, centroOrigen: c!.centroOrigen, origen: c!.origen,
    destino: {
      apellido: n.apellido, nombre: n.nombre, calle: s("calle"), numero: s("numero") || "0", piso: piso ?? "", depto: depto ?? "",
      localidad: s("localidad"), provincia: s("provincia"), cp: s("codigo_postal"),
      telefono: (typeof d.receptor_telefono === "string" && d.receptor_telefono) || p.telefono || p.movil || "", celular: p.movil || "", email: p.email || "",
      observaciones: s("referencia").slice(0, 100), idci,
    },
    paquetes: [{ largoCm: b.largoCm, anchoCm: b.anchoCm, altoCm: b.altoCm, pesoKg: b.pesoKg, valor }],
  });
  const r = await api.ingresar(c!.usuario!, (await fila(org))!.clave!, xml);
  if (!r.ok) throw new ErrorErp(r.motivo);
  const datos = {
    orden_retiro: r.datos.ordenRetiro, numero_envio: r.datos.numeroEnvio, operativa: modalidad, alta: new Date().toISOString(),
    sucursal: modalidad === "sucursal" ? env.sucursal_oca ?? null : null, bulto: b,
  };
  await consulta(`
    insert into envio (organizacion_id, canal_id, pedido_id, logistica, metodo, estado, tracking, transportista, receptor, direccion, costo_ars, datos_externos)
    values ($1, $2, $3, 'oca', $4, 'ready_to_ship', $5, 'OCA', $6, $7, $8, jsonb_build_object('oca', $9::jsonb))`,
    [org, p.canal_id, pedidoId, modalidad === "sucursal" ? "A sucursal" : "A domicilio", r.datos.numeroEnvio, receptor || null,
      JSON.stringify(d), p.costo_envio_ars || null, JSON.stringify(datos)]);
  return r.datos.numeroEnvio;
}

/** La etiqueta en PDF de un envío de OCA. */
export async function etiquetaOca(org: string, envioId: number): Promise<{ ok: true; pdf: Uint8Array } | { ok: false; motivo: string }> {
  const e = await una<{ orden: string | null; numero: string | null }>(`
    select datos_externos #>> '{oca,orden_retiro}' orden, datos_externos #>> '{oca,numero_envio}' numero from envio
     where id = $1 and organizacion_id = $2 and logistica = 'oca'`, [envioId, org]);
  if (!e?.orden && !e?.numero) return { ok: false, motivo: "Ese envío no es de OCA." };
  const r = await api.etiquetaPdf(e.orden ?? "", e.numero ?? "");
  return r.ok ? { ok: true, pdf: r.datos } : { ok: false, motivo: r.motivo };
}

/** Anula en OCA un envío que todavía no salió. */
export async function anularOca(org: string, envioId: number): Promise<string> {
  const e = await una<{ estado: string | null; orden: string | null; en_camino: string | null }>(`
    select estado, datos_externos #>> '{oca,orden_retiro}' orden, datos_externos #>> '{oca,en_camino}' en_camino from envio
     where id = $1 and organizacion_id = $2 and logistica = 'oca'`, [envioId, org]);
  if (!e?.orden) throw new ErrorErp("Ese envío no es de OCA.");
  if (e.en_camino || (e.estado && e.estado !== "ready_to_ship")) throw new ErrorErp("El envío ya salió: no se puede anular.");
  const c = await fila(org);
  if (!c?.usuario || !c.clave) throw new ErrorErp("Falta el usuario y la contraseña de ePak en la configuración de OCA.");
  const r = await api.anular(c.usuario, c.clave, e.orden);
  if (!r.ok) throw new ErrorErp(r.motivo);
  await consulta(`update envio set estado = 'cancelled', actualizado_ts = now(),
                         datos_externos = jsonb_set(datos_externos, '{oca,anulado}', to_jsonb(now()::text)) where id = $1`, [envioId]);
  return "Envío anulado en OCA.";
}

// ── Seguimiento ──────────────────────────────────────────

/** Lee de OCA por dónde anda un envío y lo deja en el envío y en el pedido
 *  (en camino → despachado; entregado → entregado). Devuelve el estado. */
export async function seguirEnvio(org: string, envioId: number, cuit?: string | null): Promise<string | null> {
  const e = await una<{ pedido_id: number | null; estado: string | null; numero: string | null; datos: Record<string, unknown> }>(`
    select pedido_id::int, estado, datos_externos #>> '{oca,numero_envio}' numero, coalesce(datos_externos -> 'oca', '{}') datos
      from envio where id = $1 and organizacion_id = $2 and logistica = 'oca'`, [envioId, org]);
  if (!e?.numero) return null;
  const elCuit = cuit ?? (await fila(org))?.cuit;
  if (!elCuit) return e.estado;
  const r = await api.seguimiento(e.numero, elCuit);
  if (!r.ok) {
    await consulta("update envio set datos_externos = jsonb_set(datos_externos, '{oca,ultimo_error}', to_jsonb($2::text)) where id = $1", [envioId, r.motivo.slice(0, 300)]);
    return e.estado;
  }
  const pasos = [...r.datos].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  const primero = (h: string) => pasos.find((p) => api.hitoDe(p.estado) === h)?.fecha ?? null;
  const enCamino = (e.datos.en_camino as string | undefined) ?? primero("en_camino") ?? primero("entregado");
  const entregado = primero("entregado");
  const devuelto = primero("devuelto");
  const estado = devuelto ? "returned" : entregado ? "delivered" : enCamino ? "shipped" : e.estado === "cancelled" ? "cancelled" : "ready_to_ship";
  const ultimo = pasos[pasos.length - 1];
  await consulta(`
    update envio set estado = $2, subestado = $3, actualizado_ts = now(),
           datos_externos = jsonb_set(datos_externos, '{oca}', coalesce(datos_externos -> 'oca', '{}') || $4::jsonb)
     where id = $1`,
    [envioId, estado, ultimo ? [ultimo.estado, ultimo.motivo].filter(Boolean).join(" · ").slice(0, 120) : null,
      JSON.stringify({ en_camino: enCamino, entregado, devuelto, historial: pasos.slice(-30), leido: new Date().toISOString(), ultimo_error: null })]);

  // El pedido sigue al envío (sólo hacia adelante).
  if (e.pedido_id && estado !== e.estado) {
    const p = await una<{ estado: string }>("select estado from pedido where id = $1 and organizacion_id = $2", [e.pedido_id, org]);
    try {
      if ((estado === "shipped" || estado === "delivered") && p && ["pagado", "en_preparacion", "preparado"].includes(p.estado)) {
        await cambiarEstado(org, e.pedido_id, "despachado", "sistema", "OCA: en camino");
      }
      if (estado === "delivered" && p && p.estado !== "entregado" && !["nuevo", "cancelado", "devuelto"].includes(p.estado)) {
        await cambiarEstado(org, e.pedido_id, "entregado", "sistema", "OCA: entregado");
      }
    } catch (err) {
      console.error("[oca] estado del pedido", e.pedido_id, err instanceof Error ? err.message : err);
    }
  }
  return estado;
}

/** El barrido: todos los envíos de OCA que todavía no terminaron (de los últimos 60 días). */
export async function barrerOca(hastaMs: number): Promise<{ revisados: number; cambiaron: number }> {
  const envios = await consulta<{ id: number; org: string; estado: string | null; cuit: string | null }>(`
    select e.id::int, e.organizacion_id org, e.estado, c.cuit from envio e join oca_config c on c.organizacion_id = e.organizacion_id
     where e.logistica = 'oca' and coalesce(e.estado, '') not in ('delivered', 'cancelled', 'returned') and e.creado_ts > now() - interval '60 days'
     order by e.actualizado_ts limit 200`);
  let revisados = 0, cambiaron = 0;
  for (const e of envios) {
    if (Date.now() > hastaMs) break;
    try {
      const nuevo = await seguirEnvio(e.org, e.id, e.cuit);
      revisados++;
      if (nuevo !== e.estado) cambiaron++;
    } catch (err) {
      console.error("[oca] seguimiento", e.id, err instanceof Error ? err.message : err);
    }
  }
  return { revisados, cambiaron };
}
