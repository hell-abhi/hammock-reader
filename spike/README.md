# Spike harness (Week 0)

Throwaway code. Not product code. Reuse vocabulary only.

```sh
cd spike
npm install
npm run spike                 # fixture + 30 real pages in headless Chrome
SPIKE_URLS="https://a.example/,https://b.example/" npm run spike
SPIKE_TIMEOUT_MS=60000 npm run spike
node lib/mhtml.mjs            # decoder self-check only
```

What it checks:

| Spike | How |
|-------|-----|
| S2 OPFS worker | Writes and reads back 5 MB through `createSyncAccessHandle` in a dedicated worker |
| S3 capture + render | `pageCapture.saveAsMHTML` on a fixture with a cross-origin image; decodes it, rewrites `cid:` and `Content-Location` to blob URLs, renders in a sandboxed iframe; checks images loaded and no script ran |
| S5 size | Records MHTML bytes and part count for each URL |
| S7 voices | Lists `speechSynthesis` voices and how many are local |

Evidence: `evidence/*.mhtml` (fixtures from earlier runs) and `evidence/results.json`. Results are also written to `docs/SPIKES.md`.

The S2/S7 lines occasionally drop out (the probe page races the extension's service worker). Re-run; the 30-page run in `docs/SPIKES.md` is the reference result.

`ext/` is loaded as an unpacked extension through Puppeteer `enableExtensions`. Do not pass `--load-extension` as well; it suppresses the install.
