import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paintbrush } from "lucide-react";

const PRESET_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_COLORS.map((cor) => (
        <button
          key={cor}
          type="button"
          className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${value === cor ? "border-foreground scale-110" : "border-transparent"}`}
          style={{ backgroundColor: cor }}
          onClick={() => onChange(cor)}
        />
      ))}

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${
              !PRESET_COLORS.includes(value) ? "border-foreground scale-110" : "border-muted-foreground/40"
            }`}
            style={{
              backgroundColor: !PRESET_COLORS.includes(value) ? value : undefined,
            }}
            title="Cor personalizada"
          >
            {PRESET_COLORS.includes(value) && (
              <Paintbrush className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-3" align="start">
          <p className="text-sm font-medium text-foreground">Cor personalizada</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-border bg-transparent p-0"
            />
            <Input
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
              }}
              placeholder="#FF5500"
              className="font-mono text-sm"
              maxLength={7}
            />
          </div>
          <div
            className="h-8 rounded-md border border-border"
            style={{ backgroundColor: value }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ColorPicker;
