#!/bin/sh
set -eu

create_topic() {
  /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server kafka:19092 \
    --create --if-not-exists \
    --partitions 3 \
    --replication-factor 1 \
    --topic "$@"
}

for name in identity users events participation search notifications messages; do
  create_topic "event-sharing.$name.v1"
done

for name in auth events participation messages notifications users storage \
  geo-search event-log gateway replies; do
  create_topic "event-sharing.rpc.$name.v1" --config retention.ms=3600000
done
