import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calculator, CalendarIcon, TrendingDown, Wallet, PiggyBank, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  calcularAntecipacao,
  formatCurrency,
  formatCurrencyInput,
  parseCurrencyInput,
} from "@/lib/calculations";

interface Parcela {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean;
  amortizacao: number | null;
}

interface FinancingSimulatorProps {
  parcelas: Parcela[];
  taxaDiaria: number;
  valorFinanciado: number;
  contratoNome: string;
}

type Direcao = "fim" | "inicio";

const FinancingSimulator = ({
  parcelas,
  taxaDiaria,
  valorFinanciado,
  contratoNome,
}: FinancingSimulatorProps) => {
  const parcelasAbertas = useMemo(
    () => parcelas.filter((p) => !p.pago).sort((a, b) => a.numero_parcela - b.numero_parcela),
    [parcelas]
  );

  const saldoDevedorAtual = useMemo(() => {
    const totalAmortizado = parcelas
      .filter((p) => p.pago)
      .reduce((sum, p) => sum + (p.amortizacao || 0), 0);
    return Math.max(0, valorFinanciado - totalAmortizado);
  }, [parcelas, valorFinanciado]);

  const [dataPagamento, setDataPagamento] = useState<Date>(new Date());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [valorAlvo, setValorAlvo] = useState<string>("");
  const [direcao, setDirecao] = useState<Direcao>("fim");

  // Cálculos para cada parcela em aberto
  const parcelasCalculadas = useMemo(() => {
    return parcelasAbertas.map((p) => {
      const calc = calcularAntecipacao(
        Number(p.valor_parcela),
        p.data_vencimento,
        dataPagamento,
        taxaDiaria
      );
      return { parcela: p, calc };
    });
  }, [parcelasAbertas, dataPagamento, taxaDiaria]);

  // Seleção manual
  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodas = () => setSelectedIds(new Set(parcelasAbertas.map((p) => p.id)));
  const limparSelecao = () => setSelectedIds(new Set());
  const selecionarUltimasN = (n: number) => {
    const ids = parcelasAbertas.slice(-n).map((p) => p.id);
    setSelectedIds(new Set(ids));
  };
  const selecionarPrimeirasN = (n: number) => {
    const ids = parcelasAbertas.slice(0, n).map((p) => p.id);
    setSelectedIds(new Set(ids));
  };

  const resultadoManual = useMemo(() => {
    const selecionadas = parcelasCalculadas.filter((x) => selectedIds.has(x.parcela.id));
    const totalOriginal = selecionadas.reduce((s, x) => s + x.calc.valorOriginal, 0);
    const totalPagar = selecionadas.reduce((s, x) => s + x.calc.valorPago, 0);
    const economia = selecionadas.reduce((s, x) => s + x.calc.economia, 0);
    const amortizacao = selecionadas.reduce((s, x) => s + x.calc.amortizacao, 0);
    const novoSaldoDevedor = Math.max(0, saldoDevedorAtual - amortizacao);
    return {
      qtd: selecionadas.length,
      totalOriginal,
      totalPagar,
      economia,
      amortizacao,
      novoSaldoDevedor,
      itens: selecionadas,
    };
  }, [parcelasCalculadas, selectedIds, saldoDevedorAtual]);

  // Simulação por valor alvo
  const resultadoPorValor = useMemo(() => {
    const alvo = parseCurrencyInput(valorAlvo || "");
    if (!alvo || alvo <= 0)
      return { alvo: 0, itens: [] as typeof parcelasCalculadas, totalPagar: 0, totalOriginal: 0, economia: 0, amortizacao: 0, sobra: 0, novoSaldoDevedor: saldoDevedorAtual };

    const lista =
      direcao === "fim"
        ? [...parcelasCalculadas].reverse()
        : [...parcelasCalculadas];

    const escolhidas: typeof parcelasCalculadas = [];
    let acumulado = 0;
    for (const item of lista) {
      if (acumulado + item.calc.valorPago > alvo + 0.005) break;
      escolhidas.push(item);
      acumulado += item.calc.valorPago;
    }

    const totalOriginal = escolhidas.reduce((s, x) => s + x.calc.valorOriginal, 0);
    const totalPagar = escolhidas.reduce((s, x) => s + x.calc.valorPago, 0);
    const economia = escolhidas.reduce((s, x) => s + x.calc.economia, 0);
    const amortizacao = escolhidas.reduce((s, x) => s + x.calc.amortizacao, 0);
    const sobra = Math.max(0, alvo - totalPagar);

    return {
      alvo,
      itens: escolhidas,
      totalPagar,
      totalOriginal,
      economia,
      amortizacao,
      sobra,
      novoSaldoDevedor: Math.max(0, saldoDevedorAtual - amortizacao),
    };
  }, [valorAlvo, direcao, parcelasCalculadas, saldoDevedorAtual]);

  const aplicarResultadoValorEmSelecao = () => {
    setSelectedIds(new Set(resultadoPorValor.itens.map((x) => x.parcela.id)));
  };

  if (parcelasAbertas.length === 0) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Simulador de Amortização
          </CardTitle>
          <CardDescription>{contratoNome}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Não há parcelas em aberto para simular.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Simulador de Amortização
            </CardTitle>
            <CardDescription>
              Simule o pagamento antecipado de parcelas usando a taxa do contrato ({contratoNome}).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Data do pagamento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dataPagamento, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={dataPagamento}
                  onSelect={(d) => d && setDataPagamento(d)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="manual">Selecionar parcelas</TabsTrigger>
            <TabsTrigger value="valor">Simular por valor</TabsTrigger>
          </TabsList>

          {/* ==================== MODO MANUAL ==================== */}
          <TabsContent value="manual" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={selecionarTodas}>
                Todas ({parcelasAbertas.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => selecionarUltimasN(3)}>
                Últimas 3
              </Button>
              <Button size="sm" variant="outline" onClick={() => selecionarUltimasN(6)}>
                Últimas 6
              </Button>
              <Button size="sm" variant="outline" onClick={() => selecionarUltimasN(12)}>
                Últimas 12
              </Button>
              <Button size="sm" variant="outline" onClick={() => selecionarPrimeirasN(3)}>
                Próximas 3
              </Button>
              <Button size="sm" variant="ghost" onClick={limparSelecao}>
                Limpar
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <ScrollArea className="h-[380px] rounded-md border">
                <div className="divide-y">
                  {parcelasCalculadas.map(({ parcela, calc }) => {
                    const selected = selectedIds.has(parcela.id);
                    return (
                      <label
                        key={parcela.id}
                        htmlFor={`sim-${parcela.id}`}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
                          selected && "bg-primary/5"
                        )}
                      >
                        <Checkbox
                          id={`sim-${parcela.id}`}
                          checked={selected}
                          onCheckedChange={() => toggle(parcela.id)}
                        />
                        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="tabular-nums">
                              #{parcela.numero_parcela}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              vence{" "}
                              {format(parseISO(parcela.data_vencimento), "dd/MM/yyyy", {
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Original
                              </div>
                              <div className="text-sm tabular-nums line-through decoration-muted-foreground/60">
                                {formatCurrency(calc.valorOriginal)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                A pagar
                              </div>
                              <div className="text-sm font-semibold tabular-nums text-foreground">
                                {formatCurrency(calc.valorPago)}
                              </div>
                            </div>
                            <div className="min-w-[70px]">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Economia
                              </div>
                              <div className="text-sm font-medium tabular-nums text-success">
                                {formatCurrency(calc.economia)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>

              <ResumoCard
                titulo="Resultado da simulação"
                qtd={resultadoManual.qtd}
                totalOriginal={resultadoManual.totalOriginal}
                totalPagar={resultadoManual.totalPagar}
                economia={resultadoManual.economia}
                amortizacao={resultadoManual.amortizacao}
                saldoAtual={saldoDevedorAtual}
                novoSaldoDevedor={resultadoManual.novoSaldoDevedor}
              />
            </div>
          </TabsContent>

          {/* ==================== MODO POR VALOR ==================== */}
          <TabsContent value="valor" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr] lg:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="valor-alvo">Valor disponível</Label>
                <Input
                  id="valor-alvo"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={valorAlvo}
                  onChange={(e) => setValorAlvo(formatCurrencyInput(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Direção do abatimento</Label>
                <RadioGroup
                  value={direcao}
                  onValueChange={(v) => setDirecao(v as Direcao)}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="dir-fim" value="fim" />
                    <Label htmlFor="dir-fim" className="font-normal cursor-pointer">
                      Das últimas para as primeiras (amortizar dívida)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="dir-inicio" value="inicio" />
                    <Label htmlFor="dir-inicio" className="font-normal cursor-pointer">
                      Das próximas para as futuras
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  {resultadoPorValor.itens.length > 0
                    ? `${resultadoPorValor.itens.length} parcelas cobertas pelo valor informado`
                    : "Informe um valor para simular"}
                </div>
                <ScrollArea className="h-[320px]">
                  <div className="divide-y">
                    {resultadoPorValor.itens.map(({ parcela, calc }) => (
                      <div
                        key={parcela.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="tabular-nums">
                            #{parcela.numero_parcela}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(parcela.data_vencimento), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums text-muted-foreground line-through">
                            {formatCurrency(calc.valorOriginal)}
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatCurrency(calc.valorPago)}
                          </span>
                          <span className="tabular-nums text-success min-w-[70px] text-right">
                            +{formatCurrency(calc.economia)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {resultadoPorValor.itens.length === 0 && (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma parcela selecionada.
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {resultadoPorValor.alvo > 0 && resultadoPorValor.sobra > 0 && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Sobrariam <strong>{formatCurrency(resultadoPorValor.sobra)}</strong> não
                    utilizados (insuficientes para a próxima parcela na direção escolhida).
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <ResumoCard
                  titulo="Resultado por valor"
                  qtd={resultadoPorValor.itens.length}
                  totalOriginal={resultadoPorValor.totalOriginal}
                  totalPagar={resultadoPorValor.totalPagar}
                  economia={resultadoPorValor.economia}
                  amortizacao={resultadoPorValor.amortizacao}
                  saldoAtual={saldoDevedorAtual}
                  novoSaldoDevedor={resultadoPorValor.novoSaldoDevedor}
                />
                {resultadoPorValor.itens.length > 0 && (
                  <Button variant="outline" size="sm" onClick={aplicarResultadoValorEmSelecao} className="w-full">
                    Copiar para "Selecionar parcelas"
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

interface ResumoCardProps {
  titulo: string;
  qtd: number;
  totalOriginal: number;
  totalPagar: number;
  economia: number;
  amortizacao: number;
  saldoAtual: number;
  novoSaldoDevedor: number;
}

const ResumoCard = ({
  titulo,
  qtd,
  totalOriginal,
  totalPagar,
  economia,
  amortizacao,
  saldoAtual,
  novoSaldoDevedor,
}: ResumoCardProps) => {
  const reducaoSaldo = saldoAtual - novoSaldoDevedor;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{titulo}</h4>
        <Badge variant="secondary">{qtd} parcela{qtd === 1 ? "" : "s"}</Badge>
      </div>
      <Separator />
      <Linha label="Soma nominal" value={formatCurrency(totalOriginal)} muted />
      <Linha
        label="Total a pagar hoje"
        value={formatCurrency(totalPagar)}
        icon={<Wallet className="h-3.5 w-3.5" />}
        strong
      />
      <Linha
        label="Economia com desconto"
        value={formatCurrency(economia)}
        icon={<PiggyBank className="h-3.5 w-3.5 text-success" />}
        highlightSuccess
      />
      <Separator />
      <Linha label="Saldo devedor atual" value={formatCurrency(saldoAtual)} muted />
      <Linha
        label="Amortização"
        value={formatCurrency(amortizacao)}
        icon={<TrendingDown className="h-3.5 w-3.5 text-primary" />}
      />
      <Linha
        label="Novo saldo devedor"
        value={formatCurrency(novoSaldoDevedor)}
        strong
      />
      {reducaoSaldo > 0 && saldoAtual > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-1">
          Redução de{" "}
          <span className="font-medium text-primary">
            {((reducaoSaldo / saldoAtual) * 100).toFixed(1)}%
          </span>{" "}
          no saldo devedor
        </div>
      )}
    </div>
  );
};

const Linha = ({
  label,
  value,
  icon,
  muted,
  strong,
  highlightSuccess,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
  highlightSuccess?: boolean;
}) => (
  <div className="flex items-center justify-between text-sm">
    <span className={cn("flex items-center gap-1.5", muted && "text-muted-foreground")}>
      {icon}
      {label}
    </span>
    <span
      className={cn(
        "tabular-nums",
        strong && "font-semibold",
        highlightSuccess && "font-medium text-success"
      )}
    >
      {value}
    </span>
  </div>
);

export default FinancingSimulator;
