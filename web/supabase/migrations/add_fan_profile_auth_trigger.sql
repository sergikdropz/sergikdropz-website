-- Ensure every new auth user gets a fan_profiles row (OAuth, magic link, etc.)
-- Apply after add_fan_accounts.sql (fan_profiles table must exist).
CREATE OR REPLACE FUNCTION public.handle_new_user_fan_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fan_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_fan_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_fan_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_fan_profile();
