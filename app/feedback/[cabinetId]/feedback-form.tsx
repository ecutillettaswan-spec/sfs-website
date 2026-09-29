'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Cookie, HeartHandshake, PackageX, ShieldAlert, Sparkles } from 'lucide-react';

const choices = [
  { key: 'empty', label: 'It is empty', detail: 'The cabinet needs food', Icon: PackageX },
  { key: 'damaged', label: 'Something is damaged', detail: 'A door, shelf, or sign needs help', Icon: ShieldAlert },
  { key: 'request', label: 'Request a snack', detail: 'Tell us what you would eat', Icon: Cookie },
  { key: 'dietary', label: 'Dietary or allergen concern', detail: 'Help us stock more safely', Icon: HeartHandshake },
  { key: 'other', label: 'Something else', detail: 'Share a short note', Icon: Sparkles },
];

export default function FeedbackForm({ cabinet }: { cabinet: { id: string; name: string; floor: number; location: string } }) {
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [productRequest, setProductRequest] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('saving'); setError('');
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cabinetId: cabinet.id, kind, name, productRequest, message, website }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setStatus('error'); setError(result.error ?? 'Feedback could not be saved.'); return; }
    setStatus('done');
  }

  if (status === 'done') return (
    <main className="feedback-page">
      <section className="feedback-card feedback-thanks">
        <span className="feedback-check"><Check aria-hidden="true" /></span>
        <p className="eyebrow">Received</p>
        <h1>Thanks for looking out for each other.</h1>
        <p>Your note went to the SFS team.</p>
        <Link href="/" className="text-link">About Students Feeding Students</Link>
      </section>
    </main>
  );

  return (
    <main className="feedback-page">
      <form className="feedback-card" onSubmit={submit}>
        <p className="eyebrow">Students Feeding Students</p>
        <h1>How is {cabinet.name}?</h1>
        <p className="feedback-location">Floor {cabinet.floor} · {cabinet.location}</p>
        <fieldset className="feedback-options">
          <legend>Choose one</legend>
          {choices.map(({ key, label, detail, Icon }) => (
            <label key={key} className={kind === key ? 'feedback-option selected' : 'feedback-option'}>
              <input type="radio" name="kind" value={key} checked={kind === key} onChange={() => setKind(key)} required />
              <Icon aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span>
            </label>
          ))}
        </fieldset>
        {kind && <label className="field"><span>Your name <small>(optional)</small></span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" /></label>}
        {kind === 'request' && <label className="field"><span>What snack would you like?</span><input value={productRequest} onChange={(event) => setProductRequest(event.target.value)} maxLength={120} /></label>}
        {kind && <label className="field"><span>Optional note</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={4} /><small>{message.length}/500</small></label>}
        <label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button wide" disabled={!kind || status === 'saving'}>{status === 'saving' ? 'Sending…' : 'Send feedback'}</button>
        <p className="feedback-privacy">Your name is optional. Please leave out private medical or financial details. <a href="/privacy.html">How we use feedback</a></p>
      </form>
    </main>
  );
}
