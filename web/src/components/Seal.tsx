type Props = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** The pressed seal. The one brand motif. Doubles as the load/stamp animation. */
export default function Seal({ size = "md", className = "" }: Props) {
  const scale = size === "sm" ? "seal-sm" : size === "lg" ? "seal-lg" : "";
  return (
    <span className={`seal ${scale} ${className}`} data-seal aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  );
}
