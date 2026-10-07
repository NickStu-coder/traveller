'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { profileSchema, type WatchConstraints } from '@/lib/traveller/profiles';
import styles from '../traveller.module.css';
import { LocalTime } from '../activity/local-time';

type Profile = { id: string; revision: number; active: boolean; constraints: unknown; nextCheckAt: string };
type Channel = { id: string; label: string | null; type: string };
const initial = { ...profileSchema.parse({ name: 'Default', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 1 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } }), name: '' };

export function Profiles({ initialProfiles, channels }: { initialProfiles: Profile[]; channels: Channel[] }) {
  const t = useTranslations('Traveller');
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    const response = await fetch('/api/traveller/profiles');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? t('error'));
    setProfiles(result.data.profiles);
  };
  const archive = async (profile: Profile) => {
    if (!confirm(t('archiveConfirm'))) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/traveller/profiles/${encodeURIComponent(profile.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: profile.revision }) });
      if (!response.ok) throw new Error((await response.json()).error ?? t('error'));
      await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('error')); }
    finally { setBusy(false); }
  };
  return <><h1 className={styles.title}>{t('profiles')}</h1><p className={styles.notice}>{t('sourcesUnavailable')}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!editing && <button className={styles.button} onClick={() => setEditing('new')} disabled={busy}>{t('createProfile')}</button>}
    {editing && <ProfileForm key={editing === 'new' ? 'new' : editing.id} profile={editing === 'new' ? undefined : editing} channels={channels} onCancel={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null); }} />}
    <div className={styles.cards}>{profiles.map(profile => {
      const constraints = profileSchema.safeParse(profile.constraints);
      if (!constraints.success) return <article className={styles.card} key={profile.id}><p>{t('unavailable')}</p></article>;
      const p = constraints.data;
      return <article className={styles.card} key={profile.id}><h2>{p.name}</h2><p>{p.origins.join(', ')} · {p.destination.kind === 'anywhere' ? t('anywhere') : p.destination.values.join(', ')}</p><p>{t(p.cabin)} · {p.duration.minNights}–{p.duration.maxNights} {t('minNights').toLowerCase()}</p><p className={styles.meta}>{profile.active ? t('active') : t('paused')} · {t('revision')} {profile.revision}</p>
        {profile.active && <p>{t('nextDiscovery')}: <LocalTime value={profile.nextCheckAt} /></p>}
        <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => setEditing(profile)}>{t('edit')}</button><button className={styles.button} disabled={busy} onClick={() => void archive(profile)}>{t('archive')}</button></div></article>;
    })}</div>{!profiles.length && !editing && <p>{t('noProfiles')}</p>}</>;
}

function ProfileForm({ profile, channels, onCancel, onSaved }: { profile?: Profile; channels: Channel[]; onCancel: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations('Traveller');
  const p = profile ? profileSchema.parse(profile.constraints) : initial;
  const [destination, setDestination] = useState<WatchConstraints['destination']['kind']>(p.destination.kind);
  const [dates, setDates] = useState<WatchConstraints['dates']['mode']>(p.dates.mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (name: string, label: string, value: string | number | null, type = 'text', minimum?: number, maximum?: number) => <label className={styles.field} key={name}>{t(label)}<input name={name} defaultValue={value ?? ''} type={type} min={minimum} max={maximum} step={type === 'number' ? 'any' : undefined} maxLength={type === 'text' ? 1000 : undefined} /></label>;
  const check = (name: string, label: string, value: boolean) => <label className={styles.check} key={name}><input name={name} type="checkbox" defaultChecked={value} />{t(label)}</label>;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const list = (name: string) => text(name).split(',').map(value => value.trim()).filter(Boolean);
    const number = (name: string) => Number(text(name));
    const optional = (name: string) => text(name) ? number(name) : null;
    const checked = (name: string) => form.has(name);
    const parsed = profileSchema.safeParse({
      name: text('name'), origins: list('origins').map(value => value.toUpperCase()),
      destination: destination === 'anywhere' ? { kind: destination } : { kind: destination, values: list('destinations').map(value => destination === 'airport' ? value.toUpperCase() : value) },
      dates: dates === 'window' ? { mode: dates, from: text('from'), to: text('to') } : dates === 'months' ? { mode: dates, months: list('months').map(Number), horizonDays: number('horizon') } : { mode: dates, days: number('horizon') },
      duration: { minNights: number('minNights'), maxNights: number('maxNights') },
      passengers: { adults: number('adults'), children: list('children').map(Number), infants: number('infants') },
      cabin: text('cabin'), currency: text('currency').toUpperCase(),
      flight: { maxPrice: optional('maxPrice'), maxStops: optional('stops'), maxDurationMinutes: optional('duration'), minLayoverMinutes: number('minLayover'), maxLayoverMinutes: number('maxLayover'), checkedBags: number('bags'), preferredAirlines: list('preferredAirlines'), excludedAirlines: list('excludedAirlines'), excludedAirports: list('excludedAirports').map(value => value.toUpperCase()), allowSelfTransfer: checked('selfTransfer'), allowOvernight: checked('overnight') },
      hotel: { enabled: checked('hotelEnabled'), rooms: number('rooms'), minStars: number('stars'), minRating: number('rating'), minReviews: number('reviews'), maxNightlyPrice: optional('nightly'), maxTotalPrice: optional('hotelTotal'), radiusKm: optional('radius'), amenities: list('amenities'), propertyTypes: list('propertyTypes'), breakfast: checked('breakfast'), refundable: checked('refundable') },
      positioning: { homeAirports: list('homeAirports').map(value => value.toUpperCase()), maxDistanceKm: number('distance'), estimates: list('estimates').map(value => { const [airport, partyCost] = value.split('='); return { airport: airport?.trim().toUpperCase(), partyCost: partyCost?.trim() ? Number(partyCost) : Number.NaN }; }) },
      alerts: { minScore: number('score'), maxTripPrice: optional('tripPrice'), allowLowConfidence: checked('lowConfidence'), cooldownHours: number('cooldown'), minImprovementPercent: number('improvement'), channelIds: form.getAll('channel').map(String) },
    });
    try {
      if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
      const response = await fetch(profile ? `/api/traveller/profiles/${encodeURIComponent(profile.id)}` : '/api/traveller/profiles', { method: profile ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile ? { revision: profile.revision, active: checked('active'), constraints: parsed.data } : parsed.data) });
      if (!response.ok) throw new Error((await response.json()).error ?? t('error'));
      await onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('error')); }
    finally { setBusy(false); }
  };
  return <form className={styles.form} onSubmit={submit}>
    {field('name', 'name', p.name)}{profile && check('active', 'activeProfile', profile.active)}
    <fieldset><legend>{t('destination')}</legend><div className={styles.grid}>
      {field('origins', 'origins', p.origins.join(', '))}
      <label className={styles.field}>{t('destination')}<select value={destination} onChange={event => setDestination(event.target.value as typeof destination)}>{['anywhere', 'airport', 'city', 'country', 'region', 'continent'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      {destination !== 'anywhere' && field('destinations', 'destinations', p.destination.kind === 'anywhere' ? '' : p.destination.values.join(', '))}</div><p className={styles.meta}>{t('airportHint')}</p></fieldset>
    <fieldset><legend>{t('dates')}</legend><div className={styles.grid}>
      <label className={styles.field}>{t('dates')}<select value={dates} onChange={event => setDates(event.target.value as typeof dates)}>{['rolling', 'window', 'months'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      {dates === 'window' ? <>{field('from', 'from', p.dates.mode === 'window' ? p.dates.from : '', 'date')}{field('to', 'to', p.dates.mode === 'window' ? p.dates.to : '', 'date')}</> : field('horizon', 'horizon', p.dates.mode === 'rolling' ? p.dates.days : p.dates.mode === 'months' ? p.dates.horizonDays : 365, 'number', 2, 730)}
      {dates === 'months' && field('months', 'monthNumbers', p.dates.mode === 'months' ? p.dates.months.join(', ') : '')}
      {field('minNights', 'minNights', p.duration.minNights, 'number', 1, 90)}{field('maxNights', 'maxNights', p.duration.maxNights, 'number', 1, 90)}</div></fieldset>
    <fieldset><legend>{t('party')}</legend><div className={styles.grid}>
      {field('adults', 'adults', p.passengers.adults, 'number', 1, 9)}{field('children', 'children', p.passengers.children.join(', '))}{field('infants', 'infants', p.passengers.infants, 'number', 0, 8)}
      <label className={styles.field}>{t('cabin')}<select name="cabin" defaultValue={p.cabin}>{['economy', 'premium_economy', 'business', 'first'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>{field('currency', 'currency', p.currency)}</div></fieldset>
    <fieldset><legend>{t('flight')}</legend><div className={styles.grid}>
      {field('maxPrice', 'maxFlightPrice', p.flight.maxPrice, 'number', 0)}{field('stops', 'stops', p.flight.maxStops, 'number', 0, 5)}{field('duration', 'duration', p.flight.maxDurationMinutes, 'number', 30, 4320)}{field('minLayover', 'minLayover', p.flight.minLayoverMinutes, 'number', 0, 1440)}{field('maxLayover', 'maxLayover', p.flight.maxLayoverMinutes, 'number', 0, 2880)}{field('bags', 'bags', p.flight.checkedBags, 'number', 0, 4)}{field('preferredAirlines', 'preferredAirlines', p.flight.preferredAirlines.join(', '))}{field('excludedAirlines', 'excludedAirlines', p.flight.excludedAirlines.join(', '))}{field('excludedAirports', 'excludedAirports', p.flight.excludedAirports.join(', '))}</div>
      {check('selfTransfer', 'selfTransfer', p.flight.allowSelfTransfer)}{check('overnight', 'overnight', p.flight.allowOvernight)}<p className={styles.meta}>{t('unlimited')}</p></fieldset>
    <fieldset><legend>{t('hotel')}</legend>{check('hotelEnabled', 'hotelEnabled', p.hotel.enabled)}<div className={styles.grid}>
      {field('rooms', 'rooms', p.hotel.rooms, 'number', 1, 9)}{field('stars', 'stars', p.hotel.minStars, 'number', 0, 5)}{field('rating', 'rating', p.hotel.minRating, 'number', 0, 10)}{field('reviews', 'reviews', p.hotel.minReviews, 'number', 0)}{field('nightly', 'nightly', p.hotel.maxNightlyPrice, 'number', 0)}{field('hotelTotal', 'hotelTotal', p.hotel.maxTotalPrice, 'number', 0)}{field('radius', 'radius', p.hotel.radiusKm, 'number', 0)}{field('amenities', 'amenities', p.hotel.amenities.join(', '))}{field('propertyTypes', 'propertyTypes', p.hotel.propertyTypes.join(', '))}</div>{check('breakfast', 'breakfast', p.hotel.breakfast)}{check('refundable', 'refundable', p.hotel.refundable)}</fieldset>
    <fieldset><legend>{t('positioning')}</legend><div className={styles.grid}>{field('homeAirports', 'homeAirports', p.positioning.homeAirports.join(', '))}{field('distance', 'distance', p.positioning.maxDistanceKm, 'number', 1, 3000)}{field('estimates', 'costEstimates', p.positioning.estimates.map(value => `${value.airport}=${value.partyCost}`).join(', '))}</div><p className={styles.meta}>{t('positioningHint')}</p></fieldset>
    <fieldset><legend>{t('alertPolicy')}</legend><div className={styles.grid}>{field('score', 'score', p.alerts.minScore, 'number', 0, 100)}{field('tripPrice', 'tripPrice', p.alerts.maxTripPrice, 'number', 0)}{field('cooldown', 'cooldown', p.alerts.cooldownHours, 'number', 1, 720)}{field('improvement', 'improvement', p.alerts.minImprovementPercent, 'number', 0, 100)}</div>{check('lowConfidence', 'lowConfidence', p.alerts.allowLowConfidence)}<p>{t('channels')}</p>{channels.length ? channels.map(channel => <label className={styles.check} key={channel.id}><input type="checkbox" name="channel" value={channel.id} defaultChecked={p.alerts.channelIds.includes(channel.id)} />{channel.label ?? channel.type}</label>) : <p className={styles.meta}>{t('noChannels')}</p>}</fieldset>
    {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button className={styles.button} disabled={busy}>{busy ? t('saving') : t('save')}</button><button className={styles.button} type="button" disabled={busy} onClick={onCancel}>{t('cancel')}</button></div>
  </form>;
}
