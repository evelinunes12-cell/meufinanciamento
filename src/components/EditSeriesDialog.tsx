import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Repeat } from "lucide-react";

interface EditSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  descricao?: string | null;
  /** Called when the user chooses to update only the current occurrence. */
  onUpdateOnly: () => void;
  /** Called when the user chooses to propagate the change to future unpaid occurrences. */
  onUpdateFuture: () => void;
  loading?: boolean;
}

/**
 * Confirmation prompt shown when editing a transaction that belongs to a
 * "fixa" (unlimited subscription) series.
 *
 * Lets the user decide whether the change applies only to this month or to
 * every future, still-unpaid occurrence — typical scenario: a subscription
 * raised its price (Netflix R$ 39,90 → R$ 44,90).
 */
const EditSeriesDialog = ({
  open,
  onOpenChange,
  descricao,
  onUpdateOnly,
  onUpdateFuture,
  loading,
}: EditSeriesDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            Editar assinatura recorrente
          </AlertDialogTitle>
          <AlertDialogDescription>
            {descricao ? (
              <>
                Esta transação faz parte de uma assinatura recorrente fixa
                {" "}<span className="font-medium">"{descricao}"</span>.
              </>
            ) : (
              "Esta transação faz parte de uma assinatura recorrente fixa."
            )}
            <br />
            Como deseja aplicar as alterações?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
            onClick={onUpdateOnly}
            disabled={loading}
          >
            <Pencil className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Apenas esta ocorrência</p>
              <p className="text-xs text-muted-foreground">
                Atualiza somente o lançamento deste mês
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3 border-primary/50 text-primary hover:bg-primary/10"
            onClick={onUpdateFuture}
            disabled={loading}
          >
            <Repeat className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Esta e todas as próximas</p>
              <p className="text-xs text-muted-foreground">
                Propaga para todas as próximas ocorrências ainda não pagas
                (lançamentos já confirmados são preservados)
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

export default EditSeriesDialog;
