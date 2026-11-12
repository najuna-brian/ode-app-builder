// The settings the ODE App Builder writes to app/config.js (window.ODE_APP_CONFIG).
export interface FieldInfo { name: string; label?: string; type?: string; choices?: Record<string, string> }
export interface FormInfo {
  formType: string;
  title?: string;
  description?: string;
  icon?: string;
  color?: string;
  onHome?: boolean;
  fields?: FieldInfo[];
  summaryFields?: string[];
  parent?: { formType: string; field: string } | null;
}
export interface AppConfig {
  app: { name?: string; description?: string; logo?: string | null; defaultLocale?: string };
  home?: { welcome?: string; footer?: string; design?: 'grid' | 'list' | 'dashboard'; layout?: string; showCounts?: boolean; showRecords?: boolean };
  theme?: { light?: Record<string, string>; dark?: Record<string, string> };
  forms: FormInfo[];
}

declare global {
  interface Window {
    ODE_APP_CONFIG?: AppConfig;
    ODE_ICONS?: Record<string, string>;
    getFormulus?: () => Promise<FormulusApi>;
  }
}

export interface Observation {
  observationId: string;
  formType?: string;
  data?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  isDraft?: boolean;
  deleted?: boolean;
}
export interface FormResult { status?: string; message?: string; observationId?: string }
/** The part of the Formulus API this app uses. Full reference: FormulusInterfaceDefinition.ts in the ODE repo. */
export interface FormulusApi {
  getVersion(): Promise<string>;
  getObservations(formType: string): Promise<Observation[]>;
  openFormplayer(formType: string, params: Record<string, unknown>, savedData: Record<string, unknown>, options?: { observationId?: string }): Promise<FormResult>;
}

export const config: AppConfig = window.ODE_APP_CONFIG || { app: { name: 'ODE app' }, forms: [] };

export function formConfig(formType: string): FormInfo {
  return config.forms.find(f => f.formType === formType) || { formType, title: formType, fields: [] };
}
export function childrenOf(f: FormInfo): FormInfo[] {
  return config.forms.filter(c => c.parent && c.parent.formType === f.formType);
}
export function homeForms(): FormInfo[] {
  return config.forms.filter(f => f.onHome !== false);
}
