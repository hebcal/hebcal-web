CREATE TABLE yahrzeit (
  id char(26) NOT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip varchar(16) DEFAULT NULL,
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
  email_ip varchar(16) DEFAULT NULL,
  PRIMARY KEY (email_address),
  UNIQUE KEY email_id (email_id),
  KEY email_status (email_status)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE hebcal_shabbat_bounce (
  id int NOT NULL AUTO_INCREMENT,
  email_address varchar(254) NOT NULL,
  timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  ip_addr varchar(16) DEFAULT NULL,
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
  ip_addr varchar(16) NOT NULL,
  loc varchar(80) DEFAULT NULL,
  delta int DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
