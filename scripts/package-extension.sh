#!/usr/bin/env bash
# ============================================================================
# Fencer Strength Extension - Packaging Script
# ============================================================================
# This script creates a distributable .zip file of the extension with all
# required runtime assets. It ensures the service worker's importScripts
# dependencies are included and the archive is ready for Chrome installation.
#
# Usage:
#   ./scripts/package-extension.sh
#
# Output:
#   dist/fencer-strength-extension.zip
#   dist/fencer-strength-extension.zip.sha256
#   dist/INSTALL.txt
# ============================================================================

set -euo pipefail

# Change to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

echo "Fencer Strength Extension - Packaging Script"
echo "============================================="
echo "Project root: ${PROJECT_ROOT}"
echo ""

# Configuration
DIST_DIR="dist"
ZIP_NAME="fencer-strength-extension.zip"
CHECKSUM_NAME="${ZIP_NAME}.sha256"

# ============================================================================
# Step 1: Clean and prepare dist directory
# ============================================================================
echo "Step 1: Preparing dist directory..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ============================================================================
# Step 2: Copy runtime assets to dist
# ============================================================================
echo "Step 2: Copying runtime assets..."

# Essential root files (required for extension to function)
# - manifest.json: Extension configuration and metadata
# - background.js: Service worker managing context menu and message passing
# - content.js: Content script for modal injection and API orchestration
# - modal.css: Styling for the fencer profile modal
# - popup.html/popup.js: Toolbar popup for tracked fencers list
cp manifest.json "${DIST_DIR}/"
cp background.js "${DIST_DIR}/"
cp content.js "${DIST_DIR}/"
cp modal.css "${DIST_DIR}/"
cp popup.html "${DIST_DIR}/"
cp popup.js "${DIST_DIR}/"

# Helper modules (required by background.js importScripts)
# These provide network layer, caching, and API functionality:
# - src/config/base-url.js: FencingTracker API endpoint configuration
# - src/cache/cache.js: 24-hour TTL cache layer
# - src/utils/normalize.js: Name normalization and slug generation
# - src/api/search.js: Fencer search with variant fallback
# - src/api/profile.js: Profile HTML fetching with slug regeneration
# - src/api/strength.js: Strength ratings HTML fetching
# - src/api/history.js: Bout history HTML fetching
cp -r src/ "${DIST_DIR}/"

# Assets referenced by manifest and web_accessible_resources
# - icons/: Extension icons for toolbar and Chrome extensions page
# - fonts/: Inter font family (web_accessible_resources for modal rendering)
cp -r icons/ "${DIST_DIR}/"
cp -r fonts/ "${DIST_DIR}/"

# Optional: README screenshots for documentation
# (Not required for extension runtime, but helpful if user inspects the zip)
if [ -d "assets" ]; then
  cp -r assets/ "${DIST_DIR}/"
fi

# Optional: Include README for user reference
if [ -f "README.md" ]; then
  cp README.md "${DIST_DIR}/"
fi

echo "  ✓ Copied runtime files"
echo "  ✓ Copied src/ helper modules"
echo "  ✓ Copied icons/ and fonts/"
echo ""

# ============================================================================
# Step 3: Generate INSTALL.txt with manual install instructions
# ============================================================================
echo "Step 3: Generating INSTALL.txt..."
cat > "${DIST_DIR}/INSTALL.txt" << 'EOF'
Fencer Strength Lookup - Installation Instructions
===================================================

This extension allows you to look up fencer strength ratings from any webpage
by right-clicking a fencer's name.

INSTALLATION STEPS (Chromium-based browsers: Chrome, Edge, Brave)
------------------------------------------------------------------

1. Download fencer-strength-extension.zip
2. Extract the zip file to a permanent location on your computer
   (Do NOT delete this folder after installation - Chrome needs it!)
3. Open your browser and navigate to: chrome://extensions
4. Enable "Developer mode" using the toggle in the top-right corner
5. Click "Load unpacked" and select the extracted folder
6. The Fencer Strength Lookup icon will appear in your toolbar

USAGE
-----

1. Highlight a fencer's name on any webpage
2. Right-click the selected text
3. Choose "Lookup Fencer on FencingTracker" from the context menu
4. View the profile modal with strength ratings and bout statistics
5. Click the extension icon in your toolbar to see your tracked fencers

PRIVACY
-------

This extension only activates when you use it. It communicates exclusively
with FencingTracker.com to retrieve fencer data. No personal data is collected
or shared - all tracked fencer information is stored locally on your computer.

For more information, see README.md or visit:
https://github.com/anthropics/fencer-strength-extension
EOF

echo "  ✓ Created INSTALL.txt"
echo ""

# ============================================================================
# Step 4: Create the zip archive
# ============================================================================
echo "Step 4: Creating zip archive..."
cd "${DIST_DIR}"
# Use quiet mode (-q) and recursive (-r) to include all files/folders
# Archive contains all files at root level (no parent directory wrapper)
zip -rq "${ZIP_NAME}" ./*
cd "${PROJECT_ROOT}"

echo "  ✓ Created ${DIST_DIR}/${ZIP_NAME}"
echo ""

# ============================================================================
# Step 5: Generate SHA256 checksum
# ============================================================================
echo "Step 5: Generating SHA256 checksum..."
cd "${DIST_DIR}"
sha256sum "${ZIP_NAME}" > "${CHECKSUM_NAME}"
cd "${PROJECT_ROOT}"

CHECKSUM=$(cat "${DIST_DIR}/${CHECKSUM_NAME}" | cut -d' ' -f1)
echo "  ✓ SHA256: ${CHECKSUM}"
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "============================================="
echo "Packaging complete!"
echo ""
echo "Output files:"
echo "  - ${DIST_DIR}/${ZIP_NAME}"
echo "  - ${DIST_DIR}/${CHECKSUM_NAME}"
echo "  - ${DIST_DIR}/INSTALL.txt"
echo ""
echo "Next steps:"
echo "  1. Verify the zip contents:"
echo "     unzip -l ${DIST_DIR}/${ZIP_NAME}"
echo ""
echo "  2. Test installation in Chrome:"
echo "     - Unzip the archive to a test directory"
echo "     - chrome://extensions → Developer Mode → Load unpacked"
echo "     - Check service worker console for importScripts errors"
echo ""
echo "  3. Share the zip file with users along with INSTALL.txt"
echo "============================================="
