interface ChannelLogoProps {
  src: string;
  className: string;
  /** Rendered edge length in CSS pixels; must match the size the class gives the image. */
  size?: number;
}

/**
 * Channel logo; hides itself if the remote image fails to load.
 *
 * Lazy and async so the hundreds of tiles on the channels page only fetch what
 * scrolls into view, and sized so a late-arriving logo never shifts the grid.
 */
export default function ChannelLogo({ src, className, size = 36 }: ChannelLogoProps) {
  return (
    // Logos that were not localized by `npm run optimize:logos` still come from arbitrary third-party hosts,
    // so next/image's remotePatterns allow-list cannot cover them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
