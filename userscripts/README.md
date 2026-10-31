# Label queue worker v5 (protocol 2)

## Findings and scope

Base web commit: 6c45617; intemkiot.html blob: 8400692fef8920c3f6ea1be95e0df220ca857faa.
The extracted worker 4.0.1 in qr-de16/tm-src reads the single command node; the web writes queue/<UUID>.
This is a source-level protocol mismatch. The enabled script/version on De8 still needs runtime confirmation.
A fault-injection probe of that extracted source reproduced busy=true after a failed status PUT: the status request is outside the finally that unlocks busy.
It also installs iframe.onload after doc.close(), and does not bound the wait for the load event.
A shared result node can overwrite an ACK from another producer; results/<UUID> prevents that loss.
These findings do not establish a Windows driver/spooler fault.

## Changes

- Read queue/<UUID> in createdAt order; results/<UUID> is the durable ACK.
- Claim UUID with Firebase ETag + if-match. Claims are permanent to avoid replaying a non-idempotent print operation.
- Web Locks permit one v5 tab per origin; do not run old printing scripts alongside v5.
- Poll busy is set before any asynchronous request and always released in finally. Heartbeat is independent.
- Register srcdoc load handler before insertion; bound preparation/print wait; catch asynchronous print errors.
- Preserve the previous 58mm layout. A browser return/afterprint is submitted, never proof that paper printed.
- Save local ACK journal before printing and before publishing final state. A restart republishes known final results; ambiguous attempts become needs_review with no automatic replay.
- Failed ACK upload keeps queue entry and journal. Completed queue item is removed only after its durable result is written.
- Web requires queueProtocol=2 and a healthy worker, waits up to 120 seconds, keeps the UUID on uncertainty and disables blind reprint on that row.
- A claim younger than 120 seconds is left alone. An older claim without a final ACK becomes needs_review, never automatically printed again.

## Verification already completed (isolated, no live Firebase writes or printer calls)

1. node --check userscripts/tngon-label-worker.user.js
2. node --test tests/label-worker.test.cjs: 12/12 PASS, including 20 FIFO UUID jobs, overlapping polls, status/network failure, ACK failure + restart, ambiguous restart, concurrent workers, duplicate UUID, invalid product, missing load/afterprint, print exception.
3. node --test tests/label-browser.test.cjs: Chromium headless PASS. Actual HTML + userscript, simulated Firebase HTTP/ETag, five manual UI jobs, two worker tabs, exactly five print API calls, five separate final ACKs, zero pending jobs, zero page errors. print() is replaced with a counter; every non-fixture network request is blocked.
4. git diff --check: PASS.

Browser test needs Playwright installed with Chromium (require('playwright')). On this host use NODE_PATH=C:/TNGON_OFFICE/source/tngon-office/node_modules when running it.

## De16 / De8 installation and physical acceptance (PENDING)

Codex has not changed De8, live Firebase, or the published GitHub Pages site.
De16 coordinates; De8 collects evidence, installs, and tests. Before installation export the enabled script and record its version/hash, enabled flags, matching page URL and number of matching tabs, Chrome launch flags (including kiosk printing), selected printer and driver/version.

1. Inspect existing queue, command, results, and Windows jobs. Record pending UUIDs and do not drain/replay/delete old work automatically. Pause producers during the transition.
2. Back up/export old userscripts. Disable all older print-command workers (direct 4.x and legacy KiotViet 2.x/3.x); leave catalog-only synchronization as appropriate. Use one management tab matching the userscript @match.
3. Install tngon-label-worker.user.js from this branch and open the management page. Confirm status.workerVersion=5.0.0, queueProtocol=2, halted=false and fresh lastSeen. Verify Firebase rules allow the new results and claims paths, ETag GET and conditional PUT. Permission denial should remain an explicit failure; do not loosen security rules just to pass.
4. Test the branch's intemkiot.html in a staging/local view first, before publishing. The branch web and v5 worker must be installed together. The old single-command producer/worker protocol is intentionally not replayed by v5.
5. Run one supervised label, then 20 uniquely identified labels at normal and burst speed. Log each web UUID, createdAt, claim time, final result, print-call time, Windows JobId/time/status, and count/identity of physical labels. Expected: 20 unique requests, 20 labels in order, no skipped/duplicate labels, responsive UI and drained spooler. Report median/p95 enqueue-to-paper latency and any pauses.
6. Repeat with two tabs, temporary network disconnect/reconnect, and worker reload. For interrupted print attempts, verify needs_review and inspect paper/spooler before manually deciding whether a new UUID is needed. Never automatically retry an ambiguous job.
7. Only call physical acceptance PASS after matching all UUIDs to paper/spooler evidence and resolving known failures. Browser submitted is insufficient. Driver, connection and Windows spooler diagnosis require De8's actual evidence.

Rollback: pause producers, inspect pending/ambiguous UUIDs and Windows queue, disable v5, restore the backed-up worker and matching previous web revision as one pair. Keep results/claims/journal as evidence; no bulk deletion or reprint.

References: https://firebase.google.com/docs/database/rest/save-data#section-conditional-requests and https://developer.mozilla.org/en-US/docs/Web/API/Window/afterprint_event
