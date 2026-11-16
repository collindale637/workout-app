-- Trigger-only functions: nobody needs to call these through the API (Supabase security advisor).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_active_gym() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
