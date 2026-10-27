import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PitchBenchmark from './components/PitchBenchmark.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
if (new URLSearchParams(window.location.search).get('benchmark') === '1') {
  root.render(<PitchBenchmark />);
} else {
  root.render(<App />);
}
