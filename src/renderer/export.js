// ===================== EXPORT / SAVE =====================
function openExportModal() {
  document.getElementById('exportModal').classList.add('open');
}
function closeExportModal() {
  document.getElementById('exportModal').classList.remove('open');
}

// Interleave a buffer (optionally a sample range) into a WAV ArrayBuffer.
function bufferToWav(buf, range) {
  const nch = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const start = range ? range.start : 0;
  const end = range ? range.end : buf.length;
  const len = end - start;
  const pcmData = new Float32Array(len * nch);
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) pcmData[i * nch + c] = buf.getChannelData(c)[start + i];
  }
  return encodeWav(pcmData, nch, sr);
}

function encodeWav(samples, numChannels, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  function ws(off, str) { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); }
  ws(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buf;
}

function defaultExportName() {
  const base = state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : 'audio';
  return base + '_edited.wav';
}

async function writeWav(wavBuffer, filePath) {
  if (!nativeApi) { notify('Unavailable', 'Saving is only available in the desktop app.'); return false; }
  const result = await nativeApi.writeFile(filePath, new Uint8Array(wavBuffer));
  return result && result.ok;
}

async function doExport() {
  if (!state.audioBuffer) { notify('No file', 'Load an audio file first.'); closeExportModal(); return; }
  const range = document.getElementById('exportRange').value === 'selection' ? getSelectionSamples() : null;
  if (document.getElementById('exportRange').value === 'selection' && !range) {
    notify('No selection', 'Make a selection or choose Full track.');
    return;
  }
  closeExportModal();

  if (!nativeApi) { notify('Unavailable', 'Export is only available in the desktop app.'); return; }
  const dialogResult = await nativeApi.saveFileDialog(defaultExportName(), 'wav');
  if (dialogResult.canceled) return;

  const wav = bufferToWav(state.audioBuffer, range);
  const ok = await writeWav(wav, dialogResult.filePath);
  if (ok) {
    setStatus('ready', 'Exported to ' + dialogResult.filePath);
    notify('Export complete', 'File saved as WAV.');
  } else {
    setStatus('error', 'Export failed');
    notify('Error', 'Could not write the file.');
  }
}

// Save to the current file path, or prompt if none.
async function saveFile() {
  if (!state.audioBuffer) { notify('No file', 'Load an audio file first.'); return; }
  if (!state.filePath || !/\.wav$/i.test(state.filePath)) {
    return saveFileAs();
  }
  const wav = bufferToWav(state.audioBuffer, null);
  const ok = await writeWav(wav, state.filePath);
  if (ok) {
    markDirty(false);
    setStatus('ready', 'Saved ' + state.filePath);
    notify('Saved', baseName(state.filePath));
  }
}

async function saveFileAs() {
  if (!state.audioBuffer) { notify('No file', 'Load an audio file first.'); return; }
  if (!nativeApi) { notify('Unavailable', 'Saving is only available in the desktop app.'); return; }
  const suggested = (state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : 'audio') + '.wav';
  const dialogResult = await nativeApi.saveFileDialog(suggested, 'wav');
  if (dialogResult.canceled) return;
  const wav = bufferToWav(state.audioBuffer, null);
  const ok = await writeWav(wav, dialogResult.filePath);
  if (ok) {
    state.filePath = dialogResult.filePath;
    state.fileName = baseName(dialogResult.filePath);
    document.getElementById('fileNameLabel').textContent = dialogResult.filePath;
    markDirty(false);
    setStatus('ready', 'Saved ' + dialogResult.filePath);
    notify('Saved', state.fileName);
  }
}
