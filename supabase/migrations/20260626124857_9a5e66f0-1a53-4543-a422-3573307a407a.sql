
ALTER TABLE public.plugin_actions DROP CONSTRAINT IF EXISTS plugin_actions_kind_check;
ALTER TABLE public.plugin_actions ADD CONSTRAINT plugin_actions_kind_check CHECK (kind IN (
  'script','localscript','modulescript',
  'gui','screengui','frame','textlabel','textbutton','imagelabel',
  'folder','part','model','terrain','tool','sound','team',
  'remoteevent','remotefunction','bindableevent',
  'leaderstats','insert_asset','set_properties',
  'rename','move','delete','setting','run','run_lua'
));

ALTER TABLE public.studio_errors DROP CONSTRAINT IF EXISTS studio_errors_level_check;
ALTER TABLE public.studio_errors ADD CONSTRAINT studio_errors_level_check CHECK (level IN (
  'info','warn','warning','error','fatal'
));
