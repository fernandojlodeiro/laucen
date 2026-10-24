"use server";

// Cuotas y descuentos de la tienda (canal.config.financiacion, lib/tienda/financiacion.ts):
// grabar el esquema y prenderlo o apagarlo.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { leerNumero } from "@/lib/numeros";
import { financiacionDe, MEDIOS_CONTADO, type PlanEscala } from "@/lib/tienda/financiacion";

const BASE = "/config/tienda/financiacion";

async function actual(org: string, canalId: number) {
  const c = await una<{ financiacion: unknown }>(
    "select config -> 'financiacion' financiacion from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'", [canalId, org]);
  if (!c) throw new ErrorErp("La tienda no existe.");
  return financiacionDe(c.financiacion);
}

async function grabar(org: string, canalId: number, valor: unknown) {
  await consulta(`update canal set config = jsonb_set(coalesce(config, '{}'::jsonb), '{financiacion}', $3::jsonb)
                   where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'`, [canalId, org, JSON.stringify(valor)]);
  revalidatePath(BASE);
}

export async function accionGuardarFinanciacion(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    const antes = await actual(s.org.id, canal);
    const planes: PlanEscala[] = [];
    for (let i = 0; i < 12; i++) {
      const cuotas = leerNumero(fd.get(`cuotas_${i}`));
      if (cuotas == null) continue;
      if (!Number.isInteger(cuotas) || cuotas < 2 || cuotas > 24) throw new ErrorErp("Las cuotas van de 2 a 24 (para un pago no hace falta plan).");
      if (planes.some((p) => p.cuotas === cuotas)) throw new ErrorErp(`El plan de ${cuotas} cuotas está repetido.`);
      const pct = (k: string, nombre: string) => {
        const v = leerNumero(fd.get(`${k}_${i}`)) ?? 0;
        if (v < 0 || v > 300) throw new ErrorErp(`${nombre} va de 0 a 300 %.`);
        return v;
      };
      const desde = leerNumero(fd.get(`desde_${i}`)) ?? 0;
      if (desde < 0) throw new ErrorErp("El monto «desde» no puede ser negativo.");
      planes.push({ cuotas, desde, costo_pct: pct("costo", "El costo del plan"), interes_pct: pct("interes", "El interés al cliente") });
    }
    const descuento = leerNumero(fd.get("descuento_pct")) ?? 0;
    if (descuento < 0 || descuento > 90) throw new ErrorErp("El descuento va de 0 a 90 %.");
    const medios = MEDIOS_CONTADO.map((m) => m.clave).filter((k) => fd.get(`medio_${k}`));
    await grabar(s.org.id, canal, { ...antes, planes: planes.sort((a, b) => a.cuotas - b.cuotas), descuento_pct: descuento, medios_descuento: medios });
    return "Grabado. La tienda ya muestra el esquema nuevo.";
  });
}

export async function accionActivarFinanciacion(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    const antes = await actual(s.org.id, canal);
    const activo = fd.get("valor") === "1";
    if (activo && !antes.planes.length && antes.descuento_pct <= 0) throw new ErrorErp("Cargá primero los planes o el descuento (lápiz de arriba a la derecha).");
    await grabar(s.org.id, canal, { ...antes, activo });
    return activo ? "Prendido: la tienda usa este esquema de cuotas y descuentos." : "Apagado: la tienda vuelve a los planes de Configuración › Cuotas y a los descuentos de cada medio de pago.";
  });
}
