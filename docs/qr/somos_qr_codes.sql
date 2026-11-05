-- Códigos QR secretos por cancha · Somos Pádel
-- Correr una vez en Postgres (picale-db). Requiere: ALTER TABLE courts ADD COLUMN IF NOT EXISTS qr_code TEXT UNIQUE;
BEGIN;
UPDATE courts SET qr_code = 'dTRFPHuDmWLG' WHERE id = '6bc0621c-f99a-4e1f-8971-d70155ea3383';  -- Cancha 1
UPDATE courts SET qr_code = 'y5haqZf7tRTT' WHERE id = 'e1dc778e-831f-4fa4-bc86-d6a31a7de1d1';  -- Cancha 2
UPDATE courts SET qr_code = '8V5stFgzgXuy' WHERE id = 'fc8bbc6d-e21b-466d-92e6-a2beefe6bd38';  -- Cancha 3
UPDATE courts SET qr_code = 'Bwh6HxggVccv' WHERE id = '2d54ad6f-895f-4f6c-b985-95b431fe03b3';  -- Cancha 4
UPDATE courts SET qr_code = 'uyDY5UDMf95q' WHERE id = '28b6283d-dacf-428d-a3fb-fc0015d5f6aa';  -- Cancha 5
UPDATE courts SET qr_code = 'PUcLyRzmzCgY' WHERE id = '519bbd5d-b2f5-4a84-a257-6d327bebf9a8';  -- Cancha 6
UPDATE courts SET qr_code = 'yikn26FUMPBw' WHERE id = '28d80e5a-9f47-4bf8-a8e9-7d1dd0cfb512';  -- Cancha 7
UPDATE courts SET qr_code = 'kV4wSHcYNABd' WHERE id = '35c16c54-f31e-4397-922b-044722d06524';  -- Cancha 8
COMMIT;
