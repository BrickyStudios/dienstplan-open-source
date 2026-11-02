-- demo_rate_limit: simple IP-based rate limiting for demo logins
CREATE TABLE IF NOT EXISTS demo_rate_limit (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_rate_limit_ip_created ON demo_rate_limit(ip, created_at);
