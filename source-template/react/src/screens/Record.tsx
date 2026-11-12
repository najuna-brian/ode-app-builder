import { childrenOf, formConfig } from '../config';
import { display, fieldOf, openForm, titleOf, useRecords } from '../data';
import { t, when } from '../i18n';
import { go } from '../router';
import { Bar, Glyph, Icon, Notice, RecordRow, accent } from '../ui';

export function Record({ formType, id }: { formType: string; id: string }) {
  const f = formConfig(formType);
  const kids = childrenOf(f);
  const parentForm = f.parent ? formConfig(f.parent.formType) : null;
  const lists = useRecords([formType, ...kids.map(c => c.formType), ...(parentForm ? [parentForm.formType] : [])]);
  if (!lists) return <Bar title={f.title || f.formType} form={f} />;
  const o = lists[0].find(x => x.observationId === id);
  if (!o) {
    return (
      <>
        <Bar title={f.title || f.formType} form={f} />
        <div className="page"><Notice>{t('notFound')}</Notice></div>
      </>
    );
  }
  const data = o.data || {};
  const parentRec = parentForm && f.parent ? lists[lists.length - 1].find(x => x.observationId === data[f.parent!.field]) : undefined;
  const names = (f.fields || []).map(x => x.name);
  Object.keys(data).forEach(k => { if (!names.includes(k)) names.push(k); });

  return (
    <>
      <Bar title={titleOf(o, f)} form={f} />
      <div className="page detail">
        <div className="detail-main">
          <div className="formhead" style={accent(f)}>
            <Icon name={f.icon} />
            <div>
              <b>{f.title || f.formType}</b>
              <small>{when(o.updatedAt || o.createdAt) + (o.isDraft ? ' · ' + t('drafts') : '')}</small>
            </div>
          </div>
          {parentRec && parentForm ? (
            <button type="button" className="record parent" onClick={() => go({ screen: 'record', formType: parentForm.formType, id: parentRec.observationId })}>
              <Icon name={parentForm.icon} />
              <span className="rtext">
                <span className="rmeta">{parentForm.title}</span>
                <span className="rtitle">{titleOf(parentRec, parentForm)}</span>
              </span>
              <Glyph name="next" />
            </button>
          ) : null}
          <button type="button" className="primary" data-action="edit" style={accent(f)} onClick={() => openForm(f.formType, o.data, o.observationId)}>
            <Glyph name="edit" />
            {t('edit')}
          </button>
          <dl className="answers">
            {names.map(n => {
              if (f.parent && n === f.parent.field) return null;
              const v = display(f, n, data[n]);
              if (v === null) return null;
              const fd = fieldOf(f, n);
              return (
                <div className="kv" key={n}>
                  <dt>{fd && fd.label ? fd.label : n}</dt>
                  <dd>{v}</dd>
                </div>
              );
            })}
          </dl>
        </div>
        {kids.length ? (
          <div className="detail-side">
            {kids.map((c, i) => {
              const field = c.parent!.field;
              const mine = lists[i + 1].filter(x => (x.data || {})[field] === o.observationId);
              const prefill = { [field]: o.observationId };
              return (
                <section key={c.formType} className="linked" style={accent(c)} data-child={c.formType}>
                  <div className="linked-head">
                    <Icon name={c.icon} />
                    <h3>{(c.title || c.formType) + ' (' + mine.length + ')'}</h3>
                    <button type="button" className="small-btn" data-action="new-child" onClick={() => openForm(c.formType, prefill, null, prefill)}>
                      <Glyph name="plus" />
                      {t('newRecord')}
                    </button>
                  </div>
                  {mine.length ? <div className="records">{mine.map(x => <RecordRow key={x.observationId} o={x} f={c} />)}</div> : <p className="hint">{t('none')}</p>}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}
