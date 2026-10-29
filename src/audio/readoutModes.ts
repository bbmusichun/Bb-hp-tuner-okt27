import { freqToNoteAndCents } from './scales';

export type TuningReadoutMode = 'hz' | 'cents' | 'note' | 'ratio';

export function normalizeTuningReadoutMode(value: unknown): TuningReadoutMode {
  return value === 'hz' || value === 'cents' || value === 'note' || value === 'ratio'
    ? value
    : 'hz';
}

export interface MeasurementReadoutInput {
  mode: TuningReadoutMode;
  measuredHz: number | null;
  targetHz: number | null;
  deviationCents: number | null;
  status: 'valid' | 'uncertain' | 'held' | 'no-signal';
  baseMeasuredHz: number | null;
  baseTargetHz: number | null;
  a4Ref: number;
}

export interface MeasurementReadout {
  primary: string;
  target: string;
  valid: boolean;
}

function positiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function formatCents(value: number | null): string {
  return value !== null && Number.isFinite(value)
    ? (value > 0 ? '+' : '') + value.toFixed(1) + ' cent'
    : '— cent';
}

/** Convert a tracked measurement into a user-selected, consistently validated readout. */
export function formatMeasurementReadout(input: MeasurementReadoutInput): MeasurementReadout {
  const valid = (input.status === 'valid' || input.status === 'held') && positiveFinite(input.measuredHz);
  const measuredHz = valid ? input.measuredHz : null;
  const targetHz = positiveFinite(input.targetHz) ? input.targetHz : null;
  const baseMeasuredHz = positiveFinite(input.baseMeasuredHz) ? input.baseMeasuredHz : null;
  const baseTargetHz = positiveFinite(input.baseTargetHz) ? input.baseTargetHz : null;

  switch (input.mode) {
    case 'cents':
      return {
        primary: valid ? formatCents(input.deviationCents) : '— cent',
        target: targetHz === null ? 'Cél: — Hz' : 'Cél: ' + targetHz.toFixed(2) + ' Hz',
        valid,
      };
    case 'note': {
      const targetNote = targetHz !== null ? freqToNoteAndCents(targetHz, input.a4Ref).note : '—';
      return {
        primary: measuredHz !== null ? freqToNoteAndCents(measuredHz, input.a4Ref).note : '—',
        target: targetHz === null ? 'Cél: —' : 'Cél: ' + targetNote + ' · ' + targetHz.toFixed(2) + ' Hz',
        valid,
      };
    }
    case 'ratio': {
      const measuredRatio = measuredHz !== null && baseMeasuredHz !== null ? measuredHz / baseMeasuredHz : null;
      const targetRatio = targetHz !== null && baseTargetHz !== null ? targetHz / baseTargetHz : null;
      return {
        primary: measuredRatio !== null && Number.isFinite(measuredRatio) ? measuredRatio.toFixed(4) + ':1' : '—:1',
        target: targetRatio !== null && Number.isFinite(targetRatio) ? 'Cél: ' + targetRatio.toFixed(4) + ':1' : 'Cél: —:1',
        valid: valid && measuredRatio !== null && Number.isFinite(measuredRatio),
      };
    }
    case 'hz':
    default:
      return {
        primary: measuredHz !== null ? measuredHz.toFixed(2) + ' Hz' : '— Hz',
        target: targetHz === null ? 'Cél: — Hz' : 'Cél: ' + targetHz.toFixed(2) + ' Hz',
        valid,
      };
  }
}
