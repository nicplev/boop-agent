export function LumiMark({ size = 32 }: { size?: number }) {
  const dot = Math.max(4, Math.round(size * 0.16));
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#1A1A1A] shadow-sm"
      style={{ width: size, height: size }}
    >
      <span
        className="font-semibold leading-none text-white"
        style={{ fontSize: Math.round(size * 0.46), transform: "translateY(-1px)" }}
      >
        L
      </span>
      <span
        className="absolute rounded-full bg-[#EC4544]"
        style={{ width: dot, height: dot, left: 3, top: 3 }}
      />
      <span
        className="absolute rounded-full bg-[#F2B705]"
        style={{ width: dot, height: dot, right: 3, top: 3 }}
      />
      <span
        className="absolute rounded-full bg-[#51BA65]"
        style={{ width: dot, height: dot, left: 3, bottom: 3 }}
      />
      <span
        className="absolute rounded-full bg-[#56C8E6]"
        style={{ width: dot, height: dot, right: 3, bottom: 3 }}
      />
    </span>
  );
}
