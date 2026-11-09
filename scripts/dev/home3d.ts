/**
 * Página de desenvolvimento do modo 3D da casa.
 *   npx vite --port 4311  →  http://localhost:4311/scripts/dev/home3d.html
 * Parâmetros: ?auto=fps|build|party|visit  &skip (pula girar)  &tier=0..3 (força qualidade)
 * Depois de sair, mostra o diff do HomeDesign/MessItem (o que o 2D receberia).
 */
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import type { HomeDesign, MessItem } from '../../src/home/api';
import { open3DLazy } from '../../src/home3d/lazy';
import { saveMode } from '../../src/core/quality';

const q = new URLSearchParams(location.search);
if (q.has('tier')) saveMode(Number(q.get('tier')) as 0 | 1 | 2 | 3);

const it = (id: string, x: number, y: number, color?: string) => ({ id, x, y, ...(color ? { color } : {}) });
export function sampleDesign(): HomeDesign {
  return {
    v: 1,
    planet: { shape: 0 },
    exterior: { wall: 0 },
    access: { visits: 'friends', defaultRole: 'clean', roles: { amigo_deco: 'decorate' } },
    rooms: [
      { id: 'living', floor: 'wood:15', wall: 'stripes:13', items: [it('rug1', 180, 360), it('sofa0', 110, 300), it('armchair1', 300, 330), it('plant0', 330, 270), it('tv0', 200, 262), it('window0', 280, 100), it('painting0', 110, 110), it('floorlamp0', 30, 280), it('table2', 200, 380, '8'), it('chair0', 150, 390), it('chair0', 250, 395), it('teddy0', 60, 400), it('bookcase0', 40, 262)] },
      { id: 'kitchen', floor: 'checker:18', wall: 'tile:7', items: [it('fridge0', 40, 262), it('stove0', 110, 262), it('sink0', 185, 262), it('counter0', 270, 262), it('table0', 200, 360), it('chair1', 140, 360), it('stool0', 260, 380), it('clock0', 300, 80), it('plant1', 335, 400)] },
      { id: 'bedroom', floor: 'carpet:11', wall: 'stars:9', items: [it('bed1', 90, 320), it('wardrobe0', 310, 262), it('poster0', 210, 100), it('teddy1', 200, 380), it('rug0', 180, 390), it('desk0', 230, 262), it('computer0', 230, 250), it('tablelamp0', 130, 262), it('toybox1', 300, 400), it('guitar0', 170, 270)] },
      { id: 'bath', floor: 'tile:7', wall: 'waves:7', items: [it('bathtub0', 110, 290), it('toilet0', 280, 270), it('mirror0', 260, 110), it('sink1', 200, 262), it('plant0', 330, 400)] },
      { id: 'party', floor: 'checker:12', wall: 'dots:3', items: [it('partytable0', 180, 320), it('balloons0', 40, 300), it('balloons1', 320, 300), it('speaker0', 330, 400), it('garland0', 180, 40), it('discoball0', 180, 330), it('chair2', 110, 380), it('chair2', 250, 380), it('arcade0', 40, 400)] },
    ],
  };
}
export function sampleMess(): MessItem[] {
  return [
    { id: 'mx1', kind: 'juice', room: 'living', x: 220, y: 330, r: 30 },
    { id: 'mx2', kind: 'crumbs', room: 'living', x: 120, y: 400, r: 26 },
    { id: 'mx3', kind: 'frosting', room: 'living', x: 300, y: 120, r: 24 },
    { id: 'mx4', kind: 'mud', room: 'kitchen', x: 150, y: 400, r: 34 },
    { id: 'mx5', kind: 'confetti', room: 'party', x: 120, y: 360, r: 34 },
    { id: 'mx6', kind: 'tomato', room: 'party', x: 260, y: 300, r: 26 },
    { id: 'mx7', kind: 'mud', room: 'kitchen', x: 100, y: 400, r: 1, moved: { itemId: '5', ox: 140, oy: 360 }, rot: 0.35 },
  ];
}

let design = sampleDesign();
let mess = sampleMess();
const out = document.getElementById('out')!;
const ui = document.getElementById('ui')!;
const changes: string[] = [];
function diff(a: unknown, b: unknown, path = ''): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((x, i) => diff(x, b[i], `${path}[${i}]`));
    return;
  }
  changes.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}
async function go(kind: string): Promise<void> {
  const before = { design: JSON.parse(JSON.stringify(design)), mess: JSON.parse(JSON.stringify(mess)) };
  let calls = 0;
  const res = await open3DLazy({
    design,
    mess,
    ownerId: kind === 'visit' ? 'friend1' : 'me',
    viewerId: kind === 'visit' ? 'me' : 'me',
    editable: kind !== 'visit',
    partyMode: kind === 'party',
    mode: kind === 'build' ? 'build' : 'fps',
    skipRotate: q.has('skip'),
    debug: true,
    force: true,
    onChange: (d, m) => {
      calls++;
      design = d;
      mess = m;
    },
  });
  changes.length = 0;
  diff(before.design, res.design, 'design');
  const ids = (l: MessItem[]) => new Set(l.map((x) => x.id));
  const bi = ids(before.mess),
    ai = ids(res.mess);
  for (const m of before.mess as MessItem[]) if (!ai.has(m.id)) changes.push(`mess - ${m.kind} ${m.id} (limpo)`);
  for (const m of res.mess) if (!bi.has(m.id)) changes.push(`mess + ${JSON.stringify(m)}`);
  out.textContent = `onChange chamado ${calls}x · motivo: ${res.reason} · limpou ${res.cleaned} · quebrou ${res.broken}\n\n` + (changes.join('\n') || '(sem mudanças)');
  document.title = 'closed';
}
for (const [k, label] of [['fps', 'Minha casa (FPS)'], ['build', 'Construir (de cima)'], ['party', 'Festa (robôs)'], ['visit', 'Visita (só limpar)'], ['reset', 'Resetar']]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => (k === 'reset' ? ((design = sampleDesign()), (mess = sampleMess()), (out.textContent = 'reset')) : void go(k));
  ui.appendChild(b);
}
(window as unknown as { __go: typeof go }).__go = go;
if (q.get('auto')) void go(q.get('auto')!);
document.title = 'ready';
