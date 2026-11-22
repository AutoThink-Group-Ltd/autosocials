CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct')
  );
  IF COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct') = 'agency' THEN
    INSERT INTO public.agency_profiles (user_id, agency_name, agency_website, contact_name, contact_email)
    VALUES (
      NEW.id,
      left(COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'agency_name'), ''), NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)), 100),
      left(NULLIF(trim(NEW.raw_user_meta_data->>'agency_website'), ''), 255),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NEW.email
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;