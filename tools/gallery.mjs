// Compiles gallery/templates.txt (the sector templates) into ready projects, using the same
// form model as the question editor. Used by tools/embed.mjs and the unit tests.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FM = require('../builder/js/formmodel.js');
const B = require('../builder/js/core.js');

const TYPE = {
  text: 'text', longtext: 'longtext', phone: 'phone', email: 'email', integer: 'integer', decimal: 'decimal',
  one: 'select_one', many: 'select_many', rating: 'likert', date: 'date', time: 'time', datetime: 'datetime',
  adate: 'adate', timer: 'duration', photo: 'photo', gps: 'gps', signature: 'signature', audio: 'audio',
  video: 'video', scan: 'qrcode', file: 'file',
};
const NUMERIC = ['integer', 'decimal', 'likert'];
const RATING = ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'];

const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function tokens(line) {
  const out = [];
  const re = /(\w+)="([^"]*)"|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ key: m[1], value: m[2] });
    else if (m[3] !== undefined) out.push({ quoted: m[3] });
    else {
      const eq = m[4].indexOf('=');
      out.push(eq > 0 ? { key: m[4].slice(0, eq), value: m[4].slice(eq + 1) } : { word: m[4] });
    }
  }
  return out;
}

function parseChoices(text) {
  return text.split('|').map(s => s.trim()).filter(Boolean).map(s => {
    const c = s.indexOf(':');
    if (c > 0 && /^[a-z0-9_]+$/.test(s.slice(0, c))) return { value: s.slice(0, c), label: s.slice(c + 1).trim(), labels: {} };
    return { value: slug(s), label: s, labels: {} };
  });
}

function parseCondition(text, where) {
  const any = text.includes(',');
  if (any && text.includes('&')) throw new Error(`${where}: mix of & and , in "${text}"`);
  const rules = text.split(any ? ',' : '&').map(part => {
    let m;
    if ((m = /^([a-z0-9_]+)\?$/.exec(part))) return { q: m[1], op: 'answered', value: '' };
    if ((m = /^([a-z0-9_]+)(!=|>=|<=|=|~|>|<)(.+)$/.exec(part))) {
      const op = { '=': 'eq', '!=': 'neq', '~': 'includes', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[m[2]];
      return { q: m[1], op, value: m[3] };
    }
    throw new Error(`${where}: cannot read condition "${part}"`);
  });
  return { match: any ? 'any' : 'all', rules };
}

export function parseGallery(text) {
  const apps = [];
  let app = null, form = null, page = null, lineNo = 0;
  const pending = []; // [showIf, where, questions-available-at-the-end]
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const where = `templates.txt:${lineNo}`;
    let m;
    if ((m = /^app\s+([a-z0-9_-]+)$/.exec(line))) {
      app = { id: m[1], meta: {}, forms: [] }; apps.push(app); form = null; continue;
    }
    if (!app) throw new Error(`${where}: content before the first app`);
    if (!form && (m = /^([a-z]+):\s*(.*)$/.exec(line))) { app.meta[m[1]] = m[2]; continue; }
    // "choices=" always comes last and runs to the end of the line.
    let choiceText = null;
    const ci = line.indexOf(' choices=');
    const head = ci >= 0 ? line.slice(0, ci) : line;
    if (ci >= 0) choiceText = line.slice(ci + 9);
    const t = tokens(head);
    const kw = t[0] && t[0].word;
    const opt = Object.fromEntries(t.filter(x => x.key).map(x => [x.key, x.value]));
    const flags = new Set(t.filter(x => x.word).map(x => x.word));
    if (kw === 'form') {
      const id = t[1].word, title = t[2].quoted;
      form = {
        id, title, icon: opt.icon || 'clipboard-list', desc: opt.desc || '', parent: opt.parent || '',
        summary: opt.summary ? opt.summary.split(',') : [], model: FM.newModel(title),
      };
      form.model.pages = [];
      page = null;
      app.forms.push(form);
      continue;
    }
    if (!form) throw new Error(`${where}: expected a form`);
    if (kw === 'page') {
      page = FM.newPage(t[1].quoted);
      if (opt.if) pending.push([page, parseCondition(opt.if, where), where, form]);
      form.model.pages.push(page);
      continue;
    }
    if (!page) { page = FM.newPage(''); form.model.pages.push(page); }
    const taken = FM.fieldNames(form.model);
    let q;
    if (kw === 'note') {
      q = FM.newQuestion('note', taken, t[1].quoted);
      q.name = FM.slugName('note_' + t[1].quoted, taken);
    } else {
      const type = TYPE[kw];
      if (!type) throw new Error(`${where}: unknown question type "${kw}"`);
      const name = t[1] && t[1].word, label = t[2] && t[2].quoted;
      if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`${where}: bad field name`);
      if (!label) throw new Error(`${where}: missing label`);
      if (taken.includes(name)) throw new Error(`${where}: duplicate field name ${name}`);
      q = FM.newQuestion(type, taken, label);
      q.name = name;
      q.required = flags.has('req');
      if (flags.has('ro')) q.readOnly = true;
      if (opt.hint) q.hint = opt.hint;
      if (opt.min !== undefined) q.min = Number(opt.min);
      if (opt.max !== undefined) q.max = Number(opt.max);
      if (type === 'select_one' || type === 'select_many') {
        if (!choiceText) throw new Error(`${where}: ${name} needs choices=`);
        q.choices = parseChoices(choiceText);
      } else if (type === 'likert') {
        const labels = choiceText ? choiceText.split('|').map(s => s.trim()) : RATING;
        q.choices = labels.map((l, i) => ({ value: String(i + 1), label: l, labels: {} }));
      } else if (choiceText) throw new Error(`${where}: ${name} is not a choice question`);
    }
    if (opt.if) pending.push([q, parseCondition(opt.if, where), where, form]);
    page.questions.push(q);
  }
  // Conditions: check the question exists, the choice value exists, and type the value.
  for (const [target, cond, where, form] of pending) {
    const byName = Object.fromEntries(FM.allQuestions(form.model).map(x => [x.q.name, x.q]));
    for (const r of cond.rules) {
      const src = byName[r.q];
      if (!src) throw new Error(`${where}: condition uses unknown field ${r.q}`);
      if (src.choices && ['eq', 'neq', 'includes'].includes(r.op) && !src.choices.some(c => c.value === r.value))
        throw new Error(`${where}: ${r.q} has no choice "${r.value}" (have ${src.choices.map(c => c.value).join(', ')})`);
      if (NUMERIC.includes(src.type) && r.op !== 'answered') r.value = Number(r.value);
    }
    target.showIf = cond;
  }
  return apps;
}

/** Turn one parsed app into a builder project (the same shape as a saved .odeapp.json). */
export function toProject(a) {
  const p = B.newProject();
  const m = a.meta;
  p.app.name = m.name; p.app.description = m.desc || '';
  p.brand = { primary: m.primary, secondary: m.secondary || m.primary };
  p.home.welcome = m.welcome || ''; p.home.footer = m.footer || '';
  p.home.design = m.design || 'grid';
  p.home.layout = p.home.design === 'list' ? 'list' : 'grid';
  p.gallery = { id: a.id, title: m.title, sector: m.sector, icon: m.icon, blurb: m.blurb };
  const ids = a.forms.map(f => f.id);
  for (const f of a.forms) {
    if (f.parent && !ids.includes(f.parent)) throw new Error(`${a.id}/${f.id}: unknown parent ${f.parent}`);
    if (f.parent) {
      const link = B.linkField(f.parent);
      const parentTitle = a.forms.find(x => x.id === f.parent).title;
      const lq = FM.newQuestion('text', [], parentTitle);
      lq.name = link; lq.readOnly = true;
      lq.hint = 'Filled in for you when you start from the ' + parentTitle.toLowerCase() + ' page.';
      f.model.pages[0].questions.unshift(lq);
    }
    const names = FM.fieldNames(f.model);
    for (const s of f.summary) if (!names.includes(s)) throw new Error(`${a.id}/${f.id}: summary field ${s} not in the form`);
    const out = B.newForm(f.title);
    out.formType = f.id; out.description = f.desc; out.icon = f.icon; out.parent = f.parent;
    out.onHome = !f.parent; out.summaryFields = f.summary; out.model = f.model;
    const c = FM.compileForm(f.model);
    out.schemaText = c.schemaText; out.uiText = c.uiText;
    p.forms.push(out);
  }
  return p;
}

export function buildGallery(text) {
  const out = {};
  for (const a of parseGallery(text)) out[a.id] = toProject(a);
  return out;
}
