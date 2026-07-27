
-- ============================================================
-- 1) Storage: avatares — usar user_roles via helpers
-- ============================================================
DROP POLICY IF EXISTS "Admins can upload member avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update member avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete member avatars" ON storage.objects;

CREATE POLICY "Admins can upload member avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_master(auth.uid())
    OR (
      public.is_company_admin(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles target
        WHERE target.id::text = (storage.foldername(name))[1]
          AND target.company_id = public.get_user_company_id(auth.uid())
      )
    )
  )
);

CREATE POLICY "Admins can update member avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_master(auth.uid())
    OR (
      public.is_company_admin(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles target
        WHERE target.id::text = (storage.foldername(objects.name))[1]
          AND target.company_id = public.get_user_company_id(auth.uid())
      )
    )
  )
);

CREATE POLICY "Admins can delete member avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_master(auth.uid())
    OR (
      public.is_company_admin(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles target
        WHERE target.id::text = (storage.foldername(objects.name))[1]
          AND target.company_id = public.get_user_company_id(auth.uid())
      )
    )
  )
);

-- ============================================================
-- 2) Storage: financial-docs — remove duplicatas fin_docs_*
-- ============================================================
DROP POLICY IF EXISTS "fin_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "fin_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "fin_docs_delete" ON storage.objects;

-- ============================================================
-- 3) Medical: adicionar is_company_active no SELECT
-- ============================================================
DROP POLICY IF EXISTS medical_ai_insights_select ON public.medical_ai_insights;
CREATE POLICY medical_ai_insights_select ON public.medical_ai_insights
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_appointments_select ON public.medical_appointments;
CREATE POLICY medical_appointments_select ON public.medical_appointments
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_doctors_select ON public.medical_doctors;
CREATE POLICY medical_doctors_select ON public.medical_doctors
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_follow_ups_select ON public.medical_follow_ups;
CREATE POLICY medical_follow_ups_select ON public.medical_follow_ups
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_kpi_snapshots_select ON public.medical_kpi_snapshots;
CREATE POLICY medical_kpi_snapshots_select ON public.medical_kpi_snapshots
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_marketing_select ON public.medical_marketing;
CREATE POLICY medical_marketing_select ON public.medical_marketing
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_patients_select ON public.medical_patients;
CREATE POLICY medical_patients_select ON public.medical_patients
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_payments_select ON public.medical_payments;
CREATE POLICY medical_payments_select ON public.medical_payments
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_procedures_select ON public.medical_procedures;
CREATE POLICY medical_procedures_select ON public.medical_procedures
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_practices_select ON public.medical_practices;
CREATE POLICY medical_practices_select ON public.medical_practices
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_facilities_select ON public.medical_facilities;
CREATE POLICY medical_facilities_select ON public.medical_facilities
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS medical_insurances_select ON public.medical_insurances;
CREATE POLICY medical_insurances_select ON public.medical_insurances
  FOR SELECT USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );
