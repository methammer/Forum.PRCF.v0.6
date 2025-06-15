```sql
/*
  # Add Phone Number to Profiles and Create Update RPC

  This migration adds a phone number field to user profiles and provides
  a way for users to update it.

  1. New Columns
     - `profiles`
       - `phone_number` (TEXT, nullable): Stores the user's phone number.

  2. Modified Tables
     - `profiles`:
       - Added `phone_number` column.
       - The existing RLS policy "Users can update their own profile"
         (typically `CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);`)
         allows users to update this new field. If a more restrictive column-level RLS is in place, it might need adjustment.

  3. New Functions
     - `public.update_phone_number(new_phone_number TEXT)`: Allows authenticated
       users to update their own phone number. An empty string will be stored as NULL.

  4. Security
     - RLS on `profiles` ensures users can only modify their own data.
     - The `update_phone_number` RPC operates on behalf of the authenticated user.
*/

-- Add phone_number column to public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone_number TEXT;
    RAISE NOTICE 'Column phone_number added to public.profiles.';
  ELSE
    RAISE NOTICE 'Column phone_number already exists in public.profiles.';
  END IF;
END $$;

-- Create or replace RPC function to update phone number
CREATE OR REPLACE FUNCTION public.update_phone_number(p_new_phone_number TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleaned_phone_number TEXT;
BEGIN
  -- Clean the input: treat empty or whitespace-only string as NULL
  IF p_new_phone_number IS NULL OR trim(p_new_phone_number) = '' THEN
    v_cleaned_phone_number := NULL;
  ELSE
    v_cleaned_phone_number := trim(p_new_phone_number);
  END IF;

  UPDATE public.profiles
  SET phone_number = v_cleaned_phone_number
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found or not authorized to update.';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_phone_number(TEXT) TO authenticated;

COMMENT ON COLUMN public.profiles.phone_number IS 'User''s phone number, can be used for 2FA or notifications.';
COMMENT ON FUNCTION public.update_phone_number(TEXT) IS 'Allows an authenticated user to update their own phone number. Empty strings are converted to NULL.';

    ```