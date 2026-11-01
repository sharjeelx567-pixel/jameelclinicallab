# JCL Machine Bridge

An on-premise service for the laboratory PC that is cabled to the analyzer(s). It reads analyzer messages, acknowledges them at the protocol level, queues them durably on disk, and forwards them securely to the LIS backend.

> **No BIOELAB analyzer is connected or verified yet.** Protocol and connection settings must come from the exact model's host-interface documentation. See [../docs/ANALYZER_INTEGRATION.md](../docs/ANALYZER_INTEGRATION.md).

```bash
npm install                  # add `serialport` on PCs with RS-232 analyzers
cp .env.example .env
cp bridge.config.example.json bridge.config.json
npm run build && npm start   # local status: http://127.0.0.1:4100/health
```

| Component | Description |
|---|---|
| `connectors/` | TCP server (analyzer connects in), TCP client with backoff reconnect, RS-232 via optional `serialport` |
| `protocols/astm-framing.ts` | ASTM E1381 receiver: ENQ/ACK, frame numbering, modulo-256 checksum, NAK on corruption, multi-frame reassembly |
| `parsers/` | ASTM E1394 records (H/P/O/R/L), HL7 v2 ORU (OBR/OBX/SPM) with MLLP and ACK. Structural problems are reported, never guessed |
| `queue/file-queue.ts` | Atomic per-message files, SHA-256 dedupe, exponential backoff, `failed/` for permanent rejections |
| `drivers/` | Live ASTM/HL7 drivers and a clearly flagged DEMO simulator |
| `services/bridge.ts` | Orchestration, heartbeats, delivery, health endpoint |

Logs contain message hashes and counts only, never raw content or patient identifiers.

`npm test` runs protocol, parser, queue and TCP tests against **synthetic** messages.
