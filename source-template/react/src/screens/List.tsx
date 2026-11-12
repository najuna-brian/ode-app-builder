import { useState } from 'react';
import { formConfig } from '../config';
import { openForm, titleOf, useRecords } from '../data';
import { t } from '../i18n';
import { Bar, Glyph, Notice, RecordRow, accent } from '../ui';

export function List({ formType }: { formType: string }) {
  const f = formConfig(formType);
  const lists = useRecords([formType]);
  const [q, setQ] = useState('');
  const list = lists ? lists[0] : [];
  const needle = q.trim().toLowerCase();
  const shown = list.filter(o => !needle || JSON.stringify(o.data || {}).toLowerCase().includes(needle) || titleOf(o, f).toLowerCase().includes(needle));
  return (
    <>
      <Bar title={f.title || f.formType} form={f} />
      <div className="page">
        {f.description ? <p className="welcome">{f.description}</p> : null}
        <button type="button" className="primary" data-action="new" style={accent(f)} onClick={() => openForm(f.formType)}>
          <Glyph name="plus" />
          {t('newRecord') + ': ' + (f.title || f.formType)}
        </button>
        {list.length > 6 ? (
          <label className="search">
            <Glyph name="search" />
            <input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={e => setQ(e.target.value)} />
          </label>
        ) : null}
        <h3 className="section">{t('records') + ' (' + list.length + ')'}</h3>
        <div className="records">
          {lists === null ? null : shown.length ? shown.map(o => <RecordRow key={o.observationId} o={o} f={f} />) : <Notice>{t('none')}</Notice>}
        </div>
      </div>
    </>
  );
}
