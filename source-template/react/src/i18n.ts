import { config } from './config';

const TEXT = {
  en: { newRecord: 'New', saved: 'saved', records: 'Records', none: 'Nothing saved yet.', back: 'Back', edit: 'Edit', submitted: 'Saved', updated: 'Updated', draft: 'Draft saved', error: 'Something went wrong', noApi: 'Open this app in Formulus or ODE Desktop to collect data.', noForms: 'This app has no forms yet.', drafts: 'draft', search: 'Search', all: 'All records', today: 'Today', week: 'This week', recent: 'Recent', start: 'Start', notFound: 'This record is no longer on this device.', yes: 'Yes', no: 'No', attached: 'attached' },
  pt: { newRecord: 'Novo', saved: 'guardados', records: 'Registos', none: 'Ainda nada guardado.', back: 'Voltar', edit: 'Editar', submitted: 'Guardado', updated: 'Atualizado', draft: 'Rascunho guardado', error: 'Algo correu mal', noApi: 'Abra esta aplicação no Formulus ou no ODE Desktop para recolher dados.', noForms: 'Esta aplicação ainda não tem formulários.', drafts: 'rascunho', search: 'Pesquisar', all: 'Todos os registos', today: 'Hoje', week: 'Esta semana', recent: 'Recentes', start: 'Começar', notFound: 'Este registo já não está neste dispositivo.', yes: 'Sim', no: 'Não', attached: 'anexado' },
  fr: { newRecord: 'Nouveau', saved: 'enregistrés', records: 'Enregistrements', none: 'Rien pour le moment.', back: 'Retour', edit: 'Modifier', submitted: 'Enregistré', updated: 'Mis à jour', draft: 'Brouillon enregistré', error: 'Une erreur est survenue', noApi: 'Ouvrez cette application dans Formulus ou ODE Desktop pour collecter des données.', noForms: "Cette application n'a pas encore de formulaires.", drafts: 'brouillon', search: 'Rechercher', all: 'Tous', today: "Aujourd'hui", week: 'Cette semaine', recent: 'Récents', start: 'Commencer', notFound: "Cet enregistrement n'est plus sur cet appareil.", yes: 'Oui', no: 'Non', attached: 'joint' },
  sw: { newRecord: 'Mpya', saved: 'zimehifadhiwa', records: 'Rekodi', none: 'Hakuna kilichohifadhiwa bado.', back: 'Rudi', edit: 'Hariri', submitted: 'Imehifadhiwa', updated: 'Imesasishwa', draft: 'Rasimu imehifadhiwa', error: 'Kuna tatizo', noApi: 'Fungua programu hii kwenye Formulus au ODE Desktop ili kukusanya data.', noForms: 'Programu hii bado haina fomu.', drafts: 'rasimu', search: 'Tafuta', all: 'Rekodi zote', today: 'Leo', week: 'Wiki hii', recent: 'Za karibuni', start: 'Anza', notFound: 'Rekodi hii haipo tena kwenye kifaa hiki.', yes: 'Ndiyo', no: 'Hapana', attached: 'imeambatishwa' },
};
export type TextKey = keyof typeof TEXT.en;

export const lang: keyof typeof TEXT = (() => {
  const l = config.app.defaultLocale || 'en';
  return (l in TEXT ? l : 'en') as keyof typeof TEXT;
})();
export function t(key: TextKey): string {
  return TEXT[lang][key] || TEXT.en[key];
}
export function when(d?: string): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}
