import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Users, CalendarDays, PhoneCall, IndianRupee, Plus, RefreshCw,
  ArrowUpRight, Check, Sparkles, ClipboardList,
} from 'lucide-react';
import { clinicApi, money, timeLabel, dateLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, Kpi, StatusChip, BarRow, EmptyState, Spinner, Avatar } from '@/clinic/ui';

export default function ClinicOverview() {
  const qc = useQueryClient();
  const [seedError, setSeedError] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['clinic', 'overview'],
    queryFn: () => clinicApi.overview(),
    refetchInterval: 30_000,
  });

  const seed = useMutation({
    mutationFn: clinicApi.seedDemo,
    onSuccess: () => { setSeedError(''); qc.invalidateQueries({ queryKey: ['clinic'] }); },
    onError: (err) => setSeedError(err.message),
  });

  const doneTask = useMutation({
    mutationFn: ({ id, status }) => clinicApi.setTaskStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', 'overview'] }),
  });

  const funnel = data?.funnel || [];
  const maxStage = useMemo(() => Math.max(1, ...funnel.map((f) => f.count)), [funnel]);
  const upcomingList = data?.upcoming || [];

  if (isError) {
    return (
      <div className="clinic-os">
        <PageHead title="Clinic command center" subtitle="Live view of your clinic day." />
        <Card>
          <EmptyState title="Could not load the clinic overview">
            <p className="co-sm co-mut">{error?.message}</p>
            <button type="button" className="co-btn co-btn-primary" style={{ marginTop: 14 }} onClick={() => refetch()}>
              <RefreshCw size={14} /> Try again
            </button>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="clinic-os">
      <PageHead
        title="Clinic command center"
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      >
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <Link href="/clinic/appointments" className="co-btn co-btn-primary co-btn-sm">
          <Plus size={14} /> New booking
        </Link>
      </PageHead>

      {isLoading ? <Card><Spinner label="Loading clinic day…" /></Card> : null}

      {!isLoading && data ? (
        <>
          <div className="co-kpis co-rise-1">
            <Kpi label="Patients" value={data.kpis.patients} foot="Registered clinic patients" icon={Users} />
            <Kpi label="Today's appointments" value={data.kpis.appointmentsToday} foot={`${data.today.filter((a) => a.status === 'arrived').length} arrived`} icon={CalendarDays} />
            <Kpi label="Calls today" value={data.kpis.callsToday} foot="AI + bulk calling" icon={PhoneCall} />
            <Kpi label="Collected" value={money(data.kpis.revenueCollected)} foot={`${money(data.kpis.revenueSold)} in packages`} icon={IndianRupee} />
          </div>

          <div className="co-split co-rise-2">
            <div className="co-grid">
              <Card>
                <CardHead title="Today at the clinic" hint={`${data.today.length} appointment${data.today.length === 1 ? '' : 's'}`}>
                  <Link href="/clinic/appointments" className="co-btn co-btn-sm">Open calendar</Link>
                </CardHead>
                {data.today.length === 0 ? (
                  <EmptyState title="No appointments scheduled for today">
                    <p className="co-sm co-mut" style={{ marginTop: 4 }}>
                      Dr. Aditya Shah's clinic schedule is clear for today. View upcoming Cal.com consultations or schedule a new patient appointment.
                    </p>
                    <div className="co-row" style={{ marginTop: 12, gap: 8 }}>
                      <Link href="/clinic/appointments" className="co-btn co-btn-primary co-btn-sm">
                        <CalendarDays size={13} /> View Appointments &amp; Calendar
                      </Link>
                      <Link href="/clinic/appointments" className="co-btn co-btn-sm">
                        <Plus size={13} /> New Booking
                      </Link>
                    </div>
                  </EmptyState>
                ) : (
                  <div className="co-table-wrap">
                    <table className="co-table">
                      <thead>
                        <tr><th>Time</th><th>Patient</th><th>Treatment</th><th>Branch</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {data.today.map((a) => (
                          <tr key={a.id}>
                            <td className="co-strong" style={{ whiteSpace: 'nowrap' }}>{timeLabel(a.starts_at)}</td>
                            <td>
                              <div className="co-row">
                                <Avatar name={a.patient_name} />
                                <span className="co-strong">{a.patient_name}</span>
                              </div>
                            </td>
                            <td>{a.treatment || '—'}</td>
                            <td className="co-mut">{a.branch || '—'}</td>
                            <td><StatusChip status={a.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Upcoming Consultations from Cal.com */}
              {upcomingList.length > 0 && (
                <Card>
                  <CardHead title="Upcoming consultations" hint={`${upcomingList.length} scheduled in Cal.com`}>
                    <Link href="/clinic/appointments" className="co-btn co-btn-sm">View all</Link>
                  </CardHead>
                  <div className="co-table-wrap">
                    <table className="co-table">
                      <thead>
                        <tr><th>Date &amp; Time</th><th>Patient</th><th>Consultation / Treatment</th><th>Source</th></tr>
                      </thead>
                      <tbody>
                        {upcomingList.slice(0, 5).map((a) => (
                          <tr key={a.id}>
                            <td className="co-strong" style={{ whiteSpace: 'nowrap' }}>
                              {dateLabel(a.starts_at)} · {timeLabel(a.starts_at)}
                            </td>
                            <td>
                              <div className="co-strong">{a.patient_name}</div>
                              {a.phone ? <div className="co-xs co-mut">{a.phone}</div> : null}
                            </td>
                            <td>{a.treatment}</td>
                            <td>
                              <span className="co-chip co-c-p">Cal.com Live</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <div className="co-two">
                <Card>
                  <CardHead title="Patient Care Stages" hint="Patient care lifecycle" />
                  {funnel.map((f) => (
                    <BarRow key={f.stage} label={f.stage} value={f.count} max={maxStage} />
                  ))}
                </Card>

                <Card>
                  <CardHead title="Revenue &amp; Packages" hint="Active care plans" />
                  <div className="co-kpi-value" style={{ marginTop: 2 }}>{money(data.kpis.revenueSold)}</div>
                  <p className="co-sm co-mut" style={{ marginTop: 2 }}>{data.kpis.packages} packages</p>
                  <div style={{ marginTop: 14 }}>
                    <div className="co-spread co-sm" style={{ marginBottom: 6 }}>
                      <span className="co-mut">Collected</span>
                      <span className="co-strong">{money(data.kpis.revenueCollected)}</span>
                    </div>
                    <div className="co-bar-track" style={{ height: 10 }}>
                      <div
                        className="co-bar-fill"
                        style={{ width: `${data.kpis.revenueSold > 0 ? Math.min(100, Math.round((data.kpis.revenueCollected / data.kpis.revenueSold) * 100)) : 0}%` }}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="co-grid">
              <Card>
                <CardHead title="Needs your attention" hint={`${data.attention.length} item${data.attention.length === 1 ? '' : 's'}`} />
                {data.attention.length === 0 ? (
                  <p className="co-sm co-mut">Everything is on track. No overdue tasks or missed appointments.</p>
                ) : (
                  <div className="co-list">
                    {data.attention.map((item, i) => (
                      <div className="co-list-item" key={`${item.kind}-${item.id}-${i}`}>
                        <span className={`co-dot ${item.kind === 'task' ? 'warn' : ''}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="co-strong" style={{ fontSize: 13 }}>{item.title}</div>
                          {item.detail ? <div className="co-xs co-mut" style={{ marginTop: 2 }}>{item.detail}</div> : null}
                        </div>
                        {item.href ? <Link href={item.href} className="co-btn co-btn-sm co-btn-ghost">Open <ArrowUpRight size={12} /></Link> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHead title="Task queue" hint={`${data.tasks.length} open`}>
                  <Link href="/clinic/appointments" className="co-btn co-btn-sm co-btn-ghost">All</Link>
                </CardHead>
                {data.tasks.length === 0 ? (
                  <p className="co-sm co-mut">No open tasks.</p>
                ) : (
                  <div className="co-list">
                    {data.tasks.slice(0, 5).map((t) => (
                      <div className="co-list-item" key={t.id} style={{ alignItems: 'center' }}>
                        <button
                          type="button"
                          className="co-btn co-btn-sm co-icon-btn"
                          aria-label={`Mark ${t.title} done`}
                          onClick={() => doneTask.mutate({ id: t.id, status: 'done' })}
                          style={{ borderRadius: 999 }}
                        >
                          <Check size={13} />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                          <div className="co-xs co-mut">{t.priority === 'high' ? 'High priority' : 'Normal'}{t.due_at ? ` · due ${dateLabel(t.due_at)}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/clinic/appointments" className="co-btn co-btn-sm" style={{ marginTop: 12, width: '100%' }}>
                  <ClipboardList size={13} /> Manage tasks
                </Link>
              </Card>

              <Card>
                <CardHead title="Recent activity" hint="Clinic timeline" />
                {data.activity.length === 0 ? (
                  <p className="co-sm co-mut">No activity yet.</p>
                ) : (
                  <div className="co-list">
                    {data.activity.slice(0, 6).map((n) => (
                      <div className="co-list-item" key={n.id}>
                        <span className="co-dot ok" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13 }}>{n.title || n.body}</div>
                          <div className="co-xs co-mut" style={{ marginTop: 2 }}>
                            {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
