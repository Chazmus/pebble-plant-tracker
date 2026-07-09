#include "sync.h"
#include "storage.h"

static SyncUpdateCallback s_update_callback = NULL;

void sync_register_update_callback(SyncUpdateCallback callback) {
  s_update_callback = callback;
}

static void trigger_ui_update(void) {
  if (s_update_callback) {
    s_update_callback();
  }
}

void sync_request(void) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  if (iter == NULL) {
    return;
  }
  dict_write_uint8(iter, MESSAGE_KEY_AppKeySync, 1);
  app_message_outbox_send();
  APP_LOG(APP_LOG_LEVEL_INFO, "Requested sync from phone");
}

void sync_send_log(int plant_index, uint8_t log_type, uint32_t amount, time_t log_time) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  if (iter) {
    dict_write_int32(iter, MESSAGE_KEY_AppKeyPlantIndex, plant_index);
    dict_write_int8(iter, MESSAGE_KEY_AppKeyLogType, log_type);
    if (log_type == 1) { // 1 = Fertilize
      dict_write_int32(iter, MESSAGE_KEY_AppKeyLogAmount, amount);
    }
    dict_write_uint32(iter, MESSAGE_KEY_AppKeyLogTime, (uint32_t)log_time);
    app_message_outbox_send();
  }
}

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Inbox received message");
  
  // 1. Check for plant count
  Tuple *count_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantCount);
  if (count_tuple) {
    int new_count = count_tuple->value->int32;
    APP_LOG(APP_LOG_LEVEL_INFO, "Sync started: plant count = %d", new_count);
    
    // Copy current plants to temp buffer to preserve local logs/history during updates
    storage_backup_plants();
    storage_clear_plants();
    
    if (new_count == 0) {
      trigger_ui_update();
      return;
    }
  }
  
  // 2. Check for individual plant data
  Tuple *index_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantIndex);
  Tuple *id_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantId);
  Tuple *name_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantName);
  Tuple *date_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantDate);
  
  if (index_tuple && name_tuple && date_tuple) {
    int index = index_tuple->value->int32;
    if (index >= 0 && index < MAX_PLANTS) {
      Plant p;
      memset(&p, 0, sizeof(Plant));
      
      if (id_tuple) {
        snprintf(p.id, sizeof(p.id), "%s", id_tuple->value->cstring);
      } else {
        snprintf(p.id, sizeof(p.id), "idx_%d", index);
      }
      
      snprintf(p.name, sizeof(p.name), "%s", name_tuple->value->cstring);
      p.planted_at = (time_t)date_tuple->value->uint32;
      
      // Preserve history logs if we had this plant ID locally
      bool found = false;
      int backup_count = storage_get_backup_plant_count();
      for (int i = 0; i < backup_count; i++) {
        Plant *backup_p = storage_get_backup_plant(i);
        if (backup_p && strcmp(backup_p->id, p.id) == 0) {
          p.last_watered = backup_p->last_watered;
          p.last_fertilized = backup_p->last_fertilized;
          p.last_fertilized_amount = backup_p->last_fertilized_amount;
          p.history_count = backup_p->history_count;
          memcpy(p.history, backup_p->history, sizeof(p.history));
          found = true;
          break;
        }
      }
      
      if (!found) {
        p.last_watered = 0;
        p.last_fertilized = 0;
        p.last_fertilized_amount = 0;
        p.history_count = 0;
        memset(p.history, 0, sizeof(p.history));
      }
      
      storage_save_plant(index, &p);
      APP_LOG(APP_LOG_LEVEL_INFO, "Synced plant %d: %s", index, p.name);
      trigger_ui_update();
    }
  }
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Inbox dropped message: %d", reason);
}

static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox send failed: %d", reason);
}

static void outbox_sent_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Outbox send success");
}

void sync_init(void) {
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  
  app_message_open(512, 256);
}
