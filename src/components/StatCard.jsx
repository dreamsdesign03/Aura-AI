const colorMap = {
    teal: { icon: "#0D9488", bg: "#ECFDF5", badge: "#0F766E" },
    amber: { icon: "#DE377C", bg: "#FFFBEB", badge: "#B45309" },
    blue: { icon: "#2563EB", bg: "#EFF6FF", badge: "#1D4ED8" },
    green: { icon: "#16A34A", bg: "#F0FDF4", badge: "#15803D" },
    red: { icon: "#DC2626", bg: "#FEF2F2", badge: "#B91C1C" },
    purple: { icon: "#CB3273", bg: "#FDF2F8", badge: "#A4285E" },
};
export default function StatCard({ label, value, icon: Icon, trend, color = "teal", loading }) {
    const c = colorMap[color] || colorMap.teal;
    return (
      <div
        className="rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        style={{
          background: "#ffffff",
          border: "1px solid #CBD5E1",
          boxShadow: "0 1px 3px 0 rgba(15, 23, 42, 0.05)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-bold uppercase tracking-wider mb-2 text-[#475569]">
              {label}
            </div>
            {loading ? (
              <div className="h-7 w-16 rounded animate-pulse bg-gray-100" />
            ) : (
              <div className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{value}</div>
            )}
            {trend && !loading && (
              <div className="text-[11.5px] mt-1.5 font-semibold" style={{ color: c.badge }}>
                {trend}
              </div>
            )}
          </div>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 shadow-xs"
            style={{ background: c.bg }}
          >
            <Icon className="w-5 h-5" style={{ color: c.icon }} />
          </div>
        </div>
      </div>
    );
}
