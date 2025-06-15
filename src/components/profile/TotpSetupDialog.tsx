import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, AlertTriangle, KeyRound, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '../ui/label';

interface TotpSetupDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSetupComplete: () => void;
}

type EnrollResponseData = {
  id: string; // factorId
  totp: {
    qr_code: string; // SVG string for QR code
    secret: string;
  };
};

type VerifyResponseData = {
  id: string;
  factor_type: 'totp';
  status: 'verified';
  friendly_name?: string;
  created_at: string;
  updated_at: string;
  totp?: { // This part might not be present on verify, but recovery codes are
    recovery_codes: string[];
  };
  // Supabase might return recovery codes at a higher level in the response
  // For example, directly in the data object of verify response
  recovery_codes?: string[]; 
};


const TotpSetupDialog: React.FC<TotpSetupDialogProps> = ({ isOpen, onOpenChange, onSetupComplete }) => {
  const { toast } = useToast();
  const { refreshCurrentUserProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  
  const [step, setStep] = useState<'enroll' | 'verify' | 'recoveryCodes' | 'completed'>('enroll');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const resetDialogState = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setFactorId(null);
    setQrCodeSvg(null);
    setSecretKey(null);
    setVerificationCode('');
    setStep('enroll');
    setRecoveryCodes([]);
  }, []);

  useEffect(() => {
    if (isOpen && step === 'enroll') {
      const enrollTotp = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
          if (enrollError) throw enrollError;

          const enrollData = data as EnrollResponseData;
          setFactorId(enrollData.id);
          setQrCodeSvg(enrollData.totp.qr_code);
          setSecretKey(enrollData.totp.secret);
          setStep('verify');
        } catch (err: any) {
          console.error("Error enrolling TOTP:", err);
          setError(err.message || "Échec de l'initialisation de la configuration A2F.");
          // Consider closing dialog or allowing retry
        } finally {
          setIsLoading(false);
        }
      };
      enrollTotp();
    } else if (!isOpen) {
      // Reset state when dialog is closed, unless we are showing recovery codes as the final step
      if (step !== 'recoveryCodes' && step !== 'completed') {
         resetDialogState();
      }
    }
  }, [isOpen, step, resetDialogState]);

  const handleVerifyCode = async () => {
    if (!factorId || verificationCode.length !== 6) {
      setError("Veuillez entrer un code de vérification à 6 chiffres.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // First, challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      // Then, verify
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verificationCode,
      });
      if (verifyError) throw verifyError;
      
      // Successfully verified, now update our profile table
      const { error: rpcError } = await supabase.rpc('set_totp_enabled', { p_is_enabled: true });
      if (rpcError) {
          // Rollback or warn user? For now, just log and inform.
          console.error("Error setting TOTP enabled flag in profile:", rpcError);
          toast({ variant: "destructive", title: "Erreur partielle", description: "A2F activée mais échec de la mise à jour du statut du profil. Veuillez contacter le support."});
      }
      
      await refreshCurrentUserProfile();

      const typedVerifyData = verifyData as VerifyResponseData;
      // Supabase docs say recovery codes are returned on successful verification of the *first* MFA factor.
      // Let's assume they are in verifyData.totp.recovery_codes or verifyData.recovery_codes
      const codes = typedVerifyData.recovery_codes || (typedVerifyData.totp && typedVerifyData.totp.recovery_codes);

      if (codes && codes.length > 0) {
        setRecoveryCodes(codes);
        setStep('recoveryCodes');
      } else {
        // This case should ideally not happen if it's the first MFA factor.
        // If it does, it means Supabase didn't return recovery codes as expected.
        toast({ title: "A2F Activée!", description: "L'authentification à deux facteurs est maintenant activée." });
        setStep('completed'); 
        onSetupComplete(); // Notify parent
        // onOpenChange(false); // Close dialog if no recovery codes
      }

    } catch (err: any) {
      console.error("Error verifying TOTP code:", err);
      setError(err.message || "Code de vérification invalide ou expiré.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRecoveryCodesSaved = () => {
    toast({ title: "A2F Activée!", description: "L'authentification à deux facteurs est maintenant activée. Conservez vos codes de récupération en lieu sûr." });
    setStep('completed');
    onSetupComplete();
    onOpenChange(false); // Close dialog
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: "Copié!", description: "Clé secrète copiée dans le presse-papiers." }))
      .catch(() => toast({ variant: "destructive", title: "Erreur", description: "Impossible de copier la clé." }));
  };


  const renderContent = () => {
    if (isLoading && step === 'enroll') {
      return <div className="flex flex-col items-center justify-center h-48"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="mt-2">Initialisation de l'A2F...</p></div>;
    }

    if (step === 'verify' && qrCodeSvg && secretKey) {
      return (
        <>
          <DialogDescription className="mb-4">
            Scannez ce QR code avec votre application d'authentification (ex: Google Authenticator, Authy).
            Si vous ne pouvez pas scanner, entrez manuellement la clé secrète.
          </DialogDescription>
          <div className="flex flex-col items-center space-y-4">
            <div className="p-2 border rounded-md bg-white" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
            <div>
              <Label htmlFor="secret-key-display" className="text-sm font-medium">Ou entrez cette clé :</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="secret-key-display" type="text" readOnly value={secretKey} className="font-mono text-sm bg-gray-100 dark:bg-gray-700"/>
                <Button variant="outline" size="icon" onClick={() => handleCopyToClipboard(secretKey)} title="Copier la clé">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="w-full pt-4">
              <Label htmlFor="verification-code">Code de vérification</Label>
              <Input
                id="verification-code"
                type="text"
                placeholder="Entrez le code à 6 chiffres"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\s/g, ''))}
                maxLength={6}
                className="text-center tracking-[0.3em]"
              />
            </div>
          </div>
        </>
      );
    }
    
    if (step === 'recoveryCodes' && recoveryCodes.length > 0) {
      return (
        <>
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center"><AlertTriangle className="h-7 w-7 mr-2 text-yellow-500" />Conservez vos codes de récupération !</DialogTitle>
          </DialogHeader>
          <DialogDescription className="my-4 text-base">
            Ces codes de récupération sont votre unique moyen d'accéder à votre compte si vous perdez l'accès à votre application d'authentification.
            Conservez-les en lieu sûr et secret. Chaque code ne peut être utilisé qu'une seule fois.
          </DialogDescription>
          <div className="space-y-2 bg-gray-100 dark:bg-gray-800 p-4 rounded-md max-h-60 overflow-y-auto">
            {recoveryCodes.map((code, index) => (
              <div key={index} className="font-mono text-lg p-2 border border-dashed dark:border-gray-700 rounded flex justify-between items-center">
                <span>{code.slice(0,4)} - {code.slice(4)}</span>
                 <Button variant="ghost" size="sm" onClick={() => handleCopyToClipboard(code)} title="Copier le code">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
           <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={() => {
                const codesText = recoveryCodes.join("\n");
                navigator.clipboard.writeText(codesText)
                  .then(() => toast({ title: "Copié!", description: "Tous les codes de récupération copiés." }))
                  .catch(() => toast({ variant: "destructive", title: "Erreur", description: "Impossible de copier les codes." }));
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copier tous les codes
            </Button>
        </>
      );
    }

    if (error) {
      return <div className="text-red-500 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/30 rounded-md">{error}</div>;
    }
    
    return null; // Should not happen if logic is correct
  };

  const renderFooter = () => {
    if (step === 'verify') {
      return (
        <DialogFooter className="sm:justify-between">
           <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          </DialogClose>
          <Button type="button" onClick={handleVerifyCode} disabled={isLoading || verificationCode.length !== 6}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Vérifier et Activer
          </Button>
        </DialogFooter>
      );
    }
    if (step === 'recoveryCodes') {
       return (
        <DialogFooter>
          <Button type="button" onClick={handleRecoveryCodesSaved} className="bg-green-600 hover:bg-green-700 text-white">
            <KeyRound className="mr-2 h-4 w-4" /> J'ai sauvegardé mes codes, terminer
          </Button>
        </DialogFooter>
      );
    }
    // Default: just a close button if error or initial loading
    if (error && step !== 'recoveryCodes') {
        return (
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { resetDialogState(); onOpenChange(false); }}>Fermer</Button>
                </DialogClose>
            </DialogFooter>
        );
    }
    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        // If dialog is closed by user before completing recovery codes step, ensure state is reset.
        if (step !== 'completed') {
          resetDialogState();
        }
      }
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-md">
        {step !== 'recoveryCodes' && (
          <DialogHeader>
            <DialogTitle className="text-xl">Configurer l'Authentification à Deux Facteurs (A2F)</DialogTitle>
          </DialogHeader>
        )}
        <div className="py-4">
          {renderContent()}
        </div>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
};

export default TotpSetupDialog;
