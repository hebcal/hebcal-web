#!/bin/sh

set -x

TMPFILE=`mktemp /tmp/hebcal.XXXXXX`
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
    infile="ical/${file}.ics"
    nice brotli --keep --best "$infile" "ical/${file}.csv" || exit 1
    nice gzip --keep --best "$infile" "ical/${file}.csv" || exit 1
}

mkdir -p ical || exit 1

node dist/makeStaticCalendars.js || exit 1

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
