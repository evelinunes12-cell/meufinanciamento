import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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

const MIN_SEARCH_LENGTH = 3;

const CategoryCombobox = ({ categorias, tipo, value, onValueChange, placeholder = "Selecione uma categoria" }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const allByType = useMemo(() => categorias.filter((categoria) => categoria.tipo === tipo), [categorias, tipo]);

  const visibleCategories = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();

    if (!trimmedSearch) {
      return allByType;
    }

    if (trimmedSearch.length < MIN_SEARCH_LENGTH) {
      return [];
    }

    return allByType.filter((categoria) => categoria.nome.toLowerCase().includes(trimmedSearch));
  }, [allByType, search]);

  const hierarchy = useMemo(() => {
    const mainCats = visibleCategories.filter((categoria) => !categoria.categoria_pai_id);
    const getSubs = (parentId: string) => visibleCategories.filter((categoria) => categoria.categoria_pai_id === parentId);

    const result = mainCats.flatMap((main) => {
      const subs = getSubs(main.id);
      return [
        { ...main, isMain: true, level: 0 },
        ...subs.map((sub) => ({ ...sub, isMain: false, level: 1 })),
      ];
    });

    const orphans = visibleCategories.filter(
      (categoria) => categoria.categoria_pai_id && !mainCats.some((main) => main.id === categoria.categoria_pai_id),
    );

    return [...result, ...orphans.map((sub) => ({ ...sub, isMain: false, level: 1 }))];
  }, [visibleCategories]);

  const selectedCat = allByType.find((categoria) => categoria.id === value);
  const shouldShowMinSearchHint = search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
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
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Digite 3+ letras para buscar..."
            autoFocus
          />
          <CommandList>
            {shouldShowMinSearchHint ? (
              <CommandEmpty>Digite pelo menos 3 caracteres...</CommandEmpty>
            ) : hierarchy.length === 0 ? (
              <CommandEmpty>Nenhuma categoria encontrada</CommandEmpty>
            ) : (
              <CommandGroup>
                {hierarchy.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={`${cat.nome}-${cat.id}`}
                    onSelect={() => {
                      onValueChange(cat.id);
                      setOpen(false);
                    }}
                    className={cn(cat.level === 1 && "pl-6")}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.cor }} />
                      <span className={cn("truncate", cat.isMain && "font-semibold")}>
                        {cat.level === 1 ? "↳ " : ""}
                        {cat.nome}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0",
                        value === cat.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
