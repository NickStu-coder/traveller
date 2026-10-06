import { getFormatter, getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';

/** Draw only immutable observations in the requested currency, without estimated samples. */
export async function ObservationChart({ rows, currency }: { rows: { id: string; observedAt: Date; amount: { toString(): string }; currency: string }[]; currency: string }) {
  const [format, t] = await Promise.all([getFormatter(), getTranslations('Traveller')]);
  const samples = rows.filter(row => row.currency === currency).sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  if (!samples.length) return null;
  const values = samples.map(row => Number(row.amount.toString())), minimum = Math.min(...values), maximum = Math.max(...values);
  const first = samples[0]!.observedAt.getTime(), last = samples.at(-1)!.observedAt.getTime();
  const points = samples.map((sample, index) => ({ ...sample,
    x: 85 + (last === first ? .5 : (sample.observedAt.getTime() - first) / (last - first)) * 480,
    y: 170 - (maximum === minimum ? .5 : (values[index]! - minimum) / (maximum - minimum)) * 130,
    price: format.number(values[index]!, { style: 'currency', currency }),
    date: format.dateTime(sample.observedAt, { dateStyle: 'medium', timeStyle: 'short' }),
  }));
  return <figure className={styles.chart}>
    <svg viewBox="0 0 620 215" role="img" aria-label={t('history')}>
      <line className={styles.chartAxis} x1="80" x2="575" y1="175" y2="175" />
      <text x="5" y="43">{format.number(maximum, { style: 'currency', currency, maximumFractionDigits: 0 })}</text>
      <text x="5" y="172">{format.number(minimum, { style: 'currency', currency, maximumFractionDigits: 0 })}</text>
      <polyline className={styles.chartLine} points={points.map(point => `${point.x},${point.y}`).join(' ')} />
      {points.map(point => <circle className={styles.chartPoint} cx={point.x} cy={point.y} r="4" key={point.id}><title>{point.date} · {point.price}</title></circle>)}
      <text x="85" y="205">{format.dateTime(samples[0]!.observedAt, { dateStyle: 'short' })}</text>
      <text x="565" y="205" textAnchor="end">{format.dateTime(samples.at(-1)!.observedAt, { dateStyle: 'short' })}</text>
    </svg>
    <figcaption className={styles.meta}>{t('measuredHistoryOnly')}</figcaption>
  </figure>;
}
