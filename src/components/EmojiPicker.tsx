import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Veículos",
    emojis: ["🚗", "🚙", "🏍️", "🚚", "🚛", "🚐", "🛵", "🚲", "✈️", "⛵", "🛻", "🚜"],
  },
  {
    label: "Imóveis",
    emojis: ["🏠", "🏡", "🏢", "🏘️", "🏬", "🏗️", "🛋️", "🛏️", "🪟", "🚪", "🏚️", "🏛️"],
  },
  {
    label: "Finanças",
    emojis: ["💰", "💵", "💴", "💶", "💷", "💸", "🏦", "💳", "🪙", "📈", "📉", "📊"],
  },
  {
    label: "Pessoal",
    emojis: ["🎓", "📚", "💼", "👔", "👗", "💍", "🎁", "🎉", "🏥", "💊", "🦷", "👨‍⚕️"],
  },
  {
    label: "Tecnologia",
    emojis: ["💻", "📱", "🖥️", "⌚", "🎮", "📷", "🎧", "🖨️", "📺", "🔌", "💡", "🛠️"],
  },
  {
    label: "Outros",
    emojis: ["📄", "📌", "⭐", "❤️", "🔑", "🎯", "🚀", "🌟", "🔥", "⚡", "🏆", "✅"],
  },
];

export const EmojiPicker = ({ value, onChange, placeholder = "Selecione um ícone", id }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-16 h-10 text-2xl shrink-0 px-0",
              !value && "text-muted-foreground text-base"
            )}
            aria-label="Escolher emoji"
          >
            {value || "😀"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{cat.label}</p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded text-lg hover:bg-accent transition-colors",
                        value === emoji && "bg-accent ring-1 ring-primary"
                      )}
                      aria-label={`Selecionar ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => handleSelect("")}
            >
              Remover ícone
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={4}
        className="flex-1"
      />
    </div>
  );
};

export default EmojiPicker;
