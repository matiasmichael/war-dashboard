#!/bin/bash
# War Dashboard update script — fetch data + build Astro site
set -e

cd /Users/michaelmatias/Projects/war-dashboard

echo "$(date) — Starting update..."

# Step 1: Fetch RSS + Gemini synthesis → saves to src/data/latest.json
/opt/homebrew/bin/node fetch.js

# Step 2: Build Astro static site → outputs to dist/
/opt/homebrew/bin/npx astro build

echo "$(date) — Update complete."
