#pragma once

// Create and push all UI windows
void ui_init(void);

// Destroy UI windows and free memory
void ui_deinit(void);

// Force UI to reload data (e.g. after sync update)
void ui_reload_data(void);
