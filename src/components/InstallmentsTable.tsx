import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Calendar, Calculator, Loader2, AlertTriangle, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calcularAntecipacao, formatCurrency, formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";
import { garantirCategoriaContrato } from "@/lib/contratoCategoria";
import { useAuth } from "@/hooks/useAuth";

interface Parcela {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean;
  data_pagamento: string | null;
  antecipada: boolean;
  valor_pago: number | null;
  amortizacao: number | null;
  juros: number | null;
  economia: number | null;
  dias_antecedencia: number | null;
}

interface ContratoInfo {
  id: string;
  nome: string;
  tipo: "financiamento" | "emprestimo";
  categoria_id?: string | null;
}

interface ContaOpcao {
  id: string;
  nome_conta: string;
  tipo: string;
}

interface InstallmentsTableProps {
  parcelas: Parcela[];
  taxaDiaria: number;
  onUpdate: () => void;
  contrato?: ContratoInfo;
}

const InstallmentsTable = ({ parcelas, taxaDiaria, onUpdate, contrato }: InstallmentsTableProps) => {
  const { user } = useAuth();
  const [selectedParcela, setSelectedParcela] = useState<Parcela | null>(null);
  const [dataPagamento, setDataPagamento] = useState<Date>();
  const [valorPagoManual, setValorPagoManual] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculoRealizado, setCalculoRealizado] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Parcela | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [contas, setContas] = useState<ContaOpcao[]>([]);
  const [contaOrigemId, setContaOrigemId] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("contas")
      .select("id, nome_conta, tipo")
      .eq("user_id", user.id)
      .neq("tipo", "cartao_credito")
      .order("nome_conta", { ascending: true })
      .then(({ data }) => setContas((data || []) as ContaOpcao[]));
  }, [user]);


  const handleCancelarPagamento = async () => {
    if (!cancelTarget) return;
    setIsCanceling(true);
    try {
      const { error } = await supabase
        .from("parcelas")
        .update({
          pago: false,
          data_pagamento: null,
          antecipada: false,
          valor_pago: null,
          economia: null,
          dias_antecedencia: null,
          juros: null,
          amortizacao: null,
        })
        .eq("id", cancelTarget.id);

      if (error) throw error;

      // Espelho: remover a transação de despesa correspondente (com fallbacks)
      if (contrato && user) {
        try {
          const numero = cancelTarget.numero_parcela;
          const nome = contrato.nome ?? "";
          const descricaoEsperada = `Parcela ${numero} - ${nome}`;
          const valorParcela = Number(cancelTarget.valor_parcela);
          const dataPagto = cancelTarget.data_pagamento;

          // Buscar candidatos por user + tipo despesa
          let query = supabase
            .from("transacoes")
            .select("id, descricao, valor, categoria_id, data_pagamento, data")
            .eq("user_id", user.id)
            .eq("tipo", "despesa");

          // Restringe pela categoria do contrato quando disponível (mais preciso)
          if (contrato.categoria_id) {
            query = query.eq("categoria_id", contrato.categoria_id);
          }

          const { data: candidatos, error: selErr } = await query;
          if (selErr) throw selErr;

          const lista = candidatos ?? [];
          // 1) Match exato pela descrição
          let alvo = lista.find((t) => t.descricao === descricaoEsperada);

          // 2) Fallback: descrição contém "Parcela N" e parte do nome do contrato
          if (!alvo) {
            const nomeFrag = nome.trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase();
            alvo = lista.find((t) => {
              const d = (t.descricao ?? "").toLowerCase();
              return d.includes(`parcela ${numero}`) && (nomeFrag ? d.includes(nomeFrag) : true);
            });
          }

          // 3) Fallback: mesma categoria + mesma data de pagamento + mesmo valor
          if (!alvo && dataPagto) {
            alvo = lista.find(
              (t) =>
                (t.data_pagamento === dataPagto || t.data === dataPagto) &&
                Math.abs(Number(t.valor) - valorParcela) < 0.01
            );
          }

          // 4) Último fallback: qualquer candidato com mesmo valor exato
          if (!alvo) {
            alvo = lista.find((t) => Math.abs(Number(t.valor) - valorParcela) < 0.01);
          }

          if (alvo) {
            const { error: delErr } = await supabase
              .from("transacoes")
              .delete()
              .eq("id", alvo.id)
              .eq("user_id", user.id);
            if (delErr) throw delErr;
          }
        } catch (delErr: any) {
          toast({
            title: "Pagamento cancelado, mas...",
            description: `Não foi possível remover a despesa do fluxo de caixa: ${delErr.message}`,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Pagamento cancelado",
        description: `Parcela ${cancelTarget.numero_parcela} voltou para pendente.`,
      });
      setCancelTarget(null);
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleOpenDialog = (parcela: Parcela) => {
    setSelectedParcela(parcela);
    setDataPagamento(new Date());
    setValorPagoManual("");
    setCalculoRealizado(false);
    setContaOrigemId("");
    setDialogOpen(true);
  };

  const handleCalcular = () => {
    if (!selectedParcela || !dataPagamento) return;
    setCalculoRealizado(true);
  };

  const calculo = selectedParcela && dataPagamento && calculoRealizado
    ? calcularAntecipacao(
        selectedParcela.valor_parcela,
        selectedParcela.data_vencimento,
        dataPagamento,
        taxaDiaria
      )
    : null;

  const handleConfirmarPagamento = async () => {
    if (!selectedParcela || !dataPagamento || !calculo) return;

    if (!contaOrigemId) {
      toast({
        title: "Conta de origem obrigatória",
        description: "Selecione a conta de onde o pagamento foi debitado.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const valorFinal = valorPagoManual
        ? parseCurrencyInput(valorPagoManual)
        : calculo.valorPago;

      const economiaFinal = selectedParcela.valor_parcela - valorFinal;
      const dataPagamentoStr = format(dataPagamento, "yyyy-MM-dd");

      // Self-healing: garantir categoria_id no contrato (legado)
      let categoriaId = contrato?.categoria_id || null;
      if (contrato && user && !categoriaId) {
        try {
          categoriaId = await garantirCategoriaContrato(contrato.nome, contrato.tipo, user.id);
          await supabase
            .from("financiamento")
            .update({ categoria_id: categoriaId })
            .eq("id", contrato.id);
        } catch (err) {
          if (import.meta.env.DEV) console.error("Falha ao garantir categoria:", err);
        }
      }

      // 1) Atualiza parcela
      const { error } = await supabase
        .from("parcelas")
        .update({
          pago: true,
          data_pagamento: dataPagamentoStr,
          antecipada: calculo.isAntecipada,
          valor_pago: valorFinal,
          economia: Math.max(0, economiaFinal),
          dias_antecedencia: calculo.diasAntecedencia,
          juros: calculo.juros,
          amortizacao: calculo.amortizacao,
        })
        .eq("id", selectedParcela.id);

      if (error) throw error;

      // 2) Espelho no fluxo de caixa (transação de despesa)
      if (contrato && user) {
        try {
          const { error: txErr } = await supabase.from("transacoes").insert({
            user_id: user.id,
            conta_id: contaOrigemId,
            categoria_id: categoriaId,
            valor: valorFinal,
            tipo: "despesa",
            forma_pagamento: "debito",
            data: dataPagamentoStr,
            data_pagamento: dataPagamentoStr,
            data_execucao_pagamento: dataPagamentoStr,
            is_pago_executado: true,
            descricao: `Parcela ${selectedParcela.numero_parcela} - ${contrato.nome}`,
          });
          if (txErr) throw txErr;
        } catch (txErr: any) {
          toast({
            title: "Pagamento registrado, mas...",
            description: `Não foi possível lançar a despesa no fluxo de caixa: ${txErr.message}`,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Pagamento registrado!",
        description: calculo.isAntecipada
          ? `Economia de ${formatCurrency(economiaFinal)} com ${calculo.diasAntecedencia} dias de antecedência`
          : calculo.isAtrasada
          ? "Pagamento registrado (atrasado)"
          : "Pagamento registrado no vencimento",
      });

      setDialogOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {parcelas.map((parcela) => (
            <div
              key={parcela.id}
              className={cn(
                "p-3 space-y-2",
                parcela.pago && parcela.antecipada && "bg-success/5",
                parcela.pago && !parcela.antecipada && "bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-foreground">
                    #{parcela.numero_parcela}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(parcela.data_vencimento), "dd/MM/yyyy")}
                  </span>
                </div>
                {parcela.pago ? (
                  <Badge
                    variant="default"
                    className={cn(
                      "text-[10px]",
                      parcela.antecipada
                        ? "bg-success text-success-foreground"
                        : "bg-primary text-primary-foreground"
                    )}
                  >
                    <Check className="mr-0.5 h-3 w-3" />
                    {parcela.antecipada ? "Antecipada" : "Paga"}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(parcela.valor_parcela)}
                </span>
              </div>

              {parcela.pago && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pago</span>
                    <span className="font-medium">
                      {formatCurrency(parcela.valor_pago || 0)}
                      {parcela.data_pagamento && (
                        <span className="text-muted-foreground ml-1">
                          ({format(parseISO(parcela.data_pagamento), "dd/MM")})
                        </span>
                      )}
                    </span>
                  </div>
                  {parcela.economia && parcela.economia > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Economia</span>
                      <span className="text-success font-semibold">
                        {formatCurrency(parcela.economia)}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="pt-1">
                {parcela.pago ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                    onClick={() => setCancelTarget(parcela)}
                  >
                    <Undo2 className="mr-1 h-4 w-4" />
                    Cancelar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8"
                    onClick={() => handleOpenDialog(parcela)}
                  >
                    <Calculator className="mr-1 h-4 w-4" />
                    Pagar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">Nº</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor Original</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Valor Pago</TableHead>
                <TableHead>Data Pagamento</TableHead>
                <TableHead className="text-right">Economia</TableHead>
                <TableHead className="text-right">Amortização</TableHead>
                <TableHead className="text-center">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((parcela, index) => (
                <TableRow
                  key={parcela.id}
                  className={cn(
                    "transition-colors",
                    parcela.pago && parcela.antecipada && "bg-success/5",
                    parcela.pago && !parcela.antecipada && "bg-muted/30"
                  )}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <TableCell className="text-center font-medium">
                    {parcela.numero_parcela}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(parcela.data_vencimento), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(parcela.valor_parcela)}
                  </TableCell>
                  <TableCell className="text-center">
                    {parcela.pago ? (
                      <Badge
                        variant="default"
                        className={cn(
                          parcela.antecipada
                            ? "bg-success text-success-foreground"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        {parcela.antecipada ? "Antecipada" : "Paga"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {parcela.pago ? formatCurrency(parcela.valor_pago) : "-"}
                  </TableCell>
                  <TableCell>
                    {parcela.pago && parcela.data_pagamento
                      ? format(parseISO(parcela.data_pagamento), "dd/MM/yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {parcela.economia && parcela.economia > 0 ? (
                      <span className="text-success font-semibold">
                        {formatCurrency(parcela.economia)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {parcela.pago ? formatCurrency(parcela.amortizacao) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {parcela.pago ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCancelTarget(parcela)}
                      >
                        <Undo2 className="mr-1 h-4 w-4" />
                        Cancelar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(parcela)}
                      >
                        <Calculator className="mr-1 h-4 w-4" />
                        Pagar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Registrar Pagamento - Parcela {selectedParcela?.numero_parcela}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Info da Parcela */}
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Valor Original:</span>
                  <p className="font-semibold text-lg">
                    {formatCurrency(selectedParcela?.valor_parcela || 0)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vencimento:</span>
                  <p className="font-semibold">
                    {selectedParcela &&
                      format(parseISO(selectedParcela.data_vencimento), "dd/MM/yyyy")}
                  </p>
                </div>
              </div>
            </div>

            {/* Data do Pagamento */}
            <div className="space-y-2">
              <Label className="text-base">Data do Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-12",
                      !dataPagamento && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dataPagamento
                      ? format(dataPagamento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataPagamento}
                    onSelect={(date) => {
                      setDataPagamento(date);
                      setCalculoRealizado(false);
                    }}
                    locale={ptBR}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Conta de Origem (obrigatório p/ lançar no fluxo de caixa) */}
            <div className="space-y-2">
              <Label className="text-base">
                Conta de Origem <span className="text-destructive">*</span>
              </Label>
              <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione a conta debitada" />
                </SelectTrigger>
                <SelectContent>
                  {contas.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhuma conta bancária cadastrada
                    </div>
                  ) : (
                    contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome_conta}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Será criada uma despesa automática nesta conta no fluxo de caixa.
              </p>
            </div>

            {/* Botão Calcular */}
            {!calculoRealizado && (
              <Button
                onClick={handleCalcular}
                variant="secondary"
                className="w-full h-12"
                disabled={!dataPagamento}
              >
                <Calculator className="mr-2 h-5 w-5" />
                Calcular Valor
              </Button>
            )}

            {/* Resultado do Cálculo */}
            {calculo && calculoRealizado && (
              <div className="space-y-4 animate-fade-in">
                {calculo.isAtrasada && (
                  <div className="rounded-lg bg-destructive/10 p-3 flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Pagamento após o vencimento - sem desconto
                    </span>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <h4 className="font-semibold text-foreground">Resultado do Cálculo</h4>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Dias de Antecedência:</span>
                      <p className="font-semibold text-lg">
                        {calculo.diasAntecedencia} dias
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Taxa Diária:</span>
                      <p className="font-semibold">
                        {(taxaDiaria * 100).toFixed(4)}%
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Original:</span>
                      <span>{formatCurrency(calculo.valorOriginal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor com Desconto:</span>
                      <span className="font-semibold text-success text-lg">
                        {formatCurrency(calculo.valorPago)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Economia:</span>
                      <span className="font-bold text-success">
                        {formatCurrency(calculo.economia)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Juros (estimado):</span>
                      <span>{formatCurrency(calculo.juros)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amortização:</span>
                      <span className="font-medium">{formatCurrency(calculo.amortizacao)}</span>
                    </div>
                  </div>
                </div>

                {/* Valor Manual (opcional) */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Valor Pago (opcional - deixe vazio para usar o calculado)
                  </Label>
                  <Input
                    placeholder="0,00"
                    value={valorPagoManual}
                    onChange={(e) => setValorPagoManual(formatCurrencyInput(e.target.value))}
                    className="h-11"
                  />
                </div>

                {/* Botão Confirmar */}
                <Button
                  onClick={handleConfirmarPagamento}
                  className="w-full h-12"
                  variant="hero"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-5 w-5" />
                      Confirmar Pagamento
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pagamento da parcela {cancelTarget?.numero_parcela}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação reverte o pagamento e remove os dados de antecipação, economia e amortização registrados. A parcela voltará para o status pendente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCanceling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelarPagamento}
              disabled={isCanceling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCanceling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                <>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Cancelar pagamento
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default InstallmentsTable;
