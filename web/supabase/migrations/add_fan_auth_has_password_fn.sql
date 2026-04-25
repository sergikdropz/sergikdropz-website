-- True when auth.users has a password set (shop checkout). Magic-link-only users typically have no password row.
CREATE OR REPLACE FUNCTION public.fan_auth_has_password(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = uid
      AND au.encrypted_password IS NOT NULL
      AND length(trim(au.encrypted_password)) > 0
  );
$$;

REVOKE ALL ON FUNCTION public.fan_auth_has_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_auth_has_password(uuid) TO service_role;
