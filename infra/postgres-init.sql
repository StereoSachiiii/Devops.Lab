-- Create application user if not exists
-- In K8s, run this as a Job with APP_USER_PASSWORD set from a Secret:
--   psql "$DATABASE_URL" -v app_user_password="$APP_USER_PASSWORD" -f init.sql
-- and replace :'app_user_password' below with the psql variable.
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'app_user') THEN
      CREATE ROLE app_user LOGIN PASSWORD :'app_user_password';
   END IF;
END
$do$;

-- Grant privileges on the appdb
GRANT ALL PRIVILEGES ON DATABASE appdb TO app_user;

-- Allow app_user to create schema in appdb and manage tables
\c appdb
GRANT ALL ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO app_user;
