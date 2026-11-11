/* ============================================================
 *  BLOOP STUDIO — "Personalizar mundo" (mundo Infinito).
 *  Predefinições (normal, plano com camadas, ilhas, só ilhas planas,
 *  ilhas flutuantes), semente, altura/aspereza/mar/tamanho dos biomas,
 *  peso de cada bioma, árvores/cavernas/minérios e um mini-mapa ao vivo.
 * ============================================================ */
import { t } from '../../i18n';
import { BIOME_IDS, TERRAIN_MATS, type BiomeId, type TerrainMat, type WorldGenSettings, type WorldPreset } from '../format';
import { BIOME_LIST, drawPreview } from '../world/terrain';
import { MAT_COLORS } from '../world/field';
import type { Studio } from '../studio';
import { sicon } from './sicons';

export const biomeName = (b: BiomeId): string =>
  ({
    campo: t('studio.bio.campo', 'Campo'),
    floresta: t('studio.bio.floresta', 'Floresta'),
    deserto: t('studio.bio.deserto', 'Deserto'),
    neve: t('studio.bio.neve', 'Neve'),
    pantano: t('studio.bio.pantano', 'Pântano'),
    montanhas: t('studio.bio.montanhas', 'Montanhas'),
    oceano: t('studio.bio.oceano', 'Oceano'),
    savana: t('studio.bio.savana', 'Savana'),
    outono: t('studio.bio.outono', 'Outono'),
    cogumelos: t('studio.bio.cogumelos', 'Cogumelos'),
    tropical: t('studio.bio.tropical', 'Tropical'),
    ilhas: t('studio.bio.ilhas', 'Ilhas flutuantes'),
  })[b];

const matName = (k: TerrainMat): string =>
  ({
    grass: t('studio.terr.m.grass', 'Grama'),
    sand: t('studio.terr.m.sand', 'Areia'),
    snow: t('studio.terr.m.snow', 'Neve'),
    rock: t('studio.terr.m.rock', 'Pedra'),
    dirt: t('studio.terr.m.dirt', 'Terra'),
    water: t('studio.terr.m.water', 'Água'),
  })[k];

const PRESETS = (): [WorldPreset, string][] => [
  ['normal', t('studio.wg.normal', 'Normal')],
  ['flat', t('studio.wg.flat', 'Plano em camadas')],
  ['islands', t('studio.wg.islands', 'Ilhas')],
  ['flatIslands', t('studio.wg.flatIslands', 'Só ilhas planas')],
  ['floating', t('studio.wg.floating', 'Ilhas flutuantes')],
];

/** abre a folha; `apply` recebe o resultado (semente + ajustes) */
export function openWorldSheet(s: Studio, open: (html: string) => HTMLElement, close: () => void): void {
  const ed = s.editor;
  const g: WorldGenSettings = JSON.parse(JSON.stringify(ed.doc.gen ?? {}));
  let seed = ed.doc.seed ?? 1;
  const el = open(`<h3>${sicon('sliders', 20)} ${t('studio.wg.title', 'Personalizar mundo')}</h3><div class="bs-wg"></div>`);
  el.classList.add('bs-wsheet');
  const box = el.querySelector<HTMLElement>('.bs-wg')!;
  let timer = 0;
  const preview = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const cv = box.querySelector<HTMLCanvasElement>('canvas');
      if (cv) drawPreview(cv, seed, g);
    }, 180);
  };
  const SL: [keyof WorldGenSettings, string, number, number, number, number][] = [
    ['height', t('studio.wg.height', 'Altura dos morros'), 0, 2, 0.1, 1],
    ['rough', t('studio.wg.rough', 'Aspereza'), 0.2, 2, 0.1, 1],
    ['sea', t('studio.wg.sea', 'Nível do mar'), -12, 12, 1, 0],
    ['biomeSize', t('studio.wg.biomeSize', 'Tamanho dos biomas'), 0.25, 4, 0.25, 1],
    ['trees', t('studio.wg.trees', 'Árvores'), 0, 2, 0.1, 1],
    ['caves', t('studio.wg.caves', 'Cavernas'), 0, 2, 0.1, 0.5],
    ['ores', t('studio.wg.ores', 'Minérios'), 0, 2, 0.1, 0.5],
  ];
  const render = () => {
    const pre = g.preset ?? 'normal';
    const layers = g.layers ?? [
      { k: 'rock' as TerrainMat, n: 3 },
      { k: 'dirt' as TerrainMat, n: 2 },
      { k: 'grass' as TerrainMat, n: 1 },
    ];
    box.innerHTML = `
      <div class="bs-wgtop"><canvas width="150" height="150" class="bs-wgmap"></canvas>
        <div class="bs-wgside"><div class="bs-chips">${PRESETS()
          .map(([id, nm]) => `<button class="bs-chip${pre === id ? ' on' : ''}" data-pre="${id}">${nm}</button>`)
          .join('')}</div>
        <label class="bs-field">${t('studio.wg.seed', 'Semente')}<span class="bs-seedrow"><input type="number" inputmode="numeric" value="${seed}" data-seed><button class="bs-mini" data-dice>${sicon('refresh', 16)}</button></span></label></div></div>
      ${
        pre === 'flat'
          ? `<h4>${t('studio.wg.layers', 'Camadas (de baixo para cima)')}</h4><div class="bs-list">${layers
              .map(
                (l, i) => `<div class="bs-li" data-i="${i}"><span><i class="bs-dot" style="background:${MAT_COLORS[l.k] === MAT_COLORS.water ? '#3ab0e0' : MAT_COLORS[l.k]}"></i>${matName(l.k)} · ${l.n} m</span>
            <button class="bs-mini" data-lk>${t('studio.change', 'Trocar')}</button><button class="bs-mini" data-ln="-1">−</button><button class="bs-mini" data-ln="1">+</button><button class="bs-mini" data-lrm>${sicon('trash', 14)}</button></div>`,
              )
              .join('')}</div><button class="bs-btn" data-ladd>${sicon('plus', 16)}${t('studio.wg.addLayer', 'Camada')}</button>`
          : `<div class="bs-sliders">${SL.map(([k, nm, a, b, st, def]) => {
              const v = (g[k] as number | undefined) ?? def;
              return `<label>${nm}<input type="range" min="${a}" max="${b}" step="${st}" value="${v}" data-k="${k}"><b>${fmt(k, v)}</b></label>`;
            }).join('')}</div>
            <h4>${t('studio.wg.biomes', 'Biomas (0 = desligado)')}</h4><div class="bs-sliders bs-biomes">${BIOME_LIST.map((b) => {
              const v = g.biomes?.[b.id] ?? (b.id === 'ilhas' ? 0.6 : 1);
              return `<label><span><i class="bs-dot" style="background:${b.color}"></i>${biomeName(b.id)}</span><input type="range" min="0" max="3" step="0.1" value="${v}" data-b="${b.id}"><b>${v ? v.toFixed(1) : t('studio.wg.off', 'não')}</b></label>`;
            }).join('')}</div>`
      }
      <div class="bs-row3"><button class="bs-btn bs-accent" data-apply>${t('studio.wg.apply', 'Usar este mundo')}</button><button class="bs-btn" data-reset>${t('studio.wg.reset', 'Padrão')}</button><button class="bs-btn" data-close>${t('studio.cancel', 'Cancelar')}</button></div>`;
    preview();
  };
  const fmt = (k: keyof WorldGenSettings, v: number) => (k === 'sea' ? `${v > 0 ? '+' : ''}${v} m` : `${Math.round(v * 100)}%`);
  box.addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.dataset.k) {
      const k = inp.dataset.k as keyof WorldGenSettings;
      (g as Record<string, number>)[k] = Number(inp.value);
      inp.parentElement!.querySelector('b')!.textContent = fmt(k, Number(inp.value));
    } else if (inp.dataset.b) {
      g.biomes = { ...(g.biomes ?? {}), [inp.dataset.b]: Number(inp.value) };
      inp.parentElement!.querySelector('b')!.textContent = Number(inp.value) ? Number(inp.value).toFixed(1) : t('studio.wg.off', 'não');
    } else if (inp.hasAttribute('data-seed')) seed = Math.abs(Math.floor(Number(inp.value) || 1)) % 1e9;
    preview();
  });
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const layers = g.layers ?? [
      { k: 'rock' as TerrainMat, n: 3 },
      { k: 'dirt' as TerrainMat, n: 2 },
      { k: 'grass' as TerrainMat, n: 1 },
    ];
    const li = Number(b.closest<HTMLElement>('[data-i]')?.dataset.i);
    if (b.dataset.pre) {
      g.preset = b.dataset.pre as WorldPreset;
      if (g.preset === 'normal') delete g.preset;
    } else if (b.hasAttribute('data-dice')) seed = (Math.random() * 1e6) | 0;
    else if (b.hasAttribute('data-lk')) {
      layers[li].k = TERRAIN_MATS[(TERRAIN_MATS.indexOf(layers[li].k) + 1) % TERRAIN_MATS.length];
      g.layers = layers;
    } else if (b.dataset.ln) {
      layers[li].n = Math.max(0.5, Math.min(20, layers[li].n + Number(b.dataset.ln) * 0.5));
      g.layers = layers;
    } else if (b.hasAttribute('data-lrm')) {
      if (layers.length > 1) layers.splice(li, 1);
      g.layers = layers;
    } else if (b.hasAttribute('data-ladd')) {
      if (layers.length < 8) layers.push({ k: 'grass', n: 1 });
      g.layers = layers;
    } else if (b.hasAttribute('data-reset')) {
      for (const k of Object.keys(g)) delete (g as Record<string, unknown>)[k];
    } else if (b.hasAttribute('data-apply')) {
      const clean = JSON.parse(JSON.stringify(g)) as WorldGenSettings;
      if (clean.biomes) for (const id of BIOME_IDS) if (clean.biomes[id] == null) delete clean.biomes[id];
      ed.change('world', () => {
        ed.doc.worldKind = 'infinite';
        ed.doc.seed = seed;
        if (Object.keys(clean).length) ed.doc.gen = clean;
        else delete ed.doc.gen;
      });
      s.syncWorld();
      close();
      s.panels.refresh();
      return;
    } else return;
    render();
  });
  render();
}
