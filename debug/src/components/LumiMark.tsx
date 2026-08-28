import lumiRedFaceUrl from "../../../assets/lumi-red-face.png";

export function LumiMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#EF4246] shadow-sm"
      style={{ width: size, height: size }}
    >
      <img
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
        src={lumiRedFaceUrl}
      />
    </span>
  );
}
