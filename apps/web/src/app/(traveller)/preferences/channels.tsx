'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../traveller.module.css';
type Channel = { id: string; label: string | null; type: string; enabled: boolean };
export function Channels() {
  const t = useTranslations('Traveller');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [type, setType] = useState('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const reload = async () => {
    const response = await fetch('/api/traveller/channels');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? t('error'));
    setChannels(result.data.channels);
  };
  useEffect(() => { let active = true; void fetch('/api/traveller/channels').then(async response => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (active) setChannels(result.data.channels);
  }).catch(() => { if (active) setError(t('error')); }); return () => { active = false; }; }, [t]);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const formElement = event.currentTarget, form = new FormData(formElement);
    const config = Object.fromEntries([...form].filter(([key]) => key !== 'label')) as Record<string, FormDataEntryValue | number | boolean>;
    if (type === 'email') {
      config.port = Number(form.get('port')); config.secure = form.has('secure');
      const address = String(form.get('user') ?? '').trim();
      config.from = String(form.get('from') ?? '').trim() || address;
      config.to = String(form.get('to') ?? '').trim() || address;
    }
    try {
      const response = await fetch('/api/traveller/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: form.get('label'), config }) });
      if (!response.ok) throw new Error((await response.json()).error ?? t('error'));
      formElement.reset(); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('error')); }
    finally { setBusy(false); }
  };
  const change = async (channel: Channel, remove = false) => {
    if (remove && !confirm(t('removeChannelConfirm'))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/traveller/channels/${encodeURIComponent(channel.id)}`, { method: remove ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: remove ? undefined : JSON.stringify({ enabled: !channel.enabled }) });
      if (!response.ok) throw new Error((await response.json()).error ?? t('error'));
      await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('error')); }
    finally { setBusy(false); }
  };
  const test = async (channel: Channel) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/traveller/channels/${encodeURIComponent(channel.id)}/test`, { method: 'POST' });
      if (!response.ok) throw new Error(t(response.status === 429 ? 'channelTestThrottled' : response.status === 503 ? 'channelTestUnavailable' : 'channelTestFailed'));
      setNotice(t('channelTestSent'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('channelTestFailed')); }
    finally { setBusy(false); }
  };
  const fields: Record<string, [string, string, string, boolean][]> = {
    telegram: [['botToken', 'botToken', 'password', true], ['chatId', 'chatId', 'text', true]],
    ntfy: [['server', 'server', 'url', false], ['topic', 'topic', 'text', true], ['token', 'token', 'password', false]],
    webhook: [['url', 'webhookUrl', 'url', true], ['secret', 'webhookSecret', 'password', false]],
    email: [['host', 'smtpHost', 'text', true], ['port', 'smtpPort', 'number', true], ['user', 'smtpUser', 'email', true], ['pass', 'smtpPass', 'password', false], ['from', 'emailFrom', 'email', false], ['to', 'emailTo', 'email', false]],
  };
  return <section><h2>{t('channels')}</h2><p className={styles.notice}>{t('privateChannels')}</p>{error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.cards}>{channels.map(channel => <article className={styles.card} key={channel.id}><h3>{channel.label ?? channel.type}</h3><p>{channel.type} · {channel.enabled ? t('active') : t('paused')}</p><div className={styles.actions}><button className={styles.button} disabled={busy || !channel.enabled} onClick={() => void test(channel)}>{t('channelTest')}</button><button className={styles.button} disabled={busy} onClick={() => void change(channel)}>{channel.enabled ? t('pause') : t('resume')}</button><button className={styles.button} disabled={busy} onClick={() => void change(channel, true)}>{t('removeChannel')}</button></div></article>)}</div>
    <form className={styles.form} onSubmit={save}><fieldset><legend>{t('addChannel')}</legend><div className={styles.grid}>
      <label className={styles.field}>{t('channelType')}<select value={type} onChange={event => setType(event.target.value)}>{Object.keys(fields).map(value => <option value={value} key={value}>{value === 'email' ? t('email') : value === 'webhook' ? 'Webhook' : value === 'telegram' ? 'Telegram' : 'ntfy'}</option>)}</select></label>
      <label className={styles.field}>{t('name')}<input name="label" required maxLength={100} /></label>
      {fields[type]!.map(([name, key, inputType, required]) => <label className={styles.field} key={`${type}-${name}`}>{t(key)}<input name={name} type={inputType} required={required} maxLength={1000} autoComplete={inputType === 'password' ? 'new-password' : 'off'} defaultValue={name === 'server' ? 'https://ntfy.sh' : name === 'host' ? 'smtp.gmail.com' : name === 'port' ? 587 : ''} /></label>)}
      </div>{type === 'email' && <><p className={styles.notice}>{t('gmailSetup')} <a href="https://support.google.com/mail/answer/185833" target="_blank" rel="noopener noreferrer">{t('gmailAppPassword')}</a></p><label className={styles.check}><input name="secure" type="checkbox" />{t('smtpTls')}</label></>}<div className={styles.actions}><button className={styles.button} disabled={busy}>{busy ? t('saving') : t('addChannel')}</button></div></fieldset></form>
  </section>;
}
