import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LayoutQualityDialog from '../LayoutQualityDialog';
import type { LayoutQualityReport } from '../../../services/layout-validator';

vi.mock('../../../i18n/context', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function makeFailedReport(overrides?: Partial<LayoutQualityReport>): LayoutQualityReport {
  return {
    overallPass: false,
    metrics: [
      {
        field: 'coverage',
        passed: false,
        actual: 8,
        threshold: '15-60%',
        message: 'insufficient coverage (8.0%)',
      },
      {
        field: 'spacing',
        passed: false,
        actual: 1.2,
        threshold: '>= 3%',
        message: 'elements too close or overlapping (1.2%)',
      },
    ],
    summaryText: '[Layout Feedback]\n- coverage: 8% ...',
    userSummary: '布局需要调整',
    ...overrides,
  };
}

describe('LayoutQualityDialog', () => {
  it('renders failed metrics when report is given', () => {
    const report = makeFailedReport();
    render(<LayoutQualityDialog report={report} onAccept={() => {}} onRegenerate={() => {}} />);

    expect(screen.getByText('layoutQuality.title')).toBeTruthy();
    expect(screen.getByText('layoutQuality.metric.coverage')).toBeTruthy();
    expect(screen.getByText('insufficient coverage (8.0%)')).toBeTruthy();
    expect(screen.getByText('layoutQuality.metric.spacing')).toBeTruthy();
    expect(screen.getByText('elements too close or overlapping (1.2%)')).toBeTruthy();
  });

  it('renders nothing when report is null', () => {
    const { container } = render(
      <LayoutQualityDialog report={null} onAccept={() => {}} onRegenerate={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders passed summary when report.overallPass is true', () => {
    const report = makeFailedReport({
      overallPass: true,
      metrics: [
        {
          field: 'coverage',
          passed: true,
          actual: 32,
          threshold: '15-60%',
          message: 'coverage looks balanced (32.0%)',
        },
      ],
      userSummary: '布局检测通过',
    });
    render(<LayoutQualityDialog report={report} onAccept={() => {}} onRegenerate={() => {}} />);

    expect(screen.getByText('layoutQuality.passedTitle')).toBeTruthy();
    expect(screen.getByText('coverage looks balanced (32.0%)')).toBeTruthy();
    expect(screen.queryByText('layoutQuality.regenerate')).toBeNull();
  });

  it('onAccept is called when Accept button clicked', () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    const report = makeFailedReport();

    render(<LayoutQualityDialog report={report} onAccept={onAccept} onRegenerate={onRegenerate} />);

    screen.getByText('layoutQuality.accept').click();
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('onRegenerate is called when Regenerate button clicked', () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    const report = makeFailedReport();

    render(<LayoutQualityDialog report={report} onAccept={onAccept} onRegenerate={onRegenerate} />);

    screen.getByText('layoutQuality.regenerate').click();
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
