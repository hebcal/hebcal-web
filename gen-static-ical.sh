#!/bin/sh

set -x

TMPFILE=`mktemp /tmp/hebcal.XXXXXX`
YEAR0=`date +'%Y'`
YEAR=`expr ${YEAR0} - 1`
DOWNLOAD_URL="http://127.0.0.1:8080"

remove_file() {
    file=$1
    rm -f "${file}.ics" "${file}.csv" "${file}.ics.br" "${file}.csv.br" "${file}.ics.gz" "${file}.csv.gz"
}

fetch_urls () {
    file=$1
    args=$2
    remove_file $file
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.ics?${args}" && cp $TMPFILE "${file}.ics"
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.csv?${args}" && cp $TMPFILE "${file}.csv"
    chmod 0644 "${file}.ics" "${file}.csv"
}

compress_file() {
    file=$1
    nice brotli --keep --best "${file}.ics" "${file}.csv"
    nice gzip --keep --best "${file}.ics" "${file}.csv"
}

FILE="jewish-holidays-v2"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&ny=10&nx=off&mf=off&ss=off&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all-v2"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&ny=8&nx=on&mf=on&ss=on&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&ny=10&nx=off&mf=off&ss=off&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&ny=8&nx=on&mf=on&ss=on&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="hdate-en"
fetch_urls $FILE "year=${YEAR0}&yt=G&v=1&i=off&lg=en&d=on&c=off&geo=none&ny=2&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28en%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+English+transliteration"
compress_file $FILE

FILE="hdate-he"
fetch_urls $FILE "year=${YEAR0}&yt=G&v=1&i=off&lg=h&d=on&c=off&geo=none&ny=2&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew"
compress_file $FILE

FILE="hdate-he-v2"
fetch_urls $FILE "year=${YEAR0}&yt=G&v=1&i=off&lg=he-x-NoNikud&d=on&c=off&geo=none&ny=2&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew"
compress_file $FILE

FILE="omer"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&o=on&i=off&lg=en&c=off&geo=none&ny=3&emoji=0&publishedTTL=PT30D&title=Days+of+the+Omer&caldesc=7+weeks+from+the+second+night+of+Pesach+to+the+day+before+Shavuot"
compress_file $FILE

FILE="torah-readings-diaspora"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&s=on&i=off&lg=en&c=off&geo=none&ny=5&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Diaspora%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com"
compress_file $FILE

FILE="torah-readings-israel"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&s=on&i=on&lg=en&c=off&geo=none&ny=5&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Israel+English%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com"
compress_file $FILE

FILE="torah-readings-israel-he"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&s=on&i=on&lg=h&c=off&geo=none&ny=5&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Israel+Hebrew%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com"
compress_file $FILE

FILE="daf-yomi"
fetch_urls $FILE "year=${YEAR}&yt=G&v=1&F=on&i=off&lg=en&c=off&geo=none&ny=3&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Daf+Yomi&caldesc=Daily+regimen+of+learning+the+Talmud"
compress_file $FILE

FILE="kindness"
remove_file $FILE
node dist/kindness.js
compress_file $FILE

FILE="yom-kippur-katan"
remove_file $FILE
node dist/yk-katan.js
compress_file $FILE

rm -f $TMPFILE
