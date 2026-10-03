// La carita del asistente: una chica joven de caricatura, sonriente, que
// parpadea (las animaciones están en app/globals.css). Si la organización la
// apagó (Configuración → Asistente), se ve un signo de pregunta.

export default function Carita({ tamano = 48, carita = true, mecer = false }: { tamano?: number; carita?: boolean; mecer?: boolean }) {
  if (!carita) {
    return (
      <span style={{ width: tamano, height: tamano, fontSize: tamano * 0.55 }}
        className="inline-flex items-center justify-center rounded-full bg-[#16577F] text-white font-black leading-none">?</span>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={tamano} height={tamano} aria-hidden className={mecer ? "asistente-meceo" : undefined}>
      <circle cx="32" cy="32" r="32" fill="#E8F1F8" />
      {/* pelo de atrás */}
      <path d="M11 36 C8 15 21 6 32 6 C44 6 57 15 53 36 L55 54 C49 58 44 51 44 51 L20 51 C20 51 15 58 9 54 Z" fill="#6B3F2A" />
      {/* cuello y remera */}
      <rect x="27.5" y="44" width="9" height="9" rx="3" fill="#F1C4A3" />
      <path d="M14 64 C16 55 23 51.5 32 51.5 C41 51.5 48 55 50 64 Z" fill="#16577F" />
      <path d="M27 51.8 Q32 56 37 51.8" stroke="#E8F1F8" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* cara */}
      <ellipse cx="32" cy="32" rx="14.5" ry="16" fill="#F8D6BA" />
      {/* orejas con aritos */}
      <ellipse cx="17.6" cy="34" rx="2" ry="3" fill="#F1C4A3" />
      <ellipse cx="46.4" cy="34" rx="2" ry="3" fill="#F1C4A3" />
      <circle cx="17.6" cy="38" r="1.1" fill="#F2B632" />
      <circle cx="46.4" cy="38" r="1.1" fill="#F2B632" />
      {/* flequillo */}
      <path d="M17 31 C16 17 25 12 33 12 C42 12 48.5 18 47.5 29 C43 23 37 20.5 31 21 C27 25.5 22 28.5 17 31 Z" fill="#6B3F2A" />
      {/* cejas */}
      <path d="M22.8 28.6 Q25.8 27 28.8 28.4" stroke="#6B3F2A" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M35.2 28.4 Q38.2 27 41.2 28.6" stroke="#6B3F2A" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* ojos: parpadean */}
      <g className="asistente-ojos">
        <ellipse cx="25.8" cy="33.2" rx="2.3" ry="2.9" fill="#2A2320" />
        <ellipse cx="38.2" cy="33.2" rx="2.3" ry="2.9" fill="#2A2320" />
        <circle cx="26.6" cy="32.2" r="0.85" fill="#fff" />
        <circle cx="39" cy="32.2" r="0.85" fill="#fff" />
      </g>
      {/* pestañas */}
      <path d="M23.2 31 L22.2 30.2 M28.4 31 L29.4 30.2" stroke="#2A2320" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M35.6 31 L34.6 30.2 M40.8 31 L41.8 30.2" stroke="#2A2320" strokeWidth="0.8" strokeLinecap="round" />
      {/* cachetes y sonrisa */}
      <ellipse cx="22.4" cy="38.6" rx="2.7" ry="1.6" fill="#F3A1A1" opacity="0.7" />
      <ellipse cx="41.6" cy="38.6" rx="2.7" ry="1.6" fill="#F3A1A1" opacity="0.7" />
      <path d="M27 39.6 Q32 45.4 37 39.6 Q32 42 27 39.6 Z" fill="#C2504A" />
    </svg>
  );
}
