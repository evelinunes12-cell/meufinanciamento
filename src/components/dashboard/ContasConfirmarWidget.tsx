import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Clock } from "lucide-react";
import ConfirmPaymentModal from "@/components/ConfirmPaymentModal";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  descricao: string | null;
  categoria_id: string | null;
  is_pago_executado: boolean | null;
}

interface ContasConfirmarWidgetProps {
  transacoes: Transacao[];
  onRefresh?: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export function ContasConfirmarWidget({ transacoes }: ContasConfirmarWidgetProps) {
  const [selectedTransacao, setSelectedTransacao] = useState<Transacao | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const pendentes = transacoes.filter(t => t.is_pago_executado === false).slice(0, 10);

  const handleOpenConfirmModal = (transacao: Transacao) => {
    setSelectedTransacao(transacao);
    setConfirmModalOpen(true);
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contas a Confirmar</CardTitle>
            {pendentes.length > 0 && (
              <Badge variant="secondary" className="bg-warning/10 text-warning">
                {pendentes.length} pendente{pendentes.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] pr-4">
            {pendentes.length > 0 ? (
              <div className="space-y-3">
                {pendentes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-warning/10">
                        <Clock className="h-4 w-4 text-warning" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {t.descricao || (t.tipo === "receita" ? "Receita" : "Despesa")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Vence em {format(parseISO(t.data), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-warning whitespace-nowrap">
                        {formatCurrency(t.valor)}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10"
                        onClick={() => handleOpenConfirmModal(t)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Check className="h-8 w-8 mb-2 text-success" />
                <p>Tudo em dia!</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedTransacao && (
        <ConfirmPaymentModal
          open={confirmModalOpen}
          onOpenChange={setConfirmModalOpen}
          transacaoId={selectedTransacao.id}
          valorPrevisto={selectedTransacao.valor}
          descricao={selectedTransacao.descricao}
        />
      )}
    </>
  );
}
