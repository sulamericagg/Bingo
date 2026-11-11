/* Ícones coloridos do COMEÇO DO ZERO e da abertura (legíveis em 20–96 px, sem texto nem emoji). */
const K = '#3a2410';
const S = (body: string) => `<svg viewBox="0 0 24 24" stroke="${K}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

export const SI = {
  hammer: S('<path d="M13 9l8 8-2.5 2.5-8-8z" fill="#b8875a"/><path d="M4 5l5-3 6 6-3 3-2-1-3 3-3-3 3-3z" fill="#8b9096"/>'),
  sell: S('<path d="M2 15h20l-3 5H5z" fill="#2f8fbf"/><path d="M11 4v11M11 5l7 8h-7z" fill="#f3efe6"/><circle cx="6" cy="9" r="3.2" fill="#ffcf2e"/><path d="M6 7.4v3.2" stroke="#9a6400"/>'),
  tent: S('<path d="M2 20L12 4l10 16z" fill="#d9893a"/><path d="M12 4v16M9 20l3-6 3 6z" fill="#3a2414"/>'),
  barrow: S('<path d="M2 9h13l-2 6H5z" fill="#d23a2a"/><path d="M15 12l6 2M5 15l-2 4" fill="none" stroke-width="1.8"/><circle cx="10" cy="18" r="2.6" fill="#333"/><circle cx="10" cy="18" r="1" fill="#f2b20f"/>'),
  sluice: S('<path d="M2 9l20 6v3L2 12z" fill="#8b9096"/><path d="M5 11.5l1 .3M9 12.7l1 .3M13 13.9l1 .3M17 15.1l1 .3" stroke-width="1.8"/><path d="M3 8c2-1 3 1 5 0s3-1 4 0" fill="none" stroke="#5ab8ff" stroke-width="1.8"/><path d="M5 12v7M19 16v4" stroke-width="1.8"/>'),
  shed: S('<path d="M2 11l10-7 10 7v10H2z" fill="#c9852e"/><path d="M2 11l10-7 10 7" fill="none" stroke-width="2"/><rect x="7" y="13" width="10" height="8" fill="#5a3a20"/><path d="M8 19l1.5-3h5L16 19z" fill="#ffcf2e"/>'),
  plant: S('<rect x="2" y="13" width="20" height="7" fill="#a8a49a"/><path d="M4 13V7h6l3 3v3" fill="#f2b20f"/><circle cx="16" cy="9" r="3.5" fill="#8b9096"/><path d="M13 9h6M16 6v6" stroke-width="1"/><path d="M3 20c2-2 4 0 6-2" fill="none" stroke="#5ab8ff" stroke-width="1.8"/>'),
  garage: S('<path d="M2 10l10-6 10 6v11H2z" fill="#b5462e"/><rect x="5" y="12" width="14" height="9" fill="#e8e0d0"/><path d="M5 14h14M5 16.5h14M5 19h14" stroke-width="1"/>'),
  house: S('<path d="M3 11l9-7 9 7v10H3z" fill="#f3efe6"/><path d="M2 11.5l10-8 10 8" fill="none" stroke="#b5462e" stroke-width="2.4"/><rect x="10" y="14" width="4" height="7" fill="#7a5232"/><rect x="5.5" y="13" width="3" height="3" fill="#8fd2ff"/><rect x="15.5" y="13" width="3" height="3" fill="#8fd2ff"/>'),
  pickup: S('<path d="M2 15v-4h9l2-4h5l3 4h1v4z" fill="#1f8f8a"/><rect x="14" y="8" width="3.5" height="3" fill="#8fd2ff"/><circle cx="7" cy="16.5" r="2.4" fill="#333"/><circle cx="17" cy="16.5" r="2.4" fill="#333"/>'),
  excavator: S('<rect x="2" y="16" width="11" height="4" rx="2" fill="#333"/><rect x="3" y="11" width="9" height="5" fill="#f2b20f"/><rect x="8" y="7" width="4" height="4" fill="#8fd2ff"/><path d="M12 12l5-7 4 4" fill="none" stroke="#f2b20f" stroke-width="2.4"/><path d="M19 9l3 3-1 3h-3z" fill="#c98a08"/>'),
  portal: S('<path d="M3 21V10a9 7 0 0 1 18 0v11z" fill="#8b7a68"/><path d="M7 21v-9a5 4 0 0 1 10 0v9z" fill="#1a120c"/><path d="M8 21l2-5M16 21l-2-5" stroke="#bfc6cf"/>'),
  pan: S('<ellipse cx="12" cy="13" rx="10" ry="5" fill="#8b9096"/><ellipse cx="12" cy="12" rx="7" ry="3" fill="#5ab8ff"/><circle cx="12" cy="12" r="1.3" fill="#ffcf2e"/><circle cx="14.5" cy="11.5" r=".8" fill="#ffcf2e"/>'),
  shovel: S('<path d="M5 19l9-9" stroke-width="2.2"/><path d="M13.5 6.5l4-4 4 4-4 4z" fill="#8b9096"/><path d="M3 21l3.5-1.2-2.3-2.3z" fill="#b8875a"/>'),
  bag: S('<path d="M6 8h12l1.5 12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20z" fill="#5a7a3a"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke-width="1.8"/><rect x="8" y="12" width="8" height="5" rx="1.2" fill="#46602c"/>'),
  letter: S('<path d="M3 6h18v13H3z" fill="#f4e6b8"/><path d="M3 6l9 7 9-7" fill="none"/><circle cx="17" cy="16" r="2.4" fill="#d23a2a"/>'),
  map: S('<path d="M2 5l6-2 8 2 6-2v16l-6 2-8-2-6 2z" fill="#f4e6b8"/><path d="M4 13c3-2 6 2 9 0s4-3 6-2" stroke="#d23a2a" stroke-dasharray="1.5 1.5" fill="none"/><path d="M17 8l2 2M19 8l-2 2" stroke="#d23a2a" stroke-width="1.8"/>'),
  film: S('<rect x="3" y="9" width="18" height="12" rx="1.5" fill="#333"/><path d="M3 9l16-5 1 3.5L4 12z" fill="#f3efe6"/><path d="M7 7.8l2 2.6M11 6.6l2 2.6M15 5.4l2 2.6" stroke-width="1.6"/><path d="M10 13l5 2.5-5 2.5z" fill="#ffcf2e"/>'),
  skip: S('<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z" fill="#fff"/>'),
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2" fill="#bfc6cf"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke-width="2"/>'),
  check: S('<circle cx="12" cy="12" r="10" fill="#3fbf5a"/><path d="M7 12.5l3.5 3.5 6.5-7" stroke="#fff" stroke-width="2.6" fill="none"/>'),
  gold: S('<path d="M2 18l3-6h8l3 6z" fill="#ffcf2e"/><path d="M8 12l2.5-5h7l3 5" fill="#ffe680"/><path d="M13 12l1.5-3" stroke="#c88a00"/>'),
  nugget: S('<path d="M5 14l3-6 6-2 5 4-1 6-7 3z" fill="#ffcf2e"/><path d="M9 10l3 1 2-2" fill="none" stroke="#c88a00"/>'),
  sun: S('<circle cx="12" cy="14" r="5" fill="#ffb84a"/><path d="M2 20h20" stroke-width="2"/><path d="M12 4v3M4.5 8l2 2M19.5 8l-2 2M2 14h3M19 14h3" stroke="#f0a21a" stroke-width="1.8"/>'),
  mountain: S('<path d="M1 20l7-12 4 6 3-4 8 10z" fill="#c4632e"/><path d="M8 8l2 3-2-1-2 1z" fill="#fff"/>'),
  grandpa: S('<circle cx="12" cy="10" r="7" fill="#ffd34a"/><path d="M5 9h14l-2-5H7z" fill="#c87a2a"/><path d="M8 14c2 2 6 2 8 0" fill="#f3efe6"/><circle cx="9.5" cy="10.5" r="1" fill="#222"/><circle cx="14.5" cy="10.5" r="1" fill="#222"/><path d="M7 21c1-3 3-4 5-4s4 1 5 4" fill="#3a6a8a"/>'),
  canoe: S('<path d="M2 13h20c-2 4-5 6-10 6S4 17 2 13z" fill="#8a5a32"/><path d="M16 3l-4 13" stroke-width="1.8"/><path d="M11 15l-1 3 2.6-.6z" fill="#b8875a"/><path d="M1 21c3-1.5 6-1.5 11 0s8 1.5 11 0" fill="none" stroke="#5ab8ff" stroke-width="1.6"/>'),
  light: S('<path d="M12 2a6 6 0 0 1 4 10.5V16H8v-3.5A6 6 0 0 1 12 2z" fill="#ffe680"/><rect x="8.5" y="16" width="7" height="3" fill="#8b9096"/><path d="M10 21h4" stroke-width="1.8"/>'),
  heart: S('<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" fill="#ff5a7a"/>'),
  star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="#ffd23a"/>'),
  coin: S('<circle cx="12" cy="12" r="9" fill="#ffcf2e"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4" fill="none" stroke="#9a6400"/>'),
};
export type SIcon = keyof typeof SI;
