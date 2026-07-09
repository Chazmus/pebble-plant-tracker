#pragma once
#include <pebble.h>

#define MAX_PLANTS 30
#define PERSIST_KEY_PLANT_COUNT 99
#define PERSIST_KEY_PLANT_BASE 100
#define MAX_HISTORY 20

typedef struct {
  time_t time;
  uint8_t type; // 0 = water, 1 = fertilize, 2 = repot, 3 = prune, 4 = rotate, 5 = clean, 6 = treat, 7 = move
  uint8_t amount; // amount in ml/L
} LogEvent;

typedef struct {
  char id[32];
  char name[32];
  time_t planted_at;
  time_t last_watered;
  time_t last_fertilized;
  int last_fertilized_amount;
  LogEvent history[MAX_HISTORY];
  uint8_t history_count;
} Plant;
