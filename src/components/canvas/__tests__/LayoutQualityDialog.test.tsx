import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LayoutQualityDialog from '../LayoutQualityDialog';
import type { LayoutQualityReport } from '../../../services/layout-validator';

vi.mock('../../../i18n/context', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// 默认关闭开发者工具（技术明细不展示）
vi.mock('../../../store', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) =>
    selector({ showDeveloperTools: false }),
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
    issues: [
      { field: 'coverage', severity: 'error', message: 'insufficient coverage (8.0%)' },
      { field: 'spacing', severity: 'error', message: 'elements too close or overlapping (1.2%)' },
    ],
    ...overrides,
  };
}

describe('LayoutQualityDialog', () => {
  it('renders failed metrics when report is given', () => {
    const report = makeFailedReport();
    render(<LayoutQualityDialog report={report} onAccept={() => {}} onRegenerate={() => {}} />);

    expect(screen.getByText('layoutQuality.title')).toBeTruthy();
    // 人话问题清单：展示 i18n key，而不是英文技术串
    expect(screen.getByText('layoutQuality.issue.coverage')).toBeTruthy();
    expect(screen.getByText('layoutQuality.issue.spacing')).toBeTruthy();
    // 开发者工具关闭时不展示技术指标
    expect(screen.queryByText('layoutQuality.metric.coverage')).toBeNull();
    expect(screen.queryByText('insufficient coverage (8.0%)')).toBeNull();
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
      issues: [],
    });
    render(<LayoutQualityDialog report={report} onAccept={() => {}} onRegenerate={() => {}} />);

    expect(screen.getByText('layoutQuality.passedTitle')).toBeTruthy();
    expect(screen.getByText('layoutQuality.pass')).toBeTruthy();
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
