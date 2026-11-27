import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic/settings', { credentials: 'include' });
      const data = await res.json();
      if (data?.settings?.branches?.length) {
        setBranches(data.settings.branches);
        // Set default branch (prefer Alkapuri / isDefault)
        const def = data.settings.branches.find(b => b.isDefault)
          || data.settings.branches.find(b => /alkapuri/i.test(b.name));
        setSelectedBranch(def?.name || data.settings.branches[0]?.name || '');
      }
    } catch (e) {
      console.error('Failed to fetch branches:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const value = {
    branches,
    selectedBranch,
    setSelectedBranch,
    loading,
    refetch: fetchBranches,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return ctx;
}