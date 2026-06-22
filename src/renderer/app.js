// ===================== STATE =====================
const state = {
  audioCtx: null,
  audioBuffer: null,
  audioSource: null,
  isPlaying: false,
  currentTime: 0,
  startedAt: 0,
  pausedAt: 0,
  zoom: 1,
  viewStart: 0,
  selectionStart: null,
  selectionEnd: null,
  isDragging: false,
  dragStartX: 0,
  isPanning: false,
  panStartX: 0,
  viewStartAtPan: 0,
  currentTool: 'select',
  history: [],
  markers: [],
  analyser: null,
  animFrame: null,
  spectrumFrame: null,
  gainNode: null,
  fileName: null,
  filePath: null,
  isDirty: false,
};

const nativeApi = window.waveEdit || null;

// ===================== AUDIO CONTEXT =====================
function getAudioCtx() {
  if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return state.audioCtx;
}

// ===================== DIRTY STATE =====================
function markDirty(dirty) {
  state.isDirty = dirty;
  if (nativeApi) nativeApi.setDirty(dirty);
}

// ===================== FILE LOADING =====================
async function openFile() {
  if (!nativeApi) { notify('Unavailable', 'Native file dialog is only available in the desktop app.'); return; }
  const result = await nativeApi.openFileDialog();
  if (result.canceled) return;
  await loadFromData(result.data, result.filePath, result.filePath);
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('waveformPanel').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(file.name))) {
    file.arrayBuffer().then((buf) => loadFromData(buf, file.name, null));
  } else {
    notify('Invalid file', 'Please drop an audio file (MP3, WAV, OGG, etc.)');
  }
}

function baseName(p) {
  if (!p) return 'audio';
  return p.split(/[\\/]/).pop();
}

async function loadFromData(arrayBuffer, displayPath, filePath) {
  const name = baseName(displayPath);
  setStatus('loading', 'Loading ' + name + '…');
  state.fileName = name;
  state.filePath = filePath || null;
  document.getElementById('fileNameLabel').textContent = filePath || name;

  const ctx = getAudioCtx();
  try {
    state.audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    state.currentTime = 0; state.pausedAt = 0;
    state.selectionStart = null; state.selectionEnd = null;
    state.history = [];
    state.zoom = 1; state.viewStart = 0;
    markDirty(false);

    const dur = state.audioBuffer.duration;
    document.getElementById('metaDuration').textContent = formatTime(dur);
    document.getElementById('metaSampleRate').textContent = ctx.sampleRate + ' Hz';
    document.getElementById('metaChannels').textContent = state.audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo';
    document.getElementById('metaBitDepth').textContent = '32-bit float';
    document.getElementById('trackInfo').style.display = '';
    document.getElementById('totalTime').textContent = formatTime(dur);

    drawWaveform();
    drawRuler();
    updateSelectionInfo();

    document.getElementById('dropPlaceholder').style.display = 'none';
    document.getElementById('waveformCanvas').style.display = 'block';
    document.getElementById('playhead').style.display = 'block';

    setStatus('ready', 'Loaded: ' + name + ' (' + formatTime(dur) + ')');
    notify('File loaded', name + ' — ' + formatTime(dur) + ' / ' + (state.audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'));
    document.getElementById('statusZoom').textContent = 'Zoom: 100%';
  } catch (err) {
    setStatus('error', 'Failed to decode file');
    notify('Error', 'Could not decode this audio file.');
  }
}

function newProject() {
  state.audioBuffer = null;
  state.audioSource = null;
  state.isPlaying = false;
  state.currentTime = 0; state.pausedAt = 0;
  state.selectionStart = null; state.selectionEnd = null;
  state.history = []; state.markers = [];
  state.zoom = 1; state.viewStart = 0;
  state.fileName = null; state.filePath = null;
  markDirty(false);
  document.getElementById('fileNameLabel').textContent = 'No file loaded';
  document.getElementById('trackInfo').style.display = 'none';
  document.getElementById('dropPlaceholder').style.display = '';
  document.getElementById('waveformCanvas').style.display = 'none';
  document.getElementById('playhead').style.display = 'none';
  document.getElementById('totalTime').textContent = '00:00.000';
  document.getElementById('currentTime').textContent = '00:00.000';
  showPlayIcon();
  updateSelectionOverlay(); updateSelectionInfo(); renderMarkers();
  setStatus('ready', 'Ready — open an audio file to begin');
}

// ===================== UTILS =====================
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0') + '.' + ms.toString().padStart(3, '0');
}

function setStatus(type, msg) {
  document.getElementById('statusText').textContent = msg;
  const dot = document.getElementById('statusDot');
  const colors = { loading: 'var(--color-warning)', playing: 'var(--color-primary)', ready: 'var(--color-success)', error: 'var(--color-error)' };
  dot.style.background = colors[type] || 'var(--color-text-faint)';
}

let notifTimer;
function notify(title, msg) {
  const el = document.getElementById('notif');
  document.getElementById('notifTitle').textContent = title;
  document.getElementById('notifMsg').textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ===================== THEME TOGGLE =====================
let currentTheme = 'dark';
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  const r = document.documentElement;
  r.setAttribute('data-theme', currentTheme);
  const t = document.querySelector('[data-theme-toggle]');
  if (t) {
    t.setAttribute('aria-label', 'Switch to ' + (currentTheme === 'dark' ? 'light' : 'dark') + ' mode');
    t.innerHTML = currentTheme === 'dark'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  }
  if (state.audioBuffer) { drawWaveform(); drawRuler(); }
}

// ===================== MENU ACTIONS =====================
async function handleMenuAction(action) {
  switch (action) {
    case 'new': newProject(); break;
    case 'open': openFile(); break;
    case 'save': saveFile(); break;
    case 'save-as': saveFileAs(); break;
    case 'export': openExportModal(); break;
    case 'undo': undoAction(); break;
    case 'select-all': selectAll(); break;
    case 'clear-selection': clearSelection(); break;
    case 'zoom-in': zoomIn(); break;
    case 'zoom-out': zoomOut(); break;
    case 'zoom-fit': zoomFit(); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'play': togglePlay(); break;
    case 'skip-back': skipBackward(); break;
    case 'skip-forward': skipForward(); break;
    case 'skip-start': skipToStart(); break;
    case 'skip-end': skipToEnd(); break;
    case 'save-then-close':
      await saveFile();
      if (nativeApi) nativeApi.readyToClose();
      break;
  }
}

// ===================== BOOT =====================
function boot() {
  const r = document.documentElement;
  r.setAttribute('data-theme', currentTheme);
  const themeBtn = document.querySelector('[data-theme-toggle]');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  if (nativeApi) nativeApi.onMenuAction(handleMenuAction);

  window.addEventListener('resize', () => {
    if (state.audioBuffer) { drawWaveform(); drawRuler(); }
  });

  // Tool letter shortcuts only; menu accelerators handle the rest.
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyT') setTool('trim', document.getElementById('tool-trim'));
    else if (e.code === 'KeyS') setTool('select', document.getElementById('tool-select'));
    else if (e.code === 'KeyM') setTool('mark', document.getElementById('tool-mark'));
  });

  renderMarkers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
