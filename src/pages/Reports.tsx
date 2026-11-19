import { useState } from 'react';
import { ApiError, queryString, useFetch } from '../api';
import { usePrefs } from '../prefs';
import { formatDateTime } from '../format';
import type { ReportDataset } from '../types';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Icon,
  LoadingBlock,
  PageHeader,
  TextInput,
  useToast,
} from '../ui';

type ReportResponse = { datasets: ReportDataset[]; from: string | null; to: string | null };

const DATASET_ICONS: Record<string, 'calendar' | 'pin' | 'users' | 'clock' | 'check' | 'alert' | 'chart'> = {
  events: 'calendar',
  venues: 'pin',
  volunteers: 'users',
  shifts: 'clock',
  assignments: 'users',
  attendance: 'check',
  tasks: 'check',
  incidents: 'alert',
};

export default function Reports() {
  const { prefs } = usePrefs();
  const { push } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const range = {
    from: from ? `${from}T00:00:00.000Z` : '',
    to: to ? `${to}T23:59:59.999Z` : '',
  };

  const reports = useFetch<ReportResponse>(`/api/reports${queryString(range)}`);
  const datasets = reports.data?.datasets ?? [];
  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.row_count, 0);

  async function download(dataset: ReportDataset) {
    setBusy(dataset.id);
    try {
      const response = await fetch(`/api/reports/${dataset.id}/download${queryString(range)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        let message = 'Unable to generate this export';
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(message, response.status);
      }
      const blob = await response.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `venueflow-${dataset.id}-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      push(`${dataset.label} exported as CSV`);
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to generate this export', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Live operational exports. Every CSV is generated from the database at download time."
        actions={
          <Button icon="refresh" onClick={reports.reload}>
            Refresh counts
          </Button>
        }
      />

      <Card className="card-pad" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="stack-sm">
            <label className="tiny subtle" htmlFor="report-from">
              From
            </label>
            <TextInput
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="stack-sm">
            <label className="tiny subtle" htmlFor="report-to">
              To
            </label>
            <TextInput
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          {from || to ? (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Clear range
            </Button>
          ) : null}
          <span className="tiny subtle">
            {reports.data?.from || reports.data?.to
              ? `Filtered: ${reports.data?.from ? formatDateTime(reports.data.from, prefs) : 'start'} → ${
                  reports.data?.to ? formatDateTime(reports.data.to, prefs) : 'now'
                }`
              : 'Date filters apply to dated datasets (events, shifts, assignments, attendance, tasks, incidents).'}
          </span>
        </div>
      </Card>

      {reports.error ? <ErrorNote message={reports.error} onRetry={reports.reload} /> : null}

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <Badge tone="info">{datasets.length} datasets</Badge>
        <Badge tone="neutral">{totalRows} rows in current range</Badge>
      </div>

      {reports.loading && datasets.length === 0 ? (
        <LoadingBlock label="Calculating report counts…" />
      ) : (
        <div className="grid grid-3">
          {datasets.map((dataset) => (
            <Card key={dataset.id} className="card-pad stack-sm">
              <div className="row-tight" style={{ gap: 8 }}>
                <span className="stat-icon">
                  <Icon name={DATASET_ICONS[dataset.id] ?? 'chart'} size={16} />
                </span>
                <span style={{ fontWeight: 620 }}>{dataset.label}</span>
              </div>
              <p className="small muted" style={{ minHeight: 38 }}>
                {dataset.description}
              </p>
              <div className="spread">
                <span className="tiny subtle">{dataset.row_count} rows</span>
                <Button
                  size="sm"
                  icon="download"
                  onClick={() => download(dataset)}
                  disabled={busy === dataset.id}
                >
                  {busy === dataset.id ? 'Preparing…' : 'CSV'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
