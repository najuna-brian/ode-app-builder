// Only in `npm run dev`: a pretend Formulus that keeps records in this browser, so you can
// click through every screen. "Filling in" a form saves a record with a few sample answers.
// It is left out of the real build. Try real forms in ODE Desktop or Formulus.
import { config, type Observation } from './config';

if (!(window as unknown as { formulus?: unknown }).formulus) {
  const KEY = 'ode-dev-records';
  const load = (): Observation[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const store = (l: Observation[]) => localStorage.setItem(KEY, JSON.stringify(l));
  const sample = (formType: string): Record<string, unknown> => {
    const f = config.forms.find(x => x.formType === formType);
    const out: Record<string, unknown> = {};
    (f?.fields || []).forEach((fd, i) => {
      if (fd.choices) out[fd.name] = Object.keys(fd.choices)[i % Object.keys(fd.choices).length];
      else if (fd.type === 'integer' || fd.type === 'number') out[fd.name] = i + 1;
      else if (fd.type === 'date') out[fd.name] = new Date().toISOString().slice(0, 10);
      else if (!fd.type || fd.type === 'string') out[fd.name] = (fd.label || fd.name) + ' ' + (load().length + 1);
    });
    return out;
  };
  (window as unknown as { formulus: unknown }).formulus = {
    getVersion: async () => 'dev',
    getAvailableForms: async () => config.forms.map(f => ({ formType: f.formType, name: f.title })),
    getObservations: async (formType: string) => load().filter(o => o.formType === formType),
    openFormplayer: async (formType: string, params: { defaultData?: Record<string, unknown> }, savedData: Record<string, unknown>, opts?: { observationId?: string }) => {
      const list = load();
      const now = new Date().toISOString();
      if (opts && opts.observationId) {
        const o = list.find(x => x.observationId === opts.observationId);
        if (o) { o.updatedAt = now; store(list); }
        return { status: 'form_updated', formType, observationId: opts.observationId };
      }
      const o = { observationId: 'dev-' + Date.now(), formType, createdAt: now, updatedAt: now, data: { ...sample(formType), ...(savedData || {}), ...(params.defaultData || {}) } };
      store([...list, o]);
      return { status: 'form_submitted', formType, observationId: o.observationId };
    },
  };
}
