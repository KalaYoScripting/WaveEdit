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

  const offset = state.pausedAt;
  state.startedAt = ctx.currentTime - offset;
  state.audioSource.start(0, offset);
  state.isPlaying = true;

  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('pauseIcon').style.display = '';
  setStatus('playing', 'Playing…');

  state.audioSource.onended = () => {
    if (state.isPlaying) { state.isPlaying = false; state.pausedAt = 0; state.currentTime = 0; updatePlayhead(); showPlayIcon(); setStatus('ready', 'Playback ended'); }
  };

  animatePlayhead();
  drawSpectrum();
}

function pauseAudio() {
  if (!state.audioSource) return;
  const ctx = getAudioCtx();
  state.pausedAt = ctx.currentTime - state.startedAt;
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

  // Auto-scroll
  const dur = state.audioBuffer.duration;
  const visEnd = state.viewStart + dur / state.zoom;
  if (state.currentTime > visEnd - 0.5) { state.viewStart = Math.max(0, state.currentTime - 0.5); drawWaveform(); drawRuler(); }
  state.animFrame = requestAnimationFrame(animatePlayhead);
}

function seekTo(t) {
  if (!state.audioBuffer) return;
  t = Math.max(0, Math.min(t, state.audioBuffer.duration));
  const wasPlaying = state.isPlaying;
  if (wasPlaying) pauseAudio();
  state.pausedAt = t;
  state.currentTime = t;
  document.getElementById('currentTime').textContent = formatTime(t);
  updatePlayhead();
  if (wasPlaying) playAudio();
}

function skipToStart() { seekTo(0); }
function skipToEnd() { seekTo(state.audioBuffer ? state.audioBuffer.duration : 0); }
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
