import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles/theme.css';

// Punto de entrada de la aplicación.
// Crea el root de React 18 y monta el árbol principal de componentes sobre #root.
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode activa validaciones adicionales en desarrollo para detectar efectos colaterales.
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
