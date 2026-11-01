# BIOELAB analyzer integration

**Current status: no BIOELAB analyzer is connected.** The LIS and the machine bridge are ready for integration. The exact analyzer model and its host-interface documentation have not been provided, so no protocol is assumed and no connectivity is claimed.

## What exists today

- **Backend:** analyzer registry; bridge authentication; heartbeat-based connection state (goes stale after 2 minutes); idempotent message intake keyed by SHA-256; raw message storage; test-code mapping; automatic matching by sample barcode; manual matching; parse-error and unmatched queues; analyzer-error notifications. Matched values are saved as **draft** results with `source: analyzer` and must still be submitted and verified by people.
- **Machine bridge:**
  - TCP server, TCP client and RS-232 connectors with reconnection;
  - ASTM E1381 low-level receiver (ENQ/ACK, frame numbers, checksum, NAK on error, multi-frame);
  - ASTM E1394 record parser;
  - HL7 v2 ORU parser with MLLP framing and ACK;
  - durable on-disk queue with retry and backoff;
  - local health endpoint.
- **Demo mode:** a simulator produces messages clearly flagged `isDemo`. They are stored for UI testing, never applied to patients, and never make an analyzer appear "connected".

These components are tested with **synthetic** messages only (`machine-bridge/test`). They have not been tested against a BIOELAB device.

## Information required before going live

| # | Item | Where to find it |
|---|---|---|
| 1 | **Exact analyzer model** and firmware version | Rating plate, About screen, purchase documents |
| 2 | **Communication port**: RJ-45 Ethernet, RS-232 (DB-9), USB-serial | Rear panel / service manual |
| 3 | **Supported protocol**: ASTM E1381/E1394 (LIS1-A/LIS2-A2), HL7 v2.x, proprietary | Vendor **LIS / host interface specification** |
| 4 | **Interface configuration**: IP/port and who connects to whom, or baud, data bits, parity, stop bits, flow control; uni- vs bi-directional; query mode | Interface spec + analyzer settings screen |
| 5 | **Vendor documentation**: host interface manual, sample messages | BIOELAB distributor / service engineer |
| 6 | **Test-code mapping**: analyzer code for every reported parameter | Interface spec + analyzer test setup |
| 7 | **Sample identifier mapping**: which field carries the barcode (e.g. ASTM O-3 vs O-4; HL7 SPM-2/OBR-3); barcode symbology and length the analyzer reads | Interface spec; test with printed labels |
| 8 | **Result message format**: units, flags, decimal format, how reruns/dilutions are sent | Captured real messages |
| 9 | **Connection & verification procedure**: see below | — |

## Integration procedure

1. Register the analyzer in **Analyzers → Register analyzer** with the exact model and serial number. Keep `protocol = unconfirmed` and `mode = demo` until steps 2–4 are done.
2. From the vendor specification, set the protocol and connection settings, then set **Integration status → Configured**.
3. Generate a bridge token, put its hash in the backend's `BRIDGE_TOKEN_HASHES`, and put the token in the bridge PC's `.env`. Add the analyzer to `bridge.config.json` with `mode: "live"` and the correct connector.
4. Start the bridge (`npm start`). Check `http://127.0.0.1:4100/health`: the link must show `connected` (or `listening` for tcp-server until the analyzer connects). The LIS shows **Connected** only after a live heartbeat.
5. Map test codes in **Test catalogue → test → Analyzer mapping**.
6. Run **control/QC samples** with printed LIS barcodes. In **Analyzers → Messages**, confirm the raw message, parsed sample ID, codes, values and units are exactly correct.
7. Compare at least the laboratory's validation set of patient or QC results between the analyzer printout and the LIS draft values. Include flags, decimals and reruns.
8. Only then set **Integration status → Verified**, and record the validation evidence in the lab's quality system.

If the analyzer uses a proprietary protocol, add a parser in `machine-bridge/src/parsers/` and a driver in `drivers/drivers.ts`. Do not adapt the ASTM parser by guesswork.

## Bridge token generation

```bash
node -e "const c=require('crypto');const t=c.randomBytes(32).toString('hex');console.log('BRIDGE_TOKEN='+t);console.log('hash='+c.createHash('sha256').update(t).digest('hex'))"
# backend/.env:        BRIDGE_TOKEN_HASHES=lab-pc-1:<hash>
# machine-bridge/.env: BRIDGE_ID=lab-pc-1  BRIDGE_TOKEN=<token>
```
