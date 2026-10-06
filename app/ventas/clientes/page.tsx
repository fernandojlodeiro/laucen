// Clientes: listado con buscador y filtro por tipo. Los clientes los crean
// los pedidos; el alta manual de abajo existe para corregir.

import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, CAMPO } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { TIPOS_CLIENTE, DOCUMENTOS } from "@/app/ventas/formato";
import { LISTA_CLIENTES, filtrosClientes } from "./lista";
import { accionCrearCliente } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; tipo?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("clientes_ver");
  const sp = await searchParams;
  const { q, comienza, tipo } = filtrosClientes(sp);
  const vista = await paginaDeVista(LISTA_CLIENTES, { org: s.org.id, moneda: s.moneda }, sp);

  return (
    <Pantalla titulo="Clientes" subtitulo="Los crean los pedidos; acá se miran y se corrigen sus datos"
      acciones={<><AccionesExcel lista={LISTA_CLIENTES} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo cliente" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo cliente" sinBoton>
        <form action={accionCrearCliente} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre o razón social" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <select name="tipo" defaultValue="consumidor_final" className={CAMPO} aria-label="Tipo">
            {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="documento_tipo" defaultValue="DNI" className={CAMPO} aria-label="Tipo de documento">
            {DOCUMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input name="documento_numero" placeholder="Número" className={`${CAMPO} w-32`} />
          <input name="email" type="email" placeholder="Mail" className={`${CAMPO} w-48`} />
          <input name="telefono" placeholder="Teléfono" className={`${CAMPO} w-32`} />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar en todos los datos del cliente" />
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
      </div>
      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_CLIENTES} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={q || tipo ? "No hay clientes con esa búsqueda." : "Todavía no hay clientes."} />
    </Pantalla>
  );
}
