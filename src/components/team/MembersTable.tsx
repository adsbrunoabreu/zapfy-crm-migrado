import { memo, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Settings2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import { getRole, getMemberStatus, formatDate } from './teamConstants';

interface Props {
  members: any[];
  currentUserId?: string;
  onManage: (m: any) => void;
}

type SortKey = 'name' | 'role' | 'status' | 'createdAt';

function MembersTableComponent({ members, currentUserId, onManage }: Props) {
  const accessors = useMemo(
    () => ({
      name: (m: any) => m.name?.toLowerCase() ?? '',
      role: (m: any) => getRole(m.role).label,
      status: (m: any) => getMemberStatus(m).label,
      createdAt: (m: any) => (m.createdAt ? new Date(m.createdAt) : null),
    }),
    [],
  );
  const { sorted, sort, toggle } = useSortableData<any, SortKey>(members, accessors, {
    key: 'name',
    direction: 'asc',
  });

  return (
    <Card className="glass-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            <SortableTableHead
              label="Membro"
              sortKey="name"
              active={sort.key === 'name'}
              direction={sort.direction}
              onSort={(k) => toggle(k as SortKey)}
            />
            <SortableTableHead
              label="Função"
              sortKey="role"
              active={sort.key === 'role'}
              direction={sort.direction}
              onSort={(k) => toggle(k as SortKey)}
            />
            <SortableTableHead
              label="Status"
              sortKey="status"
              active={sort.key === 'status'}
              direction={sort.direction}
              onSort={(k) => toggle(k as SortKey)}
            />
            <SortableTableHead
              label="Adicionado em"
              sortKey="createdAt"
              active={sort.key === 'createdAt'}
              direction={sort.direction}
              onSort={(k) => toggle(k as SortKey)}
            />
            <TableHead className="w-[110px] text-xs font-medium text-muted-foreground normal-case text-right">
              Ações
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border">
          {sorted.map((member) => {
            const role = getRole(member.role);
            const RoleIcon = role.icon;
            const memberStatus = getMemberStatus(member);
            const isInactive = member.isActive === false;

            return (
              <TableRow
                key={member.id}
                className={`border-0 hover:bg-muted/40 transition-colors cursor-pointer ${
                  isInactive ? 'opacity-60 grayscale-[30%]' : ''
                }`}
                onClick={() => onManage(member)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-medium text-primary">
                            {member.name[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${memberStatus.color}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate flex items-center gap-2">
                        {member.name}
                        {member.id === currentUserId && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            Você
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={role.className}>
                    <RoleIcon className="w-3.5 h-3.5 mr-1" />
                    {role.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${memberStatus.color}`} />
                    <span className="text-sm">{memberStatus.label}</span>
                    {isInactive && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] py-0 border-destructive/40 text-destructive"
                      >
                        Desativado
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(member.createdAt)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onManage(member)}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                    Gerenciar
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

export const MembersTable = memo(MembersTableComponent);
