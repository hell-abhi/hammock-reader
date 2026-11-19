#!/bin/sh
# Reference Week 0 run: fixture + 30 real pages. Writes docs/SPIKES.md.
set -e
cd "$(dirname "$0")"
SPIKE_TIMEOUT_MS=60000 node run.mjs
