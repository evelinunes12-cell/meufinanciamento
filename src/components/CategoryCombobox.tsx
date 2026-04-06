import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
  categoria_pai_id: string | null;
}

interface CategoryComboboxProps {
  categorias: Categoria[];
  tipo: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

const CategoryCombobox = ({ categorias, tipo, value, onValueChange, placeholder = "Selecione uma categoria" }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const allByType = useMemo(() => categorias.filter(c => c.tipo === tipo), [categorias, tipo]);

  const filtered = useMemo(() => {
    if (search.length < 3) return allByType;
    const term = search.toLowerCase();
    return allByType.filter(c => c.nome.toLowerCase().includes(term));
  }, [allByType, search]);

  const hierarchy = useMemo(() => {
    const mainCats = filtered.filter(c => !c.categoria_pai_id);
    const getSubs = (parentId: string) => filtered.filter(c => c.categoria_pai_id === parentId);

    const result = mainCats.flatMap(main => {
      const subs = getSubs(main.id);
      return [
        { ...main, isMain: true, level: 0 },
        ...subs.map(sub => ({ ...sub, isMain: false, level: 1 })),
      ];
    });

    const orphans = filtered.filter(c => c.categoria_pai_id && !mainCats.some(m => m.id === c.categoria_pai_id));
    return [...result, ...orphans.map(s => ({ ...s, isMain: false, level: 1 }))];
  }, [filtered]);

  const selectedCat = allByType.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10"
        >
          {selectedCat ? (
            <div className="flex items-center gap-2 truncate">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedCat.cor }} />
              <span className="truncate">{selectedCat.nome}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Digite 3+ letras para buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[220px]">
          <div className="px-1 pb-1">
            {hierarchy.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {search.length > 0 && search.length < 3
                  ? "Digite pelo menos 3 caracteres..."
                  : "Nenhuma categoria encontrada"}
              </div>
            ) : (
              hierarchy.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                    cat.level === 1 && "pl-6",
                    value === cat.id && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => {
                    onValueChange(cat.id);
                    setOpen(false);
                  }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.cor }} />
                  <span className={cn("truncate", cat.isMain && "font-semibold")}>
                    {cat.level === 1 ? "↳ " : ""}{cat.nome}
                  </span>
                  {value === cat.id && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
