import { useQuery } from "@tanstack/react-query";
export function usePlan() {
    return useQuery({
        queryKey: ["billing-current-plan"],
        queryFn: async () => {
            const res = await fetch(`/api/billing/current-plan`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load plan");
            return res.json();
        },
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}
export function usePlanPlans() {
    return useQuery({
        queryKey: ["billing-plans"],
        queryFn: async () => {
            const res = await fetch(`/api/billing/plans`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load plans");
            return res.json();
        },
        staleTime: 60 * 60 * 1000,
    });
}
export function formatLimit(val) {
    if (val == null)
        return "0";
    return val === -1 ? "Unlimited" : val.toLocaleString();
}
export function planLabel(plan) {
    const labels = {
        trial: "Free Trial",
        solo: "Solo",
        growth: "Growth",
        agency: "Agency",
    };
    return labels[plan] ?? plan;
}
export function planBadgeStyle(plan) {
    switch (plan) {
        case "trial": return { bg: "#FEF3C7", text: "#B45309", border: "#FDE68A" };
        case "solo": return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
        case "growth": return { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" };
        case "agency": return { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" };
        default: return { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" };
    }
}
