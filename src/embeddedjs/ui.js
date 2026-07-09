import Poco from "commodetto/Poco";
import { state, ACTION_OPTIONS, getRelativeTime } from "./state";

let fontTitle;
let fontRegular;
let fontBold;

// Color Palette
let cBgColor, cCardBg, cText, cTextDim, cAccent, cSelected, cWhite, cBlack;

export function initUI(render) {
  fontTitle = new render.Font("Gothic-Bold", 18);
  fontRegular = new render.Font("Gothic-Regular", 14);
  fontBold = new render.Font("Gothic-Bold", 14);
  
  cBgColor = render.makeColor(15, 23, 42);
  cCardBg = render.makeColor(30, 41, 59);
  cText = render.makeColor(248, 250, 252);
  cTextDim = render.makeColor(148, 163, 184);
  cAccent = render.makeColor(16, 185, 129);
  cSelected = render.makeColor(51, 65, 85);
  cWhite = render.makeColor(255, 255, 255);
  cBlack = render.makeColor(0, 0, 0);
}

export function draw(render) {
  if (!fontTitle) initUI(render);
  
  render.begin();
  render.fillRectangle(cBgColor, 0, 0, render.width, render.height);
  
  if (state.appState === "TOAST") {
    const cardW = render.width - 24;
    const cardH = 60;
    const cardX = 12;
    const cardY = Math.floor((render.height - cardH) / 2);
    
    render.fillRectangle(cCardBg, cardX, cardY, cardW, cardH);
    render.frameRoundRect(cardX, cardY, cardW, cardH, cAccent, 2);
    
    const textWidth = render.getTextWidth(state.toastMessage, fontTitle);
    render.drawText(state.toastMessage, fontTitle, cText, 
                    cardX + Math.floor((cardW - textWidth) / 2), 
                    cardY + Math.floor((cardH - fontTitle.height) / 2));
                    
  } else if (state.appState === "PLANT_LIST") {
    drawHeader(render, "Plant Tracker");
    
    if (state.plants.length === 0) {
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
        const plantIdx = state.plantListScrollIdx + i;
        if (plantIdx >= state.plants.length) break;
        
        const plant = state.plants[plantIdx];
        const y = 25 + i * itemHeight;
        
        const isSelected = (plantIdx === state.selectedPlantIdx);
        if (isSelected) {
          render.fillRectangle(cAccent, 0, y, render.width, itemHeight);
        }
        
        render.drawText(plant.name || "Unnamed Plant", fontBold, 
                        isSelected ? cBgColor : cText, 8, y + 4);
        
        const relWater = getRelativeTime(plant.lastWatered);
        const relFert = getRelativeTime(plant.lastFertilized);
        const statusText = `W: ${relWater} | F: ${relFert}`;
        
        render.drawText(statusText, fontRegular, isSelected ? cBgColor : cTextDim, 8, y + 22);
        render.drawLine(0, y + itemHeight - 1, render.width, y + itemHeight - 1, cCardBg, 1);
      }
      
      drawScrollIndicators(render, state.plantListScrollIdx, state.plants.length, visibleRows);
    }
    
  } else if (state.appState === "ACTION_MENU") {
    const plant = state.plants[state.selectedPlantIdx];
    drawHeader(render, plant.name || "Plant Menu");
    
    const itemHeight = 32;
    const visibleRows = Math.floor((render.height - 25) / itemHeight);
    
    for (let i = 0; i < visibleRows; i++) {
      const actionIdx = state.actionScrollIdx + i;
      if (actionIdx >= ACTION_OPTIONS.length) break;
      
      const option = ACTION_OPTIONS[actionIdx];
      const y = 25 + i * itemHeight;
      
      const isSelected = (actionIdx === state.selectedActionIdx);
      if (isSelected) {
        render.fillRectangle(cAccent, 0, y, render.width, itemHeight);
      }
      
      const color = isSelected ? cBgColor : (actionIdx === 0 ? cTextDim : cText);
      render.drawText(option, fontBold, color, 12, y + 8);
      render.drawLine(0, y + itemHeight - 1, render.width, y + itemHeight - 1, cCardBg, 1);
    }
    
    drawScrollIndicators(render, state.actionScrollIdx, ACTION_OPTIONS.length, visibleRows);
    
  } else if (state.appState === "HISTORY") {
    drawHeader(render, "History");
    
    const plant = state.plants[state.selectedPlantIdx];
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
        const evIdx = state.historyScrollIdx + i;
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
      
      drawScrollIndicators(render, state.historyScrollIdx, reversedHistory.length, visibleRows);
    }
  }
  
  render.end();
}

function drawHeader(render, title) {
  render.fillRectangle(cBlack, 0, 0, render.width, 24);
  render.drawText(title, fontTitle, cAccent, 6, 2);
  render.drawLine(0, 24, render.width, 24, cAccent, 1);
}

function drawScrollIndicators(render, scrollIdx, totalItems, visibleRows) {
  if (scrollIdx > 0) {
    render.fillRectangle(cAccent, render.width - 10, 28, 6, 2);
    render.fillRectangle(cAccent, render.width - 8, 26, 2, 2);
  }
  if (scrollIdx + visibleRows < totalItems) {
    render.fillRectangle(cAccent, render.width - 10, render.height - 6, 6, 2);
    render.fillRectangle(cAccent, render.width - 8, render.height - 4, 2, 2);
  }
}
