import { usePipelineMembers } from '@/hooks/usePipelines';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users } from 'lucide-react';

interface Props {
  pipelineId: string;
  onClick?: () => void;
  clickable?: boolean;
}

const colors = [
  'hsl(192 91% 36%)', 'hsl(160 84% 36%)', 'hsl(263 70% 50%)',
  'hsl(38 92% 50%)', 'hsl(350 89% 60%)', 'hsl(220 70% 50%)',
];
function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function PipelineMembersAvatars({ pipelineId, onClick, clickable }: Props) {
  const { data: members = [] } = usePipelineMembers(pipelineId);
  const { data: team = [] } = useTeamMembers();

  const memberProfiles = members
    .map(m => team.find(t => t.id === m.user_id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  if (memberProfiles.length === 0) {
    if (!clickable) return null;
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
      >
        <Users className="w-3.5 h-3.5" />
        Atribuir
      </button>
    );
  }

  const visible = memberProfiles.slice(0, 4);
  const extra = memberProfiles.length - visible.length;

  const content = (
    <div className="flex items-center -space-x-2">
      {visible.map((m, i) => (
        <TooltipProvider key={m.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-semibold text-white"
                style={{ backgroundColor: colorFor(m.name), zIndex: 10 - i }}
              >
                {m.name[0]?.toUpperCase()}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p className="text-xs">{m.name}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-background bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-semibold">
          +{extra}
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <button type="button" onClick={onClick} className="hover:opacity-80 transition-opacity">
        {content}
      </button>
    );
  }
  return content;
}
