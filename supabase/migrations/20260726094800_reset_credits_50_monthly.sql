-- Migration: Reset all users to 50 credits monthly (2026-07-26)
-- Sets max_credits = 50 and current credits = 50 for all non-admin/owner accounts.
-- Resets the 30-day refill timer starting from today.

-- Step 1: Set max_credits = 50 for all free-tier users (not Owner/Pro/Donator plan)
UPDATE profiles
SET max_credits = 50
WHERE plan NOT IN ('Owner', 'Pro', 'Donator')
  AND (is_admin = false OR is_admin IS NULL);

-- Step 2: Reset current credits to 50 for all free-tier users
UPDATE profiles
SET
  credits = 50,
  credits_reset_at = (NOW() + INTERVAL '30 days')::timestamptz
WHERE plan NOT IN ('Owner', 'Pro', 'Donator')
  AND (is_admin = false OR is_admin IS NULL);

-- Step 3: Ensure Donator/Pro plan users also have at least 50 max_credits
-- (they may have more from top-ups, so only raise, never lower)
UPDATE profiles
SET max_credits = GREATEST(COALESCE(max_credits, 0), 50)
WHERE plan IN ('Donator', 'Pro');
