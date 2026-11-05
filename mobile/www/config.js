// PÍCALE App — configuración
// Las canchas vienen del mismo listado que usa clubs.html.
// Cuando exista GET /api/v1/courts en el API, la app lo usa y esto queda como respaldo.

window.PICALE_CONFIG = {
  API: 'https://api.picalereplay.com',
  WEB: 'https://picalereplay.com',

  // Duración por defecto del "partido completo" (minutos)
  FULL_MATCH_MINUTES: 90,
  // Entrenamiento: 1 token por cada hora (60 = 1, 90 y 120 = 2)
  TRAINING_MINUTES: [60, 90, 120],

  // IDs de producto en App Store / Play Store (créditos consumibles).
  // Deben coincidir con lo que crees en RevenueCat.
  PRODUCTS: [
    { id: 'picale_token_1',  credits: 1,  label: '1 token' },
    { id: 'picale_token_5',  credits: 5,  label: '5 tokens' },
    { id: 'picale_token_10', credits: 10, label: '10 tokens · paquete coach' },
  ],
  REVENUECAT_IOS_KEY: '',      // appl_xxx
  REVENUECAT_ANDROID_KEY: '',  // goog_xxx

  SPORTS: {
    padel:  { label: 'Pádel',  emoji: '🎾' },
    futbol: { label: 'Fútbol', emoji: '⚽' },
  },
};

(function () {
  var C = 'https://api.picalereplay.com';
  window.PICALE_CLUBS = [
    {
      id: 'duo', name: 'DUO Padel Park', city: 'Cd. Obregón', sport: 'padel',
      courts: [
        { key: 'c2', name: 'Cancha 2', sub: 'TOSSA', courtId: '6ee6d28e-75c3-4cf4-87d0-6d052fb81ab4', hls: C + '/hls/7bcdb57bcfe843f5/index.m3u8' },
        { key: 'c3', name: 'Cancha 3', sub: 'RUBA',  courtId: 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', hls: C + '/hls/c3f9a17e2d8b5047/index.m3u8' },
      ],
    },
    {
      id: 'cuatro', name: 'Cuatro Pádel Sur', city: 'Monterrey', sport: 'padel',
      courts: [
        { key: 'cuatro_c1', name: 'Cancha 1', sub: 'MTY', courtId: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', hls: C + '/hls/c4f9a17e2d8b5048/index.m3u8' },
      ],
    },
    {
      id: 'somos', name: 'Somos Pádel', city: 'Monterrey', sport: 'padel',
      courts: [
        { key: 'somos_c1', name: 'Cancha 1', courtId: '6bc0621c-f99a-4e1f-8971-d70155ea3383', hls: C + '/hls/2111bf2250a5751d/index.m3u8' },
        { key: 'somos_c2', name: 'Cancha 2', courtId: 'e1dc778e-831f-4fa4-bc86-d6a31a7de1d1', hls: C + '/hls/e6835934e7a68e22/index.m3u8' },
        { key: 'somos_c3', name: 'Cancha 3', courtId: 'fc8bbc6d-e21b-466d-92e6-a2beefe6bd38', hls: C + '/hls/c776bfbbe6618fe4/index.m3u8' },
        { key: 'somos_c4', name: 'Cancha 4', courtId: '2d54ad6f-895f-4f6c-b985-95b431fe03b3', hls: C + '/hls/f132a6e907de3361/index.m3u8' },
        { key: 'somos_c5', name: 'Cancha 5', courtId: '28b6283d-dacf-428d-a3fb-fc0015d5f6aa', hls: C + '/hls/e4df4f9f11a4b00d/index.m3u8' },
        { key: 'somos_c6', name: 'Cancha 6', courtId: '519bbd5d-b2f5-4a84-a257-6d327bebf9a8', hls: C + '/hls/e1f8c1f9fa4ea04f/index.m3u8' },
        { key: 'somos_c7', name: 'Cancha 7', courtId: '28d80e5a-9f47-4bf8-a8e9-7d1dd0cfb512', hls: C + '/hls/872566c01554f2e7/index.m3u8' },
        { key: 'somos_c8', name: 'Cancha 8', courtId: '35c16c54-f31e-4397-922b-044722d06524', hls: C + '/hls/410266125aa0e463/index.m3u8' },
      ],
    },
  ];
})();
