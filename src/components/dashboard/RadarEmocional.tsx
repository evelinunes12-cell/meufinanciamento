import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSaldo } from "@/contexts/SaldoContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, PiggyBank, Sparkles } from "lucide-react";
import { startOfMonth, endOfMonth, format, parseISO, subDays, differenceInHours } from "date-fns";

interface Tx {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  categoria_id: string | null;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  created_at: string;
}

interface Orcamento {
  categoria_id: string;
  valor_limite: number;
  mes_referencia: string;
}

type Cenario =
  | {
      tipo: "alivio";
      titulo: string;
      mensagem: string;
    }
  | {
      tipo: "queda";
      titulo: string;
      mensagem: string;
    }
  | {
      tipo: "orcamento";
      titulo: string;
      mensagem: string;
      categoriaNome: string;
      percentual: number;
    };

async function fetchRadarData(userId: string) {
  const hoje = new Date();
  const inicioMes = format(startOfMonth(hoje), "yyyy-MM-dd");
  const fimMes = format(endOfMonth(hoje), "yyyy-MM-dd");

  const [txRes, orcRes, catRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("id, valor, tipo, data, categoria_id, forma_pagamento, is_pago_executado, created_at")
      .gte("data", inicioMes)
      .lte("data", fimMes),
    supabase
      .from("orcamentos")
      .select("categoria_id, valor_limite, mes_referencia")
      .eq("mes_referencia", inicioMes),
    supabase.from("categorias").select("id, nome, categoria_pai_id"),
  ]);

  return {
    transacoes: (txRes.data || []) as Tx[],
    orcamentos: (orcRes.data || []) as Orcamento[],
    categorias: (catRes.data || []) as { id: string; nome: string; categoria_pai_id: string | null }[],
  };
}

export default function RadarEmocional() {
  const { user } = useAuth();
  const { saldoContas } = useSaldo();

  const { data } = useQuery({
    queryKey: ["radar-emocional", user?.id],
    queryFn: () => fetchRadarData(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const cenario = useMemo<Cenario | null>(() => {
    if (!data) return null;
    const { transacoes, orcamentos, categorias } = data;
    const agora = new Date();

    // 1) Alívio — receita executada nas últimas 48h > 20% do saldo atual
    const receitasRecentes = transacoes.filter(
      (t) =>
        t.tipo === "receita" &&
        t.forma_pagamento !== "transferencia" &&
        t.is_pago_executado === true &&
        differenceInHours(agora, parseISO(t.created_at)) <= 48,
    );
    const totalReceitasRecentes = receitasRecentes.reduce((a, t) => a + Number(t.valor), 0);
    if (saldoContas > 0 && totalReceitasRecentes > saldoContas * 0.2) {
      return {
        tipo: "alivio",
        titulo: "Boas notícias no seu caixa",
        mensagem:
          "Uma receita nova entrou e o seu caixa está confortável. Respire fundo e aproveite o mês com tranquilidade.",
      };
    }

    // 2) Queda brusca — despesas dos últimos 3 dias > 30% do saldo atual
    const limite3d = subDays(agora, 3);
    const despesas3d = transacoes
      .filter(
        (t) =>
          t.tipo === "despesa" &&
          t.forma_pagamento !== "transferencia" &&
          t.is_pago_executado === true &&
          parseISO(t.data) >= limite3d,
      )
      .reduce((a, t) => a + Number(t.valor), 0);

    if (saldoContas > 0 && despesas3d > saldoContas * 0.3) {
      return {
        tipo: "queda",
        titulo: "Alerta de Velocidade",
        mensagem:
          "O seu saldo caiu consideravelmente nos últimos dias. Segure os gastos não essenciais por agora.",
      };
    }

    // 3) Orçamento > 80%
    if (orcamentos.length > 0) {
      const getDescIds = (parentId: string) => [
        parentId,
        ...categorias.filter((c) => c.categoria_pai_id === parentId).map((c) => c.id),
      ];
      let pior: { nome: string; percent: number } | null = null;
      for (const orc of orcamentos) {
        const ids = getDescIds(orc.categoria_id);
        const gasto = transacoes
          .filter(
            (t) =>
              t.tipo === "despesa" &&
              t.forma_pagamento !== "transferencia" &&
              t.is_pago_executado === true &&
              t.categoria_id &&
              ids.includes(t.categoria_id),
          )
          .reduce((a, t) => a + Number(t.valor), 0);
        const pct = orc.valor_limite > 0 ? (gasto / Number(orc.valor_limite)) * 100 : 0;
        if (pct >= 80) {
          const cat = categorias.find((c) => c.id === orc.categoria_id);
          if (!pior || pct > pior.percent) {
            pior = { nome: cat?.nome || "Categoria", percent: pct };
          }
        }
      }
      if (pior) {
        return {
          tipo: "orcamento",
          titulo: "Aviso de Orçamento",
          mensagem: `Você já usou ${pior.percent.toFixed(0)}% do orçamento de ${pior.nome} neste mês. Considere desacelerar para fechar o mês no azul.`,
          categoriaNome: pior.nome,
          percentual: pior.percent,
        };
      }
    }

    return null;
  }, [data, saldoContas]);

  if (!cenario) return null;

  const styles =
    cenario.tipo === "alivio"
      ? {
          wrapper:
            "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent",
          icon: <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
          badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          badgeText: "Tudo certo",
        }
      : cenario.tipo === "queda"
        ? {
            wrapper:
              "border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent",
            icon: <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />,
            badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
            badgeText: "Atenção",
          }
        : {
            wrapper:
              "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-transparent",
            icon: <PiggyBank className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
            badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
            badgeText: "Orçamento",
          };

  return (
    <Card className={`relative overflow-hidden border ${styles.wrapper} shadow-card`}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/60 backdrop-blur border border-border/40">
          {styles.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`${styles.badge} text-[10px] uppercase tracking-wider font-semibold`}>
              <TrendingUp className="h-3 w-3 mr-1" />
              {styles.badgeText}
            </Badge>
            <span className="text-xs text-muted-foreground">Radar emocional</span>
          </div>
          <h3 className="font-semibold text-foreground text-base mb-1">{cenario.titulo}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{cenario.mensagem}</p>
        </div>
      </CardContent>
    </Card>
  );
}
