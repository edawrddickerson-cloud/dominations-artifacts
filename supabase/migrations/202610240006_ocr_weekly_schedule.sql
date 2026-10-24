-- Existing hosted pg_cron. Monday 04:00 UTC; no client or workstation required.
begin;
select cron.schedule('planner-ocr-weekly-report','0 4 * * 1','select public.planner_run_ocr_weekly_reports();');
commit;
