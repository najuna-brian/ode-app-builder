import type { CSSProperties, ReactNode } from 'react';
import { config, type FormInfo, type Observation } from './config';
import { go, back } from './router';
import { t, when } from './i18n';
import { titleOf } from './data';

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';

/** A form icon: a Lucide line icon by name (from icons.js), or the text itself. */
export function Icon({ name }: { name?: string }) {
  const icons = window.ODE_ICONS || {};
  const key = name && icons[name] ? name : !name && icons['clipboard-list'] ? 'clipboard-list' : null;
  if (key) return <span className="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SVG_OPEN + icons[key] + '</svg>' }} />;
  return <span className="icon" aria-hidden="true">{name || ''}</span>;
}

const GLYPH = {
  back: <path d="m15 18-6-6 6-6" />,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  next: <path d="m9 18 6-6-6-6" />,
  edit: <><path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
};
export function Glyph({ name }: { name: keyof typeof GLYPH }) {
  return (
    <span className="glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{GLYPH[name]}</svg>
    </span>
  );
}

/** Per-form accent colour, as the CSS variable the stylesheet uses. */
export const accent = (f?: FormInfo): CSSProperties | undefined => (f && f.color ? ({ '--accent': f.color } as CSSProperties) : undefined);

export function Header({ sub }: { sub?: string }) {
  const a = config.app;
  return (
    <header className="top">
      {a.logo ? <img className="logo" src={a.logo} alt="" /> : null}
      <div className="titles">
        <h1>{a.name || 'ODE app'}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
    </header>
  );
}

export function Bar({ title, form }: { title: string; form?: FormInfo }) {
  return (
    <header className="bar" style={accent(form)}>
      <button type="button" className="back" aria-label={t('back')} onClick={back}>
        <Glyph name="back" />
        <span>{t('back')}</span>
      </button>
      <h2>{title}</h2>
    </header>
  );
}

export function RecordRow({ o, f, prefix }: { o: Observation; f: FormInfo; prefix?: ReactNode }) {
  return (
    <button type="button" className="record" data-id={o.observationId} onClick={() => go({ screen: 'record', formType: f.formType, id: o.observationId })}>
      <span className="rtext">
        <span className="rtitle">{titleOf(o, f)}</span>
        <span className="rmeta">{prefix}{when(o.updatedAt || o.createdAt) + (o.isDraft ? ' · ' + t('drafts') : '')}</span>
      </span>
      <Glyph name="next" />
    </button>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="notice">{children}</p>;
}
