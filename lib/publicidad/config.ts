// Publicidad: la configuración (orden 596). Regla de Fer: todo monto,
// porcentaje, tope, plazo o umbral va acá, editable en Ventas › Publicidad en
// Mercado Libre, pestaña Configuración; nada fijo en el código. Se guarda en
// config_org, clave 'publicidad'. Los valores de fábrica son un punto de
// partida razonable.

import { una, consulta, ErrorErp } from "@/lib/erp/base";

export type Ventas = "directas" | "totales";
export type CanalAviso = "windows" | "panel" | "ambos";

export type ConfigPublicidad = {
  /** Lo que se acepta pagar de publicidad por venta, en % del precio (pisable por producto o familia). */
  pctMax: number;
  /** CORTAR si gastó el equivalente a N ventas (N × pctMax × precio) sin vender nada. */
  topeVentas: number;
  /** …o, si es mayor que 0, un tope en pesos (el que llegue primero). */
  topePesos: number;
  /** No se corta por gasto sin rendir hasta haber gastado al menos esto (los productos baratos llegan al corte con pocos clics). */
  cortarMinimoPesos: number;
  /** No se juzga (salvo el tope sin ventas) hasta tener estos días con gasto… */
  diasMinimos: number;
  /** …y estos clics. */
  clicsMinimos: number;
  /** SUBIR si la publicidad por venta queda en este % del tope o menos. */
  subirHasta: number;
  /** CORTAR si la publicidad por venta pasa este % del tope (entre 100 % y esto, BAJAR). */
  cortarDesde: number;
  /** Cuántos días hacia atrás se miran para el veredicto. */
  ventanaDias: number;
  /** Qué ventas cuentan: sólo las directas (compró lo que tocó en el anuncio) o también las indirectas. */
  ventas: Ventas;
  /** Cada cuántas horas se lee la publicidad de ML. */
  leerCadaHoras: number;
  /** Cuántos días hacia atrás se releen en cada lectura (ML atribuye ventas con demora). */
  releerDias: number;
  /** Por dónde se avisa cuando un producto pasa a CORTAR. */
  avisoCanal: CanalAviso;
  /** Mientras siga en CORTAR, repetir el aviso cada tantas horas (0 = sólo cuando pasa). */
  avisoRepetirHoras: number;
};

export const CONFIG_DEFECTO: ConfigPublicidad = {
  pctMax: 7, topeVentas: 2, topePesos: 0, cortarMinimoPesos: 3000, diasMinimos: 3, clicsMinimos: 30, subirHasta: 50, cortarDesde: 150,
  ventanaDias: 14, ventas: "directas", leerCadaHoras: 6, releerDias: 7, avisoCanal: "ambos", avisoRepetirHoras: 24,
};

/** Rótulo, ayuda y límites de cada valor numérico (la pantalla y la validación salen de acá). */
export const CAMPOS_NUM: { clave: keyof ConfigPublicidad; rotulo: string; ayuda: string; tipo: "entero" | "decimal" | "pesos"; min: number; max: number }[] = [
  { clave: "pctMax", rotulo: "Publicidad por venta, tope (% del precio)", ayuda: "Lo máximo que aceptás pagar de publicidad por cada venta.", tipo: "decimal", min: 0.1, max: 100 },
  { clave: "topeVentas", rotulo: "Cortar sin ventas al gastar (ventas)", ayuda: "Gastado el equivalente a tantas ventas sin vender nada: CORTAR.", tipo: "decimal", min: 0.5, max: 50 },
  { clave: "topePesos", rotulo: "…o al gastar ($, 0 = no usar)", ayuda: "Tope fijo en pesos sin ventas; vale el que llegue primero.", tipo: "pesos", min: 0, max: 1e9 },
  { clave: "cortarMinimoPesos", rotulo: "No cortar antes de gastar ($)", ayuda: "Piso para el corte: un producto barato no se corta por unos pocos clics.", tipo: "pesos", min: 0, max: 1e9 },
  { clave: "diasMinimos", rotulo: "Días mínimos antes de juzgar", ayuda: "Días con gasto antes de decir SUBIR o BAJAR.", tipo: "entero", min: 0, max: 60 },
  { clave: "clicsMinimos", rotulo: "Clics mínimos antes de juzgar", ayuda: "Clics antes de decir SUBIR o BAJAR.", tipo: "entero", min: 0, max: 10000 },
  { clave: "subirHasta", rotulo: "SUBIR hasta (% del tope)", ayuda: "Si la publicidad por venta queda en este % del tope o menos.", tipo: "entero", min: 1, max: 100 },
  { clave: "cortarDesde", rotulo: "CORTAR desde (% del tope)", ayuda: "Arriba de este % del tope, CORTAR; entre el tope y esto, BAJAR.", tipo: "entero", min: 100, max: 1000 },
  { clave: "ventanaDias", rotulo: "Días que se miran", ayuda: "El veredicto mira el gasto y las ventas de estos últimos días.", tipo: "entero", min: 1, max: 90 },
  { clave: "leerCadaHoras", rotulo: "Leer de Mercado Libre cada (horas)", ayuda: "Cada cuánto se lee la publicidad.", tipo: "entero", min: 1, max: 48 },
  { clave: "releerDias", rotulo: "Releer los últimos (días)", ayuda: "ML suma ventas atribuidas con demora: cada lectura vuelve a leer estos días.", tipo: "entero", min: 1, max: 30 },
  { clave: "avisoRepetirHoras", rotulo: "Repetir el aviso cada (horas, 0 = no)", ayuda: "Mientras un producto siga en CORTAR.", tipo: "entero", min: 0, max: 720 },
];

export async function configPublicidad(org: string): Promise<ConfigPublicidad> {
  const f = await una<{ valor: Partial<ConfigPublicidad> }>("select valor from config_org where organizacion_id = $1 and clave = 'publicidad'", [org]).catch(() => null);
  return { ...CONFIG_DEFECTO, ...(f?.valor ?? {}) };
}

export async function guardarConfigPublicidad(org: string, c: ConfigPublicidad): Promise<void> {
  for (const k of CAMPOS_NUM) {
    const v = Number(c[k.clave]);
    if (!Number.isFinite(v) || v < k.min || v > k.max) throw new ErrorErp(`«${k.rotulo}» tiene que estar entre ${k.min} y ${k.max}.`);
  }
  if (!["directas", "totales"].includes(c.ventas)) throw new ErrorErp("Elegí qué ventas cuentan.");
  if (!["windows", "panel", "ambos"].includes(c.avisoCanal)) throw new ErrorErp("Elegí por dónde avisar.");
  if (c.subirHasta >= 100) throw new ErrorErp("«SUBIR hasta» tiene que ser menos de 100 % del tope.");
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'publicidad', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(c)]);
}
