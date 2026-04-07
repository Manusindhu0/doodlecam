/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Capture Module
   Photo capture, video recording, export
   ═══════════════════════════════════════════════════════════════ */

export class Capture {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.timerInterval = null;
  }

  /**
   * Take a photo from the scene canvas
   */
  async takePhoto(sceneCanvas) {
    // Create flash effect
    this._flashEffect();

    // Play shutter sound
    this._shutterSound();

    const dataUrl = sceneCanvas.toDataURL('image/png');

    // Save via Electron IPC
    if (window.electronAPI) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const result = await window.electronAPI.saveImage({
        dataUrl,
        defaultName: `doodlecam-${timestamp}.png`
      });
      return result;
    }

    // Fallback: download in browser
    const link = document.createElement('a');
    link.download = 'doodlecam-photo.png';
    link.href = dataUrl;
    link.click();
    return { success: true };
  }

  /**
   * Start recording video from scene canvas
   */
  startRecording(sceneCanvas) {
    if (this.isRecording) return;

    const stream = sceneCanvas.captureStream(30);
    this.recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5000000
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
    this.isRecording = true;
    this.recordingStartTime = Date.now();

    // Update timer display
    const timerEl = document.getElementById('rec-timer');
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.recordingStartTime;
      const mins = Math.floor(elapsed / 60000).toString().padStart(2, '0');
      const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

    // Show recording indicator
    const indicator = document.getElementById('recording-indicator');
    if (indicator) indicator.classList.remove('hidden');
  }

  /**
   * Stop recording and save video
   */
  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return null;

    return new Promise(async (resolve) => {
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();

        // Save via Electron IPC
        if (window.electronAPI) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const result = await window.electronAPI.saveVideo({
            buffer: Array.from(new Uint8Array(buffer)),
            defaultName: `doodlecam-${timestamp}.webm`
          });
          resolve(result);
        } else {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = 'doodlecam-video.webm';
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          resolve({ success: true });
        }
      };

      this.mediaRecorder.stop();
      this.isRecording = false;

      // Clear timer
      clearInterval(this.timerInterval);
      this.timerInterval = null;

      // Hide recording indicator
      const indicator = document.getElementById('recording-indicator');
      if (indicator) indicator.classList.add('hidden');
    });
  }

  toggleRecording(sceneCanvas) {
    if (this.isRecording) {
      return this.stopRecording();
    } else {
      this.startRecording(sceneCanvas);
      return Promise.resolve({ success: true, action: 'started' });
    }
  }

  _flashEffect() {
    const flash = document.createElement('div');
    flash.className = 'capture-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  _shutterSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
      gainNode.gain.value = 0.15;

      // Quick burst of noise for shutter sound
      const bufferSize = audioCtx.sampleRate * 0.08;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start();
    } catch (e) {
      // Audio not available
    }
  }
}
