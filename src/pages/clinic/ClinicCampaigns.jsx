import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  RefreshCw, Send, Clock, CheckCircle2, Mail, Users, BarChart2,
  ChevronRight, AlertCircle, Plus, Zap,
} from 'lucide-react';
import { clinicApi, dateLabel, datetimeLabel, money } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi } from '@/clinic/ui';

const STATUS_STYLE = {
  draft: { chip: 'co-c-n', icon: Clock },
  scheduled: { chip: 'co-c-o', icon: Clock },
  sending: { chip: 'co-c-p', icon: Send },
  sent: { chip: 'co-c-g', icon: CheckCircle2 },
  paused: { chip: 'co-c-n', icon: AlertCircle },
};

export default function ClinicCampaigns() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'campaigns'],
    queryFn: clinicApi.campaigns,
    refetchInterval: 30_000,
  });

  const campaigns = data?.campaigns || [];

  const totals = useMemo(() => ({
    total: campaigns.length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    delivered: campaigns.reduce((n, c) => n + (c.delivered || 0), 0),
    replied: campaigns.reduce((n, c) => n + (c.replied || 0), 0),
    booked: campaigns.reduce((n, c) => n + (c.booked || 0), 0),
  }), [campaigns]);

  return (
    <div className="clinic-os">
      <PageHead title="Campaigns" subtitle="Email & WhatsApp campaigns from Aura — tracked here for clinic context.">
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <Link href="/campaigns" className="co-btn co-btn-primary co-btn-sm"><Plus size={14} /> Create in Aura</Link>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Kpi label="Campaigns" value={totals.total} icon={Mail} />
        <Kpi label="Sent" value={totals.sent} foot={`${totals.draft} draft`} icon={Send} />
        <Kpi label="Delivered" value={totals.delivered} icon={CheckCircle2} />
        <Kpi label="Replied" value={totals.replied} foot={`${totals.booked} booked`} icon={BarChart2} />
      </div>

      <Card rise="co-rise-2">
        {isLoading ? <Spinner /> : campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet">
            <p className="co-sm co-mut" style={{ marginTop: 6 }}>Create email or WhatsApp campaigns in Aura's Campaigns section.</p>
            <Link href="/campaigns" className="co-btn co-btn-primary" style={{ marginTop: 14 }}><Plus size={13} /> Open Campaigns</Link>
          </EmptyState>
        ) : (
          <div className="co-table-wrap">
            <table className="co-table">
              <thead>
                <tr><th>Name</th><th>Segment</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Replied</th><th>Booked</th><th>Created</th><th></th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const style = STATUS_STYLE[c.status] || { chip: 'co-c-n', icon: Mail };
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }}>
                      <td><div className="co-strong">{c.name}</div></td>
                      <td className="co-mut">{c.segment || 'All'}</td>
                      <td><span className={`co-chip ${style.chip}`}>{c.status}</span></td>
                      <td className="co-strong">{c.sent || 0}</td>
                      <td>{c.delivered || 0}</td>
                      <td>{c.replied || 0}</td>
                      <td>{c.booked || 0}</td>
                      <td className="co-mut" style={{ whiteSpace: 'nowrap' }}>{c.created_at ? dateLabel(c.created_at) : '—'}</td>
                      <td><Link href={`/campaigns`} className="co-btn co-btn-sm co-btn-ghost"><ChevronRight size={12} /> Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}