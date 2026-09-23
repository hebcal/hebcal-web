-- grow-ip-columns.sql
--
-- hebcal.sql (the base schema in this repo) is stale: it still lists four
-- IP-address columns as varchar(16), sized for a dotted-quad IPv4 address
-- only ("255.255.255.255" = 15 chars + slack). All four are fed by
-- src/getIpAddress.js, which returns `x-client-ip` / ctx.request.ip
-- unmodified -- including full IPv6 literals such as
-- "2a06:98c0:3600::103" seen in production email_open rows -- with no
-- app-level clamp (unlike msgid/loc in emailOpen.js, which are explicitly
-- .substring()'d before insert).
--
-- One of the four (email_open.ip_addr) was already migrated to varchar(39)
-- directly on prod at some point without updating hebcal.sql; confirmed via
-- `hebcal5.sql` (prod dump, 2026-09-23). The other three are still varchar(16)
-- on prod as of that dump:
--
--   table                   column      current   target
--   ----------------------  ----------  --------  ------
--   yahrzeit                ip          varchar(16)  varchar(39)
--   hebcal_shabbat_email    email_ip    varchar(16)  varchar(39)
--   yahrzeit_email          ip_addr     varchar(16)  varchar(39)
--   email_open              ip_addr     varchar(39)  (already done, no-op)
--
-- Why 39 and not 45 (the RFC-friendly length used by user_session.ip, which
-- allows room for an IPv4-mapped IPv6 literal like "::ffff:255.255.255.255"):
-- 39 is the length of a fully-expanded canonical IPv6 address (8 groups of
-- 4 hex digits + 7 colons) and matches what's already live on email_open.
-- Using the same 39 here keeps all the getIpAddress() sinks consistent
-- with each other. If IPv4-mapped notation is ever a concern, bump these
-- (and update hebcal.sql) to 45 to match user_session.ip instead.
--
-- All three columns are already `DEFAULT NULL` (nullable), so no default or
-- rewrite of NULLs is needed -- this is a pure charater-length widening.
--
-- Widening a VARCHAR that stays under the 1-byte length-prefix boundary
-- (both 16 and 39 are < 256) is normally INSTANT-eligible in MySQL 8.0.12+,
-- but this server rejected ALGORITHM=INSTANT for it (confirmed 2026-09-23 --
-- likely MySQL < 8.0.12, or an instant-DDL restriction on this table/version).
-- Falling back to ALGORITHM=INPLACE, LOCK=NONE: still no table copy and no
-- blocking of concurrent reads/writes, just a rebuild of the table's data
-- pages rather than a metadata-only change -- fine at these row counts.
--
-- Take a backup first:
--   mysqldump hebcal5 yahrzeit hebcal_shabbat_email yahrzeit_email > grow-ip-columns-backup.sql
--
-- Pre-flight (informational only -- these ALWAYS pass for a pure widen, but
-- worth eyeballing to see how many rows already carry an IPv6 value that
-- was silently truncated before this migration):
--   SELECT COUNT(*) FROM yahrzeit             WHERE CHAR_LENGTH(ip) = 16;
--   SELECT COUNT(*) FROM hebcal_shabbat_email WHERE CHAR_LENGTH(email_ip) = 16;
--   SELECT COUNT(*) FROM yahrzeit_email       WHERE CHAR_LENGTH(ip_addr) = 16;
--
-- Apply:

ALTER TABLE yahrzeit
  MODIFY COLUMN ip varchar(39) DEFAULT NULL,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE hebcal_shabbat_email
  MODIFY COLUMN email_ip varchar(39) DEFAULT NULL,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE yahrzeit_email
  MODIFY COLUMN ip_addr varchar(39) DEFAULT NULL,
  ALGORITHM=INPLACE, LOCK=NONE;

-- If the server also rejects LOCK=NONE for this (some replication topologies
-- require at least a shared lock during the rebuild), drop the LOCK clause
-- and let it default to LOCK=SHARED:
--   ALTER TABLE yahrzeit MODIFY COLUMN ip varchar(39) DEFAULT NULL, ALGORITHM=INPLACE;

-- Verify:
--   SHOW CREATE TABLE yahrzeit\G
--   SHOW CREATE TABLE hebcal_shabbat_email\G
--   SHOW CREATE TABLE yahrzeit_email\G
