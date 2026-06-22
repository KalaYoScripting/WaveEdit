// ===================== EDITING =====================
function saveHistory() {
  if (state.audioBuffer) {
    state.history.push(copyBuffer(state.audioBuffer));
    markDirty(true);
  }
}

function copyBuffer(buf) {
  const ctx = getAudioCtx();
  const nb = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) nb.copyToChannel(buf.getChannelData(c).slice(), c);
  return nb;
}

function getSelectionSamples() {
  if (!state.audioBuffer || state.selectionStart === null || state.selectionEnd === null) return null;
  const sr = state.audioBuffer.sampleRate;
  const s = Math.round(Math.min(state.selectionStart, state.selectionEnd) * sr);
  const e = Math.round(Math.max(state.selectionStart, state.selectionEnd) * sr);
  if (s >= e) return null;
  return { start: s, end: e };
}

function undoAction() {
  if (!state.history.length) { notify('Nothing to undo', 'No actions to undo.'); return; }
  state.audioBuffer = state.history.pop();
  if (state.history.length === 0) markDirty(false);
  document.getElementById('metaDuration').textContent = formatTime(state.audioBuffer.duration);
  document.getElementById('totalTime').textContent = formatTime(state.audioBuffer.duration);
  drawWaveform(); drawRuler();
  notify('Undone', 'Last action reversed.');
  setStatus('ready', 'Undo applied');
}

function trimSelection() {
  const sel = getSelectionSamples();
  if (!sel) { notify('No selection', 'Make a selection first.'); return; }
  saveHistory();
  const ctx = getAudioCtx();
  const len = sel.end - sel.start;
  const nb = ctx.createBuffer(state.audioBuffer.numberOfChannels, len, state.audioBuffer.sampleRate);
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const old = state.audioBuffer.getChannelData(c);
    nb.copyToChannel(old.subarray(sel.start, sel.end), c);
  }
  state.audioBuffer = nb;
  state.selectionStart = null; state.selectionEnd = null;
  updateSelectionOverlay(); updateSelectionInfo();
  document.getElementById('metaDuration').textContent = formatTime(nb.duration);
  document.getElementById('totalTime').textContent = formatTime(nb.duration);
  drawWaveform(); drawRuler();
  setStatus('ready', 'Trimmed to selection');
  notify('Trimmed', 'Audio trimmed to selection (' + formatTime(nb.duration) + ').');
}

function silenceSelection() {
  const sel = getSelectionSamples();
  if (!sel) { notify('No selection', 'Make a selection first.'); return; }
  saveHistory();
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const d = state.audioBuffer.getChannelData(c);
    d.fill(0, sel.start, sel.end);
  }
  drawWaveform();
  notify('Silenced', 'Selection replaced with silence.');
  setStatus('ready', 'Selection silenced');
}

function normalizeAudio() {
  if (!state.audioBuffer) { notify('No file', 'Open a file first.'); return; }
  saveHistory();
  let peak = 0;
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const d = state.audioBuffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  }
  if (peak === 0) return;
  const gain = 0.99 / peak;
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const d = state.audioBuffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  drawWaveform();
  notify('Normalized', 'Peak level set to -0.1 dBFS.');
  setStatus('ready', 'Audio normalized');
}

function reverseAudio() {
  const sel = getSelectionSamples();
  if (!state.audioBuffer) return;
  saveHistory();
  const start = sel ? sel.start : 0;
  const end = sel ? sel.end : state.audioBuffer.length;
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const d = state.audioBuffer.getChannelData(c);
    const sub = d.subarray(start, end).slice();
    sub.reverse();
    d.set(sub, start);
  }
  drawWaveform();
  notify('Reversed', sel ? 'Selection reversed.' : 'Entire track reversed.');
  setStatus('ready', 'Audio reversed');
}

function fadeInSelection() { applyFade('in'); }
function fadeOutSelection() { applyFade('out'); }
function applyFade(type) {
  const sel = getSelectionSamples();
  if (!sel) { notify('No selection', 'Make a selection first.'); return; }
  saveHistory();
  const len = sel.end - sel.start;
  for (let c = 0; c < state.audioBuffer.numberOfChannels; c++) {
    const d = state.audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const gain = type === 'in' ? t : 1 - t;
      d[sel.start + i] *= gain;
    }
  }
  drawWaveform();
  notify('Fade applied', 'Fade ' + type + ' applied to selection.');
}

function selectAll() {
  if (!state.audioBuffer) return;
  state.selectionStart = 0;
  state.selectionEnd = state.audioBuffer.duration;
  updateSelectionOverlay(); updateSelectionInfo();
}

function clearSelection() {
  state.selectionStart = null; state.selectionEnd = null;
  updateSelectionOverlay(); updateSelectionInfo();
}

// ===================== MARKERS =====================
function addMarker(t) {
  const id = Date.now();
  state.markers.push({ id, time: t, label: 'Marker ' + (state.markers.length + 1) });
  renderMarkers();
  const marksTab = document.querySelector('.fx-tab[onclick*="marks"]');
  if (marksTab) switchTab('marks', marksTab);
  notify('Marker added', formatTime(t));
}

function renderMarkers() {
  const el = document.getElementById('tab-marks');
  if (state.markers.length === 0) {
    el.innerHTML = '<div style="color:var(--color-text-faint); font-size:var(--text-xs); padding: var(--space-4);">No markers yet. Use the Mark tool to add markers.</div>';
    return;
  }
  el.innerHTML = state.markers.map(m => `
    <div class="mark-item">
      <div class="mark-dot"></div>
      <span class="mark-time">${formatTime(m.time)}</span>
      <span class="mark-label">${m.label}</span>
      <button class="mark-remove btn-icon" onclick="removeMarker(${m.id})" aria-label="Remove marker">✕</button>
    </div>`).join('');
}

function removeMarker(id) {
  state.markers = state.markers.filter(m => m.id !== id);
  renderMarkers();
}

// ===================== TOOLS =====================
function setTool(name, btn) {
  state.currentTool = name;
  document.querySelectorAll('.sidebar-item[id^=tool-]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('statusTool').textContent = 'Tool: ' + name.charAt(0).toUpperCase() + name.slice(1);
  setWaveformCursor();
}

// ===================== TABS =====================
function switchTab(name, btn) {
  document.querySelectorAll('.fx-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
  btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
  document.getElementById('tab-effects').classList.remove('active');
  document.getElementById('tab-marks').classList.remove('active');
  const specCanvas = document.getElementById('spectrumCanvas');
  specCanvas.style.display = 'none';

  if (name === 'effects') document.getElementById('tab-effects').classList.add('active');
  else if (name === 'spectrum') {
    specCanvas.style.display = 'block';
    specCanvas.style.padding = 'var(--space-4)';
    specCanvas.width = specCanvas.offsetWidth;
    specCanvas.height = 120;
    if (state.isPlaying) drawSpectrum();
  }
  else if (name === 'marks') { document.getElementById('tab-marks').classList.add('active'); renderMarkers(); }
}

// ===================== FX CONTROLS =====================
function updateFx(slider, valId, suffix) {
  document.getElementById(valId).textContent = slider.value + suffix;
}
function updateFxRatio(slider) {
  document.getElementById('ratioVal').textContent = slider.value + ':1';
}
function toggleFx(el) {
  el.classList.toggle('on');
  el.setAttribute('aria-checked', el.classList.contains('on'));
}
