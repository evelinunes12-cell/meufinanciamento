import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading, profile, isProfileLoading } = useAuth();

  useEffect(() => {
    if (user && profile && profile.is_active === false) {
      toast({
        title: "Conta desativada",
        description: "Sua conta foi desativada pelo administrador.",
        variant: "destructive",
      });
      supabase.auth.signOut();
    }
  }, [user, profile]);

  if (isLoading || (user && isProfileLoading && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (profile && profile.is_active === false) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
