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
import { AYUDA_BUSQUEDA } from "@/lib/busqueda";
import { Suspense } from "react";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { sosVos } from "@/lib/admin";
import { menuPara } from "@/lib/menu";
import { accesosDe } from "@/lib/accesos";
import { historialDe } from "@/lib/historial";
import { monedaVista, buscarInactivos, tcDelDia, formatear, type Moneda } from "@/lib/moneda";
import { estadoAvisos } from "@/lib/avisos";
import type { EstadoAvisos } from "@/lib/avisos-tipos";
import { ContadoresEstado, VigiaAvisos } from "./AvisosVivos";
import OfrecerAvisos from "./OfrecerAvisos";
import { accionLogout } from "@/app/auth-actions";
import { BarraMenu, MenuCelular } from "./BarraMenu";
import Historial from "./Historial";
import Manuales from "./Manuales";
import IndicadorCarga from "./IndicadorCarga";
import { guiasDelManual } from "@/lib/asistente/manual";
import { accionMonedaVista } from "./acciones";
import Asistente from "@/app/componentes/asistente/Asistente";
import { AvisosTareas } from "@/app/componentes/TareasFondo";
import { configAsistente, CONFIG_DEFECTO } from "@/lib/asistente/config";
import { estilosCanales } from "@/lib/canales/colores";

export default async function Marco({ children, version }: { children: React.ReactNode; version: string }) {
  const sesion = await sesionActual();
  if (!sesion) return <>{children}</>;
  const esFer = await sosVos();
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(sesion.permisos, p);
  const menu = menuPara(puede, esFer);

  // Si la base no responde, el marco se dibuja igual (con lo que haya).
  const [moneda, tc, avisos, asistente, accesos, historial, inactivos, guias, coloresCanales] = await Promise.all([
    monedaVista(sesion.usuario.id, sesion.org.id).catch(() => "ARS" as Moneda),
    tcDelDia(sesion.org.id).catch(() => null),
    estadoAvisos(sesion.usuario.id, sesion.org.id, puede).catch((): EstadoAvisos => ({ contadores: [], ventana: [], prefs: { sonido: false, ventana: { pedidos: false, preguntas: false, mensajes: false, whatsapp: false }, cadaMin: 1 } })),
    configAsistente(sesion.org.id).catch(() => CONFIG_DEFECTO),
    accesosDe(sesion.usuario.id, sesion.org.id, puede).catch(() => []),
    historialDe(sesion.usuario.id, sesion.org.id).catch(() => []),
    buscarInactivos(sesion.usuario.id, sesion.org.id).catch(() => false),
    guiasDelManual().catch(() => []),
    estilosCanales(sesion.org.id).catch(() => ""),
  ]);
  // Las guías que puede leer (las de un permiso que no tiene, no se listan).
  const manuales = guias.filter((g) => g.permiso === "todos" || (g.permiso === "fer" ? esFer : puede(g.permiso as Parameters<typeof tienePermiso>[1])))
    .map((g) => ({ archivo: g.archivo, titulo: g.titulo, resumen: g.resumen }));
  const quien = sesion.usuario.nombre || sesion.usuario.email;

  return (
    <div className="min-h-screen flex flex-col">
      {/* El color de cada canal (Fer, 8/10): toda fila o columna marcada con data-canal="<id>" lleva su fondo. */}
      {coloresCanales && <style dangerouslySetInnerHTML={{ __html: coloresCanales }} />}
      {/* PC: barra de menú */}
      <header data-reinicia-recorrido className="hidden md:block print:!hidden sticky top-0 z-30 bg-white border-b border-[#E3E9F0]">
        <div className="flex items-center gap-3 px-3 h-10">
          <Link href="/panel" className="text-sm font-black text-[#16577F] tracking-tight shrink-0">Laucen</Link>
          <BarraMenu menu={menu} />
          <form action="/buscar" className="ml-auto flex items-center gap-1">
            <input name="q" placeholder="Buscar producto, MLA, cliente, proveedor…" aria-label="Buscar" title={AYUDA_BUSCAR}
              className="w-64 text-xs border border-[#E3E9F0] rounded-lg px-2 py-1.5 bg-[#F7F8F6]" />
            {/* El globito con cómo se busca (al pasar el mouse o tocarlo). */}
            <span title={AYUDA_BUSCAR} aria-label={AYUDA_BUSCAR} tabIndex={0}
              className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-[#9AA7B3] text-[10px] font-bold text-[#5C6B76] cursor-help shrink-0">?</span>
            {/* Incluir los inactivos (Fer, 6/10): chico, una caja con el ícono del archivo; apagada de entrada. */}
            <CajaInactivos activo={inactivos} />
          </form>
          <form action={accionLogout}>
            <button className="text-xs font-bold rounded-lg px-2 py-1.5 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">Salir</button>
          </form>
        </div>
      </header>

      {/* Celular: franja de arriba, FIJA (con el buscador siempre a mano) */}
      <header data-reinicia-recorrido className="md:hidden print:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-[#E3E9F0] px-3 h-12 flex items-center gap-2">
        <Link href="/panel" className="text-sm font-black text-[#16577F]">Laucen</Link>
        <form action="/buscar" className="flex-1 min-w-0 flex items-center gap-1">
          <input name="q" placeholder="Buscar producto, MLA, cliente…" aria-label="Buscar" enterKeyHint="search" title={AYUDA_BUSCAR}
            className="flex-1 min-w-0 text-sm border border-[#E3E9F0] rounded-lg px-3 py-1.5 bg-[#F7F8F6]" />
          <CajaInactivos activo={inactivos} />
        </form>
        <InterruptorMoneda moneda={moneda} />
      </header>
      <div className="md:hidden print:hidden h-12" aria-hidden />

      <div className="flex-1 pb-24 md:pb-12">{children}</div>

      {/* PC: barra de estado, fija abajo */}
      <footer className="hidden md:flex print:!hidden fixed bottom-0 inset-x-0 z-30 h-8 items-center gap-4 px-3 bg-[#16577F] text-white text-[11px]">
        {/* Cuándo se actualizó y el commit (Fer, 8/10: muy importante, centrado en la barra). */}
        {version && <span className="absolute left-1/2 -translate-x-1/2 hidden lg:inline font-semibold whitespace-nowrap pointer-events-none">{version}</span>}
        <InterruptorMoneda moneda={moneda} oscuro />
        <span title={tc ? `Oficial venta del ${tc.fecha.split("-").reverse().join("/")} (${tc.origen})` : undefined}>
          Dólar: {tc ? <b>{formatear(tc.venta, "ARS")}</b> : <Link href="/config/tipo-cambio" className="underline">sin cargar</Link>}
        </span>
        {/* Se refrescan solos; lo nuevo que no viste, en amarillo (Fer, 10/10). */}
        <ContadoresEstado inicial={avisos.contadores} />
        {/* Lo último que viste: «Historial» en la barra (se despliega hacia arriba) y, si sobra lugar, también al costado. */}
        <Suspense fallback={null}><Historial inicial={historial} /></Suspense>
        <span className="ml-auto opacity-80">{sesion.org.nombre} · {quien}</span>
        {/* Manuales de ayuda (Fer, 8/10: en lugar del id del deploy). */}
        <Manuales guias={manuales} />
      </footer>

      <AvisosTareas />
      {/* Los contadores al día, el sonido y la ventana con lo que la IA no contestó (Configuración › Mis avisos). */}
      <Suspense fallback={null}><VigiaAvisos inicial={avisos} /></Suspense>
      <OfrecerAvisos />
      <Suspense fallback={null}><IndicadorCarga /></Suspense>

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

/** "Incluir inactivos" en el buscador de arriba: una caja para tildar con el ícono del archivo (🗃) y
 *  la explicación al pasar el mouse. Viene como la dejó el usuario la última vez (apagada si nunca la
 *  tocó); "ci" avisa que el formulario trae la caja, así /buscar guarda lo elegido. */
function CajaInactivos({ activo }: { activo: boolean }) {
  return (
    <label title={AYUDA_INACTIVOS} className="inline-flex items-center gap-0.5 text-xs text-[#5C6B76] cursor-pointer select-none shrink-0">
      <input type="hidden" name="ci" value="1" />
      <input type="checkbox" name="inactivos" value="1" defaultChecked={activo} aria-label="Incluir inactivos" className="h-3.5 w-3.5 accent-[#16577F]" />
      <span aria-hidden>🗃</span>
    </label>
  );
}

const AYUDA_BUSCAR = AYUDA_BUSQUEDA;

/** Cuándo salen los inactivos (Fer, 6/10), para el globito de la cajita 🗃. */
const AYUDA_INACTIVOS = "Incluir inactivos (productos archivados). Sin tildar, los inactivos aparecen sólo cuando lo único que coincide es inactivo. Tildada, aparecen siempre. Queda como la dejes.";
