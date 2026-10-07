'use client';
import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { SchedulerSettings } from '@/lib/traveller/scheduler/policy';
import type { SourceStatus } from '@/lib/traveller/sources/types';
import type { ScoreWeights } from '@/lib/traveller/engine/policy';
import { useBrowserTimeZone } from '../activity/local-time';
import styles from '../traveller.module.css';
import layout from './operations.module.css';

interface Source { source: string; enabled: boolean; status: SourceStatus; capabilities: string[]; budgetPerDay: number; usedToday: number; budgetDate: string; nextAllowedAt: string; lastSuccessAt: string | null; lastError: string | null; revision: number; metadata: { name: string; limitation: string } }
interface Job { id: string; source: string; state: string; profile: { name: string; userId: string }; runAt: string; startedAt: string | null; durationMs: number | null; resultCount: number; error: string | null }
interface Operations {
  sources: Source[]; jobs: Job[]; counts: { state: string; _count: number }[]; revision: number; settings: SchedulerSettings;
  observations: number; averageDurationMs: number | null; engine: { baseCurrency: string; weights: ScoreWeights }; engineRevision: number;
  profiles: { id: string; name: string; nextCheckAt: string }[]; lastStartedAt: string | null; automaticChecksEnabled: boolean;
}
const settingFields = ['discoveryMinutes', 'watchMinutes', 'hotMinutes', 'coldMinutes', 'maxFailures', 'maxCandidatesPerJob', 'sourceSpacingSeconds'] as const;
const weightFields = ['discount', 'percentile', 'quality', 'verification'] as const;

export function TravellerOperations() {
  const t = useTranslations('Traveller');
  const format = useFormatter();
  const timeZone = useBrowserTimeZone();
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/traveller/admin', { cache: 'no-store', signal });
    const result = await response.json() as { ok: boolean; data: Operations };
    if (!response.ok || !result.ok) throw new Error('Operations unavailable');
    if (signal?.aborted) return;
    setData(result.data); setUpdatedAt(new Date().toISOString()); setError(false);
  }, []);
  useEffect(() => {
    if (saving) return;
    const controller = new AbortController();
    const load = () => { void refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setError(true); }); };
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [saving, refresh]);
  async function save(update: unknown) {
    setSaving(true); setError(false);
    try {
      const response = await fetch('/api/traveller/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      if (!response.ok) throw new Error('Operations unavailable');
      await refresh();
    } catch { setError(true); } finally { setSaving(false); }
  }
  const date = (value: string | null) => value ? <time dateTime={value}>{format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short', timeZone })}</time> : t('unavailable');
  const count = (state: string) => data?.counts.find(row => row.state === state)?._count ?? 0;
  return <>
    <div className={layout.heading}><h1 className={styles.title}>{t('operations')}</h1><button className={styles.button} disabled={saving} onClick={() => void refresh().catch(() => setError(true))}>{t('refreshActivity')}</button></div>
    {error && <p className={styles.error} role="alert">{t('operationsError')}</p>}
    {!data ? <p>{t('loading')}</p> : <div className={layout.sections}>
      <section aria-label={t('monitoringActivity')}>
        <h2>{t('monitoringActivity')}</h2><p>{data.automaticChecksEnabled ? t('automaticChecksEnabled') : t('automaticChecksPaused')} · {t('discoveryCadence', { minutes: data.settings.discoveryMinutes })}</p>
        <p className={styles.meta}>{t('scheduleNotice')}</p>
        <div className={layout.stats}>{(['completed', 'failed', 'queued', 'running'] as const).map(state => <article className={styles.card} key={state}><h3>{t('job_' + state)}</h3><strong className={layout.number}>{format.number(count(state))}</strong></article>)}</div>
        <dl className={styles.facts}><div><dt>{t('observations')}</dt><dd>{format.number(data.observations)}</dd></div><div><dt>{t('lastCheckStarted')}</dt><dd>{date(data.lastStartedAt)}</dd></div><div><dt>{t('activityUpdated')}</dt><dd>{date(updatedAt)}</dd></div></dl>
        <p className={styles.meta}>{t('activityRefreshNotice', { timeZone })}</p>
        <div className={layout.profileSchedule}>{data.profiles.map(profile => <article className={styles.card} key={profile.id}><h3>{profile.name}</h3><p>{t('nextDiscovery')}: {date(profile.nextCheckAt)}</p></article>)}</div>
      </section>
      <section><h2>{t('jobs')}</h2><div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('name')}</th><th>{t('source')}</th><th>{t('scheduledFor')}</th><th>{t('startedAt')}</th><th>{t('jobState')}</th><th>{t('resultCount')}</th><th>{t('durationMs')}</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td title={job.id}>{job.profile.name}</td><td>{data.sources.find(source => source.source === job.source)?.metadata.name ?? job.source}</td><td>{date(job.runAt)}</td><td>{date(job.startedAt)}</td><td>{t('job_' + job.state)}{job.error && <p className={styles.error + ' ' + layout.jobError}>{job.error}</p>}</td><td>{format.number(job.resultCount)}</td><td>{job.durationMs === null ? t('unavailable') : format.number(job.durationMs)}</td></tr>)}</tbody></table></div>{!data.jobs.length && <p>{t('noChecksYet')}</p>}</section>
      <section><h2>{t('sources')}</h2><div className={layout.sources}>{data.sources.map(source => <form className={styles.card} key={source.source + ':' + source.revision + ':' + source.enabled} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'source', source: source.source, revision: source.revision, enabled: form.get('enabled') === 'on', budgetPerDay: Number(form.get('budget')) });
      }}>
        <div className={layout.sourceHeading}><h3>{source.metadata.name}</h3><span className={layout.badge}>{t(source.enabled ? source.status : 'disabled')}</span></div>
        <dl className={styles.facts}><div><dt>{t('usedBudget')}</dt><dd>{source.budgetDate === new Date().toISOString().slice(0, 10) ? source.usedToday : 0} / {source.budgetPerDay}</dd></div><div><dt>{t('lastSuccess')}</dt><dd>{date(source.lastSuccessAt)}</dd></div><div><dt>{t('nextAllowed')}</dt><dd>{date(source.nextAllowedAt)}</dd></div></dl>
        {source.lastError && <p className={styles.error}>{source.lastError}</p>}
        <details className={layout.disclosure}><summary>{t('sourceSettings')}</summary><p className={styles.meta}>{t('limit_' + source.source)}</p>
          <div className={styles.grid}><label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={source.enabled} disabled={saving || !source.capabilities.length} />{t('active')}</label>
          <label className={styles.field}>{t('budget')}<input type="number" min="1" max="200" name="budget" defaultValue={source.budgetPerDay} disabled={saving} required /></label></div>
          <div className={styles.actions}><button className={styles.button} disabled={saving || !source.capabilities.length}>{t('saveOperations')}</button></div>
        </details>
      </form>)}</div></section>
      <section><h2>{t('schedulerSettings')}</h2><form className={styles.form} key={'scheduler:' + data.revision} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'scheduler', revision: data.revision, settings: Object.fromEntries(settingFields.map(key => [key, Number(form.get(key))])) });
      }}><fieldset><legend>{t('schedulerSettings')}</legend><div className={styles.grid}>{settingFields.map(key => <label className={styles.field} key={key}>{t(key)}<input name={key} type="number" min="1" defaultValue={data.settings[key]} disabled={saving} required /></label>)}</div><div className={styles.actions}><button className={styles.button} disabled={saving}>{t('saveOperations')}</button></div></fieldset></form></section>
      <details className={layout.disclosure}><summary>{t('scoringSettings')}</summary><form className={styles.form} key={'engine:' + data.engineRevision} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'engine', revision: data.engineRevision, settings: { baseCurrency: form.get('baseCurrency'), weights: Object.fromEntries(weightFields.map(key => [key, Number(form.get(key))])) } });
      }}><fieldset><legend>{t('scoringSettings')}</legend><p>{t('weightsNotice')}</p><div className={styles.grid}>
        <label className={styles.field}>{t('baseCurrency')}<select name="baseCurrency" defaultValue={data.engine.baseCurrency} disabled={saving}>{Intl.supportedValuesOf('currency').map(code => <option value={code} key={code}>{code}</option>)}</select></label>
        {weightFields.map(key => <label className={styles.field} key={key}>{t('weight_' + key)}<input name={key} type="number" min="0" max="100" defaultValue={data.engine.weights[key]} disabled={saving} required /></label>)}
      </div><div className={styles.actions}><button className={styles.button} disabled={saving}>{t('saveOperations')}</button></div></fieldset></form></details>
    </div>}
  </>;
}
