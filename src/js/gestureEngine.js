/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Gesture Engine
   Interprets hand landmarks into gestures:
     - Index finger point → DRAW
     - Pinch (thumb+index) → MOVE
     - Open palm → ERASE
     - Finger on UI → UI_HOVER
   ═══════════════════════════════════════════════════════════════ */

// MediaPipe hand landmark indices
const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

const FINGERTIP_IDS = [
  LANDMARKS.THUMB_TIP,
  LANDMARKS.INDEX_TIP,
  LANDMARKS.MIDDLE_TIP,
  LANDMARKS.RING_TIP,
  LANDMARKS.PINKY_TIP
];

export const GestureType = {
  NONE: 'NONE',
  DRAW: 'DRAW',
  MOVE: 'MOVE',
  ERASE: 'ERASE',
  UI_HOVER: 'UI_HOVER'
};

export class GestureEngine {
  constructor() {
    this.pinchThreshold = 0.06;
    this.drawSmoothingAlpha = 0.4;
    this.lastSmoothedPos = null;
    this.gestureHistory = [];
    this.historySize = 5;
    this.uiBounds = []; // Array of { element, rect }
    this.prevGesture = GestureType.NONE;
    this.pinchStartPos = null;
    this.lastPinchPos = null;
  }

  /**
   * Analyze hand landmarks and determine current gesture
   * @param {Object} handResults - MediaPipe hand detection results
   * @param {number} canvasWidth 
   * @param {number} canvasHeight 
   * @param {boolean} mirror - Whether camera is mirrored
   * @returns {Object} gesture data
   */
  analyze(handResults, canvasWidth, canvasHeight, mirror = true) {
    const result = {
      type: GestureType.NONE,
      hands: [],
      primaryHand: null
    };

    if (!handResults || !handResults.landmarks || handResults.landmarks.length === 0) {
      this.lastSmoothedPos = null;
      this.pinchStartPos = null;
      this.lastPinchPos = null;
      this.prevGesture = GestureType.NONE;
      return result;
    }

    // Process each hand
    for (let i = 0; i < handResults.landmarks.length; i++) {
      const landmarks = handResults.landmarks[i];
      const handedness = handResults.handedness[i]?.[0]?.categoryName || 'Right';

      const handData = this._analyzeHand(landmarks, handedness, canvasWidth, canvasHeight, mirror);
      result.hands.push(handData);
    }

    // Primary hand = first hand (usually dominant)
    result.primaryHand = result.hands[0];
    result.type = result.primaryHand.gesture;

    // If we have 2 hands, the second can control UI while first draws
    if (result.hands.length > 1) {
      const secondHand = result.hands[1];
      // Check if second hand's index finger is over UI
      const uiHit = this._checkUIHover(secondHand.fingerTips[1], canvasWidth, canvasHeight);
      if (uiHit) {
        secondHand.gesture = GestureType.UI_HOVER;
        secondHand.hoveredElement = uiHit;
      }
    }

    this.prevGesture = result.type;
    return result;
  }

  _analyzeHand(landmarks, handedness, cw, ch, mirror) {
    const fingers = this._getFingerStates(landmarks, handedness);
    const fingerTips = this._getFingerTipPositions(landmarks, cw, ch, mirror);
    const palmCenter = this._getPalmCenter(landmarks, cw, ch, mirror);
    const palmRadius = this._getPalmRadius(landmarks, cw, ch);

    let gesture = GestureType.NONE;
    let position = null;
    let delta = null;

    // Check for PINCH (thumb + index close)
    const pinchDist = this._distance2D(landmarks[LANDMARKS.THUMB_TIP], landmarks[LANDMARKS.INDEX_TIP]);

    if (pinchDist < this.pinchThreshold) {
      gesture = GestureType.MOVE;
      const rawPos = this._toCanvas(
        (landmarks[LANDMARKS.THUMB_TIP].x + landmarks[LANDMARKS.INDEX_TIP].x) / 2,
        (landmarks[LANDMARKS.THUMB_TIP].y + landmarks[LANDMARKS.INDEX_TIP].y) / 2,
        cw, ch, mirror
      );
      position = rawPos;

      // Calculate delta for moving
      if (this.lastPinchPos) {
        delta = {
          x: rawPos.x - this.lastPinchPos.x,
          y: rawPos.y - this.lastPinchPos.y
        };
      } else {
        delta = { x: 0, y: 0 };
      }
      this.lastPinchPos = rawPos;

      if (!this.pinchStartPos) {
        this.pinchStartPos = rawPos;
      }
    }
    // Check for OPEN PALM (all fingers extended)
    else if (fingers.thumb && fingers.index && fingers.middle && fingers.ring && fingers.pinky) {
      gesture = GestureType.ERASE;
      position = palmCenter;
      this.lastPinchPos = null;
      this.pinchStartPos = null;
    }
    // Check for INDEX POINTING (only index extended)
    else if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      // First check if hovering over UI
      const uiHit = this._checkUIHover(fingerTips[1], cw, ch);
      if (uiHit) {
        gesture = GestureType.UI_HOVER;
        position = fingerTips[1];
      } else {
        gesture = GestureType.DRAW;
        // Smooth the position
        const rawPos = fingerTips[1]; // Index tip
        if (this.lastSmoothedPos) {
          position = {
            x: this.lastSmoothedPos.x + (rawPos.x - this.lastSmoothedPos.x) * this.drawSmoothingAlpha,
            y: this.lastSmoothedPos.y + (rawPos.y - this.lastSmoothedPos.y) * this.drawSmoothingAlpha
          };
        } else {
          position = rawPos;
        }
        this.lastSmoothedPos = position;
      }
      this.lastPinchPos = null;
      this.pinchStartPos = null;
    }
    else {
      this.lastSmoothedPos = null;
      this.lastPinchPos = null;
      this.pinchStartPos = null;
    }

    return {
      gesture,
      position,
      delta,
      fingerTips,
      palmCenter,
      palmRadius,
      fingers,
      handedness,
      landmarks,
      hoveredElement: null
    };
  }

  _getFingerStates(landmarks, handedness) {
    // For thumb: compare x positions (depends on handedness)
    // Note: MediaPipe handedness is from the camera's perspective (mirrored)
    const isRightHand = handedness === 'Right';
    const thumbExtended = isRightHand
      ? landmarks[LANDMARKS.THUMB_TIP].x < landmarks[LANDMARKS.THUMB_IP].x
      : landmarks[LANDMARKS.THUMB_TIP].x > landmarks[LANDMARKS.THUMB_IP].x;

    // For other fingers: tip.y < pip.y means extended (y=0 is top)
    return {
      thumb: thumbExtended,
      index: landmarks[LANDMARKS.INDEX_TIP].y < landmarks[LANDMARKS.INDEX_PIP].y,
      middle: landmarks[LANDMARKS.MIDDLE_TIP].y < landmarks[LANDMARKS.MIDDLE_PIP].y,
      ring: landmarks[LANDMARKS.RING_TIP].y < landmarks[LANDMARKS.RING_PIP].y,
      pinky: landmarks[LANDMARKS.PINKY_TIP].y < landmarks[LANDMARKS.PINKY_PIP].y
    };
  }

  _getFingerTipPositions(landmarks, cw, ch, mirror) {
    return FINGERTIP_IDS.map(id =>
      this._toCanvas(landmarks[id].x, landmarks[id].y, cw, ch, mirror)
    );
  }

  _getPalmCenter(landmarks, cw, ch, mirror) {
    // Average of wrist and MCP joints
    const palmLandmarks = [
      LANDMARKS.WRIST,
      LANDMARKS.INDEX_MCP,
      LANDMARKS.MIDDLE_MCP,
      LANDMARKS.RING_MCP,
      LANDMARKS.PINKY_MCP
    ];
    let sumX = 0, sumY = 0;
    for (const id of palmLandmarks) {
      sumX += landmarks[id].x;
      sumY += landmarks[id].y;
    }
    return this._toCanvas(
      sumX / palmLandmarks.length,
      sumY / palmLandmarks.length,
      cw, ch, mirror
    );
  }

  _getPalmRadius(landmarks, cw, ch) {
    // Distance from wrist to middle MCP as a proxy for palm size
    const dx = (landmarks[LANDMARKS.WRIST].x - landmarks[LANDMARKS.MIDDLE_MCP].x) * cw;
    const dy = (landmarks[LANDMARKS.WRIST].y - landmarks[LANDMARKS.MIDDLE_MCP].y) * ch;
    return Math.sqrt(dx * dx + dy * dy) * 0.8;
  }

  _toCanvas(nx, ny, cw, ch, mirror) {
    return {
      x: mirror ? cw - (nx * cw) : nx * cw,
      y: ny * ch
    };
  }

  _distance2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Register UI element bounds for hover detection
   */
  setUIBounds(bounds) {
    this.uiBounds = bounds;
  }

  _checkUIHover(fingerPos, cw, ch) {
    if (!fingerPos || this.uiBounds.length === 0) return null;

    for (const item of this.uiBounds) {
      const r = item.rect;
      if (fingerPos.x >= r.left && fingerPos.x <= r.right &&
          fingerPos.y >= r.top && fingerPos.y <= r.bottom) {
        return item.element;
      }
    }
    return null;
  }

  /**
   * Get all 5 fingertip positions for visual dots
   */
  getAllFingerTips(handResults, canvasWidth, canvasHeight, mirror) {
    const tips = [];
    if (!handResults?.landmarks) return tips;

    for (const landmarks of handResults.landmarks) {
      const handTips = FINGERTIP_IDS.map(id =>
        this._toCanvas(landmarks[id].x, landmarks[id].y, canvasWidth, canvasHeight, mirror)
      );
      tips.push(handTips);
    }
    return tips;
  }
}
