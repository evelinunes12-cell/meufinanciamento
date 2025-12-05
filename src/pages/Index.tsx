import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, ChevronRight, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import FinancingForm from "@/components/FinancingForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [hasFinancing, setHasFinancing] = useState<boolean | null>(null);

  useEffect(() => {
    const checkFinancing = async () => {
      const { data } = await supabase
        .from("financiamento")
        .select("id")
        .limit(1);

      setHasFinancing(data && data.length > 0);
    };

    checkFinancing();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {/* Hero Section */}
          <div className="mb-8 text-center animate-fade-in">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-lg">
              <Car className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">
              Meu Financiamento
            </h1>
            <p className="text-muted-foreground">
              Controle seu financiamento de veículo e economize com antecipações
            </p>
          </div>

          {/* Existing Financing Notice */}
          {hasFinancing && (
            <Card className="mb-6 border-primary/20 bg-primary/5 animate-slide-up">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    Você já tem um financiamento cadastrado
                  </span>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/parcelas")}
                >
                  Ver Parcelas
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Form Card */}
          <Card className="shadow-soft border-border/50 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <CardHeader>
              <CardTitle>
                {hasFinancing ? "Atualizar Financiamento" : "Cadastrar Financiamento"}
              </CardTitle>
              <CardDescription>
                {hasFinancing
                  ? "Preencha os dados para substituir o financiamento atual"
                  : "Preencha os dados do seu financiamento para começar"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FinancingForm />
            </CardContent>
          </Card>

          {/* Info Cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="rounded-xl border border-border/50 bg-card p-4 text-center shadow-card">
              <div className="mb-2 text-2xl font-bold text-primary">💰</div>
              <h3 className="font-medium">Economize</h3>
              <p className="text-sm text-muted-foreground">
                Antecipe parcelas e pague menos juros
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4 text-center shadow-card">
              <div className="mb-2 text-2xl font-bold text-primary">📊</div>
              <h3 className="font-medium">Acompanhe</h3>
              <p className="text-sm text-muted-foreground">
                Visualize todas as suas parcelas
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4 text-center shadow-card">
              <div className="mb-2 text-2xl font-bold text-primary">🎯</div>
              <h3 className="font-medium">Controle</h3>
              <p className="text-sm text-muted-foreground">
                Tenha controle total do seu financiamento
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
