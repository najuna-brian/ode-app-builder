// Records saved on this device, read through the Formulus API, with a small cache that is
// cleared whenever a form closes.
import { useEffect, useState } from 'react';
import type { FormInfo, FormulusApi, Observation } from './config';
import { t, when } from './i18n';

let api: FormulusApi | null = null;
let cache: Record<string, Observation[]> = {};
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version++; listeners.forEach(l => l()); };

export function getApi() { return api; }

export async function connect(): Promise<FormulusApi | null> {
  try {
    if (typeof window.getFormulus === 'function') {
      api = await Promise.race([
        window.getFormulus(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
    }
  } catch {
    api = null;
  }
  notify();
  return api;
}

export async function records(formType: string): Promise<Observation[]> {
  if (!api) return [];
  if (cache[formType]) return cache[formType];
  let list: Observation[] = [];
  try {
    list = (await api.getObservations(formType)) || [];
  } catch {
    list = [];
  }
  list = list.filter(o => o && !o.deleted);
  list.sort((a, b) => +new Date(b.updatedAt || b.createdAt || 0) - +new Date(a.updatedAt || a.createdAt || 0));
  cache[formType] = list;
  return list;
}
export function cached(formType: string): Observation[] | undefined {
  return cache[formType];
}

/** Load several forms' records; re-runs after a form is saved. */
export function useRecords(formTypes: string[]): Observation[][] | null {
  const [state, setState] = useState<{ v: number; lists: Observation[][] } | null>(null);
  const [v, setV] = useState(version);
  const key = formTypes.join('|');
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all(formTypes.map(records)).then(lists => { if (live) setState({ v, lists }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);
  return state ? state.lists : null;
}

export type Toast = { text: string; kind: '' | 'good' | 'bad' } | null;
let showToast: (t: Toast) => void = () => {};
export function setToastHandler(fn: (t: Toast) => void) { showToast = fn; }
export function toast(text: string | null, kind: '' | 'good' | 'bad' = '') { if (text) showToast({ text, kind }); }

export async function openForm(formType: string, savedData?: Record<string, unknown> | null, observationId?: string | null, prefill?: Record<string, unknown>) {
  if (!api) return toast(t('noApi'), 'bad');
  let result;
  try {
    result = await api.openFormplayer(formType, prefill ? { defaultData: prefill } : {}, savedData || {}, observationId ? { observationId } : undefined);
  } catch (e) {
    result = { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  cache = {};
  notify();
  const s = result && result.status;
  if (s === 'form_submitted') toast(t('submitted'), 'good');
  else if (s === 'form_updated') toast(t('updated'), 'good');
  else if (s === 'draft_saved') toast(t('draft'));
  else if (s === 'error') toast(t('error') + (result.message ? ': ' + result.message : ''), 'bad');
  return result;
}

/* ---------- Showing answers ---------- */

export function fieldOf(f: FormInfo, name: string) {
  return (f.fields || []).find(x => x.name === name);
}
export function display(f: FormInfo, name: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const fd = fieldOf(f, name);
  if (Array.isArray(v)) return v.map(x => display(f, name, x)).filter(Boolean).join(', ');
  if (fd && fd.choices && fd.choices[String(v)]) return fd.choices[String(v)];
  if (typeof v === 'boolean') return v ? t('yes') : t('no');
  if (typeof v === 'object') return t('attached');
  if (fd && fd.type === 'date') return when(String(v));
  return String(v);
}
export function titleOf(o: Observation, f: FormInfo): string {
  const data = o.data || {};
  const keys = f.summaryFields && f.summaryFields.length ? f.summaryFields : (f.fields || []).map(x => x.name).concat(Object.keys(data));
  const link = f.parent && f.parent.field;
  const parts: string[] = [];
  for (const k of keys) {
    if (parts.length >= 2) break;
    if (k === link) continue;
    const v = data[k];
    if (v === null || v === undefined || v === '' || (typeof v === 'object' && !Array.isArray(v))) continue;
    const d = display(f, k, v);
    if (d && !parts.includes(d)) parts.push(d);
  }
  return parts.join(' · ') || when(o.createdAt) || o.observationId;
}
