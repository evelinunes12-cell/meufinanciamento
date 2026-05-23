
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz;

UPDATE public.profiles p
SET ultimo_acesso = u.last_sign_in_at
FROM auth.users u
WHERE p.user_id = u.id;

CREATE OR REPLACE FUNCTION public.sync_ultimo_acesso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.profiles
      SET ultimo_acesso = NEW.last_sign_in_at
      WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_ultimo_acesso() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_sign_in
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_ultimo_acesso();
