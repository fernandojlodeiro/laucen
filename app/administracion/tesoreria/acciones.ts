"use server";

// Acciones de Caja y bancos: alta/edición/baja de cuentas de fondos,
// movimientos sueltos, transferencias y conciliación con el extracto.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id } from "@/lib/erp/acciones";
import { hoyAR } from "@/lib/moneda";
import {
  movimientoManual, transferir, borrarMovimiento, importarExtracto, conciliarAutomatico, conciliar, desconciliar, crearDesdeExtracto,
} from "@/lib/administracion/tesoreria";

const BASE = "/administracion/tesoreria";
const TIPOS = ["caja", "banco", "mercadopago", "otro"];

const fechaDe = (fd: FormData, k = "fecha") => {
  const f = texto(fd, k);
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
};

/** Cuenta contable elegida (opcional): tiene que ser imputable y de la organización. */
async function cuentaContable(org: string, fd: FormData, k = "cuenta_contable_id") {
  const c = id(fd, k);
  if (!c) return null;
  if (!(await una("select 1 from plan_cuenta where id = $1 and organizacion_id = $2 and imputable", [c, org]))) throw new ErrorErp("Esa cuenta contable no existe.");
  return c;
}

function datosCuenta(fd: FormData) {
  const nombre = texto(fd, "nombre");
  if (!nombre) throw new ErrorErp("La cuenta necesita un nombre.");
  const tipo = String(fd.get("tipo") ?? "");
  return {
    nombre, tipo: TIPOS.includes(tipo) ? tipo : "otro", moneda: fd.get("moneda") === "USD" ? "USD" : "ARS",
    banco: texto(fd, "banco"), cbu: texto(fd, "cbu"), alias: texto(fd, "alias"),
    saldoInicial: numero(fd, "saldo_inicial") ?? 0, saldoInicialFecha: fechaDe(fd, "saldo_inicial_fecha"),
  };
}

export async function accionCrearCuenta(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(BASE, async () => {
    const d = datosCuenta(fd);
    await consulta(`insert into cuenta_fondos (organizacion_id, nombre, tipo, moneda, banco, cbu, alias, saldo_inicial, saldo_inicial_fecha, cuenta_contable_id)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [s.org.id, d.nombre, d.tipo, d.moneda, d.banco, d.cbu, d.alias, d.saldoInicial, d.saldoInicialFecha, await cuentaContable(s.org.id, fd)]);
    revalidatePath(BASE);
    return "Cuenta creada.";
  });
}

export async function accionGuardarCuenta(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(BASE, async () => {
    const d = datosCuenta(fd);
    const cuentaId = id(fd);
    // La moneda no cambia si ya tiene movimientos (los importes están en esa moneda).
    const actual = await una<{ moneda: string; movs: number }>(`
      select moneda, (select count(*) from movimiento_fondos m where m.cuenta_id = f.id)::int movs
        from cuenta_fondos f where id = $1 and organizacion_id = $2`, [cuentaId, s.org.id]);
    if (!actual) throw new ErrorErp("Esa cuenta no existe.");
    if (actual.movs && actual.moneda !== d.moneda) throw new ErrorErp("La cuenta ya tiene movimientos: no se le puede cambiar la moneda.");
    await consulta(`update cuenta_fondos set nombre = $3, tipo = $4, moneda = $5, banco = $6, cbu = $7, alias = $8, saldo_inicial = $9,
                           saldo_inicial_fecha = $10, cuenta_contable_id = $11 where id = $2 and organizacion_id = $1`,
      [s.org.id, cuentaId, d.nombre, d.tipo, d.moneda, d.banco, d.cbu, d.alias, d.saldoInicial, d.saldoInicialFecha, await cuentaContable(s.org.id, fd)]);
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionActivarCuenta(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(BASE, async () => {
    await consulta("update cuenta_fondos set activa = $3 where id = $2 and organizacion_id = $1", [s.org.id, id(fd), fd.get("valor") === "1"]);
    revalidatePath(BASE);
  });
}

/** Sin movimientos se borra; con movimientos se desactiva (no se pierde la historia). */
export async function accionBorrarCuenta(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(BASE, async () => {
    const cuentaId = id(fd);
    const movs = await una("select 1 from movimiento_fondos where cuenta_id = $1 and organizacion_id = $2 limit 1", [cuentaId, s.org.id]);
    revalidatePath(BASE);
    if (movs) {
      await consulta("update cuenta_fondos set activa = false where id = $2 and organizacion_id = $1", [s.org.id, cuentaId]);
      return "Tiene movimientos: no se borra, quedó desactivada.";
    }
    await consulta("delete from cuenta_fondos where id = $2 and organizacion_id = $1", [s.org.id, cuentaId]);
    return "Borrada.";
  });
}

// ── Movimientos ────────────────────────────────────────────

const detalle = (fd: FormData, pestana = "") => `${BASE}/${id(fd, "c")}${pestana}`;

export async function accionMovimiento(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd), async () => {
    const importe = Math.abs(numero(fd, "importe") ?? 0);
    if (!importe) throw new ErrorErp("Poné el importe.");
    await movimientoManual(s.org.id, { cuentaId: id(fd, "c"), fecha: fechaDe(fd) ?? hoyAR(), importe: fd.get("signo") === "sale" ? -importe : importe,
      concepto: texto(fd, "concepto") ?? "", cuentaContableId: await cuentaContable(s.org.id, fd), usuarioId: s.usuario.id });
    revalidatePath(BASE);
    return "Movimiento cargado.";
  });
}

export async function accionTransferir(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd), async () => {
    const destino = id(fd, "destino");
    if (!destino) throw new ErrorErp("Elegí a qué cuenta va.");
    await transferir(s.org.id, { origenId: id(fd, "c"), destinoId: destino, fecha: fechaDe(fd) ?? hoyAR(), importe: numero(fd, "importe") ?? 0,
      importeDestino: numero(fd, "importe_destino"), usuarioId: s.usuario.id });
    revalidatePath(BASE);
    return "Transferencia hecha.";
  });
}

export async function accionBorrarMovimiento(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd), async () => {
    await borrarMovimiento(s.org.id, id(fd));
    revalidatePath(BASE);
    return "Borrado.";
  });
}

// ── Conciliación ───────────────────────────────────────────

/** Lee el archivo como texto: UTF-8, o Latin-1 si no lo era (los bancos suelen exportar así). */
async function textoDelArchivo(f: File) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("latin1").decode(bytes) : utf8;
}

export async function accionImportarExtracto(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd, "/conciliacion"), async () => {
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorErp("Elegí el archivo del extracto.");
    if (archivo.size > 4_000_000) throw new ErrorErp("El archivo es muy grande (más de 4 MB).");
    const r = await importarExtracto(s.org.id, id(fd, "c"), await textoDelArchivo(archivo));
    revalidatePath(BASE);
    return `Leídas ${r.leidas}, nuevas ${r.nuevas}.`;
  });
}

export async function accionConciliarAutomatico(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd, "/conciliacion"), async () => {
    // Que la cuenta sea de la organización lo asegura el filtro por organización de la función.
    const n = await conciliarAutomatico(s.org.id, id(fd, "c"));
    revalidatePath(BASE);
    return n ? `Unidas ${n}.` : "No encontré ninguna para unir sola.";
  });
}

export async function accionConciliar(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd, "/conciliacion"), async () => {
    const mov = id(fd, "movimiento");
    if (!mov) throw new ErrorErp("Elegí el movimiento.");
    await conciliar(s.org.id, id(fd), mov);
    revalidatePath(BASE);
    return "Unidas.";
  });
}

export async function accionDesconciliar(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd, "/conciliacion"), async () => {
    await desconciliar(s.org.id, id(fd));
    revalidatePath(BASE);
    return "Desunidas.";
  });
}

export async function accionCrearDesdeExtracto(fd: FormData) {
  const s = await entrarErp("tesoreria_ver");
  await intentar(detalle(fd, "/conciliacion"), async () => {
    await crearDesdeExtracto(s.org.id, id(fd), await cuentaContable(s.org.id, fd), s.usuario.id);
    revalidatePath(BASE);
    return "Movimiento creado y conciliado.";
  });
}
