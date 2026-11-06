/** Atoms 圆形徽标（装饰性 SVG，非 emoji） */
export function AtomsMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="atoms-mark"
    >
      <circle cx="16" cy="16" r="15" fill="#EEF1F8" stroke="#C5CEE0" strokeWidth="1" />
      <circle cx="16" cy="16" r="4.5" fill="#5B6CFF" />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="5"
        fill="none"
        stroke="#5B6CFF"
        strokeWidth="1.4"
        opacity="0.85"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="5"
        fill="none"
        stroke="#8B97FF"
        strokeWidth="1.2"
        opacity="0.7"
        transform="rotate(60 16 16)"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="5"
        fill="none"
        stroke="#A8B0FF"
        strokeWidth="1.2"
        opacity="0.55"
        transform="rotate(120 16 16)"
      />
    </svg>
  )
}
