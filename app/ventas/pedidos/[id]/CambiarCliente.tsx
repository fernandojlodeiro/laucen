"use client";

// «Cambiar cliente» en la ficha del pedido (Fer, 25/10; lib/pedidos/cliente.ts):
// el mismo buscador y el mismo alta rápida que «Nuevo pedido». Se abre ahí
// mismo (estado local, la vista no salta) y el «listo» sale en el mismo lugar.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { usarBusqueda, CuadroBusqueda, ClienteNuevo } from "../NuevoPedido";
import { buscarClientesPedido, type ClienteHallado } from "../acciones";
import { accionCambiarCliente } from "./acciones";

export default function CambiarCliente({ pid, facturado, motivo, children }: {
  pid: number; facturado: boolean; motivo: string | null; children: React.ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<ClienteHallado | null>(null);
  const [alta, setAlta] = useState(false);
  const [aviso, setAviso] = useState<{ ok?: string; error?: string } | null>(null);
  const [cambiando, cambiar] = useTransition();
  const b = usarBusqueda<ClienteHallado>((q, c) => buscarClientesPedido(q, c));
  const cerrar = () => { setAbierto(false); setElegido(null); setAlta(false); b.limpiar(); };
  const elegir = (c: ClienteHallado) => { setElegido(c); setAlta(false); b.limpiar(); };
  const confirmar = () => {
    if (!elegido) return;
    setAviso(null);
    cambiar(async () => {
      const r = await accionCambiarCliente(pid, elegido.id);
      setAviso(r);
      if (r.ok || r.error?.startsWith("El cliente ya es")) { cerrar(); router.refresh(); }
    });
  };
  const soloNumeros = /\d/.test(b.texto) && !/[a-z]/i.test(b.texto);

  return (
    <div className={abierto ? "col-span-2 sm:col-span-4" : undefined}>
      <span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Cliente</span>
      <div className="text-xs">{children}</div>
      {!abierto && (
        motivo
          ? <p className="text-[11px] text-[#5C6B76] mt-1">{motivo}</p>
          : <button type="button" className={`${SUAVE} mt-1`} onClick={() => { setAviso(null); setAbierto(true); }}>Cambiar cliente</button>
      )}
      {aviso && (
        <p role={aviso.error ? "alert" : "status"} className={`text-xs rounded-lg px-3 py-2 mt-2 ${aviso.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>
          {aviso.error ?? aviso.ok}
        </p>
      )}
      {abierto && (
        <div className="mt-2 rounded-xl border border-[#C9D3DD] bg-[#FAFBFC] p-3 grid gap-2 text-xs">
          <div className="flex items-center justify-between">
            <b className="text-sm">Cambiar el cliente del pedido</b>
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="h-6 w-6 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
          </div>
          <p className="text-[#5C6B76]">
            {facturado
              ? "Ya tiene factura: al cambiarlo se hace una nota de crédito de la factura actual y una factura nueva a nombre del cliente que elijas."
              : "Todavía no tiene factura: se factura con el cliente que elijas."}
            {" "}El cliente original queda anotado en el pedido.
          </p>
          {elegido ? (
            <div className="grid gap-2">
              <span className="rounded-lg border border-[#E3E9F0] bg-white px-2 py-1.5 w-fit">
                <span className="text-[#5C6B76]">N.º {elegido.id} · </span><b>{elegido.nombre}</b>
                {elegido.documento && <span className="text-[#5C6B76]"> · {elegido.documento}</span>}
                {elegido.email && <span className="text-[#5C6B76]"> · {elegido.email}</span>}
              </span>
              {elegido.faltaFacturar && (
                <p role="alert" className="rounded-lg px-3 py-2 bg-[#FDE7B0] text-[#3D2600] border border-[#C98A00]">
                  <b>Faltan datos para facturar:</b> {elegido.faltaFacturar}.{" "}
                  <a href={`/ventas/clientes/${elegido.id}?editar=ficha`} target="_blank" rel="noreferrer" className="font-semibold text-[#16577F] underline">Completar en la ficha (se abre aparte)</a>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${PRIMARIO} disabled:opacity-60`} disabled={cambiando} onClick={confirmar}>
                  {cambiando ? (facturado ? "Cambiando y refacturando…" : "Cambiando…") : facturado ? "Cambiar y refacturar" : "Cambiar el cliente"}
                </button>
                <button type="button" className={SUAVE} disabled={cambiando} onClick={() => setElegido(null)}>Elegir otro</button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <CuadroBusqueda b={b as ReturnType<typeof usarBusqueda<unknown>>} placeholder="Nombre, documento, CUIT, mail o N.º"
                alEnter={() => b.hallados[0] && elegir(b.hallados[0])} />
              {b.texto.trim().length >= 2 && !b.buscando && (
                <ul className="mt-1 max-w-xl rounded-lg border border-[#C9D3DD] bg-white shadow-sm">
                  {b.hallados.length === 0 && <li className="px-2 py-1.5 text-[#5C6B76]">Ningún cliente coincide.</li>}
                  {b.hallados.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => elegir(c)} className="w-full text-left px-2 py-1.5 hover:bg-[#EEF3F8]">
                        <span className="text-[#5C6B76]">N.º {c.id} · </span><b>{c.nombre}</b>
                        {c.documento && <span className="text-[#5C6B76]"> · {c.documento}</span>}{c.email && <span className="text-[#5C6B76]"> · {c.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!alta && <button type="button" className={`${SUAVE} mt-2`} onClick={() => setAlta(true)}>+ Cliente nuevo</button>}
              {alta && <ClienteNuevo nombreInicial={soloNumeros ? "" : b.texto} documentoInicial={soloNumeros ? b.texto.trim() : ""}
                alCerrar={() => setAlta(false)} alCrear={elegir} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
