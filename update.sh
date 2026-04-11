#!/bin/bash
# War Dashboard update script — full pipeline (convenience wrapper)
set -e

cd /Users/michaelmatias/Projects/war-dashboard

echo "$(date) — Starting full pipeline update..."

# Run the convenience wrapper which does: fetch-data → synthesize → build
/opt/homebrew/bin/node fetch.js

echo "$(date) — Update complete."
