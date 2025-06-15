import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast'; // Corrected import path
import { Loader2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const usernameFormSchema = z.object({
  username: z.string()
    .min(3, "Le nom d'utilisateur doit faire au moins 3 caractères.")
    .max(30, "Le nom d'utilisateur ne peut pas dépasser 30 caractères.")
    .regex(/^[a-zA-Z0-9_.]+$/, "Nom d'utilisateur invalide. Utilisez uniquement des lettres (a-z, A-Z), des chiffres (0-9), des underscores (_) ou des points (.)."),
});
type UsernameFormValues = z.infer<typeof usernameFormSchema>;

interface UsernameEditFormProps {
  currentUsername: string;
  onSaveSuccess: (newUsername: string) => void;
  onCancel: () => void;
}

const UsernameEditForm: React.FC<UsernameEditFormProps> = ({ currentUsername, onSaveSuccess, onCancel }) => {
  const { toast } = useToast();
  const { refreshCurrentUserProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UsernameFormValues>({
    resolver: zodResolver(usernameFormSchema),
    defaultValues: { username: currentUsername },
  });

  const onSubmit = async (values: UsernameFormValues) => {
    if (values.username === currentUsername) {
      toast({ title: "Information", description: "Le nom d'utilisateur n'a pas changé.", duration: 3000 });
      onCancel();
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('update_username', { new_username: values.username });

      if (error) {
        console.error("Error updating username:", error);
        toast({
          variant: "destructive",
          title: "Erreur de mise à jour",
          description: error.message || "Échec de la mise à jour du nom d'utilisateur.",
        });
      } else {
        toast({ title: "Succès", description: "Votre nom d'utilisateur a été mis à jour." });
        await refreshCurrentUserProfile(); // Refresh context to get new profile data
        onSaveSuccess(values.username); // Notify parent component
      }
    } catch (e: any) {
      console.error("Exception updating username:", e);
      toast({
        variant: "destructive",
        title: "Erreur Inattendue",
        description: "Une erreur inattendue est survenue lors de la mise à jour.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2 py-4 px-1 border-t dark:border-gray-700">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="username-input" className="text-gray-700 dark:text-gray-300">Nouveau nom d'utilisateur</FormLabel>
              <FormControl>
                <Input id="username-input" placeholder="Votre nouveau nom d'utilisateur" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UsernameEditForm;
