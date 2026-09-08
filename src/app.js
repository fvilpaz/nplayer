'use strict';

const EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
const DB_NAME = 'nplayer';
const DB_STORE = 'dir';

// --- State ---
let files = [];
let currentIdx = -1;
let savedHandle = null;
let shuffle = false;
let repeat = 'none';
let shuffleOrder = [];
let audio = new Audio();
let dirHandle = null;

// --- DOM ---
const btnOpen      = document.getElementById('btn-open');
const btnTheme     = document.getElementById('btn-theme');
const iconMoon     = document.getElementById('icon-moon');
const iconSun      = document.getElementById('icon-sun');
const btnPlay      = document.getElementById('btn-play');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const btnShuffle   = document.getElementById('btn-shuffle');
const btnRepeat    = document.getElementById('btn-repeat');
const progressBar  = document.getElementById('progress-bar');
const timeCurrent  = document.getElementById('time-current');
const timeTotal    = document.getElementById('time-total');
const trackArt     = document.getElementById('track-art');
const artInput     = document.getElementById('art-input');
const artWrap      = document.getElementById('art-wrap');
const artContainer = document.getElementById('art-container');
const bgBlur       = document.getElementById('bg-blur');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const searchInput  = document.getElementById('search-input');
const searchClear  = document.getElementById('search-clear');
const playlist     = document.getElementById('playlist');
const emptyState   = document.getElementById('empty');
const btnReconnect = document.getElementById('btn-reconnect');
const emptyMsg     = document.getElementById('empty-msg');

// --- Init ---
audio.volume = parseFloat(localStorage.getItem('np_vol') ?? '0.8');

// ─── VISUALIZER ───────────────────────────────────────────────
const canvas = document.getElementById('visualizer');
const ctx2d  = canvas.getContext('2d');

let audioCtx, analyser, source;
let vizRAF    = null;
let vizOn     = false;
let vizMode   = 0;          // 0=barras 1=onda 2=radial 3=matrix
let currentPage = -1;       // -1=foto 0-3=animaciones
const VIZ_MODES = 4;

let particles   = [];
let matrixDrops = [];
let matrixLastFrame = 0;
const matrixChars = "アイウエオカキクケコ0101ABCDEF<>[]{}+=*~ナニヌネハヒフヘホ";

function initAudioCtx() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser  = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
}

// --- Modos de dibujo ---
function drawBars(data, W, H) {
  ctx2d.clearRect(0, 0, W, H);
  const bw = W / data.length;
  data.forEach((v, i) => {
    const h   = Math.max(2, (v / 255) * H);
    const hue = 190 + (i / data.length) * 60;
    ctx2d.fillStyle = `hsla(${hue},85%,55%,${0.5 + (v/255)*0.5})`;
    ctx2d.beginPath();
    ctx2d.roundRect(i * bw + 1, H - h, bw - 2, h, 2);
    ctx2d.fill();
  });
}

function drawWave(W, H) {
  const td = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(td);
  ctx2d.clearRect(0, 0, W, H);
  ctx2d.lineWidth   = 2.5;
  ctx2d.strokeStyle = '#1793d1';
  ctx2d.shadowBlur  = 12;
  ctx2d.shadowColor = '#1793d1';
  ctx2d.beginPath();
  td.forEach((v, i) => {
    const x = (i / td.length) * W;
    const y = H / 2 + ((v - 128) / 128) * (H * 0.4);
    i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
  });
  ctx2d.stroke();
  ctx2d.shadowBlur = 0;
}

function drawRadial(data, W, H) {
  ctx2d.clearRect(0, 0, W, H);
  const cx   = W / 2, cy = H / 2;
  const r    = Math.min(W, H) * 0.3;
  const bass = data.slice(0, 4).reduce((a, b) => a + b, 0) / 4 / 255;

  if (bass > 0.4 && particles.length < 50) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * (2 + bass * 4),
        vy: Math.sin(a) * (2 + bass * 4),
        life: 1, hue: 190 + Math.random() * 60, size: 2 + Math.random() * 3
      });
    }
  }
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.life -= 0.02;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx2d.fillStyle = `hsla(${p.hue},85%,60%,${p.life * 0.7})`;
    ctx2d.fill();
  });

  data.forEach((v, i) => {
    const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const len   = (v / 255) * r * 0.8;
    const hue   = 190 + (i / data.length) * 120;
    ctx2d.strokeStyle = `hsl(${hue},85%,60%)`;
    ctx2d.lineWidth   = 2.5;
    ctx2d.beginPath();
    ctx2d.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx2d.lineTo(cx + Math.cos(angle) * (r + len), cy + Math.sin(angle) * (r + len));
    ctx2d.stroke();
  });
  ctx2d.strokeStyle = 'rgba(23,147,209,0.3)';
  ctx2d.lineWidth   = 1;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.stroke();
}

function drawMatrix(data, W, H) {
  const now  = performance.now();
  const bass = data.slice(0, 8).reduce((a, b) => a + b, 0) / 8 / 255;
  const fps  = 8 + Math.floor(bass * 4);
  if (now - matrixLastFrame < 1000 / fps) return;
  matrixLastFrame = now;

  const fontSize = Math.max(7, Math.floor(W / 16));
  const cols     = Math.floor(W / fontSize);
  if (matrixDrops.length !== cols) {
    matrixDrops = Array.from({ length: cols }, () => -Math.floor(Math.random() * 20));
  }

  ctx2d.fillStyle = document.body.classList.contains('light')
    ? 'rgba(10,10,18,0.06)'
    : 'rgba(10,10,18,0.12)';
  ctx2d.fillRect(0, 0, W, H);
  ctx2d.font = `${fontSize}px monospace`;

  for (let i = 0; i < matrixDrops.length; i++) {
    const ch    = matrixChars[Math.floor(Math.random() * matrixChars.length)];
    const y     = matrixDrops[i] * fontSize;
    const alpha = 0.3 + Math.random() * 0.4;
    if (Math.random() > 0.9)   ctx2d.fillStyle = `rgba(255,255,255,${alpha})`;
    else if (i % 3 === 0)      ctx2d.fillStyle = `rgba(23,147,209,${alpha})`;
    else                        ctx2d.fillStyle = `rgba(0,200,150,${alpha})`;
    ctx2d.fillText(ch, i * fontSize, y);
    if (y > H && Math.random() > 0.97 - bass * 0.03) matrixDrops[i] = 0;
    matrixDrops[i] += 0.25 + bass * 0.5;
  }

  if (bass > 0.55 && Math.random() > 0.88) spawnMeteor(W, H);
}

function spawnMeteor(W, H) {
  const sx  = Math.random() * W;
  const sy  = Math.random() * H * 0.4;
  const ang = 30 + Math.random() * 30;
  const len = 25 + Math.random() * 35;
  const dur = 500 + Math.random() * 400;
  const ex  = sx + Math.cos(ang * Math.PI / 180) * len * 5;
  const ey  = sy + Math.sin(ang * Math.PI / 180) * len * 5;
  let t0    = null;
  (function animMeteor(ts) {
    if (!t0) t0 = ts;
    const p = Math.min(1, (ts - t0) / dur);
    const x = sx + (ex - sx) * p;
    const y = sy + (ey - sy) * p;
    const a = p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1;
    ctx2d.save();
    ctx2d.globalAlpha = a * 0.7;
    ctx2d.strokeStyle = '#ff7b00';
    ctx2d.lineWidth   = 2;
    ctx2d.shadowBlur  = 4;
    ctx2d.shadowColor = '#ff4400';
    ctx2d.beginPath();
    ctx2d.moveTo(x, y);
    ctx2d.lineTo(x - Math.cos(ang * Math.PI / 180) * len, y - Math.sin(ang * Math.PI / 180) * len);
    ctx2d.stroke();
    ctx2d.restore();
    if (p < 1) requestAnimationFrame(animMeteor);
  })(performance.now());
}

function drawViz() {
  const W = canvas.width, H = canvas.height;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  if      (vizMode === 0) drawBars(data, W, H);
  else if (vizMode === 1) drawWave(W, H);
  else if (vizMode === 2) drawRadial(data, W, H);
  else if (vizMode === 3) drawMatrix(data, W, H);
  vizRAF = requestAnimationFrame(drawViz);
}

function goToPage(page) {
  currentPage = page;
  cancelAnimationFrame(vizRAF);
  if (page === -1) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display  = 'none';
    artWrap.style.display = '';
    artContainer.style.background = '';
    vizOn = false;
    return;
  }
  initAudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!vizOn) {
    const r = artContainer.getBoundingClientRect();
    canvas.width  = r.width  || 300;
    canvas.height = r.height || 200;
    artWrap.style.display = 'none';
    canvas.style.display  = 'block';
    artContainer.style.background = 'linear-gradient(135deg,#1a2a3a,#0f1520,#1a1d2e)';
  }
  vizMode     = page;
  vizOn       = true;
  particles   = [];
  matrixDrops = [];
  drawViz();
}

window.addEventListener('resize', () => {
  if (!vizOn) return;
  const r = artContainer.getBoundingClientRect();
  canvas.width  = r.width  || 300;
  canvas.height = r.height || 200;
});

// Swipe en foto y canvas — rueda: foto → anim0 → anim1 → anim2 → anim3 → foto → ...
let swipeStartX = null;

function onSwipeStart(x) { swipeStartX = x; }
function onSwipeEnd(x) {
  if (swipeStartX === null) return;
  const diff = x - swipeStartX;
  if (Math.abs(diff) < 40) { swipeStartX = null; return; }
  const dir  = diff < 0 ? 1 : -1;
  let next   = currentPage + dir;
  if (next > VIZ_MODES - 1) next = -1;
  if (next < -1) next = VIZ_MODES - 1;
  goToPage(next);
  swipeStartX = null;
}

[artContainer, canvas].forEach(el => {
  el.addEventListener('touchstart', e => onSwipeStart(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
  el.addEventListener('touchend',   e => onSwipeEnd(e.changedTouches[0].clientX));
  el.addEventListener('mousedown',  e => { e.preventDefault(); onSwipeStart(e.clientX); });
  el.addEventListener('mouseup',    e => onSwipeEnd(e.clientX));
});

// ─── CUSTOM ART ───────────────────────────────────────────────
const savedArt = localStorage.getItem('np_art');
if (savedArt) trackArt.src = savedArt;

document.getElementById('art-overlay').addEventListener('click', e => {
  e.stopPropagation();
  artInput.click();
});

artInput.addEventListener('change', () => {
  const file = artInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    trackArt.src = e.target.result;
    bgBlur.style.backgroundImage = `url('${e.target.result}')`;
    localStorage.setItem('np_art', e.target.result);
  };
  reader.readAsDataURL(file);
});

// ─── APP TITLE ────────────────────────────────────────────────
const appTitle = document.getElementById('app-title');
const savedTitle = localStorage.getItem('np_title');
if (savedTitle) appTitle.textContent = savedTitle;

appTitle.addEventListener('dblclick', () => {
  const input = document.createElement('input');
  input.value = appTitle.textContent;
  input.style.cssText = 'background:none;border:none;border-bottom:2px solid var(--blue);color:var(--blue);font:inherit;font-size:1rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;outline:none;width:100%;';
  appTitle.replaceWith(input);
  input.focus();
  input.select();
  const done = () => {
    const val = input.value.trim() || 'Nando Player';
    appTitle.textContent = val;
    localStorage.setItem('np_title', val);
    input.replaceWith(appTitle);
  };
  input.addEventListener('blur', done);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
});

// ─── THEME ────────────────────────────────────────────────────
if (localStorage.getItem('np_theme') === 'light') applyLight();

btnTheme.addEventListener('click', () => {
  if (document.body.classList.contains('light')) {
    document.body.classList.remove('light');
    iconMoon.style.display = 'block';
    iconSun.style.display  = 'none';
    localStorage.setItem('np_theme', 'dark');
  } else {
    applyLight();
    localStorage.setItem('np_theme', 'light');
  }
});

function applyLight() {
  document.body.classList.add('light');
  iconMoon.style.display = 'none';
  iconSun.style.display  = 'block';
}

// ─── SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') window.location.reload();
  });
}

// ─── DIRECTORY ────────────────────────────────────────────────
openDB().then(db => getDir(db)).then(async handle => {
  if (!handle) return;
  const perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'granted') {
    loadDirectory(handle);
    btnReconnect.style.display = 'none';
    return;
  }
  savedHandle = handle;
  emptyMsg.textContent       = 'Pulsa Play para reanudar';
  btnReconnect.style.display = 'block';
}).catch(() => {});

// ─── EVENTS ───────────────────────────────────────────────────
btnReconnect.addEventListener('click', async () => {
  if (window.Capacitor?.isNativePlatform()) {
    try {
      const { uri } = await window.Capacitor.Plugins.Folder.pickFolder();
      localStorage.setItem('np_native_uri', uri);
      await loadNativeFolder(uri);
    } catch (e) { console.error(e); }
    return;
  }
  try {
    let handle = savedHandle;
    if (handle) {
      const perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') handle = null;
    }
    if (!handle) {
      handle = await window.showDirectoryPicker({ mode: 'read' });
      saveDir(handle);
      savedHandle = handle;
    }
    btnReconnect.style.display = 'none';
    await loadDirectory(handle);
    if (files.length) loadTrack(0);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
});

btnOpen.addEventListener('click', async () => {
  if (window.Capacitor?.isNativePlatform()) {
    try {
      const { Folder } = window.Capacitor.Plugins;
      const { uri } = await Folder.pickFolder();
      localStorage.setItem('np_native_uri', uri);
      await loadNativeFolder(uri);
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    saveDir(handle);
    savedHandle = handle;
    loadDirectory(handle);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
});

btnPlay.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', playPrev);
btnNext.addEventListener('click', playNext);

btnShuffle.addEventListener('click', () => {
  shuffle = !shuffle;
  btnShuffle.classList.toggle('active', shuffle);
  if (shuffle) buildShuffleOrder();
});

btnRepeat.addEventListener('click', () => {
  const modes = ['none', 'all', 'one'];
  repeat = modes[(modes.indexOf(repeat) + 1) % modes.length];
  btnRepeat.classList.toggle('active', repeat !== 'none');
  btnRepeat.title = repeat === 'one' ? 'Repetir una' : repeat === 'all' ? 'Repetir todo' : 'Sin repetir';
});

audio.addEventListener('timeupdate', onTimeUpdate);
audio.addEventListener('ended', onEnded);

audio.addEventListener('play', () => {
  iconPlay.style.display  = 'none';
  iconPause.style.display = 'block';
  trackArt.classList.add('playing');
  playlist.querySelector('li.active')?.classList.remove('paused');
});

audio.addEventListener('pause', () => {
  iconPlay.style.display  = 'block';
  iconPause.style.display = 'none';
  trackArt.classList.remove('playing');
  playlist.querySelector('li.active')?.classList.add('paused');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentIdx >= 0) {
    localStorage.setItem('np_idx', currentIdx);
localStorage.setItem(files[currentIdx]?._native ? 'np_native_pos' : 'np_pos', audio.currentTime);
  }
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.style.display = q ? 'block' : 'none';
  filterPlaylist(q);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  filterPlaylist('');
});

progressBar.addEventListener('input', () => {
  const pct = progressBar.value / 100;
  audio.currentTime = audio.duration * pct;
  setProgressPct(progressBar.value);
});

// ─── CAPACITOR NATIVE ─────────────────────────────────────────
async function loadNativeFolder(uri) {
  const { Folder } = window.Capacitor.Plugins;
  const { files: nativeFiles } = await Folder.listFiles({ uri });
  files = nativeFiles.map(f => ({ ...f, _folder: f.folder || 'Música', _native: true }));
  files.sort((a, b) => {
    const fa = a._folder.localeCompare(b._folder, undefined, { numeric: true });
    return fa !== 0 ? fa : a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  renderPlaylist();

  const lastIdx = parseInt(localStorage.getItem('np_native_idx') ?? '-1');
  const lastPos = parseFloat(localStorage.getItem('np_native_pos') ?? '0');
  if (lastIdx >= 0 && lastIdx < files.length) {
    await loadTrack(lastIdx, false);
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = lastPos; }, { once: true });
  } else if (files.length) {
    loadTrack(0);
  }

  emptyState.style.display = files.length ? 'none' : 'flex';
  playlist.style.display   = files.length ? 'block' : 'none';
}

// Al arrancar en Capacitor, recuperar carpeta guardada
if (window.Capacitor?.isNativePlatform()) {
  const savedUri = localStorage.getItem('np_native_uri');
  if (savedUri) {
    window.Capacitor.Plugins.Folder.pickFolder()
      .then(({ uri }) => loadNativeFolder(uri))
      .catch(() => {});
  }
}

// ─── CORE ─────────────────────────────────────────────────────
async function scanDir(handle, path = '') {
  const results = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') {
      const sub = await scanDir(entry, path ? `${path}/${entry.name}` : entry.name);
      results.push(...sub);
    } else if (entry.kind === 'file' && EXTS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      entry._folder = path || dirHandle.name;
      results.push(entry);
    }
  }
  return results;
}

async function loadDirectory(handle) {
  dirHandle = handle;
  files = [];
  emptyState.style.display = 'none';
  playlist.style.display   = 'block';
  playlist.innerHTML = '<li style="color:var(--text-dim);padding:12px;font-size:0.85rem">Cargando música...</li>';

  const lastIdx = parseInt(localStorage.getItem('np_idx') ?? '-1');
  const lastPos = parseFloat(localStorage.getItem('np_pos') ?? '0');
  let trackLoaded = false;

  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && EXTS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      entry._folder = handle.name;
      files.push(entry);
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  renderPlaylist();

  if (!trackLoaded && lastIdx >= 0 && lastIdx < files.length) {
    trackLoaded = true;
    await loadTrack(lastIdx, false);
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = lastPos; }, { once: true });
  }

  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') {
      const sub = await scanDir(entry, entry.name);
      files.push(...sub);
      files.sort((a, b) => {
        const fa = a._folder.localeCompare(b._folder);
        return fa !== 0 ? fa : a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      renderPlaylist();
      if (shuffle) buildShuffleOrder();
      if (!trackLoaded && lastIdx >= 0 && lastIdx < files.length) {
        trackLoaded = true;
        await loadTrack(lastIdx, false);
        audio.addEventListener('loadedmetadata', () => { audio.currentTime = lastPos; }, { once: true });
      }
    }
  }

  if (!files.length) {
    emptyState.style.display = 'flex';
    playlist.style.display   = 'none';
  }
}

async function loadTrack(idx, autoplay = true) {
  currentIdx = idx;
  const entry = files[idx];
  let url;
  if (entry._native) {
    const { Folder } = window.Capacitor.Plugins;
    const { data, mimeType } = await Folder.readFileAsBase64({ uri: entry.uri });
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mimeType || 'audio/mpeg' });
    url = URL.createObjectURL(blob);
  } else {
    const file = await entry.getFile();
    url = URL.createObjectURL(file);
  }
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = url;
  audio.load();
  document.title = `${entry.name.replace(/\.[^.]+$/, '')} — Nando Player`;
  highlightPlaylistItem(idx);
  localStorage.setItem(entry._native ? 'np_native_idx' : 'np_idx', idx);
  if (autoplay) audio.play();
}

function togglePlay() {
  if (!files.length) return;
  if (currentIdx === -1) { loadTrack(0); return; }
  audio.paused ? audio.play() : audio.pause();
}

function playNext() {
  if (!files.length) return;
  const idx = nextIdx();
  if (idx !== -1) loadTrack(idx);
}

function playPrev() {
  if (!files.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const idx = prevIdx();
  if (idx !== -1) loadTrack(idx);
}

function onEnded() {
  if (repeat === 'one') { audio.play(); return; }
  const idx = nextIdx();
  if (idx !== -1) loadTrack(idx);
}

function nextIdx() {
  if (shuffle) {
    const pos = shuffleOrder.indexOf(currentIdx);
    if (pos < shuffleOrder.length - 1) return shuffleOrder[pos + 1];
    return repeat === 'all' ? shuffleOrder[0] : -1;
  }
  if (currentIdx < files.length - 1) return currentIdx + 1;
  return repeat === 'all' ? 0 : -1;
}

function prevIdx() {
  if (shuffle) {
    const pos = shuffleOrder.indexOf(currentIdx);
    return pos > 0 ? shuffleOrder[pos - 1] : shuffleOrder[shuffleOrder.length - 1];
  }
  return currentIdx > 0 ? currentIdx - 1 : files.length - 1;
}

function buildShuffleOrder() {
  shuffleOrder = [...Array(files.length).keys()].sort(() => Math.random() - 0.5);
}

// ─── UI ───────────────────────────────────────────────────────
function onTimeUpdate() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  setProgressPct(pct);
  timeCurrent.textContent = fmt(audio.currentTime);
  timeTotal.textContent   = fmt(audio.duration);
  localStorage.setItem('np_pos', audio.currentTime);
}

function setProgressPct(pct) {
  progressBar.value = pct;
  progressBar.style.setProperty('--pct', pct + '%');
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function renderPlaylist() {
  playlist.innerHTML = '';
  let lastFolder = null;
  files.forEach((f, i) => {
    if (f._folder !== lastFolder) {
      lastFolder = f._folder;
      const sep = document.createElement('li');
      sep.className = 'folder-sep';
      sep.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg> ${f._folder}`;
      playlist.appendChild(sep);
    }
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="num">${i + 1}</span>
      <span class="name">${f.name.replace(/\.[^.]+$/, '')}</span>
      <span class="eq"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>`;
    li.addEventListener('click', () => loadTrack(i));
    if (i === currentIdx) li.classList.add('active');
    playlist.appendChild(li);
  });
}

function filterPlaylist(q) {
  const term = q.toLowerCase();
  let lastSep = null, visibleUnderSep = false;
  playlist.querySelectorAll('li').forEach(li => {
    if (li.classList.contains('folder-sep')) {
      if (lastSep) lastSep.style.display = visibleUnderSep ? '' : 'none';
      lastSep = li; visibleUnderSep = false;
      return;
    }
    const show = !term || li.querySelector('.name').textContent.toLowerCase().includes(term);
    li.style.display = show ? '' : 'none';
    if (show) visibleUnderSep = true;
  });
  if (lastSep) lastSep.style.display = visibleUnderSep ? '' : 'none';
}

function highlightPlaylistItem(idx) {
  let k = -1;
  [...playlist.children].forEach(li => {
    if (li.classList.contains('folder-sep')) return;
    k++;
    li.classList.toggle('active', k === idx);
  });
  [...playlist.children].filter(li => !li.classList.contains('folder-sep'))[idx]
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ─── INDEXEDDB ────────────────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}

function saveDir(handle) {
  openDB().then(db => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, 'last');
  });
}

async function getDir(db) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get('last');
    req.onsuccess = e => res(e.target.result);
    req.onerror   = rej;
  });
}
