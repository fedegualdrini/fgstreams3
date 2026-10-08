interface ChannelLogoProps {
  src: string;
  className: string;
}

/** Channel logo; hides itself if the remote image fails to load. */
export default function ChannelLogo({ src, className }: ChannelLogoProps) {
  return (
    // Logos come from arbitrary third-party hosts, so next/image's remotePatterns allow-list cannot cover them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
