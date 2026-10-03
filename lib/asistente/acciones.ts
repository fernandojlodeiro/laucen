// Lo que el asistente puede hacer (pedido de Fer, 3/10), siempre en dos
// pasos: el asistente PREPARA la acción (valida, busca, arma la lista de lo
// que va a pasar) y la deja 'propuesta' en asistente_accion; la persona la ve
// en el chat como una tarjeta y recién al apretar Confirmar se HACE, con las
// mismas funciones que usan las pantallas. Nunca sale nada a Mercado Libre.
//
// Pide el permiso «Pedirle al asistente que haga cosas» y, cada acción, el de
// su pantalla (facturar: «Facturación»; clientes: «Clientes»; pedidos:
// «Pedidos»). Un superadministrador, además, puede pedirle cualquier otro
// cambio en los datos de Laucen (proponer_cambio_en_datos, resguardos en
// lib/asistente/sql.ts; decisión de Fer, 3/10: sólo superadministradores).
// Lo que no se puede hacer se anota en asistente_pendiente para que el
// superadministrador lo mande a programar.

import type Anthropic from "@anthropic-ai/sdk";
import { consultarSql, ensayarCambio, hacerCambio } from "./sql";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { tienePermiso, type Permisos, type PermisoKey } from "@/lib/permisos";
import { formatear } from "@/lib/moneda";
import { precioDe } from "@/lib/precios";
import { prepararFactura, emitir } from "@/lib/arca/facturar";
import { cambiarEstado, esEstadoPedido, exigirCarritoLibre, ESTADOS_PEDIDO } from "@/lib/pedidos";
import { crearPedidoAMano, validarPedidoAMano, TIPOS_A_MANO, MEDIOS_A_MANO, PAGOS_A_MANO, type PedidoAMano } from "@/lib/pedidos/a-mano";

export type CtxAccion = { org: string; usuarioId: string; permisos: Permisos; authId: string; superadmin: boolean };
type Preparada = { resumen: string; detalle: string[]; datos: Record<string, unknown> };
type Accion = {
  permiso: PermisoKey;
  herramienta: Anthropic.Beta.BetaTool;
  preparar: (e: Record<string, unknown>, ctx: CtxAccion) => Promise<Preparada>;
  hacer: (datos: Record<string, unknown>, ctx: CtxAccion) => Promise<string>;
};

const TOPE_LOTE = 50;
const ids = (x: unknown): number[] => {
  const v = (Array.isArray(x) ? x : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const unicos = [...new Set(v)];
  if (!unicos.length) throw new ErrorErp("Faltan los números de pedido.");
  if (unicos.length > TOPE_LOTE) throw new ErrorErp(`Son ${unicos.length} pedidos: de a ${TOPE_LOTE} por vez.`);
  return unicos;
};
const txt = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const pesos = (n: number) => formatear(n, "ARS");

// ── Facturar pedidos ──────────────────────────────────────────────────
const facturar: Accion = {
  permiso: "facturacion_ver",
  herramienta: {
    name: "proponer_facturar_pedidos",
    description: "Prepara la facturación electrónica (ARCA) de uno o varios pedidos (hasta 50). No factura: la persona confirma con un botón. Buscá antes los pedidos con consultar_datos (lista pedidos).",
    input_schema: { type: "object", properties: { pedido_ids: { type: "array", items: { type: "integer" } } }, required: ["pedido_ids"] },
  },
  async preparar(e, { org }) {
    const pedidos = ids(e.pedido_ids);
    const filas = await consulta<{ id: number; cliente: string | null; total: number; estado: string; facturado: boolean }>(`
      select p.id::int, coalesce(cl.razon_social, cl.nombre) cliente, p.total_ars::float total, p.estado,
             exists (select 1 from comprobante c where c.pedido_id = p.id and c.estado = 'autorizado') facturado
        from pedido p left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and p.id = any($2::bigint[]) order by p.id`, [org, pedidos]);
    const faltan = pedidos.filter((n) => !filas.some((f) => f.id === n));
    const ya = filas.filter((f) => f.facturado);
    const van = filas.filter((f) => !f.facturado && !["cancelado", "devuelto"].includes(f.estado));
    if (!van.length) throw new ErrorErp(`Ninguno se puede facturar${ya.length ? ` (ya facturados: ${ya.map((f) => f.id).join(", ")})` : ""}${faltan.length ? ` (no existen: ${faltan.join(", ")})` : ""}.`);
    const total = van.reduce((s, f) => s + f.total, 0);
    const detalle = van.map((f) => `Pedido ${f.id} — ${f.cliente ?? "Consumidor final"} — ${pesos(f.total)}`);
    if (ya.length) detalle.push(`No van (ya tienen factura): ${ya.map((f) => f.id).join(", ")}`);
    if (faltan.length) detalle.push(`No existen: ${faltan.join(", ")}`);
    return { resumen: `Facturar ${van.length} pedido${van.length === 1 ? "" : "s"} por ${pesos(total)} en total`, detalle, datos: { ids: van.map((f) => f.id) } };
  },
  async hacer(d, { org, usuarioId }) {
    const ok: number[] = [], errores: string[] = [];
    for (const pid of d.ids as number[]) {
      try {
        const cid = await prepararFactura(org, pid, usuarioId);
        const r = await emitir(org, cid);
        if (r.estado === "autorizado") ok.push(pid); else errores.push(`pedido ${pid}: ${r.mensaje}`);
      } catch (e) { errores.push(`pedido ${pid}: ${motivoErp(e)}`); }
    }
    return [`Facturados ${ok.length} de ${(d.ids as number[]).length}.`, ...(errores.length ? [`Con problemas: ${errores.join("; ")}.`] : []),
      "Están en [Facturación](/administracion/facturacion)."].join(" ");
  },
};

// ── Crear un cliente ──────────────────────────────────────────────────
const DOCS = ["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"];
const crearCliente: Accion = {
  permiso: "clientes_ver",
  herramienta: {
    name: "proponer_crear_cliente",
    description: "Prepara el alta de un cliente (por ejemplo, el que está en el mostrador). No lo crea: la persona confirma. Pedí al menos el nombre; si te dan documento, mail o teléfono, ponelos.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" }, tipo: { type: "string", enum: ["consumidor_final", "mayorista"] },
        documento_tipo: { type: "string", enum: DOCS }, documento_numero: { type: "string" },
        email: { type: "string" }, telefono: { type: "string" },
      },
      required: ["nombre"],
    },
  },
  async preparar(e, { org }) {
    const nombre = txt(e.nombre);
    if (!nombre) throw new ErrorErp("El cliente necesita un nombre.");
    const datos = {
      nombre, tipo: e.tipo === "mayorista" ? "mayorista" : "consumidor_final",
      documento_tipo: DOCS.includes(String(e.documento_tipo)) ? String(e.documento_tipo) : null,
      documento_numero: txt(e.documento_numero)?.replace(/[\s.]/g, "") ?? null, email: txt(e.email)?.toLowerCase() ?? null, telefono: txt(e.telefono),
    };
    if (datos.documento_numero && !datos.documento_tipo) datos.documento_tipo = datos.documento_numero.replace(/\D/g, "").length === 11 ? "CUIT" : "DNI";
    const parecidos = await consulta<{ id: number; nombre: string }>(`
      select id::int, nombre from cliente where organizacion_id = $1
         and (($2::text is not null and regexp_replace(coalesce(documento_numero, ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g'))
           or ($3::text is not null and lower(email) = $3)) limit 3`, [org, datos.documento_numero, datos.email]);
    const detalle = [
      `Nombre: ${nombre}`, `Tipo: ${datos.tipo === "mayorista" ? "Mayorista" : "Consumidor final"}`,
      ...(datos.documento_numero ? [`${datos.documento_tipo}: ${datos.documento_numero}`] : []),
      ...(datos.email ? [`Mail: ${datos.email}`] : []), ...(datos.telefono ? [`Teléfono: ${datos.telefono}`] : []),
      ...parecidos.map((p) => `Ojo: ya existe un cliente con ese documento o mail: N.º ${p.id} ${p.nombre}`),
    ];
    return { resumen: `Crear el cliente ${nombre}`, detalle, datos };
  },
  async hacer(d, { org }) {
    const r = await una<{ id: number }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero)
      values ($1, $2, $3, $4, $5, $6, $7) returning id::int`,
      [org, d.nombre, d.tipo, d.email, d.telefono, d.documento_tipo, d.documento_numero]);
    return `Cliente N.º ${r!.id} creado: [${d.nombre}](/ventas/clientes/${r!.id}).`;
  },
};

// ── Crear un pedido a mano ───────────────────────────────────────────
const crearPedido: Accion = {
  permiso: "pedidos_ver",
  herramienta: {
    name: "proponer_crear_pedido",
    description: `Prepara un pedido cargado a mano (local, web, mayorista; nunca Mercado Libre). No lo crea: la persona confirma. Productos por SKU (buscalos con consultar_datos, lista productos). Sin precio, va el de la lista. pago: ${PAGOS_A_MANO.join(" | ")} ("a_convenir" = se cobra al entregar). medio (si pagó): ${MEDIOS_A_MANO.join(", ")}. Sin cliente = consumidor final. Sin canal: el único canal de local, si hay uno solo.`,
    input_schema: {
      type: "object",
      properties: {
        canal_id: { type: "integer" }, canal: { type: "string", description: "Nombre del canal, si no sabés el número." },
        cliente_id: { type: "integer", description: "Número de cliente; sin esto, consumidor final." },
        lineas: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, cantidad: { type: "integer" }, precio: { type: "number" }, descuento_pct: { type: "number" } }, required: ["sku", "cantidad"] } },
        pago: { type: "string", enum: [...PAGOS_A_MANO] }, medio: { type: "string" },
        entrega: { type: "string", enum: ["retiro", "envio"] },
        direccion: { type: "object", properties: { calle: { type: "string" }, numero: { type: "string" }, piso_depto: { type: "string" }, localidad: { type: "string" }, provincia: { type: "string" }, codigo_postal: { type: "string" }, referencia: { type: "string" } } },
        costo_envio: { type: "number" }, notas: { type: "string" },
      },
      required: ["lineas", "pago"],
    },
  },
  async preparar(e, { org }) {
    const canales = await consulta<{ id: number; nombre: string; tipo: string; lista: number | null }>(
      "select id::int, nombre, tipo, lista_precios_id::int lista from canal where organizacion_id = $1 and estado = 'activo' and tipo = any($2::text[]) order by nombre", [org, TIPOS_A_MANO]);
    const nombreCanal = txt(e.canal)?.toLowerCase();
    const canal = e.canal_id ? canales.find((c) => c.id === Number(e.canal_id))
      : nombreCanal ? canales.find((c) => c.nombre.toLowerCase().includes(nombreCanal))
      : canales.filter((c) => c.tipo === "local").length === 1 ? canales.find((c) => c.tipo === "local") : canales.length === 1 ? canales[0] : undefined;
    if (!canal) throw new ErrorErp(`¿En qué canal? Los que admiten pedidos a mano: ${canales.map((c) => `${c.nombre} (${c.id})`).join(", ") || "ninguno"}.`);
    const clienteId = Number(e.cliente_id) || null;
    const cliente = clienteId ? await una<{ nombre: string; lista: number | null }>("select coalesce(razon_social, nombre) nombre, lista_precios_id::int lista from cliente where id = $1 and organizacion_id = $2", [clienteId, org]) : null;
    if (clienteId && !cliente) throw new ErrorErp(`No existe el cliente N.º ${clienteId}.`);
    const listaId = cliente?.lista ?? canal.lista;
    const entrada = Array.isArray(e.lineas) ? e.lineas as Record<string, unknown>[] : [];
    const lineas: PedidoAMano["lineas"] = [], detalle: string[] = [];
    let total = 0;
    for (const [i, l] of entrada.entries()) {
      const sku = txt(l.sku);
      const v = sku ? await una<{ id: number; sku: string; titulo: string }>(`
        select v.id::int, v.sku, p.titulo from variacion v join producto p on p.id = v.producto_id
         where v.organizacion_id = $1 and (lower(v.sku) = lower($2) or v.codigo_barras = $2) limit 1`, [org, sku]) : null;
      if (!v) throw new ErrorErp(`Línea ${i + 1}: no encuentro el producto «${sku ?? ""}» (buscalo por SKU).`);
      const cantidad = Number(l.cantidad);
      const precio = l.precio != null && l.precio !== "" ? Number(l.precio) : null;
      const desc = Number(l.descuento_pct) || 0;
      const unit = precio ?? (listaId ? (await precioDe(org, v.id, listaId))?.venta.ars ?? null : null);
      if (unit == null) throw new ErrorErp(`Línea ${i + 1}: «${v.sku}» no tiene precio en la lista: decime el precio.`);
      const sub = unit * (1 - desc / 100) * cantidad;
      total += sub;
      lineas.push({ variacionId: v.id, cantidad, precio, descuentoPct: desc || null });
      detalle.push(`${cantidad} × ${v.sku} ${v.titulo} — ${pesos(unit)}${desc ? ` −${desc} %` : ""}${precio == null ? " (de lista)" : ""} = ${pesos(sub)}`);
    }
    const pedido: PedidoAMano = {
      canalId: canal.id, clienteId, lineas, pago: String(e.pago) as PedidoAMano["pago"], medio: txt(e.medio),
      entrega: e.entrega === "envio" ? "envio" : "retiro",
      direccion: e.entrega === "envio" && e.direccion && typeof e.direccion === "object" ? {
        calle: null, numero: null, piso_depto: null, localidad: null, provincia: null, codigo_postal: null, referencia: null,
        ...Object.fromEntries(Object.entries(e.direccion as Record<string, unknown>).map(([k, x]) => [k, txt(x)])),
      } : null,
      costoEnvio: e.entrega === "envio" ? Number(e.costo_envio) || null : null, notas: txt(e.notas),
    };
    validarPedidoAMano(pedido);
    const envio = pedido.costoEnvio ?? 0;
    const PAGO: Record<string, string> = { a_convenir: "A cobrar al entregar", pagado: `Pagado (${pedido.medio})`, cuenta_corriente: "A cuenta corriente" };
    detalle.unshift(`Canal: ${canal.nombre} · Cliente: ${cliente?.nombre ?? "Consumidor final"} · ${PAGO[pedido.pago]} · ${pedido.entrega === "envio" ? `Envío a ${pedido.direccion?.calle ?? ""} ${pedido.direccion?.numero ?? ""}, ${pedido.direccion?.localidad ?? ""}` : "Retira"}`);
    if (envio) detalle.push(`Envío: ${pesos(envio)}`);
    if (pedido.notas) detalle.push(`Notas: ${pedido.notas}`);
    return { resumen: `Crear un pedido de ${cliente?.nombre ?? "consumidor final"} por ${pesos(total + envio)} (aprox.)`, detalle, datos: pedido as unknown as Record<string, unknown> };
  },
  async hacer(d, { org, usuarioId }) {
    const r = await crearPedidoAMano(org, usuarioId, d as unknown as PedidoAMano, "asistente");
    return `Pedido [${r.pedidoId}](/ventas/pedidos/${r.pedidoId}) creado por ${pesos(r.totalArs)}.`;
  },
};

// ── Cambiar el estado de pedidos ─────────────────────────────────────
const cambiarEstados: Accion = {
  permiso: "pedidos_ver",
  herramienta: {
    name: "proponer_cambiar_estado_pedidos",
    description: `Prepara el cambio de estado de uno o varios pedidos que no son de Mercado Libre (los de ML los mueve ML), hasta 50. No los cambia: la persona confirma. Estados: ${Object.entries(ESTADOS_PEDIDO).map(([k, v]) => `${k} (${v})`).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { pedido_ids: { type: "array", items: { type: "integer" } }, estado: { type: "string", enum: Object.keys(ESTADOS_PEDIDO) }, nota: { type: "string" } },
      required: ["pedido_ids", "estado"],
    },
  },
  async preparar(e, { org }) {
    const pedidos = ids(e.pedido_ids);
    if (!esEstadoPedido(e.estado)) throw new ErrorErp("Estado desconocido.");
    const nuevo = e.estado;
    const filas = await consulta<{ id: number; estado: keyof typeof ESTADOS_PEDIDO; canal_tipo: string; cliente: string | null }>(`
      select p.id::int, p.estado, c.tipo canal_tipo, coalesce(cl.razon_social, cl.nombre) cliente
        from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and p.id = any($2::bigint[]) order by p.id`, [org, pedidos]);
    const ml = filas.filter((f) => f.canal_tipo === "mercadolibre");
    const van = filas.filter((f) => f.canal_tipo !== "mercadolibre" && f.estado !== nuevo);
    if (!van.length) throw new ErrorErp(ml.length ? "Son de Mercado Libre: esos se mueven solos desde Mercado Libre." : "No hay pedidos para cambiar (no existen o ya están en ese estado).");
    const detalle = van.map((f) => `Pedido ${f.id} — ${f.cliente ?? "Consumidor final"}: ${ESTADOS_PEDIDO[f.estado]} → ${ESTADOS_PEDIDO[nuevo]}`);
    if (ml.length) detalle.push(`No van (son de Mercado Libre): ${ml.map((f) => f.id).join(", ")}`);
    return { resumen: `Pasar ${van.length} pedido${van.length === 1 ? "" : "s"} a «${ESTADOS_PEDIDO[nuevo]}»`, detalle, datos: { ids: van.map((f) => f.id), estado: nuevo, nota: txt(e.nota) } };
  },
  async hacer(d, { org, usuarioId }) {
    const ok: number[] = [], errores: string[] = [];
    for (const pid of d.ids as number[]) {
      try {
        const p = await una<{ canal_tipo: string }>("select c.tipo canal_tipo from pedido p join canal c on c.id = p.canal_id where p.id = $1 and p.organizacion_id = $2", [pid, org]);
        if (!p) throw new ErrorErp("no existe");
        if (p.canal_tipo === "mercadolibre") throw new ErrorErp("es de Mercado Libre");
        await exigirCarritoLibre(org, pid);
        await cambiarEstado(org, pid, d.estado as keyof typeof ESTADOS_PEDIDO, usuarioId, (d.nota as string | null) ?? "desde el asistente");
        ok.push(pid);
      } catch (e) { errores.push(`pedido ${pid}: ${motivoErp(e)}`); }
    }
    return [`Cambiados ${ok.length} de ${(d.ids as number[]).length} a «${ESTADOS_PEDIDO[d.estado as keyof typeof ESTADOS_PEDIDO]}».`, ...(errores.length ? [`Con problemas: ${errores.join("; ")}.`] : [])].join(" ");
  },
};

// ── Cualquier otro cambio en los datos (sólo superadministradores) ──
const cambioEnDatos: Accion = {
  permiso: "asistente_acciones",
  herramienta: {
    name: "proponer_cambio_en_datos",
    description: "SÓLO SUPERADMINISTRADOR. Para un cambio en los datos de Laucen que no está en tus otras acciones: una sola instrucción SQL INSERT, UPDATE o DELETE (Postgres) sobre una tabla de Laucen. Se ensaya (se corre y se deshace) y la persona ve cuántas filas cambian y cómo quedan antes de confirmar. Corre con los permisos de fila del usuario (sólo su organización); igual filtrá por organizacion_id. Prohibido: Mercado Libre, canales, usuarios/roles, llaves, stock (va por ajuste), asientos, comprobantes de ARCA, cuentas corrientes, caja, estados de pedidos. Antes mirá la estructura con leer_codigo (db/*.sql) y los datos con consultar_sql.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Una sola instrucción INSERT INTO / UPDATE / DELETE FROM, sin punto y coma ni comentarios." },
        explicacion: { type: "string", description: "Qué hace, en criollo, en una línea (es el título de la tarjeta)." },
      },
      required: ["sql", "explicacion"],
    },
  },
  async preparar(e, ctx) {
    if (!ctx.superadmin) throw new ErrorErp("Los cambios libres en los datos sólo los puede pedir un superadministrador.");
    const sql = txt(e.sql);
    if (!sql) throw new ErrorErp("Falta la instrucción.");
    const r = await ensayarCambio(sql, ctx.authId);
    const verbo = { insert: "agrega", update: "cambia", delete: "borra" }[r.tipo];
    const detalle = [
      `En ${r.tabla}: ${verbo} ${r.filas} fila${r.filas === 1 ? "" : "s"}.`,
      ...(r.aviso ? [r.aviso] : []),
      ...r.muestra.slice(0, 8).map((f) => (r.tipo === "delete" ? "Se borra: " : "Queda: ")
        + Object.entries(f).filter(([, v]) => v != null && v !== "").slice(0, 8).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(", ")),
      ...(r.filas > 8 ? [`… y ${r.filas - 8} más.`] : []),
      `Instrucción: ${r.sql.slice(0, 600)}`,
    ];
    return { resumen: txt(e.explicacion) ?? `Cambio en ${r.tabla}`, detalle, datos: { sql: r.sql, filas: r.filas, tabla: r.tabla } };
  },
  async hacer(d, ctx) {
    if (!ctx.superadmin) throw new ErrorErp("Sólo un superadministrador.");
    const n = await hacerCambio(String(d.sql), Number(d.filas), ctx.authId);
    return `Hecho: ${n} fila${n === 1 ? "" : "s"} en ${d.tabla}.`;
  },
};

export const HERRAMIENTA_CONSULTAR_SQL: Anthropic.Beta.BetaTool = {
  name: "consultar_sql",
  description: "SÓLO SUPERADMINISTRADOR. Consulta de sólo lectura sobre la base de Laucen: una instrucción SELECT (o WITH … SELECT), hasta 200 filas, con los permisos de fila del usuario (sólo su organización). Para ver datos que las listas no tienen o para preparar un cambio.",
  input_schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
};

export const ACCIONES: Accion[] = [facturar, crearCliente, crearPedido, cambiarEstados, cambioEnDatos];
const PORNOMBRE = new Map(ACCIONES.map((a) => [a.herramienta.name, a]));

export const HERRAMIENTA_PENDIENTE: Anthropic.Beta.BetaTool = {
  name: "anotar_pedido_sin_resolver",
  description: "Anota algo que te pidieron HACER y que no está entre tus acciones (y no se puede hacer con ellas), para que el superadministrador lo revise y lo mande a programar. Describilo claro: qué pidió y para qué. Se anota en el momento (no pide confirmación).",
  input_schema: { type: "object", properties: { pedido: { type: "string" } }, required: ["pedido"] },
};

/** Las herramientas de acciones que esta persona puede usar. */
export function herramientasDeAcciones(permisos: Permisos, superadmin: boolean): Anthropic.Beta.BetaTool[] {
  if (!tienePermiso(permisos, "asistente_acciones")) return [];
  const propias = ACCIONES.filter((a) => (a !== cambioEnDatos || superadmin) && tienePermiso(permisos, a.permiso)).map((a) => a.herramienta);
  return [...propias, ...(superadmin ? [HERRAMIENTA_CONSULTAR_SQL] : []), HERRAMIENTA_PENDIENTE];
}

export const esHerramientaDeAccion = (nombre: string) =>
  PORNOMBRE.has(nombre) || nombre === HERRAMIENTA_PENDIENTE.name || nombre === HERRAMIENTA_CONSULTAR_SQL.name;

function exigirPermisos(a: Accion, permisos: Permisos) {
  if (!tienePermiso(permisos, "asistente_acciones")) throw new ErrorErp("Esta persona no tiene permiso para pedirle al asistente que haga cosas.");
  if (!tienePermiso(permisos, a.permiso)) throw new ErrorErp("Esta persona no tiene permiso para esa pantalla.");
}

/** Corre una herramienta de acción: prepara la propuesta (o anota el pendiente). Devuelve el texto para el modelo y, si hubo, la propuesta. */
export async function correrAccion(nombre: string, entrada: Record<string, unknown>, ctx: CtxAccion, conversacionId: number): Promise<{ texto: string; propuesta?: number }> {
  if (nombre === HERRAMIENTA_CONSULTAR_SQL.name) {
    if (!ctx.superadmin) throw new ErrorErp("Sólo un superadministrador.");
    return { texto: (await consultarSql(String(entrada.sql ?? ""), ctx.authId)).slice(0, 60_000) };
  }
  if (nombre === HERRAMIENTA_PENDIENTE.name) {
    if (!tienePermiso(ctx.permisos, "asistente_acciones")) throw new ErrorErp("Sin permiso.");
    const pedido = txt(entrada.pedido);
    if (!pedido) throw new ErrorErp("Describí qué pidieron.");
    await consulta("insert into asistente_pendiente (organizacion_id, conversacion_id, usuario_id, pedido) values ($1, $2, $3, $4)",
      [ctx.org, conversacionId, ctx.usuarioId, pedido.slice(0, 2000)]);
    return { texto: "Anotado: el superadministrador lo va a ver en Configuración › Asistente › Pedidos sin resolver. Decile a la persona que todavía no lo sabés hacer y que quedó anotado." };
  }
  const a = PORNOMBRE.get(nombre);
  if (!a) throw new ErrorErp(`No existe la acción ${nombre}.`);
  exigirPermisos(a, ctx.permisos);
  const p = await a.preparar(entrada, ctx);
  const r = await una<{ id: number }>(`
    insert into asistente_accion (organizacion_id, conversacion_id, usuario_id, tipo, resumen, detalle, datos)
    values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) returning id::int`,
  [ctx.org, conversacionId, ctx.usuarioId, nombre, p.resumen, JSON.stringify(p.detalle), JSON.stringify(p.datos)]);
  return {
    texto: `Propuesta N.º ${r!.id} preparada: «${p.resumen}».\n${p.detalle.join("\n")}\nNO está hecha: a la persona le aparece una tarjeta con Confirmar y Cancelar debajo de tu respuesta. Contale en una línea qué vas a hacer y pedile que confirme.`,
    propuesta: r!.id,
  };
}

/** Confirmar o cancelar una propuesta (sólo quien la pidió, y en la hora). */
export async function resolverPropuesta(id: number, decision: "confirmar" | "cancelar", ctx: CtxAccion): Promise<{ estado: string; texto: string }> {
  const fila = await una<{ tipo: string; datos: Record<string, unknown>; estado: string; vieja: boolean; resumen: string }>(`
    select tipo, datos, estado, creada_ts < now() - interval '1 hour' vieja, resumen from asistente_accion
     where id = $1 and organizacion_id = $2 and usuario_id = $3`, [id, ctx.org, ctx.usuarioId]);
  if (!fila) throw new ErrorErp("No existe esa propuesta.");
  if (fila.estado !== "propuesta") throw new ErrorErp(fila.estado === "hecha" ? "Ya está hecha." : "Ya se resolvió.");
  // Que nadie más la tome mientras se hace (dos clics, dos pestañas).
  const tomada = await una("update asistente_accion set estado = 'cancelada', resuelta_ts = now() where id = $1 and estado = 'propuesta' returning id", [id]);
  if (!tomada) throw new ErrorErp("Ya se resolvió.");
  if (decision === "cancelar") return { estado: "cancelada", texto: "Cancelado: no se hizo nada." };
  if (fila.vieja) {
    await consulta("update asistente_accion set resultado = $2 where id = $1", [id, "Vencida (más de una hora)."]);
    return { estado: "cancelada", texto: "La propuesta tiene más de una hora: pedímela de nuevo para que la arme con los datos de ahora." };
  }
  const a = PORNOMBRE.get(fila.tipo);
  try {
    if (!a) throw new ErrorErp("Esa acción ya no existe.");
    exigirPermisos(a, ctx.permisos);
    const texto = await a.hacer(fila.datos, ctx);
    await consulta("update asistente_accion set estado = 'hecha', resultado = $2 where id = $1", [id, texto]);
    return { estado: "hecha", texto };
  } catch (e) {
    const texto = `No se pudo: ${motivoErp(e)}`;
    await consulta("update asistente_accion set estado = 'error', resultado = $2 where id = $1", [id, texto]);
    return { estado: "error", texto };
  }
}
