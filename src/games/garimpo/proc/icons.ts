/* ============================================================
 *  GARIMPO BRUTO — beneficiamento: ícones SVG (mesmo estilo de icons.ts: traço branco grosso,
 *  cores fortes; quem ainda não lê entende pelo desenho).
 * ============================================================ */
const S = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const PIC = {
  /** bateia (prato cônico) com pintas de ouro */
  pan: S('<ellipse cx="12" cy="11" rx="10" ry="5" fill="#b9c3cc" stroke="#fff"/><path d="M2 11c1 5 5 8 10 8s9-3 10-8" fill="#7f8a94" stroke="#fff"/><ellipse cx="12" cy="11.5" rx="5" ry="2.2" fill="#4c5964" stroke="none"/><circle cx="11" cy="11.6" r="1.1" fill="#ffcf2e" stroke="none"/><circle cx="13.6" cy="11" r=".8" fill="#ffcf2e" stroke="none"/>'),
  /** peneira: aro de madeira com tela */
  sieve: S('<ellipse cx="12" cy="11" rx="10" ry="6" fill="#a8743f" stroke="#fff"/><ellipse cx="12" cy="11" rx="7.4" ry="4" fill="#3a2a1c" stroke="none"/><path d="M6 9.5h12M5 11h14M6 12.5h12M8.5 7.5v7M12 7v8M15.5 7.5v7" stroke="#c9ccd0" stroke-width="1"/><circle cx="10" cy="10.5" r="1.4" fill="#9a8f84" stroke="none"/><circle cx="14.5" cy="12" r="1.2" fill="#ffcf2e" stroke="none"/>'),
  /** calha (sluice) inclinada com riffles e água */
  sluice: S('<path d="M2 8l20 6v4L2 12z" fill="#9aa4ad" stroke="#fff"/><path d="M5 10.5v3M9 11.7v3M13 12.9v3M17 14.1v3" stroke="#3b4148" stroke-width="1.6"/><path d="M1 6c2-1 3 1 5 0" stroke="#5ab8ff"/><path d="M19 19c1 1 2 1 3 0" stroke="#5ab8ff"/>'),
  /** trommel: cilindro furado girando */
  trommel: S('<rect x="3" y="7" width="18" height="10" rx="5" fill="#9aa4ad" stroke="#fff"/><circle cx="8" cy="10" r="1" fill="#3b4148" stroke="none"/><circle cx="12" cy="12" r="1" fill="#3b4148" stroke="none"/><circle cx="16" cy="10" r="1" fill="#3b4148" stroke="none"/><circle cx="10" cy="14.4" r="1" fill="#3b4148" stroke="none"/><circle cx="15" cy="14.4" r="1" fill="#3b4148" stroke="none"/><path d="M20 4a4 4 0 0 1 2 3M4 20a4 4 0 0 1-2-3"/>'),
  /** mesa vibratória com a linha de ouro */
  shaker: S('<path d="M3 10l18-3v6L3 16z" fill="#e8eef2" stroke="#fff"/><path d="M5 13.2l14-2.6" stroke="#ffcf2e" stroke-width="2"/><path d="M6 16v4M18 13v6"/><path d="M1 6l1.5 1M1 9l1.5-.5M23 5l-1.5 1M23 8l-1.5-.3"/>'),
  /** grelha (grizzly): barras inclinadas e uma pedra rolando */
  grizzly: S('<path d="M3 8l18 6M3 11l18 6M3 14l18 6" stroke-width="2"/><circle cx="9" cy="6" r="2.6" fill="#9a8f84"/>'),
  /** sala do ouro: balança com barra */
  goldroom: S('<path d="M12 4v15M6 19h12"/><path d="M4 8h16"/><path d="M4 8l-2 5h4zM20 8l-2 5h4z" fill="#ffcf2e" stroke="#fff"/><circle cx="12" cy="4" r="1.4" fill="currentColor"/>'),
  /** rejeito: monte cinza com brilho de ouro esquecido */
  tailings: S('<path d="M2 19c3-6 6-10 10-10s7 4 10 10z" fill="#9a9488" stroke="#fff"/><circle cx="14" cy="15" r="1" fill="#ffcf2e" stroke="none"/><path d="M6 6l1 2M11 3v2M16 5l-1 2"/>'),
  /** mão (fazer você mesmo) */
  hand: S('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.5L8 13" fill="#ffd9a8" stroke="#fff"/>'),
  /** automático (engrenagem) */
  auto: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  /** tambor d'água */
  barrel: S('<path d="M6 4h12l1 8-1 8H6l-1-8z" fill="#2f7fbf" stroke="#fff"/><path d="M5.5 9h13M5.5 15h13"/><path d="M9 4c1 2 5 2 6 0" stroke="#9ad8ff"/>'),
  /** frasco de ouro */
  vial: S('<path d="M9 3h6M10 3v4l-3 11a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3L14 7V3"/><path d="M8.2 15h7.6l.9 3a2 2 0 0 1-2 2h-5.4a2 2 0 0 1-2-2z" fill="#ffcf2e" stroke="none"/>'),
  /** inclinar o aparelho */
  tilt: S('<rect x="7" y="3" width="10" height="18" rx="2" transform="rotate(-20 12 12)"/><path d="M3 18c-1-3 0-6 2-8M21 6c1 3 0 6-2 8"/>'),
  /** pular (avançar) */
  skip: S('<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor"/>'),
  ok: S('<circle cx="12" cy="12" r="9" fill="#2fae4f" stroke="#fff"/><path d="M7.5 12.5l3 3 6-6.5"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  /** inclinação da calha (mais / menos) */
  slopeUp: S('<path d="M3 18L21 8"/><path d="M15 6l6 2-2 6"/>'),
  slopeDn: S('<path d="M3 13L21 15"/><path d="M15 19l6-4-6-3" />'),
  /** limpar a calha: tapete enrolando num balde */
  clean: S('<path d="M3 6h11v5H3z" fill="#3c7d43" stroke="#fff"/><circle cx="16" cy="8.5" r="2.5" fill="#3c7d43" stroke="#fff"/><path d="M8 14h10l-1.5 7h-7z" fill="#6b5a48" stroke="#fff"/><circle cx="12" cy="17" r=".9" fill="#ffcf2e" stroke="none"/>'),
  /** mandar para a lavadora */
  toPlant: S('<path d="M3 20V10l5 3V10l5 3V6h4l1 14z" fill="#f2b20f" stroke="#fff"/><path d="M15 3h2"/>'),
  /** pôr (colocar no chão) */
  place: S('<path d="M12 3v11M7 9l5 5 5-5"/><path d="M4 20h16" stroke-width="3"/>'),
  /** devagar (tartaruga) */
  slow: S('<ellipse cx="11" cy="13" rx="7" ry="4.5" fill="#4caf50" stroke="#fff"/><circle cx="19.5" cy="12" r="2" fill="#4caf50" stroke="#fff"/><path d="M6 17l-1 2M15 17l1 2"/>'),
  star: S('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#ffcf2e" stroke="#9a6400" stroke-width="1.4"/>'),
  flame: S('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="#ff8a1e" stroke="#fff"/>'),
};
export type PicKey = keyof typeof PIC;
