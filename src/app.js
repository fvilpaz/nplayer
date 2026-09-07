'use strict';

const EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
const DB_NAME = 'nplayer';
const DB_STORE = 'dir';

// --- State ---
let files = [];
let currentIdx = -1;
let savedHandle = null;
let shuffle = false;
let repeat = 'none'; // none | one | all
let shuffleOrder = [];
let audio = new Audio();
let dirHandle = null;
let savedVolume = parseFloat(localStorage.getItem('np_vol') ?? '0.8');

// --- DOM ---
const btnOpen     = document.getElementById('btn-open');
const btnTheme    = document.getElementById('btn-theme');
const iconMoon    = document.getElementById('icon-moon');
const iconSun     = document.getElementById('icon-sun');
const btnPlay     = document.getElementById('btn-play');
const btnPrev     = document.getElementById('btn-prev');
const btnNext     = document.getElementById('btn-next');
const btnShuffle  = document.getElementById('btn-shuffle');
const btnRepeat   = document.getElementById('btn-repeat');
const progressBar = document.getElementById('progress-bar');
const volumeBar   = document.getElementById('volume-bar'); // null si está comentado en HTML
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');
// const trackTitle  = document.getElementById('track-title');
// const trackIndex  = document.getElementById('track-index');
const trackArt    = document.getElementById('track-art');
const artInput    = document.getElementById('art-input');
const bgBlur      = document.getElementById('bg-blur');
const iconPlay    = document.getElementById('icon-play');
const iconPause   = document.getElementById('icon-pause');
const searchInput  = document.getElementById('search-input');
const searchClear  = document.getElementById('search-clear');
const playlist     = document.getElementById('playlist');
const emptyState   = document.getElementById('empty');
const btnReconnect = document.getElementById('btn-reconnect');
const emptyMsg     = document.getElementById('empty-msg');

// --- Init ---
audio.volume = savedVolume;
audio.volume = savedVolume;

// Visualizer
const canvas = document.getElementById('visualizer');
const ctx2d = canvas.getContext('2d');
let audioCtx, analyser, source, vizMode = -1, vizRAF;
// -1 = foto, 0 = barras, 1 = onda, 2 = círculo radial, 3 = partículas
const VIZ_MODES = 4;
let particles = [];

function initAudioCtx() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
}

function drawBars(data, W, H) {
  ctx2d.fillStyle = '#0f1015';
  ctx2d.fillRect(0, 0, W, H);
  const bw = W / data.length;
  data.forEach((v, i) => {
    const h = Math.max(3, (v / 255) * H);
    const hue = 190 + (i / data.length) * 60;
    ctx2d.fillStyle = `hsla(${hue}, 85%, 55%, ${0.7 + (v/255)*0.3})`;
    ctx2d.beginPath();
    ctx2d.roundRect(i * bw + 1, H - h, bw - 2, h, 2);
    ctx2d.fill();
  });
}

function drawWave(W, H) {
  const td = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(td);
  ctx2d.fillStyle = '#0f1015';
  ctx2d.fillRect(0, 0, W, H);
  ctx2d.lineWidth = 2.5;
  ctx2d.strokeStyle = '#1793d1';
  ctx2d.shadowBlur = 10;
  ctx2d.shadowColor = '#1793d1';
  ctx2d.beginPath();
  td.forEach((v, i) => {
    const x = (i / td.length) * W;
    const y = (v / 128) * (H / 2);
    i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
  });
  ctx2d.stroke();
  ctx2d.shadowBlur = 0;
}

function drawRadial(data, W, H) {
  ctx2d.fillStyle = '#0f1015';
  ctx2d.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) * 0.25;
  data.forEach((v, i) => {
    const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const len = (v / 255) * r;
    const hue = 190 + (i / data.length) * 120;
    ctx2d.strokeStyle = `hsl(${hue}, 85%, 55%)`;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx2d.lineTo(cx + Math.cos(angle) * (r + len), cy + Math.sin(angle) * (r + len));
    ctx2d.stroke();
  });
  // círculo central
  ctx2d.strokeStyle = 'rgba(23,147,209,0.4)';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.stroke();
}

function drawParticles(data, W, H) {
  ctx2d.fillStyle = 'rgba(15,16,21,0.2)';
  ctx2d.fillRect(0, 0, W, H);
  const bass = data.slice(0, 4).reduce((a, b) => a + b, 0) / 4 / 255;
  if (bass > 0.4 && particles.length < 80) {
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.3,
        y: H / 2 + (Math.random() - 0.5) * H * 0.3,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        hue: 190 + Math.random() * 60,
        size: 2 + Math.random() * 4
      });
    }
  }
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.life -= 0.02;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx2d.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.life})`;
    ctx2d.fill();
  });
}

function drawViz() {
  const W = canvas.width, H = canvas.height;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  if (vizMode === 0) drawBars(data, W, H);
  else if (vizMode === 1) drawWave(W, H);
  else if (vizMode === 2) drawRadial(data, W, H);
  else if (vizMode === 3) drawParticles(data, W, H);
  vizRAF = requestAnimationFrame(drawViz);
}

function resizeCanvas() {
  const size = trackArt.getBoundingClientRect();
  canvas.width = size.width || 200;
  canvas.height = size.height || 200;
}

function toggleViz() {
  cancelAnimationFrame(vizRAF);
  vizMode = (vizMode + 1) % (VIZ_MODES + 1); // +1 para incluir el -1 (foto)
  if (vizMode === VIZ_MODES) vizMode = -1; // vuelve a foto

  if (vizMode === -1) {
    canvas.style.display = 'none';
    trackArt.style.display = 'block';
  } else {
    initAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    resizeCanvas();
    canvas.style.display = 'block';
    trackArt.style.display = 'none';
    particles = [];
    drawViz();
  }
}

// Si gira la pantalla y el visualizador está activo, reajustar canvas
window.addEventListener('resize', () => {
  if (!vizActive) return;
  const size = trackArt.getBoundingClientRect();
  canvas.width = size.width;
  canvas.height = size.height;
});


document.getElementById('art-wrap').addEventListener('click', (e) => {
  if (e.target.closest('#art-overlay')) return; // deja pasar al botón cámara
  toggleViz();
});

// Custom art
const savedArt = localStorage.getItem('np_art');
if (savedArt) trackArt.src = savedArt;

document.getElementById('art-overlay').addEventListener('click', (e) => {
  e.stopPropagation();
  artInput.click();
});
artInput.addEventListener('change', () => {
  const file = artInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    trackArt.src = e.target.result;
    localStorage.setItem('np_art', e.target.result);
    bgBlur.style.backgroundImage = `url('${e.target.result}')`;
  };
  reader.readAsDataURL(file);
});

// Theme
const savedTheme = localStorage.getItem('np_theme') || 'dark';
if (savedTheme === 'light') applyLight();

btnTheme.addEventListener('click', () => {
  if (document.body.classList.contains('light')) {
    document.body.classList.remove('light');
    iconMoon.style.display = 'block';
    iconSun.style.display = 'none';
    localStorage.setItem('np_theme', 'dark');
  } else {
    applyLight();
    localStorage.setItem('np_theme', 'light');
  }
});

function applyLight() {
  document.body.classList.add('light');
  iconMoon.style.display = 'none';
  iconSun.style.display = 'block';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') window.location.reload();
  });
}

// Restore last directory from IndexedDB
openDB().then(db => getDir(db)).then(async handle => {
  if (!handle) return;
  const perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'granted') {
    loadDirectory(handle);
  } else {
    // Permiso expirado — mostrar botón de reconexión (requiere gesto del usuario)
    savedHandle = handle;
    emptyMsg.textContent = 'Carpeta guardada, pulsa para reconectar';
    btnReconnect.style.display = 'block';
  }
}).catch(() => {});

// --- Events ---
btnReconnect.addEventListener('click', async () => {
  if (!savedHandle) return;
  const perm = await savedHandle.requestPermission({ mode: 'read' });
  if (perm === 'granted') {
    btnReconnect.style.display = 'none';
    loadDirectory(savedHandle);
  }
});

btnOpen.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    saveDir(handle);
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
  iconPlay.style.display = 'none';
  iconPause.style.display = 'block';
  trackArt.classList.add('playing');
  playlist.querySelector('li.active')?.classList.remove('paused');
});
audio.addEventListener('pause', () => {
  iconPlay.style.display = 'block';
  iconPause.style.display = 'none';
  trackArt.classList.remove('playing');
  playlist.querySelector('li.active')?.classList.add('paused');
});

// Guardar posición cuando la app pasa a segundo plano (fiable en Android)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentIdx >= 0) {
    localStorage.setItem('np_idx', currentIdx);
    localStorage.setItem('np_pos', audio.currentTime);
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

if (volumeBar) {
  volumeBar.addEventListener('input', () => {
    const vol = volumeBar.value / 100;
    audio.volume = vol;
    localStorage.setItem('np_vol', vol);
    setVolumePct(volumeBar.value);
  });
}

// --- Core ---
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
  playlist.style.display = 'block';
  playlist.innerHTML = '<li style="color:var(--text-dim);padding:12px;font-size:0.85rem">Cargando música...</li>';

  const lastIdx = parseInt(localStorage.getItem('np_idx') ?? '-1');
  const lastPos = parseFloat(localStorage.getItem('np_pos') ?? '0');
  let trackLoaded = false;

  // Escanear carpeta raíz primero para mostrar algo rápido
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && EXTS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      entry._folder = handle.name;
      files.push(entry);
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  renderPlaylist();

  // Cargar última canción en cuanto tengamos algo
  if (!trackLoaded && lastIdx >= 0 && lastIdx < files.length) {
    trackLoaded = true;
    await loadTrack(lastIdx, false);
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = lastPos; }, { once: true });
  }

  // Luego escanear subcarpetas en segundo plano
  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') {
      const sub = await scanDir(entry, entry.name);
      files.push(...sub);
      files.sort((a, b) => {
        const fa = a._folder.localeCompare(b._folder);
        if (fa !== 0) return fa;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
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

  if (!trackLoaded && lastIdx < 0) {
    emptyState.style.display = files.length ? 'none' : 'flex';
    if (!files.length) playlist.style.display = 'none';
  }
}

async function loadTrack(idx, autoplay = true) {
  currentIdx = idx;
  const entry = files[idx];
  const file = await entry.getFile();
  const url = URL.createObjectURL(file);

  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = url;
  audio.load();

  const name = entry.name.replace(/\.[^.]+$/, '');
  // trackTitle.textContent = name;
  // trackIndex.textContent = `${idx + 1} / ${files.length}`;
  document.title = `${name} — Nando Player`;

  highlightPlaylistItem(idx);
  localStorage.setItem('np_idx', idx);

  if (autoplay) audio.play();
}

function togglePlay() {
  if (files.length === 0) return;
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
  else if (repeat === 'none') { btnPlay.textContent = '▶'; }
}

function nextIdx() {
  if (shuffle) {
    const pos = shuffleOrder.indexOf(currentIdx);
    if (pos < shuffleOrder.length - 1) return shuffleOrder[pos + 1];
    if (repeat === 'all') return shuffleOrder[0];
    return -1;
  }
  if (currentIdx < files.length - 1) return currentIdx + 1;
  if (repeat === 'all') return 0;
  return -1;
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

// --- UI updates ---
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

function setVolumePct(pct) {
  if (!volumeBar) return;
  volumeBar.value = pct;
  volumeBar.style.setProperty('--pct', pct + '%');
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
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
      <span class="eq">
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
      </span>`;
    li.addEventListener('click', () => loadTrack(i));
    if (i === currentIdx) li.classList.add('active');
    playlist.appendChild(li);
  });
}

function filterPlaylist(q) {
  const term = q.toLowerCase();
  let lastSep = null;
  let visibleUnderSep = false;

  playlist.querySelectorAll('li').forEach(li => {
    if (li.classList.contains('folder-sep')) {
      if (lastSep) lastSep.style.display = visibleUnderSep ? '' : 'none';
      lastSep = li;
      visibleUnderSep = false;
      return;
    }
    const name = li.querySelector('.name').textContent.toLowerCase();
    const show = !term || name.includes(term);
    li.style.display = show ? '' : 'none';
    if (show) visibleUnderSep = true;
  });

  if (lastSep) lastSep.style.display = visibleUnderSep ? '' : 'none';
}

function highlightPlaylistItem(idx) {
  playlist.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('active', i === idx);
  });
  const active = playlist.children[idx];
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// --- IndexedDB para persistir el directorio ---
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
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get('last');
    req.onsuccess = e => res(e.target.result);
    req.onerror   = rej;
  });
}
