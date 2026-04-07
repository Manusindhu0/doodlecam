/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Drawing Engine
   Handles freehand paths, shapes, text, and rendering
   ═══════════════════════════════════════════════════════════════ */

export const ToolType = {
  PEN: 'pen',
  SHAPES: 'shapes',
  TEXT: 'text',
  STICKERS: 'stickers',
  ERASER: 'eraser'
};

export const ShapeType = {
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ARROW: 'arrow',
  LINE: 'line',
  STAR: 'star'
};

export class DrawingEngine {
  constructor() {
    this.currentTool = ToolType.PEN;
    this.currentColor = '#00f5d4';
    this.brushSize = 6;
    this.currentShape = ShapeType.RECTANGLE;
    this.currentSticker = 'heart';

    // Active stroke state
    this.isDrawing = false;
    this.currentPath = [];
    this.shapeStart = null;
    this.shapeEnd = null;

    // Glow effect for neon drawing
    this.glowEnabled = true;
  }

  setTool(tool) {
    this.currentTool = tool;
    this.cancelStroke();
  }

  setColor(color) {
    this.currentColor = color;
  }

  setBrushSize(size) {
    this.brushSize = size;
  }

  setShape(shape) {
    this.currentShape = shape;
  }

  setSticker(sticker) {
    this.currentSticker = sticker;
  }

  // ─── Stroke Management ───

  startStroke(point) {
    this.isDrawing = true;

    if (this.currentTool === ToolType.PEN || this.currentTool === ToolType.ERASER) {
      this.currentPath = [{ ...point }];
    } else if (this.currentTool === ToolType.SHAPES) {
      this.shapeStart = { ...point };
      this.shapeEnd = { ...point };
    }
  }

  addPoint(point) {
    if (!this.isDrawing) return;

    if (this.currentTool === ToolType.PEN || this.currentTool === ToolType.ERASER) {
      this.currentPath.push({ ...point });
    } else if (this.currentTool === ToolType.SHAPES) {
      this.shapeEnd = { ...point };
    }
  }

  endStroke() {
    if (!this.isDrawing) return null;
    this.isDrawing = false;

    let doodle = null;

    if (this.currentTool === ToolType.PEN && this.currentPath.length > 1) {
      doodle = {
        type: 'path',
        points: [...this.currentPath],
        color: this.currentColor,
        size: this.brushSize,
        glow: this.glowEnabled
      };
    } else if (this.currentTool === ToolType.SHAPES && this.shapeStart && this.shapeEnd) {
      doodle = {
        type: 'shape',
        shapeType: this.currentShape,
        start: { ...this.shapeStart },
        end: { ...this.shapeEnd },
        color: this.currentColor,
        size: this.brushSize,
        glow: this.glowEnabled
      };
    }

    this.currentPath = [];
    this.shapeStart = null;
    this.shapeEnd = null;

    return doodle;
  }

  cancelStroke() {
    this.isDrawing = false;
    this.currentPath = [];
    this.shapeStart = null;
    this.shapeEnd = null;
  }

  createTextDoodle(text, position) {
    return {
      type: 'text',
      text,
      position: { ...position },
      color: this.currentColor,
      size: Math.max(this.brushSize * 4, 24),
      glow: this.glowEnabled
    };
  }

  createStickerDoodle(emoji, position) {
    return {
      type: 'sticker',
      emoji,
      position: { ...position },
      size: 60
    };
  }

  // ─── Rendering ───

  /**
   * Render the current in-progress stroke (preview)
   */
  renderPreview(ctx) {
    if (!this.isDrawing) return;

    if (this.currentTool === ToolType.PEN && this.currentPath.length > 1) {
      this._renderPath(ctx, this.currentPath, this.currentColor, this.brushSize, this.glowEnabled);
    } else if (this.currentTool === ToolType.SHAPES && this.shapeStart && this.shapeEnd) {
      this._renderShape(ctx, {
        shapeType: this.currentShape,
        start: this.shapeStart,
        end: this.shapeEnd,
        color: this.currentColor,
        size: this.brushSize,
        glow: this.glowEnabled
      });
    }
  }

  /**
   * Render a completed doodle object
   */
  renderDoodle(ctx, doodle) {
    switch (doodle.type) {
      case 'path':
        this._renderPath(ctx, doodle.points, doodle.color, doodle.size, doodle.glow);
        break;
      case 'shape':
        this._renderShape(ctx, doodle);
        break;
      case 'text':
        this._renderText(ctx, doodle);
        break;
      case 'sticker':
        this._renderSticker(ctx, doodle);
        break;
    }
  }

  // ─── Private Render Methods ───

  _renderPath(ctx, points, color, size, glow) {
    if (points.length < 2) return;

    ctx.save();

    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 2;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // Use quadratic curves for smooth lines
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      // Last segment
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  _renderShape(ctx, shape) {
    ctx.save();

    if (shape.glow) {
      ctx.shadowColor = shape.color;
      ctx.shadowBlur = shape.size * 2;
    }

    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { start, end, shapeType } = shape;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.beginPath();

    switch (shapeType) {
      case ShapeType.RECTANGLE:
        ctx.rect(x, y, w, h);
        break;

      case ShapeType.CIRCLE:
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rx = w / 2;
        const ry = h / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        break;

      case ShapeType.LINE:
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        break;

      case ShapeType.ARROW:
        this._drawArrow(ctx, start.x, start.y, end.x, end.y, shape.size);
        break;

      case ShapeType.STAR:
        this._drawStar(ctx, (start.x + end.x) / 2, (start.y + end.y) / 2, Math.min(w, h) / 2, 5);
        break;
    }

    ctx.stroke();
    ctx.restore();
  }

  _drawArrow(ctx, fromX, fromY, toX, toY, lineWidth) {
    const headLen = lineWidth * 4;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
  }

  _drawStar(ctx, cx, cy, radius, spikes) {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    const outerRadius = radius;
    const innerRadius = radius * 0.4;

    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }

    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  _renderText(ctx, doodle) {
    ctx.save();

    if (doodle.glow) {
      ctx.shadowColor = doodle.color;
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = doodle.color;
    ctx.font = `bold ${doodle.size}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(doodle.text, doodle.position.x, doodle.position.y);

    ctx.restore();
  }

  _renderSticker(ctx, doodle) {
    ctx.save();
    ctx.font = `${doodle.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(doodle.emoji, doodle.position.x, doodle.position.y);
    ctx.restore();
  }

  /**
   * Get bounding box of a doodle for hit testing
   */
  getBoundingBox(doodle) {
    switch (doodle.type) {
      case 'path': {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of doodle.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const pad = doodle.size;
        return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
      }
      case 'shape': {
        const x = Math.min(doodle.start.x, doodle.end.x);
        const y = Math.min(doodle.start.y, doodle.end.y);
        const w = Math.abs(doodle.end.x - doodle.start.x);
        const h = Math.abs(doodle.end.y - doodle.start.y);
        return { x, y, w, h };
      }
      case 'text': {
        const est = doodle.size * doodle.text.length * 0.6;
        return {
          x: doodle.position.x - est / 2,
          y: doodle.position.y - doodle.size / 2,
          w: est,
          h: doodle.size
        };
      }
      case 'sticker': {
        const s = doodle.size;
        return {
          x: doodle.position.x - s / 2,
          y: doodle.position.y - s / 2,
          w: s,
          h: s
        };
      }
      default:
        return { x: 0, y: 0, w: 0, h: 0 };
    }
  }
}
