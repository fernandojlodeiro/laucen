"use server";

// Clientes: alta manual mínima (para corregir), ficha, direcciones e
// identidades por canal. En operación normal los clientes los crean los
// pedidos (lib/pedidos, crearPedido).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { DOCUMENTOS, CONDICIONES_IVA } from "@/app/ventas/formato";

const LISTADO = "/ventas/clientes";
const ficha = (n: number) => `/ventas/clientes/${n}`;

const tipo = (fd: FormData) => (fd.get("tipo") === "mayorista" ? "mayorista" : "consumidor_final");
const documentoTipo = (fd: FormData) => {
  const t = texto(fd, "documento_tipo");
  return t && (DOCUMENTOS as readonly string[]).includes(t) ? t : null;
};
const condicionIva = (fd: FormData) => {
  const t = texto(fd, "condicion_iva");
  return t && Object.hasOwn(CONDICIONES_IVA, t) ? t : null;
};

/** El cliente tiene que ser de la organización; si no, error. */
async function delaOrg(org: string, clienteId: number) {
  const c = await una("select id from cliente where id = $1 and organizacion_id = $2", [clienteId, org]);
  if (!c) throw new ErrorErp("El cliente no existe.");
}

export async function accionCrearCliente(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  await intentar(LISTADO, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El cliente necesita un nombre.");
    const r = await una<{ id: number }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero)
      values ($1, $2, $3, $4, $5, $6, $7) returning id::int`,
      [s.org.id, nombre, tipo(fd), texto(fd, "email"), texto(fd, "telefono"), documentoTipo(fd), texto(fd, "documento_numero")]);
    revalidatePath(LISTADO);
    return { ir: `${ficha(r!.id)}?ok=${encodeURIComponent("Cliente creado.")}` };
  });
}

export async function accionGuardarCliente(fd: FormData) {
  const s = await entrarErp("clientes_ver");
  const cid = id(fd);
  await intentar(ficha(cid), async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El cliente necesita un nombre.");
    const lista = id(fd, "lista_precios_id") || null;
    if (lista && !(await una("select 1 from lista_precios where id = $1 and organizacion_id = $2", [lista, s.org.id]))) {
      throw new ErrorErp("Esa lista de precios no existe.");
    }
    const r = await consulta(`
      update cliente set nombre = $3, tipo = $4, email = $5, telefono = $6, documento_tipo = $7, documento_numero = $8,
                         condicion_iva = $9, lista_precios_id = $10, notas = $11
       where id = $2 and organizacion_id = $1 returning id`,
      [s.org.id, cid, nombre, tipo(fd), texto(fd, "email"), texto(fd, "telefono"), documentoTipo(fd),
        texto(fd, "documento_numero"), condicionIva(fd), lista, texto(fd, "notas")]);
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
