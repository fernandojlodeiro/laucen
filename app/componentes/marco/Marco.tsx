// El marco del sistema (orden 136, §2 bis): todas las pantallas detrás del
// login viven adentro.
// - PC: barra de menú arriba (estilo Excel: secciones que despliegan sus
//   opciones hacia abajo), con el buscador global; barra de estado fija ABAJO
//   (moneda con su interruptor, tipo de cambio del día, organización y
//   usuario, contadores).
// - Celular (pantallas angostas): otro modo, no la misma pantalla achicada.
//   Arriba una franja con la organización y la moneda; abajo, 4 accesos
//   directos y el botón "Menú" con el árbol completo.
// El árbol del menú sale de lib/menu.ts.

import Link from "next/link";
import { Suspense } from "react";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { sosVos } from "@/lib/admin";
import { ACCESOS_CELULAR, menuPara } from "@/lib/menu";
import { monedaVista, tcDelDia, formatear, type Moneda } from "@/lib/moneda";
import { contadoresEstado, type Contador } from "@/lib/erp/contadores";
import { accionLogout } from "@/app/auth-actions";
import { BarraMenu, MenuCelular } from "./BarraMenu";
import { accionMonedaVista } from "./acciones";
import Asistente from "@/app/componentes/asistente/Asistente";
import { configAsistente, CONFIG_DEFECTO } from "@/lib/asistente/config";

export default async function Marco({ children, version }: { children: React.ReactNode; version: string }) {
  const sesion = await sesionActual();
  if (!sesion) return <>{children}</>;
  const esFer = await sosVos();
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(sesion.permisos, p);
  const menu = menuPara(puede, esFer);
  const accesos = ACCESOS_CELULAR.filter((a) => !a.permiso || puede(a.permiso));

  // Si la base no responde, el marco se dibuja igual (con lo que haya).
  const [moneda, tc, contadores, asistente] = await Promise.all([
    monedaVista(sesion.usuario.id, sesion.org.id).catch(() => "ARS" as Moneda),
    tcDelDia(sesion.org.id).catch(() => null),
    contadoresEstado(sesion.org.id).catch(() => [] as Contador[]),
    configAsistente(sesion.org.id).catch(() => CONFIG_DEFECTO),
  ]);
  const quien = sesion.usuario.nombre || sesion.usuario.email;

  return (
    <div className="min-h-screen flex flex-col">
      {/* PC: barra de menú */}
      <header className="hidden md:block sticky top-0 z-30 bg-white border-b border-[#E3E9F0]">
        <div className="flex items-center gap-3 px-3 h-10">
          <Link href="/panel" className="text-sm font-black text-[#16577F] tracking-tight shrink-0">Laucen</Link>
          <BarraMenu menu={menu} />
          <form action="/buscar" className="ml-auto flex items-center gap-1">
            <input name="q" placeholder="Buscar producto, pedido, cliente…" aria-label="Buscar"
              className="w-64 text-xs border border-[#E3E9F0] rounded-lg px-2 py-1.5 bg-[#F7F8F6]" />
          </form>
          <form action={accionLogout}>
            <button className="text-xs font-bold rounded-lg px-2 py-1.5 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">Salir</button>
          </form>
        </div>
      </header>

      {/* Celular: franja de arriba */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-[#E3E9F0] px-3 h-11 flex items-center gap-2">
        <Link href="/panel" className="text-sm font-black text-[#16577F]">Laucen</Link>
        <span className="text-[11px] text-[#5C6B76] truncate flex-1">{sesion.org.nombre}</span>
        <InterruptorMoneda moneda={moneda} />
      </header>

      <div className="flex-1 pb-24 md:pb-12">{children}</div>

      {/* PC: barra de estado, fija abajo */}
      <footer className="hidden md:flex fixed bottom-0 inset-x-0 z-30 h-8 items-center gap-4 px-3 bg-[#16577F] text-white text-[11px]">
        <InterruptorMoneda moneda={moneda} oscuro />
        <span title={tc ? `Oficial venta del ${tc.fecha.split("-").reverse().join("/")} (${tc.origen})` : undefined}>
          Dólar oficial: {tc ? <b>{formatear(tc.venta, "ARS")}</b> : <Link href="/config/tipo-cambio" className="underline">sin cargar</Link>}
        </span>
        <span className="flex items-center gap-3">
          {contadores.map((c) => <ContadorEstado key={c.texto} c={c} />)}
        </span>
        <span className="ml-auto opacity-80">{sesion.org.nombre} · {quien}</span>
        <span className="opacity-50 hidden lg:inline">{version}</span>
      </footer>

      {/* El asistente: la carita abajo a la derecha (lib/asistente/motor.ts) */}
      {puede("asistente_usar") && (
        <Suspense fallback={null}>
          <Asistente nombre={asistente.nombre} carita={asistente.carita} usuario={quien} />
        </Suspense>
      )}

      {/* Celular: accesos directos + menú completo */}
      <MenuCelular menu={menu} accesos={accesos} />
    </div>
  );
}

function ContadorEstado({ c }: { c: Contador }) {
  if (c.n === null) return <span className="opacity-50" title="Próximamente">{c.texto}: —</span>;
  const cuerpo = <>{c.texto}: <b className={c.n > 0 ? "bg-white text-[#16577F] rounded px-1" : ""}>{c.n}</b></>;
  return c.href ? <Link href={c.href} className="hover:underline">{cuerpo}</Link> : <span>{cuerpo}</span>;
}

/** El interruptor "ver en pesos / ver en dólares": un interruptor de verdad
 *  (pista + perilla), guarda la preferencia del usuario. */
function InterruptorMoneda({ moneda, oscuro }: { moneda: Moneda; oscuro?: boolean }) {
  const usd = moneda === "USD";
  return (
    <form action={accionMonedaVista} className="flex items-center gap-1.5 text-[11px]">
      <input type="hidden" name="moneda" value={usd ? "ARS" : "USD"} />
      <span className={usd ? "opacity-60" : "font-bold"}>$</span>
      <button role="switch" aria-checked={usd} aria-label="Ver en dólares"
        title={usd ? "Viendo en dólares: tocá para ver en pesos" : "Viendo en pesos: tocá para ver en dólares"}
        className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition ${usd ? "bg-[#167655]" : oscuro ? "bg-white/40" : "bg-[#C9D3DD]"}`}>
        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition ${usd ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span className={usd ? "font-bold" : "opacity-60"}>US$</span>
    </form>
  );
}
