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

interface ImportarOFXModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaNome: string;
}

interface TransacaoRevisao extends OFXTransaction {
  categoriaId: string | null;
  descricaoEditada: string;
  confirmando: boolean;
}

const ImportarOFXModal = ({ open, onOpenChange, contaId, contaNome }: ImportarOFXModalProps) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transacoes, setTransacoes] = useState<TransacaoRevisao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategorias();
    }
  }, [open]);

  const fetchCategorias = async () => {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .order("nome");
    if (data) setCategorias(data);
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

      setTransacoes(
        parsed.map((t) => ({
          ...t,
          categoriaId: null,
          descricaoEditada: t.description,
          confirmando: false,
        }))
      );
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

  const updateTransacao = (fitid: string, field: 'categoriaId' | 'descricaoEditada', value: string | null) => {
    setTransacoes((prev) =>
      prev.map((t) =>
        t.fitid === fitid ? { ...t, [field]: value } : t
      )
    );
  };

  const handleConfirmar = async (transacao: TransacaoRevisao) => {
    if (!transacao.categoriaId) {
      toast({
        title: "Categoria obrigatória",
        description: "Selecione uma categoria antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    setTransacoes((prev) =>
      prev.map((t) =>
        t.fitid === transacao.fitid ? { ...t, confirmando: true } : t
      )
    );

    const tipo = transacao.amount < 0 ? "despesa" : "receita";
    const valor = Math.abs(transacao.amount);

    const { error } = await supabase.from("transacoes").insert({
      user_id: user?.id as string,
      conta_id: contaId,
      categoria_id: transacao.categoriaId,
      valor,
      tipo,
      data: format(transacao.date, "yyyy-MM-dd"),
      descricao: transacao.descricaoEditada || transacao.description,
      forma_pagamento: "debito",
      is_pago_executado: true,
    });

    if (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a transação.",
        variant: "destructive",
      });
      setTransacoes((prev) =>
        prev.map((t) =>
          t.fitid === transacao.fitid ? { ...t, confirmando: false } : t
        )
      );
      return;
    }

    // Remove from list
    setTransacoes((prev) => prev.filter((t) => t.fitid !== transacao.fitid));
    toast({
      title: "Transação salva",
      description: `${transacao.descricaoEditada} foi registrada com sucesso.`,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Math.abs(value));
  };

  const handleClose = () => {
    setTransacoes([]);
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
      <DialogContent className="max-w-4xl max-h-[90vh]">
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
                {transacoes.length} transação(ões) pendente(s)
              </p>
              <Button variant="outline" size="sm" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </div>

            {transacoes.length === 0 ? (
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
                      <TableHead className="w-[100px]">Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[120px] text-right">Valor</TableHead>
                      <TableHead className="w-[200px]">Categoria</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacoes.map((transacao) => (
                      <TableRow key={transacao.fitid}>
                        <TableCell className="text-sm">
                          {format(transacao.date, "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={transacao.descricaoEditada}
                            onChange={(e) =>
                              updateTransacao(transacao.fitid, "descricaoEditada", e.target.value)
                            }
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className={`text-right font-medium ${transacao.amount < 0 ? "text-red-500" : "text-green-500"}`}>
                          {transacao.amount < 0 ? "-" : "+"} {formatCurrency(transacao.amount)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={transacao.categoriaId || ""}
                            onValueChange={(value) =>
                              updateTransacao(transacao.fitid, "categoriaId", value)
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
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleConfirmar(transacao)}
                            disabled={transacao.confirmando}
                          >
                            {transacao.confirmando ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
