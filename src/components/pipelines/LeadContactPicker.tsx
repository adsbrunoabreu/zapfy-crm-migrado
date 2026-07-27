import { useMemo, useState } from 'react';
import { MessageCircle, Search, Check, Phone as PhoneIcon, ArrowRightLeft, AlertCircle, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  useLeadContact,
  useSearchContacts,
  useLinkContactToLead,
  type ContactConversation,
} from '@/hooks/useLeadContact';
import { cn } from '@/lib/utils';

interface LeadContactPickerProps {
  leadId: string;
  leadPhone: string | null | undefined;
  leadName: string | null | undefined;
  onContactPicked?: (info: { phone: string | null; contactName: string | null }) => void;
}

function initials(name?: string | null) {
  const n = (name || '').trim();
  return n ? n[0]!.toUpperCase() : '?';
}

function formatPhone(phone?: string | null) {
  if (!phone) return 'Sem telefone';
  return phone;
}

export function LeadContactPicker({
  leadId,
  leadPhone,
  leadName,
  onContactPicked,
}: LeadContactPickerProps) {
  const { data, isLoading } = useLeadContact(leadId, leadPhone || null);
  const linkContact = useLinkContactToLead();

  const contact = data?.linked || data?.suggested || null;
  const isLinked = !!data?.linked;
  const isSuggested = !data?.linked && !!data?.suggested;

  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = async (c: ContactConversation) => {
    setPickerOpen(false);
    await linkContact.mutateAsync({
      leadId,
      conversationId: c.id,
      phone: c.phone,
      contactName: c.contact_name,
      currentLeadName: leadName ?? null,
    });
    onContactPicked?.({ phone: c.phone, contactName: c.contact_name });
  };

  const confirmSuggested = async () => {
    if (!data?.suggested) return;
    await linkContact.mutateAsync({
      leadId,
      conversationId: data.suggested.id,
      phone: data.suggested.phone,
      contactName: data.suggested.contact_name,
      currentLeadName: leadName ?? null,
    });
    onContactPicked?.({
      phone: data.suggested.phone,
      contactName: data.suggested.contact_name,
    });
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-muted-foreground" />
        Contato do WhatsApp
      </Label>

      <div className="rounded-lg border border-border bg-background/40 p-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando contato...
          </div>
        ) : contact ? (
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 shrink-0">
              {contact.contact_photo_url && (
                <AvatarImage src={contact.contact_photo_url} alt={contact.contact_name || 'Contato'} />
              )}
              <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">
                {initials(contact.contact_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {contact.contact_name || 'Sem nome'}
                </span>
                {isLinked ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 border-emerald-500/40 text-emerald-400">
                    <Check className="w-3 h-3" /> Vinculado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 border-amber-500/40 text-amber-400">
                    <AlertCircle className="w-3 h-3" /> Sugerido
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <PhoneIcon className="w-3 h-3" />
                {formatPhone(contact.phone)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {isSuggested && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 px-2 text-xs"
                  onClick={confirmSuggested}
                  disabled={linkContact.isPending}
                >
                  {linkContact.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirmar'}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setPickerOpen(true)}
              >
                <ArrowRightLeft className="w-3 h-3" /> Trocar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Nenhum contato do WhatsApp encontrado para este telefone.
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1 shrink-0"
              onClick={() => setPickerOpen(true)}
            >
              <Search className="w-3 h-3" /> Selecionar
            </Button>
          </div>
        )}
      </div>

      <ContactPickerPopover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePick}
        currentId={contact?.id ?? null}
      />
    </div>
  );
}

function ContactPickerPopover({
  open,
  onOpenChange,
  onPick,
  currentId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (c: ContactConversation) => void;
  currentId: string | null;
}) {
  const [query, setQuery] = useState('');
  const { data: results, isLoading } = useSearchContacts(query);

  const items = useMemo(() => results || [], [results]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="sr-only">Trocar contato</span>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end" sideOffset={6}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome ou telefone..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading && (
              <div className="px-3 py-4 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
            )}
            {items.length > 0 && (
              <CommandGroup heading="Contatos do WhatsApp">
                {items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.contact_name || ''} ${c.phone || ''} ${c.id}`}
                    onSelect={() => onPick(c)}
                    className={cn('flex items-center gap-2', currentId === c.id && 'opacity-60')}
                  >
                    <Avatar className="w-7 h-7 shrink-0">
                      {c.contact_photo_url && <AvatarImage src={c.contact_photo_url} />}
                      <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
                        {initials(c.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {c.contact_name || 'Sem nome'}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {formatPhone(c.phone)}
                        {c.lead_id && c.lead_id !== currentId && ' · já vinculado a outro lead'}
                      </div>
                    </div>
                    {currentId === c.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
