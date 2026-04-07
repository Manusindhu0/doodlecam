/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Holographic UI Controller
   Manages toolbar state, sub-panels, and gesture-based interaction
   ═══════════════════════════════════════════════════════════════ */

export class HoloUI {
  constructor() {
    this.activeTool = 'pen';
    this.activeColor = '#00f5d4';
    this.activeSize = 6;
    this.activeShape = 'rectangle';
    this.activeSticker = 'heart';
    this.activeCamFilter = 'none';
    this.activeFaceFilter = 'none';
    this.soundEnabled = true;
    this.openPanel = null;

    // Callbacks
    this.onToolChange = null;
    this.onColorChange = null;
    this.onSizeChange = null;
    this.onShapeChange = null;
    this.onStickerChange = null;
    this.onCamFilterChange = null;
    this.onFaceFilterChange = null;
    this.onAction = null; // For photo, record, clear, mirror, theme

    // Dwell hover state for gesture interaction
    this.hoveredElement = null;
    this.hoverStartTime = 0;
    this.dwellTime = 600; // ms

    // DOM refs
    this.toolbar = null;
    this.panels = {};
  }

  init() {
    this.toolbar = document.getElementById('holo-toolbar');
    this.panels = {
      shapes: document.getElementById('panel-shapes'),
      color: document.getElementById('panel-color'),
      size: document.getElementById('panel-size'),
      'cam-filter': document.getElementById('panel-cam-filter'),
      'face-filter': document.getElementById('panel-face-filter'),
      stickers: document.getElementById('panel-stickers')
    };

    this._bindEvents();
  }

  _bindEvents() {
    // Tool buttons (mouse/touch fallback)
    this.toolbar.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = btn.dataset.tool;
        if (tool) this._handleToolClick(tool, btn);
      });
    });

    // Shape buttons
    this.panels.shapes?.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels.shapes, '.shape-btn', btn);
        this.activeShape = btn.dataset.shape;
        if (this.onShapeChange) this.onShapeChange(this.activeShape);
      });
    });

    // Color swatches
    this.panels.color?.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels.color, '.color-swatch', btn);
        this.activeColor = btn.dataset.color;
        document.getElementById('color-preview').style.background = this.activeColor;
        if (this.onColorChange) this.onColorChange(this.activeColor);
      });
    });

    // Size buttons
    this.panels.size?.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels.size, '.size-btn', btn);
        this.activeSize = parseInt(btn.dataset.size);
        if (this.onSizeChange) this.onSizeChange(this.activeSize);
      });
    });

    // Camera filter buttons
    this.panels['cam-filter']?.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels['cam-filter'], '.filter-btn', btn);
        this.activeCamFilter = btn.dataset.filter;
        if (this.onCamFilterChange) this.onCamFilterChange(this.activeCamFilter);
      });
    });

    // Face filter buttons
    this.panels['face-filter']?.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels['face-filter'], '.filter-btn', btn);
        this.activeFaceFilter = btn.dataset.face;
        if (this.onFaceFilterChange) this.onFaceFilterChange(this.activeFaceFilter);
      });
    });

    // Sticker buttons
    this.panels.stickers?.querySelectorAll('.sticker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectInGroup(this.panels.stickers, '.sticker-btn', btn);
        this.activeSticker = btn.dataset.sticker;
        if (this.onStickerChange) this.onStickerChange(this.activeSticker);
      });
    });

    // Close panels when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sub-panel') && !e.target.closest('.tool-btn')) {
        this._closeAllPanels();
      }
    });
  }

  _handleToolClick(tool, btn) {
    switch (tool) {
      case 'pen':
      case 'eraser':
        this._setActiveTool(tool, btn);
        this._closeAllPanels();
        break;

      case 'shapes':
        this._setActiveTool(tool, btn);
        this._togglePanel('shapes');
        break;

      case 'text':
        this._setActiveTool(tool, btn);
        this._closeAllPanels();
        break;

      case 'stickers':
        this._setActiveTool(tool, btn);
        this._togglePanel('stickers');
        break;

      case 'color':
        this._togglePanel('color');
        break;

      case 'size':
        this._togglePanel('size');
        break;

      case 'cam-filter':
        this._togglePanel('cam-filter');
        break;

      case 'face-filter':
        this._togglePanel('face-filter');
        break;

      // Action buttons
      case 'photo':
      case 'record':
      case 'clear':
      case 'mirror':
      case 'theme':
      case 'sound':
        this._closeAllPanels();
        if (this.onAction) this.onAction(tool);
        break;
    }
  }

  _setActiveTool(tool, btn) {
    // Remove active from all tool buttons
    this.toolbar.querySelectorAll('.tool-btn').forEach(b => {
      if (!['color', 'size', 'cam-filter', 'face-filter', 'photo', 'record', 'mirror', 'sound', 'theme', 'clear'].includes(b.dataset.tool)) {
        b.classList.remove('active');
      }
    });
    btn.classList.add('active');
    this.activeTool = tool;
    if (this.onToolChange) this.onToolChange(tool);
  }

  _togglePanel(panelName) {
    const panel = this.panels[panelName];
    if (!panel) return;

    if (this.openPanel === panelName) {
      this._closeAllPanels();
    } else {
      this._closeAllPanels();
      panel.classList.remove('hidden');
      this.openPanel = panelName;
    }
  }

  _closeAllPanels() {
    Object.values(this.panels).forEach(p => {
      if (p) p.classList.add('hidden');
    });
    this.openPanel = null;
  }

  _selectInGroup(container, selector, activeBtn) {
    container.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
    this._playClickSound();
  }

  // ─── Gesture-based Hover System ───

  handleGestureHover(fingerPos) {
    if (!fingerPos) {
      this._clearHover();
      return null;
    }

    // Find which button the finger is over
    const allButtons = this.toolbar.querySelectorAll('.tool-btn');
    let hitBtn = null;

    for (const btn of allButtons) {
      const rect = btn.getBoundingClientRect();
      if (fingerPos.x >= rect.left && fingerPos.x <= rect.right &&
          fingerPos.y >= rect.top && fingerPos.y <= rect.bottom) {
        hitBtn = btn;
        break;
      }
    }

    // Also check open panel buttons
    if (!hitBtn && this.openPanel) {
      const panel = this.panels[this.openPanel];
      if (panel) {
        const panelBtns = panel.querySelectorAll('button');
        for (const btn of panelBtns) {
          const rect = btn.getBoundingClientRect();
          if (fingerPos.x >= rect.left && fingerPos.x <= rect.right &&
              fingerPos.y >= rect.top && fingerPos.y <= rect.bottom) {
            hitBtn = btn;
            break;
          }
        }
      }
    }

    if (hitBtn) {
      if (hitBtn !== this.hoveredElement) {
        this._clearHover();
        this.hoveredElement = hitBtn;
        this.hoverStartTime = Date.now();
        hitBtn.classList.add('gesture-hover');
      } else {
        // Check dwell time
        const elapsed = Date.now() - this.hoverStartTime;
        if (elapsed >= this.dwellTime) {
          // Trigger click
          hitBtn.click();
          this._playClickSound();
          this._clearHover();
          return hitBtn;
        }
      }
    } else {
      this._clearHover();
    }

    return null;
  }

  _clearHover() {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove('gesture-hover');
      this.hoveredElement = null;
    }
    this.hoverStartTime = 0;
  }

  /**
   * Get all interactive button rects for gesture engine overlap detection
   */
  getUIBounds() {
    const bounds = [];
    const toolbarRect = this.toolbar.getBoundingClientRect();

    // Toolbar region
    bounds.push({
      element: this.toolbar,
      rect: toolbarRect
    });

    // Open panel region
    if (this.openPanel && this.panels[this.openPanel]) {
      bounds.push({
        element: this.panels[this.openPanel],
        rect: this.panels[this.openPanel].getBoundingClientRect()
      });
    }

    return bounds;
  }

  setRecording(isRecording) {
    const btn = document.getElementById('btn-record');
    if (isRecording) {
      btn.classList.add('recording');
    } else {
      btn.classList.remove('recording');
    }
  }

  _playClickSound() {
    if (!this.soundEnabled) return;
    // Simple click sound using Web Audio API
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      // Audio not available
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }
}

// Sticker emoji map
export const STICKER_MAP = {
  heart: '❤️',
  star: '⭐',
  fire: '🔥',
  sparkles: '✨',
  rainbow: '🌈',
  crown: '👑',
  sunglasses: '😎',
  party: '🎉',
  rocket: '🚀',
  lightning: '⚡',
  diamond: '💎',
  rose: '🌹',
  skull: '💀',
  alien: '👽',
  ghost: '👻',
  butterfly: '🦋',
  peace: '✌️',
  100: '💯'
};
