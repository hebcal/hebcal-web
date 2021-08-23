import Database from 'better-sqlite3';
import {makeAnchor} from '@hebcal/rest-api';
import {Location} from '@hebcal/core';

const geonamesFilename = 'geonames.sqlite3';

const COUNTRY_SQL = `SELECT g.geonameid, g.name, g.asciiname,
a.name as admin1, a.asciiname as admin1ascii,
g.latitude, g.longitude, g.timezone
FROM geoname g
LEFT JOIN admin1 a on g.country||'.'||g.admin1 = a.key
WHERE g.country = ?
ORDER BY population DESC
`;

const COUNTRIES = {
  US: 100,
  IL: 50,
  FR: 50,
  CA: 50,
  RU: 40,
  GB: 40,
  AR: 40,
  DE: 40,
  UA: 30,
  BR: 30,
  AU: 30,
  HU: 30,
  RO: 20,
  AT: 20,
  IT: 10,
  NZ: 10,
  ES: 10,
  MX: 10,
  CH: 10,
  SE: 10,
  PL: 10,
  FI: 10,
  IE: 10,
  NL: 10,
  BE: 5,
  IN: 10,
  CN: 10,
};

const country = {};

const geonamesDb = new Database(geonamesFilename, {fileMustExist: true});
const geonamesStmt = geonamesDb.prepare('SELECT ISO, Country FROM country');
const results = geonamesStmt.all();
for (const result of results) {
  country[result.ISO] = result.Country;
}

const hdr = `
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
xmlns:content="http://purl.org/rss/1.0/modules/content/"
xmlns:wfw="http://wellformedweb.org/CommentAPI/"
xmlns:dc="http://purl.org/dc/elements/1.1/"
xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
<title>Hebcal</title>
<link>https://www.hebcal.com/home</link>
<description>Jewish Calendar</description>
<pubDate>Wed, 30 Dec 2020 18:01:31 +0000</pubDate>
<language>en-US</language>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>https://www.hebcal.com/home</wp:base_site_url>
<wp:base_blog_url>https://www.hebcal.com/home</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login><![CDATA[mradwin]]></wp:author_login><wp:author_email><![CDATA[mradwin@hebcal.com]]></wp:author_email><wp:author_display_name><![CDATA[mradwin]]></wp:author_display_name><wp:author_first_name><![CDATA[Michael]]></wp:author_first_name><wp:author_last_name><![CDATA[Radwin]]></wp:author_last_name></wp:author>
`;
console.log(hdr);

let postId = 2831;
for (const [iso, num] of Object.entries(COUNTRIES)) {
  const sql = COUNTRY_SQL + ' LIMIT ' +num;
  const stmt = geonamesDb.prepare(sql);
  const results = stmt.all(iso);
  for (const r of results) {
    const descr = Location.geonameCityDescr(r.name, r.admin1, country[iso]);
    const link = `/shabbat?geonameid=${r.geonameid}`;
    const parent = 113;
    const slug = makeAnchor(r.asciiname);
    const str = `
    <item>
    <title>${r.name} Shabbat Times</title>
    <link>${link}</link>
    <pubDate>Wed, 30 Dec 2020 18:01:31 +0000</pubDate>
    <dc:creator><![CDATA[mradwin]]></dc:creator>
    <guid isPermaLink="false">http://www.hebcal.com/home/?page_id=${postId}</guid>
    <description></description>
    <content:encoded><![CDATA[${descr}]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>${postId}</wp:post_id>
    <wp:post_date>2020-12-30 10:01:31</wp:post_date>
    <wp:post_date_gmt>2020-12-30 18:01:31</wp:post_date_gmt>
    <wp:comment_status>closed</wp:comment_status>
    <wp:ping_status>closed</wp:ping_status>
    <wp:post_name>shabbat-${slug}</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_parent>${parent}</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>page</wp:post_type>
    <wp:post_password></wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
    <wp:postmeta>
    <wp:meta_key>_edit_last</wp:meta_key>
    <wp:meta_value><![CDATA[1]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
    <wp:meta_key>_wp_page_template</wp:meta_key>
    <wp:meta_value><![CDATA[default]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
    <wp:meta_key>_links_to</wp:meta_key>
    <wp:meta_value><![CDATA[${link}]]></wp:meta_value>
    </wp:postmeta>
    </item>`;
    postId++;
    console.log(str);
  }
}


console.log('</channel>\n</rss>\n');
geonamesDb.close();
