/* ============================================================
 *  VEÍCULOS DO MUNDO — GARAGEM (tela cheia, pensada para o dedo).
 *  Abas: Montar (grade do chassi + bandeja de peças + prévia 3D +
 *  ficha técnica), Fabricar (receitas), Plantas (10 projetos prontos)
 *  e Meus (projetos salvos).
 *  Montar: toque uma peça na bandeja e arraste/solte na grade (a
 *  sombra verde/vermelha mostra se cabe). ⇋ espelha, ⟳ gira, borracha
 *  tira. Tocar numa peça já colocada (sem nada escolhido) pega ela de
 *  volta para reposicionar.
 * ============================================================ */
import * as THREE from 'three';
import { t, fmtDec } from '../../../../../i18n';
import { ensureVehCss } from './css';
import { UI_ICONS, partIcon, type UiIcon } from './icons';
import { PARTS, PART, VEH_RECIPES, vItemName, fuelName, type Station, type VRecipe } from './parts';
import { analyze, canPlace, cloneDesign, footprint, gridOf, newDesign, place, placeErrText, removeAt, setChassis, PAINTS, DRIVER, MASS_KG, type Rot, type VehicleDesign } from './design';
import { BLUEPRINTS } from './blueprints';
import { craft, craftable, craftMissing, missingParts, stationOk, type VInventory } from './crafting';
import { buildVehicleModel, type VehicleModel } from './models';
import { localDesigns, type DesignStore } from './store';


export interface GarageOptions {
  inv: VInventory;
  /** estação onde a garagem foi aberta (oficina faz tudo; bancada só o básico) */
  station: Station;
  design?: VehicleDesign;
  store?: DesignStore;
  /** nível máx. de peças mostrado (progressão); padrão 3 */
  maxTier?: number;
  onClose(): void;
  /** o jogador apertou "Montar!" e as peças já foram descontadas do inventário */
  onBuild(d: VehicleDesign): void;
}
export interface GarageHandle {
  el: HTMLElement;
  readonly design: VehicleDesign;
  close(): void;
  tab(name: 'build' | 'craft' | 'plans' | 'mine'): void;
  select(partId: string | null): void;
  tapCell(x: number, z: number): boolean;
  load(d: VehicleDesign): void;
  build(): boolean;
}

type Tab = 'build' | 'craft' | 'plans' | 'mine';

export function openGarage(root: HTMLElement, o: GarageOptions): GarageHandle {
  ensureVehCss();
  const store = o.store ?? localDesigns;
  const maxTier = o.maxTier ?? 3;
  let d = o.design ? cloneDesign(o.design) : newDesign('vp_chassi_m', '');
  let sel: string | null = null;
  let rot: Rot = 0;
  let sym = true;
  let erase = false;
  let tab: Tab = 'build';

  const el = document.createElement('div');
  el.className = 'mv-gar';
  root.appendChild(el);
  const ic = (k: UiIcon) => `<i>${UI_ICONS[k]}</i>`;
  el.innerHTML = `
    <div class="mv-top">
      <button class="mv-ib" data-a="close" aria-label="${t('mveic.g.close', 'Fechar')}">${UI_ICONS.close}</button>
      <div class="mv-tabs">
        <button class="mv-tab" data-tab="build">${ic('hammer')}<span>${t('mveic.g.build', 'Montar')}</span></button>
        <button class="mv-tab" data-tab="craft">${ic('wrench')}<span>${t('mveic.g.craft', 'Fabricar')}</span></button>
        <button class="mv-tab" data-tab="plans">${ic('book')}<span>${t('mveic.g.plans', 'Plantas')}</span></button>
        <button class="mv-tab" data-tab="mine">${ic('save')}<span>${t('mveic.g.mine', 'Meus')}</span></button>
      </div>
      <div class="mv-t"></div>
      <button class="mv-ib" data-a="sym" aria-label="${t('mveic.g.sym', 'Espelhar')}">${UI_ICONS.mirror}</button>
      <button class="mv-ib" data-a="rot" aria-label="${t('mveic.g.rot', 'Girar')}">${UI_ICONS.rotate}</button>
      <button class="mv-ib" data-a="erase" aria-label="${t('mveic.g.erase', 'Tirar peça')}">${UI_ICONS.eraser}</button>
      <button class="mv-ib" data-a="save" aria-label="${t('mveic.g.save', 'Salvar projeto')}">${UI_ICONS.save}</button>
      <button class="mv-ib go" data-a="go">${ic('play')}<span>${t('mveic.g.go', 'Montar!')}</span></button>
    </div>
    <div class="mv-main mv-pg" data-pg="build">
      <div class="mv-gridw"><div class="mv-grid"></div></div>
      <div class="mv-side">
        <div class="mv-prev"></div>
        <div class="mv-stats"></div>
        <div class="mv-paints"></div>
        <div class="mv-errs"></div>
      </div>
    </div>
    <div class="mv-tray mv-pg" data-pg="build"></div>
    <div class="mv-list mv-pg" data-pg="craft"></div>
    <div class="mv-list mv-pg" data-pg="plans"></div>
    <div class="mv-list mv-pg" data-pg="mine"></div>
    <div class="mv-toast" style="opacity:0"></div>`;
  const $ = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  const gridW = $('.mv-gridw');
  const grid = $('.mv-grid');
  const tray = $('.mv-tray');
  const statsEl = $('.mv-stats');
  const errsEl = $('.mv-errs');
  const title = $('.mv-t');
  const toastEl = $('.mv-toast');
  const paints = $('.mv-paints');
  let toastT = 0;
  const toast = (s: string) => {
    toastEl.textContent = s;
    toastEl.style.opacity = '1';
    clearTimeout(toastT);
    toastT = window.setTimeout(() => (toastEl.style.opacity = '0'), 1800);
  };

  /* ------------------------------ prévia 3D ------------------------------ */
  const prevEl = $('.mv-prev');
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    prevEl.appendChild(renderer.domElement);
  } catch {
    renderer = null;
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5aa0, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 8, 3);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshLambertMaterial({ color: 0x3a2a7e }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const pcam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  let model: VehicleModel | null = null;
  let spin = 0.7;
  let dragging = false;
  let lastX = 0;
  prevEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    prevEl.setPointerCapture(e.pointerId);
  });
  prevEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    spin += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  prevEl.addEventListener('pointerup', () => (dragging = false));
  const rebuildModel = () => {
    model?.dispose();
    model = buildVehicleModel(d, { lite: true });
    const lift = 0.9;
    model.root.position.y = lift;
    scene.add(model.root);
  };
  let raf = 0;
  let lastT = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (!renderer || tab !== 'build') return;
    const w = prevEl.clientWidth;
    const h = prevEl.clientHeight;
    if (!w || !h) return;
    const cv = renderer.domElement;
    if (cv.width !== Math.floor(w * renderer.getPixelRatio()) || cv.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      pcam.aspect = w / h;
      pcam.updateProjectionMatrix();
    }
    if (!dragging) spin += dt * 0.35;
    if (model) {
      model.root.rotation.y = spin;
      for (const s of model.spinners) s.o.rotation[s.axis] += dt * s.rate * 0.15;
      const R = Math.max(model.lay.hl, model.lay.hw, 1.2) * 2.6 + 2;
      pcam.position.set(R * 0.75, R * 0.55, R * 0.75);
      pcam.lookAt(0, 0.6, 0);
    }
    renderer.render(scene, pcam);
  };
  raf = requestAnimationFrame(loop);

  /* ------------------------------ grade ------------------------------ */
  let cell = 40;
  const GAP = 3;
  let ghost: { x: number; z: number } | null = null;
  const layoutGrid = () => {
    const [W, L] = gridOf(d);
    const aw = gridW.clientWidth - 16;
    const ah = gridW.clientHeight - 30;
    cell = Math.max(22, Math.min(64, Math.floor(Math.min((aw - GAP * (W - 1)) / W, (ah - GAP * (L - 1)) / L))));
    grid.style.gridTemplateColumns = `repeat(${W}, ${cell}px)`;
    grid.style.gridTemplateRows = `repeat(${L}, ${cell}px)`;
  };
  const anchorFor = (cx: number, cz: number, id: string): [number, number] => {
    const def = PART.get(id)!;
    const [w, l] = footprint(def, rot);
    return [cx - Math.floor((w - 1) / 2), cz - Math.floor((l - 1) / 2)];
  };
  const renderGrid = () => {
    layoutGrid();
    const [W, L] = gridOf(d);
    let h = `<div class="mv-front">▲ ${t('mveic.g.front', 'frente')}</div>`;
    // sombra (onde a peça escolhida iria)
    let gx0 = -1;
    let gz0 = -1;
    let gw = 0;
    let gl = 0;
    let gok = false;
    if (ghost && sel && !erase) {
      const def = PART.get(sel)!;
      if (def.cat !== 'chassis') {
        [gw, gl] = footprint(def, rot);
        [gx0, gz0] = anchorFor(ghost.x, ghost.z, sel);
        gok = !canPlace(d, sel, gx0, gz0, rot);
      }
    }
    for (let z = 0; z < L; z++)
      for (let x = 0; x < W; x++) {
        const inG = x >= gx0 && x < gx0 + gw && z >= gz0 && z < gz0 + gl;
        h += `<div class="mv-cell${inG ? (gok ? ' ok' : ' bad') : ''}" data-x="${x}" data-z="${z}"></div>`;
      }
    // peças (embaixo primeiro, tracejadas)
    const sorted = [...d.parts].sort((a, b) => (PART.get(a.p)!.layer === 'under' ? -1 : 1) - (PART.get(b.p)!.layer === 'under' ? -1 : 1));
    for (const pp of sorted) {
      const def = PART.get(pp.p)!;
      const [w, l] = footprint(def, pp.r);
      const under = def.layer === 'under';
      const inset = under ? 2 : 5;
      const left = 6 + pp.x * (cell + GAP) + inset;
      const top = 6 + pp.z * (cell + GAP) + inset;
      const ww = w * cell + (w - 1) * GAP - inset * 2;
      const hh = l * cell + (l - 1) * GAP - inset * 2;
      h += `<div class="mv-pp${under ? ' under' : ''}" style="left:${left}px;top:${top}px;width:${ww}px;height:${hh}px;background:${def.color}55"><i style="transform:rotate(${pp.r * 90}deg)">${partIcon(pp.p)}</i></div>`;
    }
    grid.innerHTML = h;
  };
  const cellAt = (e: PointerEvent): { x: number; z: number } | null => {
    const r = grid.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - 6) / (cell + GAP));
    const z = Math.floor((e.clientY - r.top - 6) / (cell + GAP));
    const [W, L] = gridOf(d);
    if (x < 0 || z < 0 || x >= W || z >= L) return null;
    return { x, z };
  };
  let down = false;
  grid.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    down = true;
    try {
      grid.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    ghost = cellAt(e);
    if (sel) renderGrid();
  });
  grid.addEventListener('pointermove', (e) => {
    const c = cellAt(e);
    if (!sel || erase) return;
    if (!c && !ghost) return;
    if (c && ghost && c.x === ghost.x && c.z === ghost.z) return;
    ghost = c;
    renderGrid();
  });
  grid.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    const c = cellAt(e) ?? ghost;
    ghost = null;
    if (c) tapCell(c.x, c.z);
    else renderGrid();
  });
  grid.addEventListener('pointerleave', () => {
    if (!down && ghost) {
      ghost = null;
      renderGrid();
    }
  });

  function tapCell(x: number, z: number): boolean {
    if (erase || !sel) {
      const out = removeAt(d, x, z, sym);
      if (out.length && !erase) {
        // pegou de volta: escolhe a peça para reposicionar
        sel = out[0].p;
        rot = out[0].r;
      }
      changed();
      return out.length > 0;
    }
    const def = PART.get(sel)!;
    if (def.cat === 'chassis') return false;
    const [ax, az] = anchorFor(x, z, sel);
    const err = { e: null as ReturnType<typeof canPlace> };
    const n = place(d, sel, ax, az, rot, sym, err);
    if (!n && err.e) toast(placeErrText(err.e));
    changed();
    return n > 0;
  }

  /* ------------------------------ bandeja ------------------------------ */
  const usedIn = (id: string) => (id === d.chassis ? 1 : 0) + d.parts.filter((p) => p.p === id).length;
  const renderTray = () => {
    let h = '';
    for (const p of PARTS) {
      if (p.tier > maxTier) continue;
      const have = o.inv.count(p.id) - usedIn(p.id);
      const on = p.cat === 'chassis' ? d.chassis === p.id : sel === p.id;
      h += `<button class="mv-slot${on ? ' on' : ''}${have < 0 || (have === 0 && !on) ? ' dim' : ''}" data-p="${p.id}" title="${p.name()}"><i>${partIcon(p.id)}</i><small>${p.name()}</small><b class="${have < 0 ? 'zero' : ''}">${have}</b></button>`;
    }
    tray.innerHTML = h;
  };
  tray.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
    if (!b) return;
    const id = b.dataset.p!;
    const def = PART.get(id)!;
    erase = false;
    if (def.cat === 'chassis') {
      const out = setChassis(d, id);
      if (out.length) toast(t('mveic.g.removedN', '{n} peças não couberam', { n: out.length }));
      sel = null;
    } else sel = sel === id ? null : id;
    if (sel) toast(def.name());
    changed();
  });

  /* ------------------------------ ficha ------------------------------ */
  const renderStats = () => {
    const a = analyze(d);
    const st = (i: UiIcon | string, s: string, raw = false) => `<div class="mv-stat"><i>${raw ? i : UI_ICONS[i as UiIcon]}</i><span>${s}</span></div>`;
    const kmh = (v: number) => Math.round(v * 3.6);
    const total = a.mass + DRIVER;
    statsEl.innerHTML = [
      st('weight', `${Math.round(total * MASS_KG)} kg`),
      st('power', `${fmtDec(a.power, 0)} ${t('mveic.g.pw', 'pot.')}`),
      st('speed', `${kmh(a.topSpeed)} km/h`),
      a.kind === 'land' || a.kind === 'tracked' ? st('mountain', `${Math.round(a.climb)}°`) : st('speed', kindName(a.kind)),
      st('fuel', a.fuel === 'none' ? fuelName('none') : `${fmtDec(a.fuelPerMin, 1)}/min`),
      st('fuel', a.fuel === 'none' ? '∞' : `${Math.round(a.range / 1000 * 10) / 10} km`),
      st('log', `${a.cargo} ${t('mveic.g.logs', 'toras')}${a.slots ? ` +${a.slots}▣` : ''}`),
      st('heart', `${a.hp} ${a.armor ? `+${Math.round(a.armor * 100)}%` : ''}`),
    ].join('');
    const miss = missingParts(d, o.inv);
    let e = '';
    if (a.ok) e += `<div class="mv-okk">✔ ${kindName(a.kind)} — ${t('mveic.g.ready', 'pronto para andar!')}</div>`;
    for (const s of a.errors) e += `<div class="mv-err">✖ ${s}</div>`;
    for (const s of a.warnings) e += `<div class="mv-warn">! ${s}</div>`;
    if (miss.size) e += `<div class="mv-warn">${t('mveic.g.missing', 'Faltam peças')}: ${[...miss].map(([id, n]) => `${n}× ${vItemName(id)}`).join(', ')}</div>`;
    errsEl.innerHTML = e;
    const go = $<HTMLButtonElement>('[data-a="go"]');
    go.disabled = !a.ok;
    paints.innerHTML = PAINTS.map((c) => `<button data-c="${c}" class="${c === d.paint ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('');
  };
  paints.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).dataset.c;
    if (!c) return;
    d.paint = c;
    changed();
  });
  const kindName = (k: string) =>
    ({
      land: t('mveic.k.land', 'Carro'),
      tracked: t('mveic.k.tracked', 'Esteira'),
      water: t('mveic.k.water', 'Barco'),
      heli: t('mveic.k.heli', 'Helicóptero'),
      plane: t('mveic.k.plane', 'Avião'),
      trailer: t('mveic.k.trailer', 'Reboque'),
    })[k] ?? k;

  /* ------------------------------ fabricar ------------------------------ */
  const renderCraft = () => {
    const pg = $('[data-pg="craft"]');
    let h = '';
    const list = [...VEH_RECIPES].filter((r) => (PART.get(r.out)?.tier ?? 0) <= maxTier);
    list.forEach((r, i) => {
      const n = craftable(r, o.inv, o.station);
      const ok = stationOk(r.st, o.station);
      h += `<div class="mv-card"><i>${partIcon(r.out)}</i><div class="mv-cb"><div class="mv-cn">${vItemName(r.out)}${r.n > 1 ? ` ×${r.n}` : ''} <small style="opacity:.7">(${o.inv.count(r.out)})</small></div>
        <div class="mv-ing">${r.ing.map(([id, k]) => `<span class="${o.inv.count(id) < k ? 'miss' : ''}"><i>${partIcon(id)}</i>${k} ${vItemName(id)}</span>`).join('')}</div>
        ${ok ? '' : `<div class="mv-cd">${t('mveic.g.needStation', 'Precisa da oficina')}</div>`}</div>
        <button data-r="${i}" ${n > 0 ? '' : 'disabled'} aria-label="${t('mveic.g.craftOne', 'Fabricar')}">${UI_ICONS.hammer.replace('width="100%" height="100%"', 'width="24" height="24"')}</button></div>`;
    });
    pg.innerHTML = h;
    pg.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
      if (!b) return;
      const r: VRecipe = list[+b.dataset.r!];
      if (craft(r, o.inv, o.station)) toast(t('mveic.g.crafted', 'Fabricado: {x}', { x: vItemName(r.out) }));
      renderCraft();
    };
  };

  /* ------------------------------ plantas / meus ------------------------------ */
  const designCard = (dd: VehicleDesign, name: string, desc: string, key: string, del = false) => {
    const a = analyze(dd);
    const miss = missingParts(dd, o.inv);
    const nMiss = [...miss.values()].reduce((s, n) => s + n, 0);
    return `<div class="mv-card"><i>${partIcon(dd.chassis)}</i><div class="mv-cb"><div class="mv-cn">${name}</div><div class="mv-cd">${desc}</div>
      <div class="mv-ing"><span>${UI_ICONS.speed.replace('width="100%" height="100%"', 'width="14" height="14"')} ${Math.round(a.topSpeed * 3.6)} km/h</span><span>${UI_ICONS.log.replace('width="100%" height="100%"', 'width="14" height="14"')} ${a.cargo}</span><span class="${nMiss ? 'miss' : ''}">${nMiss ? t('mveic.g.missN', 'faltam {n} peças', { n: nMiss }) : '✔'}</span></div></div>
      ${del ? `<button data-del="${key}" style="background:#ff4f6a" aria-label="${t('mveic.g.del', 'Apagar')}">${UI_ICONS.trash.replace('width="100%" height="100%"', 'width="22" height="22"')}</button>` : ''}
      <button data-open="${key}" aria-label="${t('mveic.g.open', 'Abrir')}">${UI_ICONS.hammer.replace('width="100%" height="100%"', 'width="24" height="24"')}</button></div>`;
  };
  const renderPlans = () => {
    const pg = $('[data-pg="plans"]');
    pg.innerHTML = BLUEPRINTS.filter((b) => analyze(b.design).tier <= maxTier)
      .map((b) => designCard(b.design, b.name(), b.desc() + (b.trailer ? ` (+ ${t('mveic.k.trailer', 'Reboque')})` : ''), b.id) + (b.trailer ? designCard(b.trailer, `${b.name()} — ${t('mveic.k.trailer', 'Reboque')}`, '', b.id + ':t') : ''))
      .join('');
    pg.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      if (!b) return;
      const [id, tr] = b.dataset.open!.split(':');
      const bp = BLUEPRINTS.find((x) => x.id === id)!;
      const src = tr ? bp.trailer! : bp.design;
      load({ ...cloneDesign(src), id: newDesign().id, name: tr ? `${bp.name()} — ${t('mveic.k.trailer', 'Reboque')}` : bp.name() });
    };
  };
  const renderMine = () => {
    const pg = $('[data-pg="mine"]');
    const list = store.list();
    pg.innerHTML = list.length ? list.map((x) => designCard(x, x.name || t('mveic.g.unnamed', 'Sem nome'), '', x.id, true)).join('') : `<div class="mv-cd" style="padding:16px">${t('mveic.g.noneSaved', 'Nada salvo ainda. Monte e toque em 💾.')}</div>`;
    pg.onclick = (e) => {
      const tEl = e.target as HTMLElement;
      const del = tEl.closest('[data-del]') as HTMLElement | null;
      if (del) {
        store.remove(del.dataset.del!);
        renderMine();
        return;
      }
      const b = tEl.closest('[data-open]') as HTMLElement | null;
      if (b) {
        const x = list.find((q) => q.id === b.dataset.open);
        if (x) load(x);
      }
    };
  };

  /* ------------------------------ topo ------------------------------ */
  const setTab = (tb: Tab) => {
    tab = tb;
    el.querySelectorAll<HTMLElement>('.mv-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tb));
    el.querySelectorAll<HTMLElement>('.mv-pg').forEach((p) => (p.style.display = p.dataset.pg === tb ? '' : 'none'));
    el.querySelectorAll<HTMLElement>('[data-a="sym"],[data-a="rot"],[data-a="erase"]').forEach((b) => (b.style.display = tb === 'build' ? '' : 'none'));
    if (tb === 'craft') renderCraft();
    if (tb === 'plans') renderPlans();
    if (tb === 'mine') renderMine();
    if (tb === 'build') requestAnimationFrame(() => renderGrid());
  };
  el.querySelector('.mv-tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (b) setTab(b.dataset.tab as Tab);
  });
  const syncTools = () => {
    $('[data-a="sym"]').classList.toggle('on', sym);
    $('[data-a="erase"]').classList.toggle('on', erase);
    title.textContent = d.name || t('mveic.g.newVehicle', 'Veículo novo');
  };
  el.querySelector('.mv-top')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!b) return;
    switch (b.dataset.a) {
      case 'close':
        close();
        return;
      case 'sym':
        sym = !sym;
        toast(sym ? t('mveic.g.symOn', 'Espelhar: ligado') : t('mveic.g.symOff', 'Espelhar: desligado'));
        break;
      case 'rot':
        rot = ((rot + 1) % 4) as Rot;
        toast(`⟳ ${rot * 90}°`);
        break;
      case 'erase':
        erase = !erase;
        if (erase) sel = null;
        break;
      case 'save':
        if (!d.name) d.name = t('mveic.g.myN', 'Meu veículo {n}', { n: store.list().length + 1 });
        store.save(cloneDesign(d));
        toast(t('mveic.g.saved', 'Projeto salvo!'));
        break;
      case 'go':
        build();
        return;
    }
    changed();
  });
  title.addEventListener('click', () => {
    const n = window.prompt(t('mveic.g.name', 'Nome do veículo'), d.name);
    if (n !== null) {
      d.name = n.trim().slice(0, 40);
      syncTools();
    }
  });

  function build(): boolean {
    const a = analyze(d);
    if (!a.ok) {
      toast(a.errors[0]);
      return false;
    }
    let miss = missingParts(d, o.inv);
    if (miss.size) {
      miss = craftMissing(d, o.inv, o.station);
      if (miss.size) {
        toast(t('mveic.g.cantBuild', 'Faltam materiais para: {x}', { x: [...miss.keys()].map(vItemName).join(', ') }));
        changed();
        return false;
      }
      toast(t('mveic.g.autoCrafted', 'Peças que faltavam foram fabricadas'));
    }
    for (const [id, n] of [...new Map([[d.chassis, 1]]), ...countParts(d)]) o.inv.take(id, n);
    o.onBuild(cloneDesign(d));
    return true;
  }
  const countParts = (dd: VehicleDesign) => {
    const m = new Map<string, number>();
    for (const p of dd.parts) m.set(p.p, (m.get(p.p) ?? 0) + 1);
    return m;
  };

  let modelT = 0;
  function changed(): void {
    renderGrid();
    renderTray();
    renderStats();
    syncTools();
    clearTimeout(modelT);
    modelT = window.setTimeout(rebuildModel, 60);
  }
  function load(nd: VehicleDesign): void {
    d = cloneDesign(nd);
    sel = null;
    erase = false;
    setTab('build');
    changed();
  }
  const onResize = () => tab === 'build' && renderGrid();
  window.addEventListener('resize', onResize);
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    model?.dispose();
    floor.geometry.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    el.remove();
    o.onClose();
  }

  setTab('build');
  changed();
  rebuildModel();
  return {
    el,
    get design() {
      return d;
    },
    close,
    tab: setTab,
    select(id) {
      sel = id;
      erase = false;
      changed();
    },
    tapCell,
    load,
    build,
  };
}
