-- Edge Cron 互斥锁：同一 job 运行中时后续触发直接跳过
CREATE TABLE IF NOT EXISTS public.edge_job_locks (
  job_name text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NOT NULL,
  worker_id text NOT NULL
);

COMMENT ON TABLE public.edge_job_locks IS
  'Supabase Edge 定时任务互斥锁；locked_until 过期后可被新 worker 抢占';

ALTER TABLE public.edge_job_locks ENABLE ROW LEVEL SECURITY;
