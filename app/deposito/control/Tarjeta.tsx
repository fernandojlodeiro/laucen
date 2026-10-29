"use client";
// La tarjeta del control de stock (page.tsx): la foto grande, el SKU, el título y la ubicación, y los tres botones.
// Con más de una unidad, «¿Cuántas ves?» viene con lo del sistema y se corrige si hay menos o más. Al tocar, el
// resultado queda en un cartel abajo y la pantalla trae la tarjeta siguiente.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ANCHO_NUMERO } from "@/lib/numeros";
import type { Tarjeta as Datos } from "@/lib/deposito/control";
import { accionRegistrar, accionSaltar, type Respuesta } from "./acciones";

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

export default function Tarjeta({ t, vacio }: { t: Datos | null; vacio: string }) {
  const [aviso, setAviso] = useState<Respuesta | null>(null);
  return (
    <>
      {t ? <Ficha key={`${t.variacion_id}-${t.ubicacion_id}-${t.cantidad}`} t={t} avisar={setAviso} />
        : <p className="bg-white border border-[#E3E9F0] rounded-2xl p-4 text-base text-[#5C6B76]">{vacio}</p>}
      {aviso && (
        <div role="status" className={`fixed inset-x-3 bottom-20 md:bottom-12 z-50 mx-auto max-w-xl rounded-xl px-4 py-3 text-sm shadow-lg flex items-start justify-between gap-3 ${aviso.ok ? "bg-[#E8F5EE] text-[#0F5A40] border border-[#BFE3D0]" : "bg-[#FDECEA] text-[#8A2416] border border-[#F2C2BB]"}`}>
          <span>
            {aviso.texto}
            {aviso.pedidos?.length ? (
              <span className="block mt-1">
                {aviso.pedidos.map((p) => (
                  <Link key={p.id} href={`/ventas/pedidos/${p.id}`} className="mr-2 font-bold underline">pedido {p.id} ({p.cantidad})</Link>
                ))}
              </span>
            ) : null}
          </span>
          <button type="button" onClick={() => setAviso(null)} className="rounded-lg border border-current/30 px-2 py-0.5 text-xs font-bold">Cerrar</button>
        </div>
      )}
    </>
  );
}

/** Una tarjeta: se arma de nuevo (con la cantidad del sistema) cada vez que cambia el producto o la ubicación. */
function Ficha({ t, avisar }: { t: Datos; avisar: (r: Respuesta) => void }) {
  const router = useRouter();
  const [contado, setContado] = useState(t.cantidad);
  const [trabajando, empezar] = useTransition();
  const [foto, setFoto] = useState(0);
  const varias = t.cantidad > 1;
  const fotos = t.fotos ?? [];
  const setAviso = avisar;

  const tocar = (boton: "ok" | "faltante" | "a_buscar") => empezar(async () => {
    const r = await accionRegistrar({ boton, variacionId: t.variacion_id, ubicacionId: t.ubicacion_id, sistema: t.cantidad, contado });
    setAviso(r);
    router.refresh();
  });
  const saltear = () => empezar(async () => {
    setAviso(await accionSaltar(t.variacion_id, t.ubicacion_id));
    router.refresh();
  });

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#E3E9F0] rounded-2xl overflow-hidden">
        <div className="bg-[#F7F9FB] flex items-center justify-center aspect-square max-h-[55vh] w-full">
          {fotos.length
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={fotos[foto] ?? fotos[0]} alt={t.titulo} className="max-h-full max-w-full object-contain" />
            : <span className="text-sm text-[#5C6B76]">Sin foto</span>}
        </div>
        {fotos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2">
            {fotos.map((f, i) => (
              <button key={i} type="button" onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`}
                className={`shrink-0 rounded-md border-2 overflow-hidden p-0 ${i === foto ? "border-[#16577F]" : "border-[#E3E9F0]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt="" loading="lazy" className="h-12 w-12 object-cover block" />
              </button>
            ))}
          </div>
        )}
        <div className="p-3 space-y-1">
          <p className="text-xs uppercase tracking-wide text-[#5C6B76]">Ubicación · {t.deposito}</p>
          <p className="text-3xl font-black text-[#16577F] leading-tight break-words">{t.codigo}</p>
          <p className="text-lg font-bold">
            <Link href={`/catalogo/productos/${t.producto_id}`} className="hover:underline">{t.sku}</Link>
          </p>
          <p className="text-sm text-[#2A3640]">{t.titulo}</p>
          <p className="text-sm">
            El sistema dice <b className="tabular-nums">{t.cantidad}</b> {t.cantidad === 1 ? "unidad" : "unidades"} acá
            {t.total !== t.cantidad && <> (y {t.total - t.cantidad} en otras ubicaciones)</>}
            {t.precio != null && <span className="text-[#5C6B76]"> · {pesos(t.precio)} c/u</span>}
          </p>
          <p className="flex flex-wrap gap-1.5 pt-1">
            {t.por_ingreso && <span className="rounded-full bg-[#FFE7B3] text-[#6B4A00] text-xs font-bold px-2 py-0.5">Ingresó mercadería el {t.ingreso}</span>}
            {t.reservado > 0 && <span className="rounded-full bg-[#FDECEA] text-[#8A2416] text-xs font-bold px-2 py-0.5">{t.reservado} vendida{t.reservado > 1 ? "s" : ""} sin despachar</span>}
            <span className="rounded-full bg-[#EEF3F8] text-[#5C6B76] text-xs px-2 py-0.5">{t.ultimo ? `Último control: ${t.ultimo}` : "Nunca se controló"}</span>
          </p>
        </div>
      </div>

      {varias && (
        <div className="bg-white border border-[#E3E9F0] rounded-2xl p-3 flex items-center justify-between gap-3">
          <span className="text-base font-bold">¿Cuántas ves?</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setContado((n) => Math.max(0, n - 1))} aria-label="Una menos"
              className="h-12 w-12 rounded-xl border-2 border-[#E3E9F0] bg-white text-2xl font-bold">−</button>
            <input value={contado} inputMode="numeric" aria-label="Cuántas ves"
              onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setContado(Number.isFinite(n) ? n : 0); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              className={`h-12 w-20 ${ANCHO_NUMERO} rounded-xl border-2 border-[#E3E9F0] px-2 text-2xl font-bold text-right tabular-nums`} />
            <button type="button" onClick={() => setContado((n) => n + 1)} aria-label="Una más"
              className="h-12 w-12 rounded-xl border-2 border-[#E3E9F0] bg-white text-2xl font-bold">+</button>
          </span>
        </div>
      )}
      {varias && <p className="text-xs text-[#5C6B76] -mt-1">Si faltan algunas, poné cuántas ves antes de tocar «No está» o «A buscar». Sin cambiarla, quiere decir que no está ninguna.</p>}

      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={trabajando} onClick={() => tocar("ok")}
          className="rounded-2xl bg-[#167655] text-white py-5 flex flex-col items-center gap-1 disabled:opacity-50 active:brightness-90">
          <span className="text-4xl leading-none" aria-hidden>✓</span><span className="text-base font-bold">Está</span>
        </button>
        <button type="button" disabled={trabajando} onClick={() => tocar("faltante")}
          className="rounded-2xl bg-[#C03420] text-white py-5 flex flex-col items-center gap-1 disabled:opacity-50 active:brightness-90">
          <span className="text-4xl leading-none" aria-hidden>✗</span><span className="text-base font-bold">No está</span>
        </button>
        <button type="button" disabled={trabajando} onClick={() => tocar("a_buscar")}
          className="rounded-2xl bg-[#B7791F] text-white py-5 flex flex-col items-center gap-1 disabled:opacity-50 active:brightness-90">
          <span className="text-4xl leading-none" aria-hidden>?</span><span className="text-base font-bold">A buscar</span>
        </button>
      </div>
      <div className="flex justify-end">
        <button type="button" disabled={trabajando} onClick={saltear}
          className="rounded-lg border border-[#E3E9F0] bg-white px-3 py-2 text-sm text-[#16577F] disabled:opacity-50">Saltar este por ahora</button>
      </div>
      {trabajando && <p className="text-sm text-[#5C6B76]">Trabajando…</p>}

    </div>
  );
}
