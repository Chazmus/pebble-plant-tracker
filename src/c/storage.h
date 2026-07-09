#pragma once
#include "types.h"

// Initialize storage module
void storage_init(void);

// Data Accessors
Plant* storage_get_plant(int index);
int storage_get_plant_count(void);
void storage_set_plant_count(int count);

// Storage Operations
void storage_save_plant(int index, const Plant *p);
void storage_load_plants(void);
void storage_clear_plants(void);

// Temporary plants management (used during synchronization)
void storage_backup_plants(void);
Plant* storage_get_backup_plant(int index);
int storage_get_backup_plant_count(void);

// Core Logic & Utilities
void storage_add_history_event(Plant *p, uint8_t type, uint8_t amount);
int storage_get_plant_age_days(time_t planted_time);
void storage_get_relative_time_string(char *buffer, size_t buffer_size, time_t event_time);
