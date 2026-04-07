/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Camera Module
   Manages webcam stream, mirror, and camera selection
   ═══════════════════════════════════════════════════════════════ */

export class Camera {
  constructor() {
    this.video = null;
    this.stream = null;
    this.mirror = true;
    this.devices = [];
    this.currentDeviceId = null;
    this.isReady = false;
  }

  async init(videoElement) {
    this.video = videoElement;

    // Request camera stream
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user'
      },
      audio: false
    };

    console.log('[Camera] Requesting camera access...');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[Camera] Got stream:', this.stream.getVideoTracks()[0].label);
    } catch (err) {
      console.error('[Camera] getUserMedia failed:', err.name, err.message);
      // Try with minimal constraints as fallback
      try {
        console.log('[Camera] Retrying with minimal constraints...');
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        console.log('[Camera] Got stream (fallback):', this.stream.getVideoTracks()[0].label);
      } catch (err2) {
        console.error('[Camera] Fallback also failed:', err2.name, err2.message);

        // Show a native OS dialog with specific guidance
        try {
          await window.electronAPI.cameraError({ errorName: err2.name || err.name });
        } catch (_) { /* ignore if not available */ }

        // Surface a user-friendly error based on error type
        const name = err2.name || err.name || '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error('Camera access denied by Windows. Go to Settings → Privacy & Security → Camera and allow camera access, then restart the app.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          throw new Error('No webcam found. Please connect a USB webcam and restart DoodleCam.');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          throw new Error('Camera is already in use by another app (Zoom, Teams, OBS…). Close that app first, then restart DoodleCam.');
        } else {
          throw new Error(`Camera error (${name}): ${err2.message}. Make sure a webcam is connected and camera permissions are granted.`);
        }
      }
    }

    this.video.srcObject = this.stream;

    // Wait for video to be ready with a timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[Camera] Video metadata timeout after 10s');
        // Still try to proceed even without metadata — use defaults
        this.isReady = true;
        resolve({
          width: this.video.videoWidth || 1280,
          height: this.video.videoHeight || 720
        });
      }, 10000);

      this.video.onloadedmetadata = async () => {
        console.log('[Camera] Video metadata loaded. Dimensions:', this.video.videoWidth, 'x', this.video.videoHeight);
        clearTimeout(timeout);

        try {
          await this.video.play();
          console.log('[Camera] Video playing successfully');
        } catch (playErr) {
          console.warn('[Camera] Video play() failed (autoplay policy?):', playErr);
          // Try muted playback
          this.video.muted = true;
          try {
            await this.video.play();
          } catch (e) {
            console.error('[Camera] Even muted play failed:', e);
          }
        }

        this.isReady = true;

        // Store current device ID
        const track = this.stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          this.currentDeviceId = settings.deviceId;
        }

        // Enumerate devices (after permission granted)
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          this.devices = allDevices.filter(d => d.kind === 'videoinput');
          console.log('[Camera] Found', this.devices.length, 'camera(s)');
        } catch (e) {
          console.warn('[Camera] Could not enumerate devices:', e);
        }

        resolve({
          width: this.video.videoWidth || 1280,
          height: this.video.videoHeight || 720
        });
      };

      this.video.onerror = (err) => {
        clearTimeout(timeout);
        console.error('[Camera] Video element error:', err);
        reject(new Error('Camera video element error'));
      };
    });
  }

  getVideoElement() {
    return this.video;
  }

  getStream() {
    return this.stream;
  }

  getDimensions() {
    if (!this.video) return { width: 1280, height: 720 };
    return {
      width: this.video.videoWidth || 1280,
      height: this.video.videoHeight || 720
    };
  }

  isMirrored() {
    return this.mirror;
  }

  toggleMirror() {
    this.mirror = !this.mirror;
    return this.mirror;
  }

  async switchCamera() {
    if (this.devices.length <= 1) return false;

    const currentIndex = this.devices.findIndex(d => d.deviceId === this.currentDeviceId);
    const nextIndex = (currentIndex + 1) % this.devices.length;
    this.currentDeviceId = this.devices[nextIndex].deviceId;

    // Stop current stream
    this.stop();

    // Restart with new device
    await this.init(this.video);
    return true;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isReady = false;
  }

  destroy() {
    this.stop();
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}
