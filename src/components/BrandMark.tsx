import logo from "../assets/klt-logo.png";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
};

export function BrandMark({ size = "md" }: BrandMarkProps) {
  return (
    <div className={`brand-plate brand-plate-${size}`}>
      <img src={logo} alt="The Load Tracker" />
    </div>
  );
}

export function BrandFooter() {
  return null;
}
