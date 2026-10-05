import * as THREE from 'three';

/**
 * Градиентное небо на сфере: зенит, горизонт, низ; диск солнца/луны; звёзды ночью.
 * Лёгкий шейдер вместо скайбокса.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTop: { value: new THREE.Color(0x5a9bda) },
    uHorizon: { value: new THREE.Color(0xcfe3f2) },
    uBottom: { value: new THREE.Color(0xb9c9a8) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
    uSunColor: { value: new THREE.Color(0xfff2d0) },
    uSunSize: { value: 0.9992 },
    uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, 0.6).normalize() },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  private stars: THREE.Points;
  private clouds = new THREE.Group();
  private cloudSpeeds: number[] = [];

  constructor(radius = 400) {
    const geo = new THREE.SphereGeometry(radius, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
        uniform vec3 uMoonDir; uniform float uNight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
          float sd = dot(d, normalize(uSunDir));
          // Ореол солнца и диск.
          col += uSunColor * pow(max(sd, 0.0), 24.0) * 0.35 * (1.0 - uNight);
          col += uSunColor * smoothstep(uSunSize, uSunSize + 0.0004, sd) * 1.6 * (1.0 - uNight);
          // Луна.
          float md = dot(d, normalize(uMoonDir));
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9994, 0.9997, md) * uNight * 1.2;
          col += vec3(0.4, 0.5, 0.7) * pow(max(md, 0.0), 60.0) * 0.25 * uNight;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    // Звёзды.
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2;
      const y = v;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * radius * 0.95;
      pos[i * 3 + 1] = y * radius * 0.95;
      pos[i * 3 + 2] = Math.sin(th) * r * radius * 0.95;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.mesh.add(this.stars);

    // Облака: несколько low-poly «пуфов».
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < puffs; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
        m.scale.set(8 + Math.random() * 8, 4 + Math.random() * 3, 6 + Math.random() * 5);
        m.position.set(k * 9 - puffs * 4, Math.random() * 2, Math.random() * 6 - 3);
        g.add(m);
      }
      const ang = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 120;
      g.position.set(Math.cos(ang) * dist, 70 + Math.random() * 40, Math.sin(ang) * dist);
      g.rotation.y = Math.random() * Math.PI;
      this.clouds.add(g);
      this.cloudSpeeds.push(0.4 + Math.random() * 0.6);
    }
    this.clouds.name = 'clouds';
  }

  get cloudGroup(): THREE.Group {
    return this.clouds;
  }

  update(dt: number, cameraPos: THREE.Vector3, night: number, cloudTint: THREE.Color): void {
    this.mesh.position.copy(cameraPos);
    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = Math.max(0, night - 0.35) * 1.4;
    this.uniforms.uNight.value = night;
    this.clouds.children.forEach((c, i) => {
      c.position.x += this.cloudSpeeds[i]! * dt;
      if (c.position.x > 280) c.position.x = -280;
    });
    const cm = (this.clouds.children[0]?.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
    if (cm) cm.color.copy(cloudTint);
  }
}
