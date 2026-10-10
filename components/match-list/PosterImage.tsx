import Image from 'next/image';

interface PosterImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  /** Preload the image: set it on the posters visible without scrolling, since they decide LCP. */
  priority?: boolean;
}

/** Fills its (relatively positioned) parent; hides itself when the poster fails to load. */
export default function PosterImage({ src, alt, sizes, className, priority = false }: PosterImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}
