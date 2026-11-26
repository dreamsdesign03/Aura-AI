import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, CalendarDays, Download, FileText, TrendingUp,
  IndianRupee, Users, PhoneCall, Package, Handshake, Search,
  Globe, MessageCircle, Mail, Star, Target, Clock,
} from 'lucide-react';
import { clinicApi, money, dateLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, BarRow, Spinner, Kpi } from '@/clinic/ui';

function formatTalkTime(secs) {
  const s = Math.max(0, Number(secs || 0));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins < 60) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}h ${remMin}m`;
}

function downloadReportCsv(report, label) {
  if (!report) return;
  const rows = [
    ['Section', 'Metric', 'Value'],
    ['Range', 'Window', label],
    ['Calls', 'Total Calls Gone', report.calls?.calls || 0],
    ['Calls', 'Completed Calls', report.calls?.completed || 0],
    ['Calls', 'Booked Calls', report.calls?.booked || 0],
    ['Calls', 'Busy / Missed / Failed', report.calls?.missed || 0],
    ['Calls', 'Total Talk Time', formatTalkTime(report.calls?.durationSecs || 0)],
    ['Calls', 'Ria (Aura AI) Calls', report.calls?.byAgent?.ria || 0],
    ['Calls', 'Misha (Skinnonest AI) Calls', report.calls?.byAgent?.misha || 0],
    ['Calls', 'Plivo Dialer Calls', report.calls?.byAgent?.plivo || 0],
    ['Contacts', 'Total Contacts', report.contacts?.total || 0],
    ['Contacts', 'Active Patients', report.contacts?.active_patients || 0],
    ['Contacts', 'Added in Range', report.contacts?.added_in_range || 0],
    ['Contacts', 'From ICP', report.contacts?.from_icp || 0],
    ['Contacts', 'ICP Profiles', report.contacts?.icpProfiles || 0],
    ['Appointments', 'Total Bookings', report.appointmentSplit?.total || 0],
    ['Appointments', 'Clinic Consultations (Dr. Aditya Shah)', report.appointmentSplit?.consultations || 0],
    ['Appointments', 'Skinnonest Partnerships (Vishw)', report.appointmentSplit?.partnerships || 0],
    ['Outreach', 'WhatsApp Sent (+91 84900 33711)', report.outreach?.whatsapp?.outbound_total || 0],
    ['Outreach', 'WhatsApp Delivered / Read', report.outreach?.whatsapp?.outbound_delivered || 0],
    ['Outreach', 'WhatsApp Inbound Replies', report.outreach?.whatsapp?.inbound_replies || 0],
    ['Outreach', 'Emails Sent', report.outreach?.emailsSent || 0],
    ['Visibility', 'Network Visibility Score', report.visibility?.summary?.networkVisibilityScore ?? 'N/A'],
    ['Visibility', 'Average Keyword Rank', report.visibility?.stats?.avgRank || 'N/A'],
    ['Visibility', 'Top 3 Ranked Keywords', report.visibility?.stats?.top3 || 0],
    ['Visibility', 'Top 10 Ranked Keywords', report.visibility?.stats?.top10 || 0],
    ['Revenue', 'Packages Sold', (report.packages || []).reduce((n, p) => n + p.n, 0)],
    ['Revenue', 'Package Value Sold (INR)', report.revenue?.sold || 0],
    ['Revenue', 'Revenue Collected (INR)', report.revenue?.collected || 0],
    ['Reviews', 'Total Google Reviews', report.reviews?.total || 0],
    ['Reviews', 'Average Rating', report.reviews?.avg_rating || 0],
  ];

  if ((report.visibility?.keywords || []).length > 0) {
    rows.push([]);
    rows.push(['Keyword', 'Branch', 'Category', 'Current Rank', 'Maps Rank', 'Organic Rank', 'AI Overview']);
    for (const k of report.visibility.keywords) {
      rows.push([
        k.keyword,
        k.branch || '',
        k.category || '',
        k.current_rank ?? '',
        k.maps_rank ?? '',
        k.organic_rank ?? '',
        k.ai_overview_mentioned ? 'Yes' : 'No',
      ]);
    }
  }

  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aura-ai-report-${label.toLowerCase().replace(/\s+/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ClinicReports() {
  const [range, setRange] = useState({ days: 30, all: false, label: '30 days' });
  const from = useMemo(() => {
    if (range.all) return new Date('2020-01-01T00:00:00.000Z').toISOString();
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    return d.toISOString();
  }, [range.days, range.all]);
  const to = useMemo(() => new Date().toISOString(), [range.days, range.all]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'reports', range.days, range.all],
    queryFn: () => clinicApi.reports(from, to, range.all),
    refetchInterval: 60_000,
  });

  const report = data || {};
  const appts = report.appointments || [];
  const apptSplit = report.appointmentSplit || { total: 0, consultations: 0, partnerships: 0, byBranch: [] };
  const pkgs = report.packages || [];
  const rev = report.revenue || { sold: 0, collected: 0 };
  const calls = report.calls || { calls: 0, completed: 0, missed: 0, booked: 0, durationSecs: 0, inbound: 0, outbound: 0, byAgent: { ria: 0, misha: 0, plivo: 0 } };
  const contacts = report.contacts || { total: 0, added_in_range: 0, active_patients: 0, from_icp: 0, icpProfiles: 0, byStage: [], bySource: [] };
  const wa = report.outreach?.whatsapp || { outbound_total: 0, outbound_delivered: 0, outbound_read: 0, outbound_failed: 0, inbound_replies: 0, active_threads: 0 };
  const emailsSent = report.outreach?.emailsSent || 0;
  const reviews = report.reviews || { total: 0, avg_rating: 0 };
  const vis = report.visibility || { summary: null, stats: { trackedKeywords: 0, top3: 0, top10: 0, aiOverviewMentioned: 0, avgRank: 0 }, keywords: [] };

  const apptTotal = apptSplit.total || appts.reduce((n, a) => n + a.n, 0);
  const pkgTotal = pkgs.reduce((n, p) => n + p.n, 0);
  const completedAppts = appts.find((a) => a.status === 'completed')?.n || 0;
  const confirmedAppts = appts.find((a) => a.status === 'confirmed' || a.status === 'booked')?.n || 0;
  const callCompletionRate = calls.calls > 0 ? Math.round((calls.completed / calls.calls) * 100) : 0;

  const rangeOptions = [
    { label: '7 days', days: 7, all: false },
    { label: '30 days', days: 30, all: false },
    { label: '90 days', days: 90, all: false },
    { label: 'All Time', days: 3650, all: true },
  ];

  const maxStage = Math.max(1, ...(contacts.byStage || []).map((x) => x.n));
  const maxSource = Math.max(1, ...(contacts.bySource || []).map((x) => x.n));
  const maxApptStatus = Math.max(1, ...appts.map((x) => x.n));
  const maxApptBranch = Math.max(1, ...(apptSplit.byBranch || []).map((x) => x.n));
  const maxAgentCalls = Math.max(1, calls.byAgent?.ria || 0, calls.byAgent?.misha || 0, calls.byAgent?.plivo || 0);

  return (
    <div className="clinic-os" style={{ paddingBottom: 32 }}>
      <PageHead
        title="Aura AI Platform Report"
        subtitle={range.all ? 'Complete live performance across calls, patients, partnerships, rankings & outreach' : `Live performance across all modules for the last ${range.label}`}
      >
        <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="co-pill-tabs">
            {rangeOptions.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`co-pill-tab ${(range.all === r.all && range.days === r.days) ? 'active on' : ''}`}
                onClick={() => setRange(r)}
              >
                {r.label}
              </button>
            ))}
            <button type="button" className="co-pill-tab" onClick={() => refetch()} disabled={isFetching} title="Refresh live data">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
          <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => downloadReportCsv(report, range.label)} disabled={!data}>
            <Download size={13} /> Export CSV
          </button>
          <button type="button" className="co-btn co-btn-sm" onClick={() => window.print()}>
            <FileText size={13} /> Print / PDF
          </button>
        </div>
      </PageHead>

      {isLoading ? (
        <div style={{ padding: '48px 0' }}><Spinner label="Loading live Aura AI report..." /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 1. Executive Summary KPIs */}
          <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <Kpi
              label="Total Calls Gone"
              value={calls.calls}
              foot={`${calls.completed} completed · ${calls.missed} busy/missed · ${formatTalkTime(calls.durationSecs)}`}
              icon={PhoneCall}
            />
            <Kpi
              label="Contacts & Patients"
              value={contacts.total}
              foot={`${contacts.active_patients} active patients · +${contacts.added_in_range} in range · ${contacts.icpProfiles} ICPs`}
              icon={Users}
            />
            <Kpi
              label="Appointments & Partnerships"
              value={apptTotal}
              foot={`${apptSplit.consultations} Consultations · ${apptSplit.partnerships} Partnerships`}
              icon={Handshake}
            />
            <Kpi
              label="Keyword Rankings"
              value={vis.stats?.avgRank ? `#${vis.stats.avgRank}` : (vis.summary?.avgRank ? `#${vis.summary.avgRank}` : '—')}
              foot={`${vis.stats?.top3 || 0} in Top 3 · ${vis.stats?.trackedKeywords || 0} tracked · Score ${vis.summary?.networkVisibilityScore ?? '—'}%`}
              icon={Search}
            />
            <Kpi
              label="WhatsApp & Email"
              value={wa.outbound_total + emailsSent}
              foot={`${wa.outbound_total} WA (+91 84900 33711) · ${wa.inbound_replies} replies · ${emailsSent} emails`}
              icon={MessageCircle}
            />
            <Kpi
              label="Revenue & Reviews"
              value={money(Number(rev.collected || 0))}
              foot={`${pkgTotal} packages (${money(Number(rev.sold || 0))}) · ${reviews.total} reviews (${reviews.avg_rating || 0}★)`}
              icon={IndianRupee}
            />
          </div>

          {/* 2. Calls & Voice Agents + Appointments & Partnerships */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            <Card>
              <CardHead title="Calls & Voice Agents" hint={`${calls.calls} total · ${callCompletionRate}% connected`} />
              {calls.calls === 0 ? (
                <p className="co-sm co-mut">No calls recorded in this timeframe.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <BarRow label="Ria (Aura Clinic AI & Bulk)" value={calls.byAgent?.ria || 0} max={maxAgentCalls} />
                  <BarRow label="Misha (Skinnonest AI)" value={calls.byAgent?.misha || 0} max={maxAgentCalls} />
                  <BarRow label="Plivo Dialer" value={calls.byAgent?.plivo || 0} max={maxAgentCalls} />
                  <div style={{ borderTop: '1px solid #F3D9E5', paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                    <div className="co-xs"><div className="co-mut">Completed</div><div style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>{calls.completed}</div></div>
                    <div className="co-xs"><div className="co-mut">Booked</div><div style={{ fontWeight: 700, fontSize: 14, color: '#7C3AED' }}>{calls.booked}</div></div>
                    <div className="co-xs"><div className="co-mut">Busy / Missed</div><div style={{ fontWeight: 700, fontSize: 14, color: '#B45309' }}>{calls.missed}</div></div>
                    <div className="co-xs"><div className="co-mut">Talk Time</div><div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{formatTalkTime(calls.durationSecs)}</div></div>
                  </div>
                  <div className="co-xs co-mut">
                    Direction: <strong>{calls.outbound}</strong> outbound · <strong>{calls.inbound}</strong> inbound
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHead title="Appointments & Partnerships" hint={`${apptTotal} total bookings`} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
                  <div className="co-xs" style={{ color: '#9D174D', fontWeight: 600 }}>Dr. Aditya Shah Consultations</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#831843', marginTop: 2 }}>{apptSplit.consultations}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                  <div className="co-xs" style={{ color: '#6D28D9', fontWeight: 600 }}>Vishw Skinnonest Partnerships</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#4C1D95', marginTop: 2 }}>{apptSplit.partnerships}</div>
                </div>
              </div>
              {appts.length === 0 ? (
                <p className="co-sm co-mut">No appointments in this timeframe.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {appts.map((a) => (
                    <BarRow key={a.status} label={a.status} value={a.n} max={maxApptStatus} />
                  ))}
                </div>
              )}
              {(apptSplit.byBranch || []).length > 0 && (
                <div style={{ borderTop: '1px solid #F3D9E5', paddingTop: 10, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="co-xs" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>By Location / Channel</div>
                  {apptSplit.byBranch.map((b) => (
                    <BarRow key={b.branch} label={b.branch} value={b.n} max={maxApptBranch} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* 3. Contacts, Patients & ICP + WhatsApp, Email & Reviews */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            <Card>
              <CardHead title="Contacts, Patients & ICP Pipeline" hint={`${contacts.total} total contacts`} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
                <div className="co-xs"><div className="co-mut">Total Contacts</div><div style={{ fontWeight: 700, fontSize: 15 }}>{contacts.total}</div></div>
                <div className="co-xs"><div className="co-mut">Active Patients</div><div style={{ fontWeight: 700, fontSize: 15, color: '#047857' }}>{contacts.active_patients}</div></div>
                <div className="co-xs"><div className="co-mut">From ICP</div><div style={{ fontWeight: 700, fontSize: 15, color: '#7C3AED' }}>{contacts.from_icp}</div></div>
                <div className="co-xs"><div className="co-mut">ICP Profiles</div><div style={{ fontWeight: 700, fontSize: 15 }}>{contacts.icpProfiles}</div></div>
              </div>
              <div className="co-xs" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>Pipeline Stages</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {(contacts.byStage || []).length === 0 ? (
                  <p className="co-sm co-mut">No contacts found.</p>
                ) : (
                  contacts.byStage.map((s) => (
                    <BarRow key={s.stage} label={s.stage} value={s.n} max={maxStage} />
                  ))
                )}
              </div>
              <div className="co-xs" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>Lead Sources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(contacts.bySource || []).map((s) => (
                  <BarRow key={s.source} label={s.source} value={s.n} max={maxSource} />
                ))}
              </div>
            </Card>

            <Card>
              <CardHead title="WhatsApp, Email, Packages & Reviews" hint="Channel & Revenue Health" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  <div className="co-xs" style={{ color: '#065F46', fontWeight: 700, marginBottom: 6 }}>
                    WhatsApp Business (+91 84900 33711)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                    <div className="co-xs"><div className="co-mut">Sent</div><div style={{ fontWeight: 700, fontSize: 14 }}>{wa.outbound_total}</div></div>
                    <div className="co-xs"><div className="co-mut">Delivered</div><div style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>{wa.outbound_delivered}</div></div>
                    <div className="co-xs"><div className="co-mut">Read</div><div style={{ fontWeight: 700, fontSize: 14, color: '#2563EB' }}>{wa.outbound_read}</div></div>
                    <div className="co-xs"><div className="co-mut">Replies</div><div style={{ fontWeight: 700, fontSize: 14, color: '#7C3AED' }}>{wa.inbound_replies}</div></div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div className="co-xs co-mut">Emails Sent</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{emailsSent}</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div className="co-xs co-mut">Google Reviews</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{reviews.total} ({reviews.avg_rating || 0}★)</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div className="co-xs co-mut">Packages Sold</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{pkgTotal}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #F3D9E5', paddingTop: 10 }}>
                  <div className="co-xs" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>Revenue Summary</div>
                  <div className="co-list">
                    <div className="co-list-item"><span className="co-dot ok" /><div>Collected revenue: <strong>{money(Number(rev.collected || 0))}</strong></div></div>
                    <div className="co-list-item"><span className="co-dot" /><div>Total sold value: <strong>{money(Number(rev.sold || 0))}</strong></div></div>
                    <div className="co-list-item"><span className="co-dot warn" /><div>Confirmed upcoming bookings: <strong>{confirmedAppts}</strong> · Completed: <strong>{completedAppts}</strong></div></div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* 4. Keyword Rankings & AI Visibility Audit */}
          <Card>
            <CardHead
              title="Keyword Rankings & AI Search Visibility"
              hint={vis.summary?.lastAuditAt ? `Last audited ${dateLabel(vis.summary.lastAuditAt)}` : 'Live SERP & AI engine tracking'}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
                <div className="co-xs co-mut">Visibility Score</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#9D174D' }}>{vis.summary?.networkVisibilityScore ?? '—'}%</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="co-xs co-mut">Average Rank</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>#{vis.stats?.avgRank || vis.summary?.avgRank || '—'}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                <div className="co-xs co-mut">Top 3 Rankings</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#047857' }}>{vis.stats?.top3 || 0} / {vis.stats?.trackedKeywords || 0}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div className="co-xs co-mut">Top 10 Rankings</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{vis.stats?.top10 || 0} / {vis.stats?.trackedKeywords || 0}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                <div className="co-xs co-mut">AI Mentions</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#6D28D9' }}>{vis.summary?.aiMentions || `${vis.stats?.aiOverviewMentioned || 0} kw`}</div>
              </div>
            </div>

            {(vis.summary?.branchScores || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="co-xs" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Branch Visibility Scores</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                  {vis.summary.branchScores.map((b) => (
                    <div key={b.branch} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#0F172A' }}>{b.branch}</div>
                      <div className="co-xs co-mut">Score: <strong>{b.score}%</strong> · Avg Rank: <strong>#{b.avgRank}</strong> · {b.rating}★</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(vis.keywords || []).length === 0 ? (
              <p className="co-sm co-mut">No tracked keywords found yet. Run a scan in Visibility Audit to populate rankings.</p>
            ) : (
              <div className="co-table-wrap">
                <table className="co-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Branch / City</th>
                      <th>Category</th>
                      <th>Overall Rank</th>
                      <th>Maps Rank</th>
                      <th>Organic Rank</th>
                      <th>AI Overview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vis.keywords.map((k) => {
                      const delta = Number(k.rank_change || 0);
                      return (
                        <tr key={k.id}>
                          <td className="co-strong">{k.keyword}</td>
                          <td className="co-mut">{k.branch || k.target_city || '—'}</td>
                          <td className="co-mut">{k.category || '—'}</td>
                          <td>
                            <span style={{ fontWeight: 700, color: Number(k.current_rank) <= 3 ? '#047857' : '#0F172A' }}>
                              {k.current_rank ? `#${k.current_rank}` : '—'}
                            </span>
                            {delta !== 0 ? (
                              <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: delta > 0 ? '#047857' : '#DC2626' }}>
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            ) : null}
                          </td>
                          <td>{k.maps_rank ? `#${k.maps_rank}` : '—'}</td>
                          <td>{k.organic_rank ? `#${k.organic_rank}` : '—'}</td>
                          <td>
                            <span className={`co-chip ${k.ai_overview_mentioned ? 'co-c-g' : 'co-c-n'}`}>
                              {k.ai_overview_mentioned ? 'Mentioned' : 'Not mentioned'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
