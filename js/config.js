// ═══════════════════════════════════════════════════════
//  PICALE — Configuración de entorno
//  Para deploy: cambia API_BASE_URL al endpoint del backend
// ═══════════════════════════════════════════════════════

const PICALE_ENV = {
  // LOCAL  →  'http://localhost:8000'
  // PROD   →  'https://api.picalereplay.com'
  API_BASE_URL: 'http://localhost:8000',
  VERSION: '1.0.0',
};

// Alias corto para usar en todo el código
const API_BASE = PICALE_ENV.API_BASE_URL;
