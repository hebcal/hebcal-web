#!/bin/sh

# Generate static iCalendar and CSV files in the ical/ subdirectory

remove_file() {
    file=$1
    ics="ical/${file}.ics"
    csv="ical/${file}.csv"
    rm -f "$ics" "$csv" "$ics.br" "$csv.br" "$ics.gz" "$csv.gz"
}

compress_file() {
    file=$1
    ics="ical/${file}.ics"
    csv="ical/${file}.csv"
    nice brotli --keep --best "$ics" "$csv" || exit 1
    nice gzip --keep --best "$ics" "$csv" || exit 1
}

mkdir -p ical || exit 1

node dist/makeStaticCalendars.js --quiet || exit 1

FILE="kindness"
remove_file $FILE
node dist/kindness.js
mv "${FILE}.ics" "${FILE}.csv" ical
compress_file $FILE

FILE="chabad-special-dates"
remove_file $FILE
DOWNLOAD_URL="http://127.0.0.1:8080"
chabad_url_prefix="${DOWNLOAD_URL}/v3/01jmt1hef19p1hw6qn48k8p4z9/personal"
chabad_url_args="emoji=0&yrem=0&dl=1&years=12&title=Special+Dates+on+the+Chabad+Chassidic+Calendar"
curl --silent --show-error -o "ical/${FILE}.ics" "${chabad_url_prefix}.ics?${chabad_url_args}" || exit 1
curl --silent --show-error -o "ical/${FILE}.csv" "${chabad_url_prefix}.csv?${chabad_url_args}" || exit 1
compress_file $FILE
