import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2, RotateCcw, ArrowUp, ArrowDown, Pencil, Check } from "lucide-react";

import {
  WidgetCatalog,
  WidgetConfig,
  WidgetSize,
  SIZE_LABELS,
} from "@/hooks/useDashboardLayout";

interface CustomizeDashboardModalProps {
  catalog: WidgetCatalog;
  layout: WidgetConfig[];
  onLayoutChange: (next: WidgetConfig[]) => void;
  onReset: () => void;
  customizing: boolean;
  onCustomizingChange: (v: boolean) => void;
}

export function CustomizeDashboardModal({
  catalog,
  layout,
  onLayoutChange,
  onReset,
  customizing,
  onCustomizingChange,
}: CustomizeDashboardModalProps) {
  const [open, setOpen] = useState(false);

  const updateAt = (index: number, partial: Partial<WidgetConfig>) => {
    const next = layout.map((w, i) => (i === index ? { ...w, ...partial } : w));
    onLayoutChange(next);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    onLayoutChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={customizing ? "default" : "outline"}
        size="sm"
        onClick={() => onCustomizingChange(!customizing)}
        title={customizing ? "Concluir personalização" : "Personalizar layout (arrastar e redimensionar)"}
      >
        {customizing ? <Check className="h-4 w-4 sm:mr-2" /> : <Pencil className="h-4 w-4 sm:mr-2" />}
        <span className="hidden sm:inline">{customizing ? "Concluir" : "Editar layout"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Personalizar dashboard" title="Mais opções">
            <Settings2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Widgets</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Personalizar dashboard</DialogTitle>
            <DialogDescription>
              Mostre/oculte, reordene e ajuste o tamanho de cada widget.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {layout.map((w, i) => {
              const meta = catalog[w.id];
              if (!meta) return null;
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card p-2"
                >
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => move(i, 1)}
                      disabled={i === layout.length - 1}
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>

                  <Label htmlFor={`vis-${w.id}`} className="flex-1 cursor-pointer text-sm font-normal">
                    {meta.label}
                  </Label>

                  <Select
                    value={w.size}
                    onValueChange={(v) => updateAt(i, { size: v as WidgetSize })}
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SIZE_LABELS) as WidgetSize[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {SIZE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Switch
                    id={`vis-${w.id}`}
                    checked={w.visible}
                    onCheckedChange={(c) => updateAt(i, { visible: c })}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1">
              <RotateCcw className="h-3 w-3" />
              Restaurar padrão
            </Button>
            <Button onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
