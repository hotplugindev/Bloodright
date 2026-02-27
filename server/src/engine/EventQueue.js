/**
 * EventQueue — Min-heap priority queue for scheduled game events.
 * O(log n) insert, O(log n) extract-min.
 * Events are ordered by triggerDay.
 */
class EventQueue {
  constructor() {
    this.heap = [];
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  insert(event) {
    this.heap.push(event);
    this._bubbleUp(this.heap.length - 1);
  }

  extractMin() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return min;
  }

  // Extract all events with triggerDay <= currentDay
  extractDue(currentDay) {
    const due = [];
    while (!this.isEmpty() && this.heap[0].triggerDay <= currentDay) {
      due.push(this.extractMin());
    }
    return due;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].triggerDay <= this.heap[idx].triggerDay) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  _sinkDown(idx) {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < length && this.heap[left].triggerDay < this.heap[smallest].triggerDay) {
        smallest = left;
      }
      if (right < length && this.heap[right].triggerDay < this.heap[smallest].triggerDay) {
        smallest = right;
      }
      if (smallest === idx) break;
      [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
      idx = smallest;
    }
  }

  // Serialize for save state
  toJSON() {
    return [...this.heap];
  }

  // Load from saved state
  static fromJSON(data) {
    const q = new EventQueue();
    if (Array.isArray(data)) {
      for (const event of data) {
        q.insert(event);
      }
    }
    return q;
  }
}

module.exports = { EventQueue };
