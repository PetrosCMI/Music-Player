/* Audio Player 1.0.0
 * Vanilla JS, no build step. IndexedDB persistence + native <audio> playback.
 * Playback speed uses the element's playbackRate (pitch shifts with speed —
 * standard web-player behavior; see note in README). Pitch-preserving DSP is
 * provided separately in worklet.js for reference/testing.
 */

const DB_NAME = 'audio-player-db';
const STORE = 'tracks';
const META_KEY = '__meta'; // { currentTrackIndex, currentTime }

// ---- State ----
const state = {
  tracks: [], // [{ id, name, blob }]
  currentIndex: -1,
  currentTime: 0,
  loopMode: 'none', // 'none' | 'one' | 'all'
  speed: 1.0,
  sleepTimerMinutes: 0, // 0 = off; else minutes remaining when set
  sleepTimerExpiresAt: null, // epoch ms, or null when off
};

// ---- DOM refs ----
const el = {};
function cacheDom() {
  el.trackTitle = document.getElementById('trackTitle');
  el.trackIndex = document.getElementById('trackIndex');
  el.trackArt = document.getElementById('trackArt');
  el.seekSlider = document.getElementById('seekSlider');
  el.currentTimeEl = document.getElementById('currentTime');
  el.durationEl = document.getElementById('duration');
  el.playPauseBtn = document.getElementById('playPauseBtn');
  el.playIcon = document.getElementById('playIcon');
  el.pauseIcon = document.getElementById('pauseIcon');
  el.skipFrontBtn = document.getElementById('skipFrontBtn');
  el.skipBackBtn = document.getElementById('skipBackBtn');
  el.nextBtn = document.getElementById('nextBtn');
  el.prevBtn = document.getElementById('prevBtn');
  el.loopBtn = document.getElementById('loopBtn');
  el.loopIcon = document.getElementById('loopIcon');
  el.repeatBtn = document.getElementById('repeatBtn');
  el.speedSlider = document.getElementById('speedSlider');
  el.speedValue = document.getElementById('speedValue');
  el.speedUpBtn = document.getElementById('speedUpBtn');
  el.speedDownBtn = document.getElementById('speedDownBtn');
  el.addBtn = document.getElementById('addBtn');
  el.clearBtn = document.getElementById('clearBtn');
  el.sleepBtn = document.getElementById('sleepBtn');
  el.sleepLabel = document.getElementById('sleepLabel');
  el.fileInput = document.getElementById('fileInput');
  el.playlist = document.getElementById('playlist');
  el.trackCount = document.getElementById('trackCount');
  el.emptyState = document.getElementById('emptyState');
}

// ---- IndexedDB ----
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = openDB().then(db => db.transaction(STORE, 'readwrite'));
    tx.then(tx => {
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = openDB().then(db => db.transaction(STORE, 'readonly'));
    tx.then(tx => {
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  });
}

async function dbClear() {
  const tx = await openDB().then(db => db.transaction(STORE, 'readwrite'));
  return new Promise((resolve, reject) => {
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Persistence ----
async function saveState() {
  await dbPut('tracks', state.tracks);
  await dbPut(META_KEY, {
    currentTrackIndex: state.currentIndex,
    currentTime: state.currentTime,
    loopMode: state.loopMode,
    speed: state.speed,
    sleepTimerMinutes: state.sleepTimerMinutes,
    sleepTimerExpiresAt: state.sleepTimerExpiresAt,
  });
}

async function loadState() {
  const tracks = await dbGet('tracks');
  const meta = await dbGet(META_KEY);
  if (tracks && tracks.length) state.tracks = tracks;
  if (meta) {
    if (typeof meta.currentTrackIndex === 'number') {
      state.currentIndex = meta.currentTrackIndex;
      state.currentTime = meta.currentTime || 0;
    }
    if (meta.loopMode) state.loopMode = meta.loopMode;
    if (typeof meta.speed === 'number') state.speed = meta.speed;
    if (typeof meta.sleepTimerMinutes === 'number') {
      state.sleepTimerMinutes = meta.sleepTimerMinutes;
      state.sleepTimerExpiresAt = meta.sleepTimerExpiresAt || null;
    }
  }
}

// ---- Playback engine ----
let audioElement = null;

function ensureAudio() {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.crossOrigin = 'anonymous';
    audioElement.preload = 'auto';
    // Attach the persistent media-element listeners once (audioElement is null
    // at init time, so this must happen here, not in wireEvents()).
    if (!ensureAudio._wired) {
      audioElement.addEventListener('timeupdate', onTimeUpdate);
      audioElement.addEventListener('play', () => setPlayIcon(false));
      audioElement.addEventListener('pause', () => setPlayIcon(true));
      audioElement.addEventListener('ended', () => {});
      audioElement.addEventListener('loadedmetadata', () => { audioElement.durationIsKnown = true; });
      ensureAudio._wired = true;
    }
  }
  return audioElement;
}

function applySpeed(speed) {
  state.speed = Math.min(4, Math.max(0.25, +speed.toFixed(2)));
  if (audioElement) audioElement.playbackRate = state.speed;
  el.speedValue.textContent = state.speed.toFixed(1) + 'x';
  el.speedSlider.value = state.speed;
}

// ---- Track loading ----
async function loadTrack(index, resumeFromStart = true) {
  ensureAudio();
  if (index < 0 || index >= state.tracks.length) return;
  state.currentIndex = index;
  const track = state.tracks[index];
  if (audioElement._blobUrl) URL.revokeObjectURL(audioElement._blobUrl);
  audioElement._blobUrl = URL.createObjectURL(track.blob);
  audioElement.src = audioElement._blobUrl;
  audioElement.playbackRate = state.speed;

  if (!resumeFromStart && state.currentTime > 0.5 && audioElement.durationIsKnown) {
    const restore = () => {
      audioElement.currentTime = Math.min(state.currentTime, (audioElement.duration || 1e9));
      audioElement.removeEventListener('loadedmetadata', restore);
    };
    audioElement.addEventListener('loadedmetadata', restore, { once: true });
  } else {
    audioElement.currentTime = 0;
  }

  updateNowPlaying();
  renderPlaylist();
  saveState();

  // Resume any paused playback
  if (!audioElement.paused) {
    await audioElement.play().catch(e => console.warn('play failed', e));
  } else {
    setPlayIcon(true);
  }
}

function togglePlayPause() {
  ensureAudio();
  if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
  if (!audioElement) return;
  if (audioElement.paused) {
    audioElement.play().catch(e => console.warn('play failed', e));
  } else {
    audioElement.pause();
  }
}

function skipForward() {
  if (!audioElement || !audioElement.duration) return;
  audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + 60);
}

function skipBackward() {
  if (!audioElement) return;
  audioElement.currentTime = Math.max(0, audioElement.currentTime - 60);
}

function nextTrack() {
  if (!state.tracks.length) return;
  let idx = state.currentIndex + 1;
  const atEnd = idx >= state.tracks.length;
  if (atEnd) idx = state.loopMode === 'all' ? 0 : state.currentIndex;
  loadTrack(idx);
  // Only resume playback when actually advancing. In 'none' mode at the end,
  // idx === currentIndex (same track), so leave it paused instead of looping forever.
  if (state.loopMode !== 'none' || !atEnd) {
    audioElement.play().catch(() => {});
  }
}

function prevTrack() {
  if (!state.tracks.length) return;
  if (audioElement && audioElement.currentTime > 3) { audioElement.currentTime = 0; return; }
  let idx = state.currentIndex - 1;
  if (idx < 0) idx = state.loopMode === 'all' ? state.tracks.length - 1 : 0;
  loadTrack(idx);
}

// ---- Sleep timer ----
const SLEEP_OPTIONS = [0, 15, 30, 45, 60]; // minutes; 0 = off
function setSleepTimer() {
  const i = SLEEP_OPTIONS.indexOf(state.sleepTimerMinutes);
  state.sleepTimerMinutes = SLEEP_OPTIONS[(i + 1) % SLEEP_OPTIONS.length];
  if (state.sleepTimerMinutes > 0) {
    state.sleepTimerExpiresAt = Date.now() + state.sleepTimerMinutes * 60000;
  } else {
    state.sleepTimerExpiresAt = null;
  }
  renderSleepTimer();
  saveState();
}

function renderSleepTimer() {
  const active = state.sleepTimerMinutes > 0;
  el.sleepBtn.classList.toggle('active', active);
  el.sleepBtn.title = `Sleep timer: ${state.sleepTimerMinutes ? `${state.sleepTimerMinutes} min` : 'off'}`;
  el.sleepLabel.textContent = state.sleepTimerMinutes ? `${state.sleepTimerMinutes}m` : '';
}

function checkSleepTimer() {
  if (!state.sleepTimerExpiresAt) return;
  const remaining = Math.ceil((state.sleepTimerExpiresAt - Date.now()) / 1000);
  if (remaining <= 0) {
    // Timer expired — pause playback.
    state.sleepTimerMinutes = 0;
    state.sleepTimerExpiresAt = null;
    renderSleepTimer();
    saveState();
    if (audioElement && !audioElement.paused) {
      audioElement.pause();
    }
    setPlayIcon(true);
  } else if (remaining <= 10) {
    // Live countdown in the label for the final 10 seconds.
    const s = remaining;
    el.sleepLabel.textContent = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }
}
function setLoopMode() {
  const modes = ['none', 'one', 'all'];
  const i = modes.indexOf(state.loopMode);
  state.loopMode = modes[(i + 1) % modes.length];

  // Circular arrow icon with a colored disc background + center label.
  // OFF    -> green disc, '0'
  // Repeat 1 -> green disc, '1'
  // Repeat N -> green disc, 'N'
  const loopPath = '<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>';
  const label = state.loopMode === 'none' ? '0' : (state.loopMode === 'one' ? '1' : 'N');
  el.loopIcon.innerHTML = `<rect x="0" y="0" width="24" height="24" rx="12" fill="var(--accent)"/><path fill="#ffffff" d="${loopPath}"/><text x="12" y="17" font-size="24" text-anchor="middle" fill="#ffffff" font-weight="bold">${label}</text>`;
  el.loopBtn.classList.toggle('active', state.loopMode !== 'none');
  el.loopBtn.title = `Loop: ${state.loopMode}`;
}

// ---- Rendering ----
function updateNowPlaying() {
  if (state.currentIndex < 0) {
    el.trackTitle.textContent = 'No track loaded';
    el.trackIndex.textContent = '';
    el.trackArt.classList.remove('playing');
    return;
  }
  const track = state.tracks[state.currentIndex];
  el.trackTitle.textContent = track.name;
  el.trackIndex.textContent = `Track ${state.currentIndex + 1} of ${state.tracks.length}`;
}

function renderPlaylist() {
  el.trackCount.textContent = state.tracks.length;
  el.emptyState.style.display = state.tracks.length ? 'none' : 'block';
  if (!state.tracks.length) { el.playlist.innerHTML = ''; return; }
  el.playlist.innerHTML = state.tracks.map((t, i) => `
    <li class="playlist-item ${i === state.currentIndex ? 'active' : ''}" data-index="${i}">
      <span class="num">${i === state.currentIndex && audioElement && !audioElement.paused ? '♪' : (i + 1)}</span>
      <span class="title">${escapeHtml(t.name)}</span>
    </li>`).join('');
  el.playlist.querySelectorAll('.playlist-item').forEach(li => {
    li.addEventListener('click', () => loadTrack(parseInt(li.dataset.index, 10)));
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setPlayIcon(paused) {
  el.playIcon.classList.toggle('hidden', !paused);
  el.pauseIcon.classList.toggle('hidden', paused);
  if (state.currentIndex >= 0) el.trackArt.classList.toggle('playing', !paused);
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- Progress sync ----
let lastSave = -1e9;
function onTimeUpdate() {
  if (!audioElement) return;
  const dur = audioElement.duration || 1;
  const cur = audioElement.currentTime;
  el.currentTimeEl.textContent = formatTime(cur);
  el.durationEl.textContent = formatTime(dur);
  el.seekSlider.value = ((cur / dur) * 100).toFixed(1);

  if (cur >= dur - 0.3) {
    if (state.loopMode === 'one') { audioElement.currentTime = 0; audioElement.play().catch(() => {}); }
    else nextTrack();
    return;
  }
  if (cur - lastSave > 5) {
    lastSave = cur;
    state.currentTime = cur;
    saveState();
  }
  checkSleepTimer();
}

// ---- MediaSession (headset controls) ----
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Audio Player 1.0.0' });
    navigator.mediaSession.setActionHandler('playpause', togglePlayPause);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('prevtrack', prevTrack);
    navigator.mediaSession.setActionHandler('skipforward', skipForward);
    navigator.mediaSession.setActionHandler('skipbackward', () => { if (audioElement) audioElement.currentTime = Math.max(0, audioElement.currentTime - 10); });
  } catch (e) { console.warn('MediaSession setup failed', e); }
}

// ---- Event wiring ----
function wireEvents() {
  el.playPauseBtn.addEventListener('click', togglePlayPause);
  el.skipFrontBtn.addEventListener('click', skipForward);
  el.skipBackBtn.addEventListener('click', skipBackward);
  el.nextBtn.addEventListener('click', nextTrack);
  el.prevBtn.addEventListener('click', prevTrack);
  el.loopBtn.addEventListener('click', setLoopMode);

  el.speedSlider.addEventListener('input', () => { applySpeed(parseFloat(el.speedSlider.value)); saveState(); });
  el.speedUpBtn.addEventListener('click', () => applySpeed(state.speed + 0.1));
  el.speedDownBtn.addEventListener('click', () => applySpeed(state.speed - 0.1));

  el.seekSlider.addEventListener('input', () => {
    if (!audioElement || !audioElement.duration) return;
    const t = (el.seekSlider.value / 100) * audioElement.duration;
    audioElement.currentTime = t;
    state.currentTime = t;
  });
  el.seekSlider.addEventListener('change', () => saveState());

  el.addBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', e => addFiles(e.target.files));
  el.clearBtn.addEventListener('click', async () => {
    if (!state.tracks.length) return;
    if (!confirm('Clear the entire playlist?')) return;
    await dbClear();
    state.tracks = [];
    state.currentIndex = -1;
    state.currentTime = 0;
    lastSave = -1e9;
    if (audioElement) { audioElement.pause(); audioElement.src = ''; }
    renderPlaylist(); updateNowPlaying(); setPlayIcon(true);
    saveState();
  });

  el.sleepBtn.addEventListener('click', setSleepTimer);

  document.addEventListener('keydown', e => {
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlayPause(); break;
      case 'ArrowRight': skipForward(); break;
      case 'ArrowLeft': skipBackward(); break;
      case 'ArrowUp': applySpeed(state.speed + 0.1); break;
      case 'ArrowDown': applySpeed(state.speed - 0.1); break;
    }
  });
}

// ---- Add files ----
async function addFiles(fileList) {
  ensureAudio();
  const added = [];
  for (const file of fileList) {
    if (!file.type.startsWith('audio/')) continue;
    added.push({ id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2), name: file.name, blob: file });
  }
  if (!added.length) return;
  state.tracks.push(...added);
  await dbPut('tracks', state.tracks);
  if (state.currentIndex < 0) {
    loadTrack(0, false);
  } else {
    renderPlaylist();
    saveState();
  }
}

// ---- Init ----
async function init() {
  cacheDom();
  wireEvents();
  setupMediaSession();
  await loadState();
  applySpeed(state.speed || 1.0);
  if (state.loopMode) setLoopMode();
  renderSleepTimer();
  renderPlaylist();
  updateNowPlaying();
  if (state.currentIndex >= 0 && state.tracks.length) {
    loadTrack(state.currentIndex, false);
  } else if (state.tracks.length) {
    loadTrack(0, false);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
