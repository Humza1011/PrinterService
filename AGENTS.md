# AGENTS.md

## Project Overview

This repository is a Windows-oriented local receipt-printing service built with Node.js and Express.

- CommonJS JavaScript
- Node.js `18.20.8`
- Express `5.1.0`
- Native printer integration via `@thiagoelg/node-printer`
- Receipt generation via `node-thermal-printer`
- Urdu receipt rendering via `canvas` and the bundled Nastaleeq font
- Persistent print queue stored in JSON files
- Windows service support through `node-windows`
- Installer generation through Inno Setup

The main entry point is `index.js`.

This repository has a deliberately small, flat structure. Follow the existing design instead of introducing new layers unless the task explicitly requires a refactor.

---

## Repository Structure

- `index.js` — Express setup, middleware, HTTP routes, logging, queue initialization, printer polling, startup, and shutdown
- `printerService.js` — printer configuration, singleton initialization, printer status, receipt rendering, temporary PNG handling, and actual print execution
- `printQueue.js` — FIFO queue, queue persistence, retries, queue processing, and dead-letter handling
- `queue.json` — persisted active print queue
- `dead-letter.json` — runtime failed-job storage after retry exhaustion
- `fonts/` — bundled Urdu/Nastaleeq font used by receipt rendering
- `service-install.js` — Windows service registration/startup
- `service-uninstall.js` — Windows service removal
- `build-installer.ps1` — installer build script
- `inno-setup-installer.iss` — Inno Setup installer definition
- `README.md` — setup instructions, service commands, and current API examples
- `package.json` / `package-lock.json` — dependencies and runtime scripts

There are currently no separate route, controller, service, middleware, validator, model, worker, or Swagger/OpenAPI directories.

Before adding a new module, first check whether the existing responsibility belongs in `index.js`, `printerService.js`, or `printQueue.js`.

---

## Architecture Conventions

Keep responsibilities aligned with the current structure:

### `index.js`

Use for:

- Express middleware
- route definitions
- request-level validation
- HTTP response handling
- server startup/shutdown
- queue initialization
- printer polling lifecycle

### `printerService.js`

Use for:

- printer configuration
- printer instance creation
- printer readiness/status
- receipt layout/rendering
- image generation
- temporary receipt file handling
- actual printer execution

### `printQueue.js`

Use for:

- enqueueing
- queue ordering
- persistence
- retry behavior
- dead-letter handling
- queue processing state

Do not create duplicate printer, queue, retry, persistence, or rendering implementations when the existing module can be extended.

---

## Cross-File Impact Rules

Do not treat changes as isolated to one file. When changing behavior, inspect all related areas.

### If an API route changes

Check:

- route handling in `index.js`
- request validation
- queue payload expectations
- receipt field usage in `printerService.js`
- README API examples
- logging behavior
- client-visible response behavior

### If print payload fields change

Check:

- request validation
- queue persistence
- `generateReceiptImage`
- all supported receipt types
- fallback/default behavior
- README examples
- sensitive logging exposure

### If printer configuration changes

Check:

- `.env` variable usage
- `printerService.js`
- README setup instructions
- Windows service behavior
- installer packaging
- bundled Node/native module compatibility

### If queue behavior changes

Check:

- FIFO ordering
- persistence semantics
- retry counts
- retry delays
- dead-letter behavior
- `/healthz` queue reporting
- startup recovery
- shutdown behavior
- client-visible enqueue semantics

### If lifecycle behavior changes

Check:

- startup initialization
- queue loading
- printer polling
- queue processing
- shutdown behavior
- Windows service execution

### If dependencies change

Check:

- `package.json`
- `package-lock.json`
- Node.js `18.20.8` compatibility
- native module compatibility
- bundled `node.exe`
- Windows service installation
- installer contents

---

## Printer Safety Rules

Printer operations have real-world side effects.

Never perform real printing during routine verification unless the user explicitly requests it.

Do not invoke any of the following simply to test a change:

- `POST /print`
- `printReceipt()`
- `printer.execute()`
- raw printer methods
- printer dependency example scripts
- service shutdown when queued jobs may exist

Treat `PRINTER_INTERFACE` as a potentially real printer target.

The configured printer may be:

- a Windows spooler printer via `printer:<name>`
- a TCP/network printer
- another interface interpreted by the printer dependency

Do not assume a configured interface is safe, fake, or disconnected.

---

## Printer Architecture

The service uses a singleton printer instance.

Reuse the existing printer helpers rather than constructing additional printer clients.

Important functions in `printerService.js` include:

- `createPrinterInstance`
- `initPrinter`
- `printReceipt`
- `pollPrinterStatus`
- `startPrinterPolling`
- `cleanupPrinter`
- receipt-rendering helpers such as `generateReceiptImage`, `wrapText`, and `addSeparator`

Current print execution flow:

1. Initialize/check the printer.
2. Clear the printer buffer.
3. Generate the receipt image when using image mode.
4. Save the temporary PNG.
5. Pass the PNG through `printer.printImage()`.
6. Delete the temporary PNG in cleanup logic.
7. Add final newline/cut commands.
8. Execute the print buffer.

Do not bypass this flow without understanding its impact on printer state, cleanup, and queue retries.

A successful printer/spooler API call does not necessarily guarantee that paper physically printed.

---

## Queue Rules

The queue is persistent and operationally important.

Current behavior:

- FIFO ordering
- single-worker processing
- queue persisted to `queue.json`
- jobs retried up to three total attempts
- retry delays increase exponentially
- failed jobs are moved to `dead-letter.json`

Preserve this behavior unless the task intentionally changes it.

Reuse the existing queue functions:

- `enqueuePrintJob`
- `processPrintQueue`
- `initializeQueue`
- `loadQueueFromDisk`
- `persistQueueToDisk`
- `getQueueLength`

Do not introduce another retry system around printing without checking how it interacts with the queue's existing retry logic.

Do not hand-edit, clear, or replace `queue.json` or `dead-letter.json` merely to make a test pass.

Do not assume multiple service processes can safely share the same queue files.

---

## Retry and Duplicate-Print Considerations

The current queue does not provide:

- job IDs
- idempotency keys
- duplicate prevention
- status lookup
- cancellation

A crash after the printer accepts a job but before queue persistence can cause the same job to print again after restart.

When changing retries, persistence, or acknowledgement behavior:

- consider duplicate-print risk
- preserve FIFO semantics unless intentionally changed
- keep failed jobs recoverable
- avoid silently dropping queue entries
- do not mark a physical print successful based only on enqueue success

`POST /print` currently confirms enqueueing only, not physical printing.

Preserve that distinction unless the API contract is intentionally changed.

---

## Request Validation

The repository does not currently use a validation library.

Validation is handled directly in `index.js`.

When adding or modifying print payload fields:

- validate required fields
- validate expected types
- validate allowed values
- validate nested structures used by the renderer
- avoid allowing client-controlled queue fields to alter internal behavior
- do not trust `retryCount` or similar internal state from external requests
- keep request validation aligned with what `printerService.js` actually consumes

Do not introduce Joi, Zod, Yup, or another validation framework for a small isolated change unless explicitly requested.

If validation becomes reusable or substantial, prefer one clear shared validator rather than duplicating route checks.

---

## Receipt Rendering Rules

Receipt rendering is centralized in `printerService.js`.

Supported receipt types currently include:

- `basic`
- `installment`
- `detailed`

Urdu rendering depends on:

- `canvas`
- the bundled Nastaleeq font
- image-based receipt generation

When changing receipt content:

- preserve font registration
- check all supported receipt types
- preserve wrapping/alignment behavior
- consider maximum printable width
- do not duplicate receipt rendering in route or queue code
- keep temporary image cleanup intact
- update README examples if the public payload contract changes

Branding/contact content is currently part of receipt rendering. Do not assume every `.env` value is actively used without checking source usage.

---

## Temporary Files

Temporary receipt PNGs are generated during printing.

Rules:

- keep cleanup in `finally` or equivalent guaranteed cleanup paths
- do not leave generated files after normal failures
- do not introduce user-controlled filenames or directories
- do not expose arbitrary filesystem paths through request data
- preserve unique temporary filenames to avoid collisions

Crash leftovers may still occur, so changes to temp-file handling should consider cleanup on abnormal exits.

---

## Logging and Sensitive Data

Logging uses Winston, with Morgan access logs routed through it.

Errors are also written to `errors.log`.

Be careful with print payload logging.

Print jobs may contain sensitive information such as:

- customer names
- CNIC or identification values
- payment details
- payment history
- product information

Avoid adding new full-payload logging.

When modifying existing logging, prefer logging only the fields necessary for diagnostics.

Never log:

- secrets
- environment values
- credentials
- printer configuration that may contain sensitive network information
- unnecessary customer/payment data

---

## Security Rules

The service currently:

- has no authentication
- has no authorization
- enables CORS broadly
- binds to `127.0.0.1`
- relies primarily on local-machine trust

Do not casually change the bind address from localhost.

Do not expose the service to the network without explicitly addressing authentication and request security.

When accepting new input:

- do not allow user-controlled shell commands
- do not allow user-controlled file paths
- do not allow arbitrary raw printer commands
- do not allow user-controlled printer interfaces
- validate string lengths and nested payload sizes where appropriate

There is currently no shell-based printing in request handling. Preserve that property unless explicitly required.

---

## Health Endpoint

`GET /healthz` reports service health, printer state, mode, and queue length.

Important limitations:

- it always returns HTTP `200`
- spooler mode does not verify actual physical printer availability
- non-spooler checks may perform printer/network connectivity probes

Do not assume `/healthz` proves a receipt can physically print.

If its semantics change, update README documentation and any callers relying on the response.

---

## Runtime Compatibility

Node.js `18.20.8` is part of the deployment model and is bundled as `node.exe`.

Do not upgrade Node casually.

Changing Node.js or native printing dependencies may require coordinated changes to:

- bundled `node.exe`
- native module compatibility
- lockfile
- Windows service deployment
- installer contents
- installation/testing instructions

`@thiagoelg/node-printer` and `canvas` contain native components, so runtime upgrades have higher risk than normal pure-JavaScript dependency updates.

---

## Windows Service and Installer

The service is designed to run as a Windows service.

Relevant commands:

```bash
npm run install-service
npm run uninstall-service
npm run build-installer
```

These are side-effecting operations.

Do not run them as routine verification.

When changing startup, shutdown, dependencies, paths, runtime files, or required assets, inspect:

- `service-install.js`
- `service-uninstall.js`
- `build-installer.ps1`
- `inno-setup-installer.iss`

The installer packages runtime files including configuration and queue state. Be careful not to expose or unintentionally overwrite environment-specific configuration.

---

## Development Commands

Run the service:

```bash
npm start
```

Install Windows service:

```bash
npm run install-service
```

Remove Windows service:

```bash
npm run uninstall-service
```

Build installer:

```bash
npm run build-installer
```

There is currently no automated:

- test suite
- lint command
- formatter
- type checker
- printer mock
- dry-run printing mode

---

## Safe Verification

Prefer static checks that cannot contact a printer or process queued jobs.

Safe JavaScript syntax checks:

```bash
node --check index.js
node --check printerService.js
node --check printQueue.js
node --check service-install.js
node --check service-uninstall.js
```

Other safe repository checks:

```bash
git status --short
git diff --check
```

Use source inspection for behavior validation where no safe automated test exists.

Do not treat the following as routine safe verification:

```bash
npm start
npm run install-service
npm run uninstall-service
npm run build-installer
```

Also avoid:

- `POST /print`
- invoking printer functions directly
- starting/stopping the Windows service
- dependency printer examples
- calling health checks against a non-spooler interface without understanding the configured target

---

## Verification Before Completing a Task

Before considering a change complete:

- run syntax checks on all modified JavaScript files
- run `git diff --check`
- inspect the final diff for unrelated changes
- confirm CommonJS syntax and Node.js `18.20.8` compatibility
- if an API changed, update request validation and README examples
- if receipt fields changed, check all relevant rendering branches
- if queue logic changed, verify FIFO, persistence, retries, and dead-letter behavior by inspection or safe isolated testing
- if printer logic changed, confirm the existing singleton and execution flow are preserved unless intentionally changed
- if temp-file logic changed, confirm cleanup remains guaranteed
- if configuration changed, inspect `.env` usage, README, service behavior, and installer packaging
- if lifecycle behavior changed, inspect startup, polling, queue recovery, and shutdown
- if dependencies changed, update both `package.json` and `package-lock.json`
- do not contact a real printer unless explicitly instructed

---

## Agent Rules

1. Understand the existing print and queue flow before modifying it.
2. Preserve CommonJS and Node.js `18.20.8` compatibility.
3. Keep HTTP handling in `index.js`, printer behavior in `printerService.js`, and queue behavior in `printQueue.js`.
4. Search for an existing printer/queue/rendering helper before adding a new one.
5. Reuse the printer singleton and existing queue functions.
6. Do not introduce duplicate retry, persistence, rendering, or printer-client logic.
7. When an API changes, keep validation, renderer expectations, queue payloads, README examples, and logging behavior synchronized.
8. Preserve FIFO, single-worker processing, retry behavior, persistence, and dead-letter handling unless intentionally changing the queue design.
9. Treat `PRINTER_INTERFACE` as a real external target.
10. Never send a real print job during routine verification.
11. Do not call `POST /print`, `printReceipt()`, `printer.execute()`, or raw printer APIs unless explicitly instructed.
12. Do not assume `npm start` is side-effect free.
13. Keep temporary-file cleanup in guaranteed cleanup paths.
14. Do not introduce user-controlled file paths, shell commands, printer interfaces, or raw printer commands.
15. Do not expose the localhost service to the network without explicitly addressing authentication/security.
16. Avoid logging complete customer/payment payloads.
17. Treat queue files, dead-letter files, logs, and temporary receipts as runtime state.
18. Do not clear or alter runtime queue state just to simplify testing.
19. Do not upgrade Node or native printer dependencies without considering the bundled runtime, native modules, Windows service, and installer.
20. Prefer safe static verification over running the service or probing a printer.
21. Avoid unrelated architectural refactors while implementing a scoped task.
22. Never expose `.env` contents, printer names, customer data, or other sensitive runtime information.
