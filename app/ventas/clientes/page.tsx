// Clientes: listado con buscador y filtro por tipo. Los clientes los crean
// los pedidos; el alta manual pide los mismos datos que la ficha (CamposCliente).

import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { TIPOS_CLIENTE, ACCESOS_MAYORISTA } from "@/app/ventas/formato";
import { listasDePrecios } from "@/lib/precios";
import { tienePermiso } from "@/lib/permisos";
import CamposCliente from "./CamposCliente";
import { LISTA_CLIENTES, filtrosClientes } from "./lista";
import { accionCrearCliente } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; tipo?: string; acceso?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("clientes_ver");
  const sp = await searchParams;
  const { q, comienza, tipo, acceso } = filtrosClientes(sp);
  const [vista, listas] = await Promise.all([paginaDeVista(LISTA_CLIENTES, { org: s.org.id, moneda: s.moneda }, sp), listasDePrecios(s.org.id)]);

  return (
    <Pantalla titulo="Clientes" subtitulo="Los crean los pedidos; acá se miran y se corrigen sus datos"
      acciones={<><AccionesExcel lista={LISTA_CLIENTES} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo cliente" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo cliente" sinBoton>
        <form action={accionCrearCliente} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          <CamposCliente listas={listas} puedeCc={tienePermiso(s.permisos, "cc_asignar")} />
          <div className="sm:col-span-3 flex justify-end"><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar en todos los datos del cliente" />
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="acceso" valor={acceso} etiqueta="Acceso mayorista">
          <option value="">Con y sin acceso mayorista</option>
          <option value="con">Solicitado o habilitado</option>
          {Object.entries(ACCESOS_MAYORISTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
      </div>
      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_CLIENTES} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={q || tipo || acceso ? "No hay clientes con esa búsqueda." : "Todavía no hay clientes."} />
    </Pantalla>
  );
}
