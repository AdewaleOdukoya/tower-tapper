import * as THREE from 'three';
import { buildCharacter, disposeCharacter, normalizeStyle, COVER_STYLE } from './character.js';
import { Game, UPGRADES, REBIRTH_AT, formatNumber } from './game.js';
import { whoami, saveScore, leaderboard, signIn, choseGuest } from './startng.js';

const COVER = new URLSearchParams(location.search).has('cover');
const $ = (id) => document.getElementById(id);

// ---------- Renderer, camera, lights ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: COVER });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
const world = new THREE.Group(); // the island and everything on it; bobs gently
scene.add(world);

scene.add(new THREE.HemisphereLight('#cdd6ff', '#40295a', 1.5));
const sun = new THREE.DirectionalLight('#ffe0c2', 2.6);
sun.position.set(4, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.03;
scene.add(sun);

// ---------- Small helpers ----------
const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

function mesh(parent, geometry, material, x = 0, y = 0, z = 0, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

// Deterministic per-position noise, so shared vertices move together (no cracks).
function noise3(x, y, z, seed) {
  let h = 2166136261 ^ seed;
  for (const ch of `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    out.push(((h >>> 0) % 10000) / 10000);
  }
  return out;
}

function roughen(geometry, amount, { keepY = false, seed = 1 } = {}) {
  const p = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const [a, b, c] = noise3(v.x, v.y, v.z, seed);
    p.setXYZ(i, v.x + (a - 0.5) * amount, keepY ? v.y : v.y + (b - 0.5) * amount * 0.6, v.z + (c - 0.5) * amount);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- The floating island ----------
const ISLAND_TOP = 0.2;
mesh(world, roughen(new THREE.CylinderGeometry(2.7, 2.55, 0.32, 12), 0.25, { keepY: true }), standard('#78cf5a'), 0, 0.04, 0, { receive: true });
mesh(world, roughen(new THREE.CylinderGeometry(2.55, 2.2, 0.42, 12), 0.25, { seed: 2 }), standard('#8a5a3c'), 0, -0.33, 0, { receive: true });
const underside = new THREE.ConeGeometry(2.2, 2.8, 12, 3);
underside.rotateX(Math.PI);
mesh(world, roughen(underside, 0.45, { seed: 3 }), standard('#5d4866'), 0, -1.94, 0);
for (const [x, y, z, r] of [[-2.6, -1.4, 0.6, 0.35], [2.9, -0.9, -0.4, 0.28], [1.4, -2.8, 1.2, 0.22]]) {
  const rock = mesh(world, roughen(new THREE.DodecahedronGeometry(r), r * 0.4), standard('#5d4866'), x, y, z);
  rock.userData.floatOffset = x;
}

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, ISLAND_TOP, z);
  g.scale.setScalar(s);
  mesh(g, new THREE.CylinderGeometry(0.07, 0.11, 0.6, 6), standard('#6b4429'), 0, 0.3, 0);
  mesh(g, new THREE.ConeGeometry(0.55, 0.8, 7), standard('#3aa36a'), 0, 0.85, 0);
  mesh(g, new THREE.ConeGeometry(0.4, 0.65, 7), standard('#4dbb78'), 0, 1.27, 0);
  world.add(g);
}
tree(-1.85, -1.15, 1.1);
tree(1.95, -1.05, 0.95);
tree(-2.15, 0.35, 0.7);
for (const [x, z, r] of [[1.75, 0.95, 0.22], [-1.2, 1.7, 0.16], [2.2, 0.2, 0.14], [-0.2, -1.9, 0.2]]) {
  mesh(world, roughen(new THREE.DodecahedronGeometry(r), r * 0.3, { seed: 5 }), standard('#9a93a8'), x, ISLAND_TOP + r * 0.4, z);
}
for (const [x, z, c] of [[0.9, 1.5, '#ff7aa8'], [1.3, 1.25, '#ffe066'], [-1.6, 1.0, '#ffffff'], [0.2, 1.9, '#ff9f5a'], [-0.4, -1.5, '#c792ff']]) {
  mesh(world, new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), standard('#3a9b55'), x, ISLAND_TOP + 0.07, z, { cast: false });
  mesh(world, new THREE.IcosahedronGeometry(0.05, 0), standard(c), x, ISLAND_TOP + 0.15, z);
}

// ---------- The crystal ----------
const CRYSTAL_POS = new THREE.Vector3(0.65, ISLAND_TOP, -0.3);
const crystalBase = new THREE.Group();
crystalBase.position.copy(CRYSTAL_POS);
world.add(crystalBase);

const crystalMat = standard('#8af6ff', { emissive: '#1fc8e6', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1 });
for (const [x, z, r] of [[0, 0, 0.42], [0.35, 0.2, 0.25], [-0.3, 0.25, 0.22], [0.1, -0.35, 0.28]]) {
  mesh(crystalBase, roughen(new THREE.DodecahedronGeometry(r), r * 0.35, { seed: 9 }), standard('#7c6f8f'), x, r * 0.35, z, { receive: true });
}
for (const [x, z, h, tilt] of [[0.45, -0.1, 0.45, 0.4], [-0.42, -0.05, 0.35, -0.5], [0.15, 0.45, 0.3, 0.3], [-0.15, -0.45, 0.4, -0.3]]) {
  const shard = mesh(crystalBase, new THREE.ConeGeometry(0.09, h, 5), crystalMat, x, h / 2 + 0.05, z);
  shard.rotation.set(tilt * 0.6, 0, tilt);
}

const CRYSTAL_HEIGHT = 1.4; // centre of the floating crystal above the base
const crystalPivot = new THREE.Group();
crystalPivot.position.y = CRYSTAL_HEIGHT;
crystalBase.add(crystalPivot);
const crystal = mesh(crystalPivot, new THREE.OctahedronGeometry(0.5, 0), crystalMat);
crystal.scale.set(1, 1.9, 1);
const crystalCore = mesh(crystalPivot, new THREE.OctahedronGeometry(0.28, 0),
  new THREE.MeshBasicMaterial({ color: '#e9feff', transparent: true, opacity: 0.55 }), 0, 0, 0, { cast: false });
crystalCore.scale.set(1, 1.9, 1);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(160,250,255,1)');
  grad.addColorStop(0.35, 'rgba(80,220,255,0.35)');
  grad.addColorStop(1, 'rgba(80,220,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow.scale.setScalar(3.4);
crystalPivot.add(glow);
const crystalLight = new THREE.PointLight('#5eeaff', 9, 7, 1.6);
crystalPivot.add(crystalLight);

// A generous invisible target so taps on phones always hit the crystal.
const hitbox = mesh(crystalPivot, new THREE.SphereGeometry(1.05, 12, 8), new THREE.MeshBasicMaterial(), 0, 0, 0, { cast: false });
hitbox.visible = false;

const orbiters = [];
for (let i = 0; i < 3; i++) {
  const o = mesh(crystalPivot, new THREE.OctahedronGeometry(0.08, 0), crystalMat, 0, 0, 0, { cast: false });
  o.userData.phase = (i / 3) * Math.PI * 2;
  orbiters.push(o);
}

// Gem shards that burst out on every tap.
const particles = [];
const particleGeo = new THREE.OctahedronGeometry(0.06, 0);
for (let i = 0; i < 36; i++) {
  const p = mesh(world, particleGeo, crystalMat, 0, 0, 0, { cast: false });
  p.visible = false;
  p.userData = { life: 0, vel: new THREE.Vector3() };
  particles.push(p);
}
let nextParticle = 0;
function burst(count) {
  const origin = new THREE.Vector3().copy(CRYSTAL_POS).setY(ISLAND_TOP + CRYSTAL_HEIGHT);
  for (let i = 0; i < count; i++) {
    const p = particles[nextParticle++ % particles.length];
    p.visible = true;
    p.position.copy(origin);
    const a = Math.random() * Math.PI * 2;
    p.userData.vel.set(Math.cos(a) * (1 + Math.random() * 1.5), 2 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 1.5));
    p.userData.life = 1;
  }
}

// ---------- Sky: clouds, stars and little islands far away ----------
const sky = new THREE.Group();
scene.add(sky);
const cloudMat = standard('#f6d9ec', { roughness: 1, transparent: true, opacity: 0.75 });
for (const [i, [x, y, z, s]] of [[-9, -2.5, -6, 1], [9.5, -1.8, -7, 0.9], [-7, -4.5, -3, 0.8], [8, -4.8, -2, 0.7], [-12, 2.5, -14, 1.2], [12, 3, -15, 1.1]].entries()) {
  const cloud = new THREE.Group();
  cloud.position.set(x, y, z);
  cloud.scale.set(s * 1.4, s, s);
  cloud.userData.cloud = true;
  for (let j = 0; j < 4; j++) {
    mesh(cloud, new THREE.IcosahedronGeometry(0.45 + ((i + j) % 3) * 0.15, 0), cloudMat, j * 0.5 - 0.75, (j % 2) * 0.15, (j % 3) * 0.12, { cast: false });
  }
  sky.add(cloud);
}
for (const [x, y, z, s] of [[-7, 1.5, -9, 0.7], [8, -0.5, -11, 0.55], [-5, -3, -12, 0.4]]) {
  const isle = new THREE.Group();
  isle.position.set(x, y, z);
  isle.scale.setScalar(s);
  mesh(isle, new THREE.CylinderGeometry(1, 0.9, 0.25, 8), standard('#6fbf57'), 0, 0, 0, { cast: false });
  const cone = new THREE.ConeGeometry(0.9, 1.4, 8);
  cone.rotateX(Math.PI);
  mesh(isle, cone, standard('#5d4866'), 0, -0.82, 0, { cast: false });
  sky.add(isle);
}
{
  const positions = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.15 + Math.random() * 0.85;
    const r = Math.sqrt(1 - y * y);
    positions.push(Math.cos(a) * r * 60, y * 60 - 8, Math.sin(a) * r * 60);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.8 })));
}

// ---------- The character ----------
const charHolder = new THREE.Group();
charHolder.position.set(-0.75, ISLAND_TOP, 0.55);
charHolder.rotation.y = 1.35; // faces the crystal, turned towards the camera
charHolder.scale.setScalar(1.15);
world.add(charHolder);

// The miner's pickaxe: a game prop, held in the character's right hand.
const pickaxe = new THREE.Group();
{
  const wood = standard('#8b5a2b');
  const steel = standard('#c9d3e0', { metalness: 0.6, roughness: 0.35 });
  const handle = mesh(pickaxe, new THREE.CylinderGeometry(0.025, 0.03, 0.62, 6), wood, 0, 0, 0.22);
  handle.rotation.x = Math.PI / 2;
  mesh(pickaxe, new THREE.BoxGeometry(0.05, 0.36, 0.06), steel, 0, 0, 0.5);
  for (const dir of [1, -1]) {
    const tip = mesh(pickaxe, new THREE.ConeGeometry(0.03, 0.14, 4), steel, 0, dir * 0.24, 0.47);
    tip.rotation.x = dir > 0 ? -0.25 : Math.PI + 0.25;
  }
  pickaxe.rotation.x = 0.6;
}

let character = null;
function setCharacter(style) {
  if (character) {
    pickaxe.removeFromParent();
    disposeCharacter(character);
  }
  character = buildCharacter(style);
  character.userData.parts.rightHand.add(pickaxe);
  charHolder.add(character);
  anim.cheer = 0;
}

const anim = { swing: 1, cheer: 1 }; // 0 → 1 progress; 1 = finished

// ---------- Camera framing (keeps the island in the area the UI leaves free) ----------
const TARGET = new THREE.Vector3(0, 0.75, 0);
const VIEW_DIR = new THREE.Vector3(0, 0.3, 1).normalize();
const HALF_W = 2.9;
const HALF_H = 2.2;

function frame() {
  const W = innerWidth;
  const H = innerHeight;
  renderer.setSize(W, H, false);

  let left = 0, right = 0, top = 0, bottom = 0;
  if (COVER) {
    left = W * 0.4;
  } else {
    top = $('hud').getBoundingClientRect().bottom;
    const shop = $('shop').getBoundingClientRect();
    if (shop.width < W * 0.9) right = W - shop.left;
    else bottom = H - shop.top;
  }

  // Render a sub-view of a larger virtual image whose centre is the free area's centre.
  const cx = (left + W - right) / 2;
  const cy = (top + H - bottom) / 2;
  const fullW = cx < W / 2 ? 2 * (W - cx) : 2 * cx;
  const fullH = cy < H / 2 ? 2 * (H - cy) : 2 * cy;
  const x0 = fullW / 2 - cx;
  const y0 = fullH / 2 - cy;
  camera.aspect = fullW / fullH;
  camera.setViewOffset(fullW, fullH, x0, y0, W, H);

  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const freeW = Math.max(W - left - right, 1);
  const freeH = Math.max(H - top - bottom, 1);
  const tH = (freeH / fullH) * tan;
  const tW = (freeW / fullH) * tan;
  const dist = Math.max(HALF_H / tH, HALF_W / tW) + 2.2; // + island depth
  camera.position.copy(TARGET).addScaledVector(VIEW_DIR, dist);
  camera.lookAt(TARGET);
  camera.updateProjectionMatrix();
}
addEventListener('resize', frame);
new ResizeObserver(frame).observe($('shop'));
new ResizeObserver(frame).observe($('hud'));

// ---------- Game state & UI ----------
const game = new Game();
const ui = {
  gems: $('gems'), perSec: $('per-sec'), perTap: $('per-tap'),
  shards: $('shards'), shardCount: $('shard-count'), multiplier: $('multiplier'),
  rebirthInfo: $('rebirth-info'), rebirthBar: $('rebirth-bar'), rebirthBtn: $('rebirth-btn'),
  hint: $('hint'), toast: $('toast'), floaters: $('floaters'),
};

let toastTimer;
function toast(message, ms = 2800) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
}

const shopButtons = new Map();
for (const u of UPGRADES) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = 'upgrade';
  btn.innerHTML = `<span class="icon"></span><span><div class="name"></div><div class="desc"></div></span><span class="right"><div class="price"></div><div class="owned"></div></span>`;
  btn.querySelector('.icon').textContent = u.icon;
  btn.querySelector('.name').textContent = u.name;
  btn.querySelector('.desc').textContent = u.tap ? `+${u.tap} gem${u.tap > 1 ? 's' : ''} per tap` : `+${u.sec} gem${u.sec > 1 ? 's' : ''}/sec`;
  btn.addEventListener('click', () => buy(u.id));
  li.append(btn);
  $('upgrades').append(li);
  shopButtons.set(u.id, { btn, price: btn.querySelector('.price'), owned: btn.querySelector('.owned') });
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function updateHud() {
  const s = game.state;
  setText(ui.gems, formatNumber(s.gems));
  setText(ui.perSec, formatNumber(game.perSec, 1));
  setText(ui.perTap, formatNumber(game.perTap, 1));
  ui.shards.hidden = s.shards === 0;
  setText(ui.shardCount, String(s.shards));
  setText(ui.multiplier, game.multiplier.toFixed(1));
}

function updateShop() {
  for (const u of UPGRADES) {
    const b = shopButtons.get(u.id);
    const cost = game.price(u);
    b.btn.disabled = game.state.gems < cost;
    setText(b.price, formatNumber(cost));
    setText(b.owned, `Owned ${game.state.owned[u.id]}`);
  }
  const progress = Math.min(1, game.state.runGems / REBIRTH_AT);
  ui.rebirthBar.style.width = `${progress * 100}%`;
  ui.rebirthBtn.disabled = !game.canRebirth;
  setText(ui.rebirthInfo, game.canRebirth
    ? `+${game.shardsOnRebirth} ✦ Star Shards (each +10% income)`
    : `${formatNumber(game.state.runGems)} / ${formatNumber(REBIRTH_AT)} gems this run`);
}

function floater(x, y, amount) {
  if (ui.floaters.childElementCount > 40) return;
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = `+${formatNumber(amount, 1)}`;
  el.style.left = `${x + (Math.random() - 0.5) * 40}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  ui.floaters.append(el);
}

const spring = { v: 0, vel: 0 };
let glowBoost = 0;

function tapCrystal(x, y) {
  const amount = game.tap();
  floater(x, y, amount);
  spring.vel -= 5;
  glowBoost = 1;
  anim.swing = 0;
  burst(5);
  ui.hint.hidden = true;
  updateHud();
}

function buy(id) {
  if (!game.buy(id)) return;
  anim.cheer = 0;
  updateHud();
  updateShop();
}

// Taps on the crystal.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObject(hitbox).length) tapCrystal(e.clientX, e.clientY);
});
addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && e.target === document.body) {
    e.preventDefault();
    const p = new THREE.Vector3();
    crystalPivot.getWorldPosition(p).project(camera);
    tapCrystal((p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight);
  }
});

// ---------- Rebirth ----------
const rebirthDialog = $('rebirth-dialog');
ui.rebirthBtn.addEventListener('click', () => {
  if (!game.canRebirth) return;
  $('rebirth-gain').textContent = game.shardsOnRebirth;
  rebirthDialog.showModal();
});
$('rebirth-confirm').addEventListener('click', () => {
  rebirthDialog.close();
  const gained = game.rebirth();
  if (!gained) return;
  game.save();
  anim.cheer = 0;
  glowBoost = 2;
  burst(30);
  updateHud();
  updateShop();
  toast(`Reborn! +${gained} ✦ Star Shard${gained > 1 ? 's' : ''}. Income ×${game.multiplier.toFixed(1)}`);
  if (session.user) submitScore(true);
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
}

// ---------- start.ng: player, character card, scores, leaderboard ----------
const session = { connected: false, user: null, key: null };

function renderCard(player) {
  const face = $('player-face');
  if (player?.face) {
    face.src = player.face;
    face.hidden = false;
  } else {
    face.hidden = true;
  }
  $('player-name').textContent = player?.name || 'Miner';
  $('player-account').textContent = !session.connected
    ? 'Offline · default look'
    : session.user?.account ? `@${session.user.account}` : 'Guest · not signed in';
  const guest = session.connected && !session.user;
  $('player-sign-in').hidden = !guest;
  $('guest-banner').hidden = !(guest && !choseGuest && !bannerDismissed());
}

function bannerDismissed() {
  try { return sessionStorage.getItem('tower-tapper:banner') === '1'; } catch { return false; }
}

function applyPlayer(reply) {
  if (!reply) {
    // start.ng didn't answer (opened locally, or offline): play with the default look.
    if (!character) {
      session.key = 'offline';
      setCharacter(normalizeStyle(null));
      renderCard(null);
    }
    return;
  }
  session.connected = true;
  session.user = reply.user ?? null;
  const player = reply.user ?? reply.guest ?? null;
  const style = normalizeStyle(player?.style);
  const key = JSON.stringify([session.user?.id ?? 'guest', style]);
  if (key !== session.key) {
    session.key = key;
    setCharacter(style); // rebuilt in place; game progress is untouched
  }
  renderCard(player);
}

let asking = false;
async function refreshPlayer(timeoutMs = 5000) {
  if (asking || COVER) return;
  asking = true;
  try {
    applyPlayer(await whoami(timeoutMs));
  } finally {
    asking = false;
  }
}

async function submitScore(auto = false) {
  if (!session.connected) return toast('Scores save when you play on tower-tapper.start.ng');
  if (!session.user) return toast('Sign in to start.ng to save your score');
  if (!auto) toast('Saving…', 1500);
  const res = await saveScore(game.boardStats());
  if (!res) return toast("start.ng didn't answer. Try again in a moment.");
  if (!res.ok) return toast(res.error || 'Could not save your score');
  const { improved, rank } = res.result ?? {};
  toast(improved ? `New best! You're #${rank} on the board` : `Saved. Your best run is still #${rank}`);
}

async function openBoard() {
  const rows = $('board-rows');
  const note = $('board-note');
  rows.replaceChildren();
  note.textContent = 'Loading…';
  $('board-dialog').showModal();
  const res = session.connected ? await leaderboard(10) : null;
  if (!res) {
    note.textContent = 'The leaderboard shows when you play on tower-tapper.start.ng.';
    return;
  }
  if (!res.ok) {
    note.textContent = res.error || 'Could not load the leaderboard.';
    return;
  }
  const entries = Array.isArray(res.entries) ? res.entries : [];
  for (const e of entries) {
    const tr = document.createElement('tr');
    if (session.user && e.player_id === session.user.id) tr.className = 'me';
    const rank = document.createElement('td');
    rank.textContent = e.rank;
    const name = document.createElement('td');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#888';
    name.append(dot, document.createTextNode(e.name ?? 'Player'));
    const rebirths = document.createElement('td');
    rebirths.textContent = formatNumber(Number(e.stats?.prestige) || 0);
    const best = document.createElement('td');
    best.textContent = formatNumber(Number(e.stats?.best_gems) || 0);
    tr.append(rank, name, rebirths, best);
    rows.append(tr);
  }
  note.textContent = !entries.length ? 'No scores yet. Rebirth or submit a score to be first!'
    : session.user ? 'Your row is highlighted.' : 'Sign in to put your score on the board.';
}

$('submit-score').addEventListener('click', () => submitScore());
$('open-board').addEventListener('click', openBoard);
$('player-sign-in').addEventListener('click', signIn);
$('banner-sign-in').addEventListener('click', signIn);
$('banner-dismiss').addEventListener('click', () => {
  try { sessionStorage.setItem('tower-tapper:banner', '1'); } catch { /* storage unavailable */ }
  $('guest-banner').hidden = true;
});

// Players may sign in, out, or change their look on start.ng while away.
let lastAsk = 0;
function onReturn() {
  if (document.visibilityState !== 'visible' || Date.now() - lastAsk < 1000) return;
  lastAsk = Date.now();
  refreshPlayer();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.save();
  else onReturn();
});
addEventListener('focus', onReturn);
addEventListener('pagehide', () => game.save());
setInterval(() => game.save(), 5000);

// ---------- Animation loop ----------
const clock = new THREE.Clock();
const lerp = THREE.MathUtils.lerp;
let uiTimer = 0;

function animateCharacter(t, dt) {
  if (!character) return;
  const { rig, head, leftArm, rightArm } = character.userData.parts;
  const rest = character.userData.restArmZ;
  anim.swing = Math.min(1, anim.swing + dt / 0.32);
  anim.cheer = Math.min(1, anim.cheer + dt / 0.8);

  // Tap: wind up overhead, strike down, settle.
  const p = anim.swing;
  let armX = 0;
  if (p < 0.3) armX = lerp(0, -2.9, Math.sin((p / 0.3) * Math.PI / 2));
  else if (p < 0.55) armX = lerp(-2.9, -0.7, (p - 0.3) / 0.25);
  else if (p < 1) armX = lerp(-0.7, 0, (p - 0.55) / 0.45);

  // Purchase: hop with both arms up.
  const c = anim.cheer;
  const cheer = c < 1 ? Math.sin(c * Math.PI) : 0;
  rightArm.rotation.x = armX * (1 - cheer);
  rightArm.rotation.z = rest + cheer * 2.4;
  leftArm.rotation.z = -rest - cheer * 2.4;
  leftArm.rotation.x = Math.sin(t * 2.2) * 0.05;
  rig.position.y = (c < 1 ? Math.abs(Math.sin(c * Math.PI * 2)) * 0.28 * (1 - c) : 0) + Math.sin(t * 2.2) * 0.012;
  rig.rotation.x = p < 1 ? Math.sin(p * Math.PI) * 0.12 : 0;
  head.rotation.z = Math.sin(t * 1.3) * 0.04;
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const away = game.update();
  if (away.seconds > 60 && away.gems >= 1) toast(`Welcome back! Your crew mined ${formatNumber(away.gems)} gems while you were away.`, 4000);

  world.position.y = Math.sin(t * 0.6) * 0.06;
  world.children.forEach((o) => { if (o.userData.floatOffset !== undefined) o.position.y += Math.sin(t + o.userData.floatOffset) * 0.002; });
  sky.rotation.y = t * 0.01;

  // Crystal: spin, hover, squash-and-stretch spring, glow pulse.
  spring.vel += (-220 * spring.v - 14 * spring.vel) * dt;
  spring.v = THREE.MathUtils.clamp(spring.v + spring.vel * dt, -0.35, 0.35);
  crystalPivot.scale.set(1 - spring.v * 0.6, 1 + spring.v, 1 - spring.v * 0.6);
  crystalPivot.position.y = CRYSTAL_HEIGHT + Math.sin(t * 1.6) * 0.08;
  crystal.rotation.y = t * 0.5;
  crystalCore.rotation.y = -t * 0.8;
  glowBoost = Math.max(0, glowBoost - dt * 3);
  const pulse = 1 + Math.sin(t * 2.4) * 0.06 + glowBoost * 0.25;
  glow.scale.setScalar(3.4 * pulse);
  crystalLight.intensity = 9 * pulse;
  crystalMat.emissiveIntensity = 0.85 + glowBoost * 0.5;
  orbiters.forEach((o) => {
    const a = t * 1.2 + o.userData.phase;
    o.position.set(Math.cos(a) * 0.85, Math.sin(a * 2) * 0.25, Math.sin(a) * 0.85);
    o.rotation.y = a * 2;
  });

  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt * 1.3;
    p.userData.vel.y -= 9 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.rotation.x += dt * 8;
    p.scale.setScalar(Math.max(0.01, p.userData.life));
    if (p.userData.life <= 0) p.visible = false;
  }

  animateCharacter(t, dt);

  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.12;
    updateHud();
    updateShop();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- Start ----------
if (COVER) {
  document.body.classList.add('cover');
  $('cover-title').hidden = false;
  setCharacter(COVER_STYLE);
  anim.cheer = 1;
  charHolder.rotation.y = 0.95;
  // keep the title readable: no low clouds behind it
  sky.children.forEach((o) => { if (o.userData.cloud && o.position.x < 0 && o.position.y < 0) o.visible = false; });
} else {
  const away = game.load();
  if (away.seconds > 60 && away.gems >= 1) {
    setTimeout(() => toast(`Welcome back! Your crew mined ${formatNumber(away.gems)} gems while you were away (up to 8h).`, 4500), 400);
  }
  ui.hint.hidden = game.state.taps > 0;
  // start.ng only answers games on *.start.ng; elsewhere, start with the default look right away.
  if (!/(^|\.)start\.ng$/.test(location.hostname)) applyPlayer(null);
  refreshPlayer(4000);
}
frame();
updateHud();
updateShop();
loop();
