import { useEffect, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useUpdateLeadFinance, useUpdateProcedureDiscount, useLeadPaymentAttachments,
  useUploadPaymentAttachment, useDeletePaymentAttachment, getAttachmentSignedUrl,
  useLeadHistory, useConfirmPayment, type LeadHistoryEntry,
  PAYMENT_METHODS, PAYMENT_REFERENCE_LABEL, type BudgetRow,
} from '@/hooks/finance/useBudgets';
import { useLeadProcedures, useAddLeadProduct, useRemoveLeadProcedure } from '@/hooks/useLeadProcedures';
import { useProducts } from '@/hooks/useProducts';
import { useMedicalInsurances } from '@/hooks/medical/useMedicalCatalogs';
import { useAuth } from '@/contexts/AuthContext';
import { formatBRL } from '@/lib/finance';
import {
  Paperclip, Trash2, Download, Save, CheckCircle2, Loader2, RotateCcw,
  Info, Receipt, StickyNote, Percent, Wallet, LayoutGrid, History, Package, Stethoscope, Plus,

} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { DiscountDialog } from './DiscountDialog';

interface Props {
  row: BudgetRow | null;
  onOpenChange: (open: boolean) => void;
}

type TabKey = 'summary' | 'items' | 'history';

export function BudgetDetailDrawer({ row, onOpenChange }: Props) {
  const { profile } = useAuth();
  const updateFin = useUpdateLeadFinance();
  const updateProc = useUpdateProcedureDiscount();
  const upload = useUploadPaymentAttachment();
  const del = useDeletePaymentAttachment();
  const { data: procedures = [] } = useLeadProcedures(row?.id ?? null);
  const { data: attachments = [] } = useLeadPaymentAttachments(row?.id ?? null);
  const { data: insurances = [] } = useMedicalInsurances({ onlyActive: true });
  const { data: history = [] } = useLeadHistory(row?.id ?? null);

  const [tab, setTab] = useState<TabKey>('summary');
  const [value, setValue] = useState('');
  const [method, setMethod] = useState('');
  const [methodOther, setMethodOther] = useState('');
  const [insuranceName, setInsuranceName] = useState('');
  const [installments, setInstallments] = useState(1);
  const [reference, setReference] = useState('');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const confirm = useConfirmPayment();
  const [discountOpen, setDiscountOpen] = useState(false);
  const [itemDiscount, setItemDiscount] = useState<{ id: string; name: string; base: number; pct: number | null; amount: number | null } | null>(null);

  useEffect(() => {
    if (row) {
      setTab('summary');
      setValue(String(row.value ?? ''));
      const pm = row.payment_method ?? '';
      if (pm.startsWith('Outro:')) {
        setMethod('Outro');
        setMethodOther(pm.slice(6).trim());
        setInsuranceName('');
      } else if (pm.startsWith('Convênio:')) {
        setMethod('Convênio');
        setInsuranceName(pm.slice(9).trim());
        setMethodOther('');
      } else {
        setMethod(pm);
        setMethodOther('');
        setInsuranceName('');
      }
      setInstallments(row.payment_installments ?? 1);
      setReference(row.payment_reference ?? '');
      setInvoice(row.invoice_number ?? '');
      setNotes(row.finance_notes ?? '');
    }
  }, [row?.id]);

  if (!row) return null;

  const paid = !!row.payment_confirmed_at;
  const isCard = method === 'Cartão de Crédito';
  const isOther = method === 'Outro';
  const isInsurance = method === 'Convênio';
  const refLabel = PAYMENT_REFERENCE_LABEL[method] ?? 'Referência';
  const softInput = 'h-9 mt-1 rounded-lg';

  const procDiscountTotal = procedures.reduce((s, p: any) => {
    const base = Number(p.price_snapshot ?? 0) * (Number(p.quantity) || 1);
    const d = Number(p.discount_amount ?? (base * Number(p.discount_pct ?? 0) / 100));
    return s + (isFinite(d) ? d : 0);
  }, 0);

  const onFiles = async (files: FileList | null, kind: 'receipt' | 'invoice' | 'other') => {
    if (!files || !profile?.company_id) return;
    for (const f of Array.from(files)) {
      await upload.mutateAsync({ leadId: row.id, companyId: profile.company_id, file: f, kind });
    }
  };

  const download = async (path: string, name: string) => {
    const url = await getAttachmentSignedUrl(path);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank'; a.click();
  };

  const composedMethod = (() => {
    if (!method) return null;
    if (isOther && methodOther.trim()) return `Outro: ${methodOther.trim().slice(0, 80)}`;
    if (isInsurance && insuranceName) return `Convênio: ${insuranceName}`;
    return method;
  })();

  const handleSaveAll = async () => {
    const patch: Record<string, any> = {
      value: Number(String(value).replace(',', '.')) || 0,
      payment_method: composedMethod,
      payment_installments: isCard ? installments : 1,
      payment_reference: reference || null,
      invoice_number: invoice || null,
      finance_notes: notes || null,
    };
    await updateFin.mutateAsync({ leadId: row.id, patch });
    toast.success('Alterações salvas');
    onOpenChange(false);
  };

  const handleUndoPayment = async () => {
    await updateFin.mutateAsync({
      leadId: row.id,
      patch: { payment_confirmed_at: null, payment_confirmed_by: null },
    });
    toast.success('Pagamento desfeito');
  };

  const handleConfirmPayment = async () => {
    if (!composedMethod) {
      toast.error('Selecione a forma de pagamento');
      return;
    }
    if (!reference.trim()) {
      toast.error(`Informe ${refLabel.toLowerCase()}`);
      return;
    }
    const patch: Record<string, any> = {
      value: Number(String(value).replace(',', '.')) || 0,
      payment_method: composedMethod,
      payment_installments: isCard ? installments : 1,
      payment_reference: reference || null,
      invoice_number: invoice || null,
      finance_notes: notes || null,
    };
    await updateFin.mutateAsync({ leadId: row.id, patch });
    await confirm.mutateAsync({
      leadId: row.id,
      method: composedMethod,
      installments: isCard ? installments : 1,
      reference: reference.trim() || null,
      invoiceNumber: invoice.trim() || null,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  const tabTrigger = "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5";

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>#{row.numeric_id}</span>
            <span>·</span>
            <span>{format(new Date(row.created_at), 'dd/MM/yyyy')}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-0.5">
            <div className="text-lg font-semibold truncate">{row.name}</div>
            {paid && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald/15 text-emerald border border-emerald/30">
                <CheckCircle2 className="w-3 h-3" />
                Pago {format(new Date(row.payment_confirmed_at!), 'dd/MM/yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Locked banner */}
        {paid && (
          <div className="px-5 py-2 border-b border-border bg-emerald/5 text-xs text-emerald flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pagamento confirmado — desfaça para editar os campos.
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 border-b border-border shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger value="summary" className={tabTrigger}>
                <Info className="w-3.5 h-3.5 text-primary" /> Resumo
              </TabsTrigger>
              <TabsTrigger value="items" className={tabTrigger}>
                <Receipt className="w-3.5 h-3.5 text-primary" /> Itens
              </TabsTrigger>
              <TabsTrigger value="history" className={tabTrigger}>
                <History className="w-3.5 h-3.5 text-primary" /> Histórico
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {/* Resumo + Pagamento */}
            <TabsContent value="summary" className="m-0 px-5 py-5 space-y-3 [&>section]:rounded-xl [&>section]:border [&>section]:border-border [&>section]:bg-card/40 [&>section]:p-4 [&>section>h3]:text-xs [&>section>h3]:font-semibold [&>section>h3]:text-foreground [&>section>h3]:normal-case [&>section>h3]:tracking-normal">
              {/* Visão geral */}
              <section className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3 text-primary" /> Visão geral
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Valor bruto" value={formatBRL(row.value ?? 0)} />
                  <Stat label="Desconto" value={formatBRL(Number(row.discount_amount ?? 0) + procDiscountTotal)} tone="amber" />
                  <Stat label="Valor líquido" value={formatBRL(Math.max(Number(row.value ?? 0) - Number(row.discount_amount ?? 0) - procDiscountTotal, 0))} tone="emerald" />
                  <Stat label="Confirmado em" value={row.payment_confirmed_at ? format(new Date(row.payment_confirmed_at), 'dd/MM/yyyy HH:mm') : '—'} />
                </div>
              </section>

              {/* Pagamento (inclui valor da ficha + desconto global) */}
              <section className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                  <Wallet className="w-3 h-3 text-primary" /> Pagamento
                </h3>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-amber" />
                      Desconto global
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {row.discount_pct
                        ? `${row.discount_pct}% aplicado`
                        : row.discount_amount
                        ? `${formatBRL(Number(row.discount_amount))} aplicado`
                        : 'Nenhum desconto aplicado'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={paid}
                    onClick={() => setDiscountOpen(true)}
                  >
                    {row.discount_pct || row.discount_amount ? 'Alterar' : 'Aplicar'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Método</Label>
                    <Select value={method} onValueChange={setMethod} disabled={paid}>
                      <SelectTrigger className={softInput}><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isCard && (
                    <div>
                      <Label className="text-xs">Parcelas</Label>
                      <Input
                        type="number" min={1} max={12} value={installments}
                        onChange={(e) => setInstallments(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                        disabled={paid}
                        className={softInput}
                      />
                    </div>
                  )}
                  {isOther && (
                    <div>
                      <Label className="text-xs">Especifique o método</Label>
                      <Input
                        value={methodOther}
                        onChange={(e) => setMethodOther(e.target.value.slice(0, 80))}
                        placeholder="Ex.: Permuta, Cortesia..."
                        maxLength={80}
                        disabled={paid}
                        className={softInput}
                      />
                    </div>
                  )}
                  {isInsurance && (
                    <div>
                      <Label className="text-xs">Convênio</Label>
                      <SearchableSelect
                        value={insuranceName}
                        onValueChange={setInsuranceName}
                        disabled={paid}
                        options={insurances.map((ins: any) => ({ value: ins.name, label: ins.name }))}
                        placeholder={insurances.length ? 'Selecionar...' : 'Nenhum cadastrado'}
                        searchPlaceholder="Buscar convênio..."
                        emptyText="Nenhum convênio encontrado."
                        className={softInput}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{refLabel}</Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={paid} className={softInput} />
                  </div>
                  <div>
                    <Label className="text-xs">Número da NF</Label>
                    <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} disabled={paid} className={softInput} />
                  </div>
                </div>
              </section>

              {/* Anexos */}
              <section className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3 text-primary" /> Anexos
                </h3>
                {!paid && (
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input type="file" multiple className="hidden" accept="application/pdf,image/*"
                        onChange={(e) => { onFiles(e.target.files, 'receipt'); e.target.value = ''; }} />
                      <div className="text-xs border border-dashed border-border rounded p-2 text-center hover:bg-muted/30">+ Recibo</div>
                    </label>
                    <label className="flex-1 cursor-pointer">
                      <input type="file" multiple className="hidden" accept="application/pdf,image/*"
                        onChange={(e) => { onFiles(e.target.files, 'invoice'); e.target.value = ''; }} />
                      <div className="text-xs border border-dashed border-border rounded p-2 text-center hover:bg-muted/30">+ NF</div>
                    </label>
                  </div>
                )}
                {upload.isPending && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />Enviando...
                  </div>
                )}
                <ul className="space-y-1">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs border border-border rounded px-2 py-1.5">
                      <span className="truncate flex-1">
                        {a.file_name} <span className="text-muted-foreground">· {a.kind}</span>
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => download(a.storage_path, a.file_name)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {!paid && (
                          <button
                            onClick={() => del.mutate({ id: a.id, leadId: a.lead_id, storagePath: a.storage_path })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Observações */}
              <section className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                  <StickyNote className="w-3 h-3 text-primary" /> Observações
                </h3>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  disabled={paid}
                  placeholder="Observações financeiras..."
                  className="rounded-lg"
                />
              </section>
            </TabsContent>

            {/* Itens */}
            <TabsContent value="items" className="m-0 px-5 py-5">
              <ItemsSection
                procedures={procedures}
                leadId={row.id}
                disabled={paid}
                onApplyDiscount={(t) => setItemDiscount(t)}
              />
            </TabsContent>


            {/* Histórico */}
            <TabsContent value="history" className="m-0 px-5 py-5">
              <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-primary" /> Histórico
                </h3>
                <HistoryPanel entries={history} />
              </section>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {paid ? (
            <Button
              variant="outline"
              onClick={handleUndoPayment}
              disabled={updateFin.isPending}
              className="w-full h-10"
            >
              {updateFin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Desfazer pagamento
            </Button>
          ) : (
            <>
              <Button
                onClick={handleConfirmPayment}
                disabled={confirm.isPending || updateFin.isPending}
                className="w-full h-10 bg-emerald hover:bg-emerald/90 text-emerald-foreground"
              >
                {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirmar pagamento
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveAll}
                disabled={updateFin.isPending}
                className="w-full h-10"
              >
                {updateFin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar alterações
              </Button>
            </>
          )}
        </div>
      </SheetContent>




      <DiscountDialog
        lead={(discountOpen || itemDiscount) ? {
          id: row.id, name: row.name, value: Number(row.value ?? 0),
          pct: itemDiscount ? itemDiscount.pct : row.discount_pct,
          amount: itemDiscount ? itemDiscount.amount : row.discount_amount,
        } : null}
        procedure={itemDiscount ? { id: itemDiscount.id, name: itemDiscount.name, base: itemDiscount.base } : null}
        onOpenChange={(open) => {
          if (!open) { setDiscountOpen(false); setItemDiscount(null); }
        }}
      />
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald' : tone === 'amber' ? 'text-amber' : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium tabular-nums mt-0.5 ${c}`}>{value}</div>
    </div>
  );
}

function ProcRow({ proc, disabled, onApply, onRemove }: {
  proc: any;
  disabled?: boolean;
  onApply: (t: { id: string; name: string; base: number; pct: number | null; amount: number | null }) => void;
  onRemove?: (id: string) => void;
}) {
  const unit = Number(proc.price_snapshot ?? 0);
  const qty = Number(proc.quantity) || 1;
  const base = unit * qty;
  const pct = proc.discount_pct != null ? Number(proc.discount_pct) : null;
  const amt = proc.discount_amount != null ? Number(proc.discount_amount) : null;
  const disc = amt != null && amt > 0 ? amt : (base * (pct ?? 0)) / 100;
  const net = Math.max(base - disc, 0);
  const hasDiscount = (pct ?? 0) > 0 || (amt ?? 0) > 0;
  const isProduct = proc.item_type === 'product';
  const itemName = isProduct
    ? (proc.product?.name ?? proc.item_name_snapshot ?? '—')
    : (proc.procedure?.name ?? '—');

  return (
    <tr className="border-t border-border align-middle">
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <ItemTypeBadge type={isProduct ? 'product' : 'service'} />
          <span className="truncate">{itemName}</span>
        </div>
      </td>
      <td className="py-2 tabular-nums">{formatBRL(unit)}</td>
      <td className="py-2 tabular-nums text-muted-foreground">×{qty}</td>
      <td className="py-2 text-xs">
        {hasDiscount ? (
          <span className="text-amber tabular-nums">
            {pct != null && pct > 0 ? `${pct}%` : formatBRL(amt ?? 0)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 tabular-nums text-emerald">{formatBRL(net)}</td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => onApply({ id: proc.id, name: itemName, base, pct, amount: amt })}
          >
            {hasDiscount ? 'Alterar' : 'Aplicar'}
          </Button>
          {onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => onRemove(proc.id)}
              title="Remover item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ItemTypeBadge({ type }: { type: 'service' | 'product' }) {
  if (type === 'product') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber/30 bg-amber/10 text-amber">
        <Package className="w-3 h-3" /> Produto
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
      <Stethoscope className="w-3 h-3" /> Serviço
    </span>
  );
}

function ItemsSection({ procedures, leadId, disabled, onApplyDiscount }: {
  procedures: any[];
  leadId: string;
  disabled?: boolean;
  onApplyDiscount: (t: { id: string; name: string; base: number; pct: number | null; amount: number | null }) => void;
}) {
  const { data: products = [] } = useProducts({ onlyActive: true });
  const addProduct = useAddLeadProduct();
  const removeItem = useRemoveLeadProcedure();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productId, setProductId] = useState<string>('');

  const totals = procedures.reduce(
    (acc, p: any) => {
      const unit = Number(p.price_snapshot ?? 0);
      const qty = Number(p.quantity) || 1;
      const base = unit * qty;
      const pct = p.discount_pct != null ? Number(p.discount_pct) : null;
      const amt = p.discount_amount != null ? Number(p.discount_amount) : null;
      const disc = amt != null && amt > 0 ? amt : (base * (pct ?? 0)) / 100;
      const net = Math.max(base - disc, 0);
      if (p.item_type === 'product') {
        acc.products += net;
        acc.productsCount += 1;
      } else {
        acc.services += net;
        acc.servicesCount += 1;
      }
      acc.total += net;
      return acc;
    },
    { services: 0, products: 0, total: 0, servicesCount: 0, productsCount: 0 },
  );

  const handleAddProduct = async () => {
    if (!productId) return;
    await addProduct.mutateAsync({ leadId, productId });
    setProductId('');
    setPickerOpen(false);
  };

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5 text-primary" /> Itens
        </h3>
        {!disabled && (
          pickerOpen ? (
            <div className="flex items-center gap-2">
              <SearchableSelect
                value={productId}
                onValueChange={setProductId}
                options={products.map((p: any) => ({
                  value: p.id,
                  label: `${p.name}${p.sku ? ` · ${p.sku}` : ''} — ${formatBRL(Number(p.base_price) || 0)}`,
                }))}
                placeholder={products.length ? 'Selecionar produto...' : 'Nenhum cadastrado'}
                searchPlaceholder="Buscar produto..."
                emptyText="Nenhum produto encontrado."
                className="h-8 text-xs min-w-[260px]"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!productId || addProduct.isPending}
                onClick={handleAddProduct}
              >
                {addProduct.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Adicionar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setPickerOpen(false); setProductId(''); }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Produto
            </Button>
          )
        )}
      </div>

      {procedures.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          Nenhum item vinculado.
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2 w-[80px]">Preço</th>
                <th className="text-left py-2 w-[50px]">Qtd</th>
                <th className="text-left py-2 w-[110px]">Desconto</th>
                <th className="text-left py-2 w-[90px]">Líquido</th>
                <th className="text-right py-2 w-[110px]"></th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((p: any) => (
                <ProcRow
                  key={p.id}
                  proc={p}
                  disabled={disabled}
                  onApply={onApplyDiscount}
                  onRemove={
                    p.item_type === 'product'
                      ? (id) => removeItem.mutate({ id, leadId })
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>

          {/* Strip de totais Serviços × Produtos */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
            <TotalCell
              label="Serviços"
              icon={<Stethoscope className="w-3 h-3" />}
              count={totals.servicesCount}
              value={totals.services}
              tone="primary"
            />
            <TotalCell
              label="Produtos"
              icon={<Package className="w-3 h-3" />}
              count={totals.productsCount}
              value={totals.products}
              tone="amber"
            />
            <TotalCell
              label="Total líquido"
              count={totals.servicesCount + totals.productsCount}
              value={totals.total}
              tone="emerald"
              strong
            />
          </div>
        </>
      )}
    </section>
  );
}

function TotalCell({ label, icon, count, value, tone, strong }: {
  label: string;
  icon?: React.ReactNode;
  count: number;
  value: number;
  tone: 'primary' | 'amber' | 'emerald';
  strong?: boolean;
}) {
  const c = tone === 'primary' ? 'text-primary' : tone === 'amber' ? 'text-amber' : 'text-emerald';
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2.5">
      <div className={`text-[10px] uppercase tracking-wide flex items-center gap-1 ${c}`}>
        {icon}{label}
      </div>
      <div className={`${strong ? 'text-base font-semibold' : 'text-sm font-medium'} tabular-nums mt-0.5 ${c}`}>
        {formatBRL(value)}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{count} {count === 1 ? 'item' : 'itens'}</div>
    </div>
  );
}


const FINANCE_EVENT_TYPES = new Set([
  'finance_update',
  'discount_released',
  'discount_item_released',
  'attachment_added',
  'attachment_removed',
  'payment_confirmed',
  'payment_undone',
]);

const FINANCE_FIELD_LABELS: Record<string, string> = {
  value: 'Valor',
  payment_method: 'Método de pagamento',
  payment_installments: 'Parcelas',
  payment_reference: 'Referência',
  invoice_number: 'Número da NF',
  finance_notes: 'Observações',
};

function iconForFinanceEvent(type: string) {
  switch (type) {
    case 'discount_released':
    case 'discount_item_released':
      return Percent;
    case 'attachment_added':
    case 'attachment_removed':
      return Paperclip;
    case 'payment_confirmed':
      return CheckCircle2;
    case 'payment_undone':
      return RotateCcw;
    default:
      return Wallet;
  }
}

function fmtVal(field: string, v: any): string {
  if (v == null || v === '') return '—';
  if (field === 'value') return formatBRL(Number(v));
  return String(v);
}

function describeFinanceEntry(e: LeadHistoryEntry): string[] {
  const p = e.payload ?? {};
  const lines: string[] = [];

  if (e.event_type === 'finance_update' && Array.isArray(p.changes)) {
    for (const c of p.changes) {
      if (c.field === 'payment_confirmed') { lines.push('Pagamento confirmado'); continue; }
      if (c.field === 'payment_undone') { lines.push('Pagamento desfeito'); continue; }
      const label = FINANCE_FIELD_LABELS[c.field] ?? c.field;
      lines.push(`${label} alterado de ${fmtVal(c.field, c.old)} para ${fmtVal(c.field, c.new)}`);
    }
    return lines;
  }
  if (e.event_type === 'payment_confirmed') return ['Pagamento confirmado'];
  if (e.event_type === 'payment_undone') return ['Pagamento desfeito'];
  if (e.event_type === 'discount_released') {
    const what = p.new_pct ? `${p.new_pct}%` : p.new_amount ? formatBRL(Number(p.new_amount)) : 'sem valor';
    return [`Desconto global de ${what} aplicado${p.reason ? ` — motivo: ${p.reason}` : ''}`];
  }
  if (e.event_type === 'discount_item_released') {
    const what = p.new_pct ? `${p.new_pct}%` : p.new_amount ? formatBRL(Number(p.new_amount)) : 'sem valor';
    return [`Desconto de ${what} aplicado em ${p.procedure_name ?? 'item'}${p.reason ? ` — motivo: ${p.reason}` : ''}`];
  }
  if (e.event_type === 'attachment_added') {
    const kind = p.kind === 'invoice' ? 'NF' : p.kind === 'receipt' ? 'recibo' : (p.kind ?? 'anexo');
    return [`Anexo adicionado: ${p.file_name ?? 'arquivo'} (${kind})`];
  }
  if (e.event_type === 'attachment_removed') {
    return [`Anexo removido: ${p.file_name ?? 'arquivo'}`];
  }
  return [];
}

function HistoryPanel({ entries }: { entries: LeadHistoryEntry[] }) {
  const filtered = entries.filter((e) => FINANCE_EVENT_TYPES.has(e.event_type));

  if (!filtered.length) {
    return (
      <div className="text-xs text-muted-foreground/70 px-1 py-2">
        Nenhuma ação financeira registrada ainda.
      </div>
    );
  }

  return (
    <ol className="relative space-y-3 pl-5 border-l border-border/50">
      {filtered.map((e) => {
        const Icon = iconForFinanceEvent(e.event_type);
        const lines = describeFinanceEntry(e);
        const d = new Date(e.created_at);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground">
              <Icon className="w-3 h-3" />
            </span>
            <div className="text-xs">
              {lines.length > 0 ? (
                lines.map((l, i) => (
                  <p key={i} className="text-foreground/90 leading-snug">{l}</p>
                ))
              ) : (
                <p className="text-foreground/90 leading-snug">Ação registrada</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {e.actor_name && <span>{e.actor_name} · </span>}
                {format(d, "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
