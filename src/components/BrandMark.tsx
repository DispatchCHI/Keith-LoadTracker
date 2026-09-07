import logo from "../assets/mbi-logo.png";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
};

export function BrandMark({ size = "md" }: BrandMarkProps) {
  return (
    <div className={`brand-plate brand-plate-${size}`}>
      <img src={logo} alt="Mr. Bult's, Inc." />
    </div>
  );
}

export function BrandFooter() {
  return (
    <div className="brand-footer">
      <p>Mr. Bult&apos;s, Inc.</p>
      <p>Created by Keith Lawson</p>
    </div>
  );
}
