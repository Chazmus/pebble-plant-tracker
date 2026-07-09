# Pebble Plant Tracker

A modern and complete Pebble watchapp written in C, designed to track household plant care schedules (watering, fertilising, repotting, and general maintenance) with offline history logging and a local phone configuration dashboard.

Developed by **Chazmus inc.**

GitHub Repository: <https://github.com/Chazmus/pebble-plant-tracker>

## Features

- **Plant Schedule List**: Shows all your plants on the watch with their names and age (in days/weeks) alongside relative times of last water and fertilisation.
- **Log Events Menu**:
  - **Log Water**: Instant watering record.
  - **Log Fertiliser**: Opens an ml/L numeric amount selector.
  - **Maintenance Logging**: Quick log shortcuts for *Repotting*, *Pruning*, *Rotation*, *Cleaning*, *Pest Treatment*, and *Relocation*.
- **Offline History timeline**: Renders the last 5 logging events in reverse chronological order directly on your watch.
- **Responsive Dark Theme Settings**: A phone-side settings configuration dashboard with inline plant additions, planted date pickers, dynamic validation, and active history logs timeline.

## Building & running

1. **Build the assets & compile binary**:
   ```sh
   npm run build-config
   pebble build
   ```
2. **Deploy to emulator**:
   ```sh
   pebble install --emulator basalt
   pebble emu-app-config
   ```
3. **Deploy to phone**:
   ```sh
   pebble install --phone <YOUR_PHONE_IP>
   ```

## Technical Details

- **Legacy Compatibility**: Companion settings page is exported as a pure ES5-compatible JSON-encoded HTML string to prevent STPyV8 syntax crashes in local `pypkjs` emulators.
- **Offline-First Storage**: Uses Pebble KV persistent storage, splitting plant definitions individually to respect the 256-byte maximum size per key limit in legacy Pebble OS.
- **Locker upgrades**: Automatically merges names and local logged timestamps during phone synchronization.

---
Documentation reference: <https://developer.repebble.com>
