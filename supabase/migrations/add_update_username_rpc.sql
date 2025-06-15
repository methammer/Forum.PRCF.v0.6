```sql
/*
  # Fonctionnalité de mise à jour du nom d'utilisateur

  Ce script de migration ajoute une fonction RPC pour permettre aux utilisateurs de mettre à jour leur nom d'utilisateur.

  1. Nouvelles Fonctions
    - `public.update_username(new_username TEXT)`:
      - Permet à un utilisateur authentifié de changer son propre nom d'utilisateur.
      - Valide la longueur du nouveau nom d'utilisateur (minimum 3 caractères).
      - Vérifie l'unicité du nouveau nom d'utilisateur dans la table `profiles`.
      - Met à jour le champ `username` dans la table `profiles` pour l'utilisateur courant (`auth.uid()`).
      - Retourne l'enregistrement de profil mis à jour.

  2. Sécurité
    - La fonction `update_username` est définie avec `SECURITY DEFINER` pour s'exécuter avec les permissions du propriétaire de la fonction, tout en vérifiant l'identité de l'appelant via `auth.uid()`.
    - Les politiques RLS existantes sur la table `profiles` permettent déjà aux utilisateurs de mettre à jour leur propre profil (`Users can update their own profile`). Cette fonction offre une interface contrôlée pour cette opération spécifique.

  3. Tables Modifiées (implicitement via la fonction)
    - `profiles`: Le champ `username` peut être modifié par cette fonction. La politique RLS existante `Users can update their own profile` autorise cette action pour l'utilisateur concerné.

  4. Notes Importantes
    - La validation des caractères autorisés pour le nom d'utilisateur est gérée côté client (React component) et peut être renforcée dans cette fonction RPC si nécessaire.
    - Assurez-vous que la colonne `username` de la table `profiles` possède une contrainte `UNIQUE`.
*/

CREATE OR REPLACE FUNCTION public.update_username(new_username TEXT)
RETURNS public.profiles -- Retourne le profil mis à jour
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  updated_profile public.profiles;
BEGIN
  -- Validation de la longueur
  IF char_length(new_username) < 3 THEN
    RAISE EXCEPTION 'Le nom d''utilisateur doit contenir au moins 3 caractères.';
  END IF;
  IF char_length(new_username) > 30 THEN
    RAISE EXCEPTION 'Le nom d''utilisateur ne peut pas dépasser 30 caractères.';
  END IF;

  -- Validation des caractères (exemple simple, peut être plus complexe)
  IF new_username !~ '^[a-zA-Z0-9_.]+$' THEN
    RAISE EXCEPTION 'Le nom d''utilisateur ne peut contenir que des lettres (a-z, A-Z), des chiffres (0-9), des underscores (_) ou des points (.).';
  END IF;

  -- Vérification de l'unicité (insensible à la casse pour la vérification, mais stocké tel quel)
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(new_username) AND id <> current_user_id
  ) THEN
    RAISE EXCEPTION 'Ce nom d''utilisateur est déjà pris.';
  END IF;

  -- Mise à jour du nom d'utilisateur
  UPDATE public.profiles
  SET username = new_username
  WHERE id = current_user_id
  RETURNING * INTO updated_profile;

  RETURN updated_profile;
END;
$$;

-- Assurez-vous que la politique RLS permet la mise à jour par l'utilisateur (devrait déjà exister)
-- Exemple de politique (si elle n'existe pas ou doit être ajustée) :
-- CREATE POLICY "Users can update their own profile details"
--   ON public.profiles
--   FOR UPDATE
--   TO authenticated
--   USING (auth.uid() = id)
--   WITH CHECK (auth.uid() = id);

-- Commentaire: La politique RLS "Users can update their own profile" est supposée être déjà en place et adéquate.
-- La fonction `update_username` est `SECURITY DEFINER` et utilise `auth.uid()` pour cibler la mise à jour.
    ```