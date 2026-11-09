/**
 * Marca do estúdio TEAM Ross (monograma original "TR" com órbita).
 * Isolado aqui para ser trocado facilmente quando o estúdio tiver um logo oficial
 * (ex.: se src/ui/intro.ts passar a exportar um desenho, basta reexportar daqui).
 */

const rr = (x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number): void => {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
};

/** Selo quadrado arredondado com o monograma. `size` = lado do selo em px. */
export function drawTeamRossMark(x: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size;
  const X = cx - s / 2;
  const Y = cy - s / 2;
  x.save();
  // sombra/brilho externo
  x.shadowColor = 'rgba(255,90,140,0.55)';
  x.shadowBlur = s * 0.12;
  rr(x, X, Y, s, s, s * 0.26);
  const g = x.createLinearGradient(X, Y, X + s, Y + s);
  g.addColorStop(0, '#ffb13c');
  g.addColorStop(0.45, '#ff4f8b');
  g.addColorStop(1, '#6a3cff');
  x.fillStyle = g;
  x.fill();
  x.shadowBlur = 0;
  // brilho de vidro
  x.save();
  rr(x, X, Y, s, s, s * 0.26);
  x.clip();
  const gl = x.createLinearGradient(0, Y, 0, Y + s * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,0.35)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gl;
  x.beginPath();
  x.ellipse(cx - s * 0.1, Y + s * 0.08, s * 0.75, s * 0.42, -0.25, 0, Math.PI * 2);
  x.fill();
  x.restore();
  // borda interna
  rr(x, X + s * 0.03, Y + s * 0.03, s * 0.94, s * 0.94, s * 0.23);
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = s * 0.012;
  x.stroke();

  const ring = (front: boolean): void => {
    x.save();
    x.translate(cx, cy + s * 0.02);
    x.rotate(-0.42);
    x.beginPath();
    if (front) x.ellipse(0, 0, s * 0.42, s * 0.13, 0, 0, Math.PI);
    else x.ellipse(0, 0, s * 0.42, s * 0.13, 0, Math.PI, Math.PI * 2);
    x.strokeStyle = front ? '#fff7c2' : 'rgba(255,247,194,0.55)';
    x.lineWidth = s * 0.035;
    x.lineCap = 'round';
    x.stroke();
    if (front) {
      // pequeno "planeta" viajando na órbita
      const a = 0.62;
      const px = Math.cos(a) * s * 0.42;
      const py = Math.sin(a) * s * 0.13;
      x.fillStyle = '#ffffff';
      x.shadowColor = '#fff7c2';
      x.shadowBlur = s * 0.05;
      x.beginPath();
      x.arc(px, py, s * 0.055, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
  };
  ring(false);
  // monograma
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.font = `700 ${s * 0.5}px Fredoka`;
  const base = cy + s * 0.18;
  x.fillStyle = 'rgba(40,6,70,0.35)';
  x.fillText('TR', cx + s * 0.015, base + s * 0.025);
  x.fillStyle = '#ffffff';
  x.fillText('TR', cx, base);
  ring(true);
  // estrelinha de 4 pontas no canto
  const star = (sx: number, sy: number, r: number): void => {
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.28 : r;
      x.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad);
    }
    x.closePath();
    x.fillStyle = '#ffffff';
    x.fill();
  };
  star(X + s * 0.8, Y + s * 0.2, s * 0.07);
  star(X + s * 0.2, Y + s * 0.82, s * 0.04);
  x.restore();
}

/** Selo + palavra "TEAM ROSS" embaixo. `size` = lado do selo. Retorna a altura total. */
export function drawTeamRossLockup(x: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#ffffff'): number {
  drawTeamRossMark(x, cx, cy, size);
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'top';
  const fs = size * 0.26;
  x.font = `700 ${fs}px Fredoka`;
  (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${fs * 0.12}px`;
  x.fillStyle = color;
  x.shadowColor = 'rgba(0,0,0,0.35)';
  x.shadowBlur = fs * 0.2;
  x.fillText('TEAM ROSS', cx + fs * 0.06, cy + size * 0.62);
  x.restore();
  return size * 0.62 + fs * 1.2 + size / 2;
}
