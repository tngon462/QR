// printQueue.js — single worker FIFO queue (stable & simple)

class PrintQueue {
  constructor({ handler }) {
    this.q = [];
    this.working = false;
    this.handler = handler;
    this.totalProcessed = 0;
  }

  enqueue(job) {
    this.q.push(job);
    this.kick();
    return this.q.length;
  }

  len() {
    return this.q.length + (this.working ? 1 : 0);
  }

  async kick() {
    if (this.working) return;
    const next = this.q.shift();
    if (!next) return;

    this.working = true;
    try {
      await this.handler(next);
      this.totalProcessed++;
    } catch (e) {
      // keep server alive; job will be marked failed
      next._error = String(e?.message || e);
      console.error("[QUEUE] job failed:", next._error);
    } finally {
      this.working = false;
      setImmediate(() => this.kick());
    }
  }
}

module.exports = { PrintQueue };
