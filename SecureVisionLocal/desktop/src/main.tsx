import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

// Sem StrictMode: o duplo-mount do dev derruba/recria os WebSockets de vídeo
// (cada remontagem aloca uma nova porta e o cleanup fecha o servidor WS anterior).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
