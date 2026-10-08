// The ribbon: a salon's day as one strip of silk. Scroll progress drives three states in a single mesh, entirely in
// the vertex shader: flowing ribbon → cut into appointment pieces → pieces laid out as a week calendar (where the real
// HTML calendar takes over). Pointer or finger bends the ribbon. Loaded lazily, only on capable devices.
import { WebGLRenderer, Scene, PerspectiveCamera, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Color, Vector2, Vector4, DoubleSide } from '../vendor/three.js';

const vertexShader = /* glsl */`
uniform float uTime, uCut, uGather, uPieces, uCols, uRows, uLen, uSlotCount;
uniform vec4 uSlots[MAX_SLOTS];
uniform vec2 uPointer, uView;
uniform float uBend, uTurn;
attribute float aPiece; attribute float aSu;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos; varying float vPiece; varying float vGather; varying float vHide; varying float vSu;

float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
vec3 rotAxis(vec3 v, vec3 a, float ang){ float c = cos(ang), s = sin(ang); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }

// Centre line of the ribbon at u (0..1): a long S across the screen, alive with slow waves, bent toward the pointer.
vec3 spine(float u){
  float x = (u - 0.5) * uLen;
  float y = sin(u * 5.2 + uTime * 0.35) * 0.55 + sin(u * 11.0 - uTime * 0.6) * 0.12 - 0.15;
  float z = cos(u * 4.0 + uTime * 0.25) * 0.8;
  float d = x - uPointer.x * uView.x * 0.5;
  y += uBend * uPointer.y * uView.y * 0.35 * exp(-d * d * 0.35);
  return vec3(x, y, z);
}

void main(){
  vUv = uv;
  float u = uv.x;
  float piece = aPiece, su = aSu;
  vPiece = piece; vSu = su;
  float h = hash(piece + 1.0);

  // Ribbon pose
  vec3 p = spine(u);
  vec3 t = normalize(spine(u + 0.002) - spine(u - 0.002));
  vec3 side = normalize(cross(t, vec3(0.0, 0.0, 1.0)));
  float twist = sin(u * 6.0 + uTime * 0.4) * 1.3;
  side = rotAxis(side, t, twist);
  vec3 ribbon = p + side * (uv.y - 0.5) * 0.62;
  vec3 nRib = normalize(cross(t, side));
  // Portrait screens: the day runs top to bottom through the type instead of across it.
  float cs = cos(uTurn), sn = sin(uTurn);
  ribbon.xy = mat2(cs, sn, -sn, cs) * ribbon.xy; nRib.xy = mat2(cs, sn, -sn, cs) * nRib.xy;

  // Cut: pieces left of the sweeping line separate and drift with their own velocity
  float cutX = mix(-0.6, 0.6, uCut) * uLen;
  float isCut = clamp((cutX - ((piece + 0.5) / uPieces - 0.5) * uLen) / (0.12 * uLen), 0.0, 1.0);
  vec3 drift = vec3((h - 0.5) * 0.35, (hash(piece + 7.0) - 0.5) * 0.9, (hash(piece + 3.0) - 0.5) * 0.8) * isCut;
  ribbon += drift;

  // Gather: each piece becomes a booking block in a week grid
  // Each piece lands exactly on one of the real HTML calendar's booking blocks (measured from the page), so the
  // hand-off to the HTML calendar is seamless. Pieces beyond the number of blocks shrink away.
  vec4 slot = vec4(0.0);
  for (int i = 0; i < MAX_SLOTS; i++) { if (float(i) == piece) slot = uSlots[i]; }
  vHide = piece < uSlotCount ? 0.0 : 1.0;
  vec3 target = vec3(slot.x + (uv.y - 0.5) * slot.z, slot.y + (0.5 - su) * slot.w, 0.0);
  if (vHide > 0.5) target = vec3(0.0, -uView.y, 0.0);
  float stagger = clamp(uGather * 1.6 - h * 0.6, 0.0, 1.0);
  float g = stagger * stagger * (3.0 - 2.0 * stagger);
  vGather = g;
  vec3 pos = mix(ribbon, target, g);
  vNormal = normalize(mix(nRib, vec3(0.0, 0.0, 1.0), g));
  vPos = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const fragmentShader = /* glsl */`
uniform float uCut, uPieces, uTime, uLen;
uniform vec3 uA, uB, uC;
uniform float uTone[MAX_SLOTS];
varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos; varying float vPiece; varying float vGather; varying float vHide; varying float vSu;
float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
void main(){
  float su = vSu;
  float cutX = mix(-0.6, 0.6, uCut) * uLen;
  float isCut = clamp((cutX - ((vPiece + 0.5) / uPieces - 0.5) * uLen) / (0.12 * uLen), 0.0, 1.0);
  float gap = 0.05 * isCut * (1.0 - vGather);
  if (vHide > 0.5 && vGather > 0.6) discard;
  if (su < gap || su > 1.0 - gap) discard;

  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 view = normalize(cameraPosition - vPos);
  vec3 light = normalize(vec3(-0.4, 0.8, 0.6));
  vec3 hdir = normalize(light + view);
  // Silk: anisotropic sheen along the weave, a soft diffuse, a fresnel edge
  float weave = 0.5 + 0.5 * sin(vUv.y * 90.0);
  float spec = pow(max(dot(n, hdir), 0.0), 48.0) * (0.6 + 0.4 * weave);
  float diff = 0.35 + 0.65 * max(dot(n, light), 0.0);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 silk = mix(uA, uB, smoothstep(0.45, 1.0, vUv.y));
  silk = silk * diff + vec3(1.0) * spec * 0.9 + uB * fres * 0.5;
  if (!gl_FrontFacing) silk *= 0.62;
  // As booking blocks: flat brand colours, matching the HTML calendar that takes over
  float tone = 0.0;
  for (int i = 0; i < MAX_SLOTS; i++) { if (float(i) == vPiece) tone = uTone[i]; }
  vec3 block = tone > 1.5 ? uC : (tone > 0.5 ? uB : uA);
  vec3 col = mix(silk, block, vGather);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// One strip per piece, each with its own vertices (a shared boundary vertex would stretch a triangle across two
// calendar blocks while the pieces fly apart).
function stripGeometry(pieces, seg, rows) {
  const perPiece = (seg + 1) * (rows + 1), n = pieces * perPiece;
  const position = new Float32Array(n * 3), uv = new Float32Array(n * 2), aPiece = new Float32Array(n), aSu = new Float32Array(n), index = [];
  for (let p = 0, v = 0; p < pieces; p++) {
    const base = p * perPiece;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++, v++) {
      const su = i / seg;
      // Each strip reaches 1% into its neighbours so the uncut ribbon shows no seams.
      uv[v * 2] = (p + su * 1.02 - 0.01) / pieces; uv[v * 2 + 1] = j / rows; aPiece[v] = p; aSu[v] = su;
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('aPiece', new BufferAttribute(aPiece, 1));
  g.setAttribute('aSu', new BufferAttribute(aSu, 1));
  g.setIndex(index);
  g.boundingSphere = null;
  return g;
}

export function tier() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'none';
  const phone = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (navigator.connection?.saveData || mem < 2) return 'none';
  if (phone) return 'phone';
  return cores >= 8 && mem >= 8 ? 'high' : 'mid';
}

const SETTINGS = { high: { pieces: 28, seg: 16, dpr: 2, cols: 7, rows: 4 }, mid: { pieces: 21, seg: 12, dpr: 1.5, cols: 7, rows: 3 }, phone: { pieces: 12, seg: 8, dpr: 1.25, cols: 4, rows: 3 } };

export function createRibbon(host, level, count) {
  // One piece per visible calendar block (within limits), so every block is reached by a piece of the ribbon.
  const s = { ...(SETTINGS[level] || SETTINGS.mid) };
  if (count) s.pieces = Math.max(8, Math.min(count, level === 'phone' ? 24 : 40));
  const renderer = new WebGLRenderer({ antialias: level !== 'phone', alpha: true, powerPreference: level === 'high' ? 'high-performance' : 'default' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, s.dpr));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0, 8);
  const view = new Vector2(1, 1);
  const uniforms = {
    uTime: { value: 0 }, uCut: { value: 0 }, uGather: { value: 0 }, uPieces: { value: s.pieces }, uCols: { value: s.cols }, uRows: { value: s.rows },
    uLen: { value: 12 }, uPointer: { value: new Vector2(0, 0) }, uView: { value: view }, uBend: { value: 1 }, uTurn: { value: 0 },
    uA: { value: new Color('#D98A5F') }, uB: { value: new Color('#C9D1D6') }, uC: { value: new Color('#F2DC4B') },
    uSlots: { value: Array.from({ length: s.pieces }, () => new Vector4()) }, uTone: { value: new Array(s.pieces).fill(0) }, uSlotCount: { value: 0 },
  };
  const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: DoubleSide, defines: { MAX_SLOTS: s.pieces } });
  const geometry = stripGeometry(s.pieces, s.seg, level === 'phone' ? 4 : 8);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const target = new Vector2(0, 0), vel = new Vector2(0, 0);
  let running = false, visible = true, raf = 0, last = performance.now(), progress = 0, still = 0;
  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const vh = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
    view.set(vh * camera.aspect, vh);
    const portrait = camera.aspect < 0.85;
    uniforms.uTurn.value = portrait ? -1.2 : 0;
    uniforms.uLen.value = Math.max((portrait ? view.y : view.x) * 1.3, 7);
    kick();
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    uniforms.uTime.value += dt * (1 - uniforms.uGather.value);
    // Spring the pointer so the bend feels physical, not glued to the cursor.
    const p = uniforms.uPointer.value;
    vel.x += (target.x - p.x) * 18 * dt; vel.y += (target.y - p.y) * 18 * dt;
    vel.multiplyScalar(Math.pow(0.02, dt));
    p.x += vel.x * dt * 6; p.y += vel.y * dt * 6;
    renderer.render(scene, camera);
    // Once fully gathered the scene is static: stop drawing until something changes.
    still = uniforms.uGather.value >= 0.999 && Math.abs(vel.x) + Math.abs(vel.y) < 1e-3 ? still + 1 : 0;
    if (running && visible && still < 3) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && running && visible) { last = performance.now(); still = 0; raf = requestAnimationFrame(frame); } }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; kick(); });
  io.observe(host);
  const onVis = () => { visible = !document.hidden; kick(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize); ro.observe(host);
  resize();
  running = true; kick();

  return {
    canvas: renderer.domElement, uniforms,
    setProgress(cut, gather) { progress = cut; uniforms.uCut.value = cut; uniforms.uGather.value = gather; kick(); },
    // Booking blocks of the HTML calendar, as screen rectangles (px) with a tone (0 blue, 1 chrome, 2 peroxide).
    setTargets(rects) {
      const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight, n = Math.min(rects.length, s.pieces);
      for (let i = 0; i < n; i++) {
        const r = rects[i];
        uniforms.uSlots.value[i].set(((r.x + r.w / 2) / w - 0.5) * view.x, -((r.y + r.h / 2) / h - 0.5) * view.y, r.w / w * view.x, r.h / h * view.y);
        uniforms.uTone.value[i] = r.tone;
      }
      uniforms.uSlotCount.value = n; kick();
    },
    // x, y in -1..1 (screen space)
    point(x, y) { target.set(x, y); kick(); },
    dispose() {
      running = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
