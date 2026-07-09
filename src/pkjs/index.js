var keys = require('message_keys');
var configHtml = require('./config_html.js');

Pebble.addEventListener('ready', function(e) {
  console.log('PebbleKit JS ready!');
});

Pebble.addEventListener('showConfiguration', function(e) {
  var storedPlants = JSON.parse(localStorage.getItem('plant_tracker_settings') || '[]');
  
  // Ensure all existing plants have unique IDs
  var updated = false;
  storedPlants.forEach(function(plant, i) {
    if (!plant.id) {
      plant.id = 'p_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem('plant_tracker_settings', JSON.stringify(storedPlants));
  }
  
  // Inject state directly into HTML string using a robust regex
  var html = configHtml.replace(/let\s+plants\s*=\s*\[\s*\]\s*;?/, 'let plants = ' + JSON.stringify(storedPlants) + ';');
  console.log('WebView Injection Status: ' + (html !== configHtml ? 'SUCCESS' : 'FAILED'));
  
  var url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  
  console.log('Showing configuration page...');
  Pebble.openURL(url);
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e.response) {
    console.log('Configuration cancelled.');
    return;
  }
  
  try {
    var updatedPlants = JSON.parse(decodeURIComponent(e.response));
    console.log('Configuration saved: ' + JSON.stringify(updatedPlants));
    
    // Retrieve the existing plants (which have the latest watch logs)
    var existingPlants = JSON.parse(localStorage.getItem('plant_tracker_settings') || '[]');
    
    // Merge: for each updated plant, preserve history & logs from matching existing plant
    var mergedPlants = updatedPlants.map(function(up, index) {
      var match = null;
      if (up.id) {
        match = existingPlants.find(function(ep) {
          return ep.id === up.id;
        });
      }
      
      // Fallback only if both up and existing plants lack IDs (legacy compatibility)
      if (!match && !up.id && existingPlants[index] && !existingPlants[index].id) {
        match = existingPlants[index];
      }
      
      if (match) {
        // Retain the latest history and logs from the existing storage
        up.id = up.id || match.id;
        up.lastWatered = match.lastWatered || up.lastWatered || null;
        up.lastFertilized = match.lastFertilized || up.lastFertilized || null;
        up.lastFertilizedAmount = match.lastFertilizedAmount !== undefined ? match.lastFertilizedAmount : (up.lastFertilizedAmount || 0);
        up.lastRepotted = match.lastRepotted || up.lastRepotted || null;
        up.lastPruned = match.lastPruned || up.lastPruned || null;
        up.lastRotated = match.lastRotated || up.lastRotated || null;
        up.lastCleaned = match.lastCleaned || up.lastCleaned || null;
        up.lastTreated = match.lastTreated || up.lastTreated || null;
        up.lastMoved = match.lastMoved || up.lastMoved || null;
        up.history = match.history || up.history || [];
      }
      return up;
    });
    
    // Save to localStorage
    localStorage.setItem('plant_tracker_settings', JSON.stringify(mergedPlants));
    
    // Send to watch
    sendPlantListToWatch(mergedPlants);
  } catch (err) {
    console.error('Error parsing configuration response: ' + err);
  }
});

Pebble.addEventListener('appmessage', function(e) {
  var payload = e.payload;
  console.log('Received AppMessage from watch: ' + JSON.stringify(payload));
  
  if (payload[keys.AppKeySync] !== undefined) {
    console.log('Sync requested by watch');
    var plants = JSON.parse(localStorage.getItem('plant_tracker_settings') || '[]');
    sendPlantListToWatch(plants);
  } else if (payload[keys.AppKeyPlantIndex] !== undefined) {
    var index = payload[keys.AppKeyPlantIndex];
    var logType = payload[keys.AppKeyLogType];
    var logAmount = payload[keys.AppKeyLogAmount] || 0;
    var logTimeSec = payload[keys.AppKeyLogTime] || Math.floor(Date.now() / 1000);
    
    var logTimeMs = logTimeSec * 1000;
    var logDateStr = new Date(logTimeMs).toISOString();
    
    var plants = JSON.parse(localStorage.getItem('plant_tracker_settings') || '[]');
    if (plants[index]) {
      if (logType === 0) {
        plants[index].lastWatered = logDateStr;
      } else if (logType === 1) {
        plants[index].lastFertilized = logDateStr;
        plants[index].lastFertilizedAmount = logAmount;
      } else if (logType === 2) {
        plants[index].lastRepotted = logDateStr;
      } else if (logType === 3) {
        plants[index].lastPruned = logDateStr;
      } else if (logType === 4) {
        plants[index].lastRotated = logDateStr;
      } else if (logType === 5) {
        plants[index].lastCleaned = logDateStr;
      } else if (logType === 6) {
        plants[index].lastTreated = logDateStr;
      } else if (logType === 7) {
        plants[index].lastMoved = logDateStr;
      }

      // Add to local history list
      if (!plants[index].history) {
        plants[index].history = [];
      }
      plants[index].history.push({
        type: logType,
        amount: logAmount,
        time: logDateStr
      });

      // Keep last 100 items
      if (plants[index].history.length > 100) {
        plants[index].history.shift();
      }

      localStorage.setItem('plant_tracker_settings', JSON.stringify(plants));
      console.log('Updated plant log for ' + plants[index].name + ' (type ' + logType + ') in localStorage');
    } else {
      console.warn('Received log for invalid plant index: ' + index);
    }
  }
});

function serializeHistory(history) {
  if (!history || history.length === 0) {
    return [];
  }
  // Cap history to 20 items to match watch MAX_HISTORY
  var items = history.slice(-20);
  var bytes = [];
  
  for (var i = 0; i < items.length; i++) {
    var ev = items[i];
    var timeSec = Math.floor(new Date(ev.time).getTime() / 1000) || 0;
    var type = ev.type !== undefined ? ev.type : 0;
    var amount = ev.amount !== undefined ? ev.amount : 0;
    
    // 4 bytes time (little-endian unsigned 32-bit integer)
    bytes.push(timeSec & 0xff);
    bytes.push((timeSec >> 8) & 0xff);
    bytes.push((timeSec >> 16) & 0xff);
    bytes.push((timeSec >> 24) & 0xff);
    
    // 1 byte type
    bytes.push(type & 0xff);
    
    // 1 byte amount
    bytes.push(amount & 0xff);
    
    // 2 bytes padding (to align LogEvent struct to 8 bytes)
    bytes.push(0);
    bytes.push(0);
  }
  return bytes;
}

function sendPlantListToWatch(plants) {
  var queue = [];
  
  // First message: send count
  var countMsg = {};
  countMsg[keys.AppKeyPlantCount] = plants.length;
  queue.push(countMsg);
  
  // Next messages: send each plant
  plants.forEach(function(plant, index) {
    var plantedDate = new Date(plant.plantedAt);
    var plantedTimeSec = Math.floor(plantedDate.getTime() / 1000) || 0;
    
    var lastWateredSec = plant.lastWatered ? Math.floor(new Date(plant.lastWatered).getTime() / 1000) : 0;
    var lastFertilizedSec = plant.lastFertilized ? Math.floor(new Date(plant.lastFertilized).getTime() / 1000) : 0;
    var lastFertilizedAmount = plant.lastFertilizedAmount || 0;
    var historyBytes = serializeHistory(plant.history);
    
    var plantMsg = {};
    plantMsg[keys.AppKeyPlantIndex] = index;
    plantMsg[keys.AppKeyPlantId] = plant.id || '';
    plantMsg[keys.AppKeyPlantName] = plant.name || 'Unnamed Plant';
    plantMsg[keys.AppKeyPlantDate] = plantedTimeSec;
    plantMsg[keys.AppKeyLastWatered] = lastWateredSec;
    plantMsg[keys.AppKeyLastFertilized] = lastFertilizedSec;
    plantMsg[keys.AppKeyLastFertilisedAmount] = lastFertilizedAmount;
    plantMsg[keys.AppKeyPlantHistory] = historyBytes;
    
    queue.push(plantMsg);
  });
  
  console.log('Sending ' + queue.length + ' messages to watch...');
  sendNext(queue);
}

function sendNext(queue) {
  if (queue.length === 0) {
    console.log('All messages sent successfully.');
    return;
  }
  
  var msg = queue.shift();
  Pebble.sendAppMessage(msg, function(e) {
    sendNext(queue);
  }, function(e) {
    console.error('Failed to send AppMessage to watch: ' + JSON.stringify(e));
    // Try to continue sending the rest of the queue
    sendNext(queue);
  });
}
