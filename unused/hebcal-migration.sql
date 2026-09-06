-- hebcal-enum-migration.sql
--
-- Convert low-cardinality VARCHAR "status/reason" columns to ENUM.
--
-- PROCEDURE ANALYSE() was removed in MySQL 8.0.0, so the column analysis
-- below was done by hand against the live test DB (hebcal5) on 2026-09-05:
--
--   column                              rows    distinct  observed values (count)
--   ----------------------------------  ------  --------  --------------------------------------
--   hebcal_shabbat_email.email_status   12,537  4         active 11273 / unsubscribed 548 /
--                                                         pending 457 / bounce 259
--   hebcal_shabbat_bounce.std_reason    34,838  8         over_quota 18762 / Transient 13675 /
--                                                         spam 814 / unknown 518 /
--                                                         user_disabled 514 / user_unknown 398 /
--                                                         amzn_abuse 107 / domain_error 50
--   yahrzeit_email.sub_status           16,117  3 (+1)    active 13937 / pending 1875 / unsub 305
--                                                         ('bounce' also written by
--                                                          hebcal-shabbat-email/src/shabbat_deactivate.ts)
--
-- The ENUM value lists below are the UNION of what is in the data and every
-- literal the application code can write:
--   hebcal-web/src/email.js .................. 'active','pending','unsubscribed'
--   hebcal-web/src/yahrzeit-email.js ......... 'active','pending','unsub'
--   hebcal-shabbat-email/src/shabbat_bounce_sqs.ts / common.ts ... all 8 std_reason strings
--   hebcal-shabbat-email/src/shabbat_deactivate.ts .. email_status='bounce', sub_status='bounce'
--
-- Tables are small (<35k rows); each ALTER is a sub-second COPY rebuild that
-- also shrinks the secondary indexes on these columns. LOCK=SHARED keeps
-- reads available during the rebuild.
--
-- >>> Run with a STRICT sql_mode so any out-of-list value fails loudly
-- >>> instead of being silently coerced to '' :
--       SET SESSION sql_mode = CONCAT(@@sql_mode, ',STRICT_ALL_TABLES');
--
-- Take a backup first:
--   mysqldump hebcal5 hebcal_shabbat_email hebcal_shabbat_bounce yahrzeit_email > enum-backup.sql
--
-- Pre-flight (each must return 0 rows before you migrate):
--   SELECT DISTINCT email_status FROM hebcal_shabbat_email
--     WHERE email_status NOT IN ('active','pending','bounce','unsubscribed');
--   SELECT DISTINCT std_reason FROM hebcal_shabbat_bounce
--     WHERE std_reason IS NOT NULL AND std_reason NOT IN
--       ('over_quota','Transient','spam','unknown','user_disabled','user_unknown','amzn_abuse','domain_error');
--   SELECT DISTINCT sub_status FROM yahrzeit_email
--     WHERE sub_status NOT IN ('active','pending','unsub','bounce');

SET SESSION sql_mode = CONCAT(@@sql_mode, ',STRICT_ALL_TABLES');

ALTER TABLE hebcal_shabbat_email
  MODIFY COLUMN email_status
    ENUM('active','pending','bounce','unsubscribed') NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE hebcal_shabbat_bounce
  MODIFY COLUMN std_reason
    ENUM('Transient','over_quota','spam','unknown',
         'user_disabled','user_unknown','amzn_abuse','domain_error') DEFAULT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_email
  MODIFY COLUMN sub_status
    ENUM('active','pending','unsub','bounce') NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

-- Post-flight sanity check (expect the same counts as before):
--   SELECT email_status, COUNT(*) FROM hebcal_shabbat_email GROUP BY email_status;
--   SELECT std_reason,   COUNT(*) FROM hebcal_shabbat_bounce GROUP BY std_reason;
--   SELECT sub_status,   COUNT(*) FROM yahrzeit_email        GROUP BY sub_status;

-- ===========================================================================
-- Part 2: CHARSET  (utf8mb3 / drifted columns -> ascii)
-- ===========================================================================
--
-- utf8mb3 is deprecated in MySQL 8.0 and slated for removal, so every column
-- below has to move regardless; the only question is ascii vs utf8mb4.
--
-- information_schema.COLUMNS on the live hebcal5 DB (2026-09-05) shows these
-- non-ascii string columns (hebcal_shabbat_bounce is latin1 and is left
-- alone -- see note at the end):
--
--   table.column                          charset    note
--   ------------------------------------   --------   --------------------------------
--   yahrzeit           (table)            utf8mb3    id, ip  -- ~63 MB table
--   hebcal_shabbat_email (table)          utf8mb3    all string cols -- ~4.5 MB table
--   yahrzeit_email.{id,email_addr,          utf8mb3    COLUMN drift: table default is
--     calendar_id,sub_status,ip_addr}                 already ascii, columns are not
--   yahrzeit_atime.id                     utf8mb4    lone utf8mb4 id among ULID cols
--
-- A non-ASCII byte scan (bytes outside 0x20-0x7E, and LENGTH<>CHAR_LENGTH)
-- of every string column came back 0 on all rows:
--   yahrzeit.id, yahrzeit.ip                              0 / 240,701
--   yahrzeit_email.id, .email_addr, .calendar_id, .ip_addr 0 / 16,117
--   hebcal_shabbat_email.email_address                    0 / 12,537
--   hebcal_shabbat_email.email_id/_zipcode/_city/_ip      0 / 12,537
--   hebcal_shabbat_bounce.email_address                   0 / 34,838
-- These columns hold email addresses, ULIDs (Crockford base32), IPv4
-- strings, ZIP codes and app-generated city keys like 'IL-Bnei Brak' --
-- ASCII by construction and confirmed ASCII in the data.
--
-- yahrzeit.contents is JSON. MySQL's JSON type is a binary format with a
-- fixed internal utf8mb4 text encoding; CONVERT TO CHARACTER SET only
-- rewrites CHAR/VARCHAR/TEXT columns and does not touch JSON. VERIFIED on a
-- 20-row scratch copy carrying Hebrew / smart-quote bytes in contents:
-- MD5(contents) was byte-identical before and after CONVERT TO ascii, and
-- SHOW CREATE kept the column as `contents json NOT NULL`. Only the table's
-- DEFAULT CHARSET (the default for char columns) changes.
--
-- NOTE on email-address columns: all three (hebcal_shabbat_email.email_address
-- which is a PRIMARY KEY, yahrzeit_email.email_addr, hebcal_shabbat_bounce
-- .email_address) are 100% 7-bit ASCII across every row today, so ascii is
-- safe now. The one tradeoff: an internationalized address (EAI, RFC 6531,
-- UTF-8 local-part or domain) would be rejected on INSERT. If you want to
-- keep that door open, give just those columns
--   MODIFY COLUMN email_address varchar(200) CHARACTER SET utf8mb4 NOT NULL
-- instead of letting them fall to the table default. hebcal.sql as checked
-- in takes the plain-ascii route.

-- yahrzeit: whole-table conversion (id + ip are ASCII tokens; JSON is
-- charset-independent, verified above).
ALTER TABLE yahrzeit
  CONVERT TO CHARACTER SET ascii COLLATE ascii_general_ci,
  ALGORITHM=COPY, LOCK=SHARED;

-- yahrzeit_email: table default is already ascii; every string COLUMN has a
-- utf8mb3 override that drifted in. CONVERT TO realigns them.
ALTER TABLE yahrzeit_email
  CONVERT TO CHARACTER SET ascii COLLATE ascii_general_ci,
  ALGORITHM=COPY, LOCK=SHARED;

-- yahrzeit_atime: single drifted id column (currently utf8mb4).
ALTER TABLE yahrzeit_atime
  MODIFY COLUMN id varchar(26) CHARACTER SET ascii NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

-- hebcal_shabbat_email: whole-table conversion (all string columns are ASCII
-- in the data). Swap in the per-column form from the NOTE above if you want
-- email_address to stay utf8mb4.
ALTER TABLE hebcal_shabbat_email
  CONVERT TO CHARACTER SET ascii COLLATE ascii_general_ci,
  ALGORITHM=COPY, LOCK=SHARED;

-- yahzeit_deleteme is a leftover scratch copy of yahrzeit (utf8mb3) --
-- drop it rather than convert it:
--   DROP TABLE yahzeit_deleteme;

-- ===========================================================================
-- Part 3: fixed-width ULID ids  (varchar(26) -> char(26))
-- ===========================================================================
--
-- Every ULID column is exactly 26 chars on every row (Crockford base32,
-- fixed width) with no trailing spaces -- checked 2026-09-05 across all 7
-- columns below. CHAR(26) is the honest type; in an ascii table it also
-- stores as a flat 26 bytes with no length prefix. (Retrieval trims trailing
-- spaces from CHAR, so even a hypothetical short value would round-trip;
-- a genuine trailing space would not -- ULIDs never have one.)
--
-- Run Part 2 first so these columns are already ascii; then:

ALTER TABLE yahrzeit
  MODIFY COLUMN id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_email
  MODIFY COLUMN id          char(26) NOT NULL,
  MODIFY COLUMN calendar_id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_atime
  MODIFY COLUMN id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_sent1
  MODIFY COLUMN yahrzeit_id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_sent7
  MODIFY COLUMN yahrzeit_id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_optout
  MODIFY COLUMN email_id char(26) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

-- ===========================================================================
-- Part 4: NULL / DEFAULT / length inconsistencies
-- ===========================================================================
--
-- Findings from auditing every column's IS_NULLABLE / COLUMN_DEFAULT against
-- the data and the writers (hebcal-web/src, hebcal-shabbat-email/src),
-- 2026-09-05:
--
-- (a) name_hash is char(8) DEFAULT NULL in all three of yahrzeit_sent1,
--     yahrzeit_sent7, yahrzeit_optout, but only optout ever stores NULL
--     (38 / 219 rows -- "opt out of all names"). sent1/sent7 have 0 NULLs in
--     ~90k rows: the cron always writes an 8-char murmur32 hex hash. The
--     nullable column silently defeats UNIQUE KEY sent_key -- MySQL treats
--     NULLs as distinct, so a NULL-hash row could never collide. Make it
--     NOT NULL on the two sent tables; leave optout alone.
--
-- (b) `deactivated tinyint(1) NOT NULL` has NO default on
--     hebcal_shabbat_bounce and yahrzeit_optout, unlike the sibling boolean
--     flags yahrzeit.downloaded and hebcal_shabbat_email.email_use_elevation
--     which are `NOT NULL DEFAULT 0`. Writers always pass 0/1 explicitly so
--     nothing is broken; this is purely for consistency.
--
-- (c) yahrzeit_atime.ts is the only TIMESTAMP column in the schema that is
--     not `DEFAULT CURRENT_TIMESTAMP`. It is bare `timestamp NOT NULL`, and
--     with explicit_defaults_for_timestamp=ON that means no auto value at
--     all -- the `REPLACE INTO yahrzeit_atime (id, ts) VALUES (?, NOW())` in
--     both apps is load-bearing. The table is an access-time tracker, i.e.
--     exactly DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP; after
--     this the writers could drop the explicit ts / NOW().
--
-- (d) email address columns are varchar(200); RFC 5321 caps a path at 254
--     chars. Longest in the data is 56 (and that one is a malformed
--     `=?UTF-8?B?...?= <addr>` value in hebcal_shabbat_bounce, not a bare
--     address). 254 is the standards-correct width and still a 1-byte
--     length prefix (255+ would need 2). Widen for correctness, not space.
--
-- NOT flagged / deliberately left as-is:
--   * ip / email_ip / ip_addr varchar(16) DEFAULT NULL -- 0 NULL in the data
--     but optional by design (writers fall back to NULL when the IP is
--     unknown; that path just hasn't fired). Do not tighten.
--   * email_open.loc varchar(80) DEFAULT NULL -- 0 NULL / 0 '' in 1.12M
--     rows, but '' is reachable from `transliterate(q.loc || '')`. Marginal.
--   * created / email_created / sent_date datetime NOT NULL with no default
--     -- consistent across the schema; writers supply NOW(). Style, not a bug.
--   * No NOT NULL string column contains a '' sentinel (checked).

-- name_hash -> NOT NULL rebuilds the table (a NOT NULL add is never INSTANT);
-- tiny tables, LOCK=SHARED keeps reads live. Pre-flight:
--   SELECT COUNT(*) FROM yahrzeit_sent1 WHERE name_hash IS NULL;  -- expect 0
--   SELECT COUNT(*) FROM yahrzeit_sent7 WHERE name_hash IS NULL;  -- expect 0
ALTER TABLE yahrzeit_sent1
  MODIFY COLUMN name_hash char(8) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE yahrzeit_sent7
  MODIFY COLUMN name_hash char(8) NOT NULL,
  ALGORITHM=COPY, LOCK=SHARED;

-- The rest are metadata-only or near it; MySQL picks INSTANT/INPLACE on its
-- own (adding the ON UPDATE attribute to yahrzeit_atime.ts is INPLACE, not
-- INSTANT). Left unhinted so it just runs.
ALTER TABLE hebcal_shabbat_bounce
  MODIFY COLUMN deactivated tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE yahrzeit_optout
  MODIFY COLUMN deactivated tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE yahrzeit_atime
  MODIFY COLUMN ts timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE hebcal_shabbat_email  MODIFY COLUMN email_address varchar(254) NOT NULL;
ALTER TABLE hebcal_shabbat_bounce MODIFY COLUMN email_address varchar(254) NOT NULL;
ALTER TABLE yahrzeit_email        MODIFY COLUMN email_addr    varchar(254) NOT NULL;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- ALTER TABLE hebcal_shabbat_email
--   MODIFY COLUMN email_status varchar(16) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE hebcal_shabbat_bounce
--   MODIFY COLUMN std_reason varchar(16) DEFAULT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_email
--   MODIFY COLUMN sub_status varchar(16) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
--
-- ALTER TABLE yahrzeit
--   CONVERT TO CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
--   ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_email
--   CONVERT TO CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
--   ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_atime
--   MODIFY COLUMN id varchar(26) CHARACTER SET utf8mb4 NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE hebcal_shabbat_email
--   CONVERT TO CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
--   ALGORITHM=COPY, LOCK=SHARED;
--
-- ALTER TABLE yahrzeit         MODIFY COLUMN id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_email   MODIFY COLUMN id varchar(26) NOT NULL,
--                              MODIFY COLUMN calendar_id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_atime   MODIFY COLUMN id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_sent1   MODIFY COLUMN yahrzeit_id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_sent7   MODIFY COLUMN yahrzeit_id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_optout  MODIFY COLUMN email_id varchar(26) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
--
-- ALTER TABLE yahrzeit_sent1   MODIFY COLUMN name_hash char(8) DEFAULT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE yahrzeit_sent7   MODIFY COLUMN name_hash char(8) DEFAULT NULL, ALGORITHM=COPY, LOCK=SHARED;
-- ALTER TABLE hebcal_shabbat_bounce MODIFY COLUMN deactivated tinyint(1) NOT NULL;
-- ALTER TABLE yahrzeit_optout       MODIFY COLUMN deactivated tinyint(1) NOT NULL;
-- ALTER TABLE yahrzeit_atime        MODIFY COLUMN ts timestamp NOT NULL;
-- ALTER TABLE hebcal_shabbat_email  MODIFY COLUMN email_address varchar(200) NOT NULL;
-- ALTER TABLE hebcal_shabbat_bounce MODIFY COLUMN email_address varchar(200) NOT NULL;
-- ALTER TABLE yahrzeit_email        MODIFY COLUMN email_addr    varchar(200) NOT NULL;
