/* CSS do Desenha e Vira! (injetado uma vez; prefixo .dv-). Visual de estúdio de artes:
 * papel creme, contorno de nanquim, botões "gordinhos" de giz de cera. */
const CSS = `
.dv-root{position:absolute;inset:0;overflow:hidden;background:#bfe6ff;font-family:var(--font,Fredoka,system-ui,sans-serif);color:#2a1e3a;user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent;--ink:#2a1e3a;--cream:#fff7e8;--hot:#ff5e3a}
.dv-root *{box-sizing:border-box}
.dv-root button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}
.dv-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.dv-layer{position:absolute;inset:0;z-index:1}
.dv-grow{flex:1}
.dv-ic{flex:none}
.dv-btn{pointer-events:auto;border:3px solid var(--ink);border-radius:16px;background:#fff;color:var(--ink);box-shadow:0 4px 0 var(--ink);padding:7px 13px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:16px;line-height:1;white-space:nowrap;touch-action:manipulation}
.dv-btn:active,.dv-btn.tc-pressed{transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.dv-btn.dv-ic{width:46px;height:46px;padding:0;justify-content:center;border-radius:15px}
.dv-gold{background:linear-gradient(#fff2a0,#ffd23d 55%,#ffad1f)}
.dv-ghost{background:rgba(255,255,255,.88)}
.dv-btn[disabled]{opacity:.45;pointer-events:none}
/* ---------- HUD do ateliê ---------- */
.dv-hud,.dv-chud{position:absolute;inset:0;pointer-events:none;z-index:4;transition:opacity .2s}
.dv-hud.dv-off{opacity:0}
.dv-hud.dv-off *{pointer-events:none!important}
.dv-top{position:absolute;left:var(--edge-l,12px);right:var(--edge-r,12px);top:var(--edge-t,8px);display:flex;align-items:center;gap:8px;pointer-events:none}
.dv-top>*{pointer-events:auto}
.dv-top .dv-grow{pointer-events:none}
.dv-ret{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1.5px rgba(42,30,58,.5);transition:transform .15s,border-color .15s}
.dv-aim .dv-ret{transform:scale(1.9);border-color:#ffd23d}
.dv-piloting .dv-ret,.dv-piloting .dv-acts,.dv-piloting .dv-ctx,.dv-piloting .dv-top{display:none}
.dv-acts{position:absolute;right:var(--edge-r,12px);bottom:var(--edge-b,12px);display:flex;align-items:flex-end;gap:10px}
.dv-act{pointer-events:auto;width:84px;height:84px;border-radius:50%;border:3.5px solid var(--ink);background:radial-gradient(circle at 35% 30%,#fff,#ffe9b0 60%,#ffc94a);box-shadow:0 5px 0 var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-weight:700;font-size:13px;color:var(--ink);opacity:.55;transition:opacity .15s}
.dv-act.tc-pressed{transform:translateY(3px);box-shadow:0 2px 0 var(--ink)}
.dv-aim .dv-main,.dv-holding .dv-main{opacity:1}
.dv-throw{width:68px;height:68px;display:none;opacity:1;background:radial-gradient(circle at 35% 30%,#fff,#ffc2d6 60%,#ff6fa2)}
.dv-holding .dv-throw{display:flex}
.dv-ctx{position:absolute;left:50%;bottom:var(--edge-b,12px);transform:translate(-50%,130%);display:flex;gap:6px;padding:6px;border-radius:20px;background:rgba(255,255,255,.82);border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink);transition:transform .2s cubic-bezier(.3,1.4,.5,1)}
.dv-hasc .dv-ctx{transform:translate(-50%,0)}
.dv-cb{pointer-events:auto;width:58px;height:50px;border:0;border-radius:13px;background:#f3ecff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:10px;font-weight:700;color:var(--ink)}
.dv-cb span{max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv-cb.tc-pressed{background:#ffe08a}
.dv-cb.dv-red{background:#ffe0e4;color:#c4183c}
.dv-cb.dv-go{background:#d6ffe0;color:#0b6b30;display:none}
.dv-isveh .dv-cb[data-k=drive],.dv-isfly .dv-cb[data-k=fly]{display:flex}
.dv-pilotbar{position:absolute;right:var(--edge-r,12px);bottom:var(--edge-b,12px);display:none;align-items:flex-end;gap:10px}
.dv-piloting .dv-pilotbar{display:flex}
.dv-pilotbar .dv-act{width:66px;height:66px;opacity:1}
.dv-pv .dv-p-up,.dv-pv .dv-p-down{display:none}
/* ---------- painel de desenho ---------- */
.dv-draw{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;gap:12px;padding:var(--edge-t,8px) var(--edge-r,12px) var(--edge-b,12px) var(--edge-l,12px);transition:opacity .2s;perspective:900px}
.dv-draw.dv-hide{opacity:0;pointer-events:none}
.dv-draw.dv-hide *{pointer-events:none!important}
.dv-sheet{background:radial-gradient(ellipse at center,rgba(255,236,214,.78),rgba(70,36,100,.78))}
.dv-paper{position:relative;flex:none;border-radius:6px;background:#fffaf0;box-shadow:0 2px 0 #e9dcc3,0 4px 0 #ddcca9,0 12px 26px rgba(40,10,60,.35);transform:rotate(-.6deg);overflow:hidden}
.dv-sheet .dv-paper{background-image:linear-gradient(rgba(120,160,220,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,220,.13) 1px,transparent 1px);background-size:24px 24px;background-color:#fffaf0}
.dv-sheet .dv-paper::before{content:'';position:absolute;left:50%;top:-6px;width:84px;height:22px;margin-left:-42px;background:rgba(255,220,120,.75);transform:rotate(2deg);box-shadow:0 1px 2px rgba(0,0,0,.15);z-index:2;pointer-events:none}
.dv-art{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair}
.dv-symline{position:absolute;left:50%;top:0;bottom:0;width:0;border-left:2px dashed rgba(138,92,255,.55);display:none;pointer-events:none}
.dv-symline.on{display:block}
.dv-paper.dv-lift{animation:dvLift .52s cubic-bezier(.5,0,.75,.4) forwards}
@keyframes dvLift{0%{transform:rotate(-.6deg)}25%{transform:rotate(-2deg) scale(1.05)}100%{transform:translateY(-55%) rotateX(62deg) scale(.55);opacity:0}}
.dv-rail{display:flex;flex-direction:column;gap:6px;padding:7px;border-radius:20px;background:#fff;border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink);flex:none}
.dv-tb{width:46px;height:44px;border:0;border-radius:12px;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--ink);position:relative}
.dv-tb span{display:none}
.dv-tb.on{background:#ffe08a;box-shadow:inset 0 0 0 2.5px var(--ink)}
.dv-tb[disabled]{opacity:.3}
.dv-sep{height:2px;background:#eadff7;margin:2px 4px}
.dv-side{display:flex;flex-direction:column;gap:8px;width:244px;flex:none}
.dv-pal{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px;border-radius:18px;background:#fff;border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink)}
.dv-sw{aspect-ratio:1;border-radius:50%;border:2.5px solid var(--ink);background:var(--c);padding:0;transition:transform .12s}
.dv-sw.on{transform:scale(1.18);box-shadow:0 0 0 3px #fff,0 0 0 5.5px var(--ink)}
.dv-sizes{display:flex;gap:6px;justify-content:space-between;padding:5px 8px;border-radius:16px;background:#fff;border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink)}
.dv-sz{flex:1;height:34px;border:0;border-radius:10px;background:transparent;display:flex;align-items:center;justify-content:center}
.dv-sz i{display:block;border-radius:50%;background:var(--ink)}
.dv-sz.on{background:#ffe08a}
.dv-mats{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.dv-mat{position:relative;border:3px solid var(--ink);border-radius:15px;background:#fff;box-shadow:0 3px 0 var(--ink);padding:5px 6px 5px 40px;text-align:left;min-height:52px;display:flex;flex-direction:column;justify-content:center}
.dv-mat .dv-ic{position:absolute;left:7px;top:50%;margin-top:-13px;color:#8a5cff}
.dv-mat b{font-size:15px;line-height:1.05}
.dv-mat small{font-size:10.5px;line-height:1.1;opacity:.75}
.dv-mat em{position:absolute;right:-6px;top:-9px;font-style:normal;font-size:10px;font-weight:700;background:#8a5cff;color:#fff;border:2px solid var(--ink);border-radius:8px;padding:1px 5px;display:none}
.dv-mat.on{background:linear-gradient(#e9dcff,#cdb6ff);transform:translateY(-1px)}
.dv-mat.on .dv-ic{color:var(--ink)}
.dv-mat.auto em{display:block}
.dv-mat[disabled]{opacity:.35}
.dv-extras{display:flex;gap:6px;flex-wrap:wrap}
.dv-extras:empty,.dv-extras:not(:has(.dv-chip:not([hidden]))){display:none}
.dv-chip{display:inline-flex;align-items:center;gap:5px;border:2.5px solid var(--ink);border-radius:999px;background:#fff;padding:4px 10px 4px 7px;font-weight:700;font-size:13px;animation:dvWiggle 1.6s ease-in-out infinite}
.dv-chip[hidden]{display:none}
.dv-chip.on{background:#8be04e;animation:none}
@keyframes dvWiggle{0%,100%{transform:rotate(0)}10%{transform:rotate(-4deg)}20%{transform:rotate(4deg)}30%{transform:rotate(0)}}
.dv-bum{position:relative;height:62px;border:3.5px solid var(--ink);border-radius:20px;background:linear-gradient(#ffb36b,#ff5e3a 55%,#e8323a);box-shadow:0 5px 0 var(--ink);color:#fff;font-size:30px;font-weight:700;letter-spacing:1px;overflow:hidden}
.dv-root .dv-bum{color:#fff}
.dv-bum span{-webkit-text-stroke:3px var(--ink);paint-order:stroke fill;display:inline-block}
.dv-bum:not([disabled]) span{animation:dvBumPulse 1.1s ease-in-out infinite}
.dv-bum:active{transform:translateY(3px);box-shadow:0 2px 0 var(--ink)}
.dv-bum[disabled]{filter:grayscale(.85);opacity:.6}
@keyframes dvBumPulse{50%{transform:scale(1.1) rotate(-3deg)}}
.dv-x{position:absolute;right:var(--edge-r,12px);top:var(--edge-t,8px);width:44px;height:44px;border-radius:14px;border:3px solid var(--ink);background:#fff;box-shadow:0 3px 0 var(--ink);display:flex;align-items:center;justify-content:center}
.dv-stage{position:relative;flex:none;display:flex}
.dv-tipb{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:4;background:#8a5cff;color:#fff;border:3px solid var(--ink);border-radius:16px;padding:6px 14px;font-weight:700;font-size:15px;white-space:nowrap;box-shadow:0 4px 0 var(--ink);pointer-events:none}
.dv-tipb[hidden]{display:none}
.dv-tipb.pop{animation:dvPop .35s cubic-bezier(.3,1.6,.5,1)}
.dv-ink{position:absolute;left:50%;top:-4px;transform:translate(-50%,-100%);display:flex;align-items:center;gap:6px;background:#fff;border:2.5px solid var(--ink);border-radius:999px;padding:3px 9px;color:#3d7cf0;z-index:3}
.dv-ink[hidden]{display:none}
.dv-inkbar{width:120px;height:10px;border-radius:6px;background:#e3ecff;overflow:hidden;border:1.5px solid var(--ink)}
.dv-inkbar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#3d7cf0,#22c3c9);transition:width .15s}
.dv-ink.low .dv-inkbar i{background:#ff4d5e}
.dv-inkout .dv-ink{animation:dvShake .4s}
@keyframes dvShake{20%,60%{transform:translate(-56%,-100%)}40%,80%{transform:translate(-44%,-100%)}}
.dv-pulse{animation:dvPulse 1s ease-in-out infinite}
@keyframes dvPulse{50%{box-shadow:0 0 0 6px rgba(255,210,61,.95),0 0 22px 8px rgba(255,210,61,.6)}}
.dv-paper.dv-pulse{animation:dvPulseP 1.2s ease-in-out infinite}
@keyframes dvPulseP{50%{box-shadow:0 0 0 6px rgba(255,210,61,.9),0 12px 26px rgba(40,10,60,.35)}}
.dv-finger{position:absolute;width:54px;height:54px;margin:-8px 0 0 -14px;pointer-events:none;z-index:9;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.4-3.4L3.8 14a1.5 1.5 0 012.4-1.8L8 14' fill='%23fff' stroke='%232a1e3a' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E");filter:drop-shadow(0 3px 2px rgba(0,0,0,.3));animation:dvTap 1.1s ease-in-out infinite}
.dv-finger[hidden]{display:none}
.dv-f-paper{animation:dvDraw 2.2s ease-in-out infinite}
@keyframes dvTap{0%,100%{transform:translate(6px,10px)}50%{transform:translate(0,0) scale(.92)}}
@keyframes dvDraw{0%{transform:translate(-40px,20px)}25%{transform:translate(20px,-30px)}50%{transform:translate(50px,20px)}75%{transform:translate(0,40px)}100%{transform:translate(-40px,20px)}}
/* modo sobreposto (desafios): papel transparente na tela toda */
.dv-overlay{padding:0;display:block;pointer-events:none}
.dv-overlay .dv-stage{position:absolute;inset:0;pointer-events:none}
.dv-overlay .dv-paper{position:absolute;inset:0;width:100%;height:100%;background:transparent;box-shadow:none;transform:none;border-radius:0;pointer-events:auto}
.dv-overlay .dv-art{filter:drop-shadow(0 2px 0 rgba(255,255,255,.85)) drop-shadow(0 3px 3px rgba(0,0,0,.25))}
.dv-overlay .dv-rail{position:absolute;left:var(--edge-l,12px);top:calc(var(--edge-t,8px) + 56px);pointer-events:auto;gap:3px;padding:5px}
.dv-overlay .dv-tb{width:42px;height:38px}
.dv-overlay .dv-side{position:absolute;right:var(--edge-r,12px);bottom:var(--edge-b,12px);width:184px;gap:6px;pointer-events:auto}
.dv-overlay .dv-pal{grid-template-columns:repeat(6,1fr);gap:4px;padding:6px}
.dv-overlay .dv-sizes{padding:3px 6px}
.dv-overlay .dv-sz{height:26px}
.dv-overlay .dv-mat{min-height:40px;padding:3px 4px 3px 32px}
.dv-overlay .dv-mat .dv-ic{width:22px;height:22px;margin-top:-11px;left:5px}
.dv-overlay .dv-mat small{display:none}
.dv-overlay .dv-mat b{font-size:13px}
.dv-overlay .dv-bum{height:52px;font-size:26px}
.dv-overlay .dv-ink{top:calc(var(--edge-t,8px) + 30px);transform:translateX(-50%)}
.dv-overlay.dv-inkout .dv-ink{animation:dvShake2 .4s}
@keyframes dvShake2{20%,60%{transform:translateX(-56%)}40%,80%{transform:translateX(-44%)}}
/* efeitos do BUM */
.dv-burst{position:absolute;width:230px;height:230px;margin:-115px 0 0 -115px;z-index:20;pointer-events:none;animation:dvBurst 1.05s cubic-bezier(.2,1.6,.4,1) forwards}
.dv-burst i{position:absolute;inset:0;background:radial-gradient(circle,#fff 0 30%,var(--c1) 31% 62%,var(--c2) 63%);border:0;filter:drop-shadow(0 0 0 var(--ink)) drop-shadow(0 4px 0 var(--ink))}
.dv-burst b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:700;color:#fff;-webkit-text-stroke:6px var(--ink);paint-order:stroke fill;transform:rotate(-8deg);letter-spacing:2px}
@keyframes dvBurst{0%{transform:scale(.1) rotate(-30deg);opacity:1}35%{transform:scale(1.15) rotate(6deg)}55%{transform:scale(1) rotate(0)}80%{opacity:1}100%{transform:scale(1.35);opacity:0}}
.dv-flash{position:absolute;inset:0;background:#fff;z-index:19;pointer-events:none;animation:dvFlash .45s ease-out forwards}
@keyframes dvFlash{from{opacity:.85}to{opacity:0}}
/* ---------- telas (menu, galeria, fases, resultado) ---------- */
.dv-ov{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;padding:var(--edge-t,8px) var(--edge-r,12px) var(--edge-b,12px) var(--edge-l,12px);animation:dvFade .25s;overflow-y:auto;touch-action:pan-y}
@keyframes dvFade{from{opacity:0}}
.dv-dim{background:rgba(42,20,70,.8);color:#fff}
.dv-menu{justify-content:space-between;background:linear-gradient(180deg,rgba(255,250,240,.0) 30%,rgba(60,20,90,.55))}
.dv-m-exit{position:absolute;left:var(--edge-l,12px);top:var(--edge-t,8px)}
.dv-logo{margin-top:4px;text-align:center;line-height:.9;transform:rotate(-2deg)}
.dv-logo span{display:inline-block;font-size:clamp(38px,8vh,64px);font-weight:700;color:#fff;-webkit-text-stroke:7px var(--ink);paint-order:stroke fill;text-shadow:0 6px 0 var(--ink);animation:dvBob 2.6s ease-in-out infinite;margin:0 6px}
.dv-logo .dv-logo-e{color:#ffd23d;animation-delay:.3s}
@keyframes dvBob{50%{transform:translateY(-5px) rotate(2deg)}}
.dv-tag{font-weight:700;font-size:16px;background:#fff;border:3px solid var(--ink);border-radius:999px;padding:4px 14px;box-shadow:0 3px 0 var(--ink);margin-top:2px}
.dv-mbtns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;width:100%;max-width:820px;margin-bottom:4px}
.dv-mode{flex:1 1 200px;max-width:270px;display:flex;align-items:center;gap:10px;padding:10px 12px;border:3.5px solid var(--ink);border-radius:22px;box-shadow:0 6px 0 var(--ink);color:var(--ink);text-align:left;position:relative}
.dv-mode:active{transform:translateY(3px);box-shadow:0 3px 0 var(--ink)}
.dv-mode i{flex:0 0 56px;height:56px;border-radius:17px;background:#fff;border:3px solid var(--ink);display:flex;align-items:center;justify-content:center}
.dv-mode b{display:block;font-size:22px;line-height:1}
.dv-mode small{display:flex;align-items:center;gap:3px;font-size:13px;font-weight:600;opacity:.85;line-height:1.15;margin-top:2px}
.dv-m1{background:linear-gradient(135deg,#fff2a0,#ffc23d)}
.dv-m2{background:linear-gradient(135deg,#c9fff0,#3ee0b0)}
.dv-m3{background:linear-gradient(135deg,#f0dcff,#c49bff)}
.dv-ovtop{display:flex;align-items:center;gap:10px;width:100%;max-width:900px;flex:none}
.dv-ovtop h2{margin:0;font-size:26px;-webkit-text-stroke:5px var(--ink);paint-order:stroke fill;color:#fff}
.dv-pill{display:flex;align-items:center;gap:5px;background:#fff;color:var(--ink);border:3px solid var(--ink);border-radius:999px;padding:4px 12px;font-weight:700}
.dv-pill .dv-ic{color:#ffb300}
.dv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;width:100%;max-width:900px;margin-top:10px}
.dv-card{background:#fff;color:var(--ink);border:3px solid var(--ink);border-radius:16px;box-shadow:0 4px 0 var(--ink);padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px}
.dv-thumb{width:100%;aspect-ratio:1;object-fit:contain;border-radius:10px;background:#fffaf0}
.dv-card small{font-size:12px;font-weight:600;opacity:.8}
.dv-cardb{display:flex;gap:4px}
.dv-mini{width:30px;height:30px;border-radius:9px;border:2px solid var(--ink);background:#f3ecff;display:flex;align-items:center;justify-content:center;padding:0}
.dv-mini.dv-go{background:#c9ffd6}
.dv-mini.dv-red{background:#ffe0e4}
.dv-empty{margin:auto;text-align:center;max-width:340px;opacity:.9}
.dv-import{display:flex;gap:6px}
.dv-import input,.dv-codebox input{width:min(240px,34vw);border:3px solid var(--ink);border-radius:12px;padding:7px 10px;font:inherit;font-size:14px;color:var(--ink);background:#fff;user-select:text;-webkit-user-select:text;touch-action:auto}
.dv-codebox{position:sticky;bottom:0;display:flex;gap:6px;padding:8px;background:rgba(42,20,70,.9);border-radius:16px;margin-top:10px}
.dv-codebox[hidden]{display:none}
.dv-lvgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px;width:100%;max-width:900px;margin-top:10px}
.dv-lv{position:relative;border:3px solid var(--ink);border-radius:16px;background:#fff;color:var(--ink);box-shadow:0 4px 0 var(--ink);padding:8px 6px 6px;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:104px}
.dv-lv b{position:absolute;left:6px;top:4px;font-size:15px;color:#8a5cff}
.dv-lv .dv-ic{color:#ff5e3a}
.dv-lv span{font-size:13px;font-weight:700;line-height:1.1;text-align:center}
.dv-lv em{display:flex;gap:1px}
.dv-lv em i{color:#ddd3ea}
.dv-lv em i.on{color:#ffb300}
.dv-lv.dv-done{background:linear-gradient(#fffbe6,#fff0b3)}
.dv-lv.dv-locked{opacity:.55;box-shadow:0 2px 0 var(--ink)}
.dv-lv:active{transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.dv-res{justify-content:center}
.dv-fail{background:rgba(42,20,70,.35)}
.dv-rcard{background:#fff;color:var(--ink);border:4px solid var(--ink);border-radius:26px;box-shadow:0 7px 0 var(--ink);padding:14px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:300px;animation:dvPop .4s cubic-bezier(.3,1.6,.5,1)}
@keyframes dvPop{from{transform:scale(.6);opacity:0}}
.dv-rcard h2{margin:0;font-size:32px;color:#ffd23d;-webkit-text-stroke:6px var(--ink);paint-order:stroke fill}
.dv-rcard p{margin:0;font-weight:600}
.dv-bigstars{display:flex;gap:6px}
.dv-bigstars i{color:#e6dcef;transform:scale(0);animation:dvStar .45s cubic-bezier(.3,1.8,.5,1) forwards}
.dv-bigstars i.on{color:#ffb300;filter:drop-shadow(0 3px 0 var(--ink))}
@keyframes dvStar{to{transform:scale(1)}}
.dv-rrows{display:flex;flex-direction:column;gap:4px;width:100%}
.dv-rrows div{display:flex;align-items:center;gap:6px;background:#f6f0ff;border-radius:12px;padding:5px 10px;font-weight:600}
.dv-rrows div span{flex:1}
.dv-rrows div small{opacity:.7}
.dv-rrows div.ok{background:#dcffe5}
.dv-coins{font-weight:700;color:#c98a00}
.dv-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
/* desafios */
.dv-lvname{display:flex;align-items:center;gap:8px;background:#fff;border:3px solid var(--ink);border-radius:999px;padding:3px 14px 3px 4px;box-shadow:0 3px 0 var(--ink);font-weight:700;font-size:15px}
.dv-lvname b{width:28px;height:28px;border-radius:50%;background:#8a5cff;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
.dv-time{display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.9);border:2.5px solid var(--ink);border-radius:999px;padding:3px 10px;font-weight:700;min-width:62px}
.dv-pedals{position:absolute;left:var(--edge-l,12px);right:calc(var(--edge-r,12px) + 200px);bottom:var(--edge-b,12px);display:none;justify-content:space-between;pointer-events:none}
.dv-drive .dv-pedals{display:flex}
.dv-pedals .dv-act{opacity:1;width:88px;height:88px}
@media (orientation:portrait){
  .dv-sheet{flex-direction:column;justify-content:flex-start;padding-top:calc(var(--edge-t,8px) + 50px);overflow-y:auto}
  .dv-sheet .dv-rail{flex-direction:row;order:0}
  .dv-sheet .dv-sep{width:2px;height:auto;margin:4px 2px}
  .dv-sheet .dv-side{width:min(100%,420px);order:2}
  .dv-sheet .dv-stage{order:1}
}
`;
let done = false;
export function injectDvCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.id = 'dv-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
