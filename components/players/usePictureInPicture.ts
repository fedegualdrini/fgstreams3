import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Picture-in-picture state and toggle for a `<video>` element. */
export function usePictureInPicture(videoRef: RefObject<HTMLVideoElement>) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(!!document.pictureInPictureEnabled);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnter = () => setActive(true);
    const handleLeave = () => setActive(false);
    video.addEventListener('enterpictureinpicture', handleEnter);
    video.addEventListener('leavepictureinpicture', handleLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter);
      video.removeEventListener('leavepictureinpicture', handleLeave);
    };
  }, [videoRef]);

  const toggle = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setActive(false);
      } else {
        await video.requestPictureInPicture();
        setActive(true);
      }
    } catch {
      // PiP not available for this video
    }
  }, [videoRef]);

  return { active, supported, toggle };
}
