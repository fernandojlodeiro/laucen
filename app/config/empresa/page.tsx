// Configuración → Empresa: datos generales (nombre de fantasía, logo,
// contacto, dirección) y, en otra caja, los datos fiscales de quien factura.
// El logo sale en las facturas y en la tienda si la tienda no tiene uno propio.
// Cada caja abre en vista y se edita con su lápiz (?editar=general / fiscal).

import Link from "next/link";
import { una } from "@/lib/erp/base";
import { emisorDe } from "@/lib/arca/facturar";
import { cuitLegible } from "@/lib/cuit";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, TituloSeccion, editandoFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import SubirImagen from "@/app/config/tienda/SubirImagen";
import { accionGuardarEmpresa, accionGuardarFiscal } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };
type Empresa = {
  nombre_fantasia: string | null; logo: string | null; email: string | null; telefono: string | null; whatsapp: string | null; web: string | null;
  direccion: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null;
};

const AYUDA = "block text-[11px] text-[#5C6B76] mt-0.5";

export default async function ConfigEmpresa({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const [emp, e] = await Promise.all([
    una<Empresa>(`select nombre_fantasia, logo, email, telefono, whatsapp, web, direccion, localidad, provincia, codigo_postal
                    from empresa where organizacion_id = $1`, [s.org.id]),
    emisorDe(s.org.id),
  ]);
  const v = (k: keyof Empresa) => emp?.[k] ?? "";
  const VOLVER = "/config/empresa";
  const general = editandoFicha(sp, "general"), fiscal = editandoFicha(sp, "fiscal");
  const CONDICION: Record<string, string> = { responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento" };

  return (
    <Pantalla titulo="Empresa" subtitulo="Los datos de la empresa, el logo y los datos fiscales para facturar" ancho="max-w-4xl">
      <Avisos sp={sp} />

      <TituloSeccion titulo="Datos generales">
        {!fiscal && <BotonesFicha editando={general} ver={VOLVER} editar={`${VOLVER}?editar=general`} form="ficha-general" />}
      </TituloSeccion>
      {!general ? (
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-5`}>
          <Dato etiqueta="Logo" className="sm:row-span-2" ayuda="Sale en las facturas y en la tienda web (si la tienda no tiene uno propio).">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {emp?.logo ? <img src={emp.logo} alt="Logo" className="h-20 object-contain" /> : null}
          </Dato>
          <Dato etiqueta="Nombre de fantasía" className="sm:col-span-2">{v("nombre_fantasia") || null}</Dato>
          <Dato etiqueta="Mail">{v("email")}</Dato>
          <Dato etiqueta="Teléfono">{v("telefono")}</Dato>
          <Dato etiqueta="WhatsApp">{v("whatsapp")}</Dato>
          <Dato etiqueta="Web">{v("web")}</Dato>
          <Dato etiqueta="Dirección">{v("direccion")}</Dato>
          <Dato etiqueta="Localidad">{v("localidad")}</Dato>
          <Dato etiqueta="Provincia">{v("provincia")}</Dato>
          <Dato etiqueta="Código postal">{v("codigo_postal")}</Dato>
        </div>
      ) : (
      <form id="ficha-general" action={accionGuardarEmpresa} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-5`}>
        <div className="sm:row-span-2"><span className={ETIQUETA}>Logo</span>
          <SubirImagen name="logo" valor={emp?.logo ?? null} organizacionId={s.org.id} etiqueta="Logo" alto="h-20" />
          <span className={AYUDA}>Sale en las facturas y en la tienda web (si la tienda no tiene uno propio). Mejor PNG o JPG.</span></div>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Nombre de fantasía</span>
          <input name="nombre_fantasia" autoFocus defaultValue={v("nombre_fantasia")} placeholder={s.org.nombre ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Mail</span>
          <input name="email" type="email" defaultValue={v("email")} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Teléfono</span>
          <input name="telefono" defaultValue={v("telefono")} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>WhatsApp</span>
          <input name="whatsapp" defaultValue={v("whatsapp")} inputMode="numeric" placeholder="5493511234567" className={`${CAMPO} w-full`} />
          <span className={AYUDA}>Formato internacional, sin + ni espacios.</span></label>
        <label><span className={ETIQUETA}>Web</span>
          <input name="web" defaultValue={v("web")} placeholder="laucen.com.ar" className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Dirección</span>
          <input name="direccion" defaultValue={v("direccion")} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Localidad</span>
          <input name="localidad" defaultValue={v("localidad")} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Provincia</span>
          <input name="provincia" defaultValue={v("provincia")} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Código postal</span>
          <input name="codigo_postal" defaultValue={v("codigo_postal")} className={`${CAMPO} w-full`} /></label>
      </form>
      )}

      <TituloSeccion titulo="Datos fiscales">
        {!general && <BotonesFicha editando={fiscal} ver={VOLVER} editar={`${VOLVER}?editar=fiscal`} form="ficha-fiscal" />}
      </TituloSeccion>
      {!fiscal ? (
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
          <Dato etiqueta="CUIT">{cuitLegible(e?.cuit) || null}</Dato>
          <Dato etiqueta="Razón social" className="sm:col-span-2" ayuda="Como figura en ARCA.">{e?.razon_social}</Dato>
          <Dato etiqueta="Condición IVA" ayuda="Responsable inscripto factura A y B; los demás, C.">{e?.condicion_iva ? CONDICION[e.condicion_iva] ?? e.condicion_iva : null}</Dato>
          <Dato etiqueta="Domicilio comercial" className="sm:col-span-2" ayuda="El que sale en las facturas.">{e?.domicilio}</Dato>
          <Dato etiqueta="Ingresos Brutos">{e?.iibb}</Dato>
          <Dato etiqueta="Inicio de actividades">{e?.inicio_actividades ? String(e.inicio_actividades).split("-").reverse().join("/") : null}</Dato>
          <Dato etiqueta="Punto de venta" numero>{e?.punto_venta != null ? String(e.punto_venta) : null}</Dato>
          <div className="sm:col-span-3">
            <Link href="/config/arca" className="text-xs text-[#16577F] hover:underline">Conectar con ARCA para facturar →</Link>
          </div>
        </div>
      ) : (
      <form id="ficha-fiscal" action={accionGuardarFiscal} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
        <label><span className={ETIQUETA}>CUIT</span>
          <input name="cuit" autoFocus defaultValue={cuitLegible(e?.cuit)} maxLength={13} inputMode="numeric" placeholder="30-71234567-8" className={`${CAMPO} w-full`} />
          <span className={AYUDA}>Con guiones o sin.</span></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Razón social</span>
          <input name="razon_social" defaultValue={e?.razon_social ?? ""} className={`${CAMPO} w-full`} />
          <span className={AYUDA}>Como figura en ARCA.</span></label>
        <label><span className={ETIQUETA}>Condición IVA</span>
          <select name="condicion_iva" defaultValue={e?.condicion_iva ?? "responsable_inscripto"} className={`${CAMPO} w-full`}>
            <option value="responsable_inscripto">Responsable inscripto</option>
            <option value="monotributo">Monotributo</option>
            <option value="exento">Exento</option>
          </select>
          <span className={AYUDA}>Responsable inscripto factura A y B; los demás, C.</span></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Domicilio comercial</span>
          <input name="domicilio" defaultValue={e?.domicilio ?? ""} className={`${CAMPO} w-full`} />
          <span className={AYUDA}>El que sale en las facturas.</span></label>
        <label><span className={ETIQUETA}>Ingresos Brutos</span>
          <input name="iibb" defaultValue={e?.iibb ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Inicio de actividades</span>
          <input type="date" name="inicio_actividades" defaultValue={e?.inicio_actividades ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Punto de venta</span>
          <CampoNumero name="punto_venta" valor={e?.punto_venta ?? 1} tipo="entero" className={`${CAMPO} w-full`} />
          <span className={AYUDA}>Habilitado en ARCA para &quot;Factura electrónica – Web services&quot;.</span></label>
      </form>
      )}
    </Pantalla>
  );
}
