import Vibes from "pebble/vibes";

export const ACTION_OPTIONS = [
  "View History",
  "Water",
  "Fertilize",
  "Repot",
  "Prune",
  "Rotate",
  "Clean",
  "Treat",
  "Move"
];

export const state = {
  appState: "PLANT_LIST",
  plants: [],
  selectedPlantIdx: 0,
  selectedActionIdx: 0,
  historyScrollIdx: 0,
  plantListScrollIdx: 0,
  actionScrollIdx: 0,
  toastMessage: "",
  toastTimer: null,
  expectedPlantCount: 0,
  tempPlants: []
};

export function loadPlants() {
  try {
    const data = localStorage.getItem("plants_alloy");
    if (data) {
      state.plants = JSON.parse(data);
      return state.plants;
    }
  } catch (e) {
    console.log("Error loading plants: " + e);
  }
  state.plants = [];
  return [];
}

export function savePlants() {
  try {
    localStorage.setItem("plants_alloy", JSON.stringify(state.plants));
  } catch (e) {
    console.log("Error saving plants: " + e);
  }
}

export function getRelativeTime(timeStr) {
  if (!timeStr) return "Never";
  const diffSec = Math.floor((Date.now() - new Date(timeStr).getTime()) / 1000);
  if (diffSec < 0) return "Just now";
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m";
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return diffHour + "h";
  const diffDay = Math.floor(diffHour / 24);
  return diffDay + "d";
}

export function getAgeString(plantedAt) {
  if (!plantedAt) return "";
  const plantedTime = new Date(plantedAt).getTime();
  if (isNaN(plantedTime)) return "";
  const diffMs = Date.now() - plantedTime;
  const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (ageDays < 0) return "";
  const ageWeeks = Math.floor(ageDays / 7);
  return `${ageDays}d (${ageWeeks}w)`;
}

export function showToast(message, duration, nextState, drawCallback) {
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
  
  state.toastMessage = message;
  const prevState = state.appState;
  state.appState = "TOAST";
  if (drawCallback) drawCallback();
  
  state.toastTimer = setTimeout(() => {
    state.toastTimer = null;
    state.appState = nextState || prevState;
    if (drawCallback) drawCallback();
  }, duration);
}

export function handleButton(type, callbacks) {
  const { draw, requestSync, sendLog, exit } = callbacks;
  if (state.appState === "TOAST") return;
  
  if (state.appState === "PLANT_LIST") {
    if (state.plants.length === 0) {
      if (type === "select") {
        if (requestSync) requestSync();
        showToast("Syncing...", 3000, null, draw);
      } else if (type === "back") {
        if (exit) exit();
      }
      return;
    }
    
    if (type === "up") {
      if (state.selectedPlantIdx > 0) {
        state.selectedPlantIdx--;
        if (state.selectedPlantIdx < state.plantListScrollIdx) {
          state.plantListScrollIdx = state.selectedPlantIdx;
        }
        draw();
      }
    } else if (type === "down") {
      if (state.selectedPlantIdx < state.plants.length - 1) {
        state.selectedPlantIdx++;
        const visibleRows = Math.floor((callbacks.screenHeight - 29) / 48);
        if (state.selectedPlantIdx >= state.plantListScrollIdx + visibleRows) {
          state.plantListScrollIdx = state.selectedPlantIdx - visibleRows + 1;
        }
        draw();
      }
    } else if (type === "select") {
      state.appState = "ACTION_MENU";
      state.selectedActionIdx = 0;
      state.actionScrollIdx = 0;
      draw();
    } else if (type === "back") {
      if (exit) exit();
    }
  } else if (state.appState === "ACTION_MENU") {
    if (type === "up") {
      if (state.selectedActionIdx > 0) {
        state.selectedActionIdx--;
        if (state.selectedActionIdx < state.actionScrollIdx) {
          state.actionScrollIdx = state.selectedActionIdx;
        }
        draw();
      }
    } else if (type === "down") {
      if (state.selectedActionIdx < ACTION_OPTIONS.length - 1) {
        state.selectedActionIdx++;
        const visibleRows = Math.floor((callbacks.screenHeight - 29) / 36);
        if (state.selectedActionIdx >= state.actionScrollIdx + visibleRows) {
          state.actionScrollIdx = state.selectedActionIdx - visibleRows + 1;
        }
        draw();
      }
    } else if (type === "select") {
      triggerAction(state.selectedActionIdx, draw, sendLog);
    } else if (type === "back") {
      state.appState = "PLANT_LIST";
      draw();
    }
  } else if (state.appState === "HISTORY") {
    const history = state.plants[state.selectedPlantIdx].history || [];
    if (type === "up") {
      if (state.historyScrollIdx > 0) {
        state.historyScrollIdx--;
        draw();
      }
    } else if (type === "down") {
      const visibleRows = Math.floor((callbacks.screenHeight - 29) / 44);
      if (state.historyScrollIdx < history.length - visibleRows) {
        state.historyScrollIdx++;
        draw();
      }
    } else if (type === "back" || type === "select") {
      state.appState = "ACTION_MENU";
      draw();
    }
  }
}

function triggerAction(actionIdx, draw, sendLog) {
  const plant = state.plants[state.selectedPlantIdx];
  if (actionIdx === 0) {
    state.appState = "HISTORY";
    state.historyScrollIdx = 0;
    draw();
  } else {
    const logType = actionIdx - 1;
    const amount = 0;
    const logTimeStr = new Date().toISOString();
    
    if (logType === 0) plant.lastWatered = logTimeStr;
    else if (logType === 1) plant.lastFertilized = logTimeStr;
    else if (logType === 2) plant.lastRepotted = logTimeStr;
    else if (logType === 3) plant.lastPruned = logTimeStr;
    else if (logType === 4) plant.lastRotated = logTimeStr;
    else if (logType === 5) plant.lastCleaned = logTimeStr;
    else if (logType === 6) plant.lastTreated = logTimeStr;
    else if (logType === 7) plant.lastMoved = logTimeStr;
    
    if (!plant.history) plant.history = [];
    plant.history.push({
      time: logTimeStr,
      type: logType,
      amount
    });
    
    if (plant.history.length > 20) {
      plant.history.shift();
    }
    
    savePlants();
    if (sendLog) sendLog(state.selectedPlantIdx, logType, amount);
    
    const actionNames = ["Watered", "Fertilised", "Repotted", "Pruned", "Rotated", "Cleaned", "Treated", "Moved"];
    const name = actionNames[logType] || "Logged";
    Vibes.shortPulse();
    showToast(name + "!", 1500, "PLANT_LIST", draw);
  }
}
