import React, { useState } from 'react';
import { Download, Share2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/40 px-2.5 py-1 text-xs font-semibold hover:bg-sky-500/30 transition shadow-sm"
      >
        <Download className="w-3.5 h-3.5" />
        Telepítés (PWA)
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/40 px-2.5 py-1 text-xs font-semibold hover:bg-sky-500/30 transition shadow-sm"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Telepítés (iOS)
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-sky-400" />
                  Telepítés iPhone / iPad-re
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 text-xs text-slate-300 space-y-2.5 leading-relaxed">
                <p>
                  1. Koppints a Safari alsó sávjában a <strong>Megosztás (Share)</strong> ikonra (<Share2 className="w-3.5 h-3.5 inline text-sky-400" />).
                </p>
                <p>
                  2. Görgess lejjebb és válaszd a <strong>Főképernyőhöz adás (Add to Home Screen)</strong> menüpontot.
                </p>
                <p className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  Ezután az app natív alkalmazásként offline is azonnal megnyitható!
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-slate-800 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Rendben, értem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
