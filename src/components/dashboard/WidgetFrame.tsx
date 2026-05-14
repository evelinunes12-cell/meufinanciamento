import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SIZE_TO_COLSPAN, SIZE_LABELS, WidgetSize } from "@/hooks/useDashboardLayout";

interface WidgetFrameProps {
  id: string;
  size: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onHide: () => void;
  customizing: boolean;
  children: ReactNode;
  /** Rótulo curto exibido na barra de personalização. */
  label?: string;
}

const WidgetFrame = ({ id, size, onSizeChange, onHide, customizing, children, label }: WidgetFrameProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative col-span-1",
        SIZE_TO_COLSPAN[size],
        isDragging && "opacity-70 ring-2 ring-primary/50 rounded-xl",
      )}
    >
      {customizing && (
        <div className="absolute -top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 rounded-md border border-border/70 bg-popover/95 backdrop-blur px-2 py-1 shadow-md">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              {...attributes}
              {...listeners}
              type="button"
              aria-label="Arrastar para reordenar"
              className="p-1 rounded hover:bg-accent cursor-grab active:cursor-grabbing text-muted-foreground"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            {label && <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>}
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] gap-1">
                  <Maximize2 className="h-3 w-3" />
                  {SIZE_LABELS[size]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-popover">
                <DropdownMenuLabel className="text-xs">Tamanho</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(SIZE_LABELS) as WidgetSize[]).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onSizeChange(s)} className="text-xs">
                    {SIZE_LABELS[s]}
                    {s === size && <span className="ml-auto text-primary">•</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onHide} aria-label="Ocultar widget">
                  <EyeOff className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                <p className="text-xs">Ocultar widget</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <div className={cn(customizing && "ring-1 ring-dashed ring-border rounded-xl pt-3")}>{children}</div>
    </div>
  );
};

export default WidgetFrame;

/**
 * Versão "estática" do frame para widgets que não devem ser arrastados/redimensionados
 * mas que precisam respeitar o sistema de visibilidade (ex.: KPIs hero).
 */
export const SimpleHideToggle = ({ visible, onToggle }: { visible: boolean; onToggle: () => void }) => (
  <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px]" onClick={onToggle}>
    {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
    {visible ? "Ocultar" : "Mostrar"}
  </Button>
);
