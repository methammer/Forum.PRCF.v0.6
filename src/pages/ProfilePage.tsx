import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Added Input import
import { Loader2, Edit, UserCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Profile } from '@/contexts/UserContext';
import UsernameEditForm from '@/components/profile/UsernameEditForm';
import TotpSetupDialog from '@/components/profile/TotpSetupDialog';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const ProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { profile: currentUserProfile, isLoadingAuth: isLoadingCurrentUserAuth, authUser, refreshCurrentUserProfile } = useAuth();
  const { toast } = useToast();
  
  const [profileData, setProfileData] = useState<Profile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  
  const [isTotpSetupDialogOpen, setIsTotpSetupDialogOpen] = useState(false);
  const [isDisablingTotp, setIsDisablingTotp] = useState(false);
  const [totpCodeForDisable, setTotpCodeForDisable] = useState(''); // State for TOTP code input


  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) {
        setError("ID d'utilisateur manquant.");
        setIsLoadingProfile(false);
        return;
      }

      if (userId === authUser?.id && currentUserProfile) {
        setProfileData(currentUserProfile);
        setIsLoadingProfile(false);
        return;
      }
      
      setIsLoadingProfile(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, status, role, is_totp_enabled')
          .eq('id', userId)
          .single();

        if (fetchError) {
          console.error("Error fetching profile:", fetchError);
          setError(`Erreur lors de la récupération du profil: ${fetchError.message}`);
          setProfileData(null);
        } else {
          setProfileData(data as Profile);
        }
      } catch (e: any) {
        console.error("Exception fetching profile:", e);
        setError(`Une erreur inattendue est survenue: ${e.message}`);
        setProfileData(null);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    if (!isLoadingCurrentUserAuth) {
        fetchProfile();
    }
  }, [userId, authUser?.id, currentUserProfile, isLoadingCurrentUserAuth]);

  useEffect(() => {
    if (userId === authUser?.id && currentUserProfile) {
      setProfileData(currentUserProfile);
    }
  }, [currentUserProfile, userId, authUser?.id]);

  const handleDisableTotp = async () => {
    if (!totpCodeForDisable.trim()) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez entrer votre code A2F actuel." });
      return;
    }
    setIsDisablingTotp(true);
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactor = factorsData.totp.find(factor => factor.status === 'verified');
      if (!totpFactor) {
        toast({ variant: "destructive", title: "Erreur", description: "Aucun facteur A2F (TOTP) actif trouvé." });
        // Ensure profile is_totp_enabled is false if no factor exists
        const { error: rpcErrorSync } = await supabase.rpc('set_totp_enabled', { p_is_enabled: false });
        if (rpcErrorSync) console.error("Error syncing TOTP status on profile (no factor found):", rpcErrorSync);
        await refreshCurrentUserProfile();
        setTotpCodeForDisable('');
        setIsDisablingTotp(false);
        return;
      }

      // Step 1: Challenge and Verify with the provided TOTP code
      const { error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totpFactor.id,
        code: totpCodeForDisable,
      });

      if (challengeError) {
        console.error("Error verifying TOTP code for disable:", challengeError);
        toast({ variant: "destructive", title: "Code A2F invalide", description: "Le code A2F fourni est incorrect. Veuillez réessayer." });
        setTotpCodeForDisable(''); // Clear the code so user has to re-enter
        setIsDisablingTotp(false);
        return;
      }

      // Step 2: If verification is successful, unenroll the factor
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
      if (unenrollError) {
        // This is where the AAL2 error was happening. If it still happens, the challengeAndVerify didn't elevate AAL as expected.
        console.error("Error unenrolling TOTP factor after challenge:", unenrollError);
        throw unenrollError; 
      }

      // Step 3: Update profile and notify user
      const { error: rpcError } = await supabase.rpc('set_totp_enabled', { p_is_enabled: false });
      if (rpcError) {
        console.error("Error setting TOTP disabled flag in profile:", rpcError);
        toast({ variant: "destructive", title: "Erreur partielle", description: "A2F désactivée mais échec de la mise à jour du statut du profil."});
      } else {
        toast({ title: "Succès", description: "L'authentification à deux facteurs (TOTP) a été désactivée." });
      }
      await refreshCurrentUserProfile();

    } catch (err: any) {
      console.error("Error disabling TOTP:", err);
      if (err.message && err.message.includes("AAL2 required")) {
           toast({ variant: "destructive", title: "Erreur de sécurité", description: "Une vérification de sécurité supplémentaire est requise. Essayez de vous reconnecter et réessayez." });
      } else if (err.message && (err.message.toLowerCase().includes("invalid totp code") || err.message.toLowerCase().includes("verification failed") || err.code === 'invalid_mfa_code')) {
           toast({ variant: "destructive", title: "Code A2F invalide", description: "Le code A2F fourni est incorrect. Veuillez réessayer." });
      } else {
          toast({ variant: "destructive", title: "Erreur", description: err.message || "Échec de la désactivation de l'A2F." });
      }
    } finally {
      setIsDisablingTotp(false);
      setTotpCodeForDisable(''); 
    }
  };


  const isLoading = isLoadingCurrentUserAuth || isLoadingProfile;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Chargement du profil...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-semibold text-red-600 dark:text-red-400">Erreur</h2>
        <p className="text-gray-600 dark:text-gray-300">{error}</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-semibold">Profil introuvable</h2>
        <p className="text-gray-600 dark:text-gray-300">L'utilisateur avec l'ID {userId} n'a pas été trouvé.</p>
      </div>
    );
  }

  const canEdit = authUser?.id === profileData.id;

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Card className="max-w-2xl mx-auto dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden">
        <CardHeader className="text-center border-b dark:border-gray-700 pb-6 bg-gray-50 dark:bg-gray-800/50 p-6">
          <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-primary-focus dark:border-primary shadow-lg rounded-full">
            <AvatarImage src={profileData.avatar_url || undefined} alt={profileData.username || profileData.full_name || 'User Avatar'} />
            <AvatarFallback className="text-4xl bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {(profileData.username || profileData.full_name || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">{profileData.full_name || profileData.username || 'Utilisateur Anonyme'}</CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400 mt-1">
            Rôle: <span className="font-medium text-primary">{profileData.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 p-6 md:p-8">
          
          {/* Username Section */}
          <div className="border dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <UserCircle className="h-6 w-6 mr-3 text-primary" />
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Nom d'utilisateur</h3>
              </div>
              {canEdit && !isEditingUsername && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingUsername(true)} className="text-primary hover:text-primary-focus">
                  <Edit className="mr-1.5 h-4 w-4" /> Modifier
                </Button>
              )}
            </div>
            {!isEditingUsername ? (
              <p className="text-gray-700 dark:text-gray-400 ml-9">{profileData.username || <span className="italic">Non défini</span>}</p>
            ) : (
              <UsernameEditForm
                currentUsername={profileData.username || ''}
                onSaveSuccess={() => setIsEditingUsername(false)}
                onCancel={() => setIsEditingUsername(false)}
              />
            )}
          </div>

          {/* TOTP MFA Section */}
          {canEdit && (
            <div className="border dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  {profileData.is_totp_enabled ? 
                    <ShieldCheck className="h-6 w-6 mr-3 text-green-500" /> : 
                    <ShieldOff className="h-6 w-6 mr-3 text-yellow-500" />
                  }
                  <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Authentification à Deux Facteurs (A2F)</h3>
                </div>
              </div>
              {profileData.is_totp_enabled ? (
                <>
                  <p className="text-green-600 dark:text-green-400 ml-9 mb-3">L'A2F (TOTP) est activée sur votre compte.</p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                       <Button variant="destructive" className="w-full sm:w-auto" disabled={isDisablingTotp}>
                        {isDisablingTotp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                        Désactiver l'A2F
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Désactiver l'A2F (TOTP) ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Pour désactiver l'authentification à deux facteurs, veuillez entrer un code actuel de votre application d'authentification. Votre compte sera moins sécurisé.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="py-2 space-y-2">
                        <label htmlFor="totp-disable-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Code A2F actuel
                        </label>
                        <Input
                          id="totp-disable-code"
                          type="text"
                          value={totpCodeForDisable}
                          onChange={(e) => setTotpCodeForDisable(e.target.value.replace(/\D/g, '').slice(0,6))} // Allow only digits, max 6
                          placeholder="123456"
                          className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          maxLength={6}
                          autoComplete="one-time-code"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setTotpCodeForDisable('')}>Annuler</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleDisableTotp} 
                          className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-700"
                          disabled={isDisablingTotp || !totpCodeForDisable.trim()}
                        >
                          {isDisablingTotp ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                          Oui, désactiver
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : (
                <>
                  <p className="text-yellow-600 dark:text-yellow-400 ml-9 mb-3">L'A2F (TOTP) n'est pas activée. Activez-la pour renforcer la sécurité de votre compte.</p>
                  <Button onClick={() => setIsTotpSetupDialogOpen(true)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white">
                    <ShieldCheck className="mr-2 h-4 w-4" /> Activer l'A2F (TOTP)
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Biography Section (Placeholder) */}
          <div className="border dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Biographie</h3>
            <p className="text-gray-600 dark:text-gray-400 italic">
              Biographie non encore disponible. L'utilisateur pourra bientôt l'ajouter.
            </p>
          </div>
          
          {/* Activity Section (Placeholder) */}
          <div className="mt-8 pt-6 border-t dark:border-gray-700">
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">Activité Récente</h3>
            <div className="space-y-4">
              <p className="text-gray-500 dark:text-gray-400 italic">L'affichage de l'activité récente sera bientôt disponible.</p>
            </div>
          </div>

        </CardContent>
      </Card>

      {canEdit && (
        <TotpSetupDialog
          isOpen={isTotpSetupDialogOpen}
          onOpenChange={setIsTotpSetupDialogOpen}
          onSetupComplete={() => {
            setIsTotpSetupDialogOpen(false); 
            // No need to call refreshCurrentUserProfile here, TotpSetupDialog handles it
          }}
        />
      )}
    </div>
  );
};

export default ProfilePage;
