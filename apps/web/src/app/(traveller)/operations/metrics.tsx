import { getFormatter, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import styles from '../traveller.module.css';

/** Instance totals only: no private search content or notification credentials. */
export async function TravellerMetrics() {
  const since = new Date(Date.now() - 30 * 86400000);
  const [t, format, profiles, observations, alerts, accepted, pending, failures, usage] = await Promise.all([
    getTranslations('Traveller'), getFormatter(), prisma.watchProfile.count({ where: { active: true, archivedAt: null } }),
    prisma.travellerObservation.groupBy({ by: ['kind'], _count: true }), prisma.travellerAlert.count(),
    prisma.travelAlertDelivery.count({ where: { travellerAlertId: { not: null }, deliveredIds: { isEmpty: false } } }),
    prisma.travelAlertDelivery.count({ where: { travellerAlertId: { not: null }, pending: true } }),
    prisma.apiUsageLog.count({ where: { createdAt: { gte: since }, error: { not: null } } }),
    prisma.apiUsageLog.groupBy({ by: ['provider', 'model'], where: { createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true }, _count: { _all: true, inputTokens: true, outputTokens: true, costUsd: true } }),
  ]);
  return <section><h2>{t('instanceMetrics')}</h2><div className={styles.cards}>
    <article className={styles.card}><h3>{t('profiles')}</h3><p>{format.number(profiles)} · {t('active')}</p></article>
    <article className={styles.card}><h3>{t('observations')}</h3>{observations.map(row => <p key={row.kind}>{t(row.kind === 'flight' ? 'flights' : row.kind === 'hotel' ? 'hotels' : 'trips')}: {format.number(row._count)}</p>)}{!observations.length && <p>0</p>}</article>
    <article className={styles.card}><h3>{t('alerts')}</h3><p>{t('alertsRecorded')}: {format.number(alerts)}</p><p>{t('alertsAccepted')}: {format.number(accepted)}</p><p>{t('deliveryPending')}: {format.number(pending)}</p></article>
  </div><h3>{t('aiUsage30Days')}</h3><p>{t('aiOptionalNotice')}</p><p>{t('aiFailures')}: {format.number(failures)}</p>
    {usage.length ? <div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('providerModel')}</th><th>{t('aiCalls')}</th><th>{t('inputTokens')}</th><th>{t('outputTokens')}</th><th>{t('estimatedCost')}</th></tr></thead><tbody>{usage.map(row => <tr key={row.provider + ':' + row.model}>
      <td>{row.provider} · {row.model}</td><td>{format.number(row._count._all)}</td>
      <td>{row._count.inputTokens === row._count._all ? format.number(row._sum.inputTokens ?? 0) : t('unknown')}</td>
      <td>{row._count.outputTokens === row._count._all ? format.number(row._sum.outputTokens ?? 0) : t('unknown')}</td>
      <td>{row._count.costUsd === row._count._all ? format.number(row._sum.costUsd ?? 0, { style: 'currency', currency: 'USD' }) : t('unknown')}</td>
    </tr>)}</tbody></table></div> : <p>{t('noAiUsage')}</p>}
  </section>;
}
