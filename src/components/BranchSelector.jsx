import { useBranch } from '@/contexts/BranchContext';
import { MapPin, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BranchSelector({ className }) {
  const { branches, selectedBranch, setSelectedBranch, loading, refetch } = useBranch();

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      <select
        value={selectedBranch}
        onChange={(e) => setSelectedBranch(e.target.value)}
        disabled={loading}
        className={cn(
          "appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-10 text-sm font-medium text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent",
          "hover:border-gray-300 transition-colors",
          "cursor-pointer",
          className
        )}
      >
        <option value="">All Branches</option>
        {branches.map((b, i) => (
          <option key={i} value={b.name}>
            {b.name}{b.isDefault ? ' (Default)' : ''}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <ChevronDown className="w-4 h-4" />
      </div>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-600" size={16} />
    </div>
  );
}

export function BranchSelectorWithRefresh({ className }) {
  const { branches, selectedBranch, setSelectedBranch, loading } = useBranch();

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={selectedBranch}
        onChange={(e) => setSelectedBranch(e.target.value)}
        disabled={loading}
        className={cn(
          "appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-9 text-sm font-medium text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent",
          "hover:border-gray-300 transition-colors",
          "cursor-pointer"
        )}
        style={{ minWidth: 200 }}
      >
        <option value="">All Branches</option>
        {branches.map((b, i) => (
          <option key={i} value={b.name}>
            {b.name}{b.isDefault ? ' (Default)' : ''}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <ChevronDown className="w-4 h-4" />
      </div>
    </div>
  );
}