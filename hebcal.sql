CREATE TABLE yahrzeit (
  id varchar(26) NOT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip varchar(16) DEFAULT NULL,
  downloaded tinyint(1) NOT NULL DEFAULT '0',
  contents JSON NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE hebcal_shabbat_email (
  email_address varchar(200) NOT NULL,
  email_id varchar(24) NOT NULL,
  email_status varchar(16) NOT NULL,
  email_created datetime NOT NULL,
  email_updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  email_candles_zipcode varchar(5) DEFAULT NULL,
  email_candles_city varchar(64) DEFAULT NULL,
  email_candles_geonameid int DEFAULT NULL,
  email_candles_havdalah tinyint DEFAULT NULL,
  email_havdalah_tzeit tinyint(1) NOT NULL DEFAULT '0',
  email_sundown_candles tinyint NOT NULL DEFAULT '18',
  email_ip varchar(16) DEFAULT NULL,
  PRIMARY KEY (email_address),
  UNIQUE KEY email_id (email_id),
  KEY email_status (email_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE hebcal_shabbat_bounce (
  id int NOT NULL AUTO_INCREMENT,
  email_address varchar(200) NOT NULL,
  timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  std_reason varchar(16) DEFAULT NULL,
  full_reason text,
  deactivated tinyint(1) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE yahrzeit_email (
  id varchar(26) NOT NULL,
  email_addr varchar(200) NOT NULL,
  calendar_id varchar(26) NOT NULL,
  sub_status varchar(16) NOT NULL,
  created datetime NOT NULL,
  updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip_addr varchar(16) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY email_addr (email_addr),
  KEY sub_status (sub_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE yahrzeit_sent (
  id int NOT NULL AUTO_INCREMENT,
  yahrzeit_id varchar(26) NOT NULL,
  num int NOT NULL,
  hyear int NOT NULL,
  sent_date datetime NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY (yahrzeit_id, num, hyear)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
