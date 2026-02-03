import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LimparDadosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LimpezaTipo = "mes" | "todos";

interface DeletionResult {
  transacoes: number;
  faturas: number;
  orcamentos: number;
}

const LimparDadosModal = ({ open, onOpenChange }: LimparDadosModalProps) => {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<LimpezaTipo>("mes");
  const [mesSelecionado, setMesSelecionado] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Generate last 12 months for selection
  const mesesDisponiveis = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy", { locale: ptBR }),
    };
  });

  const getConfirmationText = () => {
    if (tipo === "todos") return "APAGAR TUDO";
    return "APAGAR";
  };

  const isConfirmed = confirmText === getConfirmationText();

  const handleLimpar = async () => {
    if (!user?.id || !isConfirmed) return;

    setIsDeleting(true);

    try {
      const result: DeletionResult = { transacoes: 0, faturas: 0, orcamentos: 0 };

      if (tipo === "todos") {
        // Delete all transactions (not affecting financiamento)
        const { data: transacoes, error: transError } = await supabase
          .from("transacoes")
          .delete()
          .eq("user_id", user.id)
          .select("id");
        
        if (transError) throw transError;
        result.transacoes = transacoes?.length || 0;

        // Delete all faturas_cartao
        const { data: faturas, error: faturasError } = await supabase
          .from("faturas_cartao")
          .delete()
          .eq("user_id", user.id)
          .select("id");
        
        if (faturasError) throw faturasError;
        result.faturas = faturas?.length || 0;

        // Delete all orcamentos
        const { data: orcamentos, error: orcError } = await supabase
          .from("orcamentos")
          .delete()
          .eq("user_id", user.id)
          .select("id");
        
        if (orcError) throw orcError;
        result.orcamentos = orcamentos?.length || 0;

      } else if (tipo === "mes" && mesSelecionado) {
        // Parse selected month
        const [year, month] = mesSelecionado.split("-").map(Number);
        const startDate = `${mesSelecionado}-01`;
        const endDate = `${mesSelecionado}-31`;

        // Delete transactions from selected month
        const { data: transacoes, error: transError } = await supabase
          .from("transacoes")
          .delete()
          .eq("user_id", user.id)
          .gte("data", startDate)
          .lte("data", endDate)
          .select("id");
        
        if (transError) throw transError;
        result.transacoes = transacoes?.length || 0;

        // Delete faturas_cartao from selected month
        const { data: faturas, error: faturasError } = await supabase
          .from("faturas_cartao")
          .delete()
          .eq("user_id", user.id)
          .gte("mes_referencia", startDate)
          .lte("mes_referencia", endDate)
          .select("id");
        
        if (faturasError) throw faturasError;
        result.faturas = faturas?.length || 0;

        // Delete orcamentos from selected month
        const { data: orcamentos, error: orcError } = await supabase
          .from("orcamentos")
          .delete()
          .eq("user_id", user.id)
          .gte("mes_referencia", startDate)
          .lte("mes_referencia", endDate)
          .select("id");
        
        if (orcError) throw orcError;
        result.orcamentos = orcamentos?.length || 0;
      }

      const total = result.transacoes + result.faturas + result.orcamentos;
      
      toast({
        title: "Dados removidos",
        description: `${result.transacoes} transação(ões), ${result.faturas} fatura(s) e ${result.orcamentos} orçamento(s) foram excluídos.`,
      });

      // Reset and close
      setConfirmText("");
      setTipo("mes");
      setMesSelecionado("");
      onOpenChange(false);

    } catch (error) {
      console.error("Erro ao limpar dados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível limpar os dados. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmText("");
      setTipo("mes");
      setMesSelecionado("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Limpar Dados de Finanças
          </DialogTitle>
          <DialogDescription>
            Esta ação removerá transações, faturas e orçamentos. 
            <strong> Não afeta o módulo de Financiamento.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tipo de Limpeza */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">O que deseja limpar?</Label>
            <RadioGroup 
              value={tipo} 
              onValueChange={(v) => setTipo(v as LimpezaTipo)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="mes" id="mes" />
                <Label htmlFor="mes" className="cursor-pointer flex-1">
                  <span className="font-medium">Mês específico</span>
                  <p className="text-xs text-muted-foreground">
                    Remove apenas os registros do mês selecionado
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-destructive/30 hover:bg-destructive/5 cursor-pointer">
                <RadioGroupItem value="todos" id="todos" />
                <Label htmlFor="todos" className="cursor-pointer flex-1">
                  <span className="font-medium text-destructive">Todos os registros</span>
                  <p className="text-xs text-muted-foreground">
                    Remove TODAS as transações, faturas e orçamentos
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seleção de Mês */}
          {tipo === "mes" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecione o mês</Label>
              <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um mês..." />
                </SelectTrigger>
                <SelectContent>
                  {mesesDisponiveis.map((mes) => (
                    <SelectItem key={mes.value} value={mes.value}>
                      {mes.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Confirmação */}
          <div className="space-y-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <Label className="text-sm font-medium text-destructive">
              Confirme digitando: <code className="bg-destructive/20 px-2 py-0.5 rounded">{getConfirmationText()}</code>
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Digite para confirmar..."
              className="border-destructive/30 focus-visible:ring-destructive"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleLimpar}
            disabled={!isConfirmed || isDeleting || (tipo === "mes" && !mesSelecionado)}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removendo...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Dados
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LimparDadosModal;
