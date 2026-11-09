/* ============================================================
 *  INTERIOR — cômodo (parede + piso), ~126 móveis procedurais e sujeira.
 *  Sala lógica 360×420; parede até WALL_Y. Fundo+móveis vão p/ cache;
 *  o laço só desenha personagens, comida voando e partículas.
 * ============================================================ */
import type { MessItem, RoomDesign } from './api';
import { furnById, mulberry, pal, surface, type FurnDef } from './catalog';
import { INK, TAU, alpha, circ, ell, fs, heartPath, rr, shade, star } from './gfx';

export const RW = 360;
export const RH = 420;
export const WALL_Y = 230;

/* ---------------- parede e piso ---------------- */
export function drawRoomShell(c: CanvasRenderingContext2D, room: RoomDesign): void {
  const [wk, wci] = surface(room.wall);
  const [fk, fci] = surface(room.floor);
  const wc = pal(wci);
  const fc = pal(fci);
  // parede
  c.fillStyle = wc;
  c.fillRect(0, 0, RW, WALL_Y);
  c.save();
  c.beginPath();
  c.rect(0, 0, RW, WALL_Y);
  c.clip();
  const l = shade(wc, 0.3),
    d = shade(wc, -0.12);
  const r = mulberry(5);
  switch (wk) {
    case 'stripes':
      c.fillStyle = l;
      for (let x = 0; x < RW; x += 36) c.fillRect(x, 0, 18, WALL_Y);
      break;
    case 'dots':
      c.fillStyle = l;
      for (let y = 14; y < WALL_Y; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < RW + 14; x += 28) {
        circ(c, x, y, 5);
        c.fill();
      }
      break;
    case 'brick':
      c.strokeStyle = d;
      c.lineWidth = 2;
      for (let y = 0; y < WALL_Y; y += 20) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(RW, y);
        c.stroke();
        for (let x = (y / 20) % 2 ? 20 : 0; x < RW; x += 40) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 20);
          c.stroke();
        }
      }
      break;
    case 'wood':
      for (let x = 0; x < RW; x += 30) {
        c.fillStyle = (x / 30) % 2 ? d : wc;
        c.fillRect(x, 0, 30, WALL_Y);
        c.fillStyle = alpha(INK, 0.15);
        c.fillRect(x, 0, 2, WALL_Y);
      }
      break;
    case 'stars':
      for (let i = 0; i < 26; i++) {
        star(c, r() * RW, r() * WALL_Y, 5 + r() * 5, 5, 0.5);
        c.fillStyle = i % 2 ? l : alpha('#ffffff', 0.7);
        c.fill();
      }
      break;
    case 'hearts':
      for (let i = 0; i < 22; i++) {
        heartPath(c, r() * RW, r() * WALL_Y, 7 + r() * 4);
        c.fillStyle = i % 2 ? l : d;
        c.fill();
      }
      break;
    case 'waves':
      c.strokeStyle = l;
      c.lineWidth = 6;
      for (let y = 20; y < WALL_Y; y += 34) {
        c.beginPath();
        for (let x = 0; x <= RW; x += 10) c.lineTo(x, y + Math.sin(x / 18) * 6);
        c.stroke();
      }
      break;
    case 'tile':
      c.strokeStyle = l;
      c.lineWidth = 2;
      for (let x = 0; x < RW; x += 24) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, WALL_Y);
        c.stroke();
      }
      for (let y = 0; y < WALL_Y; y += 24) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(RW, y);
        c.stroke();
      }
      break;
    case 'check':
      c.fillStyle = l;
      for (let y = 0; y < WALL_Y; y += 30) for (let x = (y / 30) % 2 ? 30 : 0; x < RW; x += 60) c.fillRect(x, y, 30, 30);
      break;
    case 'clouds':
      c.fillStyle = alpha('#ffffff', 0.75);
      for (let i = 0; i < 7; i++) {
        const x = r() * RW,
          y = 20 + r() * (WALL_Y - 60);
        circ(c, x, y, 16);
        c.fill();
        circ(c, x + 18, y + 4, 12);
        c.fill();
        circ(c, x - 17, y + 5, 11);
        c.fill();
      }
      break;
    case 'space': {
      c.fillStyle = shade(wc, -0.55);
      c.fillRect(0, 0, RW, WALL_Y);
      for (let i = 0; i < 60; i++) {
        c.fillStyle = alpha('#ffffff', 0.4 + r() * 0.6);
        c.fillRect(r() * RW, r() * WALL_Y, 2, 2);
      }
      circ(c, 290, 60, 22);
      fs(c, wc, 2);
      break;
    }
  }
  // rodapé + sombra
  const g = c.createLinearGradient(0, WALL_Y - 40, 0, WALL_Y);
  g.addColorStop(0, alpha(INK, 0));
  g.addColorStop(1, alpha(INK, 0.18));
  c.fillStyle = g;
  c.fillRect(0, WALL_Y - 40, RW, 40);
  c.restore();
  c.fillStyle = '#ffffff';
  c.fillRect(0, WALL_Y - 8, RW, 8);
  c.fillStyle = alpha(INK, 0.3);
  c.fillRect(0, WALL_Y - 1, RW, 2);

  // piso
  c.fillStyle = fc;
  c.fillRect(0, WALL_Y, RW, RH - WALL_Y);
  c.save();
  c.beginPath();
  c.rect(0, WALL_Y, RW, RH - WALL_Y);
  c.clip();
  const fl = shade(fc, 0.22),
    fd = shade(fc, -0.15);
  const rows = 6;
  const rowY = (i: number) => WALL_Y + (RH - WALL_Y) * Math.pow(i / rows, 1.25);
  const persp = (x: number, y: number) => RW / 2 + (x - RW / 2) * (0.75 + 0.35 * ((y - WALL_Y) / (RH - WALL_Y)));
  const grid = (cols: number, alt: boolean, col: string) => {
    for (let i = 0; i < rows; i++) {
      const y0 = rowY(i),
        y1 = rowY(i + 1);
      for (let j = -2; j < cols + 2; j++) {
        if (alt && (i + j) % 2) continue;
        const xa = (j / cols) * RW,
          xb = ((j + 1) / cols) * RW;
        c.beginPath();
        c.moveTo(persp(xa, y0), y0);
        c.lineTo(persp(xb, y0), y0);
        c.lineTo(persp(xb, y1), y1);
        c.lineTo(persp(xa, y1), y1);
        c.closePath();
        c.fillStyle = col;
        c.fill();
        if (!alt) {
          c.strokeStyle = alpha(INK, 0.12);
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
    }
  };
  switch (fk) {
    case 'wood':
      for (let i = 0; i < rows; i++) {
        const y0 = rowY(i),
          y1 = rowY(i + 1);
        c.fillStyle = i % 2 ? fd : fc;
        c.fillRect(0, y0, RW, y1 - y0);
        c.fillStyle = alpha(INK, 0.15);
        c.fillRect(0, y0, RW, 1.5);
        for (let k = 0; k < 3; k++) c.fillRect(((k * 137 + i * 61) % RW), y0, 1.5, y1 - y0);
      }
      break;
    case 'tile':
      grid(7, false, fc);
      break;
    case 'checker':
      grid(8, true, fd === fc ? '#262238' : shade(fc, -0.45));
      break;
    case 'carpet':
      for (let i = 0; i < 300; i++) {
        c.fillStyle = i % 2 ? fl : fd;
        c.fillRect(r() * RW, WALL_Y + r() * (RH - WALL_Y), 2, 2);
      }
      break;
    case 'stone':
      for (let i = 0; i < 26; i++) {
        ell(c, r() * RW, WALL_Y + 10 + r() * (RH - WALL_Y), 18 + r() * 10, 9 + r() * 4);
        fs(c, i % 2 ? fl : fd);
      }
      break;
    case 'grass':
      c.strokeStyle = fl;
      c.lineWidth = 2;
      for (let i = 0; i < 140; i++) {
        const x = r() * RW,
          y = WALL_Y + r() * (RH - WALL_Y);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 2, y - 6);
        c.stroke();
      }
      break;
    case 'stars':
      for (let i = 0; i < 24; i++) {
        star(c, r() * RW, WALL_Y + 8 + r() * (RH - WALL_Y), 6, 5, 0.5);
        fs(c, fl);
      }
      break;
    case 'hex':
      c.strokeStyle = fd;
      c.lineWidth = 2;
      for (let y = WALL_Y; y < RH + 20; y += 22) for (let x = ((y - WALL_Y) / 22) % 2 ? 13 : 0; x < RW + 20; x += 26) {
        c.beginPath();
        for (let k = 0; k < 6; k++) c.lineTo(x + Math.cos((k * TAU) / 6) * 13, y + Math.sin((k * TAU) / 6) * 11);
        c.closePath();
        c.stroke();
      }
      break;
    case 'stripes':
      c.fillStyle = fl;
      for (let x = -400; x < RW + 400; x += 40) {
        c.beginPath();
        c.moveTo(persp(x, WALL_Y), WALL_Y);
        c.lineTo(persp(x + 20, WALL_Y), WALL_Y);
        c.lineTo(persp(x + 20, RH), RH);
        c.lineTo(persp(x, RH), RH);
        c.fill();
      }
      break;
    case 'dots':
      c.fillStyle = fl;
      for (let i = 0; i < 70; i++) {
        ell(c, r() * RW, WALL_Y + r() * (RH - WALL_Y), 6, 3.5);
        c.fill();
      }
      break;
    case 'marble':
      grid(5, false, fl);
      c.strokeStyle = alpha(INK, 0.12);
      c.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        let x = r() * RW,
          y = WALL_Y + r() * (RH - WALL_Y);
        c.moveTo(x, y);
        for (let k = 0; k < 4; k++) c.lineTo((x += (r() - 0.5) * 50), (y += (r() - 0.3) * 20));
        c.stroke();
      }
      break;
    case 'candy':
      c.strokeStyle = alpha('#ffffff', 0.7);
      c.lineWidth = 10;
      for (let x = -200; x < RW + 200; x += 36) {
        c.beginPath();
        c.moveTo(x, WALL_Y);
        c.lineTo(x + 140, RH);
        c.stroke();
      }
      break;
  }
  const fg = c.createLinearGradient(0, WALL_Y, 0, WALL_Y + 50);
  fg.addColorStop(0, alpha(INK, 0.22));
  fg.addColorStop(1, alpha(INK, 0));
  c.fillStyle = fg;
  c.fillRect(0, WALL_Y, RW, 50);
  c.restore();
}

/* ---------------- móveis ---------------- */
/** Desenha o móvel com base em (0,0) (centro-inferior; itens de parede: centro). */
export function drawFurn(c: CanvasRenderingContext2D, def: FurnDef, color?: string, flip?: boolean): void {
  const col = color ?? pal(def.color);
  const w = def.w,
    h = def.h,
    v = def.v;
  const dk = shade(col, -0.2),
    lt = shade(col, 0.3);
  const rad = v === 1 ? 14 : v === 2 ? 3 : 7;
  c.save();
  if (flip) c.scale(-1, 1);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (def.wall) c.translate(0, h / 2);
  // sombra no chão
  if (!def.wall && !def.flat) {
    ell(c, 0, 0, w * 0.5, 5);
    c.fillStyle = alpha(INK, 0.18);
    c.fill();
  }
  const legs = (y: number, x0: number, x1: number, lh: number, col2 = INK) => {
    c.fillStyle = col2;
    c.fillRect(x0 - 2, y, 4, lh);
    c.fillRect(x1 - 2, y, 4, lh);
  };
  switch (def.kind) {
    case 'sofa':
    case 'armchair': {
      rr(c, -w / 2 + 6, -h, w - 12, h * 0.62, rad);
      fs(c, dk, 2.5);
      rr(c, -w / 2 + 4, -h * 0.5, w - 8, h * 0.36, rad * 0.6);
      fs(c, col, 2.5);
      rr(c, -w / 2, -h * 0.62, 16, h * 0.55, 7);
      fs(c, col, 2.5);
      rr(c, w / 2 - 16, -h * 0.62, 16, h * 0.55, 7);
      fs(c, col, 2.5);
      if (v !== 1) legs(-h * 0.08, -w / 2 + 10, w / 2 - 10, h * 0.08);
      if (v === 1)
        for (let i = 0; i < (def.kind === 'sofa' ? 2 : 1); i++) {
          rr(c, (def.kind === 'sofa' ? -w / 4 - 12 + i * w * 0.5 : -12), -h * 0.85, 24, 20, 8);
          fs(c, lt, 2);
        }
      break;
    }
    case 'bed': {
      rr(c, -w / 2, -h, 14, h, 5);
      fs(c, v === 2 ? '#d5d0e8' : '#c89a6a', 2.5);
      rr(c, -w / 2 + 6, -h * 0.55, w - 10, h * 0.42, 6);
      fs(c, '#ffffff', 2.5);
      rr(c, -w / 2 + 30, -h * 0.6, w - 34, h * 0.4, 8);
      fs(c, col, 2.5);
      rr(c, -w / 2 + 12, -h * 0.72, 26, 14, 7);
      fs(c, '#ffffff', 2);
      if (v === 1) {
        heartPath(c, 20, -h * 0.4, 7);
        fs(c, lt);
      }
      legs(-h * 0.14, -w / 2 + 8, w / 2 - 8, h * 0.14);
      break;
    }
    case 'bunk': {
      c.fillStyle = '#c89a6a';
      c.fillRect(-w / 2, -h, 8, h);
      c.fillRect(w / 2 - 8, -h, 8, h);
      for (const y of [-h * 0.18, -h * 0.68]) {
        rr(c, -w / 2 + 4, y - 18, w - 8, 18, 5);
        fs(c, col, 2);
        rr(c, -w / 2 + 8, y - 26, 20, 10, 5);
        fs(c, '#fff', 1.5);
      }
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.strokeRect(-w / 2, -h, 8, h);
      c.strokeRect(w / 2 - 8, -h, 8, h);
      for (let i = 0; i < 4; i++) c.fillRect(w / 2 - 22, -h * 0.65 + i * 14, 14, 3);
      break;
    }
    case 'table':
    case 'desk':
    case 'partytable': {
      const top = def.kind === 'partytable' ? -h : -h;
      rr(c, -w / 2, top, w, 10, v === 1 ? 5 : 2);
      fs(c, col, 2.5);
      if (def.kind === 'partytable') {
        c.beginPath();
        c.moveTo(-w / 2, top + 8);
        for (let i = 0; i <= 8; i++) c.lineTo(-w / 2 + (i * w) / 8, top + (i % 2 ? 30 : 20));
        c.lineTo(w / 2, top + 8);
        c.closePath();
        fs(c, '#ffffff', 2);
      }
      if (def.kind === 'desk') {
        rr(c, w / 2 - 34, top + 10, 30, h - 10, 3);
        fs(c, dk, 2);
        circ(c, w / 2 - 19, top + 24, 2.5);
        fs(c, INK);
      }
      legs(top + 10, -w / 2 + 8, def.kind === 'desk' ? -w / 2 + 8 : w / 2 - 8, h - 10, v === 2 ? '#8f88a8' : INK);
      break;
    }
    case 'chair':
    case 'stool': {
      if (def.kind === 'chair') {
        rr(c, -w / 2 + 4, -h, w - 8, h * 0.55, v === 1 ? 12 : 4);
        fs(c, col, 2);
      }
      rr(c, -w / 2, -h * 0.5, w, 8, 4);
      fs(c, def.kind === 'stool' ? col : dk, 2);
      legs(-h * 0.5 + 8, -w / 2 + 5, w / 2 - 5, h * 0.5 - 8);
      break;
    }
    case 'floorlamp':
    case 'tablelamp': {
      const fl = def.kind === 'floorlamp';
      c.fillStyle = INK;
      c.fillRect(-2, -h * 0.75, 4, h * 0.75);
      ell(c, 0, -2, w * 0.4, 4);
      fs(c, '#8f88a8', 2);
      c.beginPath();
      if (v === 1) c.arc(0, -h * 0.78, w * 0.42, Math.PI, 0);
      else {
        c.moveTo(-w * 0.3, -h);
        c.lineTo(w * 0.3, -h);
        c.lineTo(w * 0.5, -h * (fl ? 0.72 : 0.6));
        c.lineTo(-w * 0.5, -h * (fl ? 0.72 : 0.6));
      }
      c.closePath();
      fs(c, col, 2);
      break;
    }
    case 'plant':
    case 'cactus': {
      c.beginPath();
      c.moveTo(-w * 0.35, -h * 0.38);
      c.lineTo(w * 0.35, -h * 0.38);
      c.lineTo(w * 0.27, 0);
      c.lineTo(-w * 0.27, 0);
      c.closePath();
      fs(c, col, 2);
      if (def.kind === 'cactus') {
        rr(c, -8, -h, 16, h * 0.64, 8);
        fs(c, '#4fd67a', 2);
        rr(c, 6, -h * 0.75, 12, 8, 4);
        fs(c, '#4fd67a', 2);
        if (v === 1) {
          star(c, 0, -h, 6, 5, 0.5);
          fs(c, '#ff7ad9', 1.5);
        }
      } else
        for (let i = 0; i < 5; i++) {
          c.save();
          c.translate(0, -h * 0.4);
          c.rotate(-1.1 + i * 0.55);
          ell(c, 0, -h * 0.28, v === 2 ? 5 : 9, h * 0.3);
          fs(c, i % 2 ? '#4fd67a' : '#2fb39a', 1.8);
          c.restore();
        }
      break;
    }
    case 'poster':
    case 'painting': {
      rr(c, -w / 2, -h, w, h, 3);
      fs(c, def.kind === 'painting' ? '#c89a6a' : '#ffffff', 2.5);
      rr(c, -w / 2 + 6, -h + 6, w - 12, h - 12, 2);
      fs(c, col);
      c.save();
      c.clip();
      if (v === 0) {
        circ(c, w * 0.15, -h * 0.6, h * 0.15);
        fs(c, '#fff27a');
        c.beginPath();
        c.moveTo(-w / 2, -6);
        c.lineTo(-w * 0.1, -h * 0.5);
        c.lineTo(w * 0.2, -6);
        fs(c, shade(col, -0.3));
      } else if (v === 1) {
        heartPath(c, 0, -h * 0.4, h * 0.25);
        fs(c, '#ffffff');
      } else {
        star(c, 0, -h / 2, h * 0.28, 5, 0.45);
        fs(c, '#ffc93d', 1.5);
      }
      c.restore();
      break;
    }
    case 'rug': {
      if (v === 1) ell(c, 0, -h / 2, w / 2, h / 2);
      else rr(c, -w / 2, -h, w, h, v === 2 ? 2 : 12);
      fs(c, col, 2);
      if (v === 1) ell(c, 0, -h / 2, w * 0.35, h * 0.3);
      else rr(c, -w / 2 + 10, -h + 6, w - 20, h - 12, 8);
      c.lineWidth = 3;
      c.strokeStyle = lt;
      c.stroke();
      break;
    }
    case 'tv': {
      if (v !== 2) {
        rr(c, -w * 0.4, -h * 0.3, w * 0.8, h * 0.3, 3);
        fs(c, '#c89a6a', 2);
      }
      rr(c, -w / 2, -h, w, h * 0.66, v === 1 ? 10 : 3);
      fs(c, col, 2.5);
      rr(c, -w / 2 + 6, -h + 6, w - 12, h * 0.66 - 12, 3);
      const g = c.createLinearGradient(0, -h, 0, -h * 0.4);
      g.addColorStop(0, '#5866f0');
      g.addColorStop(1, '#46d9e6');
      fs(c, g);
      circ(c, -w * 0.12, -h * 0.72, 7);
      fs(c, '#fff27a');
      break;
    }
    case 'arcade': {
      rr(c, -w / 2, -h, w, h, 4);
      fs(c, col, 2.5);
      rr(c, -w / 2 + 6, -h + 18, w - 12, h * 0.32, 3);
      fs(c, '#262238', 2);
      circ(c, -6, -h * 0.55, 3);
      fs(c, '#ff5c7a');
      star(c, 8, -h * 0.6, 5, 4, 0.4);
      fs(c, '#4fd67a');
      rr(c, -w / 2 - 2, -h * 0.38, w + 4, 10, 3);
      fs(c, dk, 2);
      circ(c, -8, -h * 0.4, 3.5);
      fs(c, '#ff5c7a', 1.5);
      circ(c, 6, -h * 0.4, 3);
      fs(c, '#46d9e6', 1.5);
      rr(c, -w / 2, -h, w, 14, 4);
      fs(c, lt, 2);
      break;
    }
    case 'aquarium': {
      rr(c, -w / 2, -h * 0.3, w, h * 0.3, 3);
      fs(c, '#c89a6a', 2);
      rr(c, -w / 2, -h, w, h * 0.7, v === 1 ? 14 : 4);
      fs(c, alpha('#46d9e6', 0.7), 2.5);
      for (let i = 0; i < 3; i++) {
        const x = -w * 0.25 + i * w * 0.22,
          y = -h * 0.75 + (i % 2) * 14;
        ell(c, x, y, 7, 4.5);
        fs(c, i === 1 ? col : '#ff8a3d', 1.2);
        c.beginPath();
        c.moveTo(x + 6, y);
        c.lineTo(x + 11, y - 4);
        c.lineTo(x + 11, y + 4);
        fs(c, i === 1 ? col : '#ff8a3d');
      }
      c.fillStyle = '#4fd67a';
      c.fillRect(w * 0.3, -h * 0.55, 3, 20);
      break;
    }
    case 'bookcase':
    case 'wardrobe': {
      rr(c, -w / 2, -h, w, h, v === 1 ? 10 : 3);
      fs(c, col, 2.5);
      if (def.kind === 'wardrobe') {
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, -h + 6);
        c.lineTo(0, -6);
        c.stroke();
        circ(c, -6, -h / 2, 2.5);
        fs(c, '#ffc93d');
        circ(c, 6, -h / 2, 2.5);
        fs(c, '#ffc93d');
      } else
        for (let s = 0; s < 4; s++) {
          const y = -h + 8 + s * ((h - 10) / 4);
          c.fillStyle = dk;
          c.fillRect(-w / 2 + 5, y + (h - 10) / 4 - 4, w - 10, 4);
          for (let b = 0; b < 5; b++) {
            const bw = 7 + ((b * 3 + s) % 4);
            c.fillStyle = ['#ff5c7a', '#3fa0ff', '#ffc93d', '#4fd67a', '#c46bff'][(b + s) % 5];
            c.fillRect(-w / 2 + 7 + b * 12, y + 4, bw * 0.8, (h - 10) / 4 - 9);
          }
        }
      break;
    }
    case 'shelf': {
      rr(c, -w / 2, -6, w, 8, 2);
      fs(c, col, 2);
      for (let i = 0; i < 3; i++) {
        rr(c, -w / 2 + 8 + i * 24, -24, 14, 18, 3);
        fs(c, ['#ff7ad9', '#46d9e6', '#ffc93d'][i], 1.5);
      }
      break;
    }
    case 'fridge': {
      rr(c, -w / 2, -h, w, h, v === 1 ? 14 : 6);
      fs(c, col, 2.5);
      c.fillStyle = INK;
      c.fillRect(-w / 2, -h * 0.62, w, 2.5);
      c.fillRect(w / 2 - 12, -h + 14, 3, 20);
      c.fillRect(w / 2 - 12, -h * 0.5, 3, 24);
      star(c, -6, -h * 0.8, 6, 5, 0.5);
      fs(c, '#ffc93d', 1);
      break;
    }
    case 'stove':
    case 'sink':
    case 'counter': {
      rr(c, -w / 2, -h, w, h, 4);
      fs(c, col, 2.5);
      rr(c, -w / 2 - 2, -h - 4, w + 4, 8, 3);
      fs(c, '#d5d0e8', 2);
      if (def.kind === 'stove') {
        rr(c, -w / 2 + 8, -h + 16, w - 16, h - 26, 4);
        fs(c, '#262238', 2);
        circ(c, -w / 4, -h - 3, 6);
        fs(c, INK);
        circ(c, w / 4, -h - 3, 6);
        fs(c, INK);
      } else if (def.kind === 'sink') {
        ell(c, 0, -h - 1, w * 0.3, 3);
        fs(c, '#8f88a8');
        c.strokeStyle = '#8f88a8';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(0, -h - 4);
        c.lineTo(0, -h - 16);
        c.lineTo(8, -h - 16);
        c.stroke();
        c.strokeStyle = INK;
        c.lineWidth = 1.5;
        c.strokeRect(-w / 2 + 8, -h + 14, w / 2 - 12, h - 22);
        c.strokeRect(4, -h + 14, w / 2 - 12, h - 22);
      } else {
        for (let i = 0; i < 3; i++) {
          c.strokeStyle = INK;
          c.lineWidth = 1.5;
          c.strokeRect(-w / 2 + 6 + i * ((w - 12) / 3), -h + 12, (w - 12) / 3 - 4, h - 20);
        }
      }
      break;
    }
    case 'bathtub': {
      rr(c, -w / 2, -h * 0.75, w, h * 0.6, v === 1 ? 26 : 12);
      fs(c, col, 2.5);
      ell(c, 0, -h * 0.75, w / 2 - 6, 6);
      fs(c, '#bff6ff', 2);
      for (let i = 0; i < 5; i++) {
        circ(c, -w * 0.3 + i * 14, -h * 0.82 - (i % 2) * 5, 6);
        fs(c, '#ffffff', 1.2);
      }
      legs(-h * 0.16, -w / 2 + 14, w / 2 - 14, h * 0.16, '#ffc93d');
      break;
    }
    case 'toilet': {
      rr(c, -w / 2 + 6, -h, w - 12, h * 0.4, 5);
      fs(c, '#ffffff', 2.5);
      ell(c, 0, -h * 0.5, w / 2, 8);
      fs(c, col, 2.5);
      c.beginPath();
      c.moveTo(-w / 2 + 6, -h * 0.5);
      c.lineTo(-w / 4, 0);
      c.lineTo(w / 4, 0);
      c.lineTo(w / 2 - 6, -h * 0.5);
      fs(c, '#ffffff', 2.5);
      break;
    }
    case 'mirror': {
      if (v === 1) ell(c, 0, -h / 2, w / 2, h / 2);
      else rr(c, -w / 2, -h, w, h, v === 2 ? 2 : 10);
      fs(c, col, 2.5);
      if (v === 1) ell(c, 0, -h / 2, w / 2 - 5, h / 2 - 5);
      else rr(c, -w / 2 + 5, -h + 5, w - 10, h - 10, 6);
      fs(c, '#d8f6ff');
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-w * 0.2, -h * 0.75);
      c.lineTo(-w * 0.05, -h * 0.9);
      c.stroke();
      break;
    }
    case 'clock': {
      circ(c, 0, -h / 2, w / 2);
      fs(c, col, 2.5);
      circ(c, 0, -h / 2, w / 2 - 5);
      fs(c, '#ffffff');
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -h / 2);
      c.lineTo(0, -h / 2 - 11);
      c.moveTo(0, -h / 2);
      c.lineTo(8, -h / 2);
      c.stroke();
      break;
    }
    case 'window': {
      rr(c, -w / 2, -h, w, h, v === 1 ? w / 2 : 4);
      fs(c, '#ffffff', 2.5);
      rr(c, -w / 2 + 5, -h + 5, w - 10, h - 10, v === 1 ? w / 2 : 2);
      const g = c.createLinearGradient(0, -h, 0, 0);
      g.addColorStop(0, '#7fd0ff');
      g.addColorStop(1, '#d8f6ff');
      fs(c, g);
      circ(c, w * 0.15, -h * 0.4, 8);
      fs(c, '#ffffff');
      c.fillStyle = col;
      c.fillRect(-w / 2 - 8, -h - 4, 14, h + 6);
      c.fillRect(w / 2 - 6, -h - 4, 14, h + 6);
      break;
    }
    case 'piano': {
      rr(c, -w / 2, -h, w, h * 0.6, 6);
      fs(c, col, 2.5);
      rr(c, -w / 2 - 2, -h * 0.45, w + 4, 12, 2);
      fs(c, '#ffffff', 2);
      c.fillStyle = INK;
      for (let i = 0; i < 9; i++) c.fillRect(-w / 2 + 6 + i * 10, -h * 0.45, 4, 7);
      legs(-h * 0.33, -w / 2 + 8, w / 2 - 8, h * 0.33);
      break;
    }
    case 'guitar': {
      c.save();
      c.rotate(0.15);
      rr(c, -3, -h, 6, h * 0.6, 2);
      fs(c, '#8a5a3c', 1.5);
      ell(c, 0, -h * 0.22, w * 0.45, h * 0.18);
      fs(c, col, 2);
      ell(c, 0, -h * 0.4, w * 0.35, h * 0.13);
      fs(c, col, 2);
      circ(c, 0, -h * 0.3, 4);
      fs(c, INK);
      c.restore();
      break;
    }
    case 'speaker': {
      rr(c, -w / 2, -h, w, h, 5);
      fs(c, col, 2.5);
      circ(c, 0, -h * 0.32, w * 0.3);
      fs(c, '#262238', 2);
      circ(c, 0, -h * 0.75, w * 0.18);
      fs(c, '#262238', 2);
      break;
    }
    case 'discoball': {
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, -h);
      c.lineTo(0, -h * 0.6);
      c.stroke();
      circ(c, 0, -h * 0.35, w / 2);
      fs(c, '#d5d0e8', 2);
      c.save();
      c.clip();
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++) {
          c.fillStyle = (i + j) % 2 ? '#ffffff' : col;
          c.fillRect(i * 6 - 3, -h * 0.35 + j * 6 - 3, 5, 5);
        }
      c.restore();
      break;
    }
    case 'balloons': {
      const cols = [col, '#ff5c7a', '#ffc93d', '#46d9e6'];
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 14,
          y = -h + 18 + (i % 2) * 12;
        c.strokeStyle = INK;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y + 14);
        c.quadraticCurveTo(x + 4, -h * 0.4, 0, -4);
        c.stroke();
        if (v === 1) heartPath(c, x, y + 8, 14);
        else ell(c, x, y, 12, 15);
        fs(c, cols[i], 2);
        ell(c, x - 4, y - 5, 3, 5);
        fs(c, alpha('#ffffff', 0.6));
      }
      rr(c, -6, -8, 12, 8, 2);
      fs(c, '#8f88a8', 1.5);
      break;
    }
    case 'toybox': {
      rr(c, -w / 2, -h * 0.8, w, h * 0.8, 5);
      fs(c, col, 2.5);
      rr(c, -w / 2 - 3, -h, w + 6, 12, 4);
      fs(c, lt, 2.5);
      star(c, 0, -h * 0.4, 9, 5, 0.5);
      fs(c, '#ffc93d', 1.5);
      break;
    }
    case 'teddy': {
      circ(c, 0, -h * 0.3, w * 0.36);
      fs(c, col, 2);
      circ(c, 0, -h * 0.75, w * 0.3);
      fs(c, col, 2);
      circ(c, -w * 0.25, -h * 0.95, 6);
      fs(c, col, 2);
      circ(c, w * 0.25, -h * 0.95, 6);
      fs(c, col, 2);
      circ(c, -4, -h * 0.78, 2);
      fs(c, INK);
      circ(c, 4, -h * 0.78, 2);
      fs(c, INK);
      ell(c, 0, -h * 0.68, 5, 3.5);
      fs(c, lt);
      break;
    }
    case 'beanbag': {
      c.beginPath();
      c.moveTo(-w / 2, 0);
      c.quadraticCurveTo(-w / 2, -h, 0, -h);
      c.quadraticCurveTo(w / 2, -h, w / 2, 0);
      c.closePath();
      fs(c, col, 2.5);
      ell(c, -w * 0.15, -h * 0.65, 8, 5);
      fs(c, alpha('#ffffff', 0.4));
      break;
    }
    case 'computer': {
      rr(c, -w / 2, -h, w, h * 0.72, 4);
      fs(c, col, 2);
      rr(c, -w / 2 + 4, -h + 4, w - 8, h * 0.72 - 8, 2);
      fs(c, '#3fa0ff');
      c.fillStyle = INK;
      c.fillRect(-3, -h * 0.28, 6, h * 0.22);
      rr(c, -w * 0.3, -6, w * 0.6, 6, 2);
      fs(c, '#8f88a8', 1.5);
      break;
    }
    case 'fireplace': {
      rr(c, -w / 2, -h, w, h, 4);
      fs(c, col, 2.5);
      rr(c, -w / 2 - 6, -h - 6, w + 12, 10, 3);
      fs(c, shade(col, -0.25), 2);
      c.beginPath();
      c.moveTo(-w * 0.3, 0);
      c.lineTo(-w * 0.3, -h * 0.5);
      c.arc(0, -h * 0.5, w * 0.3, Math.PI, 0);
      c.lineTo(w * 0.3, 0);
      fs(c, '#262238', 2);
      c.beginPath();
      c.moveTo(-14, -2);
      c.quadraticCurveTo(-10, -30, 0, -36);
      c.quadraticCurveTo(10, -30, 14, -2);
      fs(c, '#ff8a3d');
      c.beginPath();
      c.moveTo(-7, -2);
      c.quadraticCurveTo(-4, -18, 0, -22);
      c.quadraticCurveTo(4, -18, 7, -2);
      fs(c, '#fff27a');
      break;
    }
    case 'garland': {
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-w / 2, -h);
      c.quadraticCurveTo(0, -h + 26, w / 2, -h);
      c.stroke();
      for (let i = 0; i < 9; i++) {
        const tt = (i + 0.5) / 9;
        const x = -w / 2 + tt * w;
        const y = -h + 2 * tt * (1 - tt) * 26;
        c.beginPath();
        if (v === 1) circ(c, x, y + 6, 6);
        else {
          c.moveTo(x - 7, y);
          c.lineTo(x + 7, y);
          c.lineTo(x, y + 14);
          c.closePath();
        }
        fs(c, i % 3 === 0 ? col : i % 3 === 1 ? '#ffc93d' : '#46d9e6', 1.2);
      }
      break;
    }
  }
  c.restore();
}

/* ---------------- sujeira ---------------- */
const MESS_COL: Record<string, [string, string]> = {
  cake: ['#ffe0a3', '#ff7ad9'],
  frosting: ['#ff9ad9', '#ffffff'],
  juice: ['#ff8a3d', '#ffc93d'],
  crumbs: ['#c89a6a', '#8a5a3c'],
  confetti: ['#ff5c7a', '#46d9e6'],
  tomato: ['#ff4f4f', '#ff9a8a'],
  pie: ['#ffe680', '#c89a6a'],
  'balloon-pop': ['#ff5c7a', '#ffc93d'],
  mud: ['#8a5a3c', '#5b3a29'],
};
export function drawMess(c: CanvasRenderingContext2D, m: MessItem, fade = 1): void {
  const [a, b] = MESS_COL[m.kind] ?? MESS_COL.mud;
  const r = mulberry(parseInt(m.id.slice(-6), 36) || 1);
  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, fade));
  c.translate(m.x, m.y);
  c.rotate(m.rot ?? 0);
  const onFloor = m.y > WALL_Y;
  if (onFloor) c.scale(1, 0.55);
  const R = m.r;
  if (m.kind === 'crumbs' || m.kind === 'confetti' || m.kind === 'balloon-pop') {
    for (let i = 0; i < 14; i++) {
      const ang = r() * TAU,
        d = r() * R;
      c.fillStyle = m.kind === 'confetti' ? ['#ff5c7a', '#46d9e6', '#ffc93d', '#4fd67a', '#c46bff'][i % 5] : i % 2 ? a : b;
      if (m.kind === 'balloon-pop' && i < 3) {
        c.beginPath();
        c.ellipse(Math.cos(ang) * d * 0.5, Math.sin(ang) * d * 0.5, R * 0.35, R * 0.18, ang, 0, TAU);
        c.fill();
      } else c.fillRect(Math.cos(ang) * d - 2, Math.sin(ang) * d - 2, m.kind === 'crumbs' ? 4 : 5, m.kind === 'crumbs' ? 4 : 3);
    }
  } else {
    c.fillStyle = a;
    circ(c, 0, 0, R);
    c.fill();
    for (let k = 0; k < 7; k++) {
      const ang = r() * TAU,
        d = R * (0.7 + r() * 0.6);
      circ(c, Math.cos(ang) * d, Math.sin(ang) * d, R * (0.18 + r() * 0.3));
      c.fill();
    }
    if (!onFloor && m.kind !== 'mud') {
      // escorrendo na parede
      for (let k = 0; k < 3; k++) {
        const x = (r() - 0.5) * R * 1.2;
        rr(c, x - 3, 0, 6, R * (0.8 + r()), 3);
        c.fill();
      }
    }
    c.fillStyle = b;
    circ(c, -R * 0.2, -R * 0.2, R * 0.45);
    c.fill();
    c.fillStyle = alpha('#ffffff', 0.55);
    ell(c, -R * 0.35, -R * 0.4, R * 0.18, R * 0.1);
    c.fill();
    if (m.kind === 'cake' || m.kind === 'pie') {
      c.fillStyle = '#ff5c7a';
      circ(c, R * 0.3, -R * 0.1, R * 0.15);
      c.fill();
    }
  }
  c.restore();
}

/* ---------------- render de cômodo com cache ---------------- */
export interface ItemView {
  id: string;
  x: number;
  y: number;
  flip?: boolean;
  color?: string;
  layer?: number;
}
export function sortedItems<T extends ItemView>(items: T[]): T[] {
  return items.slice().sort((p, q) => {
    const dp = furnById(p.id),
      dq = furnById(q.id);
    const kp = dp?.flat ? -2 : dp?.wall ? -1 : 0;
    const kq = dq?.flat ? -2 : dq?.wall ? -1 : 0;
    return kp - kq || (p.layer ?? 0) - (q.layer ?? 0) || p.y - q.y;
  });
}
export function drawItems(c: CanvasRenderingContext2D, items: ItemView[], skip?: number): void {
  const s = sortedItems(items);
  for (let i = 0; i < s.length; i++) {
    const it = s[i];
    if (skip !== undefined && items[skip] === it) continue;
    const def = furnById(it.id);
    if (!def) continue;
    c.save();
    c.translate(it.x, it.y);
    drawFurn(c, def, it.color, it.flip);
    c.restore();
  }
}
/** caixa (lógica) do item p/ toque */
export function itemBox(it: ItemView): [number, number, number, number] {
  const d = furnById(it.id)!;
  if (d.wall) return [it.x - d.w / 2, it.y - d.h / 2, d.w, d.h];
  return [it.x - d.w / 2, it.y - d.h, d.w, d.h];
}
