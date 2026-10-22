"use server";

import { normalizarCuit } from "@/lib/clientes";

// Clientes: alta manual (con todos los datos de la ficha), ficha, direcciones e
// identidades por canal. En operación normal los clientes los crean los
// pedidos (lib/pedidos, crearPedido).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { CONDICIONES_IVA } from "@/app/ventas/formato";
import { whatsappNormal } from "@/lib/telefono";
import { tienePermiso } from "@/lib/permisos";
import { leerNumero } from "@/lib/numeros";

const LISTADO = "/ventas/clientes";
const ficha = (n: number) => `/ventas/clientes/${n}`;

const tipo = (fd: FormData) => (fd.get("tipo") === "mayorista" ? "mayorista" : "consumidor_final");
const condicionIva = (fd: FormData) => {
  const t = texto(fd, "condicion_iva");
  return t && Object.hasOwn(CONDICIONES_IVA, t) ? t : null;
};

/** El cliente tiene que ser de la organización; si no, error. */
async function delaOrg(org: string, clienteId: number) {
  const c = await una("select id from cliente where id = $1 and organizacion_id = $2", [clienteId, org]);
  if (!c) throw new ErrorErp("El cliente no existe.");
}

/** CUIT sólo con números (se muestra con guiones, cuitLegible); si no tiene 11 dígitos, avisa en vez de guardarlo mal. */
function cuitDe(fd: FormData): string | null {
  const t = texto(fd, "cuit");
  if (!t) return null;
  const c = normalizarCuit(t);
  if (!c) throw new ErrorErp("El CUIT tiene que tener 11 dígitos.");
  return c;
}

/** El DNI (Fer, 22/10: el CUIT va en su campo, el DNI en éste). Con puntos o espacios, se guarda sólo con números. */
function dniDe(fd: FormData): string | null {
  const t = texto(fd, "documento_numero");
  if (!t) return null;
  const d = /^[\d.\s-]+$/.test(t) ? t.replace(/\D/g, "") : t;
  if (/^\d{11}$/.test(d)) throw new ErrorErp("Ese número tiene 11 cifras: es un CUIT o CUIL, va en el campo «CUIT / CUIL».");
  return d;
}

/** El WhatsApp en formato internacional, sólo números (5493511234567): se acepta como se escriba (con 0, 15, +54…). */
function whatsappDe(fd: FormData): string | null {
  const t = texto(fd, "whatsapp");
  if (!t) return null;
  const w = whatsappNormal(t);
  if (!w) throw new ErrorErp("El WhatsApp no parece un celular: escribilo con la característica (ej. 351 555-1234).");
  return w;
}

/** Todos los datos del formulario del cliente (CamposCliente: alta y ficha), validados. La razón social
 *  es también su nombre en las listas (Fer, 22/10: la factura sale con ése). */
async function datosDe(fd: FormData, org: string, permisos: Parameters<typeof tienePermiso>[0]) {
  const razon = texto(fd, "razon_social");
  if (!razon) throw new ErrorErp("El cliente necesita una razón social.");
  const lista = id(fd, "lista_precios_id") || null;
  if (lista && !(await una("select 1 from lista_precios where id = $1 and organizacion_id = $2", [lista, org]))) {
    throw new ErrorErp("Esa lista de precios no existe.");
  }
  const conCc = fd.get("con_cc") === "1";
  if (conCc && !tienePermiso(permisos, "cc_asignar")) throw new ErrorErp("No tenés permiso para cambiar la cuenta corriente ni el límite de crédito.");
  const limite = conCc ? leerNumero(fd.get("limite_cc")) : null;
  if (limite != null && limite < 0) throw new ErrorErp("El límite de crédito no puede ser negativo.");
  const dni = dniDe(fd);
  return {
    nombre: razon, razon_social: razon, tipo: tipo(fd), apellido: texto(fd, "apellido"), nombre_pila: texto(fd, "nombre_pila"),
    apodo_ml: texto(fd, "apodo_ml"), cuit: cuitDe(fd), documento_tipo: dni ? "DNI" : null, documento_numero: dni,
    condicion_iva: condicionIva(fd), email: texto(fd, "email"), telefono: texto(fd, "telefono"),
    telefono_aclaracion: texto(fd, "telefono_aclaracion"), whatsapp: whatsappDe(fd),
    factura_por_whatsapp: fd.get("factura_por_whatsapp") === "on", factura_por_mail: fd.get("factura_por_mail") === "on",
    lista_precios_id: lista, notas: texto(fd, "notas"),
    // La ficha manda la casilla de cuenta corriente y el límite (con_cc) sólo a quien tiene «cc_asignar»; sin ella, quedan como estaban.
    cuenta_corriente: conCc ? fd.get("cuenta_corriente") === "on" : null, limite_cc: conCc ? limite : null,
  };
}

export async function accionCrearCliente(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  await intentar(LISTADO, async () => {
    const d = await datosDe(fd, s.org.id, s.permisos);
    const r = await una<{ id: number }>(`
      insert into cliente (organizacion_id, nombre, razon_social, tipo, apellido, nombre_pila, apodo_ml, cuit, documento_tipo, documento_numero,
                           condicion_iva, email, telefono, telefono_aclaracion, whatsapp, factura_por_whatsapp, factura_por_mail,
                           lista_precios_id, notas, cuenta_corriente, limite_cc)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, coalesce($20, false), $21) returning id::int`,
      [s.org.id, d.nombre, d.razon_social, d.tipo, d.apellido, d.nombre_pila, d.apodo_ml, d.cuit, d.documento_tipo, d.documento_numero,
        d.condicion_iva, d.email, d.telefono, d.telefono_aclaracion, d.whatsapp, d.factura_por_whatsapp, d.factura_por_mail,
        d.lista_precios_id, d.notas, d.cuenta_corriente, d.limite_cc]);
    revalidatePath(LISTADO);
    return { ir: `${ficha(r!.id)}?ok=${encodeURIComponent("Cliente creado.")}` };
  });
}

export async function accionGuardarCliente(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd);
  await intentar(ficha(cid), async () => {
    const d = await datosDe(fd, s.org.id, s.permisos);
    const r = await consulta(`
      update cliente set nombre = $3, razon_social = $4, tipo = $5, apellido = $6, nombre_pila = $7, apodo_ml = $8, cuit = $9,
                         documento_tipo = $10, documento_numero = $11, condicion_iva = $12, email = $13, telefono = $14,
                         telefono_aclaracion = $15,
                         -- El WhatsApp: si una persona lo cambia, deja de figurar "nos escribió desde acá".
                         whatsapp_confirmado_ts = case when whatsapp is distinct from $16 then null else whatsapp_confirmado_ts end, whatsapp = $16,
                         factura_por_whatsapp = $17, factura_por_mail = $18, lista_precios_id = $19, notas = $20,
                         cuenta_corriente = coalesce($21, cuenta_corriente),
                         limite_cc = case when $21::boolean is null then limite_cc else $22::numeric end
       where id = $2 and organizacion_id = $1 returning id`,
      [s.org.id, cid, d.nombre, d.razon_social, d.tipo, d.apellido, d.nombre_pila, d.apodo_ml, d.cuit, d.documento_tipo, d.documento_numero,
        d.condicion_iva, d.email, d.telefono, d.telefono_aclaracion, d.whatsapp, d.factura_por_whatsapp, d.factura_por_mail,
        d.lista_precios_id, d.notas, d.cuenta_corriente, d.limite_cc]);
    if (!r.length) throw new ErrorErp("El cliente no existe.");
    revalidatePath(ficha(cid));
    return "Guardado.";
  });
}

export async function accionBorrarCliente(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd);
  await intentar(ficha(cid), async () => {
    const n = await una<{ n: number }>("select count(*)::int n from pedido where cliente_id = $1 and organizacion_id = $2", [cid, s.org.id]);
    if (n && n.n > 0) throw new ErrorErp(`No se puede borrar: tiene ${n.n} pedido${n.n === 1 ? "" : "s"}.`);
    await consulta("delete from cliente where id = $2 and organizacion_id = $1", [s.org.id, cid]);
    revalidatePath(LISTADO);
    return { ir: `${LISTADO}?ok=${encodeURIComponent("Cliente borrado.")}` };
  });
}

// ── Direcciones ──────────────────────────────────────────

function datosDireccion(fd: FormData) {
  return [texto(fd, "etiqueta"), texto(fd, "calle"), texto(fd, "numero"), texto(fd, "piso_depto"), texto(fd, "localidad"),
    texto(fd, "provincia"), texto(fd, "codigo_postal"), texto(fd, "pais") ?? "AR"];
}

export async function accionAgregarDireccion(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd, "cliente_id");
  await intentar(ficha(cid), async () => {
    await delaOrg(s.org.id, cid);
    const d = datosDireccion(fd);
    if (!d[1] && !d[4]) throw new ErrorErp("La dirección necesita al menos la calle o la localidad.");
    // La primera dirección del cliente nace principal.
    await consulta(`
      insert into cliente_direccion (organizacion_id, cliente_id, etiqueta, calle, numero, piso_depto, localidad, provincia, codigo_postal, pais, principal)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, not exists (select 1 from cliente_direccion where cliente_id = $2))`,
      [s.org.id, cid, ...d]);
    revalidatePath(ficha(cid));
    return "Dirección agregada.";
  });
}

export async function accionGuardarDireccion(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd, "cliente_id");
  await intentar(ficha(cid), async () => {
    const r = await consulta(`
      update cliente_direccion set etiqueta = $4, calle = $5, numero = $6, piso_depto = $7, localidad = $8, provincia = $9,
                                   codigo_postal = $10, pais = $11
       where id = $2 and cliente_id = $3 and organizacion_id = $1 returning id`,
      [s.org.id, id(fd), cid, ...datosDireccion(fd)]);
    if (!r.length) throw new ErrorErp("La dirección no existe.");
    revalidatePath(ficha(cid));
    return "Guardado.";
  });
}

export async function accionDireccionPrincipal(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd, "cliente_id");
  await intentar(ficha(cid), async () => {
    await delaOrg(s.org.id, cid);
    await enTransaccion(async (c) => {
      const r = await c.query("select 1 from cliente_direccion where id = $1 and cliente_id = $2 and organizacion_id = $3", [id(fd), cid, s.org.id]);
      if (!r.rowCount) throw new ErrorErp("La dirección no existe.");
      await c.query("update cliente_direccion set principal = (id = $1) where cliente_id = $2 and organizacion_id = $3", [id(fd), cid, s.org.id]);
    });
    revalidatePath(ficha(cid));
    return "Quedó como principal.";
  });
}

export async function accionBorrarDireccion(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd, "cliente_id");
  await intentar(ficha(cid), async () => {
    await consulta("delete from cliente_direccion where id = $2 and cliente_id = $3 and organizacion_id = $1", [s.org.id, id(fd), cid]);
    revalidatePath(ficha(cid));
    return "Dirección borrada.";
  });
}

// ── Identidades por canal ────────────────────────────────

export async function accionQuitarIdentidad(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd, "cliente_id");
  await intentar(ficha(cid), async () => {
    await consulta("delete from cliente_identidad where id = $2 and cliente_id = $3 and organizacion_id = $1", [s.org.id, id(fd), cid]);
    revalidatePath(ficha(cid));
    return "Identidad quitada.";
  });
}
