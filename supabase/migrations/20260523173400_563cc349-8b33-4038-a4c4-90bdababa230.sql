CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, nome, celular, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name'
    ),
    NEW.raw_user_meta_data->>'celular',
    NEW.email,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
    celular = COALESCE(public.profiles.celular, EXCLUDED.celular),
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (user_id, email, nome, is_active)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'nome',
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'full_name'
  ) AS nome,
  true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles p
  WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p
SET
  email = COALESCE(p.email, u.email),
  nome = COALESCE(
    p.nome,
    u.raw_user_meta_data->>'nome',
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'full_name'
  ),
  updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND (
    p.email IS NULL
    OR p.nome IS NULL
  );

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = u.id
    AND ur.role = 'user'
)
ON CONFLICT (user_id, role) DO NOTHING;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;