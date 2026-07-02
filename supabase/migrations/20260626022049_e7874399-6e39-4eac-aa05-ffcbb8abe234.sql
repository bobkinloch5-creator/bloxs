
-- 1) Add donator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'donator';

-- 2) Donation claims table
CREATE TABLE IF NOT EXISTS public.donation_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paypal_reference text NOT NULL,
  amount_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS donation_claims_user_id_idx ON public.donation_claims(user_id);
CREATE INDEX IF NOT EXISTS donation_claims_status_idx ON public.donation_claims(status);

GRANT SELECT, INSERT, UPDATE ON public.donation_claims TO authenticated;
GRANT ALL ON public.donation_claims TO service_role;

ALTER TABLE public.donation_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own donation claims"
  ON public.donation_claims FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "users create own donation claims"
  ON public.donation_claims FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins update donation claims"
  ON public.donation_claims FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER donation_claims_touch_updated_at
  BEFORE UPDATE ON public.donation_claims
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
