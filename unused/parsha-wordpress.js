const {Locale, parshiot} = require('@hebcal/core');
const {makeAnchor} = require('@hebcal/rest-api');

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

let postId = 1568;
for (let i = 0; i < parshiot.length; i++) {
  const parsha = parshiot[i];
  const slug = makeAnchor(parsha);
  const he = Locale.gettext(parsha, 'he');
  const nth = Locale.ordinal(i + 1);
  const descr = `Parashat ${parsha} / פרשת ${he} is the ${nth} weekly Torah portion in the annual Jewish cycle of Torah reading.`;
  const str = `
<item>
  <title>${parsha} / ${he}</title>
  <link>/sedrot/${slug}</link>
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
  <wp:post_name>${slug}</wp:post_name>
  <wp:status>publish</wp:status>
  <wp:post_parent>105</wp:post_parent>
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
  <wp:meta_value><![CDATA[/sedrot/${slug}]]></wp:meta_value>
  </wp:postmeta>
</item>`;
  postId++;
  console.log(str);
}

console.log('</channel>\n</rss>\n');
