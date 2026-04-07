import { useMemo, useState, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allByType = useMemo(() => categorias.filter((c) => c.tipo === tipo), [categorias, tipo]);

  const hierarchy = useMemo(() => {
    const mainCats = allByType.filter((c) => !c.categoria_pai_id);
    const getSubs = (parentId: string) => allByType.filter((c) => c.categoria_pai_id === parentId);

    const result = mainCats.flatMap((main) => {
      const subs = getSubs(main.id);
      return [
        { ...main, isMain: true, level: 0 },
        ...subs.map((sub) => ({ ...sub, isMain: false, level: 1 })),
      ];
    });

    const orphans = allByType.filter(
      (c) => c.categoria_pai_id && !mainCats.some((main) => main.id === c.categoria_pai_id),
    );

    return [...result, ...orphans.map((sub) => ({ ...sub, isMain: false, level: 1 }))];
  }, [allByType]);

  const filtered = useMemo(() => {
    if (search.length < 3) return hierarchy;
    const term = search.toLowerCase();
    return hierarchy.filter((cat) => cat.nome.toLowerCase().includes(term));
  }, [hierarchy, search]);

  const selectedCat = allByType.find((c) => c.id === value);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSelect = (catId: string) => {
    onValueChange(catId);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        onClick={handleToggle}
        className="h-10 w-full justify-between font-normal"
      >
        {selectedCat ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selectedCat.cor }} />
            <span className="truncate">{selectedCat.nome}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center border-b px-3">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar categoria (min 3 letras)..."
                className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div
              className="max-h-[250px] overflow-y-auto overscroll-contain p-1"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {filtered.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Nenhuma categoria encontrada</div>
              ) : (
                filtered.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelect(cat.id)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      cat.level === 1 && "pl-6",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.cor }} />
                      <span className={cn("truncate", cat.isMain && "font-semibold")}>
                        {cat.level === 1 ? "↳ " : ""}
                        {cat.nome}
                      </span>
                    </div>
                    {value === cat.id && (
                      <Check className="ml-auto h-4 w-4 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CategoryCombobox;
