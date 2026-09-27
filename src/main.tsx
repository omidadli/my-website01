import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user" → every motion.* animation in the app (19 modules)
        automatically drops transform choreography when the OS reports
        prefers-reduced-motion: reduce (opacity fades are kept). */}
    <MotionConfig reducedMotion="user">
      <ErrorBoundary name="app">
        <App />
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
