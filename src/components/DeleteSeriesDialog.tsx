import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DeleteSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacaoId: string;
  transacaoOrigemId: string | null;
  transacaoData: string;
  descricao?: string | null;
  parcelasTotal?: number | null;
}

const DeleteSeriesDialog = ({
  open,
  onOpenChange,
  transacaoId,
  transacaoOrigemId,
  transacaoData,
  descricao,
  parcelasTotal,
}: DeleteSeriesDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Check if this is part of a series:
  // - Either it has a transacao_origem_id (it's a child)
  // - Or it has parcelas_total > 1 and no transacao_origem_id (it's the parent/origin)
  const isChildOfSeries = !!transacaoOrigemId;
  const isParentOfSeries = !transacaoOrigemId && parcelasTotal && parcelasTotal > 1;
  const isSeries = isChildOfSeries || isParentOfSeries;

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const handleDeleteSingle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("transacoes").delete().eq("id", transacaoId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Transação excluída",
      });

      invalidateQueries();
      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting transaction:", error);
      }
      toast({
        title: "Erro",
        description: "Erro ao excluir transação",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllFuture = async () => {
    setLoading(true);
    try {
      // Determine the origin ID for the series
      // If this is a child, use transacaoOrigemId
      // If this is the parent, use transacaoId
      const seriesOriginId = isChildOfSeries ? transacaoOrigemId : transacaoId;

      if (!seriesOriginId) {
        throw new Error("Could not determine series origin");
      }

      // Get all transactions from this series with date >= current transaction date
      // This includes both the origin (if date matches) and all children
      const { data: toDelete, error: fetchError } = await supabase
        .from("transacoes")
        .select("id")
        .or(`id.eq.${seriesOriginId},transacao_origem_id.eq.${seriesOriginId}`)
        .gte("data", transacaoData);

      if (fetchError) throw fetchError;

      if (toDelete && toDelete.length > 0) {
        const idsToDelete = toDelete.map((t) => t.id);

        const { error: deleteError } = await supabase
          .from("transacoes")
          .delete()
          .in("id", idsToDelete);

        if (deleteError) throw deleteError;

        toast({
          title: "Sucesso",
          description: `${idsToDelete.length} transações excluídas`,
        });
      }

      invalidateQueries();
      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting series:", error);
      }
      toast({
        title: "Erro",
        description: "Erro ao excluir série de transações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Simple delete for non-series transactions
  if (!isSeries) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir Transação
            </AlertDialogTitle>
            <AlertDialogDescription>
              {descricao ? (
                <>
                  Deseja excluir a transação <strong>"{descricao}"</strong>?
                </>
              ) : (
                "Deseja excluir esta transação?"
              )}
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSingle}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Series delete with options
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Excluir Transação de Série
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta transação faz parte de uma série (parcelas ou recorrência).
            <br />
            {descricao && (
              <span className="font-medium">"{descricao}"</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
            onClick={handleDeleteSingle}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Excluir apenas esta</p>
              <p className="text-xs text-muted-foreground">
                Remove apenas esta transação da série
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={handleDeleteAllFuture}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Excluir esta e todas as próximas</p>
              <p className="text-xs text-muted-foreground">
                Remove esta e todas as transações futuras da série
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteSeriesDialog;