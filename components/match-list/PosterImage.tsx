import Image from 'next/image';

interface PosterImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}

/** Fills its (relatively positioned) parent; hides itself when the poster fails to load. */
export default function PosterImage({ src, alt, sizes, className }: PosterImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}
