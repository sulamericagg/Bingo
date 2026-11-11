/* Ícones (SVG, traço) do botão da mão — kit de interação 3D. */
const P = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const IX_ICON: Record<string, string> = {
  grab: P('<path d="M6 11c0-2 1-3 2.5-3S11 9 11 9V7c0-1 .8-2 2-2s2 1 2 2v2c0-1 .8-1.5 1.7-1.5S18.5 8 18.5 9v5c0 4-3 6-6.5 6S6 18 6 15z"/>'),
  hand: P('<path d="M7 12V6.5a1.5 1.5 0 013 0V11m0-5.5v-1a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v6m0-3a1.5 1.5 0 013 0v5c0 4-3 6-6 6h-1c-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.5L7 15"/>'),
  drop: P('<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 21h14"/>'),
  put: P('<path d="M12 3v9M8 8l4 4 4-4"/><path d="M4 15h16l-2 5H6z"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  check: P('<path d="M5 12l5 5 9-10"/>'),
  x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  throw: P('<path d="M5 19c3-8 8-12 14-14"/><path d="M13 5h6v6"/>'),
  knife: P('<path d="M4 20l9-9"/><path d="M13 11l6-7c2 3 1 6-2 9l-2 1z"/>'),
  spray: P('<rect x="5" y="9" width="7" height="12" rx="3"/><path d="M8 9V6h5l3-2"/><path d="M18 8h.01M20 11h.01M18 13h.01"/>'),
  scrub: P('<rect x="4" y="9" width="16" height="9" rx="3"/><path d="M8 9V6h8v3"/><circle cx="18" cy="5" r="1.5"/><circle cx="21" cy="8" r="1"/>'),
  serve: P('<path d="M3 18h18"/><path d="M5 18a7 7 0 0114 0"/><path d="M12 9V7"/>'),
  fire: P('<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 2 1 3 3 3 5 1-1 1-2 1-3 2 2 4 5 4 8 0 3-2 6-6 6z"/>'),
  power: P('<path d="M12 3v8"/><path d="M6.5 7a8 8 0 1011 0"/>'),
  knob: P('<circle cx="12" cy="12" r="8"/><path d="M12 12l4-5"/>'),
  door: P('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M15 11v3"/>'),
  water: P('<path d="M12 3c3 5 6 8 6 11a6 6 0 01-12 0c0-3 3-6 6-11z"/>'),
  bell: P('<path d="M5 17h14l-2-3v-4a5 5 0 00-10 0v4z"/><path d="M10 20h4"/>'),
  trash: P('<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>'),
};
