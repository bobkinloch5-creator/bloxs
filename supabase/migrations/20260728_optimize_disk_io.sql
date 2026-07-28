-- Optimization Migration to fix 100% Disk IOPS usage in Supabase / Postgres
-- Creating composite indexes for high-frequency queries in BloxSmith

-- 1. Plugin actions status & user lookup index
CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_status_created 
  ON plugin_actions(user_id, status, created_at);

-- 2. Plugin actions message_id lookup index
CREATE INDEX IF NOT EXISTS idx_plugin_actions_message_status 
  ON plugin_actions(message_id, status);

-- 3. Profiles plugin_token lookup index
CREATE INDEX IF NOT EXISTS idx_profiles_plugin_token 
  ON profiles(plugin_token);

-- 4. Plugin sessions user_id lookup index
CREATE INDEX IF NOT EXISTS idx_plugin_sessions_user_last_seen 
  ON plugin_sessions(user_id, last_seen);

-- 5. Projects user_id lookup index
CREATE INDEX IF NOT EXISTS idx_projects_user_id 
  ON projects(user_id);
