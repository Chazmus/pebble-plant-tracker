#pragma once
#include "types.h"

typedef void (*SyncUpdateCallback)(void);

// Initialize messaging handlers
void sync_init(void);

// Request full data update from phone
void sync_request(void);

// Send a single logging event back to phone companion
void sync_send_log(int plant_index, uint8_t log_type, uint32_t amount, time_t log_time);

// Register a callback to be notified when sync completes or updates data
void sync_register_update_callback(SyncUpdateCallback callback);
