// Facturas de gasto y el reporte de ARCA por el asistente (Fer, 4/11): la persona de administración le manda las
// facturas (PDF o fotos) o el archivo de «Mis Comprobantes – Recibidos», y el asistente:
//   · leer_facturas: las lee con la misma lectura que «Subir factura» (lib/compras/factura-leer.ts) y cuenta qué va a
//     pasar con cada una (se registra sola, el proveedor no tiene cuenta de gasto, ya estaba, no es una factura);
//   · proponer_cargar_facturas (se confirma con un botón): deja cada archivo en la carpeta del Drive de su razón social
//     y su mes (si el Drive está conectado y la carpeta cargada; si no, queda en Laucen), la carga como factura de compra
//     con el archivo a un clic, y a los proveedores sin cuenta les deja la elegida (o la factura en borrador si no se
//     sabe);
//   · leer_reporte_arca / proponer_importar_arca: el importador de Compras › Facturas › ARCA, con la vista previa
//     contada en el chat; los proveedores sin cuenta se eligen en el chat (o se dejan para después). Al terminar dice
//     qué facturas siguen sin su comprobante.
// Piden el permiso de Compras (el de cargar facturas de compra), no el de «pedirle al asistente que haga cosas».

import type Anthropic from "@anthropic-ai/sdk";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { leerFacturaArchivo, aComprobante, type LecturaFactura } from "@/lib/compras/factura-leer";
import { cargarFacturaLeida } from "@/lib/compras/factura-cargar";
import { carpetasFacturas } from "@/lib/compras/drive-facturas";
import { subirACarpetaDelMes } from "@/lib/google/drive";
import { registrarFactura } from "@/lib/administracion/compras";
import { esMercadoLibre, guardarLote, importarLote, vistaPrevia, contarEstados } from "@/lib/administracion/arca-mc";
import { leerArchivoArca } from "@/lib/administracion/arca-mc-archivo";
import { adjuntosPorId, bajarAdjunto, tipoDe } from "./adjuntos";

export const PERMISO_COMPRAS = "compras_ver" as const;
const fecha = (iso: string) => iso.split("-").reverse().join("/");
const pesos = (n: number, m: string) => formatear(n, m === "USD" ? "USD" : "ARS");
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── Leer ─────────────────────────────────────────────────────────────
type Leida = { id: number; nombre: string; ruta: string; tipo: string; lectura: LecturaFactura | null; error: string | null };

/** Lee los archivos (de a 4 a la vez); lo leído queda guardado en el archivo para no leerlo de nuevo. */
async function leerArchivos(org: string, conversacionId: number, ids: number[]): Promise<Leida[]> {
  const adj = (await adjuntosPorId(org, ids)).filter((a) => a.conversacion_id === conversacionId);
  if (!adj.length) throw new ErrorErp("No encuentro esos archivos en esta conversación: pedile que los mande de nuevo.");
  const out: Leida[] = [];
  for (let i = 0; i < adj.length; i += 4) {
    out.push(...await Promise.all(adj.slice(i, i + 4).map(async (a): Promise<Leida> => {
      const guardada = a.lectura as { lectura?: LecturaFactura; error?: string; tipo?: string } | null;
      if (guardada?.lectura || guardada?.error) return { id: a.id, nombre: a.nombre, ruta: a.ruta, tipo: guardada.tipo ?? a.tipo, lectura: guardada.lectura ?? null, error: guardada.error ?? null };
      try {
        const datos = await bajarAdjunto(a.ruta);
        const tipo = tipoDe(datos, a.nombre, a.tipo);
        if (tipo !== "application/pdf" && !tipo.startsWith("image/")) return { id: a.id, nombre: a.nombre, ruta: a.ruta, tipo, lectura: null, error: "no es un PDF ni una foto" };
        const r = await leerFacturaArchivo(datos, tipo);
        const x = "error" in r ? { error: r.error, tipo } : { lectura: r.lectura, tipo };
        await consulta("update asistente_adjunto set lectura = $2::jsonb where id = $1", [a.id, JSON.stringify(x)]);
        return { id: a.id, nombre: a.nombre, ruta: a.ruta, tipo, lectura: "lectura" in x ? x.lectura ?? null : null, error: "error" in x ? x.error ?? null : null };
      } catch (e) {
        return { id: a.id, nombre: a.nombre, ruta: a.ruta, tipo: a.tipo, lectura: null, error: motivoErp(e) };
      }
    })));
  }
  return out;
}

type Situacion =
  | { que: "no_sirve"; motivo: string }
  | { que: "ya_estaba"; facturaId: number; conArchivo: boolean; texto: string }
  | { que: "lista"; texto: string; cuit: string; proveedor: string; proveedorId: number | null; cuentaId: number | null; cuentaNombre: string | null;
      emisorId: number; emisor: string; fecha: string; tipoTexto: string; pv: number; numero: number };

/** Qué va a pasar con una factura leída (sin tocar nada). */
async function situacion(org: string, l: Leida): Promise<Situacion> {
  if (l.error || !l.lectura) return { que: "no_sirve", motivo: l.error ?? "no se pudo leer" };
  if (l.lectura.es_comprobante === false) return { que: "no_sirve", motivo: `no es una factura${l.lectura.que_es ? ` (es ${l.lectura.que_es})` : ""}` };
  const x = aComprobante(l.lectura);
  if ("error" in x) return { que: "no_sirve", motivo: x.error };
  const c = x.c;
  const receptor = String(l.lectura.cuit_receptor ?? "").replace(/\D/g, "");
  const emisor = receptor
    ? await una<{ id: number; nombre: string }>("select id::int, coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [org, receptor])
    : await una<{ id: number; nombre: string }>("select id::int, coalesce(nombre, razon_social) nombre from emisor where organizacion_id = $1 and es_principal", [org]);
  if (!emisor) return { que: "no_sirve", motivo: `está a nombre del CUIT ${receptor}, que no es de ninguna de las razones sociales` };
  const prov = await una<{ id: number; nombre: string; cuenta: number | null; cuenta_nombre: string | null }>(`
    select p.id::int, p.nombre, p.cuenta_gasto_id::int cuenta, pc.codigo || ' ' || pc.nombre cuenta_nombre from proveedor p left join plan_cuenta pc on pc.id = p.cuenta_gasto_id
     where p.organizacion_id = $1 and regexp_replace(p.cuit, '\\D', '', 'g') = $2 order by (p.estado = 'activo') desc, p.id limit 1`, [org, c.cuit]);
  const texto = `${c.tipoTexto} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")} de ${prov?.nombre ?? c.denominacion} (CUIT ${c.cuit}), del ${fecha(c.fecha)}, por ${pesos(c.total, c.moneda)}, a nombre de ${emisor.nombre}`;
  if (prov) {
    const ya = await una<{ id: number; archivo: string | null }>(`select id::int, archivo from factura_compra where organizacion_id = $1 and proveedor_id = $2 and letra = $3
        and es_nota_credito = $4 and es_nota_debito = $5 and punto_venta is not distinct from $6 and numero = $7 and estado <> 'anulada'`,
      [org, prov.id, c.letra, c.nc, c.nd, c.puntoVenta, c.numero]);
    if (ya) return { que: "ya_estaba", facturaId: ya.id, conArchivo: !!ya.archivo, texto };
  }
  return { que: "lista", texto, cuit: c.cuit, proveedor: prov?.nombre ?? c.denominacion, proveedorId: prov?.id ?? null, cuentaId: prov?.cuenta ?? null,
    cuentaNombre: prov?.cuenta_nombre ?? null, emisorId: emisor.id, emisor: emisor.nombre, fecha: c.fecha, tipoTexto: c.tipoTexto, pv: c.puntoVenta, numero: c.numero };
}

/** Las cuentas de gasto (para sugerir una). */
async function cuentasDeGasto(org: string): Promise<string> {
  const c = await consulta<{ id: number; codigo: string; nombre: string }>(
    "select id::int, codigo, nombre from plan_cuenta where organizacion_id = $1 and tipo = 'egreso' and imputable and activa order by codigo limit 200", [org]);
  return c.length ? `Cuentas de gasto (id — código nombre):\n${c.map((x) => `${x.id} — ${x.codigo} ${x.nombre}`).join("\n")}` : "No hay cuentas de gasto en el plan de cuentas.";
}

export const HERRAMIENTA_LEER_FACTURAS: Anthropic.Beta.BetaTool = {
  name: "leer_facturas",
  description: "Lee facturas de gasto que te mandaron (PDF o fotos, por su número de archivo) y dice qué pasaría con cada una al cargarla: se registra sola, el proveedor no tiene cuenta de gasto, ya estaba cargada, o no es una factura. No carga nada. Usalo antes de proponer_cargar_facturas.",
  input_schema: { type: "object", properties: { archivos: { type: "array", items: { type: "integer" }, description: "Los números de archivo (#12)." } }, required: ["archivos"] },
};

export async function leerFacturas(org: string, conversacionId: number, e: Record<string, unknown>): Promise<string> {
  const ids = [...new Set((Array.isArray(e.archivos) ? e.archivos : []).map(Number).filter((n) => n > 0))].slice(0, 20);
  if (!ids.length) throw new ErrorErp("Faltan los números de los archivos.");
  const leidas = await leerArchivos(org, conversacionId, ids);
  const renglones: string[] = [];
  let sinCuenta = false;
  for (const l of leidas) {
    const s = await situacion(org, l);
    if (s.que === "no_sirve") renglones.push(`#${l.id} «${l.nombre}»: NO SE CARGA — ${s.motivo}.`);
    else if (s.que === "ya_estaba") renglones.push(`#${l.id} «${l.nombre}»: ${s.texto}. YA ESTABA CARGADA (factura de compra #${s.facturaId})${s.conArchivo ? "" : "; al cargarla se le suma el archivo"}.`);
    else if (s.cuentaId) renglones.push(`#${l.id} «${l.nombre}»: ${s.texto}. Se registra sola con la cuenta del proveedor: ${s.cuentaNombre}.`);
    else { sinCuenta = true; renglones.push(`#${l.id} «${l.nombre}»: ${s.texto}. ${s.proveedorId ? "EL PROVEEDOR NO TIENE CUENTA DE GASTO" : "PROVEEDOR NUEVO (sin cuenta de gasto)"}.`); }
  }
  return [
    ...renglones,
    sinCuenta
      ? `\nPara los proveedores sin cuenta de gasto: preguntale a la persona qué cuenta usar, sugiriéndole una de la lista (la que mejor corresponda por el proveedor y lo que factura), y avisale que queda guardada en el proveedor para la próxima. Si no sabe, la factura se carga igual y queda en borrador. Después usá proponer_cargar_facturas.\n${await cuentasDeGasto(org)}`
      : "\nContale en pocas líneas qué encontraste y, si hay algo para cargar, usá proponer_cargar_facturas.",
  ].join("\n");
}

// ── Cargar ───────────────────────────────────────────────────────────
type Eleccion = { archivo: number; cuenta: number | null | undefined };

/** La carpeta del Drive de facturas de una razón social: la de «gastos» con su nombre (o, para Mercado Libre, la de
 *  Mercado Libre). null si no hay. */
async function carpetaDe(org: string, emisor: string, cuitProveedor: string) {
  const carpetas = await carpetasFacturas(org).catch(() => []);
  if (!carpetas.length) return null;
  const n = (c: { texto: string }) => normal(c.texto);
  if (esMercadoLibre(cuitProveedor)) {
    const ml = carpetas.find((c) => /mercado\s*libre/.test(n(c)));
    if (ml) return ml;
  }
  const palabras = normal(emisor).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !["argentina", "sociedad", "anonima", "s.a."].includes(p));
  return carpetas.find((c) => /gasto|servicio/.test(n(c)) && palabras.some((p) => n(c).includes(p))) ?? null;
}

/** Deja el archivo en el Drive (si se puede) y devuelve con qué queda en la factura. */
async function guardarArchivo(org: string, l: Leida, s: Extract<Situacion, { que: "lista" | "ya_estaba" }>): Promise<{ archivo: string; donde: string | null }> {
  if (s.que !== "lista") return { archivo: l.ruta, donde: null };
  const carpeta = await carpetaDe(org, s.emisor, s.cuit);
  if (!carpeta) return { archivo: l.ruta, donde: null };
  try {
    const datos = Buffer.from(await bajarAdjunto(l.ruta));
    const ext = l.tipo === "application/pdf" ? "pdf" : l.tipo.split("/")[1]?.replace("jpeg", "jpg") ?? "pdf";
    const limpio = (t: string) => t.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
    const nombre = `${s.fecha} ${limpio(s.proveedor).slice(0, 60)} ${s.tipoTexto} ${String(s.pv).padStart(5, "0")}-${String(s.numero).padStart(8, "0")}.${ext}`;
    const [año, mes] = s.fecha.split("-").map(Number);
    const r = await subirACarpetaDelMes(org, carpeta.segmentos, año, mes, { nombre, contenido: datos, tipo: l.tipo });
    // Que la lectura del Drive no la vuelva a cargar.
    await consulta(`insert into drive_archivo_leido (organizacion_id, archivo_id, nombre, modificado, carpeta, estado, mensaje) values ($1, $2, $3, $4, $5, 'factura', 'cargada por el asistente')
                    on conflict (organizacion_id, archivo_id) do update set modificado = excluded.modificado, estado = excluded.estado, mensaje = excluded.mensaje, leido_ts = now()`,
      [org, r.id, nombre, r.modificado, r.donde]).catch(() => {});
    return { archivo: `drive:${r.id}`, donde: r.donde };
  } catch (e) {
    console.error("[asistente-facturas] drive", org, motivoErp(e));
    return { archivo: l.ruta, donde: null };
  }
}

export const HERRAMIENTA_CARGAR_FACTURAS: Anthropic.Beta.BetaTool = {
  name: "proponer_cargar_facturas",
  description: "Prepara la carga de facturas de gasto ya leídas con leer_facturas (por su número de archivo). Al confirmar, cada una queda en la carpeta del Drive de su razón social y su mes (o en Laucen), cargada como factura de compra con el archivo a un clic, y registrada si su proveedor tiene cuenta de gasto. Para un proveedor sin cuenta: cuenta_gasto_id = la que eligió la persona (queda guardada en el proveedor), o null si no sabe (queda en borrador).",
  input_schema: {
    type: "object",
    properties: {
      facturas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            archivo: { type: "integer" },
            cuenta_gasto_id: { type: ["integer", "null"], description: "Sólo si el proveedor no tiene cuenta: la elegida, o null para dejarla en borrador." },
          },
          required: ["archivo"],
        },
      },
    },
    required: ["facturas"],
  },
};

export async function prepararCargarFacturas(org: string, conversacionId: number, e: Record<string, unknown>) {
  const elegidas: Eleccion[] = (Array.isArray(e.facturas) ? e.facturas : []).slice(0, 20).map((f: { archivo?: unknown; cuenta_gasto_id?: unknown }) => ({
    archivo: Number(f.archivo), cuenta: f.cuenta_gasto_id === null ? null : Number(f.cuenta_gasto_id) > 0 ? Number(f.cuenta_gasto_id) : undefined,
  })).filter((f) => f.archivo > 0);
  if (!elegidas.length) throw new ErrorErp("Faltan las facturas.");
  const leidas = await leerArchivos(org, conversacionId, elegidas.map((x) => x.archivo));
  const cuentas = new Map((await consulta<{ id: number; nombre: string }>(
    "select id::int, codigo || ' ' || nombre nombre from plan_cuenta where organizacion_id = $1 and tipo = 'egreso' and imputable and activa", [org])).map((c) => [c.id, c.nombre]));
  const detalle: string[] = [];
  let van = 0;
  for (const el of elegidas) {
    const l = leidas.find((x) => x.id === el.archivo);
    if (!l) { detalle.push(`#${el.archivo}: no está en esta conversación`); continue; }
    const s = await situacion(org, l);
    if (s.que === "no_sirve") { detalle.push(`«${l.nombre}»: no se carga (${s.motivo})`); continue; }
    van++;
    if (s.que === "ya_estaba") { detalle.push(`«${l.nombre}»: ya estaba cargada${s.conArchivo ? "" : " — se le suma el archivo"}`); continue; }
    if (el.cuenta && !cuentas.has(el.cuenta)) throw new ErrorErp(`La cuenta ${el.cuenta} no es una cuenta de gasto: elegí otra.`);
    const queda = s.cuentaId ? `registrada con ${s.cuentaNombre}` : el.cuenta ? `registrada con ${cuentas.get(el.cuenta)} (queda guardada en el proveedor)` : "en borrador (sin cuenta de gasto)";
    detalle.push(`${s.texto} → ${queda}`);
  }
  if (!van) throw new ErrorErp("Ninguna de esas se puede cargar.");
  return { resumen: `Cargar ${van} factura${van === 1 ? "" : "s"} de gasto`, detalle, datos: { conversacion: conversacionId, facturas: elegidas } as Record<string, unknown> };
}

export async function hacerCargarFacturas(org: string, usuarioId: string, d: Record<string, unknown>): Promise<string> {
  const elegidas = (d.facturas ?? []) as Eleccion[];
  const leidas = await leerArchivos(org, Number(d.conversacion), elegidas.map((x) => x.archivo));
  const out: string[] = [];
  for (const el of elegidas) {
    const l = leidas.find((x) => x.id === el.archivo);
    if (!l?.lectura) continue;
    try {
      const s = await situacion(org, l);
      if (s.que === "no_sirve") continue;
      // La cuenta elegida, en el proveedor que ya existe: así se registra sola.
      if (s.que === "lista" && !s.cuentaId && el.cuenta && s.proveedorId) {
        await consulta("update proveedor set cuenta_gasto_id = $3 where id = $1 and organizacion_id = $2 and cuenta_gasto_id is null", [s.proveedorId, org, el.cuenta]);
      }
      const { archivo, donde } = await guardarArchivo(org, l, s);
      const f = await cargarFacturaLeida(org, usuarioId, l.lectura, archivo, l.nombre);
      // Proveedor nuevo con cuenta elegida: se la deja y se registra.
      if (f.estado === "borrador" && el.cuenta && s.que === "lista" && !s.proveedorId) {
        const pr = await una<{ proveedor_id: number }>("select proveedor_id::int from factura_compra where id = $1 and organizacion_id = $2", [f.id, org]);
        if (pr) await consulta("update proveedor set cuenta_gasto_id = $3 where id = $1 and organizacion_id = $2 and cuenta_gasto_id is null", [pr.proveedor_id, org, el.cuenta]);
        await consulta("update factura_compra set cuenta_gasto_id = $3 where id = $1 and organizacion_id = $2 and estado = 'borrador'", [f.id, org, el.cuenta]);
        try {
          await registrarFactura(org, f.id, usuarioId);
          f.estado = "registrada";
        } catch (err) { f.mensaje = `quedó en borrador: ${motivoErp(err)}`; }
      }
      const enlace = `[factura de compra #${f.id}](/compras/facturas/${f.id})`;
      const estado = f.estado === "registrada" ? "registrada" : f.estado === "ya_estaba" ? "ya estaba" : `en borrador (${f.mensaje.replace(/^leída; /, "")})`;
      out.push(`«${l.nombre}»: ${enlace}, ${estado}${donde ? `; archivo en el Drive: ${donde}` : ""}.`);
    } catch (e) {
      out.push(`«${l.nombre}»: no se pudo — ${motivoErp(e)}`);
    }
  }
  return out.join("\n") || "No se cargó nada.";
}

// ── El reporte de ARCA ───────────────────────────────────────────────
export const HERRAMIENTA_LEER_ARCA: Anthropic.Beta.BetaTool = {
  name: "leer_reporte_arca",
  description: "Lee el archivo de «Mis Comprobantes – Recibidos» de ARCA que te mandaron (.csv o .xlsx, por su número de archivo) y cuenta qué hay: cuántas facturas son nuevas, cuántas ya estaban, las que difieren, y los proveedores con facturas nuevas que no tienen cuenta de gasto. No importa nada. Si la organización tiene más de una razón social y el archivo no dice de cuál es, pasá razon_social_id (preguntale a la persona; la lista te la da esta herramienta).",
  input_schema: { type: "object", properties: { archivo: { type: "integer" }, razon_social_id: { type: "integer" } }, required: ["archivo"] },
};

export async function leerReporteArca(org: string, usuarioId: string, conversacionId: number, e: Record<string, unknown>): Promise<string> {
  const [a] = (await adjuntosPorId(org, [Number(e.archivo)])).filter((x) => x.conversacion_id === conversacionId);
  if (!a) throw new ErrorErp("No encuentro ese archivo en esta conversación.");
  const esExcel = /\.xlsx$/i.test(a.nombre);
  if (!esExcel && !/\.(csv|txt)$/i.test(a.nombre)) throw new ErrorErp("Tiene que ser el .csv o el .xlsx de «Mis Comprobantes – Recibidos» que se baja de ARCA.");
  const emisores = await consulta<{ id: number; nombre: string; cuit: string }>(
    "select id::int, coalesce(nombre, razon_social) nombre, regexp_replace(cuit, '\\D', '', 'g') cuit from emisor where organizacion_id = $1 order by es_principal desc, id", [org]);
  const pedido = Number(e.razon_social_id) || null;
  const delNombre = emisores.find((x) => a.nombre.replace(/\D/g, "").includes(x.cuit));
  const emisor = pedido ? emisores.find((x) => x.id === pedido) : delNombre ?? (emisores.length === 1 ? emisores[0] : null);
  if (!emisor) return `Hace falta saber de qué razón social es el archivo (el nombre no trae el CUIT). Preguntale y volvé a llamar con razon_social_id:\n${emisores.map((x) => `${x.id} — ${x.nombre} (CUIT ${x.cuit})`).join("\n")}`;
  const lectura = await leerArchivoArca(await bajarAdjunto(a.ruta), esExcel);
  const lote = await guardarLote(org, a.nombre, lectura, usuarioId, emisor.id);
  const v = await vistaPrevia(org, lote);
  if (!v) throw new ErrorErp("No se pudo leer el archivo.");
  const n = contarEstados(v.filas);
  const sinCuenta = v.proveedores.filter((p) => p.nuevas > 0 && !p.cuentaId);
  const distintas = v.filas.filter((f) => f.estado === "distinta").slice(0, 10);
  const errores = v.filas.filter((f) => f.estado === "error").slice(0, 10);
  return [
    `Reporte de ARCA de ${emisor.nombre} (lote ${lote}; la vista previa completa está en [Compras › Facturas › ARCA](/compras/facturas/arca/${lote})).`,
    `Nuevas: ${n.nueva}. Ya cargadas: ${n.ya_cargada}. Con diferencias: ${n.distinta}. Repetidas: ${n.repetida}. Con error: ${n.error}.`,
    distintas.length ? `Diferencias (se corrigen a mano, no se importan):\n${distintas.map((f) => `- ${f.proveedor} ${f.c.tipoTexto} ${f.c.puntoVenta}-${f.c.numero}: ${f.motivo}`).join("\n")}` : "",
    errores.length ? `Con error:\n${errores.map((f) => `- ${f.proveedor} ${f.c.tipoTexto} ${f.c.puntoVenta}-${f.c.numero}: ${f.motivo}`).join("\n")}` : "",
    sinCuenta.length
      ? `Proveedores con facturas nuevas y SIN cuenta de gasto (cuit — nombre — nuevas):\n${sinCuenta.map((p) => `${p.cuit} — ${p.nombre} — ${p.nuevas}`).join("\n")}\nPreguntale qué cuenta usar para cada uno, sugiriéndole una (queda guardada en el proveedor). Si de alguno no sabe, ése queda sin importar por ahora (cuenta_gasto_id null) y se importa cuando lo vuelva a mandar. Después usá proponer_importar_arca.\n${await cuentasDeGasto(org)}`
      : n.nueva ? "Todos los proveedores tienen cuenta: usá proponer_importar_arca." : "No hay nada nuevo para importar.",
  ].filter(Boolean).join("\n");
}

export const HERRAMIENTA_IMPORTAR_ARCA: Anthropic.Beta.BetaTool = {
  name: "proponer_importar_arca",
  description: "Prepara la importación de un reporte de ARCA ya leído con leer_reporte_arca (por su número de lote). cuentas: para cada proveedor sin cuenta de gasto, la elegida (queda guardada) o null para no importar todavía sus facturas.",
  input_schema: {
    type: "object",
    properties: {
      lote: { type: "integer" },
      cuentas: { type: "array", items: { type: "object", properties: { cuit: { type: "string" }, cuenta_gasto_id: { type: ["integer", "null"] } }, required: ["cuit"] } },
    },
    required: ["lote"],
  },
};

export async function prepararImportarArca(org: string, e: Record<string, unknown>) {
  const lote = Number(e.lote) || 0;
  const v = await vistaPrevia(org, lote);
  if (!v) throw new ErrorErp("No existe ese lote: leé el archivo de nuevo.");
  if (v.lote.estado === "importado") throw new ErrorErp("Ese archivo ya se importó.");
  const elegidas = new Map((Array.isArray(e.cuentas) ? e.cuentas : []).map((c: { cuit?: unknown; cuenta_gasto_id?: unknown }) =>
    [String(c.cuit ?? "").replace(/\D/g, ""), Number(c.cuenta_gasto_id) > 0 ? Number(c.cuenta_gasto_id) : null] as const));
  const cuentas = new Map((await consulta<{ id: number; nombre: string }>(
    "select id::int, codigo || ' ' || nombre nombre from plan_cuenta where organizacion_id = $1 and imputable and activa", [org])).map((c) => [c.id, c.nombre]));
  const detalle: string[] = [];
  const omitir: string[] = [];
  const cuentasOk: Record<string, number> = {};
  for (const p of v.proveedores.filter((x) => x.nuevas > 0)) {
    if (p.cuentaId) continue;
    const c = elegidas.get(p.cuit);
    if (c && cuentas.has(c)) { cuentasOk[p.cuit] = c; detalle.push(`${p.nombre}: cuenta ${cuentas.get(c)} (queda guardada) — ${p.nuevas} factura${p.nuevas === 1 ? "" : "s"}`); }
    else { omitir.push(p.cuit); detalle.push(`${p.nombre}: sin cuenta — sus ${p.nuevas} factura${p.nuevas === 1 ? "" : "s"} quedan sin importar por ahora`); }
  }
  const n = contarEstados(v.filas);
  const nuevas = n.nueva - v.filas.filter((f) => f.estado === "nueva" && omitir.includes(f.c.cuit)).length;
  if (!nuevas) throw new ErrorErp("No queda nada para importar.");
  detalle.unshift(`${nuevas} factura${nuevas === 1 ? "" : "s"} nueva${nuevas === 1 ? "" : "s"}${n.ya_cargada ? `; ${n.ya_cargada} ya estaban (se marcan validadas con ARCA)` : ""}`);
  return { resumen: `Importar el reporte de ARCA (${v.lote.emisor ?? "razón social principal"})`, detalle, datos: { lote, cuentas: cuentasOk, omitir } as Record<string, unknown> };
}

export async function hacerImportarArca(org: string, usuarioId: string, d: Record<string, unknown>): Promise<string> {
  const lote = Number(d.lote);
  const r = await importarLote(org, lote, (d.cuentas ?? {}) as Record<string, number>, usuarioId, { omitir: (d.omitir ?? []) as string[] });
  const partes = [`${r.cargadas} cargada${r.cargadas === 1 ? "" : "s"}`, `${r.yaEstaban} ya estaba${r.yaEstaban === 1 ? "" : "n"}`];
  if (r.validadas) partes.push(`${r.validadas} validada${r.validadas === 1 ? "" : "s"} con ARCA`);
  if (r.omitidas) partes.push(`${r.omitidas} sin importar todavía (proveedores sin cuenta)`);
  if (r.distintas) partes.push(`${r.distintas} con diferencias (se corrigen en [la vista previa](/compras/facturas/arca/${lote}))`);
  if (r.errores.length) partes.push(`${r.errores.length} con error`);
  // Las facturas del reporte que siguen sin su comprobante (para que administración lo consiga).
  const faltan = await consulta<{ proveedor: string; n: number }>(`
    select p.nombre proveedor, count(*)::int n from factura_compra f join proveedor p on p.id = f.proveedor_id
      join arca_mc_lote l on l.id = $2 and l.organizacion_id = f.organizacion_id
     where f.organizacion_id = $1 and f.estado = 'registrada' and f.archivo is null and f.emisor_id is not distinct from l.emisor_id
       and exists (select 1 from jsonb_array_elements(l.comprobantes) c where (c ->> 'numero')::bigint = f.numero and regexp_replace(p.cuit, '\\D', '', 'g') = c ->> 'cuit')
     group by p.nombre order by count(*) desc, p.nombre`, [org, lote]).catch(() => []);
  const sin = faltan.length ? `\nSiguen sin su comprobante (PDF): ${faltan.map((f) => `${f.proveedor}${f.n > 1 ? ` (${f.n})` : ""}`).join(", ")}. Si me los mandás, se los sumo.` : "";
  return `Listo: ${partes.join(", ")}.${sin}`;
}
