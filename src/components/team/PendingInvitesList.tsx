import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Clock, X } from 'lucide-react';
import { getRole } from './teamConstants';

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

interface Props {
  invites: Invite[];
  onCancel: (id: string) => void;
}

function getDaysUntilExpiry(expiresAt: string) {
  const now = new Date();
  const expiry = new Date(expiresAt);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function PendingInvitesListComponent({ invites, onCancel }: Props) {
  if (invites.length === 0) return null;

  return (
    <Card className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Convites Pendentes ({invites.length})</h3>
      </div>
      <div className="space-y-2">
        {invites.map((invite) => {
          const role = getRole(invite.role);
          const RoleIcon = role.icon;
          const daysLeft = getDaysUntilExpiry(invite.expiresAt);

          return (
            <div
              key={invite.id}
              className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{invite.email}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline" className={`${role.className} text-xs py-0`}>
                      <RoleIcon className="w-3 h-3 mr-1" />
                      {role.label}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Expira em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => onCancel(invite.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export const PendingInvitesList = memo(PendingInvitesListComponent);
