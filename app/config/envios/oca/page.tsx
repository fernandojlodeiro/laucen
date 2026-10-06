// Configuración › Métodos de envío › OCA (Fer, 6/10): la cuenta de OCA ePak
// de la organización. Con esto la tienda cotiza OCA a domicilio y a sucursal,
// el pedido se da de alta en OCA con su etiqueta y el seguimiento corre solo.
// La contraseña de ePak nunca se muestra: sólo si está cargada.
// La ficha abre en vista y se edita con el lápiz (?editar=ficha).

import Link from "next/link";
import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, TituloSeccion, editandoFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { SUAVE } from "@/app/botones";
import { cuitLegible } from "@/lib/cuit";
import { configOca, faltaParaOca, FRANJAS } from "@/lib/oca/envios";
import { PROVINCIAS } from "../comun";
import { accionGuardarOca, accionProbarOca } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/config/envios/oca";
const AYUDA = "block text-[10px] text-[#5C6B76] mt-0.5";

type SP = { editar?: string; ok?: string; error?: string };

export default async function ConfigOca({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const c = await configOca(s.org.id);
  const editando = editandoFicha(sp, "ficha");
  const o = c?.origen;
  const falta = faltaParaOca(c, "alta", "domicilio");

  // Un campo: en vista, su marco; editando, el campo (mismo lugar, mismo tamaño).
  const campo = (nombre: string, etiqueta: string, valor: string | null | undefined, extra: { ayuda?: string; clase?: string; tipo?: string; placeholder?: string } = {}) => editando
    ? <label className={extra.clase}><span className={ETIQUETA}>{etiqueta}</span>
        <input name={nombre} type={extra.tipo ?? "text"} defaultValue={valor ?? ""} placeholder={extra.placeholder} className={`${CAMPO} w-full`} />
        {extra.ayuda && <span className={AYUDA}>{extra.ayuda}</span>}</label>
    : <Dato etiqueta={etiqueta} ayuda={extra.ayuda} className={extra.clase}>{valor || null}</Dato>;
  const numeroCampo = (nombre: string, etiqueta: string, valor: number | null | undefined, ayuda?: string) => editando
    ? <label><span className={ETIQUETA}>{etiqueta}</span><CampoNumero name={nombre} valor={valor ?? null} tipo="entero" className={`${CAMPO} w-full`} />
        {ayuda && <span className={AYUDA}>{ayuda}</span>}</label>
    : <Dato etiqueta={etiqueta} numero ayuda={ayuda}>{valor != null ? valor.toLocaleString("es-AR") : null}</Dato>;

  return (
    <Pantalla titulo="OCA" camino={[{ texto: "OCA" }]} ancho="max-w-5xl"
      subtitulo="Tu cuenta de OCA ePak: con esto la tienda cotiza el envío, el pedido se da de alta en OCA con su etiqueta y el seguimiento se actualiza solo."
      acciones={<>
        {!editando && c && <BotonTarea accion={accionProbarOca} tipo="oca-probar" texto="Probar con OCA" clase={SUAVE} />}
        <BotonesFicha editando={editando} ver={BASE} editar={`${BASE}?editar=ficha`} />
      </>}>
      <Avisos sp={sp} />
      {!editando && falta && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100] border border-[#F2D08A]">{falta} Tocá el lápiz para cargarlo.</p>}
      {!editando && c?.ultimaPrueba && (
        <p className={`text-xs rounded-lg px-3 py-2 mb-3 border ${c.ultimaPrueba.ok ? "bg-[#EEF7F1] text-[#1F6E4A] border-[#BFE3CC]" : "bg-[#FDECEA] text-[#C03420] border-[#F3C6C0]"}`}>
          Última prueba ({new Date(c.ultimaPrueba.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}): {c.ultimaPrueba.texto}
        </p>
      )}

      <form id="ficha" action={accionGuardarOca}>
        <TituloSeccion titulo="Cuenta" />
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4`}>
          {campo("usuario", "Usuario de ePak", c?.usuario, { ayuda: "El mail con el que entrás a ePak." })}
          {editando
            ? <label><span className={ETIQUETA}>Contraseña de ePak</span>
                <input name="clave" type="password" autoComplete="new-password" placeholder={c?.tieneClave ? "Cargada (dejá vacío para no cambiarla)" : ""} className={`${CAMPO} w-full`} />
                <span className={AYUDA}>No se vuelve a mostrar.</span></label>
            : <Dato etiqueta="Contraseña de ePak">{c?.tieneClave ? "Cargada" : null}</Dato>}
          {campo("cuit", "CUIT", c?.cuit ? cuitLegible(c.cuit) : null)}
          {campo("nro_cuenta", "Número de cuenta", c?.nroCuenta, { placeholder: "111757/001", ayuda: "El que te dio OCA, con la barra." })}
          {campo("operativa_domicilio", "Operativa a domicilio", c?.operativaDomicilio, { ayuda: "Número de operativa «puerta a puerta» (o «sucursal a puerta»)." })}
          {campo("operativa_sucursal", "Operativa a sucursal", c?.operativaSucursal, { ayuda: "Número de operativa «puerta a sucursal» (o «sucursal a sucursal»). Vacío = no se ofrece." })}
        </div>

        <TituloSeccion titulo="De dónde sale" />
        <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 items-start mb-4`}>
          {campo("origen_calle", "Calle", o?.calle, { clase: "col-span-2" })}
          {campo("origen_numero", "Número", o?.numero)}
          {campo("origen_cp", "Código postal", o?.cp)}
          {campo("origen_piso", "Piso", o?.piso)}
          {campo("origen_depto", "Depto", o?.depto)}
          {campo("origen_localidad", "Localidad", o?.localidad)}
          {editando
            ? <label><span className={ETIQUETA}>Provincia</span>
                <select name="origen_provincia" defaultValue={o?.provincia ?? ""} className={`${CAMPO} w-full`}>
                  <option value="">Elegí…</option>
                  {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select></label>
            : <Dato etiqueta="Provincia">{o?.provincia || null}</Dato>}
          {campo("origen_contacto", "Contacto", o?.contacto, { ayuda: "Quién entrega los paquetes." })}
          {campo("origen_email", "Mail", o?.email, { tipo: "email" })}
          {campo("origen_telefono", "Teléfono", o?.telefono)}
          {editando
            ? <label><span className={ETIQUETA}>Franja de retiro</span>
                <select name="franja" defaultValue={String(c?.franja ?? 1)} className={`${CAMPO} w-full`}>
                  {FRANJAS.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
                </select></label>
            : <Dato etiqueta="Franja de retiro">{FRANJAS.find(([n]) => n === (c?.franja ?? 1))?.[1]}</Dato>}
          {campo("centro_origen", "Sucursal donde lo dejás", c?.centroOrigen, { clase: "col-span-2",
            ayuda: "Si lo llevás vos a una sucursal de OCA, el número de esa sucursal (centro de imposición). Vacío = OCA lo retira en esta dirección." })}
        </div>

        <TituloSeccion titulo="Caja estándar" />
        <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 items-start mb-2`}>
          {numeroCampo("peso_std_g", "Peso (gramos)", c?.pesoStdG ?? 500)}
          {numeroCampo("caja_largo", "Largo (cm)", c?.caja.largo ?? 20)}
          {numeroCampo("caja_ancho", "Ancho (cm)", c?.caja.ancho ?? 15)}
          {numeroCampo("caja_alto", "Alto (cm)", c?.caja.alto ?? 10)}
        </div>
        <p className="text-[11px] text-[#5C6B76] mb-4">
          Para los productos que no tienen el peso o las medidas cargados en su ficha: cada unidad cuenta como esta caja. Todo el pedido viaja en un solo bulto.
        </p>
      </form>

      <p className="text-[11px] text-[#5C6B76]">
        Después, en <Link href="/config/envios" className="text-[#16577F] underline">Métodos de envío</Link>, creá «OCA a domicilio» y/o «OCA a sucursal» y prendelos.
        «Probar con OCA» cotiza una caja estándar a Córdoba capital (CP 5000) con cada operativa.
      </p>
    </Pantalla>
  );
}
