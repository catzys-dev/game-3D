// ═══════════════════════════════════════════════════════════
//  ForestCraft Survival — script.js
//  Full 3D Survival Game with Three.js
// ═══════════════════════════════════════════════════════════

'use strict';

// ─── GAME STATES ───────────────────────────────────────────
const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
let gameState = STATE.MENU;

// ─── GAME DATA ─────────────────────────────────────────────
const ITEMS = {
  wood:      { name: 'Wood',       icon: '🪵', color: '#8B5E3C' },
  stone:     { name: 'Stone',      icon: '🪨', color: '#888' },
  berry:     { name: 'Berry',      icon: '🫐', color: '#8855ff' },
  mushroom:  { name: 'Mushroom',   icon: '🍄', color: '#cc5522' },
  axe:       { name: 'Stone Axe',  icon: '🪓', color: '#aaa' },
  campfire:  { name: 'Campfire',   icon: '🔥', color: '#ff8800', placeable: true },
  shelter:   { name: 'Shelter',    icon: '🏕️', color: '#cc9944', placeable: true },
};

const RECIPES = [
  { result: 'axe',      cost: { wood: 2, stone: 3 },  name: 'Stone Axe',  desc: 'Chop trees 2x faster' },
  { result: 'campfire', cost: { wood: 4 },             name: 'Campfire',   desc: 'Warmth & energy regen' },
  { result: 'shelter',  cost: { wood: 8, stone: 4 },   name: 'Shelter',    desc: 'Sleep through dangers' },
];

// Inventory: { itemId: count }
let inventory = {};
let survivalStats = { health: 100, hunger: 100, energy: 100 };
let dayTime = 0; // 0 = dawn, 0.5 = noon, 1 = midnight
let dayNumber = 1;
let sessionStartTime = Date.now();
let resourcesCollected = 0;
let nearCampfire = false;

// ─── THREE.JS GLOBALS ──────────────────────────────────────
let scene, camera, renderer;
let clock, delta;
let playerMesh, playerVelocity, playerOnGround;
let cameraYaw = 0, cameraPitch = 0.25;
let cameraDistance = 8;
let keys = {};
let mouseLocked = false;
let interactTarget = null;
let worldObjects = []; // { mesh, type, resource, depleted, respawnTimer }
let enemies = [];
let campfires = [];
let particles = [];
let frameId;

// ─── SETTINGS ──────────────────────────────────────────────
let settings = {
  sfxVol: 0.7,
  musicVol: 0.4,
  shadowQuality: 'medium',
  fov: 75,
};

// ─── AUDIO (Web Audio API) ──────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}
function playTone(freq, duration, type='sine', vol=0.3) {
  const ctx = getAudio(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol * settings.sfxVol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}
function playCollect()  { playTone(440, 0.1, 'sine', 0.3); setTimeout(()=>playTone(660,0.1,'sine',0.2), 100); }
function playCraft()    { playTone(330, 0.15, 'square', 0.2); setTimeout(()=>playTone(550,0.2,'sine',0.3),80); setTimeout(()=>playTone(770,0.25,'sine',0.25),180); }
function playChop()     { playTone(80, 0.08, 'sawtooth', 0.25); }
function playHurt()     { playTone(150, 0.3, 'sawtooth', 0.4); }
function playStep()     { playTone(60+Math.random()*20, 0.05, 'triangle', 0.1); }

// ─── UI HELPERS ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function toast(msg, type='', duration=2500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function updateHUD() {
  const hp = Math.max(0, Math.round(survivalStats.health));
  const hu = Math.max(0, Math.round(survivalStats.hunger));
  const en = Math.max(0, Math.round(survivalStats.energy));
  document.getElementById('healthBar').style.width = hp + '%';
  document.getElementById('hungerBar').style.width = hu + '%';
  document.getElementById('energyBar').style.width = en + '%';
  document.getElementById('healthVal').textContent = hp;
  document.getElementById('hungerVal').textContent = hu;
  document.getElementById('energyVal').textContent = en;
  // Change health bar color when low
  const hb = document.getElementById('healthBar');
  hb.style.background = hp < 30 ? 'linear-gradient(90deg,#ff0000,#ff3355)' :
                        hp < 60 ? 'linear-gradient(90deg,#ff5533,#ff6655)' :
                                  'linear-gradient(90deg,#ff3355,#ff6680)';
  const isDay = dayTime < 0.5;
  document.getElementById('dayNightIcon').textContent = isDay ? '☀️' : '🌙';
  document.getElementById('dayCounter').textContent = `Day ${dayNumber}`;
}

// ─── INVENTORY ──────────────────────────────────────────────
function addItem(itemId, amount = 1) {
  inventory[itemId] = (inventory[itemId] || 0) + amount;
  resourcesCollected++;
  renderInventory();
  renderHotbar();
  toast(`+${amount} ${ITEMS[itemId].icon} ${ITEMS[itemId].name}`);
}

function removeItem(itemId, amount = 1) {
  if (!inventory[itemId]) return false;
  inventory[itemId] -= amount;
  if (inventory[itemId] <= 0) delete inventory[itemId];
  renderInventory();
  renderHotbar();
  return true;
}

function hasItems(costs) {
  for (const [k, v] of Object.entries(costs)) {
    if ((inventory[k] || 0) < v) return false;
  }
  return true;
}

function renderInventory() {
  const grid = document.getElementById('invGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const SLOTS = 20;
  const items = Object.entries(inventory);
  for (let i = 0; i < SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (i >= items.length ? ' empty' : '');
    if (i < items.length) {
      const [id, count] = items[i];
      const item = ITEMS[id];
      slot.innerHTML = `<span>${item.icon}</span><span class="slot-count">${count}</span>`;
      slot.title = item.name;
      slot.addEventListener('click', () => {
        document.getElementById('invInfo').textContent = `${item.icon} ${item.name} × ${count}`;
      });
      // Quick use food
      if (id === 'berry' || id === 'mushroom') {
        slot.addEventListener('dblclick', () => consumeFood(id));
      }
    }
    grid.appendChild(slot);
  }
}

function renderHotbar() {
  const slotsEl = document.getElementById('hotbarSlots');
  if (!slotsEl) return;
  slotsEl.innerHTML = '';
  const HOTBAR_ITEMS = ['wood','stone','berry','mushroom','axe','campfire'];
  HOTBAR_ITEMS.forEach(id => {
    const count = inventory[id] || 0;
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (count === 0 ? '' : '');
    const item = ITEMS[id];
    slot.innerHTML = `
      <span>${count > 0 ? item.icon : ''}</span>
      <span class="slot-count">${count > 0 ? count : ''}</span>
      <span class="slot-label">${item.name}</span>
    `;
    slot.style.opacity = count > 0 ? '1' : '0.3';
    slotsEl.appendChild(slot);
  });
}

function consumeFood(id) {
  if (!inventory[id]) return;
  removeItem(id, 1);
  if (id === 'berry') {
    survivalStats.hunger = Math.min(100, survivalStats.hunger + 25);
    toast('🫐 +25 Hunger');
  } else if (id === 'mushroom') {
    survivalStats.hunger = Math.min(100, survivalStats.hunger + 40);
    toast('🍄 +40 Hunger');
  }
  playCollect();
}

function renderCrafting() {
  const list = document.getElementById('craftList');
  if (!list) return;
  list.innerHTML = '';
  RECIPES.forEach(recipe => {
    const can = hasItems(recipe.cost);
    const item = document.createElement('div');
    item.className = 'craft-item ' + (can ? 'can-craft' : 'cannot-craft');
    const reqText = Object.entries(recipe.cost)
      .map(([k,v]) => `${ITEMS[k].icon} ${v} ${ITEMS[k].name}`)
      .join(' + ');
    item.innerHTML = `
      <div class="craft-icon">${ITEMS[recipe.result].icon}</div>
      <div class="craft-info">
        <div class="craft-name">${recipe.name}</div>
        <div class="craft-req">${reqText}</div>
        <div class="craft-req" style="color:#6a9">📝 ${recipe.desc}</div>
      </div>
      ${can ? `<button class="craft-btn">Craft</button>` : ''}
    `;
    if (can) {
      item.querySelector('.craft-btn').addEventListener('click', () => craftItem(recipe));
    }
    list.appendChild(item);
  });
}

function craftItem(recipe) {
  if (!hasItems(recipe.cost)) return;
  for (const [k, v] of Object.entries(recipe.cost)) removeItem(k, v);
  addItem(recipe.result, 1);
  playCraft();
  toast(`⚒️ Crafted ${ITEMS[recipe.result].name}!`, 'success');
  renderCrafting();
  // If placing campfire
  if (recipe.result === 'campfire' && inventory['campfire'] >= 1) {
    toast('Press E near ground to place campfire', '', 3000);
  }
}

// ─── 3D WORLD ───────────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x4a7a55, 0.018);
  scene.background = new THREE.Color(0x87ceeb);

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gameCanvas'),
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 300);
  clock = new THREE.Clock();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  buildLighting();
  buildGround();
  buildTrees(60);
  buildRocks(35);
  buildBerryBushes(25);
  buildMushroomPatches(20);
  buildWater();
  buildGrass();
  buildPlayer();
  buildEnemies(4);
}

function buildLighting() {
  // Ambient
  scene.ambientLight = new THREE.AmbientLight(0x88ccaa, 0.6);
  scene.add(scene.ambientLight);

  // Sun / Moon directional
  scene.sunLight = new THREE.DirectionalLight(0xfff5dd, 1.4);
  scene.sunLight.position.set(60, 80, 40);
  scene.sunLight.castShadow = true;
  scene.sunLight.shadow.mapSize.width = 2048;
  scene.sunLight.shadow.mapSize.height = 2048;
  scene.sunLight.shadow.camera.near = 0.5;
  scene.sunLight.shadow.camera.far = 200;
  scene.sunLight.shadow.camera.left = -80;
  scene.sunLight.shadow.camera.right = 80;
  scene.sunLight.shadow.camera.top = 80;
  scene.sunLight.shadow.camera.bottom = -80;
  scene.sunLight.shadow.bias = -0.001;
  scene.add(scene.sunLight);

  // Hemisphere
  scene.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.4);
  scene.add(scene.hemiLight);
}

function buildGround() {
  // Main terrain — subdivided plane with slight height variation
  const geo = new THREE.PlaneGeometry(200, 200, 60, 60);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    const noise = Math.sin(x * 0.05) * Math.cos(z * 0.07) * 1.5
                + Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.6;
    pos.setZ(i, noise);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a7a35 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  scene.groundMesh = ground;

  // Dirt path patches
  for (let i = 0; i < 8; i++) {
    const pg = new THREE.CircleGeometry(2 + Math.random() * 3, 8);
    const pm = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    const p = new THREE.Mesh(pg, pm);
    p.rotation.x = -Math.PI / 2;
    p.position.set(randRange(-50, 50), 0.01, randRange(-50, 50));
    scene.add(p);
  }
}

function buildTrees(count) {
  for (let i = 0; i < count; i++) {
    const x = randRange(-70, 70), z = randRange(-70, 70);
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue; // keep spawn clear
    createTree(x, 0, z, i < count * 0.5);
  }
}

function createTree(x, y, z, healthy = true) {
  const group = new THREE.Group();

  // Trunk
  const trunkH = 2.5 + Math.random() * 1.5;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, trunkH, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: healthy ? 0x5a3010 : 0x6b4020 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Foliage (stacked cones — low poly)
  const leafColor = healthy ? (0x1a6b20 + Math.floor(Math.random() * 0x102010)) : 0x4a6a20;
  const leafMat = new THREE.MeshLambertMaterial({ color: leafColor });

  const layers = 3;
  for (let l = 0; l < layers; l++) {
    const r = 1.8 - l * 0.35;
    const h = 1.6 + l * 0.1;
    const lGeo = new THREE.ConeGeometry(r, h, 7);
    const leaf = new THREE.Mesh(lGeo, leafMat);
    leaf.position.y = trunkH + l * 0.9 + 0.5;
    leaf.castShadow = true;
    group.add(leaf);
  }

  group.position.set(x, y, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  const s = 0.8 + Math.random() * 0.5;
  group.scale.set(s, s * (0.9 + Math.random() * 0.3), s);
  scene.add(group);

  worldObjects.push({
    mesh: group,
    type: 'tree',
    resource: 'wood',
    resourceAmount: () => (inventory['axe'] ? 4 : 2),
    depleted: false,
    respawnTimer: 0,
    colRadius: 1.2,
    interactRadius: 3.0,
    label: 'Chop Tree',
    origScale: group.scale.clone(),
  });
}

function buildRocks(count) {
  for (let i = 0; i < count; i++) {
    const x = randRange(-65, 65), z = randRange(-65, 65);
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    createRock(x, 0, z);
  }
}

function createRock(x, y, z) {
  const group = new THREE.Group();
  const rockCount = 1 + Math.floor(Math.random() * 3);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888080 + Math.floor(Math.random() * 0x101010) });

  for (let i = 0; i < rockCount; i++) {
    const size = 0.3 + Math.random() * 0.6;
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(
      (Math.random() - 0.5) * 0.8,
      size * 0.5,
      (Math.random() - 0.5) * 0.8
    );
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  group.position.set(x, y, z);
  scene.add(group);

  worldObjects.push({
    mesh: group,
    type: 'rock',
    resource: 'stone',
    resourceAmount: () => 2,
    depleted: false,
    respawnTimer: 0,
    colRadius: 0.8,
    interactRadius: 2.5,
    label: 'Mine Rock',
    origScale: group.scale.clone(),
  });
}

function buildBerryBushes(count) {
  for (let i = 0; i < count; i++) {
    const x = randRange(-60, 60), z = randRange(-60, 60);
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
    createBush(x, 0, z);
  }
}

function createBush(x, y, z) {
  const group = new THREE.Group();
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x1e6b10 });
  const berryMat = new THREE.MeshLambertMaterial({ color: 0x9944cc });

  for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
    const geo = new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 5, 5);
    const b = new THREE.Mesh(geo, bushMat);
    b.position.set((Math.random()-0.5)*0.7, 0.3 + Math.random() * 0.3, (Math.random()-0.5)*0.7);
    b.castShadow = true;
    group.add(b);
  }
  // Berry dots
  for (let i = 0; i < 5; i++) {
    const bg = new THREE.SphereGeometry(0.07, 4, 4);
    const berry = new THREE.Mesh(bg, berryMat);
    berry.position.set((Math.random()-0.5)*0.6, 0.4 + Math.random()*0.3, (Math.random()-0.5)*0.6);
    group.add(berry);
  }

  group.position.set(x, y, z);
  scene.add(group);

  worldObjects.push({
    mesh: group,
    type: 'berry',
    resource: 'berry',
    resourceAmount: () => 1 + Math.floor(Math.random() * 2),
    depleted: false,
    respawnTimer: 0,
    colRadius: 0.4,
    interactRadius: 2.0,
    label: 'Pick Berries',
    origScale: group.scale.clone(),
  });
}

function buildMushroomPatches(count) {
  for (let i = 0; i < count; i++) {
    const x = randRange(-55, 55), z = randRange(-55, 55);
    createMushroom(x, 0, z);
  }
}

function createMushroom(x, y, z) {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshLambertMaterial({ color: 0xffe4c4 });
  const capMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.05 + Math.random()*0.05, 0.9, 0.45) });

  const cnt = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < cnt; i++) {
    const h = 0.2 + Math.random() * 0.25;
    const sg = new THREE.CylinderGeometry(0.05, 0.08, h, 5);
    const stem = new THREE.Mesh(sg, stemMat);
    const cg = new THREE.SphereGeometry(0.18 + Math.random() * 0.1, 6, 4);
    const cap = new THREE.Mesh(cg, capMat);
    cap.scale.y = 0.5;
    const px = (Math.random()-0.5)*0.6, pz = (Math.random()-0.5)*0.6;
    stem.position.set(px, h/2, pz);
    cap.position.set(px, h, pz);
    stem.castShadow = true;
    cap.castShadow = true;
    group.add(stem); group.add(cap);
  }

  group.position.set(x, y, z);
  scene.add(group);

  worldObjects.push({
    mesh: group,
    type: 'mushroom',
    resource: 'mushroom',
    resourceAmount: () => 1,
    depleted: false,
    respawnTimer: 0,
    colRadius: 0.3,
    interactRadius: 1.8,
    label: 'Pick Mushroom',
    origScale: group.scale.clone(),
  });
}

function buildWater() {
  const geo = new THREE.PlaneGeometry(25, 15, 4, 4);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1a99cc,
    transparent: true,
    opacity: 0.75,
  });
  const water = new THREE.Mesh(geo, mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(-45, 0.05, -35);
  scene.add(water);
  scene.waterMesh = water;
}

function buildGrass() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x5aaa30, side: THREE.DoubleSide });
  for (let i = 0; i < 300; i++) {
    const x = randRange(-80, 80), z = randRange(-80, 80);
    const geo = new THREE.PlaneGeometry(0.15 + Math.random() * 0.1, 0.4 + Math.random() * 0.3);
    const blade = new THREE.Mesh(geo, mat);
    blade.position.set(x, 0.2, z);
    blade.rotation.y = Math.random() * Math.PI;
    scene.add(blade);
  }
}

function buildPlayer() {
  const group = new THREE.Group();

  // Body (blocky Roblox-style)
  const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2255cc });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xf5c5a0 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
  for (const sx of [-0.12, 0.12]) {
    const eg = new THREE.BoxGeometry(0.1, 0.08, 0.05);
    const eye = new THREE.Mesh(eg, eyeMat);
    eye.position.set(sx, 1.58, 0.26);
    group.add(eye);
  }

  // Arms
  const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2255cc });
  for (const sx of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(sx, 0.9, 0);
    arm.castShadow = true;
    group.add(arm);
  }

  // Legs
  const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x224488 });
  for (const sx of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx, 0.3, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  group.position.set(0, 0.5, 0);
  scene.add(group);
  playerMesh = group;
  playerVelocity = new THREE.Vector3();
  playerOnGround = false;
}

function buildEnemies(count) {
  for (let i = 0; i < count; i++) {
    createWolf(randRange(-60, 60), 0, randRange(-60, 60));
  }
}

function createWolf(x, y, z) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5a5060 });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.35), mat);
  body.position.y = 0.45; body.castShadow = true;
  group.add(body);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.45), mat);
  head.position.set(0, 0.65, 0.4); head.castShadow = true;
  group.add(head);
  // Snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.25), mat);
  snout.position.set(0, 0.6, 0.65);
  group.add(snout);
  // Eyes (red)
  for (const sx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), redMat);
    eye.position.set(sx, 0.7, 0.58);
    group.add(eye);
  }
  // Legs
  for (let lx of [-0.22, 0.22]) for (let lz of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat);
    leg.position.set(lx, 0.18, lz);
    group.add(leg);
  }
  // Tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), mat);
  tail.position.set(0, 0.5, -0.55); tail.rotation.x = 0.4;
  group.add(tail);

  group.position.set(x, y, z);
  scene.add(group);

  enemies.push({
    mesh: group,
    velocity: new THREE.Vector3(),
    state: 'wander', // wander | chase | attack
    wanderTarget: new THREE.Vector3(randRange(-60,60), 0, randRange(-60,60)),
    wanderTimer: 3 + Math.random() * 5,
    attackCooldown: 0,
    active: false, // activate at night
    health: 3,
  });
}

// ─── TERRAIN HEIGHT SAMPLING ────────────────────────────────
function getGroundY(x, z) {
  const noise = Math.sin(x * 0.05) * Math.cos(z * 0.07) * 1.5
              + Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.6;
  return noise;
}

// ─── PARTICLE SYSTEM ────────────────────────────────────────
function spawnParticles(pos, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    p.position.y += 1;
    scene.add(p);
    particles.push({
      mesh: p,
      vel: new THREE.Vector3(
        (Math.random()-0.5)*4,
        2 + Math.random()*3,
        (Math.random()-0.5)*4
      ),
      life: 1.0,
    });
  }
}

function placeCampfire(pos) {
  const group = new THREE.Group();
  // Logs
  const logMat = new THREE.MeshLambertMaterial({ color: 0x5a2a10 });
  for (let i = 0; i < 4; i++) {
    const lg = new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5);
    const log = new THREE.Mesh(lg, logMat);
    const a = (i / 4) * Math.PI * 2;
    log.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = a;
    log.castShadow = true;
    group.add(log);
  }
  // Stones ring
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x777 });
  for (let i = 0; i < 6; i++) {
    const sg = new THREE.DodecahedronGeometry(0.1, 0);
    const s = new THREE.Mesh(sg, stoneMat);
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5);
    group.add(s);
  }
  // Fire (point light + animated sphere)
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 5), fireMat);
  fire.position.y = 0.35;
  fire.name = 'flame';
  group.add(fire);

  const light = new THREE.PointLight(0xff8800, 2.5, 8);
  light.position.y = 0.5;
  group.add(light);

  group.position.copy(pos);
  group.position.y = getGroundY(pos.x, pos.z) + 0.05;
  scene.add(group);

  campfires.push({ mesh: group, light, fireNode: fire });
  removeItem('campfire', 1);
  toast('🔥 Campfire placed!');
}

// ─── INPUT ──────────────────────────────────────────────────

document.addEventListener("touchstart", function(e) {
  let touchX = e.touches[0].clientX;

  if (touchX > window.innerWidth / 2) {
    player.x += 10; // kanan
  } else {
    player.x -= 10; // kiri
  }
});

function setupInput() {
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (gameState !== STATE.PLAYING) return;

    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyI') togglePanel('inventoryPanel', 'craftingPanel');
    if (e.code === 'KeyC') togglePanel('craftingPanel', 'inventoryPanel');
    if (e.code === 'KeyE') handleInteract();
    if (e.code === 'KeyF') {
      // Quick eat food
      if (inventory.berry) consumeFood('berry');
      else if (inventory.mushroom) consumeFood('mushroom');
    }
  });

  document.addEventListener('keyup', e => { keys[e.code] = false; });

  // Pointer lock for mouse look
  const canvas = document.getElementById('gameCanvas');
  canvas.addEventListener('click', () => {
    if (gameState === STATE.PLAYING && !isPanelOpen()) {
      canvas.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    mouseLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', e => {
    if (!mouseLocked || gameState !== STATE.PLAYING) return;
    cameraYaw   -= e.movementX * 0.002;
    cameraPitch -= e.movementY * 0.002;
    cameraPitch  = Math.max(-0.1, Math.min(0.8, cameraPitch));
  });
  document.addEventListener('wheel', e => {
    if (gameState !== STATE.PLAYING) return;
    cameraDistance = Math.max(3, Math.min(16, cameraDistance + e.deltaY * 0.01));
  });
}

function isPanelOpen() {
  return !document.getElementById('inventoryPanel').classList.contains('hidden') ||
         !document.getElementById('craftingPanel').classList.contains('hidden');
}

function togglePanel(id, otherId) {
  const panel = document.getElementById(id);
  const other = document.getElementById(otherId);
  const wasHidden = panel.classList.contains('hidden');
  other.classList.add('hidden');
  if (wasHidden) {
    panel.classList.remove('hidden');
    if (id === 'inventoryPanel') renderInventory();
    if (id === 'craftingPanel') renderCrafting();
    document.exitPointerLock();
  } else {
    panel.classList.add('hidden');
  }
}

function handleInteract() {
  if (!interactTarget) {
    // Try place campfire on ground
    if (inventory['campfire']) {
      const pos = playerMesh.position.clone();
      pos.z -= 2;
      placeCampfire(pos);
    }
    return;
  }

  const obj = interactTarget;
  if (obj.depleted) return;

  // Deplete object
  obj.depleted = true;
  obj.respawnTimer = 20 + Math.random() * 30;
  const amt = obj.resourceAmount();
  addItem(obj.resource, amt);
  resourcesCollected++;

  // Effects
  spawnParticles(obj.mesh.position, obj.type === 'tree' ? 0x8B5E3C : 0x888888);
  if (obj.type === 'tree') playChop(); else playCollect();

  // Shrink mesh to show depletion
  obj.mesh.scale.set(0.01, 0.01, 0.01);

  interactTarget = null;
  document.getElementById('interactPrompt').classList.add('hidden');
}

// ─── PLAYER UPDATE ──────────────────────────────────────────
let stepTimer = 0;
function updatePlayer(dt) {
  if (gameState !== STATE.PLAYING) return;

  const moveDir = new THREE.Vector3();
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = sprint ? 8 : 4.5;

  // Movement relative to camera yaw
  if (keys['KeyW'] || keys['ArrowUp'])    moveDir.z -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  moveDir.z += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  moveDir.x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) moveDir.x += 1;

  if (moveDir.length() > 0) {
    moveDir.normalize();
    const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cameraYaw, 0));
    moveDir.applyQuaternion(yawQ);
    playerMesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);

    playerVelocity.x = moveDir.x * speed;
    playerVelocity.z = moveDir.z * speed;

    // Footstep sound
    stepTimer -= dt;
    if (stepTimer <= 0) {
      playStep();
      stepTimer = sprint ? 0.25 : 0.45;
    }
  } else {
    playerVelocity.x *= 0.85;
    playerVelocity.z *= 0.85;
  }

  // Jump
  if ((keys['Space'] || keys['KeyJ']) && playerOnGround) {
    playerVelocity.y = 9;
    playerOnGround = false;
  }

  // Gravity
  playerVelocity.y -= 22 * dt;

  // Move player
  playerMesh.position.x += playerVelocity.x * dt;
  playerMesh.position.z += playerVelocity.z * dt;
  playerMesh.position.y += playerVelocity.y * dt;

  // Ground collision
  const groundY = getGroundY(playerMesh.position.x, playerMesh.position.z);
  if (playerMesh.position.y <= groundY + 0.5) {
    playerMesh.position.y = groundY + 0.5;
    playerVelocity.y = 0;
    playerOnGround = true;
  }

  // Boundary
  playerMesh.position.x = Math.max(-90, Math.min(90, playerMesh.position.x));
  playerMesh.position.z = Math.max(-90, Math.min(90, playerMesh.position.z));

  // Object collision (push player away from trees/rocks)
  for (const obj of worldObjects) {
    if (obj.depleted) continue;
    const dx = playerMesh.position.x - obj.mesh.position.x;
    const dz = playerMesh.position.z - obj.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < obj.colRadius + 0.5 && dist > 0.01) {
      const push = (obj.colRadius + 0.5 - dist);
      playerMesh.position.x += (dx / dist) * push;
      playerMesh.position.z += (dz / dist) * push;
    }
  }

  // Animate player bob
  if (moveDir.length() > 0) {
    const bobSpeed = sprint ? 12 : 7;
    playerMesh.children.forEach((child, i) => {
      if (i === 1 || i === 0) return; // skip body/head slight
      child.rotation.x = Math.sin(Date.now() * 0.001 * bobSpeed + i) * 0.15;
    });
  }

  // Energy drain when sprinting
  if (sprint && moveDir.length() > 0) {
    survivalStats.energy = Math.max(0, survivalStats.energy - 8 * dt);
    if (survivalStats.energy === 0) {
      keys['ShiftLeft'] = false; keys['ShiftRight'] = false;
    }
  } else {
    survivalStats.energy = Math.min(100, survivalStats.energy + 2 * dt);
  }
}

// ─── CAMERA UPDATE ──────────────────────────────────────────
function updateCamera() {
  const camOffset = new THREE.Vector3(
    Math.sin(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance + 2,
    Math.cos(cameraYaw) * Math.cos(cameraPitch) * cameraDistance
  );
  const target = playerMesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const desiredPos = target.clone().add(camOffset);
  // Smooth follow
  camera.position.lerp(desiredPos, 0.15);
  camera.lookAt(target);
}

// ─── DAY/NIGHT CYCLE ────────────────────────────────────────
function updateDayNight(dt) {
  dayTime += dt * 0.008; // full cycle in ~125s
  if (dayTime >= 1) {
    dayTime -= 1;
    dayNumber++;
    toast(`🌅 Day ${dayNumber} begins!`);
  }

  const t = dayTime;
  const isNight = t > 0.55 && t < 0.95;
  const isDusk  = t > 0.45 && t <= 0.55;
  const isDawn  = t >= 0.95 || t < 0.05;

  // Sky color
  let skyColor, fogColor, sunIntensity, ambIntensity;
  if (t < 0.05) { // dawn
    const p = t / 0.05;
    skyColor = lerpColor(0x001020, 0xff7744, p);
    fogColor = lerpColor(0x001010, 0xff9966, p);
    sunIntensity = p * 1.2; ambIntensity = 0.3 + p * 0.3;
  } else if (t < 0.45) { // day
    skyColor = 0x87ceeb; fogColor = 0x5aaa77;
    sunIntensity = 1.4; ambIntensity = 0.6;
  } else if (t < 0.55) { // dusk
    const p = (t - 0.45) / 0.1;
    skyColor = lerpColor(0x87ceeb, 0x331122, p);
    fogColor = lerpColor(0x5aaa77, 0x221133, p);
    sunIntensity = 1.4 * (1 - p); ambIntensity = 0.6 - p * 0.4;
  } else if (t < 0.95) { // night
    skyColor = 0x050515; fogColor = 0x020210;
    sunIntensity = 0; ambIntensity = 0.08;
    scene.fog.density = 0.025;
  } else { // pre-dawn
    const p = (t - 0.95) / 0.05;
    skyColor = lerpColor(0x050515, 0x001020, p);
    fogColor = lerpColor(0x020210, 0x001010, p);
    sunIntensity = 0; ambIntensity = 0.08 + p * 0.1;
  }

  if (!isNight) scene.fog.density = 0.018;

  scene.background = new THREE.Color(skyColor);
  scene.fog.color = new THREE.Color(fogColor);
  scene.sunLight.intensity = sunIntensity;
  scene.ambientLight.intensity = ambIntensity;

  // Sun position
  const sunAngle = t * Math.PI * 2 - Math.PI / 2;
  scene.sunLight.position.set(
    Math.cos(sunAngle) * 80,
    Math.abs(Math.sin(sunAngle)) * 80 + 10,
    40
  );

  // Water ripple
  if (scene.waterMesh) {
    scene.waterMesh.position.y = 0.05 + Math.sin(Date.now() * 0.001) * 0.03;
  }

  // Enemy activation at night
  const nightActive = isNight;
  enemies.forEach(e => { e.active = nightActive; });

  if (isDusk && !window._duskToastShown) {
    window._duskToastShown = true;
    toast('🌙 Night is coming... Stay near fire!', 'warning', 4000);
  }
  if (isDawn) window._duskToastShown = false;
}

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2-r1)*t) << 16) | (Math.round(g1 + (g2-g1)*t) << 8) | Math.round(b1 + (b2-b1)*t);
}

// ─── ENEMY AI ────────────────────────────────────────────────
function updateEnemies(dt) {
  const playerPos = playerMesh.position;
  enemies.forEach(enemy => {
    if (!enemy.active) {
      // Slowly wander even during day (peaceful)
      const mesh = enemy.mesh;
      const dp = new THREE.Vector3();
      dp.subVectors(enemy.wanderTarget, mesh.position);
      dp.y = 0;
      if (dp.length() < 2) {
        enemy.wanderTarget.set(randRange(-60,60), 0, randRange(-60,60));
      }
      dp.normalize().multiplyScalar(1.5 * dt);
      mesh.position.x += dp.x;
      mesh.position.z += dp.z;
      mesh.position.y = getGroundY(mesh.position.x, mesh.position.z) + 0.1;
      mesh.rotation.y = Math.atan2(dp.x, dp.z);
      return;
    }

    const mesh = enemy.mesh;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, mesh.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Check if player is near a campfire
    let nearFire = false;
    for (const cf of campfires) {
      if (cf.mesh.position.distanceTo(playerPos) < 5) { nearFire = true; break; }
    }

    if (nearFire) {
      // Flee from campfire
      enemy.state = 'flee';
    } else if (dist < 18) {
      enemy.state = 'chase';
    } else {
      enemy.state = 'wander';
    }

    if (enemy.state === 'flee') {
      toPlayer.normalize().multiplyScalar(-3 * dt);
      mesh.position.x += toPlayer.x;
      mesh.position.z += toPlayer.z;
    } else if (enemy.state === 'chase') {
      const chaseSpd = 3.5;
      toPlayer.normalize().multiplyScalar(chaseSpd * dt);
      mesh.position.x += toPlayer.x;
      mesh.position.z += toPlayer.z;
      mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

      // Attack player
      enemy.attackCooldown -= dt;
      if (dist < 1.5 && enemy.attackCooldown <= 0) {
        survivalStats.health = Math.max(0, survivalStats.health - 8);
        enemy.attackCooldown = 1.5;
        playHurt();
        toast('🐺 Wolf attacked you! -8 HP', 'danger');
      }
    } else {
      // Wander
      enemy.wanderTimer -= dt;
      if (enemy.wanderTimer <= 0) {
        enemy.wanderTarget.set(randRange(-60,60), 0, randRange(-60,60));
        enemy.wanderTimer = 3 + Math.random() * 5;
      }
      const wp = new THREE.Vector3().subVectors(enemy.wanderTarget, mesh.position);
      wp.y = 0;
      if (wp.length() > 0.5) {
        wp.normalize().multiplyScalar(2 * dt);
        mesh.position.x += wp.x;
        mesh.position.z += wp.z;
        mesh.rotation.y = Math.atan2(wp.x, wp.z);
      }
    }

    mesh.position.y = getGroundY(mesh.position.x, mesh.position.z) + 0.1;

    // Wolf animation
    const bobAmt = Math.sin(Date.now() * 0.008) * 0.05;
    mesh.position.y += bobAmt;
  });
}

// ─── RESOURCE RESPAWN ────────────────────────────────────────
function updateResources(dt) {
  for (const obj of worldObjects) {
    if (!obj.depleted) continue;
    obj.respawnTimer -= dt;
    if (obj.respawnTimer <= 0) {
      obj.depleted = false;
      // Grow back
      obj.mesh.scale.copy(obj.origScale);
    }
  }
}

// ─── SURVIVAL STATS ──────────────────────────────────────────
let hungerTimer = 0, healthWarningTimer = 0;
function updateSurvival(dt) {
  hungerTimer += dt;
  if (hungerTimer > 1.5) {
    hungerTimer = 0;
    survivalStats.hunger = Math.max(0, survivalStats.hunger - 0.5);
    if (survivalStats.hunger === 0) {
      survivalStats.health = Math.max(0, survivalStats.health - 1);
    }
  }

  // Near campfire = energy regen + partial warmth
  nearCampfire = false;
  for (const cf of campfires) {
    if (cf.mesh.position.distanceTo(playerMesh.position) < 6) {
      nearCampfire = true;
      break;
    }
  }
  if (nearCampfire) {
    survivalStats.energy = Math.min(100, survivalStats.energy + 5 * dt);
  }

  // Health warning
  if (survivalStats.health < 30) {
    healthWarningTimer += dt;
    if (healthWarningTimer > 8) {
      healthWarningTimer = 0;
      toast('❤️ Low health! Eat food!', 'danger');
    }
  } else {
    healthWarningTimer = 0;
  }

  // Natural health regen when well fed and resting
  if (survivalStats.hunger > 70 && nearCampfire) {
    survivalStats.health = Math.min(100, survivalStats.health + 1.5 * dt);
  }

  updateHUD();

  if (survivalStats.health <= 0) triggerGameOver();
}

// ─── INTERACT DETECTION ─────────────────────────────────────
function updateInteract() {
  if (isPanelOpen()) {
    document.getElementById('interactPrompt').classList.add('hidden');
    interactTarget = null;
    return;
  }

  let closest = null, closestDist = Infinity;
  for (const obj of worldObjects) {
    if (obj.depleted) continue;
    const d = playerMesh.position.distanceTo(obj.mesh.position);
    if (d < obj.interactRadius && d < closestDist) {
      closestDist = d;
      closest = obj;
    }
  }
  interactTarget = closest;

  const prompt = document.getElementById('interactPrompt');
  if (closest) {
    prompt.classList.remove('hidden');
    document.getElementById('interactText').textContent = closest.label;
  } else if (inventory['campfire']) {
    prompt.classList.remove('hidden');
    document.getElementById('interactText').textContent = 'Place Campfire';
  } else {
    prompt.classList.add('hidden');
  }
}

// ─── PARTICLES UPDATE ────────────────────────────────────────
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 2;
    p.vel.y -= 10 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(Math.max(0, p.life));
    p.mesh.material.opacity = p.life;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

// ─── CAMPFIRE ANIMATION ──────────────────────────────────────
function updateCampfires(dt) {
  campfires.forEach(cf => {
    const t = Date.now() * 0.003;
    cf.fireNode.scale.set(
      1 + Math.sin(t * 3.1) * 0.2,
      1 + Math.cos(t * 4.3) * 0.3,
      1 + Math.sin(t * 2.7) * 0.2,
    );
    cf.fireNode.material.color.setHSL(0.07 + Math.sin(t) * 0.03, 1, 0.5 + Math.sin(t*2)*0.05);
    cf.light.intensity = 2 + Math.sin(t * 4) * 0.5;
    cf.light.color.setHSL(0.07 + Math.sin(t) * 0.02, 1, 0.6);
  });
}

// ─── GAME OVER ───────────────────────────────────────────────
function triggerGameOver() {
  gameState = STATE.GAMEOVER;
  document.getElementById('gameOverScreen').classList.remove('hidden');
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
  document.getElementById('goStats').innerHTML = `
    <b>Survived:</b> Day ${dayNumber} — ${mins}m ${secs}s<br>
    <b>Resources:</b> ${resourcesCollected} collected<br>
    <b>Campfires:</b> ${campfires.length} built
  `;
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawnPlayer() {
  survivalStats = { health: 100, hunger: 100, energy: 100 };
  dayTime = 0; dayNumber = 1; resourcesCollected = 0;
  inventory = {};
  campfires.forEach(cf => scene.remove(cf.mesh));
  campfires.length = 0;
  playerMesh.position.set(0, 1, 0);
  playerVelocity.set(0, 0, 0);
  document.getElementById('gameOverScreen').classList.add('hidden');
  gameState = STATE.PLAYING;
  renderHotbar(); renderInventory();
  updateHUD();
}

// ─── PAUSE ───────────────────────────────────────────────────
function togglePause() {
  if (gameState === STATE.PLAYING) {
    gameState = STATE.PAUSED;
    document.getElementById('pauseMenu').classList.remove('hidden');
    document.exitPointerLock();
  } else if (gameState === STATE.PAUSED) {
    gameState = STATE.PLAYING;
    document.getElementById('pauseMenu').classList.add('hidden');
  }
}

// ─── MAIN LOOP ───────────────────────────────────────────────
function gameLoop() {
  frameId = requestAnimationFrame(gameLoop);
  delta = Math.min(clock.getDelta(), 0.05); // cap delta

  if (gameState === STATE.PLAYING) {
    updatePlayer(delta);
    updateCamera();
    updateDayNight(delta);
    updateEnemies(delta);
    updateResources(delta);
    updateSurvival(delta);
    updateInteract();
    updateParticles(delta);
    updateCampfires(delta);
  } else if (gameState === STATE.PAUSED || gameState === STATE.GAMEOVER) {
    updateCamera();
  }

  renderer.render(scene, camera);
}

// ─── HELPERS ────────────────────────────────────────────────
function randRange(min, max) { return min + Math.random() * (max - min); }

// ─── UI EVENT LISTENERS ─────────────────────────────────────
function setupMenuUI() {
  document.getElementById('btnPlay').addEventListener('click', startGame);
  document.getElementById('btnSettings').addEventListener('click', () => showScreen('settings-screen'));
  document.getElementById('btnHowToPlay').addEventListener('click', () => showScreen('howtoplay-screen'));
  document.getElementById('btnBackFromHelp').addEventListener('click', () => showScreen('start-menu'));
  document.getElementById('btnBackFromSettings').addEventListener('click', () => showScreen('start-menu'));

  document.getElementById('btnResume').addEventListener('click', togglePause);
  document.getElementById('btnPauseSettings').addEventListener('click', () => {
    // inline settings toggle from pause
    toast('⚙ Use settings from main menu');
  });
  document.getElementById('btnExitToMenu').addEventListener('click', exitToMenu);
  document.getElementById('btnRespawn').addEventListener('click', respawnPlayer);
  document.getElementById('btnGoMenu').addEventListaener('click', () => {
    document.getElementById('gameOverScreen').classList.add('hidden');
    exitToMenu();
  });

  document.getElementById('closeInventory').addEventListener('click', () => {
    document.getElementById('inventoryPanel').classList.add('hidden');
  });
  document.getElementById('closeCrafting').addEventListener('click', () => {
    document.getElementById('craftingPanel').classList.add('hidden');
  });

  // Settings sliders
  document.getElementById('sfxVol').addEventListener('input', e => {
    settings.sfxVol = e.target.value / 100;
  });
  document.getElementById('musicVol').addEventListener('input', e => {
    settings.musicVol = e.target.value / 100;
  });
  document.getElementById('fovSlider').addEventListener('input', e => {
    settings.fov = parseInt(e.target.value);
    document.getElementById('fovValue').textContent = settings.fov;
    if (camera) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
  });
}

function startGame() {
  showScreen('game-screen');
  gameState = STATE.PLAYING;
  if (!scene) {
    initThree();
    setupInput();
    gameLoop();
  }
  // Give starter items
  inventory = { wood: 0, stone: 0 };
  renderHotbar();
  renderInventory();
  updateHUD();
  sessionStartTime = Date.now();
  toast('🌲 Welcome to the forest! Survive!');
  setTimeout(() => toast('Press E to collect resources'), 2500);
  setTimeout(() => toast('Press C to open crafting'), 5000);
}

function exitToMenu() {
  gameState = STATE.MENU;
  document.getElementById('pauseMenu').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  showScreen('start-menu');
  document.exitPointerLock();
}

// ─── LOADING + BOOT ─────────────────────────────────────────
function showLoading() {
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.innerHTML = `
    <div class="load-title">🌲 FORESTCRAFT</div>
    <div class="load-bar-track"><div class="load-bar-fill"></div></div>
    <div class="load-sub">LOADING FOREST...</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
    showScreen('start-menu');
  }, 1800);
}

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupMenuUI();
  showLoading();
});