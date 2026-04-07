/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Doodle Manager
   Manages collection of doodle objects with move/erase/undo
   ═══════════════════════════════════════════════════════════════ */

import { DrawingEngine } from './drawingEngine.js';

export class DoodleManager {
  constructor(drawingEngine) {
    this.doodles = [];
    this.drawingEngine = drawingEngine;
    this.selectedId = null;
    this.undoStack = [];
    this.maxUndo = 30;
    this.nextId = 1;
  }

  addDoodle(doodle) {
    if (!doodle) return;
    doodle.id = this.nextId++;
    this.doodles.push(doodle);

    // Push to undo stack
    this.undoStack.push({ action: 'add', id: doodle.id });
    if (this.undoStack.length > this.maxUndo) {
      this.undoStack.shift();
    }

    return doodle.id;
  }

  removeDoodle(id) {
    const index = this.doodles.findIndex(d => d.id === id);
    if (index !== -1) {
      const removed = this.doodles.splice(index, 1)[0];
      this.undoStack.push({ action: 'remove', doodle: removed });
      if (this.selectedId === id) this.selectedId = null;
      return true;
    }
    return false;
  }

  /**
   * Find the nearest doodle to a point
   */
  findDoodleAt(point) {
    // Search from top (last drawn) to bottom
    for (let i = this.doodles.length - 1; i >= 0; i--) {
      const doodle = this.doodles[i];
      const bb = this.drawingEngine.getBoundingBox(doodle);

      if (point.x >= bb.x && point.x <= bb.x + bb.w &&
          point.y >= bb.y && point.y <= bb.y + bb.h) {
        return doodle;
      }
    }
    return null;
  }

  /**
   * Select a doodle for moving
   */
  selectAt(point) {
    const doodle = this.findDoodleAt(point);
    this.selectedId = doodle ? doodle.id : null;
    return doodle;
  }

  /**
   * Move the selected doodle by delta
   */
  moveSelected(delta) {
    if (!this.selectedId || !delta) return;
    const doodle = this.doodles.find(d => d.id === this.selectedId);
    if (!doodle) return;

    this._moveDoodle(doodle, delta);
  }

  _moveDoodle(doodle, delta) {
    switch (doodle.type) {
      case 'path':
        for (const point of doodle.points) {
          point.x += delta.x;
          point.y += delta.y;
        }
        break;
      case 'shape':
        doodle.start.x += delta.x;
        doodle.start.y += delta.y;
        doodle.end.x += delta.x;
        doodle.end.y += delta.y;
        break;
      case 'text':
      case 'sticker':
        doodle.position.x += delta.x;
        doodle.position.y += delta.y;
        break;
    }
  }

  /**
   * Erase all doodles within radius of a point
   */
  eraseAt(point, radius) {
    const toRemove = [];
    const r = radius || 40;

    for (const doodle of this.doodles) {
      const bb = this.drawingEngine.getBoundingBox(doodle);
      const centerX = bb.x + bb.w / 2;
      const centerY = bb.y + bb.h / 2;

      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < r + Math.max(bb.w, bb.h) / 2) {
        toRemove.push(doodle.id);
      }
    }

    for (const id of toRemove) {
      this.removeDoodle(id);
    }

    return toRemove.length;
  }

  deselect() {
    this.selectedId = null;
  }

  clearAll() {
    if (this.doodles.length === 0) return;
    this.undoStack.push({ action: 'clear', doodles: [...this.doodles] });
    this.doodles = [];
    this.selectedId = null;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const action = this.undoStack.pop();

    switch (action.action) {
      case 'add':
        const idx = this.doodles.findIndex(d => d.id === action.id);
        if (idx !== -1) this.doodles.splice(idx, 1);
        break;
      case 'remove':
        this.doodles.push(action.doodle);
        break;
      case 'clear':
        this.doodles = action.doodles;
        break;
    }
    return true;
  }

  getDoodleCount() {
    return this.doodles.length;
  }

  /**
   * Render all doodles
   */
  render(ctx) {
    for (const doodle of this.doodles) {
      this.drawingEngine.renderDoodle(ctx, doodle);

      // Draw selection indicator
      if (doodle.id === this.selectedId) {
        const bb = this.drawingEngine.getBoundingBox(doodle);
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
        ctx.restore();
      }
    }
  }
}
