import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
export function useBatchPoller({ buildPollUrl, intervalMs = 30000, onComplete, invalidateQueryKeys = [], successToast, }) {
    const qc = useQueryClient();
    const [batchState, setBatchState] = useState(null);
    const pollRef = useRef(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    useEffect(() => {
        if (!batchState || batchState.status !== "in_progress") {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }
        const { batchId } = batchState;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(buildPollUrl(batchId), { credentials: "include" });
                if (!res.ok)
                    return;
                const data = await res.json();
                if (data.status === "complete") {
                    const scored = data.scored ?? data.leadsCount;
                    setBatchState(prev => prev ? { ...prev, status: "complete" } : null);
                    invalidateQueryKeys.forEach(key => qc.invalidateQueries({ queryKey: key }));
                    if (successToast) {
                        toast.success(successToast.replace("{scored}", String(scored)));
                    }
                    onCompleteRef.current?.({ scored, leadsCount: data.leadsCount, batchId });
                }
            }
            catch { /* ignore poll errors */ }
        }, intervalMs);
        return () => { if (pollRef.current)
            clearInterval(pollRef.current); };
    }, [batchState?.status, batchState?.batchId]);
    const startBatch = useCallback((batchId, leadsCount) => {
        setBatchState({ batchId, leadsCount, status: "in_progress" });
    }, []);
    const clearBatch = useCallback(() => {
        setBatchState(null);
    }, []);
    return {
        batchState,
        isPolling: batchState?.status === "in_progress",
        startBatch,
        clearBatch,
    };
}
