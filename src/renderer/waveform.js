// ===================== WAVEFORM DRAWING =====================
function drawWaveform() {
  if (!state.audioBuffer) return;
  const canvas = document.getElementById('waveformCanvas');
  const panel = document.getElementById('waveformPanel');
  canvas.width = panel.clientWidth * devicePixelRatio;
  canvas.height = panel.clientHeight * devicePixelRatio;
  canvas.style.width = panel.clientWidth + 'px';
  canvas.style.height = panel.clientHeight + 'px';

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  ctx.clearRect(0, 0, W, H);

  const dur = state.audioBuffer.duration;
  const visibleDur = dur / state.zoom;
  const startSample = Math.floor((state.viewStart / dur) * state.audioBuffer.length);
  const endSample = Math.floor(((state.viewStart + visibleDur) / dur) * state.audioBuffer.length);

  const data = state.audioBuffer.getChannelData(0);
  const samplesPerPx = (endSample - startSample) / (W / devicePixelRatio);

  // Grid lines
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Center line
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  // Waveform gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (isDark) {
    grad.addColorStop(0, 'rgba(79,152,163,0.85)');
    grad.addColorStop(0.5, 'rgba(79,152,163,0.5)');
    grad.addColorStop(1, 'rgba(79,152,163,0.85)');
  } else {
    grad.addColorStop(0, 'rgba(1,105,111,0.85)');
    grad.addColorStop(0.5, 'rgba(1,105,111,0.5)');
    grad.addColorStop(1, 'rgba(1,105,111,0.85)');
  }

  ctx.fillStyle = grad;
  const pxW = W / devicePixelRatio;
  const centerY = H / 2;

  ctx.beginPath();
  const topPoints = [], botPoints = [];
  for (let x = 0; x < pxW; x++) {
    const sStart = Math.floor(startSample + x * samplesPerPx);
    const sEnd = Math.min(Math.floor(startSample + (x + 1) * samplesPerPx), data.length);
    let mn = 0, mx = 0;
    for (let s = sStart; s < sEnd; s++) {
      const v = data[s];
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    const xPx = x * devicePixelRatio;
    topPoints.push([xPx, centerY - mx * (H / 2 - 4)]);
    botPoints.push([xPx, centerY - mn * (H / 2 - 4)]);
  }
  if (topPoints.length > 0) {
    ctx.moveTo(topPoints[0][0], topPoints[0][1]);
    topPoints.forEach(p => ctx.lineTo(p[0], p[1]));
    for (let i = botPoints.length - 1; i >= 0; i--) ctx.lineTo(botPoints[i][0], botPoints[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Update selection overlay
  updateSelectionOverlay();
  updatePlayhead();
}

function drawRuler() {
  if (!state.audioBuffer) return;
  const ruler = document.getElementById('rulerCanvas');
  const panel = document.getElementById('timelineRuler');
  ruler.width = panel.clientWidth * devicePixelRatio;
  ruler.height = panel.clientHeight * devicePixelRatio;
  ruler.style.width = panel.clientWidth + 'px';
  ruler.style.height = panel.clientHeight + 'px';

  const ctx = ruler.getContext('2d');
  const W = ruler.width, H = ruler.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const dur = state.audioBuffer.duration;
  const visibleDur = dur / state.zoom;
  const pxPerSec = (W / devicePixelRatio) / visibleDur;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = isDark ? 'rgba(205,204,202,0.6)' : 'rgba(40,37,29,0.6)';
  ctx.font = `${10 * devicePixelRatio}px Inter, sans-serif`;

  // Choose tick interval
  const intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
  let interval = intervals.find(i => i * pxPerSec > 50) || 60;

  for (let t = Math.ceil(state.viewStart / interval) * interval; t < state.viewStart + visibleDur; t += interval) {
    const x = (t - state.viewStart) / visibleDur * (W / devicePixelRatio) * devicePixelRatio;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, H - 8 * devicePixelRatio); ctx.stroke();
    const label = formatTime(t);
    ctx.fillText(label, x + 3, H - 10 * devicePixelRatio);
  }
}

// ===================== WAVEFORM INTERACTION =====================
const waveCanvas = document.getElementById('waveformCanvas');

waveCanvas.addEventListener('mousedown', e => {
  if (!state.audioBuffer) return;
  state.isDragging = true;
  const t = xToTime(e.offsetX);
  state.dragStartX = e.offsetX;
  if (state.currentTool === 'select' || state.currentTool === 'trim' || state.currentTool === 'silence' || state.currentTool === 'fade') {
    state.selectionStart = t; state.selectionEnd = t;
    updateSelectionOverlay();
  } else if (state.currentTool === 'mark') {
    addMarker(t);
    state.isDragging = false;
  } else {
    // Seek
    seekTo(t);
  }
});

waveCanvas.addEventListener('mousemove', e => {
  if (!state.isDragging || !state.audioBuffer) return;
  const t = xToTime(e.offsetX);
  if (state.currentTool !== 'mark') {
    state.selectionEnd = t;
    updateSelectionInfo();
    updateSelectionOverlay();
  }
});

waveCanvas.addEventListener('mouseup', () => { state.isDragging = false; });
waveCanvas.addEventListener('mouseleave', () => { state.isDragging = false; });

// Click to seek (if no drag)
waveCanvas.addEventListener('click', e => {
  if (!state.audioBuffer) return;
  if (Math.abs(e.offsetX - state.dragStartX) < 3 && state.currentTool === 'select') {
    seekTo(xToTime(e.offsetX));
    state.selectionStart = null; state.selectionEnd = null;
    updateSelectionOverlay();
    updateSelectionInfo();
  }
});

// Zoom with wheel
document.getElementById('waveformPanel').addEventListener('wheel', e => {
  if (!state.audioBuffer) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.25 : 0.25;
  state.zoom = Math.max(1, Math.min(state.zoom + delta * state.zoom, 100));
  const dur = state.audioBuffer.duration;
  state.viewStart = Math.max(0, Math.min(state.viewStart, dur - dur / state.zoom));
  drawWaveform(); drawRuler();
  document.getElementById('statusZoom').textContent = 'Zoom: ' + Math.round(state.zoom * 100) + '%';
}, { passive: false });

function xToTime(x) {
  if (!state.audioBuffer) return 0;
  const dur = state.audioBuffer.duration;
  const w = document.getElementById('waveformCanvas').offsetWidth;
  return state.viewStart + (x / w) * (dur / state.zoom);
}

function timeToX(t) {
  if (!state.audioBuffer) return 0;
  const dur = state.audioBuffer.duration;
  const w = document.getElementById('waveformCanvas').offsetWidth;
  return ((t - state.viewStart) / (dur / state.zoom)) * w;
}

function updateSelectionOverlay() {
  const overlay = document.getElementById('selectionOverlay');
  if (state.selectionStart === null || state.selectionEnd === null || !state.audioBuffer) {
    overlay.style.display = 'none'; return;
  }
  const s = Math.min(state.selectionStart, state.selectionEnd);
  const e2 = Math.max(state.selectionStart, state.selectionEnd);
  const x1 = timeToX(s);
  const x2 = timeToX(e2);
  overlay.style.display = '';
  overlay.style.left = x1 + 'px';
  overlay.style.width = (x2 - x1) + 'px';
}

function updateSelectionInfo() {
  const el = document.getElementById('selectionInfo');
  if (state.selectionStart === null || state.selectionEnd === null) {
    el.textContent = 'No selection'; return;
  }
  const s = Math.min(state.selectionStart, state.selectionEnd);
  const e2 = Math.max(state.selectionStart, state.selectionEnd);
  el.textContent = 'Selection: ' + formatTime(s) + ' → ' + formatTime(e2) + ' (' + formatTime(e2 - s) + ')';
}

// ===================== PLAYHEAD =====================
function updatePlayhead() {
  if (!state.audioBuffer) return;
  const ph = document.getElementById('playhead');
  const x = timeToX(state.currentTime);
  ph.style.left = x + 'px';
}

// ===================== ZOOM =====================
function zoomIn() {
  if (!state.audioBuffer) return;
  state.zoom = Math.min(state.zoom * 1.5, 100);
  drawWaveform(); drawRuler();
  document.getElementById('statusZoom').textContent = 'Zoom: ' + Math.round(state.zoom * 100) + '%';
}
function zoomOut() {
  if (!state.audioBuffer) return;
  state.zoom = Math.max(state.zoom / 1.5, 1);
  drawWaveform(); drawRuler();
  document.getElementById('statusZoom').textContent = 'Zoom: ' + Math.round(state.zoom * 100) + '%';
}
function zoomFit() {
  state.zoom = 1; state.viewStart = 0;
  if (state.audioBuffer) { drawWaveform(); drawRuler(); }
  document.getElementById('statusZoom').textContent = 'Zoom: 100%';
}
