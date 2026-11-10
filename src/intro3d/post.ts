/* ============================================================
 *  Pós-processo "lite" — só no nível Alto: bloom barato
 *  (cena → RT; brilho filtrado em 1/4 da resolução; 2 passes de blur separável;
 *  composição + vinheta num triângulo de tela cheia). 4 passes extras, todos pequenos.
 * ============================================================ */
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Bloom {
  private main: THREE.WebGLRenderTarget;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private qs = new THREE.Scene();
  private qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  strength = 0.9;

  constructor(private r: THREE.WebGLRenderer) {
    const caps = r.capabilities;
    this.main = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: caps.isWebGL2 ? 4 : 0 });
    this.main.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.b = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.bright = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, px: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
        void main(){ vec3 c = vec3(0.0);
          c += texture2D(t, vUv + px * vec2(-1.0,-1.0)).rgb; c += texture2D(t, vUv + px * vec2(1.0,-1.0)).rgb;
          c += texture2D(t, vUv + px * vec2(-1.0,1.0)).rgb; c += texture2D(t, vUv + px * vec2(1.0,1.0)).rgb;
          c *= 0.25; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.75, 1.6, l), 1.0); }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D t; uniform vec2 d; varying vec2 vUv;
        void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227;
          c += (texture2D(t, vUv + d * 1.38).rgb + texture2D(t, vUv - d * 1.38).rgb) * 0.316;
          c += (texture2D(t, vUv + d * 3.23).rgb + texture2D(t, vUv - d * 3.23).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, bl: { value: null }, k: { value: 1 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D t; uniform sampler2D bl; uniform float k; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        void main(){ vec3 c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k;
          c = aces(c * 1.05);
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55;
          c = mix(12.92 * c, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    for (const m of [this.bright, this.blur, this.comp]) m.depthTest = m.depthWrite = false;
    this.quad = new THREE.Mesh(g, this.comp);
    this.quad.frustumCulled = false;
    this.qs.add(this.quad);
  }
  setSize(w: number, h: number): void {
    this.main.setSize(w, h);
    const qw = Math.max(1, w >> 2);
    const qh = Math.max(1, h >> 2);
    this.a.setSize(qw, qh);
    this.b.setSize(qw, qh);
    (this.bright.uniforms.px.value as THREE.Vector2).set(1 / w, 1 / h);
  }
  render(scene: THREE.Scene, cam: THREE.Camera): void {
    const r = this.r;
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.main);
    r.render(scene, cam);
    this.quad.material = this.bright;
    this.bright.uniforms.t.value = this.main.texture;
    r.setRenderTarget(this.a);
    r.render(this.qs, this.qc);
    const w = this.a.width;
    const h = this.a.height;
    this.quad.material = this.blur;
    this.blur.uniforms.t.value = this.a.texture;
    (this.blur.uniforms.d.value as THREE.Vector2).set(1 / w, 0);
    r.setRenderTarget(this.b);
    r.render(this.qs, this.qc);
    this.blur.uniforms.t.value = this.b.texture;
    (this.blur.uniforms.d.value as THREE.Vector2).set(0, 1 / h);
    r.setRenderTarget(this.a);
    r.render(this.qs, this.qc);
    this.quad.material = this.comp;
    this.comp.uniforms.t.value = this.main.texture;
    this.comp.uniforms.bl.value = this.a.texture;
    this.comp.uniforms.k.value = this.strength;
    r.setRenderTarget(null);
    r.render(this.qs, this.qc);
    r.toneMapping = tm;
  }
  dispose(): void {
    this.main.dispose();
    this.a.dispose();
    this.b.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.comp.dispose();
    this.quad.geometry.dispose();
  }
}
