/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Main App Orchestrator
   Initializes all modules and runs the main render loop
   ═══════════════════════════════════════════════════════════════ */

import { Camera } from './camera.js';
import { HandTracker } from './handTracker.js';
import { GestureEngine, GestureType } from './gestureEngine.js';
import { DrawingEngine, ToolType } from './drawingEngine.js';
import { DoodleManager } from './doodleManager.js';
import { HoloUI, STICKER_MAP } from './holoUI.js';
import { Capture } from './capture.js';
import { Filters } from './filters.js';
import { ThemeManager } from './themeManager.js';

class DoodleCamApp {
  constructor() {
    // Core modules
    this.camera = new Camera();
    this.handTracker = new HandTracker();
    this.gestureEngine = new GestureEngine();
    this.drawingEngine = new DrawingEngine();
    this.doodleManager = new DoodleManager(this.drawingEngine);
    this.holoUI = new HoloUI();
    this.capture = new Capture();
    this.filters = new Filters();
    this.themeManager = new ThemeManager();

    // DOM elements
    this.videoEl = null;
    this.sceneCanvas = null;
    this.sceneCtx = null;
    this.feedbackCanvas = null;
    this.feedbackCtx = null;

    // State
    this.canvasWidth = 1280;
    this.canvasHeight = 720;
    this.isRunning = false;
    this.prevGestureType = GestureType.NONE;
    this.wasDrawing = false;
    this.wasPinching = false;
    this.activeCamFilter = 'none';
    this.activeFaceFilter = 'none';
    this.textPlacementMode = false;
    this.stickerPlacementMode = false;
    this.pendingText = null;

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.fps = 0;
  }

  async init() {
    try {
      console.log('[App] Starting init...');
      this.updateLoading('Starting DoodleCam...', 5);

      // Init theme
      this.themeManager.init();
      console.log('[App] Theme initialized');
      this.updateLoading('Theme loaded', 10);

      // Get DOM elements
      this.videoEl = document.getElementById('webcam-video');
      this.sceneCanvas = document.getElementById('scene-canvas');
      this.feedbackCanvas = document.getElementById('feedback-canvas');
      this.sceneCtx = this.sceneCanvas.getContext('2d', { willReadFrequently: true });
      this.feedbackCtx = this.feedbackCanvas.getContext('2d');
      console.log('[App] DOM elements found:', !!this.videoEl, !!this.sceneCanvas, !!this.feedbackCanvas);

      // Init camera
      this.updateLoading('Accessing camera...', 15);
      console.log('[App] Calling camera.init()...');
      const dims = await this.camera.init(this.videoEl);
      console.log('[App] Camera ready! Dimensions:', dims);
      this.canvasWidth = dims.width;
      this.canvasHeight = dims.height;
      this.sceneCanvas.width = this.canvasWidth;
      this.sceneCanvas.height = this.canvasHeight;
      this.feedbackCanvas.width = this.canvasWidth;
      this.feedbackCanvas.height = this.canvasHeight;
      this.updateLoading('Camera ready!', 30);

      // Init hand tracker (loads AI models — takes the longest)
      console.log('[App] Starting hand tracker init...');
      await this.handTracker.init((status) => {
        console.log('[App] HandTracker progress:', status);
        this.updateLoading(status, 30 + Math.min(50, this.loadProgress + 10));
      });
      console.log('[App] Hand tracker ready!');
      this.updateLoading('AI models loaded!', 85);

      // Init UI
      console.log('[App] Initializing UI...');
      this.holoUI.init();
      this._bindUICallbacks();
      this._bindKeyboardShortcuts();
      this._bindMouseFallback();
      this.updateLoading('UI Ready!', 95);

      // Handle window resize
      window.addEventListener('resize', () => this._handleResize());
      this._handleResize();

      // All ready — show app
      console.log('[App] ✅ All systems ready! Showing app...');
      this.updateLoading('Ready!', 100);
      setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('fade-out');
        const app = document.getElementById('app');
        app.classList.remove('hidden');

        setTimeout(() => loadingScreen.remove(), 600);
      }, 300);

      // Start main loop
      this.isRunning = true;
      this.lastFpsTime = performance.now();
      this._mainLoop();

    } catch (err) {
      console.error('[App] ❌ Init error:', err);
      this.updateLoading(`Error: ${err.message}`, 0);
      const statusEl = document.getElementById('loading-status');
      if (statusEl) {
        statusEl.style.color = '#ff4444';
        statusEl.textContent = `❌ ${err.message}`;
      }
    }
  }

  loadProgress = 0;

  updateLoading(message, percent) {
    this.loadProgress = percent;
    const statusEl = document.getElementById('loading-status');
    const barEl = document.getElementById('loading-bar-fill');
    if (statusEl) statusEl.textContent = message;
    if (barEl) barEl.style.width = `${percent}%`;
  }

  // ─── Main Render Loop ───

  _mainLoop() {
    if (!this.isRunning) return;

    const now = performance.now();

    // FPS counter
    this.frameCount++;
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // 1. Detect hands & faces
    const { hands, faces } = this.handTracker.detect(this.videoEl, now);

    // 2. Analyze gestures
    const gestureResult = this.gestureEngine.analyze(
      hands, this.canvasWidth, this.canvasHeight, this.camera.isMirrored()
    );

    // 3. Process primary hand gesture
    this._processGesture(gestureResult);

    // 4. Handle second hand UI interaction
    if (gestureResult.hands.length > 1) {
      const secondHand = gestureResult.hands[1];
      if (secondHand.fingerTips) {
        this.holoUI.handleGestureHover(secondHand.fingerTips[1]);
      }
    }

    // 5. Render scene
    this._renderScene(hands, faces);

    // 6. Render feedback overlay
    this._renderFeedback(hands, gestureResult);

    // Next frame
    requestAnimationFrame(() => this._mainLoop());
  }

  // ─── Gesture Processing ───

  _processGesture(gestureResult) {
    const primary = gestureResult.primaryHand;
    if (!primary) {
      this._endCurrentAction();
      return;
    }

    const gesture = primary.gesture;
    const pos = primary.position;

    switch (gesture) {
      case GestureType.DRAW:
        if (this.drawingEngine.currentTool === ToolType.STICKERS && this.stickerPlacementMode) {
          // Sticker tracks finger position; placed when gesture ends
          this._stickerPreviewPos = pos;
        } else {
          // Normal drawing (pen, shapes, eraser)
          if (!this.wasDrawing) {
            this.drawingEngine.startStroke(pos);
            this.wasDrawing = true;
          } else {
            this.drawingEngine.addPoint(pos);
          }
        }
        break;

      case GestureType.MOVE:
        if (!this.wasPinching && pos) {
          // Start pinch — select nearest doodle
          this.doodleManager.selectAt(pos);
          this.wasPinching = true;
        } else if (this.wasPinching && primary.delta) {
          // Continue pinch — move selected doodle
          this.doodleManager.moveSelected(primary.delta);
        }
        // End any drawing
        if (this.wasDrawing) {
          const doodle = this.drawingEngine.endStroke();
          if (doodle) this.doodleManager.addDoodle(doodle);
          this.wasDrawing = false;
        }
        break;

      case GestureType.ERASE:
        if (pos) {
          this.doodleManager.eraseAt(pos, primary.palmRadius || 50);
        }
        // End any active actions
        if (this.wasDrawing) {
          this.drawingEngine.cancelStroke();
          this.wasDrawing = false;
        }
        if (this.wasPinching) {
          this.doodleManager.deselect();
          this.wasPinching = false;
        }
        break;

      case GestureType.UI_HOVER:
        if (pos) {
          this.holoUI.handleGestureHover(pos);
        }
        this._endCurrentAction();
        break;

      case GestureType.NONE:
        this._endCurrentAction();
        break;
    }

    this.prevGestureType = gesture;
  }

  _endCurrentAction() {
    if (this.wasDrawing) {
      const doodle = this.drawingEngine.endStroke();
      if (doodle) this.doodleManager.addDoodle(doodle);
      this.wasDrawing = false;
    }
    if (this.wasPinching) {
      this.doodleManager.deselect();
      this.wasPinching = false;
    }
    // Place sticker at last tracked position
    if (this.stickerPlacementMode && this._stickerPreviewPos) {
      const emoji = STICKER_MAP[this.drawingEngine.currentSticker] || '⭐';
      const doodle = this.drawingEngine.createStickerDoodle(emoji, this._stickerPreviewPos);
      this.doodleManager.addDoodle(doodle);
      this._stickerPreviewPos = null;
      this.showToast('Sticker placed!');
    }
  }

  // ─── Scene Rendering ───

  _renderScene(hands, faces) {
    const ctx = this.sceneCtx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    // Draw video (mirrored if enabled)
    ctx.save();
    if (this.camera.isMirrored()) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, 0, 0, w, h);
    ctx.restore();

    // Apply camera filter
    if (this.activeCamFilter !== 'none') {
      this.filters.applyCamFilter(ctx, w, h, this.activeCamFilter);
    }

    // Draw face filters
    if (this.activeFaceFilter !== 'none' && faces) {
      this.filters.drawFaceFilter(ctx, faces, this.activeFaceFilter, w, h, this.camera.isMirrored());
    }

    // Draw all committed doodles
    this.doodleManager.render(ctx);

    // Draw active/in-progress stroke preview
    this.drawingEngine.renderPreview(ctx);
  }

  // ─── Feedback Overlay ───

  _renderFeedback(hands, gestureResult) {
    const ctx = this.feedbackCtx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    if (!hands?.landmarks) return;

    const mirror = this.camera.isMirrored();

    // Draw fingertip dots for all detected hands
    for (const landmarks of hands.landmarks) {
      const tips = [4, 8, 12, 16, 20]; // fingertip landmark indices

      for (const tipIdx of tips) {
        const lm = landmarks[tipIdx];
        const x = mirror ? w - (lm.x * w) : lm.x * w;
        const y = lm.y * h;

        // Outer glow
        ctx.save();
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 15;
        ctx.fillStyle = 'rgba(0, 245, 212, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Inner dot
        ctx.fillStyle = '#00f5d4';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw gesture-specific feedback
    if (gestureResult.primaryHand) {
      const primary = gestureResult.primaryHand;

      switch (primary.gesture) {
        case GestureType.DRAW:
          if (primary.position) {
            // Draw cursor
            ctx.save();
            ctx.strokeStyle = this.drawingEngine.currentColor;
            ctx.lineWidth = 2;
            ctx.shadowColor = this.drawingEngine.currentColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(primary.position.x, primary.position.y,
                    this.drawingEngine.brushSize + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          break;

        case GestureType.ERASE:
          if (primary.palmCenter) {
            // Erase area indicator
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
            ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.arc(primary.palmCenter.x, primary.palmCenter.y,
                    primary.palmRadius || 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          break;

        case GestureType.MOVE:
          if (primary.position) {
            // Pinch indicator
            ctx.save();
            ctx.fillStyle = 'rgba(123, 47, 247, 0.4)';
            ctx.shadowColor = '#7b2ff7';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(primary.position.x, primary.position.y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          break;
      }
    }

    // FPS counter (debug)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.fps} FPS`, w - 10, h - 10);
    ctx.restore();
  }

  // ─── UI Callbacks ───

  _bindUICallbacks() {
    this.holoUI.onToolChange = (tool) => {
      this.drawingEngine.setTool(tool);
      this.textPlacementMode = false;
      this.stickerPlacementMode = false;

      if (tool === ToolType.TEXT) {
        this._showTextModal();
      }
    };

    this.holoUI.onColorChange = (color) => {
      this.drawingEngine.setColor(color);
    };

    this.holoUI.onSizeChange = (size) => {
      this.drawingEngine.setBrushSize(size);
    };

    this.holoUI.onShapeChange = (shape) => {
      this.drawingEngine.setShape(shape);
    };

    this.holoUI.onStickerChange = (stickerKey) => {
      this.drawingEngine.setSticker(stickerKey);
      this.stickerPlacementMode = true;
      this.showToast(`Sticker selected: ${STICKER_MAP[stickerKey] || stickerKey}`);
    };

    this.holoUI.onCamFilterChange = (filter) => {
      this.activeCamFilter = filter;
      this.showToast(`Camera filter: ${filter}`);
    };

    this.holoUI.onFaceFilterChange = (filter) => {
      this.activeFaceFilter = filter;
      this.showToast(`Face filter: ${filter}`);
    };

    this.holoUI.onAction = (action) => {
      switch (action) {
        case 'photo':
          this._takePhoto();
          break;
        case 'record':
          this._toggleRecording();
          break;
        case 'clear':
          this.doodleManager.clearAll();
          this.showToast('Canvas cleared');
          break;
        case 'mirror':
          const mirrored = this.camera.toggleMirror();
          this.showToast(mirrored ? 'Camera mirrored' : 'Camera normal');
          break;
        case 'theme':
          const theme = this.themeManager.cycle();
          this.showToast(`Theme: ${this.themeManager.getThemeName()}`);
          break;
        case 'sound':
          const soundOn = this.holoUI.toggleSound();
          this.showToast(soundOn ? 'Sound ON' : 'Sound OFF');
          break;
      }
    };
  }

  // ─── Keyboard Shortcuts ───

  _bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Z = Undo
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        this.doodleManager.undo();
        this.showToast('Undo');
      }
      // Space = Take photo
      if (e.key === ' ' && !e.target.matches('input')) {
        e.preventDefault();
        this._takePhoto();
      }
      // Escape = Close panels / cancel
      if (e.key === 'Escape') {
        const textModal = document.getElementById('text-modal');
        if (!textModal.classList.contains('hidden')) {
          textModal.classList.add('hidden');
        }
      }
    });
  }

  // ─── Mouse/Touch Fallback for Drawing ───

  _bindMouseFallback() {
    const canvas = this.feedbackCanvas;
    let mouseDown = false;

    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = this.canvasWidth / rect.width;
      const scaleY = this.canvasHeight / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    canvas.addEventListener('mousedown', (e) => {
      if (e.target.closest('.holo-toolbar') || e.target.closest('.sub-panel')) return;
      mouseDown = true;
      const pos = getCanvasPos(e);

      if (this.drawingEngine.currentTool === ToolType.STICKERS && this.stickerPlacementMode) {
        const emoji = STICKER_MAP[this.drawingEngine.currentSticker] || '⭐';
        const doodle = this.drawingEngine.createStickerDoodle(emoji, pos);
        this.doodleManager.addDoodle(doodle);
        this.showToast('Sticker placed!');
        return;
      }

      this.drawingEngine.startStroke(pos);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const pos = getCanvasPos(e);
      this.drawingEngine.addPoint(pos);
    });

    canvas.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      const doodle = this.drawingEngine.endStroke();
      if (doodle) this.doodleManager.addDoodle(doodle);
    });

    canvas.addEventListener('mouseleave', () => {
      if (!mouseDown) return;
      mouseDown = false;
      const doodle = this.drawingEngine.endStroke();
      if (doodle) this.doodleManager.addDoodle(doodle);
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      mouseDown = true;
      const pos = getCanvasPos(e);

      if (this.drawingEngine.currentTool === ToolType.STICKERS && this.stickerPlacementMode) {
        const emoji = STICKER_MAP[this.drawingEngine.currentSticker] || '⭐';
        const doodle = this.drawingEngine.createStickerDoodle(emoji, pos);
        this.doodleManager.addDoodle(doodle);
        return;
      }

      this.drawingEngine.startStroke(pos);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!mouseDown) return;
      const pos = getCanvasPos(e);
      this.drawingEngine.addPoint(pos);
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      if (!mouseDown) return;
      mouseDown = false;
      const doodle = this.drawingEngine.endStroke();
      if (doodle) this.doodleManager.addDoodle(doodle);
    });
  }

  // ─── Actions ───

  async _takePhoto() {
    const result = await this.capture.takePhoto(this.sceneCanvas);
    if (result?.success) {
      this.showToast('📸 Photo saved!');
    }
  }

  async _toggleRecording() {
    if (this.capture.isRecording) {
      this.holoUI.setRecording(false);
      const result = await this.capture.stopRecording();
      if (result?.success) {
        this.showToast('🎬 Video saved!');
      }
    } else {
      this.capture.startRecording(this.sceneCanvas);
      this.holoUI.setRecording(true);
      this.showToast('🔴 Recording started...');
    }
  }

  _showTextModal() {
    const modal = document.getElementById('text-modal');
    const input = document.getElementById('text-input');
    const confirmBtn = document.getElementById('text-confirm');
    const cancelBtn = document.getElementById('text-cancel');

    modal.classList.remove('hidden');
    input.value = '';
    input.focus();

    const onConfirm = () => {
      const text = input.value.trim();
      if (text) {
        // Place text at center of canvas (will follow finger if in draw mode)
        const doodle = this.drawingEngine.createTextDoodle(
          text,
          { x: this.canvasWidth / 2, y: this.canvasHeight / 2 }
        );
        this.doodleManager.addDoodle(doodle);
        this.showToast(`Text added: "${text}"`);
      }
      modal.classList.add('hidden');
      cleanup();
    };

    const onCancel = () => {
      modal.classList.add('hidden');
      cleanup();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
  }

  // ─── Resize ───

  _handleResize() {
    // Canvas maintains video aspect ratio, fills the container
    const container = document.getElementById('canvas-container');
    if (!container) return;
    // Canvas size stays fixed to video resolution
    // CSS handles scaling to fill viewport
  }

  // ─── Toast Notification ───

  showToast(message) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2000);
  }
  _toastTimeout = null;

  // ─── Cleanup ───

  destroy() {
    this.isRunning = false;
    this.camera.destroy();
    this.handTracker.destroy();
  }
}

// ─── Start the app ───
const app = new DoodleCamApp();
app.init().catch(err => {
  console.error('Failed to start DoodleCam:', err);
});
