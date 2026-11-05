ALTER TABLE public.audios ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
DROP POLICY IF EXISTS audios_read_public ON public.audios;
CREATE POLICY audios_read_public ON public.audios FOR SELECT TO anon,authenticated USING (is_published IS TRUE);
DROP POLICY IF EXISTS audios_read_admin ON public.audios;
CREATE POLICY audios_read_admin ON public.audios FOR SELECT TO authenticated USING (public.is_app_admin());
