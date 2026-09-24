// La pantalla que todavía no tiene nada. Portado tal cual de
// src/app/(app)/Vacio.tsx de CadaMes.

import Link from "next/link";
import { PRIMARIO, SUAVE } from "@/app/botones";

export type Salida = {
  href: string;
  texto: string;
  principal?: boolean;
};

export default function Vacio({ emoji, titulo, children, salidas = [] }: {
  emoji: string;
  titulo: string;
  children: React.ReactNode;
  salidas?: Salida[];
}) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="text-sm font-semibold mt-2">{titulo}</div>
      <p className="text-xs text-[#5C6B76] mt-1 max-w-sm mx-auto">{children}</p>
      {salidas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {salidas.map((s) => (
            <Link key={s.href} href={s.href} className={s.principal ? PRIMARIO : SUAVE}>
              {s.texto}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TarjetaVacia(props: Parameters<typeof Vacio>[0]) {
  return (
    <section className="bg-white border border-[#E3E9F0] rounded-2xl">
      <Vacio {...props} />
    </section>
  );
}
