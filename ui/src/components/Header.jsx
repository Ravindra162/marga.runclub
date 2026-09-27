import { useState } from 'react'
import { Icon } from './Icon'

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.7 2.91-4.2 2.91-7.21Z"/><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.44c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.52A9.74 9.74 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.51 13.58A5.86 5.86 0 0 1 6.2 12c0-.55.11-1.09.31-1.58V7.9H3.27A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.06 1.02 4.1l3.24-2.52Z"/><path fill="#EA4335" d="M12 6.38c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.47 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.73 5.4l3.24 2.52C7.29 8.1 9.45 6.38 12 6.38Z"/></svg>
}

export function Header({ onJoin, user, onSignIn, onSignOut, onAccount }) {
  const [open, setOpen] = useState(false)
  const closeMenu = () => setOpen(false)

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand-lockup" href="#top" onClick={closeMenu} aria-label="Marga Run Club home">
          <span className="brand-mark"><Icon name="directions_run" size={24} /></span>
          <span className="brand-copy">
            <strong>MARGA RUN CLUB</strong>
            <small>URBAN RUN &amp; SPORTS COLLECTIVE</small>
          </span>
        </a>
        <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
          <a className="active" href="#events" onClick={closeMenu}>Events</a>
          <a href="#community" onClick={closeMenu}>Community</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#schedule" onClick={closeMenu}>Weekly Schedule</a>
        </nav>
        <div className="header-actions">
          {user ? <button className="login-button member-login-button" type="button" onClick={onAccount} title={user.email}>{user.name || 'My account'}</button> : <button className="login-button member-login-button" type="button" onClick={onSignIn}><GoogleMark /> Sign in with Google</button>}
          <button className="button button-primary header-join" type="button" onClick={() => onJoin('all')}>
            Join an Event <Icon name="arrow_forward" size={18} />
          </button>
          {user && <button className="menu-button desktop-signout" type="button" onClick={onSignOut} aria-label="Sign out"><Icon name="logout" size={20} /></button>}
          <button className="menu-button" type="button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name={open ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </div>
    </header>
  )
}
