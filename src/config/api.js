/**
 * API configuration
 */

// Set EXPO_PUBLIC_API_URL in a .env file (e.g. http://192.168.x.x:8000/api for physical devices)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
    ?? (__DEV__ ? 'http://localhost:8000/api' : 'https://your-production-api.com/api');

export const API_TIMEOUT = 30000; // 30 seconds

export const ENDPOINTS = {
    ANALYZE: '/analyze',
    RESULTS: '/results',
    CALIBRATE: '/calibrate',
    QUANTIFY: '/quantify',
    CALIBRATIONS: '/calibrations',
    CHECK_ALIGNMENT: '/check-alignment',
    EXPORT: '/export',
    SERIAL_DILUTION: '/serial-dilution',
    REPLICATE_STATS: '/replicate-stats',
};
