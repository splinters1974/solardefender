const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  level: document.getElementById("level-label"),
  timer: document.getElementById("timer-label"),
  panels: document.getElementById("panels-label"),
  score: document.getElementById("score-label"),
  message: document.getElementById("message-box"),
  start: document.getElementById("start-button"),
  mute: document.getElementById("mute-button"),
  left: document.getElementById("left-button"),
  right: document.getElementById("right-button"),
  shield: document.getElementById("shield-button")
};

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const LEVEL_DURATION = 60;
const PANEL_COUNT = 20;
const PANEL_HP = 2;
const PLAYER_SPEED = 360;
const PROJECTILE_RADIUS = 16;
const ENEMY_BUBBLES = {
  trump: ["Big, beautiful coal!", "Drill, baby, drill!", "Tariffs on sunshine!", "Windmills are a con!"],
  miliband: ["Net zero by Tuesday.", "This needs a levy.", "Public money first.", "Time for reform."],
  dk: ["Ooh-ooh! Smash panels!", "Barrels beat panels!", "Jungle power!", "Nobody likes solar!"]
};

const state = {
  screen: "title",
  level: 1,
  levelTime: LEVEL_DURATION,
  score: 0,
  panels: [],
  player: createPlayer(),
  projectiles: [],
  particles: [],
  flashes: [],
  enemies: [],
  keys: { left: false, right: false },
  pendingSwing: false,
  throwBandIndex: 0,
  lastTime: 0,
  musicStarted: false,
  muted: false
};

const audioState = {
  ctx: null,
  master: null,
  musicGain: null,
  fxGain: null,
  nextNoteAt: 0,
  melodyStep: 0,
  bassStep: 0,
  musicTimer: null
};

const levelConfigs = {
  1: {
    name: "Trump's Stone Barrage",
    baseSpawn: 1.55,
    spawnRamp: 0.75,
    maxProjectiles: 10,
    throwers: [
      {
        id: "trump",
        x: WIDTH / 2,
        kind: "stone",
        face: "#ff9a42",
        suit: "#12386d",
        hair: "#ffe171"
      }
    ]
  },
  2: {
    name: "Cash Storm Coalition",
    baseSpawn: 2.3,
    spawnRamp: 1.1,
    maxProjectiles: 16,
    throwers: [
      {
        id: "trump",
        x: WIDTH * 0.32,
        kind: "stone",
        face: "#ff9a42",
        suit: "#12386d",
        hair: "#ffe171"
      },
      {
        id: "miliband",
        x: WIDTH * 0.68,
        kind: "cash",
        face: "#f1c49c",
        suit: "#3d4657",
        hair: "#1f2329"
      }
    ]
  },
  3: {
    name: "Barrel Mayhem",
    baseSpawn: 2.8,
    spawnRamp: 1.35,
    maxProjectiles: 22,
    throwers: [
      {
        id: "trump",
        x: WIDTH * 0.22,
        kind: "stone",
        face: "#ff9a42",
        suit: "#12386d",
        hair: "#ffe171"
      },
      {
        id: "miliband",
        x: WIDTH * 0.52,
        kind: "cash",
        face: "#f1c49c",
        suit: "#3d4657",
        hair: "#1f2329"
      },
      {
        id: "dk",
        x: WIDTH * 0.8,
        kind: "barrel",
        face: "#6b4426",
        suit: "#7a2020",
        hair: "#4a2b16"
      }
    ]
  }
};

function createPlayer() {
  return {
    x: WIDTH / 2,
    y: 444,
    width: 38,
    height: 54,
    swingDuration: 0.28,
    swingTimer: 0,
    swingCooldown: 0
  };
}

function resetPanels() {
  const panels = [];
  const cols = 10;
  const rows = 2;
  const panelWidth = 76;
  const panelHeight = 28;
  const gapX = 10;
  const gapY = 16;
  const totalWidth = cols * panelWidth + (cols - 1) * gapX;
  const startX = (WIDTH - totalWidth) / 2;
  const startY = 528;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      panels.push({
        id: row * cols + col,
        x: startX + col * (panelWidth + gapX),
        y: startY + row * (panelHeight + gapY),
        width: panelWidth,
        height: panelHeight,
        hp: PANEL_HP
      });
    }
  }

  state.panels = panels;
}

function startGame() {
  state.screen = "playing";
  state.level = 1;
  state.levelTime = LEVEL_DURATION;
  state.score = 0;
  state.projectiles = [];
  state.particles = [];
  state.flashes = [];
  state.player = createPlayer();
  state.pendingSwing = false;
  state.throwBandIndex = 0;
  resetPanels();
  prepareLevel(1);
  updateMessage("Level 1: Trump hurls stones. Tap Space to swat them with the squeegee.");
  ensureAudio();
}

function prepareLevel(levelNumber) {
  const config = levelConfigs[levelNumber];
  state.level = levelNumber;
  state.levelTime = LEVEL_DURATION;
  state.projectiles = [];
  state.particles = [];
  state.flashes = [];
  state.pendingSwing = false;
  state.throwBandIndex = 0;
  resetPanels();
  state.enemies = config.throwers.map(thrower => ({
    ...thrower,
    wobble: Math.random() * Math.PI * 2,
    cooldown: randomBetween(0.45, 0.95),
    bubbleTimer: randomBetween(0.6, 1.8),
    bubbleIndex: Math.floor(Math.random() * ENEMY_BUBBLES[thrower.id].length),
    bubbleText: ENEMY_BUBBLES[thrower.id][0]
  }));
}

function advanceLevel() {
  if (state.level === 1) {
    prepareLevel(2);
    pauseMusicFor(0.9);
    updateMessage("Level 2: fresh panels are online. Trump and Ed now attack across the full solar farm.");
    playFx("level-up");
    return;
  }

  if (state.level === 2) {
    prepareLevel(3);
    pauseMusicFor(1);
    updateMessage("Level 3: Donkey Kong joins in with barrels. Fresh panels are online again.");
    playFx("level-up");
    return;
  }

  state.screen = "victory";
  playFx("victory");
  updateMessage(`Victory. You saved ${countAlivePanels()} panel${countAlivePanels() === 1 ? "" : "s"} and scored ${state.score}.`);
}

function gameOver() {
  state.screen = "gameover";
  stopMusic();
  playFx("game-over");
  updateMessage(`Game over. All panels were smashed. Final score: ${state.score}. Press Start Game to try again.`);
}

function countAlivePanels() {
  return state.panels.filter(panel => panel.hp > 0).length;
}

function updateMessage(text) {
  ui.message.textContent = text;
}

function setHeld(button, held) {
  button.classList.toggle("is-held", held);
}

function bindHold(button, key) {
  const down = event => {
    event.preventDefault();
    state.keys[key] = true;
    setHeld(button, true);
    if (state.screen === "playing") {
      ensureAudio();
    }
  };
  const up = event => {
    event.preventDefault();
    state.keys[key] = false;
    setHeld(button, false);
  };

  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

bindHold(ui.left, "left");
bindHold(ui.right, "right");
ui.shield.addEventListener("pointerdown", event => {
  event.preventDefault();
  queueSwing();
  setHeld(ui.shield, true);
  if (state.screen === "playing") {
    ensureAudio();
  }
});

const releaseShieldButton = event => {
  event.preventDefault();
  setHeld(ui.shield, false);
};

ui.shield.addEventListener("pointerup", releaseShieldButton);
ui.shield.addEventListener("pointerleave", releaseShieldButton);
ui.shield.addEventListener("pointercancel", releaseShieldButton);

ui.start.addEventListener("click", startGame);
ui.mute.addEventListener("click", toggleMute);

window.addEventListener("keydown", event => {
  if (event.repeat) {
    return;
  }

  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    state.keys.left = true;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    state.keys.right = true;
  }
  if (event.code === "Space") {
    event.preventDefault();
    queueSwing();
  }
  if (event.code === "Enter" && state.screen !== "playing") {
    startGame();
  }
  if (state.screen === "playing") {
    ensureAudio();
  }
});

window.addEventListener("keyup", event => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    state.keys.left = false;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    state.keys.right = false;
  }
});

function queueSwing() {
  state.pendingSwing = true;
}

function toggleMute() {
  state.muted = !state.muted;
  ui.mute.textContent = state.muted ? "Sound Off" : "Sound On";
  if (audioState.master) {
    audioState.master.gain.value = state.muted ? 0 : 0.28;
  }
}

function stopMusic() {
  if (audioState.musicTimer) {
    window.clearTimeout(audioState.musicTimer);
    audioState.musicTimer = null;
  }
  audioState.nextNoteAt = 0;
}

function pauseMusicFor(seconds) {
  if (!audioState.ctx) {
    return;
  }
  stopMusic();
  audioState.nextNoteAt = audioState.ctx.currentTime + seconds;
  scheduleMusic();
}

function ensureAudio() {
  if (state.musicStarted) {
    if (audioState.ctx?.state === "suspended") {
      audioState.ctx.resume();
    }
    if (!audioState.musicTimer && state.screen === "playing") {
      audioState.nextNoteAt = Math.max(audioState.ctx.currentTime + 0.05, audioState.nextNoteAt || 0);
      scheduleMusic();
    }
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const audioCtx = new AudioContextClass();
  const master = audioCtx.createGain();
  const musicGain = audioCtx.createGain();
  const fxGain = audioCtx.createGain();

  master.gain.value = state.muted ? 0 : 0.28;
  musicGain.gain.value = 0.48;
  fxGain.gain.value = 0.52;

  musicGain.connect(master);
  fxGain.connect(master);
  master.connect(audioCtx.destination);

  audioState.ctx = audioCtx;
  audioState.master = master;
  audioState.musicGain = musicGain;
  audioState.fxGain = fxGain;
  audioState.nextNoteAt = audioCtx.currentTime + 0.05;
  state.musicStarted = true;
  scheduleMusic();
}

function scheduleMusic() {
  if (!audioState.ctx || audioState.musicTimer) {
    return;
  }

  const tick = () => {
    if (!audioState.ctx) {
      audioState.musicTimer = null;
      return;
    }

    const melody = state.level === 1
      ? [523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 880, 659.25]
      : [523.25, 698.46, 783.99, 932.33, 783.99, 698.46, 659.25, 523.25];
    const bass = state.level === 1
      ? [130.81, 130.81, 196, 130.81]
      : [146.83, 196, 220, 196];

    while (audioState.nextNoteAt < audioState.ctx.currentTime + 0.35) {
      const melodyFreq = melody[audioState.melodyStep % melody.length];
      const bassFreq = bass[audioState.bassStep % bass.length];

      playTone(melodyFreq, audioState.nextNoteAt, 0.11, "square", 0.08, audioState.musicGain);
      playTone(bassFreq, audioState.nextNoteAt, 0.18, "triangle", 0.06, audioState.musicGain);

      audioState.nextNoteAt += 0.18;
      audioState.melodyStep += 1;
      if (audioState.melodyStep % 2 === 0) {
        audioState.bassStep += 1;
      }
    }

    audioState.musicTimer = window.setTimeout(tick, 90);
  };

  tick();
}

function playTone(frequency, startAt, duration, type, volume, destination) {
  if (!audioState.ctx || state.muted) {
    return;
  }

  const osc = audioState.ctx.createOscillator();
  const gain = audioState.ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function playFx(type) {
  if (!audioState.ctx || state.muted) {
    return;
  }

  const now = audioState.ctx.currentTime;

  if (type === "block") {
    playTone(860, now, 0.04, "square", 0.09, audioState.fxGain);
    playTone(620, now + 0.03, 0.05, "square", 0.06, audioState.fxGain);
    return;
  }

  if (type === "swing") {
    playTone(310, now, 0.03, "square", 0.05, audioState.fxGain);
    playTone(420, now + 0.03, 0.05, "square", 0.04, audioState.fxGain);
    return;
  }

  if (type === "panel-hit") {
    playTone(190, now, 0.14, "sawtooth", 0.09, audioState.fxGain);
    return;
  }

  if (type === "panel-break") {
    playTone(160, now, 0.18, "sawtooth", 0.1, audioState.fxGain);
    playTone(120, now + 0.05, 0.2, "triangle", 0.08, audioState.fxGain);
    return;
  }

  if (type === "level-up") {
    playTone(523.25, now, 0.12, "square", 0.1, audioState.fxGain);
    playTone(659.25, now + 0.12, 0.12, "square", 0.1, audioState.fxGain);
    playTone(783.99, now + 0.24, 0.12, "square", 0.12, audioState.fxGain);
    playTone(1046.5, now + 0.36, 0.22, "square", 0.14, audioState.fxGain);
    return;
  }

  if (type === "game-over") {
    playTone(220, now, 0.18, "triangle", 0.09, audioState.fxGain);
    playTone(174.61, now + 0.16, 0.2, "triangle", 0.09, audioState.fxGain);
    playTone(130.81, now + 0.34, 0.28, "triangle", 0.1, audioState.fxGain);
    playTone(98, now + 0.56, 0.42, "triangle", 0.1, audioState.fxGain);
    return;
  }

  if (type === "victory") {
    playTone(523.25, now, 0.09, "square", 0.08, audioState.fxGain);
    playTone(659.25, now + 0.09, 0.09, "square", 0.08, audioState.fxGain);
    playTone(783.99, now + 0.18, 0.09, "square", 0.08, audioState.fxGain);
    playTone(1046.5, now + 0.27, 0.18, "square", 0.1, audioState.fxGain);
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function nextThrowTargetX() {
  const bands = 12;
  const bandWidth = (WIDTH - 120) / bands;
  const useSequentialBand = Math.random() < 0.82;
  const bandIndex = useSequentialBand
    ? state.throwBandIndex++ % bands
    : Math.floor(Math.random() * bands);
  const bandStart = 60 + bandIndex * bandWidth;
  return bandStart + bandWidth / 2 + randomBetween(-bandWidth * 0.42, bandWidth * 0.42);
}

function spawnProjectile(enemy) {
  const targetX = nextThrowTargetX();
  const dx = targetX - enemy.x;
  const dy = state.player.y - 40;
  const travel = Math.max(Math.hypot(dx, dy), 1);
  const levelFactor = state.level === 1 ? 1 : 1.25;
  const speed = enemy.kind === "stone"
    ? randomBetween(170, 260) * levelFactor
    : enemy.kind === "cash"
      ? randomBetween(180, 280) * levelFactor
      : randomBetween(150, 235) * levelFactor;

  state.projectiles.push({
    x: enemy.x,
    y: 120,
    vx: (dx / travel) * randomBetween(35, 125) + randomBetween(-35, 35),
    vy: speed,
    radius: enemy.kind === "stone" ? PROJECTILE_RADIUS : enemy.kind === "cash" ? 18 : 20,
    rotation: Math.random() * Math.PI * 2,
    spin: randomBetween(-4.2, 4.2),
    kind: enemy.kind,
    damage: 1
  });
}

function updatePlaying(dt) {
  const move = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
  state.player.x += move * PLAYER_SPEED * dt;
  state.player.x = Math.max(60, Math.min(WIDTH - 60, state.player.x));
  state.player.swingCooldown = Math.max(0, state.player.swingCooldown - dt);

  if (state.pendingSwing && state.player.swingCooldown <= 0 && state.player.swingTimer <= 0) {
    state.player.swingTimer = state.player.swingDuration;
    state.player.swingCooldown = 0.08;
    state.pendingSwing = false;
    playFx("swing");
  } else if (state.pendingSwing && state.player.swingTimer > 0) {
    state.pendingSwing = false;
  }

  if (state.player.swingTimer > 0) {
    state.player.swingTimer = Math.max(0, state.player.swingTimer - dt);
  }

  state.levelTime = Math.max(0, state.levelTime - dt);
  if (state.levelTime <= 0) {
    if (countAlivePanels() > 0) {
      advanceLevel();
    } else {
      gameOver();
    }
    return;
  }

  const config = levelConfigs[state.level];
  const elapsed = LEVEL_DURATION - state.levelTime;
  const intensity = Math.min(1, elapsed / LEVEL_DURATION);

  for (const enemy of state.enemies) {
    enemy.wobble += dt * 1.5;
    enemy.cooldown -= dt;
    enemy.bubbleTimer -= dt;
    if (enemy.bubbleTimer <= 0) {
      const lines = ENEMY_BUBBLES[enemy.id];
      enemy.bubbleIndex = (enemy.bubbleIndex + 1) % lines.length;
      enemy.bubbleText = lines[enemy.bubbleIndex];
      enemy.bubbleTimer = randomBetween(2.4, 4.2);
    }
    const spawnRate = config.baseSpawn + config.spawnRamp * intensity;
    const shotWindow = 1 / spawnRate;
    if (enemy.cooldown <= 0 && state.projectiles.length < config.maxProjectiles) {
      spawnProjectile(enemy);
      enemy.cooldown = shotWindow * randomBetween(0.7, 1.18);
    }
  }

  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.rotation += projectile.spin * dt;
  }

  handleCollisions();

  state.projectiles = state.projectiles.filter(projectile => projectile.y < HEIGHT + 60);
  state.particles = state.particles
    .map(particle => ({
      ...particle,
      x: particle.x + particle.vx * dt,
      y: particle.y + particle.vy * dt,
      life: particle.life - dt
    }))
    .filter(particle => particle.life > 0);
  state.flashes = state.flashes
    .map(flash => ({ ...flash, life: flash.life - dt }))
    .filter(flash => flash.life > 0);

  if (countAlivePanels() <= 0) {
    gameOver();
    return;
  }
}

function handleCollisions() {
  const swingHitbox = getSwingHitbox();

  state.projectiles = state.projectiles.filter(projectile => {
    if (swingHitbox && intersectsCircleRect(projectile, swingHitbox)) {
      state.score += projectile.kind === "stone" ? 120 : 140;
      spawnImpact(projectile.x, projectile.y, projectile.kind === "stone" ? "#e0d9cf" : "#8aff8d", 10);
      state.flashes.push({ x: projectile.x, y: projectile.y, radius: 34, color: "#59f2ff", life: 0.12 });
      playFx("block");
      return false;
    }

    for (const panel of state.panels) {
      if (panel.hp > 0 && intersectsCircleRect(projectile, panel)) {
        damagePanel(panel, projectile);
        return false;
      }
    }

    return true;
  });
}

function getShieldRect() {
  const phase = getSwingPhase();
  const angle = state.player.swingTimer > 0
    ? (-1.05 + phase * 2.1) * (Math.PI / 3.4)
    : 0.18;
  const cx = state.player.x + Math.sin(angle) * 58;
  const cy = state.player.y - 12 - Math.cos(angle) * 36;

  return {
    x: cx - 54,
    y: cy - 15,
    width: 108,
    height: 30
  };
}

function getSwingPhase() {
  if (state.player.swingTimer <= 0) {
    return 0;
  }
  return 1 - state.player.swingTimer / state.player.swingDuration;
}

function getSwingHitbox() {
  if (state.player.swingTimer <= 0) {
    return null;
  }
  return getShieldRect();
}

function intersectsCircleRect(circle, rect) {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function damagePanel(panel, projectile) {
  panel.hp = Math.max(0, panel.hp - projectile.damage);
  state.score = Math.max(0, state.score - 55);
  state.flashes.push({ x: panel.x + panel.width / 2, y: panel.y + panel.height / 2, radius: 40, color: "#ff4f70", life: 0.18 });
  spawnImpact(projectile.x, projectile.y, projectile.kind === "stone" ? "#cfc7bc" : "#a5ffad", panel.hp === 0 ? 16 : 8);

  if (panel.hp === 0) {
    playFx("panel-break");
  } else {
    playFx("panel-hit");
  }
}

function spawnImpact(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: randomBetween(-90, 90),
      vy: randomBetween(-90, 90),
      life: randomBetween(0.2, 0.55),
      size: randomBetween(3, 8),
      color
    });
  }
}

function draw() {
  drawBackground();
  drawPanels();
  drawPlayer();
  drawEnemies();
  drawProjectiles();
  drawParticles();
  drawFlashes();
  drawOverlay();
  syncHud();
}

function syncHud() {
  ui.level.textContent = String(state.level);
  ui.timer.textContent = String(Math.ceil(state.levelTime));
  ui.panels.textContent = String(countAlivePanels());
  ui.score.textContent = String(Math.round(state.score));
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#220438");
  sky.addColorStop(0.5, "#120020");
  sky.addColorStop(1, "#05030e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#ffd34d";
  ctx.fillRect(0, 0, WIDTH, 10);

  for (let i = 0; i < 55; i += 1) {
    const x = (i * 173) % WIDTH;
    const y = (i * 97) % 230;
    ctx.fillStyle = i % 4 === 0 ? "#59f2ff" : "#fbe7a0";
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.fillStyle = "#11121f";
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(120, 280);
  ctx.lineTo(250, 350);
  ctx.lineTo(390, 260);
  ctx.lineTo(540, 340);
  ctx.lineTo(710, 240);
  ctx.lineTo(860, 330);
  ctx.lineTo(WIDTH, 280);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1b2f18";
  ctx.fillRect(0, 440, WIDTH, HEIGHT - 440);
  ctx.fillStyle = "#2e5e2d";
  for (let i = 0; i < WIDTH; i += 48) {
    ctx.fillRect(i, 470 + (i % 3) * 4, 30, 4);
  }
}

function drawPanels() {
  for (const panel of state.panels) {
    const intact = panel.hp > 0;
    ctx.fillStyle = intact ? "#143c77" : "#2b2034";
    ctx.strokeStyle = intact ? "#59f2ff" : "#554368";
    ctx.lineWidth = 3;
    roundRect(panel.x, panel.y, panel.width, panel.height, 6);
    ctx.fill();
    ctx.stroke();

    if (intact) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      for (let x = panel.x + 18; x < panel.x + panel.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, panel.y + 4);
        ctx.lineTo(x, panel.y + panel.height - 4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(panel.x + 6, panel.y + panel.height / 2);
      ctx.lineTo(panel.x + panel.width - 6, panel.y + panel.height / 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ff4f70";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(panel.x + 12, panel.y + 8);
      ctx.lineTo(panel.x + panel.width - 10, panel.y + panel.height - 8);
      ctx.moveTo(panel.x + panel.width - 12, panel.y + 7);
      ctx.lineTo(panel.x + 10, panel.y + panel.height - 7);
      ctx.stroke();
    }

    drawPanelHp(panel);
  }
}

function drawPanelHp(panel) {
  const barX = panel.x;
  const barY = panel.y - 10;
  ctx.fillStyle = "#35214c";
  ctx.fillRect(barX, barY, panel.width, 5);
  if (panel.hp > 0) {
    const ratio = panel.hp / PANEL_HP;
    ctx.fillStyle = ratio > 0.66 ? "#68ff91" : ratio > 0.33 ? "#ffcc31" : "#ff4f70";
    ctx.fillRect(barX, barY, panel.width * ratio, 5);
  }
}

function drawPlayer() {
  const { x, y, width, height } = state.player;

  ctx.fillStyle = "#274eac";
  ctx.fillRect(x - width / 2, y, width, height - 16);
  ctx.fillStyle = "#f1c298";
  ctx.fillRect(x - 14, y - 24, 28, 28);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 10, y - 15, 5, 5);
  ctx.fillRect(x + 5, y - 15, 5, 5);
  ctx.fillStyle = "#1c2430";
  ctx.fillRect(x - 9, y - 13, 3, 3);
  ctx.fillRect(x + 6, y - 13, 3, 3);
  ctx.fillStyle = "#6f4027";
  ctx.fillRect(x - 15, y - 30, 30, 8);
  ctx.fillRect(x - width / 2 - 8, y + 10, 8, 16);
  ctx.fillRect(x + width / 2, y + 10, 8, 16);
  ctx.fillRect(x - 16, y + height - 16, 9, 22);
  ctx.fillRect(x + 7, y + height - 16, 9, 22);
  drawSqueegee();
}

function drawSqueegee() {
  const phase = getSwingPhase();
  const angle = state.player.swingTimer > 0
    ? (-1.05 + phase * 2.1) * (Math.PI / 3.4)
    : 0.18;

  ctx.save();
  ctx.translate(state.player.x, state.player.y + 18);
  ctx.rotate(angle);
  ctx.fillStyle = "#6d4e31";
  ctx.fillRect(-4, -56, 8, 82);
  ctx.fillStyle = state.player.swingTimer > 0 ? "#7df6ff" : "#8fd6dc";
  ctx.fillRect(-50, -64, 100, 18);
  ctx.strokeStyle = "#f5fbff";
  ctx.lineWidth = 3;
  ctx.strokeRect(-50, -64, 100, 18);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const bob = Math.sin(enemy.wobble) * 4;
    const x = enemy.x;
    const y = 46 + bob;

    drawEnemyFigure(enemy, x, y);
    drawSpeechBubble(enemy, x, y);
  }
}

function drawSpeechBubble(enemy, x, y) {
  const text = enemy.bubbleText || ENEMY_BUBBLES[enemy.id][0];
  const side = enemy.id === "trump" ? "right" : "left";
  ctx.save();
  ctx.font = "bold 12px sans-serif";
  const textWidth = ctx.measureText(text).width;
  const bubbleWidth = textWidth + 22;
  const bubbleHeight = 26;
  const bubbleX = side === "right" ? x + 34 : x - bubbleWidth - 34;
  const bubbleY = y - 8;
  const tailBaseX = side === "right" ? bubbleX : bubbleX + bubbleWidth;
  const tailTipX = side === "right" ? x + 16 : x - 16;
  const tailTipY = y + 8;

  ctx.fillStyle = "rgba(255, 250, 236, 0.96)";
  ctx.strokeStyle = enemy.id === "trump" ? "#ff9a42" : "#3d4657";
  ctx.lineWidth = 2;
  roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 12);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tailBaseX, bubbleY + 10);
  ctx.lineTo(tailBaseX, bubbleY + 18);
  ctx.lineTo(tailTipX, tailTipY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2a2135";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bubbleX + bubbleWidth / 2, bubbleY + bubbleHeight / 2 + 1);
  ctx.restore();
}

function drawEnemyFigure(enemy, x, y) {
  ctx.save();
  ctx.translate(x, y);

  drawEnemyArms(enemy);
  drawEnemyBody(enemy);
  drawEnemyHead(enemy);

  if (enemy.id === "trump") {
    drawTrumpHair();
    drawTrumpFace();
    drawTrumpTie();
    drawRock(54, 53, 14, 0.3);
  } else if (enemy.id === "miliband") {
    drawMilibandHair();
    drawMilibandFace();
    drawMilibandTie();
    drawMilibandGlasses();
    drawCash(54, 53, 24, 15, 0.15);
  } else {
    drawDKFur();
    drawDKFace();
    drawDKTie();
    drawBarrel(56, 58, 18, 0.08);
  }

  ctx.restore();
}

function drawEnemyBody(enemy) {
  ctx.fillStyle = enemy.suit;
  ctx.beginPath();
  ctx.moveTo(-38, 92);
  ctx.quadraticCurveTo(-34, 38, 0, 32);
  ctx.quadraticCurveTo(34, 38, 38, 92);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e9edf5";
  ctx.beginPath();
  ctx.moveTo(-12, 34);
  ctx.lineTo(0, 64);
  ctx.lineTo(12, 34);
  ctx.closePath();
  ctx.fill();
}

function drawEnemyArms(enemy) {
  ctx.strokeStyle = enemy.face;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-26, 46);
  ctx.quadraticCurveTo(-46, 52, -48, 76);
  ctx.moveTo(26, 46);
  ctx.quadraticCurveTo(50, 50, 52, 78);
  ctx.stroke();
}

function drawEnemyHead(enemy) {
  ctx.fillStyle = enemy.face;
  ctx.beginPath();
  ctx.ellipse(0, 19, 26, 30, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrumpHair() {
  ctx.fillStyle = "#f5d25f";
  ctx.beginPath();
  ctx.moveTo(-24, 2);
  ctx.quadraticCurveTo(-8, -16, 24, -4);
  ctx.quadraticCurveTo(8, 2, -2, 10);
  ctx.quadraticCurveTo(-12, 3, -24, 2);
  ctx.closePath();
  ctx.fill();
}

function drawTrumpFace() {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-10, 18, 5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(10, 18, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2a2020";
  ctx.beginPath();
  ctx.arc(-10, 18, 2, 0, Math.PI * 2);
  ctx.arc(10, 18, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#b5542b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 21);
  ctx.lineTo(-2, 29);
  ctx.stroke();

  ctx.strokeStyle = "#b23034";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 34);
  ctx.quadraticCurveTo(0, 39, 12, 34);
  ctx.stroke();
}

function drawTrumpTie() {
  ctx.fillStyle = "#dd1d2f";
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(8, 72);
  ctx.lineTo(0, 88);
  ctx.lineTo(-8, 72);
  ctx.closePath();
  ctx.fill();
}

function drawMilibandHair() {
  ctx.fillStyle = "#2f3640";
  ctx.beginPath();
  ctx.moveTo(-24, 8);
  ctx.quadraticCurveTo(-18, -10, 0, -12);
  ctx.quadraticCurveTo(18, -10, 24, 8);
  ctx.quadraticCurveTo(12, 2, 0, 4);
  ctx.quadraticCurveTo(-10, 2, -24, 8);
  ctx.closePath();
  ctx.fill();
}

function drawMilibandFace() {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-9, 19, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(9, 19, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1d1d1d";
  ctx.beginPath();
  ctx.arc(-9, 19, 2, 0, Math.PI * 2);
  ctx.arc(9, 19, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#87573f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(1, 29);
  ctx.stroke();

  ctx.strokeStyle = "#6a3227";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-10, 35);
  ctx.quadraticCurveTo(0, 33, 10, 35);
  ctx.stroke();
}

function drawMilibandTie() {
  ctx.fillStyle = "#d63f3f";
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(7, 68);
  ctx.lineTo(0, 84);
  ctx.lineTo(-7, 68);
  ctx.closePath();
  ctx.fill();
}

function drawMilibandGlasses() {
  ctx.strokeStyle = "#1c1f24";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.rect(-16, 14, 12, 9);
  ctx.rect(4, 14, 12, 9);
  ctx.moveTo(-4, 18);
  ctx.lineTo(4, 18);
  ctx.stroke();
}

function drawDKFur() {
  ctx.fillStyle = "#5b371e";
  ctx.beginPath();
  ctx.ellipse(0, 19, 28, 31, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawDKFace() {
  ctx.fillStyle = "#d8b18a";
  ctx.beginPath();
  ctx.ellipse(0, 24, 17, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-8, 18, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(8, 18, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b1511";
  ctx.beginPath();
  ctx.arc(-8, 18, 2, 0, Math.PI * 2);
  ctx.arc(8, 18, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d1d12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 31);
  ctx.quadraticCurveTo(0, 35, 8, 31);
  ctx.stroke();
}

function drawDKTie() {
  ctx.fillStyle = "#d51c1c";
  ctx.beginPath();
  ctx.moveTo(-14, 44);
  ctx.lineTo(14, 42);
  ctx.lineTo(11, 52);
  ctx.lineTo(-12, 54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd34d";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DK", 0, 52);
}

function drawBarrel(x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#8a542b";
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4b2b13";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.65, -size * 0.28);
  ctx.lineTo(size * 0.65, -size * 0.28);
  ctx.moveTo(-size * 0.7, 0);
  ctx.lineTo(size * 0.7, 0);
  ctx.moveTo(-size * 0.65, size * 0.28);
  ctx.lineTo(size * 0.65, size * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawProjectiles() {
  for (const projectile of state.projectiles) {
    if (projectile.kind === "stone") {
      drawRock(projectile.x, projectile.y, projectile.radius, projectile.rotation);
    } else if (projectile.kind === "cash") {
      drawCash(projectile.x, projectile.y, 28, 18, projectile.rotation);
    } else {
      drawBarrel(projectile.x, projectile.y, projectile.radius + 6, projectile.rotation);
    }
  }
}

function drawRock(x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#b5aca3";
  ctx.beginPath();
  ctx.moveTo(-size, -size * 0.2);
  ctx.lineTo(-size * 0.45, -size);
  ctx.lineTo(size * 0.75, -size * 0.75);
  ctx.lineTo(size, size * 0.1);
  ctx.lineTo(size * 0.4, size);
  ctx.lineTo(-size * 0.7, size * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#6f655d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawCash(x, y, width, height, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#9fff96";
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.strokeStyle = "#23502b";
  ctx.lineWidth = 3;
  ctx.strokeRect(-width / 2, -height / 2, width, height);
  ctx.fillStyle = "#23502b";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("$", 0, 5);
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 2);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawFlashes() {
  for (const flash of state.flashes) {
    ctx.globalAlpha = flash.life * 3;
    ctx.strokeStyle = flash.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, flash.radius * (1.2 - flash.life), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (state.screen === "playing") {
    return;
  }

  ctx.fillStyle = "rgba(4, 3, 10, 0.46)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";

  if (state.screen === "title") {
    ctx.fillStyle = "#ffcc31";
    ctx.font = "bold 58px sans-serif";
    ctx.fillText("SOLAR DEFENDER", WIDTH / 2, 170);
    ctx.fillStyle = "#59f2ff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("Block the barrage. Save the solar farm.", WIDTH / 2, 230);
    ctx.fillStyle = "#fff7db";
    ctx.font = "22px sans-serif";
    ctx.fillText("Start with the button or press Enter.", WIDTH / 2, 300);
    ctx.fillText("Swing with Space. Move with arrows or A/D.", WIDTH / 2, 338);
  }

  if (state.screen === "victory") {
    ctx.fillStyle = "#68ff91";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("YOU SAVED THE FARM", WIDTH / 2, 200);
    ctx.fillStyle = "#fff7db";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Final score: ${Math.round(state.score)}`, WIDTH / 2, 260);
    ctx.fillText("Press Start Game for another run.", WIDTH / 2, 300);
  }

  if (state.screen === "gameover") {
    ctx.fillStyle = "#ff4f70";
    ctx.font = "bold 60px sans-serif";
    ctx.fillText("GAME OVER", WIDTH / 2, 200);
    ctx.fillStyle = "#fff7db";
    ctx.font = "24px sans-serif";
    ctx.fillText("Every panel got smashed.", WIDTH / 2, 260);
    ctx.fillText("Press Start Game to reset the defence line.", WIDTH / 2, 300);
  }
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function frame(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;

  if (state.screen === "playing") {
    updatePlaying(dt);
  }

  draw();
  requestAnimationFrame(frame);
}

updateMessage("Press start, then move with the arrow keys or A/D. Tap Space to swing the squeegee.");
resetPanels();
prepareLevel(1);
draw();
requestAnimationFrame(frame);
