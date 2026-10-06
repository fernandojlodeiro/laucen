// Caja y bancos como lista configurable (lib/listas/tipos.ts), en modo
// memoria (el saldo sale de cuentasConSaldo): "Descargar Excel" con la misma
// búsqueda que la pantalla.

import { coincideBusqueda } from "@/lib/busqueda";
import { cuentasConSaldo } from "@/lib/administracion/tesoreria";
import { cuentasImputables } from "@/lib/administracion/contabilidad";
import type { Lista } from "@/lib/listas/tipos";

export const TIPOS_CUENTA: Record<string, string> = { caja: "Caja", banco: "Banco", mercadopago: "Mercado Pago", otro: "Otra" };

type CuentaBuscable = { id: number; nombre: string; tipo: string; moneda: string; banco: string | null; cbu: string | null; alias: string | null; emisor: string | null; canal: string | null };

/** ¿La cuenta coincide con lo buscado? Regla común (lib/busqueda.ts) en todos sus datos de texto;
 *  el CBU es un campo numérico (se compara también lo escrito sin guiones). */
export function cuentaCoincide(c: CuentaBuscable, contable: string | null | undefined, q: string, comienza: boolean): boolean {
  return coincideBusqueda([String(c.id), c.nombre, c.tipo, TIPOS_CUENTA[c.tipo], c.moneda, c.banco, c.cbu, c.alias, c.emisor, c.canal, contable], q, comienza, [c.cbu]);
}

export const LISTA_TESORERIA: Lista = {
  pantalla: "tesoreria",
  titulo: "Caja y bancos",
  ruta: "/administracion/tesoreria",
  permiso: "tesoreria_ver",
  campos: [
    { clave: "nombre", titulo: "Cuenta", ancho: 28 },
    { clave: "emisor", titulo: "Razón social", ancho: 24 },
    { clave: "tipo", titulo: "Tipo", valor: (f) => TIPOS_CUENTA[f.tipo] ?? f.tipo },
    { clave: "moneda", titulo: "Moneda" },
    { clave: "banco", titulo: "Banco" },
    { clave: "cbu", titulo: "CBU", ancho: 24 },
    { clave: "alias", titulo: "Alias" },
    { clave: "contable", titulo: "Cuenta contable", ancho: 30 },
    { clave: "saldo_inicial", titulo: "Saldo inicial", formato: "decimal" },
    { clave: "saldo_inicial_fecha", titulo: "Saldo inicial al", formato: "fecha" },
    { clave: "saldo", titulo: "Saldo", formato: "decimal" },
    { clave: "conciliar", titulo: "Sin conciliar", valor: (f) => f.sin_conciliar, formato: "entero" },
    { clave: "activa", titulo: "Activa", formato: "sino" },
  ],
  enPantalla: ["nombre", "tipo", "moneda", "banco", "cbu", "alias", "contable", "saldo", "conciliar", "activa"],
  filas: async (ctx, sp) => {
    const q = sp.q?.trim() ?? "";
    const comienza = sp.contiene !== "1";
    const [cuentas, contables] = await Promise.all([cuentasConSaldo(ctx.org, Number(sp.rs) || null), cuentasImputables(ctx.org)]);
    const nombre = new Map(contables.map((x) => [x.id, `${x.codigo} ${x.nombre}`]));
    return cuentas
      .filter((c) => cuentaCoincide(c, c.cuenta_contable_id ? nombre.get(c.cuenta_contable_id) : null, q, comienza))
      .map((c) => ({ ...c, contable: c.cuenta_contable_id ? nombre.get(c.cuenta_contable_id) ?? null : null }));
  },
};
