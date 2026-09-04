'use client';

import { useEffect, useRef } from 'react';
import { ClipboardCheck, HandCoins, PackageCheck, PackagePlus, Pencil, Route, UserPlus, X } from 'lucide-react';
import type { MissionData, Row } from './mission-control';

export type DialogState =
  | null
  | { type: 'count'; cabinet?: Row }
  | { type: 'full-restock' }
  | { type: 'task'; cabinet?: Row }
  | { type: 'donation' }
  | { type: 'purchase' }
  | { type: 'product'; product: Row }
  | { type: 'email' };

type Props = {
  state: Exclude<DialogState, null>;
  data: MissionData;
  busy: boolean;
  onClose: () => void;
  mutate: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
};

const config = {
  count: { eyebrow: 'Manual inventory', title: 'Count a cabinet', Icon: ClipboardCheck },
  'full-restock': { eyebrow: 'After-school bulk snapshot', title: 'Mark every cabinet fully restocked?', Icon: PackageCheck },
  task: { eyebrow: 'Route planning', title: 'Create an assignment', Icon: Route },
  donation: { eyebrow: 'Donation to impact', title: 'Record a donation', Icon: HandCoins },
  purchase: { eyebrow: 'Purchasing', title: 'Record a purchase', Icon: PackagePlus },
  product: { eyebrow: 'Product catalog', title: 'Edit a product', Icon: Pencil },
  email: { eyebrow: 'Accounts', title: 'Approve an email', Icon: UserPlus },
};

function localDateInputValue() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function ActionDialog({ state, data, busy, onClose, mutate }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const current = config[state.type];
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('select,input,textarea')?.focus(), 40);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (state.type === 'count') {
      const quantities = data.products.flatMap((product) => {
        const raw = values.get(`product:${product.id}`);
        return raw === null || String(raw).trim() === '' ? [] : [{ productId: String(product.id), quantity: Number(raw) }];
      });
      await mutate('quick_count', {
        cabinetId: values.get('cabinetId'), quantities, doorStatus: values.get('doorStatus'), notes: values.get('notes'),
      });
    }
    if (state.type === 'full-restock') await mutate('mark_all_fully_restocked', {
      idempotencyKey: idempotencyKey.current,
      confirmed: values.get('confirmed') === 'on',
    });
    if (state.type === 'task') await mutate('create_task', Object.fromEntries(values.entries()));
    if (state.type === 'donation') await mutate('add_donation', { ...Object.fromEntries(values.entries()), idempotencyKey: idempotencyKey.current });
    if (state.type === 'purchase') await mutate('add_purchase', { ...Object.fromEntries(values.entries()), idempotencyKey: idempotencyKey.current });
    if (state.type === 'product') await mutate('update_product', { id: state.product.id, ...Object.fromEntries(values.entries()) });
    if (state.type === 'email') await mutate('approve_email', Object.fromEntries(values.entries()));
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
      <section className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div className="dialog-title-wrap"><span className="dialog-icon"><current.Icon aria-hidden="true" /></span><div><p className="eyebrow">{current.eyebrow}</p><h2 id="dialog-title">{current.title}</h2></div></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" disabled={busy}><X /></button>
        </div>
        <form ref={formRef} onSubmit={submit}>
          {state.type === 'count' && <>
            <p className="dialog-intro">Enter only what you can count. A blank product is marked unknown for this snapshot—it never inherits a stale count or becomes zero.</p>
            <label className="field"><span>Cabinet</span><select name="cabinetId" defaultValue={state.cabinet?.id ?? data.cabinets[0]?.id} required>{data.cabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinet.name} · Floor {cabinet.floor}</option>)}</select></label>
            <div className="count-grid">
              {data.products.map((product) => {
                const selectedCabinet = state.cabinet?.id ?? data.cabinets[0]?.id;
                const currentCount = data.inventory.find((row) => row.cabinet_id === selectedCabinet && row.product_id === product.id)?.quantity;
                return <label className="count-field" key={product.id}><span>{product.name}</span><input name={`product:${product.id}`} type="number" inputMode="numeric" min="0" max="10000" placeholder={currentCount === null || currentCount === undefined ? 'Unknown' : String(currentCount)} /><small>individual snacks</small></label>;
              })}
            </div>
            <label className="field"><span>Door condition</span><select name="doorStatus" defaultValue="Closed"><option>Closed</option><option>Closed but not latched</option><option>Open</option><option>Damaged</option></select></label>
            <label className="field"><span>Optional handoff note</span><textarea name="notes" rows={3} maxLength={500} placeholder="Anything the next volunteer should know?" /></label>
          </>}

          {state.type === 'full-restock' && <>
            <p className="dialog-intro">Use this only after the team has filled every cabinet after school. It records each cabinet as five full bins with 50 snacks per bin—without guessing which products are in those bins.</p>
            <div className="notice-strip"><PackageCheck aria-hidden="true" /><div><strong>{data.cabinets.length} cabinets · {data.cabinets.length * 5} bins · {(data.cabinets.length * 250).toLocaleString()} snacks</strong><span>Mission Control will create one auditable cabinet-level restock event and one condition snapshot per cabinet. Existing product counts will remain unchanged because this confirmation does not identify the product mix.</span></div></div>
            <div className="field"><span>Confirmation</span><label className="confirmation-check"><input name="confirmed" type="checkbox" required /><span>I confirm the full after-school restock is complete.</span></label></div>
          </>}

          {state.type === 'task' && <>
            <p className="dialog-intro">Assignments remain internal until a volunteer account is approved and notifications are enabled.</p>
            <label className="field"><span>Assignment</span><input name="title" required maxLength={160} placeholder="Restock the third-floor cabinet" /></label>
            <div className="form-grid"><label className="field"><span>Type</span><select name="type" defaultValue="restock"><option value="restock">Restock</option><option value="check">Cabinet check</option><option value="transfer">Transfer</option><option value="cleanup">Cleanup</option><option value="purchase">Purchase</option></select></label><label className="field"><span>Priority</span><select name="priority" defaultValue="normal"><option value="urgent">Urgent</option><option value="normal">Normal</option><option value="watch">Watch</option></select></label></div>
            <label className="field"><span>Cabinet</span><select name="cabinetId" defaultValue={state.cabinet?.id ?? ''}><option value="">Program-wide</option>{data.cabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinet.name} · {cabinet.location}</option>)}</select></label>
            <div className="form-grid"><label className="field"><span>Assign to</span><select name="assignedTo" defaultValue=""><option value="">Unassigned</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="field"><span>Due</span><input name="dueAt" type="datetime-local" /></label></div>
            <label className="field"><span>Instructions</span><textarea name="instructions" rows={3} maxLength={500} /></label>
          </>}

          {state.type === 'donation' && <>
            <p className="dialog-intro">Impact is labeled as an estimate until funds are allocated to eligible food purchases.</p>
            <label className="field"><span>Donor label</span><input name="donorLabel" required maxLength={120} placeholder="Anonymous donor or organization" /></label>
            <div className="form-grid"><label className="field"><span>Amount</span><div className="money-input"><span>$</span><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div></label><label className="field"><span>Date received</span><input name="receivedAt" type="date" defaultValue={localDateInputValue()} required /></label></div>
            <label className="field"><span>Campaign</span><input name="campaign" defaultValue="General support" /></label>
            <label className="field"><span>Restriction</span><select name="restriction" defaultValue="Unrestricted"><option>Unrestricted</option><option>Food purchases only</option><option>Cabinets and equipment</option><option>In-kind donation</option></select></label>
            <label className="field"><span>Internal note</span><textarea name="notes" rows={3} maxLength={500} /></label>
          </>}

          {state.type === 'purchase' && <>
            <p className="dialog-intro">Record the receipt total and, when known, the number of individual snacks. Linking a donation changes its impact from an estimate to purchase-backed attribution.</p>
            <label className="field"><span>Vendor</span><input name="vendor" required maxLength={120} placeholder="Costco, Target, local partner…" /></label>
            <div className="form-grid"><label className="field"><span>Total amount</span><div className="money-input"><span>$</span><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div></label><label className="field"><span>Purchase date</span><input name="purchasedAt" type="date" defaultValue={localDateInputValue()} required /></label></div>
            <label className="field"><span>Individual snack units (optional)</span><input name="snackUnits" type="number" inputMode="numeric" min="1" max="1000000" step="1" placeholder="840" /></label>
            {!!data.donations.filter((donation) => ['Unrestricted', 'Food purchases only'].includes(String(donation.restriction ?? 'Unrestricted'))).length && <label className="field"><span>Funded by donation (optional)</span><select name="donationId" defaultValue=""><option value="">Not allocated to a donation</option>{data.donations.filter((donation) => ['Unrestricted', 'Food purchases only'].includes(String(donation.restriction ?? 'Unrestricted'))).map((donation) => <option key={donation.id} value={donation.id}>{donation.donor_label} · {(Number(donation.amount_cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</option>)}</select><small>Only eligible food funds are shown. Purchase-linked records still require normal receipt review.</small></label>}
            <label className="field"><span>Receipt link</span><input name="receiptUrl" type="url" placeholder="https://" /></label>
            <label className="field"><span>Internal note</span><textarea name="notes" rows={3} maxLength={500} /></label>
          </>}

          {state.type === 'product' && <>
            <p className="dialog-intro">Keep purchasing signals honest: use current supplier prices and record allergens conservatively. A blank case price stays unknown.</p>
            <label className="field"><span>Product name</span><input name="name" required maxLength={120} defaultValue={state.product.name} /></label>
            <div className="form-grid"><label className="field"><span>Category</span><input name="category" required maxLength={120} defaultValue={state.product.category} /></label><label className="field"><span>Supplier</span><input name="supplier" maxLength={120} defaultValue={state.product.supplier ?? ''} /></label></div>
            <div className="form-grid"><label className="field"><span>Units per case</span><input name="unitsPerCase" type="number" min="1" max="10000" step="1" required defaultValue={state.product.units_per_case ?? ''} /></label><label className="field"><span>Current case price</span><div className="money-input"><span>$</span><input name="costPerCase" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={state.product.cost_per_case ?? ''} /></div></label></div>
            <div className="form-grid"><label className="field"><span>Nutrition score · 1–5</span><input name="nutritionScore" type="number" min="1" max="5" step="1" required defaultValue={state.product.nutrition_score ?? 3} /></label><label className="field"><span>Popularity · 0–100</span><input name="popularityScore" type="number" min="0" max="100" step="1" required defaultValue={state.product.popularity_score ?? 50} /></label></div>
            <label className="field"><span>Allergens · comma separated</span><input name="allergens" maxLength={600} defaultValue={Array.isArray(state.product.allergen_flags) ? state.product.allergen_flags.join(', ') : ''} placeholder="Wheat, milk" /></label>
            <label className="field"><span>Dietary labels · comma separated</span><input name="dietaryLabels" maxLength={600} defaultValue={Array.isArray(state.product.dietary_labels) ? state.product.dietary_labels.join(', ') : ''} placeholder="Gluten-free, vegan" /></label>
          </>}

          {state.type === 'email' && <>
            <p className="dialog-intro">The person must sign in using this exact email. Access checks happen on the server, not only in the interface.</p>
            <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="off" required placeholder="person@example.org" /></label>
            <label className="field"><span>Name (optional)</span><input name="name" maxLength={120} /></label>
            <label className="field"><span>Role</span><select name="role" defaultValue="volunteer"><option value="admin">Administrator</option><option value="coordinator">Coordinator</option><option value="volunteer">Volunteer</option><option value="board_viewer">Board viewer</option></select></label>
          </>}

          <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : state.type === 'email' ? 'Approve email' : state.type === 'full-restock' ? 'Record full restock' : 'Save'}</button></div>
        </form>
      </section>
    </div>
  );
}
