// Configuración → Empresa: datos generales (nombre de fantasía, logo,
// contacto, dirección) y un resumen de las razones sociales (sus datos
// fiscales se cargan en Configuración → Razones sociales).
// El logo sale en las facturas y en la tienda si la tienda no tiene uno propio.
// La caja abre en vista y se edita con su lápiz (?editar=general).

import Link from "next/link";
import { una } from "@/lib/erp/base";
import { emisoresDe } from "@/lib/arca/facturar";
import { cuitLegible } from "@/lib/cuit";
import { SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, TituloSeccion, editandoFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import SubirImagen from "@/app/config/tienda/SubirImagen";
import { accionGuardarEmpresa } from "./acciones";

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
  const [emp, razones] = await Promise.all([
    una<Empresa>(`select nombre_fantasia, logo, email, telefono, whatsapp, web, direccion, localidad, provincia, codigo_postal
                    from empresa where organizacion_id = $1`, [s.org.id]),
    emisoresDe(s.org.id),
  ]);
  const v = (k: keyof Empresa) => emp?.[k] ?? "";
  const VOLVER = "/config/empresa";
  const general = editandoFicha(sp, "general");
  const CONDICION: Record<string, string> = { responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento" };

  return (
    <Pantalla titulo="Empresa" subtitulo="Los datos de la empresa, el logo y los datos fiscales para facturar" ancho="max-w-4xl">
      <Avisos sp={sp} />

      <TituloSeccion titulo="Datos generales">
        <BotonesFicha editando={general} ver={VOLVER} editar={`${VOLVER}?editar=general`} form="ficha-general" />
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
        <Link href="/config/razones-sociales" className={SUAVE}>Ver razones sociales</Link>
      </TituloSeccion>
      <div className={`${CAJA} text-xs`}>
        {razones.length === 0 ? (
          <p className="text-[#5C6B76]">Todavía no cargaste los datos fiscales. Cargá tu razón social (CUIT, condición de IVA, punto de venta) en{" "}
            <Link href="/config/razones-sociales" className="font-bold underline">Razones sociales</Link>.</p>
        ) : (
          <ul className="grid gap-1">
            {razones.map((r) => (
              <li key={r.id}>
                <span className="font-semibold">{r.nombre ?? r.razon_social}</span>
                {r.es_principal && <span className="text-[#5C6B76]"> (principal)</span>}
                <span className="text-[#5C6B76]"> · CUIT {cuitLegible(r.cuit)} · {CONDICION[r.condicion_iva] ?? r.condicion_iva} · punto de venta {r.punto_venta}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[#5C6B76] mt-2">Los datos fiscales (CUIT, razón social, condición IVA, punto de venta) viven en Razones sociales, uno por cada CUIT con el que operás.</p>
      </div>
    </Pantalla>
  );
}
