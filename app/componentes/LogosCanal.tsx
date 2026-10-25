// Los logos de los canales de mensajes (Fer, 25/10): en la bandeja, el botoncito de cada canal es su logo, para que
// entren todos sin correr la fila hacia el costado. Dibujos simples con los colores de cada marca.

export function LogoWhatsapp({ clase = "h-4 w-4" }: { clase?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path fill="#fff" transform="translate(4.2 4.2) scale(0.65)" d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.8L0 24l6.3-1.7a11.8 11.8 0 0 0 5.7 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.3z" />
    </svg>
  );
}

export function LogoInstagram({ clase = "h-4 w-4" }: { clase?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} aria-hidden>
      <defs>
        <linearGradient id="lc-ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" />
          <stop offset=".6" stopColor="#D62976" /><stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill="url(#lc-ig)" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16" cy="8" r="1" fill="#fff" />
    </svg>
  );
}

export function LogoMercadoLibre({ clase = "h-4 w-4" }: { clase?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} aria-hidden>
      <ellipse cx="12" cy="12" rx="12" ry="12" fill="#FFE600" />
      <ellipse cx="12" cy="12" rx="9" ry="6.2" fill="none" stroke="#2D3277" strokeWidth="1.4" />
      <path d="M5.5 11.6l2.6-1.6 2.4 1 2.2-1.4 2.6.4 3.2 1.6M8.6 13.4l1.6 1.4 1.4-.4 1.2 1 1.4-.6 1.2.6" fill="none" stroke="#2D3277" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** El logo de cada canal de la bandeja (lo que no tiene logo, con su dibujito). */
export function LogoOrigen({ origen, clase = "h-4 w-4" }: { origen: string; clase?: string }) {
  if (origen === "whatsapp") return <LogoWhatsapp clase={clase} />;
  if (origen === "instagram") return <LogoInstagram clase={clase} />;
  if (origen === "ml" || origen === "pregunta") return <LogoMercadoLibre clase={clase} />;
  if (origen === "reclamo") return <span aria-hidden className="leading-none">⚠️</span>;
  if (origen === "prueba") return <span aria-hidden className="leading-none">🧪</span>;
  return null;
}
