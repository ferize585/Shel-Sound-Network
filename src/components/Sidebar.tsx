import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { View, Track } from '../types';
import { useWallet, type WalletName } from '@aptos-labs/wallet-adapter-react';
import gsap from 'gsap';

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
  const { connected, account, connect, disconnect, wallets } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<'petra' | 'google' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastConnectRef = useRef<number>(0);

  const handleConnect = async () => {
    if (Date.now() - lastConnectRef.current < 3000) return;
    lastConnectRef.current = Date.now();

    try {
      setConnectingWallet('petra');
      try {
        // [Official Adapter API - No Bypass!]: Setia kepada dokumen Aptos V3
        // Modul bypass ditiadakan agar Auto-Discovery secara alamiah menskalakan pop-up ekstensi Chrome dari browser Mises.
        await connect("Petra" as WalletName<"Petra">);
      } catch (err: any) {
        if (import.meta.env.DEV) console.error("Petra Connect failed:", err?.message || err);
      } finally {
        setConnectingWallet(null);
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Petra init failed:", err);
    }
  };

  const handleGoogleConnect = async () => {
    if (Date.now() - lastConnectRef.current < 3000) return;
    lastConnectRef.current = Date.now();

    try {
      const googleWallet = wallets?.find(w => 
        w.name.toLowerCase().includes("petra web") || 
        w.name.toLowerCase().includes("aptos connect") ||
        w.name.toLowerCase().includes("google")
      );

      if (!googleWallet) {
        alert("Google wallet option not found. Please try again or use Petra extension.");
        return;
      }

      setConnectingWallet('google');
      try {
        // Pemanggilan langsung (Synchronous Interaction) ke provider.
        await connect(googleWallet.name as any);
      } catch (err: any) {
        if (import.meta.env.DEV) console.error("Google Connect failed:", err?.message || err);
      } finally {
        setConnectingWallet(null);
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Google init failed:", err);
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

  const sidebarRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      
      // Only animate on mobile
      mm.add("(max-width: 1023px)", () => {
        if (isOpen) {
          gsap.to(sidebarRef.current, { 
            x: 0, 
            duration: 0.4, 
            ease: "power2.out",
            display: "flex" 
          });
        } else {
          gsap.to(sidebarRef.current, { 
            x: "-100%", 
            duration: 0.3, 
            ease: "power2.in",
            onComplete: () => {
              if (sidebarRef.current) sidebarRef.current.style.display = "none";
            }
          });
        }
      });

      // Reset styles on desktop
      mm.add("(min-width: 1024px)", () => {
        gsap.set(sidebarRef.current, { 
          x: 0, 
          display: "flex", 
          clearProps: "all" 
        });
      });
    }, sidebarRef);

    return () => ctx.revert();
  }, [isOpen]);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} ref={sidebarRef}>
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
            <button 
              className={`connect-wallet-btn ${connectingWallet === 'petra' ? 'connecting' : ''}`} 
              onClick={handleConnect}
              disabled={!!connectingWallet}
            >
              {connectingWallet === 'petra' ? (
                <>
                  <div className="btn-spinner"></div>
                  Connecting...
                </>
              ) : (
                'Connect Wallet'
              )}
            </button>

            <button 
              className={`google-connect-btn ${connectingWallet === 'google' ? 'connecting' : ''}`} 
              onClick={handleGoogleConnect}
              disabled={!!connectingWallet}
            >
              {connectingWallet === 'google' ? (
                <>
                  <div className="btn-spinner"></div>
                  Connecting...
                </>
              ) : (
                'Continue with Google'
              )}
            </button>
          </>
        ) : (
          <div className="wallet-connected-container">
            <button className="wallet-address-btn" onClick={() => setShowDropdown(!showDropdown)}>
              <div className="status-dot"></div>
              {shortenedAddress}
            </button>
            
            {showDropdown && (
              <div className="wallet-dropdown">
                <div className="wallet-dropdown-header">
                  <div className="wallet-dropdown-label">CONNECTED ADDRESS</div>
                  <div className="wallet-dropdown-address">{account?.address.toString()}</div>
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
