/**
 * Respostas FIXAS da "IA" do Cava & Fala para testes locais (CAVA_AI_MOCK=fixtures) — nenhuma rede.
 * Mesmo formato que o modelo devolve (planFromModel valida tudo de novo).
 */
const F: [RegExp, Record<string, unknown>][] = [
  [
    /ornitorrinco|platypus/,
    { safe: true, name: 'Ornitorrinco', desc: 'Nada e tem bico de pato!', base: 'lontra', theme: '', with: [], colors: ['brown', 'orange', 'tan'], size: 'normal', behaviors: [{ type: 'floats', power: 0.6 }, { type: 'walks', power: 0.4 }], extra: [{ shape: 'box', size: [0.7, 0.15, 0.6], pos: [0, 0.5, 1.2], rot: [0, 0, 0], color: 'orange', mat: 'rubber' }], learn: 'ornitorrinco' },
  ],
  [
    /axolote|axolotl/,
    { safe: true, name: 'Axolote Sorridente', desc: 'Um bichinho rosa que nada!', base: 'lagarto', theme: '', with: ['chifres'], colors: ['pink', 'peach', 'magenta'], size: 'big', behaviors: [{ type: 'floats', power: 0.6 }, { type: 'follows', power: 0.5 }], extra: [], learn: 'axolote' },
  ],
  [/explod|perigos|unsafe-test/, { safe: false, name: '', desc: '', base: 'bola', theme: '', with: [], colors: [], size: 'normal', behaviors: [], extra: [], learn: '' }],
];
export function CAVA_FIXTURES(text: string): Record<string, unknown> {
  const t = text.toLowerCase();
  for (const [re, o] of F) if (re.test(t)) return JSON.parse(JSON.stringify(o));
  return { safe: true, name: '', desc: '', base: 'monstro', theme: '', with: [], colors: ['purple', 'lime', 'pink'], size: 'normal', behaviors: [{ type: 'jumps', power: 0.5 }], extra: [], learn: '' };
}
