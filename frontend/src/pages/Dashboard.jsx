import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { user, permissions, logout } = useAuth();
  return (
    <div style={{ padding: 20 }}>
      <h2>Panel</h2>
      <p>Usuario: <b>{user?.usuario}</b> | Rol: <b>{user?.rol}</b></p>
      <button onClick={logout}>Salir</button>

      <hr />

      <nav style={{ display:'flex', gap: 16 }}>
        <Link to="/materias-primas">Materias Primas</Link>
        <Link to="/lotes">Lotes</Link>
      </nav>

      <p style={{marginTop: 16}}>Permisos: {permissions.join(', ')}</p>
    </div>
  );
}



