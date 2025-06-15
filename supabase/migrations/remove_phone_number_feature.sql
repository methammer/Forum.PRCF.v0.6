```sql
/*
  # Remove Phone Number Feature

  This migration removes the phone number field from user profiles and
  the associated RPC function, as the project will focus solely on TOTP for 2FA.

  1. Removed Columns
     - `profiles`
       - `phone_number` (TEXT): This column is dropped.

  2. Removed Functions
     - `public.update_phone_number(TEXT)`: This function is dropped.

  3. Security
     - RLS policies related to `phone_number` are implicitly removed or no longer apply
       as the column and function are deleted.
*/

-- Drop phone_number column from public.profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN phone_number;
    RAISE NOTICE 'Column phone_number dropped from public.profiles.';
  ELSE
    RAISE NOTICE 'Column phone_number does not exist in public.profiles.';
  END IF;
END $$;

-- Drop RPC function to update phone number
DROP FUNCTION IF EXISTS public.update_phone_number(TEXT);
    ```