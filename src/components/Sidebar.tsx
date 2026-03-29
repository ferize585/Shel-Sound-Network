import React, { useState, useRef, useEffect } from 'react';
import type { View, Track } from '../types';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  nowPlayingTrack?: Track;
  isPlaying: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, 
  onViewChange, 
  nowPlayingTrack, 
  isPlaying, 
  isOpen, 
  onClose
}) => {
  const { connected, account, connect, disconnect, wallets, network } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(connected);

  // Keep ref in sync for the setTimeout check
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    if (wallets && wallets.length > 0) {
      if (import.meta.env.DEV) console.log("Aptos Wallets Available:", wallets.map(w => w.name));
    }
  }, [wallets]);

  const petraWallet = wallets?.find(w => w.name === 'Petra');

  const handleConnect = async () => {
    if (petraWallet) {
      try {
        await new Promise(r => setTimeout(r, 100));
        connect(petraWallet.name);
        
        setTimeout(() => {
          if (!connectedRef.current) {
            alert("If wallet popup is not visible, please check a new tab or disable popup blocker.");
          }
        }, 1500);
      } catch (err: any) {
        if (import.meta.env.DEV) console.error("Petra Connect failed:", err);
      }
    }
  };

  const handleGoogleConnect = async () => {
    try {
      if (import.meta.env.DEV) {
        console.log("Google keyless connect triggered");
      }
      await new Promise(r => setTimeout(r, 100));
      await connect("Continue with Google" as any);

      setTimeout(() => {
        if (!connectedRef.current) {
          alert("If wallet popup is not visible, please check a new tab or disable popup blocker.");
        }
      }, 1500);
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Google Connect failed:", err?.message || err);
    }
  };

  const handleNavClick = (view: View) => {
    onViewChange(view);
    if (onClose) {
      onClose();
    }
  };

  const shortenedAddress = account 
    ? `${account.address.toString().slice(0, 6)}...${account.address.toString().slice(-4)}`
    : '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <button className="sidebar-close-btn" onClick={onClose}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <div className="logo" onClick={() => handleNavClick('library')}>
        <div className="logo-text"><span>Shelby Sound Network</span></div>
        <div className="logo-sub">Decentralized Audio Player</div>
      </div>

      <nav className="nav">
        <div className="nav-section-title">Menu</div>

        <div 
          className={`nav-item ${activeView === 'library' ? 'active' : ''}`} 
          onClick={() => handleNavClick('library')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
          </svg>
          Library
        </div>

        <div 
          className={`nav-item ${activeView === 'upload' ? 'active' : ''}`} 
          onClick={() => handleNavClick('upload')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          Upload
        </div>

        <div 
          className={`nav-item ${activeView === 'cloud-explorer' ? 'active' : ''}`} 
          onClick={() => handleNavClick('cloud-explorer')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <path d="M12 11v6M9 14h6" />
          </svg>
          Cloud Explorer
        </div>

        <div 
          className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} 
          onClick={() => handleNavClick('settings')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Settings
        </div>
      </nav>

      <div className="sidebar-wallet" ref={dropdownRef}>
        {!connected ? (
          <>
            <div className="wallet-branding">
              <div className="pulse-dot"></div>
              Built on Shelby Network
            </div>
            <button className="connect-wallet-btn" onClick={handleConnect}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Connect Wallet
            </button>

            <button 
              className="google-connect-btn" 
              onClick={handleGoogleConnect}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="wallet-help-hint" style={{ 
              fontSize: '10px', 
              color: 'rgba(122, 158, 192, 0.5)', 
              textAlign: 'center', 
              marginTop: '12px',
              fontStyle: 'italic'
            }}>
              Having trouble? Check popup or new tab
            </div>
          </>
        ) : (
          <div className="wallet-connected-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="wallet-address-btn" onClick={() => setShowDropdown(!showDropdown)}>
                <div className="status-dot"></div>
                {shortenedAddress}
              </button>
              <button
                title="Copy full address"
                onClick={() => {
                  if (account?.address) {
                    navigator.clipboard.writeText(account.address.toString());
                    setAddressCopied(true);
                    setTimeout(() => setAddressCopied(false), 2000);
                  }
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  color: addressCopied ? '#00c6ff' : 'rgba(255,255,255,0.45)',
                  transition: 'color 0.2s', flexShrink: 0
                }}
              >
                {addressCopied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </button>
            </div>
            
            {showDropdown && (
              <div className="wallet-dropdown">
                <div className="wallet-dropdown-header">
                  <div className="wallet-dropdown-label">CONNECTED ADDRESS</div>
                  <div className="wallet-dropdown-address">{account?.address.toString()}</div>
                </div>
                <div className="wallet-dropdown-info">
                  <div className="wallet-dropdown-row">
                    <span>Network</span>
                    <span className="network-tag">{network?.name || 'Unknown'}</span>
                  </div>
                  <div className="wallet-dropdown-row">
                    <span>Status</span>
                    <span className="status-tag">Online</span>
                  </div>
                </div>
                <button className="wallet-disconnect-btn" onClick={() => disconnect()}>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-now-playing">
        <div className="snp-label">▶ Now Playing</div>
        <div className={`snp-title ${isPlaying ? 'active' : ''}`}>
          {nowPlayingTrack ? nowPlayingTrack.title : 'No track selected'}
        </div>
        <div className="snp-artist">
          {nowPlayingTrack ? nowPlayingTrack.artist : '—'}
        </div>
        <div className={`eq-bars ${isPlaying ? '' : 'paused'}`}>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
