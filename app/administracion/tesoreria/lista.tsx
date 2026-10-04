// Caja y bancos como lista configurable (lib/listas/tipos.ts), en modo
// memoria (el saldo sale de cuentasConSaldo): "Descargar Excel" con la misma
// búsqueda que la pantalla.

import { coincideBusqueda } from "@/app/componentes/erp";
import { cuentasConSaldo } from "@/lib/administracion/tesoreria";
import { cuentasImputables } from "@/lib/administracion/contabilidad";
import type { Lista } from "@/lib/listas/tipos";

export const TIPOS_CUENTA: Record<string, string> = { caja: "Caja", banco: "Banco", mercadopago: "Mercado Pago", otro: "Otra" };

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
      .filter((c) => [c.nombre, c.banco, c.alias, c.cbu].some((t) => coincideBusqueda(t, q, comienza)))
      .map((c) => ({ ...c, contable: c.cuenta_contable_id ? nombre.get(c.cuenta_contable_id) ?? null : null }));
  },
};
