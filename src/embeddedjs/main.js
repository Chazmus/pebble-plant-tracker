import Poco from "commodetto/Poco";
import PebbleButton from "pebble/button";
import Message from "pebble/message";
import Vibes from "pebble/vibes";

console.log("Alloy watchapp loading...");

let render = new Poco(screen);

// Fonts (aligned with mapped system fonts in xsHost.c)
const fontTitle = new render.Font("Gothic-Bold", 18);
const fontRegular = new render.Font("Gothic-Regular", 14);
const fontBold = new render.Font("Gothic-Bold", 14);

// Theme Palette (slate dark theme with emerald accent)
const cBg = render.makeColor(15, 23, 42);           // Slate-900: #0f172a
const cCardBg = render.makeColor(30, 41, 59);       // Slate-800: #1e293b
const cText = render.makeColor(248, 250, 252);      // Slate-50: #f8fafc
const cTextDim = render.makeColor(148, 163, 184);   // Slate-400: #94a3b8
const cAccent = render.makeColor(16, 185, 129);     // Emerald-500: #10b981
const cSelected = render.makeColor(51, 65, 85);     // Slate-700: #334155
const cWhite = render.makeColor(255, 255, 255);
const cBlack = render.makeColor(0, 0, 0);

// Action Menu Options
const ACTION_OPTIONS = [
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

// App States
let appState = "PLANT_LIST"; // "PLANT_LIST" | "ACTION_MENU" | "HISTORY" | "TOAST"
let plants = [];
let selectedPlantIdx = 0;
let selectedActionIdx = 0;
let historyScrollIdx = 0;
let plantListScrollIdx = 0;
let actionScrollIdx = 0;

let toastMessage = "";
let toastTimer = null;

let expectedPlantCount = 0;
let tempPlants = [];

// Initialize Message connection
let watchMessage = new Message({
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
      
      // 1. Sync Start
      if (msg.has("AppKeyPlantCount")) {
        const count = msg.get("AppKeyPlantCount");
        console.log("Sync started, expected plants: " + count);
        expectedPlantCount = count;
        tempPlants = [];
        
        if (count === 0) {
          plants = [];
          savePlants(plants);
          selectedPlantIdx = 0;
          plantListScrollIdx = 0;
          appState = "PLANT_LIST";
          draw();
        }
      }
      
      // 2. Individual Plant Data
      if (msg.has("AppKeyPlantIndex") && msg.has("AppKeyPlantName")) {
        const index = msg.get("AppKeyPlantIndex");
        const id = msg.get("AppKeyPlantId");
        const name = msg.get("AppKeyPlantName");
        const plantedAtSec = msg.get("AppKeyPlantDate");
        const lastWateredSec = msg.get("AppKeyLastWatered");
        const lastFertilizedSec = msg.get("AppKeyLastFertilized");
        const lastFertilizedAmount = msg.get("AppKeyLastFertilisedAmount");
        const historyBytes = msg.get("AppKeyPlantHistory");
        
        console.log("Received plant index " + index + ": " + name);
        
        const plantedAt = plantedAtSec > 0 ? new Date(plantedAtSec * 1000).toISOString().split('T')[0] : "";
        const lastWatered = lastWateredSec > 0 ? new Date(lastWateredSec * 1000).toISOString() : null;
        const lastFertilized = lastFertilizedSec > 0 ? new Date(lastFertilizedSec * 1000).toISOString() : null;
        const history = parseHistoryBytes(historyBytes);
        
        tempPlants[index] = {
          id: id || "p_" + index,
          name,
          plantedAt,
          lastWatered,
          lastFertilized,
          lastFertilizedAmount,
          history
        };
        
        // Check if finished
        let finished = true;
        for (let i = 0; i < expectedPlantCount; i++) {
          if (tempPlants[i] === undefined) {
            finished = false;
            break;
          }
        }
        
        if (finished && tempPlants.length === expectedPlantCount) {
          plants = tempPlants;
          savePlants(plants);
          selectedPlantIdx = 0;
          plantListScrollIdx = 0;
          appState = "PLANT_LIST";
          Vibes.doublePulse();
          showToast("Synced!", 1500);
        }
      }
    } catch (e) {
      console.log("Error handling incoming AppMessage: " + e);
    }
  }
});

// Load plants from localStorage
plants = loadPlants();

// Buttons configuration
const buttons = new PebbleButton({
  types: ["up", "down", "select", "back"],
  onPush(pushed, type) {
    if (pushed) {
      handleButton(type);
    }
  }
});

// Register minute change timer to refresh relative times
watch.addEventListener('minutechange', draw);

// Initial draw
draw();

// Functions

function loadPlants() {
  try {
    const data = localStorage.getItem("plants_alloy");
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.log("Error loading plants: " + e);
  }
  return [];
}

function savePlants(pList) {
  try {
    localStorage.setItem("plants_alloy", JSON.stringify(pList));
  } catch (e) {
    console.log("Error saving plants: " + e);
  }
}

function parseHistoryBytes(arrayBuffer) {
  const history = [];
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return history;
  
  const bytes = new Uint8Array(arrayBuffer);
  const count = Math.floor(bytes.length / 8);
  for (let i = 0; i < count; i++) {
    const offset = i * 8;
    
    // Unpack little-endian uint32
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

function sendLogToPhone(plantIndex, type, amount) {
  try {
    const map = new Map();
    map.set("AppKeyPlantIndex", plantIndex);
    map.set("AppKeyLogType", type);
    map.set("AppKeyLogAmount", amount);
    map.set("AppKeyLogTime", Math.floor(Date.now() / 1000));
    watchMessage.write(map);
  } catch (e) {
    console.log("Error sending log to phone: " + e);
  }
}

function requestSync() {
  try {
    const map = new Map();
    map.set("AppKeySync", 1);
    watchMessage.write(map);
  } catch (e) {
    console.log("Error requesting sync: " + e);
  }
}

function getRelativeTime(timeStr) {
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

function showToast(message, duration, nextState) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  
  toastMessage = message;
  const prevState = appState;
  appState = "TOAST";
  draw();
  
  toastTimer = setTimeout(() => {
    toastTimer = null;
    appState = nextState || prevState;
    draw();
  }, duration);
}

function handleButton(type) {
  if (appState === "TOAST") return;
  
  if (appState === "PLANT_LIST") {
    if (plants.length === 0) {
      if (type === "select") {
        requestSync();
        showToast("Syncing...", 3000);
      } else if (type === "back") {
        watch.exit();
      }
      return;
    }
    
    if (type === "up") {
      if (selectedPlantIdx > 0) {
        selectedPlantIdx--;
        if (selectedPlantIdx < plantListScrollIdx) {
          plantListScrollIdx = selectedPlantIdx;
        }
        draw();
      }
    } else if (type === "down") {
      if (selectedPlantIdx < plants.length - 1) {
        selectedPlantIdx++;
        const visibleRows = Math.floor((render.height - 25) / 44);
        if (selectedPlantIdx >= plantListScrollIdx + visibleRows) {
          plantListScrollIdx = selectedPlantIdx - visibleRows + 1;
        }
        draw();
      }
    } else if (type === "select") {
      appState = "ACTION_MENU";
      selectedActionIdx = 0;
      actionScrollIdx = 0;
      draw();
    } else if (type === "back") {
      watch.exit();
    }
  } else if (appState === "ACTION_MENU") {
    if (type === "up") {
      if (selectedActionIdx > 0) {
        selectedActionIdx--;
        if (selectedActionIdx < actionScrollIdx) {
          actionScrollIdx = selectedActionIdx;
        }
        draw();
      }
    } else if (type === "down") {
      if (selectedActionIdx < ACTION_OPTIONS.length - 1) {
        selectedActionIdx++;
        const visibleRows = Math.floor((render.height - 25) / 32);
        if (selectedActionIdx >= actionScrollIdx + visibleRows) {
          actionScrollIdx = selectedActionIdx - visibleRows + 1;
        }
        draw();
      }
    } else if (type === "select") {
      triggerAction(selectedActionIdx);
    } else if (type === "back") {
      appState = "PLANT_LIST";
      draw();
    }
  } else if (appState === "HISTORY") {
    const history = plants[selectedPlantIdx].history || [];
    if (type === "up") {
      if (historyScrollIdx > 0) {
        historyScrollIdx--;
        draw();
      }
    } else if (type === "down") {
      const visibleRows = Math.floor((render.height - 25) / 36);
      if (historyScrollIdx < history.length - visibleRows) {
        historyScrollIdx++;
        draw();
      }
    } else if (type === "back" || type === "select") {
      appState = "ACTION_MENU";
      draw();
    }
  }
}

function triggerAction(actionIdx) {
  const plant = plants[selectedPlantIdx];
  if (actionIdx === 0) {
    appState = "HISTORY";
    historyScrollIdx = 0;
    draw();
  } else {
    const logType = actionIdx - 1;
    const amount = 0;
    const logTimeStr = new Date().toISOString();
    
    // Update plant record
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
    
    savePlants(plants);
    sendLogToPhone(selectedPlantIdx, logType, amount);
    
    const actionNames = ["Watered", "Fertilised", "Repotted", "Pruned", "Rotated", "Cleaned", "Treated", "Moved"];
    const name = actionNames[logType] || "Logged";
    Vibes.shortPulse();
    showToast(name + "!", 1500, "PLANT_LIST"); // Go back to plant list after success
  }
}

function drawHeader(title) {
  render.fillRectangle(cBlack, 0, 0, render.width, 24);
  render.drawText(title, fontTitle, cAccent, 6, 2);
  render.drawLine(0, 24, render.width, 24, cAccent, 1);
}

function drawScrollIndicators(scrollIdx, totalItems, visibleRows) {
  if (scrollIdx > 0) {
    render.fillRectangle(cAccent, render.width - 10, 28, 6, 2);
    render.fillRectangle(cAccent, render.width - 8, 26, 2, 2);
  }
  if (scrollIdx + visibleRows < totalItems) {
    render.fillRectangle(cAccent, render.width - 10, render.height - 6, 6, 2);
    render.fillRectangle(cAccent, render.width - 8, render.height - 4, 2, 2);
  }
}

function draw() {
  render.begin();
  render.fillRectangle(cBg, 0, 0, render.width, render.height);
  
  if (appState === "TOAST") {
    const cardW = render.width - 24;
    const cardH = 60;
    const cardX = 12;
    const cardY = Math.floor((render.height - cardH) / 2);
    
    render.fillRectangle(cCardBg, cardX, cardY, cardW, cardH);
    render.frameRoundRect(cardX, cardY, cardW, cardH, cAccent, 2);
    
    const textWidth = render.getTextWidth(toastMessage, fontTitle);
    render.drawText(toastMessage, fontTitle, cText, 
                    cardX + Math.floor((cardW - textWidth) / 2), 
                    cardY + Math.floor((cardH - fontTitle.height) / 2));
                    
  } else if (appState === "PLANT_LIST") {
    drawHeader("Plant Tracker");
    
    if (plants.length === 0) {
      const msg1 = "No Plants Found";
      const msg2 = "Press SELECT to sync";
      
      const w1 = render.getTextWidth(msg1, fontBold);
      const w2 = render.getTextWidth(msg2, fontRegular);
      
      const centerY = Math.floor((render.height - 25) / 2) + 12;
      
      render.drawText(msg1, fontBold, cText, Math.floor((render.width - w1) / 2), centerY - 14);
      render.drawText(msg2, fontRegular, cTextDim, Math.floor((render.width - w2) / 2), centerY + 6);
    } else {
      const itemHeight = 44;
      const visibleRows = Math.floor((render.height - 25) / itemHeight);
      
      for (let i = 0; i < visibleRows; i++) {
        const plantIdx = plantListScrollIdx + i;
        if (plantIdx >= plants.length) break;
        
        const plant = plants[plantIdx];
        const y = 25 + i * itemHeight;
        
        if (plantIdx === selectedPlantIdx) {
          render.fillRectangle(cSelected, 0, y, render.width, itemHeight);
        }
        
        render.drawText(plant.name || "Unnamed Plant", fontBold, 
                        plantIdx === selectedPlantIdx ? cAccent : cText, 8, y + 4);
        
        const relWater = getRelativeTime(plant.lastWatered);
        const relFert = getRelativeTime(plant.lastFertilized);
        const statusText = `W: ${relWater} | F: ${relFert}`;
        
        render.drawText(statusText, fontRegular, cTextDim, 8, y + 22);
        render.drawLine(0, y + itemHeight - 1, render.width, y + itemHeight - 1, cCardBg, 1);
      }
      
      drawScrollIndicators(plantListScrollIdx, plants.length, visibleRows);
    }
    
  } else if (appState === "ACTION_MENU") {
    const plant = plants[selectedPlantIdx];
    drawHeader(plant.name || "Plant Menu");
    
    const itemHeight = 32;
    const visibleRows = Math.floor((render.height - 25) / itemHeight);
    
    for (let i = 0; i < visibleRows; i++) {
      const actionIdx = actionScrollIdx + i;
      if (actionIdx >= ACTION_OPTIONS.length) break;
      
      const option = ACTION_OPTIONS[actionIdx];
      const y = 25 + i * itemHeight;
      
      if (actionIdx === selectedActionIdx) {
        render.fillRectangle(cSelected, 0, y, render.width, itemHeight);
      }
      
      const color = actionIdx === selectedActionIdx ? cAccent : (actionIdx === 0 ? cTextDim : cText);
      render.drawText(option, fontBold, color, 12, y + 8);
      render.drawLine(0, y + itemHeight - 1, render.width, y + itemHeight - 1, cCardBg, 1);
    }
    
    drawScrollIndicators(actionScrollIdx, ACTION_OPTIONS.length, visibleRows);
    
  } else if (appState === "HISTORY") {
    drawHeader("History");
    
    const plant = plants[selectedPlantIdx];
    const history = plant.history || [];
    
    if (history.length === 0) {
      const msg = "No History Logs";
      const w = render.getTextWidth(msg, fontRegular);
      render.drawText(msg, fontRegular, cTextDim, 
                      Math.floor((render.width - w) / 2), 
                      Math.floor((render.height - fontRegular.height) / 2) + 12);
    } else {
      const itemHeight = 36;
      const visibleRows = Math.floor((render.height - 25) / itemHeight);
      const reversedHistory = history.slice().reverse();
      
      for (let i = 0; i < visibleRows; i++) {
        const evIdx = historyScrollIdx + i;
        if (evIdx >= reversedHistory.length) break;
        
        const ev = reversedHistory[evIdx];
        const y = 25 + i * itemHeight;
        
        let actionText = "";
        if (ev.type === 0) actionText = "Watered";
        else if (ev.type === 1) actionText = `Fertilised (${ev.amount}ml)`;
        else if (ev.type === 2) actionText = "Repotted";
        else if (ev.type === 3) actionText = "Pruned";
        else if (ev.type === 4) actionText = "Rotated";
        else if (ev.type === 5) actionText = "Cleaned";
        else if (ev.type === 6) actionText = "Treated";
        else if (ev.type === 7) actionText = "Moved";
        
        const timeText = getRelativeTime(ev.time);
        
        render.drawText(actionText, fontBold, cText, 8, y + 2);
        render.drawText(timeText, fontRegular, cTextDim, 8, y + 18);
        render.drawLine(0, y + itemHeight - 1, render.width, y + itemHeight - 1, cCardBg, 1);
      }
      
      drawScrollIndicators(historyScrollIdx, reversedHistory.length, visibleRows);
    }
  }
  
  render.end();
}
