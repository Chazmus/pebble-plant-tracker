#include "storage.h"

static Plant s_plants[MAX_PLANTS];
static int s_plant_count = 0;

static Plant s_temp_plants[MAX_PLANTS];
static int s_temp_plant_count = 0;

void storage_init(void) {
  storage_load_plants();
}

Plant* storage_get_plant(int index) {
  if (index >= 0 && index < MAX_PLANTS) {
    return &s_plants[index];
  }
  return NULL;
}

int storage_get_plant_count(void) {
  return s_plant_count;
}

void storage_set_plant_count(int count) {
  if (count >= 0 && count <= MAX_PLANTS) {
    s_plant_count = count;
    persist_write_int(PERSIST_KEY_PLANT_COUNT, s_plant_count);
  }
}

void storage_save_plant(int index, const Plant *p) {
  if (index >= 0 && index < MAX_PLANTS && p != NULL) {
    s_plants[index] = *p;
    persist_write_data(PERSIST_KEY_PLANT_BASE + index, p, sizeof(Plant));
    
    if (index >= s_plant_count) {
      s_plant_count = index + 1;
      persist_write_int(PERSIST_KEY_PLANT_COUNT, s_plant_count);
    }
  }
}

void storage_load_plants(void) {
  s_plant_count = 0;
  if (persist_exists(PERSIST_KEY_PLANT_COUNT)) {
    s_plant_count = persist_read_int(PERSIST_KEY_PLANT_COUNT);
    if (s_plant_count > MAX_PLANTS) s_plant_count = MAX_PLANTS;
  }
  
  APP_LOG(APP_LOG_LEVEL_INFO, "Loading %d plants from persistent storage", s_plant_count);
  for (int i = 0; i < s_plant_count; i++) {
    if (persist_exists(PERSIST_KEY_PLANT_BASE + i)) {
      memset(&s_plants[i], 0, sizeof(Plant));
      persist_read_data(PERSIST_KEY_PLANT_BASE + i, &s_plants[i], sizeof(Plant));
    }
  }
}

void storage_clear_plants(void) {
  s_plant_count = 0;
  persist_write_int(PERSIST_KEY_PLANT_COUNT, 0);
}

void storage_backup_plants(void) {
  s_temp_plant_count = s_plant_count;
  for (int i = 0; i < s_plant_count; i++) {
    s_temp_plants[i] = s_plants[i];
  }
}

Plant* storage_get_backup_plant(int index) {
  if (index >= 0 && index < s_temp_plant_count) {
    return &s_temp_plants[index];
  }
  return NULL;
}

int storage_get_backup_plant_count(void) {
  return s_temp_plant_count;
}

void storage_add_history_event(Plant *p, uint8_t type, uint8_t amount) {
  if (p == NULL) return;
  
  if (p->history_count >= MAX_HISTORY) {
    for (int i = 1; i < MAX_HISTORY; i++) {
      p->history[i - 1] = p->history[i];
    }
    p->history_count = MAX_HISTORY - 1;
  }
  
  LogEvent ev;
  ev.time = time(NULL);
  ev.type = type;
  ev.amount = amount;
  
  p->history[p->history_count] = ev;
  p->history_count++;
}

int storage_get_plant_age_days(time_t planted_time) {
  if (planted_time == 0) return 0;
  time_t now = time(NULL);
  int diff = (int)(now - planted_time);
  if (diff < 0) return 0;
  return diff / 86400;
}

void storage_get_relative_time_string(char *buffer, size_t buffer_size, time_t event_time) {
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
