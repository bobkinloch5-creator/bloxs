CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_status_created_desc
  ON public.plugin_actions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_pending_message_order
  ON public.plugin_actions (user_id, message_id, created_at ASC, position ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_sent_at
  ON public.plugin_actions (user_id, sent_at DESC)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_plugin_actions_project_user_message_position
  ON public.plugin_actions (project_id, user_id, message_id, position);

CREATE INDEX IF NOT EXISTS idx_plugin_actions_project_created_desc
  ON public.plugin_actions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project_user_role_created_desc
  ON public.chat_messages (project_id, user_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project_created_asc
  ON public.chat_messages (project_id, created_at ASC);