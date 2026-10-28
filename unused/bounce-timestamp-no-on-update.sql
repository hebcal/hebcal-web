-- bounce-timestamp-no-on-update.sql
--
-- hebcal_shabbat_bounce.timestamp records when SES reported the bounce, but
-- it was declared ON UPDATE CURRENT_TIMESTAMP. The only UPDATE that ever
-- touches the table is hebcal-shabbat-email's shabbat_deactivate.js setting
-- deactivated=1, so every deactivated row had its bounce time overwritten
-- with the time it was actioned. That skews the 365-day window the
-- deactivator scans and the 18-month data-retention purge, both of which key
-- off this column.
--
-- shabbat_deactivate.js now writes `timestamp=timestamp` in that UPDATE, so
-- this is defence in depth rather than a prerequisite. Rows already
-- deactivated keep their overwritten timestamps; the original bounce times
-- are not recoverable.
--
-- Changing only the column's ON UPDATE clause is a metadata change; on a
-- table this size (~40k rows) it is effectively instant either way.

ALTER TABLE hebcal_shabbat_bounce
  MODIFY timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
