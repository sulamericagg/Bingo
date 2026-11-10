/** CSS da intro (injetado pelo módulo sob demanda: nada no bundle principal) */
export const CSS = `
.i3-root{position:absolute;inset:0;z-index:6;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;
  background:radial-gradient(circle at 50% 45%,var(--i3-bg0),var(--i3-bg1))}
.i3-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
.i3-flash{position:absolute;inset:0;opacity:0;pointer-events:none;background:#fff}
.i3-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none;
  padding:0 4vw calc(11vh + 34px);font-family:var(--font,'Fredoka',system-ui,sans-serif);will-change:transform,opacity}
.i3-halo{position:absolute;left:50%;bottom:-30vh;width:160vw;height:95vh;margin-left:-80vw;opacity:0;transform:scale(.4);transform-origin:50% 60%;
  background:radial-gradient(closest-side,var(--i3-bg1) 0%,var(--i3-bg1) 30%,rgba(0,0,0,0) 100%)}
.i3-halo::after{content:'';position:absolute;inset:25%;border-radius:50%;opacity:.55;
  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0) 0deg 9deg,rgba(255,255,255,.13) 9deg 18deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 20%,rgba(0,0,0,0) 100%);mask-image:radial-gradient(closest-side,#000 20%,rgba(0,0,0,0) 100%);
  animation:i3spin 14s linear infinite}
.i3-title.in .i3-halo{animation:i3halo .7s cubic-bezier(.2,.9,.3,1) forwards}
.i3-title.fast .i3-halo{animation-duration:.2s}
.i3-title h1{position:relative;margin:0;text-align:center;line-height:1.04;font-weight:700;letter-spacing:.01em;
  font-size:clamp(34px,min(12.5vw,13vh),92px);
  filter:drop-shadow(0 .06em 0 rgba(22,6,52,.95)) drop-shadow(0 0 .03em rgba(22,6,52,.95)) drop-shadow(0 .14em .22em rgba(0,0,0,.45))}
.i3-w{display:inline-block;white-space:nowrap}
.i3-l{display:inline-block;opacity:0;color:transparent;-webkit-background-clip:text;background-clip:text;
  background-image:linear-gradient(105deg,rgba(255,255,255,0) 38%,rgba(255,255,255,.95) 50%,rgba(255,255,255,0) 62%),linear-gradient(180deg,var(--i3-t0) 25%,var(--i3-t1) 88%);
  background-size:320% 100%,100% 100%;background-position:130% 0,0 0;background-repeat:no-repeat}
.i3-title.in .i3-l{animation:i3pop .62s cubic-bezier(.2,1.55,.35,1) both,i3shine .9s ease-in-out .38s both}
.i3-title.fast .i3-l{animation-duration:.18s,.01s;animation-delay:0s!important}
.i3-title p{position:relative;margin:.7em 0 0;padding:.32em .95em;border-radius:999px;font-weight:600;font-size:clamp(13px,3.6vmin,22px);
  color:#fff;background:rgba(10,4,30,.35);box-shadow:inset 0 0 0 2px var(--i3-a);opacity:0;text-align:center}
.i3-title.in p{animation:i3up .5s cubic-bezier(.2,1.3,.4,1) .32s both}
.i3-title.fast p{animation-duration:.15s;animation-delay:0s}
.i3-skip{position:absolute;right:calc(14px + var(--safe-r,0px));top:calc(12px + var(--safe-top,0px));padding:6px 14px;border-radius:999px;
  font:600 13px var(--font,'Fredoka',system-ui,sans-serif);color:rgba(255,255,255,.85);background:rgba(0,0,0,.28);opacity:0;transition:opacity .3s;pointer-events:none}
@keyframes i3pop{0%{opacity:0;transform:translateY(.5em) scale(.2) rotate(-14deg)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes i3shine{0%{background-position:130% 0,0 0}100%{background-position:-30% 0,0 0}}
@keyframes i3up{0%{opacity:0;transform:translateY(12px) scale(.8)}100%{opacity:1;transform:none}}
@keyframes i3halo{0%{opacity:0;transform:scale(.4)}100%{opacity:.78;transform:scale(1)}}
@keyframes i3spin{to{transform:rotate(360deg)}}
`;
