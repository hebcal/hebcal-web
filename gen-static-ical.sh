#!/bin/sh

set -x

TMPFILE=`mktemp /tmp/hebcal.XXXXXX`
YEAR0=`date +'%Y'`
YEAR=`expr ${YEAR0} - 1`
ENDY2=`expr ${YEAR} + 2`
END2="${ENDY2}-12-31"
ENDY3=`expr ${YEAR} + 3`
END3="${ENDY3}-12-31"
ENDY5=`expr ${YEAR} + 5`
END5="${ENDY5}-12-31"
ENDY8=`expr ${YEAR} + 8`
END8="${ENDY8}-12-31"
ENDY10=`expr ${YEAR} + 10`
END10="${ENDY10}-12-31"
START="${YEAR}-12-01"
DOWNLOAD_URL="http://127.0.0.1:8080"

remove_file() {
    file=$1
    rm -f "ical/${file}.ics" "ical/${file}.csv" "ical/${file}.ics.br" "ical/${file}.csv.br" "ical/${file}.ics.gz" "ical/${file}.csv.gz"
}

fetch_urls () {
    file=$1
    args=$2
    remove_file $file
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.ics?${args}" && cp $TMPFILE "ical/${file}.ics"
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.csv?${args}" && cp $TMPFILE "ical/${file}.csv"
    chmod 0644 "ical/${file}.ics" "ical/${file}.csv"
}

compress_file() {
    file=$1
    nice brotli --keep --best "ical/${file}.ics" "ical/${file}.csv"
    nice gzip --keep --best "ical/${file}.ics" "ical/${file}.csv"
}

mkdir -p ical

FILE="jewish-holidays-v2"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=off&mf=off&ss=off&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all-v2"
fetch_urls $FILE "start=${START}&end=${END8}&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&nx=on&mf=on&ss=on&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=off&mf=off&ss=off&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Jewish+Holidays&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all"
fetch_urls $FILE "start=${START}&end=${END8}&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&nx=on&mf=on&ss=on&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Jewish+Holidays&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="hdate-en"
fetch_urls $FILE "start=${START}&end=${END3}&v=1&i=off&lg=en&d=on&c=off&geo=none&publishedTTL=PT14D&title=Hebrew+calendar+dates+%28en%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+English+transliteration&color=%23AC8E68"
compress_file $FILE

FILE="hdate-he"
fetch_urls $FILE "start=${START}&end=${END3}&v=1&i=off&lg=h&d=on&c=off&geo=none&publishedTTL=PT14D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew&color=%23AC8E68"
compress_file $FILE

FILE="hdate-he-v2"
fetch_urls $FILE "start=${START}&end=${END3}&v=1&i=off&lg=he-x-NoNikud&d=on&c=off&geo=none&publishedTTL=PT14D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew&color=%23AC8E68"
compress_file $FILE

FILE="omer"
fetch_urls $FILE "start=${START}&end=${END3}&v=1&o=on&i=off&lg=en&c=off&geo=none&emoji=0&publishedTTL=PT14D&title=Days+of+the+Omer&caldesc=7+weeks+from+the+second+night+of+Pesach+to+the+day+before+Shavuot&color=%23FF9F0A"
compress_file $FILE

FILE="torah-readings-diaspora"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=off&lg=en&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Torah+Readings+%28Diaspora%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="torah-readings-israel"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=on&lg=en&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Torah+Readings+%28Israel+English%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="torah-readings-israel-he"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=on&lg=h&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Torah+Readings+%28Israel+Hebrew%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="yom-kippur-katan"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&ykk=on&relcalid=457ce561-311f-4eeb-9033-65561b7f7503&lg=en&publishedTTL=PT14D&title=Yom+Kippur+Katan&caldesc=%D7%99%D7%95%D6%B9%D7%9D+%D7%9B%D6%BC%D6%B4%D7%A4%D6%BC%D7%95%D6%BC%D7%A8+%D7%A7%D6%B8%D7%98%D6%B8%D7%9F%2C+minor+day+of+atonement+on+the+day+preceeding+each+Rosh+Chodesh"
compress_file $FILE

FILE="rosh-chodesh"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&maj=off&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=on&mf=off&ss=off&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Rosh+Chodesh&caldesc=Rosh+Chodesh+is+a+minor+holiday+observed+at+the+beginning+of+every+month+in+the+Hebrew+calendar&color=%236F42C1"
compress_file $FILE

FILE="mevarchim"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&mvch=on&maj=off&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=off&mf=off&ss=off&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT14D&title=Shabbat+Mevarchim&caldesc=Shabbat+announcing+new+month%2CPrior+to+Rosh+Chodesh"
compress_file $FILE

FILE="yizkor-diaspora"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&yzkr=on&relcalid=64acac8c-a02f-4433-b7ef-f3a5e02d26cc&lg=en&publishedTTL=PT14D&title=Yizkor+%28Diaspora%29&caldesc=Ashkenazi+Jewish+memorial+prayer+service+for+the+dead+recited+in+synagogue+during+four+holidays+yearly"
compress_file $FILE

FILE="yizkor-il"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&yzkr=on&i=on&relcalid=21eadc10-9fa6-402c-ac6f-c94d1ee7537e&lg=he-x-NoNikud&publishedTTL=PT14D&title=Yizkor+%28Israel%29&caldesc=Ashkenazi+Jewish+memorial+prayer+service+for+the+dead+recited+in+synagogue+during+four+holidays+yearly"
compress_file $FILE

node dist/staticDailyLearning.js


FILE="chofetz-chaim"
remove_file $FILE
node dist/chofetzChaim.js
mv "${FILE}.ics" "${FILE}.csv" ical
compress_file $FILE

FILE="kindness"
remove_file $FILE
node dist/kindness.js
mv "${FILE}.ics" "${FILE}.csv" ical
compress_file $FILE

FILE="chabad-special-dates"
remove_file $FILE
chabad_url_prefix="${DOWNLOAD_URL}/v3/01jmt1hef19p1hw6qn48k8p4z9/personal"
chabad_url_args="emoji=0&yrem=0&dl=1&title=Special+Dates+on+the+Chabad+Chassidic+Calendar"
curl -o "ical/${FILE}.ics" "${chabad_url_prefix}.ics?${chabad_url_args}"
curl -o "ical/${FILE}.csv" "${chabad_url_prefix}.csv?${chabad_url_args}"
compress_file $FILE

rm -f $TMPFILE
