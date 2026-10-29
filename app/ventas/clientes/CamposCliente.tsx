// Los campos de un cliente, iguales en el alta ("Nuevo cliente") y en la edición de la ficha
// (Fer, 22/10): la razón social primero (es el nombre de la factura), el contacto aparte y los
// datos fiscales juntos. La vista de la ficha (app/ventas/clientes/[id]/page.tsx) usa el mismo orden.

import { cuitLegible } from "@/lib/cuit";
import { telefonoLegible } from "@/lib/telefono";
import { CAMPO, ETIQUETA } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { TIPOS_CLIENTE, CONDICIONES_IVA, ACCESOS_MAYORISTA } from "@/app/ventas/formato";

export type DatosCliente = {
  nombre: string; razon_social: string | null; tipo: string; apellido: string | null; nombre_pila: string | null; apodo_ml: string | null;
  cuit: string | null; documento_tipo: string | null; documento_numero: string | null; condicion_iva: string | null;
  email: string | null; telefono: string | null; telefono_aclaracion: string | null; whatsapp: string | null;
  factura_por_whatsapp: boolean; factura_por_mail: boolean; lista_precios_id: number | null; notas: string | null;
  cuenta_corriente: boolean; limite_cc: string | null; acceso_mayorista: string | null;
};

export const AYUDA_LISTA = "Por defecto: la del canal por donde entra cada pedido (tienda web, Mercado Libre, mostrador…) y, si el canal no tiene, la lista por defecto. Para mayoristas, elegí su lista.";

const AYUDA = "block text-[10px] text-[#5C6B76] mt-0.5";

export default function CamposCliente({ c, listas, puedeCc }: {
  c?: DatosCliente; listas: { id: number; nombre: string; estado: string }[]; puedeCc: boolean;
}) {
  return (
    <>
      <label className="sm:col-span-2"><span className={ETIQUETA}>Razón social (sale en la factura)</span>
        <input name="razon_social" required defaultValue={c ? c.razon_social ?? c.nombre : ""} className={`${CAMPO} w-full`} autoFocus /></label>
      <label><span className={ETIQUETA}>Tipo</span>
        <select name="tipo" defaultValue={c?.tipo ?? "consumidor_final"} className={`${CAMPO} w-full`}>
          {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Acceso mayorista</span>
        <select name="acceso_mayorista" defaultValue={c?.acceso_mayorista ?? ""} className={`${CAMPO} w-full`}>
          <option value="">Sin acceso</option>
          {Object.entries(ACCESOS_MAYORISTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className={AYUDA}>A la sección mayorista de la tienda: «Solicitado» lo pidió; «Habilitado» puede entrar.</span></label>

      <label><span className={ETIQUETA}>Apellido del contacto</span>
        <input name="apellido" defaultValue={c?.apellido ?? ""} placeholder="Opcional" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Nombre del contacto</span>
        <input name="nombre_pila" defaultValue={c?.nombre_pila ?? ""} placeholder="Opcional" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Apodo en Mercado Libre</span>
        <input name="apodo_ml" defaultValue={c?.apodo_ml ?? ""} className={`${CAMPO} w-full`} /></label>

      <label><span className={ETIQUETA}>CUIT / CUIL</span>
        <input name="cuit" defaultValue={cuitLegible(c?.cuit)} placeholder="20-12345678-9" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>DNI{c?.documento_numero && c.documento_tipo && c.documento_tipo !== "DNI" ? ` (cargado como ${c.documento_tipo})` : ""}</span>
        <input name="documento_numero" defaultValue={c?.documento_numero ?? ""} placeholder="12345678" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Condición IVA</span>
        <select name="condicion_iva" defaultValue={c?.condicion_iva ?? ""} required className={`${CAMPO} w-full`}>
          <option value="" disabled>Elegí la condición…</option>
          {Object.entries(CONDICIONES_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>

      <label><span className={ETIQUETA}>Mail</span>
        <input name="email" type="email" defaultValue={c?.email ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Teléfono</span>
        <input name="telefono" defaultValue={telefonoLegible(c?.telefono)} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Interno / aclaración</span>
        <input name="telefono_aclaracion" defaultValue={c?.telefono_aclaracion ?? ""} placeholder="Ej. INT 32" className={`${CAMPO} w-full`} /></label>

      <label><span className={ETIQUETA}>WhatsApp</span>
        <input name="whatsapp" defaultValue={c?.whatsapp ? telefonoLegible(c.whatsapp) : ""} inputMode="tel" placeholder="351 555-1234" className={`${CAMPO} w-full`} />
        <span className={AYUDA}>Con la característica, sin 0 ni 15. Si el cliente nos escribe por WhatsApp, se carga solo.</span></label>
      <div className="sm:col-span-2 grid gap-1 self-start pt-5 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" name="factura_por_whatsapp" defaultChecked={c?.factura_por_whatsapp ?? true} className="h-4 w-4" /> Enviarle la factura por WhatsApp</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="factura_por_mail" defaultChecked={c?.factura_por_mail ?? true} className="h-4 w-4" /> Enviarle la factura por mail</label>
      </div>

      <label><span className={ETIQUETA}>Lista de precios</span>
        <select name="lista_precios_id" defaultValue={c?.lista_precios_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">Por defecto</option>
          {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.estado === "archivada" ? " (archivada)" : ""}</option>)}
        </select>
        <span className={AYUDA}>{AYUDA_LISTA}</span></label>
      <label className="sm:col-span-2"><span className={ETIQUETA}>Notas</span>
        <textarea name="notas" defaultValue={c?.notas ?? ""} rows={2} className={`${CAMPO} w-full`} /></label>

      {puedeCc ? (
        <>
          <input type="hidden" name="con_cc" value="1" />
          <label className="sm:col-span-2 flex items-center gap-1.5 text-xs self-end pb-1.5">
            <input type="checkbox" name="cuenta_corriente" defaultChecked={c?.cuenta_corriente ?? false} className="h-4 w-4" />
            Puede comprar en cuenta corriente / a convenir
            <span className="text-[11px] text-[#5C6B76]">(en la tienda web le aparece el medio &quot;Cuenta corriente&quot;, si está prendido en Medios de pago)</span>
          </label>
          <label><span className={ETIQUETA}>Límite de crédito ($)</span>
            <CampoNumero name="limite_cc" valor={c?.limite_cc == null ? null : Number(c.limite_cc)} tipo="pesos" className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Vacío = sin límite cargado: sus pedidos a cuenta no se preparan.</span></label>
        </>
      ) : (
        <p className="sm:col-span-3 text-[11px] text-[#5C6B76]">La cuenta corriente y el límite de crédito los cambia quien tiene el permiso «Asignar cuenta corriente y límite».</p>
      )}
    </>
  );
}
