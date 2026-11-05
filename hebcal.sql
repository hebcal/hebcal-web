CREATE TABLE yahrzeit (
  id char(26) NOT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip varchar(39) DEFAULT NULL,
  downloaded tinyint(1) NOT NULL DEFAULT '0',
  contents JSON NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE hebcal_shabbat_email (
  email_address varchar(254) NOT NULL,
  email_id varchar(24) NOT NULL,
  email_status enum('active','pending','bounce','unsubscribed') NOT NULL,
  email_created datetime NOT NULL,
  email_updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  email_candles_zipcode varchar(5) DEFAULT NULL,
  email_candles_city varchar(64) DEFAULT NULL,
  email_candles_geonameid int DEFAULT NULL,
  email_use_elevation tinyint(1) NOT NULL DEFAULT '0',
  email_candles_havdalah tinyint DEFAULT NULL,
  email_havdalah_degrees float DEFAULT NULL,
  email_sundown_candles tinyint NOT NULL DEFAULT '18',
  email_ip varchar(39) DEFAULT NULL,
  PRIMARY KEY (email_address),
  UNIQUE KEY email_id (email_id),
  KEY email_status (email_status)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE hebcal_shabbat_bounce (
  id int NOT NULL AUTO_INCREMENT,
  email_address varchar(254) NOT NULL,
  timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  std_reason enum('Transient','over_quota','spam','unknown',
    'user_disabled','user_unknown','amzn_abuse','domain_error') DEFAULT NULL,
  full_reason text,
  deactivated tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE yahrzeit_atime (
  id char(26) NOT NULL,
  ts timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE yahrzeit_email (
  id char(26) NOT NULL,
  email_addr varchar(254) NOT NULL,
  calendar_id char(26) NOT NULL,
  sub_status enum('active','pending','unsub','bounce') NOT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip_addr varchar(39) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY email_addr (email_addr),
  KEY sub_status (sub_status),
  KEY email_addr_2 (email_addr,calendar_id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE yahrzeit_sent1 (
  id int NOT NULL AUTO_INCREMENT,
  yahrzeit_id char(26) NOT NULL,
  name_hash char(8) NOT NULL,
  num smallint NOT NULL,
  hyear smallint NOT NULL,
  sent_date datetime NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sent_key (yahrzeit_id,name_hash,num,hyear)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE yahrzeit_sent7 (
  id int NOT NULL AUTO_INCREMENT,
  yahrzeit_id char(26) NOT NULL,
  name_hash char(8) NOT NULL,
  num smallint NOT NULL,
  hyear smallint NOT NULL,
  sent_date datetime NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sent_key (yahrzeit_id,name_hash,num,hyear)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE yahrzeit_optout (
  id int NOT NULL AUTO_INCREMENT,
  email_id char(26) NOT NULL,
  name_hash char(8) DEFAULT NULL,
  num smallint NOT NULL,
  deactivated tinyint(1) NOT NULL DEFAULT '0',
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY email_id (email_id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE email_open (
  id int NOT NULL AUTO_INCREMENT,
  ts timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  msgid varchar(80) NOT NULL,
  ip_addr varchar(39) DEFAULT NULL,
  loc varchar(80) DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

-- ---------------------------------------------------------------------------
-- User accounts for "Sign in with Google" / "Sign in with Apple".
--
-- Historically Hebcal has had no notion of a logged-in user: Yahrzeit lists
-- and email subscriptions are identified by unguessable capability tokens in
-- URLs, not by an authenticated account. These three tables add that concept.
--
--   user            one row per person (their canonical identity + email)
--   user_identity   links one or more OAuth logins (google/apple) to a user,
--                   so signing in with either provider lands on one account
--   user_session    server-side sessions backing the signed `S` cookie
-- ---------------------------------------------------------------------------

-- `email` holds only a provider-verified address, or NULL. MySQL permits
-- multiple NULLs under a UNIQUE key, so accounts created from an unverified
-- login (no trustworthy email) do not collide. The per-login email address --
-- verified or not -- is always kept in user_identity.email.
CREATE TABLE user (
  id char(26) NOT NULL,
  email varchar(254) DEFAULT NULL,
  email_verified tinyint(1) NOT NULL DEFAULT '0',
  display_name varchar(255) DEFAULT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_identity (
  provider varchar(32) NOT NULL,
  provider_sub varchar(255) NOT NULL,
  user_id char(26) NOT NULL,
  email varchar(254) DEFAULT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_sub),
  KEY user_identity_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_session (
  id char(32) NOT NULL,
  user_id char(26) NOT NULL,
  created datetime NOT NULL,
  expires datetime NOT NULL,
  last_seen timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip varchar(45) DEFAULT NULL,
  user_agent varchar(255) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY user_session_user (user_id),
  KEY user_session_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

-- PayPal Instant Payment Notification messages, verified with PayPal and
-- stored by src/paypalIpn.js (POST /paypal/ipn). One row per IPN message, not
-- per donation: a donation that is later refunded has two rows (the refund
-- carries parent_txn_id), and a pending payment that clears has two rows with
-- the same txn_id. Retries of one message share ipn_track_id and are
-- de-duplicated on it. All datetimes are UTC.
--
-- Donations still owed a thank-you:
--   SELECT * FROM paypal_ipn
--   WHERE payment_status = 'Completed' AND test_ipn = 0 AND thanked IS NULL
--   AND txn_type IN ('web_accept', 'subscr_payment', 'recurring_payment',
--                    'express_checkout', 'send_money', 'cart');
CREATE TABLE paypal_ipn (
  id int unsigned NOT NULL AUTO_INCREMENT,
  received datetime NOT NULL,
  ipn_track_id varchar(64) DEFAULT NULL,
  txn_id varchar(64) DEFAULT NULL,
  parent_txn_id varchar(64) DEFAULT NULL,
  txn_type varchar(64) DEFAULT NULL,
  payment_status varchar(32) DEFAULT NULL,
  payment_date datetime DEFAULT NULL,
  mc_gross decimal(12,2) DEFAULT NULL,
  mc_fee decimal(12,2) DEFAULT NULL,
  mc_currency char(3) DEFAULT NULL,
  first_name varchar(128) DEFAULT NULL,
  last_name varchar(128) DEFAULT NULL,
  payer_email varchar(254) DEFAULT NULL,
  payer_id varchar(32) DEFAULT NULL,
  item_name varchar(255) DEFAULT NULL,
  memo varchar(1024) DEFAULT NULL,
  test_ipn tinyint(1) NOT NULL DEFAULT '0',
  thanked datetime DEFAULT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY paypal_ipn_track (ipn_track_id),
  KEY paypal_ipn_txn (txn_id),
  KEY paypal_ipn_payer_email (payer_email),
  KEY paypal_ipn_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
