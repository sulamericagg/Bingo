/* ============================================================
 *  NATUREZA — vento no vertex shader (nada na CPU por quadro além
 *  de um uniform de tempo compartilhado) e tingimento seletivo
 *  da cor da instância.
 * ============================================================ */
import * as THREE from 'three';
import { natureHit } from './fx';

/** tempo do vento (s) — um só objeto para todos os materiais; o jogo escreve .value por quadro */
export const windTime = { value: 0 };

export interface WindOpts {
  /** balanço do topo: deslocamento = amp · max(0, y - y0)² */
  amp?: number;
  /** altura (local) abaixo da qual nada mexe */
  y0?: number;
  /** tremidinha das folhas (m) acima de y0 + 2 */
  rustle?: number;
  /** multiplica a cor da instância só nos vértices sem saturação (cinza/branco) */
  tintGray?: boolean;
  /** luz "envolvente" (half-Lambert): 0 = Lambert, 0.5 = sombra próprio bem suave */
  wrap?: number;
  /** dois lados sem inverter a normal no verso (cartões de folhas) */
  noFlip?: boolean;
  /** vento forte do jogo (opcional): x,z = inclinação na direção do vento (m por m² de altura), y = ganho do balanço */
  gust?: { value: THREE.Vector3 };
}

/**
 * Aplica vento (e opcionalmente o tingimento seletivo) num material Lambert/Standard/Phong.
 * A fase vem da posição da instância (cada planta balança no seu ritmo).
 */
export function natureWind(mat: THREE.Material, o: WindOpts = {}): THREE.Material {
  const amp = o.amp ?? 0.0022;
  const y0 = o.y0 ?? 1;
  const rus = o.rustle ?? 0.03;
  const tint = !!o.tintGray;
  const wrap = o.wrap ?? 0;
  const noFlip = !!o.noFlip;
  const gust = o.gust;
  mat.onBeforeCompile = (sh) => {
    if (wrap > 0)
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_lambert_pars_fragment>',
        THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          `float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${wrap.toFixed(3)} ) / ${(1 + wrap).toFixed(3)} );`,
        ),
      );
    if (noFlip) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    sh.uniforms.uWindT = windTime;
    sh.uniforms.uHit = natureHit;
    if (gust) sh.uniforms.uGust = gust;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;\nuniform vec4 uHit;' + (gust ? '\nuniform vec3 uGust;' : ''));
    if (tint)
      sh.vertexShader = sh.vertexShader.replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR )
  vColor = vec3( 1.0 );
  vColor *= color;
  #ifdef USE_INSTANCING_COLOR
  {
    float sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    vColor *= mix(instanceColor.rgb, vec3(1.0), smoothstep(0.03, 0.14, sat));
  }
  #endif
#else
  #include <color_vertex>
#endif`,
      );
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = modelMatrix[3].xyz;
#endif
  float ph = ip.x * 0.37 + ip.z * 0.29;
  float h = max(0.0, transformed.y - ${y0.toFixed(3)});
  float w = h * h * ${amp.toFixed(5)};
  float g = sin(uWindT * 1.7 + ph) + 0.35 * sin(uWindT * 4.3 + ph * 2.1);
  ${gust ? 'w *= 1.0 + uGust.y; transformed.xz += uGust.xz * h * h * (0.85 + 0.15 * sin(uWindT * 3.1 + ph));' : ''}
  transformed.x += g * w;
  transformed.z += cos(uWindT * 1.3 + ph) * w * 0.6;
  // golpe de machado: a copa da árvore atingida chacoalha
  float hk = uHit.z * (1.0 - smoothstep(0.4, 1.2, length(ip.xz - uHit.xy)));
  transformed.x += sin(uWindT * 47.0) * hk * h * 0.045;
  transformed.z += cos(uWindT * 39.0) * hk * h * 0.035;
  float r = ${rus.toFixed(4)} * smoothstep(${(y0 + 1).toFixed(2)}, ${(y0 + 3).toFixed(2)}, transformed.y);
  transformed += r * vec3(sin(uWindT * 5.3 + dot(position, vec3(3.1, 1.7, 2.3)) + ph),
                          0.5 * sin(uWindT * 4.1 + dot(position, vec3(1.3, 2.9, 1.1))),
                          cos(uWindT * 4.7 + dot(position, vec3(2.3, 1.1, 3.7)) + ph));
}`,
    );
  };
  mat.customProgramCacheKey = () => `nwindH${amp}_${y0}_${rus}_${tint ? 1 : 0}_${wrap}_${noFlip ? 1 : 0}_${gust ? 1 : 0}`;
  return mat;
}

/** material padrão da vegetação: Lambert com cor por vértice + vento */
export function natureMat(o: WindOpts = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  natureWind(m, o);
  return m;
}
