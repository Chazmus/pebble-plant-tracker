#include <pebble.h>
#include "ui.h"
#include "storage.h"
#include "sync.h"

static Window *s_main_window;
static MenuLayer *s_menu_layer;

static Window *s_action_window;
static MenuLayer *s_action_menu_layer;

static Window *s_history_window;
static MenuLayer *s_history_menu_layer;

static NumberWindow *s_number_window;
static int s_selected_plant_index = -1;

void ui_reload_data(void) {
  if (s_menu_layer) {
    menu_layer_reload_data(s_menu_layer);
  }
  if (s_action_menu_layer) {
    menu_layer_reload_data(s_action_menu_layer);
  }
  if (s_history_menu_layer) {
    menu_layer_reload_data(s_history_menu_layer);
  }
}

// Helper callback triggered when the synchronization module finishes updating data
static void sync_update_handler(void) {
  ui_reload_data();
}

// --- Action Logic Helpers ---
static void log_action_success(int index, uint8_t type) {
  Plant *p = storage_get_plant(index);
  if (p) {
    time_t log_time = time(NULL);
    if (type == 0) {
      p->last_watered = log_time;
    }
    
    storage_add_history_event(p, type, 0);
    storage_save_plant(index, p);
    sync_send_log(index, type, 0, log_time);
    
    vibes_short_pulse();
  }
  window_stack_pop(true);
}

// --- NumberWindow Callback ---
static void number_selected_callback(struct NumberWindow *number_window, void *context) {
  int amount = number_window_get_value(number_window);
  int index = s_selected_plant_index;
  Plant *p = storage_get_plant(index);
  
  if (p) {
    time_t log_time = time(NULL);
    p->last_fertilized = log_time;
    p->last_fertilized_amount = amount;
    
    storage_add_history_event(p, 1, amount);
    storage_save_plant(index, p);
    sync_send_log(index, 1, amount, log_time);
    
    vibes_double_pulse();
  }
  
  window_stack_pop(true); // Pop NumberWindow
  window_stack_pop(true); // Pop ActionWindow
}

// --- Action Window Callbacks ---
static uint16_t action_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  return 9;
}

static int16_t action_get_header_height_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  return 28;
}

static void action_draw_header_callback(GContext *ctx, const Layer *cell_layer, uint16_t section_index, void *context) {
  Plant *p = storage_get_plant(s_selected_plant_index);
  if (!p) return;
  
  char header_buf[64];
  int age_days = storage_get_plant_age_days(p->planted_at);
  int age_weeks = age_days / 7;
  snprintf(header_buf, sizeof(header_buf), "%s (Age: %dd / %dw)", p->name, age_days, age_weeks);
  
  menu_cell_basic_header_draw(ctx, cell_layer, header_buf);
}

static void action_draw_row_callback(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  if (cell_index->row == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "View History", "Show previous logs", NULL);
  } else if (cell_index->row == 1) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Water", "Record watering event", NULL);
  } else if (cell_index->row == 2) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Fertiliser", "Record fertilizer event", NULL);
  } else if (cell_index->row == 3) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Repotting", "Record repotting event", NULL);
  } else if (cell_index->row == 4) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Pruning", "Record pruning event", NULL);
  } else if (cell_index->row == 5) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Rotation", "Record pot rotation", NULL);
  } else if (cell_index->row == 6) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Cleaning", "Record leaf cleaning", NULL);
  } else if (cell_index->row == 7) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Treatment", "Record pest treatment", NULL);
  } else if (cell_index->row == 8) {
    menu_cell_basic_draw(ctx, cell_layer, "Log Relocation", "Record location change", NULL);
  }
}

static void action_select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  int row = cell_index->row;
  
  if (row == 0) {
    window_stack_push(s_history_window, true);
  } else if (row == 1) {
    log_action_success(s_selected_plant_index, 0); // 0 = Water
  } else if (row == 2) {
    Plant *p = storage_get_plant(s_selected_plant_index);
    int last_amt = p ? p->last_fertilized_amount : 5;
    number_window_set_value(s_number_window, last_amt > 0 ? last_amt : 5);
    window_stack_push((Window *)s_number_window, true);
  } else if (row >= 3 && row <= 8) {
    log_action_success(s_selected_plant_index, row - 1); // 2 = Repotted, etc.
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

// --- History Window Callbacks ---
static uint16_t history_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  Plant *p = storage_get_plant(s_selected_plant_index);
  if (!p) return 0;
  int count = p->history_count;
  if (count == 0) {
    return 1; // "No history" row
  }
  return count;
}

static int16_t history_get_header_height_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  return 28;
}

static void history_draw_header_callback(GContext *ctx, const Layer *cell_layer, uint16_t section_index, void *context) {
  Plant *p = storage_get_plant(s_selected_plant_index);
  if (!p) return;
  
  char header_buf[64];
  snprintf(header_buf, sizeof(header_buf), "History: %s", p->name);
  
  menu_cell_basic_header_draw(ctx, cell_layer, header_buf);
}

static void history_draw_row_callback(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  Plant *p = storage_get_plant(s_selected_plant_index);
  if (!p) return;
  
  if (p->history_count == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "No History Logs", "Water/fertilize to log", NULL);
    return;
  }
  
  int row = cell_index->row;
  int event_idx = p->history_count - 1 - row;
  if (event_idx >= 0 && event_idx < p->history_count) {
    LogEvent ev = p->history[event_idx];
    
    char title_buf[32];
    char time_buf[24];
    
    storage_get_relative_time_string(time_buf, sizeof(time_buf), ev.time);
    
    if (ev.type == 0) {
      snprintf(title_buf, sizeof(title_buf), "Watered");
    } else if (ev.type == 1) {
      snprintf(title_buf, sizeof(title_buf), "Fertilized (%dml/L)", ev.amount);
    } else if (ev.type == 2) {
      snprintf(title_buf, sizeof(title_buf), "Repotted");
    } else if (ev.type == 3) {
      snprintf(title_buf, sizeof(title_buf), "Pruned");
    } else if (ev.type == 4) {
      snprintf(title_buf, sizeof(title_buf), "Rotated");
    } else if (ev.type == 5) {
      snprintf(title_buf, sizeof(title_buf), "Cleaned");
    } else if (ev.type == 6) {
      snprintf(title_buf, sizeof(title_buf), "Treated");
    } else if (ev.type == 7) {
      snprintf(title_buf, sizeof(title_buf), "Moved");
    } else {
      snprintf(title_buf, sizeof(title_buf), "Logged event %d", ev.type);
    }
    
    menu_cell_basic_draw(ctx, cell_layer, title_buf, time_buf, NULL);
  }
}

static void history_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);
  
  s_history_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_history_menu_layer, NULL, (MenuLayerCallbacks) {
    .get_num_rows = history_get_num_rows_callback,
    .get_header_height = history_get_header_height_callback,
    .draw_header = history_draw_header_callback,
    .draw_row = history_draw_row_callback,
  });
  
  menu_layer_set_click_config_onto_window(s_history_menu_layer, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_history_menu_layer));
}

static void history_window_unload(Window *window) {
  menu_layer_destroy(s_history_menu_layer);
}

// --- Main Window Callbacks ---
static uint16_t get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *context) {
  int count = storage_get_plant_count();
  if (count == 0) {
    return 1;
  }
  return count;
}

static void draw_row_callback(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  int count = storage_get_plant_count();
  if (count == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "No Plants Found", "Press Select to Sync", NULL);
    return;
  }
  
  int index = cell_index->row;
  Plant *p = storage_get_plant(index);
  if (p) {
    char sub_buf[96];
    char water_buf[24];
    char fert_buf[48];
    
    storage_get_relative_time_string(water_buf, sizeof(water_buf), p->last_watered);
    
    if (p->last_fertilized > 0) {
      char fert_time[24];
      storage_get_relative_time_string(fert_time, sizeof(fert_time), p->last_fertilized);
      snprintf(fert_buf, sizeof(fert_buf), "F: %s (%dml)", fert_time, p->last_fertilized_amount);
    } else {
      snprintf(fert_buf, sizeof(fert_buf), "F: Never");
    }
    
    snprintf(sub_buf, sizeof(sub_buf), "W: %s | %s", water_buf, fert_buf);
    menu_cell_basic_draw(ctx, cell_layer, p->name, sub_buf, NULL);
  }
}

static void select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  int count = storage_get_plant_count();
  if (count == 0) {
    sync_request();
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
  ui_reload_data();
}

static void prv_window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
}

void ui_init(void) {
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
  
  s_history_window = window_create();
  window_set_window_handlers(s_history_window, (WindowHandlers) {
    .load = history_window_load,
    .unload = history_window_unload,
  });
  
  s_number_window = number_window_create("Fertilizer ml/L", (NumberWindowCallbacks) {
    .selected = number_selected_callback
  }, NULL);
  number_window_set_min(s_number_window, 1);
  number_window_set_max(s_number_window, 100);
  number_window_set_step_size(s_number_window, 1);
  
  // Register callback to update UI when sync changes data
  sync_register_update_callback(sync_update_handler);
}

void ui_deinit(void) {
  window_destroy(s_main_window);
  window_destroy(s_action_window);
  window_destroy(s_history_window);
  number_window_destroy(s_number_window);
}
