```sql
/*
  # Add TOTP MFA Settings to Profiles

  This migration adds settings related to Time-based One-Time Password (TOTP)
  Multi-Factor Authentication (MFA) to the user profiles table.

  1. New Columns
     - `profiles`
       - `is_totp_enabled` (BOOLEAN, NOT NULL, DEFAULT FALSE): Indicates if the user
         has enabled TOTP MFA.

  2. Modified Tables
     - `profiles`:
       - Added `is_totp_enabled` column.
       - RLS policies need to allow users to update their own `is_totp_enabled` status.
         The existing "Users can update their own profile" policy should cover this if it's
         not column-specific. If it is, this new column needs to be included.

  3. New Functions
     - `public.set_totp_enabled(p_is_enabled BOOLEAN)`: Allows an authenticated user
       to update their `is_totp_enabled` flag in their profile. This is typically
       called after successfully enrolling or unenrolling TOTP via Supabase Auth MFA API.

  4. Security
     - RLS on `profiles` ensures users can only modify their own `is_totp_enabled` flag.
     - The `set_totp_enabled` RPC operates on behalf of the authenticated user.
     - The actual TOTP secrets are managed by Supabase Auth and are not stored in this table.
*/

-- Add is_totp_enabled column to public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_totp_enabled'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'Column is_totp_enabled added to public.profiles.';
  ELSE
    RAISE NOTICE 'Column is_totp_enabled already exists in public.profiles.';
  END IF;
END $$;

-- Create or replace RPC function to update is_totp_enabled status
CREATE OR REPLACE FUNCTION public.set_totp_enabled(p_is_enabled BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET is_totp_enabled = p_is_enabled
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found or not authorized to update TOTP status.';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_totp_enabled(BOOLEAN) TO authenticated;

COMMENT ON COLUMN public.profiles.is_totp_enabled IS 'Flag indicating if the user has Time-based One-Time Password (TOTP) MFA enabled.';
COMMENT ON FUNCTION public.set_totp_enabled(BOOLEAN) IS 'Allows an authenticated user to update their own is_totp_enabled flag. Should be called after Supabase Auth MFA operations.';

-- Ensure RLS policy allows updating this new column.
-- If you have a general update policy like this, it's fine:
-- CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- If your policy is column-specific, ensure 'is_totp_enabled' is included for updates.
-- Example: For a column-specific policy, you might need to alter it or add a new one.
-- This is a placeholder comment; actual RLS adjustment depends on existing policies.
-- For now, we assume a general update policy is in place or will be adjusted.

    ```