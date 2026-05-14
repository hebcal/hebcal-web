ALTER TABLE hebcal_shabbat_email
  ADD COLUMN email_havdalah_degrees float DEFAULT NULL
  AFTER email_candles_havdalah;

UPDATE hebcal_shabbat_email
  SET email_havdalah_degrees = CASE WHEN email_havdalah_tzeit = 1 THEN 8.5 ELSE NULL END;

ALTER TABLE hebcal_shabbat_email
  DROP COLUMN email_havdalah_tzeit;
