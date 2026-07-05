var keys = require('message_keys');
var configHtml = require('./config_html.js');

Pebble.addEventListener('ready', function(e) {
  console.log('PebbleKit JS ready!');
});

Pebble.addEventListener('showConfiguration', function(e) {
  var storedPlants = JSON.parse(localStorage.getItem('plant_tracker_settings') || '[]');
  
  // Inject state directly into HTML string
  var html = configHtml.replace('let plants = [];', 'let plants = ' + JSON.stringify(storedPlants) + ';');
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
    var plants = JSON.parse(decodeURIComponent(e.response));
    console.log('Configuration saved: ' + JSON.stringify(plants));
    
    // Save to localStorage
    localStorage.setItem('plant_tracker_settings', JSON.stringify(plants));
    
    // Send to watch
    sendPlantListToWatch(plants);
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
        // Water
        plants[index].lastWatered = logDateStr;
      } else if (logType === 1) {
        // Fertilize
        plants[index].lastFertilized = logDateStr;
        plants[index].lastFertilizedAmount = logAmount;
      }
      localStorage.setItem('plant_tracker_settings', JSON.stringify(plants));
      console.log('Updated plant log for ' + plants[index].name + ' in localStorage');
    } else {
      console.warn('Received log for invalid plant index: ' + index);
    }
  }
});

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
    
    var plantMsg = {};
    plantMsg[keys.AppKeyPlantIndex] = index;
    plantMsg[keys.AppKeyPlantId] = plant.id || '';
    plantMsg[keys.AppKeyPlantName] = plant.name || 'Unnamed Plant';
    plantMsg[keys.AppKeyPlantDate] = plantedTimeSec;
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
