import { useMemo, useState } from "react";
import { addMonths, format, parseISO, startOfMonth, endOfMonth, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Plus, Trash2, TrendingDown, AlertCircle, Wallet, Info } from "lucide-react";

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
  cor: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  descricao: string | null;
  is_pago_executado: boolean | null;
  forma_pagamento: string;
  recorrencia: string | null;
  conta_id: string;
  conta_destino_id?: string | null;
  parcela_atual?: number | null;
  parcelas_total?: number | null;
  mes_fatura_override?: string | null;
}

interface DadosMes {
  mes: Date;
  label: string;
  receitas: number;
  despesasLancadas: number;
  despesasProjetadas: number;
  saldoAcumulado: number;
  saldoReal: number;
}

interface ProjectionResult {
  saldoAtual: number;
  projecaoRealista: DadosMes[];
}

interface SimulacaoItem {
  id: string;
  descricao: string;
  conta_id: string;
  forma_pagamento: string;
  valor: number;
  data_vencimento: string; // yyyy-MM-dd
  parcelas: number;
}

interface Props {
  contas: Conta[];
  transacoes: Transacao[];
  buildProjection: (
    contas: Conta[],
    transacoes: Transacao[],
    orcamentos: any[],
    contaFilterId: string | null,
  ) => ProjectionResult;
  orcamentos: any[];
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
];

function expandirSimulacaoEmTransacoes(sim: SimulacaoItem, contas: Conta[]): Transacao[] {
  const parcelas = Math.max(1, sim.parcelas || 1);
  const valorParcela = Math.round((sim.valor / parcelas) * 100) / 100;
  const conta = contas.find(c => c.id === sim.conta_id);
  const isCredito = conta?.tipo === "credito";
  const baseDate = parseISO(sim.data_vencimento);
  const rows: Transacao[] = [];

  for (let i = 0; i < parcelas; i++) {
    const due = addMonths(baseDate, i);
    const dueStr = format(due, "yyyy-MM-dd");
    rows.push({
      id: `sim-${sim.id}-${i + 1}`,
      valor: valorParcela,
      tipo: "despesa",
      // For credit: data_pagamento drives effective date used by projection.
      // For others: use the same date for both.
      data: dueStr,
      data_pagamento: isCredito ? dueStr : dueStr,
      descricao: `[SIM] ${sim.descricao || "Simulação"}${parcelas > 1 ? ` (${i + 1}/${parcelas})` : ""}`,
      is_pago_executado: false,
      forma_pagamento: sim.forma_pagamento,
      recorrencia: null,
      conta_id: sim.conta_id,
      conta_destino_id: null,
      parcela_atual: parcelas > 1 ? i + 1 : null,
      parcelas_total: parcelas > 1 ? parcelas : null,
      mes_fatura_override: null,
    });
  }
  return rows;
}

export default function SimuladorGastos({ contas, transacoes, buildProjection, orcamentos }: Props) {
  const contasOrdenadas = useMemo(
    () => [...contas].sort((a, b) => a.nome_conta.localeCompare(b.nome_conta)),
    [contas],
  );

  const [simulacoes, setSimulacoes] = useState<SimulacaoItem[]>([]);
  const [form, setForm] = useState<Omit<SimulacaoItem, "id">>({
    descricao: "",
    conta_id: contasOrdenadas[0]?.id || "",
    forma_pagamento: "credito",
    valor: 0,
    data_vencimento: format(new Date(), "yyyy-MM-dd"),
    parcelas: 1,
  });

  const canAdd = form.conta_id && form.valor > 0 && form.data_vencimento && form.parcelas >= 1;

  const adicionar = () => {
    if (!canAdd) return;
    setSimulacoes(s => [...s, { ...form, id: crypto.randomUUID() }]);
    setForm(f => ({ ...f, descricao: "", valor: 0, parcelas: 1 }));
  };

  const remover = (id: string) => setSimulacoes(s => s.filter(x => x.id !== id));
  const limpar = () => setSimulacoes([]);

  // Build transactions with simulations appended
  const transacoesSimuladas = useMemo(() => {
    const extras = simulacoes.flatMap(s => expandirSimulacaoEmTransacoes(s, contas));
    return [...transacoes, ...extras];
  }, [transacoes, simulacoes, contas]);

  const baseProj = useMemo(
    () => buildProjection(contas, transacoes, orcamentos, null),
    [contas, transacoes, orcamentos, buildProjection],
  );
  const simProj = useMemo(
    () => buildProjection(contas, transacoesSimuladas, orcamentos, null),
    [contas, transacoesSimuladas, orcamentos, buildProjection],
  );

  const chartData = baseProj.projecaoRealista.map((m, i) => ({
    name: m.label,
    original: m.saldoAcumulado,
    simulado: simProj.projecaoRealista[i]?.saldoAcumulado ?? m.saldoAcumulado,
  }));

  const totalSimulado = simulacoes.reduce((a, s) => a + s.valor, 0);
  const saldoFinalBase = baseProj.projecaoRealista[baseProj.projecaoRealista.length - 1]?.saldoAcumulado ?? 0;
  const saldoFinalSim = simProj.projecaoRealista[simProj.projecaoRealista.length - 1]?.saldoAcumulado ?? 0;
  const impacto = saldoFinalSim - saldoFinalBase;

  const mesNegativoSim = simProj.projecaoRealista.find(m => m.saldoAcumulado < 0);
  const mesNegativoBase = baseProj.projecaoRealista.find(m => m.saldoAcumulado < 0);
  const novoRisco = !mesNegativoBase && mesNegativoSim;

  return (
    <div className="space-y-6">
      <Alert>
        <FlaskConical className="h-4 w-4" />
        <AlertTitle>Simulador de Gastos Futuros</AlertTitle>
        <AlertDescription>
          Adicione despesas hipotéticas e veja como afetariam seu saldo projetado nos próximos meses.
          As simulações não são salvas e não interferem em seus dados reais.
        </AlertDescription>
      </Alert>

      {/* Form */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nova simulação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input
                placeholder="Ex: TV nova"
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Conta</Label>
              <Select
                value={form.conta_id}
                onValueChange={v => setForm(f => ({ ...f, conta_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  {contasOrdenadas.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                        {c.nome_conta}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={form.forma_pagamento}
                onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(fp => (
                    <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor total (R$)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={form.valor || ""}
                onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs">Data de vencimento</Label>
              <Input
                type="date"
                value={form.data_vencimento}
                onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Parcelas</Label>
              <Input
                type="number" min={1} max={60}
                value={form.parcelas}
                onChange={e => setForm(f => ({ ...f, parcelas: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
            <div className="lg:col-span-6 flex justify-end gap-2 pt-2">
              {simulacoes.length > 0 && (
                <Button variant="outline" onClick={limpar}>Limpar tudo</Button>
              )}
              <Button onClick={adicionar} disabled={!canAdd}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
          {form.parcelas > 1 && form.valor > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              <Info className="inline h-3 w-3 mr-1" />
              {form.parcelas}x de {formatCurrency(form.valor / form.parcelas)} a partir de{" "}
              {format(parseISO(form.data_vencimento), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          )}
        </CardContent>
      </Card>

      {simulacoes.length > 0 && (
        <>
          {/* Impact KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total simulado</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(totalSimulado)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {simulacoes.length} {simulacoes.length === 1 ? "item" : "itens"}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Saldo final sem simulação</p>
                <p className={`text-lg font-bold ${saldoFinalBase >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(saldoFinalBase)}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Saldo final com simulação</p>
                <p className={`text-lg font-bold ${saldoFinalSim >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(saldoFinalSim)}
                </p>
                <p className={`text-[10px] mt-0.5 ${impacto < 0 ? "text-destructive" : "text-success"}`}>
                  Impacto: {impacto >= 0 ? "+" : ""}{formatCurrency(impacto)}
                </p>
              </CardContent>
            </Card>
          </div>

          {novoRisco && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Atenção: essa simulação gera risco de saldo negativo</AlertTitle>
              <AlertDescription>
                Com as simulações adicionadas, o saldo ficaria negativo em{" "}
                <strong>{format(mesNegativoSim!.mes, "MMMM/yyyy", { locale: ptBR })}</strong>{" "}
                ({formatCurrency(mesNegativoSim!.saldoAcumulado)}).
              </AlertDescription>
            </Alert>
          )}

          {/* Chart */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Saldo Projetado — Original vs Simulado
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        original: "Sem simulação",
                        simulado: "Com simulação",
                      };
                      return [formatCurrency(value), labels[name] || name];
                    }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px", fontSize: "12px",
                    }}
                  />
                  <Legend formatter={(v: string) => v === "original" ? "Sem simulação" : "Com simulação"} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="original" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="simulado" stroke="hsl(var(--destructive))" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly impact breakdown */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Impacto mensal</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 px-2 font-medium text-muted-foreground">Mês</th>
                      <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Despesas original</th>
                      <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Despesas simulado</th>
                      <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Δ Despesas</th>
                      <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Saldo simulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseProj.projecaoRealista.map((m, i) => {
                      const sim = simProj.projecaoRealista[i];
                      const delta = (sim?.despesasProjetadas ?? 0) - m.despesasProjetadas;
                      return (
                        <tr key={i} className={`border-b last:border-0 ${sim && sim.saldoAcumulado < 0 ? "bg-destructive/5" : ""}`}>
                          <td className="py-3 px-2 font-medium capitalize">{m.label}</td>
                          <td className="py-3 px-2 text-right text-muted-foreground">{formatCurrency(m.despesasProjetadas)}</td>
                          <td className="py-3 px-2 text-right font-semibold text-destructive">{formatCurrency(sim?.despesasProjetadas ?? 0)}</td>
                          <td className={`py-3 px-2 text-right font-medium ${delta > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {delta > 0 ? "+" : ""}{formatCurrency(delta)}
                          </td>
                          <td className={`py-3 px-2 text-right font-bold ${(sim?.saldoAcumulado ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(sim?.saldoAcumulado ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* List of simulations */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Simulações ativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {simulacoes.map(s => {
                  const conta = contas.find(c => c.id === s.conta_id);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {s.descricao || "(sem descrição)"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: conta?.cor }} />
                            {conta?.nome_conta || "—"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] capitalize">{s.forma_pagamento}</Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {s.parcelas > 1
                              ? `${s.parcelas}x de ${formatCurrency(s.valor / s.parcelas)}`
                              : formatCurrency(s.valor)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            a partir de {format(parseISO(s.data_vencimento), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <p className="text-sm font-semibold text-destructive">{formatCurrency(s.valor)}</p>
                        <Button variant="ghost" size="icon" onClick={() => remover(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {simulacoes.length === 0 && (
        <Card className="shadow-card border-dashed">
          <CardContent className="py-10 text-center">
            <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Adicione uma simulação acima para visualizar o impacto no seu saldo futuro.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
