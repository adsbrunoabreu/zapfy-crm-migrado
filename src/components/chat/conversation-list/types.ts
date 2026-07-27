export type StatusFilter = 'all' | 'unread' | 'waiting' | 'in_progress' | 'closed' | 'hidden';
export type SortMode = 'recent' | 'selected-tags' | 'most-tags';

export interface StatusOption {
  value: StatusFilter;
  label: string;
  icon: import('lucide-react').LucideIcon;
  color: string;
}

export interface SortOption {
  value: SortMode;
  label: string;
  description: string;
}
