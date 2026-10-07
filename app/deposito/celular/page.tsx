// Modo depósito (celular): pocos botones enormes para quien prepara pedidos e
// imprime etiquetas, sin menús ni tablas. Cada botón abre directo la pantalla
// de trabajo (que ya anda en el celular y lee códigos con la cámara). Aparece
// en el menú del celular y se puede dejar fijo en la barra de abajo
// (Configuración › Mis accesos del celular).

import Link from "next/link";
import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso, type PermisoKey } from "@/lib/permisos";
import { consulta } from "@/lib/erp/base";
import { sqlPedidoPendiente, sqlCarritoEnEspera } from "@/lib/pedidos";
import { CONDICION_ENVIOS } from "@/app/ventas/envios/lista";

export const dynamic = "force-dynamic";

type Boton = { texto: string; ayuda: string; href: string; icono: string; permiso: PermisoKey; n?: number | null };

export default async function ModoDeposito() {
  const s = await sesionRequerida();
  const puede = (p: PermisoKey) => tienePermiso(s.permisos, p);
  const [x] = await consulta<{ preparar: number; etiquetas: number }>(`
    select (select count(*) from pedido p where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")} and not ${sqlCarritoEnEspera("p")})::int preparar,
           (select count(*) from envio e where e.organizacion_id = $1 and ${CONDICION_ENVIOS.despachar} and e.etiqueta_impresa_ts is null and e.id_externo is not null)::int etiquetas`, [s.org.id]);

  const todos: Boton[] = [
    { texto: "Preparar pedidos", ayuda: "Elegir el lote y escanear", href: "/deposito/picking", icono: "🧺", permiso: "picking_ver", n: x?.preparar },
    { texto: "Imprimir etiquetas de envío", ayuda: "Las de los pedidos por despachar", href: "/ventas/envios", icono: "🏷️", permiso: "envios_ver", n: x?.etiquetas },
    { texto: "Etiquetas de Full", ayuda: "Para mandar mercadería a Mercado Libre", href: "/deposito/etiquetas/full", icono: "📦", permiso: "etiquetas_ver" },
    { texto: "Recepción", ayuda: "Escanear lo que llega", href: "/deposito/recepcion", icono: "📥", permiso: "recepcion_ver" },
    { texto: "Consultar stock", ayuda: "Escanear y ver dónde está", href: "/stock/consulta", icono: "🔎", permiso: "stock_ver" },
    { texto: "Etiquetas de producto y ubicación", ayuda: "Imprimir códigos", href: "/deposito/etiquetas", icono: "🔖", permiso: "etiquetas_ver" },
  ];
  const botones = todos.filter((b) => puede(b.permiso));
  if (!botones.length) redirect("/panel");

  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-6">
      <h1 className="text-lg font-bold mb-3">Modo depósito</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {botones.map((b) => (
          <Link key={b.href} href={b.href}
            className="relative flex items-center gap-4 rounded-2xl bg-white border-2 border-[#E3E9F0] active:bg-[#EEF3F8] hover:border-[#16577F] px-4 py-6 min-h-28">
            <span className="text-5xl leading-none" aria-hidden>{b.icono}</span>
            <span className="min-w-0">
              <span className="block text-xl font-bold text-[#16577F] leading-tight">{b.texto}</span>
              <span className="block text-sm text-[#5C6B76]">{b.ayuda}</span>
            </span>
            {b.n != null && b.n > 0 && (
              <span className="absolute top-2 right-3 min-w-8 text-center rounded-full bg-[#C03420] text-white text-sm font-bold px-2 py-0.5">{b.n}</span>
            )}
          </Link>
        ))}
      </div>
      <p className="text-xs text-[#5C6B76] mt-4">Para volver al sistema completo, usá el botón «Menú» de abajo.</p>
    </main>
  );
}
