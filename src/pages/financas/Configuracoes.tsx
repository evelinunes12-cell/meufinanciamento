import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LimparDadosModal from "@/components/LimparDadosModal";
import { User, Shield, Palette, LogOut, Mail, Sun, Moon, Monitor, Trash2, AlertCircle, Phone, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(100, "Nome muito longo"),
  celular: z
    .string()
    .trim()
    .min(10, "Celular inválido")
    .max(20, "Celular inválido")
    .regex(/^[0-9()+\-\s]+$/, "Use apenas números e símbolos válidos"),
});

const Configuracoes = () => {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLimparDados, setShowLimparDados] = useState(false);
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{ nome?: string; celular?: string }>({});

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setCelular(profile.celular ?? "");
    }
  }, [profile]);

  const profileIncomplete = !profile?.nome?.trim() || !profile?.celular?.trim();

  const handleSaveProfile = async () => {
    const parsed = profileSchema.safeParse({ nome, celular });
    if (!parsed.success) {
      const errs: { nome?: string; celular?: string } = {};
      parsed.error.errors.forEach((e) => {
        const k = e.path[0] as "nome" | "celular";
        if (k) errs[k] = e.message;
      });
      setProfileErrors(errs);
      return;
    }
    setProfileErrors({});
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user!.id, nome: parsed.data.nome, celular: parsed.data.celular },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      toast({ title: "Perfil atualizado", description: "Seus dados foram salvos com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar perfil",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) {
      toast({
        title: "Erro",
        description: "E-mail do usuário não encontrado",
        variant: "destructive",
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) throw error;

      toast({
        title: "E-mail enviado",
        description: "Verifique sua caixa de entrada para redefinir sua senha",
      });
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao enviar e-mail de redefinição",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Erro",
        description: "Erro ao sair da conta",
        variant: "destructive",
      });
      setIsLoggingOut(false);
    }
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie suas preferências e conta</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Meu Perfil */}
          <Card id="perfil" className={`shadow-card md:col-span-2 ${profileIncomplete ? "border-warning/50" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Meu Perfil</CardTitle>
              </div>
              <CardDescription>
                Informações da sua conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileIncomplete && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-foreground">
                    Complete seus dados pessoais (nome e celular) para uma melhor experiência no sistema.
                  </p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">E-mail</Label>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 h-10">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{user?.email || "—"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perfil-nome" className="text-xs text-muted-foreground">Nome completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="perfil-nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome"
                      className="pl-10"
                    />
                  </div>
                  {profileErrors.nome && (
                    <p className="text-xs text-destructive">{profileErrors.nome}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perfil-celular" className="text-xs text-muted-foreground">Celular *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="perfil-celular"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="pl-10"
                    />
                  </div>
                  {profileErrors.celular && (
                    <p className="text-xs text-destructive">{profileErrors.celular}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                  {isSavingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar perfil
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Segurança */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Segurança</CardTitle>
              </div>
              <CardDescription>Gerencie a segurança da sua conta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Senha</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Enviaremos um link de redefinição para seu e-mail
                </p>
                <Button
                  variant="outline"
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                  className="w-full sm:w-auto"
                >
                  {isResettingPassword ? "Enviando..." : "Redefinir Senha"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Aparência */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Aparência</CardTitle>
              </div>
              <CardDescription>Personalize a interface do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tema</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-full">
                    <div className="flex items-center gap-2">
                      {getThemeIcon()}
                      <SelectValue placeholder="Selecione o tema" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4" />
                        Claro
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Escuro
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        Sistema
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Limpar Dados */}
          <Card className="shadow-card border-destructive/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <CardTitle className="text-lg">Limpar Dados</CardTitle>
              </div>
              <CardDescription>Remova transações e registros financeiros</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Limpeza de Finanças</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Apague transações, faturas e orçamentos. Não afeta o módulo de Financiamento.
                </p>
                <Button
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowLimparDados(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Dados
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conta - Full Width */}
        <Card className="shadow-card border-destructive/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg">Conta</CardTitle>
            </div>
            <CardDescription>Gerenciamento da sessão</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Sair da sua conta atual. Você precisará fazer login novamente.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="w-full sm:w-auto"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {isLoggingOut ? "Saindo..." : "Sair da Conta"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Modal de Limpeza */}
        <LimparDadosModal 
          open={showLimparDados} 
          onOpenChange={setShowLimparDados} 
        />
      </div>
    </AppLayout>
  );
};

export default Configuracoes;