import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Buffer } from 'buffer';

const g = window as any;
g.Buffer = g.Buffer || Buffer;
g.global = g.global || window;
g.process = g.process || { env: {} };
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
