/* ============================================================
 *  Ponte com o PASSE DA CASA (src/pass/home/*): itens exclusivos
 *  (nunca à venda) aparecem no construtor — trancados até ganhar.
 *  Mostramos: tudo que você já ganhou + os da temporada atual.
 * ============================================================ */
import { homePassItems, drawHomeItem, homeItem, type HomePassExtension } from '../pass/home/register';
import { ensureHomeSeason } from '../pass/home/state';
import type { HomePassItem } from '../pass/home/catalog';
import { addExtraFurn, setPassColorResolver, type FurnDef, type FurnKind } from './catalog';
import { setPassPaint } from './paint';
import { makeCanvas } from './gfx';

let ext: HomePassExtension | null = null;
let season = -1;

export function passData(): HomePassExtension {
  if (!ext) refreshPass();
  return ext!;
}
export function refreshPass(): void {
  let all: HomePassExtension;
  try {
    all = homePassItems();
    season = ensureHomeSeason()?.index ?? -1;
  } catch {
    all = { furniture: [], surfaces: [], exterior: [], paints: [], kits: [], party: [], tools: [], showpieces: [] };
  }
  const keep = <T extends { owned: boolean }>(x: T, it: HomePassItem) => x.owned || it.season === season;
  ext = {
    furniture: all.furniture.filter((f) => keep(f, f.def.pass)),
    surfaces: all.surfaces.filter((f) => keep(f, f.item)),
    exterior: all.exterior.filter((f) => keep(f, f.item)),
    paints: all.paints.filter((f) => keep(f, f.item)),
    kits: all.kits.filter((f) => keep(f, f.item)),
    party: all.party.filter((f) => keep(f, f.item)),
    tools: all.tools.filter((f) => keep(f, f.item)),
    showpieces: all.showpieces.filter((f) => keep(f, f.item)),
  };
  // todos os móveis do passe ganhos (e da temporada) passam a existir no catálogo
  addExtraFurn(
    ext.furniture.map(({ def }) => ({ id: def.id, kind: def.kind as FurnKind, v: def.v, w: def.w, h: def.h, wall: def.wall, flat: def.flat, color: 0, hex: def.hex, cost: { kind: 'pass' }, name: def.name, passId: def.id }) as FurnDef),
  );
}

/** Instala resolvedores (cores/tintas do passe) — chamar ao abrir a tela. */
export function installPass(): void {
  setPassColorResolver((id) => homeItem(id)?.draw.palette[1]);
  const pats = new Map<string, CanvasPattern | string>();
  setPassPaint((c, id) => {
    const hit = pats.get(id);
    if (hit) return hit;
    const it = homeItem(id);
    if (!it) return '#ffffff';
    const [cv, x] = makeCanvas(48, 48);
    x.fillStyle = it.draw.palette[1];
    x.fillRect(0, 0, 48, 48);
    try {
      drawHomeItem(x, it, 48, 0);
    } catch {
      /* */
    }
    const p = c.createPattern(cv, 'repeat') ?? it.draw.palette[1];
    pats.set(id, p);
    return p;
  });
  refreshPass();
}

const thumbs = new Map<string, string>();
export function passThumb(it: HomePassItem, size = 56): string {
  const k = it.id + size;
  let u = thumbs.get(k);
  if (u) return u;
  const [cv, x] = makeCanvas(size, size);
  try {
    drawHomeItem(x, it, size, 0);
  } catch {
    /* */
  }
  u = cv.toDataURL();
  thumbs.set(k, u);
  return u;
}
export function openHomePass(): void {
  void import('../pass/register').then((m) => m.openHomePass());
}
