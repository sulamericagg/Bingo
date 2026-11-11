// Página de desenvolvimento: abre um minijogo de conserto direto.
//   ?g=tyre|electric|part|bushing|brake  &heavy=1  &lvl=0..3  &art=hose|pin|alt|rotor|cyl
import '../../src/ui/styles.css';
import { openGame } from '../../src/games/garimpo/repair/games';
import type { BreakKind, PartArt } from '../../src/games/garimpo/repair/model';

const q = new URLSearchParams(location.search);
const kind = (q.get('g') || 'tyre') as BreakKind;
const heavy = q.get('heavy') === '1';
const art = (q.get('art') || 'alt') as PartArt;
const app = document.getElementById('app')!;
app.style.cssText += ';position:fixed;inset:0;overflow:hidden';
const bodies: Record<string, [string, string]> = { pickup: ['#1f8f8a', '#0f5652'], truck: ['#e8651e', '#9c3c0c'], yellow: ['#f2b20f', '#a87708'], heli: ['#d23a2a', '#7e1a12'] };
const kindOf = heavy ? 'truck' : art === 'hose' ? 'excavator' : art === 'pin' ? 'dozer' : art === 'rotor' ? 'heli' : 'pickup';
const [body, bodyD] = bodies[heavy ? 'truck' : art === 'hose' || art === 'pin' ? 'yellow' : art === 'rotor' ? 'heli' : 'pickup'];
const ov = openGame(app, kind, { level: Number(q.get('lvl') ?? 1), veh: { kind: kindOf, body, bodyD, heavy, art } }, (ok, b) => {
  document.title = 'done:' + ok + ':' + b;
});
(window as unknown as { __mg: unknown }).__mg = ov.g;
