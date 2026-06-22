function getPlaybackBounds() {
  if (!state.audioBuffer) return { start: 0, end: 0 };
  if (state.selectionStart === null || state.selectionEnd === null) {
    return { start: 0, end: state.audioBuffer.duration };
  }
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  if (start >= end) return { start: 0, end: state.audioBuffer.duration };
  return { start, end };
}

function hasActiveSelection() {
  if (state.selectionStart === null || state.selectionEnd === null) return false;
  return Math.min(state.selectionStart, state.selectionEnd) < Math.max(state.selectionStart, state.selectionEnd);
}

function clampToPlaybackBounds(t) {
  const bounds = getPlaybackBounds();
  return Math.max(bounds.start, Math.min(t, bounds.end));
}

function finishPlayback(atTime, message) {
  state.isPlaying = false;
  state.pausedAt = atTime;
  state.currentTime = atTime;
  document.getElementById('currentTime').textContent = formatTime(atTime);
  updatePlayhead();
  showPlayIcon();
  setStatus('ready', message);
  cancelAnimationFrame(state.animFrame);
}

// ===================== PLAYBACK =====================
function togglePlay() {
  if (!state.audioBuffer) { notify('No file', 'Open an audio file first.'); return; }
  if (state.isPlaying) pauseAudio();
  else playAudio();
}

function playAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  if (state.audioSource) { try { state.audioSource.stop(); } catch (e) {} }

  state.gainNode = ctx.createGain();
  state.gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);

  state.analyser = ctx.createAnalyser();
  state.analyser.fftSize = 2048;
  state.analyser.smoothingTimeConstant = 0.8;

  state.audioSource = ctx.createBufferSource();
  state.audioSource.buffer = state.audioBuffer;
  state.audioSource.connect(state.gainNode);
  state.gainNode.connect(state.analyser);
  state.analyser.connect(ctx.destination);

  const bounds = getPlaybackBounds();
  let offset = clampToPlaybackBounds(state.pausedAt);
  if (hasActiveSelection() && offset >= bounds.end) offset = bounds.start;

  const playDuration = hasActiveSelection() ? bounds.end - offset : undefined;
  state.startedAt = ctx.currentTime - offset;
  state.pausedAt = offset;
  state.currentTime = offset;

  if (playDuration !== undefined && playDuration > 0) {
    state.audioSource.start(0, offset, playDuration);
  } else {
    state.audioSource.start(0, offset);
  }
  state.isPlaying = true;

  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('pauseIcon').style.display = '';
  setStatus('playing', hasActiveSelection() ? 'Playing selection…' : 'Playing…');

  state.audioSource.onended = () => {
    if (!state.isPlaying) return;
    const endBounds = getPlaybackBounds();
    const resetTo = hasActiveSelection() ? endBounds.start : 0;
    finishPlayback(resetTo, hasActiveSelection() ? 'Selection playback ended' : 'Playback ended');
  };

  animatePlayhead();
  drawSpectrum();
}

function pauseAudio() {
  if (!state.audioSource) return;
  const ctx = getAudioCtx();
  state.pausedAt = clampToPlaybackBounds(ctx.currentTime - state.startedAt);
  state.currentTime = state.pausedAt;
  state.audioSource.stop();
  state.isPlaying = false;
  showPlayIcon();
  setStatus('ready', 'Paused');
  cancelAnimationFrame(state.animFrame);
}

function showPlayIcon() {
  document.getElementById('playIcon').style.display = '';
  document.getElementById('pauseIcon').style.display = 'none';
}

function animatePlayhead() {
  if (!state.isPlaying) return;
  const ctx = getAudioCtx();
  state.currentTime = ctx.currentTime - state.startedAt;
  document.getElementById('currentTime').textContent = formatTime(state.currentTime);
  updatePlayhead();

  if (hasActiveSelection()) {
    const bounds = getPlaybackBounds();
    if (state.currentTime >= bounds.end - 0.001) {
      try { state.audioSource.stop(); } catch (e) {}
      finishPlayback(bounds.start, 'Selection playback ended');
      return;
    }
  }

  // Auto-scroll
  const dur = state.audioBuffer.duration;
  const visEnd = state.viewStart + dur / state.zoom;
  if (state.currentTime > visEnd - 0.5) { state.viewStart = Math.max(0, state.currentTime - 0.5); drawWaveform(); drawRuler(); }
  state.animFrame = requestAnimationFrame(animatePlayhead);
}

function seekTo(t) {
  if (!state.audioBuffer) return;
  t = clampToPlaybackBounds(Math.max(0, Math.min(t, state.audioBuffer.duration)));
  const wasPlaying = state.isPlaying;
  if (wasPlaying) pauseAudio();
  state.pausedAt = t;
  state.currentTime = t;
  document.getElementById('currentTime').textContent = formatTime(t);
  updatePlayhead();
  if (wasPlaying) playAudio();
}

function skipToStart() {
  const bounds = getPlaybackBounds();
  seekTo(hasActiveSelection() ? bounds.start : 0);
}

function skipToEnd() {
  if (!state.audioBuffer) return;
  const bounds = getPlaybackBounds();
  seekTo(hasActiveSelection() ? bounds.end : state.audioBuffer.duration);
}

function skipBackward() { seekTo(state.currentTime - 5); }
function skipForward() { seekTo(state.currentTime + 5); }
function setVolume(v) { if (state.gainNode) state.gainNode.gain.value = v; document.getElementById('volLabel').textContent = Math.round(v * 100) + '%'; }

// ===================== SPECTRUM =====================
function drawSpectrum() {
  const canvas = document.getElementById('spectrumCanvas');
  if (!state.analyser || canvas.style.display === 'none') return;
  const W = canvas.width || canvas.offsetWidth;
  const H = canvas.height || 120;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bufLen = state.analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);
  state.analyser.getByteFrequencyData(data);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = isDark ? '#181716' : '#f9f8f5';
  ctx.fillRect(0, 0, W, H);
  const barW = W / bufLen * 2.5;
  for (let i = 0; i < bufLen; i++) {
    const h = (data[i] / 255) * H;
    const pct = i / bufLen;
    const r = isDark ? Math.round(79 + pct * 100) : 1;
    const g = isDark ? Math.round(152 - pct * 50) : Math.round(105 + pct * 50);
    const b = isDark ? Math.round(163 - pct * 80) : 111;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * barW, H - h, barW - 1, h);
  }
  if (state.isPlaying) state.spectrumFrame = requestAnimationFrame(drawSpectrum);
}
