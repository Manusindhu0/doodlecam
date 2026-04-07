/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Filters Module
   Camera-wide filters + Face filters (procedural rendering)
   ═══════════════════════════════════════════════════════════════ */

export class Filters {
  constructor() {
    this.activeCamFilter = 'none';
    this.activeFaceFilter = 'none';
  }

  // ═══ Camera-Wide Filters ═══

  /**
   * Apply a camera-wide filter to the scene canvas
   * Called after drawing the video frame
   */
  applyCamFilter(ctx, width, height, filterName) {
    if (!filterName || filterName === 'none') return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    switch (filterName) {
      case 'grayscale':
        for (let i = 0; i < data.length; i += 4) {
          const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = avg;
        }
        break;

      case 'sepia':
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
        break;

      case 'invert':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        break;

      case 'neon':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.5);
          data[i + 1] = Math.min(255, data[i + 1] * 0.8);
          data[i + 2] = Math.min(255, data[i + 2] * 1.8);
        }
        break;

      case 'vintage':
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          data[i] = Math.min(255, r * 0.9 + 40);
          data[i + 1] = Math.min(255, g * 0.7 + 20);
          data[i + 2] = Math.min(255, b * 0.5 + 10);
        }
        // Add vignette
        this._applyVignette(ctx, width, height);
        break;

      case 'comic':
        // Posterize + edge enhance
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / 64) * 64;
          data[i + 1] = Math.round(data[i + 1] / 64) * 64;
          data[i + 2] = Math.round(data[i + 2] / 64) * 64;
        }
        break;

      case 'thermal':
        for (let i = 0; i < data.length; i += 4) {
          const intensity = (data[i] + data[i + 1] + data[i + 2]) / 3;
          // Map to thermal colors (blue → green → yellow → red)
          if (intensity < 85) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = intensity * 3;
          } else if (intensity < 170) {
            const t = (intensity - 85) / 85;
            data[i] = t * 255;
            data[i + 1] = 255 * t;
            data[i + 2] = 255 * (1 - t);
          } else {
            const t = (intensity - 170) / 85;
            data[i] = 255;
            data[i + 1] = 255 * (1 - t);
            data[i + 2] = 0;
          }
        }
        break;

      case 'pixelate': {
        const pixelSize = 8;
        for (let y = 0; y < height; y += pixelSize) {
          for (let x = 0; x < width; x += pixelSize) {
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            for (let py = 0; py < pixelSize && y + py < height; py++) {
              for (let px = 0; px < pixelSize && x + px < width; px++) {
                const pidx = ((y + py) * width + (x + px)) * 4;
                data[pidx] = r;
                data[pidx + 1] = g;
                data[pidx + 2] = b;
              }
            }
          }
        }
        break;
      }

      case 'blur':
        // Simple box blur (3x3)
        this._boxBlur(data, width, height);
        break;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  _applyVignette(ctx, width, height) {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, width * 0.3,
      width / 2, height / 2, width * 0.7
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  _boxBlur(data, width, height) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += copy[((y + dy) * width + (x + dx)) * 4 + c];
            }
          }
          data[(y * width + x) * 4 + c] = sum / 9;
        }
      }
    }
  }

  // ═══ Face Filters ═══

  /**
   * Render a face filter overlay using face landmarks
   */
  drawFaceFilter(ctx, faceResults, filterName, canvasWidth, canvasHeight, mirror) {
    if (!filterName || filterName === 'none') return;
    if (!faceResults?.faceLandmarks?.length) return;

    const landmarks = faceResults.faceLandmarks[0];

    // Convert landmarks to canvas coordinates
    const lm = (idx) => ({
      x: mirror ? canvasWidth - (landmarks[idx].x * canvasWidth) : landmarks[idx].x * canvasWidth,
      y: landmarks[idx].y * canvasHeight
    });

    // Key face points
    const leftEye = lm(33);    // Left eye outer
    const rightEye = lm(263);  // Right eye outer
    const leftEyeInner = lm(133);
    const rightEyeInner = lm(362);
    const noseTip = lm(1);
    const noseBridge = lm(6);
    const forehead = lm(10);
    const chin = lm(152);
    const leftCheek = lm(234);
    const rightCheek = lm(454);
    const mouthTop = lm(13);
    const mouthBottom = lm(14);
    const mouthLeft = lm(61);
    const mouthRight = lm(291);

    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    const faceHeight = Math.abs(chin.y - forehead.y);
    const eyeCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    };
    const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

    ctx.save();

    switch (filterName) {
      case 'glasses':
        this._drawGlasses(ctx, leftEye, rightEye, leftEyeInner, rightEyeInner, noseBridge, faceWidth, angle);
        break;
      case 'crown':
        this._drawCrown(ctx, forehead, faceWidth, angle);
        break;
      case 'cat':
        this._drawCatEars(ctx, forehead, faceWidth, faceHeight, angle);
        this._drawCatNose(ctx, noseTip);
        this._drawWhiskers(ctx, noseTip, faceWidth);
        break;
      case 'devil':
        this._drawDevilHorns(ctx, forehead, faceWidth, angle);
        break;
      case 'mustache':
        this._drawMustache(ctx, mouthTop, noseTip, faceWidth);
        break;
      case 'clown':
        this._drawClownNose(ctx, noseTip, faceWidth);
        this._drawClownMouth(ctx, mouthLeft, mouthRight, mouthBottom, faceWidth);
        break;
    }

    ctx.restore();
  }

  _drawGlasses(ctx, leftEye, rightEye, leftInner, rightInner, bridge, faceWidth, angle) {
    const lensSize = faceWidth * 0.22;

    ctx.save();
    ctx.translate((leftEye.x + rightEye.x) / 2, (leftEye.y + rightEye.y) / 2);
    ctx.rotate(angle);
    ctx.translate(-(leftEye.x + rightEye.x) / 2, -(leftEye.y + rightEye.y) / 2);

    // Left lens
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = faceWidth * 0.02;
    ctx.fillStyle = 'rgba(20, 20, 50, 0.5)';
    ctx.beginPath();
    ctx.ellipse(leftEye.x, leftEye.y, lensSize, lensSize * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right lens
    ctx.beginPath();
    ctx.ellipse(rightEye.x, rightEye.y, lensSize, lensSize * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bridge
    ctx.beginPath();
    ctx.moveTo(leftEye.x + lensSize * 0.7, leftEye.y);
    ctx.quadraticCurveTo(bridge.x, bridge.y - lensSize * 0.2,
                         rightEye.x - lensSize * 0.7, rightEye.y);
    ctx.stroke();

    // Lens shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.ellipse(leftEye.x - lensSize * 0.3, leftEye.y - lensSize * 0.3,
                lensSize * 0.25, lensSize * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawCrown(ctx, forehead, faceWidth, angle) {
    const crownWidth = faceWidth * 0.7;
    const crownHeight = faceWidth * 0.4;
    const cx = forehead.x;
    const cy = forehead.y - crownHeight * 0.7;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Crown body
    const gradient = ctx.createLinearGradient(0, -crownHeight / 2, 0, crownHeight / 2);
    gradient.addColorStop(0, '#ffd700');
    gradient.addColorStop(0.5, '#ffaa00');
    gradient.addColorStop(1, '#ff8800');

    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#cc8800';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(-crownWidth / 2, crownHeight * 0.3);
    ctx.lineTo(-crownWidth / 2, -crownHeight * 0.1);
    ctx.lineTo(-crownWidth * 0.25, crownHeight * 0.1);
    ctx.lineTo(0, -crownHeight * 0.5);
    ctx.lineTo(crownWidth * 0.25, crownHeight * 0.1);
    ctx.lineTo(crownWidth / 2, -crownHeight * 0.1);
    ctx.lineTo(crownWidth / 2, crownHeight * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gems
    ctx.fillStyle = '#ff0044';
    ctx.beginPath();
    ctx.arc(0, -crownHeight * 0.25, faceWidth * 0.03, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#00ccff';
    ctx.beginPath();
    ctx.arc(-crownWidth * 0.25, 0, faceWidth * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(crownWidth * 0.25, 0, faceWidth * 0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawCatEars(ctx, forehead, faceWidth, faceHeight, angle) {
    const earSize = faceWidth * 0.3;

    ctx.save();

    // Left ear
    ctx.fillStyle = '#555555';
    ctx.beginPath();
    ctx.moveTo(forehead.x - faceWidth * 0.35, forehead.y - faceHeight * 0.05);
    ctx.lineTo(forehead.x - faceWidth * 0.25, forehead.y - faceHeight * 0.5);
    ctx.lineTo(forehead.x - faceWidth * 0.05, forehead.y - faceHeight * 0.05);
    ctx.closePath();
    ctx.fill();

    // Left ear inner
    ctx.fillStyle = '#ff9999';
    ctx.beginPath();
    ctx.moveTo(forehead.x - faceWidth * 0.3, forehead.y - faceHeight * 0.08);
    ctx.lineTo(forehead.x - faceWidth * 0.25, forehead.y - faceHeight * 0.4);
    ctx.lineTo(forehead.x - faceWidth * 0.1, forehead.y - faceHeight * 0.08);
    ctx.closePath();
    ctx.fill();

    // Right ear
    ctx.fillStyle = '#555555';
    ctx.beginPath();
    ctx.moveTo(forehead.x + faceWidth * 0.35, forehead.y - faceHeight * 0.05);
    ctx.lineTo(forehead.x + faceWidth * 0.25, forehead.y - faceHeight * 0.5);
    ctx.lineTo(forehead.x + faceWidth * 0.05, forehead.y - faceHeight * 0.05);
    ctx.closePath();
    ctx.fill();

    // Right ear inner
    ctx.fillStyle = '#ff9999';
    ctx.beginPath();
    ctx.moveTo(forehead.x + faceWidth * 0.3, forehead.y - faceHeight * 0.08);
    ctx.lineTo(forehead.x + faceWidth * 0.25, forehead.y - faceHeight * 0.4);
    ctx.lineTo(forehead.x + faceWidth * 0.1, forehead.y - faceHeight * 0.08);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawCatNose(ctx, noseTip) {
    ctx.save();
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath();
    ctx.moveTo(noseTip.x, noseTip.y - 4);
    ctx.lineTo(noseTip.x - 6, noseTip.y + 4);
    ctx.lineTo(noseTip.x + 6, noseTip.y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawWhiskers(ctx, noseTip, faceWidth) {
    ctx.save();
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2;
    const whiskerLen = faceWidth * 0.35;

    // Left whiskers
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(noseTip.x - 10, noseTip.y + i * 8);
      ctx.lineTo(noseTip.x - whiskerLen, noseTip.y + i * 15 - 5);
      ctx.stroke();
    }

    // Right whiskers
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(noseTip.x + 10, noseTip.y + i * 8);
      ctx.lineTo(noseTip.x + whiskerLen, noseTip.y + i * 15 - 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawDevilHorns(ctx, forehead, faceWidth, angle) {
    const hornHeight = faceWidth * 0.45;

    ctx.save();

    // Left horn
    const gradient1 = ctx.createLinearGradient(
      forehead.x - faceWidth * 0.25, forehead.y,
      forehead.x - faceWidth * 0.25, forehead.y - hornHeight
    );
    gradient1.addColorStop(0, '#8b0000');
    gradient1.addColorStop(1, '#ff4444');

    ctx.fillStyle = gradient1;
    ctx.beginPath();
    ctx.moveTo(forehead.x - faceWidth * 0.1, forehead.y - faceWidth * 0.05);
    ctx.quadraticCurveTo(
      forehead.x - faceWidth * 0.4, forehead.y - hornHeight * 0.5,
      forehead.x - faceWidth * 0.2, forehead.y - hornHeight
    );
    ctx.quadraticCurveTo(
      forehead.x - faceWidth * 0.15, forehead.y - hornHeight * 0.5,
      forehead.x + faceWidth * 0.05, forehead.y - faceWidth * 0.05
    );
    ctx.closePath();
    ctx.fill();

    // Right horn
    const gradient2 = ctx.createLinearGradient(
      forehead.x + faceWidth * 0.25, forehead.y,
      forehead.x + faceWidth * 0.25, forehead.y - hornHeight
    );
    gradient2.addColorStop(0, '#8b0000');
    gradient2.addColorStop(1, '#ff4444');

    ctx.fillStyle = gradient2;
    ctx.beginPath();
    ctx.moveTo(forehead.x + faceWidth * 0.1, forehead.y - faceWidth * 0.05);
    ctx.quadraticCurveTo(
      forehead.x + faceWidth * 0.4, forehead.y - hornHeight * 0.5,
      forehead.x + faceWidth * 0.2, forehead.y - hornHeight
    );
    ctx.quadraticCurveTo(
      forehead.x + faceWidth * 0.15, forehead.y - hornHeight * 0.5,
      forehead.x - faceWidth * 0.05, forehead.y - faceWidth * 0.05
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawMustache(ctx, mouthTop, noseTip, faceWidth) {
    ctx.save();
    const mx = (mouthTop.x + noseTip.x) / 2;
    const my = (mouthTop.y + noseTip.y) / 2 + 5;
    const width = faceWidth * 0.35;

    ctx.fillStyle = '#3d2b1f';

    // Left side
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx - width * 0.5, my - 12, mx - width, my + 5);
    ctx.quadraticCurveTo(mx - width * 0.5, my + 5, mx, my + 3);
    ctx.closePath();
    ctx.fill();

    // Right side
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx + width * 0.5, my - 12, mx + width, my + 5);
    ctx.quadraticCurveTo(mx + width * 0.5, my + 5, mx, my + 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawClownNose(ctx, noseTip, faceWidth) {
    ctx.save();
    const radius = faceWidth * 0.08;

    const gradient = ctx.createRadialGradient(
      noseTip.x - radius * 0.3, noseTip.y - radius * 0.3, 0,
      noseTip.x, noseTip.y, radius
    );
    gradient.addColorStop(0, '#ff6666');
    gradient.addColorStop(1, '#cc0000');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(noseTip.x, noseTip.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(noseTip.x - radius * 0.3, noseTip.y - radius * 0.3,
                radius * 0.3, radius * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawClownMouth(ctx, mouthLeft, mouthRight, mouthBottom, faceWidth) {
    ctx.save();
    const cx = (mouthLeft.x + mouthRight.x) / 2;
    const w = faceWidth * 0.3;

    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(cx - w, mouthBottom.y - 5);
    ctx.quadraticCurveTo(cx, mouthBottom.y + w * 0.6, cx + w, mouthBottom.y - 5);
    ctx.quadraticCurveTo(cx, mouthBottom.y + w * 0.3, cx - w, mouthBottom.y - 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
