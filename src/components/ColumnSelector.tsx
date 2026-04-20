import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3, RotateCcw } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  /** If true, this column cannot be hidden (e.g. actions). */
  required?: boolean;
}

interface ColumnSelectorProps {
  columns: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onChange: (visible: Record<string, boolean>) => void;
  onReset?: () => void;
}

const ColumnSelector = ({ columns, visibleColumns, onChange, onReset }: ColumnSelectorProps) => {
  const toggle = (key: string, checked: boolean) => {
    onChange({ ...visibleColumns, [key]: checked });
  };

  const visibleCount = columns.filter(c => visibleColumns[c.key] !== false).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Columns3 className="h-4 w-4" />
          Colunas
          <span className="text-xs text-muted-foreground">
            {visibleCount}/{columns.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Colunas visíveis</span>
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" />
              Padrão
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-1 space-y-0.5 max-h-[300px] overflow-y-auto">
          {columns.map((col) => {
            const checked = visibleColumns[col.key] !== false;
            const disabled = col.required;
            return (
              <label
                key={col.key}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent ${
                  disabled ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(c) => !disabled && toggle(col.key, !!c)}
                />
                <Label className="flex-1 cursor-pointer font-normal">
                  {col.label}
                  {col.required && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(fixa)</span>
                  )}
                </Label>
              </label>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColumnSelector;
