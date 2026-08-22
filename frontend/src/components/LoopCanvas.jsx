import { useEffect, useRef } from "react";

// Both the IR loop and the model-run loop need to show a rapidly
// changing sequence of already-decoded images. The earlier approach
// stacked every frame as its own absolutely-positioned <img> in the DOM
// simultaneously (toggling opacity to "animate"), which meant the
// browser had to keep 20-40 full-size image layers painted and
// composited at once - real, measurable overhead, especially on less
// powerful machines. A single <canvas> that just draws whichever frame
// is current is far cheaper: one DOM node, one paint surface, no matter
// how many frames are in the loop.
export default function LoopCanvas({ images, index, className }) {
  const canvasRef = useRef(null);
  const img = images[index];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }, [img]);

  if (!img) return null;

  return (
    <canvas
      ref={canvasRef}
      width={img.naturalWidth}
      height={img.naturalHeight}
      className={className}
    />
  );
}
