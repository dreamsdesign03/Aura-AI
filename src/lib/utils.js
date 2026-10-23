import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
export function formatCurrency(value) {
    if (value >= 1000000)
        return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000)
        return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
}
export function formatDate(date) {
    if (!date)
        return "—";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function formatRelative(date) {
    if (!date)
        return "—";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)
        return "just now";
    if (mins < 60)
        return `${mins}m ago`;
    if (hours < 24)
        return `${hours}h ago`;
    if (days < 7)
        return `${days}d ago`;
    return formatDate(date);
}
export function cleanCompanyName(raw) {
    if (!raw)
        return "";
    let name = String(raw).trim();
    if (!name)
        return "";
    const sep = name.match(/\s*(?:[—–|•]|\s-\s)\s*/);
    if (sep)
        name = name.slice(0, sep.index).trim();
    name = name.replace(/\s+(?:in|at)\s+.{2,}$/i, "");
    name = name.replace(/^(?:Best|Top|Leading|Advanced|Premium|Most|Trusted|No\.?\s?1|Award[\s-]?Winning)\s+/i, "");
    if (name.length > 45) {
        const cut = name.slice(0, 45);
        const ws = cut.lastIndexOf(" ");
        name = (ws > 20 ? cut.slice(0, ws) : cut).trim();
    }
    return name.replace(/[,\s\-]+$/g, "").trim();
}
export const LEAD_STATUS_LIST = [
    "new_enquiry", "enquiry_qualified", "discovery_call",
    "quote_sent", "follow_up", "project_won", "project_lost",
];
export const STATUS_LABELS = {
    new_enquiry: "New Enquiry",
    enquiry_qualified: "Enquiry Qualified",
    discovery_call: "Discovery Call",
    quote_sent: "Quote / Estimation Sent",
    follow_up: "Follow Up / Negotiation",
    project_won: "Project Won",
    project_lost: "Project Lost",
};
export function statusLabel(status) {
    return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
export const STATUS_COLORS = {
    new_enquiry: "bg-blue-50 text-blue-700 border-blue-200",
    enquiry_qualified: "bg-purple-50 text-purple-700 border-purple-200",
    discovery_call: "bg-teal-50 text-teal-700 border-teal-200",
    quote_sent: "bg-amber-50 text-amber-700 border-amber-200",
    follow_up: "bg-orange-50 text-orange-600 border-orange-200",
    project_won: "bg-green-50 text-green-700 border-green-200",
    project_lost: "bg-red-50 text-red-600 border-red-200",
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    sent: "bg-teal-50 text-teal-700 border-teal-200",
    viewed: "bg-cyan-50 text-cyan-700 border-cyan-200",
    negotiating: "bg-amber-50 text-amber-700 border-amber-200",
    draft: "bg-gray-100 text-gray-600 border-gray-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
};
export function statusColor(status) {
    return STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
}
export function auditScoreHex(score) {
    if (score >= 70)
        return "#22C55E";
    if (score >= 50)
        return "#DE377C";
    return "#EF4444";
}
export function auditScoreLabel(score) {
    if (score >= 70)
        return "Good";
    if (score >= 50)
        return "Fair";
    return "Poor";
}
export function auditScoreRgb(score) {
    if (score >= 70)
        return { r: 34, g: 197, b: 94 };
    if (score >= 50)
        return { r: 245, g: 158, b: 11 };
    return { r: 239, g: 68, b: 68 };
}
export function auditScoreColors(score) {
    if (score >= 70)
        return { text: "#16a34a", bg: "#dcfce7", bar: "#16a34a" };
    if (score >= 50)
        return { text: "#DE377C", bg: "#fef3c7", bar: "#DE377C" };
    return { text: "#dc2626", bg: "#fee2e2", bar: "#ef4444" };
}
export function healthScoreColor(score) {
    if (score >= 75)
        return "#16a34a";
    if (score >= 50)
        return "#DE377C";
    return "#dc2626";
}
export function auditScoreTextClass(score) {
    if (score >= 70)
        return "text-teal-600";
    if (score >= 40)
        return "text-amber-600";
    return "text-red-600";
}