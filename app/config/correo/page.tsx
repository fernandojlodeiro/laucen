// Configuración › Correo: la cuenta de Google Workspace que manda los mails a los
// clientes (lib/correo/mailer.ts), su contraseña de aplicación (nunca se muestra),
// a dónde van las respuestas, los remitentes de cada marca, una prueba y el registro
// de lo que salió. Ficha: abre en vista, se edita con el lápiz.

import { consulta } from "@/lib/erp/base";
import { configCorreo, correoListo, motivoLegible } from "@/lib/correo/mailer";
import { tiendaParaPedido } from "@/lib/correo/mails";
import { nombreTienda } from "@/lib/tienda/tienda";
import { conMarca } from "@/lib/tienda/dominios-tienda";
import { PRIMARIO } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, BotonesFicha, TituloSeccion, editandoFicha, Dato, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { Interruptor } from "@/app/radar/Piezas";
import { BotonEnviar } from "@/app/radar/Cliente";
import { accionActivarCorreo, accionGuardarCorreo, accionProbarCorreo } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };
const BASE = "/config/correo";

const TIPOS: Record<string, string> = {
  pedido_recibido: "Pedido recibido", pedido_pagado: "Pago confirmado", pedido_despachado: "Pedido en camino", pedido_listo_retirar: "Listo para retirar",
  bienvenida: "Bienvenida", factura: "Factura", prueba: "Prueba",
};

export default async function Correo({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const editando = editandoFicha(sp);
  const c = await configCorreo(s.org.id);

  // Los remitentes: la tienda principal y cada dominio de otra marca.
  const t = await tiendaParaPedido(s.org.id, null);
  const marcas = t ? await consulta<{ dominio: string }>(
    "select dominio from tienda_dominio where canal_id = $1 and marca ->> 'nombre' is not null order by dominio", [t.canalId]) : [];
  const remitentes = t ? [
    { marca: nombreTienda(t), dominio: null as string | null, email: t.config.email ?? null },
    ...await Promise.all(marcas.map(async (m) => { const x = await conMarca(t, m.dominio); return { marca: nombreTienda(x), dominio: m.dominio, email: x.config.email ?? null }; })),
  ] : [];
  const registro = await consulta<{ fecha: string; tipo: string; para: string; remitente: string | null; asunto: string; salio: boolean; motivo: string | null }>(`
    select to_char(creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') fecha, tipo, para, remitente, asunto, salio, motivo
      from correo_enviado where organizacion_id = $1 order by id desc limit 50`, [s.org.id]);

  return (
    <Pantalla titulo="Correo" subtitulo="Los mails que Laucen les manda a los clientes: facturas, pedidos y bienvenida" ancho="max-w-4xl"
      acciones={<BotonesFicha editando={editando} ver={BASE} editar={`${BASE}?editar=ficha`} />}>
      <Avisos sp={sp} />

      <div className={`${CAJA} mb-4`}>
        <Interruptor accion={accionActivarCorreo} prendido={c?.activo ?? true} campos={{}} compacto
          etiqueta={c?.activo === false ? "Apagado: no sale ningún mail a los clientes" : "Prendido: salen los mails a los clientes"} />
        <p className="text-[11px] text-[#5C6B76] mt-1">
          {correoListo(c) ? "La cuenta está cargada." : "Falta cargar la cuenta que manda y su contraseña de aplicación (lápiz de arriba a la derecha): hasta entonces no sale ningún mail."}
        </p>
      </div>

      <section className="mb-6">
        <TituloSeccion titulo="Cuenta que manda" />
        <form id="ficha" action={accionGuardarCorreo} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start text-xs`}>
          {editando ? <>
            <label><span className={ETIQUETA}>Casilla de Google (Workspace)</span>
              <input name="smtp_usuario" type="email" defaultValue={c?.smtp_usuario ?? ""} placeholder="fer@cadames.com.ar" autoFocus className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Contraseña de aplicación</span>
              <input name="smtp_clave" type="password" autoComplete="new-password" placeholder={c?.smtp_clave ? "Cargada (vacío = no se cambia)" : "16 letras"} className={`${CAMPO} w-full font-mono`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">Se crea en la cuenta de Google › Seguridad › Contraseñas de aplicación (hace falta la verificación en dos pasos).</span></label>
            <label><span className={ETIQUETA}>Responder a</span>
              <input name="responder_a" type="email" defaultValue={c?.responder_a ?? ""} placeholder="fer@cadames.com.ar" className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">Cuando el cliente responde un mail, le llega a esta casilla.</span></label>
          </> : <>
            <Dato etiqueta="Casilla de Google (Workspace)">{c?.smtp_usuario}</Dato>
            <Dato etiqueta="Contraseña de aplicación">{c?.smtp_clave ? "Cargada" : null}</Dato>
            <Dato etiqueta="Responder a">{c?.responder_a}</Dato>
          </>}
        </form>
      </section>

      {remitentes.length > 0 && (
        <section className="mb-6">
          <TituloSeccion titulo={`Remitentes (${remitentes.length})`} />
          <p className="text-[11px] text-[#5C6B76] mb-2">Cada cliente recibe los mails desde la marca donde compró. Cada una de estas direcciones tiene que estar en «Enviar como» de la casilla que manda (Gmail › Configuración › Cuentas); si no, Google pone la casilla en su lugar. Se cambian en Configuración › Tienda web: el mail de la tienda y el del lápiz de cada dominio de otra marca.</p>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Marca</th><th className={TH}>Dominio</th><th className={TH}>Sale desde</th></tr></thead>
              <tbody>
                {remitentes.map((r) => (
                  <tr key={r.dominio ?? "principal"} className={TR}>
                    <td className={TD}>{r.marca}</td>
                    <td className={`${TD} font-mono`}>{r.dominio ?? "Principal"}</td>
                    <td className={`${TD} font-mono`}>{r.email ?? <span className="text-[#C03420]">Sin mail: sale desde la casilla</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-6">
        <TituloSeccion titulo="Probar" />
        <form action={accionProbarCorreo} className={`${CAJA} flex flex-wrap items-end gap-2 text-xs`}>
          <label className="w-72"><span className={ETIQUETA}>Mandar un mail de prueba a</span>
            <input name="para" type="email" required defaultValue={c?.responder_a ?? ""} className={`${CAMPO} w-full`} /></label>
          <BotonEnviar clase={PRIMARIO} corriendo="Mandando…">Mandar mail de prueba</BotonEnviar>
        </form>
      </section>

      <section className="mb-6">
        <TituloSeccion titulo={`Últimos mails (${registro.length})`} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Qué</th><th className={TH}>Para</th><th className={TH}>Asunto</th><th className={TH}>Resultado</th></tr></thead>
            <tbody>
              {registro.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Todavía no salió ningún mail.</td></tr>}
              {registro.map((r, i) => (
                <tr key={i} className={TR}>
                  <td className={`${TD} whitespace-nowrap`}>{r.fecha}</td>
                  <td className={TD}>{TIPOS[r.tipo] ?? r.tipo}</td>
                  <td className={`${TD} font-mono`}>{r.para}</td>
                  <td className={TD} title={r.remitente ? `Desde ${r.remitente}` : undefined}>{r.asunto}</td>
                  <td className={TD}>{r.salio ? <span className="text-[#167655] font-semibold">Salió</span> : <span className="text-[#C03420]">{motivoLegible(r.motivo ?? undefined)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Pantalla>
  );
}
