/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Hand Tracker Module
   MediaPipe HandLandmarker + FaceLandmarker integration
   ═══════════════════════════════════════════════════════════════ */

import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

export class HandTracker {
  constructor() {
    this.handLandmarker = null;
    this.faceLandmarker = null;
    this.isReady = false;
    this.faceReady = false;
    this.lastTimestamp = -1;
    this.handResults = null;
    this.faceResults = null;
  }

  async init(onProgress) {
    try {
      if (onProgress) onProgress('Loading AI vision models...');
      console.log('[HandTracker] Loading FilesetResolver...');

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      console.log('[HandTracker] FilesetResolver loaded, creating HandLandmarker...');
      if (onProgress) onProgress('Initializing hand tracker...');

      // Create Hand Landmarker (required — this is the core feature)
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
          delegate: 'CPU'
        },
        numHands: 2,
        runningMode: 'VIDEO',
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      console.log('[HandTracker] HandLandmarker ready!');
      this.isReady = true;
      if (onProgress) onProgress('Hand tracking ready!');

      // Load Face Landmarker IN THE BACKGROUND (don't block app startup)
      this._loadFaceTrackerAsync(vision);

    } catch (err) {
      console.error('[HandTracker] Init error:', err);
      throw new Error('Failed to load hand tracking model: ' + err.message);
    }
  }

  async _loadFaceTrackerAsync(vision) {
    try {
      console.log('[HandTracker] Loading FaceLandmarker in background...');
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
          delegate: 'CPU'
        },
        numFaces: 1,
        runningMode: 'VIDEO',
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      this.faceReady = true;
      console.log('[HandTracker] FaceLandmarker ready! (background load complete)');
    } catch (faceErr) {
      console.warn('[HandTracker] FaceLandmarker failed (face filters unavailable):', faceErr.message);
      this.faceLandmarker = null;
      this.faceReady = false;
    }
  }

  detect(videoElement, timestamp) {
    if (!this.isReady || !videoElement || videoElement.readyState < 2) {
      return { hands: null, faces: null };
    }

    // Ensure timestamp is unique and advancing
    const ts = Math.round(timestamp || performance.now());
    if (ts <= this.lastTimestamp) {
      return { hands: this.handResults, faces: this.faceResults };
    }
    this.lastTimestamp = ts;

    try {
      this.handResults = this.handLandmarker.detectForVideo(videoElement, ts);
    } catch (err) {
      // Silently handle
    }

    try {
      if (this.faceReady && this.faceLandmarker) {
        this.faceResults = this.faceLandmarker.detectForVideo(videoElement, ts);
      }
    } catch (err) {
      // Silently handle face detection errors
    }

    return {
      hands: this.handResults,
      faces: this.faceResults
    };
  }

  hasHands() {
    return this.handResults &&
           this.handResults.landmarks &&
           this.handResults.landmarks.length > 0;
  }

  hasFaces() {
    return this.faceResults &&
           this.faceResults.faceLandmarks &&
           this.faceResults.faceLandmarks.length > 0;
  }

  getHandCount() {
    if (!this.hasHands()) return 0;
    return this.handResults.landmarks.length;
  }

  destroy() {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    this.isReady = false;
    this.faceReady = false;
  }
}
