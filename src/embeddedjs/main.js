import Poco from "commodetto/Poco";
import PebbleButton from "pebble/button";
import { state, loadPlants, handleButton } from "./state";
import { initSync, sendLogToPhone, requestSync } from "./sync";
import { draw } from "./ui";

console.log("Alloy watchapp loading modularly...");

const render = new Poco(screen);

// Initial state load
loadPlants();

// Set up UI drawing trigger callback
const drawUI = () => draw(render);

// Initialize AppMessage sync module
initSync(drawUI);

// Configure buttons
const buttonCallbacks = {
  draw: drawUI,
  requestSync: requestSync,
  sendLog: sendLogToPhone,
  exit: () => watch.exit(),
  screenHeight: render.height
};

const buttons = new PebbleButton({
  types: ["up", "down", "select", "back"],
  onPush(pushed, type) {
    if (pushed) {
      handleButton(type, buttonCallbacks);
    }
  }
});

// Periodic minute refresh
watch.addEventListener('minutechange', drawUI);

// Initial render
drawUI();
