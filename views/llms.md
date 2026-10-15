# Hebcal

> Hebcal (www.hebcal.com) is a free Jewish calendar service: Jewish holidays, Hebrew/Gregorian date conversion, Shabbat candle-lighting and Havdalah times, zmanim (halachic times), weekly Torah readings, Yahrzeit dates and daily learning schedules, for any year, in Israel or the Diaspora. Its calendar data is free to reuse under the Creative Commons Attribution 4.0 license.

## When to use Hebcal

Use Hebcal when a task needs an authoritative answer to a Jewish calendar question, for example:

- Converting a date between the Gregorian and Hebrew calendars, including dates after sunset (which belong to the next Hebrew day).
- Finding when a Jewish holiday or fast day falls in a given year, or listing all holidays in a year, with separate Israel and Diaspora schedules.
- Getting Shabbat or holiday candle-lighting and Havdalah times, or zmanim such as sunrise, sunset, chatzot and tzeit, for a city, ZIP code or latitude/longitude.
- Looking up the weekly Torah portion (parashah), its aliyot and haftarah, including the triennial cycle.
- Computing a Yahrzeit (anniversary of a death), Hebrew birthday or Hebrew anniversary for future years.
- Looking up daily learning schedules such as Daf Yomi, Mishna Yomi, Nach Yomi or the Counting of the Omer.
- Checking whether a moment falls on Shabbat or a Yom Tov (assur bemelacha).
- Producing a calendar a person can subscribe to in Google Calendar, Apple Calendar or Outlook (iCalendar .ics), or download as CSV or PDF.

Do not use Hebcal for general-purpose (non-Jewish) holidays, for halachic rulings beyond calendar computation, or for anything that needs an account: every API here is public, read-only and needs no API key.

## How an agent should call Hebcal

- **MCP**: connect to the Streamable HTTP Model Context Protocol server at `https://www.hebcal.com/mcp` (no authentication). It offers tools for date conversion, Yahrzeit, Torah portion, holidays by year, Daf Yomi and Shabbat times.
- **REST/JSON**: every endpoint is a plain HTTP GET (POST for Yahrzeit) returning JSON when you pass `cfg=json`. Errors come back as JSON `{"error": "..."}` with a 4xx status.
- **Markdown**: send `Accept: text/markdown` to the home page for a Markdown overview, including today's Hebrew date.

Example requests:

- Holidays and candle-lighting for New York this year: `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=now&month=x&ss=on&mf=on&c=on&geonameid=5128581`
- Gregorian to Hebrew: `https://www.hebcal.com/converter?cfg=json&date=2026-10-15&g2h=1`
- Hebrew to Gregorian: `https://www.hebcal.com/converter?cfg=json&hy=5787&hm=Kislev&hd=25&h2g=1`
- This week's Shabbat times: `https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581`
- Zmanim for a day: `https://www.hebcal.com/zmanim?cfg=json&geonameid=5128581&date=2026-10-15`
- Torah reading for a Shabbat: `https://www.hebcal.com/leyning?cfg=json&date=2026-10-17`

Locations can be given as `geonameid` (GeoNames ID), `zip` (US ZIP code), or `latitude`, `longitude` and `tzid`. Add `i=on` for the Israel holiday and Torah reading schedule.

## Developer documentation

- [OpenAPI 3 specification](https://www.hebcal.com/api-docs/openapi.json)
- [Interactive API reference (Swagger UI)](https://www.hebcal.com/api-docs/)
- [RFC 9727 API catalog](https://www.hebcal.com/.well-known/api-catalog)
- [Developer APIs overview](https://www.hebcal.com/home/developer-apis)
- [Jewish Calendar REST API](https://www.hebcal.com/home/195/jewish-calendar-rest-api)
- [Hebrew Date Converter REST API](https://www.hebcal.com/home/219/hebrew-date-converter-rest-api)
- [Shabbat Times REST API](https://www.hebcal.com/home/197/shabbat-times-rest-api)
- [Zmanim (halachic times) API](https://www.hebcal.com/home/1663/zmanim-halachic-times-api)
- [Leyning (Torah reading) API](https://www.hebcal.com/home/4277/leyning-torah-reading-api)
- [Yahrzeit + Anniversary API](https://www.hebcal.com/home/1705/yahrzeit-anniversary-api)
- [Specifying a location for Jewish calendar APIs](https://www.hebcal.com/home/4912/specifying-a-location-for-jewish-calendar-apis)
- [Jewish calendar MCP server](https://www.hebcal.com/home/5027/jewish-calendar-model-context-protocol-mcp)
- [MCP server card](https://www.hebcal.com/.well-known/mcp/server-card.json)
- [Open-source libraries on GitHub](https://github.com/hebcal)

## Main pages

- [Custom Jewish calendar](https://www.hebcal.com/hebcal)
- [Hebrew date converter](https://www.hebcal.com/converter)
- [Jewish holidays](https://www.hebcal.com/holidays/)
- [Shabbat candle-lighting times](https://www.hebcal.com/shabbat)
- [Torah readings (parashat hashavua)](https://www.hebcal.com/sedrot/)
- [Yahrzeit, birthday and anniversary calendar](https://www.hebcal.com/yahrzeit)
- [Daily learning](https://www.hebcal.com/learning/)
- [Calendar downloads (iCalendar, CSV)](https://www.hebcal.com/ical/)
- [Help](https://www.hebcal.com/home/help)
- [About Hebcal](https://www.hebcal.com/home/about)
- [Contact](https://www.hebcal.com/home/about/contact)
- [XML sitemap](https://www.hebcal.com/sitemap.xml)
