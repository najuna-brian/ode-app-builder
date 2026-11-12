import { useEffect, useState } from 'react';
import { getApi, setToastHandler, type Toast } from './data';
import { useRoute } from './router';
import { Home } from './screens/Home';
import { List } from './screens/List';
import { Record } from './screens/Record';

export function App() {
  const route = useRoute();
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    setToastHandler(t => {
      setToast(t);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 2600);
    });
  }, []);
  const api = getApi();
  let screen;
  if (route.screen === 'list' && api) screen = <List formType={route.formType} />;
  else if (route.screen === 'record' && api) screen = <Record key={route.formType + route.id} formType={route.formType} id={route.id} />;
  else screen = <Home />;
  return (
    <>
      <main id="app" aria-live="polite">{screen}</main>
      <div id="toast" role="status" className={toast ? toast.kind : ''} hidden={!toast}>{toast ? toast.text : ''}</div>
    </>
  );
}
