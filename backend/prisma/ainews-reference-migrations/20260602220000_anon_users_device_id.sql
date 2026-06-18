-- 设备指纹 id：同一 Chrome 环境重装扩展后可识别为同一匿名用户

ALTER TABLE public.anon_users
  ADD COLUMN IF NOT EXISTS device_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.anon_users.device_id IS
  '客户端根据浏览器/硬件信号生成的稳定哈希；重装扩展不变（同 Chrome 配置文件）。';

CREATE UNIQUE INDEX IF NOT EXISTS anon_users_device_id_unique_idx
  ON public.anon_users (device_id)
  WHERE device_id <> '';
