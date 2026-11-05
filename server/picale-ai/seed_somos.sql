-- Canchas de Somos Pádel con sus QR. Se puede correr varias veces (no duplica).
INSERT INTO ai_courts (id, club_id, club_name, court_name, qr_code, hls_url) VALUES
  ('6bc0621c-f99a-4e1f-8971-d70155ea3383', 'somos', 'Somos Pádel', 'Cancha 1', 'dTRFPHuDmWLG', 'https://api.picalereplay.com/hls/2111bf2250a5751d/index.m3u8'),
  ('e1dc778e-831f-4fa4-bc86-d6a31a7de1d1', 'somos', 'Somos Pádel', 'Cancha 2', 'y5haqZf7tRTT', 'https://api.picalereplay.com/hls/e6835934e7a68e22/index.m3u8'),
  ('fc8bbc6d-e21b-466d-92e6-a2beefe6bd38', 'somos', 'Somos Pádel', 'Cancha 3', '8V5stFgzgXuy', 'https://api.picalereplay.com/hls/c776bfbbe6618fe4/index.m3u8'),
  ('2d54ad6f-895f-4f6c-b985-95b431fe03b3', 'somos', 'Somos Pádel', 'Cancha 4', 'Bwh6HxggVccv', 'https://api.picalereplay.com/hls/f132a6e907de3361/index.m3u8'),
  ('28b6283d-dacf-428d-a3fb-fc0015d5f6aa', 'somos', 'Somos Pádel', 'Cancha 5', 'uyDY5UDMf95q', 'https://api.picalereplay.com/hls/e4df4f9f11a4b00d/index.m3u8'),
  ('519bbd5d-b2f5-4a84-a257-6d327bebf9a8', 'somos', 'Somos Pádel', 'Cancha 6', 'PUcLyRzmzCgY', 'https://api.picalereplay.com/hls/e1f8c1f9fa4ea04f/index.m3u8'),
  ('28d80e5a-9f47-4bf8-a8e9-7d1dd0cfb512', 'somos', 'Somos Pádel', 'Cancha 7', 'yikn26FUMPBw', 'https://api.picalereplay.com/hls/872566c01554f2e7/index.m3u8'),
  ('35c16c54-f31e-4397-922b-044722d06524', 'somos', 'Somos Pádel', 'Cancha 8', 'kV4wSHcYNABd', 'https://api.picalereplay.com/hls/410266125aa0e463/index.m3u8')
ON CONFLICT (id) DO UPDATE SET qr_code = EXCLUDED.qr_code, hls_url = EXCLUDED.hls_url, club_name = EXCLUDED.club_name, court_name = EXCLUDED.court_name;
