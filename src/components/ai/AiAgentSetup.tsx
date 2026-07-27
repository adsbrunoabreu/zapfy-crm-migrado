import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAiAgent } from './agent-setup/useAiAgent';
import { AgentWizard } from './agent-setup/AgentWizard';
import { AgentFormView } from './agent-setup/AgentFormView';

interface Props {
  instanceId: string;
  instanceLabel?: string;
  instancePhone?: string | null;
  onAgentSaved?: (agentId: string) => void;
}

export default function AiAgentSetup({ instanceId, onAgentSaved }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const {
    agent, form, save, upd,
    addQuestion, editQuestion, removeQuestion, moveQuestion,
    toggleField, updateDay, qc, toast,
  } = useAiAgent(companyId, instanceId, onAgentSaved);

  const isFirstTime = !agent;
  const [mode, setMode] = useState<'wizard' | 'form'>(isFirstTime ? 'wizard' : 'form');

  useEffect(() => {
    setMode(agent ? 'form' : 'wizard');
  }, [agent?.id, instanceId]);

  const handleWizardSave = useCallback(() => {
    save.mutate(undefined as any, { onSuccess: () => setMode('form') });
  }, [save]);

  const handlePromptSaved = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ai-agent-instance', companyId, instanceId] });
    qc.invalidateQueries({ queryKey: ['ai-agent-history', agent?.id] });
    toast({ title: 'System message atualizado' });
  }, [qc, companyId, instanceId, agent?.id, toast]);

  if (mode === 'wizard') {
    return (
      <AgentWizard
        form={form}
        hasAgent={!!agent}
        upd={upd}
        addQuestion={addQuestion}
        editQuestion={editQuestion}
        removeQuestion={removeQuestion}
        moveQuestion={moveQuestion}
        toggleField={toggleField}
        updateDay={updateDay}
        onSwitchToForm={() => setMode('form')}
        onSave={handleWizardSave}
        isSaving={save.isPending}
      />
    );
  }

  return (
    <AgentFormView
      form={form}
      agentId={agent?.id}
      isSaving={save.isPending}
      upd={upd}
      addQuestion={addQuestion}
      editQuestion={editQuestion}
      removeQuestion={removeQuestion}
      toggleField={toggleField}
      updateDay={updateDay}
      onSave={() => save.mutate()}
      onOpenWizard={() => setMode('wizard')}
      onPromptSaved={handlePromptSaved}
    />
  );
}
