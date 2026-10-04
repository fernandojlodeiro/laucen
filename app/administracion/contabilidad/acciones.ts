"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id, tildado } from "@/lib/erp/acciones";
import { contabilizarPendientes, asientoManual, anularAsientoManual, crearCuenta } from "@/lib/administracion/contabilidad";
import { codigoValido } from "@/lib/administracion/plan-codigos";

const BASE = "/administracion/contabilidad";
const PLAN = `${BASE}?p=plan`;

/** La dirección a la que vuelve (sólo dentro de esta pantalla). */
const volverA = (fd: FormData, porDefecto: string) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(BASE) ? v : porDefecto;
};

const NOMBRE_ORIGEN: Record<string, string> = {
  venta: "Venta", nota_credito_venta: "Nota de crédito", cmv: "Costo de venta", cobro_pedido: "Cobro de pedido",
  compra: "Compra", despacho: "Despacho", recibo: "Recibo", movimiento: "Movimiento", transferencia: "Transferencia",
  ajuste_stock: "Ajuste de stock", diferencia_cambio: "Diferencia de cambio (imputación)", diferencia_recepcion: "Diferencia con la recepción (factura)",
};

/** Los errores de contabilizarPendientes vienen como "<origen> <id>: <motivo>".
 *  El motivo de negocio ya está en criollo; uno técnico de la base se esconde. */
function errorLegible(e: string) {
  const m = e.match(/^(\w+) (\d+): ([\s\S]*)$/);
  if (!m) return "Un documento no se pudo contabilizar.";
  const tecnico = /violates|null value|column|relation|syntax|constraint|invalid input|does not exist/i.test(m[3]);
  const motivo = tecnico ? "no se pudo asentar (puede faltar una cuenta del plan o un dato del documento)" : m[3].replace(/\.$/, "");
  return `${NOMBRE_ORIGEN[m[1]] ?? m[1]} #${m[2]}: ${motivo}`;
}

export async function accionContabilizar(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  const volver = volverA(fd, BASE);
  await intentar(volver, async () => {
    const { hechos, errores } = await contabilizarPendientes(s.org.id);
    revalidatePath(BASE);
    const n = Object.values(hechos).reduce((a, b) => a + b, 0);
    let msj = n === 0 ? "No había nada pendiente de contabilizar." : n === 1 ? "Se generó 1 asiento." : `Se generaron ${n} asientos.`;
    if (errores.length) {
      msj += ` No se pudieron contabilizar ${errores.length}: ` + errores.slice(0, 5).map(errorLegible).join(" · ") + (errores.length > 5 ? " · …" : "");
      // Con errores vuelve como error para que se vea en rojo.
      throw new ErrorErp(msj);
    }
    return msj;
  });
}

export async function accionAsientoManual(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  await intentar(`${BASE}?p=manual`, async () => {
    const fecha = texto(fd, "fecha");
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorErp("Poné la fecha del asiento.");
    const lineas: { cuentaId: number; debe: number; haber: number; detalle?: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const debe = numero(fd, `debe_${i}`) ?? 0, haber = numero(fd, `haber_${i}`) ?? 0;
      const cuentaId = id(fd, `cuenta_${i}`);
      if (!debe && !haber) continue;
      if (!cuentaId) throw new ErrorErp(`El renglón ${i + 1} tiene importe pero no tiene cuenta.`);
      if (debe < 0 || haber < 0) throw new ErrorErp(`El renglón ${i + 1} tiene un importe negativo.`);
      if (debe && haber) throw new ErrorErp(`El renglón ${i + 1} tiene debe y haber a la vez: va uno solo.`);
      lineas.push({ cuentaId, debe, haber, detalle: texto(fd, `detalle_${i}`) ?? undefined });
    }
    const asientoId = await asientoManual(s.org.id, {
      fecha, concepto: texto(fd, "concepto") ?? "", lineas, usuarioId: s.usuario.id, apertura: tildado(fd, "apertura"), emisorId: id(fd, "emisor") || null,
    });
    revalidatePath(BASE);
    const numeroAsiento = await una<{ numero: number }>("select numero::int from asiento where id = $1 and organizacion_id = $2", [asientoId, s.org.id]);
    return { ir: `${BASE}?p=diario&desde=${fecha}&hasta=${fecha}&ok=${encodeURIComponent(numeroAsiento ? `Asiento ${numeroAsiento.numero} grabado.` : "Asiento grabado.")}` };
  });
}

export async function accionAnularAsiento(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  await intentar(volverA(fd, BASE), async () => {
    await anularAsientoManual(s.org.id, id(fd));
    revalidatePath(BASE);
    return "Asiento anulado.";
  });
}

// ── Plan de cuentas ────────────────────────────────────────

function leerCodigo(fd: FormData) {
  const codigo = texto(fd, "codigo");
  if (!codigo) throw new ErrorErp("La cuenta necesita un código.");
  if (!codigoValido(codigo)) throw new ErrorErp("El código va con números separados por puntos (ej. 5.2.06).");
  return codigo;
}

export async function accionCrearCuenta(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  await intentar(PLAN, async () => {
    await crearCuenta(s.org.id, { codigo: texto(fd, "codigo"), nombre: texto(fd, "nombre"), tipo: texto(fd, "tipo"), imputable: tildado(fd, "imputable") });
    revalidatePath(BASE);
    return "Cuenta creada.";
  });
}

export async function accionGuardarCuenta(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  await intentar(PLAN, async () => {
    const codigo = leerCodigo(fd);
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La cuenta necesita un nombre.");
    const r = await consulta("update plan_cuenta set codigo = $3, nombre = $4, activa = $5 where id = $2 and organizacion_id = $1 returning id",
      [s.org.id, id(fd), codigo, nombre, fd.get("activa") === "1"]);
    if (!r.length) throw new ErrorErp("La cuenta no existe.");
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionBorrarCuenta(fd: FormData) {
  const s = await entrarErp("contabilidad_ver");
  await intentar(PLAN, async () => {
    // Usada = tiene asientos, o la nombra una cuenta de fondos o un movimiento
    // (esas columnas no tienen clave foránea: hay que mirarlas a mano).
    const c = await una<{ rol: string | null; usada: boolean; de_canal: boolean }>(`
      select p.rol,
             exists (select 1 from asiento_linea l where l.cuenta_id = p.id)
             or exists (select 1 from cuenta_fondos f where f.organizacion_id = $1 and f.cuenta_contable_id = p.id)
             or exists (select 1 from movimiento_fondos m where m.organizacion_id = $1 and m.cuenta_contable_id = p.id) usada,
             exists (select 1 from canal ca where ca.organizacion_id = $1 and ca.cuenta_ventas_id = p.id) de_canal
        from plan_cuenta p where p.id = $2 and p.organizacion_id = $1`, [s.org.id, id(fd)]);
    if (!c) throw new ErrorErp("La cuenta no existe.");
    if (c.rol) throw new ErrorErp("La usan los asientos automáticos: no se puede borrar (sí renombrar o recodificar).");
    if (c.de_canal) throw new ErrorErp("Es la cuenta de ventas de un canal: no se puede borrar (sí renombrar, recodificar o desactivar).");
    if (c.usada) throw new ErrorErp("Está usada (asientos o cuentas de fondos): no se puede borrar. Desactivala.");
    await consulta("delete from plan_cuenta where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return "Cuenta borrada.";
  });
}
