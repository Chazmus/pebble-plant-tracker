#include <pebble.h>
#include "types.h"
#include "storage.h"
#include "sync.h"
#include "ui.h"

static void prv_init(void) {
  storage_init();
  sync_init();
  ui_init();
  
  sync_request();
}

static void prv_deinit(void) {
  ui_deinit();
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
