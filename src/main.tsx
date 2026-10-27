import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PitchBenchmark from './components/PitchBenchmark.tsx';
import SineReferenceBench from './components/SineReferenceBench.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const benchmarkMode = new URLSearchParams(window.location.search).get('benchmark');
if (benchmarkMode === 'sine') {
  root.render(<SineReferenceBench />);
} else if (benchmarkMode === '1') {
  root.render(<PitchBenchmark />);
} else {
  root.render(<App />);
}
