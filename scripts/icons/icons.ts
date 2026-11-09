/** Página de revisão (dev): npx vite → /scripts/icons/icons.html */
import '@fontsource/fredoka/600.css';
import { icon, ICON_NAMES } from '../../src/ui/icons';

const sheet = document.getElementById('sheet')!;
sheet.innerHTML = ICON_NAMES.map(
  (name) => `<div class="cell"><div class="row">${icon(name, { size: 64 })}${icon(name, { size: 32 })}${icon(name, { size: 18 })}<span class="light">${icon(name, { size: 24 })}</span></div><small>${name}</small></div>`,
).join('');
