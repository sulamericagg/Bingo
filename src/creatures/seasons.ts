/**
 * AGENDA DAS 60 TEMPORADAS DO PASSE (dez/2026 → nov/2031), uma por mês.
 * Fonte única de verdade para Passe (temas, cores do HUD, pop-ups) e Criaturas.
 */
export interface SeasonInfo {
  index: number; // 0..59
  id: string; // 's00'..'s59'
  start: string; // ISO (00:00 horário de Brasília, dia 1 do mês)
  end: string; // ISO exclusivo (início da próxima)
  theme: string; // tema (pt-BR)
  palette: [string, string, string]; // fundo escuro, destaque, destaque 2
}

const THEMES: [string, [string, string, string]][] = [
  ['Natal Estelar', ['#0b1a2e', '#ff4f6a', '#5ef0a0']],
  ['Ano Novo Cósmico', ['#120a2e', '#ffd84a', '#c7a6ff']],
  ['Carnaval Galáctico', ['#1e0638', '#ff5cc8', '#ffe14f']],
  ['Selva Encantada', ['#03190f', '#6dff8a', '#ffb347']],
  ['Doces e Confeitos', ['#2a0b2e', '#ff8fd2', '#8ffff0']],
  ['Fundo do Mar', ['#021a2e', '#4fd6ff', '#ff9a6b']],
  ['Festa Junina Espacial', ['#2a0f05', '#ffb000', '#ff4f4f']],
  ['Robôs e Engrenagens', ['#0e1420', '#00e5ff', '#ffb000']],
  ['Dinossauros', ['#13200a', '#a0e050', '#ff7a3c']],
  ['Piratas das Estrelas', ['#0a1426', '#ffd166', '#ef476f']],
  ['Monstrinhos do Halloween', ['#1a0826', '#ff8c1a', '#9b5cff']],
  ['Inverno Polar', ['#06182a', '#bff3ff', '#7aa8ff']],
  ['Reino dos Dragões', ['#200a0a', '#ff5a1f', '#ffd84a']],
  ['Festival de Música', ['#14052e', '#ff3cac', '#3cf0ff']],
  ['Esportes Radicais', ['#04162a', '#3cff8c', '#ff6b3c']],
  ['Mundo Pixel', ['#0a0a1e', '#4fff7a', '#ff4fd8']],
  ['Castelo Mágico', ['#1a0a30', '#c99bff', '#ffe08a']],
  ['Safári Lunar', ['#1e1608', '#ffcf6b', '#7ad1ff']],
  ['Cidade Neon', ['#08061a', '#ff2bd6', '#2bffea']],
  ['Jardim das Fadas', ['#0c1a12', '#ffa6e0', '#a6ffcf']],
  ['Agentes Secretos', ['#0a0e14', '#e0e0e0', '#ff3b5c']],
  ['Vulcões e Lava', ['#1e0505', '#ff5a1f', '#ffe14f']],
  ['Circo das Galáxias', ['#200814', '#ff4f6a', '#4fc3ff']],
  ['Samurais do Cosmos', ['#14060a', '#ff3b3b', '#f5e6c8']],
  ['Ilha Tropical', ['#022024', '#3cffd0', '#ffcf2e']],
  ['Laboratório Maluco', ['#0a1a0a', '#9dff3c', '#c74fff']],
  ['Cavaleiros do Arco-íris', ['#120a2e', '#ff5c5c', '#5cc8ff']],
  ['Faroeste Espacial', ['#24140a', '#ffb347', '#d9534f']],
  ['Mitologia Estelar', ['#0e0a24', '#ffd84a', '#7dfcff']],
  ['Super-Heróis Bloop', ['#0a0e2e', '#ff3b3b', '#3b8bff']],
  ['Cozinha Intergaláctica', ['#24100a', '#ffb000', '#ff6b9d']],
  ['Cristais e Gemas', ['#100a24', '#b06bff', '#6dfcff']],
  ['Festa do Pijama', ['#0e0a24', '#ffa6c9', '#a6c9ff']],
  ['Ninjas da Lua', ['#08081a', '#8f9dd8', '#ff3b5c']],
  ['Planeta Gelatina', ['#1e0a24', '#ff6bd5', '#6bff9e']],
  ['Aventura Egípcia', ['#241a08', '#ffd84a', '#3cc8c8']],
  ['Viagem no Tempo', ['#0a1424', '#7dfcff', '#ffb347']],
  ['Brinquedoteca', ['#1a0a24', '#ff4f8b', '#4fc3ff']],
  ['Bosque Outonal', ['#1e0f05', '#ff8c3c', '#ffd84a']],
  ['Mergulho Abissal', ['#020c1e', '#3cf0ff', '#b06bff']],
  ['Copa das Estrelas', ['#04200e', '#ffe14f', '#3cff6b']],
  ['Steampunk', ['#1e1208', '#d9a066', '#5ef0ff']],
  ['Festival das Lanternas', ['#1e0808', '#ff4f4f', '#ffd84a']],
  ['Pinguins e Neve', ['#06142a', '#ffffff', '#4fb5ff']],
  ['Alienígenas Fofinhos', ['#081e14', '#7dff6b', '#d46bff']],
  ['Mundo dos Insetos', ['#0e1a06', '#c4ff3c', '#ff6b3c']],
  ['Realeza Galáctica', ['#14061e', '#ffd84a', '#ff4f8b']],
  ['Monstros Marinhos', ['#021a24', '#3cffb0', '#ff5c8a']],
  ['Corrida Turbo', ['#0e0e14', '#ff3b3b', '#ffd84a']],
  ['Nuvens e Céu', ['#0a1a30', '#ffffff', '#ffb6e6']],
  ['Detetives Bloop', ['#0e0a14', '#ffcf6b', '#7d9dff']],
  ['Floresta de Cogumelos', ['#14081e', '#ff5c8a', '#6bffd0']],
  ['Olimpíadas Espaciais', ['#06142a', '#ffd84a', '#3cff8c']],
  ['Bruxinhos e Poções', ['#120624', '#9b5cff', '#6dff8a']],
  ['Robôs Gigantes', ['#0a0e1a', '#3b8bff', '#ff8c1a']],
  ['Deserto das Miragens', ['#24180a', '#ffb347', '#ff6bd5']],
  ['Aurora Boreal', ['#020e1a', '#3cffb0', '#b06bff']],
  ['Parque de Diversões', ['#1e0a1a', '#ff4f8b', '#ffe14f']],
  ['Lendas do Universo', ['#0a0624', '#ffd84a', '#ff3cac']],
  ['Aniversário de 5 Anos', ['#14061e', '#ff5cc8', '#5ef0ff']],
];

/** Temporada 0 começa em 1º/dez/2026 00:00 (UTC-3). */
export const SEASONS: SeasonInfo[] = THEMES.map(([theme, palette], i) => {
  const y = 2026 + Math.floor((11 + i) / 12);
  const m = (11 + i) % 12; // 0-based
  const y2 = 2026 + Math.floor((12 + i) / 12);
  const m2 = (12 + i) % 12;
  const iso = (yy: number, mm: number) => `${yy}-${String(mm + 1).padStart(2, '0')}-01T03:00:00.000Z`;
  return { index: i, id: `s${String(i).padStart(2, '0')}`, start: iso(y, m), end: iso(y2, m2), theme, palette };
});

/** Temporada vigente para uma data (ou null antes de dez/2026 / depois de nov/2031). */
export function seasonAt(date = new Date()): SeasonInfo | null {
  const t = date.getTime();
  return SEASONS.find((s) => t >= Date.parse(s.start) && t < Date.parse(s.end)) ?? null;
}
