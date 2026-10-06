'use client';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { SchedulerSettings } from '@/lib/traveller/scheduler/policy';
import type { SourceStatus } from '@/lib/traveller/sources/types';
import type { ScoreWeights } from '@/lib/traveller/engine/policy';
import styles from '../traveller.module.css';

interface Source { source: string; enabled: boolean; status: SourceStatus; capabilities: string[]; budgetPerDay: number; usedToday: number; budgetDate: string; nextAllowedAt: string; lastSuccessAt: string | null; lastError: string | null; revision: number; metadata: { name: string; limitation: string } }
interface Job { id: string; source: string; state: string; profile: { name: string; userId: string }; startedAt: string | null; durationMs: number | null; resultCount: number; error: string | null }
interface Operations { sources: Source[]; jobs: Job[]; revision: number; settings: SchedulerSettings; observations: number; averageDurationMs: number | null; engine: { baseCurrency: string; weights: ScoreWeights }; engineRevision: number }
const settingFields = ['discoveryMinutes', 'watchMinutes', 'hotMinutes', 'coldMinutes', 'maxFailures', 'maxCandidatesPerJob', 'sourceSpacingSeconds'] as const;
const weightFields = ['discount', 'percentile', 'quality', 'verification'] as const;

export function TravellerOperations() {
  const t = useTranslations('Traveller');
  const format = useFormatter();
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  async function refresh() {
    const response = await fetch('/api/traveller/admin', { cache: 'no-store' });
    const result = await response.json() as { ok: boolean; data: Operations };
    if (!response.ok || !result.ok) throw new Error('Operations unavailable');
    setData(result.data);
  }
  useEffect(() => { void refresh().catch(() => { setError(true); }); }, []);
  async function save(update: unknown) {
    setSaving(true); setError(false);
    try {
      const response = await fetch('/api/traveller/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      if (!response.ok) throw new Error('Operations unavailable');
      await refresh();
    } catch { setError(true); } finally { setSaving(false); }
  }
  const date = (value: string | null) => value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : t('unavailable');
  return <><h1 className={styles.title}>{t('operations')}</h1>{error && <p className={styles.error} role="alert">{t('operationsError')}</p>}
    {!data ? <p>{t('loading')}</p> : <>
      <section className={styles.cards}>{data.sources.map(source => <form className={styles.card} key={source.source + ':' + source.revision} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'source', source: source.source, revision: source.revision, enabled: form.get('enabled') === 'on', budgetPerDay: Number(form.get('budget')) });
      }}><h2>{source.metadata.name}</h2><p>{t('sourceStatus')}: {t(source.status)}</p><p className={styles.meta}>{t('limit_' + source.source)}</p>
        <label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={source.enabled} disabled={saving || !source.capabilities.length} />{t('active')}</label>
        <label className={styles.field}>{t('budget')}<input type="number" min="1" max="200" name="budget" defaultValue={source.budgetPerDay} disabled={saving} required /></label>
        <p>{t('usedBudget')}: {source.budgetDate === new Date().toISOString().slice(0, 10) ? source.usedToday : 0}</p><p>{t('nextAllowed')}: {date(source.nextAllowedAt)}</p><p>{t('lastSuccess')}: {date(source.lastSuccessAt)}</p>
        {source.lastError && <p className={styles.error}>{source.lastError}</p>}<button className={styles.button} disabled={saving}>{t('saveOperations')}</button>
      </form>)}</section>
      <form className={styles.form} key={'scheduler:' + data.revision} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'scheduler', revision: data.revision, settings: Object.fromEntries(settingFields.map(key => [key, Number(form.get(key))])) });
      }}><fieldset><legend>{t('operations')}</legend><div className={styles.grid}>{settingFields.map(key => <label className={styles.field} key={key}>{t(key)}<input name={key} type="number" min="1" defaultValue={data.settings[key]} disabled={saving} required /></label>)}</div><button className={styles.button} disabled={saving}>{t('saveOperations')}</button></fieldset></form>
      <form className={styles.form} key={'engine:' + data.engineRevision} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void save({ kind: 'engine', revision: data.engineRevision, settings: { baseCurrency: form.get('baseCurrency'), weights: Object.fromEntries(weightFields.map(key => [key, Number(form.get(key))])) } });
      }}><fieldset><legend>{t('scoringSettings')}</legend><p>{t('weightsNotice')}</p><div className={styles.grid}>
        <label className={styles.field}>{t('baseCurrency')}<select name="baseCurrency" defaultValue={data.engine.baseCurrency} disabled={saving}>{Intl.supportedValuesOf('currency').map(code => <option value={code} key={code}>{code}</option>)}</select></label>
        {weightFields.map(key => <label className={styles.field} key={key}>{t('weight_' + key)}<input name={key} type="number" min="0" max="100" defaultValue={data.engine.weights[key]} disabled={saving} required /></label>)}
      </div><button className={styles.button} disabled={saving}>{t('saveOperations')}</button></fieldset></form>
      <h2>{t('jobs')}</h2><div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('name')}</th><th>{t('source')}</th><th>{t('jobState')}</th><th>{t('resultCount')}</th><th>{t('durationMs')}</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td>{job.profile.name}<br /><small>{job.id}</small></td><td>{job.source}</td><td>{t('job_' + job.state)}{job.error && <p className={styles.error}>{job.error}</p>}</td><td>{job.resultCount}</td><td>{job.durationMs ?? t('unavailable')}</td></tr>)}</tbody></table></div>
    </>}</>;
}
