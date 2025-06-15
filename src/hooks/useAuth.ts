import { useUser, Profile } from '@/contexts/UserContext';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface AuthInfo {
  authUser: SupabaseUser | null;
  profile: Profile | null;
  session: Session | null;
  isLoadingAuth: boolean;
  role: Profile['role'] | null;
  isUser: boolean;
  isModerator: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean; // Assuming SUPER_ADMIN is a role
  canModerate: boolean; // MODERATOR, ADMIN, SUPER_ADMIN
  canAdminister: boolean; // ADMIN, SUPER_ADMIN
  signOut: () => Promise<void>;
  refreshCurrentUserProfile: () => Promise<void>; // Added
}

export const useAuth = (): AuthInfo => {
  const context = useUser(); // context already handles the uninitialized sentinel

  const role = context.profile?.role ?? null;

  // Adjusted role checks based on typical hierarchy
  const isUser = role === 'USER';
  const isModerator = role === 'MODERATOR';
  const isAdmin = role === 'ADMIN';
  const isSuperAdmin = role === 'SUPER_ADMIN'; // Define if this role exists

  const canModerate = isModerator || isAdmin || isSuperAdmin;
  const canAdminister = isAdmin || isSuperAdmin;

  return {
    authUser: context.user,
    profile: context.profile,
    session: context.session,
    isLoadingAuth: context.isLoadingAuth,
    role,
    isUser,
    isModerator,
    isAdmin,
    isSuperAdmin,
    canModerate,
    canAdminister,
    signOut: context.signOut,
    refreshCurrentUserProfile: context.refreshCurrentUserProfile, // Expose refresh function
  };
};
