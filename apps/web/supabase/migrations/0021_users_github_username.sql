-- 0021 — add nullable github_username column to users.
--
-- Powers the Life-tab GitHub contributions heatmap (and any future GitHub-
-- backed surface). Default null; user fills it in during onboarding or from
-- /settings. No index needed — only ever read by primary key on the user row.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS github_username text;
