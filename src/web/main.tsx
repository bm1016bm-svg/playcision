import '@fontsource-variable/geist';
import '@fontsource-variable/noto-sans-tc';
import '@fontsource-variable/inter';
import { MotionConfig } from 'motion/react';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Playcision UI root element is missing.');

createRoot(root).render(<StrictMode><ErrorBoundary><MotionConfig reducedMotion="user"><App /></MotionConfig></ErrorBoundary></StrictMode>);
