import React from 'react';
import { TuningLogEntry } from '../types/tuner';
import { summarizeRepeatability } from '../audio/repeatabilitySummary';
import { Download, Trash2, CheckCircle, AlertTriangle, FileJson } from 'lucide-react';

interface Props {
  logs: TuningLogEntry[];
  selectedScaleId: string;
  selectedNoteName: string;
  selectedInstrumentProfileId: string;
  selectedInstrumentProfileName: string;
  onClearLogs: () => void;
  onCapture: () => void;
  hasSignal: boolean;
  canCapture?: boolean;
}

export const BBMeresekView: React.FC<Props> = ({
  logs,
  selectedScaleId,
  selectedNoteName,
  selectedInstrumentProfileId,
  selectedInstrumentProfileName,
  onClearLogs,
  onCapture,
  hasSignal,
  canCapture = hasSignal,
}) => {
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'Date', 'Instrument_Profile_ID', 'Instrument_Profile_Name', 'Scale_Profile', 'Note', 'Audio_Sample_Rate_Hz', 'Input_Level_dBFS', 'Tolerance_Mode', 'Fundamental_Measured_Hz', 'Fundamental_Target_Hz', 'Fundamental_Cents', 'Third_Partial_Measured_Hz', 'Third_Partial_Target_Hz', 'Third_Partial_Cents', 'Octave_Measured_Hz', 'Octave_Target_Hz', 'Octave_Cents', 'In_Tune'];
    const rows = logs.map((l) => [
      l.timestamp,
      new Date(l.timestamp).toISOString(),
      l.instrumentProfileId ?? '',
      l.instrumentProfileName ?? '',
      l.scaleId ?? '',
      l.noteName,
      l.audioSampleRateHz?.toFixed(0) ?? '',
      l.inputLevelDbfs?.toFixed(1) ?? '',
      l.toleranceOverrideCents === undefined ? '' : l.toleranceOverrideCents === null ? 'Auto' : `±${l.toleranceOverrideCents.toFixed(1)} cent`,
      l.fundamentalHz.toFixed(3),
      l.fundamentalTargetHz?.toFixed(3) ?? '',
      l.fundamentalCents.toFixed(2),
      l.fifthHz.toFixed(3),
      l.fifthTargetHz?.toFixed(3) ?? '',
      l.fifthCents.toFixed(2),
      l.octaveHz.toFixed(3),
      l.octaveTargetHz?.toFixed(3) ?? '',
      l.octaveCents.toFixed(2),
      l.overallInTune ? 'TRUE' : 'FALSE',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(','))].join('\n');
    const encodedUri = URL.createObjectURL(new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BB_Tuner_Measurements_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(encodedUri), 1000);
  };

  const handleExportJSON = () => {
    if (logs.length === 0) return;
    const jsonBlob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json;charset=utf-8;' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const link = document.createElement('a');
    link.setAttribute('href', jsonUrl);
    link.setAttribute('download', `BB_Tuner_Measurements_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(jsonUrl), 1000);
  };

  const repeatability = summarizeRepeatability(logs, selectedScaleId, selectedNoteName, 10, selectedInstrumentProfileId);

  return (
    <div className="w-full flex flex-col p-3 animate-in fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Mérések és Napló</h3>
          <p className="text-xs text-slate-400">{logs.length} rögzített mérési pont</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onCapture}
            disabled={!canCapture}
            title={!canCapture ? 'Csak mindhárom érvényes mérési csatorna esetén rögzíthető' : 'Mérés rögzítése'}
            className="px-2.5 py-1 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Rögzítés
          </button>
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExportJSON}
            disabled={logs.length === 0}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40"
            title="Export JSON"
          >
            <FileJson className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="p-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 disabled:opacity-40"
            title="Törlés"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {repeatability && (
        <section className="mb-3 rounded-xl border border-white/10 bg-[#0b0f14] p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-xs font-bold text-white">Ismételhetőség · {selectedInstrumentProfileName} · {repeatability.noteName}</h4>
            <span className="text-[10px] text-slate-400">{repeatability.sampleCount} legutóbbi mérés</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500 mb-3">
            Az alábbi szórás az ismételt mérések egyezését mutatja. Nem hitelesített mérési bizonytalanság.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: 'Alaphang', metric: repeatability.fundamental },
              { label: '3. parciális', metric: repeatability.thirdPartial },
              { label: 'Oktáv', metric: repeatability.octave },
            ]).map(({ label, metric }) => (
              <div key={label} className="rounded-lg border border-white/5 bg-slate-900/70 p-2 text-center">
                <div className="text-[9px] text-slate-400 mb-1">{label}</div>
                <div className="font-mono text-xs text-white">{metric.medianCents > 0 ? '+' : ''}{metric.medianCents.toFixed(2)}¢</div>
                <div className="text-[9px] text-slate-400 mt-1">MAD {metric.madCents.toFixed(2)}¢</div>
                <div className="text-[9px] text-slate-500">Tartomány {metric.rangeCents.toFixed(2)}¢</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!canCapture && logs.length > 0 && <p className="text-[10px] text-slate-500 mb-2">Új mérés csak akkor rögzíthető, ha mindhárom csatorna érvényes.</p>}
      <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Nincs még mentett mérési adat.<br />
            Nyomd meg a <strong>+ Rögzítés</strong> gombot egy mérési pont mentéséhez!
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="p-3 rounded-xl bg-[#0b0f14] border border-white/5 text-xs">
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{log.noteName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                {log.overallInTune ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#10b981] bg-[#10b981]/15 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" /> Célértéken (dinamikus tolerancia)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#f59e0b] bg-[#f59e0b]/15 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> Eltérés
                  </span>
                )}
              </div>

              {(log.audioSampleRateHz !== undefined || log.inputLevelDbfs !== undefined || log.toleranceOverrideCents !== undefined || log.scaleId || log.instrumentProfileName || log.instrumentProfileId) && (
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500 font-mono">
                  {(log.instrumentProfileName || log.instrumentProfileId) && <span>Hangszer: {log.instrumentProfileName ?? log.instrumentProfileId}</span>}
                  {log.scaleId && <span>Hangolás: {log.scaleId}</span>}
                  {log.audioSampleRateHz !== undefined && <span>Fs: {log.audioSampleRateHz.toFixed(0)} Hz</span>}
                  {log.inputLevelDbfs !== undefined && <span>Bemenet: {log.inputLevelDbfs.toFixed(1)} dBFS</span>}
                  {log.toleranceOverrideCents !== undefined && <span>Tűrés: {log.toleranceOverrideCents === null ? 'Auto' : `±${log.toleranceOverrideCents.toFixed(1)} cent`}</span>}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] text-center">
                <div className="p-1.5 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[9px] text-[#f59e0b] font-sans font-semibold">Alap</div>
                  <div>{log.fundamentalHz.toFixed(2)} Hz</div>
                  <div className="text-[9px] text-slate-500">Cél: {log.fundamentalTargetHz !== undefined ? log.fundamentalTargetHz.toFixed(2) : '—'} Hz</div>
                  <div className={Math.abs(log.fundamentalCents) <= 3 ? 'text-[#10b981] font-bold' : 'text-[#f59e0b]'}>
                    {log.fundamentalCents > 0 ? '+' : ''}{log.fundamentalCents.toFixed(1)}¢
                  </div>
                </div>

                <div className="p-1.5 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[9px] text-[#c084fc] font-sans font-semibold">3. parciális</div>
                  <div>{log.fifthHz.toFixed(2)} Hz</div>
                  <div className="text-[9px] text-slate-500">Cél: {log.fifthTargetHz !== undefined ? log.fifthTargetHz.toFixed(2) : '—'} Hz</div>
                  <div className={Math.abs(log.fifthCents) <= 3 ? 'text-[#10b981] font-bold' : 'text-[#c084fc]'}>
                    {log.fifthCents > 0 ? '+' : ''}{log.fifthCents.toFixed(1)}¢
                  </div>
                </div>

                <div className="p-1.5 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[9px] text-[#38bdf8] font-sans font-semibold">Oktáv</div>
                  <div>{log.octaveHz.toFixed(2)} Hz</div>
                  <div className="text-[9px] text-slate-500">Cél: {log.octaveTargetHz !== undefined ? log.octaveTargetHz.toFixed(2) : '—'} Hz</div>
                  <div className={Math.abs(log.octaveCents) <= 3 ? 'text-[#10b981] font-bold' : 'text-[#38bdf8]'}>
                    {log.octaveCents > 0 ? '+' : ''}{log.octaveCents.toFixed(1)}¢
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
