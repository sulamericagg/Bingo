/* ============================================================
 *  JANGADA BLOOP — ícones SVG próprios (interface por ícones para
 *  quem ainda não lê). Contorno azul-marinho, cores de praia.
 * ============================================================ */
const K = '#123a5c';
const W = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const W2 = `stroke="${K}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

const P: Record<string, string> = {
  /* ---------- materiais ---------- */
  wood: `<rect x="5" y="14" width="38" height="9" rx="3" fill="#d8955a" ${W}/><rect x="5" y="26" width="38" height="9" rx="3" fill="#c07a40" ${W}/><path d="M11 18h12M17 30h14" stroke="${K}" stroke-width="1.6" opacity=".6"/>`,
  plastic: `<path d="M18 6h12v6l4 5v23a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V17l4-5z" fill="#7fd8ff" ${W}/><rect x="19" y="3" width="10" height="5" rx="2" fill="#ff5c8a" ${W2}/><path d="M18 22h12" stroke="#fff" stroke-width="3" opacity=".7"/>`,
  leaf: `<path d="M8 40C10 22 22 8 42 6c-2 20-14 32-34 34z" fill="#5cc85a" ${W}/><path d="M8 40L34 14M18 30l-2-8M24 24l-1-9M24 24l8 1M18 30l9 1" stroke="${K}" stroke-width="2" fill="none"/>`,
  rope: `<ellipse cx="24" cy="26" rx="16" ry="12" fill="#e8c27a" ${W}/><ellipse cx="24" cy="26" rx="9" ry="6" fill="#f6dca0" ${W2}/><path d="M10 22c4 3 8 3 12 0M26 34c4-3 8-3 12 0M14 32c3-4 4-8 2-12" stroke="${K}" stroke-width="1.6" fill="none"/><path d="M38 30l6 8" ${W}/>`,
  scrap: `<path d="M8 30l10-16 12 2 10 14-8 10H14z" fill="#b8c4d8" ${W}/><circle cx="20" cy="28" r="3" fill="#fff" ${W2}/><path d="M28 22l6 10" stroke="${K}" stroke-width="2"/>`,
  stone: `<path d="M7 36l5-16 12-8 13 6 5 18z" fill="#a8a6b8" ${W}/><path d="M20 22l5 7M30 20l-2 8" stroke="${K}" stroke-width="2"/>`,
  clay: `<path d="M8 34c0-10 7-18 16-18s16 8 16 18z" fill="#e0905e" ${W}/><path d="M14 30c3-2 6-2 9 0M26 26c3-2 6-2 8 1" stroke="${K}" stroke-width="2" fill="none"/>`,
  seaweed: `<path d="M16 42c-6-10 6-14 0-24s4-12 4-12M26 42c-4-8 8-12 2-22s6-10 6-10M34 42c-2-6 6-8 2-14" fill="none" stroke="#2f9a5e" stroke-width="5" stroke-linecap="round"/><path d="M16 42c-6-10 6-14 0-24s4-12 4-12" fill="none" stroke="${K}" stroke-width="1.4"/>`,
  shell: `<path d="M24 40L8 22a16 14 0 0 1 32 0z" fill="#ffc0d6" ${W}/><path d="M24 40l-9-22M24 40V14M24 40l9-22" stroke="${K}" stroke-width="2"/>`,
  seed: `<ellipse cx="24" cy="28" rx="12" ry="10" fill="#c89a4a" ${W}/><path d="M24 18c0-6 4-10 10-10-1 6-4 10-10 10z" fill="#5cc85a" ${W2}/><circle cx="20" cy="27" r="1.6" fill="${K}"/><circle cx="28" cy="31" r="1.6" fill="${K}"/>`,
  /* ---------- comida ---------- */
  fish: `<path d="M6 24c8-10 22-10 30 0-8 10-22 10-30 0z" fill="#8ad0ff" ${W}/><path d="M36 24l8-7v14z" fill="#8ad0ff" ${W}/><circle cx="14" cy="22" r="2.4" fill="${K}"/><path d="M22 18c2 4 2 8 0 12" stroke="${K}" stroke-width="2" fill="none"/>`,
  fishc: `<path d="M6 24c8-10 22-10 30 0-8 10-22 10-30 0z" fill="#ffad5a" ${W}/><path d="M36 24l8-7v14z" fill="#ffad5a" ${W}/><path d="M16 20l4 8M22 18l4 10M28 19l3 8" stroke="#8a3a1a" stroke-width="2.4"/><circle cx="12" cy="22" r="2" fill="${K}"/>`,
  bigfish: `<path d="M3 24c10-14 28-14 36 0-8 14-26 14-36 0z" fill="#6aa8ff" ${W}/><path d="M38 24l8-9v18z" fill="#6aa8ff" ${W}/><circle cx="11" cy="21" r="2.6" fill="${K}"/><path d="M18 30c6 2 12 2 16-2" stroke="#fff" stroke-width="2.4" fill="none"/>`,
  bigfishc: `<path d="M3 24c10-14 28-14 36 0-8 14-26 14-36 0z" fill="#ff9a3a" ${W}/><path d="M38 24l8-9v18z" fill="#ff9a3a" ${W}/><path d="M14 18l4 10M20 16l4 14M27 17l4 12" stroke="#8a3a1a" stroke-width="2.4"/><circle cx="10" cy="21" r="2" fill="${K}"/>`,
  potato: `<path d="M10 28c0-10 8-16 16-15s14 7 12 15-8 12-16 11-12-3-12-11z" fill="#d8b06a" ${W}/><circle cx="18" cy="24" r="1.6" fill="${K}"/><circle cx="28" cy="30" r="1.6" fill="${K}"/><circle cx="26" cy="21" r="1.4" fill="${K}"/>`,
  potatoc: `<path d="M10 28c0-10 8-16 16-15s14 7 12 15-8 12-16 11-12-3-12-11z" fill="#e8963a" ${W}/><path d="M18 22c4 4 10 4 14 0" stroke="#fff3c0" stroke-width="3" fill="none"/><path d="M20 8c-2 3 2 4 0 7M28 6c-2 3 2 4 0 7" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>`,
  coco: `<circle cx="24" cy="26" r="15" fill="#8a5a32" ${W}/><circle cx="19" cy="20" r="2" fill="${K}"/><circle cx="26" cy="19" r="2" fill="${K}"/><circle cx="23" cy="25" r="2" fill="${K}"/><path d="M30 30c2 2 2 5 0 7" stroke="#c8935a" stroke-width="2" fill="none"/>`,
  berry: `<circle cx="17" cy="28" r="8" fill="#ff4f8a" ${W}/><circle cx="31" cy="30" r="8" fill="#ff4f8a" ${W}/><circle cx="24" cy="18" r="7" fill="#ff4f8a" ${W}/><path d="M24 11c2-4 6-5 9-4" fill="none" stroke="#3ec05a" stroke-width="3"/>`,
  water: `<path d="M14 10h20l-3 30a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" fill="#e6f8ff" ${W}/><path d="M15.5 20h17l-2 19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" fill="#4fd8ff"/><path d="M20 26c1 3 1 6 0 9" stroke="#fff" stroke-width="2.4" fill="none"/>`,
  /* ---------- ferramentas ---------- */
  hook: `<path d="M10 40L28 14" stroke="#8a5a32" stroke-width="6" stroke-linecap="round"/><path d="M10 40L28 14" ${W2} fill="none"/><path d="M28 14c2-6 8-8 12-4s2 10-4 10" fill="none" stroke="#c8d0e0" stroke-width="5" stroke-linecap="round"/><path d="M28 14c2-6 8-8 12-4s2 10-4 10" fill="none" ${W2}/><path d="M36 20l-2 4" ${W}/>`,
  hook2: `<path d="M10 40L28 14" stroke="#5a6a8a" stroke-width="6" stroke-linecap="round"/><path d="M28 14c2-6 8-8 12-4s2 10-4 10" fill="none" stroke="#7fe0ff" stroke-width="6" stroke-linecap="round"/><path d="M28 14c2-6 8-8 12-4s2 10-4 10" fill="none" ${W2}/><path d="M36 20l-2 4" ${W}/><path d="M12 38l4-6" stroke="#fff" stroke-width="2"/>`,
  hammer: `<path d="M14 40l16-18" stroke="#a8703a" stroke-width="7" stroke-linecap="round"/><path d="M14 40l16-18" ${W2}/><rect x="22" y="6" width="22" height="12" rx="3" transform="rotate(42 33 12)" fill="#ffb03a" ${W}/>`,
  spear: `<path d="M8 42L34 14" stroke="#c8a070" stroke-width="5" stroke-linecap="round"/><path d="M8 42L34 14" ${W2}/><path d="M30 12l12-6-6 12z" fill="#d8dce8" ${W}/><path d="M26 22l-4-2 2-4" stroke="#ff5c5c" stroke-width="3" fill="none"/>`,
  spear2: `<path d="M8 42L34 14" stroke="#5a6a8a" stroke-width="5" stroke-linecap="round"/><path d="M29 11l15-8-8 15z" fill="#9ae0ff" ${W}/><path d="M26 22l-4-2 2-4" stroke="#ffd34a" stroke-width="3" fill="none"/>`,
  axe: `<path d="M12 42l20-26" stroke="#a8703a" stroke-width="6" stroke-linecap="round"/><path d="M12 42l20-26" ${W2}/><path d="M24 12c6-8 16-6 18 2l-10 8z" fill="#ff7a5a" ${W}/><path d="M30 12l6 6" stroke="#fff" stroke-width="2"/>`,
  rod: `<path d="M8 42L38 8" stroke="#7ad86a" stroke-width="4" stroke-linecap="round"/><path d="M8 42L38 8" ${W2}/><path d="M38 8c4 10 2 22 0 30" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="38" cy="38" r="4" fill="#ff4f6a" ${W2}/><circle cx="13" cy="37" r="4" fill="#ffd34a" ${W2}/>`,
  lantern: `<rect x="14" y="14" width="20" height="24" rx="5" fill="#ffe45c" ${W}/><path d="M18 10h12v4H18zM20 6c0-3 8-3 8 0" fill="#8a94a8" ${W2}/><path d="M24 20c-3 4-3 8 0 10 3-2 3-6 0-10z" fill="#ff8a2a"/><rect x="16" y="38" width="16" height="4" rx="2" fill="#8a94a8" ${W2}/>`,
  /* ---------- peças ---------- */
  found: `<path d="M4 30l20-10 20 10-20 10z" fill="#d8955a" ${W}/><path d="M11 26.5l20 10M17 23.5l20 10" stroke="${K}" stroke-width="1.6" opacity=".7"/><path d="M4 30v4l20 10 20-10v-4" fill="#a8703a" ${W}/>`,
  net: `<path d="M6 12h36v24H6z" fill="rgba(232,194,122,.35)" ${W}/><path d="M6 20h36M6 28h36M15 12v24M24 12v24M33 12v24" stroke="#c8963a" stroke-width="2"/><path d="M6 36h36" ${W}/>`,
  floor: `<path d="M4 18l20-10 20 10-20 10z" fill="#e0a868" ${W}/><path d="M10 22v16M38 22v16M24 28v14" ${W}/>`,
  pillar: `<rect x="18" y="6" width="12" height="36" rx="2" fill="#b87a42" ${W}/><path d="M22 12v24" stroke="${K}" stroke-width="1.6" opacity=".6"/>`,
  wall: `<rect x="6" y="8" width="36" height="32" rx="2" fill="#c8884a" ${W}/><path d="M6 18h36M6 29h36M18 8v10M30 18v11M14 29v11M34 29v11" stroke="${K}" stroke-width="2"/>`,
  rail: `<path d="M8 40V14M24 40V14M40 40V14" ${W}/><path d="M6 20h36M6 30h36" stroke="#d8a060" stroke-width="5"/><path d="M6 20h36M6 30h36" ${W2}/>`,
  stairs: `<path d="M6 42V34h9v-8h9v-8h9v-8h9v32z" fill="#c08048" ${W}/>`,
  chest: `<rect x="6" y="18" width="36" height="22" rx="3" fill="#b0703a" ${W}/><path d="M6 18c0-8 6-10 18-10s18 2 18 10z" fill="#c8884a" ${W}/><rect x="20" y="20" width="8" height="8" rx="2" fill="#ffd34a" ${W2}/>`,
  bed: `<rect x="4" y="22" width="40" height="12" rx="3" fill="#7ac8ff" ${W}/><rect x="6" y="16" width="12" height="8" rx="3" fill="#fff" ${W2}/><path d="M4 34v6M44 34v6" ${W}/><path d="M30 10l4-3-4 6h5" stroke="${K}" stroke-width="2" fill="none"/>`,
  fire: `<path d="M24 6c6 8 12 12 12 22a12 12 0 0 1-24 0c0-6 4-8 4-14 4 2 6 6 6 6s-2-8 2-14z" fill="#ff8a3a" ${W}/><path d="M24 24c3 3 5 5 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" fill="#ffe45c"/><path d="M8 42l32-6M8 36l32 6" stroke="#8a5a32" stroke-width="4" stroke-linecap="round"/>`,
  purifier: `<path d="M12 18h24l-2 22H14z" fill="#b8c4d8" ${W}/><path d="M14 10h20v8H14z" fill="#4fd8ff" ${W2}/><path d="M20 8c-2-3 2-4 0-7M28 8c-2-3 2-4 0-7" stroke="#fff" stroke-width="2" fill="none"/><path d="M18 42c2-3 4-3 6 0s4 3 6 0" stroke="#ff8a3a" stroke-width="3" fill="none"/>`,
  planter: `<path d="M6 26h36l-4 14H10z" fill="#a8703a" ${W}/><path d="M16 26c0-8 4-12 8-14M24 26c0-10 6-14 10-14M30 26c0-6-4-10-8-10" stroke="#3ec05a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M6 26h36" ${W}/>`,
  sail: `<path d="M18 4v40" ${W}/><path d="M20 6c14 6 20 18 20 30H20z" fill="#fff3d6" ${W}/><path d="M24 20c4 0 6 3 6 6" stroke="#ff4fa3" stroke-width="3" fill="none"/>`,
  anchor: `<circle cx="24" cy="9" r="4" fill="none" ${W}/><path d="M24 13v28M15 20h18" ${W}/><path d="M8 28c0 8 8 13 16 13s16-5 16-13" fill="none" ${W}/><path d="M8 28l-2 5M8 28l5 2M40 28l2 5M40 28l-5 2" ${W2}/>`,
  lamp: `<path d="M24 4v6" ${W}/><path d="M14 12h20l-3 20H17z" fill="#ffe45c" ${W}/><path d="M18 32h12v8H18z" fill="#8a94a8" ${W2}/><circle cx="24" cy="22" r="4" fill="#fff"/>`,
  flag: `<path d="M12 4v40" ${W}/><path d="M14 6h26l-6 8 6 8H14z" fill="#ff4fa3" ${W}/><circle cx="24" cy="14" r="3.4" fill="#fff"/><circle cx="25" cy="13.5" r="1.4" fill="${K}"/>`,
  /* ---------- interface ---------- */
  sun: `<path d="M24 3v8M24 37v8M3 24h8M37 24h8M9 9l5 5M34 34l5 5M9 39l5-5M34 14l5-5" stroke="#ffd34a" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="24" r="10" fill="#ffd34a" ${W}/>`,
  moon: `<path d="M30 6a16 16 0 1 0 12 26A14 14 0 0 1 30 6z" fill="#fff3a8" ${W}/><circle cx="18" cy="20" r="2" fill="#e8d870"/><circle cx="22" cy="32" r="3" fill="#e8d870"/>`,
  island: `<path d="M4 38c6-6 34-6 40 0z" fill="#ffe0a0" ${W}/><path d="M24 36c0-10 2-18 4-22" fill="none" stroke="#8a5a32" stroke-width="4" ${W2}/><path d="M28 14c-6-4-14-2-16 4 6-2 10-2 16-4zM28 14c4-6 12-6 14 0-6-2-9-1-14 0zM28 14c2 6-2 12-6 12 2-4 3-8 6-12z" fill="#5cc85a" ${W2}/>`,
  ghost: `<path d="M10 40V20a14 14 0 0 1 28 0v20l-5-4-4 4-5-4-5 4-4-4z" fill="#d8fff4" ${W}/><circle cx="19" cy="21" r="3" fill="${K}"/><circle cx="29" cy="21" r="3" fill="${K}"/><path d="M8 12h32l-6-6H14z" fill="#3a3a5a" ${W2}/>`,
  shark: `<path d="M4 30c10-10 28-12 40-2-10 8-28 10-40 2z" fill="#8a7ae8" ${W}/><path d="M22 22l6-12 4 14z" fill="#8a7ae8" ${W}/><path d="M34 31l2 3 2-3 2 3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="36" cy="27" r="2" fill="${K}"/>`,
  cam: `<rect x="5" y="14" width="38" height="24" rx="6" fill="#fff" ${W}/><circle cx="24" cy="26" r="8" fill="#7fd8ff" ${W}/><rect x="16" y="9" width="14" height="6" rx="2" fill="#fff" ${W2}/>`,
  eye: `<path d="M4 24c8-12 32-12 40 0-8 12-32 12-40 0z" fill="#fff" ${W}/><circle cx="24" cy="24" r="7" fill="#7fd8ff" ${W2}/><circle cx="24" cy="24" r="3" fill="${K}"/>`,
  craft: `<rect x="6" y="6" width="16" height="16" rx="3" fill="#ffd34a" ${W}/><rect x="26" y="6" width="16" height="16" rx="3" fill="#7fd8ff" ${W}/><rect x="6" y="26" width="16" height="16" rx="3" fill="#7ad86a" ${W}/><rect x="26" y="26" width="16" height="16" rx="3" fill="#ff8ab8" ${W}/>`,
  jump: `<path d="M24 6l14 16h-8v18H18V22h-8z" fill="#fff" ${W}/>`,
  dive: `<path d="M24 42L10 26h8V8h12v18h8z" fill="#7fd8ff" ${W}/>`,
  hand: `<path d="M14 26V14a3 3 0 0 1 6 0v8-12a3 3 0 0 1 6 0v12-10a3 3 0 0 1 6 0v12-6a3 3 0 0 1 6 0v12c0 10-6 14-14 14s-12-4-16-12l-4-6a3 3 0 0 1 5-3z" fill="#ffe0c0" ${W}/>`,
  eat: `<path d="M8 20h32a16 16 0 0 1-32 0z" fill="#ffad5a" ${W}/><path d="M16 14c0-4 4-4 4-8M24 14c0-4 4-4 4-8M32 14c0-4 4-4 4-8" stroke="${K}" stroke-width="2" fill="none" opacity=".6"/>`,
  rotate: `<path d="M38 22a14 14 0 1 1-6-10" fill="none" ${W}/><path d="M34 4l-1 10 10 1" fill="none" ${W}/>`,
  trash: `<path d="M12 14h24l-2 28H14z" fill="#ff8a8a" ${W}/><path d="M8 14h32M18 14V8h12v6M20 20v16M28 20v16" ${W}/>`,
  fix: `<path d="M14 40l16-18" stroke="#a8703a" stroke-width="7" stroke-linecap="round"/><rect x="22" y="6" width="22" height="12" rx="3" transform="rotate(42 33 12)" fill="#ffb03a" ${W}/><path d="M6 10l4 4M4 18h5M12 4v5" stroke="#3ec05a" stroke-width="3" stroke-linecap="round"/>`,
  build: `<path d="M4 30l20-10 20 10-20 10z" fill="rgba(127,216,255,.5)" stroke="#fff" stroke-width="3" stroke-dasharray="4 3"/><path d="M24 4v14M17 11h14" stroke="#3ec05a" stroke-width="5" stroke-linecap="round"/>`,
  close: `<path d="M12 12l24 24M36 12L12 36" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  pause: `<rect x="12" y="10" width="9" height="28" rx="3" fill="#fff" ${W2}/><rect x="27" y="10" width="9" height="28" rx="3" fill="#fff" ${W2}/>`,
  list: `<rect x="6" y="6" width="36" height="36" rx="6" fill="#fff6d6" ${W}/><path d="M14 16h20M14 24h20M14 32h12" ${W}/>`,
  heart: `<path d="M24 41S6 30 6 18a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 12-18 23-18 23z" fill="#ff4f6a" ${W}/>`,
  food: `<path d="M30 8c6 0 10 6 8 12s-8 8-12 6L14 38a4 4 0 0 1-6-6l12-12c-2-4 0-10 6-12z" fill="#ffad5a" ${W}/><circle cx="10" cy="38" r="4" fill="#fff" ${W2}/>`,
  drop: `<path d="M24 4c8 12 14 20 14 27a14 14 0 0 1-28 0c0-7 6-15 14-27z" fill="#4fd8ff" ${W}/><path d="M18 30c0 4 2 6 5 7" stroke="#fff" stroke-width="3" fill="none"/>`,
  air: `<circle cx="18" cy="28" r="10" fill="#d8f6ff" ${W}/><circle cx="32" cy="16" r="6" fill="#d8f6ff" ${W}/><circle cx="35" cy="34" r="4" fill="#d8f6ff" ${W2}/>`,
  sleep: `<path d="M30 6a16 16 0 1 0 12 26A14 14 0 0 1 30 6z" fill="#b8a8ff" ${W}/><path d="M6 8h8l-8 8h8" stroke="#fff" stroke-width="3" fill="none"/>`,
  up: `<path d="M24 8l12 14H12z" fill="#3ec05a" ${W}/><rect x="18" y="22" width="12" height="16" fill="#3ec05a" ${W}/>`,
  coin: `<circle cx="24" cy="24" r="16" fill="#ffcf2e" ${W}/><circle cx="24" cy="24" r="10" fill="none" stroke="#e98f00" stroke-width="3"/>`,
  star: `<path d="M24 5l5.6 11.5 12.6 1.8-9.1 8.9 2.2 12.6L24 34l-11.3 5.8 2.2-12.6-9.1-8.9 12.6-1.8z" fill="#ffd34a" ${W}/>`,
  storm: `<path d="M12 26a8 8 0 0 1 2-16 10 10 0 0 1 19 2 7 7 0 0 1 1 14z" fill="#8a94b8" ${W}/><path d="M24 26l-5 9h6l-4 9" stroke="#ffd34a" stroke-width="4" fill="none" stroke-linejoin="round"/>`,
  /* ---------- v2: materiais ---------- */
  bamboo: `<path d="M14 44V6M24 44V4M34 44V8" stroke="#a8d860" stroke-width="7" stroke-linecap="round"/><path d="M14 44V6M24 44V4M34 44V8" stroke="${K}" stroke-width="1.6" opacity=".5"/><path d="M10 16h8M10 30h8M20 12h8M20 26h8M30 20h8M30 34h8" stroke="${K}" stroke-width="2.4"/><path d="M34 12c4-4 8-4 10-2-3 1-6 2-10 2z" fill="#5cc85a" ${W2}/>`,
  hardwood: `<rect x="5" y="15" width="38" height="18" rx="4" fill="#8a4a2a" ${W}/><ellipse cx="38" cy="24" rx="5" ry="9" fill="#c87a4a" ${W2}/><path d="M38 18c-2 3-2 9 0 12" stroke="${K}" stroke-width="1.6" fill="none"/><path d="M9 21h20M11 27h16" stroke="#5a2a14" stroke-width="2"/>`,
  iron: `<path d="M6 34l8-18 14-6 14 10-2 16-16 6z" fill="#8a8698" ${W}/><path d="M16 22l6 4M26 16l4 8M30 30l6-2" stroke="#e8885a" stroke-width="4" stroke-linecap="round"/>`,
  ice: `<path d="M24 4l10 12-4 26H18l-4-26z" fill="#bff0ff" ${W}/><path d="M24 4v38M14 16h20" stroke="#fff" stroke-width="2.4"/><path d="M8 26l6-8 2 14zM40 26l-6-8-2 14z" fill="#9ae0ff" ${W2}/>`,
  obsidian: `<path d="M8 30l10-20 16 4 8 18-14 12z" fill="#4a2a7a" ${W}/><path d="M18 10l10 18 14 4M28 28l0 16" stroke="#c89aff" stroke-width="2"/><path d="M14 22l6-6" stroke="#fff" stroke-width="2.4" opacity=".7"/>`,
  gold: `<path d="M6 34l6-12h24l6 12z" fill="#ffcf2e" ${W}/><path d="M14 22l4-10h12l4 10z" fill="#ffe46a" ${W}/><path d="M12 30h8M22 18h6" stroke="#fff" stroke-width="2.4"/>`,
  pearl: `<path d="M4 30c4-10 36-10 40 0-6 8-34 8-40 0z" fill="#a8a0b8" ${W}/><circle cx="24" cy="24" r="9" fill="#f8f4ff" ${W}/><circle cx="21" cy="21" r="3" fill="#fff"/>`,
  fuel: `<path d="M12 10h18l8 8v24a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#ff7a3a" ${W}/><path d="M30 10v8h8" fill="none" ${W2}/><path d="M24 22c4 5 5 8 5 10a5 5 0 0 1-10 0c0-2 1-5 5-10z" fill="#ffe45c" ${W2}/>`,
  tooth: `<path d="M10 8h28c0 12-6 30-14 34C16 38 10 20 10 8z" fill="#fffbe8" ${W}/><path d="M16 14c2 8 4 14 8 20" stroke="#d8d0b8" stroke-width="2.4" fill="none"/>`,
  ink: `<path d="M24 4c8 12 14 20 14 27a14 14 0 0 1-28 0c0-7 6-15 14-27z" fill="#7a4ad8" ${W}/><circle cx="19" cy="30" r="3" fill="#c89aff"/><path d="M30 26c2 2 2 6 0 8" stroke="#fff" stroke-width="2.4" fill="none"/>`,
  /* ---------- v2: comida ---------- */
  banana: `<path d="M8 12c2 18 14 28 32 26-2-4-6-4-8-4C18 32 14 22 14 10z" fill="#ffe04a" ${W}/><path d="M8 12l-2-4 6 1z" fill="#6a4a2a" ${W2}/>`,
  mango: `<path d="M24 10c12 0 18 10 16 20s-12 14-20 12S6 34 8 24s6-14 16-14z" fill="#ffa83a" ${W}/><path d="M12 24c0-6 6-10 12-10" stroke="#ff6a3a" stroke-width="5" fill="none" opacity=".6"/><path d="M24 10c0-4 4-6 8-6-1 4-4 6-8 6z" fill="#5cc85a" ${W2}/>`,
  caju: `<path d="M12 18c0-8 24-8 24 0v8c0 8-6 12-12 12S12 34 12 26z" fill="#ff6a4a" ${W}/><path d="M18 38c-2 6 4 8 8 4 2-2 0-6-4-6z" fill="#b8884a" ${W2}/>`,
  snowberry: `<circle cx="17" cy="28" r="8" fill="#8ab8ff" ${W}/><circle cx="31" cy="30" r="8" fill="#8ab8ff" ${W}/><circle cx="24" cy="18" r="7" fill="#8ab8ff" ${W}/><path d="M20 15l2 2M28 26l2 2M14 25l2 2" stroke="#fff" stroke-width="2"/><path d="M24 11c2-4 6-5 9-4" fill="none" stroke="#3ec05a" stroke-width="3"/>`,
  pepper: `<path d="M14 14c10-2 20 4 24 14s-2 16-6 14S16 30 14 14z" fill="#ff3a2a" ${W}/><path d="M14 14c-2-4 0-8 4-8" stroke="#3ec05a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M22 18c4 2 8 6 10 12" stroke="#fff" stroke-width="2.4" fill="none" opacity=".6"/>`,
  starfruit: `<path d="M24 5l5.6 11.5 12.6 1.8-9.1 8.9 2.2 12.6L24 34l-11.3 5.8 2.2-12.6-9.1-8.9 12.6-1.8z" fill="#ffe86a" ${W}/><path d="M24 12v18M14 20l10 6 10-6" stroke="#e8b830" stroke-width="2" fill="none"/>`,
  /* ---------- v2: ferramentas ---------- */
  spear3: `<path d="M8 42L34 14" stroke="#8a4a2a" stroke-width="5" stroke-linecap="round"/><path d="M8 42L34 14" ${W2}/><path d="M29 11l15-8-8 15z" fill="#5a3a8a" ${W}/><path d="M26 22l-4-2 2-4" stroke="#ff8ad8" stroke-width="3" fill="none"/>`,
  harpoon: `<path d="M6 42L34 14" stroke="#a8d860" stroke-width="5" stroke-linecap="round"/><path d="M6 42L34 14" ${W2}/><path d="M32 8l12-4-4 12z" fill="#c8d0e0" ${W}/><path d="M30 18l-2-6M36 22l-6-2" ${W}/><path d="M10 40c-4 2-6 6-4 6" stroke="#e8c27a" stroke-width="2.4" fill="none"/>`,
  harpoon2: `<path d="M6 42L34 14" stroke="#c8902a" stroke-width="5" stroke-linecap="round"/><path d="M6 42L34 14" ${W2}/><path d="M32 8l12-4-4 12z" fill="#fffbe8" ${W}/><path d="M30 18l-2-6M36 22l-6-2" stroke="#ffcf2e" stroke-width="3"/><circle cx="18" cy="30" r="3" fill="#ff4f8a" ${W2}/>`,
  /* ---------- v2: barcos e mundo ---------- */
  canoe: `<path d="M3 26c8 10 34 10 42 0z" fill="#b8783a" ${W}/><path d="M8 26h32" stroke="#d8a868" stroke-width="3"/><path d="M30 8L20 36" stroke="#c8935a" stroke-width="3"/><path d="M18 34l-2 8 6-2z" fill="#a8703a" ${W2}/>`,
  sailboat: `<path d="M4 32c8 10 32 10 40 0z" fill="#f4f0e8" ${W}/><path d="M24 4v28" ${W}/><path d="M26 6c10 6 14 14 14 22H26z" fill="#fff6e0" ${W}/><path d="M22 10c-8 6-12 12-12 18h12z" fill="#7fd8ff" ${W2}/>`,
  motorboat: `<path d="M4 28c6 12 34 12 38 0z" fill="#ff5c6a" ${W}/><path d="M14 28v-8h14l6 8z" fill="#f4f4f8" ${W2}/><path d="M18 20l2-4h8" stroke="#9ae0ff" stroke-width="3" fill="none"/><rect x="40" y="22" width="6" height="12" rx="2" fill="#3a3a4a" ${W2}/>`,
  map: `<path d="M4 10l12-4 16 6 12-4v30l-12 4-16-6-12 4z" fill="#fff3c8" ${W}/><path d="M16 6v30M32 12v30" stroke="${K}" stroke-width="2"/><path d="M8 26c6-6 10 4 16-2s10 2 14-4" stroke="#ff5c6a" stroke-width="2.4" stroke-dasharray="3 3" fill="none"/><path d="M34 16l4 4M38 16l-4 4" stroke="#ff5c6a" stroke-width="2.6"/>`,
  beacon: `<path d="M18 4h12l6 40H12z" fill="rgba(255,211,74,.55)"/><rect x="12" y="28" width="24" height="14" rx="3" fill="#b0703a" ${W}/><path d="M12 32h24" ${W2}/><rect x="21" y="30" width="6" height="5" fill="#ffd34a" ${W2}/>`,
  chestR: `<rect x="6" y="18" width="36" height="22" rx="3" fill="#5a6a8a" ${W}/><path d="M6 18c0-8 6-10 18-10s18 2 18 10z" fill="#7a8aaa" ${W}/><path d="M14 18v22M34 18v22" stroke="#5ab0ff" stroke-width="3"/><rect x="20" y="20" width="8" height="8" rx="2" fill="#ffd34a" ${W2}/><path d="M40 6l2 4 4 1-4 2-1 4-2-4-4-1 4-2z" fill="#fff"/>`,
  cave: `<path d="M2 42c2-20 10-34 22-34s20 14 22 34z" fill="#8a8698" ${W}/><path d="M14 42c0-12 4-20 10-20s10 8 10 20z" fill="#1a1a2a" ${W2}/><path d="M22 30l2 4 2-4" stroke="#7af0ff" stroke-width="2.4" fill="none"/>`,
  crab: `<ellipse cx="24" cy="28" rx="14" ry="9" fill="#ff6a3a" ${W}/><path d="M10 22c-6-2-6-10 0-12l2 6zM38 22c6-2 6-10 0-12l-2 6z" fill="#ff6a3a" ${W2}/><circle cx="19" cy="18" r="3" fill="#fff" ${W2}/><circle cx="29" cy="18" r="3" fill="#fff" ${W2}/><path d="M12 34l-4 6M18 36l-2 6M36 34l4 6M30 36l2 6" ${W2}/><path d="M18 9h12l-2 4h-8z" fill="#ffd34a" ${W2}/>`,
  monkey: `<circle cx="24" cy="24" r="14" fill="#8a5a32" ${W}/><circle cx="9" cy="22" r="5" fill="#e8c8a0" ${W2}/><circle cx="39" cy="22" r="5" fill="#e8c8a0" ${W2}/><ellipse cx="24" cy="29" rx="9" ry="7" fill="#e8c8a0" ${W2}/><circle cx="19" cy="21" r="2.4" fill="${K}"/><circle cx="29" cy="21" r="2.4" fill="${K}"/><path d="M14 15l8 3M34 15l-8 3" stroke="${K}" stroke-width="2.4"/><path d="M20 32c3 2 5 2 8 0" stroke="${K}" stroke-width="2" fill="none"/>`,
  penguin: `<ellipse cx="24" cy="26" rx="13" ry="17" fill="#1a2030" ${W}/><ellipse cx="24" cy="29" rx="9" ry="12" fill="#fff"/><circle cx="20" cy="18" r="2.4" fill="#fff"/><circle cx="28" cy="18" r="2.4" fill="#fff"/><path d="M21 23l3 4 3-4z" fill="#ffa83a" ${W2}/><path d="M14 8h20l-2 4H16z" fill="#ff4a5a" ${W2}/>`,
  lizard: `<path d="M6 30c6-10 22-12 30-6l8-4-2 8 2 6-8-2c-8 6-24 6-30-2z" fill="#3aa84a" ${W}/><circle cx="34" cy="26" r="2.4" fill="${K}"/><path d="M12 22l2-6 3 5 3-7 3 7 3-5 2 6" fill="#ff7a2a" ${W2}/><path d="M18 34l-2 6M26 34l2 6" ${W2}/>`,
  jungle: `<path d="M4 40c6-6 34-6 40 0z" fill="#f0d89a" ${W}/><path d="M24 38V18" stroke="#6a4a2a" stroke-width="4"/><circle cx="24" cy="14" r="10" fill="#2fa24a" ${W}/><circle cx="14" cy="20" r="6" fill="#3ab04a" ${W2}/><circle cx="34" cy="20" r="6" fill="#249040" ${W2}/><path d="M30 22v8" stroke="#3a8a3a" stroke-width="2"/>`,
  rocky: `<path d="M4 40c6-6 34-6 40 0z" fill="#e0d0b0" ${W}/><path d="M8 38l10-22 8 8 6-12 10 26z" fill="#8a8698" ${W}/><path d="M20 26l4 4M30 20l2 6" stroke="#e8885a" stroke-width="3"/>`,
  mangrove: `<path d="M4 40c6-6 34-6 40 0z" fill="#4ab0a0" ${W}/><path d="M12 38c2-8 6-10 12-10s10 2 12 10M18 38c2-6 4-8 6-8s4 2 6 8" fill="none" stroke="#5a3e2a" stroke-width="3"/><path d="M24 28V16" stroke="#6a4a32" stroke-width="3"/><ellipse cx="24" cy="12" rx="13" ry="7" fill="#3a8a4a" ${W}/>`,
  snowy: `<path d="M4 40c6-6 34-6 40 0z" fill="#e8eef4" ${W}/><path d="M24 6l12 30H12z" fill="#2a7a5a" ${W}/><path d="M24 6l5 12-5-2-5 2z" fill="#fff" ${W2}/><path d="M38 10l1 3M40 18l1 3M8 12l1 3" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  volcano: `<path d="M4 40c6-6 34-6 40 0z" fill="#5a4a4a" ${W}/><path d="M8 38l10-24h12l10 24z" fill="#3a3036" ${W}/><path d="M18 14h12l-2 6-4-2-4 2z" fill="#ff6a2a" ${W2}/><path d="M22 10c-2-4 2-6 0-8M28 10c-2-4 2-6 0-8" stroke="#8a8a8a" stroke-width="2.4" fill="none"/>`,
  legend: `<path d="M4 40c6-6 34-6 40 0z" fill="#fff0c0" ${W}/><path d="M24 36V20" stroke="#e8f4ff" stroke-width="3"/><path d="M24 6l6 10-6 6-6-6z" fill="#7af0ff" ${W}/><path d="M12 22l4 4-2 6zM36 22l-4 4 2 6z" fill="#c89aff" ${W2}/><path d="M38 6l2 4 4 1-4 2-1 4-2-4-4-1 4-2z" fill="#ffd34a"/>`,
  mega: `<path d="M2 26c10-12 32-14 44-4-10 10-32 12-44 4z" fill="#4a5a6c" ${W}/><path d="M22 18l6-14 6 16z" fill="#4a5a6c" ${W}/><path d="M32 28l2 3 2-3 2 3 2-3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="36" cy="22" r="2" fill="#fff"/><path d="M33 19l5 1" ${W2}/>`,
  kraken: `<ellipse cx="24" cy="16" rx="12" ry="12" fill="#8a4ad8" ${W}/><circle cx="19" cy="17" r="3.4" fill="#fffbe0" ${W2}/><circle cx="29" cy="17" r="3.4" fill="#fffbe0" ${W2}/><circle cx="19" cy="18" r="1.6" fill="${K}"/><circle cx="29" cy="18" r="1.6" fill="${K}"/><path d="M12 26c-4 6-6 12-2 16M18 28c-2 6-2 10 2 14M30 28c2 6 2 10-2 14M36 26c4 6 6 12 2 16" stroke="#9a5ae0" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  swipe: `<path d="M8 24h30M30 14l10 10-10 10" fill="none" stroke="#ffd34a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  hold: `<circle cx="24" cy="24" r="16" fill="none" stroke="#ffd34a" stroke-width="5" stroke-dasharray="70 30"/><path d="M18 26V16a3 3 0 0 1 6 0v6-2a3 3 0 0 1 6 0v8c0 6-4 9-8 9s-6-2-8-6l-2-3a2 2 0 0 1 4-2z" fill="#ffe0c0" ${W2}/>`,
  sneak: `<circle cx="28" cy="10" r="5" fill="#ff8fd8" ${W}/><path d="M12 40l6-10 10-4 8 8M18 30l-2-8 10-4" fill="none" ${W}/><path d="M6 44h36" stroke="#fff" stroke-width="3" stroke-dasharray="4 4"/>`,
  wind: `<path d="M6 18h24a6 6 0 1 0-6-6M6 26h32a6 6 0 1 1-6 6M6 34h14" fill="none" stroke="#e8f8ff" stroke-width="4" stroke-linecap="round"/>`,
  exit: `<path d="M8 24h24M24 14l10 10-10 10" fill="none" ${W}/><rect x="34" y="8" width="8" height="32" rx="2" fill="#ffd34a" ${W2}/>`,
  people: `<circle cx="17" cy="18" r="7" fill="#ff8fd8" ${W}/><circle cx="33" cy="20" r="6" fill="#7fd8ff" ${W}/><path d="M5 40c0-8 6-12 12-12s12 4 12 12zM24 40c1-7 5-10 9-10s9 3 9 10z" fill="#fff" ${W2}/>`,
};

/** ícone inline (svg) — tamanho em px */
export function jIcon(name: string, size = 32): string {
  const body = P[name] ?? P.star;
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
export const hasIcon = (name: string) => name in P;

/** desenha o ícone num canvas (texturas 3D: placas, balões) */
const imgCache = new Map<string, HTMLImageElement>();
export function iconImage(name: string): HTMLImageElement {
  let im = imgCache.get(name);
  if (!im) {
    im = new Image();
    im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="96" height="96">${P[name] ?? P.star}</svg>`)}`;
    imgCache.set(name, im);
  }
  return im;
}
