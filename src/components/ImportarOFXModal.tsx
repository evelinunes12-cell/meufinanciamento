import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TablesInsert } from "@/integrations/supabase/types";
import { parseOFX, OFXTransaction } from "@/lib/ofxParser";
import { Upload, Check, FileText, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  categoria_pai_id: string | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
  cor: string;
}

interface ImportarOFXModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaNome: string;
}

interface RowState {
  categoryId: string | null;
  description: string;
  paymentMethod: string;
  transactionType: "receita" | "despesa" | "transferencia";
  targetAccountId: string | null;
  isConfirming: boolean;
}

type RowStates = Record<string, RowState>;

const FORMAS_PAGAMENTO = [
  { value: "debito", label: "Débito" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência Bancária" },
  { value: "boleto", label: "Boleto" },
];

const ImportarOFXModal = ({ open, onOpenChange, contaId, contaNome }: ImportarOFXModalProps) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transactions, setTransactions] = useState<OFXTransaction[]>([]);
  const [rowStates, setRowStates] = useState<RowStates>({});
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [fileLoaded, setFileLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategorias();
      fetchContas();
    }
  }, [open]);

  const fetchCategorias = async () => {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .order("nome");
    if (data) setCategorias(data);
  };

  const fetchContas = async () => {
    const { data } = await supabase
      .from("contas")
      .select("id, nome_conta, tipo, cor")
      .neq("id", contaId)
      .order("nome_conta");
    if (data) setContas(data);
  };

  const initializeRowState = (transaction: OFXTransaction): RowState => {
    const defaultType = transaction.amount < 0 ? "despesa" : "receita";
    return {
      categoryId: null,
      description: transaction.description,
      paymentMethod: "debito",
      transactionType: defaultType,
      targetAccountId: null,
      isConfirming: false,
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.ofx')) {
      toast({
        title: "Ficheiro inválido",
        description: "Por favor, selecione um ficheiro OFX.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseOFX(content);

      if (parsed.length === 0) {
        toast({
          title: "Nenhuma transação encontrada",
          description: "O ficheiro OFX não contém transações válidas.",
          variant: "destructive",
        });
        return;
      }

      setTransactions(parsed);
      
      // Initialize row states for each transaction
      const initialStates: RowStates = {};
      parsed.forEach((t) => {
        initialStates[t.fitid] = initializeRowState(t);
      });
      setRowStates(initialStates);
      
      setFileLoaded(true);
      toast({
        title: "Ficheiro carregado",
        description: `${parsed.length} transações encontradas.`,
      });
    };

    reader.onerror = () => {
      toast({
        title: "Erro ao ler ficheiro",
        description: "Não foi possível ler o ficheiro OFX.",
        variant: "destructive",
      });
    };

    reader.readAsText(file, 'ISO-8859-1');
  };

  const updateRowState = <K extends keyof RowState>(
    fitid: string,
    field: K,
    value: RowState[K]
  ) => {
    setRowStates((prev) => ({
      ...prev,
      [fitid]: {
        ...prev[fitid],
        [field]: value,
      },
    }));
  };

  const handleConfirmar = async (transaction: OFXTransaction) => {
    const state = rowStates[transaction.fitid];
    if (!state) return;

    const isTransfer = state.transactionType === "transferencia";

    // Validation
    if (!isTransfer && !state.categoryId) {
      toast({
        title: "Categoria obrigatória",
        description: "Selecione uma categoria antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    if (isTransfer && !state.targetAccountId) {
      toast({
        title: "Conta obrigatória",
        description: "Selecione a conta de destino/origem para a transferência.",
        variant: "destructive",
      });
      return;
    }

    // Set loading state for this row
    updateRowState(transaction.fitid, "isConfirming", true);

    const valor = Math.abs(transaction.amount);
    const dataTransacao = format(transaction.date, "yyyy-MM-dd");

    let payload: TablesInsert<"transacoes">;

    if (isTransfer) {
      // Transfer logic based on amount sign
      const isOutflow = transaction.amount < 0;
      
      payload = {
        user_id: user?.id as string,
        // If negative (outflow): current account is origin, selected is destination
        // If positive (inflow): selected account is origin, current is destination
        conta_id: isOutflow ? contaId : (state.targetAccountId as string),
        conta_destino_id: isOutflow ? state.targetAccountId : contaId,
        categoria_id: null,
        valor,
        tipo: "transferencia",
        data: dataTransacao,
        descricao: state.description || transaction.description,
        forma_pagamento: state.paymentMethod,
        is_pago_executado: true,
        data_execucao_pagamento: dataTransacao,
      };
    } else {
      // Regular income/expense
      payload = {
        user_id: user?.id as string,
        conta_id: contaId,
        categoria_id: state.categoryId,
        valor,
        tipo: state.transactionType,
        data: dataTransacao,
        descricao: state.description || transaction.description,
        forma_pagamento: state.paymentMethod,
        is_pago_executado: true,
        data_execucao_pagamento: dataTransacao,
      };
    }

    const { error } = await supabase.from("transacoes").insert(payload);

    if (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a transação.",
        variant: "destructive",
      });
      updateRowState(transaction.fitid, "isConfirming", false);
      return;
    }

    // Remove from lists immediately on success
    setTransactions((prev) => prev.filter((t) => t.fitid !== transaction.fitid));
    setRowStates((prev) => {
      const newStates = { ...prev };
      delete newStates[transaction.fitid];
      return newStates;
    });

    toast({
      title: "Transação salva",
      description: `${state.description || transaction.description} foi registrada com sucesso.`,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Math.abs(value));
  };

  const handleClose = () => {
    setTransactions([]);
    setRowStates({});
    setFileLoaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  // Group categories by parent
  const categoriasAgrupadas = () => {
    const pais = categorias.filter((c) => !c.categoria_pai_id);
    const filhas = categorias.filter((c) => c.categoria_pai_id);

    return pais.map((pai) => ({
      ...pai,
      filhas: filhas.filter((f) => f.categoria_pai_id === pai.id),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Extrato OFX - {contaNome}
          </DialogTitle>
        </DialogHeader>

        {!fileLoaded ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Upload className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-foreground mb-1">
                Selecione um ficheiro OFX
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Exporte o extrato do seu banco no formato OFX e carregue aqui
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="gradient-primary text-primary-foreground"
            >
              <Upload className="h-4 w-4 mr-2" />
              Carregar Ficheiro
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {transactions.length} transação(ões) pendente(s)
              </p>
              <Button variant="outline" size="sm" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="font-semibold text-foreground">
                  Todas as transações foram importadas!
                </h3>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="mt-4"
                >
                  Fechar
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Data</TableHead>
                      <TableHead className="min-w-[150px]">Descrição</TableHead>
                      <TableHead className="w-[100px] text-right">Valor</TableHead>
                      <TableHead className="w-[130px]">Tipo</TableHead>
                      <TableHead className="w-[130px]">Pagamento</TableHead>
                      <TableHead className="w-[180px]">Categoria / Conta</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => {
                      const state = rowStates[transaction.fitid];
                      if (!state) return null;

                      const isTransfer = state.transactionType === "transferencia";

                      return (
                        <TableRow key={transaction.fitid}>
                          <TableCell className="text-sm">
                            {format(transaction.date, "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={state.description}
                              onChange={(e) =>
                                updateRowState(transaction.fitid, "description", e.target.value)
                              }
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className={`text-right font-medium ${transaction.amount < 0 ? "text-red-500" : "text-green-500"}`}>
                            {transaction.amount < 0 ? "-" : "+"} {formatCurrency(transaction.amount)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={state.transactionType}
                              onValueChange={(value: "receita" | "despesa" | "transferencia") =>
                                updateRowState(transaction.fitid, "transactionType", value)
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="receita">Receita</SelectItem>
                                <SelectItem value="despesa">Despesa</SelectItem>
                                <SelectItem value="transferencia">Transferência</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={state.paymentMethod}
                              onValueChange={(value) =>
                                updateRowState(transaction.fitid, "paymentMethod", value)
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FORMAS_PAGAMENTO.map((fp) => (
                                  <SelectItem key={fp.value} value={fp.value}>
                                    {fp.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {isTransfer ? (
                              <Select
                                value={state.targetAccountId || ""}
                                onValueChange={(value) =>
                                  updateRowState(transaction.fitid, "targetAccountId", value)
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder={transaction.amount < 0 ? "Destino..." : "Origem..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {contas.map((conta) => (
                                    <SelectItem key={conta.id} value={conta.id}>
                                      <span className="flex items-center gap-2">
                                        <span
                                          className="w-2 h-2 rounded-full"
                                          style={{ backgroundColor: conta.cor }}
                                        />
                                        {conta.nome_conta}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select
                                value={state.categoryId || ""}
                                onValueChange={(value) =>
                                  updateRowState(transaction.fitid, "categoryId", value)
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {categoriasAgrupadas().map((pai) => (
                                    <div key={pai.id}>
                                      <SelectItem value={pai.id} className="font-medium">
                                        {pai.nome}
                                      </SelectItem>
                                      {pai.filhas.map((filha) => (
                                        <SelectItem
                                          key={filha.id}
                                          value={filha.id}
                                          className="pl-6"
                                        >
                                          └ {filha.nome}
                                        </SelectItem>
                                      ))}
                                    </div>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                              onClick={() => handleConfirmar(transaction)}
                              disabled={state.isConfirming}
                            >
                              {state.isConfirming ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportarOFXModal;
