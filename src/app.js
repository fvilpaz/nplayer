'use strict';

const EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
const DB_NAME = 'nplayer';
const DB_STORE = 'dir';

// --- State ---
let files = [];
let currentIdx = -1;
let shuffle = false;
let repeat = 'none'; // none | one | all
let shuffleOrder = [];
let audio = new Audio();
let dirHandle = null;
let savedVolume = parseFloat(localStorage.getItem('np_vol') ?? '0.8');

// --- DOM ---
const btnOpen     = document.getElementById('btn-open');
const btnPlay     = document.getElementById('btn-play');
const btnPrev     = document.getElementById('btn-prev');
const btnNext     = document.getElementById('btn-next');
const btnShuffle  = document.getElementById('btn-shuffle');
const btnRepeat   = document.getElementById('btn-repeat');
const progressBar = document.getElementById('progress-bar');
const volumeBar   = document.getElementById('volume-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');
const trackTitle  = document.getElementById('track-title');
const trackIndex  = document.getElementById('track-index');
const trackArt    = document.getElementById('track-art');
const bgBlur      = document.getElementById('bg-blur');
const iconPlay    = document.getElementById('icon-play');
const iconPause   = document.getElementById('icon-pause');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const playlist    = document.getElementById('playlist');
const emptyState  = document.getElementById('empty');

// --- Init ---
audio.volume = savedVolume;
setVolumePct(savedVolume * 100);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') window.location.reload();
  });
}

// Restore last directory from IndexedDB
openDB().then(db => getDir(db)).then(async handle => {
  if (!handle) return;
  // En Android el permiso expira al cerrar — pedirlo de nuevo sin reseleccionar carpeta
  let perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' });
  if (perm === 'granted') loadDirectory(handle);
}).catch(() => {});

// --- Events ---
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

volumeBar.addEventListener('input', () => {
  const vol = volumeBar.value / 100;
  audio.volume = vol;
  localStorage.setItem('np_vol', vol);
  setVolumePct(volumeBar.value);
});

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
  files = await scanDir(handle);
  files.sort((a, b) => {
    const fa = a._folder.localeCompare(b._folder);
    if (fa !== 0) return fa;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  if (shuffle) buildShuffleOrder();
  renderPlaylist();
  emptyState.style.display = files.length ? 'none' : 'flex';
  playlist.style.display = files.length ? 'block' : 'none';

  const lastIdx = parseInt(localStorage.getItem('np_idx') ?? '-1');
  const lastPos = parseFloat(localStorage.getItem('np_pos') ?? '0');
  if (lastIdx >= 0 && lastIdx < files.length) {
    await loadTrack(lastIdx, false);
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = lastPos;
    }, { once: true });
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
  trackTitle.textContent = name;
  trackIndex.textContent = `${idx + 1} / ${files.length}`;
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
