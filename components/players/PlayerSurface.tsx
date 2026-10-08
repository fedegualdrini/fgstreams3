import type { RefObject } from 'react';
import { usePictureInPicture } from './usePictureInPicture';

interface PlayerSurfaceProps {
  videoRef: RefObject<HTMLVideoElement>;
}

/** The `<video>` element and its picture-in-picture button, shared by every engine-backed player. */
export default function PlayerSurface({ videoRef }: PlayerSurfaceProps) {
  const pip = usePictureInPicture(videoRef);
  const pipLabel = pip.active ? 'Exit Picture-in-Picture' : 'Picture-in-Picture';

  return (
    <div className="player-frame">
      <video ref={videoRef} className="player-frame__video" autoPlay playsInline controls />
      {pip.supported && (
        <button
          type="button"
          className="pip-button"
          onClick={pip.toggle}
          title={pipLabel}
          aria-label={pipLabel}
        >
          {pip.active ? '⊡ Exit PiP' : '⧉ PiP'}
        </button>
      )}
    </div>
  );
}
