"use client";

// Mientras la importación anda en segundo plano, la pantalla se actualiza sola.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Refrescar({ cada = 10_000 }: { cada?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), cada);
    return () => clearInterval(t);
  }, [cada, router]);
  return null;
}
