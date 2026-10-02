// Alta de una factura de compra: sólo la cabecera. Queda en borrador y se
// sigue en el detalle (líneas, percepciones, registrar).

import Link from "next/link";
import { hoyAR } from "@/lib/moneda";
import { VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, CAJA } from "@/app/componentes/erp";
import { CamposCabecera, opcionesCabecera } from "../Cabecera";
import { accionCrearFactura } from "../acciones";

export const dynamic = "force-dynamic";

export default async function NuevaFactura({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const o = await opcionesCabecera(s.org.id);

  return (
    <Pantalla titulo="Nueva factura de compra" ancho="max-w-4xl"
      subtitulo={<Link href="/compras/facturas" className="text-[#16577F] hover:underline">← Facturas de compra</Link>}>
      <Avisos sp={sp} />
      {o.proveedores.length === 0 && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Todavía no hay proveedores. <Link href="/compras/proveedores" className="font-bold underline">Cargá uno</Link>
        </p>
      )}
      <form action={accionCrearFactura} className={`${CAJA} grid gap-3`}>
        <CamposCabecera o={o} d={{
          proveedor_id: null, letra: "A", es_nota_credito: false, punto_venta: null, numero: null, fecha: hoyAR(), vencimiento: null,
          moneda: s.moneda, cotizacion: null, deposito_id: o.depositos.length === 1 ? o.depositos[0].id : null, recepcion_id: null, cuenta_gasto_id: null, notas: null,
        }} />
        <div><BotonEnviar clase={VERDE} corriendo="Creando…">Crear y cargar las líneas</BotonEnviar></div>
      </form>
    </Pantalla>
  );
}
