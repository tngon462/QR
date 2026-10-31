# Label queue v5: candidate, pending POS verification

Base: 6c45617. Install web and worker together; do not enable v4 and v5 simultaneously.

## Findings from source
- Web writes queue/<UUID>; extracted worker 4.0.1 reads command. The active installed script still needs confirmation on De8.
- v4 sets busy and writes status before entering its inner finally; a failed status write can strand busy. It records the last command before printing, so failures cannot be retried safely.
- Web reads one shared result slot; another job can overwrite the ACK.
- v4 attaches iframe.onload after document.close and reports success using a timer; this cannot prove physical printing.

## Candidate changes
- UUID queue, results/<UUID>, atomic ETag claim, FIFO processing, one origin worker via Web Locks.
- busy resets in finally; heartbeat failure is independent; iframe handler installed before srcdoc insertion.
- Durable local journal republishes ACK after network failure/restart without invoking print again.
- Ambiguous outcomes use needs_review; never automatically replay. UI timeout is unknown and blocks another click for that item.
- submitted only means the browser print invocation completed. Browser JavaScript cannot confirm Windows spooler or physical output.

## Local validation
Run: node --test tests/label-worker.test.cjs
12 simulated tests passed, including 20 FIFO jobs, concurrent polls/workers, failed queue/status requests, failed final ACK and restart, deduplication, invalid input, missing iframe load/afterprint, and print exception.
No live Firebase writes, POS installation, spooler inspection, or physical print test performed by Codex.

## De16 / De8 acceptance procedure
1. Export the enabled userscript and record version/hash, Chrome launch settings, target printer/driver and default paper. Save existing script for rollback. Disable earlier print workers before enabling v5; one KiotViet tab.
2. Review pending legacy command/queue with operator before enabling: v5 consumes queue automatically. Do not delete or replay jobs of unknown outcome.
3. Install userscripts/tngon-label-worker.user.js and load the matching branch HTML on a controlled test page. Verify status.workerVersion=5.0.0, queueProtocol=2, halted=false.
4. Send 10 approved labels in succession. Record each UUID and timestamps for queue creation, claim, results processing/submitted, Windows job appearance/completion and the actual numbered label. Require exactly 10 physical labels, correct order, no duplicates/skips; report per-label delay.
5. With approved test labels, take printer offline then online. Correlate browser submitted with Windows retained jobs and actual output; do not submit duplicates while jobs are retained. Verify next new label works after recovery.
6. Disconnect/reconnect network before send, during ACK, and restart worker after an ambiguous print; ensure no automatic duplicate. needs_review requires operator reconciliation with paper and spooler before reprint. Keep UUID evidence with no customer data or credentials.

## Remaining limitations
Windows queue evidence and current De8 script confirmation are mandatory before declaring root cause in production or PASS. A native print dialog can block synchronous print(); verify kiosk printing/browser settings on De8. Claims are permanent for deduplication; no automatic lease replay. Cross-origin workers may have separate local journals, so keep one enabled origin/worker. Retention/archival of historical results/claims is a separate operational task.
