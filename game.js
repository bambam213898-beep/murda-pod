import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const EPISODES = window.EPISODES;
const STATIONS = window.STATIONS;
$('ldStatus').textContent = 'BUILDING LEONIDA';

await Promise.race([
  Promise.all(['Anton', 'Bebas Neue', 'Permanent Marker', 'Yellowtail'].map((f) => document.fonts.load(`80px "${f}"`))),
  new Promise((r) => setTimeout(r, 4000)),
]).catch(() => {});

/* =========================================================
   RENDERER
   ========================================================= */
const hero = $('hero');
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no-webgl');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
const pmrem = new THREE.PMREMGenerator(renderer);

/* ---------- real-world assets (photo HDR, scanned textures, detailed car) ---------- */
const GH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/';
const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
const texLoader = new THREE.TextureLoader();
const loadTex = (url, srgb) => new Promise((res) => texLoader.load(url, (t) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
}, undefined, () => res(null)));
const withTimeout = (p, ms) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
const gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'));
$('ldStatus').textContent = 'STREAMING ASSETS';
const [hdr, carGltf, carAO, waterN, asD, asN, asR, sdD, sdN] = await Promise.all([
  withTimeout(new RGBELoader().loadAsync(GH + 'textures/equirectangular/venice_sunset_1k.hdr'), 25000),
  withTimeout(gltfLoader.loadAsync(GH + 'models/gltf/ferrari.glb'), 25000),
  withTimeout(loadTex(GH + 'models/gltf/ferrari_ao.png'), 20000),
  withTimeout(loadTex(GH + 'textures/waternormals.jpg'), 20000),
  withTimeout(loadTex(PH + 'asphalt_02/asphalt_02_diff_1k.jpg', true), 20000),
  withTimeout(loadTex(PH + 'asphalt_02/asphalt_02_nor_gl_1k.jpg'), 20000),
  withTimeout(loadTex(PH + 'asphalt_02/asphalt_02_rough_1k.jpg'), 20000),
  withTimeout(loadTex(PH + 'coast_sand_01/coast_sand_01_diff_1k.jpg', true), 20000),
  withTimeout(loadTex(PH + 'coast_sand_01/coast_sand_01_nor_gl_1k.jpg'), 20000),
]);
const facePhoto = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/murda-photo.png'; });
$('ldStatus').textContent = 'BUILDING LEONIDA';

function canvasTex(w, h, draw, { srgb = true, wrap = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.userData.canvas = c; t.userData.ctx = ctx;
  return t;
}
function noiseNormal(N, octaves, strength, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const ph = octaves.map(() => [Math.random() * 6.28, Math.random() * 6.28, (Math.random() * 7 | 0) - 3]);
  const f = (i, j) => octaves.reduce((a, [fx, fy, amp], k) => a + Math.sin(2 * Math.PI * (fx * i + ph[k][2] * j) / N + ph[k][0]) * Math.sin(2 * Math.PI * (fy * j) / N + ph[k][1]) * amp, 0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (f(i + 1, j) - f(i - 1, j)) * strength, dy = (f(i, j + 1) - f(i, j - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), k = (j * N + i) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
}
function noise(ctx, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = pick(colors); ctx.fillRect(Math.random() * w, Math.random() * h, size, size); }
}
function glowText(ctx, text, x, y, font, color, blur = 28) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.fillStyle = color;
  ctx.fillText(text, x, y); ctx.fillText(text, x, y);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.75; ctx.fillText(text, x, y); ctx.globalAlpha = 1;
}
function cylBetween(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return m;
}
const glow = (hex, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: true });

/* =========================================================
   CITY SCENE — Ocean Strip at golden hour
   ========================================================= */
const city = new THREE.Scene();
city.fog = new THREE.Fog(0xc9708a, 260, 1600);

const sky = new Sky();
sky.scale.setScalar(5000);
const su = sky.material.uniforms;
su.turbidity.value = 7; su.rayleigh.value = 3.4; su.mieCoefficient.value = 0.007; su.mieDirectionalG.value = 0.86;
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(87.2), THREE.MathUtils.degToRad(198));
su.sunPosition.value.copy(sunDir);
{
  const envScene = new THREE.Scene();
  envScene.add(sky);
  if (hdr) { hdr.mapping = THREE.EquirectangularReflectionMapping; city.environment = pmrem.fromEquirectangular(hdr).texture; }
  else city.environment = pmrem.fromScene(envScene, 0.02).texture;
  city.add(sky);
}

city.add(new THREE.HemisphereLight(0xffc4a0, 0x40205a, 0.85));
const sun = new THREE.DirectionalLight(0xffa070, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
city.add(sun, sun.target);

/* ---------- ground strips (world-locked textures) ---------- */
const L = 1500;
const followers = [];
function strip(width, x, y, mat, tile) {
  const g = new THREE.PlaneGeometry(width, L);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, 0);
  m.receiveShadow = true;
  city.add(m);
  followers.push({ m, tile, maps: [mat.map, mat.normalMap, mat.roughnessMap].filter(Boolean) });
  return m;
}

const markTex = canvasTex(512, 1024, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  const m = w / 16, pm = h / 32;
  x.fillStyle = '#ece6d4';
  x.fillRect(0.3 * m, 0, 0.15 * m, h); x.fillRect(15.55 * m, 0, 0.15 * m, h);
  x.fillStyle = '#f0bf2a';
  x.fillRect(7.82 * m, 0, 0.12 * m, h); x.fillRect(8.06 * m, 0, 0.12 * m, h);
  x.fillStyle = '#ece6d4';
  for (let y = 0; y < 32; y += 8) { x.fillRect(3.94 * m, y * pm, 0.12 * m, 4 * pm); x.fillRect(11.94 * m, y * pm, 0.12 * m, 4 * pm); }
  // wear: knock holes in the paint
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.8})`; x.fillRect(Math.random() * w, Math.random() * h, rand(1, 4), rand(1, 4)); }
  x.globalCompositeOperation = 'source-over';
  // tire tracks
  for (const cx of [1.2, 2.8, 5.2, 6.8, 9.2, 10.8, 13.2, 14.8]) { x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(cx * m - 14, 0, 28, h); }
});
markTex.repeat.set(1, L / 32);
if (asD) {
  for (const t of [asD, asN, asR]) if (t) t.repeat.set(4, L / 4);
  strip(16, 0, 0.02, new THREE.MeshStandardMaterial({ map: asD, normalMap: asN, roughnessMap: asR, color: 0x9c98a0, normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0.8 }), 4);
} else {
  const roadTex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#2c2a31'; x.fillRect(0, 0, w, h); noise(x, w, h, 16000, ['#24232a', '#35333b', '#3c3a42', '#1f1e24'], 2); });
  roadTex.repeat.set(1, L / 16);
  strip(16, 0, 0.02, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.48, metalness: 0.08 }), 16);
}
strip(16, 0, 0.032, new THREE.MeshStandardMaterial({ map: markTex, transparent: true, depthWrite: false, roughness: 0.55 }), 32);

const walkTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#b9aca3'; x.fillRect(0, 0, w, h);
  noise(x, w, h, 5000, ['#a99d95', '#c6bab1', '#9f938b'], 2);
  x.strokeStyle = '#8a7f78'; x.lineWidth = 3;
  for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(0, i * h / 2); x.lineTo(w, i * h / 2); x.stroke(); x.beginPath(); x.moveTo(i * w / 2, 0); x.lineTo(i * w / 2, h); x.stroke(); }
});
{
  const lw = walkTex.clone(); lw.needsUpdate = true; lw.repeat.set(3 / 4, L / 4);
  strip(3, -9.5, 0.16, new THREE.MeshStandardMaterial({ map: lw, roughness: 0.9 }), 4);
  const rw = walkTex.clone(); rw.needsUpdate = true; rw.repeat.set(5 / 4, L / 4);
  strip(5, 10.5, 0.16, new THREE.MeshStandardMaterial({ map: rw, roughness: 0.9 }), 4);
}
const curbMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc6, roughness: 0.8 });
for (const cx of [-8.06, 8.06]) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, L), curbMat);
  c.position.set(cx, 0.09, 0); c.receiveShadow = true; city.add(c);
  followers.push({ m: c, tile: 0, maps: [] });
}
const sandTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#e2b98e'; x.fillRect(0, 0, w, h);
  noise(x, w, h, 14000, ['#d6aa7e', '#ecc79c', '#cfa077', '#f1d2ad'], 2);
});
if (sdD) {
  for (const t of [sdD, sdN]) if (t) t.repeat.set(52 / 5, L / 5);
  strip(52, -37, 0.1, new THREE.MeshStandardMaterial({ map: sdD, normalMap: sdN, color: 0xffe2c8, roughness: 1, normalScale: new THREE.Vector2(1.5, 1.5) }), 5);
} else {
  sandTex.repeat.set(52 / 8, L / 8);
  strip(52, -37, 0.1, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }), 8);
}
const foamTex = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); noise(x, w, h, 900, ['#cfe9f2', '#ffffff00'], 4); });
foamTex.repeat.set(1, L / 6);
strip(4, -63, 0.03, new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, opacity: 0.7, roughness: 0.4 }), 6);

// ocean with procedural normal map
const waterNormal = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const f = (i, j) => Math.sin(2 * Math.PI * (2 * i + j) / N) * 0.5 + Math.sin(2 * Math.PI * (-i + 3 * j) / N) * 0.35 +
    Math.sin(2 * Math.PI * (5 * i - 2 * j) / N) * 0.22 + Math.sin(2 * Math.PI * (3 * i + 7 * j) / N) * 0.12 + Math.sin(2 * Math.PI * (9 * i + 4 * j) / N) * 0.07;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (f(i + 1, j) - f(i - 1, j)) * 8, dy = (f(i, j + 1) - f(i, j - 1)) * 8;
    const l = Math.hypot(dx, dy, 1), k = (j * N + i) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
waterNormal.repeat.set(4000 / 14, L / 14);
let water = null;
if (waterN) {
  water = new Water(new THREE.PlaneGeometry(4000, 3000), {
    textureWidth: 512, textureHeight: 512, waterNormals: waterN, sunDirection: sunDir.clone(),
    sunColor: 0xffc08a, waterColor: 0x0a2c44, distortionScale: 2.6, fog: true,
  });
  water.rotation.x = -Math.PI / 2; water.position.set(-2063, -0.12, 0);
  water.material.uniforms.size.value = 3;
  city.add(water);
} else {
  strip(4000, -2063, -0.15, new THREE.MeshStandardMaterial({ color: 0x0c3552, metalness: 0.9, roughness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.55, 0.55) }), 14);
}
strip(500, 263, 0.0, new THREE.MeshStandardMaterial({ color: 0x3b3640, roughness: 1 }), 0);

/* ---------- buildings ---------- */
const pastel = [0xf7c6d0, 0x9fe3d6, 0xfbe3b3, 0xf4f1ea, 0xc9b6f2, 0xffb6a1, 0xa8d8ff];
const neonCols = ['#ff2e88', '#12e0c4', '#b57bff', '#ffb000', '#3af0ff'];
function windowPair() {
  const W = 256, H = 512, cols = 6, rows = 12;
  const draw = (lit) => (x, w, h) => {
    x.fillStyle = lit ? '#000' : '#fff'; x.fillRect(0, 0, w, h);
    if (!lit) noise(x, w, h, 2000, ['#f1ece6', '#e6e0d8'], 3);
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = Math.random() < 0.38;
      if (lit) { if (on) { x.fillStyle = pick(['#ffcf8a', '#ffe2b0', '#9fe8ff', '#ffb37a']); x.fillRect(c * cw + 7, r * rh + 7, cw - 14, rh - 12); } }
      else {
        const gr = x.createLinearGradient(0, r * rh, 0, r * rh + rh);
        gr.addColorStop(0, '#2b3550'); gr.addColorStop(1, '#141a2a');
        x.fillStyle = gr; x.fillRect(c * cw + 7, r * rh + 7, cw - 14, rh - 12);
        x.fillStyle = '#ffffff22'; x.fillRect(c * cw + 7, r * rh + 7, cw - 14, 3);
      }
    }
  };
  // same random pattern for both maps
  const seed = Math.random(); let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const save = Math.random; Math.random = rnd;
  const map = canvasTex(W, H, draw(false));
  s = seed; const em = canvasTex(W, H, draw(true));
  Math.random = save;
  return { map, em };
}
const winSets = Array.from({ length: 4 }, windowPair);

function signTexture(text, color, font = '90px "Bebas Neue"') {
  return canvasTex(1024, 220, (x, w, h) => { x.clearRect(0, 0, w, h); glowText(x, text, w / 2, h / 2 + 6, font, color, 34); }, { wrap: false });
}
const signTexts = [['MURDA RADIO 105.9', '#ff2e88'], ['OCEAN STRIP HOTEL', '#12e0c4'], ['THE MURDA POD', '#ff2e88'], ['LEONIDA LIVE', '#b57bff'], ['RAP UP INN', '#ffb000'], ['VICE BEACH MOTEL', '#3af0ff'], ['GATOR GRILL', '#7cff6b']];
const signTexes = signTexts.map(([t, c]) => signTexture(t, c));
const posterTex = canvasTex(1024, 512, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3b0f5c'); g.addColorStop(0.55, '#ff2e88'); g.addColorStop(1, '#ff8a1f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffd23f'; for (let i = 0; i < 9; i++) { x.globalAlpha = 0.9; x.fillRect(560, 160 + i * 34, 380, 22 - i * 1.6); }
  x.globalAlpha = 1;
  // character silhouette
  x.fillStyle = '#140818';
  x.beginPath(); x.ellipse(760, 300, 96, 112, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(600, 512); x.bezierCurveTo(600, 400, 680, 380, 760, 380); x.bezierCurveTo(840, 380, 920, 400, 920, 512); x.fill();
  x.fillStyle = '#c4161c'; x.beginPath(); x.ellipse(760, 255, 102, 90, 0, Math.PI, 0); x.fill(); x.fillRect(654, 240, 212, 30);
  x.strokeStyle = '#140818'; x.lineWidth = 16; x.beginPath(); x.arc(760, 300, 120, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
  x.fillStyle = '#140818'; x.fillRect(624, 280, 36, 70); x.fillRect(860, 280, 36, 70);
  x.strokeStyle = '#ffd23f'; x.lineWidth = 10; x.beginPath(); x.arc(760, 400, 80, 0.2, Math.PI - 0.2); x.stroke();
  x.font = '150px Anton'; x.textAlign = 'left'; x.lineWidth = 12; x.strokeStyle = '#000'; x.fillStyle = '#fff';
  x.strokeText('MURDA', 40, 210); x.fillText('MURDA', 40, 210);
  x.strokeText('POD', 40, 360); x.fillText('POD', 40, 360);
  x.font = '48px "Bebas Neue"'; x.fillStyle = '#ffd23f'; x.fillText('LIVE FROM LEONIDA  •  105.9', 44, 440);
}, { wrap: false });

const buildings = [];
let bSpan = 0;
const winMatCache = new Map();
function makeBuilding(z) {
  const w = rand(15, 24), d = rand(12, 20), h = pick([rand(10, 18), rand(16, 30), rand(26, 48)]);
  const g = new THREE.Group();
  const ws = pick(winSets);
  const map = ws.map.clone(); map.needsUpdate = true; map.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 24)));
  const em = ws.em.clone(); em.needsUpdate = true; em.repeat.copy(map.repeat);
  const col = pick(pastel);
  const mat = new THREE.MeshStandardMaterial({ color: col, map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.75, envMapIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), mat);
  body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const plain = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
  const crown = new THREE.Mesh(new THREE.BoxGeometry(d * 0.62, rand(2, 5), w * 0.62), plain);
  crown.position.y = h + crown.geometry.parameters.height / 2; crown.castShadow = true; g.add(crown);
  if (Math.random() < 0.35) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, rand(5, 10), 8), plain);
    sp.position.y = h + crown.geometry.parameters.height + sp.geometry.parameters.height / 2; g.add(sp);
  }
  const nc = pick(neonCols), nm = glow(nc, 1.8);
  for (const sz of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), nm); s.position.set(-d / 2 - 0.05, h / 2, sz * (w / 2 - 0.1)); g.add(s); }
  for (const yy of [h - 0.4, Math.min(h * 0.5, 9)]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, w), nm); s.position.set(-d / 2 - 0.08, yy, 0); g.add(s); }
  const aw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, w * 0.82), new THREE.MeshStandardMaterial({ color: new THREE.Color(nc).multiplyScalar(0.6), roughness: 0.6 }));
  aw.position.set(-d / 2 - 1.3, 3.4, 0); aw.rotation.z = -0.12; aw.castShadow = true; g.add(aw);
  if (Math.random() < 0.55) {
    const st = pick(signTexes);
    const sm = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, color: new THREE.Color(1.5, 1.5, 1.5) });
    const sw = Math.min(w * 0.85, 16);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.215), sm);
    sign.rotation.y = -Math.PI / 2; sign.position.set(-d / 2 - 0.2, Math.min(h - 3, 12 + Math.random() * 6), 0);
    g.add(sign);
  }
  if (Math.random() < 0.3 && h < 34) {
    const bb = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ map: posterTex, emissiveMap: posterTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6 });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), pm); poster.position.y = 7.5; bb.add(poster);
    const fr = new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.6, roughness: 0.4 });
    for (const px of [-4, 4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), fr); p.position.set(px, 2, -0.3); bb.add(p); }
    bb.rotation.y = -Math.PI / 2 + 0.55; bb.position.set(-d / 4, h + 0.2, 0);
    g.add(bb);
  }
  g.position.set(16 + d / 2, 0, z - w / 2);
  city.add(g);
  return { g, w, d, z: g.position.z };
}
{
  let z = 60;
  while (bSpan < 900) { const gap = rand(2, 7); const b = makeBuilding(z); buildings.push(b); z -= b.w + gap; bSpan += b.w + gap; }
}
// skyline towers
const towers = [];
const T_SPAN = 1500;
for (let i = 0; i < 46; i++) {
  const ws = pick(winSets), h = rand(50, 190), w = rand(18, 40), d = rand(18, 40);
  const map = ws.map.clone(); map.needsUpdate = true; map.repeat.set(Math.round(w / 10), Math.round(h / 20));
  const em = ws.em.clone(); em.needsUpdate = true; em.repeat.copy(map.repeat);
  const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), new THREE.MeshStandardMaterial({ color: pick([0x9aa7c7, 0xd8c3d8, 0xbfd6e0, 0xe6d2c0]), map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.3 }));
  m.position.set(rand(75, 280), h / 2, 60 - (i / 46) * T_SPAN + rand(-10, 10));
  if (Math.random() < 0.5) { const s = new THREE.Mesh(new THREE.BoxGeometry(d + 0.6, 0.6, w + 0.6), glow(pick(neonCols), 3)); s.position.y = h / 2 - 0.3; m.add(s); }
  city.add(m); towers.push(m);
}

/* ---------- palms (instanced) ---------- */
function palmGeometry() {
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.25, 3, 0), V(0.8, 6, 0), V(1.5, 8.8, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 20, 0.24, 8);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 8.8, 0, 1), c = curve.getPoint(t);
    const s = 1.25 - t * 0.45;
    pos.setX(i, c.x + (pos.getX(i) - c.x) * s); pos.setZ(i, c.z + (pos.getZ(i) - c.z) * s);
  }
  trunk.computeVertexNormals();
  const fronds = [];
  const top = V(1.5, 8.8, 0);
  for (let k = 0; k < 11; k++) {
    const len = rand(3.6, 4.8);
    const leaf = new THREE.PlaneGeometry(len, 1, 10, 2);
    leaf.translate(len / 2, 0, 0); leaf.rotateX(-Math.PI / 2);
    const p = leaf.attributes.position;
    const droop = k < 7 ? rand(1.2, 2.2) : rand(2.6, 3.6);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), t = x / len;
      p.setY(i, x * 0.35 - t * t * droop * 1.6);
      p.setZ(i, p.getZ(i) * (1 - t * 0.85) * (1 + Math.sin(t * Math.PI) * 0.3));
    }
    leaf.computeVertexNormals();
    leaf.rotateY((k / 11) * Math.PI * 2 + rand(-0.2, 0.2));
    leaf.translate(top.x, top.y, top.z);
    fronds.push(leaf);
  }
  const nuts = new THREE.SphereGeometry(0.4, 8, 6); nuts.translate(top.x, top.y - 0.4, top.z);
  return { trunk: mergeGeometries([trunk, nuts]), fronds: mergeGeometries(fronds) };
}
const palmGeo = palmGeometry();
const barkTex = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#7a5a40'; x.fillRect(0, 0, w, h); for (let i = 0; i < h; i += 10) { x.fillStyle = i % 20 ? '#5d4430' : '#8a6a4c'; x.fillRect(0, i, w, 4); } });
barkTex.repeat.set(2, 6);
const palmT = new THREE.InstancedMesh(palmGeo.trunk, new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 }), 120);
const palmF = new THREE.InstancedMesh(palmGeo.fronds, new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.8, side: THREE.DoubleSide }), 120);
palmT.castShadow = palmF.castShadow = true;
palmT.frustumCulled = palmF.frustumCulled = false;
city.add(palmT, palmF);
const P_SPAN = 760;
const palms = [];
for (let i = 0; i < 42; i++) palms.push({ x: 11.6, z: 40 - i * 18, ry: rand(0, 6.28), s: rand(0.9, 1.25) });
for (let i = 0; i < 42; i++) palms.push({ x: -10, z: 31 - i * 18, ry: rand(0, 6.28), s: rand(0.85, 1.2) });
for (let i = 0; i < 36; i++) palms.push({ x: rand(-58, -16), z: 40 - Math.random() * P_SPAN, ry: rand(0, 6.28), s: rand(0.8, 1.35) });
const dummy = new THREE.Object3D();
function setPalm(i) {
  const p = palms[i];
  dummy.position.set(p.x, p.x < -12 ? 0.1 : 0.16, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
  palmT.setMatrixAt(i, dummy.matrix); palmF.setMatrixAt(i, dummy.matrix);
}
palms.forEach((_, i) => setPalm(i));

/* ---------- street lights (instanced) ---------- */
const poleGeo = mergeGeometries([
  new THREE.CylinderGeometry(0.1, 0.16, 8, 8).translate(0, 4, 0),
  new THREE.BoxGeometry(2.6, 0.12, 0.12).translate(1.3, 7.9, 0),
]);
const bulbGeo = new THREE.BoxGeometry(0.8, 0.15, 0.35).translate(2.4, 7.8, 0);
const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.7, roughness: 0.4 }), 60);
const bulbs = new THREE.InstancedMesh(bulbGeo, glow('#ffd9a0', 4), 60);
poles.frustumCulled = bulbs.frustumCulled = false; poles.castShadow = true;
city.add(poles, bulbs);
const lamps = [];
for (let i = 0; i < 30; i++) { lamps.push({ x: 8.8, z: 20 - i * 26, ry: Math.PI }); lamps.push({ x: -8.8, z: 7 - i * 26, ry: 0 }); }
const LAMP_SPAN = 780;
function setLamp(i) {
  const l = lamps[i]; dummy.position.set(l.x, 0.16, l.z); dummy.rotation.set(0, l.ry, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
  poles.setMatrixAt(i, dummy.matrix); bulbs.setMatrixAt(i, dummy.matrix);
}
lamps.forEach((_, i) => setLamp(i));

/* ---------- lifeguard towers ---------- */
const guards = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), wood); l.position.set(x, 1.2, z); g.add(l); }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshStandardMaterial({ color: pick([0xff6fa8, 0x3fd9c4, 0xffc94d]), roughness: 0.7 }));
  hut.position.y = 3.4; hut.castShadow = true; g.add(hut);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1, 4), wood); roof.position.y = 4.9; roof.rotation.y = Math.PI / 4; g.add(roof);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3.5), wood); ramp.position.set(2.2, 1.2, 0); ramp.rotation.z = 0.6; g.add(ramp);
  g.position.set(rand(-40, -28), 0.1, 30 - i * 160);
  city.add(g); guards.push(g);
}

/* ---------- cars ---------- */
const carShared = (() => {
  const s = new THREE.Shape();
  s.moveTo(-2.3, 0.3); s.lineTo(-2.34, 0.8); s.quadraticCurveTo(-2.32, 1.0, -2.0, 1.02); s.lineTo(-1.25, 1.04);
  s.lineTo(1.2, 0.98); s.lineTo(2.18, 0.82); s.quadraticCurveTo(2.4, 0.76, 2.4, 0.55); s.lineTo(2.32, 0.3); s.lineTo(-2.3, 0.3);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.76, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 10 });
  body.translate(0, 0, -0.88); body.rotateY(Math.PI / 2);
  const c = new THREE.Shape();
  c.moveTo(-1.3, 1.0); c.lineTo(-0.62, 1.42); c.lineTo(0.42, 1.44); c.lineTo(1.18, 0.98); c.lineTo(-1.3, 1.0);
  const cabin = new THREE.ExtrudeGeometry(c, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  cabin.translate(0, 0, -0.75); cabin.rotateY(Math.PI / 2);
  const roof = new THREE.BoxGeometry(1.5, 0.06, 1.0); roof.translate(0, 1.5, 0.1);
  const tire = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 24); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 10); rim.rotateZ(Math.PI / 2);
  return {
    body, cabin, roof, tire, rim,
    glass: new THREE.MeshStandardMaterial({ color: 0x07070d, metalness: 1, roughness: 0.04 }),
    tireMat: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.25 }),
    head: glow('#fff6e0', 5), tail: glow('#ff1020', 4),
  };
})();
function makeCar(color, player = false) {
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  const b = new THREE.Mesh(carShared.body, paint); b.castShadow = true; body.add(b);
  const cab = new THREE.Mesh(carShared.cabin, carShared.glass); cab.castShadow = true; body.add(cab);
  body.add(new THREE.Mesh(carShared.roof, paint));
  for (const sx of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.06), carShared.head); h.position.set(sx, 0.72, -2.47); body.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.06), carShared.tail); t.position.set(sx, 0.86, 2.4); body.add(t);
  }
  const wheels = [];
  for (const [x, z] of [[-0.93, -1.45], [0.93, -1.45], [-0.93, 1.45], [0.93, 1.45]]) {
    const w = new THREE.Group(); w.position.set(x, 0.37, z);
    w.add(new THREE.Mesh(carShared.tire, carShared.tireMat)); w.add(new THREE.Mesh(carShared.rim, carShared.rimMat));
    car.add(w); wheels.push(w);
  }
  if (player) {
    const ug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.6), new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    ug.rotation.x = -Math.PI / 2; ug.position.y = 0.05; car.add(ug);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.4), paint); sp.position.set(0, 1.3, 2.05); body.add(sp);
    for (const sx of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.1), carShared.tireMat); st.position.set(sx, 1.15, 2.05); body.add(st); }
  }
  city.add(car);
  return { car, body, wheels };
}
const player = { ...makeCar(0xff2e7a, true), x: 2, z: 0, tx: 2, speed: 27, target: 27, yaw: 0, roll: 0 };
const traffic = [];
const tColors = [0xf4f4f4, 0x1d1d1d, 0x2a6df4, 0xffc400, 0xc4161c, 0x12b0a4, 0x7a7a80, 0x6b2fb3];
for (let i = 0; i < 12; i++) {
  const same = i < 6;
  const c = makeCar(pick(tColors));
  const t = { ...c, x: same ? pick([2, 6]) : pick([-2, -6]), dir: same ? -1 : 1, speed: same ? rand(13, 20) : rand(16, 24), z: same ? -40 - i * 55 : -60 - (i - 6) * 70 };
  if (!same) c.car.rotation.y = Math.PI;
  traffic.push(t);
}
function ferrari(color) {
  if (!carGltf) return null;
  const model = carGltf.scene.children[0].clone(true);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, metalness: 0.6, roughness: 0.02, transparent: true, opacity: 0.82, clearcoat: 1 });
  const body = model.getObjectByName('body'); if (body) body.material = paint;
  for (const nm of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) { const o = model.getObjectByName(nm); if (o) o.material = chrome; }
  const g = model.getObjectByName('glass'); if (g) g.material = glass;
  model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (carAO) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({ map: carAO, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; sh.renderOrder = 2; model.add(sh);
  }
  return { model, wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => model.getObjectByName(n)).filter(Boolean) };
}
function upgradeCar(c, color) {
  const f = ferrari(color); if (!f) return;
  c.body.children.forEach((m) => (m.visible = false));
  c.wheels.forEach((w) => (w.visible = false));
  c.body.add(f.model); c.wheels = f.wheels; c.ferrari = true;
}
upgradeCar(player, 0xff1f74);
for (const t of traffic) upgradeCar(t, pick(tColors));

/* =========================================================
   STUDIO SCENE — the Murda Pod
   ========================================================= */
const studio = new THREE.Scene();
studio.background = new THREE.Color(0x05020a);
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x0c0612, side: THREE.BackSide })));
  const panel = (c, x, y, z, w, h, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; env.add(m); };
  panel(0xff2e88, -9, 2, 0, 6, 3, Math.PI / 2); panel(0x12e0c4, 9, 2, 0, 6, 3, -Math.PI / 2);
  panel(0xffe0c0, 0, 4.5, 9, 8, 3, Math.PI); panel(0xff9a50, 0, 2, -9, 5, 2, 0);
  studio.environment = pmrem.fromScene(env, 0.04).texture;
}
studio.add(new THREE.HemisphereLight(0x8a6ac0, 0x1a0820, 0.55));
const key = new THREE.SpotLight(0xffdcb8, 4.4, 0, 0.62, 0.65, 0);
key.position.set(-1.8, 4.3, 5.2); key.target.position.set(0, 1.5, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005;
studio.add(key, key.target);
const fill = new THREE.SpotLight(0xff7ac0, 1.4, 0, 0.8, 0.8, 0); fill.position.set(4, 3.5, 4.5); fill.target.position.set(0, 1.5, 0); studio.add(fill, fill.target);
const rimP = new THREE.PointLight(0xff2e88, 3.2, 9, 0); rimP.position.set(-3, 3, -2.6); studio.add(rimP);
const rimT = new THREE.PointLight(0x12e0c4, 3.2, 9, 0); rimT.position.set(3, 3, -2.6); studio.add(rimT);

// room
const wallTex = canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#24103a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 32) { x.fillStyle = i % 64 ? '#2c1446' : '#1d0c30'; x.fillRect(i, 0, 28, h); }
  noise(x, w, h, 3000, ['#ffffff08', '#00000020'], 2);
});
wallTex.repeat.set(3, 1);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
const floorTex = canvasTex(512, 512, (x, w, h) => {
  for (let i = 0; i < 8; i++) { x.fillStyle = pick(['#3a2418', '#432a1c', '#33200f', '#3e2617']); x.fillRect(0, i * 64, w, 62); }
  noise(x, w, h, 6000, ['#00000030', '#ffffff10'], 2);
});
floorTex.repeat.set(3, 3);
const addPlane = (w, h, mat, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.copy(pos); m.rotation.set(...rot); m.receiveShadow = true; studio.add(m); return m; };
addPlane(14, 13, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.1 }), V(0, 0, 2.5), [-Math.PI / 2, 0, 0]);
addPlane(14, 5, wallMat, V(0, 2.5, -3.5), [0, 0, 0]);
addPlane(13, 5, wallMat, V(-6.5, 2.5, 3), [0, Math.PI / 2, 0]);
addPlane(13, 5, wallMat, V(6.5, 2.5, 3), [0, -Math.PI / 2, 0]);
addPlane(14, 13, new THREE.MeshStandardMaterial({ color: 0x0c0614 }), V(0, 5, 2.5), [Math.PI / 2, 0, 0]);
const rugTex = canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  for (let r = 250; r > 0; r -= 26) { x.beginPath(); x.arc(256, 256, r, 0, 7); x.fillStyle = (r / 26) % 2 < 1 ? '#ff2e88' : '#140818'; x.fill(); }
}, { wrap: false });
const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.receiveShadow = true; studio.add(rug);

// neon sign
const neonSign = canvasTex(1024, 300, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  glowText(x, 'Murda Pod', w / 2, 120, '150px "Permanent Marker"', '#ff2e88', 40);
  glowText(x, 'LIVE  FROM  LEONIDA', w / 2, 250, '64px "Bebas Neue"', '#12e0c4', 26);
}, { wrap: false });
const neonMat = new THREE.MeshBasicMaterial({ map: neonSign, transparent: true, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) });
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.35), neonMat); sign.position.set(0, 3.45, -3.44); studio.add(sign);

// window with sunset
const winTex = canvasTex(512, 320, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5b1f8f'); g.addColorStop(0.45, '#ff2e88'); g.addColorStop(0.8, '#ff8a1f'); g.addColorStop(1, '#ffd23f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffe066'; for (let i = 0; i < 7; i++) x.fillRect(180, 170 + i * 18, 160, 11 - i);
  x.fillStyle = '#1b0b2e';
  let px = 0; while (px < w) { const bw = rand(20, 50), bh = rand(40, 140); x.fillRect(px, h - bh, bw, bh); px += bw + 2; }
  x.strokeStyle = '#1b0b2e'; x.lineWidth = 7; x.beginPath(); x.moveTo(60, h); x.quadraticCurveTo(50, 200, 80, 130); x.stroke();
  for (let a = 0; a < 6; a++) { x.beginPath(); x.moveTo(80, 130); x.quadraticCurveTo(80 + Math.cos(a) * 50, 110 + Math.sin(a) * 15, 80 + Math.cos(a) * 70, 150 + Math.abs(Math.sin(a)) * 20); x.stroke(); }
}, { wrap: false });
const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.75), new THREE.MeshBasicMaterial({ map: winTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
win.position.set(4.1, 2.35, -3.46); studio.add(win);
const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 });
for (const [w, h, x, y] of [[3, 0.1, 4.1, 3.25], [3, 0.1, 4.1, 1.45], [0.1, 1.9, 2.65, 2.35], [0.1, 1.9, 5.55, 2.35], [0.06, 1.8, 4.1, 2.35]]) {
  const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frameMat); f.position.set(x, y, -3.42); studio.add(f);
}
// ON AIR box
const onAirTex = canvasTex(512, 160, (x, w, h) => { x.fillStyle = '#300'; x.fillRect(0, 0, w, h); glowText(x, 'ON AIR', w / 2, h / 2 + 6, '110px Anton', '#ff2a2a', 24); }, { wrap: false });
const onAirMat = new THREE.MeshBasicMaterial({ map: onAirTex, color: new THREE.Color(2, 2, 2) });
const onAir = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.12), [frameMat, frameMat, frameMat, frameMat, onAirMat, frameMat]);
onAir.position.set(-4.2, 3.6, -3.38); studio.add(onAir);
// plaques
const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.18 });
const plat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 1, roughness: 0.15 });
for (let i = 0; i < 3; i++) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.06), frameMat); p.position.set(-5 + i * 0.85, 2.2, -3.42); studio.add(p);
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 32), i === 1 ? plat : gold); d.rotation.x = Math.PI / 2; d.position.set(-5 + i * 0.85, 2.27, -3.37); studio.add(d);
}
// LED strips
for (const [w, x, z, ry, c] of [[14, 0, -3.42, 0, '#ff2e88'], [13, -6.42, 3, Math.PI / 2, '#12e0c4'], [13, 6.42, 3, Math.PI / 2, '#b57bff']]) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.05), glow(c, 2)); s.position.set(x, 4.85, z); s.rotation.y = ry; studio.add(s);
}
// foam panels
{
  const foam = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.16, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a0d2a, roughness: 1 }), 400);
  let n = 0;
  for (const side of [-1, 1]) for (let iz = 0; iz < 12; iz++) for (let iy = 0; iy < 8; iy++) {
    dummy.position.set(side * 6.4, 1.1 + iy * 0.3, -2.4 + iz * 0.3); dummy.rotation.set(0, side * -Math.PI / 2, Math.PI / 4); dummy.scale.setScalar(1); dummy.updateMatrix();
    foam.setMatrixAt(n++, dummy.matrix);
  }
  foam.count = n; studio.add(foam);
}
// desk
const deskMat = new THREE.MeshStandardMaterial({ color: 0x15101c, roughness: 0.25, metalness: 0.4 });
const desk = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.08, 1.15), deskMat); desk.position.set(0, 0.98, 0.95); desk.castShadow = desk.receiveShadow = true; studio.add(desk);
const deskFront = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.92, 0.06), deskMat); deskFront.position.set(0, 0.5, 1.5); studio.add(deskFront);
const deskLogo = canvasTex(1024, 200, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = '120px Anton'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText('MURDA  POD', w / 2, h / 2 + 4); }, { wrap: false });
const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.47), new THREE.MeshBasicMaterial({ map: deskLogo, transparent: true, color: new THREE.Color(0.75, 0.75, 0.8) })); logo.position.set(0, 0.55, 1.535); studio.add(logo);
const deskStrip = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.03), glow('#ff2e88', 1.8)); deskStrip.position.set(0, 0.93, 1.54); studio.add(deskStrip);
const deskStrip2 = deskStrip.clone(); deskStrip2.position.y = 0.06; deskStrip2.material = glow('#12e0c4', 1.8); studio.add(deskStrip2);
// monitor w/ live waveform
const monTex = canvasTex(512, 300, () => {}, { wrap: false });
const monitor = new THREE.Group();
const monScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.46), new THREE.MeshBasicMaterial({ map: monTex, color: new THREE.Color(1.0, 1.0, 1.0) }));
monScreen.position.z = 0.026; monitor.add(monScreen);
monitor.add(new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.52, 0.04), frameMat));
const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), frameMat); stand.position.y = -0.4; monitor.add(stand);
monitor.position.set(1.3, 1.5, 1.0); monitor.rotation.set(-0.08, -0.35, 0); studio.add(monitor);
// mixer + LEDs
const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.38), frameMat); mixer.position.set(0, 1.05, 0.82); studio.add(mixer);
const leds = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.04), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  m.position.set(-0.33 + i * 0.073, 1.09, 0.72); studio.add(m); leds.push(m);
}
for (let i = 0; i < 8; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12), plat); k.position.set(-0.3 + i * 0.085, 1.1, 0.88); studio.add(k); }
// cups
for (const [x, z] of [[-0.85, 1.2], [1.95, 1.3]]) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0xd8102a, roughness: 0.4 })); c.position.set(x, 1.1, z); studio.add(c);
}

// volumetric light shafts + floating dust
const beamTex = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, { wrap: false });
function beam(from, to, r0, r1, color, op) {
  const d = new THREE.Vector3().subVectors(to, from);
  const geo = new THREE.CylinderGeometry(r0, r1, d.length(), 32, 1, true);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(from).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, -1, 0), d.normalize());
  studio.add(m); return m;
}
const beams = [beam(V(4.1, 2.4, -3.4), V(1.2, 0.2, 2.2), 0.9, 2.2, 0xff9a6a, 0.09), beam(V(-1.8, 4.6, 5.2), V(-0.4, 0.6, 0.5), 0.15, 1.6, 0xfff0dd, 0.05)];
const dust = (() => {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = rand(-5, 5); pos[i * 3 + 1] = rand(0.3, 4.6); pos[i * 3 + 2] = rand(-3.2, 5); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd8c0, size: 0.012, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  studio.add(p); return p;
})();

/* ---------- photo face: crop, feather, and pre-render talking mouth frames ---------- */
function makeFace(img) {
  if (!img) return null;
  const k = img.naturalWidth / 447;                       // crop coords measured on the 447px source
  const C = { x: 112 * k, y: 8 * k, w: 192 * k, h: 288 * k };
  const W = 512, H = 768, sc = W / C.w;
  const mouthY = (245 * k - C.y) * sc, mx0 = (176 * k - C.x) * sc, mx1 = (244 * k - C.x) * sc, mcx = (mx0 + mx1) / 2;
  const frames = [0, 9, 18, 28].map((d) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.drawImage(img, C.x, C.y, C.w, mouthY / sc, 0, 0, W, mouthY);
    x.drawImage(img, C.x, C.y + mouthY / sc, C.w, C.h - mouthY / sc, 0, mouthY + d, W, H - mouthY);
    if (d > 0) {
      x.drawImage(img, C.x, C.y + mouthY / sc, C.w, 1, 0, mouthY, W, d + 1);
      x.fillStyle = '#1a0506'; x.beginPath(); x.ellipse(mcx, mouthY + d / 2, (mx1 - mx0) * 0.42, d / 2 + 2, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(232,226,214,.9)'; x.fillRect(mcx - (mx1 - mx0) * 0.28, mouthY - 1, (mx1 - mx0) * 0.56, Math.min(7, d * 0.3));
    }
    x.globalCompositeOperation = 'destination-in';
    x.save(); x.translate(W / 2, H * 0.5); x.scale(1, H / W);
    const g = x.createRadialGradient(0, 0, W * 0.3, 0, 0, W * 0.5); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(-W / 2, -W / 2, W, W); x.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  });
  const sc2 = document.createElement('canvas'); sc2.width = sc2.height = 8; const sx = sc2.getContext('2d');
  sx.drawImage(img, 150 * k, 175 * k, 22 * k, 22 * k, 0, 0, 8, 8);
  const d = sx.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4, skin = new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`);
  return { frames, skin };
}
const face = makeFace(facePhoto);

/* ---------- photo bust: cut him out of the background, pre-render talking frames, sculpt depth ---------- */
function makeBust(img) {
  if (!img) return null;
  const k = img.naturalWidth / 447, N = 1024, s = N / 447;
  const mask = document.createElement('canvas'); mask.width = mask.height = N; const mk = mask.getContext('2d');
  const poly = [[205, 8], [240, 12], [268, 30], [280, 60], [284, 100], [293, 118], [298, 140], [293, 172], [283, 190], [274, 222], [268, 238], [300, 248], [350, 262], [400, 282], [447, 318], [447, 447], [0, 447], [0, 318], [40, 282], [90, 258], [140, 240], [140, 222], [131, 192], [120, 175], [116, 140], [121, 118], [128, 110], [128, 70], [140, 38], [165, 16]];
  mk.filter = 'blur(5px)'; mk.fillStyle = '#fff'; mk.beginPath();
  poly.forEach(([x, y], i) => (i ? mk.lineTo(x * s, y * s) : mk.moveTo(x * s, y * s))); mk.closePath(); mk.fill();
  mk.filter = 'none'; mk.globalCompositeOperation = 'destination-out';
  const fade = mk.createLinearGradient(0, N * 0.9, 0, N); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  mk.fillStyle = fade; mk.fillRect(0, N * 0.9, N, N * 0.1);
  for (const [x0, x1] of [[0, N * 0.06], [N, N * 0.94]]) { const g = mk.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); mk.fillStyle = g; mk.fillRect(Math.min(x0, x1), 0, N * 0.06, N); }
  const my = 243 * s;
  const frames = [0, 8, 16, 25].map((d) => {
    const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, N, N);
    if (d > 0) {
      x.save(); x.beginPath(); x.moveTo(140 * s, my); x.lineTo(280 * s, my); x.lineTo(274 * s, 302 * s); x.lineTo(146 * s, 302 * s); x.closePath(); x.clip();
      x.drawImage(img, 0, 243 * k, img.naturalWidth, 62 * k, 0, my + d, N, 62 * s);
      x.drawImage(img, 0, 243 * k, img.naturalWidth, 1 * k, 0, my, N, d + 1);
      x.restore();
      x.fillStyle = '#1b0607'; x.beginPath(); x.ellipse(209 * s, my + d / 2, 25 * s, d / 2 + 2, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(230,224,212,.85)'; x.fillRect(193 * s, my - 1, 32 * s, Math.min(8, d * 0.28));
    }
    x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  });
  return { frames };
}
function bustDepth(u, v) {
  const ex = (u - 207) / 90, ey = (v - 150) / 142, r2 = ex * ex + ey * ey;
  const g = (cx, cy, sx, sy, a) => a * Math.exp(-((u - cx) ** 2 / (2 * sx * sx) + (v - cy) ** 2 / (2 * sy * sy)));
  let z = r2 < 1 ? Math.sqrt(1 - r2) * 0.13 : 0;
  z += g(207, 192, 15, 22, 0.035) + g(208, 240, 26, 10, 0.012) + g(207, 270, 30, 14, 0.01) + g(207, 128, 50, 14, 0.008);
  z -= g(178, 160, 13, 8, 0.012) + g(238, 160, 13, 8, 0.012);
  const neck = v > 200 ? Math.sqrt(Math.max(0, 1 - ((u - 208) / 70) ** 2)) * 0.09 : 0;
  const t = Math.min(1, Math.max(0, (v - 215) / 70));
  const torso = Math.sqrt(Math.max(0, 1 - ((u - 223) / 260) ** 2)) * 0.12 * (t * t * (3 - 2 * t));
  return Math.max(z, neck, torso);
}
const bust = makeBust(facePhoto);

/* ---------- characters ---------- */
const skinNormal = noiseNormal(256, [[37, 41, 1], [83, 79, 0.5], [131, 127, 0.25]], 1.2, 6);
const knitNormal = noiseNormal(256, [[64, 0, 1], [0, 96, 0.6], [23, 29, 0.4]], 2.2, 8);
function makeCharacter(o) {
  const root = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: o.skin, roughness: 0.46, normalMap: skinNormal, normalScale: new THREE.Vector2(0.35, 0.35), sheen: o.photo ? 0.08 : 0.4, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.7 });
  const cloth = new THREE.MeshPhysicalMaterial({ color: o.cloth, roughness: 0.92, normalMap: knitNormal, normalScale: new THREE.Vector2(0.8, 0.8), sheen: o.tee ? 0.25 : 1, sheenColor: new THREE.Color(o.cloth).lerp(new THREE.Color(0xffffff), o.tee ? 0 : 0.35), sheenRoughness: 0.7, envMapIntensity: 0.4 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.4, metalness: 0.3 });
  const add = (geo, mat, pos, parent = root, scale) => { const m = new THREE.Mesh(geo, mat); m.position.copy(pos); if (scale) m.scale.copy(scale); m.castShadow = true; parent.add(m); return m; };

  // chair
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.6 });
  add(new THREE.BoxGeometry(0.62, 0.1, 0.6), chairMat, V(0, 0.48, 0.02));
  add(new THREE.BoxGeometry(0.62, 0.95, 0.12), chairMat, V(0, 1.05, -0.36));
  add(new THREE.BoxGeometry(0.64, 0.06, 0.13), glow(o.accent, 1.1), V(0, 1.5, -0.36));
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.45), chairMat, V(0, 0.22, 0));
  // legs
  for (const s of [-1, 1]) {
    const th = add(new THREE.CapsuleGeometry(0.115, 0.36, 4, 10), pants, V(s * 0.14, 0.62, 0.22)); th.rotation.x = Math.PI / 2;
    add(new THREE.CapsuleGeometry(0.095, 0.38, 4, 10), pants, V(s * 0.14, 0.32, 0.46));
    add(new THREE.BoxGeometry(0.15, 0.11, 0.3), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }), V(s * 0.14, 0.06, 0.53));
  }
  // torso
  const torso = add(new THREE.CapsuleGeometry(0.3, 0.42, 6, 18), cloth, V(0, 1.12, 0), root, V(1.18, 1, 0.82));
  if (o.tee) { const col = add(new THREE.TorusGeometry(0.115, 0.022, 8, 24), cloth, V(0, 1.5, 0.01)); col.rotation.x = Math.PI / 2 - 0.25; }
  else add(new THREE.TorusGeometry(0.2, 0.07, 8, 20), cloth, V(0, 1.47, -0.08)).rotation.x = Math.PI / 2; // hood bunch
  add(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 12), skin, V(0, 1.55, 0));
  // chain
  if (o.chain) {
    const chainMat = o.chain === 'gold' ? gold : plat;
    const curve = o.longChain
      ? new THREE.CatmullRomCurve3([V(-0.1, 1.54, -0.02), V(-0.09, 1.42, 0.2), V(-0.075, 1.2, 0.255), V(0, 1.08, 0.262), V(0.075, 1.2, 0.255), V(0.09, 1.42, 0.2), V(0.1, 1.54, -0.02), V(0, 1.57, -0.1)], true)
      : new THREE.CatmullRomCurve3([V(-0.15, 1.52, -0.02), V(-0.13, 1.38, 0.17), V(0, 1.25, 0.27), V(0.13, 1.38, 0.17), V(0.15, 1.52, -0.02), V(0, 1.56, -0.1)], true);
    add(new THREE.TubeGeometry(curve, 96, o.longChain ? 0.009 : 0.017, 6, true), chainMat, V(0, 0, 0));
    const pend = o.longChain ? null : add(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 24), chainMat, V(0, 1.18, 0.275)); if (pend) pend.rotation.x = Math.PI / 2 - 0.25;
    if (o.chain === 'gold') { const gem = add(new THREE.OctahedronGeometry(0.03), glow('#ff2e88', 2), V(0, 1.18, 0.29)); gem.scale.z = 0.4; }
  }
  // head
  const head = new THREE.Group(); head.position.y = 1.6; root.add(head);
  const P = o.photo || o.bust;
  const skull = o.bust ? add(new THREE.SphereGeometry(0.21, 32, 24), new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.9 }), V(0, 0.27, -0.04), head, V(0.68, 0.84, 0.68))
    : add(new THREE.SphereGeometry(0.21, 48, 36), skin, V(0, 0.2, 0), head, o.photo ? V(0.95, 1.22, 1.05) : V(1, 1.12, 1.03));
  for (const s of (P ? [] : [-1, 1])) {
    add(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.2 }), V(s * 0.075, 0.23, 0.19), head);
    add(new THREE.SphereGeometry(0.016, 12, 10), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.1 }), V(s * 0.075, 0.23, 0.213), head);
    const br = add(new THREE.BoxGeometry(0.075, 0.02, 0.025), new THREE.MeshStandardMaterial({ color: 0x120a06 }), V(s * 0.077, 0.275, 0.205), head);
    br.rotation.z = s * (o.brow ?? 0.25);
    add(new THREE.SphereGeometry(0.05, 12, 10), skin, V(s * 0.212, 0.2, 0), head);
  }
  if (o.photo) for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.05, 12, 10), skin, V(s * 0.2, 0.2, 0), head);
  if (!P) add(new THREE.SphereGeometry(0.042, 14, 10), skin, V(0, 0.17, 0.222), head, V(1.1, 0.8, 0.9));
  if (o.beard) {
    add(new THREE.SphereGeometry(0.222, 32, 16, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), new THREE.MeshStandardMaterial({ color: 0x120c09, roughness: 1 }), V(0, 0.2, 0.012), head, V(1.02, 1.1, 1.02));
    add(new THREE.BoxGeometry(0.13, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: 0x120c09, roughness: 1 }), V(0, 0.122, 0.226), head);
  }
  const mouth = P ? null : add(new THREE.SphereGeometry(0.045, 16, 10), new THREE.MeshStandardMaterial({ color: 0x2a0606, roughness: 0.6 }), V(0, 0.085, o.beard ? 0.232 : 0.212), head, V(1.25, 0.3, 0.5));
  const teeth = P ? null : add(new THREE.BoxGeometry(0.06, 0.012, 0.01), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), V(0, 0.098, (o.beard ? 0.25 : 0.232)), head);
  if (o.bust) { /* photo has the real head */ } else if (o.hat === 'buzz') {
    const hair = add(new THREE.SphereGeometry(0.212, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color: 0x17110e, roughness: 1, normalMap: skinNormal, normalScale: new THREE.Vector2(1.5, 1.5) }), V(0, 0.2, -0.005), head, V(0.965, 1.235, 1.06));
    hair.rotation.x = -0.5;
  } else if (o.hat === 'beanie') {
    const hm = new THREE.MeshStandardMaterial({ color: 0xb3121b, roughness: 0.95 });
    add(new THREE.SphereGeometry(0.222, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hm, V(0, 0.29, -0.01), head, V(1.02, 0.95, 1.06));
    add(new THREE.CylinderGeometry(0.228, 0.232, 0.07, 32), new THREE.MeshStandardMaterial({ color: 0x8f0d14, roughness: 0.95 }), V(0, 0.3, -0.01), head, V(1.02, 1, 1.06));
  } else {
    const cm = new THREE.MeshStandardMaterial({ color: o.hatColor, roughness: 0.7 });
    add(new THREE.SphereGeometry(0.225, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, V(0, 0.27, 0), head, V(1, 0.9, 1.06));
    const brim = add(new THREE.BoxGeometry(0.22, 0.02, 0.2), cm, V(0, 0.28, -0.29), head); brim.rotation.x = -0.15;
  }
  // headphones
  if (!o.bust) {
    const hp = new THREE.MeshStandardMaterial({ color: o.phones, roughness: 0.35, metalness: 0.4 });
    add(new THREE.TorusGeometry(0.255, 0.022, 8, 32, Math.PI), hp, V(0, 0.22, -0.02), head);
    for (const s of [-1, 1]) {
      const cup = add(new THREE.CylinderGeometry(0.09, 0.09, 0.075, 24), hp, V(s * 0.25, 0.2, 0), head); cup.rotation.z = Math.PI / 2;
      const ring = add(new THREE.TorusGeometry(0.075, 0.008, 6, 24), glow(o.accent, 1.3), V(s * 0.29, 0.2, 0), head); ring.rotation.y = Math.PI / 2;
    }
  }
  // photo bust: real photo pushed into 3D relief (head, nose, lips, neck, chest)
  let bustMat = null;
  const PX = 0.0013, S0 = 447 * PX;
  if (o.bust) {
    const geo = new THREE.PlaneGeometry(S0, S0, 200, 200), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, bustDepth((pa.getX(i) / S0 + 0.5) * 447, (0.5 - pa.getY(i) / S0) * 447));
    geo.computeVertexNormals();
    bustMat = new THREE.MeshStandardMaterial({ map: o.bust.frames[0], emissiveMap: o.bust.frames[0], emissive: 0xffffff, emissiveIntensity: 0.34, color: 0x8a8a8a, transparent: true, alphaTest: 0.04, roughness: 0.6, envMapIntensity: 0.25 });
    const m = new THREE.Mesh(geo, bustMat); m.castShadow = true;
    m.position.set((223.5 - 207) * PX, 0.47 - S0 / 2, 0.1); head.add(m);
  }
  // arms
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.4, 1.42, 0); root.add(sh);
    add(new THREE.CapsuleGeometry(0.1, 0.28, 4, 10), cloth, V(0, -0.22, 0), sh);
    const el = new THREE.Group(); el.position.y = -0.44; sh.add(el);
    add(new THREE.CapsuleGeometry(0.085, 0.26, 4, 10), o.tee ? skin : cloth, V(0, -0.18, 0), el);
    if (o.tee) add(new THREE.CylinderGeometry(0.108, 0.112, 0.12, 16), cloth, V(0, -0.36, 0), sh);
    add(new THREE.SphereGeometry(0.075, 14, 10), skin, V(0, -0.38, 0), el, V(0.9, 1.15, 0.8));
    if (s === 1 && o.chain === 'gold') add(new THREE.TorusGeometry(0.075, 0.015, 8, 20), gold, V(0, -0.3, 0), el).rotation.x = Math.PI / 2;
    sh.rotation.x = -0.5; el.rotation.x = -1.05;
    return { sh, el };
  };
  const armL = arm(-1), armR = arm(1);

  let mouthOpen = 0, gest = 0, faceMat = null;
  return {
    root, head, bust: !!o.bust,
    mouthLocal: o.bust ? V(0, 1.6 + 0.47 - 243 * PX, 0.25) : null,
    micLocal: o.bust ? V(0.2, 1.52, 0.5) : null,
    // project the photo onto the front of the head once the character is placed in the scene
    buildFace() {
      if (!o.photo) return;
      root.updateMatrixWorld(true);
      const q = skull.getWorldQuaternion(new THREE.Quaternion());
      const pos = skull.getWorldPosition(new THREE.Vector3()).addScaledVector(V(0, 0, 1).applyQuaternion(q), 0.14);
      const geo = new DecalGeometry(skull, pos, new THREE.Euler().setFromQuaternion(q), V(0.365, 0.548, 0.3));
      geo.applyMatrix4(head.matrixWorld.clone().invert());
      faceMat = new THREE.MeshStandardMaterial({ map: o.photo.frames[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.55, envMapIntensity: 0.5 });
      const m = new THREE.Mesh(geo, faceMat); m.renderOrder = 1; head.add(m);
    },
    update(t, talking, beat, lookYaw, seed) {
      torso.scale.y = 1 + Math.sin(t * 2 + seed) * 0.012;
      const syl = Math.max(0, Math.sin(t * 17 + seed) * 0.6 + Math.sin(t * 11.3) * 0.5) * (0.6 + 0.4 * Math.sin(t * 3.7));
      mouthOpen = lerp(mouthOpen, talking ? syl : 0, 0.45);
      if (bustMat) { const f = o.bust.frames[Math.min(3, Math.round(mouthOpen * 3.4))]; bustMat.map = bustMat.emissiveMap = f; }
      else if (faceMat) faceMat.map = o.photo.frames[Math.min(3, Math.round(mouthOpen * 3.4))];
      else if (mouth) { mouth.scale.y = 0.3 + mouthOpen * 1.9; teeth.visible = mouthOpen > 0.25; }
      head.rotation.x = lerp(head.rotation.x, -0.04 + beat * 0.07 + (talking ? Math.sin(t * 6.3 + seed) * 0.05 : 0), 0.25);
      const yk = o.bust ? 0.3 : 1;
      head.rotation.y = lerp(head.rotation.y, (lookYaw + (talking ? Math.sin(t * 1.7 + seed) * 0.12 : 0)) * yk, 0.06);
      head.rotation.z = lerp(head.rotation.z, talking ? Math.sin(t * 2.3 + seed) * 0.05 * yk : 0, 0.08);
      gest = lerp(gest, talking ? 1 : 0, 0.05);
      const g1 = Math.sin(t * 3.1 + seed) * 0.5 + Math.sin(t * 5.3 + seed * 2) * 0.5;
      const g2 = Math.sin(t * 2.6 + seed + 1) * 0.5 + Math.sin(t * 4.1) * 0.5;
      armR.sh.rotation.x = lerp(armR.sh.rotation.x, -0.5 - gest * (0.55 + 0.35 * g1), 0.12);
      armR.sh.rotation.z = lerp(armR.sh.rotation.z, gest * 0.25 * g2, 0.12);
      armR.el.rotation.x = lerp(armR.el.rotation.x, -1.05 - gest * (0.35 + 0.3 * Math.abs(g2)), 0.12);
      armL.sh.rotation.x = lerp(armL.sh.rotation.x, -0.5 - gest * 0.25 * Math.max(0, g2), 0.1);
      armL.el.rotation.x = lerp(armL.el.rotation.x, -1.05 - gest * 0.2 * Math.max(0, g1), 0.1);
    },
  };
}
const host = bust
  ? makeCharacter({ bust, skin: face.skin.clone().multiplyScalar(0.85), cloth: 0xb9b8b3, tee: true, pants: 0x1f2633, hat: 'none', beard: false, chain: 'silver', longChain: true, phones: 0x0b0b0e, accent: '#ff2e88' })
  : face
  ? makeCharacter({ photo: face, skin: face.skin.clone().multiplyScalar(0.85), cloth: 0xb9b8b3, tee: true, pants: 0x1f2633, hat: 'buzz', beard: false, chain: 'silver', longChain: true, phones: 0x0b0b0e, accent: '#ff2e88' })
  : makeCharacter({ skin: 0x5e3b28, cloth: 0x121214, pants: 0x1b1b22, hat: 'beanie', beard: true, chain: 'gold', phones: 0x0b0b0e, accent: '#ff2e88', brow: 0.3 });
host.root.position.set(0, 0, 0); host.root.rotation.y = 0; studio.add(host.root);
host.buildFace();

// mics on boom arms
function mouthWorld(ch) { return ch.root.localToWorld(V(0, 1.685, 0.24)); }
studio.updateMatrixWorld(true);
for (const ch of [host]) {
  const mw = ch.mouthLocal ? ch.root.localToWorld(ch.mouthLocal.clone()) : mouthWorld(ch);
  const micPos = ch.root.localToWorld(ch.micLocal ? ch.micLocal.clone() : V(0, 1.64, 0.56));
  const base = V(0.55, 1.02, 1.35);
  const elbow = V(0.5, 1.75, 1.15);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.7, roughness: 0.35 });
  studio.add(cylBetween(base, elbow, 0.018, armMat), cylBetween(elbow, micPos, 0.016, armMat));
  const mic = new THREE.Group(); mic.position.copy(micPos); mic.lookAt(mw);
  const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.17, 6, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x18181c, metalness: 0.6, roughness: 0.35 }));
  const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.09, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: 0.9, roughness: 0.5 }));
  grill.position.z = 0.06; bodyM.castShadow = true; mic.add(bodyM, grill); studio.add(mic);
}

/* ---------- custom host model: drop a .glb at models/murda.glb and it replaces the stylized host ---------- */
const custom = { mixer: null, root: null, head: null, jaw: null, baseY: 0 };
(async () => {
  const url = 'models/murda.glb';
  if (!window.MURDA_CUSTOM_MODEL) return; // studio character not used on the countdown site
  try { const r = await fetch(url, { method: 'HEAD' }); if (!r.ok) return; } catch { return; }
  const gltf = await gltfLoader.loadAsync(url).catch((e) => { console.warn('murda.glb failed to load', e); return null; });
  if (!gltf) return;
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material) o.material.envMapIntensity = 0.7; }
    const n = (o.name || '').toLowerCase();
    if (!custom.head && /(^|[^a-z])head$|mixamorighead/.test(n)) custom.head = o;
    if (!custom.jaw && /jaw/.test(n)) custom.jaw = o;
  });
  // fit: busts / seated photos -> upper body above the desk; tall full-body models -> standing behind it
  model.updateMatrixWorld(true);
  const measure = () => { model.updateMatrixWorld(true); const b = new THREE.Box3(); model.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); b.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else if (o.isMesh) b.expandByObject(o, true); }); return b; };
  const box = measure(), size = box.getSize(new THREE.Vector3());
  const fullBody = size.y / Math.max(size.x, size.z) > 1.6;
  const targetH = fullBody ? 1.85 : 1.05;
  const k = targetH / size.y;
  model.scale.setScalar(k);
  box.copy(measure());
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, fullBody ? -box.min.y : 1.02 - box.min.y, -c.z);
  const holder = new THREE.Group(); holder.add(model);
  holder.position.copy(host.root.position); holder.rotation.y = host.root.rotation.y;
  studio.add(holder);
  // hide the stylized host's body but keep the chair
  host.root.traverse((o) => { if (o.isMesh && o.position.y > 0.56 && o.geometry.type !== 'BoxGeometry') o.visible = false; });
  host.root.children.forEach((o) => { if (o.isGroup) o.visible = false; });
  if (gltf.animations.length) { custom.mixer = new THREE.AnimationMixer(model); custom.mixer.clipAction(gltf.animations[0]).play(); }
  custom.root = holder; custom.baseY = holder.position.y;
  console.info('Custom host model loaded', { fullBody, bones: { head: !!custom.head, jaw: !!custom.jaw }, clips: gltf.animations.map((a) => a.name) });
})();
function updateCustomHost(dt, talking, beat, look) {
  if (!custom.root) return;
  custom.mixer?.update(dt);
  custom.root.position.y = custom.baseY + beat * 0.012;
  custom.root.rotation.y = lerp(custom.root.rotation.y, host.root.rotation.y + look * 0.4 + (talking ? Math.sin(S.T * 1.7) * 0.06 : 0), 0.06);
  if (custom.head && !custom.mixer) custom.head.rotation.x = lerp(custom.head.rotation.x, beat * 0.08 + (talking ? Math.sin(S.T * 6.3) * 0.05 : 0), 0.25);
  if (custom.jaw) custom.jaw.rotation.x = talking ? Math.max(0, Math.sin(S.T * 17)) * 0.18 : 0;
}

/* =========================================================
   POST FX
   ========================================================= */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(city, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.4, 0.92);
const bokeh = new BokehPass(city, camera, { focus: 10, aperture: 0.0002, maxblur: 0.006 });
bokeh.enabled = false;
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, ca: { value: 0.0018 }, vig: { value: 0.42 }, grain: { value: 0.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, ca, vig, grain; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      vec2 off = c * ca * d * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.88, 1.0, 1.1), (1.0 - l) * 0.35);   // teal shadows
      col = mix(col, col * vec3(1.1, 1.0, 0.9), l * 0.35);            // warm highlights
      col = (col - 0.5) * 1.08 + 0.5;                                  // contrast
      col = mix(vec3(l), col, 1.08);                                   // saturation
      col *= 1.0 - vig * smoothstep(0.3, 0.85, d);
      col += (rnd(vUv * 1000.0 + fract(time)) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(bokeh); composer.addPass(new OutputPass()); composer.addPass(grade);

function resize() {
  const w = hero.clientWidth, h = hero.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* =========================================================
   AUDIO — synthesized radio + engine
   ========================================================= */
const A = { ctx: null, master: null, music: null, analyser: null, data: new Uint8Array(64), timer: 0, step: 0, next: 0, engG: null, engO: null, engF: null, muted: false };
function audioInit() {
  if (A.ctx) return;
  A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.master = A.ctx.createGain(); A.master.gain.value = 0.55; A.master.connect(A.ctx.destination);
  A.music = A.ctx.createGain(); A.music.gain.value = 0.8;
  A.analyser = A.ctx.createAnalyser(); A.analyser.fftSize = 128;
  A.music.connect(A.analyser); A.analyser.connect(A.master);
  A.engO = A.ctx.createOscillator(); A.engO.type = 'sawtooth';
  A.engF = A.ctx.createBiquadFilter(); A.engF.type = 'lowpass'; A.engF.frequency.value = 380;
  A.engG = A.ctx.createGain(); A.engG.gain.value = 0;
  A.engO.connect(A.engF); A.engF.connect(A.engG); A.engG.connect(A.master); A.engO.start();
}
const ac = () => A.ctx;
function kick(t) { const o = ac().createOscillator(), g = ac().createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42); o.connect(g); g.connect(A.music); o.start(t); o.stop(t + 0.45); }
function nz(t, dur, hp, vol, dest = A.music) {
  const b = ac().createBuffer(1, Math.max(1, ac().sampleRate * dur), ac().sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ac().createBufferSource(); s.buffer = b; const f = ac().createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ac().createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t);
}
function bass(t, f0) { const o = ac().createOscillator(), g = ac().createGain(), f = ac().createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f0; f.type = 'lowpass'; f.frequency.value = 280; g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38); o.connect(f); f.connect(g); g.connect(A.music); o.start(t); o.stop(t + 0.4); }
function keys(t, f0) { [1, 1.189, 1.498, 1.782].forEach((m) => { const o = ac().createOscillator(), g = ac().createGain(); o.type = 'triangle'; o.frequency.value = f0 * m; g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1); o.connect(g); g.connect(A.music); o.start(t); o.stop(t + 1.2); }); }
const bassPat = [1, 0, 0, 1, 0, 0, 1.19, 0, 0.89, 0, 0, 0.89, 0, 0, 1.06, 0];
function schedule() {
  const st = STATIONS[S.station], spb = 60 / st.bpm / 4;
  while (A.next < ac().currentTime + 0.12) {
    const s = A.step % 16, t = A.next, bar = Math.floor(A.step / 16);
    if (s === 0 || s === 7 || s === 10) kick(t);
    if (s === 4 || s === 12) nz(t, 0.2, 1400, 0.45);
    if (s % 2 === 0) nz(t, 0.04, 7000, 0.12);
    if (s === 14 && bar % 2) nz(t, 0.04, 7000, 0.1);
    if (bassPat[s]) bass(t, st.root * bassPat[s]);
    if (s === 0) keys(t, st.root * 4 * (bar % 2 ? 0.89 : 1));
    A.next += spb; A.step++;
  }
}
function musicStart() { audioInit(); A.ctx.resume(); clearInterval(A.timer); A.next = A.ctx.currentTime + 0.05; A.step = 0; A.timer = setInterval(schedule, 25); }
function staticBurst() { if (A.ctx) nz(A.ctx.currentTime, 0.3, 400, 0.3, A.master); }

/* =========================================================
   STATE + DIRECTOR
   ========================================================= */
const S = {
  started: false, mode: 'cruise', T: 0, modeT: 0,
  station: 0, cine: true, camIdx: 0, camT: 0, auto: true, laneT: 3,
  ep: 0, line: -1, lineT: 0, shot: 'crane', shotT: 0, shotDur: 4,
  cash: 1250000, minutes: 19 * 60 + 42, studioZ: -950, djT: 9,
};
const CRUISE_CAMS = ['chase', 'roadside', 'low', 'chase', 'heli', 'roadside', 'hood'];
const roadCam = V(); let roadCamSet = false;

const ui = {
  hero, radioPop: $('radioPop'), radioName: $('radioName'), radioSong: $('radioSong'),
  areaPop: $('areaPop'), areaName: $('areaName'), areaSub: $('areaSub'),
  mission: $('mission'), sub: $('subtitle'), passed: $('passed'), passedEp: $('passedEp'),
  cash: $('cash'), clock: $('clock'), mph: $('mph'), modeBtn: $('modeBtn'), cineBtn: $('cineBtn'), title: $('heroTitle'), fade: $('fade'),
};
const timers = {};
function flash(el, ms, key) { el.classList.add('show'); clearTimeout(timers[key]); timers[key] = setTimeout(() => el.classList.remove('show'), ms); }
function showRadio() {
  const st = STATIONS[S.station];
  ui.radioName.textContent = `${st.name} ${st.freq}`; ui.radioName.style.color = st.color; ui.radioSong.textContent = st.song;
  flash(ui.radioPop, 3200, 'radio');
}
function showArea(name, sub) { ui.areaName.textContent = name; ui.areaSub.textContent = sub; flash(ui.areaPop, 4200, 'area'); }
function showMission(html, ms = 5000) { if (S.mode !== 'cruise') return; ui.mission.innerHTML = html; flash(ui.mission, ms, 'mission'); }
function showSub(html, ms) { ui.sub.innerHTML = html; flash(ui.sub, ms, 'sub'); }
function setClasses() {
  const hudOn = !isAttract() && S.mode === 'cruise' && ['chase', 'hood'].includes(curCam());
  hero.classList.toggle('hud-on', hudOn);
  hero.classList.toggle('cine', !hudOn);
  ui.cineBtn.classList.toggle('on', S.cine);
}
const curCam = () => CRUISE_CAMS[S.camIdx % CRUISE_CAMS.length];

const isAttract = () => hero.classList.contains('attract');
function showCutShort() {
  hero.classList.add('wasted'); flash($('cutShort'), 5600, 'cut'); staticBurst();
  ui.mission.classList.remove('show');
  clearTimeout(timers.wasted); timers.wasted = setTimeout(() => hero.classList.remove('wasted'), 5600);
}
function transition(fn) {
  ui.fade.classList.add('on');
  setTimeout(() => { fn(); setClasses(); requestAnimationFrame(() => ui.fade.classList.remove('on')); }, 600);
}
function goStudio(ep) {
  if (S.mode === 'studio' && ep === undefined) return;
  transition(() => {
    S.mode = 'studio'; S.modeT = 0; if (ep !== undefined) S.ep = ep;
    ui.title.classList.add('gone');
    S.line = -1; S.lineT = -2.2; setShot('crane', 4.2);
    renderPass.scene = studio; bokeh.scene = studio; bokeh.enabled = true; renderer.toneMappingExposure = 1.0; bloom.strength = 0.7; bloom.threshold = 0.93;
    showArea('Murda Pod Studios', 'EPISODE ' + String(S.ep + 1).padStart(2, '0') + ' — ' + EPISODES[S.ep].t.toUpperCase());
    ui.mission.classList.remove('show');
  });
}
function goCruise() {
  transition(() => {
    S.mode = 'cruise'; S.modeT = 0; S.camIdx = 0; S.camT = 0;
    renderPass.scene = city; bokeh.scene = city; renderer.toneMappingExposure = 0.5; bloom.strength = 0.45; bloom.threshold = 0.92;
    S.studioZ = player.z - 950;
    ui.sub.classList.remove('show');
    setTimeout(() => showMission('The pod got <b>cut short</b>. Full video drops soon.', 6000), 900);
  });
}

/* ---------- studio shots ---------- */
const SHOTS = {
  wide: { p: V(0, 2.3, 6.4), l: V(0, 1.55, 0.2), f: 40, m: V(0.9, 0.1, -0.8) },
  host: { p: V(-0.35, 1.86, 1.7), l: V(0, 1.76, 0.15), f: 30, m: V(0.05, 0.02, -0.12) },
  host2: { p: V(0.6, 1.95, 2.3), l: V(0, 1.72, 0.15), f: 34, m: V(-0.12, 0, -0.1) },
  listen: { p: V(0, 1.95, 3.6), l: V(0, 1.6, 0.2), f: 34, m: V(0, 0, -0.6) },
  crane: { p: V(0, 4.3, 4.2), l: V(0, 1.2, 0.4), f: 42, m: V(0, -1.6, 1.2) },
};
function setShot(name, dur) { S.shot = name; S.shotT = 0; S.shotDur = dur; }
const ease = (t) => t * t * (3 - 2 * t);

/* ---------- input ---------- */
const keysDown = {};
addEventListener('keydown', (e) => {
  if (!S.started || e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  keysDown[k] = true;
  if (k === 'c') act('cam');
  if (k === 'q') act('radio');
  if (k === 'escape') act('attract');
  if (S.mode === 'cruise') {
    if (k === 'a' || k === 'arrowleft') { S.auto = false; player.tx = Math.max(-6, player.tx - 4); e.preventDefault(); }
    if (k === 'd' || k === 'arrowright') { S.auto = false; player.tx = Math.min(6, player.tx + 4); e.preventDefault(); }
    if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) { S.auto = false; if (k.startsWith('arrow')) e.preventDefault(); }
  }
});
addEventListener('keyup', (e) => { keysDown[e.key.toLowerCase()] = false; });
function act(a) {
  if (!S.started) return;
  if (a === 'studio') showCutShort();
  if (a === 'play') {
    if (S.mode !== 'cruise') goCruise();
    hero.classList.remove('attract'); ui.title.classList.add('gone');
    S.cine = false; S.camIdx = 0; S.camT = 0; S.studioZ = player.z - 950;
    showArea('Ocean Strip', 'VICE CITY, LEONIDA'); setTimeout(showRadio, 1200);
    setTimeout(() => showMission('The pod got <b>cut short</b>. Pull up to the <b>Murda Pod</b> studio and see what happened.', 6500), 2600);
    hero.scrollIntoView({ behavior: 'smooth' }); setClasses();
  }
  if (a === 'attract') {
    hero.classList.add('attract'); ui.title.classList.remove('gone');
    S.cine = true; S.auto = true; ui.mission.classList.remove('show'); setClasses();
  }
  if (a === 'cam') {
    if (S.mode === 'cruise') { S.camIdx = (S.camIdx + 1) % CRUISE_CAMS.length; S.camT = 0; roadCamSet = false; }
    else setShot(pick(Object.keys(SHOTS).filter((s) => s !== S.shot)), 5);
    S.cine = false; setClasses();
  }
  if (a === 'cine') { S.cine = !S.cine; setClasses(); }
  if (a === 'radio') { S.station = (S.station + 1) % STATIONS.length; staticBurst(); showRadio(); }
  if (a === 'mute') { A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : 0.55; $('muteBtn').textContent = A.muted ? '🔇' : '🔊'; }
}
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
addEventListener('murda:episode', () => { if (!S.started) return; showCutShort(); });
addEventListener('murda:station', (e) => { if (!S.started) return; S.station = e.detail; staticBurst(); showRadio(); });

/* =========================================================
   UPDATE — CRUISE
   ========================================================= */
const tmpV = V(), lookV = V();
function updateCruise(dt) {
  // --- player driving
  if (S.auto) {
    S.laneT -= dt;
    player.target = 28 + Math.sin(S.T * 0.3) * 4;
    const blocked = (lane) => traffic.some((c) => c.dir < 0 && Math.abs(c.x - lane) < 1 && c.z < player.z && player.z - c.z < 35);
    if (blocked(player.tx)) { const other = player.tx === 2 ? 6 : 2; if (!blocked(other)) player.tx = other; }
    if (S.laneT < 0) { S.laneT = rand(4, 8); const other = player.tx === 2 ? 6 : 2; if (!blocked(other)) player.tx = other; }
  } else {
    if (keysDown.w || keysDown.arrowup) player.target = Math.min(62, player.target + 22 * dt);
    if (keysDown.s || keysDown.arrowdown) player.target = Math.max(0, player.target - 30 * dt);
  }
  for (const c of traffic) if (c.dir < 0 && Math.abs(c.x - player.x) < 1.6 && c.z < player.z && player.z - c.z < 9) player.target = Math.min(player.target, c.speed);
  player.speed = lerp(player.speed, player.target, 1 - Math.exp(-dt * 1.5));
  const dx = player.tx - player.x;
  player.x += dx * (1 - Math.exp(-dt * 2.2));
  player.z -= player.speed * dt;
  player.yaw = lerp(player.yaw, -dx * 0.06, 0.1);
  player.roll = lerp(player.roll, dx * 0.025, 0.1);
  player.car.position.set(player.x, 0, player.z);
  player.car.rotation.y = player.yaw;
  player.body.rotation.z = player.roll;
  player.body.rotation.x = lerp(player.body.rotation.x, (player.target - player.speed) * 0.004, 0.1);
  player.body.position.y = Math.sin(S.T * 13) * 0.006 * Math.min(1, player.speed / 20);
  for (const w of player.wheels) w.rotation.x -= (player.speed * dt) / 0.34;

  // --- traffic
  for (const c of traffic) {
    c.z += c.dir * c.speed * dt;
    if (c.dir < 0) {
      if (c.z > player.z + 30) { c.z = player.z - rand(320, 520); c.x = pick([2, 6]); c.speed = rand(13, 20); }
      if (c.z < player.z - 600) c.z = player.z + 40;
    } else if (c.z > player.z + 40) { c.z = player.z - rand(380, 640); c.x = pick([-2, -6]); }
    c.car.position.set(c.x, 0, c.z);
    for (const w of c.wheels) w.rotation.x -= (c.speed * dt) / 0.34;
  }

  // --- recycle world
  for (const f of followers) {
    f.m.position.z = player.z - L * 0.35;
    for (const t of f.maps) t.offset.y = -(f.m.position.z + L / 2) / f.tile;
  }
  waterNormal.offset.x = S.T * 0.012;
  if (water) { water.position.z = player.z - 1000; water.material.uniforms.time.value += dt * 0.55; }
  sky.position.copy(camera.position);
  for (const b of buildings) if (b.g.position.z - b.w / 2 > player.z + 60) b.g.position.z -= bSpan;
  for (const t of towers) if (t.position.z > player.z + 80) t.position.z -= T_SPAN;
  for (const g of guards) if (g.position.z > player.z + 60) { g.position.z -= 800; g.position.x = rand(-42, -26); }
  let pd = false; palms.forEach((p, i) => { if (p.z > player.z + 40) { p.z -= P_SPAN; setPalm(i); pd = true; } });
  if (pd) { palmT.instanceMatrix.needsUpdate = true; palmF.instanceMatrix.needsUpdate = true; }
  let ld = false; lamps.forEach((l, i) => { if (l.z > player.z + 40) { l.z -= LAMP_SPAN; setLamp(i); ld = true; } });
  if (ld) { poles.instanceMatrix.needsUpdate = true; bulbs.instanceMatrix.needsUpdate = true; }

  sun.position.set(player.x + 45, 38, player.z - 70);
  sun.target.position.set(player.x, 0, player.z - 20);

  // --- camera director
  S.camT += dt;
  const durs = { chase: 9, roadside: 5.5, low: 4, heli: 6.5, hood: 5 };
  if (S.cine && S.camT > durs[curCam()]) { S.camIdx = (S.camIdx + 1) % CRUISE_CAMS.length; S.camT = 0; roadCamSet = false; setClasses(); }
  const car = player.car.position, mode = curCam();
  let fov = 55, k = 1 - Math.exp(-dt * 5), snap = S.camT < 0.05;
  if (mode === 'chase') {
    tmpV.set(car.x - player.yaw * 4, 2.9, car.z + 8.6); lookV.set(car.x, 1.25, car.z - 8);
    fov = 52 + player.speed * 0.3;
  } else if (mode === 'hood') {
    tmpV.set(car.x, 1.35, car.z - 0.2); lookV.set(car.x - player.yaw * 10, 1.1, car.z - 30); fov = 72; k = 1;
  } else if (mode === 'low') {
    tmpV.set(car.x + 2.9, 0.55, car.z - 4.8); lookV.set(car.x, 0.7, car.z + 0.5); fov = 58; k = 1;
  } else if (mode === 'heli') {
    const a = S.camT * 0.14;
    tmpV.set(car.x - 24 - Math.sin(a) * 10, 58 + Math.sin(S.T * 0.7) * 0.8, car.z + 30 - S.camT * 6); lookV.set(car.x, 0, car.z - 10); fov = 34; k = 1;
  } else if (mode === 'roadside') {
    if (!roadCamSet || car.z < roadCam.z - 18) { roadCam.set(pick([9.6, -8.7]), rand(0.9, 2.4), car.z - rand(55, 75)); roadCamSet = true; snap = true; }
    tmpV.copy(roadCam); lookV.set(car.x, 0.9, car.z); fov = 30; k = 1;
  }
  if (snap) k = 1;
  camera.position.lerp(tmpV, k);
  camera.lookAt(lookV);
  if (mode === 'heli') { camera.rotation.z += Math.sin(S.T * 1.3) * 0.004; }
  camera.fov = lerp(camera.fov, fov, snap ? 1 : 0.08); camera.updateProjectionMatrix();
  bokeh.enabled = mode === 'roadside' || mode === 'low';
  if (bokeh.enabled) {
    bokeh.uniforms.focus.value = camera.position.distanceTo(car);
    bokeh.uniforms.aperture.value = mode === 'roadside' ? 0.00006 : 0.0005;
    bokeh.uniforms.maxblur.value = 0.005;
  }

  // --- mission: reach studio
  const left = player.z - S.studioZ;
  if (left < 0) { S.studioZ = player.z - 950; if (!isAttract()) showCutShort(); }
  S.djT -= dt;
  if (S.djT < 0) {
    S.djT = rand(14, 20);
    const lines = ["The pod got cut short. Y'all know why. Full video drops soon — stay locked.", "They shut the studio down on me mid-sentence. The full uncut video is coming.", "You're locked in to Murda Radio, one-oh-five-nine. Don't touch that dial.", "Leonida, if you hear this and you ain't nodding your head — pull over.", 'Rap Up season is coming. I see you, I see ALL of y\'all.', 'Shout out to everybody stuck on the Ocean Strip right now. Bump this.', 'The pod goes live tonight. Pull up or get pulled up on.'];
    if (S.station === 0 && !isAttract()) showSub(`<span class="h">MURDA (RADIO):</span> ${pick(lines)}`, 4500);
  }
  // engine
  if (A.engO) { A.engO.frequency.value = 38 + player.speed * 2.1; A.engG.gain.value = A.muted ? 0 : 0.035 + player.speed * 0.0008; }
}

/* =========================================================
   UPDATE — STUDIO
   ========================================================= */
const LINE_DUR = 3.7;
let monTimer = 0;
function updateStudio(dt) {
  const ep = EPISODES[S.ep];
  S.lineT += dt;
  if (S.lineT > LINE_DUR) {
    S.lineT = 0; S.line++;
    if (S.line < ep.lines.length) {
      const [who, text] = ep.lines[S.line];
      const name = who === 'H' ? 'MURDA' : `📞 ${ep.guest} (ON THE LINE)`;
      showSub(`<span class="${who === 'H' ? 'h' : 'g'}">${name}:</span> ${text}`, LINE_DUR * 1000 - 250);
      const r = Math.random();
      if (S.cine || S.line === 0) setShot(r < 0.15 ? pick(['wide', 'crane']) : who === 'H' ? (r < 0.65 ? 'host' : r < 0.9 ? 'host2' : 'wide') : (r < 0.7 ? 'listen' : 'wide'), LINE_DUR);
    } else if (S.line === ep.lines.length) {
      setShot('wide', 5);
      ui.passedEp.textContent = `EPISODE ${String(S.ep + 1).padStart(2, '0')} — ${ep.t.toUpperCase()}`;
      flash(ui.passed, 6000, 'passed');
      S.cash += 25000;
    } else if (S.line > ep.lines.length && S.cine) {
      S.ep = (S.ep + 1) % EPISODES.length; goCruise();
    } else if (!S.cine && S.line > ep.lines.length) { S.ep = (S.ep + 1) % EPISODES.length; S.line = -1; S.lineT = 0; showArea('Murda Pod Studios', 'EPISODE ' + String(S.ep + 1).padStart(2, '0') + ' — ' + EPISODES[S.ep].t.toUpperCase()); }
  }
  dust.rotation.y = S.T * 0.01; dust.position.y = Math.sin(S.T * 0.2) * 0.1;
  beams[0].material.opacity = 0.08 + Math.sin(S.T * 0.7) * 0.015;
  const speaking = S.line >= 0 && S.line < ep.lines.length && S.lineT < LINE_DUR - 0.5 ? ep.lines[S.line][0] : null;
  const bpm = STATIONS[S.station].bpm, beat = Math.pow(Math.max(0, Math.sin(S.T * Math.PI * bpm / 60)), 4);
  host.update(S.T, speaking === 'H', beat, 0, 0);
  updateCustomHost(dt, speaking === 'H', beat, 0);

  // camera
  S.shotT += dt;
  const sh = SHOTS[S.shot], p = ease(Math.min(1, S.shotT / Math.max(S.shotDur, 0.1)));
  camera.position.copy(sh.p).addScaledVector(sh.m, p);
  camera.position.x += Math.sin(S.T * 0.9) * 0.012; camera.position.y += Math.sin(S.T * 1.3) * 0.008;
  camera.lookAt(sh.l);
  camera.fov = sh.f; camera.updateProjectionMatrix();
  bokeh.uniforms.focus.value = camera.position.distanceTo(sh.l);
  bokeh.uniforms.aperture.value = sh.f < 30 ? 0.0045 : 0.0015;
  bokeh.uniforms.maxblur.value = 0.007;

  // ON AIR + LEDs + monitor
  onAirMat.color.setScalar(Math.sin(S.T * 4) > -0.3 ? 2.2 : 0.6);
  if (A.analyser) A.analyser.getByteFrequencyData(A.data);
  const lvl = A.analyser ? A.data.slice(2, 14).reduce((a, b) => a + b, 0) / 12 / 255 : 0.4 + Math.sin(S.T * 8) * 0.2;
  leds.forEach((m, i) => m.material.color.set(lvl * 11 > i ? (i > 7 ? 0xff2020 : i > 5 ? 0xffd23f : 0x2aff7a) : 0x222222));
  monTimer -= dt;
  if (monTimer < 0) {
    monTimer = 1 / 20;
    const x = monTex.userData.ctx, w = 512, h = 300;
    x.fillStyle = '#07040c'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff2e88'; x.font = 'bold 26px "Chakra Petch", monospace'; x.textAlign = 'left'; x.fillText('● LIVE', 20, 38);
    const secs = Math.floor(S.modeT); x.fillStyle = '#fff'; x.fillText(`00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, 360, 38);
    for (let i = 0; i < 40; i++) {
      const v = A.analyser ? A.data[i + 1] / 255 : Math.abs(Math.sin(S.T * 3 + i * 0.4)) * 0.6;
      const bh = 8 + v * 180; x.fillStyle = v > 0.7 ? '#ff2e88' : '#12e0c4'; x.fillRect(20 + i * 12, 170 - bh / 2 + 40, 8, bh);
    }
    x.fillStyle = '#ffd23f'; x.font = '22px "Bebas Neue", sans-serif'; x.fillText(`EP ${String(S.ep + 1).padStart(2, '0')} • ${EPISODES[S.ep].t.toUpperCase()}`, 20, 285);
    monTex.needsUpdate = true;
  }
  if (A.engG) A.engG.gain.value = 0;
}

/* =========================================================
   HUD
   ========================================================= */
const mm = $('minimap'), mx = mm.getContext('2d');
let hudT = 0;
function drawMinimap() {
  const W = mm.width, H = mm.height, S2 = 0.55, cx = W / 2, cy = H * 0.68;
  const X = (wx) => cx + (wx - player.x) / S2, Y = (wz) => cy + (wz - player.z) / S2;
  mx.save();
  mx.beginPath(); mx.roundRect(0, 0, W, H, 14); mx.clip();
  mx.fillStyle = '#4f5d48'; mx.fillRect(0, 0, W, H);
  mx.fillStyle = '#3d7fae'; mx.fillRect(0, 0, X(-62), H);
  mx.fillStyle = '#d7c08f'; mx.fillRect(X(-62), 0, X(-11) - X(-62), H);
  mx.fillStyle = '#9a9a9a'; mx.fillRect(X(-11), 0, X(13) - X(-11), H);
  mx.fillStyle = '#e8e8e8'; mx.fillRect(X(-8), 0, X(8) - X(-8), H);
  mx.fillStyle = '#6c6f78';
  for (const b of buildings) { const y0 = Y(b.g.position.z - b.w / 2), y1 = Y(b.g.position.z + b.w / 2); if (y1 < -20 || y0 > H + 20) continue; mx.fillRect(X(16), y0, b.d / S2, y1 - y0); }
  // GPS route
  const sy = Math.max(10, Y(S.studioZ));
  mx.strokeStyle = '#c13cff'; mx.lineWidth = 9; mx.lineCap = 'round';
  mx.beginPath(); mx.moveTo(X(player.x), cy); mx.lineTo(X(4), Math.max(sy, 0)); if (Y(S.studioZ) > 0) mx.lineTo(X(26), sy); mx.stroke();
  // studio blip
  mx.fillStyle = '#ff2e88'; mx.strokeStyle = '#000'; mx.lineWidth = 3;
  mx.beginPath(); mx.arc(X(26), sy, 16, 0, 7); mx.fill(); mx.stroke();
  mx.fillStyle = '#000'; mx.font = '20px Anton'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillText('M', X(26), sy + 1);
  // traffic dots
  mx.fillStyle = '#ffffffaa';
  for (const c of traffic) { const y = Y(c.z); if (y > 0 && y < H) mx.fillRect(X(c.x) - 3, y - 5, 6, 10); }
  // player arrow
  mx.translate(cx, cy); mx.rotate(-player.yaw);
  mx.fillStyle = '#fff'; mx.strokeStyle = '#000'; mx.lineWidth = 3;
  mx.beginPath(); mx.moveTo(0, -18); mx.lineTo(12, 14); mx.lineTo(0, 7); mx.lineTo(-12, 14); mx.closePath(); mx.fill(); mx.stroke();
  mx.restore();
  // north
  mx.fillStyle = '#000a'; mx.beginPath(); mx.arc(W - 26, 26, 16, 0, 7); mx.fill();
  mx.fillStyle = '#fff'; mx.font = '700 18px "Chakra Petch"'; mx.fillText('N', W - 26, 27);
}
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  S.minutes += 0.1 * 1.0;
  const m = Math.floor(S.minutes) % 1440;
  const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  ui.clock.textContent = time; $('phoneTime').textContent = time;
  S.cash += Math.random() < 0.3 ? 100 : 0;
  ui.cash.textContent = '$' + S.cash.toLocaleString('en-US');
  $('pmInfo').textContent = `SATURDAY ${time} · BANK $${S.cash.toLocaleString('en-US')}`;
  if (S.mode === 'cruise') { ui.mph.textContent = Math.round(player.speed * 2.237); drawMinimap(); }
}

/* =========================================================
   LOOP
   ========================================================= */
let visible = true;
new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(hero);
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!visible) return;
  S.T += dt; S.modeT += dt;
  if (S.mode === 'cruise') updateCruise(dt); else updateStudio(dt);
  if (S.started) updateHud(dt);
  if (!S.started && S.mode === 'cruise') S.cine = true;
  grade.uniforms.time.value = S.T;
  composer.render();
}
// warm-up: compile both scenes so the first transition doesn't hitch
renderer.compile(city, camera); renderer.compile(studio, camera);
updateCruise(0.016);
frame();

/* =========================================================
   START
   ========================================================= */
window.__gameReady = true;
window.__murda = { S, setShot, goStudio, goCruise };
const loader = $('loader'), startBtn = $('startBtn');
loader.classList.add('ready');
$('ldStatus').textContent = 'READY';
startBtn.hidden = false;
function start() {
  if (S.started) return;
  S.started = true;
  loader.classList.add('out'); document.body.classList.remove('locked');
  hero.classList.add('playing');
  musicStart();
  hero.classList.add('attract');
  S.camIdx = 1; S.camT = 0; S.cine = true; setClasses();
  setTimeout(showRadio, 1800);
}
startBtn.addEventListener('click', start);
loader.addEventListener('click', start);
addEventListener('keydown', (e) => { if (!S.started && e.key === 'Enter') start(); });
