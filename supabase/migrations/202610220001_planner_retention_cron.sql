-- Operational retention for the existing planner function. No active workspace
-- is removed: the function prunes history >30 days and research >730 days.
begin;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('planner-prune-expired-data','15 3 * * *','select public.planner_prune_expired_data();');
commit;
