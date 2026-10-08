interface SpinnerProps {
  size?: number;
  label?: string;
}

export default function Spinner({ size = 32, label = 'Loading…' }: SpinnerProps) {
  return (
    <div className="spinner">
      <div className="spinner__ring" style={{ width: size, height: size }} />
      {label && <span className="spinner__label">{label}</span>}
    </div>
  );
}
