import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export interface PostSettings {
  /** Мультисэмплинг сцены (0 — без MSAA). */
  samples: number;
  ao: boolean;
  aoSamples: number;
  bloom: boolean;
  sharpen: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * SSAO в духе SAO (McGuire): позиция из глубины, нормаль из производных (гранёная — как low-poly),
 * спираль выборок в экранном пространстве. Считается в половинном разрешении.
 */
const AO_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float tanHalfFov;
uniform float aspect;
uniform float radius;
uniform float intensity;
uniform float bias;
uniform float fadeStart;
uniform float fadeEnd;
varying vec2 vUv;

float viewZAt(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}

vec3 viewPos(vec2 uv, float viewZ) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * tanHalfFov * aspect * -viewZ, ndc.y * tanHalfFov * -viewZ, viewZ);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  float z = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  vec3 P = viewPos(vUv, z);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float projScale = resolution.y / (2.0 * tanHalfFov);
  float rPx = radius * projScale / -z;
  if (rPx < 1.0) { gl_FragColor = vec4(1.0); return; }
  rPx = min(rPx, 90.0);
  float noise = hash12(gl_FragCoord.xy) * 6.2831853;
  float sum = 0.0;
  float r2 = radius * radius;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float a = (float(i) + 0.5) / float(AO_SAMPLES);
    float ang = a * 6.2831853 * 3.0 + noise;
    float rr = rPx * a;
    vec2 off = vec2(cos(ang), sin(ang)) * rr / resolution;
    vec2 uv2 = vUv + off;
    if (uv2.x < 0.0 || uv2.y < 0.0 || uv2.x > 1.0 || uv2.y > 1.0) continue;
    float z2 = viewZAt(uv2);
    vec3 Q = viewPos(uv2, z2);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    float f = max(r2 - vv, 0.0);
    sum += f * f * f * max((vn - bias) / (0.01 + vv), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * intensity * 5.0 / (r2 * r2 * r2 * float(AO_SAMPLES)));
  // Дальше — мягче (огромные дальние поверхности не темнеют).
  float fade = smoothstep(fadeStart, fadeEnd, -z);
  ao = mix(ao, 1.0, fade);
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

/** Билатеральное размытие AO с учётом глубины (не «протекает» через края). */
const BLUR_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec2 dir;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;
float lz(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
void main() {
  float z0 = lz(vUv);
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + dir * float(i) / resolution;
    float z = lz(uv);
    float w = exp(-float(i * i) / 10.0) * exp(-abs(z - z0) / max(0.05, z0 * 0.03));
    sum += texture2D(tAO, uv).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
}`;

/** Композит: AO, экспозиция, тонмаппинг Neutral, sRGB, цветокоррекция, виньетка, дизеринг. */
const COMPOSITE_FRAG = /* glsl */ `
#include <common>
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform float aoStrength;
uniform float exposure;
uniform float saturation;
uniform float contrast;
uniform vec3 lift;
uniform vec3 gain;
uniform float vignette;
uniform float useAO;
varying vec2 vUv;

vec3 neutralTonemap(vec3 color) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  color *= exposure;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;
  float d = 1.0 - StartCompression;
  float newPeak = 1.0 - d * d / (peak + d - StartCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  if (useAO > 0.5) {
    // Пиксели вьюмодели (руки) рисуются поверх с новой глубиной — им AO мира не нужен.
    float d = texture2D(tDepth, vUv).x;
    float ao = texture2D(tAO, vUv).r;
    float k = d < 0.9999 ? 0.0 : 1.0;
    c *= mix(1.0, ao, aoStrength * k);
  }
  c = neutralTonemap(c);
  c = clamp(c, 0.0, 1.0);
  c = toSRGB(c);
  // Цветокоррекция: lift/gain, контраст вокруг середины, насыщенность.
  c = c * gain + lift * (1.0 - c);
  c = (c - 0.5) * contrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  // Виньетка.
  vec2 q = vUv - 0.5;
  c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(q * vec2(1.15, 1.0)));
  // Дизеринг против полос на небе.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Contrast Adaptive Sharpening (по мотивам AMD FidelityFX CAS) — убирает «мыло». */
const CAS_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 resolution;
uniform float sharpness;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / resolution;
  vec3 a = texture2D(tColor, vUv + vec2(0.0, -px.y)).rgb;
  vec3 b = texture2D(tColor, vUv + vec2(-px.x, 0.0)).rgb;
  vec3 c = texture2D(tColor, vUv).rgb;
  vec3 d = texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb;
  vec3 e = texture2D(tColor, vUv + vec2(0.0, px.y)).rgb;
  vec3 mn = min(a, min(b, min(c, min(d, e))));
  vec3 mx = max(a, max(b, max(c, max(d, e))));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
  float peak = -1.0 / mix(8.0, 5.0, sharpness);
  vec3 w = amp * peak;
  vec3 res = ((a + b + d + e) * w + c) / (1.0 + 4.0 * w);
  gl_FragColor = vec4(clamp(res, 0.0, 1.0), 1.0);
}`;

/**
 * Пост-обработка: сцена рендерится в HDR-цель с MSAA (чёткие края без «мыла»), затем SSAO
 * (полразрешения + билатеральный блюр), руки поверх, bloom для фонарей и окон, тонмаппинг
 * и тёплая цветокоррекция, в конце — адаптивная резкость.
 */
export class PostFX {
  private rtScene: THREE.WebGLRenderTarget;
  private rtAO: THREE.WebGLRenderTarget;
  private rtAO2: THREE.WebGLRenderTarget;
  private rtLDR: THREE.WebGLRenderTarget;
  private aoMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private casMat: THREE.ShaderMaterial;
  private quad = new FullScreenQuad();
  private bloom: UnrealBloomPass | null = null;
  private empty = new THREE.Scene();
  /** 0 — день, 1 — ночь (сила свечения). */
  night = 0;
  private w = 1;
  private h = 1;
  settings: PostSettings;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    settings: PostSettings,
  ) {
    this.settings = { ...settings };
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: settings.samples, depthTexture, depthBuffer: true });
    this.rtAO = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAO2 = this.rtAO.clone();
    this.rtLDR = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.aoMat = new THREE.ShaderMaterial({
      defines: { AO_SAMPLES: settings.aoSamples },
      uniforms: {
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 200 },
        tanHalfFov: { value: 0.7 },
        aspect: { value: 1 },
        radius: { value: 0.5 },
        intensity: { value: 1.0 },
        bias: { value: 0.012 },
        fadeStart: { value: 35 },
        fadeEnd: { value: 90 },
      },
      vertexShader: VERT,
      fragmentShader: AO_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tAO: { value: null },
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2() },
        dir: { value: new THREE.Vector2(1, 0) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 200 },
      },
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rtScene.texture },
        tAO: { value: this.rtAO.texture },
        tDepth: { value: depthTexture },
        aoStrength: { value: 0.72 },
        exposure: { value: 1 },
        saturation: { value: 1.08 },
        contrast: { value: 1.05 },
        lift: { value: new THREE.Vector3(0.012, 0.008, 0.0) },
        gain: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
        vignette: { value: 0.16 },
        useAO: { value: settings.ao ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.casMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rtLDR.texture }, resolution: { value: new THREE.Vector2() }, sharpness: { value: settings.sharpen } },
      vertexShader: VERT,
      fragmentShader: CAS_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    if (settings.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.05);
  }

  configure(s: PostSettings): void {
    const prev = this.settings;
    this.settings = { ...s };
    if (s.samples !== prev.samples) {
      this.rtScene.samples = s.samples;
      this.rtScene.dispose();
    }
    if (s.aoSamples !== prev.aoSamples) {
      this.aoMat.defines.AO_SAMPLES = s.aoSamples;
      this.aoMat.needsUpdate = true;
    }
    this.compMat.uniforms.useAO!.value = s.ao ? 1 : 0;
    this.casMat.uniforms.sharpness!.value = s.sharpen;
    if (s.bloom && !this.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.05);
      this.bloom.setSize(this.w, this.h);
    } else if (!s.bloom && this.bloom) {
      this.bloom.dispose();
      this.bloom = null;
    }
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.rtScene.setSize(w, h);
    const aw = Math.max(1, Math.round(w / 2));
    const ah = Math.max(1, Math.round(h / 2));
    this.rtAO.setSize(aw, ah);
    this.rtAO2.setSize(aw, ah);
    this.rtLDR.setSize(w, h);
    (this.aoMat.uniforms.resolution!.value as THREE.Vector2).set(aw, ah);
    (this.blurMat.uniforms.resolution!.value as THREE.Vector2).set(aw, ah);
    (this.casMat.uniforms.resolution!.value as THREE.Vector2).set(w, h);
    this.bloom?.setSize(Math.round(w / 2), Math.round(h / 2));
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    const r = this.renderer;
    const s = this.settings;
    // 1. Мир → HDR с MSAA.
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, false);
    r.render(scene, camera);
    // 2. AO по глубине мира.
    if (s.ao) {
      const u = this.aoMat.uniforms;
      u.cameraNear!.value = camera.near;
      u.cameraFar!.value = camera.far;
      u.tanHalfFov!.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      u.aspect!.value = camera.aspect;
      this.blurMat.uniforms.cameraNear!.value = camera.near;
      this.blurMat.uniforms.cameraFar!.value = camera.far;
      this.pass(this.aoMat, this.rtAO);
      this.blurMat.uniforms.tAO!.value = this.rtAO.texture;
      (this.blurMat.uniforms.dir!.value as THREE.Vector2).set(1, 0);
      this.pass(this.blurMat, this.rtAO2);
      this.blurMat.uniforms.tAO!.value = this.rtAO2.texture;
      (this.blurMat.uniforms.dir!.value as THREE.Vector2).set(0, 1);
      this.pass(this.blurMat, this.rtAO);
    }
    // 3. Руки поверх (своя глубина). Глубина очищается всегда: в композите «1.0» = мир (с AO).
    r.setRenderTarget(this.rtScene);
    r.clearDepth();
    r.render(overlay ? overlay.scene : this.empty, overlay ? overlay.camera : camera);
    // 4. Свечение: ночью сильнее (фонари, окна), днём едва заметно.
    if (this.bloom) {
      this.bloom.strength = THREE.MathUtils.lerp(0.16, 0.6, this.night);
      this.bloom.threshold = THREE.MathUtils.lerp(1.25, 0.82, this.night);
      this.bloom.render(r, this.rtScene, this.rtScene, 0, false);
    }
    // 5. Тонмаппинг и грейдинг → LDR.
    this.compMat.uniforms.exposure!.value = r.toneMappingExposure * 1.04;
    this.pass(this.compMat, this.rtLDR);
    // 6. Резкость → экран.
    this.pass(this.casMat, null);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  dispose(): void {
    this.rtScene.dispose();
    this.rtAO.dispose();
    this.rtAO2.dispose();
    this.rtLDR.dispose();
    this.bloom?.dispose();
  }
}
