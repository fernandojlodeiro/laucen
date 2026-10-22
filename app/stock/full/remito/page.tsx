// Stock › Envíos a Full › Datos del remito (lib/full/remito.ts): el destino de los envíos a Full y
// las observaciones que van en todos los remitos. Son siempre los mismos: se cargan una vez.

import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, editandoFicha, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { datosRemito, type DatosRemito } from "@/lib/full/remito";
import { PestanasFull } from "../piezas";
import { accionGuardarDatosRemito } from "../acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; editar?: string };
const CAMPOS: { k: keyof DatosRemito; texto: string; clase: string; largo?: boolean }[] = [
  { k: "destinatario", texto: "Destinatario", clase: "basis-full sm:basis-[calc(66%-1rem)]" },
  { k: "cuit", texto: "CUIT", clase: "w-44" },
  { k: "direccion", texto: "Dirección", clase: "basis-full sm:basis-[calc(66%-1rem)]" },
  { k: "codigo_postal", texto: "Código postal", clase: "w-32" },
  { k: "localidad", texto: "Localidad", clase: "w-72" },
  { k: "provincia", texto: "Provincia", clase: "w-56" },
  { k: "telefono", texto: "Teléfono", clase: "w-56" },
  { k: "horario", texto: "Horario de recepción", clase: "w-72" },
  { k: "observaciones", texto: "Observaciones (van en todos los remitos)", clase: "basis-full", largo: true },
];

export default async function DatosRemitoFull({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("full_ver");
  const sp = await searchParams;
  const d = await datosRemito(s.org.id);
  const editando = editandoFicha(sp);
  return (
    <Pantalla titulo="Envíos a Full" subtitulo="A dónde van los envíos a Full: lo que sale en el remito para el transportista."
      acciones={<BotonesFicha editando={editando} ver="/stock/full/remito" editar="/stock/full/remito?editar=ficha" />}>
      <Avisos sp={sp} />
      <PestanasFull org={s.org.id} activa="remito" />
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Van en el recuadro «Destino» del remito de cada envío. El transportista, los bultos y el valor declarado se cargan en cada envío.
      </p>
      <form id="ficha" action={accionGuardarDatosRemito} className={`${CAJA} flex flex-wrap gap-4 items-start`}>
        {CAMPOS.map((c) => editando ? (
          <label key={c.k} className={c.clase}><span className={ETIQUETA}>{c.texto}</span>
            {c.largo
              ? <textarea name={c.k} rows={3} defaultValue={d[c.k] ?? ""} className={`${CAMPO} w-full`} />
              : <input name={c.k} defaultValue={d[c.k] ?? ""} className={`${CAMPO} w-full`} />}
          </label>
        ) : (
          <Dato key={c.k} etiqueta={c.texto} largo={c.largo} className={c.clase}>{d[c.k]}</Dato>
        ))}
      </form>
    </Pantalla>
  );
}
