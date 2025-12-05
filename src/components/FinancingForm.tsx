import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarIcon, Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";

const FinancingForm = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const [valorFinanciado, setValorFinanciado] = useState("");
  const [valorParcela, setValorParcela] = useState("");
  const [numeroParcelas, setNumeroParcelas] = useState("");
  const [taxaDiaria, setTaxaDiaria] = useState("0.06");
  const [taxaMensal, setTaxaMensal] = useState("1.75");
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState<Date>();
  const [dataContratacao, setDataContratacao] = useState<Date>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dataPrimeiraParcela) {
      toast({
        title: "Erro",
        description: "Selecione a data da primeira parcela",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Delete existing financing and parcelas
      const { data: existingFinanciamento } = await supabase
        .from("financiamento")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existingFinanciamento) {
        await supabase
          .from("parcelas")
          .delete()
          .eq("financiamento_id", existingFinanciamento.id);

        await supabase
          .from("financiamento")
          .delete()
          .eq("id", existingFinanciamento.id);
      }

      // Create new financing
      const { data: financiamento, error: financiamentoError } = await supabase
        .from("financiamento")
        .insert({
          valor_financiado: parseCurrencyInput(valorFinanciado),
          valor_parcela: parseCurrencyInput(valorParcela),
          numero_parcelas: parseInt(numeroParcelas),
          taxa_diaria: parseFloat(taxaDiaria) / 100,
          taxa_mensal: parseFloat(taxaMensal) / 100,
          data_primeira_parcela: format(dataPrimeiraParcela, "yyyy-MM-dd"),
          data_contratacao: dataContratacao
            ? format(dataContratacao, "yyyy-MM-dd")
            : null,
        })
        .select()
        .single();

      if (financiamentoError) throw financiamentoError;

      // Generate installments
      const parcelas = [];
      const valorParcelaNum = parseCurrencyInput(valorParcela);

      for (let i = 1; i <= parseInt(numeroParcelas); i++) {
        const dataVencimento = new Date(dataPrimeiraParcela);
        dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));

        parcelas.push({
          financiamento_id: financiamento.id,
          numero_parcela: i,
          data_vencimento: format(dataVencimento, "yyyy-MM-dd"),
          valor_parcela: valorParcelaNum,
        });
      }

      const { error: parcelasError } = await supabase
        .from("parcelas")
        .insert(parcelas);

      if (parcelasError) throw parcelasError;

      toast({
        title: "Sucesso!",
        description: `Financiamento cadastrado com ${numeroParcelas} parcelas`,
      });

      navigate("/parcelas");
    } catch (error: any) {
      console.error("Error:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao cadastrar financiamento",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="valorFinanciado">Valor Financiado (R$)</Label>
          <Input
            id="valorFinanciado"
            placeholder="0,00"
            value={valorFinanciado}
            onChange={(e) => setValorFinanciado(formatCurrencyInput(e.target.value))}
            required
            className="text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="valorParcela">Valor da Parcela (R$)</Label>
          <Input
            id="valorParcela"
            placeholder="0,00"
            value={valorParcela}
            onChange={(e) => setValorParcela(formatCurrencyInput(e.target.value))}
            required
            className="text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="numeroParcelas">Número de Parcelas</Label>
          <Input
            id="numeroParcelas"
            type="number"
            min="1"
            max="120"
            placeholder="48"
            value={numeroParcelas}
            onChange={(e) => setNumeroParcelas(e.target.value)}
            required
            className="text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label>Data da Primeira Parcela</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal text-lg h-11",
                  !dataPrimeiraParcela && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dataPrimeiraParcela
                  ? format(dataPrimeiraParcela, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : "Selecione a data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dataPrimeiraParcela}
                onSelect={setDataPrimeiraParcela}
                locale={ptBR}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxaDiaria">Taxa Diária (%)</Label>
          <Input
            id="taxaDiaria"
            type="number"
            step="0.0001"
            placeholder="0.06"
            value={taxaDiaria}
            onChange={(e) => setTaxaDiaria(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">Padrão: 0,06% ao dia</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxaMensal">Taxa Mensal (%)</Label>
          <Input
            id="taxaMensal"
            type="number"
            step="0.01"
            placeholder="1.75"
            value={taxaMensal}
            onChange={(e) => setTaxaMensal(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">Padrão: 1,75% ao mês</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Data da Contratação (opcional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !dataContratacao && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dataContratacao
                  ? format(dataContratacao, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : "Selecione a data (opcional)"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dataContratacao}
                onSelect={setDataContratacao}
                locale={ptBR}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        type="submit"
        variant="hero"
        size="lg"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Cadastrando...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            Cadastrar Financiamento
          </>
        )}
      </Button>
    </form>
  );
};

export default FinancingForm;
