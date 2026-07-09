# Pebble Plant Tracker

A Pebble watchapp written in JavaScript (using the **Alloy** framework powered by the Moddable XS VM) and a **PebbleKit JS** phone companion. Designed to track household plant care schedules (watering, fertilising, repotting, and general maintenance) with offline history logging, persistent storage, and a phone-side settings configuration dashboard.

Developed by **Chazmus inc.**

GitHub Repository: <https://github.com/Chazmus/pebble-plant-tracker>

## Features

- **Plant Schedule List**: Shows all your plants on the watch with their names and relative times of last watering and fertilisation (e.g., "W: 3d ago | F: 12h ago").
- **Log Events Menu**:
  - Quick log shortcuts for *Watering*, *Fertilising*, *Repotting*, *Pruning*, *Rotation*, *Cleaning*, *Pest Treatment*, and *Relocation*.
  - Logs are immediately stored in the watch's database and synced to the phone companion.
- **Offline History Timeline**: Renders up to 20 logging events in reverse chronological order with scroll indicators directly on your watch.
- **Responsive Dark Theme Settings**: A phone-side settings configuration dashboard with inline plant additions, planted date pickers, dynamic validation, and active history logs timeline.

## Building & Running

1. **Build the assets & compile the JS watchapp**:
   ```sh
   pebble build
   ```
2. **Deploy to emulator** (Alloy target platforms are `emery` or `gabbro`):
   ```sh
   pebble install --emulator emery
   ```
3. **Deploy to physical watch (via CloudPebble developer proxy)**:
   ```sh
   pebble install --cloudpebble
   ```
4. **Deploy to physical watch directly (local Wi-Fi)**:
   ```sh
   pebble install --phone <YOUR_PHONE_IP>
   ```

## Technical Details

- **Alloy VM Architecture**: Watchapp logic runs fully standard JavaScript (ES2024+) via Moddable's XS engine compiled inside the binary resource block (`mc.xsa`).
- **Persistent Watch Storage**: Saved using the HTML5-compliant watch-side `localStorage` API, bypassing the legacy C Pebble KV limits (256-byte maximum size per key and 4KB total app storage).
- **Bulletproof Communication**: Leverages a robust getter wrapper on the companion app to support both string-based and integer-based AppMessage keys across different phone platforms.
- **Legacy Compatibility**: The phone-side settings configuration dashboard is compiled as a pure ES5-compatible JSON-encoded HTML string to prevent STPyV8 syntax crashes in local `pypkjs` emulators.

---
Documentation reference: <https://developer.repebble.com>
