"use server";

// Acciones de cuentas corrientes: recibo / orden de pago, imputación a mano,
// anulación de recibos y saldo inicial de un tercero.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id } from "@/lib/erp/acciones";
import { hoyAR, formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { imputar, movimientoCc, imputarAutomatico, type Tercero } from "@/lib/administracion/cc";
import { emitirRecibo, anularRecibo, type Medio, type Retencion } from "@/lib/administracion/tesoreria";

const BASE = "/administracion/cuentas-corrientes";

const tercero = (fd: FormData): Tercero => (fd.get("tercero") === "proveedor" ? "proveedor" : "cliente");
const volverA = (t: Tercero, terceroId: number) => `${BASE}${t === "proveedor" ? "/proveedores" : ""}?id=${terceroId}`;
const fecha = (fd: FormData) => {
  const f = texto(fd, "fecha");
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoyAR();
};

/** El tercero tiene que ser de la organización. */
async function verificarTercero(org: string, t: Tercero, terceroId: number) {
  const tabla = t === "cliente" ? "cliente" : "proveedor";
  const r = await una<{ nombre: string }>(`select nombre from ${tabla} where id = $1 and organizacion_id = $2`, [terceroId, org]);
  if (!r) throw new ErrorErp(`Ese ${t} no existe.`);
  return r.nombre;
}

export async function accionEmitirRecibo(fd: FormData) {
  const s = await entrarErp("cuentas_corrientes_ver");
  const t = tercero(fd), terceroId = id(fd);
  await intentar(volverA(t, terceroId), async () => {
    await verificarTercero(s.org.id, t, terceroId);
    const medios: Medio[] = [];
    for (let i = 0; i < 4; i++) {
      const cuentaId = id(fd, `medio_cuenta_${i}`), importe = numero(fd, `medio_importe_${i}`) ?? 0;
      if (importe && !cuentaId) throw new ErrorErp("Elegí la cuenta de cada medio con importe.");
      if (cuentaId && importe) medios.push({ cuentaId, importe });
    }
    const retenciones: Retencion[] = [];
    for (let i = 0; i < 3; i++) {
      const concepto = texto(fd, `ret_concepto_${i}`) ?? "", importe = numero(fd, `ret_importe_${i}`) ?? 0;
      if (importe && !concepto) throw new ErrorErp("Poné el concepto de cada retención.");
      if (concepto && importe) retenciones.push({ concepto, importe });
    }
    const r = await emitirRecibo(s.org.id, { tipo: t === "cliente" ? "cobro" : "pago", terceroId, fecha: fecha(fd), medios, retenciones,
      notas: texto(fd, "notas"), usuarioId: s.usuario.id });
    revalidatePath(BASE);
    return `${t === "cliente" ? "Recibo" : "Orden de pago"} ${r.numero} emitido.`;
  });
}

export async function accionAnularRecibo(fd: FormData) {
  const s = await entrarErp("cuentas_corrientes_ver");
  const t = tercero(fd), terceroId = id(fd, "tercero_id");
  await intentar(volverA(t, terceroId), async () => {
    await anularRecibo(s.org.id, id(fd));
    revalidatePath(BASE);
    return "Anulado.";
  });
}

export async function accionImputar(fd: FormData) {
  const s = await entrarErp("cuentas_corrientes_ver");
  const t = tercero(fd), terceroId = id(fd);
  await intentar(volverA(t, terceroId), async () => {
    const debito = id(fd, "debito"), credito = id(fd, "credito");
    if (!debito || !credito) throw new ErrorErp("Elegí el débito y el crédito.");
    // imputar() ya verifica que los dos sean de la organización y del mismo tercero.
    // Sin importe, cancela lo máximo que alcance.
    const r = await imputar(s.org.id, debito, credito, numero(fd, "importe"));
    revalidatePath(BASE);
    return r.cotizacion
      ? `Imputado: la deuda bajó ${formatear(r.debito, r.monedaDebito)} y el crédito ${formatear(r.credito, r.monedaCredito)} (dólar a $ ${formatearNumero(r.cotizacion, "pesos")}).`
      : `Imputado: ${formatear(r.debito, r.monedaDebito)}.`;
  });
}

/** Saldo con que arranca la cuenta de un tercero (lo que venía de antes). */
export async function accionSaldoInicial(fd: FormData) {
  const s = await entrarErp("cuentas_corrientes_ver");
  const t = tercero(fd), terceroId = id(fd);
  await intentar(volverA(t, terceroId), async () => {
    await verificarTercero(s.org.id, t, terceroId);
    const importe = Math.abs(numero(fd, "importe") ?? 0);
    if (!importe) throw new ErrorErp("Poné el importe.");
    // Positivo = deuda a favor nuestro en clientes, deuda nuestra en proveedores.
    const nosDebe = fd.get("signo") === "nos_debe";
    const signo = t === "cliente" ? (nosDebe ? 1 : -1) : (nosDebe ? -1 : 1);
    const f = fecha(fd);
    await enTransaccion(async (c) => {
      const tc = Number((await c.query<{ v: string | null }>("select tc_del_dia($1, $2::date) v", [s.org.id, f])).rows[0]?.v ?? 0);
      if (!tc) throw new ErrorErp(`No hay tipo de cambio para el ${f.split("-").reverse().join("/")}.`);
      const ars = signo * importe;
      await movimientoCc(c, s.org.id, { tercero: t, terceroId, fecha: f, vencimiento: f, tipo: "saldo_inicial", importe: ars, importeArs: ars,
        importeUsd: Math.round((ars / tc) * 100) / 100, descripcion: "Saldo inicial" });
      await imputarAutomatico(c, s.org.id, t, terceroId);
    });
    revalidatePath(BASE);
    return "Saldo inicial cargado.";
  });
}
