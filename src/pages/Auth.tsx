import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, Lock, LogIn, UserPlus, Eye, EyeOff, User as UserIcon, Phone, TrendingUp, ShieldCheck, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { lovable } from "@/integrations/lovable/index";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

const authSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

const signupSchema = authSchema.extend({
  nome: z.string().trim().min(2, "Informe seu nome").max(100, "Nome muito longo"),
  celular: z
    .string()
    .trim()
    .min(10, "Celular inválido")
    .max(20, "Celular inválido")
    .regex(/^[0-9()+\-\s]+$/, "Use apenas números e símbolos válidos"),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signIn, signUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; nome?: string; celular?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/financas");
    }
  }, [user, authLoading, navigate]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast({ title: "Erro", description: "Erro ao entrar com Google", variant: "destructive" });
      }
      if (result.redirected) return;
      navigate("/financas");
    } catch {
      toast({ title: "Erro", description: "Erro ao entrar com Google", variant: "destructive" });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast({ title: "Erro", description: "Informe seu email", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada para redefinir a senha." });
      setShowForgotPassword(false);
    }
  };

  const validateLogin = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        if (err.path[0] === "password") fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const validateSignup = () => {
    const result = signupSchema.safeParse({ email, password, nome, celular });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        const k = err.path[0] as keyof typeof errors;
        if (k) fieldErrors[k] = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLogin()) return;
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Bem-vindo!", description: "Login realizado com sucesso" });
      navigate("/financas");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignup()) return;
    setIsLoading(true);
    const { error } = await signUp(email, password, { nome: nome.trim(), celular: celular.trim() });
    setIsLoading(false);
    if (error) {
      if (error.message.includes("already registered")) {
        toast({ title: "Usuário já existe", description: "Este email já está cadastrado. Tente fazer login.", variant: "destructive" });
      } else {
        toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Conta criada!", description: "Sua conta foi criada com sucesso." });
      navigate("/financas");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* ===== Brand panel (left) ===== */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-[hsl(40_45%_92%)]"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, hsl(160 70% 18%) 0%, transparent 55%), radial-gradient(circle at 80% 80%, hsl(160 60% 12%) 0%, transparent 50%), linear-gradient(135deg, hsl(160 75% 10%) 0%, hsl(160 70% 16%) 100%)",
        }}
      >
        {/* gold orbs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[hsl(43_55%_55%)]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[hsl(160_60%_35%)]/20 blur-3xl" />

        {/* Logo + name */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(43_55%_55%)]/15 ring-1 ring-[hsl(43_55%_55%)]/40 backdrop-blur">
            <span className="font-extrabold text-[hsl(43_70%_70%)] text-2xl leading-none">+</span>
          </div>
          <div className="leading-tight">
            <p className="text-xl font-bold tracking-tight text-[hsl(40_50%_95%)]">Soma</p>
            <p className="text-xs uppercase tracking-[0.18em] text-[hsl(43_50%_70%)]">Assistente Financeiro</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 max-w-md space-y-6">
          <h1 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            Sua vida financeira,{" "}
            <span className="text-[hsl(43_65%_65%)]">somada</span> em um só lugar.
          </h1>
          <p className="text-base text-[hsl(40_25%_82%)]/90 leading-relaxed">
            Controle gastos, gerencie faturas de cartão, acompanhe financiamentos e projete seu fluxo de caixa com precisão contábil.
          </p>

          <ul className="space-y-3 pt-2">
            {[
              { Icon: PiggyBank, text: "Orçamento por categoria com alertas" },
              { Icon: TrendingUp, text: "Projeção de caixa para 3, 6 e 12 meses" },
              { Icon: ShieldCheck, text: "Seus dados criptografados e privados" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-[hsl(40_30%_88%)]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(43_55%_55%)]/15 ring-1 ring-[hsl(43_55%_55%)]/30">
                  <Icon className="h-4 w-4 text-[hsl(43_65%_70%)]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-[hsl(40_20%_70%)]/70">
          © {new Date().getFullYear()} Soma · Assistente Financeiro
        </div>
      </aside>

      {/* ===== Form panel (right) ===== */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30">
              <span className="font-extrabold text-primary text-2xl leading-none">+</span>
            </div>
            <p className="mt-3 text-lg font-bold text-foreground">Soma</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Assistente Financeiro</p>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse sua conta ou crie uma nova em poucos segundos.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline font-medium"
                    onClick={() => { setShowForgotPassword(true); setForgotEmail(email); }}
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-nome">Nome completo</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-nome"
                      type="text"
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {errors.nome && <p className="text-sm text-destructive">{errors.nome}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-celular">Celular</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-celular"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {errors.celular && <p className="text-sm text-destructive">{errors.celular}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground tracking-wider">ou continue com</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full mt-4"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              Entrar com Google
            </Button>
          </div>
        </div>
      </main>

      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Informe seu email para receber o link de redefinição de senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar link
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
