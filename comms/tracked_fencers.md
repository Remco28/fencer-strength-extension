# Tracked Fencers Feature Plan

## 1. Overview

This document outlines the plan for implementing a "Tracked Fencers" feature. The goal is to allow users to "star" or "track" fencers they are interested in, saving them to a persistent list for easy reference.

The primary use case is short-term tracking for tournament preparation, where a user might track fencers in their upcoming pools.

## 2. UI/UX

- **Tracking Indicator:** A star icon will be displayed on the fencer's profile modal.
  - An **empty star** indicates the fencer is not currently tracked.
  - A **filled yellow star** indicates the fencer is tracked.
- **Viewing Tracked Fencers:**
  - The user will click the main extension icon in the browser toolbar to open a popup.
  - This popup will contain a button, such as "View Tracked Fencers."
  - Clicking this button will open a new modal displaying the list of all tracked fencers.
- **List Format:** The list will be simple, with each entry showing:
  - `Fencer Name (DE: [DE Strength], Pool: [Pool Strength])`
  - The fencer's name will be a clickable link to their FencingTracker profile.

## 3. Data Strategy

- **Storage:** The list of tracked fencers will be stored in `chrome.storage.local`.
- **Data Captured:** When a fencer is tracked, the following data will be saved:
  - `id` (FencingTracker ID)
  - `name`
  - `slug` (for building the profile URL)
  - `deStrength`
  - `poolStrength`
  - `weapon` (primary weapon used for the stored strengths; preference order Epee -> Foil -> Saber)
- **Freshness:** Data will be captured at the moment the user clicks the star. Real-time data fetching is not required for V1, as the primary use case is short-term. This approach ensures the tracked list loads instantly.

## 4. Implementation Plan

The work will be broken into two phases.

### Phase 1: Core Tracking Logic

This phase focuses on the ability to add and remove fencers from the tracked list.

- **File to Modify:** `content.js`
- **Actions:**
  1.  Inject a star icon into the fencer profile view (`showProfileView` function).
  2.  The star's initial state (filled/empty) will be determined by checking if the fencer exists in `chrome.storage.local`.
  3.  Add a click event listener to the star.
  4.  On click, either add the fencer's complete data object to storage or remove it.
  5.  Update the star's visual state accordingly.

### Phase 2: Viewing UI

This phase focuses on displaying the list of tracked fencers to the user.

- **Files to Create/Modify:** `manifest.json`, `popup.html`, `popup.js`, `content.js`.
- **Actions:**
  1.  **`manifest.json`:** Add a browser `action` entry to specify a popup file (`popup.html`).
  2.  **`popup.html` / `popup.js`:** Create a simple popup with a single button that sends a message to the content script to trigger the display of the tracked list.
  3.  **`content.js`:**
     - Add a message listener to handle the request from the popup.
     - On receiving the message, read the list of fencer objects from `chrome.storage.local`.
     - Reuse the existing modal framework to display the formatted list of tracked fencers.
