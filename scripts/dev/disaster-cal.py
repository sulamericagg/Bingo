#!/usr/bin/env python3
"""Calibração por desastre (catalog.ts CAL): lê o JSON do banco 2D e propõe o fator de intensidade
para o bot-médio chegar perto de 55% (meta 40–70%). Uso:
  node scripts/dev/disaster-bench.mjs --rounds 2 --set all --json bench.json
  python3 scripts/dev/disaster-cal.py bench.json [cal_atual.json] > novo_cal.json
"""
import json, sys
res = json.load(open(sys.argv[1]))
old = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
out = {}
for k, r in res.items():
    avg = r['avg']
    c = old.get(k, 1.0)
    if 40 <= avg <= 70:
        f = 1.0
    else:
        # I mais alto = mais difícil: acima da meta sobe, abaixo desce (passo moderado, o banco é ruidoso)
        f = 1 + (avg - 55) / 100 * 0.8
    c = max(0.6, min(1.45, c * f))
    if abs(c - 1) > 0.02:
        out[k] = round(c, 2)
print(json.dumps(out, indent=1, sort_keys=True))
