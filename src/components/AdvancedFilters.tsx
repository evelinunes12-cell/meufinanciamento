import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface FilterState {
  filterMode: "month" | "range";
  filterMes: string;
  filterAno: string;
  dataInicial: string;
  dataFinal: string;
  tipo?: string;
  categoriaId?: string;
  subcategoriaId?: string;
  contaId?: string;
  formaPagamento?: string;
  statusPagamento?: string;
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  categorias?: { id: string; nome: string; tipo: string; categoria_pai_id?: string | null }[];
  contas?: { id: string; nome_conta: string }[];
  showTipo?: boolean;
  showCategoria?: boolean;
  showConta?: boolean;
  showFormaPagamento?: boolean;
  showStatusPagamento?: boolean;
}

const meses = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const formasPagamento = [
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

// Generate years from 2020 to current + 1
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  const endYear = currentYear + 1;
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => String(startYear + i));
};

const anos = generateYears();

export const AdvancedFilters = ({
  filters,
  onFiltersChange,
  categorias = [],
  contas = [],
  showTipo = false,
  showCategoria = false,
  showConta = false,
  showFormaPagamento = false,
  showStatusPagamento = false,
}: AdvancedFiltersProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof FilterState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAdvancedFilters = () => {
    onFiltersChange({
      ...filters,
      tipo: "",
      categoriaId: "",
      subcategoriaId: "",
      contaId: "",
      formaPagamento: "",
      statusPagamento: "",
    });
  };

  const hasAdvancedFilters = filters.tipo || filters.categoriaId || filters.subcategoriaId || 
    filters.contaId || filters.formaPagamento || filters.statusPagamento;

  // Get subcategories for selected category
  const subcategorias = filters.categoriaId 
    ? categorias.filter(c => c.categoria_pai_id === filters.categoriaId)
    : [];

  // Handle category change - reset subcategory when parent changes
  const handleCategoriaChange = (value: string) => {
    const newCategoriaId = value === "__all__" ? "" : value;
    onFiltersChange({ 
      ...filters, 
      categoriaId: newCategoriaId, 
      subcategoriaId: "" // Reset subcategory when category changes
    });
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return "Selecionar";
    try {
      return format(parseISO(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "Selecionar";
    }
  };

  return (
    <div className="space-y-4">
      {/* Period Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select 
          value={filters.filterMode} 
          onValueChange={(value: "month" | "range") => updateFilter("filterMode", value)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Modo de filtro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Por Mês</SelectItem>
            <SelectItem value="range">Por Período</SelectItem>
          </SelectContent>
        </Select>

        {filters.filterMode === "month" ? (
          <>
            <Select value={filters.filterMes} onValueChange={(v) => updateFilter("filterMes", v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((mes) => (
                  <SelectItem key={mes.value} value={mes.value}>{mes.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.filterAno} onValueChange={(v) => updateFilter("filterAno", v)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((ano) => (
                  <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-36 justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDateDisplay(filters.dataInicial)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dataInicial ? parseISO(filters.dataInicial) : undefined}
                  onSelect={(date) => date && updateFilter("dataInicial", format(date, "yyyy-MM-dd"))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-36 justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDateDisplay(filters.dataFinal)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dataFinal ? parseISO(filters.dataFinal) : undefined}
                  onSelect={(date) => date && updateFilter("dataFinal", format(date, "yyyy-MM-dd"))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* Advanced Filters Collapsible */}
      {(showTipo || showCategoria || showConta || showFormaPagamento || showStatusPagamento) && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avançados
              {hasAdvancedFilters && (
                <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                  Ativo
                </span>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              {showTipo && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select 
                    value={filters.tipo || "__all__"} 
                    onValueChange={(v) => updateFilter("tipo", v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showCategoria && categorias.length > 0 && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Categoria</Label>
                    <Select 
                      value={filters.categoriaId || "__all__"} 
                      onValueChange={handleCategoriaChange}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas</SelectItem>
                        {categorias
                          .filter(cat => !cat.categoria_pai_id) // Only main categories
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subcategory filter - only show when category is selected and has subcategories */}
                  {subcategorias.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Subcategoria</Label>
                      <Select 
                        value={filters.subcategoriaId || "__all__"} 
                        onValueChange={(v) => updateFilter("subcategoriaId", v === "__all__" ? "" : v)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todas</SelectItem>
                          {subcategorias.map((subcat) => (
                            <SelectItem key={subcat.id} value={subcat.id}>{subcat.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {showConta && contas.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Conta</Label>
                  <Select 
                    value={filters.contaId || "__all__"} 
                    onValueChange={(v) => updateFilter("contaId", v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {contas.map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>{conta.nome_conta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showFormaPagamento && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Pagamento</Label>
                  <Select 
                    value={filters.formaPagamento || "__all__"} 
                    onValueChange={(v) => updateFilter("formaPagamento", v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {formasPagamento.map((fp) => (
                        <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showStatusPagamento && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select 
                    value={filters.statusPagamento || "__all__"} 
                    onValueChange={(v) => updateFilter("statusPagamento", v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {hasAdvancedFilters && (
                <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} className="gap-1">
                  <X className="h-4 w-4" />
                  Limpar
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export const getDateRangeFromFilters = (filters: FilterState): { startDate: string; endDate: string } => {
  if (filters.filterMode === "range" && filters.dataInicial && filters.dataFinal) {
    return {
      startDate: filters.dataInicial,
      endDate: filters.dataFinal,
    };
  }

  // Calculate correct last day of month
  const year = parseInt(filters.filterAno);
  const month = parseInt(filters.filterMes);
  const lastDay = new Date(year, month, 0).getDate(); // Get last day of month

  return {
    startDate: `${filters.filterAno}-${filters.filterMes}-01`,
    endDate: `${filters.filterAno}-${filters.filterMes}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const getInitialFilterState = (): FilterState => {
  const currentDate = new Date();
  return {
    filterMode: "month",
    filterMes: String(currentDate.getMonth() + 1).padStart(2, '0'),
    filterAno: String(currentDate.getFullYear()),
    dataInicial: "",
    dataFinal: "",
    tipo: "",
    categoriaId: "",
    subcategoriaId: "",
    contaId: "",
    formaPagamento: "",
    statusPagamento: "",
  };
};

// Helper function to get all category IDs (parent + children) for filtering
export const getCategoryIdsForFilter = (
  categoriaId: string | undefined, 
  subcategoriaId: string | undefined,
  categorias: { id: string; categoria_pai_id?: string | null }[]
): string[] => {
  // If subcategory is selected, filter only by that
  if (subcategoriaId) {
    return [subcategoriaId];
  }
  
  // If main category is selected, include it and all its subcategories
  if (categoriaId) {
    const subcatIds = categorias
      .filter(c => c.categoria_pai_id === categoriaId)
      .map(c => c.id);
    return [categoriaId, ...subcatIds];
  }
  
  return [];
};
