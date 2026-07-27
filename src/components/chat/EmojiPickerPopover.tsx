import { lazy, Suspense, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Smile, Loader2 } from 'lucide-react';

// Carrega o picker apenas quando aberto (chunk separado)
const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface Props {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPickerPopover({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 w-9 h-9"
              disabled={disabled}
              aria-label="Inserir emoji"
            >
              <Smile className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Emojis</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="p-0 border-border/60 bg-card overflow-hidden w-auto"
      >
        <Suspense
          fallback={
            <div className="w-[320px] h-[400px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <EmojiPicker
            theme={'dark' as never}
            lazyLoadEmojis
            width={320}
            height={400}
            searchPlaceholder="Buscar emoji..."
            previewConfig={{ showPreview: false }}
            onEmojiClick={(data: { emoji: string }) => {
              onSelect(data.emoji);
              setOpen(false);
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
