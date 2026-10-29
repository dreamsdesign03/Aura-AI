import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, CalendarDays, Download, FileText, BarChart2, TrendingUp,
  IndianRupee, Users, PhoneCall, Package, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { clinicApi, money, dateLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, BarRow, EmptyState, Spinner, Kpi, Tabs } from '@/clinic/ui';

function StatCard({ label, value, icon: Icon, foot }) {
  return (
    <Card>
      <div className="co-kpi-label">{Icon ? <Icon size={13} /> : null}{label}</div>
      <div className="co-kpi-value">{value}</div>
      {foot ? <div className="co-kpi-foot">{foot}</div> : null}
    </Card>
  );
}

export default function ClinicReports() {
  const [range, setRange] = useState({ days: 30 });
  const from = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - range.days); return d.toISOString(); }, [range.days]);
  const to = useMemo(() => new Date().toISOString(), []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'reports', range.days],
    queryFn: () => clinicApi.reports(from, to),
    refetchInterval: 60_000,
  });

  const report = data;
  const appts = report?.appointments || [];
  const pkgs = report?.packages || [];
  const rev = report?.revenue || { sold: 0, collected: 0 };
  const calls = report?.calls || { calls: 0, completed: 0 };

  const apptTotal = appts.reduce((n, a) => n + a.n, 0);
  const pkgTotal = pkgs.reduce((n, p) => n + p.n, 0);
  const completedAppts = appts.find((a) => a.status === 'completed')?.n || 0;
  const noShows = appts.find((a) => a.status === 'no_show')?.n || 0;
  const conversionRate = calls.calls > 0 ? Math.round((calls.completed / calls.calls) * 100) : 0;

  const rangeOptions = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: '180 days', days: 180 },
  ];

  return (
    <div className="clinic-os">
      <PageHead
        title="Reports"
        subtitle={`Performance for the last ${range.days} days`}
      >
        <div className="co-row" style={{ gap: 8 }}>
          {rangeOptions.map((r) => (
            <button
              key={r.days}
              type="button"
              className={`co-btn co-btn-sm ${range.days === r.days ? 'co-btn-primary' : ''}`}
              onClick={() => setRange({ days: r.days })}
            >
              {r.label}
            </button>
          ))}
          <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <StatCard label="Appointments" value={apptTotal} foot={`${completedAppts} completed, ${noShows} no-shows`} icon={CalendarDays} />
        <StatCard label="Packages Sold" value={pkgTotal} foot={money(Number(rev.sold))} icon={Package} />
        <StatCard label="Revenue Collected" value={money(Number(rev.collected))} foot={`${rev.sold > 0 ? Math.round((Number(rev.collected) / Number(rev.sold)) * 100) : 0}% of sold`} icon={IndianRupee} />
        <StatCard label="AI Calls" value={calls.calls} foot={`${calls.completed} completed · ${conversionRate}%`} icon={PhoneCall} />
      </div>

      <div className="co-split co-rise-2">
        <div className="co-grid">
          <Card>
            <CardHead title="Appointments by Status" hint={`${apptTotal} total`} />
            {appts.length === 0 ? <p className="co-sm co-mut">No appointments in range.</p> : (
              appts.map((a) => (
                <BarRow key={a.status} label={a.status} value={a.n} max={Math.max(...appts.map((x) => x.n))} />
              ))
            )}
          </Card>

          <Card>
            <CardHead title="Packages by Status" hint={`${pkgTotal} total`} />
            {pkgs.length === 0 ? <p className="co-sm co-mut">No packages in range.</p> : (
              pkgs.map((p) => (
                <BarRow key={p.status} label={p.status} value={p.n} max={Math.max(...pkgs.map((x) => x.n))} />
              ))
            )}
          </Card>

          <Card>
            <CardHead title="Call Outcomes" hint={`${calls.calls} calls`} />
            {calls.calls === 0 ? <p className="co-sm co-mut">No calls in range.</p> : (
              <>
                <BarRow label="Completed" value={calls.completed} max={calls.calls} />
                <BarRow label="Other" value={calls.calls - calls.completed} max={calls.calls} />
              </>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <CardHead title="Quick Insights" />
            <div className="co-list">
              <div className="co-list-item"><span className="co-dot ok" /><div>Appointment completion rate: {apptTotal > 0 ? Math.round((completedAppts / apptTotal) * 100) : 0}%</div></div>
              <div className="co-list-item"><span className="co-dot warn" /><div>No-show rate: {apptTotal > 0 ? Math.round((noShows / apptTotal) * 100) : 0}%</div></div>
              <div className="co-list-item"><span className="co-dot" /><div>Call completion rate: {conversionRate}%</div></div>
              <div className="co-list-item"><span className="co-dot" /><div>Avg package value: {pkgTotal > 0 ? money(Number(rev.sold) / pkgTotal) : '—'}</div></div>
            </div>
          </Card>

          <Card>
            <CardHead title="Export" />
            <p className="co-sm co-mut" style={{ marginBottom: 12 }}>Download raw data for further analysis.</p>
            <div className="co-row" style={{ gap: 8 }}>
              <button type="button" className="co-btn co-btn-primary co-btn-sm"><Download size={13} /> Export CSV</button>
              <button type="button" className="co-btn co-btn-sm"><FileText size={13} /> Export PDF</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}