import { useState } from 'react'
import { Icon } from './Icon'

export function Header({ onJoin, onAdmin, user, onSignIn, onSignOut, onAccount }) {
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
          {user ? <button className="login-button member-login-button" type="button" onClick={onAccount} title={user.email}>{user.name || 'My account'}</button> : <button className="login-button member-login-button" type="button" onClick={onSignIn}>Sign in with Google</button>}
          <button className="login-button organizer-button" type="button" onClick={onAdmin}>Organizer</button>
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
