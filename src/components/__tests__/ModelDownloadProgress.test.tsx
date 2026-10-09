import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ModelDownloadProgress } from '../ModelDownloadProgress';

describe('ModelDownloadProgress', () => {
  it('renders progress percentage and formatted byte counts', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelDownloadProgress
          progress={45}
          downloadedBytes={471859200} // ~450 MB
          totalBytes={1048576000} // ~1000 MB
        />,
      );
    });

    const root = renderer!.root;
    const percentageText = root.findByProps({ testID: 'download-percentage' });
    expect(percentageText.props.children).toEqual([45, '%']);

    const bytesText = root.findByProps({ testID: 'download-bytes-text' });
    expect(bytesText.props.children).toContain('450.0 MB');
    expect(bytesText.props.children).toContain('1000.0 MB');
  });

  it('triggers onPause when pause button is clicked', () => {
    const handlePause = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelDownloadProgress
          progress={50}
          isPaused={false}
          onPause={handlePause}
        />,
      );
    });

    const pauseBtn = renderer!.root.findByProps({ testID: 'download-pause-btn' });
    act(() => {
      pauseBtn.props.onPress();
    });

    expect(handlePause).toHaveBeenCalledTimes(1);
  });

  it('triggers onResume when in paused state and resume is clicked', () => {
    const handleResume = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelDownloadProgress
          progress={50}
          isPaused={true}
          onResume={handleResume}
        />,
      );
    });

    const resumeBtn = renderer!.root.findByProps({ testID: 'download-resume-btn' });
    act(() => {
      resumeBtn.props.onPress();
    });

    expect(handleResume).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel button is clicked', () => {
    const handleCancel = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelDownloadProgress
          progress={25}
          onCancel={handleCancel}
        />,
      );
    });

    const cancelBtn = renderer!.root.findByProps({ testID: 'download-cancel-btn' });
    act(() => {
      cancelBtn.props.onPress();
    });

    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
