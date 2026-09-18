DROP POLICY IF EXISTS categories_insert_own ON public.categories;
DROP POLICY IF EXISTS categories_update_own ON public.categories;

CREATE POLICY categories_insert_own ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.categories p
        WHERE p.id = public.categories.parent_id
          AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY categories_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.categories p
        WHERE p.id = public.categories.parent_id
          AND p.user_id = auth.uid()
      )
    )
  );