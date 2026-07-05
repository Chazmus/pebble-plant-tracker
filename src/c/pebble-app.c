#include <pebble.h>
#include <stdio.h>

#define MAX_PLANTS 30
#define PERSIST_KEY_PLANT_COUNT 99
#define PERSIST_KEY_PLANT_BASE 100

typedef struct {
  char id[32];
  char name[32];
  time_t planted_at;
  time_t last_watered;
  time_t last_fertilized;
  int last_fertilized_amount;
} Plant;

static Plant s_plants[MAX_PLANTS];
static int s_plant_count = 0;

static Plant s_temp_plants[MAX_PLANTS];
static int s_temp_plant_count = 0;

// Windows and Layers
static Window *s_main_window;
static MenuLayer *s_menu_layer;

static Window *s_action_window;
static MenuLayer *s_action_menu_layer;

static NumberWindow *s_number_window;
static int s_selected_plant_index = -1;

// Helper: Calculate relative time string
static void get_relative_time_string(char *buffer, size_t buffer_size, time_t event_time) {
  if (event_time == 0) {
    snprintf(buffer, buffer_size, "Never");
    return;
  }
  
  time_t now = time(NULL);
  int diff = (int)(now - event_time);
  
  if (diff < 0) {
    snprintf(buffer, buffer_size, "Just now");
  } else if (diff < 60) {
    snprintf(buffer, buffer_size, "Just now");
  } else if (diff < 3600) {
    int mins = diff / 60;
    snprintf(buffer, buffer_size, "%d min%s ago", mins, mins == 1 ? "" : "s");
  } else if (diff < 86400) {
    int hrs = diff / 3600;
    snprintf(buffer, buffer_size, "%d hr%s ago", hrs, hrs == 1 ? "" : "s");
  } else {
    int days = diff / 86400;
    snprintf(buffer, buffer_size, "%d day%s ago", days, days == 1 ? "" : "s");
  }
}

// Helper: Get plant age in days
static int get_plant_age_days(time_t planted_time) {
  if (planted_time == 0) return 0;
  time_t now = time(NULL);
  int diff = (int)(now - planted_time);
  if (diff < 0) return 0;
  return diff / 86400;
}

// AppMessage helper: Request sync from phone
static void request_sync(void) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  if (iter == NULL) {
    return;
  }
  dict_write_uint8(iter, MESSAGE_KEY_AppKeySync, 1);
  app_message_outbox_send();
  APP_LOG(APP_LOG_LEVEL_INFO, "Requested sync from phone");
}

// --- NumberWindow Callback ---
static void number_selected_callback(struct NumberWindow *number_window, void *context) {
  int amount = number_window_get_value(number_window);
  int index = s_selected_plant_index;
  
  if (index >= 0 && index < s_plant_count) {
    // Update state
    s_plants[index].last_fertilized = time(NULL);
    s_plants[index].last_fertilized_amount = amount;
    
    // Persist
    persist_write_data(PERSIST_KEY_PLANT_BASE + index, &s_plants[index], sizeof(Plant));
    
    // Send AppMessage to phone
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);
    if (iter) {
      dict_write_int32(iter, MESSAGE_KEY_AppKeyPlantIndex, index);
      dict_write_int8(iter, MESSAGE_KEY_AppKeyLogType, 1); // 1 = fertilize
      dict_write_int32(iter, MESSAGE_KEY_AppKeyLogAmount, amount);
      dict_write_uint32(iter, MESSAGE_KEY_AppKeyLogTime, (uint32_t)s_plants[index].last_fertilized);
      app_message_outbox_send();
    }
    
    // Vibration feedback
    vibes_double_pulse();
  }
  
  // Pop NumberWindow and ActionWindow
  window_stack_pop(true);
  window_stack_pop(true);
}

// --- Action Window Callbacks ---
static void log_water_success(int index) {
  if (index >= 0 && index < s_plant_count) {
    // Update state
    s_plants[index].last_watered = time(NULL);
    
    // Persist
    persist_write_data(PERSIST_KEY_PLANT_BASE + index, &s_plants[index], sizeof(Plant));
    
    // Send AppMessage to phone
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);
    if (iter) {
      dict_write_int32(iter, MESSAGE_KEY_AppKeyPlantIndex, index);
      dict_write_int8(iter, MESSAGE_KEY_AppKeyLogType, 0); // 0 = water
      dict_write_uint32(iter, MESSAGE_KEY_AppKeyLogTime, (uint32_t)s_plants[index].last_watered);
      app_message_outbox_send();
    }
    
    // Vibration feedback
    vibes_short_pulse();
  }
  
  // Pop Action Window back to main plant list
  window_stack_pop(true);
}

static uint16_t action_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  return 2;
}

static int16_t action_get_header_height_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  return 28;
}

static void action_draw_header_callback(GContext *ctx, const Layer *cell_layer, uint16_t section_index, void *context) {
  if (s_selected_plant_index < 0 || s_selected_plant_index >= s_plant_count) return;
  Plant p = s_plants[s_selected_plant_index];
  
  char header_buf[64];
  int age = get_plant_age_days(p.planted_at);
  snprintf(header_buf, sizeof(header_buf), "%s (Age: %dd)", p.name, age);
  
  menu_cell_basic_header_draw(ctx, cell_layer, header_buf);
}

static void action_draw_row_callback(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  if (cell_index->row == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Water", "Record watering event", NULL);
  } else if (cell_index->row == 1) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Fertiliser", "Record fertilizer event", NULL);
  }
}

static void action_select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  if (s_selected_plant_index < 0 || s_selected_plant_index >= s_plant_count) return;
  
  if (cell_index->row == 0) {
    log_water_success(s_selected_plant_index);
  } else if (cell_index->row == 1) {
    // Open number window to choose amount
    int last_amt = s_plants[s_selected_plant_index].last_fertilized_amount;
    number_window_set_value(s_number_window, last_amt > 0 ? last_amt : 5);
    window_stack_push((Window *)s_number_window, true);
  }
}

static void action_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);
  
  s_action_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_action_menu_layer, NULL, (MenuLayerCallbacks) {
    .get_num_rows = action_get_num_rows_callback,
    .get_header_height = action_get_header_height_callback,
    .draw_header = action_draw_header_callback,
    .draw_row = action_draw_row_callback,
    .select_click = action_select_callback,
  });
  
  menu_layer_set_click_config_onto_window(s_action_menu_layer, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_action_menu_layer));
}

static void action_window_unload(Window *window) {
  menu_layer_destroy(s_action_menu_layer);
}

// --- Main Window Callbacks ---
static uint16_t get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  if (s_plant_count == 0) {
    return 1;
  }
  return s_plant_count;
}

static void draw_row_callback(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  if (s_plant_count == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "No Plants Found", "Press Select to Sync", NULL);
    return;
  }
  
  int index = cell_index->row;
  if (index >= 0 && index < s_plant_count) {
    Plant p = s_plants[index];
    
    char sub_buf[96];
    char water_buf[24];
    char fert_buf[48];
    
    get_relative_time_string(water_buf, sizeof(water_buf), p.last_watered);
    
    if (p.last_fertilized > 0) {
      char fert_time[24];
      get_relative_time_string(fert_time, sizeof(fert_time), p.last_fertilized);
      snprintf(fert_buf, sizeof(fert_buf), "F: %s (%dml)", fert_time, p.last_fertilized_amount);
    } else {
      snprintf(fert_buf, sizeof(fert_buf), "F: Never");
    }
    
    snprintf(sub_buf, sizeof(sub_buf), "W: %s | %s", water_buf, fert_buf);
    menu_cell_basic_draw(ctx, cell_layer, p.name, sub_buf, NULL);
  }
}

static void select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  if (s_plant_count == 0) {
    request_sync();
    return;
  }
  
  s_selected_plant_index = cell_index->row;
  window_stack_push(s_action_window, true);
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);
  
  s_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks) {
    .get_num_rows = get_num_rows_callback,
    .draw_row = draw_row_callback,
    .select_click = select_callback,
  });
  
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_menu_layer));
}

static void prv_window_appear(Window *window) {
  if (s_menu_layer) {
    menu_layer_reload_data(s_menu_layer);
  }
}

static void prv_window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
}

// --- AppMessage Handlers ---
static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Inbox received message");
  
  // 1. Check for plant count
  Tuple *count_tuple = dict_find(iterator, MESSAGE_KEY_AppKeyPlantCount);
  if (count_tuple) {
    int new_count = count_tuple->value->int32;
    APP_LOG(APP_LOG_LEVEL_INFO, "Sync started: plant count = %d", new_count);
    
    // Copy current plants to temp buffer to preserve local logs during updates
    s_temp_plant_count = s_plant_count;
    for (int i = 0; i < s_plant_count; i++) {
      s_temp_plants[i] = s_plants[i];
    }
    
    s_plant_count = 0;
    persist_write_int(PERSIST_KEY_PLANT_COUNT, 0);
    
    if (new_count == 0) {
      if (s_menu_layer) {
        menu_layer_reload_data(s_menu_layer);
      }
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
      
      // Preserve history if we had this plant ID locally
      bool found = false;
      for (int i = 0; i < s_temp_plant_count; i++) {
        if (strcmp(s_temp_plants[i].id, p.id) == 0) {
          p.last_watered = s_temp_plants[i].last_watered;
          p.last_fertilized = s_temp_plants[i].last_fertilized;
          p.last_fertilized_amount = s_temp_plants[i].last_fertilized_amount;
          found = true;
          break;
        }
      }
      
      if (!found) {
        p.last_watered = 0;
        p.last_fertilized = 0;
        p.last_fertilized_amount = 0;
      }
      
      s_plants[index] = p;
      persist_write_data(PERSIST_KEY_PLANT_BASE + index, &p, sizeof(Plant));
      
      if (index >= s_plant_count) {
        s_plant_count = index + 1;
        persist_write_int(PERSIST_KEY_PLANT_COUNT, s_plant_count);
      }
      
      APP_LOG(APP_LOG_LEVEL_INFO, "Synced plant %d: %s", index, p.name);
      
      if (s_menu_layer) {
        menu_layer_reload_data(s_menu_layer);
      }
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

// --- App Lifecycle ---
static void load_plants_from_storage(void) {
  s_plant_count = 0;
  if (persist_exists(PERSIST_KEY_PLANT_COUNT)) {
    s_plant_count = persist_read_int(PERSIST_KEY_PLANT_COUNT);
    if (s_plant_count > MAX_PLANTS) s_plant_count = MAX_PLANTS;
  }
  
  APP_LOG(APP_LOG_LEVEL_INFO, "Loading %d plants from persistent storage", s_plant_count);
  for (int i = 0; i < s_plant_count; i++) {
    if (persist_exists(PERSIST_KEY_PLANT_BASE + i)) {
      persist_read_data(PERSIST_KEY_PLANT_BASE + i, &s_plants[i], sizeof(Plant));
    }
  }
}

static void prv_init(void) {
  load_plants_from_storage();
  
  s_main_window = window_create();
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = prv_window_load,
    .appear = prv_window_appear,
    .unload = prv_window_unload,
  });
  window_stack_push(s_main_window, true);
  
  s_action_window = window_create();
  window_set_window_handlers(s_action_window, (WindowHandlers) {
    .load = action_window_load,
    .unload = action_window_unload,
  });
  
  s_number_window = number_window_create("Fertilizer ml/L", (NumberWindowCallbacks) {
    .selected = number_selected_callback
  }, NULL);
  number_window_set_min(s_number_window, 1);
  number_window_set_max(s_number_window, 100);
  number_window_set_step_size(s_number_window, 1);
  
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  
  app_message_open(512, 256);
  request_sync();
}

static void prv_deinit(void) {
  window_destroy(s_main_window);
  window_destroy(s_action_window);
  number_window_destroy(s_number_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
