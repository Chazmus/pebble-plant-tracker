# Agent Runbook (AGENTS.md)

Welcome! This repository hosts a Pebble watch application migrated from native C to **Alloy** (Moddable JS runtime on the watch) and a **PebbleKit JS** phone companion.

## 🛠️ Build & Deployment

* **Compilation**: Compile the watch app and companion bundle using:
  ```bash
  pebble build
  ```
  The compiler automatically runs the Moddable pre-compiler (`mcrun`) to compile JS files in `src/embeddedjs/` into binary resources (`mc.xsa`) and embeds them into the final `.pbw` package.
* **Target Platforms**: `emery` (Pebble Time 2) and `gabbro` (Pebble 2/Core 2). Older platforms do not support the Moddable VM.

> [!IMPORTANT]
> **Manual Testing Requirement**: Never commit or push changes to the repository without first building and testing the deployment manually on the emulator or watch to verify that everything works and there are no runtime crashes.

* **Releasing (CI/CD)**:
  We use Git tags (e.g., `v1.0.4`) and automated GitHub Releases. To make a clean release:
  1. Increment the version number in `package.json` first (e.g., `"version": "1.0.4"`).
  2. Commit the change locally: `git commit -am "chore: bump version to 1.0.4"`.
  3. Create the Git tag pointing to that commit: `git tag v1.0.4`.
  4. Push the branch and tag: `git push origin master && git push origin v1.0.4`.
  5. The GitHub Action will automatically compile the watchapp, rename the output to include the version number (e.g., `pebble-plant-tracker-v1.0.4.pbw`), and publish a new GitHub Release with the binary attached.

---

## 🔍 Diagnostics & Debugging

If you need to view console logs or diagnose sync/state issues on a physical watch or emulator:

### 1. Cloud logs (Recommended for physical devices)
Use the Pebble WebSocket developer proxy to pull logs from a connected watch from anywhere in the world (without computer and phone being on the same local network):
```bash
pebble logs --cloudpebble
```
Ensure **Developer Connection** is enabled under the Pebble mobile app settings.

### 2. Local network logs
If the phone and computer are on the same local Wi-Fi, you can connect directly:
```bash
pebble logs --phone <PHONE_IP_ADDRESS>
```

### 3. Emulator logs
Stream logs from a local emulator instance:
```bash
pebble logs
```

### 4. Interactive Debugging (`xsbug`)
Build in debug mode to connect to the Moddable graphical debugger:
```bash
pebble build --debug
```
Run `xsbug` to inspect the heap, set breakpoints, and step through watch JS code.

---

## 💡 Architecture & Storage

* **Watch State**: Saved in watch-side persistent `localStorage` (`localStorage.setItem("plants_alloy", ...)`).
* **Phone State**: Companion merges configuration settings with incoming watch logs and saves to phone `localStorage` (`plant_tracker_settings`).
* **Serialization Key Gotcha**: 
  PebbleKit JS on the phone often maps payload variables as string keys, but sometimes integer keys. Always use the `getPayloadValue` helper in `src/pkjs/index.js` to look up variables in both structures:
  ```javascript
  function getPayloadValue(payload, keyName) {
    if (payload[keyName] !== undefined) return payload[keyName];
    if (keys[keyName] !== undefined && payload[keys[keyName]] !== undefined) return payload[keys[keyName]];
    return undefined;
  }
  ```
