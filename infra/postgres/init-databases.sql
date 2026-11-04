CREATE DATABASE auth_db;
CREATE DATABASE users_db;
CREATE DATABASE events_db;
CREATE DATABASE geo_search_db;
CREATE DATABASE participation_db;
CREATE DATABASE notifications_db;
CREATE DATABASE messages_db;
CREATE DATABASE event_log_db;
CREATE DATABASE storage_db;

\connect geo_search_db
CREATE EXTENSION IF NOT EXISTS postgis;
