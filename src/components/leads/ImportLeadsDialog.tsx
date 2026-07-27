import { useState, useCallback } from 'react';
import { Upload, FileText, X, AlertCircle, Check, Loader2, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePipelines } from '@/hooks/usePipelines';
import { useBulkCreateLeads } from '@/hooks/useLeads';

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedLead {
  name: string;
  phone?: string;
  email?: string;
  value?: number;
  valid: boolean;
  errors: string[];
}

export function ImportLeadsDialog({ open, onOpenChange }: ImportLeadsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const { data: pipelines } = usePipelines();
  const bulkCreate = useBulkCreateLeads();

  const selectedPipeline = pipelines?.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages || [];

  const normalizePhone = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith('55')) {
      return '55' + cleaned;
    }
    return cleaned;
  };

  const validateLead = (lead: Partial<ParsedLead>): ParsedLead => {
    const errors: string[] = [];
    
    if (!lead.name || lead.name.trim() === '') {
      errors.push('Nome obrigatório');
    }

    return {
      name: lead.name || '',
      phone: lead.phone ? normalizePhone(lead.phone) : undefined,
      email: lead.email || undefined,
      value: lead.value || undefined,
      valid: errors.length === 0,
      errors,
    };
  };

  const parseCSV = (content: string): ParsedLead[] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
    const nameIdx = header.findIndex(h => ['nome', 'name', 'lead'].includes(h));
    const phoneIdx = header.findIndex(h => ['telefone', 'phone', 'celular', 'whatsapp'].includes(h));
    const emailIdx = header.findIndex(h => ['email', 'e-mail'].includes(h));
    const valueIdx = header.findIndex(h => ['valor', 'value', 'preço', 'price'].includes(h));

    return lines.slice(1).map(line => {
      const cols = line.split(/[,;]/).map(c => c.trim());
      const lead: Partial<ParsedLead> = {
        name: nameIdx >= 0 ? cols[nameIdx] : '',
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
        email: emailIdx >= 0 ? cols[emailIdx] : undefined,
        value: valueIdx >= 0 ? parseFloat(cols[valueIdx].replace(/[^\d.,]/g, '').replace(',', '.')) || undefined : undefined,
      };
      return validateLead(lead);
    });
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      return;
    }
    setFile(selectedFile);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const leads = parseCSV(content);
      setParsedLeads(leads);
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  };

  const downloadTemplate = () => {
    const rows = [
      'Nome;Telefone;Email;Valor',
      'João Silva;11999999999;joao@email.com;1500',
      'Maria Souza;21988887777;maria@email.com;2500,50',
    ];
    const csv = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-leads-zapfy.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const validLeads = parsedLeads.filter(l => l.valid);
    if (validLeads.length === 0 || !selectedPipelineId || !selectedStageId) return;

    const leadsToCreate = validLeads.map(lead => ({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      value: lead.value,
      pipeline_id: selectedPipelineId,
      stage_id: selectedStageId,
    }));

    bulkCreate.mutate(leadsToCreate, {
      onSuccess: () => {
        onOpenChange(false);
        resetState();
      },
    });
  };

  const resetState = () => {
    setFile(null);
    setParsedLeads([]);
    setSelectedPipelineId('');
    setSelectedStageId('');
  };

  const validCount = parsedLeads.filter(l => l.valid).length;
  const invalidCount = parsedLeads.filter(l => !l.valid).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) resetState();
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Leads via CSV</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV com as colunas: Nome, Telefone, Email, Valor. Não tem um arquivo? Baixe nosso modelo e preencha.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Upload Area */}
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
              `}
              onClick={() => document.getElementById('csv-input')?.click()}
            >
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">Arraste seu arquivo CSV aqui</p>
              <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
              <div className="mt-5 pt-5 border-t border-border/60">
                <p className="text-xs text-muted-foreground mb-2">Não sabe como formatar?</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate();
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar modelo CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg">
              <FileText className="w-8 h-8 text-primary" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {parsedLeads.length} leads encontrados
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={resetState}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Pipeline & Stage Selection */}
          {parsedLeads.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pipeline destino</Label>
                <Select value={selectedPipelineId} onValueChange={(value) => {
                  setSelectedPipelineId(value);
                  setSelectedStageId('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines?.map(pipeline => (
                      <SelectItem key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapa inicial</Label>
                <Select value={selectedStageId} onValueChange={setSelectedStageId} disabled={!selectedPipelineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages?.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedLeads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Preview ({Math.min(5, parsedLeads.length)} de {parsedLeads.length} leads)
                </p>
                {validCount > 0 && (
                  <Badge variant="outline" className="bg-emerald/20 text-emerald border-emerald/30">
                    <Check className="w-3 h-3 mr-1" />
                    {validCount} válidos
                  </Badge>
                )}
                {invalidCount > 0 && (
                  <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {invalidCount} inválidos
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedLeads.slice(0, 5).map((lead, idx) => (
                      <TableRow key={idx} className={!lead.valid ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          {lead.valid ? (
                            <Check className="w-4 h-4 text-emerald" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{lead.name || '-'}</TableCell>
                        <TableCell>{lead.phone || '-'}</TableCell>
                        <TableCell>{lead.email || '-'}</TableCell>
                        <TableCell>
                          {lead.value ? `R$ ${lead.value.toLocaleString('pt-BR')}` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={validCount === 0 || !selectedPipelineId || !selectedStageId || bulkCreate.isPending}
          >
            {bulkCreate.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar {validCount} Leads
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}