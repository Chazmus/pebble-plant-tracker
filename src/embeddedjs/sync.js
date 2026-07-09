import Message from "pebble/message";
import Vibes from "pebble/vibes";
import { state, savePlants, showToast } from "./state";

let watchMessage;

export function initSync(draw) {
  watchMessage = new Message({
    keys: [
      "AppKeySync",
      "AppKeyPlantCount",
      "AppKeyPlantIndex",
      "AppKeyPlantId",
      "AppKeyPlantName",
      "AppKeyPlantDate",
      "AppKeyLogType",
      "AppKeyLogAmount",
      "AppKeyLogTime",
      "AppKeyLastWatered",
      "AppKeyLastFertilized",
      "AppKeyLastFertilisedAmount",
      "AppKeyPlantHistory"
    ],
    onReadable() {
      try {
        const msg = this.read();
        
        if (msg.has("AppKeyPlantCount")) {
          const count = msg.get("AppKeyPlantCount");
          console.log("Sync started, expected: " + count);
          state.expectedPlantCount = count;
          state.tempPlants = [];
          
          if (count === 0) {
            state.plants = [];
            savePlants();
            state.selectedPlantIdx = 0;
            state.plantListScrollIdx = 0;
            state.appState = "PLANT_LIST";
            draw();
          }
        }
        
        if (msg.has("AppKeyPlantIndex") && msg.has("AppKeyPlantName")) {
          const index = msg.get("AppKeyPlantIndex");
          const id = msg.get("AppKeyPlantId");
          const name = msg.get("AppKeyPlantName");
          const plantedAtSec = msg.get("AppKeyPlantDate");
          const lastWateredSec = msg.get("AppKeyLastWatered");
          const lastFertilizedSec = msg.get("AppKeyLastFertilized");
          const lastFertilizedAmount = msg.get("AppKeyLastFertilisedAmount");
          const historyBytes = msg.get("AppKeyPlantHistory");
          
          console.log("Received index " + index + ": " + name);
          
          const plantedAt = plantedAtSec > 0 ? new Date(plantedAtSec * 1000).toISOString().split('T')[0] : "";
          const lastWatered = lastWateredSec > 0 ? new Date(lastWateredSec * 1000).toISOString() : null;
          const lastFertilized = lastFertilizedSec > 0 ? new Date(lastFertilizedSec * 1000).toISOString() : null;
          const history = parseHistoryBytes(historyBytes);
          
          state.tempPlants[index] = {
            id: id || "p_" + index,
            name,
            plantedAt,
            lastWatered,
            lastFertilized,
            lastFertilizedAmount,
            history
          };
          
          let finished = true;
          for (let i = 0; i < state.expectedPlantCount; i++) {
            if (state.tempPlants[i] === undefined) {
              finished = false;
              break;
            }
          }
          
          if (finished && state.tempPlants.length === state.expectedPlantCount) {
            state.plants = state.tempPlants;
            savePlants();
            state.selectedPlantIdx = 0;
            state.plantListScrollIdx = 0;
            state.appState = "PLANT_LIST";
            Vibes.doublePulse();
            showToast("Synced!", 1500, null, draw);
          }
        }
      } catch (e) {
        console.log("Error handling sync: " + e);
      }
    }
  });
}

export function sendLogToPhone(plantIndex, type, amount) {
  try {
    if (watchMessage) {
      const map = new Map();
      map.set("AppKeyPlantIndex", plantIndex);
      map.set("AppKeyLogType", type);
      map.set("AppKeyLogAmount", amount);
      map.set("AppKeyLogTime", Math.floor(Date.now() / 1000));
      watchMessage.write(map);
    }
  } catch (e) {
    console.log("Error sending log: " + e);
  }
}

export function requestSync() {
  try {
    if (watchMessage) {
      const map = new Map();
      map.set("AppKeySync", 1);
      watchMessage.write(map);
    }
  } catch (e) {
    console.log("Error requesting sync: " + e);
  }
}

function parseHistoryBytes(arrayBuffer) {
  const history = [];
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return history;
  
  const bytes = new Uint8Array(arrayBuffer);
  const count = Math.floor(bytes.length / 8);
  for (let i = 0; i < count; i++) {
    const offset = i * 8;
    
    const t0 = bytes[offset];
    const t1 = bytes[offset + 1];
    const t2 = bytes[offset + 2];
    const t3 = bytes[offset + 3];
    const timeSec = t0 | (t1 << 8) | (t2 << 16) | (t3 << 24);
    
    const type = bytes[offset + 4];
    const amount = bytes[offset + 5];
    
    if (timeSec > 0) {
      history.push({
        time: new Date(timeSec * 1000).toISOString(),
        type,
        amount
      });
    }
  }
  return history;
}
