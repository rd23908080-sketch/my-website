const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const selectedEl = document.getElementById('selected');
const blockSelect = document.getElementById('blockSelect');

let W = 0, H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Tile world
const TILE = 32;
const WORLD_W = 200;
const WORLD_H = 80;
let world = [];

// Blocks metadata comes from `textures.js` (window.BLOCKS). Fall back if missing.
const BLOCKS = window.BLOCKS || [
  { id: 0, name: 'Air', solid: false, color: null },
  { id: 1, name: 'Dirt', solid: true, color: '#8B5A2B' },
  { id: 2, name: 'Grass', solid: true, color: '#3FBF69' },
  { id: 3, name: 'Stone', solid: true, color: '#7D7D7D' }
];
let selectedIndex = 2; // Grass
// hotbar state: 9 slots mapping to block ids
let hotbarSlots = new Array(9).fill(0);
for (let i = 0; i < 9; i++) hotbarSlots[i] = (i + 1 < BLOCKS.length) ? i + 1 : 0;
let selectedSlot = 0; // active hotbar slot index

function setSelected(i) {
  selectedIndex = i;
  // Reload textures at runtime and refresh hotbar textures
  const reloadTexturesButton = document.getElementById('reloadTexturesBtn');
  if (reloadTexturesButton) {
    reloadTexturesButton.addEventListener('click', () => {
      if (typeof loadBlockTextures === 'function') {
        loadBlockTextures(TILE).then(() => {
          refreshHotbarSelection();
        }).catch((e) => {
          console.warn('Failed to reload textures', e);
        });
      }
    });
  }
  selectedEl.textContent = BLOCKS[i].name;
}
setSelected(selectedIndex);

// create hotbar UI and selection handling
function refreshHotbarSelection() {
  const hotbar = document.getElementById('hotbar');
  if (!hotbar) return;
  for (let i = 0; i < hotbar.children.length; i++) {
    const child = hotbar.children[i];
    child.classList.toggle('selected', i === selectedSlot);
  }
  // update HUD selected name
  selectedEl.textContent = BLOCKS[selectedIndex] ? BLOCKS[selectedIndex].name : 'None';
}

function setActiveSlot(slotIndex) {
  selectedSlot = slotIndex;
  const bid = hotbarSlots[slotIndex] || 0;
  if (bid && BLOCKS[bid]) setSelected(bid);
  refreshHotbarSelection();
}

function createHotbar() {
  const hotbar = document.getElementById('hotbar');
  if (!hotbar) return;
  hotbar.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const bid = hotbarSlots[i] || 0;
    const b = BLOCKS[bid] || { name: String(bid), color: '#888' };
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.slot = String(i);

    const cvs = document.createElement('canvas');
    cvs.width = 36; cvs.height = 36;
    const cctx = cvs.getContext('2d');
    if (b.texture) cctx.drawImage(b.texture, 0, 0, 36, 36);
    else if (b.color) { cctx.fillStyle = b.color; cctx.fillRect(0,0,36,36); }
    else { cctx.clearRect(0,0,36,36); }
    slot.appendChild(cvs);

    slot.addEventListener('click', () => { setActiveSlot(i); });
    hotbar.appendChild(slot);
  }
  refreshHotbarSelection();
}

// attempt to load any textures declared in `textures.js`
if (window.loadBlockTextures) {
  window.loadBlockTextures(TILE).then((blocks) => {
    // copy back into runtime BLOCKS if loader returned a fresh array
    if (blocks && blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        BLOCKS[i] = Object.assign(BLOCKS[i] || {}, blocks[i]);
      }
    }
    // build hotbar after textures are applied
    createHotbar();
  }).catch(() => {/* ignore load errors */});
} else {
  createHotbar();
}

// reload textures when the page gains focus (useful after adding files to textures/)
if (window.loadBlockTextures) {
  window.addEventListener('focus', () => {
    loadBlockTextures(TILE).then((blocks) => {
      if (blocks && blocks.length) {
        for (let i = 0; i < blocks.length; i++) {
          BLOCKS[i] = Object.assign(BLOCKS[i] || {}, blocks[i]);
        }
      }
      createHotbar();
      refreshHotbarSelection();
    }).catch(() => {/* ignore */});
  });
}

// try to load breaking frames sprite (textures/frames.png)
let BREAK_FRAMES = null; // array of canvases
let BREAK_FRAME_COUNT = 0;
// how quickly frames progress relative to break progress (0.5 = half as fast)
let BREAK_FRAME_SPEED = 0.5;
(function loadBreakFrames(){
  const img = new Image();
  img.onload = () => {
    const cols = Math.floor(img.width / TILE) || 1;
    const rows = Math.floor(img.height / TILE) || 1;
    BREAK_FRAME_COUNT = cols * rows;
    BREAK_FRAMES = [];
    const oc = document.createElement('canvas');
    oc.width = TILE; oc.height = TILE;
    const octx = oc.getContext('2d');
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        octx.clearRect(0,0,TILE,TILE);
        octx.drawImage(img, c * TILE, r * TILE, TILE, TILE, 0, 0, TILE, TILE);
        const copy = document.createElement('canvas'); copy.width = TILE; copy.height = TILE;
        copy.getContext('2d').drawImage(oc, 0, 0);
        BREAK_FRAMES.push(copy);
        idx++;
      }
    }
  };
  img.onerror = () => { BREAK_FRAMES = null; };
  img.src = 'textures/frames.png';
})();

// attempt to load a sky image for background (optional)
let SKY_IMG = null;
(function loadSky(){
  const img = new Image();
  img.onload = () => { SKY_IMG = img; };
  img.onerror = () => { SKY_IMG = null; };
  img.src = 'textures/sky.png';
})();

// wire block select UI
if (blockSelect) {
  blockSelect.value = String(selectedIndex);
  blockSelect.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    if (!Number.isNaN(v)) setSelected(v);
  });
}


function createEmptyWorld() {
  world = Array.from({ length: WORLD_H }, () => new Uint8Array(WORLD_W));
}

function generateTerrain() {
  createEmptyWorld();
  const heights = new Array(WORLD_W);
  const mid = Math.floor(WORLD_H * 0.45);

  // build a small table of random values for smooth interpolation
  const rand = new Float32Array(WORLD_W + 4);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
  function smoothVal(x) {
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = rand[(xi) % rand.length];
    const b = rand[(xi + 1) % rand.length];
    // smoothstep interpolation
    const t = xf * xf * (3 - 2 * xf);
    return a * (1 - t) + b * t;
  }

  // layered 1D value-noise (octaves) for natural hills
  for (let x = 0; x < WORLD_W; x++) {
    const nx = x / WORLD_W;
    let n = 0;
    n += smoothVal(x * 0.12) * 0.55;
    n += smoothVal(x * 0.34) * 0.28;
    n += smoothVal(x * 0.78) * 0.12;
    // add a gentle sine for larger-scale variation
    n += (Math.sin(x * 0.02) * 0.5 + 0.5) * 0.05;
    // center and scale
    const noise = (n - 0.5) * 10;
    heights[x] = Math.max(3, Math.floor(mid + noise));
  }

  // gentle smoothing (average neighbors) to remove sharp spikes
  for (let pass = 0; pass < 2; pass++) {
    const copy = heights.slice();
    for (let x = 1; x < WORLD_W - 1; x++) {
      copy[x] = Math.floor((heights[x - 1] + heights[x] + heights[x + 1]) / 3);
    }
    for (let x = 1; x < WORLD_W - 1; x++) heights[x] = copy[x];
  }

  // fill tiles from height to bottom: top grass, next 5 layers dirt, then stone
  for (let x = 0; x < WORLD_W; x++) {
    const h = heights[x];
    for (let y = h; y < WORLD_H; y++) {
      if (y === h) {
        world[y][x] = 2; // grass
      } else if (y <= h + 5) {
        world[y][x] = 1; // dirt (next 5 layers)
      } else {
        world[y][x] = 3; // stone below
      }
    }
  }
}

generateTerrain();

// Player
const player = {
  x: WORLD_W * TILE / 2,
  y: 0,
  w: TILE * 0.6,
  h: TILE * 0.9,
  vx: 0,
  vy: 0,
  speed: 3.2
};

// place player above ground at center
function placePlayerOnSurface() {
  const cx = Math.floor((player.x) / TILE);
  for (let y = 0; y < WORLD_H; y++) {
    if (world[y][cx] !== 0) {
      player.y = (y - 1) * TILE - player.h - 1;
      break;
    }
  }
}
placePlayerOnSurface();

// camera smoothing state to avoid shaking
const cameraState = { x: 0, y: 0 };
// initialize camera to player position
cameraState.x = player.x + player.w/2 - W/2;
cameraState.y = player.y + player.h/2 - H/2;

// Input
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  // number keys 1-9 select hotbar slots
  if (e.key >= '1' && e.key <= '9') {
    const n = parseInt(e.key, 10) - 1;
    if (typeof setActiveSlot === 'function') setActiveSlot(n);
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// Mouse for placing/removing
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const cam = getCamera();
  const wx = Math.floor((mx + cam.x) / TILE);
  const wy = Math.floor((my + cam.y) / TILE);
  if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) return;
  if (e.button === 0) {
    // left - place
    if (world[wy][wx] === 0) {
      // don't place inside player
      const tilePx = wx * TILE, tilePy = wy * TILE;
      if (!rectsIntersect(tilePx, tilePy, TILE, TILE, player.x, player.y, player.w, player.h)) {
          // only allow placing if the new block would be adjacent to an existing block
          const hasNeighbor = (
            (wy > 0 && world[wy - 1][wx] !== 0) ||
            (wy < WORLD_H - 1 && world[wy + 1][wx] !== 0) ||
            (wx > 0 && world[wy][wx - 1] !== 0) ||
            (wx < WORLD_W - 1 && world[wy][wx + 1] !== 0)
          );

          // enforce placement radius: only within 4 blocks (Euclidean) of player center
          const ptx = Math.floor((player.x + player.w/2) / TILE);
          const pty = Math.floor((player.y + player.h/2) / TILE);
          const dx = wx - ptx;
          const dy = wy - pty;
          if (dx * dx + dy * dy > 16) return; // outside 4-block radius (4^2 = 16)

          // disallow placement if there is a solid block directly "in front" of the target
          // (the tile one step from target toward the player)
          const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
          const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
          const inFrontX = wx - stepX;
          const inFrontY = wy - stepY;
          if (inFrontX >= 0 && inFrontX < WORLD_W && inFrontY >= 0 && inFrontY < WORLD_H) {
            if (world[inFrontY][inFrontX] !== 0) return; // blocked
          }

          if (hasNeighbor) {
            world[wy][wx] = selectedIndex;
            // if the block directly beneath the placed block is grass, turn it into dirt
            if (wy + 1 < WORLD_H && world[wy + 1][wx] === 2) {
              world[wy + 1][wx] = 1;
            }
          }
      }
    }
  } else if (e.button === 2) {
    // right - start breaking (hold to break)
    const id = world[wy][wx];
    if (id !== 0) {
      startBreaking(wx, wy, id);
    }
  }
});

// cancel break on mouseup
window.addEventListener('mouseup', (e) => {
  // any mouseup cancels/ends breaking unless completed
  if (breakTarget) {
    // if completed, completion handled elsewhere; otherwise cancel
    if (!breakTarget.completed) breakTarget = null;
  }
});

// track mouse for hover/placement preview
let mouse = { x: W/2, y: H/2 };
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = t.clientX - rect.left;
  mouse.y = t.clientY - rect.top;
}, { passive: true });

function rectsIntersect(x1,y1,w1,h1,x2,y2,w2,h2){
  return !(x2 > x1 + w1 || x2 + w2 < x1 || y2 > y1 + h1 || y2 + h2 < y1);
}

// Camera
function getCamera(){
  // target camera: follow player horizontally; follow vertically only when mining downward
  const targetX = player.x + player.w/2 - W/2;
  const maxX = WORLD_W * TILE - W;
  const maxY = WORLD_H * TILE - H;
  const tx = clamp(targetX, 0, Math.max(0, maxX));

  // smooth camera lerp towards horizontal target
  const SMOOTH = 0.14; // lower = smoother/slower
  cameraState.x += (tx - cameraState.x) * SMOOTH;

  // determine if we should follow vertically: only when breaking a tile below the player's tile
  const pty = Math.floor((player.y + player.h/2) / TILE);
  let followY = false;
  if (typeof breakTarget !== 'undefined' && breakTarget && typeof breakTarget.wy === 'number') {
    if (breakTarget.wy > pty) followY = true;
  }

  if (followY) {
    const targetY = player.y + player.h/2 - H/2;
    const ty = clamp(targetY, 0, Math.max(0, maxY));
    cameraState.y += (ty - cameraState.y) * SMOOTH;
  }

  // always clamp vertical camera to world bounds
  cameraState.y = clamp(cameraState.y, 0, Math.max(0, maxY));

  // snap to integer pixels to avoid subpixel jitter when drawing tiles
  return { x: Math.round(cameraState.x), y: Math.round(cameraState.y) };
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function isSolidAtPixel(px, py){
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return false;
  return world[ty][tx] !== 0;
}

function collidesAt(x, y) {
  const left = x;
  const right = x + player.w;
  const top = y;
  const bottom = y + player.h;

  const minTx = Math.floor(left / TILE);
  const maxTx = Math.floor((right - 0.001) / TILE);
  const minTy = Math.floor(top / TILE);
  const maxTy = Math.floor((bottom - 0.001) / TILE);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) continue;
      if (world[ty][tx] !== 0) return true;
    }
  }
  return false;
}

// break effects
const breakEffects = [];
const BREAK_DURATION = 500; // ms

function spawnBreak(wx, wy, blockId) {
  const cx = wx * TILE + TILE / 2;
  const cy = wy * TILE + TILE / 2;
  const color = (BLOCKS[blockId] && BLOCKS[blockId].color) || '#999';
  const count = 14;
  const now = performance.now();
  const particles = [];
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 0.12 + Math.random() * 0.6; // pixels/ms
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed - (Math.random() * 0.15); // slight upward
    const size = 4 + Math.random() * 6;
    particles.push({ x: cx, y: cy, vx, vy, size, color });
  }
  breakEffects.push({ t0: now, duration: BREAK_DURATION, particles });
}

// progressive breaking (hold to break) state
let breakTarget = null; // { wx, wy, id, t0, duration, seed }
const BREAK_HOLD_MS = 2000;

function seedFor(wx, wy, id) {
  // simple deterministic seed from coords
  return ((wx & 0xffff) << 16) ^ (wy & 0xffff) ^ (id * 2654435761 >>> 0);
}

function startBreaking(wx, wy, id) {
  // if starting same tile, ignore
  if (breakTarget && breakTarget.wx === wx && breakTarget.wy === wy) return;
  // per-block durations (milliseconds)
  const QUICK_BREAK_MS = 750; // grass/dirt
  const duration = (id === 1 || id === 2) ? QUICK_BREAK_MS : BREAK_HOLD_MS;
  breakTarget = { wx, wy, id, t0: performance.now(), duration, seed: seedFor(wx, wy, id), completed: false };
}

// Physics & update
const GRAVITY = 0.45;
// limit jump so player can only jump ~1 tile high: v = -sqrt(2*g*tile)
const JUMP = -5.5;

function update() {
  // input
  let left = keys['a'] || keys['arrowleft'];
  let right = keys['d'] || keys['arrowright'];
  let up = keys['w'] || keys['arrowup'] || keys[' '];

  if (left) player.vx = -player.speed;
  else if (right) player.vx = player.speed;
  else player.vx = 0;

  // apply gravity
  player.vy += GRAVITY;

  // jumping: check if standing on ground
  // move a small step down to test
  const belowY = player.y + player.h + 1;
  const onGround = isSolidAtPixel(player.x + 1, belowY) || isSolidAtPixel(player.x + player.w - 1, belowY);
  if (up && onGround) { player.vy = JUMP; }

  // apply velocities but prevent entering any tile that contains a block
  const nextX = player.x + player.vx;
  if (!collidesAt(nextX, player.y)) {
    player.x = nextX;
  } else {
    player.vx = 0;
  }

  const nextY = player.y + player.vy;
  if (!collidesAt(player.x, nextY)) {
    player.y = nextY;
  } else {
    // if landing on the ground, ensure we sit flush on top of tile
    if (player.vy > 0) {
      // snap player.y to just above the tile they hit
      const bottom = player.y + player.h + player.vy;
      const ty = Math.floor(bottom / TILE);
      player.y = ty * TILE - player.h - 0.001;
    }
    player.vy = 0;
  }
}

// Render
function draw() {
  // sky (use sky image if available, otherwise solid color)
  if (SKY_IMG && SKY_IMG.width && SKY_IMG.height) {
    const iw = SKY_IMG.width, ih = SKY_IMG.height;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = Math.floor((W - dw) / 2);
    const dy = Math.floor((H - dh) / 2);
    ctx.drawImage(SKY_IMG, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, W, H);
  }

  const cam = getCamera();
  const tx0 = Math.floor(cam.x / TILE);
  const ty0 = Math.floor(cam.y / TILE);
  const tx1 = Math.ceil((cam.x + W) / TILE);
  const ty1 = Math.ceil((cam.y + H) / TILE);

  // tiles
  for (let y = ty0; y < ty1; y++) {
    if (y < 0 || y >= WORLD_H) continue;
    for (let x = tx0; x < tx1; x++) {
      if (x < 0 || x >= WORLD_W) continue;
      const id = world[y][x];
      if (id === 0) continue;
      const b = BLOCKS[id];
      const sx = x * TILE - cam.x;
      const sy = y * TILE - cam.y;
      if (b.texture) {
        ctx.drawImage(b.texture, sx, sy, TILE, TILE);
      } else {
        ctx.fillStyle = b.color;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.strokeRect(sx, sy, TILE, TILE);
      }
      // darken stone tiles progressively with depth to simulate obscurity underground
      if (id === 3) {
        // find start of this contiguous stone column (scan upward)
        let stoneStart = y;
        while (stoneStart > 0 && world[stoneStart - 1][x] === 3) stoneStart--;
        const depth = y - stoneStart; // 0 = topmost stone
        const MAX_STONE_DARK_DEPTH = 16; // depth in tiles where darkness caps
        const maxDark = 0.45; // maximum darkness overlay (45%)
        const darkFactor = Math.min(1, depth / MAX_STONE_DARK_DEPTH) * maxDark;
        if (darkFactor > 0) {
          ctx.fillStyle = 'rgba(0,0,0,' + darkFactor.toFixed(3) + ')';
          ctx.fillRect(sx, sy, TILE, TILE);
        }
      }
    }
  }

  // player
  const px = player.x - cam.x;
  const py = player.y - cam.y;
  ctx.fillStyle = '#FFDD57';
  ctx.fillRect(px, py, player.w, player.h);
  ctx.strokeStyle = '#00000033';
  ctx.strokeRect(px, py, player.w, player.h);

  // draw break effects (particles)
  const now = performance.now();
  for (let i = breakEffects.length - 1; i >= 0; i--) {
    const be = breakEffects[i];
    const elapsed = now - be.t0;
    const p = Math.min(1, elapsed / be.duration);
    if (elapsed >= be.duration) {
      breakEffects.splice(i, 1);
      continue;
    }
    for (const part of be.particles) {
      const pxp = part.x + part.vx * elapsed;
      const pyp = part.y + part.vy * elapsed + 0.5 * 0.000 * elapsed * elapsed;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = part.color;
      const s = Math.max(1, part.size * (1 - p));
      ctx.fillRect(pxp - s/2 - cam.x, pyp - s/2 - cam.y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // draw progressive crack overlay if breaking in progress
  if (breakTarget) {
    const { wx, wy, id, t0, duration } = breakTarget;
    // ensure tile still exists and same id
    if (wy >= 0 && wy < WORLD_H && wx >= 0 && wx < WORLD_W && world[wy][wx] === id) {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / duration);
      const sx = wx * TILE - cam.x;
      const sy = wy * TILE - cam.y;
      // semi-transparent damage overlay
      ctx.fillStyle = 'rgba(0,0,0,' + (0.18 * p) + ')';
      ctx.fillRect(sx, sy, TILE, TILE);

      if (BREAK_FRAMES && BREAK_FRAMES.length > 0) {
        // draw sprite frame corresponding to progress as a semi-transparent overlay
        // scale frame progression so frames advance slower than break progress
        let idx;
        if (p >= 1) idx = BREAK_FRAME_COUNT - 1;
        else idx = Math.min(BREAK_FRAME_COUNT - 1, Math.floor(p * BREAK_FRAME_COUNT * BREAK_FRAME_SPEED));
        const frame = BREAK_FRAMES[idx] || BREAK_FRAMES[BREAK_FRAMES.length - 1];
        if (frame) {
          ctx.save();
          // keep original tile visible beneath the cracking frame
          ctx.globalAlpha = 0.75;
          ctx.drawImage(frame, sx, sy, TILE, TILE);
          ctx.restore();
        }
      } else {
        // draw cracks: increase number of lines with progress
        const maxCracks = 8;
        const num = Math.floor(p * maxCracks);
        // deterministic RNG
        let s = breakTarget.seed;
        function rng() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
        ctx.strokeStyle = 'rgba(0,0,0,0.95)';
        ctx.lineWidth = 2;
        for (let i = 0; i < num; i++) {
          const x1 = sx + rng() * TILE;
          const y1 = sy + rng() * TILE;
          const x2 = sx + rng() * TILE;
          const y2 = sy + rng() * TILE;
          ctx.beginPath();
          ctx.moveTo(x1 + 0.5, y1 + 0.5);
          ctx.lineTo(x2 + 0.5, y2 + 0.5);
          ctx.stroke();
          // small branches
          if (rng() > 0.66) {
            const bx = x1 + (x2 - x1) * rng();
            const by = y1 + (y2 - y1) * rng();
            ctx.beginPath(); ctx.moveTo(bx + 0.5, by + 0.5); ctx.lineTo(bx + (rng() - 0.5) * 12, by + (rng() - 0.5) * 12); ctx.stroke();
          }
        }
      }

      // if completed, finalize
      if (p >= 1) {
        breakTarget.completed = true;
        spawnBreak(wx, wy, id);
        world[wy][wx] = 0;
        breakTarget = null;
      }
    } else {
      // tile changed or removed -> cancel
      breakTarget = null;
    }
  }

  // hover / placement outline
  if (mouse) {
    const hoverWx = Math.floor((mouse.x + cam.x) / TILE);
    const hoverWy = Math.floor((mouse.y + cam.y) / TILE);
    if (hoverWx >= 0 && hoverWx < WORLD_W && hoverWy >= 0 && hoverWy < WORLD_H && world[hoverWy][hoverWx] !== 0) {
      const hsx = hoverWx * TILE - cam.x;
      const hsy = hoverWy * TILE - cam.y;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'white';
      ctx.globalAlpha = 0.95;
      ctx.strokeRect(hsx + 1, hsy + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }
  }

  // HUD small
  ctx.fillStyle = '#00000055';
  ctx.fillRect(10, H - 60, 220, 50);
  ctx.fillStyle = '#fff';
  ctx.font = '14px system-ui, Arial';
  ctx.fillText('Selected: ' + BLOCKS[selectedIndex].name + ' (1-3 to change)', 18, H - 36);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();