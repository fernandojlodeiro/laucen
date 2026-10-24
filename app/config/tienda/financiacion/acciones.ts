"use server";

// Cuotas y descuentos de la tienda (canal.config.financiacion, lib/tienda/financiacion.ts):
// grabar el esquema y prenderlo o apagarlo.

import { revalidatePath, revalidateTag } from "next/cache";
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
      const codigo = leerNumero(fd.get(`codigo_${i}`));
      if (codigo != null && (!Number.isInteger(codigo) || codigo < 1 || codigo > 999)) throw new ErrorErp("El código de Payway es un número entero (ej. 13 o 16).");
      planes.push({ cuotas, desde, costo_pct: pct("costo", "El costo del plan"), interes_pct: pct("interes", "El interés al cliente"), codigo_payway: codigo,
        medio: fd.get(`medio_${i}`) === "mercadopago" ? "mercadopago" : "payway" });
    }
    const descuento = leerNumero(fd.get("descuento_pct")) ?? 0;
    if (descuento < 0 || descuento > 90) throw new ErrorErp("El descuento va de 0 a 90 %.");
    const medios = MEDIOS_CONTADO.map((m) => m.clave).filter((k) => fd.get(`medio_${k}`));
    await grabar(s.org.id, canal, { ...antes, planes: planes.sort((a, b) => a.cuotas - b.cuotas), descuento_pct: descuento, medios_descuento: medios });
    await guardarVsMl(s.org.id, canal, fd);
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

// ── Precio contra Mercado Libre (lista_precios.precio_vs_ml de la lista de la tienda; db/catalogo.sql) ──
type PrecioVsMl = { activo: boolean; objetivo_pct: number; costo_ref_pct: number; canal_tachado: number | null; comision_defecto_pct: number };

async function listaDeLaTienda(org: string, canalId: number) {
  const c = await una<{ lista: string | null; cfg: Partial<PrecioVsMl> | null }>(
    `select c.lista_precios_id lista, l.precio_vs_ml cfg from canal c left join lista_precios l on l.id = c.lista_precios_id
      where c.id = $1 and c.organizacion_id = $2 and c.tipo = 'web_minorista'`, [canalId, org]);
  if (!c?.lista) throw new ErrorErp("La tienda no tiene lista de precios (Configuración › Tienda web).");
  return { lista: Number(c.lista), cfg: c.cfg ?? {} };
}

async function grabarVsMl(org: string, canalId: number, lista: number, cfg: PrecioVsMl) {
  await consulta("update lista_precios set precio_vs_ml = $3::jsonb where id = $1 and organizacion_id = $2", [lista, org, JSON.stringify(cfg)]);
  revalidateTag(`tienda-${canalId}`);
  revalidatePath(BASE);
}

/** Lo que se graba con el lápiz de la ficha (junto con los planes). */
async function guardarVsMl(org: string, canalId: number, fd: FormData) {
  if (!fd.has("vsml_objetivo")) return;
  const { lista, cfg } = await listaDeLaTienda(org, canalId);
  const pct = (k: string, nombre: string, min: number, max: number, defecto: number) => {
    const v = leerNumero(fd.get(k)) ?? defecto;
    if (v < min || v > max) throw new ErrorErp(`${nombre} va de ${min} a ${max} %.`);
    return v;
  };
  const canal = leerNumero(fd.get("vsml_canal"));
  await grabarVsMl(org, canalId, lista, {
    activo: !!cfg.activo,
    objetivo_pct: pct("vsml_objetivo", "Lo que te tiene que quedar", 50, 150, 97),
    costo_ref_pct: pct("vsml_costo", "El costo de cobro de referencia", 0, 40, 0),
    canal_tachado: canal && canal > 0 ? canal : null,
    comision_defecto_pct: pct("vsml_comision", "La comisión de ML por defecto", 0, 60, 16.34),
  });
}

export async function accionActivarVsMl(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    const { lista, cfg } = await listaDeLaTienda(s.org.id, canal);
    const activo = fd.get("valor") === "1";
    if (activo && !cfg.objetivo_pct) throw new ErrorErp("Cargá primero cuánto te tiene que quedar (lápiz de arriba a la derecha).");
    await grabarVsMl(s.org.id, canal, lista, {
      activo, objetivo_pct: cfg.objetivo_pct ?? 97, costo_ref_pct: cfg.costo_ref_pct ?? 0, canal_tachado: cfg.canal_tachado ?? null, comision_defecto_pct: cfg.comision_defecto_pct ?? 16.34,
    });
    return activo ? "Prendido: los precios de la tienda se calculan contra Mercado Libre." : "Apagado: la tienda vuelve a los precios de su lista con los descuentos por familia.";
  });
}
