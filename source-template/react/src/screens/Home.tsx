import { config, homeForms, type FormInfo, type Observation } from '../config';
import { cached, getApi, openForm, toast, useRecords } from '../data';
import { t } from '../i18n';
import { go } from '../router';
import { Header, Icon, Notice, RecordRow, accent } from '../ui';

function startOfDay(d: number) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
const time = (o: Observation) => +new Date(o.updatedAt || o.createdAt || 0);

export function Home() {
  const home = config.home || {};
  const forms = homeForms();
  const design = home.design || (home.layout === 'list' ? 'list' : 'grid');
  const api = getApi();
  const lists = useRecords(forms.map(f => f.formType)) || forms.map(() => [] as Observation[]);
  const showCounts = home.showCounts !== false && !!api;

  function openList(f: FormInfo) {
    if (!api) return toast(t('noApi'), 'bad');
    if (home.showRecords === false) return void openForm(f.formType);
    go({ screen: 'list', formType: f.formType });
  }

  const cards = forms.map((f, i) => (
    <button key={f.formType} type="button" className="card" style={accent(f)} data-form={f.formType} onClick={() => openList(f)}>
      <Icon name={f.icon} />
      <span className="text">
        <span className="name">{f.title || f.formType}</span>
        {f.description ? <span className="desc">{f.description}</span> : null}
      </span>
      {showCounts ? <span className="count">{lists[i].length + ' ' + t('saved')}</span> : null}
    </button>
  ));

  let body;
  if (design === 'dashboard') {
    const all: { o: Observation; f: FormInfo }[] = [];
    lists.forEach((l, i) => l.forEach(o => all.push({ o, f: forms[i] })));
    config.forms.forEach(f => { if (f.onHome === false) (cached(f.formType) || []).forEach(o => all.push({ o, f })); });
    all.sort((a, b) => time(b.o) - time(a.o));
    const today = startOfDay(Date.now());
    const week = new Date(today.getTime() - 6 * 864e5);
    const created = (o: Observation) => new Date(o.createdAt || o.updatedAt || 0);
    body = (
      <>
        {api ? (
          <section className="stats">
            <div className="stat"><b>{all.filter(x => created(x.o) >= today).length}</b><span>{t('today')}</span></div>
            <div className="stat"><b>{all.filter(x => created(x.o) >= week).length}</b><span>{t('week')}</span></div>
            <div className="stat"><b>{all.length}</b><span>{t('all')}</span></div>
          </section>
        ) : null}
        <h3 className="section">{t('start')}</h3>
        <nav className="cards grid compact">{cards}</nav>
        {api && all.length ? (
          <>
            <h3 className="section">{t('recent')}</h3>
            <div className="records">{all.slice(0, 6).map(x => <RecordRow key={x.f.formType + x.o.observationId} o={x.o} f={x.f} prefix={<b>{(x.f.title || x.f.formType) + ' · '}</b>} />)}</div>
          </>
        ) : null}
      </>
    );
  } else {
    body = <nav className={'cards ' + (design === 'list' ? 'list' : 'grid')}>{cards}</nav>;
  }

  return (
    <>
      <Header sub={config.app.description} />
      <div className="page">
        {home.welcome ? <p className="welcome">{home.welcome}</p> : null}
        {!api ? <Notice>{t('noApi')}</Notice> : null}
        {forms.length ? body : <Notice>{t('noForms')}</Notice>}
        {home.footer ? <footer>{home.footer}</footer> : null}
      </div>
    </>
  );
}
