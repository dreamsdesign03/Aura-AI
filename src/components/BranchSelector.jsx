import { useBranch } from '@/contexts/BranchContext';
import { MapPin, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BranchSelector({ className }) {
  const { branches, selectedBranch, setSelectedBranch, loading, refetch } = useBranch();

  if (branches.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading branches...</span>
      </div>
    );
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
  const { branches, selectedBranch, setSelectedBranch, loading, refetch } = useBranch();

  if (branches.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading branches...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <select
        value={selectedBranch}
        onChange={(e) => setSelectedBranch(e.target.value)}
        disabled={loading}
        className={cn(
          "appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-10 text-sm font-medium text-gray-900",
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
      <button
        onClick={refetch}
        disabled={loading}
        className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
        title="Refresh branches"
      >
        <Loader2 className={cn("w-4 h-4", loading && "animate-spin")} />
      </button>
    </div>
  );
}