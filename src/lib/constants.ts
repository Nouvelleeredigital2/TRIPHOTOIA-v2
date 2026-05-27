export const APP_CONFIG = {
  BATCH_SIZE: 5,
  HAMMING_DISTANCE_THRESHOLD: 5,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  SUPPORTED_FORMATS: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'],
} as const;

export const UI_CONFIG = {
  ANIMATION_DURATION: 0.3,
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 100,
} as const;
