/* ============================================================
 *  BLOCOS — materiais three (Lambert + atlas procedural via onBeforeCompile).
 *  3 materiais compartilhados por todos os pedaços: opaco, recorte, vidro.
 *  UV: projeção planar pelo eixo dominante da normal em coordenadas de mundo
 *  (1 ladrilho = 1 bloco, emenda sem costura entre blocos/pedaços), ou UV
 *  explícito (plantas). textureGrad evita a costura do mipmap no fract().
 * ============================================================ */
import * as THREE from 'three';
import { buildAtlas } from './atlas';
import { ATLAS_COLS } from './registry';

export interface BlockMaterials {
  opaque: THREE.MeshLambertMaterial;
  cutout: THREE.MeshLambertMaterial;
  glass: THREE.MeshLambertMaterial;
  /** por índice de Group */
  list: THREE.MeshLambertMaterial[];
  texture: THREE.DataTexture;
  dispose(): void;
}

const VERT_HEAD = /* glsl */ `
attribute vec2 bmat;
attribute vec2 buv;
flat varying float vBTile;
flat varying float vBEmit;
flat varying float vBDetail;
flat varying float vBSoft;
flat varying float vBUvMode;
varying vec2 vBUv;
varying vec3 vBPos;
varying vec3 vBNrm;
`;
const VERT_BODY = /* glsl */ `
#include <project_vertex>
vBTile = bmat.x;
float bfl = bmat.y;
vBEmit = mod(bfl, 32.0) / 31.0;
vBDetail = mod(floor(bfl / 32.0), 2.0);
vBSoft = mod(floor(bfl / 64.0), 2.0);
vBUvMode = floor(bfl / 128.0);
vBUv = buv;
vBPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vBNrm = normal;
`;
const FRAG_HEAD = /* glsl */ `
uniform sampler2D uAtlas;
flat varying float vBTile;
flat varying float vBEmit;
flat varying float vBDetail;
flat varying float vBSoft;
flat varying float vBUvMode;
varying vec2 vBUv;
varying vec3 vBPos;
varying vec3 vBNrm;
`;
const FRAG_BODY = /* glsl */ `
#include <color_fragment>
{
  vec2 bp;
  if (vBUvMode > 0.5) bp = vBUv;
  else {
    vec3 an = abs(vBNrm);
    if (an.x >= an.y && an.x >= an.z) bp = vBPos.zy;
    else if (an.y >= an.z) bp = vBPos.xz;
    else bp = vBPos.xy;
  }
  vec2 bf = vBUvMode > 0.5 ? clamp(bp, 0.0, 1.0) : fract(bp);
  vec2 bcell = vec2(mod(vBTile, ${ATLAS_COLS}.0), ${ATLAS_COLS - 1}.0 - floor(vBTile / ${ATLAS_COLS}.0));
  vec2 buvA = (bcell + 0.016 + bf * 0.968) / ${ATLAS_COLS}.0;
#ifdef BLOCK_HQ
  vec4 btx;
  if (vBSoft > 0.5) {
    // macios: triplanar (3 amostras misturadas pela normal) — sem costura na troca de eixo
    vec3 bw = pow(abs(normalize(vBNrm)), vec3(4.0));
    bw /= bw.x + bw.y + bw.z;
    vec2 bo = (bcell + 0.016) / ${ATLAS_COLS}.0;
    float bs = 0.968 / ${ATLAS_COLS}.0;
    btx = textureGrad(uAtlas, bo + fract(vBPos.zy) * bs, dFdx(vBPos.zy) * bs, dFdy(vBPos.zy) * bs) * bw.x
        + textureGrad(uAtlas, bo + fract(vBPos.xz) * bs, dFdx(vBPos.xz) * bs, dFdy(vBPos.xz) * bs) * bw.y
        + textureGrad(uAtlas, bo + fract(vBPos.xy) * bs, dFdx(vBPos.xy) * bs, dFdy(vBPos.xy) * bs) * bw.z;
  } else btx = textureGrad(uAtlas, buvA, dFdx(bp) * (0.968 / ${ATLAS_COLS}.0), dFdy(bp) * (0.968 / ${ATLAS_COLS}.0));
#else
  vec4 btx = textureLod(uAtlas, buvA, 2.0);
#endif
  btx.rgb *= vBDetail > 0.5 ? 2.0 : 1.0;
  diffuseColor *= btx;
  if (vBSoft < 0.5) {
    vec3 bcid = floor(vBPos - vBNrm * 0.02);
    float bh = fract(sin(dot(bcid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.93 + 0.14 * bh;
  }
}
`;

function patch(m: THREE.MeshLambertMaterial, tex: THREE.Texture, hq: boolean): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlas = { value: tex };
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    sh.fragmentShader = (hq ? '#define BLOCK_HQ\n' : '') + FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', FRAG_BODY).replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nif (vBUvMode > 0.5) normal = normalize(vNormal); // plantas: luz de cima dos dois lados')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * vBEmit * 1.6;');
  };
  m.customProgramCacheKey = () => 'bloop-blocks-' + (hq ? 'hq' : 'lq') + m.alphaTest;
}

/** hq: textura completa (Médio/Alto); senão amostra reduzida sem derivadas (Mínimo/Baixo) */
export function createBlockMaterials(hq = true): BlockMaterials {
  const atlas = buildAtlas();
  const texture = new THREE.DataTexture(atlas.data as Uint8Array<ArrayBuffer>, atlas.canvas.width, atlas.canvas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  const opaque = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cutout = new THREE.MeshLambertMaterial({ vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  // a saia macia encosta no chão do motor: puxa um tico para a frente
  opaque.polygonOffset = true;
  opaque.polygonOffsetFactor = -1;
  opaque.polygonOffsetUnits = -1;
  for (const m of [opaque, cutout, glass]) patch(m, texture, hq);
  const list = [opaque, cutout, glass];
  return {
    opaque,
    cutout,
    glass,
    list,
    texture,
    dispose() {
      texture.dispose();
      for (const m of list) m.dispose();
    },
  };
}
