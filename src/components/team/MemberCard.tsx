import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Settings2 } from 'lucide-react';
import { getRole, getMemberStatus, formatDate } from './teamConstants';

interface Props {
  member: any;
  isSelf: boolean;
  onManage: (m: any) => void;
}

function MemberCardComponent({ member, isSelf, onManage }: Props) {
  const role = getRole(member.role);
  const RoleIcon = role.icon;
  const memberStatus = getMemberStatus(member);
  const isInactive = member.isActive === false;

  return (
    <Card
      className={`glass-card p-4 space-y-4 transition-opacity cursor-pointer hover:bg-muted/30 ${
        isInactive ? 'opacity-60 grayscale-[30%]' : ''
      }`}
      onClick={() => onManage(member)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-semibold text-primary text-lg">
                  {member.name[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${memberStatus.color}`}
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate flex items-center gap-2">
              {member.name}
              {isSelf && (
                <Badge variant="outline" className="text-[10px] py-0">
                  Você
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onManage(member);
          }}
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs mb-1">Função</p>
          <Badge variant="outline" className={`${role.className} text-xs`}>
            <RoleIcon className="w-3 h-3 mr-1" />
            {role.label}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Status</p>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${memberStatus.color}`} />
            <span className="text-xs">{memberStatus.label}</span>
          </div>
        </div>
        <div className="col-span-2">
          <p className="text-muted-foreground text-xs mb-1">Adicionado</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {formatDate(member.createdAt)}
          </div>
        </div>
      </div>
    </Card>
  );
}

export const MemberCard = memo(MemberCardComponent);
