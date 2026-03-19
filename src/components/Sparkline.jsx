import { useRef, useEffect } from "react";

export default function Sparkline({ data, color, width = 72, height = 32 }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 2;
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = width + "px";
    cv.style.height = height + "px";
    ctx.scale(dpr, dpr);

    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((v - mn) / rng) * (height - 4) - 2,
    }));

    // Fill
    ctx.beginPath();
    ctx.moveTo(pts[0].x, height);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, height);
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, 0, 0, height);
    grd.addColorStop(0, color + "33");
    grd.addColorStop(1, color + "00");
    ctx.fillStyle = grd;
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [data, color, width, height]);

  return <canvas ref={ref} className="k-spark" />;
}
