// Alta de un despacho de importación: sólo la cabecera. Queda en borrador y
// se sigue en el detalle (líneas, gastos, impuestos, prorrateo, registrar).

import { hoyAR } from "@/lib/moneda";
import { VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, CAJA } from "@/app/componentes/erp";
import { CamposDespacho, opcionesDespacho } from "../Cabecera";
import { accionCrearDespacho } from "../acciones";

export const dynamic = "force-dynamic";

export default async function NuevoDespacho({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("despachos_ver");
  const sp = await searchParams;
  const o = await opcionesDespacho(s.org.id);

  return (
    <Pantalla titulo="Nuevo despacho de importación" ancho="max-w-4xl" camino={[{ texto: "Nuevo despacho" }]}>
      <Avisos sp={sp} />
      {!o.tc && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">No hay tipo de cambio cargado: poné la cotización a mano.</p>}
      <form action={accionCrearDespacho} className={`${CAJA} grid gap-3`}>
        <CamposDespacho o={o} d={{
          numero: null, proveedor_id: null, fecha: hoyAR(), cotizacion: null, flete_usd: 0, seguro_usd: 0,
          deposito_id: o.depositos.length === 1 ? o.depositos[0].id : null, notas: null,
        }} />
        <div><BotonEnviar clase={VERDE} corriendo="Creando…">Crear y cargar las líneas</BotonEnviar></div>
      </form>
    </Pantalla>
  );
}
